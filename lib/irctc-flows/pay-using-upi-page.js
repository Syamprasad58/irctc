// lib/irctc-flows/pay-using-upi-page.js
const BasePage = require('./base-page');

class PayUsingUpiPage extends BasePage {
  constructor(driver) {
    super(driver);
  }

  async selectProviderAndPay(paymentGateway, upiId, ticketData) {
    try {
      console.log(`[PayUsingUpiPage] Looking for provider: ${paymentGateway}`);

      // Expand selectors to be more robust, targeting both text and parent layouts if needed
      const lowerGateway = paymentGateway.toLowerCase();
      const selectors = [
        `//android.widget.TextView[contains(translate(@text, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${lowerGateway}")]`,
        `//android.widget.TextView[contains(@text, "${paymentGateway}")]`,
        `//*[contains(@text, "${paymentGateway}")]`,
        `//*[@resource-id="cris.org.in.prs.ima:id/msg_first_line_one" and contains(translate(@text, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${lowerGateway}")]`
      ];

      let clicked = false;

      // Step 1: Long wait for the payment list to load
      console.log('[PayUsingUpiPage] Waiting for payment providers to load...');
      await this.driver.pause(2000);

      // Step 2: Search loop with native scroll
      for (let i = 0; i < 4; i++) {
        const btn = await this.findAny(selectors, 2000);
        if (btn) {
          console.log(`[PayUsingUpiPage] Found ${paymentGateway}, attempting click...`);
          // Try to click the element or its parent if the element itself is not clickable
          clicked = await this.safeClick(btn, 5000);
          if (!clicked) {
            console.log('[PayUsingUpiPage] Direct click failed, trying to click parent container...');
            try {
              const parent = await btn.$('..');
              await parent.click();
              clicked = true;
            } catch (e) { }
          }
          if (clicked) break;
        }

        console.log(`[PayUsingUpiPage] Provider ${paymentGateway} not found in current view, scrolling...`);

        try {
          // Native UIAutomator scroll specifically for finding text
          const uiSelector = `new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("${paymentGateway}"))`;
          await this.driver.$(`android=${uiSelector}`);
          await this.driver.pause(1000);
        } catch (e) {
          console.warn('[PayUsingUpiPage] Native scroll search failed, performing manual fling...');
          await this.manualSwipeUp(1);
        }
      }

      if (!clicked) {
        return { success: false, error: `Payment provider "${paymentGateway}" not found or not clickable` };
      }

      console.log(`[PayUsingUpiPage] ${paymentGateway} selected.`);
      await this.driver.pause(1000);

      // Step 3: Click PROCEED TO PAY
      const proceedBtnSelectors = [
        '//android.widget.TextView[contains(@text, "PROCEED TO PAY")]',
        '//*[contains(@text, "PROCEED")]',
        '//android.widget.Button[contains(@text, "PAY")]'
      ];

      const proceedBtn = await this.findAny(proceedBtnSelectors, 15000);
      if (!(await this.safeClick(proceedBtn, 5000))) {
        return { success: false, error: 'PROCEED TO PAY button not found' };
      }

      await this.driver.pause(2000);
      return await this.enterUpiIdAndPay(upiId);

    } catch (error) {
      console.error(`[PayUsingUpiPage] Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async enterUpiIdAndPay(upiId) {
    try {
      if (!upiId) return { success: false, error: 'UPI ID is required' };

      console.log(`[PayUsingUpiPage] Entering UPI ID: ${upiId}`);

      const upiInputSelectors = [
        '//android.widget.EditText[@resource-id="cris.org.in.prs.ima:id/edt_vpa"]',
        '//android.widget.EditText[@content-desc="edt_vpa"]',
        '//android.widget.EditText[contains(@hint, "UPI")]',
        '//android.widget.EditText'
      ];

      const input = await this.findAny(upiInputSelectors, 15000);
      if (!input) throw new Error('UPI input field not found');

      await input.click();
      await input.clearValue();
      await input.setValue(upiId);

      // Hide keyboard if it obscures the button
      if (await this.driver.isKeyboardShown()) {
        await this.driver.hideKeyboard();
        await this.driver.pause(500);
      }

      const verifyPayBtn = '//*[contains(@text, "Verify and Pay")]';
      if (await this.safeClick(verifyPayBtn, 15000)) {
        console.log('[PayUsingUpiPage] Verify and Pay clicked');
        return { success: true };
      }

      return { success: false, error: 'Verify and Pay button not found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = PayUsingUpiPage;