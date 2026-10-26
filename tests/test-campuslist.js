/* Tests for FACE's campus list (2026-10-26). Run through test-script.js (node tests/test-script.js). */
'use strict';
var path = require('path');
var h = require('./harness');
var base = require('./test-script');
var helpers = require('./test-new-helpers');
var test = h.test, eq = h.eq, ok = h.ok;
var regRow = base.regRow, logRows = base.logRows, sub = base.sub, upload = base.upload;

function rows(g, year) { var t = g.table_('Campus Register'); return t.values.slice(1).filter(function (v) { return String(v[t.col['Campus']]).trim() && String(v[t.col['School Year']]) === (year || '2026-27'); }); }
function col(g, n) { return g.table_('Campus Register').col[n]; }
function setCell(g, campus, header, value) { var t = g.table_('Campus Register'), r = g.findRow_(t, '2026-27', campus); t.sh.getRange(r, t.col[header] + 1).setValue(value); }
/** The template as FACE's live sheet looked on 2026-10-26: old spellings, and two campuses added twice by the officer import. */
function liveLike() {
  var g = h.load({ fixture: 'template' });
  var t = g.table_('Campus Register'), at = g.firstEmptyRow_(t);
  g.writeInputRows_(t, at, [
    { 'School Year': '2026-27', 'Campus': 'White E ES', 'Area Office': '', 'Has PTO or PTA': 'Yes', 'Org Type': 'PTO', 'Org Name': 'PTO', 'Officer Information': 'Accepted' },
    { 'School Year': '2026-27', 'Campus': 'Cage ES', 'Area Office': '', 'Has PTO or PTA': 'Yes', 'Org Type': 'PTO', 'Org Name': 'Rufus Cage PTO', 'Officer Information': 'Accepted' }]);
  g.appendLog_([[new Date(Date.UTC(2026, 9, 14)), 'x@example.org', 'Cage ES', 'Officer Information', 'Officer form: Rufus Cage PTO (2 officers)', '', '2026-27', '']]);
  setCell(g, 'Cage ES (@Lantrip ES)', 'Has PTO or PTA', 'No');      // marked No from FACE's no-PTO list, under the old spelling
  // FACE's list in the Area Office Campuses tab, with FACE's own headings
  var list = helpers.csvRows(path.join(__dirname, '..', 'sheet', 'Area Office Campuses.csv')).map(function (r) { return [r[0], r[1]]; });
  list[0] = ['ShortName', 'AreaOffice'];
  var sh = g.__ss.getSheetByName('Area Office Campuses'); sh.clearContents(); sh.getRange(1, 1, list.length, 2).setValues(list);
  return g;
}

test('the campus list: duplicates merged, FACE\'s short names, every campus in an Area Office', function () {
  var g = liveLike();
  eq(rows(g).filter(function (v) { return ['White E ES', 'White, Ed. ES', 'Cage ES', 'Cage ES (@Lantrip ES)'].indexOf(v[col(g, 'Campus')]) >= 0; }).length, 4, 'two campuses, four rows, before');
  var r = g.applyCampusList_();
  ok(r.ok, r.lines.join('\n'));
  ok(r.lines.some(function (l) { return /Merged 2 campuses/.test(l) && /White E ES/.test(l) && /Cage ES/.test(l); }), r.lines.join('\n'));
  var white = rows(g).filter(function (v) { return /white/i.test(v[col(g, 'Campus')]) && /e es|ed\./i.test(v[col(g, 'Campus')]); });
  eq(white.length, 1, 'one White E ES');
  var w = regRow(g, 'White E ES');
  eq(w['Area Office'], 'NES Elementary'); eq(w['Officer Information'], 'Accepted'); eq(w['Has PTO or PTA'], 'Yes');
  var c = regRow(g, 'Cage ES');
  eq(c['Has PTO or PTA'], 'Yes', 'it sent its officer form, so it has a PTO even though the old row said No');
  eq(c['Org Name'], 'Rufus Cage PTO');
  ok(!regRow(g, 'Cage ES (@Lantrip ES)') && !regRow(g, 'White, Ed. ES'), 'the old spellings are gone');
  eq(regRow(g, 'HSLJ')['Area Office'], 'EAS Secondary', 'Law & Justice HS is now HSLJ');
  eq(regRow(g, 'SOAR Center')['Area Office'], 'OOA');
  eq(regRow(g, 'Energized MS')['Area Office'], 'COSO');
  eq(regRow(g, 'Kinder HSPVA')['Area Office'], '1882');
  ok(regRow(g, 'Collaborative For Children Pre-K'), 'a campus missing from the register is added');
  var noArea = rows(g).filter(function (v) { return !String(v[col(g, 'Area Office')]).trim(); }).map(function (v) { return v[col(g, 'Campus')]; });
  eq(noArea.join(), '', 'no campus without an Area Office');
  eq(rows(g).length, 264, 'exactly FACE\'s 264 campuses');
  ok(logRows(g).some(function (x) { return x[2] === 'Cage ES'; }), 'the log follows');
  var again = g.applyCampusList_();
  ok(again.ok && !again.lines.some(function (l) { return /Merged/.test(l); }), 'safe to run twice');
  eq(rows(g).length, 264);
});

test('the officer import no longer adds a campus under a different spelling', function () {
  var g = liveLike();
  g.applyCampusList_();
  var paste = g.__ss.getSheetByName('Officer Form Paste');
  paste.getRange(1, 1, 3, 6).setValues([['ID', 'Completion time', 'What school is your organization associated with?', 'What is the name of your organization?', 'Officer #1: Name', 'Officer #1: Position'],
    ['31', new Date(Date.UTC(2026, 9, 20)), 'White, Ed. ES', 'Ed White PTO', 'Pat Parent', 'President'],
    ['32', new Date(Date.UTC(2026, 9, 20)), 'Imaginary Academy', 'Imaginary PTO', 'Sam Parent', 'President']]);
  var n = rows(g).length;
  var r = g.importOfficers_();
  eq(rows(g).length, n, 'no campus added');
  eq(r.newCampuses.length, 0);
  eq(regRow(g, 'White E ES')['Officer Information'], 'Accepted', 'the old spelling finds White E ES');
});

test('a campus name in an old spelling still finds the campus everywhere', function () {
  var g = liveLike(); g.applyCampusList_();
  var m = g.campusMap_();
  eq(g.lookup_(m, 'Law & Justice HS'), 'HSLJ');
  eq(g.lookup_(m, 'Cage ES (@Lantrip ES)'), 'Cage ES');
  eq(g.lookup_(m, 'Ed White ES'), 'White E ES');
});
