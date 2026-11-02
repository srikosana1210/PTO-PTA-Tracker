/* Tests for FACE's campus list marking each campus PTO, PTA or No PTO/PTA (2026-11-02). Run through test-script.js. */
'use strict';
var h = require('./harness');
var test = h.test, eq = h.eq, ok = h.ok;

function reg(g, campus) { var t = g.table_('Campus Register'), v = t.values[g.findRow_(t, '2026-27', campus) - 1]; return { has: v[t.col['Has PTO or PTA']], ot: v[t.col['Org Type']] }; }
function setReg(g, campus, hd, val) { var t = g.table_('Campus Register'); t.sh.getRange(g.findRow_(t, '2026-27', campus), t.col[hd] + 1).setValue(val); }
function paste(g, rows) {
  var sh = g.__ss.getSheetByName('No PTO-PTA List'); sh.clearContents();
  var all = [['Campus Name', 'FACE Coordinator 1', 'PTO/PTA']].concat(rows);
  sh.getRange(1, 1, all.length, 3).setValues(all);
}

test('FACE\'s list: Yes is a PTO, or a PTA when Texas PTA lists it; No is No PTO/PTA; old spellings match', function () {
  var g = h.load({ fixture: 'template' });
  setReg(g, 'Anderson ES', 'Org Type', 'PTA');              // not on the Texas PTA list, so it becomes a PTO
  setReg(g, 'Atherton ES', 'Has PTO or PTA', 'Yes');
  paste(g, [['Anderson ES', 'Eunice Vela', 'Yes'], ['Hamilton MS', 'Karen Aubrey', 'Yes'], ['Atherton ES', 'Kathleen Ruiz', 'No'], ['*Kinder HSPVA', 'Kenya Washington', 'Yes'],
    ['*Energized ECC -Charter', 'Andrienia Savelli', 'No'], ['McReynolds MS', 'Kathleen Ruiz', 'No'], ['Rice School PK-8', 'Karen Aubrey', 'Yes'], ['Henderson NQ ES', 'Kathleen Ruiz', 'Yes']]);
  var r = g.importNoPto_();
  eq(reg(g, 'Anderson ES').has + '|' + reg(g, 'Anderson ES').ot, 'Yes|PTO');
  eq(reg(g, 'Hamilton MS').ot, 'PTA', 'on the Texas PTA list');
  eq(reg(g, 'Kinder HSPVA').has + '|' + reg(g, 'Kinder HSPVA').ot, 'Yes|PTO', '"*" is not part of the name');
  eq(reg(g, 'Rice School K-8').ot, 'PTO', 'an old spelling');
  eq(reg(g, 'Atherton ES').has, 'No');
  eq(reg(g, 'Energized ECC').has, 'No', '"- Charter" is not part of the name');
  eq(reg(g, 'Fleming McReynolds MS').has, 'No');
  eq(r.unmatched.join(), 'Henderson NQ ES', 'a campus that is no longer on the list is reported');
  eq(r.pto + '|' + r.pta + '|' + r.yesAlready, '3|0|1', 'Hamilton MS was already a PTA');
  ok(/3 campuses are now marked as having a PTO, and 0 campuses as having a PTA \(from the Texas PTA list\); 1 was already right/.test(g.noPtoSummary_(r)), g.noPtoSummary_(r));
  eq(g.importNoPto_().pto, 0, 'running it again changes nothing');
});

test('FACE\'s list: No does not override a campus that sent something; Yes overrides No', function () {
  var g = h.load({ fixture: 'template' });
  setReg(g, 'Ashford ES', 'Has PTO or PTA', 'No');
  setReg(g, 'Anderson ES', 'Officer Information', 'Accepted');
  paste(g, [['Ashford ES', 'Olivia Lemon', 'Yes'], ['Anderson ES', 'Eunice Vela', 'No']]);
  var r = g.importNoPto_();
  eq(reg(g, 'Ashford ES').has + '|' + reg(g, 'Ashford ES').ot, 'Yes|PTO');
  ok(r.kept.indexOf('Anderson ES') >= 0, 'it sent its officer form, so it is kept and reported');
});
