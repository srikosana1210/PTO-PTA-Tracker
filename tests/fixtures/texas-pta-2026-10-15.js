/* The Texas PTA spreadsheet for Houston ISD as FACE pasted it on 2026-10-15 (the columns the tracker reads, in Texas PTA's order).
   Texas PTA's council and field-service contacts are replaced by a made-up contact, so a test can check they are never copied. */
'use strict';
var HEAD = ['School District', 'PTA', 'Texas PTA ID', 'Membership Goal', 'To Increase Local', '26-27                    Current Membership Count', '25-26', '24-25',
  'Student Enrollment', 'Reflections Eligible', 'JoinPTA.org Activation?', 'Online RDC', 'PTA Status', 'Retention Plan Status', 'Retention Plan Status More Information',
  'Good Standing Date', 'SOA Officers', 'SOA Membership', 'SOA Bylaws', 'SOA Standing Rules', 'SOA 990 ', 'Active Status Date (Must be active by 12/1/26 to vote)',
  'Bylaws Approved', 'Field Service Representative (FSR)', 'FSR Email'];
var Y = '√', N = 'X';
var DATA = [
  ['Alexander Hamilton Middle School', '2312957', 32, -21, 51, 29, 0, 964, N, Y, Y, 'Good Standing', '', '1st Year PTA', '10/14/2026', Y, Y, Y, Y, Y, '8/10/2026', '12/1/2025'],
  ['Bonham Elementary', '2302410', 1, 1, 0, 0, 29, 767, N, N, N, 'Charter Withdrawal', '', '', '', N, N, N, Y, N, '', '10/13/2021'],
  ['Browning Elementary', '2312892', 28, 26, 0, 25, 20, 317, Y, Y, Y, 'Inactive', '', '', '', Y, N, Y, Y, N, '', '5/12/2025'],
  ['Durham Elementary', '4784', 312, 263, 21, 283, 317, 498, Y, Y, Y, 'Good Standing', '', '', '10/14/2026', Y, Y, Y, Y, Y, '10/9/2026', '3/21/2025'],
  ['Harvard Elementary', '4888', 91, 30, 53, 82, 205, 663, Y, Y, Y, 'Active', '', '', '', Y, Y, Y, Y, N, '8/17/2026', '7/8/2024'],
  ['Helms Elementary', '4892', 338, 308, 0, 307, 180, 523, Y, Y, Y, 'Inactive', '', '', '', Y, N, Y, Y, N, '', '1/8/2026'],
  ['Hogg Middle School', '2283554', 237, -71, 287, 215, 157, 1149, Y, Y, Y, 'Good Standing', '', '', '9/24/2026', Y, Y, Y, Y, Y, '9/24/2026', '3/30/2026'],
  ['Ketelsen', '2312525', 26, 15, 9, 23, 20, 340, Y, Y, Y, 'Inactive', '', '', '', Y, N, N, Y, Y, '', '9/15/2022'],
  ['Northside High School', '2311869', 2, 2, 0, 1, 22, 922, N, N, N, 'Charter Withdrawal', '', '', '', N, N, N, Y, N, '', '9/27/2021'],
  ['Oak Forest Elementary', '5124', 744, -12, 689, 676, 639, 996, Y, Y, Y, 'Good Standing', '', '', '9/9/2026', Y, Y, Y, Y, Y, '9/3/2026', '6/2/26'],
  ['South Early Community', '2223725', 71, 65, 0, 64, 21, 525, Y, Y, Y, 'Inactive', '', '', '', Y, N, Y, Y, N, '', '9/11/2024'],
  ['Tijerina Elementary', '5328', 29, 27, 0, 26, 20, 282, Y, Y, Y, 'Inactive', '', '', '', N, N, Y, Y, N, '', '3/7/2024'],
  ['Wainwright Elementary', '5340', 1, 1, 0, 0, 20, 316, N, N, N, 'Charter Withdrawal', '', '', '', N, N, N, Y, N, '', '10/13/2021'],
  ['William B. Travis Elementary', '5332', 368, -77, 412, 334, 317, 782, Y, Y, Y, 'Good Standing', '', '', '9/9/2026', Y, Y, Y, Y, Y, '8/1/2026', '8/11/2025']
];
/** The paste as it lands in the sheet: the "Updated on" line, a row of group titles, the headings, then one row per PTA. */
function rows() {
  var w = HEAD.length;
  function pad(r) { r = r.slice(); while (r.length < w) r.push(''); return r; }
  var title = pad(['Updated on THU, October 15, 2026 at 8:48 AM']);
  var groups = pad(['', '', '', 'Membership', '', '', '', '', '', 'Feature Eligibility', '', '', 'Path to Good Standing- Standards of Continuing Affiliation (SOA)\nAll PTAs should be in Good Standing by November 1st']);
  return [title, groups, HEAD.slice()].concat(DATA.map(function (d) { return pad(['Houston ISD'].concat(d, ['Pat Contact', 'pat.contact@example.org'])); }));
}
module.exports = { rows: rows };
