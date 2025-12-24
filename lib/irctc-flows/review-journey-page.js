// lib/irctc-flows/review-journey-page.js
const CaptchaSolver = require('../captcha-solver');
const BasePage = require('./base-page');
const Locators = require('../locators');

class ReviewJourneyPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.captchaSolver = new CaptchaSolver(driver);
  }

  async solveCaptchaAndProceed() {
    try {
      console.log('[ReviewJourneyPage] Preparing to solve captcha...');
      await this.scrollDownToCaptcha();

      const captchaImg = '//android.widget.ImageView[@resource-id="cris.org.in.prs.ima:id/captcha"]';
      const captchaInputSelector = '//android.widget.EditText[@resource-id="cris.org.in.prs.ima:id/captcha_input"]';
      const proceedBtn = '//android.widget.TextView[@content-desc="Proceed to Pay"]';

      let firstAttempt = true;

      while (true) {
        if (firstAttempt) {
          console.log('[ReviewJourneyPage] Attempting automatic captcha solve...');
          const result = await this.captchaSolver.solveCaptcha(captchaImg);
          if (result.success) {
            console.log(`[ReviewJourneyPage] OCR solved as: ${result.text}`);
            const input = await this.waitForElement(captchaInputSelector);
            if (input) await input.setValue(result.text);
          } else {
            console.log('[ReviewJourneyPage] OCR failed, will require manual input.');
            firstAttempt = false;
            continue; // Trigger manual branch
          }
        } else {
          console.log('[ReviewJourneyPage] WAITING 15 SECONDS FOR USER TO TYPE CAPTCHA MANUALLY...');
          console.log('[ReviewJourneyPage] Please enter the captcha shown at the bottom of the screen.');

          const input = await this.waitForElement(captchaInputSelector);
          if (input) await input.clearValue();

          await this.driver.pause(15000);

          const userTyped = await (await this.driver.$(captchaInputSelector)).getText();
          console.log(`[ReviewJourneyPage] Resuming after 15s. User input: "${userTyped}"`);
        }

        // Click Proceed
        await this.safeClick(proceedBtn);
        console.log('[ReviewJourneyPage] Proceed button clicked. Verifying...');

        await this.driver.pause(2000);

        // Check for "Invalid Captcha"
        const isInvalid = await this.checkIfInvalidCaptcha();
        if (isInvalid) {
          console.log('[ReviewJourneyPage] INVALID CAPTCHA ERROR DETECTED.');
          firstAttempt = false;

          // Dismiss error alert
          await this.safeClick('//android.widget.Button[@resource-id="android:id/button1"]', 3000);
          continue;
        }

        // Check for "Proceed to Pay" confirmation alert (Standard OK button)
        const okBtn = '//android.widget.Button[@resource-id="android:id/button1"]';
        if (await this.safeClick(okBtn, 3000)) {
          console.log('[ReviewJourneyPage] Warning/Payment alert dismissed.');
        }

        // If we are still on this page and captcha field is visible, it might have failed without a clear error
        // Or if Proceed button is still there.
        await this.driver.pause(2000);
        const stillOnPage = await this.driver.$(proceedBtn).isExisting();
        if (!stillOnPage) {
          console.log('[ReviewJourneyPage] Successfully proceeded to payment.');
          return { success: true };
        }

        console.log('[ReviewJourneyPage] Still on review page. Retrying...');
        firstAttempt = false;
      }
    } catch (error) {
      console.error(`[ReviewJourneyPage] Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async checkIfInvalidCaptcha() {
    try {
      const alertMsg = await this.driver.$(Locators.COMMON.MESSAGE);
      if (await alertMsg.isExisting()) {
        const text = (await alertMsg.getText()).toLowerCase();
        if (text.includes('captcha')) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async scrollDownToCaptcha() {
    console.log('[ReviewJourneyPage] Scrolling down...');
    for (let i = 0; i < 3; i++) {
      await this.driver.execute('mobile: scrollGesture', {
        left: 100, top: 100, width: 800, height: 800,
        direction: 'down',
        percent: 1.0
      });
      await this.driver.pause(500);
    }
  }
}

module.exports = ReviewJourneyPage;