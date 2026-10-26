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
    check('tiles: Registered, Can Fundraise, In progress, No PTO/PTA (FACE, 2026-10-25)', /^Registered/.test(kpiText.trim()) && /Can Fundraise/.test(kpiText) && /In progress/.test(kpiText) && /No PTO\/PTA/.test(kpiText) && !/Waiting for review/.test(kpiText), kpiText);
    check('the title is the school year and HISD PTO/PTAs', /^2026–27 HISD PTO\/PTAs$/.test((await page.textContent('#h1')).trim()), await page.textContent('#h1'));
    check('"Where PTO/PTAs stand" is gone', !/Where PTO\/PTAs stand/.test(await page.textContent('#v-overview')));
    check('Documents and Progress by month are for signed-in C1s and FACE staff only', await page.isHidden('#docSec') && await page.isHidden('#histSec'));
    var inprog = await page.textContent('.kpi.k4 .kval');
    check('In progress counts campuses turning documents in, not registered yet (two PTOs and the PTAs Texas PTA has documents for)', inprog.trim() === '12', inprog);
    check('By Area Office has Campuses, Registered, Can Fundraise, In progress, No PTO/PTA', /Area Office\s*▲?\s*Campuses\s*Registered\s*Can Fundraise\s*In progress\s*No PTO\/PTA/.test(await page.textContent('#areas thead')), await page.textContent('#areas thead'));
    check('no "how complete" meters', (await page.$$('.kmeter')).length === 0);
    var areas = await page.$$eval('#areas tbody tr', function (rs) { return rs.map(function (r) { return r.textContent; }); });
    check('one row per Area Office, and none for a campus without one (2026-10-26)', areas.length === 7 && !/not set/.test(areas.join()), areas.join(' / '));
    check('area totals add up to 264 campuses', /All Area Offices\s*264/.test(await page.textContent('#areas tfoot')), await page.textContent('#areas tfoot'));
    await page.click('#defs summary');
    var defs = await page.textContent('#defsBody');
    check('Registration list in FACE wording', /Registration:Training certificateThe organization's bylawsThe officer information form/.test(defs.replace(/\s*\n\s*/g, '')), defs);
    check('Can Fundraise list has the bank letter wording and no Articles', /Can Fundraise:/.test(defs) && /Bank account verification letter from financial institution listing two authorized account signers/.test(defs) && !/articles of incorporation|insurance/i.test(defs) && !/PTAs: FACE tracks two documents|counts as soon as it comes in/.test(defs), defs);
    check('Texas PTA standing is hidden on the Overview (FACE, 2026-10-20)', await page.isHidden('#txSec'));
    await page.screenshot({ path: path.join(SHOTS, 'overview.png'), fullPage: true });
    // campus panel without sign-in: no checklist, no remarks
    await page.click('[data-st="In progress"]');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    check('leadership sees no checklist buttons', (await page.$$('#panel .seg button')).length === 0);
    var lb = await page.textContent('#pBody');
    check('without signing in, everyone in the district sees the officers and document links (FACE, 2026-10-19)', /Ann Officer/.test(lb) && /ann@example\.org/.test(lb) && (await page.$$('#pBody a[href^="https://drive.google.com/"]')).length > 0, lb.slice(0, 300));
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
    check('checklist shows Registration and Can Fundraise, and no retired documents', /Registration[\s\S]*Can Fundraise/.test(pb) && !/Articles of incorporation|insurance/i.test(pb), pb.slice(0, 300));
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
    check('the panel stays open after saving (tester feedback)', !(await page.isHidden('#panel')));
    var ph = await page.textContent('#pBody');
    check('each document says when it was decided and by whom', /accepted \w{3} \d+, \d{4} by Ms\. Lee/.test(ph), ph.slice(0, 600));
    check('the panel names the C1 and when the PTO/PTA was last heard from', /C1 coordinator: Ms\. Lee/.test(ph) && /Last heard from:/.test(ph));
    check('the organization name is at the top of the panel', /Anderson PTO/.test(await page.textContent('#pSub')), await page.textContent('#pSub'));
    var row = base.regRow(w.g, 'Anderson ES');
    check('saved to the register', row['Bylaws'] === 'Needs Correction' && row['Training Certificate'] === 'Accepted' && row['Bank Verification Letter'] === 'Not Needed', JSON.stringify(row));
    var href = await page.getAttribute('#pResend a[data-mail]', 'href');
    var body = decodeURIComponent(href.split('body=')[1] || '');
    check('email goes to two officers: the president, then (no secretary on file) the vice president; not the treasurer', /^mailto:ann@example\.org,vic@example\.org\?cc=FACE@houstonisd\.org/.test(href), href.slice(0, 120));
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

    /* ---------- a C1 uploads a document, and moves a file filed under the wrong document (2026-10-23) ---------- */
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Ms. Lee', w.p.pass['Ms. Lee']);
    await page.click('[data-tab="campuses"]');
    await page.click('[data-chip="all"]');
    await page.fill('#q', 'Anderson');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    await page.click('#panel [data-item="4"] [data-act="upopen"]');
    check('upload offers "Upload and accept", chosen by default', await page.isChecked('#panel input[name="upm4"][value="accept"]'));
    await page.setInputFiles('#upf4', { name: 'Proof of 501c from the PTO.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
    await page.click('#panel [data-act="upgo"]');
    await page.waitForFunction(function () { return /uploaded for Anderson ES and accepted/.test(document.querySelector('#pLive').textContent); }, null, { timeout: 10000 });
    check('the upload is filed and accepted', base.regRow(w.g, 'Anderson ES')['Proof of 501c Status'] === 'Accepted');
    check('the panel shows the new file', /Proof of 501c from the PTO\.pdf/.test(await page.textContent('#panel [data-item="4"]')) && !(await page.isHidden('#panel')));
    var wrong = await page.$('#panel [data-item="2"] [data-act="mvopen"]');
    check('a file has a "Wrong document?" button', !!wrong);
    if (wrong) {
      await wrong.click();
      await page.selectOption('#mvTo', '3');
      await page.check('#panel input[name="mvm"][value="review"]');
      await page.click('#panel [data-act="mvgo"]');
      await page.waitForFunction(function () { return /now filed under budget report or minutes/.test(document.querySelector('#pLive').textContent); }, null, { timeout: 10000 });
      check('the file moved to the right document, waiting for review', base.regRow(w.g, 'Anderson ES')['Budget or Financial Report'] === 'Received');
    }
    check('no page errors (upload)', o.errors.length === 0, o.errors.join(' | '));
    /* a signed-in C1 sees their own campuses at the top of My campus (2026-10-26) */
    await page.keyboard.press('Escape');
    await page.click('[data-tab="campus"]');
    var my = await page.$$eval('#myList [data-pick]', function (b) { return b.map(function (x) { return x.textContent; }); });
    check('My campus lists the C1\'s own campuses', my.join() === 'Anderson ES,Ashford ES', my.join());
    await page.click('#myList [data-pick="Ashford ES"]');
    check('a campus in the list opens its card', /^Ashford ES/.test((await page.textContent('#campusCard')).trim()) && (await page.inputValue('#pickCampus')) === 'Ashford ES');
    await page.close();
    /* leadership never gets the upload buttons */
    o = await openPage(browser, w); page = o.page;
    await page.click('[data-tab="campuses"]');
    await page.click('[data-chip="all"]');
    await page.fill('#q', 'Anderson');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    check('no upload or move buttons without a C1 or staff sign-in', (await page.$$('#panel [data-act="upopen"], #panel [data-act="mvopen"]')).length === 0);
    var acts = await page.$$eval('#panel .plist.act li', function (li) { return li.map(function (x) { return x.children[1] ? x.children[1].textContent.trim() : ''; }); });
    check('recent activity has no blank lines, and says what happened without remarks', acts.length > 0 && acts.every(Boolean) && acts.some(function (x) { return /accepted\.|sent back for correction\.|marked not received\./.test(x); }), acts.join(' / '));
    check('no My campus list without a C1 sign-in', !(await page.$('#myList [data-pick]')));
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
    var chips = await page.$$eval('#chips .chiprow', function (rows) { return rows.map(function (row) { return [].map.call(row.querySelectorAll('[data-chip]'), function (x) { return x.textContent.replace(/\s*\d+$/, '').trim(); }).join(','); }); });
    check('one row of seven filters (FACE, 2026-10-26)', chips.length === 1 && chips[0] === 'All campuses,Registered,Can Fundraise,PTOs,PTAs,All PTO/PTAs,No PTO/PTA', JSON.stringify(chips));
    check('All campuses is chosen when the tab opens', (await page.getAttribute('[data-chip="all"]', 'aria-pressed')) === 'true' && (await page.$$('#clist .crow')).length === 264);
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
    check('a PTA is counted on every document (Texas PTA fills four) and waits on FACE review', /5\s*of 6/.test(oak) && /FACE review/.test(oak) && /In progress/.test(oak), oak);
    check('a PTA shows six document icons, like a PTO', (await page.$$('.crow[data-c="Oak Forest ES"] .strip .ic')).length === 6);
    var bg = await page.evaluate(function () { return getComputedStyle(document.querySelector('.hero')).backgroundColor; });
    check('option A: a dark green header', bg === 'rgb(0, 111, 91)', bg);
    /* My campus: for principals and APs, no sign-in */
    await page.click('[data-tab="campus"]');
    await page.selectOption('#pickCampus', 'Oak Forest ES');
    var card = await page.textContent('#campusCard');
    check('My campus says who it waits on, in plain words', /Waiting on FACE to review: training certificate/.test(card) && /To be Registered/.test(card) && /Confirmed by Texas PTA/.test(card) && /Received from the form/.test(card), card);
    check('My campus shows the PTA\'s Texas PTA standing', /Texas PTA: Good Standing since 9\/9\/2026\. All five standards are checked\./.test(card), card);
    check('My campus offers the officers and documents, not the checklist, without sign-in', /See officers and documents/.test(await page.textContent('#campusCard')) && !/Open the checklist/.test(await page.textContent('#campusCard')));
    await page.selectOption('#pickCampus', 'Anderson ES');
    card = await page.textContent('#campusCard');
    check('My campus names the C1 and how to report a problem', /C1 coordinator, Ms\. Lee/.test(card) && /something wrong or out of date\? Contact this campus's C1 coordinator, Ms\. Lee, or email FACE@houstonisd\.org\./.test(card) && !/lee@houstonisd/.test(card), card);
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
    /* leaders by Google account: an Area Office leader sees officers and bylaws; a principal sees everything; nobody changes anything */
    w.g.__props.OPEN_DETAILS = '0';   // the Leaders tab matters only in the sign-in-only mode
    w.g.checkLeaders_();
    w.g.__ss.getSheetByName('Leaders').getRange(2, 1, 2, 4).setValues([['sed@houstonisd.org', 'Dr. Area', 'Area Office', 'NES Elementary'], ['prin@houstonisd.org', 'Ms. Principal', 'Principal', 'Anderson ES']]);
    w.g.__user.email = 'sed@houstonisd.org';
    o = await openPage(browser, w); page = o.page;
    check('an Area Office leader is recognized with no sign-in', !(await page.isHidden('#who')) && /Area Office · view only/.test(await page.textContent('#whoRole')) && await page.isHidden('#signoutBtn'));
    check('a leader has no Review tab', await page.isHidden('#tab-review'));
    await page.click('[data-tab="campuses"]');
    await page.click('[data-chip="all"]');
    await page.fill('#q', 'Anderson');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    var vb = await page.textContent('#pBody');
    var links = await page.$$eval('#pBody a[href^="https://drive.google.com/"]', function (as) { return as.map(function (a) { return a.closest('li') ? a.closest('li').textContent : ''; }); });
    check('an Area Office leader sees the officers', /Ann Officer/.test(vb) && /ann@example\.org/.test(vb), vb.slice(0, 300));
    check('an Area Office leader sees the bylaws file and no other', links.length > 0 && links.every(function (t) { return /bylaws/i.test(t); }), links.join(' / '));
    check('a leader gets no checklist buttons and no email box', (await page.$$('#panel .seg button')).length === 0 && (await page.$$('#pResend')).length === 0);
    await page.click('#pClose');
    await page.fill('#q', 'Durham');
    await page.click('.crow[data-c="Durham ES"] .campbtn');
    check('an Area Office leader sees no officers outside their office', (await page.$$('#pBody a[href^="https://drive.google.com/"]')).length === 0 && !/Ann Officer/.test(await page.textContent('#pBody')));
    check('no page errors (Area Office leader)', o.errors.length === 0, o.errors.join(' | '));
    await page.close();
    w.g.__user.email = 'prin@houstonisd.org';
    o = await openPage(browser, w); page = o.page;
    check('a principal is recognized', /Principal · view only/.test(await page.textContent('#whoRole')));
    await page.click('[data-tab="campuses"]');
    await page.click('[data-chip="all"]');
    await page.fill('#q', 'Anderson');
    await page.click('.crow[data-c="Anderson ES"] .campbtn');
    var pl = await page.$$eval('#pBody a[href^="https://drive.google.com/"]', function (as) { return as.length; });
    check('a principal sees every file of their campus, and cannot change anything', pl >= 2 && (await page.$$('#panel .seg button')).length === 0, String(pl));
    check('no page errors (principal)', o.errors.length === 0, o.errors.join(' | '));
    await page.close();
    w.g.__user.email = '';
    w.g.__props.OPEN_DETAILS = '1';

    /* staff get the links to hand out */
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Pat Staff', w.p.pass['Pat Staff']);
    await page.click('[data-tab="overview"]');
    await page.click('details.links summary');
    var links = await page.$$eval('details.links input', function (xs) { return xs.map(function (x) { return x.value; }); });
    check('staff see a link for each Area Office', links.length === 8 && links.some(function (l) { return /\?ao=NES%20Elementary$/.test(l); }), links.join(' '));
    await page.close();

    /* ---------- tester feedback (2026-10-20): combined filters, sorting, tooltips, C1 table, progress by month, find a campus ---------- */
    w.g.saveSnapshot_(new Date());
    o = await openPage(browser, w); page = o.page;
    check('progress by month is not on the public page', await page.isHidden('#histSec'));
    check('the C1 table is for FACE staff only', await page.isHidden('#c1Sec'));
    await page.click('#areas thead [data-sort="area|roster"]');
    var firstArea = await page.$eval('#areas tbody tr th', function (x) { return x.textContent; });
    check('a column heading sorts the Area Office table, largest first', firstArea === 'NES Elementary', firstArea);
    await page.click('[data-tab="campuses"]');
    await page.click('[data-chip="regall"]');
    var regs = (await page.$$('#clist .crow')).length;
    await page.click('[data-chip="Can Fundraise"]');
    check('Registered includes the campuses that can fundraise', regs >= (await page.$$('#clist .crow')).length);
    await page.click('[data-tab="overview"]');
    await page.click('.kpi.k4');
    var ex = await page.textContent('#chips .chip.extra');
    check('the Overview\'s In progress tile shows as one more chip, chosen', /^In progress\s*12$/.test(ex.trim()) && (await page.getAttribute('#chips .chip.extra', 'aria-pressed')) === 'true', ex);
    await page.click('[data-chip="pta"]');
    check('choosing a filter replaces it', !(await page.$('#chips .chip.extra')) && (await page.$$('#clist .crow')).length === 11);
    await page.hover('.crow[data-c="Oak Forest ES"] .strip .ic.R');
    await page.waitForSelector('#tip:not([hidden])', { timeout: 1000 });
    check('a document icon explains itself at once', /Training certificate/.test(await page.textContent('#tip')) && /waiting for review/i.test(await page.textContent('#tip')), await page.textContent('#tip'));
    check('the icon legend is shown', /Waiting for review \(not late\)/.test(await page.textContent('#legend')));
    await page.click('[data-tab="campus"]');
    await page.fill('#pickFind', 'oak for');
    check('My campus: type to find a campus', (await page.inputValue('#pickCampus')) === 'Oak Forest ES' && /Oak Forest ES/.test(await page.textContent('#campusCard')));
    check('no page errors (feedback views)', o.errors.length === 0, o.errors.join(' | '));
    await page.close();
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Pat Staff', w.p.pass['Pat Staff']);
    await page.click('[data-tab="overview"]');
    check('FACE staff see progress by month', !(await page.isHidden('#histSec')) && (await page.$$('#hist tbody tr')).length === 1);
    check('FACE staff see the Documents section', !(await page.isHidden('#docSec')));
    var c1t = await page.textContent('#c1tab');
    check('FACE staff see each C1 with their campuses and what waits for them', !(await page.isHidden('#c1Sec')) && /Ms\. Lee/.test(c1t) && /No C1 assigned/.test(c1t), c1t.slice(0, 300));
    await page.click('[data-tab="review"]');
    var rq = await page.$('#rq');
    check('the review list has a search box and says whose queue it is', !!rq && /whole team's review queue/.test(await page.textContent('#reviewBody')));
    if (rq) { await page.fill('#rq', 'ash'); check('review search narrows the list', (await page.$$eval('#rlist li', function (l) { return l.map(function (x) { return x.getAttribute('data-c'); }); })).join() === 'Ashford ES'); }
    await page.close();

    /* ---------- automatic reminders on: the Remind C1s buttons give way to one line ---------- */
    w.g.setReminderHook_('https://prod-1.westus.logic.azure.com:443/workflows/x/triggers/manual/paths/invoke?sig=1');
    w.g.turnOnC1Reminders();
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Pat Staff', w.p.pass['Pat Staff']);
    var auto = await page.textContent('#reviewBody');
    check('automatic reminders: one status line, no buttons', /C1 reminders\s*automatic/.test(auto) && /Right now that is 1 C1/.test(auto) && (await page.$$('.c1list')).length === 0, auto.slice(-300));
    await page.close();

    /* ---------- principal confirmation (2026-10-26f): FACE staff only while it is tested ---------- */
    o = await openPage(browser, w); page = o.page;
    await page.click('[data-tab="campus"]');
    await page.selectOption('#pickCampus', 'Anderson ES');
    check('leadership does not see the confirm box while FACE tests it', !(await page.$('#campusCard .conf')));
    await page.close();
    o = await openPage(browser, w); page = o.page;
    await signIn(page, 'Pat Staff', w.p.pass['Pat Staff']);
    await page.click('[data-tab="overview"]');
    check('the Overview shows Principal confirmation to staff', !(await page.isHidden('#confSec')) && /Not answered/.test(await page.textContent('#conftab')));
    await page.click('[data-tab="campus"]');
    await page.selectOption('#pickCampus', 'Anderson ES');
    var cbox = await page.textContent('#campusCard .conf');
    await (await page.$('#campusCard .ccard')).screenshot({ path: path.join(SHOTS, 'confirm-ask.png') });
    check('staff see the confirm box, marked as a test', /Are these PTO\/PTA details correct\?/.test(cbox) && /Testing: only FACE staff see this/.test(cbox) && /Yes, this is correct/.test(cbox), cbox);
    await page.click('#campusCard [data-conf="wrong"]');
    await page.click('#campusCard [data-conf-send="wrong"]');
    check('something is wrong asks what', /Say what is wrong/.test(await page.textContent('#campusCard .conf')));
    await page.fill('#confNote', 'The secretary changed');
    await page.click('#campusCard [data-conf-send="wrong"]');
    await page.waitForFunction(function () { return /A problem was reported/.test(document.querySelector('#campusCard .conf').textContent); }, null, { timeout: 10000 });
    cbox = await page.textContent('#campusCard .conf');
    await (await page.$('#campusCard .ccard')).screenshot({ path: path.join(SHOTS, 'confirm.png') });
    check('the answer is saved and shown, with the note', /The secretary changed/.test(cbox) && /Thank you/.test(cbox), cbox);
    await page.selectOption('#pickCampus', 'Askew ES');
    check('a campus with nothing on file asks whether it has a PTO/PTA', /Does this campus have a PTO or PTA\?/.test(await page.textContent('#campusCard .conf')));
    await page.click('#campusCard [data-conf="none"]');
    await page.waitForFunction(function () { return /does not have a PTO\/PTA/.test(document.querySelector('#campusCard .conf').textContent); }, null, { timeout: 10000 });
    await page.click('[data-tab="review"]');
    var fromP = await page.textContent('#reviewBody');
    check('Review lists what principals reported', /From principals: please check/.test(fromP) && /Anderson ES/.test(fromP) && /Askew ES/.test(fromP), fromP.slice(-400));
    await page.click('[data-tab="overview"]');
    await page.click('#conftab [data-st="conf:wrong"]');
    var cl = await page.$$eval('#clist .crow', function (rs) { return rs.map(function (r) { return r.getAttribute('data-c'); }); });
    check('a number in Principal confirmation lists those campuses', cl.join() === 'Anderson ES' && /Principal reported a problem/.test(await page.textContent('#chips .chip.extra')), cl.join());
    check('no page errors (confirmation)', o.errors.length === 0, o.errors.join(' | '));
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
