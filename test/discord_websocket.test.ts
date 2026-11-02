import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import { Client, Events, type ClientEvents } from 'discord.js';
import { startDiscord } from '../src/discord_websocket';
import type { DiscordReply } from '../src/types';

const config = { BOT_TOKEN: 'test-token', CHANNEL_ID: 'channel', USER_ID: 'user' };
const login = spyOn(Client.prototype, 'login');
const destroy = spyOn(Client.prototype, 'destroy');
const errorLog = spyOn(console, 'error');
let client: Client;
const message = { id: 'reply', content: 'yes', channelId: 'channel', author: { id: 'user', bot: false }, webhookId: null, reference: { messageId: 'proposal' } };
function emit(value: unknown = message) {
  client.emit(Events.MessageCreate, value as ClientEvents[Events.MessageCreate][0]);
}
async function connect(callback: (reply: DiscordReply) => void | Promise<void>) {
  login.mockImplementation(async function (this: Client) { client = this; return 'test-token'; });
  destroy.mockResolvedValue(undefined);
  errorLog.mockImplementation(() => {});
  return startDiscord(config, callback);
}
afterEach(() => { login.mockReset(); destroy.mockReset(); errorLog.mockReset(); });
afterAll(() => { login.mockRestore(); destroy.mockRestore(); errorLog.mockRestore(); });

test('passes reply identity and reference only for the configured human and channel', async () => {
  const received: DiscordReply[] = [];
  const stop = await connect(reply => { received.push(reply); });
  emit();
  emit({ ...message, channelId: 'other' });
  emit({ ...message, author: { id: 'other', bot: false } });
  emit({ ...message, author: { id: 'user', bot: true } });
  emit({ ...message, webhookId: 'webhook' });
  emit({ ...message, id: 'unthreaded', reference: undefined, content: ' 2 ' });
  emit({ ...message, id: 'empty-reference', reference: {} });
  expect(received).toEqual([
    { id: 'reply', content: 'yes', replyToId: 'proposal' },
    { id: 'unthreaded', content: ' 2 ', replyToId: null },
    { id: 'empty-reference', content: 'yes', replyToId: null },
  ]);
  expect(login).toHaveBeenCalledWith('test-token');
  await stop();
  expect(destroy).toHaveBeenCalledTimes(1);
});

for (const asynchronous of [false, true]) {
  test(`catches ${asynchronous ? 'async' : 'sync'} callback failures and continues listening`, async () => {
    let calls = 0;
    const fail = () => { calls++; throw new Error('secret callback details'); };
    const stop = await connect(asynchronous ? async () => { fail(); } : fail);
    emit();
    await new Promise(resolve => setTimeout(resolve, 0));
    emit();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls).toBe(2);
    expect(errorLog.mock.calls).toEqual([
      ['Discord message callback failed.'], ['Discord message callback failed.'],
    ]);
    await stop();
  });
}

test('connection errors are logged without raw details', async () => {
  const stop = await connect(() => {});
  client.emit(Events.Error, new Error('secret token'));
  expect(errorLog.mock.calls).toEqual([['Discord connection error.']]);
  await stop();
});

test('failed login disposes the client and hides credential-bearing errors', async () => {
  login.mockRejectedValue(new Error('secret token'));
  destroy.mockResolvedValue(undefined);
  await expect(startDiscord(config, () => {})).rejects.toThrow('Discord login failed.');
  expect(destroy).toHaveBeenCalledTimes(1);
});

test('cleanup failure cannot expose credentials after login failure', async () => {
  login.mockRejectedValue(new Error('secret token'));
  destroy.mockRejectedValue(new Error('secret cleanup details'));
  await expect(startDiscord(config, () => {})).rejects.toThrow('Discord login failed.');
});

for (const field of ['USER_ID', 'CHANNEL_ID', 'BOT_TOKEN']) {
  test(`missing ${field} fails before connecting`, async () => {
    await expect(startDiscord({ ...config, [field]: '' }, () => {})).rejects.toThrow('Set BOT_TOKEN');
    expect(login).not.toHaveBeenCalled();
  });
}

test('bot sends proposals and status to configured channel with mentions disabled', async () => {
  const connection = await connect(() => {});
  const sent: unknown[] = [];
  const fetchChannel = spyOn(client.channels, 'fetch').mockResolvedValue({
    isSendable: () => true,
    send: async (payload: unknown) => { sent.push(payload); return { id: 'bot-proposal' }; },
  } as never);
  try {
    const id = await connection.sendProposal({ instanceId: 'poll', poll: { question: 'Q?', answers: ['A', 'B'] } }, { choice: 2, explanation: 'B fits.' });
    expect(id).toBe('bot-proposal');
    expect(fetchChannel).toHaveBeenCalledWith('channel');
    expect(sent[0]).toEqual({ content: 'Q?\n1. A\n2. B\n\nSuggested choice: 2\nExplanation: B fits.\nReply to this message with yes to approve or no to enter your own choice.', allowedMentions: { parse: [] } });
    await connection.sendStatus('Confirmed.');
    expect(sent[1]).toEqual({ content: 'Confirmed.', allowedMentions: { parse: [] } });
    await expect(connection.sendStatus('x'.repeat(2001))).rejects.toThrow('2000');
    expect(sent).toHaveLength(2);
    fetchChannel.mockRejectedValue(new Error('private details'));
    await expect(connection.sendStatus('Hello')).rejects.toThrow('Send Messages permission');
  } finally { fetchChannel.mockRestore(); await connection(); }
});
