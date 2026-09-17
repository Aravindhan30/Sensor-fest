/**
 * SENSORA 2K26 — Google Apps Script Backend (v3.0)
 * ==========================================
 * Sheet ID : 1cx8MZjV6QWYb1FslyxDqS6U9IJbjEC2xEu4wOIseIKc
 * Web App  : https://script.google.com/macros/s/AKfycbznsdmc0JjvnZo9W02GWF3PEv6zUBSZKVLkZmLWomW7-D42jHAHUV1DvRiiGLHGVj_J/exec
 *
 * ── GET actions ──────────────────────────────────────────────
 * ?action=getClaimed         → { claimed: [{name, normalizedName, year, status}] }
 * ?action=getSensorStats     → { total, allocated, available, custom, byYear, secondYear }
 * ?action=getCustomRequests  → { requests: [...] }
 * ?action=getAll             → { individual, team, custom, secondYearTeams, stats }
 * ?action=getBasicSensorPool → { pool: [{id,name,normalizedName,available,allocCount}], suggestedId, suggestedName }
 * ?action=getAll2nd          → { teams: [...], stats: {...} }
 *
 * ── POST types ───────────────────────────────────────────────
 * { type: 'individual' }   → { success, conflict, alreadyRegistered, registrationId }
 * { type: 'customSensor' } → { success, available, message }
 * { type: 'adminAction' }  → { success }
 * { type: 'team' }         → { success, entryCode }       (3rd/4th year team)
 * { type: 'team2nd' }      → { success, registrationId, conflict, duplicateStudent, duplicateTeam }
 *
 * Deploy settings:
 *   Execute as : Me
 *   Who has access : Anyone
 *
 * IMPORTANT: After editing, Deploy → Manage Deployments → Edit → New version → Deploy.
 *            Same Web App URL — no change needed in any JS file.
 */

/* ── Constants ─────────────────────────────────────────── */
var SPREADSHEET_ID       = '1cx8MZjV6QWYb1FslyxDqS6U9IJbjEC2xEu4wOIseIKc';
var SHEET_INDIVIDUAL     = 'Individual Registrations';
var SHEET_TEAM           = 'Team Submissions';
var SHEET_CUSTOM         = 'Custom Sensor Requests';
var SHEET_TEAM_2ND       = '2nd Year Team Registrations';
var TOTAL_SENSORS        = 113;
var ADMIN_PASS           = 'SENSORA@2K26';

/* ── Column Indices (1-based) for Individual sheet ─────── */
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
var COL_CSR_TIMESTAMP    = 1;
var COL_CSR_NAME         = 2;
var COL_CSR_REGNO        = 3;
var COL_CSR_REQUESTED    = 4;
var COL_CSR_NORMALIZED   = 5;
var COL_CSR_YEAR         = 6;
var COL_CSR_REGID        = 7;
var COL_CSR_STATUS       = 8;
var COL_CSR_ADMIN_NOTE   = 9;

/* ── Column Indices (1-based) for 2nd Year Team sheet ──── */
// Col:  1=Timestamp  2=RegistrationID  3=TeamName  4=LeaderName  5=LeaderRegNo
//       6=LeaderPhone  7=LeaderEmail  8=M2RegNo  9=M2Name  10=M3RegNo  11=M3Name
//       12=SensorID  13=SensorName  14=Status
var COL_T2_TIMESTAMP     = 1;
var COL_T2_REGID         = 2;
var COL_T2_TEAMNAME      = 3;
var COL_T2_LEADER_NAME   = 4;
var COL_T2_LEADER_REGNO  = 5;
var COL_T2_LEADER_PHONE  = 6;
var COL_T2_LEADER_EMAIL  = 7;
var COL_T2_M2_REGNO      = 8;
var COL_T2_M2_NAME       = 9;
var COL_T2_M3_REGNO      = 10;
var COL_T2_M3_NAME       = 11;
var COL_T2_SENSOR_ID     = 12;
var COL_T2_SENSOR_NAME   = 13;
var COL_T2_STATUS        = 14;

/* ── Basic Sensor Pool (IDs from sensors.json) ──────────── */
// 32 beginner-friendly sensors, price ≤ ₹100.
// Availability is checked live against all active allocations.
var BASIC_SENSOR_IDS = [
  'S041','S005','S032','S056','S025','S029','S030','S036','S044',
  'S050','S024','S033','S047','S057','S059','S034','S035','S009',
  'S022','S003','S001','S010','S023','S051','S094','S099','S100',
  'S101','S102','S103','S104','S109'
];

