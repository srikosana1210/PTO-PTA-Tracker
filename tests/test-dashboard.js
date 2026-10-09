/*
 * Browser tests: the real Dashboard.html in Chromium, with google.script.run answered by Code.gs running in Node (harness.js).
 *   node tests/test-dashboard.js            (needs Playwright; screenshots go to tests/.cache/shots)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var h = require('./harness');
var base = require('./test-script');
var newTests = require('./test-new-helpers');
var pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

var SHOTS = path.join(__dirname, '.cache', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
var results = { pass: 0, fail: 0 };
function check(name, cond, detail) { if (cond) results.pass++; else { results.fail++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); } }

/** A tracker with the October update applied, two campuses with documents, a C1 (Ms. Lee: Anderson ES, Ashford ES) and FACE staff. */
function world() {
  var g = h.load();
  newTests.withAreaTab(g);
  var p = base.withPeople(g);
  g.applyOctober2026_({ reset: true });
  var si = g.__ss.getSheetByName('Dashboard Sign-ins'), vals = si.values(), ec = vals[0].indexOf('Email');
  vals.forEach(function (r, i) { if (r[0] === 'Ms. Lee') si.getRange(i + 1, ec + 1).setValue('lee@houstonisd.org'); });
  g.processSubmission_(base.sub('Anderson ES', { uploads: [base.upload(g, 'Bylaws'), base.upload(g, 'Training Certificate')] }));
  g.processSubmission_(base.sub('Ashford ES', { other: [{ ids: [g.__drive.upload('packet.pdf').getId()] }] }));
  var paste = g.__ss.getSheetByName('Officer Form Paste');
  paste.getRange(1, 1, 2, 8).setValues([['ID', 'Completion time', 'What school is your organization associated with?', 'What is the name of your organization?', 'Officer #1: Name', 'Officer #1: Position', 'Officer #1: Email', 'Your email address'],
    ['11', new Date(Date.UTC(2026, 8, 1)), 'Anderson ES', 'Anderson PTO', 'Ann Officer', 'President', 'ann@example.org', 'ann@example.org']]);
  g.importOfficers_();
  return { g: g, p: p };
}

async function openPage(browser, w, width) {
  var page = await browser.newPage({ viewport: { width: width || 1280, height: 900 } });
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
  var html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Dashboard.html'), 'utf8').replace('__DATA__', '{"live":true,"boot":true}');
  await page.route('https://dashboard.test/', function (route) { route.fulfill({ status: 200, contentType: 'text/html', body: html }); });
  await page.goto('https://dashboard.test/');
  await page.waitForSelector('#kpis .kpi', { timeout: 10000 });
  return { page: page, errors: errors };
}
async function signIn(page, name, pass) {
  await page.click('#signinBtn');
  await page.selectOption('#siName', name);
  await page.fill('#siPass', pass);
  await page.click('#siGo');
  await page.waitForSelector('#tab-review:not([hidden])', { timeout: 10000 });
}

