/**
 * ASC — Setyl sync + helpers. Shares global scope with Code.gs (CONFIG lives there).
 */


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