/* ── Basic Sensor Metadata (name + for normalization) ────── */
var BASIC_SENSOR_META = {
  'S041': { name: 'LDR (Light Dependent Resistor)'       },
  'S005': { name: 'NTC 10kΩ Thermistor'                  },
  'S032': { name: 'Hall Effect Sensor (A3144)'            },
  'S056': { name: 'Tilt Switch Ball Sensor'               },
  'S025': { name: 'TCRT5000 IR Reflective Sensor'         },
  'S029': { name: 'SW-420 Vibration Sensor Module'        },
  'S030': { name: 'KY-002 Shock Vibration Sensor'         },
  'S036': { name: 'Touch Sensor (TTP223 Capacitive)'      },
  'S044': { name: 'Photodiode Sensor Module'              },
  'S050': { name: 'Water Level Sensor'                    },
  'S024': { name: 'IR Proximity Sensor Module'            },
  'S033': { name: 'KY-024 Linear Hall Effect Sensor'      },
  'S047': { name: 'Sound Sensor Module (KY-038)'          },
  'S057': { name: 'Rotary Encoder Module (KY-040)'        },
  'S059': { name: 'Joystick Module (KY-023)'              },
  'S034': { name: 'Flame / Fire Sensor Module'            },
  'S035': { name: 'KY-026 Flame Detection Sensor'         },
  'S009': { name: 'Rain/Rainfall Detection Sensor'        },
  'S022': { name: 'PIR Motion Sensor (HC-SR501)'          },
  'S003': { name: 'LM35 Temperature Sensor'               },
  'S001': { name: 'DHT11 Temperature & Humidity Sensor'   },
  'S010': { name: 'Soil Moisture Sensor'                  },
  'S023': { name: 'Ultrasonic Distance Sensor HC-SR04'    },
  'S051': { name: 'Float Switch Sensor'                   },
  'S094': { name: 'LM393 Speed Sensor (Slotted Optical)'  },
  'S099': { name: 'KY-010 Optical Break-Beam Sensor'      },
  'S100': { name: 'KY-036 Metal Touch Sensor Module'      },
  'S101': { name: 'KY-016 RGB LED Module'                 },
  'S102': { name: 'KY-018 Photo Resistor (LDR) Module'    },
  'S103': { name: 'KY-022 IR Receiver Module (38 kHz)'    },
  'S104': { name: 'SR602 Mini PIR Motion Sensor (AM312)'  },
  'S109': { name: 'NE555 Timer Module (Astable/Monostable)' }
};

/* ════════════════════════════════════════════════════════════
   GET HANDLER
   ════════════════════════════════════════════════════════════ */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

    if (action === 'getClaimed')        return jsonOut(getClaimedSensors());
    if (action === 'getSensorStats')    return jsonOut(getSensorStats());
    if (action === 'getCustomRequests') return jsonOut(getCustomRequests());
    if (action === 'getAll')            return jsonOut(getAllData());
    if (action === 'getBasicSensorPool') return jsonOut(getBasicSensorPool());
    if (action === 'getAll2nd')         return jsonOut(getAllData2nd());

    return jsonOut({ status: 'SENSORA 2K26 backend v3.0 running' });

  } catch (err) {
    return jsonOut({ error: 'GET error: ' + err.message });
  }
}

/* ════════════════════════════════════════════════════════════
   POST HANDLER
   ════════════════════════════════════════════════════════════ */
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
    if (type === 'team2nd')      return handleTeam2nd(body);

    return jsonOut({ success: false, error: 'Unknown submission type: ' + type });

  } catch (err) {
    return jsonOut({ success: false, error: 'POST error: ' + err.message });
  }
}

/* ════════════════════════════════════════════════════════════
   INDIVIDUAL REGISTRATION (3rd/4th Year — unchanged)
   ════════════════════════════════════════════════════════════ */
