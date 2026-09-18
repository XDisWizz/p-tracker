# Přehled přednášek

Osobní PWA pro studium: rozvrh, přednášky vygenerované z rozvrhu, zápisky z každé
přednášky a přehled, co je hotové a co ještě čeká. Běží offline, bez účtu a bez
serveru — všechna data zůstávají v prohlížeči na zařízení.

**Stack:** Vite · React 19 · TypeScript 7 (strict) · Tailwind CSS 4 · Dexie (IndexedDB) · vite-plugin-pwa · Vitest · oxlint

## Co umí

- **Rozvrh** — hodiny se naklikají po blocích (den, čas, místnost, liché/sudé týdny).
  Týden v mřížce na počítači, po dnech na telefonu. Zná týden výuky a svátky.
- **Přednášky z rozvrhu** — u přednáškové hodiny se v předmětu samy vytvoří přednášky
  na celý semestr, očíslované podle data, bez svátků. Po změně rozvrhu se srovnají;
  rozpracované se nikdy nesmažou. Každá změna jde vrátit.
- **Teď / další hodina** — na hlavní obrazovce: kam jít, do které místnosti a co se
  tam minule probíralo. Po skončené přednášce nabídne rovnou zapsat učivo.
- **Zápisky u přednášky** — co se probíralo, na co se zaměřit, přepis, poznámka.
  Ukládá se samo. Nahoře rekapitulace minulé přednášky. Formátování: odrážky `-`,
  nadpisy `#`, `**tučně**`.
- **Co mě čeká** — nezpracované přednášky napříč předměty od nejstarší, hledání
  (i v zápiscích a přepisech, bez ohledu na diakritiku) a filtry.
- **Příprava na zkoušku** — celý předmět na jedné stránce, tisk nebo export do Markdownu.
- **Statistiky** — kolik čeká, tempo zpracování, jak dlouho po přednášce obvykle
  zpracovávám, jestli dluh roste, nebo ho doháním.
- **Záloha** — export do JSON, import s náhledem a volbou sloučit/nahradit, vrácení
  importu, připomínka zálohy, trvalé úložiště.

---

## Vývoj

Potřebuješ Node.js 22 nebo novější.

```bash
npm install
npm run dev
```

Otevři adresu, kterou Vite vypíše (typicky `http://localhost:5173`). Terminál nech
otevřený — jeho zavřením se server zastaví.

| Příkaz | Co dělá |
| --- | --- |
| `npm run dev` | vývojový server s okamžitým překreslením |
| `npm test` | testy logiky a datové vrstvy (Vitest, skutečné Dexie nad fake-indexeddb) |
| `npm run test:watch` | testy průběžně při změnách |
| `npm run typecheck` | kontrola typů |
| `npm run lint` | oxlint včetně pravidel pro React hooky |
| `npm run build` | typy + produkční build do `dist/` |
| `npm run preview` | spustí hotový build lokálně, včetně service workeru |
| `npm run icons` | přegeneruje ikony z `public/icon.svg` |

Service worker je ve vývojovém režimu vypnutý schválně, aby cache neservírovala
staré soubory. Offline chování zkoušej přes `npm run build` a `npm run preview`.

Linter je oxlint, ne ESLint: `typescript-eslint` zatím nepodporuje TypeScript 7.

---

## Nasazení na GitHub Pages

Nasazení je automatické: každý push do větve `main` spustí
[workflow](.github/workflows/deploy.yml), který zkontroluje typy, lint, pustí testy,
sestaví aplikaci a nasadí ji. Když cokoliv neprojde, nic se nenasadí.

### Poprvé

1. Založ na GitHubu repozitář (na bezplatném účtu musí být **veřejný**, viz níže).
2. Nahraj do něj projekt:
   ```bash
   git init -b main
   git add .
   git commit -m "Přehled přednášek"
   git remote add origin https://github.com/<uzivatel>/<nazev-repa>.git
   git push -u origin main
   ```
3. V repozitáři otevři **Settings → Pages** a jako **Source** zvol **GitHub Actions**.
4. V záložce **Actions** počkej, až workflow doběhne (zhruba minuta). Adresa aplikace je
   `https://<uzivatel>.github.io/<nazev-repa>/`.

Název repozitáře se do aplikace dosadí sám. Pozor jen na to, že **změna názvu změní
adresu** a nainstalovaná aplikace na telefonu pak povede na starou. Data v ní zůstanou;
přeneseš je zálohou.

### Další verze

Stačí `git push`. Otevřená aplikace si do hodiny všimne nové verze a nahoře nabídne
**Aktualizovat** — sama se nepřenačte, aby nezahodila rozepsaný text.

