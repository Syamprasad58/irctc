// lib/irctc-flows/generate-pin-page.js
const BasePage = require('./base-page');

class GeneratePinPage extends BasePage {
  constructor(driver) {
    super(driver);
  }

  async setupPin(pin) {
    try {
      console.log('[GeneratePinPage] Checking for PIN entry page...');

      const pinField = await this.waitForElement('//android.widget.EditText[@resource-id="cris.org.in.prs.ima:id/et_pin"]', 10000);
      if (!pinField) {
        console.log('[GeneratePinPage] PIN page not visible, skipping setup.');
        return { success: true };
      }

      console.log('[GeneratePinPage] Setting PIN values...');
      await pinField.setValue(pin);

      const confirmPinField = await this.driver.$('//android.widget.EditText[@resource-id="cris.org.in.prs.ima:id/et_re_enter_pin"]');
      if (await confirmPinField.isExisting()) {
        await confirmPinField.setValue(pin);
      }

      await this.safeClick('//android.widget.TextView[@text="SUBMIT"]');

      // Handle the success dialog
      await this.safeClick('//android.widget.Button[@resource-id="android:id/button1"]', 5000);

      console.log('[GeneratePinPage] PIN setup completed.');
      return { success: true };

    } catch (error) {
      console.error('[GeneratePinPage] PIN setup failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = GeneratePinPage;