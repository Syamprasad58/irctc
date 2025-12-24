// lib/irctc-flows/passenger-details-page.js
const BasePage = require('./base-page');

class PassengerDetailsPage extends BasePage {
  constructor(driver) {
    super(driver);
  }

  async clickAddNewPassenger() {
    console.log('[PassengerDetailsPage] Looking for Add New Passenger button...');
    const selector = '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_add_psgn_detail"]';

    if (await this.safeClick(selector, 15000)) {
      console.log('[PassengerDetailsPage] Clicked Add New Passenger');
      await this.driver.pause(1000);
      return { success: true };
    }
    return { success: false, error: 'Add New Passenger button not found' };
  }

  async fillPassengerDetails(passenger) {
    try {
      console.log(`[PassengerDetailsPage] Filling details for ${passenger.name}`);

      const nameField = await this.waitForElement('//android.widget.EditText[@resource-id="cris.org.in.prs.ima:id/passenger_name"]', 10000);
      if (!nameField) throw new Error('Name field not found');
      await nameField.setValue(passenger.name || '');

      const ageField = await this.driver.$('//android.widget.EditText[@resource-id="cris.org.in.prs.ima:id/passenger_age"]');
      if (await ageField.isExisting()) {
        await ageField.setValue((passenger.age || '').toString());
      }

      // Gender selection
      if (passenger.gender) {
        let genderId = 'cris.org.in.prs.ima:id/tv_male';
        const g = passenger.gender.toUpperCase();
        if (g === 'FEMALE' || g === 'F') genderId = 'cris.org.in.prs.ima:id/tv_female';
        else if (g === 'TRANSGENDER' || g === 'T') genderId = 'cris.org.in.prs.ima:id/tv_transgender';

        await this.safeClick(`//android.widget.RadioButton[@resource-id="${genderId}"]`);
      }

      // Done button
      const doneBtn = '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_done_psgn_detail"]';
      await this.safeClick(doneBtn);

      await this.driver.pause(500);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async addAllPassengers(passengers) {
    console.log(`[PassengerDetailsPage] Adding ${passengers.length} passengers...`);
    for (const p of passengers) {
      const res1 = await this.clickAddNewPassenger();
      if (!res1.success) return res1;

      const res2 = await this.fillPassengerDetails(p);
      if (!res2.success) return res2;
    }
    return { success: true };
  }

  async scrollToBottomAndHandleOptions(ticketData) {
    try {
      console.log('[PassengerDetailsPage] Scrolling to bottom for payment options...');

      // Use the new robust scroll from base page
      await this.scrollToBottom();

      // Handle auto-upgrade
      if (ticketData.consider_auto_upgrade) {
        const checkbox = '//android.widget.CheckBox[@resource-id="cris.org.in.prs.ima:id/auto_upgradation"]';
        // We might need an extra little scroll if it's not quite visible
        await this.safeClick(checkbox, 5000);
      }

      // SELECT PAYMENT METHOD
      console.log('[PassengerDetailsPage] Selecting payment method...');
      const paymentResult = await this.selectPaymentMethod(ticketData);
      if (!paymentResult.success) return paymentResult;

      // Click Review Journey
      console.log('[PassengerDetailsPage] Clicking Review Journey Details...');
      const reviewBtn = '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/journey_detail"]';
      if (await this.safeClick(reviewBtn, 15000)) {
        await this.driver.pause(2000);
        return { success: true };
      }

      return { success: false, error: 'Review Journey button not found' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async selectPaymentMethod(ticketData) {
    let modeText = "Pay through BHIM/UPI"; // Default
    if (ticketData.payment_type !== 'bank') {
      modeText = "Pay through Credit & Debit Cards / Net Banking / Wallets / EMI / UPI_CC / UPI_CL / Rewards and Others";
    }

    console.log(`[PassengerDetailsPage] Choosing: ${modeText}`);
    // Simplified selector using resource-id and partial text
    const selector = `//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_payment_option" and contains(@text, "${modeText.substring(0, 15)}")]`;

    // If not found, try one more manual swipe just in case
    if (!(await this.safeClick(selector, 5000))) {
      console.log('[PassengerDetailsPage] Payment method not found, trying one more swipe...');
      await this.manualSwipeUp(1);
      if (await this.safeClick(selector, 10000)) return { success: true };
    } else {
      return { success: true };
    }

    return { success: false, error: `Payment method "${modeText}" not found after scrolling` };
  }
}

module.exports = PassengerDetailsPage;