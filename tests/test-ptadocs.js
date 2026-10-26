/* Tests for PTAs on every document (2026-10-26): four boxes come from the Texas PTA spreadsheet. Run through test-script.js. */
'use strict';
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var regRow = base.regRow, logRows = base.logRows, withPeople = base.withPeople;
var roster = require('./fixtures/texas-pta-2026-10-15');
var withAreaTab = require('./test-new-helpers').withAreaTab;

function paste(g, rows) {
  var sh = g.__ss.getSheetByName('Texas PTA Paste') || g.__ss.insertSheet('Texas PTA Paste');
  sh.clearContents();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}
function setCell(g, campus, header, value) {
  var t = g.table_('Campus Register'), r = g.findRow_(t, g.currentYear_(), campus);
  t.sh.getRange(r, t.col[header] + 1).setValue(value);
}
function tracker() { var g = h.load(); withAreaTab(g); g.applyOctober2026_({ reset: false }); return g; }
function stage(g, campus) { var t = g.table_('Campus Register'); return g.stageOf_(t.values[g.findRow_(t, g.currentYear_(), campus) - 1], t, g.itemFlags_()); }

test('the import fills a PTA\'s bylaws, bank, budget and 501(c) boxes from Texas PTA', function () {
  var g = tracker();
  paste(g, roster.rows());
  var r = g.importTexasPta_();
  ok(r.docs > 0, 'boxes changed: ' + r.docs);
  ok(/PTA document boxes were updated on the Campus Register from Texas PTA/.test(g.texasPtaSummary_(r)), g.texasPtaSummary_(r));
  // Hamilton: Good Standing, JoinPTA ticked, every SOA ticked
  var a = regRow(g, 'Hamilton MS');
  eq([a['Bylaws'], a['Bank Verification Letter'], a['Budget or Financial Report'], a['Proof of 501c Status']].join(), 'Accepted,Accepted,Accepted,Accepted');
  // Browning: Inactive (still has 501(c)), JoinPTA ticked, bylaws ticked, 990 not ticked
  var b = regRow(g, 'Browning ES');
  eq([b['Bylaws'], b['Bank Verification Letter'], b['Budget or Financial Report'], b['Proof of 501c Status']].join(), 'Accepted,Accepted,Not Received,Accepted');
  eq(b['Training Certificate'], 'Not Received', 'what the PTA sends FACE is not touched');
  var tx = g.__ss.getSheetByName('Texas PTA').values();
  ok(tx[0].indexOf('JoinPTA Activation') >= 0, 'the Texas PTA tab has the JoinPTA.org column');
  var L = logRows(g).filter(function (x) { return x[1] === 'Texas PTA' && x[2] === 'Browning ES'; });
  eq(L.length, 3, 'one log line per box that changed');
  ok(L.some(function (x) { return /^Accepted: Proof of 501c Status\. Remark: From the Texas PTA spreadsheet \(updated THU, October 15, 2026 at 8:48 AM\): PTA status Inactive$/.test(x[7]); }), L.map(function (x) { return x[7]; }).join(' / '));
  eq(g.importTexasPta_().docs, 0, 'importing the same spreadsheet again changes nothing');
});

test('a PTA with every document is Can Fundraise; Texas PTA log lines are not "sent something" or a review', function () {
  var g = tracker();
  paste(g, roster.rows());
  g.importTexasPta_();
  eq(stage(g, 'Hamilton MS'), 'In progress', 'Texas PTA boxes are done; the training certificate and officer form are still missing');
  setCell(g, 'Hamilton MS', 'Training Certificate', 'Accepted'); setCell(g, 'Hamilton MS', 'Officer Information', 'Accepted');
  eq(stage(g, 'Hamilton MS'), 'Legalized');
  setCell(g, 'Browning ES', 'Training Certificate', 'Accepted'); setCell(g, 'Browning ES', 'Officer Information', 'Accepted');
  eq(stage(g, 'Browning ES'), 'Registered', 'registered, but no SOA 990 yet');
  ok(!g.sentThisYear_(g.currentYear_())[g.norm_('Browning ES')], 'Texas PTA lines are not something the campus sent');
  var turn = g.logStats_().turn[g.currentYear_()] || {};
  ok(!turn['Texas PTA'], 'Texas PTA is not counted as a reviewer');
});

