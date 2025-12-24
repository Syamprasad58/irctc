// lib/irctc-flows/rail-connect-page.js
const BasePage = require('./base-page');

class RailConnectPage extends BasePage {
  constructor(driver) {
    super(driver);
  }

  async clickTrainButton() {
    try {
      console.log('[RailConnectPage] Waiting for Train button...');

      const trainButtonSelectors = [
        '//android.widget.LinearLayout[@resource-id="cris.org.in.prs.ima:id/my_journey_ll"]/android.widget.ImageView',
        '//android.widget.ImageView[contains(@content-desc, "Train")]',
        '//android.widget.TextView[contains(@text, "Train")]',
        '//android.widget.LinearLayout[contains(@resource-id, "journey")]'
      ];

      const btn = await this.findAny(trainButtonSelectors, 10000);

      if (btn && await this.safeClick(btn)) {
        console.log('[RailConnectPage] Train button clicked successfully');
        await this.driver.pause(1500);
        return { success: true };
      }

      throw new Error('Train button not found or not clickable');

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async bookTicketButton() {
    try {
      console.log('[RailConnectPage] Waiting for Book Ticket button...');
      const bookticketButtonSelector = '//android.widget.ImageView[@content-desc="Book Ticket"]';

      if (await this.safeClick(bookticketButtonSelector, 10000)) {
        console.log('[RailConnectPage] Book Ticket button clicked');
        await this.driver.pause(1000);
        return { success: true };
      }

      throw new Error('Book Ticket button not found');
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = RailConnectPage;