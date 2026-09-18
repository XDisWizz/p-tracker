import { describe, expect, it } from 'vitest';
import { missingNotes, sheetEntries, studySheetFilename, studySheetMarkdown } from './studySheet';
import { makeLecture, makeSubject } from '../test/factories';

const zma = makeSubject({ id: 'zma', code: 'ZMA', name: 'Základy matematické analýzy', term: '2026/27 ZS' });

const lectures = [
  makeLecture({ id: 'l2', subjectId: 'zma', number: 2, date: '2026-09-22', summary: '• Limita posloupnosti' }),
  makeLecture({
    id: 'l1',
    subjectId: 'zma',
    number: 1,
    date: '2026-09-15',
    title: 'Reálná čísla',
    summary: '• Supremum',
    focus: 'Důkaz existence suprema',
  }),
  makeLecture({ id: 'l3', subjectId: 'zma', number: 3, date: '2026-09-29' }),
  makeLecture({ id: 'skip', subjectId: 'zma', number: 4, status: 'skipped', summary: 'nepočítat' }),
  makeLecture({ id: 'cizi', subjectId: 'jiny', number: 1, summary: 'cizí' }),
];

describe('sheetEntries', () => {
  it('jen přednášky předmětu se zápisem, podle čísla, bez přeskočených', () => {
    expect(sheetEntries(zma, lectures).map((e) => e.lecture.id)).toEqual(['l1', 'l2']);
  });
});

describe('missingNotes', () => {
  it('proběhlé přednášky bez zápisu', () => {
    expect(missingNotes(zma, lectures, '2026-10-01').map((l) => l.id)).toEqual(['l3']);
    expect(missingNotes(zma, lectures, '2026-09-25')).toHaveLength(0);
  });
});

describe('studySheetMarkdown', () => {
  const md = studySheetMarkdown(zma, lectures);

  it('začíná předmětem a semestrem', () => {
    expect(md.startsWith('# ZMA — Základy matematické analýzy\n\nSemestr 2026/27 ZS')).toBe(true);
  });

  it('souhrn „na co se zaměřit“ je nahoře, před učivem', () => {
    expect(md.indexOf('## Na co se zaměřit')).toBeLessThan(md.indexOf('## Učivo po přednáškách'));
    expect(md).toContain('Důkaz existence suprema');
  });

  it('učivo po přednáškách s číslem, názvem a datem', () => {
    expect(md).toContain('### 1. přednáška — Reálná čísla (15. 9. 2026)');
    expect(md).toContain('### 2. přednáška (22. 9. 2026)');
    expect(md).not.toContain('nepočítat');
    expect(md).not.toContain('cizí');
  });

  it('v hlavičce uvede termín zkoušky', () => {
    const withExam = { ...zma, examDate: '2027-01-20' };
    expect(studySheetMarkdown(withExam, lectures)).toContain('Semestr 2026/27 ZS · zkouška 20. 1. 2027');
  });

  it('bez zápisků řekne, že nic není', () => {
    expect(studySheetMarkdown(zma, [])).toContain('Zatím žádné zápisky.');
  });
});

describe('studySheetFilename', () => {
  it('bez diakritiky a mezer', () => {
    expect(studySheetFilename(zma)).toBe('zma-priprava.md');
    expect(studySheetFilename(makeSubject({ code: '', name: 'Úvod do programování' }))).toBe(
      'uvod-do-programovani-priprava.md',
    );
  });
});
