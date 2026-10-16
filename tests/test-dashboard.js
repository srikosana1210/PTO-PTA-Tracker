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
  g.processSubmission_(base.sub('Anderson ES', { orgType: 'PTO', uploads: [base.upload(g, 'Bylaws'), base.upload(g, 'Training Certificate')] }));
  g.processSubmission_(base.sub('Ashford ES', { other: [{ ids: [g.__drive.upload('packet.pdf').getId()] }] }));
  // a Texas PTA: its officer form (counts at once) and its training certificate (waits for review); bylaws are filed only
  g.processSubmission_(base.sub('Oak Forest ES', { officer: true, uploads: [base.upload(g, 'Training Certificate'), base.upload(g, 'Bylaws')] }));
  var paste = g.__ss.getSheetByName('Officer Form Paste');
  // three officers: the email goes to the president only (FACE, 2026-10-16)
  paste.getRange(1, 1, 2, 14).setValues([['ID', 'Completion time', 'What school is your organization associated with?', 'What is the name of your organization?', 'Officer #1: Name', 'Officer #1: Position', 'Officer #1: Email',
    'Officer #2: Name', 'Officer #2: Position', 'Officer #2: Email', 'Officer #3: Name', 'Officer #3: Position', 'Officer #3: Email', 'Your email address'],
    ['11', new Date(Date.UTC(2026, 8, 1)), 'Anderson ES', 'Anderson PTO', 'Tom Treasurer', 'Treasurer', 'tom@example.org', 'Vic Vice', 'Vice President', 'vic@example.org', 'Ann Officer', 'President', 'ann@example.org', 'tom@example.org']]);
  g.importOfficers_();
  // this week's Texas PTA spreadsheet
  var tx = require('./fixtures/texas-pta-2026-10-15').rows(), tp = g.__ss.insertSheet('Texas PTA Paste');
  tp.getRange(1, 1, tx.length, tx[0].length).setValues(tx);
  g.importTexasPta_();
  return { g: g, p: p };
}

