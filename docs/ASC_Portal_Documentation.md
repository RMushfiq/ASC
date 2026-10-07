# Approved Software Catalog (ASC) Portal — Full Documentation

| | |
|---|---|
| **Owner** | Rahim Mushfiq, IT Operations Engineer |
| **Sponsor** | Pav — SVP Information Security & IT Operations |
| **Data owners** | InfoSec (Mac/Windows catalog Sheets) · IT Ops (Setyl register) |
| **Backup owner** | Michal Siedlarski (to be added as co-owner, see §12) |
| **Status** | v1 live on Apps Script web app — 7 Oct 2026 |
| **Code** | GitHub `RMushfiq/ASC`, branch `claude/beautiful-thompson-4f0va5`, folder `apps-script/` |
| **Web app** | `https://script.google.com/a/macros/pensionbee.com/s/AKfycbyK6xLZRZw4xaTDZU_dHdC_0ZEyeUK5r4hgHerXN24vcN3K8tiwrM9cA9h16hR9Geh1/exec` (PensionBee accounts only) |

---

## Contents

1. [Executive summary](#1-executive-summary)
2. [Where we started (before ASC Portal)](#2-where-we-started-before-asc-portal)
3. [Iteration history](#3-iteration-history)
4. [Current state — what staff see](#4-current-state--what-staff-see)
5. [Architecture — how it all works](#5-architecture--how-it-all-works)
6. [Sync & refresh mechanics](#6-sync--refresh-mechanics)
7. [Setyl API integration](#7-setyl-api-integration)
8. [Google Sheets configuration](#8-google-sheets-configuration)
9. [Apps Script project — files and purpose](#9-apps-script-project--files-and-purpose)
10. [Security, privacy & compliance controls](#10-security-privacy--compliance-controls)
11. [Operations runbook (KB)](#11-operations-runbook-kb)
12. [Known gaps, risks & open actions](#12-known-gaps-risks--open-actions)
13. [Change request summary](#13-change-request-summary)
14. [Performance review summary](#14-performance-review-summary)
15. [Appendix — key data points & timeline](#15-appendix--key-data-points--timeline)

---

## 1. Executive summary

PensionBee's Approved Software Catalog (ASC) was a set of static spreadsheets plus Google Sites pages that had drifted out of sync. It is now a **self-updating, searchable intranet portal**:

- **Mac & Windows catalogs** are read live from InfoSec's Google Sheets. Edits appear on the intranet **within 5 minutes**, with no republishing, exporting or code changes.
- **Sites & Apps (SaaS)** are pulled **automatically every day from Setyl via its API**. Every app in **Register** or **Onboarding** state is shown as Approved — **221 apps** on day one, with **Business Owner, Technical Owner and Authentication Method** pulled directly from Setyl.
- Staff can search by app name **or by need** (e.g. "video calls", "screenshot", "pdf"). Each result says how to get the app. **No match = "Not approved — raise a Procurement request"**, which is the shadow-IT prevention point.
- Built entirely on **Google Apps Script** (no new infrastructure, no cost, no new vendor), access restricted to PensionBee Google accounts, **read-only** against Setyl, with an audit log of every sync.

## 2. Where we started (before ASC Portal)

| Area | Before |
|---|---|
| **Format** | Two static Google Sheets: `Intranet - Macs - Approved Catalog` (40 apps) and `Intranet - Windows - Approved Catalog` (43 apps). Columns: Application Name, Install Options, Description. |
| **Intranet** | Google Sites pages copied from the Sheets; **out of sync since Sept 2025**. |
| **Data quality** | 32 of 83 entries had **no description** (8 Mac, 24 Windows). Several were wrong or unhelpful (e.g. Ollama described as a "creative collaboration platform"; Firefox described with version trivia; duplicate "SEO Spider" / "Screaming Frog SEO Spider"). |
| **SaaS / web apps** | Lived only in Setyl (Sites & Apps register). **Not visible to staff at all.** |
| **Staff experience** | No way to search by need ("I need a notetaker"). No clear "not approved" answer, so it defaulted to shadow IT or a service-desk question. |
| **Maintenance** | Manual: update the Sheet, then manually update Sites. |

**Pav's brief (1-2-1):** a staff member should be able to search "PDF creator" and be told which one is approved and how to get it, or search "I need a notetaker" and be told "the only approved notetaker is Gemini". Keep it simple. Mac/Windows first, Setyl later. Model it on the Risk team's interactive dashboard.

## 3. Iteration history

### Iteration 1 — single-file HTML embed (Jul 2026)

- One self-contained HTML/CSS/JS page pasted into Google Sites (Insert → Embed → Embed code).
- Intended to `fetch()` each Sheet's **"Publish to web" CSV** link at page load.
- **Blocker found:** the publish-to-web links are restricted to the pensionbee.com domain, which is the correct security setting. A `fetch()` from a sandboxed Sites iframe does not carry the user's Google session, so Google returns a **sign-in page (HTTP 200)** instead of CSV.
- **Workaround shipped:** an embedded **snapshot** of both catalogs inside the page, plus detection of the sign-in-page response. It worked, but **refreshing still needed a manual CSV paste** into the embed code. That didn't meet the "no manual work" goal.
- Delivered alongside: 32 AI-drafted descriptions, marked "AI-drafted — needs InfoSec confirmation", with a review list for InfoSec.

### Iteration 2 — Google Apps Script web app + Setyl API (Oct 2026), current

- **Key design change:** instead of the browser fetching data, **Apps Script hosts the page and reads the Sheets server-side**, running as the script owner. There are no CORS, cookie or publish-to-web problems, and the Sheets do not need to be shared with all staff.
- Added a **Setyl API daily sync**, which replaces the planned manual 6-monthly Setyl export.
- Hardened through live testing (see §7.4): read-only API enforcement, an approved-state allowlist, owner-name resolution, and splitting the code into small files to survive editor paste limits.

## 4. Current state — what staff see

Three tabs: **Mac · Windows · Sites & Apps**, plus a search box.

**Each result card shows:**

| Element | Mac / Windows | Sites & Apps (Setyl) |
|---|---|---|
| Name + ✓ Approved badge | ✓ | ✓ (+ "Onboarding" tag if in onboarding) |
| Description | From Sheet. If blank → AI-drafted (amber tag), else "Description pending InfoSec review" | From Setyl when available (see §12). Otherwise as left |
| Authentication method | — | Badge, e.g. *Okta SSO*, *Google SSO* |
| Business owner / Technical owner | — | Names resolved from Setyl |
| **How to get it** | Label = the Sheet's Install Options value, plus plain-English instructions | "Request access" via #global-service-desk. Okta SSO apps add "appears in your Okta dashboard" |

**How to get it wording (driven by the Install Options column):**

| Install Options value contains… | Instruction shown |
|---|---|
| `self-service` | Install it yourself: open the **Iru Self-Service** app on your Mac (or **Company Portal** on Windows) and hit install. No ticket needed. |
| `service-desk` | Raise a ticket in the **#global-service-desk** Slack channel with a short business justification — IT Ops will install it for you. |
| `managed` | Comes pre-installed and managed by **IT Ops**. If it's missing from your device, raise a ticket in the #global-service-desk Slack channel. |
| anything else | Shows the value as-is plus a safe generic "raise a ticket in #global-service-desk" line. The page never breaks on a new value. |

Current Install Options taxonomy in the Sheets: **Managed by IT Ops** · **Global-service-desk ticket** · **Self-Service through Iru** (Mac) · **Self-Service through Company Portal** (Windows).

**Search behaviour:**
- Partial name match ("fire" → Firefox), ranked first.
- Use-case match through **78 built-in tag sets** (e.g. "pdf creator" → Adobe Acrobat, "video calls" → Zoom/Teams, "eye strain" → f.lux). Setyl owners and auth method are also searchable (e.g. "okta").
- **No match →** "*X* isn't in the approved catalog — **Not approved: raise a Procurement request via HappyFox** (InfoSec SLA 20 working days). Please don't install or sign up in the meantime — it counts as shadow IT." It also hints when the app exists on another tab ("1 match in Windows").

**Footer:** shows data freshness. Mac/Windows say "Live from the InfoSec-maintained catalog Sheets (updates appear within 5 minutes)". Sites & Apps says "Synced daily from the Setyl Sites & Apps register · last sync <date/time>".

## 5. Architecture — how it all works

```mermaid
flowchart LR
  subgraph Sources
    MAC[Google Sheet<br/>Macs tab]
    WIN[Google Sheet<br/>Windows tab]
    SETYL[(Setyl API<br/>app.setyl.com/api/v1)]
  end
  subgraph Apps Script project "ASC-Live"
    SYNC[syncSetyl&#40;&#41;<br/>daily ~06:00 trigger]
    CACHE_SHEET[Setyl cache Sheet<br/>+ Sync Log tab]
    GET[getCatalog&#40;key&#41;]
    CACHE[(Script cache<br/>5 min)]
    WEB[doGet&#40;&#41; serves page]
  end
  STAFF[Staff browser<br/>Google Sites embed / /exec]

  SETYL -- GET only --> SYNC --> CACHE_SHEET
  MAC --> GET
  WIN --> GET
  CACHE_SHEET --> GET
  GET <--> CACHE
  WEB --> STAFF
  STAFF -- google.script.run --> GET
```

**Request flow when a staff member opens the page:**
1. Browser requests the `/exec` URL. Google checks they are signed into a **PensionBee account**.
2. `doGet()` builds the page from the HTML files (`index` + includes) and returns it.
3. The page calls `google.script.run.getCatalog('mac' | 'win' | 'setyl')` three times, in parallel.
4. `getCatalog` returns from the **script cache** if the data is fresh (under 5 min). Otherwise it reads the Sheet, caches it for 5 minutes and returns rows.
5. The browser parses rows, adds search tags and renders cards. All searching happens in the browser, so it's instant.

**Why server-side:** the script runs as its owner, so it can read the Sheets without staff having Sheet access and without public links. This is what removed iteration 1's blocker.

## 6. Sync & refresh mechanics

| Data | Source of truth | How it reaches the page | Freshness | Manual override |
|---|---|---|---|---|
| Mac catalog | Sheet `1bkWySuW…` tab **Macs** | Read live by `getCatalog`, cached 5 min | **≤ 5 minutes** after a Sheet edit | Open `…/exec?refresh=1`, or run `refreshNow()` |
| Windows catalog | Sheet `1q10aqxv…` tab **Windows** | Same | **≤ 5 minutes** | Same |
| Sites & Apps | **Setyl** | `syncSetyl()` pulls the API into the cache Sheet daily; page reads the cache Sheet (also 5-min cache) | **Daily (~06:00 UK)** | Run `syncSetyl()` in the editor |

**Details:**
- **5-minute cache** (`CACHE_SECONDS = 300`): protects Google quotas and keeps page loads fast. `refreshNow()` clears it for all three catalogs, and `?refresh=1` does the same from the browser.
- **Daily Setyl sync:** a time-driven trigger created by `setup()` (`SYNC_HOUR = 6`). Steps:
  1. A lock prevents overlapping runs.
  2. GET every page of `/apps` (50 per page, cursor-based) and dedupe by app UUID.
  3. Keep only apps whose `state_name` is in the allowlist: `register`, `registered`, `onboarding`.
  4. Resolve owner references to names (one GET per unique person).
  5. Map to sheet rows, sort A–Z, and overwrite the `Setyl` tab.
  6. Record the sync timestamp, clear the cache and append to the **Sync Log**.
- **Fail-safe:** if Setyl errors, returns nothing, or the paging cursor stops advancing, the sync **keeps the last good data**, logs `FAILED` with the reason, and **emails the script owner**.
- **Rate-limit handling:** retries with backoff on HTTP 429/5xx (up to 4 attempts). Owner lookups are batched 10 at a time with a short pause.
- **Typical run:** about 20–25 seconds (889 apps across 18 pages + 63 owner lookups).

## 7. Setyl API integration

### 7.1 Access
- Enabled in Setyl → Company Settings → **API Service** (needs the Owner role in Setyl).
- Auth: `Authorization: Bearer <API key>` + `X-Setyl-Consumer-ID: <Consumer ID>`.
- Both values are stored only in **Apps Script → Project Settings → Script Properties**, never in code.

### 7.2 Endpoints used (all `GET`)
| Endpoint | Purpose |
|---|---|
| `GET /api/v1/apps?cursor=…` | List all apps. 50 per page, `{cursor, data}` envelope |
| `GET /api/v1/people/{uuid}` | Resolve owner references to first/last name (URL taken from the app record; only followed if it points back to `https://app.setyl.com/api/v1/`) |

### 7.3 Field mapping (confirmed against live data, 7 Oct 2026)
| Portal column | Setyl field | Notes |
|---|---|---|
| Application Name | `name` | |
| Status | `human_state_name` / `state_name` | Filter uses `state_name` |
| Auth Method | `auth_method` | e.g. Okta SSO, Google SSO, Okta SWA |
| Business Owner | `administrators[]` → `/people/{uuid}` → `first_name last_name` | |
| Technical Owner | `technical_owners_list[]` → same | Multiple names comma-separated |
| Description | `description` | **Not currently returned by Setyl's API** (UI only). Mapped, so it appears automatically if Setyl adds it |
| Install Options | fixed: `Global-service-desk ticket` | SaaS access requests go via #global-service-desk |
| *(not published)* | `notes`, `view_url`, `url`, cost, licences | `notes` is internal free text. URLs are Setyl-internal links |

**Approved-state rule (confirmed by IT Ops/InfoSec):** `Register` + `Onboarding` = **Approved**. `Discovered` (`detected`), `Ignored` and `Unapproved` are **never shown**. The sync **refuses to run if the allowlist is empty**, so an unvetted app can't appear as Approved by mistake.

### 7.4 Issues found during live testing and how each was resolved
| # | Finding | Resolution |
|---|---|---|
| 1 | `POST /apps` is Setyl's **create-app** endpoint (returned HTTP 422 "Brand must exist"). **No record was created.** | Integration made **read-only by design**: hard-coded `GET`, no request body, and a comment warning never to change it |
| 2 | Without a filter, 668 non-approved apps (incl. 7 Unapproved) would have shown as "✓ Approved" | Mandatory state allowlist. Sync blocks while it's empty |
| 3 | Owners come back as `{uuid, url}` references, not names | Resolve each unique person once via `/people/{uuid}`. 63 resolved, 0 failed |
| 4 | Description not available in list or detail API | Per-app detail calls removed (no value). Raised as a Setyl support request |
| 5 | People records contain heavy PII (personal email, phone, address, personal identifier) | Only first + last name kept. Nothing else stored, logged or published |
| 6 | Apps Script editor truncated long pastes (~5KB+), causing syntax errors and a blank page | Code split into 12 small files, each under 6KB (HTML files under 4KB) |

## 8. Google Sheets configuration

| Sheet | ID | Tab | Columns | Maintained by |
|---|---|---|---|---|
| Intranet - Macs - Approved Catalog | `1bkWySuWX_Hq47KcvlDksz4c3CTotbKAq6m8XQwjXn0Y` | `Macs` | Application Name · Install Options · Description | InfoSec (ticket-driven) |
| Intranet - Windows - Approved Catalog | `1q10aqxv0jhs6KgnhJ_-all3J4-DOhs2bEAD4ml3AAXk` | `Windows` | Same | InfoSec (ticket-driven) |
| ASC - Setyl Sites & Apps (auto-synced, do not edit) | created by `setup()`, ID in Script Property `SETYL_SHEET_ID` | `Setyl` | Application Name · Install Options · Description · Auth Method · Status · Business Owner · Technical Owner | **Automated** (overwritten daily) |
| (same file) | | `Sync Log` | Timestamp · Result · Apps written · Pages · Duration (s) · Detail | **Automated** (append-only audit trail) |

**Rules for editors:**
- Column order doesn't matter, but **header names must stay as they are**. The page finds columns by header name.
- Keep the keyword (`self-service` / `service-desk` / `managed`) in Install Options values so the right instruction shows.
- Leaving Description blank is fine: the page shows the AI-drafted text if one exists, else "pending InfoSec review". **A real description in the Sheet always wins.**
- **Don't edit the Setyl cache Sheet.** It's overwritten daily. Fix data in Setyl instead.
- "Publish to web" is **no longer required** for either catalog Sheet and should be turned off.

## 9. Apps Script project — files and purpose

**Project:** `ASC-Live` (standalone Apps Script). **12 files: 4 script + 8 HTML.**

Why so many small files: the Apps Script editor silently truncated large pastes (around 5KB and above), which caused `Unexpected end of input` errors and a blank page. Each file is now small enough to paste reliably. Apps Script shares one global scope across `.gs` files, and HTML files are stitched together server-side by `include()`, so the split has **no runtime cost**.

### 9.1 Script files (`.gs`) — server side

| File | Lines | Purpose |
|---|---|---|
| `Code.gs` | 127 | **Config + web app + setup.** Sheet IDs/tabs (`CATALOGS`), Setyl config (`SETYL`: endpoint, field mapping, approved-state allowlist), cache/sync settings. `doGet()` serves the page (and handles `?refresh=1`). `include()` stitches HTML files. `getCatalog()` is the data API for the page. `refreshNow()` clears the cache. `setup()` creates the cache Sheet + Sync Log, installs the daily trigger and runs the first sync. |
| `Setyl.gs` | 71 | **Sync jobs.** `syncSetyl()`: the daily job (lock, fetch, filter, resolve owners, write, log, alert). `testSetyl()`: **read-only diagnostic** that walks all pages and logs counts per state, auth methods, owner resolution and a sample mapped row, writing nothing. |
| `Helpers.gs` | 100 | **Setyl API access.** `getOpts_()` (GET-only request with auth headers from Script Properties), `setylRequest_()` (with retry/backoff), `fetchAllSetyl_()` (cursor paging, dedupe, loop guard), `isApproved_()`, `resolveOwners_()` (batched people lookups, Setyl-host-only), `extractList_()`, `catalogId_()`. |
| `Mapping.gs` | 57 | **Row mapping + ops.** `pick_()`/`label_()` (field and owner-name extraction), `nice_()` (formats values like `okta_sso` → `Okta SSO`), `toRow_()` (Setyl record → sheet row), `logSync_()` (Sync Log), `alertOwner_()` (failure email). |

### 9.2 HTML files — client side (the page)

| File | Lines | Purpose |
|---|---|---|
| `index` | 42 | Page skeleton: header, three tabs, search box, results area, footer, "Open in new tab" link. Pulls in the other 7 files via `<?!= include('…') ?>`. |
| `css` | 46 | All styling (PensionBee yellow, cards, badges, mobile-friendly grid). |
| `js_enrich1` / `2` / `3` | 34 / 32 / 32 | **Search knowledge base:** 78 entries of use-case tags (e.g. Zoom → "video calls meetings conferencing…") plus AI-drafted descriptions for apps missing one. Split in three only for paste size. |
| `js_app1` | 87 | Page state, CSV-row parser (finds columns **by header name**, so Mac/Windows/Setyl share one parser), loading via `google.script.run`, search/ranking logic. |
| `js_app2` | 54 | "How to get it" logic (keyword → instruction), result card rendering, the "Not approved — raise a Procurement request" panel. |
| `js_app3` | 59 | Main render loop, footer freshness text, tab/search event wiring, initial load. |

### 9.3 Script Properties

| Property | Set by | Purpose |
|---|---|---|
| `SETYL_API_KEY` | Rahim (manual) | Setyl API key. **Secret** |
| `SETYL_CONSUMER_ID` | Rahim (manual) | Setyl consumer ID |
| `SETYL_SHEET_ID` | `setup()` | ID of the auto-created Setyl cache Sheet |
| `SETYL_LAST_SYNC` | `syncSetyl()` | ISO timestamp of the last successful sync (shown in the page footer) |

### 9.4 Deployment
- **Deploy → Web app**: Execute as **Me** (script owner) · Who has access: **Anyone within PensionBee**.
- Current deployment ID: `AKfycbyK6xLZRZw4xaTDZU_dHdC_0ZEyeUK5r4hgHerXN24vcN3K8tiwrM9cA9h16hR9Geh1`.
- **Updating code:** Deploy → Manage deployments → ✏️ → Version: **New version**. This keeps the same URL, so the Sites embed never changes. (Don't use "New deployment", which creates a new URL.)
- **Google Sites:** Insert → Embed → **By URL** → `/exec` URL.
- **Trigger:** one time-driven `syncSetyl` trigger, daily ~06:00 (Triggers ⏰ panel).

## 10. Security, privacy & compliance controls

| Control | Implementation |
|---|---|
| **Access** | Web app restricted to PensionBee Google accounts. Catalog Sheets no longer need public/domain publish links |
| **Least privilege toward Setyl** | Code enforces GET-only, so the integration cannot create or change Setyl records |
| **Secrets** | API key in Script Properties only. Never in code, logs or chat. Error logs truncate response bodies and never include headers |
| **Outbound calls** | Only `app.setyl.com/api/v1`. Owner lookups only follow links on that host |
| **Data minimisation (PII)** | From Setyl people records only first + last name are kept. Setyl `notes` and internal URLs are not published |
| **Correctness / no false approvals** | Mandatory approved-state allowlist. Sync blocks while empty. Zero-result syncs never overwrite good data |
| **Audit trail** | `Sync Log` tab: every run with timestamp, result, count, pages, duration, detail. Apps Script Executions log. Git history of every code change |
| **Monitoring** | Failure email to the script owner. Footer shows last sync time to staff |
| **Transparency** | AI-drafted descriptions are visibly tagged "AI-drafted — needs InfoSec confirmation" until InfoSec replaces them |
| **Change control** | Code in GitHub (`RMushfiq/ASC`). Versioned Apps Script deployments allow rollback to a previous version |

**Residual risks:** see §12.

## 11. Operations runbook (KB)

| Task | How |
|---|---|
| Update a Mac/Windows app | Edit the Sheet. Live within 5 min. Need it now? Open `…/exec?refresh=1` |
| Add a new Install Options value | Include `self-service`, `service-desk` or `managed` in the text for the right instruction. Anything else shows a generic instruction |
| Force a Setyl refresh | Apps Script editor → select `syncSetyl` → Run. Check `Sync Log` for `OK` |
| Approve a SaaS app on the portal | Move it to **Register** or **Onboarding** in Setyl. It appears after the next sync |
| Remove a SaaS app from the portal | Move it out of Register/Onboarding in Setyl. It disappears after the next sync |
| Check sync health | Open the cache Sheet → `Sync Log` (latest row = `OK`), or the page footer "last sync" time |
| Sync failed (email received) | Read `Detail` in Sync Log. 401/403 = key/Consumer ID changed or revoked. 429/5xx = Setyl issue, so it retries next day. "0 usable apps" = check the allowlist / Setyl states. Last good data stays live meanwhile |
| Rotate the Setyl API key | Generate a new key in Setyl → update `SETYL_API_KEY` in Script Properties → run `syncSetyl` → revoke the old key in Setyl |
| Diagnose Setyl data | Run `testSetyl` (read-only). The log shows counts per state, auth methods, owners and a sample row |
| Change which states count as Approved | Edit `SETYL.includeStatuses` in `Code.gs` → save → New version deploy → run `syncSetyl` |
| Deploy a code change | Paste the updated file(s) → save → Manage deployments → ✏️ → New version |
| Page blank / tabs not clickable | A file was truncated on paste. Press F12 → Console to see which file. Re-paste from GitHub **Raw** |
| Staff see a sign-in prompt in the embed | Third-party cookies blocked / Incognito. Use the "Open in new tab" link |
| Rollback | Manage deployments → ✏️ → select a previous version. Or disable the `syncSetyl` trigger to freeze Setyl data |

## 12. Known gaps, risks & open actions

| # | Item | Impact | Action / owner |
|---|---|---|---|
| 1 | **Setyl API does not expose app Description** (UI only) | Most Sites & Apps cards show "Description pending InfoSec review" | Setyl support request raised/to raise to add `description` to the Apps API. No code change needed once added — Rahim |
| 2 | **Single owner dependency.** Script runs as Rahim | If the account is suspended or on leave, the page and sync stop | Add Michal as co-owner/editor of the script + cache Sheet. Consider moving to a shared/service account — Rahim |
| 3 | **Setyl API key can write** (Setyl keys aren't scopable to read-only) | Anyone with Editor on the script could read the key | Editors limited to Rahim + Michal. Key usage recorded in this CR — Rahim |
| 4 | **Owners who have left** still show if not updated in Setyl | Staff contact the wrong person | Option: filter or flag leavers using `state_name`/`leave_date` on people records. Keep Setyl owners current — IT Ops |
| 5 | **631 apps in "Discovered"** (vs 300–400 estimated) | Searches for them return "Not approved", so expect a rise in Procurement requests | Triage the Discovered backlog in Setyl. Use the request volume as evidence for prioritisation — IT Ops/InfoSec |
| 6 | **Person-named app entries** (e.g. "SignNow (Optionholder)", "Sign Now(Danielle)") | Untidy/duplicate entries shown to staff | Merge/rename in Setyl — IT Ops |
| 7 | **Auth method missing for most apps** (only 49 Okta SSO of 889) | "Appears in your Okta dashboard" guidance shows only for those 49 | Populate Auth Method in Setyl — IT Ops |
| 8 | **AI-drafted descriptions** awaiting InfoSec review | Visible but flagged | InfoSec to confirm or replace in the Sheets |
| 9 | **Procurement route** still references HappyFox | Confirm it's still correct | Confirm with InfoSec. One-line change if it moves to Slack |
| 10 | **Housekeeping** | — | Archive the unused Library deployment and the earlier web-app deployment. Turn off "Publish to web" on both Sheets. Embed `/exec` in Sites. Confirm go-live with a non-editor test |

## 13. Change request summary

| Field | Detail |
|---|---|
| **Title** | ASC Portal v1 — automated Approved Software Catalog on the intranet (Apps Script + Setyl API) |
| **Type** | Standard change — new internal tool, no changes to existing systems' configuration |
| **Description** | Replace the static ASC Sites pages with an Apps Script web app that reads the Mac/Windows catalog Sheets live (≤ 5 min) and syncs the Setyl Sites & Apps register daily via read-only API, showing Register + Onboarding apps as Approved with owners and auth method |
| **Systems touched** | Google Apps Script (new project `ASC-Live`), Google Sheets (read: 2 catalogs. Write: 1 new auto-created cache Sheet), Google Sites (embed), Setyl (new API key, read-only use) |
| **Risk** | Low. Read-only toward Setyl and the catalog Sheets. Restricted to PensionBee accounts. Fail-safe keeps last good data |
| **Testing evidence** | Headless-browser tests of every UI state (live, empty, error, not-approved, cross-tab hint, unknown install option). Mock tests of paging, dedupe, allowlist, owner resolution and the fail-safe. **Live** `testSetyl` runs (7 Oct 2026, 12:23–12:39): 889 apps / 18 pages read, 221 approved, 63/63 owners resolved, sample mapping verified (Asana → Okta SSO, Register, correct owners) |
| **Rollback** | Repoint the Sites embed to the previous pages. Disable the `syncSetyl` trigger. Revoke the Setyl API key. Archive the web-app deployment |
| **Data protection** | Only names of app owners are published (staff-visible). No other personal data stored |
| **Approver** | Pav (SVP InfoSec & IT Ops) |
| **Implementer** | Rahim Mushfiq |

## 14. Performance review summary

**Situation:** The ASC lived in static spreadsheets with intranet pages out of sync since Sept 2025. 39% of entries (32/83) had no description, and the company's 221 approved SaaS apps weren't visible to staff at all. That pushed staff toward service-desk questions or shadow IT.

**Task:** Turn the ASC into a self-service, searchable tool, per Pav's brief, with zero ongoing manual effort, and fold in the Setyl register.

**Action:**
- Designed and built the portal end-to-end. When the first approach (browser fetch of published CSVs) was blocked by the domain restriction, re-architected to a server-side Apps Script web app instead of weakening the restriction.
- Integrated the **Setyl API** directly, bringing forward a phase-2 item that was planned as a manual 6-monthly export.
- Found and closed two risks during live testing: a **write-capable endpoint** (made the integration read-only) and **668 non-approved apps** that would have shown as Approved (mandatory allowlist).
- Applied data minimisation to Setyl PII and built in audit logging, failure alerting and a fail-safe.
- Produced AI-drafted descriptions for all 32 gaps, flagged for InfoSec sign-off, plus data-quality findings for the Setyl register.

**Result (measurable):**
| Metric | Before | After |
|---|---|---|
| Apps searchable by staff | 83 (static, out of date) | **304** (40 Mac + 43 Windows + 221 SaaS), live |
| Time for a catalog edit to reach the intranet | Manual. Months out of sync | **≤ 5 minutes**, automatic |
| SaaS register on the intranet | None | **221 apps, refreshed daily**, with owners + auth method |
| Manual steps to refresh | Copy Sheets → Sites, plus a planned 6-monthly Setyl export | **Zero** |
| Entries without a description | 32 / 83 | 0 blank on Mac/Windows (32 AI-drafted, flagged for review) |
| "Is this approved?" answer | Ask the service desk | Instant self-service, with a "Not approved → Procurement" path |
| Cost / new infrastructure | — | **£0**, Google Workspace + existing Setyl licence |

*To add from real usage after 30 days: page views, Procurement requests attributed to the portal, reduction in "is X approved?" service-desk tickets.*

**Senior-level behaviours shown:** system ownership end-to-end, root-cause over workaround (re-architecture vs manual snapshot), security-by-default (read-only, allowlist, PII minimisation), audit-ready evidence (Sync Log, Git history, CR), cross-team enablement (InfoSec maintains the data, IT Ops owns the platform), continuity planning (backup owner).

## 15. Appendix — key data points & timeline

**Setyl register snapshot (live run, 7 Oct 2026):**
| State | Count | On portal? |
|---|---|---|
| Register | 160 | ✅ Approved |
| Onboarding | 61 | ✅ Approved (Onboarding tag) |
| Discovered (`detected`) | 631 | ❌ Hidden |
| Ignored | 30 | ❌ Hidden |
| Unapproved | 7 | ❌ Hidden |
| **Total** | **889** | **221 published** |

Auth methods across all 889 apps: Okta SSO 49 · Multi-Factor Authentication (other) 22 · Email/Username and Password 6 · Google SSO 5 · Okta SWA 4 · Not Applicable 1 · not set 802.

**Timeline:**
| Date | Milestone |
|---|---|
| Sept 2025 | Intranet ASC pages fall out of sync with the Sheets |
| Jul 2026 | Iteration 1: single-file HTML embed. Published-CSV fetch blocked by the domain restriction. Snapshot fallback + 32 AI-drafted descriptions |
| 7 Oct 2026 | Iteration 2 designed: Apps Script web app + Setyl API |
| 7 Oct 2026 12:18 | First live Setyl call. Write endpoint identified (422, nothing created). Made GET-only |
| 7 Oct 2026 12:23–12:39 | Field mapping, approved-state allowlist and owner resolution confirmed against live data |
| 7 Oct 2026 12:40 | First web-app deployment |
| 7 Oct 2026 | Install Options simplified (Iru / Company Portal / #global-service-desk / Managed by IT Ops). Manual refresh added. v1 working |

**Git commits (branch `claude/beautiful-thompson-4f0va5`):**
`7476a98` Apps Script deployment + Setyl sync · `5f53a8e` split files · `9e21299` **read-only Setyl (GET)** · `f7b72a5` confirmed mapping + mandatory allowlist · `230969c` owners/auth + Register/Onboarding · `020fb82` owner-name resolution · `dace257`/`3f3bae5` paste-size splits · `15d4018` simplified install options, chips removed, manual refresh.
