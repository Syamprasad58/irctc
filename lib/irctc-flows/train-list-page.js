// lib/irctc-flows/train-list-page.js
const BasePage = require('./base-page');

class TrainListPage extends BasePage {
  constructor(driver) {
    super(driver);
  }

  async selectTrainByNumber(trainNumber, trainName = null) {
    try {
      console.log(`[TrainListPage] Searching for train number: ${trainNumber}`);
      const formattedNumber = trainNumber.split('').join(' ');

      // Strategy: Scroll into view using native Android scroll (very robust)
      const scrollSelector = `new UiScrollable(new UiSelector().resourceId("cris.org.in.prs.ima:id/lv_train_list").scrollable(true)).setAsVerticalList().scrollIntoView(new UiSelector().descriptionContains("${formattedNumber}"));`;

      try {
        const trainElement = await this.driver.$(`android=${scrollSelector}`);
        if (await trainElement.isExisting()) {
          console.log(`[TrainListPage] Found train: ${trainNumber}`);
          await this.clickRefreshForTrain(trainElement);
          return { success: true };
        }
      } catch (e) {
        console.warn(`[TrainListPage] Native scroll search failed: ${e.message}`);
      }

      // Fallback: Manual check if already visible
      const fallbackEl = await this.driver.$(`//android.widget.TextView[@content-desc="${formattedNumber}"]`);
      if (await fallbackEl.isExisting()) {
        await this.clickRefreshForTrain(fallbackEl);
        return { success: true };
      }

      return { success: false, error: `Train ${trainNumber} not found` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async clickRefreshForTrain(trainElement) {
    try {
      const trainLoc = await trainElement.getLocation();
      const allRefreshLines = await this.driver.$$('//android.widget.LinearLayout[@resource-id="cris.org.in.prs.ima:id/refresh_ll"]');

      let closest = null;
      let minGap = Infinity;

      for (const btn of allRefreshLines) {
        const btnLoc = await btn.getLocation();
        const gap = btnLoc.y - trainLoc.y;
        if (gap > 0 && gap < minGap) {
          minGap = gap;
          closest = btn;
        }
      }

      if (closest) {
        await closest.click();
        console.log('[TrainListPage] Clicked refresh button for train');
        await this.driver.pause(1000);
      }
    } catch (e) {
      console.error('[TrainListPage] Refresh click failed:', e.message);
    }
  }

  async selectTrainClass(trainClass) {
    console.log(`[TrainListPage] Selecting class: ${trainClass}`);
    const selectors = [
      `//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_avl_class" and @text="${trainClass}"]`,
      `//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_class" and @text="${trainClass}"]`
    ];

    const btn = await this.findAny(selectors, 10000);
    if (btn && await this.safeClick(btn)) {
      await this.driver.pause(1000);
      return { success: true };
    }
    return { success: false, error: `Class ${trainClass} not found` };
  }

  async clickContinue() {
    console.log('[TrainListPage] Clicking Passenger Details button...');
    const btn = '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_continue"]';
    if (await this.safeClick(btn, 10000)) {
      return { success: true };
    }
    return { success: false, error: 'Continue button not found' };
  }

  async handleWarningAlert() {
    // Standard android alert OK button
    const btn = '//android.widget.Button[@resource-id="android:id/button1"]';
    if (await this.safeClick(btn, 3000)) {
      console.log('[TrainListPage] Warning alert dismissed');
    }
    return { success: true };
  }
}

module.exports = TrainListPage;