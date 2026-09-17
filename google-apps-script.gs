/**
 * SENSORA 2K26 — Google Apps Script Backend (v2.0)
 * ==========================================
 * Sheet ID : 1BCiew-kXPJAOn8ZMY3oCcMlkxWiC_gJBMLfzZr3YCpg
 * Web App  : https://script.google.com/macros/s/AKfycbznsdmc0JjvnZo9W02GWF3PEv6zUBSZKVLkZmLWomW7-D42jHAHUV1DvRiiGLHGVj_J/exec
 *
 * GET  ?action=getClaimed         → { claimed: [{name, normalizedName, year, status}] }
 * GET  ?action=getSensorStats     → { total, allocated, available, custom, byYear }
 * GET  ?action=getCustomRequests  → { requests: [...] }
 * GET  ?action=getAll             → { individual, team } (admin)
 * POST body = JSON { type: 'individual' }  → { success, conflict, alreadyRegistered, registrationId }
 * POST body = JSON { type: 'customSensor' } → { success, available, message }
 * POST body = JSON { type: 'adminAction' } → { success } (approve/reject custom sensor)
 * POST body = JSON { type: 'team' }        → { success, entryCode }
 *
 * Deploy settings:
 *   Execute as : Me
 *   Who has access : Anyone
 *
 * IMPORTANT: After editing this file, go to Deploy → Manage Deployments
 *            → Edit → Version: New version → Deploy.
 *            The same Web App URL remains valid.
 */

/* ── Constants ─────────────────────────────────────────── */
var SPREADSHEET_ID       = '1BCiew-kXPJAOn8ZMY3oCcMlkxWiC_gJBMLfzZr3YCpg';
var SHEET_INDIVIDUAL     = 'Individual Registrations';
var SHEET_TEAM           = 'Team Submissions';
var SHEET_CUSTOM         = 'Custom Sensor Requests';
var TOTAL_SENSORS        = 113;
var ADMIN_PASS           = 'SENSORA@2K26'; // Must match app.js CONFIG.ADMIN_PASS

/* ── Column Indices (1-based) for Individual sheet ─────── */
// Col:  1=Timestamp  2=Name  3=Register No  4=Phone  5=Email  6=Sensor
//       7=Year  8=Department  9=RegistrationID  10=Status
var COL_IND_TIMESTAMP    = 1;
var COL_IND_NAME         = 2;
var COL_IND_REGNO        = 3;
var COL_IND_PHONE        = 4;
var COL_IND_EMAIL        = 5;
var COL_IND_SENSOR       = 6;
var COL_IND_YEAR         = 7;
var COL_IND_DEPT         = 8;
var COL_IND_REGID        = 9;
var COL_IND_STATUS       = 10;

/* ── Column Indices (1-based) for Custom Sensor Requests ─ */
// Col:  1=Timestamp  2=Name  3=RegNo  4=RequestedSensor  5=NormalizedName
//       6=Year  7=RegistrationID  8=Status  9=AdminNote
var COL_CSR_TIMESTAMP    = 1;
var COL_CSR_NAME         = 2;
var COL_CSR_REGNO        = 3;
var COL_CSR_REQUESTED    = 4;
var COL_CSR_NORMALIZED   = 5;
var COL_CSR_YEAR         = 6;
var COL_CSR_REGID        = 7;
var COL_CSR_STATUS       = 8;
var COL_CSR_ADMIN_NOTE   = 9;

/* ── GET Handler ────────────────────────────────────────── */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

    if (action === 'getClaimed')        return jsonOut(getClaimedSensors());
    if (action === 'getSensorStats')    return jsonOut(getSensorStats());
    if (action === 'getCustomRequests') return jsonOut(getCustomRequests());
    if (action === 'getAll')            return jsonOut(getAllData());

    // Health check / root
    return jsonOut({ status: 'SENSORA 2K26 backend v2.0 running' });

  } catch (err) {
    return jsonOut({ error: 'GET error: ' + err.message });
  }
}

/* ── POST Handler ───────────────────────────────────────── */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ success: false, error: 'Empty request body.' });
    }

    var body = JSON.parse(e.postData.contents);
    var type = body.type || '';

    if (type === 'individual')   return handleIndividual(body);
    if (type === 'team')         return handleTeam(body);
    if (type === 'customSensor') return handleCustomSensor(body);
    if (type === 'adminAction')  return handleAdminAction(body);

    return jsonOut({ success: false, error: 'Unknown submission type: ' + type });

  } catch (err) {
    return jsonOut({ success: false, error: 'POST error: ' + err.message });
  }
}

