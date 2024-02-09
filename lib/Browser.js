const moment = require('moment');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(require('puppeteer-extra-plugin-angular')());
puppeteer.use(StealthPlugin());

const Tab = require('./Tab');

module.exports = class Browser {
  constructor({ sessions, mongo }) {
    this.sessions = sessions;
    this.mongo = mongo;
  }

  async init() {
    this.window = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      // executablePath: '/snap/bin/chromium'
    });

    this.window.once('disconnected', () => {
      this.window = null;
      console.error(
        "[Browser has closed or crashed and we've been disconnected!] \n"
      );
    });
  }

  async killTab(sessionToken) {
    await this.sessions[sessionToken]?.closeTab();
  }

  async initCrawler(sessionToken, filter, headers) {
    if (this.sessions[sessionToken]?.tab) {
      return;
    }

    const page = await this.window?.newPage();

    if (!page) {
      throw new Error('PAGE_CREATION_FAILED');
    }

    const tab = new Tab(
      page,
      this.sessions[sessionToken],
      headers,
      this.initCrawler.bind(this)
    );

    await tab.prepare();

    this.sessions[sessionToken]?.setLastFilter(filter);
    this.sessions[sessionToken]?.setTab(tab);

    return tab;
  }

  async initHistory(sessionToken) {
    if (
      this.sessions[sessionToken]?.user?._id === null ||
      this.sessions[sessionToken]?.user?._id === undefined
    ) {
      return;
    }

    const orders = await this.mongo
      .collection('orders')
      .find({
        user_id: this.sessions[sessionToken]?.user._id,
        date_created: {
          $gte: moment().add(-3, 'hour').toDate()
        }
      })
      .toArray();

    return this.sessions[sessionToken]?.emitToSockets('initialLoadData', {
      message: JSON.stringify(orders)
    });
  }

  async saveResultsAndNotify(filteredRowsData, sessionToken) {
  }
};
