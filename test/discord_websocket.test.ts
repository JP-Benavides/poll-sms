import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import { Client, Events, type ClientEvents } from 'discord.js';
import { startDiscord } from '../src/discord_websocket';

const config = { BOT_TOKEN: 'test-token', CHANNEL_ID: 'channel', USER_ID: 'user' };
const login = spyOn(Client.prototype, 'login');
const destroy = spyOn(Client.prototype, 'destroy');
afterEach(() => { login.mockReset(); destroy.mockReset(); });
afterAll(() => { login.mockRestore(); destroy.mockRestore(); });

test('logs only the configured human user in the configured channel and disconnects', async () => {
  let client!: Client;
  login.mockImplementation(async function (this: Client) { client = this; return 'test-token'; });
  destroy.mockResolvedValue(undefined);
  const received: string[] = [];
  const stop = await startDiscord(config, content => { received.push(content); });
  const message = { content: '2', channelId: 'channel', author: { id: 'user', bot: false }, webhookId: null };
  const emit = (value: typeof message | (Omit<typeof message, 'webhookId'> & { webhookId: string })) =>
    client.emit(Events.MessageCreate, value as unknown as ClientEvents[Events.MessageCreate][0]);
  emit(message);
  emit({ ...message, channelId: 'other' });
  emit({ ...message, author: { id: 'other', bot: false } });
  emit({ ...message, author: { id: 'user', bot: true } });
  emit({ ...message, webhookId: 'webhook' });
  expect(received).toEqual(['2']);
  expect(login).toHaveBeenCalledWith('test-token');
  await stop();
  expect(destroy).toHaveBeenCalledTimes(1);
});

test('failed login disposes the client', async () => {
  login.mockRejectedValue(new Error('Login failed'));
  destroy.mockResolvedValue(undefined);
  await expect(startDiscord(config, () => {})).rejects.toThrow('Login failed');
  expect(destroy).toHaveBeenCalledTimes(1);
});

test('missing configuration fails before connecting', async () => {
  await expect(startDiscord({ ...config, USER_ID: '' }, () => {})).rejects.toThrow('Set BOT_TOKEN');
  expect(login).not.toHaveBeenCalled();
});
