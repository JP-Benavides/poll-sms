import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { BotInfo } from './types.ts';

export async function startDiscord(
  config: BotInfo,
): Promise<() => Promise<void>> {
  if (!config.BOT_TOKEN || !config.USER_ID) {
    throw new Error('Set BOT_TOKEN and USER_ID in your .env file.');
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });
  client.once(Events.ClientReady, () => console.log('Discord listener connected'));
  client.on(Events.Error, error => console.error('Discord connection error:', error));
  client.on(Events.MessageCreate, message => {
    if (message.author.id !== config.USER_ID) return;
    console.log(`[Discord] #${'name' in message.channel ? message.channel.name : message.channelId} ${message.author.tag}: ${message.content}`);
  });

  try {
    await client.login(config.BOT_TOKEN);
  } catch (error) {
    await client.destroy();
    throw error;
  }
  return () => client.destroy();
}
