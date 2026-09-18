// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

/*
 * Kouřové testy celé aplikace v jsdom: vykreslí skutečné obrazovky nad skutečným
 * Dexie (fake-indexeddb) a projdou hlavní toky. Testy datové vrstvy nechytí
 * chybu ve vykreslování — tyhle ano.
 */

// Service worker v testu není; modul z vite-plugin-pwa nahradit neškodnou náhražkou.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => undefined],
    offlineReady: [false, () => undefined],
    updateServiceWorker: async () => undefined,
  }),
}));

beforeAll(() => {
  // Co jsdom neumí a aplikace používá.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= () => undefined;
  const dialog = HTMLDialogElement.prototype;
  if (typeof dialog.showModal !== 'function') {
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    dialog.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  }
});

beforeEach(async () => {
  window.location.hash = '#/';
  const { db } = await import('../db/db');
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  cleanup();
});

async function renderApp(): Promise<void> {
  const { App } = await import('../App');
  const { DatabaseGate, ErrorBoundary } = await import('../components/Failsafe');
  render(
    <ErrorBoundary>
      <DatabaseGate>
        <App />
      </DatabaseGate>
    </ErrorBoundary>,
  );
}

async function go(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('aplikace v prohlížeči', () => {
  it('prázdná aplikace ukáže průvodce prvním spuštěním', async () => {
    await renderApp();
    expect(await screen.findByText('Vítej 👋')).toBeTruthy();
    expect(screen.getByText('Naklikej rozvrh')).toBeTruthy();
  });

  it('všechny obrazovky se vykreslí bez chyby', async () => {
    await renderApp();
    await screen.findByText('Vítej 👋');

    await go('#/rozvrh');
    expect(await screen.findByRole('heading', { name: 'Rozvrh' })).toBeTruthy();

    await go('#/statistiky');
    expect(await screen.findByText(/Statistiky se objeví/)).toBeTruthy();

    await go('#/nastaveni');
    expect(await screen.findByRole('heading', { name: 'Nastavení' })).toBeTruthy();

    await go('#/predmety');
    expect(await screen.findByText('Zatím žádný předmět.')).toBeTruthy();

    // Pojistka proti pádu: obrazovka s chybou by tu byla místo aplikace.
    expect(screen.queryByText('Něco se pokazilo')).toBeNull();
  });

  it('založení předmětu přes formulář, pak přednáška z detailu', async () => {
    await renderApp();
    await go('#/predmety');
    fireEvent.click(await screen.findByRole('button', { name: /Nový předmět/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Nový předmět' });
    fireEvent.change(within(dialog).getByLabelText('Název'), { target: { value: 'Fyzika I' } });
    fireEvent.change(within(dialog).getByLabelText('Zkratka'), { target: { value: 'fyz1' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Uložit' }));
    });

    // Po uložení se otevře detail předmětu s tlačítkem na novou přednášku.
    fireEvent.click(await screen.findByRole('button', { name: /^Přednáška$/ }));
    const lectureDialog = await screen.findByRole('dialog', { name: 'Nová přednáška' });
    await act(async () => {
      fireEvent.click(within(lectureDialog).getByRole('button', { name: 'Přidat' }));
    });

    expect(await screen.findByText('1. přednáška')).toBeTruthy();
    const { db } = await import('../db/db');
    const subjects = await db.subjects.toArray();
    expect(subjects.map((s) => s.code)).toEqual(['FYZ1']);
    expect(await db.lectures.count()).toBe(1);
  });

  it('neznámá adresa nespadne, ale vede na hlavní obrazovku', async () => {
    window.location.hash = '#/tohle/neexistuje';
    await renderApp();
    expect(await screen.findByText('Vítej 👋')).toBeTruthy();
  });
});
