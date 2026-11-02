import type { UserInfo } from './types';
import {type BrowserContext, type Page } from 'playwright';

export async function navigateLogin(context:BrowserContext, page:Page, config:UserInfo ): Promise<void>{
  const retryLink = page.getByRole('link', { name: /please try again/i });

  try {
    await runLogin(page, config);
  } catch (error) {
    if (!(await retryLink.isVisible().catch(() => false))) throw error;
  }

  // The error page and join page are optional and handled in order.
  if (await retryLink.isVisible().catch(() => false)) {
    console.log('Poll Everywhere returned an authentication error. Retrying.');
    await retryLink.click();
    await page.waitForLoadState('domcontentloaded');
  }

  const presenterInput = page.getByPlaceholder("Presenter's username");
  if (await presenterInput.isVisible().catch(() => false)) {
    await presenterInput.fill(config.presenterName);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    console.log('Joined presentation:', config.presenterName);
  }
}

async function runLogin(page: Page, config: UserInfo): Promise<void> {
  await page.goto(config.pollEvLink, { waitUntil: 'domcontentloaded' });
  console.log("Accessed PollEV")

  await page.locator('a[href*="/login?participant=true"]').click();
  console.log('Clicked Log in. Inspect the next sign-in screen, then close the browser to exit.');

  const loginForm = page.locator(
    'body > div > div > div > div.bg-neutral-100.border.border-neutral-200.rounded-lg.p-6 > form',
  );
  await loginForm.getByRole('textbox').fill(config.email);
  console.log('Email filled.');

  await page.locator(
    'body > div > div > div > div.bg-neutral-100.border.border-neutral-200.rounded-lg.p-6 > form > div > div > input'
  ).click(); 
  console.log('Clicked Continue.');

  await page.locator('#sign_in_form > div > form:nth-child(2) > button').click();
  console.log('Clicked the next sign-in button. Inspect the next screen.');

  await page.locator('#i0116').fill(config.email);
  console.log('Email filled on the next sign-in screen.');

  await page.locator('#idSIButton9').click();
  console.log('Clicked the button after entering the email. Inspect the next screen.');

  await page.locator('#i0118').fill(config.password);
  await page.locator('#idSIButton9').click();
  console.log('Submitted the password.');

  await page.locator('#idDiv_SAOTCS_Proofs > div > div').click();
  console.log('Selected the Duo option. Approve the prompt on your phone when it appears.');

  // This ID is reused across sign-in steps, so also require the Yes label.
  await page.locator('#idSIButton9')
    .and(page.getByRole('button', { name: 'Yes', exact: true }))
    .click({ timeout: 180_000 });
  console.log('Clicked Yes after Duo approval.');

  // The action-sheet ID changes each time, so select it by its stable prefix.
  const presenterForm = page.locator('turbo-frame[id^="action_sheet-"] > form');
  const formIsVisible = () => presenterForm.waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  let ready = await formIsVisible();
  if (!ready) {
    const profileButton = page.locator('#participant_screen_name button').first();
    if (await profileButton.isVisible().catch(() => false)) {
      await profileButton.click();
      ready = await formIsVisible();
    }
  }
  if (ready) {
    await presenterForm.getByRole('textbox').fill(config.presenterName);
    await presenterForm.getByRole('button').click();
    console.log('Entered presenter name:', config.presenterName);
  }
}