(async function () {
  var browser = await pw.chromium.launch();
  try {
    /* ---------- leadership: whole numbers only ---------- */
    var w = world();
    var o = await openPage(browser, w);
    var page = o.page;
    var kpiText = await page.textContent('#kpis');
    check('no percentages on the overview', !/%/.test(await page.textContent('#v-overview')), kpiText);
    check('tiles: PTO/PTAs, Registered, Legalized, Waiting for review', /PTO\/PTAs/.test(kpiText) && /Registered/.test(kpiText) && /Legalized/.test(kpiText) && /Waiting for review/.test(kpiText));
    var pto = await page.textContent('.kpi.k1 .kval');
    check('PTO/PTAs counts campuses that sent something plus Texas PTAs', pto.trim() === '12', pto);
    check('no "how complete" meters', (await page.$$('.kmeter')).length === 0);
    var areas = await page.$$eval('#areas tbody tr', function (rs) { return rs.map(function (r) { return r.textContent; }); });
    check('one row per Area Office (five, plus the two campuses with no Area Office yet)', areas.length === 6, areas.join(' / '));
    check('area totals add up to 266 campuses', /All Area Offices\s*266/.test(await page.textContent('#areas tfoot')), await page.textContent('#areas tfoot'));
    await page.click('#defs summary');
    var defs = await page.textContent('#defsBody');
    check('Registration list in FACE wording', /Registration:Training certificateThe organization's bylawsThe officer information form/.test(defs.replace(/\s*\n\s*/g, '')), defs);
    check('Legalization list has the bank letter wording and no Articles', /Bank account verification letter from financial institution listing two authorized account signers/.test(defs) && /Not required: articles of incorporation/.test(defs), defs);
    await page.screenshot({ path: path.join(SHOTS, 'overview.png'), fullPage: true });
    // campus panel without sign-in: no checklist, no remarks
    await page.click('[data-st="review"]');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    check('leadership sees no checklist buttons', (await page.$$('#panel .seg button')).length === 0);
    check('leadership sees no email box', (await page.$$('#pResend')).length === 0);
    check('no page errors (leadership)', o.errors.length === 0, o.errors.join(' | '));
    await page.close();

    /* ---------- a C1 checks documents off and emails the PTO ---------- */
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Ms. Lee', w.p.pass['Ms. Lee']);
    var rev = await page.textContent('#reviewBody');
    check('review tab lists the campus with documents and the one with other files', /Anderson ES/.test(rev) && /Ashford ES/.test(rev) && /Other files/.test(rev), rev.slice(0, 300));
    await page.click('#reviewBody [data-c="Anderson ES"] .campbtn');
    await page.waitForSelector('#panel .seg');
    check('checklist shows the three groups', /Registration[\s\S]*Legalization[\s\S]*Other documents/.test(await page.textContent('#pBody')));
    // Bylaws: needs correction with a remark; training: it's there; Articles: not needed; budget: remark only
    await page.click('#panel [data-item="0"] [data-v="C"]');
    await page.fill('#rmk0', 'Please send the signed copy.');
    await page.click('#panel [data-item="2"] [data-v="A"]');
    await page.click('#panel [data-item="6"] [data-v="X"]');
    await page.click('#panel [data-act="save"]');
    check('saving without a reason for Not needed is refused', /Say why/.test(await page.textContent('#panel .savebar')));
    await page.fill('#rmk6', 'They have 501(c) proof.');
    await page.click('#panel [data-item="3"] [data-act="addrmk"]');
    await page.fill('#rmk3', 'The approved budget, not the draft.');
    await page.fill('#crmk', 'Thank you for getting started early!');
    await page.screenshot({ path: path.join(SHOTS, 'checklist-editing.png'), fullPage: false });
    await page.click('#panel [data-act="save"]');
    await page.waitForSelector('#panel .rask', { timeout: 10000 });
    var row = base.regRow(w.g, 'Anderson ES');
    check('saved to the register', row['Bylaws'] === 'Needs Correction' && row['Training Certificate'] === 'Accepted' && row['Articles of Incorporation'] === 'Not Needed', JSON.stringify(row));
    var href = await page.getAttribute('#pResend a[data-mail]', 'href');
    var body = decodeURIComponent(href.split('body=')[1] || '');
    check('email goes to the officer, copies the inbox', /^mailto:ann@example\.org\?cc=ParentOrgDocs@houstonisd\.org/.test(href), href.slice(0, 120));
    check('email lists the correction with its remark', /The organization's bylaws: Please send the signed copy\./.test(body), body);
    check('email lists what is still needed, with the remark', /We also still need these documents:[\s\S]*Annual budget report or meeting minutes showing budget approval \(The approved budget, not the draft\.\)/.test(body), body);
    check('email does not ask for the not-needed or optional documents', !/Articles of incorporation/i.test(body) && !/insurance/i.test(body), body);
    check('email has the overall remarks', /Remarks:\r?\nThank you for getting started early!/.test(body), body);
    check('Proof of 501(c) status is written correctly', /Proof of 501\(c\) status\r?\n/.test(body + '\n'), body);
    await page.screenshot({ path: path.join(SHOTS, 'checklist-saved.png'), fullPage: false });
    await page.click('#pResend [data-act="mailsent"]');
    await page.waitForFunction(function () { return /Emailed/.test(document.querySelector('#pResend .mailsent').textContent); }, null, { timeout: 10000 });
    check('"I sent it" is logged', base.logRows(w.g).some(function (r) { return /^Emailed the PTO\/PTA about /.test(r[7]); }));
    // reopening shows the saved remarks
    await page.click('#pClose');
    await page.click('#reviewBody [data-c="Ashford ES"] .campbtn');
    await page.click('#pClose');
    await page.click('[data-tab="campuses"]');
    await page.click('[data-chip="all"]');
    await page.fill('#q', 'Anderson');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    check('remarks come back after reopening', (await page.inputValue('#rmk0')) === 'Please send the signed copy.' && (await page.inputValue('#crmk')) === 'Thank you for getting started early!');
    // unsaved changes are not lost silently
    await page.click('#panel [data-item="1"] [data-v="A"]');
    page.once('dialog', function (d) { d.dismiss(); });
    await page.keyboard.press('Escape');
    check('closing with unsaved changes asks first', !(await page.isHidden('#panel')));
    check('no page errors (C1)', o.errors.length === 0, o.errors.join(' | '));
    await page.close();

    /* ---------- FACE staff: remind C1s ---------- */
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Pat Staff', w.p.pass['Pat Staff']);
    var remind = await page.textContent('#reviewBody');
    check('staff see Remind C1s with Ms. Lee', /Remind C1s/.test(remind) && /Ms\. Lee/.test(remind), remind.slice(-400));
    var rh = await page.getAttribute('.c1list a[data-mail]', 'href');
    var rb = decodeURIComponent(rh.split('body=')[1] || '');
    check('reminder goes to the C1 and lists the campus and files', /^mailto:lee@houstonisd\.org/.test(rh) && /Ashford ES: other files/.test(rb), rh.slice(0, 200));
    await page.screenshot({ path: path.join(SHOTS, 'review-staff.png'), fullPage: true });
    check('no page errors (staff)', o.errors.length === 0, o.errors.join(' | '));
    await page.close();

    /* ---------- phone width ---------- */
    o = await openPage(browser, w, 390); page = o.page;
    var sw = await page.evaluate(function () { return document.documentElement.scrollWidth; });
    check('no sideways scroll on a phone', sw <= 390, String(sw));
    await page.screenshot({ path: path.join(SHOTS, 'phone.png'), fullPage: true });
    await page.close();
  } finally { await browser.close(); }
  console.log(results.pass + ' passed, ' + results.fail + ' failed');
  process.exit(results.fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
