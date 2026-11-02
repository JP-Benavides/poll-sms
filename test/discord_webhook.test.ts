import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { send_message, sendProposal, sendStatus } from '../src/discord_webhook';
import type { PollIdentity, UserInfo } from '../src/types';

const user: UserInfo = {
  email: '', firstName: '', lastName: '', password: '', pollEvLink: '', presenterName: '',
  discordURL: 'https://discord.invalid/api/webhooks/id/secret-token?wait=false&thread_id=thread',
};
const identity: PollIdentity = { instanceId: 'poll-1', poll: { question: 'Which @everyone?', answers: ['A', 'B'] } };
const suggestion = { choice: 2, explanation: 'B is the matching choice.' };
const fetchMock = spyOn(globalThis, 'fetch');
beforeEach(() => {
  fetchMock.mockResolvedValue(Response.json({ id: 'proposal-id', channel_id: 'channel' }));
});
afterEach(() => fetchMock.mockReset());
afterAll(() => fetchMock.mockRestore());
function payload(): { content: string; allowed_mentions: { parse: string[] } } {
  return JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
}

test('proposal waits for a message, preserves query parameters and returns its ID', async () => {
  expect(await sendProposal(user, identity, suggestion, 'channel')).toBe('proposal-id');
  const [target, options] = fetchMock.mock.calls[0]!;
  const url = new URL(String(target));
  expect(url.searchParams.getAll('wait')).toEqual(['true']);
  expect(url.searchParams.get('thread_id')).toBe('thread');
  expect(options?.method).toBe('POST');
  expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(payload()).toEqual({
    content: 'Which @everyone?\n1. A\n2. B\n\nSuggested choice: 2\nExplanation: B is the matching choice.\nReply to this message with yes to approve or no to reject.',
    allowed_mentions: { parse: [] },
  });
});

test('fallback retains all numbered choices and asks for a number', async () => {
  await sendProposal(user, identity, null);
  expect(payload().content).toContain('1. A\n2. B');
  expect(payload().content).toContain('Reply to this message with a choice number, or no to reject.');
});

test('channel mismatch fails safely', async () => {
  await expect(sendProposal(user, identity, suggestion, 'other')).rejects.toThrow('unexpected channel');
});

for (const invalid of [null, {}, { id: 'id' }, { id: '', channel_id: 'channel' }, { id: 42, channel_id: 'channel' }, { id: 'id', channel_id: '' }]) {
  test(`rejects malformed message response ${JSON.stringify(invalid)}`, async () => {
    fetchMock.mockResolvedValue(Response.json(invalid));
    await expect(sendProposal(user, identity, null)).rejects.toThrow('invalid message response');
  });
}

test('rejects invalid JSON without exposing response contents', async () => {
  fetchMock.mockResolvedValue(new Response('secret-token'));
  await expect(sendProposal(user, identity, null)).rejects.toThrow('Discord webhook returned an invalid message response.');
});

for (const choice of [0, 3, 1.5, NaN]) {
  test(`rejects invalid suggested choice ${choice} before posting`, async () => {
    await expect(sendProposal(user, identity, { ...suggestion, choice })).rejects.toThrow('outside the available choices');
    expect(fetchMock).not.toHaveBeenCalled();
  });
}

test('oversized proposals fail before posting without silently truncating choices', async () => {
  await expect(sendProposal(user, { ...identity, poll: { question: 'Q', answers: ['a'.repeat(2000), 'last choice'] } }, null)).rejects.toThrow('2000');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('empty polls fail before posting', async () => {
  await expect(sendProposal(user, { ...identity, poll: { question: 'Q', answers: [] } }, null)).rejects.toThrow('question and choices');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('status accepts 2000 characters with mentions disabled and no response body', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await sendStatus(user, 'x'.repeat(2000));
  expect(payload()).toEqual({ content: 'x'.repeat(2000), allowed_mentions: { parse: [] } });
  expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get('wait')).toBe('false');
});

for (const content of ['', '  ', 'x'.repeat(2001)]) {
  test(`invalid status length ${content.length} never posts`, async () => {
    await expect(sendStatus(user, content)).rejects.toThrow('between 1 and 2000');
    expect(fetchMock).not.toHaveBeenCalled();
  });
}

test('send_message preserves question and numbered answers and returns void', async () => {
  expect(await send_message(user, identity.poll)).toBeUndefined();
  expect(payload()).toEqual({ content: 'Which @everyone?\n1. A\n2. B', allowed_mentions: { parse: [] } });
});

test('HTTP errors omit response body and webhook credentials', async () => {
  fetchMock.mockResolvedValue(new Response(user.discordURL, { status: 429 }));
  await expect(sendProposal(user, identity, null)).rejects.toThrow('Discord webhook failed (HTTP 429).');
});

test('network errors omit webhook credentials', async () => {
  fetchMock.mockRejectedValue(new Error(user.discordURL));
  await expect(sendStatus(user, 'status')).rejects.toThrow('Discord webhook request failed.');
});

test('invalid URL errors omit webhook credentials', async () => {
  await expect(sendStatus({ ...user, discordURL: 'secret-token' }, 'status')).rejects.toThrow('Invalid Discord webhook URL.');
  expect(fetchMock).not.toHaveBeenCalled();
});
