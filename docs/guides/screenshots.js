'use strict';
var fs = require('fs'), path = require('path');
var T = '/home/user/PTO-PTA-Tracker/tests/';
var h = require(T + 'harness'), base = require(T + 'test-script'), newTests = require(T + 'test-new-helpers');
var pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
var OUT = path.join(__dirname, 'img');
/** A tracker with the October update applied, two campuses with documents, a C1 (Ms. Lee: Anderson ES, Ashford ES) and FACE staff. */
function world() {
  var g = h.load();
  newTests.withAreaTab(g);
  var p = base.withPeople(g);
  g.applyOctober2026_({ reset: true });
  g.applyCampusList_();   // FACE's campus list (2026-10-26): every campus in an Area Office
  var si = g.__ss.getSheetByName('Dashboard Sign-ins'), vals = si.values(), ec = vals[0].indexOf('Email');
  vals.forEach(function (r, i) { if (r[0] === 'Ms. Lee') si.getRange(i + 1, ec + 1).setValue('lee@houstonisd.org'); });
  g.processSubmission_(base.sub('Anderson ES', { orgType: 'PTO', uploads: [base.upload(g, 'Bylaws'), base.upload(g, 'Training Certificate')] }));
  g.processSubmission_(base.sub('Ashford ES', { other: [{ ids: [g.__drive.upload('packet.pdf').getId()] }] }));
  // a Texas PTA: its officer form (counts at once) and its training certificate (waits for review); bylaws are filed only
  g.processSubmission_(base.sub('Oak Forest ES', { officer: true, uploads: [base.upload(g, 'Training Certificate'), base.upload(g, 'Bylaws')] }));
  var paste = g.__ss.getSheetByName('Officer Form Paste');
  // three officers: the email goes to two of them, president first (FACE, 2026-10-19)
  paste.getRange(1, 1, 2, 14).setValues([['ID', 'Completion time', 'What school is your organization associated with?', 'What is the name of your organization?', 'Officer #1: Name', 'Officer #1: Position', 'Officer #1: Email',
    'Officer #2: Name', 'Officer #2: Position', 'Officer #2: Email', 'Officer #3: Name', 'Officer #3: Position', 'Officer #3: Email', 'Your email address'],
    ['11', new Date(Date.UTC(2026, 8, 1)), 'Anderson ES', 'Anderson PTO', 'Tom Treasurer', 'Treasurer', 'tom@example.org', 'Vic Vice', 'Vice President', 'vic@example.org', 'Ann Officer', 'President', 'ann@example.org', 'tom@example.org']]);
  g.importOfficers_();
  // this week's Texas PTA spreadsheet
  var tx = require(T + 'fixtures/texas-pta-2026-10-15').rows(), tp = g.__ss.insertSheet('Texas PTA Paste');
  tp.getRange(1, 1, tx.length, tx[0].length).setValues(tx);
  g.importTexasPta_();
  return { g: g, p: p };
}
async function openPage(browser, w, width, boot) {
  var page = await browser.newPage({ viewport: { width: width || 1280, height: 900 }, deviceScaleFactor: 2 });
  var errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  await page.exposeFunction('__gas', function (name, args) {
    try { return { ok: true, v: JSON.parse(JSON.stringify(w.g[name].apply(null, args))) }; }
    catch (e) { return { ok: false, m: e.message }; }
  });
  await page.addInitScript(function () {
    function runner(ok, fail) {
      return new Proxy({}, { get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { return runner(f, fail); };
        if (k === 'withFailureHandler') return function (f) { return runner(ok, f); };
        return function () { var args = Array.prototype.slice.call(arguments); window.__gas(k, args).then(function (r) { if (r.ok) { if (ok) ok(r.v); } else if (fail) fail(new Error(r.m)); }); };
      } });
    }
    window.google = { script: { run: runner(null, null) } };
  });
  var html = fs.readFileSync('/home/user/PTO-PTA-Tracker/apps-script/Dashboard.html', 'utf8').replace('__DATA__', JSON.stringify(boot || { live: true, boot: true }));
  await page.route('https://dashboard.test/', function (route) { route.fulfill({ status: 200, contentType: 'text/html', body: html }); });
  await page.goto('https://dashboard.test/');
  await page.waitForSelector('#kpis .kpi, #campusCard .ccard', { timeout: 10000 });
  return { page: page, errors: errors };
}
async function signIn(page, name, pass) {
  await page.click('#signinBtn');
  await page.selectOption('#siName', name);
  await page.fill('#siPass', pass);
  await page.click('#siGo');
  await page.waitForSelector('#tab-review:not([hidden])', { timeout: 10000 });
}
async function shot(page, sel, name, pad) {
  var el = typeof sel === 'string' ? await page.$(sel) : sel;
  if (!el) { console.log('MISSING', name, sel); return; }
  await el.scrollIntoViewIfNeeded();
  var b = await el.boundingBox(); pad = pad || 6;
  await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: Math.min(b.height + 2 * pad, 900) } });
}
(async function () {
  var w = world();
  // a few more documents so the C1's queue looks real
  w.g.processSubmission_(base.sub('Ashford ES', { orgType: 'PTO', uploads: [base.upload(w.g, 'Bylaws'), base.upload(w.g, 'Training Certificate')] }));
  var browser = await pw.chromium.launch();
  try {
    /* ---------- C1 ---------- */
    var o = await openPage(browser, w, 680), page = o.page;
    await page.click('#signinBtn');
    await page.selectOption('#siName', 'Ms. Lee');
    await page.fill('#siPass', 'ABCD-1234');
    await shot(page, '#signin', 'c1-signin');
    await page.fill('#siPass', w.p.pass['Ms. Lee']);
    await page.click('#siGo');
    await page.waitForSelector('#tab-review:not([hidden])');
    await shot(page, '.hero', 'c1-header', 0);
    await page.click('[data-tab="campus"]');
    await shot(page, '#myList', 'c1-mycampus');
    await page.click('[data-tab="review"]');
    await shot(page, '#rlist li', 'c1-review');
    await page.click('#rlist li');
    await page.waitForSelector('#panel:not([hidden])');
    await shot(page, '#pChecklist li[data-item]', 'c1-item');
    await page.click('#pChecklist li[data-item] [data-v="C"]');
    await page.fill('#pChecklist li[data-item] textarea', 'The certificate is for last year. Please send this year\'s.');
    await shot(page, '#pChecklist li[data-item]', 'c1-item-fix');
    await shot(page, '.savebar', 'c1-save');
    await page.close();
    o = await openPage(browser, w, 680); page = o.page;
    await signIn(page, 'Ms. Lee', w.p.pass['Ms. Lee']);
    await page.click('[data-tab="campuses"]');
    await page.fill('#q', 'Anderson');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    await page.waitForSelector('#panel:not([hidden])');
    var em = await page.$('#pBody section:has(h3:has-text("Email the PTO/PTA"))');
    await shot(page, em, 'c1-email');
    await page.close();
    /* ---------- principals and EDs (no sign-in) ---------- */
    o = await openPage(browser, w, 1280); page = o.page;
    await shot(page, '#kpis', 'p-tiles');
    await page.close();
    o = await openPage(browser, w, 680); page = o.page;
    await shot(page, '.hero', 'p-header', 0);
    await shot(page, '#areas', 'p-areas');
    await page.click('[data-tab="campus"]');
    await page.fill('#pickFind', 'Anderson');
    await page.waitForTimeout(200);
    await shot(page, '.pick', 'p-find');
    await shot(page, '#campusCard .ccard', 'p-card');
    await page.click('#campusCard .cmore button');
    await page.waitForSelector('#panel:not([hidden])');
    var off = await page.$('#pBody .pside .psec');
    await shot(page, off, 'p-officers');
    await page.close();
    o = await openPage(browser, w, 1100); page = o.page;
    await page.click('[data-tab="campuses"]');
    await shot(page, '.chips', 'p-chips');
    await page.close();
  } finally { await browser.close(); }
})().catch(function (e) { console.error(e); process.exit(1); });
