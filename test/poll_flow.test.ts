import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright';
import { createPollHandler } from '../src/main';
import { startDetection } from '../src/detect';
import { createPollAnswerState } from '../src/poll_answer';
import type { PollIdentity, PollSuggestion } from '../src/types';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });
const markup = (id: string) => `<div id="legacy_multiple_choice_poll_instance_${id}"><legacy-response-view><div><div>
  <div class="component-response-header"><h1 class="component-response-header__title">Question ${id}?</h1></div>
  <div class="component-response-multiple-choice__body"><div class="component-response-multiple-choice__response-container"><div>
  <div><button>A</button></div><div><button>B</button></div>
  </div></div></div></div></div></legacy-response-view></div>`;
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Flow timed out');
    await Bun.sleep(20);
  }
}

test('parsed poll -> proposal -> no -> manual choice submits only once; close disables', async () => {
  const page = await browser.newPage();
  await page.setContent(`<div id="active_tab_content">${markup('1')}</div>`);
  const proposed: PollIdentity[] = [];
  const submissions: Array<{ id: string; choice: number }> = [];
  const state = createPollAnswerState({
    solve: async () => ({ choice: 2, explanation: 'Suggested B' }),
    propose: async identity => { proposed.push(identity); return 'proposal-1'; },
    notify: async () => {},
    submit: async (identity, choice) => { submissions.push({ id: identity.instanceId, choice }); return { status: 'confirmed', detail: 'Recorded' }; },
  });
  const handler = createPollHandler(page, (poll, instanceId) => { void state.start({ poll, instanceId }); });
  const stop = await startDetection(page, handler, () => { handler.invalidate(); state.disable(); });
  try {
    await until(() => state.state === 'awaiting_confirmation');
    expect(proposed[0]?.poll.answers).toEqual(['A', 'B']);
    expect(submissions).toHaveLength(0);
    await state.receive({ id: 'r1', content: 'no', replyToId: 'proposal-1' });
    await Promise.all([state.receive({ id: 'r2', content: '1', replyToId: 'proposal-1' }), state.receive({ id: 'r2', content: '1', replyToId: 'proposal-1' })]);
    expect(submissions).toEqual([{ id: 'legacy_multiple_choice_poll_instance_1', choice: 1 }]);
    await page.locator('#active_tab_content').evaluate(el => { el.innerHTML = '<h1>Waiting</h1>'; });
    await until(() => state.state === 'disabled');
    await state.receive({ id: 'r3', content: 'yes', replyToId: 'proposal-1' });
    expect(submissions).toHaveLength(1);
  } finally { handler.stop(); state.disable(); await stop(); await page.close(); }
});

test('detector remains responsive during solving and discards old agent result', async () => {
  const page = await browser.newPage();
  await page.setContent(`<div id="active_tab_content">${markup('1')}</div>`);
  let finishOld!: (suggestion: PollSuggestion) => void;
  const oldResult = new Promise<PollSuggestion>(resolve => { finishOld = resolve; });
  let oldSignal: AbortSignal | undefined;
  const proposals: string[] = [];
  const state = createPollAnswerState({
    solve: (poll, signal) => {
      if (poll.question === 'Question 1?') { oldSignal = signal; return oldResult; }
      return Promise.resolve({ choice: 1, explanation: 'A' });
    },
    propose: async identity => { proposals.push(identity.instanceId); return identity.instanceId; },
    notify: async () => {},
    submit: async () => { throw new Error('No approval expected'); },
  });
  const handler = createPollHandler(page, (poll, instanceId) => { void state.start({ poll, instanceId }); });
  const stop = await startDetection(page, handler, () => { handler.invalidate(); state.disable(); });
  try {
    await until(() => !!oldSignal);
    await page.locator('#active_tab_content').evaluate((el, html) => { el.innerHTML = html; }, markup('2'));
    await until(() => state.state === 'awaiting_confirmation');
    expect(oldSignal?.aborted).toBe(true);
    finishOld({ choice: 2, explanation: 'Late result' });
    await Bun.sleep(20);
    expect(proposals).toEqual(['legacy_multiple_choice_poll_instance_2']);
    await state.receive({ id: 'stale', content: 'yes', replyToId: 'legacy_multiple_choice_poll_instance_1' });
    expect(state.state).toBe('awaiting_confirmation');
  } finally { finishOld({ choice: 1, explanation: 'End' }); handler.stop(); state.disable(); await stop(); await page.close(); }
});
