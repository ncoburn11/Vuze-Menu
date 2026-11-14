# VUZE Viewfinder: Sunday update

Public page: https://ncoburn11.github.io/Vuze-Menu/ (embedded on vuzeextracts.com/releases).
Sister site: ncoburn11/flavorade-releases (Flavorade). Same distributor, same orders, same stores.json licenses; keep the two in step.
Never use emoji anywhere on the page. Never link to or copy anything from the private buyers menu (ncoburn11/live-menu).
Never guess a store, city or flavor. If something is not covered by these rules, hold it back and ask the owner.

The update runs **every Sunday at about 6 PM Pacific (scheduled 5:47 PM)** (or when the owner says "update vuze releases").
It publishes the **Week of** the coming Monday.

## Rules (all in `rules.json` and enforced by `tools/weekly.js`)
- **Orders:** every GrowFlow order on license `C11-0001795-LIC` (region `ca`) counts.
  - It must be in stage CLOSED or IN_TRANSFER.
  - It must be of type RETAIL, DISTRIBUTOR or MICRO_BUSINESS.
  - Its effective date must be after the last run (`tools/state.json` `lastCutoff`) and up to now. Normally that is Monday to Sunday evening; orders transferred on Sunday after the run roll into the next week.
- **Effective date:** the transfer date. If the order's comment or notes give a later date (within 30 days), use that date instead. For example, SGI "Monday 11/16".
- **Only VUZE live resin cart lines count** (`VUZE | Strain | Live Resin Vape Cart | 1g`, either order): no samples, Flavorade, Sirius, Casual, batteries or kits.
- **C11 distributors are never shown, except these five:**
  - SGI Jackson: "All Stiiizy Shops | California". Skip staff or anniversary sample orders.
  - IE Licensing: "All Syndicate Shops | Southern California".
  - PMG Lyfted Farms: the store comes from the order comment (`rules.pmgComments`).
  - Big Tree Industries and CK Distribution: "Perfect Union | City", using the code in the comment or notes. JACKPOT is never listed.
  - Movocan: "Movocan | City", with the city from the comment. List every city named.
- **Unknown C11s:** any C11 that isn't in `knownOtherC11` is reported to the owner as a NEW C11 for review and is never shown.
- **Never listed:** Frozen Produce, Hollister Distribution, 510 Consultants.
- **Every other license is a store from `stores.json`** ("Store | City").
- **New flavors:** these come ONLY from the live menu repo `ncoburn11/live-menu` (git history of `index.html`, its `menu-data` VUZE list). GrowFlow is never used for this.
  - The snapshot for a Sunday is the live menu as of the last refresh that Sunday.
  - Flavors listed on Sunday W but not on the Sunday before are newly listed. That includes flavors back after selling out.
  - They show as "New flavors" for the Week of W + 15 days. For example, listed Sunday 11/1 shows on the Week of 11/16.
  - The live menu history starts 10/26/2026, so the 11/1 additions are logged by hand in `tools/state.json` `menuLog` (used instead of the history for that Sunday).
  - The 15-day lag is copied from Flavorade. CONFIRM WITH THE OWNER before relying on it for VUZE.
  - Read the live menu repo only. Never edit it, and never copy anything from it to this site except flavor names.
