import type { UserInfo } from './types';
import { scrapePage } from './parser';
import { chromium } from 'playwright';
import dotenv from "dotenv"; 
import { navigateLogin } from './login.ts'; 
import { startDetection } from './detect.ts'
import { send_message } from './discord_webhook.ts'

dotenv.config({
  path: new URL('../.env', import.meta.url).pathname,
  quiet: true,
});

const userConfig: UserInfo = {
  email: process.env.USERNAME ?? '',
  password: process.env.PASSWORD ?? '',
  pollEvLink: process.env.POLL_EV_LINK ?? '',
  discordURL: process.env.POLL_EV_LINK ?? ''
};


async function main() {
  if (!userConfig.email) throw new Error('Set EMAIL in your env or .env file.');
  if (!userConfig.password) throw new Error('Set PASSWROD in env or .env');
  if (!userConfig.pollEvLink) throw new Error('No PollEv Link was set in .env'); 
  const browser = await chromium.launch({ headless: false });
  const closed = new Promise<void>((resolve) => {
    browser.once('disconnected', () => resolve());
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await navigateLogin(context, page, userConfig);

    //detect() -> once change in dom is detected parse Q&A
    await startDetection(page); 

    try {
      const poll = await scrapePage(page);
      console.log('Poll question:', poll.question);
      console.log('Poll answers:', poll.answers);
      
      //Send message to Discord Via Webhook
      await send_message(userConfig, poll).catch((error) => console.error("Cannot send message to Discord", error)); 
      

    } catch (error) {
      console.error('Could not read the poll:', error);
    }

  
    await closed;
  } finally {
    if (browser.isConnected()) await browser.close();
  }
}


main().catch((error) => {
  console.error('Could not open Poll Everywhere:', error);
  process.exitCode = 1;
});
