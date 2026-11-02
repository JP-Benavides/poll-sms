import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { BotInfo, DiscordReply } from './types.ts';

export async function startDiscord(
  config: BotInfo,
  onMessage: (reply: DiscordReply) => void | Promise<void>,
): Promise<() => Promise<void>> {
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
  return () => client.destroy();
}
