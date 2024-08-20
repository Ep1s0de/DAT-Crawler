const app = require("../main");

function delay(time) {
  return new Promise(function(resolve) {
    setTimeout(resolve, time);
  });
}

module.exports = class Tab {
  constructor(page, session, account, restartTab) {
    this.page = page;
    this.session = session;
    this.restartTab = restartTab;
    this.account = account;
    this.isLoggedIn = false;
  }

  async prepare() {
    await this.page.setRequestInterception(true);

    await this.page.setViewport({ width: 1680, height: 1050 });

    this.page.setDefaultNavigationTimeout(10000);

    this.page.on("pageerror", err => {
      console.error(`Page error emitted: "${err.message}"`);
    });

    this.page.on("response", res => {
      if (!res.ok() && res.status() > 400) {
        console.error(
          `Non-200 response from this request: [${res.status()}] "${res.url()}"`
        );
      }
    });

    this.page.on("request", request => {
      const resources = ["image", "font"];
      if (resources.includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    this.page.on("console", async msg => {
      const msgArgs = msg.args();
      try {
        for (let i = 0; i < msgArgs.length; ++i) {
          console.log(await msgArgs[i].jsonValue());
        }
      } catch (e) {
        console.log(e);
      }

    });
  }


  async goLoginPage() {
    try {
      await this.page.goto(process.env.DAT_LOGIN_URL, {
        waitUntil: "domcontentloaded"
      });
      await delay(3000);
    } catch (e) {
      console.log(e)
    }
  }



  async login() {
    try {

      try {
        let xBtn = await this.page.$(".stn-close-widget-button");
        xBtn.click();
      } catch (e) {
        console.log("X Btn is not exist");
      }


      await Promise.race([
        this.page.waitForSelector("input[name=\"username\"]"),
        this.page.waitForSelector("a.search")
      ]);

      await delay(3000);

      const isLoggedIn = await this.page.evaluate(() => {
        return !!document.querySelector("a.search");
      });

      if (!isLoggedIn) {
        await this.page.waitForFunction(
          () =>
            document.querySelectorAll(
              "input[name=\"username\"]",
              "input[name=\"password\"",
              "button[type=\"submit\"]"
            ).length
        );

        await this.page.type("input[name=\"username\"]", this.account.email);
        await this.page.type("input[name=\"password\"]", this.account.password);

        await this.page.click("button[type=\"submit\"]"),
        await this.page.waitForNavigation({ waitUntil: "networkidle2" });

      }
    } catch (e) {
      await this.page.close()
      console.log(this.account, e);
      await delay(3000);
    }
  }

  async startCrawling() {
    try {
      await this.goLoginPage()


      await this.login();

      const method = await this.awaitForNextCommand(this.account.email);

      await this.pickAuth(method);

      const otp = await this.awaitForOtp(this.account.email);

      await this.writeOtp(otp);

      try {
        await delay(5000)
        let loginAnywayBtn = await this.page.$(".mat-primary");
        await loginAnywayBtn.click()
      } catch (e) {
        console.log('LOGIN ANYWAY BUTTON NOT FOUND');
      }

      await delay(900);

      await this.saveAccountData();

      await delay(1000)

    } catch (err) {
      console.error(err);
      if (err?.name.includes("TimeoutError")) {

        this.session.closeTab();
        const crawler = await this.restartTab(
          this.session?.token,
          this.session?.getLastFilter(),
          this.page.waitForNavigation({ waitUntil: "networkidle2" })
        );

        await crawler.startCrawling();
      } else if (err?.name.includes("NoMatchFound")) {
        // DO NOTHING
      }
    }
  }

  async removeIframe() {
    try {
      let xBtn = await this.page.$(".stn-close-widget-button");
      xBtn.click();
    } catch (e) {
      console.log("X Btn is not exist");
    }
    let loginAnywayButton = await this.page.$x("//*[@id=\"mat-dialog-0\"]/dat-prewarn-dialog-component/div/mat-dialog-actions/button[2]");
    if (loginAnywayButton.length) {
      try {
        await loginAnywayButton[0].click();
      } catch (err) {
        console.log(err);
      }
    }

    return;
  }

  async pickAuth(method) {
    let continueBtnSelector = "[type=\"submit\"]"
    let methodsBtnSelector;
    let emailBtnSelector;
    if(method === 'sms'){
      methodsBtnSelector = '[for="sms"]'
    } else if (method === 'voice'){
      methodsBtnSelector = '[for="voice"]'
    } else if (method === 'other.phone'){
      await this.awaitForNextCommand()
    } else if (method === 'email'){
      methodsBtnSelector = '[value="pick-authenticator"]';
      emailBtnSelector = '[value="email::1"]'
    }

    let methodBtn = await this.page.$(methodsBtnSelector);
    let emailBtn;

    await delay(1500);
    await methodBtn.click();
    await delay(200);
    if(emailBtnSelector){
      await delay(1500)
      emailBtn = await this.page.$(emailBtnSelector);
      return emailBtn.click()
    }
    await delay(700);
    let continueBtn = await this.page.$$(continueBtnSelector)
    await delay(900);
    await continueBtn[1].click();

    await this.clearNext();
  }

  async writeOtp(otp) {
    await this.page.waitForSelector("[id=\"code\"]");
    const codeInput = await this.page.$("[id=\"code\"]");
    const submitBtn = await this.page.$("[type=\"submit\"]");
    await codeInput.type(otp.toString());
    const rememberCheckbox = await this.page.$('[id="rememberBrowser"]');
    await delay(300);
    await rememberCheckbox.click()
    await delay(800);
    await submitBtn.click();
    await delay(5000)

    await this.clearOtp()
  }

  async saveAccountData() {
    const { mongo } = require("../main");

    const cookies = await this.page.cookies();
    const localStorageData = await this.page.evaluate(() => {
      let json = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        json[key] = localStorage.getItem(key);
      }
      return json;
    });

    const data = {
      cookies,
      localStorageData,
      email: this.account.email,
      password: this.account.password,
      status: "done"
    }

    const filter = { email: this.account.email };
    const update = {
      $set: data,
    };

    const options = { upsert: true };
    try {
      const result = await mongo.collection("orders").updateOne(filter, update, options);
      if (result.upsertedCount > 0) {
        console.log(`A new document was inserted with the id ${result.upsertedId._id}`);
      } else if (result.modifiedCount > 0) {
        console.log(`Document with email ${data.email} was updated`);
      } else {
        console.log(`No changes made to the document with email ${data.email}`);
      }
    } catch (e) {
      console.error(`Failed to upsert document: ${e}`);
    }

  }

  async awaitForOtp(email) {
    const _app = require("../main");
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (_app.otp.currentCPOtp[email]) {
          clearInterval(interval);
          return resolve(_app.otp.currentCPOtp[email]);
        }
      }, 1000);
    });
  }

  async clearOtp() {
    const app = require("../main");
    return app.otp.removeCPCurrent(this.account.email);
  }

  async awaitForNextCommand(email) {
    const _app = require("../main");
    const nextCommand = _app.nextCommand.nextCommand
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (nextCommand[email]) {
          clearInterval(interval);
          return resolve(nextCommand[email]);
        }
      }, 1000);
    });
  }

  async clearNext() {
    const app = require("../main");
    return app.nextCommand.removeNext(this.account.email);
  }
};
