# VUZE Viewfinder: the release finder for vuzeextracts.com/releases

The Viewfinder lives in this repo and is served by GitHub Pages at:

    https://ncoburn11.github.io/Vuze-Menu/

It replaces the old text-only Viewfinder (the long list you had to Ctrl+F through). Every week on the
old page, from Week of January 5 to Week of November 9, 2026, was imported (`tools/import-viewfinder.js`).

## Put it on vuzeextracts.com/releases

1. In Squarespace, open the **Releases** page and edit it.
2. Delete the old text blocks (THE VIEWFINDER heading, the Control + F instructions, and the week-by-week list).
3. Add a **Code Block** and paste this:

```html
<iframe id="vuze-viewfinder" src="https://ncoburn11.github.io/Vuze-Menu/"
  title="VUZE Viewfinder" loading="lazy" allow="geolocation"
  style="width:100%;height:1400px;border:0;display:block;background:#071d26"></iframe>
<script>
  window.addEventListener('message', function (e) {
    if (e.data && e.data.vuzeHeight) {
      document.getElementById('vuze-viewfinder').style.height = e.data.vuzeHeight + 'px';
    }
  });
</script>
```

The frame grows and shrinks to fit the page, so customers never see a second scrollbar.

## What shoppers get

- **This Week:** new strains and every shop that got a fresh drop, with that shop's VUZE deal.
- **All Strains:** every strain from the last 6 months with its type and tasting notes. Search by taste ("peach", "coffee", "onions").
- **All-Time:** week-by-week drop history, newest first.
- **Saved:** tap the heart on any strain to keep it on that phone.
- **Near me:** type a zip or tap "Use my location" to sort shops by distance. Nothing is sent anywhere.
- **Strains of the Month:** two picks, refreshed on the first update of each month (Head Crack, then peanut-buttery, gassy, exotic fruit).

## Weekly updates

Same flow as the Flavorade Release Finder, run every Sunday evening (or tell Claude "update vuze releases"):

1. Read the past week's VUZE deliveries from GrowFlow.
2. Read new strains off the live menu (`ncoburn11/live-menu`, VUZE tab history).
3. Pull tasting notes from the "Vuze - Tasting Notes" tab and deals (rows where Brands includes VUZE) from the deals sheet.
4. Run `tools/weekly.js` and push the new `data.js` here.

The full procedure is in `CLAUDE.md`. `stores.json` maps each GrowFlow license to the shop name and city customers see.