test('next week: an X on Texas PTA takes the box back to Not Received', function () {
  var g = tracker();
  paste(g, roster.rows());
  g.importTexasPta_();
  var rows = roster.rows(), hd = rows[2], bi = hd.indexOf('SOA Bylaws');
  rows.forEach(function (r) { if (r[1] === 'Alexander Hamilton Middle School') r[bi] = 'X'; });
  paste(g, rows);
  eq(g.importTexasPta_().docs, 1);
  eq(regRow(g, 'Hamilton MS')['Bylaws'], 'Not Received');
});

test('a PTA that is not on the Texas PTA spreadsheet has those four boxes Not Received', function () {
  var g = tracker();
  setCell(g, 'Anderson ES', 'Org Type', 'PTA');
  setCell(g, 'Anderson ES', 'Bylaws', 'Not Needed');      // as the October 15 update left it
  paste(g, roster.rows());
  g.importTexasPta_();
  eq(regRow(g, 'Anderson ES')['Bylaws'], 'Not Received');
  var c = logRows(g).filter(function (x) { return x[2] === 'Anderson ES'; })[0];
  ok(/From the Texas PTA spreadsheet .*SOA Bylaws not listed/.test(c[7]), c[7]);
});

test('a C1 cannot check off a Texas PTA box for a PTA, but can for a PTO', function () {
  var g = tracker(), p = withPeople(g);
  setCell(g, 'Anderson ES', 'Org Type', 'PTA');
  var threw = '';
  try { g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Accepted', remark: '' }], null); } catch (e) { threw = e.message; }
  ok(/comes from the Texas PTA spreadsheet each week/.test(threw), threw);
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Training Certificate', status: 'Accepted', remark: '' }], null);
  eq(regRow(g, 'Anderson ES')['Training Certificate'], 'Accepted', 'what a PTA sends is still checked off by a C1');
  setCell(g, 'Ashford ES', 'Org Type', 'PTO');
  g.saveChecklist(p.c1, 'Ashford ES', '2026-27', [{ key: 'Bylaws', status: 'Accepted', remark: '' }], null);
  eq(regRow(g, 'Ashford ES')['Bylaws'], 'Accepted');
});

test('the one-time update: formulas, a fresh import and Start Here wording; safe to run twice', function () {
  var g = tracker();
  paste(g, roster.rows());
  var r = g.applyPtaDocs_();
  ok(r.ok, r.lines.join('\n'));
  ok(/^Backup saved/.test(r.lines[0]));
  eq(regRow(g, 'Hamilton MS')['Bylaws'], 'Accepted');
  var t = g.table_('Campus Register');
  ok(t.sh.getRange(2, t.col['Status'] + 1).getFormulas()[0][0].indexOf('"PTA"') < 0, 'no PTA rule in the formulas');
  var start = g.__ss.getSheetByName('Start Here').values().map(function (x) { return String(x[0]); });
  ok(start.some(function (x) { return /^Registered: .*A PTA counts the same way/.test(x); }), 'Registered line');
  ok(start.some(function (x) { return /^Legalized: .*JoinPTA\.org activation/.test(x); }), 'Legalized line');
  var again = g.applyPtaDocs_();
  ok(again.ok && again.lines.some(function (l) { return /Start Here was already up to date/.test(l); }), again.lines.join('\n'));
  ok(again.lines.some(function (l) { return /0 PTA document boxes were updated/.test(l); }), again.lines.join('\n'));
});
