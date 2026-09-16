import { describe, expect, it } from 'vitest';
import { acceptsGetAllOptions, ensureIdbCompat, hideIdb3Features } from './idbCompat';

function dataError(): Error {
  const error = new Error('Failed to execute getAll: The parameter is not a valid key.');
  error.name = 'DataError';
  return error;
}

describe('acceptsGetAllOptions', () => {
  it('pozná napůl implementované API podle DataError (chování Thoria)', () => {
    const broken = {
      getAll: (query?: unknown) => {
        if (typeof query === 'object' && query !== null) throw dataError();
        return {};
      },
    };
    expect(acceptsGetAllOptions(broken)).toBe(false);
  });

  it('úplnou implementaci nechá být', () => {
    expect(acceptsGetAllOptions({ getAll: () => ({}) })).toBe(true);
  });

  it('jinou chybu nevydává za nepodporu', () => {
    const failing = {
      getAll: () => {
        const error = new Error('transaction inactive');
        error.name = 'TransactionInactiveError';
        throw error;
      },
    };
    expect(() => acceptsGetAllOptions(failing)).toThrow('transaction inactive');
  });
});

describe('hideIdb3Features', () => {
  it('odebere getAllRecords z prototypu, takže ho detekce Dexie nenajde', () => {
    class FakeStore {
      getAllRecords(): void {}
      getAll(): void {}
    }
    const instance = new FakeStore();
    expect('getAllRecords' in instance).toBe(true);

    hideIdb3Features([FakeStore.prototype]);

    expect('getAllRecords' in instance).toBe(false);
    expect('getAll' in instance).toBe(true);
  });

  it('prototyp bez getAllRecords nechá beze změny', () => {
    const plain = { getAll: () => undefined };
    expect(() => hideIdb3Features([plain])).not.toThrow();
    expect('getAll' in plain).toBe(true);
  });
});

describe('ensureIdbCompat', () => {
  it('v běžném prostředí proběhne a nikdy nevyhodí výjimku', async () => {
    await expect(ensureIdbCompat()).resolves.toMatch(/not-needed|native|patched|unknown/);
  });
});