### Kdo stránku uvidí

Na bezplatném GitHubu je repozitář s Pages veřejný, takže:

- **Kód i adresa jsou dohledatelné** — repozitář je vidět na tvém profilu.
- **Vyhledávače stránku neindexují** (`noindex` v `index.html` a `robots.txt`).
- **Tvoje data tam nejsou.** Na GitHubu je jen prázdná aplikace. Přednášky, zápisky,
  rozvrh i zálohy existují pouze v prohlížeči na tvých zařízeních.

Soukromý repozitář s Pages vyžaduje GitHub Pro — studenti ho dostanou zdarma přes
[GitHub Student Developer Pack](https://education.github.com/pack). Samotná stránka
ale i pak zůstane dostupná každému, kdo zná adresu.

---

## Instalace na Android

1. Otevři adresu aplikace v **Chrome**.
2. Klepni na **⋮** vpravo nahoře → **Přidat na plochu** → **Instalovat**.
3. Ikona **Přednášky** se objeví na ploše a v seznamu aplikací.

Dlouhým podržením ikony se nabídnou zkratky **Co mě čeká** a **Předměty**. Na tabletu
je postup stejný; na širokém displeji se aplikace přepne do dvou sloupců.

Na **počítači** (Chrome, Edge, Thorium) je v adresním řádku ikona instalace.

### Než začneš aplikaci používat naostro

- **Semestr** — ZS 2026/27 je předvyplněný podle harmonogramu FEI (výuka 14. 9. – 12. 12.,
  bez 28. 9., 28. 10. a 17. 11.). Další semestry se zadají v **Nastavení → Semestry**.
- **Liché a sudé týdny** se počítají od začátku výuky: 1. týden semestru je lichý.
  Kdyby tvůj rozvrh počítal jinak, přehoď u hodiny liché/sudé.
- **Data jsou vázaná na prohlížeč a zařízení.** Přenos: **Nastavení → Stáhnout zálohu**
  na jednom, **Obnovit ze zálohy → Sloučit** na druhém.
- **Zálohuj.** Android může při nedostatku místa smazat data prohlížeče. Aplikace si
  o trvalé úložiště řekne sama a připomene zálohu, když dlouho neproběhla.
- **Vymazání dat webu** v nastavení prohlížeče smaže i přednášky.

---

## Klávesové zkratky (počítač)

| Klávesa | Akce |
| --- | --- |
| `n` | nová přednáška (v detailu předmětu rovnou do něj) |
| `/` | hledat |
| `j` / `k` | další / předchozí přednáška v seznamu |
| `Enter` | otevřít vybranou přednášku |
| `1` – `5` | stav vybrané přednášky: nezačato → otestováno |
| `0` | přeskočit vybranou přednášku |
| `g` pak `c` / `r` / `p` / `s` / `h` | Co mě čeká / Rozvrh / Předměty / Statistiky / Nastavení |
| `Esc` | zavřít okno, zrušit výběr, vymazat hledání |

---

## Struktura

```
src/
  domain/     čistá logika bez Reactu a databáze — typy, stavy, rozvrh, semestry,
              progress, statistiky, filtry, data, zápisky, příprava na zkoušku
  db/         Dexie: schéma a migrace, repozitáře, synchronizace rozvrhu, export/import, úklid
  hooks/      reaktivní čtení z databáze, routing, téma, zkratky, zápisky, rozvrh, zálohy
  components/ UI komponenty
  screens/    obrazovky (Co mě čeká, Rozvrh, Předměty, detaily, Statistiky, Nastavení)
  lib/        prohlížečové utility — soubory, chyby, kompatibilita IndexedDB, formátování
```

**Proč bez globálního store:** zdrojem pravdy je IndexedDB a `useLiveQuery` z
`dexie-react-hooks` překreslí komponenty při každém zápisu. V React state zůstává jen UI.

**Změna schématu databáze:** nikdy neupravuj existující `db.version(n)` v
[src/db/db.ts](src/db/db.ts). Přidej nový blok s vyšší verzí a funkcí `upgrade`,
zvyš `SCHEMA_VERSION` a doplň čtení starší zálohy v [src/db/transfer.ts](src/db/transfer.ts).
Migrace 1 → 2 je pokrytá testem nad skutečnou databází verze 1.

**Kompatibilita:** některé buildy Chromia (např. Thorium) implementují IndexedDB 3 jen
napůl a Dexie by v nich spadl na `DataError`. [src/lib/idbCompat.ts](src/lib/idbCompat.ts)
to při startu otestuje a Dexie přepne na starší API.
