/* Tests for removing a file, or moving it to the right campus (2026-11-10). Run through test-script.js. */
'use strict';
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var regRow = base.regRow, logRows = base.logRows, sub = base.sub, upload = base.upload, withPeople = base.withPeople;
function threw(f) { try { f(); return ''; } catch (e) { return e.message; } }
function linkOf(g, campus, key) { return logRows(g).filter(function (r) { return r[2] === campus && r[3] === key; })[0][5]; }

test('remove: the file leaves the campus, goes to Removed files, and the document is Not received again', function () {
  var g = h.load(), p = withPeople(g);
  var u = upload(g, 'Bylaws', 'other-school-bylaws.pdf');
  g.processSubmission_(sub('Anderson ES', { uploads: [u] }));
  eq(regRow(g, 'Anderson ES')['Bylaws'], 'Received');
  var link = linkOf(g, 'Anderson ES', 'Bylaws');
  ok(/Say why/.test(threw(function () { g.removeDocument(p.c1, 'Anderson ES', '2026-27', link, 'Bylaws', ' ', ''); })));
  var r = g.removeDocument(p.c1, 'Anderson ES', '2026-27', link, 'Bylaws', 'Sent for a different campus', '');
  ok(r.ok);
  eq(regRow(g, 'Anderson ES')['Bylaws'], 'Not Received');
  var row = logRows(g).filter(function (x) { return x[5] === link; })[0];
  eq(row[3], '', 'the line no longer counts as a document of the campus');
  ok(/^Removed \(Bylaws\): Sent for a different campus\. By Ms\. Lee \(C1\)/.test(row[7]), row[7]);
  eq(g.DriveApp.getFileById(u.ids[0]).parent.name, 'Removed files', 'kept in Drive, not deleted');
  var pub = g.openDetail_(g.buildDetail_(true, 'America/Chicago'))['Anderson ES||2026-27'];
  ok(!pub.a.some(function (e) { return e[3] === link; }), 'nobody else sees the file any more');
});

test('remove: an accepted document with another file stays accepted', function () {
  var g = h.load(), p = withPeople(g);
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws', 'a.pdf'), upload(g, 'Bylaws', 'b.pdf')] }));
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Accepted', remark: '' }], null);
  var link = linkOf(g, 'Anderson ES', 'Bylaws');
  g.removeDocument(p.staff, 'Anderson ES', '2026-27', link, 'Bylaws', 'Duplicate', '');
  eq(regRow(g, 'Anderson ES')['Bylaws'], 'Accepted');
});

test('move to the right campus: it arrives there waiting for review, and leaves this one', function () {
  var g = h.load(), p = withPeople(g);
  var u = upload(g, 'Training Certificate', 'askew-cert.pdf');
  g.processSubmission_(sub('Anderson ES', { uploads: [u] }));
  var link = linkOf(g, 'Anderson ES', 'Training Certificate');
  ok(/not on the Campus Register/.test(threw(function () { g.removeDocument(p.c1, 'Anderson ES', '2026-27', link, 'Training Certificate', 'x', 'Nowhere ES'); })));
  var r = g.removeDocument(p.c1, 'Anderson ES', '2026-27', link, 'Training Certificate', 'Sent for a different campus', 'Askew ES');
  eq(r.dest, 'Askew ES');
  eq(regRow(g, 'Anderson ES')['Training Certificate'], 'Not Received');
  eq(regRow(g, 'Askew ES')['Training Certificate'], 'Received');
  eq(regRow(g, 'Askew ES')['Has PTO or PTA'], 'Yes');
  var arrived = logRows(g).filter(function (x) { return x[2] === 'Askew ES' && x[3] === 'Training Certificate'; });
  eq(arrived.length, 1); eq(arrived[0][5], link);
  ok(/Moved here from Anderson ES by Ms\. Lee \(C1\)/.test(arrived[0][7]), arrived[0][7]);
  eq(g.DriveApp.getFileById(u.ids[0]).parent.name, 'Askew ES', 'in the right campus folder');
});

test('who may: only the campus\'s C1 or FACE staff', function () {
  var g = h.load(), p = withPeople(g);
  g.processSubmission_(sub('Almeda ES', { uploads: [upload(g, 'Bylaws', 'x.pdf')] }));
  var link = linkOf(g, 'Almeda ES', 'Bylaws');
  ok(/not on your list of campuses/.test(threw(function () { g.removeDocument(p.c1, 'Almeda ES', '2026-27', link, 'Bylaws', 'Duplicate', ''); })));
  ok(/sign-in has ended/.test(threw(function () { g.removeDocument('', 'Almeda ES', '2026-27', link, 'Bylaws', 'Duplicate', ''); })));
});
