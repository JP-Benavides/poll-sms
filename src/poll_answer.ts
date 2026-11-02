import type { ParsedPoll } from './types';

export interface PollAnswer {
  instanceId: string;
  poll: ParsedPoll;
  answer: string;
}

// Consume synchronously so two messages cannot answer the same poll.
export function createPollAnswerState(alwaysEnabled = false) {
  const testPoll = { instanceId: 'test', poll: { question: 'Test capture (no active poll)', answers: [] } };
  let pending: Omit<PollAnswer, 'answer'> | undefined;
  let lastAnswer: PollAnswer | undefined;
  return {
    get state(): 'disabled' | 'enabled' { return alwaysEnabled || pending ? 'enabled' : 'disabled'; },
    get lastAnswer() { return lastAnswer; },
    enable(poll: ParsedPoll, instanceId: string) {
      pending = { instanceId, poll: { question: poll.question, answers: [...poll.answers] } };
    },
    disable() { pending = undefined; },
    receive(content: string): PollAnswer | undefined {
      const current = pending ?? (alwaysEnabled ? testPoll : undefined);
      if (!current || !content.trim()) return;
      lastAnswer = { ...current, answer: content.trim() };
      if (!alwaysEnabled) pending = undefined;
      return lastAnswer;
    },
  };
}
