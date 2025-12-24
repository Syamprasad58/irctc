// lib/irctc-flows/train-search-page.js
const BasePage = require('./base-page');

class TrainSearchPage extends BasePage {
  constructor(driver) {
    super(driver);
  }

  async serachTrain(fromStation, toStation, dateOfJourney) {
    try {
      console.log('[TrainSearchPage] Starting train search process...');

      // 1. From Station
      console.log(`[TrainSearchPage] Selecting From station: ${fromStation}`);
      const fromStnField = '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/fromStn_code"]';
      await this.safeClick(fromStnField);

      const searchInputField = '//android.widget.EditText[@content-desc="Enter your city/station field"]';
      const input = await this.waitForElement(searchInputField);
      await input.setValue(fromStation);

      const fromSuggestion = `//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_station_code" and @text="${fromStation}"]`;
      await this.safeClick(fromSuggestion);

      // 2. To Station
      console.log(`[TrainSearchPage] Selecting To station: ${toStation}`);
      const toStnField = '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/toStn_code"]';
      await this.safeClick(toStnField);

      const input2 = await this.waitForElement(searchInputField);
      await input2.setValue(toStation);

      const toSuggestion = `//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_station_code" and @text="${toStation}"]`;
      await this.safeClick(toSuggestion);

      // 3. Date Selection
      await this.selectDate(dateOfJourney);

      // 4. Submit Search
      return await this.clickSearchTrains();

    } catch (error) {
      console.error('[TrainSearchPage] Search failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async selectDate(dateOfJourney) {
    console.log(`[TrainSearchPage] Selecting journey date: ${dateOfJourney}`);
    const calendarBtn = '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/journey_date_label"]';
    await this.safeClick(calendarBtn);

    const formattedDate = this.formatDateForCalendar(dateOfJourney);
    const dateSelector = `//android.view.View[@content-desc="${formattedDate}"]`;
    await this.safeClick(dateSelector);

    const okBtn = '//android.widget.Button[@resource-id="android:id/button1"]';
    await this.safeClick(okBtn);

    return { success: true };
  }

  async clickSearchTrains() {
    console.log('[TrainSearchPage] Clicking Search Trains...');
    const searchBtn = '//android.widget.TextView[@resource-id="cris.org.in.prs.ima:id/tv_search"]';

    if (await this.safeClick(searchBtn)) {
      await this.driver.pause(2000); // Wait for results to load
      return { success: true, message: 'Search submitted' };
    }

    return { success: false, error: 'Search button click failed' };
  }

  formatDateForCalendar(dateString) {
    const date = new Date(dateString);
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
}

module.exports = TrainSearchPage;