- **Strains of the Month:** 2 picks per month. There are no Strains of the Week.
  - Picked on the FIRST update of a new month (the Week-of date's month has no entry in `flavors-of-the-month.js`), then left alone for the rest of the month.
  - Pool: strains that dropped at a store in the published week or the 3 weeks before.
  - Priority (`rules.json` `fotm.tiers`): Head Crack > anything peanut-buttery tasting > anything gassy tasting > anything exotic-fruit tasting > the rest.
  - If two strains are at odds in the same tier, pick the one with the MOST INTERESTING tasting note. The dry-run report prints "TIE in ..." with the tied strains and their notes: make that call, then run the real update with `--fotm "Strain A|,Strain B|"`.
  - If the owner names the picks, use those (`--fotm`).
- **Deals:** from sheet `1U-1GkqFKb92WSr2AtFflDz_FgCciIZjsHdaUt7uPVE4`, tab "Current - 2026".
  - Use only rows where Brands includes VUZE and Confirmed? is TRUE.
  - A store-specific row beats a chain-wide row.
- **Only 6 months of weeks are kept.** Older weeks are deleted on every run.

## Steps
1. **Orders:** run `wholesale_query` (region `ca`, license `C11-0001795-LIC`) and page with `skip` 0, 50, 100… until you have `totalCount`. Save every page's raw JSON to a file:
   ```graphql
   { orders(skip: 0, take: 50, where: { transferDate: { gte: "<lastCutoff minus 21 days>", lt: "<now>" },
       stage: { in: [CLOSED, IN_TRANSFER] }, orderType: { in: [RETAIL, DISTRIBUTOR, MICRO_BUSINESS] } }, order: { transferDate: DESC })
     { totalCount items { poNumber orderType stage transferDate comment notes internalNote
       vendor { name licenseNumber vendorAddress } lineItems { isSample isEducationalSample isVoided product { name } } } } }
   ```
2. **Live menu history:** attach `ncoburn11/live-menu` read-only (add_repo) and clone it next to this repo as `../live-menu`.
   Store names: when a new license is added to `stores.json` here, add it to the Flavorade repo's too (and the other way around).
   Run `git -C ../live-menu fetch --unshallow` (or clone with `--depth 300`) so the history reaches at least 4 weeks back.
3. **Deals:** `get_spreadsheet` for the row count of "Current - 2026", then `get_values` `'Current - 2026'!A1:I<rowCount>`. Save the JSON as `deals.json`.
4. **Dry run:**
   `node tools/weekly.js --orders o1.json o2.json ... --deals deals.json --livemenu ../live-menu --dry`
5. **Fix what the report lists:**
   - **"Unknown store license":** look up the store name at `https://higherorigins.com/license-search/<LICENSE>` (fetch with `include_selectors: ["h1"]`) and check the GrowFlow address with a web search.
     - Add it to `stores.json` as "Store | City", using the town from the address spelled out ("Sacramento", not "Sac").
     - Also save the store's 5-digit zip from the GrowFlow address as `"zip"` in `stores.json`. The near-me search uses it; `tools/geo.js` rebuilds `geo.js` on every real run.
     - Off The Charts is "OTC". A Higher Ground "RD ..." entity is "Higher Ground". Use the store's existing name if it already appears in `data.js`.
   - **PMG, Perfect Union or Movocan "not recognized":** do NOT guess. Leave it held and ask the owner. Add their answer to `rules.json`.
   - **"NEED TASTING NOTES":** look each strain up in sheet `1UVE-yAzlKXEOEK8U1_znxgEOAi7Pgcqs9pifJTkUX0Q`, tab "Vuze - Tasting Notes".
     - Read the whole tab: `rowCount` first, then chunks of at most 400 rows.
     - Match against columns A to C (type, name, notes) and against the UNSORTED column E ("VUZE | Strain | Live Resin Vape Cart | 1g - Type - Notes" or "Strain - Type - Notes"). Prefer the UNSORTED entry; it is the current one.
     - Add each one to `tools/seed/notes.txt` (`Strain | Type | Notes`); weekly.js reads it on every run. If there's truly no note, publish without one and say so.
6. **Real run:** run the same command without `--dry`, adding `--notes notes.json`.
   - Commit `data.js`, `geo.js`, `stores.json`, `tools/seed/notes.txt`, `rules.json`, `flavors-of-the-month.js`, `tools/state.json` and `tools/last-report.md`, then push to `main`.
   - Never run it twice for the same Sunday without `--dry`. `lastCutoff` moves forward on every real run.
7. **Summary for the owner** (it goes out by push notification and email):
   - The week, number of stores, new strains, and Strains of the Month (say whether they were re-picked this run).
   - **Any NEW C11 licenses for review.**
   - Anything held back.
   - New stores you named.
   - Flavors missing tasting notes.
   - Any "NO LIVE MENU HISTORY" or "LIVE MENU REPO NOT READABLE" line. If you see one, fix the clone and re-run. Never publish a week with new flavors silently missing.

Data format is documented at the top of `data.js`. `index.html` needs no changes for a weekly update.

## Style
The page matches vuzeextracts.com: deep navy-teal (#071d26 to #030b10), one cyan accent (#55cbea), Jost/Proxima uppercase tracked headings,
black "NEW STRAINS EVERY MONDAY" ticker, and a camera-viewfinder frame on the hero. Say "strains", not "flavors", in customer copy.