/* ── Individual Registration ────────────────────────────── */
function handleIndividual(data) {
  // ── Acquire script-level lock (race condition protection) ──
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // wait up to 10 s
  } catch (le) {
    return jsonOut({ success: false, error: 'Server busy. Please try again in a moment.' });
  }

  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = getOrCreateIndividualSheet(ss);

    // ── Validate required fields ──
    var name   = sanitize(data.name || '');
    var regno  = sanitize(data.regno || '');
    var phone  = sanitize(data.phone || '');
    var email  = sanitize(data.email || '').toLowerCase();
    var sensor = sanitize(data.sensor || '');
    var year   = sanitize(data.year || '');
    var dept   = sanitize(data.department || '');

    if (!name || !regno || !phone || !email || !sensor) {
      return jsonOut({ success: false, error: 'Missing required fields.' });
    }

    // ── Read all existing rows ──
    var allRows = [];
    if (sheet.getLastRow() >= 2) {
      allRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    }

    // ── Duplicate student checks (email, phone, regno) ──
    for (var i = 0; i < allRows.length; i++) {
      var row = allRows[i];
      var rowStatus = String(row[COL_IND_STATUS - 1] || '').toUpperCase();
      if (rowStatus === 'CANCELLED' || rowStatus === 'REJECTED') continue;

      var rowEmail = String(row[COL_IND_EMAIL - 1] || '').toLowerCase().trim();
      var rowPhone = String(row[COL_IND_PHONE - 1] || '').trim();
      var rowRegno = String(row[COL_IND_REGNO - 1] || '').trim();

      if (rowEmail === email) {
        return jsonOut({ success: false, alreadyRegistered: true, field: 'email',
          error: 'This email address is already registered.' });
      }
      if (rowPhone === phone) {
        return jsonOut({ success: false, alreadyRegistered: true, field: 'phone',
          error: 'This phone number is already registered.' });
      }
      if (rowRegno.toLowerCase() === regno.toLowerCase()) {
        return jsonOut({ success: false, alreadyRegistered: true, field: 'regno',
          error: 'This register number is already registered.' });
      }
    }

    // ── Sensor duplicate check (global — both years, active registrations) ──
    var normSensor = normalizeSensor(sensor);
    for (var j = 0; j < allRows.length; j++) {
      var srow = allRows[j];
      var sRowStatus = String(srow[COL_IND_STATUS - 1] || '').toUpperCase();
      if (sRowStatus === 'CANCELLED' || sRowStatus === 'REJECTED') continue;
      var existingSensor = String(srow[COL_IND_SENSOR - 1] || '');
      if (normalizeSensor(existingSensor) === normSensor) {
        return jsonOut({ success: false, conflict: true,
          error: 'This sensor has already been registered by another participant.' });
      }
    }

    // ── Also check Custom Sensor Requests for the same normalized name ──
    var customSheet = ss.getSheetByName(SHEET_CUSTOM);
    if (customSheet && customSheet.getLastRow() >= 2) {
      var customRows = customSheet.getRange(2, 1, customSheet.getLastRow() - 1, 9).getValues();
      for (var k = 0; k < customRows.length; k++) {
        var cr = customRows[k];
        var crStatus = String(cr[COL_CSR_STATUS - 1] || '').toUpperCase();
        if (crStatus === 'REJECTED' || crStatus === 'CANCELLED') continue;
        var crNorm = String(cr[COL_CSR_NORMALIZED - 1] || '');
        if (crNorm === normSensor) {
          return jsonOut({ success: false, conflict: true,
            error: 'This sensor has already been requested by another participant.' });
        }
      }
    }

    // ── All checks passed — append row ──
    var regId = generateRegistrationId();
    sheet.appendRow([
      getIST(),
      name,
      regno,
      phone,
      email,
      sensor,
      year,
      dept,
      regId,
      'CONFIRMED'
    ]);

    SpreadsheetApp.flush();
    return jsonOut({ success: true, registrationId: regId });

  } finally {
    lock.releaseLock();
  }
}

