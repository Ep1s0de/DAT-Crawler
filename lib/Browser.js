const moment = require('moment');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(require('puppeteer-extra-plugin-angular')());
puppeteer.use(StealthPlugin());

const Tab = require('./Tab');
const CPTab = require('./CPTab');

module.exports = class Browser {
  constructor({ sessions, mongo, cpBrowsers = []  }) {
    this.sessions = sessions;
    this.mongo = mongo;
    this.cpBrowsers = cpBrowsers;
    this.emailSessions = {};
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

  async initCpBrowsers(maxCpBrowsers) {
    for (let i = 0; i < maxCpBrowsers; i++) {
      const cpBrowser = new Browser({
        sessions: this.sessions,
        mongo: this.mongo,
      });
      await cpBrowser.init();
      cpBrowser.isBusy = false;
      this.cpBrowsers.push(cpBrowser);
      console.log(`Initialized cpBrowser ${i + 1} and added to pool`);
    }
  }

  getFreeBrowser() {
    console.log(`Looking for a free browser. Current pool size: ${this.cpBrowsers?.length || 0}`);
    if (!this.cpBrowsers || this.cpBrowsers.length === 0) {
      console.error('cpBrowsers is not initialized or is empty');
      return null;
    }
    const freeBrowser = this.cpBrowsers.find(browser => !browser.isBusy);
    if (freeBrowser) {
      console.log('Found a free browser');
    } else {
      console.log('No free browsers found');
    }
    return freeBrowser;
  }


  async runCPTab(sessionToken, account) {
    const email = account.email;

    console.log(`Received request for ${email} with sessionToken: ${sessionToken}`);

    if (this.emailSessions[email]) {
      const { browser, sessionToken: existingSessionToken } = this.emailSessions[email];
      const existingSession = this.sessions[existingSessionToken];

      console.log(`Found existing session for ${email}. Session token: ${existingSessionToken}`);

      if (existingSession) {
        if (existingSession.user.password === account.password) {
          console.log(`Ignoring request for ${email}, already in process with the same password.`);
          return;
        } else {
          console.log(`Password for ${email} has changed. Restarting process with new password.`);

          if (existingSession.getTab()) {
            try {
              await existingSession.getTab().close();
              console.log(`Closed the current tab for ${email}`);
            } catch (err) {
              console.error(`Error closing the tab for ${email}: ${err.message}`);
            }
          }

          existingSession.user.password = account.password;

          try {
            const page = await browser.window.newPage();
            const tab = new CPTab(
              page,
              existingSession,
              account,
              this.initCPTab.bind(this)
            );
            await tab.prepare();

            try {
              await tab.startCrawling();
            } catch (err) {
              if (err.name === 'TimeoutError') {
                console.error(`TimeoutError during crawling for ${email}: ${err.message}`);
                await page.close();
                console.log(`Closed the tab due to timeout for ${email}`);
              } else {
                throw err;
              }
            }
          } catch (err) {
            console.error(`Error in cpTab during process for ${email}:`, err);
          }
          return;
        }
      } else {
        console.error(`No session found for token: ${existingSessionToken}`);
        this.sessions[existingSessionToken] = {
          user: { email: account.email, password: account.password },
          getTab: () => null
        };
        console.log(`Created new session for ${email} with token: ${existingSessionToken}`);
      }
    }

    const freeBrowser = this.getFreeBrowser();

    if (!freeBrowser) {
      console.error('No available browsers for cpTab');
      console.log(`Current browser states: ${this.cpBrowsers.map(b => b.isBusy).join(', ')}`);
      throw new Error('No available browsers for cpTab');
    }

    this.emailSessions[email] = { browser: freeBrowser, sessionToken };

    console.log(`Binding email ${email} to sessionToken ${sessionToken}`);

    freeBrowser.isBusy = true;
    console.log(`Assigning cpTab task to browser ${this.cpBrowsers.indexOf(freeBrowser) + 1}`);

    try {
      const page = await freeBrowser.window.newPage();
      const tab = new CPTab(
        page,
        this.sessions[sessionToken],
        account,
        this.initCPTab.bind(this)
      );
      await tab.prepare();

      try {
        await tab.startCrawling();
      } catch (err) {
        if (err.name === 'TimeoutError') {
          console.error(`TimeoutError during crawling for ${email}: ${err.message}`);
          await page.close();
          console.log(`Closed the tab due to timeout for ${email}`);
        } else {
          throw err;
        }
      }

      console.log(`cpTab task completed by browser ${this.cpBrowsers.indexOf(freeBrowser) + 1}`);
    } catch (err) {
      console.error(`Error in cpTab browser ${this.cpBrowsers.indexOf(freeBrowser) + 1}:`, err);
    } finally {
      delete this.emailSessions[email];
      console.log(`Reloading cpTab browser ${this.cpBrowsers.indexOf(freeBrowser) + 1}`);
      await this.reloadBrowser(freeBrowser);
      freeBrowser.isBusy = false;
      console.log(`cpTab browser ${this.cpBrowsers.indexOf(freeBrowser) + 1} is now free`);
    }
  }

  async initCPTab(sessionToken, account) {
    if (this.sessions[sessionToken]?.tab) {
      return;
    }

    const page = await this.window?.newPage();

    if (!page) {
      throw new Error('PAGE_CREATION_FAILED');
    }

    const tab = new CPTab(
      page,
      this.sessions[sessionToken],
      account,
      this.initCPTab.bind(this)
    );

    await tab.prepare();

    this.sessions[sessionToken]?.setTab(tab);

    return tab;
  }

  async reloadBrowser(browser) {
    try {
      await browser.window.close();
      await browser.init();
    } catch (err) {
      console.error('Failed to reload browser:', err);
    }
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
