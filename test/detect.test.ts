import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright';
import { startDetection } from '../src/detect';
import { createPollHandler } from '../src/main';
import { scrapePage } from '../src/parser';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterEach(async () => { await Promise.all(browser.contexts().map(context => context.close())); });
afterAll(async () => { await browser?.close(); });

const waiting = '<h1>Waiting for the presentation to begin...</h1>';
function question(id = '1', text = 'Question?') {
  return `<div id="legacy_multiple_choice_poll_instance_${id}"><legacy-response-view><div><div>
    <div class="component-response-header"><h1 class="component-response-header__title">${text}</h1></div>
    <div class="component-response-multiple-choice__body">
      <div class="component-response-multiple-choice__response-container"><div>
        <div><button disabled>First</button></div><div><button disabled>Second</button></div>
      </div></div>
    </div>
  </div></div></legacy-response-view></div>`;
}
async function setup(content = waiting) {
  const page = await browser.newPage();
  await page.setContent(`<turbo-frame id="active_tab_content">${content}</turbo-frame>`);
  return page;
}
async function until(condition: () => boolean) {
  const deadline = Date.now() + 3_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for detection');
    await Bun.sleep(20);
  }
}

test('waiting is closed; a visible question is open even with disabled answer buttons', async () => {
  const page = await setup();
  let calls = 0;
  const stop = await startDetection(page, () => { calls++; });
  await Bun.sleep(400);
  expect(calls).toBe(0);
  await page.locator('#active_tab_content').evaluate((el, html) => { el.innerHTML = html; }, question());
  await until(() => calls === 1);
  await page.locator('.component-response-header__title').evaluate(el => { (el as HTMLElement).hidden = true; });
  await Bun.sleep(400);
  expect(calls).toBe(1);
  await stop();
});

test('initial question, mutation bursts, deduplication, and replacement with another question', async () => {
  const page = await setup(question());
  const deliveries: string[] = [];
  const handler = createPollHandler(page, poll => { deliveries.push(poll.question); });
  const stop = await startDetection(page, handler);
  await until(() => deliveries.length === 1);
  await page.locator('.component-response-header__title').evaluate(el => {
    el.firstChild!.textContent = 'Intermediate';
    el.firstChild!.textContent = 'Updated?';
  });
  await until(() => deliveries.length === 2);
  await page.locator('#active_tab_content').evaluate(el => { el.classList.add('unrelated'); });
  await Bun.sleep(400);
  expect(deliveries).toEqual(['Question?', 'Updated?']);
  await page.locator('#active_tab_content').evaluate((el, html) => { el.innerHTML = html; }, question('2'));
  await until(() => deliveries.length === 3);
  handler.stop();
  await stop();
});

test('a change during parsing is handled afterward without overlapping parses', async () => {
  const page = await setup(question());
  let started = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const deliveries: string[] = [];
  const handler = createPollHandler(page, poll => { deliveries.push(poll.question); }, async current => {
    const parsed = await scrapePage(current);
    if (!started) { started = true; await gate; }
    return parsed;
  });
  const stop = await startDetection(page, handler);
  await until(() => started);
  await page.locator('#active_tab_content').evaluate((el, html) => { el.innerHTML = html; }, question('2', 'Next?'));
  await Bun.sleep(400); // Deliver the mutation while the first parse is blocked.
  release();
  await until(() => deliveries.length === 1);
  expect(deliveries).toEqual(['Next?']);
  handler.stop();
  await stop();
});

test('reattaches on navigation; stopping clears a scheduled notification', async () => {
  const page = await setup();
  let calls = 0;
  const stop = await startDetection(page, () => { calls++; });
  await page.route('http://poll.test/**', route => route.fulfill({
    contentType: 'text/html', body: `<div id="active_tab_content">${question()}</div>`,
  }));
  await page.goto('http://poll.test/');
  await until(() => calls === 1);
  await page.locator('.component-response-header__title').evaluate(el => { el.textContent = 'Later?'; });
  await stop();
  await Bun.sleep(400);
  expect(calls).toBe(1);
});

test('handler stop prevents delivery from an in-flight parse', async () => {
  const page = await setup(question());
  let started = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let deliveries = 0;
  const handler = createPollHandler(page, () => { deliveries++; }, async current => {
    const parsed = await scrapePage(current);
    started = true;
    await gate;
    return parsed;
  });
  const running = handler();
  await until(() => started);
  handler.stop();
  release();
  await running;
  expect(deliveries).toBe(0);
});

test('closing a question disables pending answer capture', async () => {
  const page = await setup(question());
  let open = false;
  const stop = await startDetection(page, () => { open = true; }, () => { open = false; });
  await until(() => open);
  await page.locator('#active_tab_content').evaluate((el, html) => { el.innerHTML = html; }, waiting);
  await until(() => !open);
  await stop();
});

test('changed question invalidates pending work before parsing replacement', async () => {
  const page = await setup(question());
  const events: string[] = [];
  const stop = await startDetection(page, () => { events.push('question'); }, () => { events.push('invalidate'); });
  await until(() => events.length === 1);
  await page.locator('.component-response-header__title').evaluate(el => { el.textContent = 'New question'; });
  await until(() => events.length === 3);
  expect(events).toEqual(['question', 'invalidate', 'question']);
  await page.locator('#active_tab_content').evaluate(el => { el.classList.add('unrelated'); });
  await until(() => events.length === 4);
  expect(events.at(-1)).toBe('question');
  await stop();
});

test('invalidation prevents a parse from enabling a closed poll', async () => {
  const page = await setup(question());
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let parsing = false;
  let deliveries = 0;
  const handler = createPollHandler(page, () => { deliveries++; }, async current => {
    const parsed = await scrapePage(current);
    parsing = true;
    await gate;
    return parsed;
  });
  const running = handler();
  await until(() => parsing);
  handler.invalidate();
  release();
  await running;
  expect(deliveries).toBe(0);
  handler.stop();
});
