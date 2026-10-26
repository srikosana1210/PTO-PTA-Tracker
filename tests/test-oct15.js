/* Tests for the October 15, 2026 changes in Code.gs. Run through test-script.js (node tests/test-script.js). */
'use strict';
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var regRow = base.regRow, logRows = base.logRows, sub = base.sub, upload = base.upload, withPeople = base.withPeople;

function setCell(g, campus, header, value) {
  var t = g.table_('Campus Register'), r = g.findRow_(t, '2026-27', campus);
  t.sh.getRange(r, t.col[header] + 1).setValue(value);
}

/* ---------- the officer information form needs no review ---------- */
test('an officer form from the form counts at once: Accepted, and not waiting for review', function () {
  var g = h.load();
  g.processSubmission_(sub('Anderson ES', { officer: true }));
  eq(regRow(g, 'Anderson ES')['Officer Information'], 'Accepted');
  eq(g.waitingByCampus_('2026-27')[g.norm_('Anderson ES')].items.length, 0, 'nothing for a C1 to review');
});

/* ---------- files keep their names ---------- */
test('an uploaded file keeps its own name and still goes into the campus folder', function () {
  var g = h.load();
  var u = upload(g, 'Training Certificate', 'Training cert Sept 2026.pdf');
  g.processSubmission_(sub('Anderson ES', { uploads: [u] }));
  var f = g.DriveApp.getFileById(u.ids[0]);
  eq(f.getName(), 'Training cert Sept 2026.pdf');
  eq(logRows(g)[0][4], 'Training cert Sept 2026.pdf');
  eq(regRow(g, 'Anderson ES')['Training Certificate'], 'Received');
});

/* ---------- Articles of Incorporation and Insurance are retired ---------- */
test('the dashboard no longer lists Articles of Incorporation or Insurance', function () {
  var g = h.load();
  var p = g.getPayload_(null);
  eq(p.itemKeys.join('|'), 'Bylaws|Officer Information|Training Certificate|Budget or Financial Report|Proof of 501c Status|Bank Verification Letter');
  eq(p.labels.length, 6); eq(p.reg.length, 6); eq(p.req.length, 6);
  ok(p.rows.every(function (r) { return r.d.length === 6; }), 'six status letters per campus');
  eq(g.uploadItems_().length, 5, 'five file questions on the form');
});

test('a file sent under a retired question is filed and logged, and changes no status', function () {
  var g = h.load();
  var it = g.itemByKey_('Insurance');
  g.processSubmission_(sub('Anderson ES', { retired: [{ item: it, ids: [g.__drive.upload('ins.pdf').getId()] }] }));
  var row = regRow(g, 'Anderson ES');
  eq(row['Insurance'], 'Not Received');
  eq(row['Has PTO or PTA'], 'Yes', 'sending something still makes the campus a PTO/PTA');
  var L = logRows(g);
  eq(L[0][4], 'ins.pdf');
  ok(/no longer asks for this document/.test(L[0][7]), L[0][7]);
});

