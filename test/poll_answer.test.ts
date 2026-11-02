import { expect, test } from 'bun:test';
import { createPollAnswerState, type AnswerDependencies } from '../src/poll_answer';
import type { DiscordReply, PollIdentity } from '../src/types';

const poll: PollIdentity = { instanceId: 'poll-1', poll: { question: 'Question?', answers: ['A', 'B'] } };
const reply = (content: string, replyToId: string | null = 'proposal'): DiscordReply => ({ id: crypto.randomUUID(), content, replyToId });
function setup(overrides: Partial<AnswerDependencies> = {}) {
  const choices: number[] = [];
  const messages: string[] = [];
  const state = createPollAnswerState({
    solve: async () => ({ choice: 2, explanation: 'Because B.' }),
    propose: async () => 'proposal',
    notify: async text => { messages.push(text); },
    submit: async (_, choice) => { choices.push(choice); return { status: 'confirmed', detail: 'Recorded.' }; },
    ...overrides,
  });
  return { state, choices, messages };
}

test('requires proposal reply and approval, then consumes once', async () => {
  const { state, choices } = setup();
  expect(state.state).toBe('disabled');
  await state.receive(reply('yes'));
  await state.start(poll);
  expect(state.state).toBe('awaiting_confirmation');
  await state.receive(reply('yes', null));
  await state.receive(reply('yes', 'old'));
  await state.receive(reply('2'));
  expect(choices).toEqual([]);
  await Promise.all([state.receive(reply(' YES ')), state.receive(reply('yes'))]);
  expect(choices).toEqual([2]);
  expect(state.state).toBe('finished');
  await state.start(poll);
  expect(state.state).toBe('finished');
});

test('no allows only a valid manual choice', async () => {
  const { state, choices } = setup();
  await state.start(poll);
  await state.receive(reply('NO'));
  expect(state.state).toBe('awaiting_manual_answer');
  for (const invalid of ['yes', '0', '3', '1.0', '-1', '', '1 extra']) await state.receive(reply(invalid));
  expect(choices).toEqual([]);
  await state.receive(reply(' 1 '));
  expect(choices).toEqual([1]);
});

test('solver errors and invalid choices fall back to manual', async () => {
  for (const solve of [async () => { throw new Error('Timeout'); }, async () => ({ choice: 99, explanation: 'Invalid' })]) {
    const { state, choices } = setup({ solve });
    await state.start(poll);
    expect(state.state).toBe('awaiting_manual_answer');
    await state.receive(reply('2'));
    expect(choices).toEqual([2]);
  }
});

test('closing or replacing poll aborts old work and discards its suggestion', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const signals: AbortSignal[] = [];
  const proposals: string[] = [];
  const { state } = setup({
    solve: async (_, signal) => { signals.push(signal); if (signals.length === 1) await gate; return { choice: 1, explanation: 'A' }; },
    propose: async identity => { proposals.push(identity.instanceId); return identity.instanceId; },
  });
  const first = state.start(poll);
  await state.start({ ...poll, instanceId: 'poll-2' });
  expect(signals[0]?.aborted).toBe(true);
  release();
  await first;
  expect(proposals).toEqual(['poll-2']);
  state.disable();
  expect(signals[1]?.aborted).toBe(true);
  expect(state.state).toBe('disabled');
});

test('failed delivery disables approval and late delivery cannot rearm closed poll', async () => {
  const failed = setup({ propose: async () => { throw new Error('Network'); } });
  await failed.state.start(poll);
  expect(failed.state.state).toBe('disabled');
  let release!: (id: string) => void;
  const delivered = new Promise<string>(resolve => { release = resolve; });
  const { state } = setup({ propose: () => delivered });
  const started = state.start(poll);
  await Bun.sleep(0);
  state.disable();
  release('proposal');
  await started;
  await state.receive(reply('yes'));
  expect(state.state).toBe('disabled');
});

test('submission failure is terminal and not automatically retried', async () => {
  let attempts = 0;
  const { state, messages } = setup({ submit: async () => { attempts++; throw new Error('Unknown outcome'); } });
  await state.start(poll);
  await state.receive(reply('yes'));
  await state.receive(reply('yes'));
  expect(attempts).toBe(1);
  expect(state.state).toBe('finished');
  expect(messages.at(-1)).toContain('uncertain');
});
