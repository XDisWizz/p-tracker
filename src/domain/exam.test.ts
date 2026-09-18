import { describe, expect, it } from 'vitest';
import { examCountdown, upcomingExams } from './exam';
import { makeSubject } from '../test/factories';

const today = '2027-01-05';

describe('examCountdown', () => {
  it('popisky a naléhavost podle počtu dní', () => {
    expect(examCountdown('2027-01-05', today)).toMatchObject({ days: 0, urgency: 'today', label: 'zkouška dnes' });
    expect(examCountdown('2027-01-06', today)).toMatchObject({ urgency: 'imminent', label: 'zkouška zítra' });
    expect(examCountdown('2027-01-08', today)).toMatchObject({ urgency: 'imminent', label: 'zkouška za 3 dny' });
    expect(examCountdown('2027-01-15', today)).toMatchObject({ urgency: 'soon', label: 'zkouška za 10 dní' });
    expect(examCountdown('2027-02-15', today).urgency).toBe('far');
    expect(examCountdown('2027-01-01', today)).toMatchObject({ urgency: 'past', label: 'zkouška proběhla' });
  });
});

describe('upcomingExams', () => {
  it('jen blížící se zkoušky, od nejbližší, bez archivovaných a proběhlých', () => {
    const subjects = [
      makeSubject({ id: 'daleko', examDate: '2027-03-01' }),
      makeSubject({ id: 'brzy', examDate: '2027-01-20' }),
      makeSubject({ id: 'hned', examDate: '2027-01-07' }),
      makeSubject({ id: 'probehla', examDate: '2027-01-02' }),
      makeSubject({ id: 'archiv', examDate: '2027-01-08', archived: true }),
      makeSubject({ id: 'bez', examDate: null }),
    ];
    expect(upcomingExams(subjects, today).map((e) => e.subject.id)).toEqual(['hned', 'brzy']);
  });
});
