import type { Page } from 'playwright';

export async function startDetection(
  page: Page,
  onQuestion: () => void | Promise<void>,
): Promise<() => Promise<void>> {
  let stopped = false;
  await page.exposeFunction('__pollSmsChanged', async () => {
    if (stopped) return;
    try {
      await onQuestion();
    } catch (error) {
      if (!stopped && !page.isClosed()) console.error('Could not process poll:', error);
    }
  });

  const install = async () => {
    await page.locator('#active_tab_content').waitFor({ state: 'attached' });
    if (stopped) return;
    await page.evaluate(() => {
      const scope = window as typeof window & {
        __pollSmsChanged: () => Promise<void>;
        __stopPollSmsDetection?: () => void;
      };
      scope.__stopPollSmsDetection?.();
      const container = document.querySelector('#active_tab_content')!;
      let timer: number;
      const schedule = () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          const heading = container.querySelector<HTMLElement>('.component-response-header__title');
          if (heading && heading.getClientRects().length && getComputedStyle(heading).visibility !== 'hidden') {
            void scope.__pollSmsChanged().catch(() => undefined);
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
