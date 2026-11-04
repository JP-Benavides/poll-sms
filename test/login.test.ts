import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright';
import { navigateLogin } from '../src/login';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });
const config = {
  email: 'test@example.com', password: 'test-password', firstName: 'Test', lastName: 'User',
  pollEvLink: 'https://login.test/', presenterName: 'presenter', discordURL: '',
};

for (const scenario of ['ready', 'password', 'join', 'retry', 'yes']) {
  test(`handles ${scenario} without requiring earlier login screens`, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(1000);
    const ready = '<div id=active_tab_content>Waiting for a poll</div>';
    const fixtures: Record<string, string> = {
      ready,
      password: `<input id="i0118" type="password"><button id="idSIButton9" onclick="if(document.querySelector('input').value === 'test-password') setTimeout(() => document.body.innerHTML = '${ready}', 200)">Sign in</button>`,
      join: `<input placeholder="Presenter's username"><button onclick="if(document.querySelector('input').value === 'presenter') document.body.innerHTML = '${ready}'">Join</button>`,
      retry: '<a href="/ready">Please try again</a>',
      yes: `<button id="idSIButton9" onclick="document.body.innerHTML = '${ready}'">Yes</button>`,
    };
    await page.route('https://login.test/**', route => route.fulfill({
      contentType: 'text/html', body: route.request().url().endsWith('/ready') ? ready : fixtures[scenario],
    }));
    try {
      await navigateLogin(context, page, config);
      expect(await page.locator('#active_tab_content').isVisible()).toBe(true);
    } finally { await context.close(); }
  });
}

for (const hideProfile of [false, true]) {
  test(`handles two login links with profile hidden=${hideProfile}`, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(1000);
    await page.route('https://login.test/**', route => route.fulfill({
      contentType: 'text/html',
      body: route.request().url().includes('/login?')
        ? '<div id="active_tab_content">Waiting for a poll</div>'
        : `<a ${hideProfile ? 'hidden' : ''} href="/login?participant=true">Profile Log in</a>
           <a href="/login?participant=true&redirect=presenter">Log in</a>`,
    }));
    try {
      await navigateLogin(context, page, config);
      expect(await page.locator('#active_tab_content').isVisible()).toBe(true);
      expect(page.url()).toContain('/login?participant=true');
    } finally { await context.close(); }
  });
}
