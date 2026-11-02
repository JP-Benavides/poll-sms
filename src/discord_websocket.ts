import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { BotInfo, DiscordReply, PollIdentity, PollSuggestion } from './types.ts';

export interface DiscordConnection {
  (): Promise<void>;
  sendProposal(identity: PollIdentity, suggestion: PollSuggestion | null): Promise<string>;
  sendStatus(content: string): Promise<void>;
}

export async function startDiscord(
  config: BotInfo,
  onMessage: (reply: DiscordReply) => void | Promise<void>,
): Promise<DiscordConnection> {
  if (!config.BOT_TOKEN || !config.USER_ID || !config.CHANNEL_ID) {
    throw new Error('Set BOT_TOKEN, CHANNEL_ID and USER_ID in your .env file.');
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });
  client.once(Events.ClientReady, () => console.log('Discord listener connected'));
  client.on(Events.Error, () => console.error('Discord connection error.'));
  client.on(Events.MessageCreate, async message => {
    if (message.author.id !== config.USER_ID || message.channelId !== config.CHANNEL_ID) return;
    if (message.author.bot || message.webhookId) return;
    try {
      await onMessage({
        id: message.id,
        content: message.content,
        replyToId: message.reference?.messageId ?? null,
      });
    } catch {
      console.error('Discord message callback failed.');
    }
  });

  try {
    await client.login(config.BOT_TOKEN);
  } catch {
    try { await client.destroy(); } catch { /* Preserve the safe login error. */ }
    throw new Error('Discord login failed.');
  }
  const send = async (content: string): Promise<string> => {
    if (!content.trim() || content.length > 2000) {
      throw new Error('Discord message must contain between 1 and 2000 characters.');
    }
    try {
      const channel = await client.channels.fetch(config.CHANNEL_ID);
      if (!channel || !channel.isSendable()) throw new Error('Channel unavailable');
      const message = await channel.send({ content, allowedMentions: { parse: [] } });
      return message.id;
    } catch {
      throw new Error('Could not send Discord message. Check channel access and Send Messages permission.');
    }
  };
  return Object.assign(() => client.destroy(), {
    async sendProposal(identity: PollIdentity, suggestion: PollSuggestion | null): Promise<string> {
      if (!identity.poll.question.trim() || !identity.poll.answers.length) throw new Error('Poll is empty.');
      if (suggestion && (!Number.isInteger(suggestion.choice) || suggestion.choice < 1 || suggestion.choice > identity.poll.answers.length)) {
        throw new Error('Suggested choice is outside the available answers.');
      }
      return send([
        identity.poll.question,
        ...identity.poll.answers.map((answer, index) => `${index + 1}. ${answer}`),
        '',
        ...(suggestion ? [
          `Suggested choice: ${suggestion.choice}`,
          `Explanation: ${suggestion.explanation}`,
          'Reply to this message with yes to approve or no to enter your own choice.',
        ] : ['No suggestion available. Reply to this message with a choice number.']),
      ].join('\n'));
    },
    async sendStatus(content: string): Promise<void> { await send(content); },
  });
}
