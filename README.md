# Přehled přednášek

Osobní PWA pro sledování rozpracovanosti přednášek: co mám zpracované, co mě čeká
a jak jsem na tom v každém předmětu. Běží offline, bez účtu a bez serveru — všechna
data zůstávají v prohlížeči na zařízení.

**Stack:** Vite · React 19 · TypeScript (strict) · Tailwind CSS 4 · Dexie (IndexedDB) · vite-plugin-pwa · Vitest

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
| `npm test` | testy datové vrstvy a logiky (Vitest) |
| `npm run test:watch` | testy průběžně při změnách |
| `npm run typecheck` | kontrola typů bez buildu |
| `npm run build` | typy + produkční build do `dist/` |
| `npm run preview` | spustí hotový build lokálně, včetně service workeru |
| `npm run icons` | přegeneruje ikony z `public/icon.svg` |

Service worker je ve vývojovém režimu vypnutý schválně, aby cache neservírovala
staré soubory. Offline chování zkoušej přes `npm run build` a `npm run preview`.

---

## Nasazení na GitHub Pages

Nasazení je automatické: každý push do větve `main` spustí
[workflow](.github/workflows/deploy.yml), který zkontroluje typy, pustí testy,
sestaví aplikaci a nasadí ji. Když testy neprojdou, nic se nenasadí.

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

Název repozitáře se do aplikace dosadí sám — při přejmenování není potřeba nic měnit.
Pozor jen na to, že **změna názvu změní adresu** a nainstalovaná aplikace na telefonu
pak povede na starou. Data v ní zůstanou; přeneseš je zálohou (viz níže).

### Další verze

Stačí `git push`. Otevřená aplikace si do hodiny všimne nové verze a nahoře nabídne
**Aktualizovat** — sama se nepřenačte, aby nezahodila rozepsaný formulář.

### Kdo stránku uvidí

Na bezplatném GitHubu je repozitář s Pages veřejný, takže:

- **Kód i adresa jsou dohledatelné** — repozitář je vidět na tvém profilu.
- **Vyhledávače stránku neindexují** (`noindex` v `index.html` a `robots.txt`), takže
  ji nikdo nenajde přes Google. Kdo nezná adresu nebo nejde přes tvůj profil, nenarazí na ni.
- **Tvoje data tam nejsou.** Na GitHubu je jen prázdná aplikace. Přednášky, poznámky
  a zálohy existují pouze v prohlížeči na tvých zařízeních. Kdo adresu otevře,
  uvidí prázdný přehled.

Kdybys chtěl mít repozitář soukromý: GitHub Pages ze soukromého repozitáře vyžaduje
GitHub Pro, který studenti dostanou zdarma přes
[GitHub Student Developer Pack](https://education.github.com/pack) (ověření školním
e-mailem VŠB). Samotná stránka ale i pak zůstane dostupná každému, kdo zná adresu.

---

## Instalace na Android

Aplikace se chová jako normální aplikace: vlastní ikona, celá obrazovka, běží bez internetu.

1. Otevři adresu aplikace v **Chrome**.
2. Klepni na **⋮** vpravo nahoře → **Přidat na plochu** → **Instalovat**
   (někdy se rovnou nabídne lišta „Instalovat aplikaci“).
3. Ikona **Přednášky** se objeví na ploše a v seznamu aplikací.

Dlouhým podržením ikony se nabídnou zkratky **Co mě čeká** a **Předměty**.

Na tabletu je postup stejný; na širokém displeji se aplikace přepne do dvou sloupců.

Na **desktopu** (Chrome, Edge, Thorium) je v adresním řádku ikona instalace.

### Než začneš aplikaci používat naostro

- **Data jsou vázaná na prohlížeč a zařízení.** Telefon, tablet a počítač mají každý
  svoje. Přenos: **Nastavení → Stáhnout zálohu** na jednom, **Obnovit ze zálohy →
  Sloučit** na druhém.
- **Zálohuj.** Android může při nedostatku místa smazat data prohlížeče. Aplikace si
  o trvalé úložiště řekne sama a připomene zálohu, když dlouho neproběhla.
- **Nainstalovaná aplikace a stránka v prohlížeči sdílejí data**, pokud je to stejný
  prohlížeč na stejném zařízení.
- **Vymazání dat webu** v nastavení prohlížeče smaže i přednášky.

---

## Klávesové zkratky (desktop)

| Klávesa | Akce |
| --- | --- |
| `n` | nová přednáška (v detailu předmětu rovnou do něj) |
| `/` | hledat |
| `Esc` | zavřít okno, vymazat hledání |

---

## Struktura

```
src/
  domain/     čistá logika bez Reactu a databáze — typy, stavy, progress, filtry, data, zálohy
  db/         Dexie: schéma a migrace, repozitáře, export/import
  hooks/      reaktivní čtení z databáze, routing, téma, zkratky, zálohy
  components/ UI komponenty
  screens/    obrazovky (Co mě čeká, Předměty, detail, Nastavení)
  lib/        prohlížečové utility — soubory, chyby, kompatibilita IndexedDB
```

**Proč bez globálního store:** zdrojem pravdy je IndexedDB a `useLiveQuery` z
`dexie-react-hooks` překreslí komponenty při každém zápisu. V React state zůstává jen UI.

**Změna schématu databáze:** nikdy neupravuj existující `db.version(n)` v
[src/db/db.ts](src/db/db.ts). Přidej nový blok s vyšší verzí a funkcí `upgrade`
a zvyš `SCHEMA_VERSION`, aby import odmítl zálohy z novější verze.

**Kompatibilita:** některé buildy Chromia (např. Thorium) implementují IndexedDB 3 jen
napůl a Dexie by v nich spadl na `DataError`. [src/lib/idbCompat.ts](src/lib/idbCompat.ts)
to při startu otestuje a Dexie přepne na starší API.
