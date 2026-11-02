import type { Page } from 'playwright';

export async function startDetection(
  page: Page,
  onQuestion: () => void | Promise<void>,
  onClosed: () => void = () => {},
): Promise<() => Promise<void>> {
  let stopped = false;
  await page.exposeFunction('__pollSmsChanged', async (identityChanged: boolean) => {
    if (stopped) return;
    try {
      if (identityChanged) onClosed();
      await onQuestion();
    } catch (error) {
      if (!stopped && !page.isClosed()) console.error('Could not process poll:', error);
    }
  });

  await page.exposeFunction('__pollSmsClosed', () => { if (!stopped) onClosed(); });

  const install = async () => {
    await page.locator('#active_tab_content').waitFor({ state: 'attached' });
    if (stopped) return;
    await page.evaluate(() => {
      const scope = window as typeof window & {
        __pollSmsChanged: (identityChanged: boolean) => Promise<void>;
        __pollSmsClosed: () => Promise<void>;
        __stopPollSmsDetection?: () => void;
      };
      scope.__stopPollSmsDetection?.();
      const container = document.querySelector('#active_tab_content')!;
      let timer: number;
      let previousIdentity: string | undefined;
      const schedule = () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          const heading = container.querySelector<HTMLElement>('.component-response-header__title');
          if (heading && heading.getClientRects().length && getComputedStyle(heading).visibility !== 'hidden') {
            const poll = heading.closest('[id^="legacy_multiple_choice_poll_instance_"]');
            const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
            const choices = Array.from(poll?.querySelectorAll<HTMLElement>(
              '.component-response-multiple-choice__response-container > div > div',
            ) ?? []).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
              .map(el => normalize(el.innerText));
            const identity = JSON.stringify([poll?.id, normalize(heading.innerText), choices]);
            const changed = previousIdentity !== undefined && previousIdentity !== identity;
            previousIdentity = identity;
            void scope.__pollSmsChanged(changed).catch(() => undefined);
          } else {
            previousIdentity = undefined;
            void scope.__pollSmsClosed().catch(() => undefined);
          }
        }, 300);
      };
      const observer = new MutationObserver(schedule);
      observer.observe(container, {
        childList: true, subtree: true, characterData: true, attributes: true,
      });
      scope.__stopPollSmsDetection = () => {
        observer.disconnect();
        clearTimeout(timer);
      };
      schedule(); // Also handle a question already on screen.
    });
  };
  const onLoad = () => {
    void install().catch((error) => {
      if (!stopped && !page.isClosed()) console.error('Could not watch poll:', error);
    });
  };
  page.on('domcontentloaded', onLoad);
  try {
    await install();
  } catch (error) {
    stopped = true;
    page.off('domcontentloaded', onLoad);
    throw error;
  }

  return async () => {
    stopped = true;
    page.off('domcontentloaded', onLoad);
    if (!page.isClosed()) {
      await page.evaluate(() => {
        (window as typeof window & { __stopPollSmsDetection?: () => void }).__stopPollSmsDetection?.();
      }).catch(() => undefined);
    }
  };
}
