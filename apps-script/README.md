# ASC — Apps Script deployment

Apps Script hosts the page and reads data server-side as the script owner. No publish-to-web links, no CORS, no snapshot pasting.

| Tab | Source | Freshness |
|---|---|---|
| Mac | Sheet `1bkWySuW…` tab `Macs` | ≤5 min after edit |
| Windows | Sheet `1q10aqxv…` tab `Windows` | ≤5 min after edit |
| Sites & Apps | Setyl API → auto-created cache Sheet (`syncSetyl`, daily ~06:00) | Daily |

## Setup (one-off, ~15 min)

1. **Setyl** → Company Settings → API Service → *Generate API Key* (Owner role needed). Copy the key once; it isn't shown again.
2. **script.google.com** → New project → name `ASC - Approved Software Catalog`.
   - Replace `Code.gs` with `apps-script/Code.gs`.
   - Add script file `Setyl` (+ → Script) → paste `apps-script/Setyl.gs`.
   - Add HTML file named exactly `index` → paste `apps-script/index.html`.
3. **Project Settings → Script Properties**: add `SETYL_API_KEY` and `SETYL_CONSUMER_ID`.
4. Run **`testSetyl`** → authorise → check Execution log. Confirm `SETYL.appsPath` returns records and that `fields` names match the "First record keys" line. Adjust config if not.
5. Run **`setup`** → creates the Setyl cache Sheet + `Sync Log` tab, installs the daily trigger, runs the first sync.
6. **Deploy → New deployment → Web app**: Execute as *Me*, Access *Anyone within pensionbee.com*. Copy the `/exec` URL.
7. **Google Sites** → Insert → Embed → *By URL* → paste `/exec` URL.
8. Unpublish both "Publish to web" links (File → Share → Publish to web → Stop publishing).

## Operations

- **Sync evidence:** `Sync Log` tab — timestamp, result, app count, duration per run.
- **Failure handling:** failed sync keeps last good data, emails the script owner, logs `FAILED`.
- **Code changes:** Deploy → Manage deployments → edit → *New version* (keeps the same URL).
- **Continuity:** add a second owner (Shared Drive or co-owner). Script runs as the deployer; if that account is suspended, the page and sync stop.
- **Key rotation:** regenerate in Setyl → update `SETYL_API_KEY` → run `syncSetyl`.
