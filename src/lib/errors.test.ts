import { describe, expect, it } from 'vitest';
import { describeError, explainStorageError } from './errors';

/** Tvar, v jakém chyby vrací Dexie: obal a skutečná příčina v `inner`. */
function dexieError(outer: string, inner: string, message = 'detail'): unknown {
  return { name: outer, message: 'obal', inner: { name: inner, message } };
}

describe('explainStorageError', () => {
  it('blokované úložiště pozná i zabalené v OpenFailedError', () => {
    const result = explainStorageError(dexieError('OpenFailedError', 'SecurityError'));
    expect(result.title).toContain('nepovolil');
    expect(result.detail).toContain('SecurityError');
  });

  it('chybějící IndexedDB je taky blokované úložiště', () => {
    expect(explainStorageError({ name: 'MissingAPIError', message: 'x' }).title).toContain('nepovolil');
  });

  it('rozliší novější verzi dat a nedostatek místa', () => {
    expect(explainStorageError(dexieError('OpenFailedError', 'VersionError')).title).toContain('novější');
    expect(explainStorageError(dexieError('OpenFailedError', 'QuotaExceededError')).title).toContain('místo');
  });

  it('neznámá chyba dostane obecné vysvětlení, ne výjimku', () => {
    expect(explainStorageError('řetězec místo chyby').title).toBe('Databázi se nepodařilo otevřít');
    expect(explainStorageError(null).detail).toContain('null');
  });
});

describe('nekompatibilní databáze', () => {
  it('chybějící tabulky vysvětlí jako cizí data pod stejnou adresou', () => {
    expect(explainStorageError({ name: 'SchemaMismatchError', message: 'Chybí tabulky: lectures' }).title).toContain(
      'nekompatibilní',
    );
    expect(explainStorageError(dexieError('DatabaseClosedError', 'NotFoundError')).title).toContain('nekompatibilní');
  });
});

describe('describeError', () => {
  it('stejnou zprávu z obalu a příčiny nevypíše dvakrát', () => {
    const same = { name: 'NotFoundError', message: 'store not found', inner: { name: 'NotFoundError', message: 'store not found' } };
    expect(describeError(same)).toBe('NotFoundError: store not found');
  });

  it('složí celý řetěz příčin', () => {
    expect(describeError(dexieError('OpenFailedError', 'SecurityError', 'access denied'))).toBe(
      'OpenFailedError: obal ← SecurityError: access denied',
    );
  });
});
