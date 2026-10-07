/**
 * ASC — row mapping, sync log and alerts. Shares global scope with the other .gs files.
 */

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
  if (!o || typeof o !== 'object') return String(o || '');
  return String(OWNER_NAMES_[o.uuid] || o.full_name || o.name || o.email || '');   // unresolved uuid → blank
}

/** 'okta_sso' → 'Okta SSO' */
function nice_(v) {
  return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); })
    .replace(/\b(Sso|Saml|Mfa|Oidc|Scim|Api)\b/g, function (w) { return w.toUpperCase(); });
}

function toRow_(rec) {
  var f = SETYL.fields, auth = pick_(rec, f.auth);
  return [
    pick_(rec, f.name),
    'Global-service-desk ticket',           // SaaS access requests go via #global-service-desk
    pick_(rec, f.description),
    /[_a-z]/.test(auth) && auth === auth.toLowerCase() ? nice_(auth) : auth,
    pick_(rec, f.status),
    pick_(rec, f.bizOwner),
    pick_(rec, f.techOwner)
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
