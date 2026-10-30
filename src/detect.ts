import type { Page } from 'playwright';

export async function startDetection(page: Page): Promise<void> {
  await page.evaluate(() => {
    //Container where pollev updates
    const targetNode = document.querySelector('.pe-response-activity') || document.body;
    
    const detectionConfig: MutationObserverInit = {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class', 'disabled', 'aria-disabled']
    };
    
    //Callback function to execute when a mutation occurs
    const callback = (mutationsList:MutationRecord[], observer:MutationObserver) => {
        for (const mutation of mutationsList) {
            // Check if an element saying "closed" or "waiting" was added
            if (document.body.innerText.includes("waiting for the presenter") || 
                document.body.innerText.includes("closed")) {
                console.log("⚡ Poll State Changed: Poll is OFF / Locked");
            } else {
                console.log("⚡ Poll State Changed: Poll is ON / Accepting responses");
                
            }
        }
    };
    
    //Create and start the observer
    const observer:MutationObserver = new MutationObserver(callback);
    
    observer.observe(targetNode, detectionConfig);
  });
}
