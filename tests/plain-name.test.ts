import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBareCitation, plainName, buildAuthorityIndex, describeAuthority, firstClause } from '../src/helpers/plainName';

test('recognizes citations without treating descriptive names as citations', () => {
  for (const s of ['Rule 3.8(d)', 'Rule 1.18', 'AP I art. 52(2)', '§ 1983', 'Article 33', '410 U.S. 113', 'Brady v. Maryland', 'In re Gault', '1.18']) assert.equal(isBareCitation(s), true, s);
  for (const s of ['Duties to prospective clients', 'Disclosure of exculpatory evidence', 'Military objectives', 'Rule 1.18: Prospective clients', 'Protection under Article 33']) assert.equal(isBareCitation(s), false, s);
});
test('uses verified fields in order and suppresses a repeated citation', () => {
  const base = { subtopic: 'Disclosure', title: 'Prosecutor duties', topic: 'Fair trial', rule: 'The prosecutor must disclose evidence; it must be timely.', authority: 'Rule 3.8(d)' };
  assert.equal(plainName(base).name, 'Disclosure');
  assert.equal(plainName({...base, subtopic: 'Rule 3.8(d)'}).name, 'Prosecutor duties');
  assert.equal(plainName({...base, subtopic: '', title: '', heading: 'Evidence'}).name, 'Evidence');
  assert.equal(plainName({...base, subtopic: '', title: ''}).name, 'Fair trial');
  assert.equal(plainName({...base, subtopic: '', title: '', topic: 'Rule 3.8(d)'}).name, 'The prosecutor must disclose evidence');
  assert.equal(plainName({...base, subtopic: 'Disclosure under Rule 3.8(d)'}).cite, '');
  assert.ok(firstClause('A '.repeat(100)).length <= 90);
});
test('indexes a common subtopic and normalizes authority spacing, case and quotes', () => {
  const index = buildAuthorityIndex([{subtopic: 'Disclosure', rule: 'Evidence must be disclosed. More.', authority: 'Rule 3.8(d)'}, {subtopic: 'Disclosure', authority: 'rule  3.8(d)'}, {subtopic: 'Other duty', authority: 'Rule 3.8(d)'}]);
  assert.deepEqual(describeAuthority('RULE 3.8(d)', index), {name: 'Disclosure', rule: 'Evidence must be disclosed.', cite: 'Rule 3.8(d)'});
  assert.equal(describeAuthority('Missing', index), undefined);
  assert.equal(describeAuthority('“Case”', buildAuthorityIndex([{authority: '"Case"', rule: 'Existing verified words; more'}]))?.name, 'Existing verified words');
});