function handleIndividual(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (le) {
    return jsonOut({ success: false, error: 'Server busy. Please try again in a moment.' });
  }

  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = getOrCreateIndividualSheet(ss);

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

    var allRows = [];
    if (sheet.getLastRow() >= 2) {
      allRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    }

    // Duplicate student checks
    for (var i = 0; i < allRows.length; i++) {
      var row = allRows[i];
      var rowStatus = String(row[COL_IND_STATUS - 1] || '').toUpperCase();
      if (rowStatus === 'CANCELLED' || rowStatus === 'REJECTED') continue;

      if (String(row[COL_IND_EMAIL - 1] || '').toLowerCase().trim() === email) {
        return jsonOut({ success: false, alreadyRegistered: true, field: 'email',
          error: 'This email address is already registered.' });
      }
      if (String(row[COL_IND_PHONE - 1] || '').trim() === phone) {
        return jsonOut({ success: false, alreadyRegistered: true, field: 'phone',
          error: 'This phone number is already registered.' });
      }
      if (String(row[COL_IND_REGNO - 1] || '').trim().toLowerCase() === regno.toLowerCase()) {
        return jsonOut({ success: false, alreadyRegistered: true, field: 'regno',
          error: 'This register number is already registered.' });
      }
    }

    // Sensor duplicate check — global (all years)
    var normSensor = normalizeSensor(sensor);
    if (isSensorAllocatedGlobally(ss, normSensor)) {
      return jsonOut({ success: false, conflict: true,
        error: 'This sensor has already been registered by another participant.' });
    }

    var regId = generateRegistrationId('REG');
    sheet.appendRow([getIST(), name, regno, phone, email, sensor, year, dept, regId, 'CONFIRMED']);
    SpreadsheetApp.flush();
    return jsonOut({ success: true, registrationId: regId });

  } finally {
    lock.releaseLock();
  }
}

/* ════════════════════════════════════════════════════════════
   CUSTOM SENSOR REQUEST (unchanged)
   ════════════════════════════════════════════════════════════ */
function handleCustomSensor(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (le) {
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

    if (isSensorAllocatedGlobally(ss, normName)) {
      return jsonOut({ success: false, conflict: true,
        message: 'This sensor has already been registered by another participant.' });
    }

    var customSheet = getOrCreateCustomSheet(ss);
    customSheet.appendRow([getIST(), name, regno, requested, normName, year, regId, 'PENDING', '']);
    SpreadsheetApp.flush();

    return jsonOut({ success: true, available: true,
      message: 'Sensor is available. Your custom sensor request has been recorded.' });

  } finally {
    lock.releaseLock();
  }
}

/* ════════════════════════════════════════════════════════════
   3rd/4th YEAR TEAM SUBMISSION (unchanged)
   ════════════════════════════════════════════════════════════ */
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

  if (!teamName || !sensor1 || !sensor2 || !sensor3) {
    return jsonOut({ success: false, error: 'Missing required team fields.' });
  }

  sheet.appendRow([
    getIST(), teamName,
    sanitize(data.members || ''),
    sensor1, sensor2, sensor3,
    sanitize(data.theme || ''),
    sanitize(data.projectTitle || ''),
    sanitize(data.entryCode || ''),
    sanitize(data.individualRegId || '')
  ]);

  SpreadsheetApp.flush();
  return jsonOut({ success: true, entryCode: sanitize(data.entryCode || '') });
}

/* ════════════════════════════════════════════════════════════
   2ND YEAR TEAM REGISTRATION — NEW
   ════════════════════════════════════════════════════════════ */
