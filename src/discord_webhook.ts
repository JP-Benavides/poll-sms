import type { UserInfo, ParsedPoll, PollIdentity, PollSuggestion } from './types.ts';

function validateContent(content: string): void {
  if (!content.trim() || content.length > 2000) {
    throw new Error('Discord message must contain between 1 and 2000 characters.');
  }
}

async function post(userConfig: UserInfo, content: string, wait: boolean): Promise<Response> {
  validateContent(content);
  let url: URL;
  try {
    url = new URL(userConfig.discordURL);
    url.searchParams.set('wait', String(wait));
  } catch {
    throw new Error('Invalid Discord webhook URL.');
  }
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
  } catch {
    throw new Error('Discord webhook request failed.');
  }
  if (!response.ok) {
    throw new Error(`Discord webhook failed (HTTP ${response.status}).`);
  }
  return response;
}

function formatPoll(poll: ParsedPoll): string {
  return [poll.question, ...poll.answers.map((answer, index) => `${index + 1}. ${answer}`)].join('\n');
}

// The coordinator can supply CHANNEL_ID without changing the shared UserInfo type.
export async function sendProposal(
  userConfig: UserInfo,
  identity: PollIdentity,
  suggestion: PollSuggestion | null,
  expectedChannelId?: string,
): Promise<string> {
  if (!identity.poll.question.trim() || identity.poll.answers.length === 0) {
    throw new Error('Discord proposal requires a question and choices.');
  }
  if (suggestion && (!Number.isInteger(suggestion.choice) || suggestion.choice < 1 || suggestion.choice > identity.poll.answers.length)) {
    throw new Error('Discord proposal suggestion is outside the available choices.');
  }
  const content = [
    formatPoll(identity.poll),
    '',
    ...(suggestion ? [
      `Suggested choice: ${suggestion.choice}`,
      `Explanation: ${suggestion.explanation}`,
      'Reply to this message with yes to approve or no to reject.',
    ] : [
      'No suggestion available. Reply to this message with a choice number, or no to reject.',
    ]),
  ].join('\n');
  const response = await post(userConfig, content, true);
  let message: unknown;
  try {
    message = await response.json();
  } catch {
    throw new Error('Discord webhook returned an invalid message response.');
  }
  if (!message || typeof message !== 'object' || !('id' in message) ||
      typeof message.id !== 'string' || !message.id.trim() || !('channel_id' in message) ||
      typeof message.channel_id !== 'string' || !message.channel_id.trim()) {
    throw new Error('Discord webhook returned an invalid message response.');
  }
  if (expectedChannelId !== undefined && message.channel_id !== expectedChannelId) {
    throw new Error('Discord webhook returned a message in an unexpected channel.');
  }
  return message.id;
}

export async function sendStatus(userConfig: UserInfo, content: string): Promise<void> {
  await post(userConfig, content, false);
}

export async function send_message(userConfig: UserInfo, poll: ParsedPoll): Promise<void> {
  await sendStatus(userConfig, formatPoll(poll));
}
