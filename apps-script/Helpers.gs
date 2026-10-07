/**
 * ASC — shared helpers (Setyl API read, mapping, logging). Shares global scope with Code.gs + Setyl.gs.
 */

/* ===================== HELPERS ===================== */

function catalogId_(key) {
  return key === 'setyl'
    ? PropertiesService.getScriptProperties().getProperty('SETYL_SHEET_ID')
    : CATALOGS[key].id;
}

/** Read-only by design: GET only, no payload. Never change to POST — that creates records in Setyl. */
function getOpts_() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('SETYL_API_KEY');
  var consumer = props.getProperty('SETYL_CONSUMER_ID');
  if (!apiKey || !consumer) throw new Error('Missing Script Properties SETYL_API_KEY / SETYL_CONSUMER_ID.');
  return {
    method: 'get',
    muteHttpExceptions: true,
    headers: { 'Authorization': 'Bearer ' + apiKey, 'X-Setyl-Consumer-ID': consumer, 'Accept': 'application/json' }
  };
}

function setylRequest_(cursor) {
  var url = SETYL.base + SETYL.appsPath;
  if (cursor) url += '?cursor=' + encodeURIComponent(cursor);
  var opts = getOpts_();

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

function isApproved_(r) {
  return SETYL.includeStatuses.indexOf(String(r.state_name || '').toLowerCase()) > -1;
}

var OWNER_NAMES_ = {};   // uuid → display name, filled by resolveOwners_()

/** Resolves owner refs ({uuid, url}) to names: one read-only GET per unique person, 10 at a time. */
function resolveOwners_(records) {
  var opts = getOpts_(), refs = {}, failed = 0, resolved = 0, sampleKeys = '';
  records.forEach(function (r) {
    [].concat(r.administrators || [], r.technical_owners_list || []).forEach(function (o) {
      // Only follow links back into the Setyl API — never an arbitrary host.
      if (o && o.uuid && o.url && o.url.indexOf(SETYL.base + '/') === 0 && !OWNER_NAMES_[o.uuid]) refs[o.uuid] = o.url;
    });
  });
  var ids = Object.keys(refs);
  for (var i = 0; i < ids.length; i += 10) {
    var batch = ids.slice(i, i + 10);
    UrlFetchApp.fetchAll(batch.map(function (id) { return Object.assign({ url: refs[id] }, opts); }))
      .forEach(function (res, j) {
        try {
          if (res.getResponseCode() !== 200) throw 0;
          var b = JSON.parse(res.getContentText() || '{}'), p = b.data && !Array.isArray(b.data) ? b.data : b;
          if (!sampleKeys) sampleKeys = Object.keys(p).join(', ');
          var n = p.full_name || p.display_name || p.name ||
                  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '';
          if (!n) throw 0;
          OWNER_NAMES_[batch[j]] = n; resolved++;
        } catch (e) { failed++; }
      });
    if (i + 10 < ids.length) Utilities.sleep(300);
  }
  return { resolved: resolved, failed: failed, sampleKeys: sampleKeys };
}

/** Accepts a bare array or common envelope shapes ({data:[]}, {items:[]}, {results:[]}, {apps:[]}). */
function extractList_(body) {
  if (Array.isArray(body)) return body;
  if (!body) return [];
  var keys = ['data', 'items', 'results', 'apps', 'records'];
  for (var i = 0; i < keys.length; i++) if (Array.isArray(body[keys[i]])) return body[keys[i]];
  return [];
}