function handleTeam2nd(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(12000);
  } catch (le) {
    return jsonOut({ success: false, error: 'Server busy — please try again in a moment.' });
  }

  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = getOrCreate2ndYearSheet(ss);

    // ── Parse and sanitise fields ──
    var teamName     = sanitize(data.teamName || '');
    var leaderName   = sanitize(data.leaderName || '');
    var leaderRegno  = sanitize(data.leaderRegno || '').toLowerCase();
    var leaderPhone  = sanitize(data.leaderPhone || '');
    var leaderEmail  = sanitize(data.leaderEmail || '').toLowerCase();
    var m2Regno      = sanitize(data.member2Regno || '').toLowerCase();
    var m2Name       = sanitize(data.member2Name || '');
    var m3Regno      = sanitize(data.member3Regno || '').toLowerCase();
    var m3Name       = sanitize(data.member3Name || '');
    var sensorId     = sanitize(data.sensorId || '');
    var sensorName   = sanitize(data.sensorName || '');

    // ── Validate required fields ──
    if (!teamName)    return jsonOut({ success: false, error: 'Team name is required.' });
    if (!leaderName)  return jsonOut({ success: false, error: 'Leader name is required.' });
    if (!leaderRegno) return jsonOut({ success: false, error: 'Leader register number is required.' });
    if (!leaderPhone) return jsonOut({ success: false, error: 'Leader phone is required.' });
    if (!leaderEmail) return jsonOut({ success: false, error: 'Leader email is required.' });
    if (!m2Regno)     return jsonOut({ success: false, error: 'Member 2 register number is required.' });
    if (!m2Name)      return jsonOut({ success: false, error: 'Member 2 name is required.' });
    if (!m3Regno)     return jsonOut({ success: false, error: 'Member 3 register number is required.' });
    if (!m3Name)      return jsonOut({ success: false, error: 'Member 3 name is required.' });
    if (!sensorId || !sensorName) return jsonOut({ success: false, error: 'Sensor selection is required.' });

    // ── All register numbers in this team ──
    var allRegNos = [leaderRegno, m2Regno, m3Regno].map(function(r) { return r.trim(); });

    // ── Check for duplicate register numbers within the team ──
    var uniqueNos = {};
    for (var ui = 0; ui < allRegNos.length; ui++) {
      if (uniqueNos[allRegNos[ui]]) {
        return jsonOut({ success: false, error: 'A team member register number appears more than once.' });
      }
      uniqueNos[allRegNos[ui]] = true;
    }

    // ── Read existing 2nd year rows ──
    var existing2nd = [];
    if (sheet.getLastRow() >= 2) {
      existing2nd = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
    }

    // ── Duplicate team name check ──
    for (var ti = 0; ti < existing2nd.length; ti++) {
      var trow = existing2nd[ti];
      var tStatus = String(trow[COL_T2_STATUS - 1] || '').toUpperCase();
      if (tStatus === 'CANCELLED') continue;
      if (String(trow[COL_T2_TEAMNAME - 1] || '').trim().toLowerCase() === teamName.toLowerCase()) {
        return jsonOut({ success: false, duplicateTeam: true,
          error: 'This team name is already registered. Please choose a different name.' });
      }
    }

    // ── Duplicate student check across existing 2nd year teams ──
    var allegedRegNosLower = allRegNos.map(function(r) { return r.toLowerCase(); });
    for (var di = 0; di < existing2nd.length; di++) {
      var drow = existing2nd[di];
      var dStatus = String(drow[COL_T2_STATUS - 1] || '').toUpperCase();
      if (dStatus === 'CANCELLED') continue;

      var existingNos = [
        String(drow[COL_T2_LEADER_REGNO - 1] || '').toLowerCase().trim(),
        String(drow[COL_T2_M2_REGNO - 1] || '').toLowerCase().trim(),
        String(drow[COL_T2_M3_REGNO - 1] || '').toLowerCase().trim()
      ];

      for (var ri = 0; ri < allegedRegNosLower.length; ri++) {
        if (allegedRegNosLower[ri] && existingNos.indexOf(allegedRegNosLower[ri]) !== -1) {
          return jsonOut({ success: false, duplicateStudent: true,
            error: 'One or more team members are already registered in another 2nd year team. Each student can only be in one team.' });
        }
      }
    }

    // ── Global sensor availability check (all 3 years) ──
    var normSensor = normalizeSensor(sensorName);
    if (isSensorAllocatedGlobally(ss, normSensor)) {
      return jsonOut({ success: false, conflict: true,
        error: 'This sensor was just allocated to another participant. Please choose a different sensor.' });
    }

    // ── All checks passed — write row ──
    var regId = generateRegistrationId('SF2');
    sheet.appendRow([
      getIST(),
      regId,
      teamName,
      leaderName,
      data.leaderRegno,  // preserve original case for display
      leaderPhone,
      leaderEmail,
      data.member2Regno,
      m2Name,
      data.member3Regno,
      m3Name,
      sensorId,
      sensorName,
      'CONFIRMED'
    ]);

    SpreadsheetApp.flush();
    return jsonOut({ success: true, registrationId: regId });

  } finally {
    lock.releaseLock();
  }
}

/* ════════════════════════════════════════════════════════════
   ADMIN ACTION (unchanged)
   ════════════════════════════════════════════════════════════ */
