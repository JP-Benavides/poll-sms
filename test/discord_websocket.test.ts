import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import { Client, Events, type ClientEvents } from 'discord.js';
import { startDiscord } from '../src/discord_websocket';
import { createPollAnswerState } from '../src/poll_answer';

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

test('only the first eligible message consumes an enabled poll', async () => {
  let client!: Client;
  login.mockImplementation(async function (this: Client) { client = this; return 'test-token'; });
  destroy.mockResolvedValue(undefined);
  const state = createPollAnswerState();
  const received: string[] = [];
  const stop = await startDiscord(config, content => {
    const answer = state.receive(content);
    if (answer) received.push(`${answer.instanceId}:${answer.answer}`);
  });
  const emit = (content: string, user = 'user', channel = 'channel') => client.emit(
    Events.MessageCreate,
    { content, channelId: channel, author: { id: user, bot: false }, webhookId: null } as ClientEvents[Events.MessageCreate][0],
  );
  emit('ignored before poll');
  expect(state.state).toBe('disabled');
  state.enable({ question: 'First?', answers: ['A', 'B'] }, '1');
  emit('wrong user', 'other');
  emit('wrong channel', 'user', 'other');
  emit('   ');
  expect(state.state).toBe('enabled');
  emit(' 2 ');
  emit('duplicate');
  expect(state.state).toBe('disabled');
  expect(state.lastAnswer?.poll.question).toBe('First?');
  state.enable({ question: 'Second?', answers: ['C'] }, '2');
  state.enable({ question: 'Third?', answers: ['D'] }, '3');
  emit('1');
  expect(received).toEqual(['1:2', '3:1']);
  state.enable({ question: 'Closed?', answers: ['E'] }, '4');
  state.disable();
  emit('too late');
  expect(received).toHaveLength(2);
  await stop();
});
