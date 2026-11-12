import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBareCitation, plainName, buildAuthorityIndex, describeAuthority, firstClause, materialItems } from '../src/helpers/plainName';
import type { StudyMaterial } from '../src/helpers/studyMaterials';

test('recognizes citations without treating descriptive names as citations', () => {
  for (const s of ['Rule 3.8(d)', 'Rule 1.18', 'AP I art. 52(2)', '§ 1983', 'Article 33', '410 U.S. 113', 'Brady v. Maryland', 'In re Gault', 'Ex parte Milligan', '1.18', '1.18(d)(iv)', 'Rules 4.1 and 4.2', 'Arts. 52(2) and 57', 'Rule 3.8(g)–(h)']) assert.equal(isBareCitation(s), true, s);
  for (const s of ['Duties to prospective clients', 'Disclosure of exculpatory evidence', 'Military objectives', 'Rule 1.18: Prospective clients', 'Protection under Article 33', 'Ex parte communications, Rule 2.9', 'Rule 3.8(d) timely disclosure', 'Post-conviction duties, Rule 3.8(g)–(h)', '1. Introduction', 'IV Charter of the UN']) assert.equal(isBareCitation(s), false, s);
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
test('study material authorities join the index with the item’s own words', () => {
  const base = { id: 'm', course: 'il', topic: 'Targeting', subtopic: 'Rule 1.18', class_date: '', class_day: 1, batch: '', source_files: [], source_section: '', sources: [], verified: { at: '', rounds: 1, checker: '', notes: '' } } as const;
  const outline = { ...base, kind: 'outline', title: 'Targeting outline', authority: 'AP I art. 52(2)', sections: [{ heading: 'Military objectives', text: 'Attacks are limited to military objectives. More.', authority: 'AP I art. 52(2)' }] } as unknown as StudyMaterial;
  const drill = { ...base, kind: 'drill', title: 'Targeting drill', authority: 'AP I art. 57', prompt: '', categories: [], items: [{ statement: 'A fact pattern', answer: 'x', why: 'Precautions are required. More.', authority: 'AP I art. 57' }] } as unknown as StudyMaterial;
  const index = buildAuthorityIndex(materialItems([outline, drill]));
  assert.deepEqual(describeAuthority('AP I art. 52(2)', index), { name: 'Military objectives', rule: 'Attacks are limited to military objectives.', cite: 'AP I art. 52(2)' });
  assert.equal(describeAuthority('AP I art. 57', index)?.name, 'Targeting drill');
  assert.equal(describeAuthority('AP I art. 57', index)?.rule, 'Precautions are required.');
});
test('the first sentence does not stop at an abbreviation', async () => {
  const { firstSentence } = await import('../src/helpers/plainName');
  assert.equal(firstSentence('IAC vs. NIAC turns on intensity. Second sentence.'), 'IAC vs. NIAC turns on intensity.');
  assert.equal(firstSentence('The U.S. is bound by art. 52(2) of the Protocol. More.'), 'The U.S. is bound by art. 52(2) of the Protocol.');
  assert.equal(firstSentence('Is it binding? Yes.'), 'Is it binding?');
  assert.equal(firstSentence('A “claim.” Next.'), 'A “claim.”');
  assert.equal(firstSentence('No terminator here'), 'No terminator here');
});