function handleAdminAction(data) {
  var pass = sanitize(data.adminPass || '');
  if (pass !== ADMIN_PASS) {
    return jsonOut({ success: false, error: 'Unauthorized.' });
  }

  var action   = sanitize(data.action || '');
  var rowIndex = parseInt(data.rowIndex, 10);
  var note     = sanitize(data.note || '');

  var ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
  var customSheet = ss.getSheetByName(SHEET_CUSTOM);
  if (!customSheet) return jsonOut({ success: false, error: 'No custom sensor requests sheet.' });

  var sheetRow = rowIndex + 1;
  if (sheetRow < 2 || sheetRow > customSheet.getLastRow()) {
    return jsonOut({ success: false, error: 'Invalid row index.' });
  }

  var newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
  customSheet.getRange(sheetRow, COL_CSR_STATUS).setValue(newStatus);
  if (note) customSheet.getRange(sheetRow, COL_CSR_ADMIN_NOTE).setValue(note);

  SpreadsheetApp.flush();
  return jsonOut({ success: true, status: newStatus });
}

/* ════════════════════════════════════════════════════════════
   GET BASIC SENSOR POOL — NEW
   Returns available basic sensors + suggested one (fair distribution)
   ════════════════════════════════════════════════════════════ */
function getBasicSensorPool() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 1. Build set of globally claimed normalized sensor names
  var globalClaimed = getClaimedNormalizedSet(ss);

  // 2. Count how many times each basic sensor has been allocated to 2nd year teams
  var allocCounts = {};
  BASIC_SENSOR_IDS.forEach(function(id) { allocCounts[id] = 0; });

  var sheet2nd = ss.getSheetByName(SHEET_TEAM_2ND);
  if (sheet2nd && sheet2nd.getLastRow() >= 2) {
    var rows = sheet2nd.getRange(2, 1, sheet2nd.getLastRow() - 1, 14).getValues();
    rows.forEach(function(row) {
      var status = String(row[COL_T2_STATUS - 1] || '').toUpperCase();
      if (status === 'CANCELLED') return;
      var sid = String(row[COL_T2_SENSOR_ID - 1] || '').trim();
      if (sid && allocCounts.hasOwnProperty(sid)) {
        allocCounts[sid]++;
      }
    });
  }

  // 3. Build pool with availability and allocation counts
  var pool = [];
  var suggestedId   = null;
  var suggestedName = null;
  var lowestCount   = Infinity;

  BASIC_SENSOR_IDS.forEach(function(id) {
    var meta = BASIC_SENSOR_META[id];
    if (!meta) return;
    var norm      = normalizeSensor(meta.name);
    var available = !globalClaimed.has(norm);
    var count     = allocCounts[id] || 0;

    pool.push({
      id:             id,
      name:           meta.name,
      normalizedName: norm,
      available:      available,
      allocCount:     count
    });

    // Find suggestion: lowest allocation count among available sensors
    if (available) {
      if (count < lowestCount || (count === lowestCount && !suggestedId)) {
        lowestCount   = count;
        suggestedId   = id;
        suggestedName = meta.name;
      }
    }
  });

  return {
    pool:          pool,
    suggestedId:   suggestedId,
    suggestedName: suggestedName,
    totalBasic:    BASIC_SENSOR_IDS.length,
    totalAvailable: pool.filter(function(s) { return s.available; }).length
  };
}

/* ════════════════════════════════════════════════════════════
   GET CLAIMED SENSORS (extended to include 2nd year)
   ════════════════════════════════════════════════════════════ */