/* ── Custom Sensor Request ──────────────────────────────── */
function handleCustomSensor(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (le) {
    return jsonOut({ success: false, error: 'Server busy. Please try again.' });
  }

  try {
    var ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
    var name        = sanitize(data.name || '');
    var regno       = sanitize(data.regno || '');
    var requested   = sanitize(data.requestedSensor || '');
    var year        = sanitize(data.year || '');
    var regId       = sanitize(data.registrationId || '');
    var normName    = normalizeSensor(requested);

    if (!requested || !name) {
      return jsonOut({ success: false, error: 'Missing sensor name.' });
    }

    // Check if normalized name matches any CONFIRMED individual registration
    var indSheet = ss.getSheetByName(SHEET_INDIVIDUAL);
    if (indSheet && indSheet.getLastRow() >= 2) {
      var indRows = indSheet.getRange(2, 1, indSheet.getLastRow() - 1, 10).getValues();
      for (var i = 0; i < indRows.length; i++) {
        var row = indRows[i];
        var rowStatus = String(row[COL_IND_STATUS - 1] || '').toUpperCase();
        if (rowStatus === 'CANCELLED' || rowStatus === 'REJECTED') continue;
        if (normalizeSensor(String(row[COL_IND_SENSOR - 1] || '')) === normName) {
          return jsonOut({ success: false, conflict: true,
            message: 'This sensor has already been registered by another participant.' });
        }
      }
    }

    // Check existing custom sensor requests
    var customSheet = getOrCreateCustomSheet(ss);
    var taken = false;
    if (customSheet.getLastRow() >= 2) {
      var crRows = customSheet.getRange(2, 1, customSheet.getLastRow() - 1, 9).getValues();
      for (var j = 0; j < crRows.length; j++) {
        var cr = crRows[j];
        var crStatus = String(cr[COL_CSR_STATUS - 1] || '').toUpperCase();
        if (crStatus === 'REJECTED' || crStatus === 'CANCELLED') continue;
        if (String(cr[COL_CSR_NORMALIZED - 1] || '') === normName) {
          taken = true;
          break;
        }
      }
    }

    if (taken) {
      return jsonOut({ success: false, conflict: true,
        message: 'This sensor has already been requested by another participant.' });
    }

    // Available — create request row with PENDING status
    customSheet.appendRow([
      getIST(), name, regno, requested, normName, year, regId, 'PENDING', ''
    ]);
    SpreadsheetApp.flush();

    return jsonOut({ success: true, available: true,
      message: 'Sensor is available. Your custom sensor request has been recorded.' });

  } finally {
    lock.releaseLock();
  }
}

/* ── Team Submission ────────────────────────────────────── */
function handleTeam(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_TEAM, [
    'Timestamp', 'Team Name', 'Members',
    'Sensor 1', 'Sensor 2', 'Sensor 3',
    'Theme', 'Project Title', 'Entry Code', 'Individual Reg ID'
  ]);

  var teamName    = sanitize(data.teamName || '');
  var sensor1     = sanitize(data.sensor1 || '');
  var sensor2     = sanitize(data.sensor2 || '');
  var sensor3     = sanitize(data.sensor3 || '');
  var individualId = sanitize(data.individualRegId || '');

  if (!teamName || !sensor1 || !sensor2 || !sensor3) {
    return jsonOut({ success: false, error: 'Missing required team fields.' });
  }

  sheet.appendRow([
    getIST(),
    teamName,
    sanitize(data.members || ''),
    sensor1,
    sensor2,
    sensor3,
    sanitize(data.theme || ''),
    sanitize(data.projectTitle || ''),
    sanitize(data.entryCode || ''),
    individualId
  ]);

  SpreadsheetApp.flush();
  return jsonOut({ success: true, entryCode: sanitize(data.entryCode || '') });
}

/* ── Admin Action (approve/reject custom sensor) ─────── */
function handleAdminAction(data) {
  var pass = sanitize(data.adminPass || '');
  if (pass !== ADMIN_PASS) {
    return jsonOut({ success: false, error: 'Unauthorized.' });
  }

  var action   = sanitize(data.action || '');  // 'approve' or 'reject'
  var rowIndex = parseInt(data.rowIndex, 10);   // 1-based data row index (excluding header)
  var note     = sanitize(data.note || '');

  var ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
  var customSheet = ss.getSheetByName(SHEET_CUSTOM);
  if (!customSheet) return jsonOut({ success: false, error: 'No custom sensor requests sheet.' });

  var sheetRow = rowIndex + 1; // +1 for header
  if (sheetRow < 2 || sheetRow > customSheet.getLastRow()) {
    return jsonOut({ success: false, error: 'Invalid row index.' });
  }

  var newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
  customSheet.getRange(sheetRow, COL_CSR_STATUS).setValue(newStatus);
  if (note) customSheet.getRange(sheetRow, COL_CSR_ADMIN_NOTE).setValue(note);

  SpreadsheetApp.flush();
  return jsonOut({ success: true, status: newStatus });
}

