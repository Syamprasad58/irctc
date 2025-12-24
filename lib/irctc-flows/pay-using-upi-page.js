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
      for (let i = 0; i < 6; i++) {
        const btn = await this.findAny(selectors, 3000);
        if (btn) {
          console.log(`[PayUsingUpiPage] Found ${paymentGateway}, attempting click...`);

          // Try to click the element or its parent. 
          // For radio button lists, sometimes we need to click the radio button specifically
          // or the layout containing it.
          clicked = await this.safeClick(btn, 5000);

          if (!clicked) {
            console.log('[PayUsingUpiPage] Direct click failed, trying to click parent container...');
            try {
              const parent = await btn.$('..');
              await parent.click();
              clicked = true;
            } catch (e) {
              console.warn(`[PayUsingUpiPage] Parent click failed: ${e.message}`);
            }
          }

          if (clicked) {
            // Verify if selection worked (some apps change state/color or show a checkmark)
            await this.driver.pause(1000);
            break;
          }
        }

        console.log(`[PayUsingUpiPage] Provider ${paymentGateway} not found in current view (attempt ${i + 1}), scrolling...`);

        try {
          // Alternative scroll strategy: scroll down a bit manually
          await this.manualSwipeUp(1);
          await this.driver.pause(1000);
        } catch (e) {
          console.warn('[PayUsingUpiPage] Scroll failed');
        }
      }

      if (!clicked) {
        // One last attempt: search for ANY element containing the text and click it
        console.log(`[PayUsingUpiPage] Performing last ditch search for "${paymentGateway}"`);
        const lastDitch = await this.driver.$(`//*[contains(@text, "${paymentGateway}")]`);
        if (await lastDitch.isExisting()) {
          clicked = await this.safeClick(lastDitch, 5000);
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

      // Increased timeout to 30 seconds for slow payment gateway loading
      const timeout = 30000;
      const startTime = Date.now();

      let input = null;
      const upiInputSelectors = [
        '//android.widget.EditText[@resource-id="cris.org.in.prs.ima:id/edt_vpa"]',
        '//android.widget.EditText[@content-desc="edt_vpa"]',
        '//android.widget.EditText[contains(@resource-id, "vpa")]',
        '//android.widget.EditText[contains(@text, "VPA")]',
        '//android.widget.EditText[contains(@hint, "UPI")]',
        '//android.widget.EditText[contains(@hint, "VPA")]',
        '//android.widget.EditText[contains(@text, "upi")]',
        '//android.widget.EditText[contains(@text, "@")]',
        '//android.widget.EditText'
      ];

      console.log('[PayUsingUpiPage] Waiting for UPI input field...');

      while (Date.now() - startTime < timeout) {
        // Check for tabs like "UPI ID" or "VPA" that might need to be clicked first
        const upiTabs = [
          '//android.widget.TextView[contains(@text, "UPI ID")]',
          '//android.widget.TextView[contains(@text, "VPA")]',
          '//*[contains(@text, "Phone Number / UPI ID")]'
        ];

        for (const tab of upiTabs) {
          try {
            const tabEl = await this.driver.$(tab);
            if (await tabEl.isExisting() && await tabEl.isDisplayed()) {
              console.log(`[PayUsingUpiPage] Found tab: ${tab}, clicking to reveal input...`);
              await tabEl.click();
              await this.driver.pause(1000);
            }
          } catch (e) { }
        }

        input = await this.findAny(upiInputSelectors, 2000);
        if (input) break;

        // Check if we are in a WebView
        try {
          const contexts = await this.driver.getContexts();
          if (contexts.length > 1) {
            console.log('[PayUsingUpiPage] WebView detected, trying to switch context...');
            const webView = contexts.find(c => c.includes('WEBVIEW'));
            if (webView) {
              await this.driver.switchContext(webView);
              // Try to find html inputs
              const htmlInput = await this.driver.$('input[type="text"], input[name*="vpa"], input[id*="vpa"]');
              if (await htmlInput.isExisting()) {
                console.log('[PayUsingUpiPage] Found UPI input in WebView');
                await htmlInput.setValue(upiId);
                // Try to find and click submit in WebView
                const submit = await this.driver.$('button[type="submit"], input[type="submit"], button.pay, .pay-btn');
                if (await submit.isExisting()) {
                  await submit.click();
                  await this.driver.switchContext('NATIVE_APP');
                  return { success: true };
                }
              }
              await this.driver.switchContext('NATIVE_APP');
            }
          }
        } catch (e) {
          console.warn('[PayUsingUpiPage] Context check failed:', e.message);
        }

        // Check for any "Processing" or "Please wait" text that might be blocking
        const loading = await this.driver.$('//*[contains(@text, "Processing") or contains(@text, "Please wait")]');
        if (await loading.isExisting()) {
          console.log('[PayUsingUpiPage] Still processing...');
        }

        await this.driver.pause(2000);
      }

      if (!input) {
        // Final check: Capture page source for debugging (logged to console)
        // const source = await this.driver.getPageSource();
        // console.log('[PayUsingUpiPage] Page source on failure:', source.substring(0, 1000));
        throw new Error('UPI input field not found after 30 seconds. The page might have failed to load or is an unsupported payment gateway UI.');
      }

      await input.click();
      await this.driver.pause(500);

      try {
        await input.clearValue();
      } catch (e) {
        // Some Android versions/fields don't support clearValue well
      }

      await input.setValue(upiId);

      if (await this.driver.isKeyboardShown()) {
        try {
          await this.driver.hideKeyboard();
          await this.driver.pause(500);
        } catch (e) { }
      }

      const verifyPayBtnSelectors = [
        '//*[contains(@text, "Verify and Pay")]',
        '//*[contains(@text, "VERIFY & PAY")]',
        '//*[contains(@text, "Verify & Pay")]',
        '//*[contains(@text, "PAY")]',
        '//*[contains(@text, "Pay")]',
        '//*[contains(@text, "PAY NOW")]',
        '//*[contains(@text, "Submit")]',
        '//*[@resource-id="cris.org.in.prs.ima:id/btn_verify_pay"]'
      ];

      console.log('[PayUsingUpiPage] Looking for Verify/Pay button...');
      const verifyPayBtn = await this.findAny(verifyPayBtnSelectors, 10000);
      if (verifyPayBtn) {
        const clicked = await this.safeClick(verifyPayBtn, 10000);
        if (clicked) {
          console.log('[PayUsingUpiPage] Verify/Pay button clicked');
          await this.driver.pause(3000);

          // One more check for a final "PAY" button that sometimes appears after verification
          const finalPay = await this.findAny([
            '//android.widget.Button[contains(@text, "PAY")]',
            '//android.widget.TextView[contains(@text, "PAY")]',
            '//*[contains(@text, "Proceed to Pay")]'
          ], 5000);
          if (finalPay) await this.safeClick(finalPay, 5000);

          return { success: true };
        }
      }

      return { success: false, error: 'Verify and Pay button not found or not clickable' };
    } catch (error) {
      console.error(`[PayUsingUpiPage] enterUpiIdAndPay failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = PayUsingUpiPage;