async function openPage(browser, w, width, boot) {
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
  var html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Dashboard.html'), 'utf8').replace('__DATA__', JSON.stringify(boot || { live: true, boot: true }));
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
    check('PTO/PTAs counts campuses that sent something plus Texas PTAs', pto.trim() === '13', pto);
    check('no "how complete" meters', (await page.$$('.kmeter')).length === 0);
    var areas = await page.$$eval('#areas tbody tr', function (rs) { return rs.map(function (r) { return r.textContent; }); });
    check('one row per Area Office (five, plus the two campuses with no Area Office yet)', areas.length === 6, areas.join(' / '));
    check('area totals add up to 266 campuses', /All Area Offices\s*266/.test(await page.textContent('#areas tfoot')), await page.textContent('#areas tfoot'));
    await page.click('#defs summary');
    var defs = await page.textContent('#defsBody');
    check('Registration list in FACE wording', /Registration:Training certificateThe organization's bylawsThe officer information form/.test(defs.replace(/\s*\n\s*/g, '')), defs);
    check('Legalization list has the bank letter wording and no Articles', /Bank account verification letter from financial institution listing two authorized account signers/.test(defs) && !/articles of incorporation|insurance/i.test(defs) && /PTAs: FACE tracks two documents/.test(defs), defs);
    var txr = await page.$$eval('#txpta tbody tr', function (rs) { return rs.map(function (r) { return r.textContent; }); });
    check('Texas PTA standing lists the 11 PTAs, no withdrawn charters', txr.length === 11 && !txr.some(function (x) { return /Bonham|Northside|Wainwright/.test(x); }), txr.join(' / '));
    check('Texas PTA standing says how many are in Good Standing and when Texas PTA updated it', /5 PTAs are in Good Standing, out of 11/.test(await page.textContent('#txHint')) && /October 15, 2026/.test(await page.textContent('#txHint')), await page.textContent('#txHint'));
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
    var pb = await page.textContent('#pBody');
    check('checklist shows Registration and Legalization, and no retired documents', /Registration[\s\S]*Legalization/.test(pb) && !/Articles of incorporation|insurance/i.test(pb), pb.slice(0, 300));
    // Bylaws: needs correction with a remark; training: it's there; bank letter: not needed; budget: remark only
    await page.click('#panel [data-item="0"] [data-v="C"]');
    await page.fill('#rmk0', 'Please send the signed copy.');
    await page.click('#panel [data-item="2"] [data-v="A"]');
    await page.click('#panel [data-item="5"] [data-v="X"]');
    await page.click('#panel [data-act="save"]');
    check('saving without a reason for Not needed is refused', /Say why/.test(await page.textContent('#panel .savebar')));
    await page.fill('#rmk5', 'The district holds the account.');
    await page.click('#panel [data-item="3"] [data-act="addrmk"]');
    await page.fill('#rmk3', 'The approved budget, not the draft.');
    await page.fill('#crmk', 'Thank you for getting started early!');
    await page.screenshot({ path: path.join(SHOTS, 'checklist-editing.png'), fullPage: false });
    await page.click('#panel [data-act="save"]');
    await page.waitForSelector('#panel .rask', { timeout: 10000 });
    var row = base.regRow(w.g, 'Anderson ES');
    check('saved to the register', row['Bylaws'] === 'Needs Correction' && row['Training Certificate'] === 'Accepted' && row['Bank Verification Letter'] === 'Not Needed', JSON.stringify(row));
    var href = await page.getAttribute('#pResend a[data-mail]', 'href');
    var body = decodeURIComponent(href.split('body=')[1] || '');
    check('email goes to the president only, copies the inbox', /^mailto:ann@example\.org\?cc=ParentOrgDocs@houstonisd\.org/.test(href), href.slice(0, 120));
    check('email lists the correction with its remark', /The organization's bylaws: Please send the signed copy\./.test(body), body);
    check('email lists what is still needed, with the remark', /We also still need these documents:[\s\S]*Annual budget report or meeting minutes showing budget approval \(The approved budget, not the draft\.\)/.test(body), body);
    check('email does not ask for the not-needed document', !/Bank account verification/i.test(body) && !/Articles of incorporation|insurance/i.test(body), body);
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
    await page.click('#panel [data-item="4"] [data-v="A"]');
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

    /* ---------- campus list: FACE's filters and the Org type column ---------- */
    o = await openPage(browser, w); page = o.page;
    await page.click('[data-tab="campuses"]');
    var chips = await page.$$eval('#chips [data-chip]', function (b) { return b.map(function (x) { return x.textContent.replace(/\s*\d+$/, '').trim(); }); });
    check('filters in FACE\'s order', JSON.stringify(chips) === JSON.stringify(['All campuses', 'All PTO/PTAs', 'PTOs', 'PTAs', 'Not started', 'In progress', 'Legalized', 'Registered', 'Waiting for review', 'Sent back for correction', 'Nothing received yet']), JSON.stringify(chips));
    check('the table has Org type and Waiting on columns', /Campus\s*Org type\s*Status\s*Documents\s*Waiting on\s*Done/i.test(await page.textContent('.chead')), await page.textContent('.chead'));
    await page.click('[data-chip="pta"]');
    var ptas = await page.$$eval('#clist .crow', function (rs) { return rs.map(function (r) { return r.getAttribute('data-c') + ':' + r.querySelector('.co').textContent; }); });
    check('PTAs lists the Texas PTA campuses, with PTA in the Org type column', ptas.length === 11 && ptas.every(function (x) { return /:PTA$/.test(x); }), ptas.join(', '));
    await page.click('[data-chip="pto"]');
    var ptos = await page.$$eval('#clist .crow', function (rs) { return rs.map(function (r) { return r.getAttribute('data-c'); }); });
    check('PTOs lists the campus whose officer form says PTO', ptos.join() === 'Anderson ES', ptos.join());
    var and = await page.textContent('.crow[data-c="Anderson ES"]');
    check('a PTO with documents to fix waits on the PTO', /Waiting on\s*The PTO and FACE|Waiting on\s*The PTO/.test(and) && /of 6/.test(and), and);
    await page.screenshot({ path: path.join(SHOTS, 'campuses.png'), fullPage: false });
    await page.click('[data-chip="pta"]');
    var oak = await page.textContent('.crow[data-c="Oak Forest ES"]');
    check('a PTA is counted on two documents and waits on FACE review', /1\s*of 2/.test(oak) && /FACE review/.test(oak) && /In progress/.test(oak), oak);
    check('a PTA shows two document icons', (await page.$$('.crow[data-c="Oak Forest ES"] .strip .ic')).length === 2);
    var bg = await page.evaluate(function () { return getComputedStyle(document.querySelector('.hero')).backgroundColor; });
    check('option A: a dark green header', bg === 'rgb(0, 111, 91)', bg);
    /* My campus: for principals and APs, no sign-in */
    await page.click('[data-tab="campus"]');
    await page.selectOption('#pickCampus', 'Oak Forest ES');
    var card = await page.textContent('#campusCard');
    check('My campus says who it waits on, in plain words', /Waiting on FACE to review: training certificate/.test(card) && /What FACE tracks for a PTA/.test(card) && /Received from the form/.test(card), card);
    check('My campus shows the PTA\'s Texas PTA standing', /Texas PTA: Good Standing since 9\/9\/2026\. All five standards are checked\./.test(card), card);
    check('My campus offers no checklist without sign-in', (await page.$$('#campusCard .campbtn')).length === 0);
    await page.selectOption('#pickCampus', 'Anderson ES');
    card = await page.textContent('#campusCard');
    check('My campus names the C1, without contact details', /C1 coordinator is Ms\. Lee/.test(card) && !/@/.test(card), card);
    await page.screenshot({ path: path.join(SHOTS, 'my-campus.png'), fullPage: false });
    check('no page errors (campus views)', o.errors.length === 0, o.errors.join(' | '));
    await page.close();

    /* a link made for an Area Office, and one for a campus */
    o = await openPage(browser, w, 1280, { live: true, boot: true, ao: 'nes elementary' }); page = o.page;
    check('an Area Office link opens on that office', (await page.inputValue('#fArea')) === 'NES Elementary', await page.inputValue('#fArea'));
    await page.close();
    o = await openPage(browser, w, 1280, { live: true, boot: true, campus: 'Oak Forest ES' }); page = o.page;
    check('a campus link opens My campus on that campus', !(await page.isHidden('#v-campus')) && (await page.inputValue('#pickCampus')) === 'Oak Forest ES');
    await page.close();
    /* view only: an Area Office leader sees officers and files, and changes nothing */
    var si = w.g.__ss.getSheetByName('Dashboard Sign-ins');
    w.g.ensureCanSeeColumn_(si);
    var sh = si.values()[0].map(function (x) { return String(x).trim(); }), sl = si.getLastRow() + 1;
    si.getRange(sl, sh.indexOf('Name') + 1).setValue('Dr. Area'); si.getRange(sl, sh.indexOf('Role') + 1).setValue('Viewer'); si.getRange(sl, sh.indexOf('Can See') + 1).setValue('NES Elementary');
    var vp = w.g.setUpSignIns_().made.filter(function (m) { return m.name === 'Dr. Area'; })[0].pass;
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Dr. Area', vp).catch(function () {});
    await page.waitForFunction(function () { return !document.querySelector('#who').hidden; }, null, { timeout: 10000 });
    check('a viewer has no Review tab', await page.isHidden('#tab-review'));
    check('a viewer is shown as View only', /View only/.test(await page.textContent('#whoRole')));
    await page.click('[data-tab="campuses"]');
    await page.click('[data-chip="all"]');
    await page.fill('#q', 'Anderson');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    var vb = await page.textContent('#pBody');
    check('a viewer sees the officers', /Ann Officer/.test(vb) && /ann@example\.org/.test(vb), vb.slice(0, 400));
    check('a viewer sees the file links', (await page.$$('#pBody a[href^="https://drive.google.com/"]')).length > 0);
    check('a viewer gets no checklist buttons and no email box', (await page.$$('#panel .seg button')).length === 0 && (await page.$$('#pResend')).length === 0);
    await page.click('#pClose');
    await page.fill('#q', 'Durham');
    await page.click('.crow[data-c="Durham ES"] .campbtn');
    check('a viewer sees no officers outside their Area Office', !/Ann Officer/.test(await page.textContent('#pBody')) && (await page.$$('#pBody a[href^="https://drive.google.com/"]')).length === 0);
    check('no page errors (viewer)', o.errors.length === 0, o.errors.join(' | '));
    await page.close();

    /* staff get the links to hand out */
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Pat Staff', w.p.pass['Pat Staff']);
    await page.click('[data-tab="overview"]');
    await page.click('details.links summary');
    var links = await page.$$eval('details.links input', function (xs) { return xs.map(function (x) { return x.value; }); });
    check('staff see a link for each Area Office', links.length === 6 && links.some(function (l) { return /\?ao=NES%20Elementary$/.test(l); }), links.join(' '));
    await page.close();

    /* ---------- automatic reminders on: the Remind C1s buttons give way to one line ---------- */
    w.g.setReminderHook_('https://prod-1.westus.logic.azure.com:443/workflows/x/triggers/manual/paths/invoke?sig=1');
    w.g.turnOnC1Reminders();
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Pat Staff', w.p.pass['Pat Staff']);
    var auto = await page.textContent('#reviewBody');
    check('automatic reminders: one status line, no buttons', /C1 reminders\s*automatic/.test(auto) && /Right now that is 1 C1/.test(auto) && (await page.$$('.c1list')).length === 0, auto.slice(-300));
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
