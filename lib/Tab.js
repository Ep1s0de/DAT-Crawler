const moment = require('moment');
const crypto = require('crypto');

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

module.exports = class Tab {
  constructor(page, session, headers, restartTab) {
    this.page = page;
    this.session = session;
    this.restartTab = restartTab;
    this.headers = headers;
  }

  async prepare() {
    await this.page.setRequestInterception(true);

    await this.page.setViewport({ width: 1680, height: 1050 });

    this.page.setDefaultNavigationTimeout(10000);

    await this.page.setUserAgent(this.headers['user-agent']);

    this.page.on('pageerror', err => {
      // console.error(`Page error emitted: "${err.message}"`);
    });

    this.page.on('response', res => {
      if (!res.ok() && res.status() > 400) {
        console.error(
          `Non-200 response from this request: [${res.status()}] "${res.url()}"`
        );
      }
    });

    this.page.on("response", async response => {
      const req = await response.request();


      if (req.url().startsWith("https://freight.api.dat.com/one-web-bff/graphql")) {

        let text;
        let data;
        if(response){
          try{
            text = await response.text();
          }
          catch (e){
          }

        }

        if(text){
          try{
            data = JSON.parse(text);
          }
          catch (e){
          }
        }
        if(data?.data?.getAssetMatches?.body?.matches){
          let rowData = [];
          let loads = data.data.getAssetMatches.body.matches;
          console.log(loads.length)

          for (const load of loads) {
            rowData.push({
              order_id: load.matchId,
              availability: load.availability,
              truck_types: load.matchingAssetInfo.equipmentType,
              origin: load.matchingAssetInfo.origin,
              trip: load.tripLength.miles,
              destination: load.matchingAssetInfo.destination,
              company: load.posterInfo.companyName,
              contact: load.posterInfo.contact,
              capacity: load.matchingAssetInfo.capacity,
              rate: load.loadBoardRateInfo,
              posterInfo: load.posterInfo,
              comments: load.comments,
            })
          }
          let newOrders = await this.saveUnprocessedRow(rowData)

          this.session?.emitToSockets('loadData', {
            message: JSON.stringify(newOrders)
          });
        }
        if(data?.data?.getAssetMatches?.body?.matches){
          let rowData = [];
          let loads = data.data.getAssetMatches.body.matches;

          for (const load of loads) {
            rowData.push({
              order_id: load.matchId,
              availability: load.availability,
              truck_types: load.matchingAssetInfo.equipmentType,
              origin: load.matchingAssetInfo.origin,
              trip: load.tripLength.miles,
              destination: load.matchingAssetInfo.destination,
              company: load.posterInfo.companyName,
              contact: load.posterInfo.contact,
              capacity: load.matchingAssetInfo.capacity,
              rate: load.loadBoardRateInfo,
              posterInfo: load.posterInfo,
              comments: load.comments,
            })
          }

          let newOrders = await this.saveUnprocessedRow(rowData)
          this.session?.emitToSockets('loadData', {
            message: JSON.stringify(newOrders)
          });

        }

      }
      if (req.url().startsWith("https://freight.api.prod.dat.com/notification/v3/")){
        let cdp = await this.page.target().createCDPSession();
        await cdp.send('Network.enable');
        await cdp.send('Page.enable');
        cdp.on('Network.eventSourceMessageReceived', ({ requestId, timestamp, eventName, eventId, data }) => console.log(requestId, timestamp, eventName, eventId, data));

      }
    });

    this.page.on('request', request => {
      const resources = ['image', 'font'];
      if (resources.includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    this.page.on('console', async msg => {
      const msgArgs = msg.args();
      try {
        for (let i = 0; i < msgArgs.length; ++i) {
          console.log(await msgArgs[i].jsonValue());
        }
      }
      catch (e) {
        console.log(e)
      }

    });
  }


  // order_id: load.matchId,
  // availability: load.availability,
  // truck_types: load.matchingAssetInfo.equipmentType,
  // origin: load.matchingAssetInfo.origin,
  // trip: load.tripLength.miles,
  // destination: load.matchingAssetInfo.destination,
  // company: load.posterInfo.companyName,
  // contact: load.posterInfo.contact,
  // capacity: load.matchingAssetInfo.capacity,
  // rate: load.loadBoardRateInfo,
  // posterInfo: load.posterInfo,
  // comments: load.comments,

  async login() {
    try{
      await this.page.goto(process.env.DAT_LOGIN_URL, {
        waitUntil: 'domcontentloaded'
      });


      await delay(3000);

      await this.page.waitForSelector(`a[href^="${process.env.DAT_ONE_URL}"]`);

      await this.page.$eval(`a[href^="${process.env.DAT_ONE_URL}"]`, anchor => {
        anchor.removeAttribute('target');
      });

      await this.page.click(`a[href^="${process.env.DAT_ONE_URL}"]`);


      await Promise.race([
        this.page.waitForSelector('input[name="username"]'),
        this.page.waitForSelector('a.search')
      ]);

      await delay(3000)

      const isLoggedIn = await this.page.evaluate(() => {
        return !!document.querySelector('a.search');
      });

      if (!isLoggedIn) {
        await this.page.waitForFunction(
          () =>
            document.querySelectorAll(
              'input[name="username"]',
              'input[name="password"',
              'button[type="submit"]'
            ).length
        );

        await this.page.type('input[name="username"]', process.env.DAT_USERNAME);
        await this.page.type('input[name="password"]', process.env.DAT_PASSWORD);

        await Promise.all([
          this.page.click('button[type="submit"]'),
          this.page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
      }
    }
    catch (e) {
      await this.page.goto(process.env.DAT_ONE_LOADS_URL)
      await delay(3000)
    }
  }

  async navigateToLoadPage() {

    await this.page.goto(process.env.DAT_ONE_LOADS_URL, {
      waitUntil: 'domcontentloaded'
    });
    await delay(2000);
    await this.page.screenshot({path: 'navigate-to-load-page.png'});
  }

  async setFilters() {

    const filter = this.session?.getLastFilter();

    await this.page.waitUntilAngularReady();

    try {
      await delay(500);
      await this.page.screenshot({path: 'before-Remove-Iframe.png'});
      await this.removeIframe();
    }
    catch (e){
      console.log(e)
      console.log('Nothing to remove')
    }


    console.log('wait for search input')

    await this.page.waitForXPath('//*[@id="mat-tab-content-0-0"]/div/dat-search-tab/div/dat-search-form/form')


    if (filter.truck_types && filter.truck_types.length) {
      let truckTypeInputActivate = await this.page.$x('//*[@id="equip-automation"]/form/div/mat-form-field/div/div[1]/div[3]/div')
      await truckTypeInputActivate[0].click()
      for (const el of filter.truck_types) {
        console.log(el)
        if(el.length === 1){
          await this.page.keyboard.press(el);
          await this.page.keyboard.press('Enter');
          await delay(150)
        }
        if (el.length > 1){
          console.log('===============================+++++++++=====================')

          for (const key of el) {
            console.log(key)
            await this.page.keyboard.press(key);
            await delay(200)
          }
          await this.page.keyboard.press('Enter');
          await delay(1000)
        }

      }

      await delay(500);
    }

    if (filter.origin) {

      console.log('Type origin')
      let originInputActivate = await this.page.$x('//*[@id="origin-automation"]/form/mat-form-field/div/div[1]/div[1]');
      await originInputActivate[0].click()

      for (const el of filter.origin) {
        await this.page.keyboard.press(el)
        await delay(120)
      }

      await this.page.keyboard.press('Enter')

      await this.page.keyboard.press('Enter')

      await delay(500)
    }

    if (filter.destination) {

      let destinationInputActivate = await this.page.$x('//*[@id="destination-automation"]/form/mat-form-field/div/div[1]/div[1]')

      await destinationInputActivate[0].click()

      for (const el of filter.destination) {
        await this.page.keyboard.press(el)
        await delay(120)
      }

      await this.page.keyboard.press('Enter')
    }

    if (filter.pickup_from_date && filter.pickup_to_date) {
      const pickupFromDateFormatted = moment(filter.pickup_from_date).format(
        'MM/DD/YYYY'
      );
      const pickupToDateFormatted = moment(filter.pickup_to_date).format(
        'MM/DD/YYYY'
      );
      let pickupToDate = this.page.$x('//*[@id="daterange-automation"]/div/div[1]/div[3]/mat-date-range-input/div/div[2]/input');
      await this.page.waitForSelector(
        '#mat-date-range-input-0'
      );
      await this.page.focus(
        '#mat-date-range-input-0'
      );
      await this.page.$eval(
        '#mat-date-range-input-0',
        input => (input.value = '')
      );
      await this.page.type(
        '#mat-date-range-input-0',
        `${pickupFromDateFormatted}`
      );

      await this.page.keyboard.press('Tab');

      for (const el of pickupToDateFormatted) {
        await this.page.keyboard.press(el)
        await delay(200)
      }

      await this.page.$eval(
        '#mat-date-range-input-0',
        input => input.dispatchEvent(new Event('change'))
      );
    }

    if (filter.pickup_from_date && !filter.pickup_to_date) {
      const pickupFromDateFormatted = moment(filter.pickup_from_date).format(
          'MM/DD'
      );
      let pickupToDate = this.page.$x('//*[@id="daterange-automation"]/div/div[1]/div[3]/mat-date-range-input/div/div[2]/input');
      await this.page.waitForSelector(
          '#mat-date-range-input-0'
      );
      await this.page.focus(
          '#mat-date-range-input-0'
      );
      await this.page.$eval(
          '#mat-date-range-input-0',
          input => (input.value = '')
      );
      await this.page.type(
          '#mat-date-range-input-0',
          `${pickupFromDateFormatted}`
      );
      await pickupToDate.type(`${pickupFromDateFormatted}`)

      await this.page.$eval(
          '#mat-date-range-input-0',
          input => input.dispatchEvent(new Event('change'))
      );
    }
    if(filter.max_weight){
      await this.page.waitForSelector('#loatFilterButtonText');
      await this.page.click('#loatFilterButtonText');
      await this.page.click('[title="weight"]');

      await this.page.type('[title="weight"]', `${filter.max_weight}`);

      await delay(500)

      await this.page.click('.done-button')
    }

  }

  async startSearch() {
    await delay(500);
    // await this.page.waitForXPath('//*[@id="mat-tab-content-0-0"]/div/dat-search-tab/div/dat-search-form/form/div[2]/button[1]');
    // let searchButton = await this.page.$x('//*[@id="mat-tab-content-0-0"]/div/dat-search-tab/div/dat-search-form/form/div[2]/button[1]');

    await this.page.waitForSelector('.search-button-icon');
    await this.page.click('.search-button-icon');

    // await this.liveReloadDisable()
    await delay(1000)
    await this.page.waitForSelector('.result')

    const resultCountElementHandler = await this.page.$(
      '.result'
    );

    const resultCount = await this.page.evaluate(
      element => parseInt(element.textContent, 10),
      resultCountElementHandler
    );

    this.session?.emitToSockets('notification-count', {
      message: `${resultCount}`
    });

    return resultCount;
  }

  async startCrawling() {
    try {
      this.session?.emitToSockets('notification', {
        message: 'Establishing connection...'
      });

      await this.login();

      this.session?.emitToSockets('notification', {
        message: 'Authenticated successfully!'
      });

      await this.navigateToLoadPage();

      this.session?.emitToSockets('notification', {
        message: 'Applying filters...'
      });

      await this.setFilters();

      this.session?.emitToSockets('notification', {
        message: 'Looking for a match...'
      });
      let resultCount;
      try {
        resultCount = await this.startSearch();
      }
      catch (e){
        console.log('=============>',e)
      }



      if (resultCount === 0) {
        this.session?.emitToSockets('notification', {
          message: 'No match found.'
        });

        throw new Error('NoMatchFound');
      }

      await this.crawl();
    } catch (err) {
      console.error(err);
      if (err?.name.includes('TimeoutError')) {
        this.session?.emitToSockets('notification', {
          message: 'Matching timeout. Retrying...'
        });

        this.session.closeTab();
        const crawler = await this.restartTab(
          this.session?.token,
          this.session?.getLastFilter(),
          this.headers
        );

        await crawler.startCrawling();
      } else if (err?.name.includes('NoMatchFound')) {
        // DO NOTHING
      }
    }
  }

  async crawl() {
    if (this.page.isClosed()) {
      this.session?.emitToSockets('notification', {
        message: 'Tab Closed'
      });
      return;
    }
    else {
      let reloadBtn = await this.page.$$('#table-results-header > div > div > div:nth-child(1) > mat-icon > svg');
      let serachBtn = await this.page.$$('.search-button')
      try{
        await this.page.waitForSelector('#table-results-header > div > div > div > div > div > span:nth-child(1)');
        let countBtn = await this.page.$$('.match-count');
        if(countBtn[0]){
          await delay(1000)
          await countBtn[0].click()
          await delay(3000)
          return  this.crawl()
        }
        await delay(3000)
        return  this.crawl()
      }
      catch (e) {
        console.log(e)
        if(reloadBtn[0]){
          await reloadBtn[0].click();
        }
        else {
          await serachBtn[0].click()
        }
        await delay(3000)
        return  this.crawl()
      }
    }
  }

  async _waitForTransitionEnd(element) {
    await page.evaluate(element => {
      return new Promise(resolve => {
        const transition = document.querySelector(element);
        const onEnd = function () {
          transition.removeEventListener('transitionend', onEnd);
          resolve();
        };
        transition.addEventListener('transitionend', onEnd);
      });
    }, element);
  }

  async saveUnprocessedRow(rowsData) {
    const { mongo } = require('../main');


    const ids = rowsData.map(row => row.order_id);

    const results = await mongo
      .collection('orders')
      .find({
        user_id: this.session?.user._id,
        order_id: { $in: ids }
      })
      .toArray();

    const resultIds = results.map(result => result.order_id);
    const missingOrderIds = ids.filter(id => !resultIds.includes(id));

    const missingOrders = rowsData
      .filter(row => missingOrderIds.includes(row.order_id))
      .map(row => ({
        ...row,
        status: 'pending',
        user_id: this.session?.user._id,
        session_token: this.session?.session_token,
        date_created: new Date()
      }));
    console.log(missingOrders.length)

    if (missingOrders[0]) {
      await mongo.collection('orders').insertMany(missingOrders);

      this.session?.setIsIdle(true);
      return missingOrders;
    }

    return null;
  }

  async liveReloadDisable(){
    let searchSettings = await this.page.$x('//*[@id="mat-tab-content-0-0"]/div/dat-search-tab/div/dat-search-form/form/div[2]/button[2]')

    await searchSettings[0].click()

    let checkbox = await this.page.$x('/html/body/div[5]/div[2]/div/div/div/div/mat-slide-toggle/label/div/div/div[1]')
    await delay(400)
    if(checkbox[0]){
      await checkbox[0].click()
    }

    return
  }

  async removeOverlayPopup(){
    let popup = await this.page.$$('[idˆ="#cdk-overlay"]')
    if(popup[0]){
      let closeBtn = await this.page.$x('//*[@id="mat-dialog-0"]/dat-error-dialog/div/div[3]/a/span[1]');
      await closeBtn.click()
    }
    await delay(10000)
    return
  }

  async removeIframe(){
    try {
      await this.page.waitForXPath('/html/body/dat-root/dat-one-web/dat-nav/mat-sidenav-container/mat-sidenav-content/mat-drawer-container/mat-drawer-content')
      console.log('remove new iframe');
      await delay(1000);

      let newDatBannerButton = await this.page.$x('/html/body/div[2]/div/div/div[2]');
      if (newDatBannerButton.length) {
        try {
          await newDatBannerButton[0].click();
        } catch (err) {
          console.log(err)
        }
      }

      try {
        let loginAnywayButton = await this.page.$x('//*[@id="mat-dialog-0"]/dat-prewarn-dialog-component/div/mat-dialog-actions/button[2]');
        if(loginAnywayButton.length){
          try {
            await loginAnywayButton[0].click();
          }
          catch (err){
            console.log(err)
          }
        }
      }
      catch (e) {
        console.log(e)
      }

    }
    catch (e) {
      console.log(e)
    }
    let loginAnywayButton = await this.page.$x('//*[@id="mat-dialog-0"]/dat-prewarn-dialog-component/div/mat-dialog-actions/button[2]');
    if(loginAnywayButton.length){
      try {
        await loginAnywayButton[0].click();
      }
      catch (err){
        console.log(err)
      }
    }

    return
  }
};
