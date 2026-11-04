import type { UserInfo } from './types';
import type { BrowserContext, Locator, Page } from 'playwright';

export async function navigateLogin(_context: BrowserContext, page: Page, config: UserInfo): Promise<void> {
  await page.goto(config.pollEvLink, { waitUntil: 'domcontentloaded' });
  console.log('Accessed PollEV');

  // The header and presentation can both contain a login link.
  const loginLink = page.locator('a[href*="/login?participant=true"]:visible').first();
  const loginForm = page.locator(
    'body > div > div > div > div.bg-neutral-100.border.border-neutral-200.rounded-lg.p-6 > form',
  );
  const email = loginForm.getByRole('textbox');
  const continueButton = loginForm.getByRole('button', { name: 'Continue', exact: true });
  const signInButton = page.locator('#sign_in_form > div > form:nth-child(2) > button');
  const microsoftEmail = page.locator('#i0116');
  const password = page.locator('#i0118');
  const microsoftNext = page.locator('#idSIButton9');
  const duo = page.locator('#idDiv_SAOTCS_Proofs > div > div');
  const yes = microsoftNext.and(page.getByRole('button', { name: 'Yes', exact: true }));
  const retryLink = page.getByRole('link', { name: /please try again/i });
  const presenterInput = page.getByPlaceholder("Presenter's username");
  const join = page.getByRole('button', { name: 'Join', exact: true });
  const presenterForm = page.locator('turbo-frame[id^="action_sheet-"] > form');
  const profileButton = page.locator('#participant_screen_name button').first();

  // Recheck optional screens during redirects and manual Duo approval. Each
  // action runs once so a slow transition cannot submit the same form twice.
  const completed = new Set<string>();
  const visible = (locator: Locator) => locator.isVisible();
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error('Browser closed during Poll Everywhere login.');

    if (!completed.has('retry') && await visible(retryLink)) {
      await retryLink.click();
      completed.add('retry');
      console.log('Retried Poll Everywhere authentication.');
    }
    if (!completed.has('login') && await visible(loginLink)) {
      await loginLink.click();
      completed.add('login');
      console.log('Clicked Log in.');
    }
    if (!completed.has('email') && await visible(email)) {
      await email.fill(config.email);
      completed.add('email');
    }
    if (completed.has('email') && !completed.has('continue') && await visible(continueButton)) {
      await continueButton.click();
      completed.add('continue');
    }
    if (!completed.has('signIn') && await visible(signInButton)) {
      await signInButton.click();
      completed.add('signIn');
    }
    if (!completed.has('microsoftEmail') && await visible(microsoftEmail)) {
      await microsoftEmail.fill(config.email);
      completed.add('microsoftEmail');
    }
    if (completed.has('microsoftEmail') && !completed.has('emailNext')
      && await visible(microsoftEmail) && await visible(microsoftNext)) {
      await microsoftNext.click();
      completed.add('emailNext');
    }
    if (!completed.has('password') && await visible(password)) {
      await password.fill(config.password);
      completed.add('password');
    }
    if (completed.has('password') && !completed.has('passwordNext')
      && await visible(password) && await visible(microsoftNext)) {
      await microsoftNext.click();
      completed.add('passwordNext');
    }
    if (!completed.has('duo') && await visible(duo)) {
      await duo.click();
      completed.add('duo');
      console.log('Selected Duo. Approve the prompt on your phone.');
    }
    if (!completed.has('yes') && await visible(yes)) {
      await yes.click();
      completed.add('yes');
    }
    if (!completed.has('presenter') && await visible(presenterInput)) {
      await presenterInput.fill(config.presenterName);
      completed.add('presenter');
    }
    if (completed.has('presenter') && !completed.has('join') && await visible(join)) {
      await join.click();
      completed.add('join');
    }
    if (!completed.has('profile') && !await visible(presenterForm) && await visible(profileButton)) {
      await profileButton.click();
      completed.add('profile');
    }
    if (!completed.has('presenterName') && await visible(presenterForm.getByRole('textbox'))) {
      await presenterForm.getByRole('textbox').fill(`${config.firstName} ${config.lastName}`);
      completed.add('presenterName');
    }
    const updateButton = presenterForm.getByRole('button', { name: 'Update', exact: true });
    if (completed.has('presenterName') && !completed.has('presenterSubmit')
      && await visible(updateButton)) {
      await updateButton.click();
      completed.add('presenterSubmit');
    }

    if (await visible(page.locator('#active_tab_content'))
      && !await visible(loginLink) && !await visible(presenterInput)
      && !await visible(presenterForm)) return;

    await page.waitForTimeout(250);
  }
  throw new Error('Poll Everywhere login did not reach the presentation within 180 seconds. Check the browser for an unrecognized sign-in screen.');
}
