// lib/irctc-flows/base-page.js
class BasePage {
    constructor(driver) {
        this.driver = driver;
    }

    /**
     * Robust wait for an element to exist and be displayed
     */
    async waitForElement(selector, timeout = 15000) {
        try {
            const el = await this.driver.$(selector);
            await el.waitForExist({ timeout });
            await el.waitForDisplayed({ timeout });
            return el;
        } catch (e) {
            console.warn(`[BasePage] Timeout waiting for element: ${selector}`);
            return null;
        }
    }

    /**
     * Robust click that waits for the element first
     */
    async safeClick(elementOrSelector, timeout = 10000) {
        try {
            let element;
            if (typeof elementOrSelector === 'string') {
                element = await this.waitForElement(elementOrSelector, timeout);
            } else {
                element = elementOrSelector;
            }

            if (!element) return false;

            await element.waitForDisplayed({ timeout });
            await element.click();
            return true;
        } catch (e) {
            console.error(`[BasePage] safeClick failed: ${e.message}`);
            return false;
        }
    }

    /**
     * Find first matching selector from a list
     */
    async findAny(selectors, timeout = 5000) {
        const endTime = Date.now() + timeout;
        do {
            for (const sel of selectors) {
                try {
                    const el = await this.driver.$(sel);
                    if (await el.isExisting()) return el;
                } catch (e) { }
            }
            await this.driver.pause(500);
        } while (Date.now() < endTime);
        return null;
    }

    /**
     * Wait for a specific activity to appear
     */
    async waitForActivity(activityName, timeout = 15000) {
        try {
            await this.driver.waitUntil(async () => {
                const current = await this.driver.getCurrentActivity();
                return current && current.includes(activityName);
            }, { timeout, timeoutMsg: `Timed out waiting for activity: ${activityName}` });
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Robust Scrolling for Android
     */
    async scrollToBottom() {
        try {
            console.log('[BasePage] Performing native scroll to bottom...');
            // Target the main scrollable container in IRCTC
            await this.driver.$('android=new UiScrollable(new UiSelector().scrollable(true)).scrollToEnd(10)');
            await this.driver.pause(1000);
        } catch (e) {
            console.warn('[BasePage] Native scroll failed, using manual swipe...');
            await this.manualSwipeUp(3);
        }
    }

    async manualSwipeUp(times = 1) {
        const { width, height } = await this.driver.getWindowSize();
        const centerX = Math.floor(width / 2);
        const startY = Math.floor(height * 0.8);
        const endY = Math.floor(height * 0.2);

        for (let i = 0; i < times; i++) {
            await this.driver.performActions([{
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x: centerX, y: startY },
                    { type: 'pointerDown', button: 0 },
                    { type: 'pointerMove', duration: 800, x: centerX, y: endY },
                    { type: 'pointerUp', button: 0 }
                ]
            }]);
            await this.driver.pause(500);
        }
    }
}

module.exports = BasePage;
