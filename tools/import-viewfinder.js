#!/usr/bin/env node
// One-time seed: turns the old text "Viewfinder" page (vuzeextracts.com/releases) into data.js.
//   node tools/import-viewfinder.js tools/seed/viewfinder-2026-11-14.md tools/seed/notes.txt
// Format it reads:  "Week of November 2nd 2026" / "New Flavors" + "-Flavor" lines /
//                   "Shop | City - Deal" + "- Flavor" lines.
// Store names are cleaned up (one spelling per store, "Sac" -> "Sacramento") with the maps below.
const fs = require('fs');
const L = require('./lib');
const [src, notesFile] = process.argv.slice(2);

const FLAVOR = { 'apricot mints': 'Apricot Mintz', 'pb & j': 'PB&J', 'tropical hazlenut': 'Tropical Hazelnut', 'now n melon': 'Now N Melon' };
const CITY = { sac: 'Sacramento', la: 'Los Angeles', lb: 'Long Beach', 'n hollywood': 'North Hollywood', 'w hollywood': 'West Hollywood',
  'mc farland': 'McFarland', 'marina del ray': 'Marina del Rey', 'marina del rey': 'Marina del Rey', newport: 'Newport Beach' };
// "shop|city" (lowercase, after city clean-up) -> [shop, city]
const STORE = {
  'march and ash|imperial valley': ['March & Ash', 'Imperial Valley'], 'march and ash|palm desert': ['March & Ash', 'Palm Desert'],
  'march and ash|mission valley': ['March & Ash', 'Mission Valley'], 'march and ash|sabre springs': ['March & Ash', 'Sabre Springs'],
  'march & ash mission valley|san diego': ['March & Ash', 'Mission Valley'], 'march & ash sabre springs|san diego': ['March & Ash', 'Sabre Springs'],
  'march & ash nirvana|chula vista': ['March & Ash', 'Nirvana'],
  'puff n dash|city heights': ['Puff-N-Dash', 'City Heights'],
  'nug|alameda': ['NUG', 'Alameda'], 'nug|oakland': ['NUG', 'Oakland'], 'nug|red bluff': ['NUG', 'Red Bluff'], 'nug|riverside': ['NUG', 'Riverside'], 'nug|vallejo': ['NUG', 'Vallejo'],
  'nug cannavine|belmont': ['NUG', 'Belmont'], 'nug x sundial collective|redding': ['NUG', 'Redding'],
  'goat global|westwood': ['GOAT Global', 'Westwood'], 'goat global westwood|los angeles': ['GOAT Global', 'Westwood'], 'goat global westwood|lynwood': ['GOAT Global', 'Westwood'],
  'goat global south bay|los angeles': ['GOAT Global', 'South Bay'],
  'highway 80 (club 420)|davis': ['Highway 80 Club 420', 'Davis'], 'highway 80 (club 420)|dixon': ['Highway 80 Club 420', 'Dixon'],
  'highway 80 - club 420|davis': ['Highway 80 Club 420', 'Davis'], 'highway 80 - club 420|dixon': ['Highway 80 Club 420', 'Dixon'],
  'club 420|davis': ['Highway 80 Club 420', 'Davis'], 'club 420|dixon': ['Highway 80 Club 420', 'Dixon'],
  'herbal remedies|bishop boyz': ['Herbal Remedies', 'Van Nuys'], 'herbal remedies bishop boyz|van nuys': ['Herbal Remedies', 'Van Nuys'],
  'budology #1|san jacinto': ['Budology', 'San Jacinto'], 'budology #2|hemet': ['Budology', 'Hemet'],
  'jaderoom oc|santa ana': ['Jaderoom', 'Santa Ana'], 'cannavine distro|ukiah': ['Cannavine', 'Ukiah'],
  'packs south la|huntington park': ['Packs', 'Huntington Park'],
  'xzibits wcc chatsworth|los angeles': ['Xzibits', 'Chatsworth'], 'xzibits chatsworth|los angeles': ['Xzibits', 'Chatsworth'],
  'otc eaglerock|los angeles': ['OTC', 'Eagle Rock'], 'otc sherman oaks|los angeles': ['OTC', 'Sherman Oaks'], 'otc airport|hemet': ['OTC', 'Hemet'],
  'otc miramar|san diego': ['OTC Miramar', 'San Diego'], 'otc lounge|palm springs': ['OTC Lounge', 'Palm Springs'],
  'jungle boys dtla|los angeles': ['Jungle Boys', 'Downtown LA'], 'jungle boys oc|santa ana': ['Jungle Boys', 'Santa Ana'],
  'megans organic|goleta': ["Megan's Organic Market", 'Goleta'], 'megans organic market|san luis obispo': ["Megan's Organic Market", 'San Luis Obispo'],
  'zen south|sacramento': ['Zen', 'South Sacramento'],
  'cake sd 420|san diego': ['Cake SD 420', 'San Diego'],
  // same store, spelled the way stores.json (GrowFlow licenses) names it
  'the source central coast|nipomo': ['The Source', 'Nipomo'], 'nug wellness|san leandro': ['NUG', 'San Leandro'],
  'zen garden|stockton': ['Zen Garden Wellness', 'Stockton'], 'sundial collective south|red bluff': ['Sundial Collective', 'Red Bluff'],
};
const MON = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };

const notes = {};
for (const line of fs.readFileSync(notesFile, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [s, t, n] = line.split('|').map(x => x.trim());
  notes[L.norm(s)] = { type: t, notes: n };
}

const lines = fs.readFileSync(src, 'utf8').split('\n').map(l => l.trim());
const weeks = []; let cur = null, mode = null;
for (const l of lines.slice(lines.findIndex(x => x.startsWith('Week of')))) {
  if (!l) continue;
  const w = l.match(/^Week of (\w+) (\d+)\w*(?: (\d{4}))?/);
  if (w) { cur = { week: `${w[3] || 2026}-${String(MON[w[1]]).padStart(2, '0')}-${w[2].padStart(2, '0')}`, new: [], drops: [] }; weeks.push(cur); mode = null; continue; }
  if (/^new flavors?:?$/i.test(l)) { mode = 'new'; continue; }
  if (/^-\s*\S/.test(l)) {
    const f = l.replace(/^-\s*/, '').trim();
    if (mode === 'new') cur.new.push(f); else if (mode === 'drop') cur.drops[cur.drops.length - 1].f.push(f);
    else throw new Error('flavor with no store: ' + l);
    continue;
  }
  if (l.includes('|')) {
    const [shop, rest] = [l.slice(0, l.indexOf('|')).trim(), l.slice(l.indexOf('|') + 1).trim()];
    const m = rest.match(/^(.*?)\s+-\s+(.*)$/);
    cur.drops.push({ shop, city: m ? m[1] : rest, deal: L.cleanDeal(m ? m[2] : ''), f: [] }); mode = 'drop'; continue;
  }
  throw new Error('line not understood: ' + l);
}

const products = [], pIdx = new Map(), missing = new Set();
const flavorName = f => FLAVOR[f.toLowerCase()] || f;
function pid(raw) {
  const name = flavorName(raw), k = L.norm(name);
  if (pIdx.has(k)) return pIdx.get(k);
  const n = notes[k]; if (!n) missing.add(name);
  products.push([name, '', n ? n.type : '', n ? n.notes : '']); pIdx.set(k, products.length - 1);
  return products.length - 1;
}
const fixCity = c => CITY[c.toLowerCase()] || c;
const drops = [], newFlavors = {};
for (const w of weeks) {
  if (w.new.length) newFlavors[w.week] = [...new Set(w.new.map(pid))];
  const rows = new Map();
  for (const d of w.drops) {
    let shop = d.shop, city = fixCity(d.city);
    const fix = STORE[(shop + '|' + city).toLowerCase()]; if (fix) [shop, city] = fix;
    if (/^nug$/i.test(shop)) shop = 'NUG';
    const k = L.norm(shop) + '|' + L.norm(city);
    if (!rows.has(k)) { rows.set(k, [w.week, shop, city, d.deal, []]); drops.push(rows.get(k)); }
    const r = rows.get(k); if (!r[3] && d.deal) r[3] = d.deal;
    r[4] = [...new Set(r[4].concat(d.f.map(pid)))];
  }
}
const R = { updated: '2026-11-14', products, newFlavors, drops };
L.saveData(R);
console.log(`${weeks.length} weeks, ${drops.length} store drops, ${products.length} flavors`);
if (missing.size) console.log('NO TASTING NOTES:', [...missing].join(', '));
