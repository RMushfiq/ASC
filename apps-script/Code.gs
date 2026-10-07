/**
 * PensionBee · Approved Software Catalog (ASC)
 * Apps Script web app — serves index.html and reads catalog data server-side.
 *
 * Data sources
 *   mac   → Google Sheet "Intranet - Macs - Approved Catalog", tab "Macs"
 *   win   → Google Sheet "Intranet - Windows - Approved Catalog", tab "Windows"
 *   setyl → Setyl API (Sites & Apps register), synced daily into a Sheet by syncSetyl()
 *
 * One-time setup (see apps-script/README.md for full steps)
 *   1. Project Settings → Script Properties:
 *        SETYL_API_KEY      = <API key from Setyl → Company Settings → API Service>
 *        SETYL_CONSUMER_ID  = <Consumer ID from the same page>
 *   2. Run testSetyl()  → check the log, confirm SETYL.appsPath + field names.
 *   3. Run setup()      → creates the Setyl cache Sheet + daily sync trigger, runs first sync.
 *   4. Deploy → Web app → Execute as: Me · Access: Anyone within pensionbee.com
 *
 * Never put the API key in this file — Script Properties only.
 */

/* ===================== CONFIG ===================== */

var CATALOGS = {
  mac:   { id: '1bkWySuWX_Hq47KcvlDksz4c3CTotbKAq6m8XQwjXn0Y', tab: 'Macs' },
  win:   { id: '1q10aqxv0jhs6KgnhJ_-all3J4-DOhs2bEAD4ml3AAXk', tab: 'Windows' },
  setyl: { id: null, tab: 'Setyl' } // id is created by setup() and stored in Script Properties
};

var SETYL = {
  base: 'https://app.setyl.com/api/v1',
  // CONFIRM against developers.setyl.com (Endpoints → Apps/Software). Run testSetyl() to verify.
  appsPath: '/apps',
  // Setyl's documented list calls take the cursor in a JSON body (POST). Switch to 'get' if the apps endpoint differs.
  method: 'post',
  maxPages: 100,          // hard stop: guards against a cursor loop
  // Candidate field names per column — first non-empty match wins. Adjust after testSetyl().
  fields: {
    name:        ['name', 'title', 'app_name', 'application_name'],
    description: ['description', 'summary', 'notes'],
    category:    ['category', 'type', 'app_type'],
    status:      ['status', 'state', 'approval_status'],
    owner:       ['owner', 'business_owner', 'app_owner'],
    url:         ['url', 'website', 'domain', 'login_url']
  },
  // Only these statuses appear on the intranet (lower-case). Empty array = include everything.
  includeStatuses: []
};

var CACHE_SECONDS = 300;           // sheet edits visible within 5 minutes
var SYNC_HOUR = 6;                 // daily Setyl sync, ~06:00 script timezone
var LOG_TAB = 'Sync Log';          // audit trail of every sync, in the Setyl cache Sheet
var HEADER = ['Application Name', 'Install Options', 'Description', 'Category', 'Status', 'Owner', 'Website'];

/* ===================== WEB APP ===================== */

