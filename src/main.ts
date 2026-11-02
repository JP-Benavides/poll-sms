import type { UserInfo, ParsedPoll } from './types';
import { scrapePage } from './parser';
import { chromium, type Page } from 'playwright';
import dotenv from 'dotenv';
import { navigateLogin } from './login.ts';
import { startDetection } from './detect.ts';
import { sendProposal, sendStatus } from './discord_webhook.ts';
import { solvePoll } from './poll_solver.ts';
import { answerPoll } from './answerPoll.ts';
import { startDiscord } from './discord_websocket.ts';
import { createPollAnswerState } from './poll_answer.ts';

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
  invalidate(): void;
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
  let generation = 0;

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

        const parsingGeneration = generation;
        let parsed: ParsedPoll;
        try {
          parsed = await parsePoll(page);
        } catch (error) {
          console.error('Could not read the poll:', error);
          continue;
        }
        if (stopped) return;
        if (parsingGeneration !== generation) continue;

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
  handler.invalidate = () => { generation++; pending = false; };
  handler.stop = () => { stopped = true; handler.invalidate(); };
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

  let page: Page | undefined;
  const answerState = createPollAnswerState({
    solve: solvePoll,
    propose: (identity, suggestion) => sendProposal(userConfig, identity, suggestion, process.env.CHANNEL_ID ?? ''),
    notify: message => sendStatus(userConfig, message),
    submit: (identity, choice, signal) => page
      ? answerPoll(page, identity, choice, signal)
      : Promise.resolve({ status: 'failed', detail: 'Poll browser is unavailable.' }),
    onError: message => console.error(message),
  });
  const invalidate = () => { handler?.invalidate(); answerState.disable(); };

  try {
    stopDiscord = await startDiscord({
      BOT_TOKEN: process.env.BOT_TOKEN ?? '',
      CHANNEL_ID: process.env.CHANNEL_ID ?? '',
      USER_ID: process.env.USER_ID ?? '',
    }, reply => answerState.receive(reply));
    const context = await browser.newContext();
    page = await context.newPage();
    await navigateLogin(context, page, userConfig);

    handler = createPollHandler(page, (poll, instanceId) => {
      console.log('Poll question:', poll.question);
      // Keep detection responsive while Codex and Discord are pending.
      void answerState.start({ poll, instanceId }).catch(() => {
        invalidate();
        console.error('Could not prepare poll approval.');
      });
    });
    page.once('close', () => { invalidate(); handler?.stop(); });
    page.on('domcontentloaded', invalidate);
    stopDetection = await startDetection(page, handler, invalidate);

    
    await closed;
  } finally {
    answerState.disable();
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
