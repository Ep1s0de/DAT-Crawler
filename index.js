const puppeteer = require('puppeteer');

(async () => {
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto('https://www.dat.com/login');

	await page.waitForSelector('a[href^="https://one.dat.com"]', { visible: true });

	await page.click('a[href^="https://one.dat.com"]');

	await page.waitForFunction(() => 
		document.querySelectorAll('input[name="username"]', 'input[name="password"', 'button[type="submit"]').length
	);


	await page.type('input[name="username"]', 'gigi@msuslogistics.com');
  await page.type('input[name="password"]', '123123@Jm');

	await page.click('button[type="submit"]');

	await page.waitForSelector('a[href="/search/loads"]', { visible: true, timeout: 10000 });

	await page.goto('https://one.dat.com/search/loads', {
		waitUntil: 'networkidle2'
	});

	page.setViewport({ width: 1440, height: 780 });

	await page.waitForSelector('#searchList', { visible: true });


	let a = 0;

	setInterval(async () => {
		if (a < 3) {
			a++;
			console.time('gago');
			await page.reload();
			console.timeEnd('gago');
		} else {
			await browser.close();
		}
	}, 10000);
})();