/* ── Get Claimed Sensors (normalized — all active rows) ─ */
function getClaimedSensors() {
  var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet    = ss.getSheetByName(SHEET_INDIVIDUAL);
  var claimed  = [];

  if (sheet && sheet.getLastRow() >= 2) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    values.forEach(function(row) {
      var status = String(row[COL_IND_STATUS - 1] || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'REJECTED') return;
      var sName = String(row[COL_IND_SENSOR - 1] || '').trim();
      if (sName.length > 0) {
        claimed.push({
          name:          sName,
          normalizedName: normalizeSensor(sName),
          year:          String(row[COL_IND_YEAR - 1] || ''),
          status:        status || 'CONFIRMED'
        });
      }
    });
  }

  // Also include PENDING custom sensor requests (not REJECTED/CANCELLED)
  var customSheet = ss.getSheetByName(SHEET_CUSTOM);
  if (customSheet && customSheet.getLastRow() >= 2) {
    var crRows = customSheet.getRange(2, 1, customSheet.getLastRow() - 1, 9).getValues();
    crRows.forEach(function(cr) {
      var crStatus = String(cr[COL_CSR_STATUS - 1] || '').toUpperCase();
      if (crStatus === 'REJECTED' || crStatus === 'CANCELLED') return;
      var reqName = String(cr[COL_CSR_REQUESTED - 1] || '').trim();
      if (reqName.length > 0) {
        claimed.push({
          name:          reqName,
          normalizedName: String(cr[COL_CSR_NORMALIZED - 1] || ''),
          year:          String(cr[COL_CSR_YEAR - 1] || ''),
          status:        crStatus + '_CUSTOM'
        });
      }
    });
  }

  return { claimed: claimed };
}

/* ── Sensor Statistics ───────────────────────────────── */
function getSensorStats() {
  var claimedData = getClaimedSensors();
  var claimed     = claimedData.claimed;
  var allocated   = claimed.length;
  var available   = Math.max(0, TOTAL_SENSORS - allocated);

  var byYear = {};
  claimed.forEach(function(c) {
    var y = c.year || 'Unknown';
    byYear[y] = (byYear[y] || 0) + 1;
  });

  // Count pending custom requests
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var customSheet = ss.getSheetByName(SHEET_CUSTOM);
  var customCount = 0;
  var pendingCount = 0;
  if (customSheet && customSheet.getLastRow() >= 2) {
    var crRows = customSheet.getRange(2, 1, customSheet.getLastRow() - 1, 9).getValues();
    crRows.forEach(function(cr) {
      var crStatus = String(cr[COL_CSR_STATUS - 1] || '').toUpperCase();
      customCount++;
      if (crStatus === 'PENDING') pendingCount++;
    });
  }

  return {
    total:     TOTAL_SENSORS,
    allocated: allocated,
    available: available,
    custom:    customCount,
    pending:   pendingCount,
    byYear:    byYear
  };
}

/* ── Get Custom Requests ─────────────────────────────── */
function getCustomRequests() {
  var ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
  var customSheet = ss.getSheetByName(SHEET_CUSTOM);
  var requests    = [];

  if (customSheet && customSheet.getLastRow() >= 2) {
    var rows = customSheet.getRange(2, 1, customSheet.getLastRow() - 1, 9).getValues();
    rows.forEach(function(row, idx) {
      requests.push({
        rowIndex:        idx + 1, // 1-based data row index
        timestamp:       String(row[0]),
        name:            String(row[1]),
        regno:           String(row[2]),
        requestedSensor: String(row[3]),
        normalizedName:  String(row[4]),
        year:            String(row[5]),
        registrationId:  String(row[6]),
        status:          String(row[7]),
        adminNote:       String(row[8])
      });
    });
  }

  return { requests: requests };
}

