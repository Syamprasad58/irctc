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
      console.log('[ReviewJourneyPage] Waiting for page to load...');

      // Step 0: Robust wait for the Review Journey page indicator
      // Usually, there's a "Review Journey" title or a specific journey detail view
      const pageIndicator = [
        '//*[contains(@text, "Review Journey")]',
        '//*[contains(@text, "Journey Details")]',
        '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_passenger_list_label"]'
      ];

      const loaded = await this.findAny(pageIndicator, 20000);
      if (!loaded) {
        console.warn('[ReviewJourneyPage] Page title not found after 20s, checking for captcha directly...');
      } else {
        console.log('[ReviewJourneyPage] Page loaded successfully.');
      }

      console.log('[ReviewJourneyPage] Preparing to solve captcha...');

      // Step 1: Robust native scroll to reach the captcha at the bottom
      await this.scrollToBottom();

      const captchaImg = '//android.widget.ImageView[@resource-id="cris.org.in.prs.ima:id/captcha"]';
      const captchaInputSelector = '//android.widget.EditText[@resource-id="cris.org.in.prs.ima:id/captcha_input"]';
      const proceedBtn = '//android.widget.TextView[@content-desc="Proceed to Pay"]';

      let firstAttempt = true;

      while (true) {
        // Double check captcha visibility after scroll
        const captchaEl = await this.waitForElement(captchaImg, 5000);
        if (!captchaEl) {
          console.log('[ReviewJourneyPage] Captcha not visible after scroll, retrying scroll...');
          await this.scrollToBottom();
        }

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
            continue;
          }
        } else {
          console.log('[ReviewJourneyPage] WAITING 15 SECONDS FOR USER TO TYPE CAPTCHA MANUALLY...');
          const input = await this.waitForElement(captchaInputSelector);
          if (input) await input.clearValue();
          await this.driver.pause(15000);
          const userTyped = await (await this.driver.$(captchaInputSelector)).getText();
          console.log(`[ReviewJourneyPage] Resumed. User input: "${userTyped}"`);
        }

        await this.safeClick(proceedBtn);
        await this.driver.pause(2000);

        // Check for "Invalid Captcha"
        if (await this.checkIfInvalidCaptcha()) {
          console.log('[ReviewJourneyPage] INVALID CAPTCHA ERROR.');
          firstAttempt = false;
          await this.safeClick('//android.widget.Button[@resource-id="android:id/button1"]', 3000);
          continue;
        }

        // Handle Confirm/Warning dialog
        const okBtn = '//android.widget.Button[@resource-id="android:id/button1"]';
        if (await this.safeClick(okBtn, 5000)) {
          console.log('[ReviewJourneyPage] Payment disclaimer dismissed.');
        }

        await this.driver.pause(2000);
        if (!(await this.driver.$(proceedBtn).isExisting())) {
          console.log('[ReviewJourneyPage] Successfully proceeded.');
          return { success: true };
        }

        console.log('[ReviewJourneyPage] Still on page. Captcha might have failed without alert. Retrying...');
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
        return text.includes('captcha');
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}

module.exports = ReviewJourneyPage;