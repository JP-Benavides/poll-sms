import type { Page } from 'playwright';
import type { ParsedPoll } from './types';

export async function scrapePage(page: Page): Promise<ParsedPoll> {
  // The numeric poll instance ID changes between questions.
  const poll = page.locator('[id^="legacy_multiple_choice_poll_instance_"]:visible');
  const heading = poll.locator(
    'legacy-response-view > div > div > div.component-response-header > h1:visible',
  );

  await heading.waitFor({ state: 'visible', timeout: 30_000 });
  const question = (await heading.innerText()).replace(/\s+/g, ' ').trim();
  if (!question) throw new Error('The poll question heading is empty.');

  
  const answerBoxes = poll.locator(
    'legacy-response-view > div > div > div.component-response-multiple-choice__body > div.component-response-multiple-choice__response-container > div > div:visible',
  );
  await answerBoxes.first().waitFor({ state: 'visible', timeout: 30_000 });
  const answers = (await answerBoxes.allInnerTexts())
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!answers.length) throw new Error('The poll answer boxes are empty.');

  return { question, answers };
}
