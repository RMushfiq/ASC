/**
 * ASC — shared helpers (Setyl API read, mapping, logging). Shares global scope with Code.gs + Setyl.gs.
 */

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
  if (cursor) url += '?cursor=' + encodeURIComponent(cursor);
  // Read-only by design: GET only, no payload. Never change to POST — that creates records in Setyl.
  var opts = {
    method: 'get',
    muteHttpExceptions: true,
    headers: { 'Authorization': 'Bearer ' + apiKey, 'X-Setyl-Consumer-ID': consumer, 'Accept': 'application/json' }
  };

  for (var attempt = 1; attempt <= 4; attempt++) {
    var res = UrlFetchApp.fetch(url, opts);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return JSON.parse(res.getContentText() || '{}');
    if ((code === 429 || code >= 500) && attempt < 4) { Utilities.sleep(Math.pow(2, attempt) * 1000); continue; }
    // Never log headers — they contain the API key.
    throw new Error('Setyl HTTP ' + code + ' on ' + SETYL.appsPath + ': ' + res.getContentText().slice(0, 300));
  }
}

/** Fetches every page (GET). Dedupes by uuid; stops if the cursor stops yielding new records. */
function fetchAllSetyl_() {
  var seen = {}, records = [], cursor = null, pages = 0;
  do {
    var body = setylRequest_(cursor), added = 0;
    extractList_(body).forEach(function (r) {
      var k = r.uuid || r.name;
      if (!seen[k]) { seen[k] = 1; records.push(r); added++; }
    });
    pages++;
    cursor = body && body.cursor || null;
    if (cursor && !added) throw new Error('Setyl page ' + pages + ' returned no new apps — cursor not advancing.');
  } while (cursor && pages < SETYL.maxPages);
  if (cursor) throw new Error('Hit maxPages (' + SETYL.maxPages + ') with more data pending — raise SETYL.maxPages.');
  return { records: records, pages: pages };
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
    if (Array.isArray(v)) v = v.map(label_).filter(Boolean).join(', ');
    else if (v && typeof v === 'object') v = label_(v);
    if (v === null || v === undefined || String(v).trim() === '') continue;
    return String(v).trim();
  }
  return '';
}

function label_(o) {
  return o && typeof o === 'object' ? String(o.full_name || o.name || o.email || '') : String(o || '');
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
