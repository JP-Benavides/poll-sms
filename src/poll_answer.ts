import type { DiscordReply, PollIdentity, PollSuggestion, SubmissionResult } from './types';

export type AnswerState = 'disabled' | 'solving' | 'awaiting_confirmation' |
  'awaiting_manual_answer' | 'submitting' | 'finished';

export interface AnswerDependencies {
  solve: (poll: PollIdentity['poll'], signal: AbortSignal) => Promise<PollSuggestion>;
  propose: (identity: PollIdentity, suggestion: PollSuggestion | null) => Promise<string>;
  notify: (message: string) => Promise<void>;
  submit: (identity: PollIdentity, choice: number, signal: AbortSignal) => Promise<SubmissionResult>;
  onError?: (message: string) => void;
}

interface PendingPoll {
  identity: PollIdentity;
  controller: AbortController;
  proposalId?: string;
  suggestion?: PollSuggestion;
}

export function pollKey(identity: PollIdentity): string {
  return JSON.stringify([identity.instanceId, identity.poll.question, identity.poll.answers]);
}

export function createPollAnswerState(deps: AnswerDependencies) {
  let state: AnswerState = 'disabled';
  let active: PendingPoll | undefined;
  const attempted = new Set<string>();
  const current = (poll: PendingPoll) => active === poll && !poll.controller.signal.aborted;
  const notify = async (message: string) => {
    try { await deps.notify(message); }
    catch { deps.onError?.('Could not deliver Discord status.'); }
  };
  const disable = () => {
    active?.controller.abort();
    active = undefined;
    state = 'disabled';
  };

  return {
    get state() { return state; },
    disable,
    async start(identity: PollIdentity): Promise<void> {
      const key = pollKey(identity);
      if (active && pollKey(active.identity) === key) return;
      disable();
      if (attempted.has(key)) return;
      attempted.add(key);
      const pending: PendingPoll = {
        identity: { instanceId: identity.instanceId, poll: {
          question: identity.poll.question, answers: [...identity.poll.answers],
        } },
        controller: new AbortController(),
      };
      active = pending;
      state = 'solving';
      try {
        const result = await deps.solve(pending.identity.poll, pending.controller.signal);
        if (!current(pending)) return;
        if (Number.isInteger(result.choice) && result.choice >= 1 &&
            result.choice <= pending.identity.poll.answers.length && result.explanation.trim()) {
          pending.suggestion = result;
        }
      } catch {
        if (!current(pending)) return;
        deps.onError?.('Agent suggestion unavailable; requesting a manual answer.');
      }
      if (!current(pending)) return;
      try {
        const id = await deps.propose(pending.identity, pending.suggestion ?? null);
        if (!current(pending)) return;
        if (!id) throw new Error('Missing proposal ID');
        pending.proposalId = id;
        state = pending.suggestion ? 'awaiting_confirmation' : 'awaiting_manual_answer';
      } catch {
        if (current(pending)) disable();
        deps.onError?.('Could not deliver the answer proposal; no submission is enabled.');
      }
    },
    async receive(reply: DiscordReply): Promise<void> {
      const pending = active;
      if (!pending || !current(pending) || !pending.proposalId || reply.replyToId !== pending.proposalId) return;
      const text = reply.content.trim().toLowerCase();
      let choice: number;
      if (state === 'awaiting_confirmation') {
        if (text === 'no') {
          state = 'awaiting_manual_answer';
          await notify(`Poll ${pending.identity.instanceId}: reply to the original proposal with a choice number (1–${pending.identity.poll.answers.length}).`);
          return;
        }
        if (text !== 'yes') {
          await notify('Reply to the proposal with yes to approve, or no to enter your own choice.');
          return;
        }
        choice = pending.suggestion!.choice;
      } else if (state === 'awaiting_manual_answer') {
        if (!/^[1-9]\d*$/.test(text) || Number(text) > pending.identity.poll.answers.length) {
          await notify(`Reply to the original proposal with a whole choice number from 1 to ${pending.identity.poll.answers.length}.`);
          return;
        }
        choice = Number(text);
      } else return;

      // Lock before the first await: concurrent Discord events cannot submit twice.
      state = 'submitting';
      let result: SubmissionResult;
      try {
        result = await deps.submit(pending.identity, choice, pending.controller.signal);
      } catch {
        result = { status: 'uncertain', detail: 'Submission could not be verified. Check the browser; no automatic retry.' };
      }
      if (current(pending)) state = 'finished';
      await notify(`Poll ${pending.identity.instanceId}, choice ${choice}: ${result.status}. ${result.detail}`);
    },
  };
}
