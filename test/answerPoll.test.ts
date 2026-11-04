import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright';
import { answerPoll } from '../src/answerPoll';
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
const identity = { instanceId: 'legacy_multiple_choice_poll_instance_1', poll: { question: 'Q?', answers: ['A'] } };
async function setup(action: string, status = '') {
  const page = await browser.newPage();
  await page.setContent(`<div id="${identity.instanceId}"><legacy-response-view><div><div>
  <div class="component-response-header"><h1>Q?</h1></div>
  <div class="component-response-multiple-choice__body"><div class="component-response-multiple-choice__response-container"><div><div><button>A</button></div></div></div></div>
  <div role="status">${status}</div></div></div></legacy-response-view></div>`);
  await page.evaluate(action => {
    (window as any).clicks = 0;
    document.querySelector('button')!.addEventListener('click', () => {
      (window as any).clicks++;
      setTimeout(() => {
        if (action === 'success') document.querySelector('[role=status]')!.textContent = 'Answer submitted';
        if (action === 'replace') document.querySelector('[id]')!.id = 'different_poll';
      }, 200);
    });
  }, action);
  return page;
}
test('waits for delayed acknowledgement without clicking again', async () => {
  const page = await setup('success');
  try {
    expect((await answerPoll(page, identity, 1)).status).toBe('confirmed');
    expect(await page.evaluate(() => (window as any).clicks)).toBe(1);
  } finally { await page.close(); }
});
test('existing acknowledgement prevents another submission', async () => {
  const page = await setup('none', 'Answer submitted');
  try {
    const result = await answerPoll(page, identity, 1);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('already recorded');
    expect(await page.evaluate(() => (window as any).clicks)).toBe(0);
  } finally { await page.close(); }
});
test('poll replacement ends confirmation wait', async () => {
  const page = await setup('replace');
  try { expect((await answerPoll(page, identity, 1)).status).toBe('uncertain'); }
  finally { await page.close(); }
});
test('abort after click ends confirmation wait', async () => {
  const page = await setup('none');
  const controller = new AbortController();
  try {
    const result = answerPoll(page, identity, 1, controller.signal);
    await page.waitForFunction(() => (window as any).clicks === 1);
    controller.abort();
    expect((await result).status).toBe('uncertain');
  } finally { await page.close(); }
});

test('clicks the vote button while ignoring the hidden Undo button', async () => {
  const page = await setup('success');
  try {
    await page.evaluate(() => {
      const vote = document.querySelector('button')!;
      vote.className = 'component-response-multiple-choice__option__vote';
      const undo = document.createElement('button');
      undo.className = 'component-response-multiple-choice__option__undo';
      undo.hidden = true;
      undo.title = 'Undo vote';
      undo.onclick = () => { (window as any).undoClicked = true; };
      vote.after(undo);
    });
    expect((await answerPoll(page, identity, 1)).status).toBe('confirmed');
    expect(await page.evaluate(() => (window as any).clicks)).toBe(1);
    expect(await page.evaluate(() => Boolean((window as any).undoClicked))).toBe(false);
  } finally { await page.close(); }
});
