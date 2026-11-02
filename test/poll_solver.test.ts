import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createPollSolver, type SolverSpawnOptions } from '../src/poll_solver';

const poll = { question: 'Which is even? $(do not execute)', answers: ['3', '4'] };
const good = JSON.stringify({ choice: 2, explanation: '  Four is divisible by two.  ' });
function fixture(raw: string | null = good, exitCode = 0) {
  const calls: SolverSpawnOptions[] = [];
  const solve = createPollSolver({ spawn(options) {
    calls.push(options);
    const output = options.cmd[options.cmd.indexOf('--output-last-message') + 1]!;
    return {
      exited: (async () => {
        if (raw !== null) await writeFile(output, raw);
        return exitCode;
      })(),
      kill() { throw new Error('Completed subprocess must not be killed.'); },
    };
  } });
  return { solve, calls };
}

test('isolated argv invocation, schema, stdin-only poll, clean environment and cleanup', async () => {
  let captured!: SolverSpawnOptions;
  let schema: any;
  let files: string[] = [];
  const solve = createPollSolver({ spawn(options) {
    captured = options;
    return { exited: (async () => {
      files = await readdir(options.cwd);
      schema = JSON.parse(await readFile(options.cmd[options.cmd.indexOf('--output-schema') + 1]!, 'utf8'));
      await writeFile(options.cmd[options.cmd.indexOf('--output-last-message') + 1]!, good);
      return 0;
    })(), kill() {} };
  } });
  expect(await solve(poll)).toEqual({ choice: 2, explanation: 'Four is divisible by two.' });
  expect(captured.cwd).not.toBe(process.cwd());
  expect(captured.cmd).toContain('--ephemeral');
  expect(captured.cmd).toContain('--ignore-user-config');
  expect(captured.cmd).toContain('--skip-git-repo-check');
  expect(captured.cmd).toContain('read-only');
  expect(captured.cmd).toContain('approval_policy="never"');
  expect(captured.cmd).toContain('features.shell_tool=false');
  expect(captured.cmd).toContain('project_doc_max_bytes=0');
  expect(captured.cmd).not.toContain('--model');
  expect(captured.cmd.join(' ')).not.toContain(poll.question);
  expect(captured.cmd.at(-1)).toBe('-');
  expect(JSON.parse(new TextDecoder().decode(captured.stdin))).toEqual({
    question: poll.question, choices: [{ choice: 1, text: '3' }, { choice: 2, text: '4' }],
  });
  expect(Object.keys(captured.env).sort()).toEqual(
    ['HOME', 'PATH', 'TMPDIR', ...(captured.env.CODEX_HOME ? ['CODEX_HOME'] : [])].sort(),
  );
  expect(captured.stdout).toBe('ignore');
  expect(captured.stderr).toBe('ignore');
  expect(files).toEqual(['schema.json']);
  expect(schema.additionalProperties).toBe(false);
  expect(schema.properties.choice).toMatchObject({ type: 'integer', minimum: 1, maximum: 2 });
  expect(existsSync(captured.cwd)).toBe(false);
});

for (const raw of ['', 'not JSON', '```json\n{}\n```', 'null', '[]', '{}',
  ...[0, 3, -1, 1.5, '2', null].map(choice => JSON.stringify({ choice, explanation: 'Reason' })),
  ...['', '  ', 'x'.repeat(501), 12, null].map(explanation => JSON.stringify({ choice: 2, explanation })),
  JSON.stringify({ choice: 2, explanation: 'Reason', extra: true }),
]) {
  test(`rejects malformed response ${raw.slice(0, 65)}`, async () => {
    const { solve, calls } = fixture(raw);
    await expect(solve(poll)).rejects.toThrow('Invalid Codex');
    expect(existsSync(calls[0]!.cwd)).toBe(false);
  });
}

test('rejects missing output, excessive output, and subprocess failure without leaking output', async () => {
  for (const [raw, code] of [[null, 0], ['x'.repeat(20_000), 0], ['private diagnostic', 1]] as const) {
    const { solve, calls } = fixture(raw, code);
    let message = '';
    try { await solve(poll); } catch (error) { message = (error as Error).message; }
    expect(message).not.toBe('');
    expect(message).not.toContain('private diagnostic');
    expect(existsSync(calls[0]!.cwd)).toBe(false);
  }
});

test('spawn failure is sanitized and temporary files are cleaned', async () => {
  let cwd = '';
  const solve = createPollSolver({ spawn(options) { cwd = options.cwd; throw new Error('private path'); } });
  await expect(solve(poll)).rejects.toThrow('Poll solver failed; use manual fallback.');
  expect(existsSync(cwd)).toBe(false);
});

for (const reason of ['abort', 'timeout', 'abort during spawn'] as const) {
  test(`${reason} kills, reaps and cleans subprocess`, async () => {
    const controller = new AbortController();
    let cwd = '';
    let kills = 0;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const solve = createPollSolver({ timeoutMs: reason === 'timeout' ? 25 : 1000, spawn(options) {
      cwd = options.cwd;
      let finish!: (code: number) => void;
      const exited = new Promise<number>(resolve => { finish = resolve; });
      started();
      if (reason === 'abort during spawn') controller.abort();
      return { exited, kill(signal) { expect(signal).toBe('SIGKILL'); kills++; finish(137); } };
    } });
    const running = solve(poll, controller.signal);
    void running.catch(() => {});
    await ready;
    if (reason === 'abort') controller.abort();
    await expect(running).rejects.toThrow(reason === 'timeout' ? 'timed out' : 'aborted');
    expect(kills).toBeGreaterThan(0);
    expect(existsSync(cwd)).toBe(false);
  });
}

test('already aborted and invalid polls never spawn', async () => {
  let calls = 0;
  const solve = createPollSolver({ spawn() { calls++; throw new Error('Unexpected spawn'); } });
  await expect(solve(poll, AbortSignal.abort())).rejects.toThrow('aborted');
  for (const invalid of [{ question: '', answers: ['a'] }, { question: 'q', answers: [] },
    { question: 'q', answers: [' '] }]) {
    await expect(solve(invalid)).rejects.toThrow('empty or malformed');
  }
  expect(calls).toBe(0);
});

test('concurrent calls have separate directories and snapshot mutable polls', async () => {
  const { solve, calls } = fixture();
  const mutable = { question: poll.question, answers: [...poll.answers] };
  const first = solve(mutable);
  mutable.answers.length = 0;
  await Promise.all([first, solve(poll)]);
  expect(calls[0]!.cwd).not.toBe(calls[1]!.cwd);
  for (const call of calls) expect(existsSync(call.cwd)).toBe(false);
});
