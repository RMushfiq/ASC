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

    // Never publish unvetted states (unapproved / ignored / detected) as "Approved".
    if (!SETYL.includeStatuses.length) throw new Error('SETYL.includeStatuses is empty — set the approved Setyl states in Code.gs first.');

    var all = fetchAllSetyl_(), records = all.records;
    pages = all.pages;

    var rows = records.map(toRow_).filter(function (r) {
      return r[0] && SETYL.includeStatuses.indexOf(r[4].toLowerCase()) > -1;
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

/** Read-only diagnostic: walks every page and summarises states. Writes nothing anywhere. */
function testSetyl() {
  var all = fetchAllSetyl_(), states = {}, auth = {};
  all.records.forEach(function (r) {
    var st = String(r.state_name || '(none)') + ' / ' + String(r.human_state_name || '');
    (states[st] = states[st] || []).push(r.name);
    var am = String(r.auth_method || '(none)');
    auth[am] = (auth[am] || 0) + 1;
  });
  Logger.log('Total apps: ' + all.records.length + ' across ' + all.pages + ' page(s)');
  Object.keys(states).sort().forEach(function (k) {
    Logger.log('State ' + k + ': ' + states[k].length + ' — e.g. ' + states[k].slice(0, 8).join(', '));
  });
  Logger.log('Auth methods: ' + JSON.stringify(auth));
  var withAdmin = all.records.filter(function (r) { return r.administrators && r.administrators.length; })[0];
  if (withAdmin) Logger.log('Administrators sample: ' + JSON.stringify(withAdmin.administrators).slice(0, 300));
  Logger.log('Allowlist now: ' + JSON.stringify(SETYL.includeStatuses));
}

