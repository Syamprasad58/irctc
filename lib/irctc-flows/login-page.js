const CaptchaSolver = require('../captcha-solver');
const Locators = require('../locators');
const BasePage = require('./base-page');

class LoginPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.captchaSolver = new CaptchaSolver(driver);
  }

  /**
   * Flows
   */

  async clickOkButton() {
    try {
      console.log('[LoginPage] Checking for OK/Alert button...');
      const btn = await this.driver.$(Locators.COMMON.BUTTON_1);
      if (await this.safeClick(btn, 3000)) {
        console.log('[LoginPage] Initial OK alert dismissed');
        await this.driver.pause(1000);
        return { success: true };
      }
      return { success: false, error: 'OK button not found' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async clickTopLoginButton() {
    try {
      console.log('[LoginPage] Starting Top Login button flow...');
      await this.clickOkButton();

      console.log('[LoginPage] Looking for LOGIN button...');
      let clicked = await this.safeClick(Locators.LOGIN_PAGE.TOP_LOGIN_BUTTON_ID, 10000);

      if (!clicked) {
        console.log('[LoginPage] Resource ID button not found, trying Text selector...');
        clicked = await this.safeClick(Locators.LOGIN_PAGE.TOP_LOGIN_BUTTON_TEXT, 5000);
      }

      if (clicked) {
        console.log('[LoginPage] Top Login button clicked successfully');
        await this.driver.pause(2000);
        return { success: true };
      }

      return { success: false, error: 'Top Login button not found' };
    } catch (e) {
      return { success: false, error: `Top Login button error: ${e.message}` };
    }
  }

  async loginWithCaptcha(username, password, captchaImageSelector = null, useAutoCaptcha = true) {
    try {
      // Enter username/password once
      const credentialsResult = await this.enterCredentials(username, password);
      if (!credentialsResult.success) return credentialsResult;

      let firstAttempt = true;

      while (true) {
        if (firstAttempt && useAutoCaptcha) {
          console.log('[LoginPage] Attempting automatic captcha solve...');
          await this.solveCaptchaAutomatically(captchaImageSelector);
        } else {
          // Manual intervention
          console.log('[LoginPage] WAITING 15 SECONDS FOR USER TO TYPE CAPTCHA MANUALLY...');
          console.log('[LoginPage] Please enter the captcha shown on the screen.');

          // Clear current value first to give user a clean slate
          const captchaField = await this.driver.$(Locators.LOGIN_PAGE.CAPTCHA_INPUT_ID);
          await captchaField.clearValue();

          // Wait 15 seconds as requested
          await this.driver.pause(15000);

          const userTyped = await captchaField.getText();
          console.log(`[LoginPage] Resuming after 15s. User input detected: "${userTyped}"`);
        }

        // Try to login
        const loginBtn = await this.driver.$(Locators.LOGIN_PAGE.LOGIN_SUBMIT_BUTTON);
        await this.safeClick(loginBtn, 5000);
        console.log('[LoginPage] Login button clicked, verifying result...');

        await this.driver.pause(2000);

        // Check for "Invalid Captcha" error specifically
        const isInvalidCaptcha = await this.checkIfInvalidCaptcha();

        if (isInvalidCaptcha) {
          console.log('[LoginPage] INVALID CAPTCHA ERROR DETECTED.');
          firstAttempt = false; // Force manual next time

          // Click OK on error dialog if present
          await this.clickOkButton();
          continue; // Loop try again
        }

        // Check for success or other errors
        const errorMsg = await this.findAny(Locators.LOGIN_PAGE.ERROR_MESSAGES, 2000);
        if (errorMsg) {
          const text = await errorMsg.getText();
          console.log('[LoginPage] Fatal Error detected:', text);
          return { success: false, error: `Login failed: ${text}` };
        }

        // If no error message and we left the login page, it's a success
        const stillOnLoginPage = await this.driver.$(Locators.LOGIN_PAGE.LOGIN_SUBMIT_BUTTON).isExisting();
        if (!stillOnLoginPage) {
          console.log('[LoginPage] Login successful.');
          return { success: true, message: 'Login successful' };
        }

        // If still on login page but no error shows up, maybe just slow. Wait a bit more.
        await this.driver.pause(2000);
        if (!(await this.driver.$(Locators.LOGIN_PAGE.LOGIN_SUBMIT_BUTTON).isExisting())) {
          return { success: true, message: 'Login successful (after delay)' };
        }

        console.log('[LoginPage] Still on login page with no error. Retrying captcha just in case...');
        firstAttempt = false;
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkIfInvalidCaptcha() {
    try {
      // Find all text views that might contain error messages
      const errorMsg = await this.findAny(Locators.LOGIN_PAGE.ERROR_MESSAGES, 1000);
      if (errorMsg) {
        const text = (await errorMsg.getText()).toLowerCase();
        if (text.includes('captcha') && (text.includes('invalid') || text.includes('wrong') || text.includes('incorrect'))) {
          return true;
        }
      }

      // Also check standard alert message
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

  async enterCredentials(username, password) {
    try {
      let usernameField = await this.waitForElement(Locators.LOGIN_PAGE.USERNAME_FIELD_ID, 10000);
      if (!usernameField) {
        usernameField = await this.findAny(Locators.LOGIN_PAGE.USERNAME_FIELD_FALLBACKS, 5000);
      }
      if (!usernameField) throw new Error('Username field not found');

      await usernameField.click();
      await usernameField.clearValue();
      await usernameField.setValue(username);

      let passwordField = await this.findAny(Locators.LOGIN_PAGE.PASSWORD_FIELD_FALLBACKS, 5000);
      if (!passwordField) throw new Error('Password field not found');

      await passwordField.click();
      await passwordField.clearValue();
      await passwordField.setValue(password);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async solveCaptchaAutomatically(captchaImageSelector) {
    try {
      const selector = captchaImageSelector || Locators.LOGIN_PAGE.CAPTCHA_IMAGE_ID;
      const result = await this.captchaSolver.solveCaptcha(selector);

      if (result.success) {
        const captchaField = await this.driver.$(Locators.LOGIN_PAGE.CAPTCHA_INPUT_ID);
        await captchaField.setValue(result.text);
        console.log('[LoginPage] OCR solved it as:', result.text);
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }
}

module.exports = LoginPage;