function getClaimedSensors() {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var claimed = [];

  // Individual Registrations (3rd/4th year)
  var indSheet = ss.getSheetByName(SHEET_INDIVIDUAL);
  if (indSheet && indSheet.getLastRow() >= 2) {
    var values = indSheet.getRange(2, 1, indSheet.getLastRow() - 1, 10).getValues();
    values.forEach(function(row) {
      var status = String(row[COL_IND_STATUS - 1] || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'REJECTED') return;
      var sName = String(row[COL_IND_SENSOR - 1] || '').trim();
      if (sName.length > 0) {
        claimed.push({
          name:           sName,
          normalizedName: normalizeSensor(sName),
          year:           String(row[COL_IND_YEAR - 1] || ''),
          status:         status || 'CONFIRMED'
        });
      }
    });
  }

  // Custom Sensor Requests (PENDING/APPROVED)
  var customSheet = ss.getSheetByName(SHEET_CUSTOM);
  if (customSheet && customSheet.getLastRow() >= 2) {
    var crRows = customSheet.getRange(2, 1, customSheet.getLastRow() - 1, 9).getValues();
    crRows.forEach(function(cr) {
      var crStatus = String(cr[COL_CSR_STATUS - 1] || '').toUpperCase();
      if (crStatus === 'REJECTED' || crStatus === 'CANCELLED') return;
      var reqName = String(cr[COL_CSR_REQUESTED - 1] || '').trim();
      if (reqName.length > 0) {
        claimed.push({
          name:           reqName,
          normalizedName: String(cr[COL_CSR_NORMALIZED - 1] || ''),
          year:           String(cr[COL_CSR_YEAR - 1] || ''),
          status:         crStatus + '_CUSTOM'
        });
      }
    });
  }

  // 2nd Year Team Registrations
  var sheet2nd = ss.getSheetByName(SHEET_TEAM_2ND);
  if (sheet2nd && sheet2nd.getLastRow() >= 2) {
    var t2Rows = sheet2nd.getRange(2, 1, sheet2nd.getLastRow() - 1, 14).getValues();
    t2Rows.forEach(function(row) {
      var status = String(row[COL_T2_STATUS - 1] || '').toUpperCase();
      if (status === 'CANCELLED') return;
      var sName = String(row[COL_T2_SENSOR_NAME - 1] || '').trim();
      if (sName.length > 0) {
        claimed.push({
          name:           sName,
          normalizedName: normalizeSensor(sName),
          year:           '2nd Year',
          status:         status
        });
      }
    });
  }

  return { claimed: claimed };
}

/* ── Helper: get set of all globally claimed normalized names ── */
function getClaimedNormalizedSet(ss) {
  var result = new Set ? new Set() : null;
  // For Apps Script (V8 runtime supports Set)
  if (!result) {
    // Fallback for older runtimes
    result = { _d: {}, has: function(k) { return this._d.hasOwnProperty(k); }, add: function(k) { this._d[k]=1; } };
  }

  var claimed = getClaimedSensors().claimed;
  claimed.forEach(function(c) {
    if (c.normalizedName) result.add(c.normalizedName);
  });
  return result;
}

/* ── Helper: check if a normalized sensor name is already allocated ── */
function isSensorAllocatedGlobally(ss, normSensor) {
  var claimed = getClaimedSensors().claimed;
  for (var i = 0; i < claimed.length; i++) {
    if (claimed[i].normalizedName === normSensor) return true;
  }
  return false;
}

/* ════════════════════════════════════════════════════════════
   SENSOR STATISTICS (extended for 2nd year)
   ════════════════════════════════════════════════════════════ */
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

  // Custom requests
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var customSheet = ss.getSheetByName(SHEET_CUSTOM);
  var customCount = 0, pendingCount = 0;
  if (customSheet && customSheet.getLastRow() >= 2) {
    var crRows = customSheet.getRange(2, 1, customSheet.getLastRow() - 1, 9).getValues();
    crRows.forEach(function(cr) {
      var crStatus = String(cr[COL_CSR_STATUS - 1] || '').toUpperCase();
      customCount++;
      if (crStatus === 'PENDING') pendingCount++;
    });
  }

  // 2nd Year specific stats
  var pool = getBasicSensorPool();
  var sheet2nd = ss.getSheetByName(SHEET_TEAM_2ND);
  var teamCount2nd = 0, studentCount2nd = 0;
  if (sheet2nd && sheet2nd.getLastRow() >= 2) {
    var t2Rows = sheet2nd.getRange(2, 1, sheet2nd.getLastRow() - 1, 14).getValues();
    t2Rows.forEach(function(row) {
      var status = String(row[COL_T2_STATUS - 1] || '').toUpperCase();
      if (status === 'CANCELLED') return;
      teamCount2nd++;
      studentCount2nd += 3; // exactly 3 members per team
    });
  }

  return {
    total:              TOTAL_SENSORS,
    allocated:          allocated,
    available:          available,
    custom:             customCount,
    pending:            pendingCount,
    byYear:             byYear,
    secondYear: {
      teams:            teamCount2nd,
      students:         studentCount2nd,
      basicTotal:       BASIC_SENSOR_IDS.length,
      basicAllocated:   pool.totalBasic - pool.totalAvailable,
      basicAvailable:   pool.totalAvailable
    }
  };
}

/* ════════════════════════════════════════════════════════════
   GET CUSTOM REQUESTS (unchanged)
   ════════════════════════════════════════════════════════════ */