function doGet() {
  var t = HtmlService.createTemplateFromFile('index');
  t.appUrl = ScriptApp.getService().getUrl();
  return t.evaluate()
    .setTitle('Approved Software Catalog')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Called from the page via google.script.run.getCatalog('mac'|'win'|'setyl').
 * Returns { rows: string[][] (header first), updated: ISO string|null }.
 */
function getCatalog(key) {
  if (!CATALOGS.hasOwnProperty(key)) throw new Error('Unknown catalog: ' + key);

  var cache = CacheService.getScriptCache();
  var hit = cache.get('cat_' + key);
  if (hit) return JSON.parse(hit);

  var id = catalogId_(key);
  if (!id) return { rows: [], updated: null, pending: true }; // Setyl not set up yet

  var sh = SpreadsheetApp.openById(id).getSheetByName(CATALOGS[key].tab);
  if (!sh) throw new Error('Tab "' + CATALOGS[key].tab + '" not found for ' + key);

  var rows = sh.getDataRange().getDisplayValues().filter(function (r) {
    return String(r[0]).trim() !== '';
  });
  var out = {
    rows: rows,
    updated: key === 'setyl' ? PropertiesService.getScriptProperties().getProperty('SETYL_LAST_SYNC') : null
  };

  try { cache.put('cat_' + key, JSON.stringify(out), CACHE_SECONDS); } catch (e) { /* >100KB: skip cache */ }
  return out;
}

/* ===================== SETYL SYNC ===================== */

/** One-time: create the Setyl cache Sheet, install the daily trigger, run the first sync. Safe to re-run. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SETYL_SHEET_ID')) {
    var ss = SpreadsheetApp.create('ASC - Setyl Sites & Apps (auto-synced, do not edit)');
    ss.getSheets()[0].setName(CATALOGS.setyl.tab);
    ss.insertSheet(LOG_TAB).appendRow(['Timestamp', 'Result', 'Apps written', 'Pages', 'Duration (s)', 'Detail']);
    props.setProperty('SETYL_SHEET_ID', ss.getId());
    Logger.log('Created Setyl cache Sheet: ' + ss.getUrl());
  }

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSetyl') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncSetyl').timeBased().everyDays(1).atHour(SYNC_HOUR).create();
  Logger.log('Daily syncSetyl trigger installed (~' + SYNC_HOUR + ':00).');

  syncSetyl();
}

/** Pulls all apps from Setyl and overwrites the Setyl tab. Runs daily via trigger; can be run manually. */
function syncSetyl() {
  var started = Date.now(), pages = 0;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Sync already running — skipped.'); return; }

  try {
    var id = catalogId_('setyl');
    if (!id) throw new Error('Run setup() first — no Setyl Sheet configured.');

    var records = [], cursor = null;
    do {
      var body = setylRequest_(cursor);
      records = records.concat(extractList_(body));
      cursor = body && (body.cursor || (body.meta && body.meta.cursor) || null);
      pages++;
    } while (cursor && pages < SETYL.maxPages);
    if (cursor) throw new Error('Hit maxPages (' + SETYL.maxPages + ') with more data pending — raise SETYL.maxPages.');

    var rows = records.map(toRow_).filter(function (r) {
      if (!r[0]) return false;
      return !SETYL.includeStatuses.length || SETYL.includeStatuses.indexOf(r[4].toLowerCase()) > -1;
    });
    rows.sort(function (a, b) { return a[0].localeCompare(b[0]); });

    // Safety net: never blank the live catalog because of an empty/odd API response.
    if (!rows.length) throw new Error('Setyl returned 0 usable apps (' + records.length + ' raw records) — existing data kept.');

    var sh = SpreadsheetApp.openById(id).getSheetByName(CATALOGS.setyl.tab);
    sh.clearContents();
    sh.getRange(1, 1, rows.length + 1, HEADER.length).setValues([HEADER].concat(rows));
    sh.setFrozenRows(1);

    var now = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('SETYL_LAST_SYNC', now);
    CacheService.getScriptCache().remove('cat_setyl');
    logSync_('OK', rows.length, pages, started, '');
  } catch (err) {
    logSync_('FAILED', 0, pages, started, String(err && err.message || err));
    alertOwner_(err);
    throw err; // surfaces in Executions log + trigger failure email
  } finally {
    lock.releaseLock();
  }
}

/** Diagnostic: logs the first page of the Setyl response so you can confirm endpoint + field names. */
function testSetyl() {
  var body = setylRequest_(null);
  var list = extractList_(body);
  Logger.log('Top-level keys: ' + Object.keys(body || {}).join(', '));
  Logger.log('Records on page 1: ' + list.length + ' · cursor present: ' + !!(body && body.cursor));
  if (list[0]) {
    Logger.log('First record keys: ' + Object.keys(list[0]).join(', '));
    Logger.log('First record: ' + JSON.stringify(list[0]).slice(0, 1500));
    Logger.log('Mapped row: ' + JSON.stringify(toRow_(list[0])));
  }
}

/* ===================== HELPERS ===================== */

function catalogId_(key) {
  return key === 'setyl'
    ? PropertiesService.getScriptProperties().getProperty('SETYL_SHEET_ID')
    : CATALOGS[key].id;
}

function setylRequest_(cursor) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('SETYL_API_KEY');
  var consumer = props.getProperty('SETYL_CONSUMER_ID');
  if (!apiKey || !consumer) throw new Error('Missing Script Properties SETYL_API_KEY / SETYL_CONSUMER_ID.');

  var url = SETYL.base + SETYL.appsPath;
  var opts = {
    method: SETYL.method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'X-Setyl-Consumer-ID': consumer }
  };
  if (SETYL.method === 'post') opts.payload = JSON.stringify(cursor ? { cursor: cursor } : {});
  else if (cursor) url += '?cursor=' + encodeURIComponent(cursor);

  for (var attempt = 1; attempt <= 4; attempt++) {
    var res = UrlFetchApp.fetch(url, opts);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return JSON.parse(res.getContentText() || '{}');
    if ((code === 429 || code >= 500) && attempt < 4) { Utilities.sleep(Math.pow(2, attempt) * 1000); continue; }
    // Never log headers — they contain the API key.
    throw new Error('Setyl HTTP ' + code + ' on ' + SETYL.appsPath + ': ' + res.getContentText().slice(0, 300));
  }
}

/** Accepts a bare array or common envelope shapes ({data:[]}, {items:[]}, {results:[]}, {apps:[]}). */
function extractList_(body) {
  if (Array.isArray(body)) return body;
  if (!body) return [];
  var keys = ['data', 'items', 'results', 'apps', 'records'];
  for (var i = 0; i < keys.length; i++) if (Array.isArray(body[keys[i]])) return body[keys[i]];
  return [];
}

function pick_(rec, names) {
  for (var i = 0; i < names.length; i++) {
    var v = rec[names[i]];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'object') v = v.name || v.full_name || v.email || v.title || JSON.stringify(v);
    return String(v).trim();
  }
  return '';
}

function toRow_(rec) {
  var f = SETYL.fields;
  return [
    pick_(rec, f.name),
    'Raise a service-desk ticket',          // How-to-get for SaaS: access requests go via HappyFox
    pick_(rec, f.description),
    pick_(rec, f.category),
    pick_(rec, f.status),
    pick_(rec, f.owner),
    pick_(rec, f.url)
  ];
}

function logSync_(result, count, pages, started, detail) {
  try {
    var id = catalogId_('setyl');
    if (!id) return;
    var ss = SpreadsheetApp.openById(id);
    var sh = ss.getSheetByName(LOG_TAB) || ss.insertSheet(LOG_TAB);
    sh.appendRow([new Date(), result, count, pages, Math.round((Date.now() - started) / 1000), detail]);
  } catch (e) { Logger.log('Could not write sync log: ' + e); }
}

function alertOwner_(err) {
  try {
    var to = Session.getEffectiveUser().getEmail();
    if (to) MailApp.sendEmail(to, '[ASC] Setyl sync failed',
      'The daily Setyl → ASC sync failed. The intranet is still showing the last good data.\n\n' +
      'Error: ' + (err && err.message || err) + '\n\nCheck the "' + LOG_TAB + '" tab and the Apps Script Executions log.');
  } catch (e) { Logger.log('Could not send alert: ' + e); }
}
