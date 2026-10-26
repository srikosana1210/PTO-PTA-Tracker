/* Tests for uploading and refiling documents on the dashboard (2026-10-23). Run through test-script.js (node tests/test-script.js). */
'use strict';
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var regRow = base.regRow, logRows = base.logRows, sub = base.sub, upload = base.upload, withPeople = base.withPeople;
var PDF = Buffer.from('%PDF-1.4 a small test file').toString('base64');
function threw(fn) { try { fn(); return ''; } catch (e) { return e.message; } }

test('upload and accept: the file goes into the campus folder under its own name, Accepted, logged with who', function () {
  var g = h.load(), p = withPeople(g);
  var r = g.uploadDocument(p.c1, 'Anderson ES', '2026-27', 'Bylaws', 'Anderson Bylaws signed.pdf', PDF, 'accept');
  ok(r.ok && r.accepted);
  eq(regRow(g, 'Anderson ES')['Bylaws'], 'Accepted');
  eq(r.file.name, 'Anderson Bylaws signed.pdf');
  ok(/^https:/.test(r.file.link));
  var L = logRows(g);
  ok(L.some(function (x) { return x[3] === 'Bylaws' && x[4] === 'Anderson Bylaws signed.pdf' && /Uploaded on the dashboard by Ms\. Lee/.test(x[7]) && x[1] === 'Ms. Lee (C1)'; }), 'the file line');
  ok(L.some(function (x) { return x[7] === 'Accepted: Bylaws'; }), 'the decision line');
  var rv = g.getDashboard(p.staff).detail['Anderson ES||2026-27'].rv['Bylaws'];
  eq(rv[0] + '|' + rv[2], 'Accepted|Ms. Lee');
});

test('upload for review: Received, waiting for review', function () {
  var g = h.load(), p = withPeople(g);
  g.uploadDocument(p.staff, 'Ashford ES', '2026-27', 'Training Certificate', 'cert.jpg', PDF, 'review');
  eq(regRow(g, 'Ashford ES')['Training Certificate'], 'Received');
});

test('upload: who may, and what is refused, in plain words', function () {
  var g = h.load(), p = withPeople(g);
  ok(/not on your list of campuses/.test(threw(function () { g.uploadDocument(p.c1, 'Almeda ES', '2026-27', 'Bylaws', 'b.pdf', PDF, 'accept'); })), 'another C1\'s campus');
  ok(/sign-in has ended/.test(threw(function () { g.uploadDocument('', 'Anderson ES', '2026-27', 'Bylaws', 'b.pdf', PDF, 'accept'); })), 'not signed in');
  ok(/cannot be uploaded/.test(threw(function () { g.uploadDocument(p.c1, 'Anderson ES', '2026-27', 'Bylaws', 'b.exe', PDF, 'accept'); })), 'a program');
  ok(/cannot be uploaded here/.test(threw(function () { g.uploadDocument(p.c1, 'Anderson ES', '2026-27', 'Officer Information', 'o.pdf', PDF, 'accept'); })), 'the officer form is not a file');
  ok(/cannot be uploaded here/.test(threw(function () { g.uploadDocument(p.c1, 'Anderson ES', '2026-27', 'Insurance', 'i.pdf', PDF, 'accept'); })), 'a retired document');
  var big = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
  ok(/larger than 10 MB/.test(threw(function () { g.uploadDocument(p.c1, 'Anderson ES', '2026-27', 'Bylaws', 'b.pdf', big, 'accept'); })), 'too big');
  var t = g.table_('Campus Register'); t.sh.getRange(g.findRow_(t, '2026-27', 'Anderson ES'), t.col['Org Type'] + 1).setValue('PTA');
  ok(/comes from the Texas PTA spreadsheet/.test(threw(function () { g.uploadDocument(p.c1, 'Anderson ES', '2026-27', 'Bylaws', 'b.pdf', PDF, 'accept'); })), 'a PTA box that comes from Texas PTA');
});

test('wrong document: the file moves to the right one, which is accepted; the wrong one is not there after all', function () {
  var g = h.load(), p = withPeople(g);
  var u = upload(g, 'Training Certificate', 'really-bylaws.pdf');
  g.processSubmission_(sub('Anderson ES', { uploads: [u] }));
  eq(regRow(g, 'Anderson ES')['Training Certificate'], 'Received');
  var link = g.DriveApp.getFileById(u.ids[0]).getUrl();
  var r = g.refileDocument(p.c1, 'Anderson ES', '2026-27', link, 'Training Certificate', 'Bylaws', 'accept');
  ok(r.ok);
  var row = regRow(g, 'Anderson ES');
  eq(row['Bylaws'], 'Accepted');
  eq(row['Training Certificate'], 'Not Received');
  var L = logRows(g);
  ok(L.some(function (x) { return x[3] === 'Bylaws' && x[4] === 'really-bylaws.pdf'; }), 'the file line now says Bylaws');
  ok(!L.some(function (x) { return x[3] === 'Training Certificate'; }), 'and no longer Training Certificate');
  ok(L.some(function (x) { return /^Moved "really-bylaws\.pdf" from Training Certificate to Bylaws/.test(x[7]) && x[1] === 'Ms. Lee (C1)'; }), 'who moved it');
  ok(/not found under Training Certificate/.test(threw(function () { g.refileDocument(p.c1, 'Anderson ES', '2026-27', link, 'Training Certificate', 'Bylaws', 'accept'); })), 'moving it twice');
});

test('wrong document: a document already accepted is left for the reviewer', function () {
  var g = h.load(), p = withPeople(g);
  var u1 = upload(g, 'Training Certificate', 'cert.pdf'), u2 = upload(g, 'Training Certificate', 'bylaws-by-mistake.pdf');
  g.processSubmission_(sub('Anderson ES', { uploads: [u1] }));
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Training Certificate', status: 'Accepted', remark: '' }], null);
  g.processSubmission_(sub('Anderson ES', { uploads: [u2] }));
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Training Certificate', status: 'Accepted', remark: '' }], null);
  g.refileDocument(p.c1, 'Anderson ES', '2026-27', g.DriveApp.getFileById(u2.ids[0]).getUrl(), 'Training Certificate', 'Bylaws', 'review');
  var row = regRow(g, 'Anderson ES');
  eq(row['Bylaws'], 'Received');
  eq(row['Training Certificate'], 'Accepted', 'the real certificate is still there');
});
