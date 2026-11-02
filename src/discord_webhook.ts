import type { UserInfo, ParsedPoll } from './types.ts';


export async function send_message(userConfig: UserInfo, poll: ParsedPoll): Promise<void> {
  const content = [poll.question, ...poll.answers.map((answer, index) => `${index + 1}. ${answer}`)].join('\n');
  if (!content.trim() || content.length > 2000) {
    throw new Error('Discord message must contain between 1 and 2000 characters.');
  }
  const response = await fetch(userConfig.discordURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook failed (HTTP ${response.status}): ${await response.text()}`);
  }
}

