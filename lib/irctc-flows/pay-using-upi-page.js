// lib/irctc-flows/pay-using-upi-page.js
const BasePage = require('./base-page');

class PayUsingUpiPage extends BasePage {
  constructor(driver) {
    super(driver);
  }

  async selectProviderAndPay(paymentGateway, upiId, ticketData) {
    try {
      console.log(`[PayUsingUpiPage] Looking for provider: ${paymentGateway}`);

      const selectors = [
        `//android.widget.TextView[contains(translate(@text, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${paymentGateway.toLowerCase()}")]`,
        `//*[contains(@text, "${paymentGateway}")]`
      ];

      let clicked = false;
      // Search with scrolls
      for (let i = 0; i < 5; i++) {
        const btn = await this.findAny(selectors, 3000);
        if (btn) {
          clicked = await this.safeClick(btn);
          if (clicked) break;
        }
        console.log('[PayUsingUpiPage] Provider not visible, scrolling...');
        await this.driver.execute('mobile: scrollGesture', {
          left: 100, top: 100, width: 800, height: 800,
          direction: 'down',
          percent: 1.0
        });
      }

      if (!clicked) {
        return { success: false, error: `Payment provider "${paymentGateway}" not found` };
      }

      await this.driver.pause(1000);

      // Click PROCEED TO PAY - Increased timeout
      const proceedBtn = '//*[contains(@text, "PROCEED TO PAY")]';
      if (!(await this.safeClick(proceedBtn, 15000))) {
        return { success: false, error: 'PROCEED TO PAY button not found after 15 seconds' };
      }

      await this.driver.pause(1000);
      return await this.enterUpiIdAndPay(upiId);

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async enterUpiIdAndPay(upiId) {
    try {
      if (!upiId) return { success: false, error: 'UPI ID is required' };

      console.log('[PayUsingUpiPage] Entering UPI ID...');

      // Find the input field
      const upiInputSelectors = [
        '//android.widget.EditText[@content-desc="edt_vpa"]',
        '//android.widget.EditText[contains(@hint, "UPI")]',
        '//android.widget.EditText'
      ];

      const input = await this.findAny(upiInputSelectors, 15000);
      if (!input) throw new Error('UPI input field not found after 15 seconds');

      await input.click();
      await input.clearValue();
      await input.setValue(upiId);

      // Click Verify and Pay
      const verifyPayBtn = '//*[contains(@text, "Verify and Pay")]';
      if (await this.safeClick(verifyPayBtn, 15000)) {
        console.log('[PayUsingUpiPage] Payment initiated successfully');
        return { success: true };
      }

      return { success: false, error: 'Verify and Pay button not found after 15 seconds' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = PayUsingUpiPage;