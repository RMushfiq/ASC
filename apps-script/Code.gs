/**
 * PensionBee · Approved Software Catalog (ASC)
 * Apps Script web app — serves index.html and reads catalog data server-side.
 *
 * Data sources
 *   mac   → Google Sheet "Intranet - Macs - Approved Catalog", tab "Macs"
 *   win   → Google Sheet "Intranet - Windows - Approved Catalog", tab "Windows"
 *   setyl → Setyl API (Sites & Apps register), synced daily into a Sheet by syncSetyl()
 *
 * Files: Code.gs (config + web app + setup) · Setyl.gs (sync + helpers) · index.html
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
