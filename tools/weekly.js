#!/usr/bin/env node
// Sunday release update for the VUZE Viewfinder. See CLAUDE.md for the full procedure.
//
//   node tools/weekly.js --orders o1.json [o2.json ...] --deals deals.json \
//        [--livemenu ../live-menu] [--notes notes.json] [--now 2026-11-15T16:47:00Z] [--dry]
//
// --orders    GrowFlow order query pages (see CLAUDE.md for the query).
// --deals     Values of the "Current - 2026" tab of the deals sheet (JSON from get_values).
// --livemenu  A full-history clone of ncoburn11/live-menu (read-only). Default: ../live-menu
// --notes     {"Strain|Collab": {"type": "...", "notes": "..."}} for flavors new to data.js.
// --now       Pretend the run happens at this time (testing). Default: now.
// --fotm      Strains of the Month override for this run's month: "Strain A|,Strain B|".
// --dry       Print the report, change nothing.
//
// Rules: see CLAUDE.md and rules.json. New flavors come only from the live menu repo's history:
// VUZE SKUs newly listed on Sunday W (vs the Sunday before) are new for the Week of W + 15 days.
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const args = process.argv.slice(2);
const opt = { orders: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--orders') { const k = a.slice(2); while (args[i + 1] && !args[i + 1].startsWith('--')) opt[k].push(args[++i]); }
  else if (a === '--dry') opt.dry = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
}
const ROOT = L.ROOT;
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const rules = readJSON(path.join(ROOT, 'rules.json'));
const statePath = path.join(ROOT, 'tools', 'state.json');
const state = readJSON(statePath);
const stores = readJSON(path.join(ROOT, 'stores.json'));
const notes = opt.notes ? readJSON(opt.notes) : {};
// Tasting notes kept in the repo (tools/seed/notes.txt, from the Vuze - Tasting Notes tab) fill in anything --notes lacks.
for (const line of fs.readFileSync(path.join(ROOT, 'tools', 'seed', 'notes.txt'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [s, t, n] = line.split('|').map(x => x.trim());
  if (!notes[s + '|'] && !notes[s]) notes[s] = { type: t, notes: n };
}
const R = L.loadData();
const norm = L.norm;

const NOW = opt.now ? new Date(opt.now) : new Date();
const DAY = 86400000;
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = L.caDate(NOW);
const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
const WEEK = addDays(today, dow === 0 ? 1 : 8 - dow);     // the coming Monday
const SUNDAY = addDays(WEEK, -1);                          // this run's Sunday
// A week can be run more than once (e.g. Saturday, then Sunday). Every run that publishes the same Week-of
// re-reads that week's whole window, from where its FIRST run started, and merges into it: stores and strains
// already on the week are kept, anything new is added to the same week. state.weeks[WEEK] = {since, pos}.
state.weeks = state.weeks || {};
const priorRun = state.weeks[WEEK] || null;
const since = new Date(priorRun ? priorRun.since : state.lastCutoff);

/* ---------- effective date ---------- */
function effectiveDate(o) {
  const t = new Date(o.transferDate);
  const text = [o.comment, o.notes, o.internalNote].filter(Boolean).join(' ');
  let best = t;
  for (const m of text.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/g)) {
    const mo = +m[1], d = +m[2]; if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const years = m[3] ? [m[3].length === 2 ? 2000 + +m[3] : +m[3]] : [t.getUTCFullYear() - 1, t.getUTCFullYear(), t.getUTCFullYear() + 1];
    for (const y of years) {
      const c = new Date(Date.UTC(y, mo - 1, d, 20)); // noon California
      if (c > t && c - t <= 30 * DAY && L.caDate(c) > L.caDate(t) && c > best) best = c;
    }
  }
  return best;
}

/* ---------- which store(s) an order belongs to ---------- */
const sampleLine = li => li.isSample || li.isEducationalSample || li.isVoided;
function classify(o) {
  const v = o.vendor || {}, lic = v.licenseNumber || '', vname = (v.name || '').trim();
  const text = [o.comment, o.notes, o.internalNote].filter(Boolean).join(' ');
  if (rules.neverList[lic]) return { skip: 'never listed: ' + rules.neverList[lic] };
  const puByName = new RegExp(rules.perfectUnionVendorNamePattern, 'i').test(vname);
  const allowed = rules.c11Allowed[lic] || (puByName ? { mode: 'perfectUnion', name: vname } : null);
  if (lic.startsWith('C11-') && !allowed) {
    return rules.knownOtherC11[lic] ? { skip: 'C11 not shown: ' + rules.knownOtherC11[lic] } : { newC11: true, skip: 'NEW C11 (not shown): ' + vname };
  }
  if (allowed) {
    if (allowed.skipIfNote && new RegExp(allowed.skipIfNote, 'i').test(text)) return { skip: allowed.name + ' staff samples' };
    if (allowed.mode === 'fixed') return { shops: [[allowed.shop, allowed.city]] };
    if (allowed.mode === 'pmg') {
      const code = String(o.comment || '').replace(/\*/g, ' ').replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
      // match the comment to a known code, or to that store's "shop city" / "city shop" / city / shop
      const entries = Object.entries(rules.pmgComments), c = norm(code);
      const forms = ([k, m]) => [k].concat(m ? [m[0] + m[1], m[1] + m[0], m[1], m[0]] : []).map(norm);
      let hit = entries.find(e => norm(e[0]) === c) || entries.find(e => forms(e).slice(1, 3).includes(c));
      if (!hit) { const one = entries.filter(e => forms(e).slice(3).includes(c)); if (one.length === 1) hit = one[0]; }
      if (!hit) return { hold: `PMG comment not recognized: "${o.comment || ''}"` };
      const [key, m] = hit;
      return m ? { shops: [m] } : { skip: `PMG "${key}" is not listed` };
    }
    if (allowed.mode === 'perfectUnion') {
      const T = text.toUpperCase();
      const hit = rules.perfectUnionCodes.find(([code]) => T.includes(code));
      if (!hit) return { hold: `Perfect Union shop not recognized: "${text}"` };
      return hit[1] ? { shops: [['Perfect Union', hit[1]]] } : { skip: `Perfect Union ${hit[0]} is not listed` };
    }
    if (allowed.mode === 'movocan') {
      const cities = rules.movocanCities.filter(c => norm(text).includes(norm(c)));
      if (!cities.length) return { hold: `Movocan city not found in notes: "${text}"` };
      return { shops: cities.map(c => ['Movocan', c]) };
    }
  }
  const s = stores[lic];
  if (!s) return { hold: `Unknown store license ${lic}: ${vname}, ${v.vendorAddress || ''} (look it up, add to stores.json)` };
  return { shops: [[s.shop, s.city]] };
}

/* ---------- products ---------- */
const pKey = (strain, collab) => norm(collab) + '|' + norm(strain);
const pIndex = new Map(R.products.map((p, i) => [pKey(p[0], p[1]), i]));
const created = [];
function pid(f) {
  const k = pKey(f.strain, f.collab);
  if (pIndex.has(k)) return pIndex.get(k);
  const n = notes[`${f.strain}|${f.collab}`] || notes[f.strain] || null;
  const i = R.products.length;
  R.products.push([f.strain, f.collab, n ? n.type || '' : '', n ? n.notes || '' : '']);
  pIndex.set(k, i); created.push(i);
  return i;
}
// fill in notes for existing products that have none
for (const [k, n] of Object.entries(notes)) {
  const [strain, collab = ''] = k.split('|');
  const i = pIndex.get(pKey(strain, collab)); if (i == null) continue;
  if (!R.products[i][3] && n.notes) R.products[i][3] = n.notes;
  if (!R.products[i][2] && n.type) R.products[i][2] = n.type;
}

/* ---------- drops for WEEK ---------- */
const orders = L.readOrders(opt.orders);
const ownPOs = new Set(priorRun ? priorRun.pos : []); // this week's own orders are read again, not skipped
const published = new Set((state.publishedPOs || []).filter(po => !ownPOs.has(po)));
const report = { holds: [], newC11: new Map(), skipped: [], used: [], kept: [] };
const rows = new Map(); // shop|city -> row
for (const o of orders.sort((a, b) => a.transferDate < b.transferDate ? -1 : 1)) {
  if (!rules.includeStages.includes(o.stage) || !rules.includeOrderTypes.includes(o.orderType)) continue;
  if (published.has(o.poNumber)) continue;
  const eff = effectiveDate(o);
  if (!(eff > since && eff <= NOW)) continue;
  const flavors = (o.lineItems || []).filter(li => !sampleLine(li)).map(li => L.parseProduct(li.product && li.product.name)).filter(Boolean);
  if (!flavors.length) continue;
  const c = classify(o);
  if (c.newC11) report.newC11.set(o.vendor.licenseNumber, (o.vendor.name || '').trim());
  if (c.skip) { report.skipped.push(`PO ${o.poNumber}: ${c.skip}`); continue; }
  if (c.hold) { report.holds.push(`PO ${o.poNumber}: ${c.hold}`); continue; }
  for (const [shop, city] of c.shops) {
    const k = norm(shop) + '|' + norm(city);
    if (!rows.has(k)) rows.set(k, [WEEK, shop, city, '', []]);
    const r = rows.get(k); r[4] = [...new Set(r[4].concat(flavors.map(pid)))];
  }
  report.used.push(o.poNumber);
}
const drops = [...rows.values()];
// merge with what this week already shows, so a re-run never drops a store or strain
const added = [];
if (priorRun) {
  for (const old of R.drops.filter(d => d[0] === WEEK)) {
    const k = norm(old[1]) + '|' + norm(old[2]);
    const cur = rows.get(k);
    if (!cur) { drops.push([WEEK, old[1], old[2], old[3], old[4].slice()]); report.kept.push(`${old[1]} | ${old[2]}`); continue; }
    const extra = cur[4].filter(i => !old[4].includes(i));
    if (extra.length) added.push(`${old[1]} | ${old[2]}: + ${extra.map(i => R.products[i][0]).join(', ')}`);
    cur[4] = [...new Set(old[4].concat(cur[4]))];
  }
  const had = new Set(R.drops.filter(d => d[0] === WEEK).map(d => norm(d[1]) + '|' + norm(d[2])));
  for (const d of drops) if (!had.has(norm(d[1]) + '|' + norm(d[2]))) added.push(`${d[1]} | ${d[2]}: new store this week`);
}

/* ---------- deals from the sheet ---------- */
const dealFinder = L.dealFinder;
let dealsApplied = 0;
if (opt.deals) {
  const find = dealFinder(readJSON(opt.deals));
  for (const d of drops.concat(R.drops)) { const deal = find(d[1], d[2]); if (deal !== d[3]) { d[3] = deal; dealsApplied++; } }
}

/* ---------- new flavors, from the live menu repo's history ---------- */
// Flavors newly listed on the live menu on Sunday W (vs the Sunday before) are "New flavors"
// for the Week of W + 15 days. A flavor that comes back after selling out also counts as new.
const LM = require('./livemenu');
const liveRepo = opt.livemenu || path.join(ROOT, '..', 'live-menu');
const newWeekend = addDays(WEEK, -15);
const liveNote = [];
function addedOn(W) {
  if (state.menuLog && state.menuLog[W]) { liveNote.push(`Sunday ${W}: owner-provided list`); return state.menuLog[W]; }
  let a, b;
  try { a = LM.snapshotAt(liveRepo, W); b = LM.snapshotAt(liveRepo, addDays(W, -7)); }
  catch (e) { liveNote.push(`LIVE MENU REPO NOT READABLE at ${liveRepo}: ${e.message.split('\n')[0]}`); return null; }
  const fresh = s => s && L.caDate(new Date(s.updated)) > addDays(W, -7) ; // snapshot must come from that week
  if (!a || !b || !fresh(a)) { liveNote.push(`NO LIVE MENU HISTORY for Sunday ${W} (or the Sunday before); new flavors not set`); return null; }
  liveNote.push(`Sunday ${W}: live menu ${a.commit} (${a.updated}) vs ${b.commit} (${b.updated})`);
  return a.flavors.filter(x => !b.flavors.includes(x));
}
const newNames = addedOn(newWeekend) || [];
const newIds = newNames.map(n => { const [strain, collab = ''] = n.split('|'); return pid({ strain, collab: L.fixCollab(collab) }); });

/* ---------- Strains of the Month (rules.json fotm) ---------- */
// Picked on the first run of a new month (by the Week-of date), then left alone for the month.
// Pool: strains that dropped at a store in this week or the 3 weeks before. Ranking: rules.fotm.tiers in order
// (Head Crack, peanut-buttery, gassy, exotic fruit, everything else). Ties inside a tier: the most interesting
// tasting note wins; that is a judgment call, so the report lists the tied strains and --fotm "A|,B|" overrides.
const storesThisWeek = id => drops.filter(d => d[4].includes(id)).length;
const MONTH = WEEK.slice(0, 7);
const fotmPath = path.join(ROOT, 'flavors-of-the-month.js');
const fotm = (() => { try { const s = fs.readFileSync(fotmPath, 'utf8'); return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { return {}; } })();
const TIERS = rules.fotm.tiers.map(t => ({ name: t.name, re: new RegExp(t.match, 'i'), on: t.on }));
function tier(i) {
  const [name, , , n] = R.products[i];
  for (let k = 0; k < TIERS.length; k++) { const t = TIERS[k]; if (t.re.test(t.on === 'name' ? name : t.on === 'both' ? name + ' ' + (n || '') : (n || ''))) return k + 1; }
  return TIERS.length + 1;
}
const tierName = k => (TIERS[k - 1] || { name: 'everything else' }).name;
const recentFrom = addDays(WEEK, -21);
const poolStores = new Map();
for (const d of drops.concat(R.drops.filter(d => d[0] >= recentFrom && d[0] !== WEEK))) for (const id of d[4]) poolStores.set(id, (poolStores.get(id) || 0) + 1);
const ranked = [...poolStores.keys()].sort((a, b) => tier(a) - tier(b) || poolStores.get(b) - poolStores.get(a) || R.products[a][0].localeCompare(R.products[b][0]));
let fotmPicks = null, fotmNote = '';
if (opt.fotm) {
  fotmPicks = opt.fotm.split(',').map(x => x.trim()).filter(Boolean).map(x => x.includes('|') ? x : x + '|');
  fotmNote = 'set by --fotm';
} else if (!fotm[MONTH]) {
  const top = ranked.slice(0, rules.fotm.count);
  fotmPicks = top.map(i => `${R.products[i][0]}|${R.products[i][1]}`);
  const edge = top.length ? tier(top[top.length - 1]) : 0;
  const tied = ranked.filter(i => tier(i) === edge);
  if (tied.length > top.filter(i => tier(i) === edge).length)
    fotmNote = `TIE in "${tierName(edge)}": choose the most interesting tasting note among ${tied.map(i => `${R.products[i][0]} ("${R.products[i][3]}")`).join(', ')}; re-run with --fotm "A|,B|" if the pick should change`;
}

/* ---------- report ---------- */
const pname = i => R.products[i][0] + (R.products[i][1] ? ' x ' + R.products[i][1] : '');
const out = [];
out.push(`# Release update: Week of ${WEEK}`, '');
out.push(`- Orders window: ${since.toISOString()} to ${NOW.toISOString()}`);
if (priorRun) out.push(`- RE-RUN of Week of ${WEEK} (already published): merged into the same week. Added: ${added.length ? added.join('; ') : 'nothing new'}${report.kept.length ? '. Kept from the earlier run (not in this run\'s orders): ' + report.kept.join(', ') : ''}`);
out.push(`- Stores published: ${drops.length} (from ${report.used.length} orders)`);
out.push(`- New flavors (newly listed on the live menu Sunday ${newWeekend}): ${newIds.length ? newIds.map(pname).join(', ') : 'none logged'}`);
out.push(fotmPicks ? `- Strains of the Month (${MONTH}): ${fotmPicks.map(k => { const i = ranked.find(j => `${R.products[j][0]}|${R.products[j][1]}` === k); return i == null ? k.replace(/\|$/, '') : `${pname(i)} (${tierName(tier(i))}, ${poolStores.get(i)} store drops in 4 wks)`; }).join('; ')}${fotmNote ? ' (' + fotmNote + ')' : ''}`
  : `- Strains of the Month (${MONTH}): unchanged (${(fotm[MONTH] || []).join(', ')}); next pick on the first run of next month`);
out.push(`- New-flavor source: ${liveNote.join('; ')}`);
const noNotes = [...new Set(newIds.concat(created))].filter(i => !R.products[i][3]);
if (noNotes.length) out.push(`- NEED TASTING NOTES: ${noNotes.map(i => R.products[i][0] + '|' + R.products[i][1]).join(', ')}`);
out.push(`- Deals updated on ${dealsApplied} store rows`);
if (report.newC11.size) { out.push('', '## NEW C11 licenses for owner review (not shown on the page)'); for (const [l, n] of report.newC11) out.push(`- ${l}: ${n}`); }
if (report.holds.length) { out.push('', '## Held back (needs a decision)'); report.holds.forEach(h => out.push('- ' + h)); }
out.push('', '## Drops', ...drops.map(r => `- ${r[1]} | ${r[2]}${r[3] ? ' (' + r[3] + ')' : ''}: ${r[4].map(i => R.products[i][0]).join(', ')}`));
if (report.skipped.length) out.push('', '## Skipped orders', ...report.skipped.map(s => '- ' + s));
const text = out.join('\n') + '\n';
console.log(text);
if (opt.dry) process.exit(0);

/* ---------- write ---------- */
const CUTOFF = addDays(WEEK, -182);
R.drops = drops.concat(R.drops.filter(d => d[0] !== WEEK)).filter(d => d[0] >= CUTOFF);
if (newIds.length) R.newFlavors[WEEK] = newIds; else delete R.newFlavors[WEEK];
for (const w of Object.keys(R.newFlavors)) if (w < CUTOFF) delete R.newFlavors[w];
R.updated = today;
L.saveData(R);

if (fotmPicks) fotm[MONTH] = fotmPicks;
for (const m of Object.keys(fotm)) if (m < CUTOFF.slice(0, 7)) delete fotm[m];
fs.writeFileSync(fotmPath, `// Strains of the Month, 2 picks per month, chosen on the first Sunday update of a new month (tools/weekly.js, rules.json fotm).
window.FLAVORS_OF_THE_MONTH = ${JSON.stringify(Object.fromEntries(Object.entries(fotm).sort().reverse()), null, 2)};
`);

state.lastCutoff = NOW.toISOString();
state.weeks[WEEK] = { since: since.toISOString(), pos: [...new Set((priorRun ? priorRun.pos : []).concat(report.used))] };
for (const w of Object.keys(state.weeks)) if (w < CUTOFF) delete state.weeks[w];
state.publishedPOs = [...new Set((state.publishedPOs || []).concat(report.used))].slice(-3000);
delete state.menuSnapshot;
for (const w of Object.keys(state.menuLog || {})) if (w < addDays(CUTOFF, -30)) delete state.menuLog[w];
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'tools', 'last-report.md'), text);
const geo = require('./geo').build(); // store locations for the near-me search
if (geo.missing.length) console.log('Stores with no location for near-me (add a zip to stores.json):', geo.missing.join(', '));
console.log('Written: data.js, flavors-of-the-month.js, tools/state.json, tools/last-report.md');
