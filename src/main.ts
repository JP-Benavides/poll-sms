import type { UserInfo, ParsedPoll } from './types';
import { scrapePage } from './parser';
import { chromium, type Page } from 'playwright';
import dotenv from 'dotenv';
import { navigateLogin } from './login.ts';
import { startDetection } from './detect.ts';
import { send_message } from './discord_webhook.ts';
import { startDiscord } from './discord_websocket.ts';

dotenv.config({
  path: new URL('../.env', import.meta.url).pathname,
  quiet: true,
});

const userConfig: UserInfo = {
  email: process.env.USERNAME ?? '',
  firstName: process.env.FIRST_NAME ?? '',
  lastName: process.env.LAST_NAME ?? '',
  password: process.env.PASSWORD ?? '',
  pollEvLink: process.env.POLL_EV_LINK ?? '',
  presenterName: process.env.POLL_EV_LINK ? new URL(process.env.POLL_EV_LINK).pathname.split('/').filter(Boolean)[0] ?? '' : '',
  discordURL: process.env.DISCORD_URL ?? '',
};

export type PollParser = (page: Page) => Promise<ParsedPoll>;
export type PollDelivery = (poll: ParsedPoll, instanceId: string) => void | Promise<void>;

export interface PollHandler {
  (): Promise<void>;
  stop(): void;
}

export function createPollHandler(
  page: Page,
  onPoll: PollDelivery,
  parsePoll: PollParser = scrapePage,
): PollHandler {
  const attempted = new Set<string>();
  const poll = page.locator('#active_tab_content [id^="legacy_multiple_choice_poll_instance_"]:visible');
  const heading = poll.locator('.component-response-header__title');
  let pending = false;
  let running = false;
  let stopped = false;

  const handler = async () => {
    if (stopped) return;
    pending = true;
    if (running) return;
    running = true;
    try {
      while (pending && !stopped) {
        pending = false;
        if (!(await heading.isVisible())) continue;
        const instanceId = await poll.getAttribute('id');
        if (stopped || !instanceId) continue;

        let parsed: ParsedPoll;
        try {
          parsed = await parsePoll(page);
        } catch (error) {
          console.error('Could not read the poll:', error);
          continue;
        }
        if (stopped) return;

        if (!(await heading.isVisible()) || await poll.getAttribute('id') !== instanceId || stopped) continue;
        const key = JSON.stringify([instanceId, parsed.question, parsed.answers]);
        if (attempted.has(key)) continue;

        // Mark before delivery so webhook failures are not automatically retried.
        attempted.add(key);
        try {
          await onPoll(parsed, instanceId);
        } catch (error) {
          console.error('Cannot send message to Discord:', error);
        }
      }
    } finally {
      running = false;
    }
  };
  handler.stop = () => { stopped = true; pending = false; };
  return handler;
}

export async function main() {
  if (!userConfig.email) throw new Error('Set USERNAME in your env or .env file.');
  if (!userConfig.firstName || !userConfig.lastName) throw new Error('Set FIRST_NAME and LAST_NAME in your env or .env file.');
  if (!userConfig.password) throw new Error('Set PASSWORD in env or .env.');
  if (!userConfig.pollEvLink) throw new Error('No PollEv Link was set in .env.');

  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const closed = new Promise<void>((resolve) => {
    browser.once('disconnected', () => resolve());
  });

  let stopDetection: (() => Promise<void>) | undefined;
  let handler: PollHandler | undefined;
  let stopDiscord: (() => Promise<void>) | undefined;

  try {
    stopDiscord = await startDiscord({
      BOT_TOKEN: process.env.BOT_TOKEN ?? '',
      CHANNEL_ID: process.env.CHANNEL_ID ?? '',
      USER_ID: process.env.USER_ID ?? '',
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await navigateLogin(context, page, userConfig);

    handler = createPollHandler(page, async (poll) => {
      console.log('Poll question:', poll.question);
      console.log('Poll answers:', poll.answers);
      console.log('Sending message to Discord');
      await send_message(userConfig, poll);
      console.log('Message was sent to Discord');
    });
    page.once('close', handler.stop);
    stopDetection = await startDetection(page, handler);

    
    await closed;
  } finally {
    handler?.stop();
    await stopDetection?.();
    await stopDiscord?.();
    if (browser.isConnected()) await browser.close();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Could not open Poll Everywhere:', error);
    process.exitCode = 1;
  });
}