test('a retired item cannot be checked off from an old page', function () {
  var g = h.load(), p = withPeople(g);
  var threw = '';
  try { g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Articles of Incorporation', status: 'Accepted', remark: '' }], null); } catch (e) { threw = e.message; }
  ok(/no longer asks for Articles of Incorporation/.test(threw), threw);
});

/* ---------- PTAs: the training certificate and the officer information form ---------- */
test('a PTA sending bylaws: filed and logged, but its checklist is left alone', function () {
  var g = h.load();
  setCell(g, 'Anderson ES', 'Org Type', 'PTA');
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws', 'bylaws.pdf'), upload(g, 'Training Certificate', 'cert.pdf')] }));
  var row = regRow(g, 'Anderson ES');
  eq(row['Bylaws'], 'Not Received');
  eq(row['Training Certificate'], 'Received');
  var L = logRows(g);
  ok(/Filed only: a PTA sends FACE the training certificate and the officer information form; this box comes from the Texas PTA spreadsheet/.test(L[0][7]), L[0][7]);
  eq(g.waitingByCampus_('2026-27')[g.norm_('Anderson ES')].items.join(), 'Training Certificate');
});

test('the email to a PTA asks only for its two documents', function () {
  var g = h.load(), p = withPeople(g);
  setCell(g, 'Anderson ES', 'Org Type', 'PTA');
  var r = g.logResendRequest(p.c1, 'Anderson ES', '2026-27', 'ann@example.org');
  ok(/still needed: Officer Information, Training Certificate\. To: /.test(r.note), r.note);
});

test('the register formulas: a PTA counts the same as a PTO (2026-10-26)', function () {
  var g = h.load();
  g.rewriteRegisterFormulas_(true);
  var t = g.table_('Campus Register'), f = t.sh.getRange(2, t.col['Status'] + 1).getFormulas()[0][0];
  ok(f.indexOf('"PTA"') < 0 && /"Legalized"/.test(f), f);
  var n = t.sh.getRange(2, t.col['Not Yet Accepted'] + 1).getFormulas()[0][0];
  ok(n.indexOf('"PTA"') < 0, n);
});

/* ---------- leadership: names of C1s, links ---------- */
test('each campus carries its C1 by name only, for everyone; contacts stay private', function () {
  var g = h.load(); withPeople(g);
  var p = g.getPayload_(null);
  var a = p.rows.filter(function (r) { return r.campus === 'Anderson ES'; })[0];
  eq(a.c1, 'Ms. Lee');
  eq(p.c1s, null, 'no C1 emails without signing in');
  ok(JSON.stringify(p).indexOf('lee@') < 0, 'no email address anywhere');
});

test('a link for an Area Office or a campus reaches the page, escaped', function () {
  var g = h.load();
  var out = g.doGet({ parameter: { ao: 'NES Elementary', campus: '</script><b>x' } }).getContent();
  var m = out.match(/<script id="pto-data" type="application\/json">([^<]*)<\/script>/);
  ok(m, 'the data block is intact');
  var d = JSON.parse(m[1]);
  eq(d.ao, 'NES Elementary');
  eq(d.campus, '</script><b>x');
  ok(g.doGet({ parameter: {} }).getContent().indexOf('<script id="pto-data" type="application/json">{"live":true,"boot":true}</script>') > 0, 'no link, nothing added');
});

/* ---------- the one-time update ---------- */
test('the October 15 update: officer forms accepted, retired documents not needed, a PTA\'s other boxes left to Texas PTA, safe to run twice', function () {
  var g = h.load();
  g.applyOctober2026_({ reset: false });
  setCell(g, 'Anderson ES', 'Officer Information', 'Received');
  setCell(g, 'Anderson ES', 'Articles of Incorporation', 'Received');
  setCell(g, 'Ashford ES', 'Org Type', 'PTA');
  setCell(g, 'Ashford ES', 'Bylaws', 'Needs Correction');
  setCell(g, 'Ashford ES', 'Training Certificate', 'Received');
  var r = g.applyOctober15_();
  ok(r.ok, r.lines.join('\n'));
  ok(/^Backup saved/.test(r.lines[0]));
  var a = regRow(g, 'Anderson ES'), b = regRow(g, 'Ashford ES');
  eq(a['Officer Information'], 'Accepted');
  eq(a['Articles of Incorporation'], 'Not Needed');
  eq(b['Bylaws'], 'Needs Correction', 'since 2026-10-26 a PTA\'s bylaws box is left to the Texas PTA import');
  eq(b['Training Certificate'], 'Received', 'a PTA document it does track still waits for review');
  var t = g.table_('Campus Register');
  ok(t.sh.hiddenCols[t.col['Articles of Incorporation'] + 1] && t.sh.hiddenCols[t.col['Insurance'] + 1], 'retired columns hidden');
  var start = g.__ss.getSheetByName('Start Here').values().map(function (x) { return String(x[0]); });
  ok(start.some(function (x) { return /^Registered: .*A PTA counts the same way/.test(x); }), 'Start Here says how PTAs count');
  ok(start.some(function (x) { return /^3\. Submit\. Each file keeps the name it was sent with/.test(x); }), 'Start Here no longer talks about renaming');
  ok(!start.some(function (x) { return /eight-item checklist|renamed to school year/.test(x); }), 'old wording gone');
  var again = g.applyOctober15_();
  ok(again.ok, again.lines.join('\n'));
  ok(again.lines.some(function (l) { return /No officer information form was waiting/.test(l); }), 'second run changes nothing');
  eq(g.updateWordingOctober15_(), 0, 'wording already up to date');
});