/* ── Get All Data (Admin view) ──────────────────────────── */
function getAllData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  function sheetRows(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet
      .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
      .getValues()
      .map(function(row) {
        return row.map(function(cell) { return String(cell); });
      });
  }

  var stats = getSensorStats();

  return {
    individual: sheetRows(SHEET_INDIVIDUAL),
    team:       sheetRows(SHEET_TEAM),
    custom:     sheetRows(SHEET_CUSTOM),
    stats:      stats
  };
}

/* ── Sheet Creators ─────────────────────────────────────── */
function getOrCreateIndividualSheet(ss) {
  return getOrCreateSheet(ss, SHEET_INDIVIDUAL, [
    'Timestamp', 'Name', 'Register Number', 'Phone', 'Email', 'Sensor Chosen',
    'Year', 'Department', 'Registration ID', 'Status'
  ]);
}

function getOrCreateCustomSheet(ss) {
  return getOrCreateSheet(ss, SHEET_CUSTOM, [
    'Timestamp', 'Name', 'Register Number', 'Requested Sensor', 'Normalized Name',
    'Year', 'Registration ID', 'Status', 'Admin Note'
  ]);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);

    // Style header row — navy background, gold text
    var hr = sheet.getRange(1, 1, 1, headers.length);
    hr.setBackground('#0b1e3d');
    hr.setFontColor('#e0a92e');
    hr.setFontWeight('bold');
    hr.setFontSize(11);
    hr.setBorder(false, false, true, false, false, false, '#e0a92e', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

    sheet.setFrozenRows(1);
    for (var i = 1; i <= headers.length; i++) {
      sheet.setColumnWidth(i, 160);
    }
  }
  return sheet;
}

/* ── Sensor Name Normalization ──────────────────────────── */
/**
 * Normalizes a sensor name for duplicate detection.
 *
 * Rules:
 *  - Lowercase everything
 *  - Remove hyphens, underscores, extra spaces
 *  - Strip common suffixes: 'sensor', 'module', 'detector', 'board', 'breakout'
 *    BUT only if the remaining string is still meaningful (length >= 3)
 *  - Preserve model numbers intact (e.g., DHT11 stays dht11, MQ-2 stays mq2)
 *
 * Examples:
 *  "MAX30102"                → "max30102"
 *  "MAX 30102"               → "max30102"
 *  "Max-30102 Pulse Sensor"  → "max30102pulse"  ← pulse is a keyword, strip suffix
 *  "Heartbeat MAX30102"      → "heartbeatmax30102" → after suffix strip: "heartbeatmax30102"
 *  "MLX90614"                → "mlx90614"
 *  "IR Temperature Sensor MLX90614" → "irtemperaturemlx90614"
 *  "DHT11"                   → "dht11"
 *  "DHT22"                   → "dht22"  (different — preserved)
 *  "MQ-2"                    → "mq2"
 *  "MQ-3"                    → "mq3"   (different — preserved)
 */
function normalizeSensor(name) {
  if (!name) return '';

  var s = String(name)
    .toLowerCase()
    .replace(/[-_]/g, '')        // remove hyphens and underscores
    .replace(/\s+/g, '')         // remove all whitespace
    .trim();

  // Strip common suffixes — only if core is still >= 3 chars
  var suffixes = ['sensor', 'module', 'detector', 'breakout', 'board', 'kit'];
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < suffixes.length; i++) {
      var sfx = suffixes[i];
      if (s.endsWith(sfx) && s.length - sfx.length >= 3) {
        s = s.slice(0, s.length - sfx.length);
        changed = true;
      }
    }
  }

  return s;
}

/* ── Registration ID Generator ──────────────────────────── */
function generateRegistrationId() {
  var year   = new Date().getFullYear();
  var rand5  = Math.floor(10000 + Math.random() * 90000); // 5-digit random
  return 'REG-' + year + '-' + rand5;
}

/* ── Helpers ────────────────────────────────────────────── */

/**
 * Sanitise a cell value — trim whitespace, prevent formula injection.
 */
function sanitize(value) {
  if (value === undefined || value === null) return '';
  var str = String(value).trim();
  if (str.length > 0 && ['+', '-', '=', '@', '\t', '\r'].indexOf(str.charAt(0)) !== -1) {
    return "'" + str;
  }
  return str;
}

/**
 * Returns current datetime formatted in IST (Asia/Kolkata).
 */
function getIST() {
  var d = new Date();
  return Utilities.formatDate(d, 'Asia/Kolkata', 'dd-MM-yyyy HH:mm:ss');
}

/**
 * Wraps any object as a JSON ContentService response with CORS headers.
 */
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
