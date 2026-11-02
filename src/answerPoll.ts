import type { Page } from 'playwright';
import type { PollIdentity, SubmissionResult } from './types';

const rootSelector = '[id^="legacy_multiple_choice_poll_instance_"]';
const headingSelector = 'legacy-response-view > div > div > div.component-response-header > h1';
const answersSelector = 'legacy-response-view > div > div > div.component-response-multiple-choice__body > div.component-response-multiple-choice__response-container > div > div';

/** One-based choice. Adapters are fixture-tested; live selectors remain unverified. */
export async function answerPoll(
  page: Page, identity: PollIdentity, choice: number, signal?: AbortSignal,
): Promise<SubmissionResult> {
  const failed = (detail: string): SubmissionResult => ({ status: 'failed', detail });
  if (signal?.aborted) return failed('Aborted before interaction.');
  if (!Number.isInteger(choice) || choice < 1 || choice > identity.poll.answers.length) {
    return failed('Choice must be a one-based answer number.');
  }
  const key = `pollApproval_${crypto.randomUUID().replaceAll('-', '')}`;
  let attempted = false;
  let installed = false;
  const cancel = () => { void page.evaluate(key => {
    const state = (window as any)[key];
    if (state) state.cancelled = true;
  }, key).catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const adapter = await page.evaluate(({ key, identity, choice, rootSelector, headingSelector, answersSelector }) => {
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
      const visible = (el: Element) => {
        const style = getComputedStyle(el);
        return style.visibility !== 'hidden' && style.visibility !== 'collapse' && el.getClientRects().length > 0;
      };
      const enabled = (el: Element) => !el.matches(':disabled') && !el.closest('[aria-disabled="true"], [inert]');
      const roots = Array.from(document.querySelectorAll(rootSelector)).filter(visible);
      const root = roots[0];
      if (roots.length !== 1 || !root || root.id !== identity.instanceId) throw Error('Poll instance is stale or ambiguous.');
      const read = () => {
        const headings = Array.from(root.querySelectorAll(headingSelector)).filter(visible);
        const boxes = Array.from(root.querySelectorAll(answersSelector)).filter(visible)
          .filter(el => normalize((el as HTMLElement).innerText));
        return { headings, boxes };
      };
      const matches = () => {
        const currentRoots = Array.from(document.querySelectorAll(rootSelector)).filter(visible);
        const { headings, boxes } = read();
        return root.isConnected && currentRoots.length === 1 && currentRoots[0] === root && root.id === identity.instanceId &&
          headings.length === 1 && normalize((headings[0] as HTMLElement).innerText) === normalize(identity.poll.question) &&
          boxes.length === identity.poll.answers.length && boxes.every((box, i) => normalize((box as HTMLElement).innerText) === normalize(identity.poll.answers[i]!));
      };
      if (!matches()) throw Error('Poll question or ordered answers changed.');
      const { boxes } = read();
      const controls = boxes.map(box => Array.from(box.querySelectorAll('button, input, [role="button"], [role="radio"], a[href], select, textarea')));
      if (controls.some(items => items.length !== 1)) throw Error('Answer controls are ambiguous or unsupported.');
      const target = controls[choice - 1]![0]!;
      const buttonMode = controls.every(items => items[0] instanceof HTMLButtonElement);
      const radioMode = controls.every(items => items[0] instanceof HTMLInputElement && items[0].type === 'radio');
      if (!buttonMode && !radioMode) throw Error('Unsupported answer controls.');
      if (!visible(target) || !enabled(target)) throw Error('Selected answer is hidden or disabled.');
      const name = (el: Element) => normalize(el.getAttribute('aria-label') || (el as HTMLElement).innerText);
      const submits = Array.from(root.querySelectorAll('button')).filter(el => !boxes.some(box => box.contains(el)) && /^(submit|submit answer)$/i.test(name(el)));
      let submit: HTMLButtonElement | undefined;
      if (radioMode) {
        const radios = controls.map(items => items[0] as HTMLInputElement);
        const radio = target as HTMLInputElement;
        if (!radio.name || radios.some(el => el.name !== radio.name || el.form !== radio.form) ||
            Array.from(document.querySelectorAll('input[type="radio"]')).some(el => (el as HTMLInputElement).name === radio.name && (el as HTMLInputElement).form === radio.form && !radios.includes(el as HTMLInputElement))) {
          throw Error('Radio group is ambiguous.');
        }
        if (submits.length !== 1 || !visible(submits[0]!) || !enabled(submits[0]!) || submits[0]!.form !== radio.form) throw Error('Submit control is missing, ambiguous, or disabled.');
        submit = submits[0]!;
      } else if (submits.length) throw Error('Button selection with separate submit is unsupported.');
      const statuses = () => Array.from(root.querySelectorAll('[role="status"], [aria-live="polite"], [aria-live="assertive"]'))
        .filter(visible).map(el => normalize((el as HTMLElement).innerText));
      const before = statuses();
      const state = { cancelled: false, clicks: 0, blocked: false, target, submit, matches, statuses, before, guard: (_event: MouseEvent) => {} };
      state.guard = (event: MouseEvent) => {
        const path = event.composedPath();
        const control = path.includes(target) ? target : submit && path.includes(submit) ? submit : undefined;
        if (!control) return;
        const expected = state.clicks === 0 ? target : state.clicks === 1 ? submit : undefined;
        if (state.cancelled || !matches() || control !== expected || !visible(control) || !enabled(control) ||
            (control === submit && !(target as HTMLInputElement).checked)) {
          state.blocked = true;
          event.preventDefault(); event.stopImmediatePropagation();
          return;
        }
        state.clicks++;
      };
      window.addEventListener('click', state.guard, true);
      (window as any)[key] = state;
      return radioMode ? 'radio' : 'button';
    }, { key, identity, choice, rootSelector, headingSelector, answersSelector });
    installed = true;
    if (signal?.aborted) return failed('Aborted before interaction.');
    const target = await page.evaluateHandle(key => (window as any)[key].target, key);
    try {
      if (signal?.aborted) return failed('Aborted before interaction.');
      attempted = true;
      await target.asElement()!.click({ timeout: 750 });
    } finally { await target.dispose(); }
    if (adapter === 'radio') {
      const ready = await page.evaluate(key => {
        const state = (window as any)[key];
        return state && !state.cancelled && !state.blocked && state.clicks === 1 && state.matches() && state.target.checked;
      }, key);
      if (!ready || signal?.aborted) return { status: 'uncertain', detail: 'Choice interaction occurred; submit was withheld after cancellation or changed state.' };
      const submit = await page.evaluateHandle(key => (window as any)[key].submit, key);
      try {
        if (signal?.aborted) return { status: 'uncertain', detail: 'Aborted after choice interaction; submit withheld.' };
        await submit.asElement()!.click({ timeout: 750 });
      } finally { await submit.dispose(); }
    }
    const deadline = Date.now() + 3000;
    let evidence: { clicks: number; confirmed: boolean; ended: boolean };
    do {
      evidence = await page.evaluate(key => {
      const state = (window as any)[key];
      if (!state) return { clicks: 0, confirmed: false, ended: true };
      // Exact explicit acknowledgement, scoped to the unchanged poll, newly appearing after action.
      const confirmed = !state.cancelled && !state.blocked && state.matches() &&
        state.clicks === (state.submit ? 2 : 1) && state.statuses().some((text: string) =>
          !state.before.includes(text) && /^(?:(?:your )?(?:answer|response|vote) (?:has been )?(?:submitted|recorded|received)(?: successfully)?)[.!]?$/i.test(text));
      return { clicks: state.clicks, confirmed,
        ended: state.cancelled || state.blocked || !state.matches() };
      }, key);
      if (evidence.confirmed || evidence.ended || signal?.aborted || Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (true);
    if (!evidence.clicks) return failed('Interaction was blocked before a click reached the control.');
    return evidence.confirmed && !signal?.aborted
      ? { status: 'confirmed', detail: 'New explicit submission acknowledgement appeared in the poll.' }
      : { status: 'uncertain', detail: 'Control clicked once; no new supported submission acknowledgement was observed.' };
  } catch {
    // A timeout/navigation after starting input does not prove that the input failed.
    return attempted
      ? { status: 'uncertain', detail: 'Interaction started but submission could not be verified; do not retry automatically.' }
      : failed('Poll identity or controls could not be safely validated.');
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (installed) await page.evaluate(key => {
      const state = (window as any)[key];
      if (state) { state.cancelled = true; window.removeEventListener('click', state.guard, true); delete (window as any)[key]; }
    }, key).catch(() => {});
  }
}
