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
}

module.exports = BasePage;