function getCustomRequests() {
  var ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
  var customSheet = ss.getSheetByName(SHEET_CUSTOM);
  var requests    = [];

  if (customSheet && customSheet.getLastRow() >= 2) {
    var rows = customSheet.getRange(2, 1, customSheet.getLastRow() - 1, 9).getValues();
    rows.forEach(function(row, idx) {
      requests.push({
        rowIndex:        idx + 1,
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

/* ════════════════════════════════════════════════════════════
   GET ALL DATA — Admin (extended with 2nd year)
   ════════════════════════════════════════════════════════════ */
function getAllData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  function sheetRows(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet
      .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
      .getValues()
      .map(function(row) { return row.map(function(cell) { return String(cell); }); });
  }

  var stats = getSensorStats();

  return {
    individual:     sheetRows(SHEET_INDIVIDUAL),
    team:           sheetRows(SHEET_TEAM),
    custom:         sheetRows(SHEET_CUSTOM),
    secondYearTeams: sheetRows(SHEET_TEAM_2ND),
    stats:          stats
  };
}

/* ════════════════════════════════════════════════════════════
   GET ALL DATA 2nd Year — Admin
   ════════════════════════════════════════════════════════════ */
function getAllData2nd() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TEAM_2ND);
  var teams = [];

  if (sheet && sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
    rows.forEach(function(row, idx) {
      teams.push({
        rowIndex:    idx + 1,
        timestamp:   String(row[0]),
        regId:       String(row[1]),
        teamName:    String(row[2]),
        leaderName:  String(row[3]),
        leaderRegno: String(row[4]),
        leaderPhone: String(row[5]),
        leaderEmail: String(row[6]),
        m2Regno:     String(row[7]),
        m2Name:      String(row[8]),
        m3Regno:     String(row[9]),
        m3Name:      String(row[10]),
        sensorId:    String(row[11]),
        sensorName:  String(row[12]),
        status:      String(row[13])
      });
    });
  }

  var pool  = getBasicSensorPool();
  var stats = getSensorStats();

  return {
    teams:          teams,
    stats:          stats,
    basicPool:      pool.pool,
    suggestedId:    pool.suggestedId,
    suggestedName:  pool.suggestedName
  };
}

/* ════════════════════════════════════════════════════════════
   SHEET CREATORS
   ════════════════════════════════════════════════════════════ */
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

function getOrCreate2ndYearSheet(ss) {
  return getOrCreateSheet(ss, SHEET_TEAM_2ND, [
    'Timestamp', 'Registration ID', 'Team Name',
    'Leader Name', 'Leader Reg No', 'Leader Phone', 'Leader Email',
    'Member 2 Reg No', 'Member 2 Name',
    'Member 3 Reg No', 'Member 3 Name',
    'Sensor ID', 'Sensor Name', 'Status'
  ]);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    var hr = sheet.getRange(1, 1, 1, headers.length);
    hr.setBackground('#0b1e3d');
    hr.setFontColor('#e0a92e');
    hr.setFontWeight('bold');
    hr.setFontSize(11);
    hr.setBorder(false, false, true, false, false, false, '#e0a92e', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sheet.setFrozenRows(1);
    for (var i = 1; i <= headers.length; i++) { sheet.setColumnWidth(i, 160); }
  }
  return sheet;
}

/* ════════════════════════════════════════════════════════════
   SENSOR NAME NORMALIZATION
   ════════════════════════════════════════════════════════════ */
function normalizeSensor(name) {
  if (!name) return '';
  var s = String(name)
    .toLowerCase()
    .replace(/[-_]/g, '')
    .replace(/\s+/g, '')
    .trim();

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

/* ════════════════════════════════════════════════════════════
   REGISTRATION ID GENERATOR
   ════════════════════════════════════════════════════════════ */
function generateRegistrationId(prefix) {
  var year  = new Date().getFullYear();
  var rand5 = Math.floor(10000 + Math.random() * 90000);
  return (prefix || 'REG') + '-' + year + '-' + rand5;
}

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */
function sanitize(value) {
  if (value === undefined || value === null) return '';
  var str = String(value).trim();
  if (str.length > 0 && ['+', '-', '=', '@', '\t', '\r'].indexOf(str.charAt(0)) !== -1) {
    return "'" + str;
  }
  return str;
}

function getIST() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MM-yyyy HH:mm:ss');
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
