import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { ParsedPoll, PollSuggestion } from './types';

export interface SolverProcess {
  exited: Promise<number>;
  kill(signal: 'SIGKILL'): void;
}

export interface SolverSpawnOptions {
  cmd: string[];
  cwd: string;
  env: Record<string, string>;
  stdin: Uint8Array;
  stdout: 'ignore';
  stderr: 'ignore';
}

export interface PollSolverOptions {
  spawn?: (options: SolverSpawnOptions) => SolverProcess;
  /** Test seam; production always uses the default 60-second deadline. */
  timeoutMs?: number;
}

const MAX_EXPLANATION = 500;
const MAX_OUTPUT_BYTES = 16_384;
const spawnCodex = (options: SolverSpawnOptions): SolverProcess => {
  const executable = Bun.which('codex');
  if (!executable) throw new Error('Codex CLI is unavailable.');
  return Bun.spawn({ ...options, cmd: [executable, ...options.cmd.slice(1)] });
};

function parseSuggestion(raw: string, count: number): PollSuggestion {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid Codex suggestion JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Codex suggestion.');
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== 2 || !Number.isInteger(result.choice) ||
      typeof result.choice !== 'number' || result.choice < 1 || result.choice > count ||
      typeof result.explanation !== 'string' || !result.explanation.trim() ||
      result.explanation.length > MAX_EXPLANATION) {
    throw new Error('Invalid Codex suggestion fields.');
  }
  return { choice: result.choice, explanation: result.explanation.trim() };
}

/** Creates an isolated solver; injection never changes the module's default solver. */
export function createPollSolver({ spawn = spawnCodex, timeoutMs = 60_000 }: PollSolverOptions = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid solver timeout.');
  return async (poll: ParsedPoll, signal?: AbortSignal): Promise<PollSuggestion> => {
    if (signal?.aborted) throw new DOMException('Poll solver aborted.', 'AbortError');
    if (!poll || typeof poll.question !== 'string' || !poll.question.trim() ||
        !Array.isArray(poll.answers) || !poll.answers.length ||
        poll.answers.some(answer => typeof answer !== 'string' || !answer.trim())) {
      throw new Error('Cannot solve an empty or malformed poll.');
    }
    // Snapshot before any await: callers may replace or mutate their pending poll.
    const count = poll.answers.length;
    const stdin = new TextEncoder().encode(JSON.stringify({
      question: poll.question,
      choices: poll.answers.map((text, index) => ({ choice: index + 1, text })),
    }));
    let workDir: string | undefined;
    let child: SolverProcess | undefined;
    let exited = false;
    let stopped: Error | undefined;
    let rejectStop!: (reason: Error) => void;
    const cancellation = new Promise<never>((_, reject) => { rejectStop = reject; });
    // Attach a handler immediately, including cancellation during filesystem setup.
    void cancellation.catch(() => {});
    const stop = (error: Error) => {
      if (stopped) return;
      stopped = error;
      if (child && !exited) {
        try { child.kill('SIGKILL'); } catch { /* Already exited. */ }
      }
      rejectStop(error);
    };
    const onAbort = () => stop(new DOMException('Poll solver aborted.', 'AbortError'));
    const timer = setTimeout(() => stop(new Error('Poll solver timed out.')), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    const checkStopped = () => { if (stopped) throw stopped; };
    try {
      if (signal?.aborted) onAbort();
      checkStopped();
      workDir = await mkdtemp(join(tmpdir(), 'poll-solver-'));
      const schemaPath = join(workDir, 'schema.json');
      const outputPath = join(workDir, 'suggestion.json');
      await writeFile(schemaPath, JSON.stringify({
        type: 'object', additionalProperties: false, required: ['choice', 'explanation'],
        description: 'Answer the supplied multiple-choice question using only the supplied question and choices.',
        properties: {
          choice: { type: 'integer', minimum: 1, maximum: count, description: 'The best answer, numbered from 1.' },
          explanation: { type: 'string', minLength: 1, maxLength: MAX_EXPLANATION, description: 'A brief explanation of the answer.' },
        },
      }), { mode: 0o600 });
      checkStopped();
      // Deliberately no process.env spread: no app credentials, API keys, proxy,
      // shell initialization, injected node options, or repository context.
      const env: Record<string, string> = {
        HOME: homedir(), PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
        TMPDIR: workDir,
      };
      // Only the auth directory location is inherited; no auth files are read here.
      if (process.env.CODEX_HOME && isAbsolute(process.env.CODEX_HOME)) {
        env.CODEX_HOME = process.env.CODEX_HOME;
      }
      child = spawn({
        cmd: ['codex', 'exec', '--ephemeral', '--sandbox', 'read-only',
          '--ignore-user-config', '--skip-git-repo-check',
          '--config', 'approval_policy="never"',
          '--config', 'project_doc_max_bytes=0',
          '--config', 'features.shell_tool=false',
          '--config', 'features.shell_snapshot=false',
          '--config', 'features.view_image=false',
          '--config', 'web_search="disabled"',
          '--output-schema', schemaPath, '--output-last-message', outputPath, '-'],
        cwd: workDir, env, stdin, stdout: 'ignore', stderr: 'ignore',
      });
      const completion = child.exited.then(code => { exited = true; return code; });
      // Handle even an injected spawn that synchronously triggers cancellation.
      if (stopped) { try { child.kill('SIGKILL'); } catch { /* Already exited. */ } }
      const code = await Promise.race([completion, cancellation]);
      checkStopped();
      if (code !== 0) throw new Error('Codex solver subprocess failed.');
      const output = Bun.file(outputPath);
      if (output.size > MAX_OUTPUT_BYTES) throw new Error('Codex suggestion is too large.');
      const raw = await readFile(outputPath, 'utf8');
      checkStopped();
      return parseSuggestion(raw, count);
    } catch (error) {
      // Never include subprocess output or OS errors (which may contain context).
      if (stopped) throw stopped;
      if (error instanceof Error && /^(Invalid Codex|Codex suggestion|Codex solver)/.test(error.message)) throw error;
      throw new Error('Poll solver failed; use manual fallback.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (child && !exited) {
        try { child.kill('SIGKILL'); } catch { /* Already exited. */ }
        // Reap before removing the files so the subprocess cannot recreate them.
        await child.exited.catch(() => {});
      }
      if (workDir) await rm(workDir, { recursive: true, force: true });
    }
  };
}

export const solvePoll: (poll: ParsedPoll, signal?: AbortSignal) => Promise<PollSuggestion> = createPollSolver();
