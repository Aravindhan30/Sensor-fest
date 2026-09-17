/* ============================================================
   SENSORA 2K26 — 2nd Year Registration App (app-2nd.js)
   Team-Only · Exactly 3 Members · Basic Sensor Auto-Suggest
   Global availability check · Fair distribution · Race-safe
   ============================================================ */

'use strict';

/* ── Configuration ────────────────────────────────────────── */
const CFG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbznsdmc0JjvnZo9W02GWF3PEv6zUBSZKVLkZmLWomW7-D42jHAHUV1DvRiiGLHGVj_J/exec',
  DEBOUNCE_MS: 150,
  MAX_RESULTS:  12,
};

/* ── Client-side Fallback Pool (used when GAS pool endpoint unavailable) ─ */
// Mirrors BASIC_SENSOR_META in google-apps-script.gs
const BASIC_POOL_FALLBACK = [
  { id: 'S041', name: 'LDR (Light Dependent Resistor)'         },
  { id: 'S005', name: 'NTC 10kΩ Thermistor'                   },
  { id: 'S032', name: 'Hall Effect Sensor (A3144)'             },
  { id: 'S056', name: 'Tilt Switch Ball Sensor'                },
  { id: 'S025', name: 'TCRT5000 IR Reflective Sensor'          },
  { id: 'S029', name: 'SW-420 Vibration Sensor Module'         },
  { id: 'S030', name: 'KY-002 Shock Vibration Sensor'          },
  { id: 'S036', name: 'Touch Sensor (TTP223 Capacitive)'       },
  { id: 'S044', name: 'Photodiode Sensor Module'               },
  { id: 'S050', name: 'Water Level Sensor'                     },
  { id: 'S024', name: 'IR Proximity Sensor Module'             },
  { id: 'S033', name: 'KY-024 Linear Hall Effect Sensor'       },
  { id: 'S047', name: 'Sound Sensor Module (KY-038)'           },
  { id: 'S057', name: 'Rotary Encoder Module (KY-040)'         },
  { id: 'S059', name: 'Joystick Module (KY-023)'               },
  { id: 'S034', name: 'Flame / Fire Sensor Module'             },
  { id: 'S035', name: 'KY-026 Flame Detection Sensor'          },
  { id: 'S009', name: 'Rain/Rainfall Detection Sensor'         },
  { id: 'S022', name: 'PIR Motion Sensor (HC-SR501)'           },
  { id: 'S003', name: 'LM35 Temperature Sensor'                },
  { id: 'S001', name: 'DHT11 Temperature & Humidity Sensor'    },
  { id: 'S010', name: 'Soil Moisture Sensor'                   },
  { id: 'S023', name: 'Ultrasonic Distance Sensor HC-SR04'     },
  { id: 'S051', name: 'Float Switch Sensor'                    },
  { id: 'S094', name: 'LM393 Speed Sensor (Slotted Optical)'  },
  { id: 'S099', name: 'KY-010 Optical Break-Beam Sensor'       },
  { id: 'S100', name: 'KY-036 Metal Touch Sensor Module'       },
  { id: 'S101', name: 'KY-016 RGB LED Module'                  },
  { id: 'S102', name: 'KY-018 Photo Resistor (LDR) Module'     },
  { id: 'S103', name: 'KY-022 IR Receiver Module (38 kHz)'     },
  { id: 'S104', name: 'SR602 Mini PIR Motion Sensor (AM312)'   },
  { id: 'S109', name: 'NE555 Timer Module (Astable/Monostable)' },
];

/* ── State ───────────────────────────────────────────────── */
const S2 = {
  currentStep:        1,
  submitLock:         false,
  poolLoaded:         false,
  usingFallback:      false,   // true when GAS pool endpoint unavailable
  basicPool:          [],
  suggestedId:        null,
  suggestedName:      null,
  selectedSensorId:   null,
  selectedSensorName: null,
  teamData: {
    teamName:     '',
    leaderName:   '',
    leaderRegno:  '',
    leaderPhone:  '',
    leaderEmail:  '',
    member2Regno: '',
    member2Name:  '',
    member3Regno: '',
    member3Name:  '',
  },
};

/* ── DOM Helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── Boot ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initReveal();
  initStep1Form();
  initStep2();
  initStep3();
  initModals();
});

/* ── Sensor Name Normalization (mirrors GAS + app.js) ─────── */
function normalizeSensorName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase().replace(/[-_]/g, '').replace(/\s+/g, '').trim();
  const suffixes = ['sensor', 'module', 'detector', 'breakout', 'board', 'kit'];
  let changed = true;
  while (changed) {
    changed = false;
    for (const sfx of suffixes) {
      if (s.endsWith(sfx) && s.length - sfx.length >= 3) {
        s = s.slice(0, s.length - sfx.length);
        changed = true;
      }
    }
  }
  return s;
}

/* ════════════════════════════════════════════════════════════
   STEP 1 — TEAM DETAILS FORM
   ════════════════════════════════════════════════════════════ */
function initStep1Form() {
  const form = $('team-details-form');
  if (!form) return;

  // Duplicate register number check on blur
  $$('.member-regno').forEach(input => {
    input.addEventListener('blur', () => checkDuplicateRegNo(input));
    input.addEventListener('input', () => {
      const badge = $(`m${input.dataset.member}-badge`);
      if (badge) { badge.textContent = ''; badge.className = 'member-check-badge'; }
    });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    handleStep1Submit();
  });
}

function checkDuplicateRegNo(input) {
  const member = input.dataset.member;
  const badge  = $(`m${member}-badge`);
  if (!badge) return;

  const thisVal   = input.value.trim().toLowerCase();
  const leaderVal = ($('r2-leader-regno')?.value || '').trim().toLowerCase();

  const others = [...$$('.member-regno')]
    .filter(el => el !== input)
    .map(el => el.value.trim().toLowerCase())
    .filter(Boolean);

  if (!thisVal) { badge.textContent = ''; badge.className = 'member-check-badge'; return; }

  if (thisVal === leaderVal || others.includes(thisVal)) {
    badge.textContent = '⚠️ Duplicate register number within team';
    badge.className   = 'member-check-badge warn';
  } else {
    badge.textContent = '✓ OK';
    badge.className   = 'member-check-badge ok';
  }
}

function handleStep1Submit() {
  if (S2.submitLock) return;

  const fields = [
    { el: $('r2-team-name'),    msg: 'Team name is required.' },
    { el: $('r2-leader-name'),  msg: 'Leader name is required.' },
    { el: $('r2-leader-regno'), msg: 'Leader register number is required.' },
    { el: $('r2-leader-phone'), msg: 'Enter a valid 10-digit phone number.', pattern: /^\d{10}$/ },
    { el: $('r2-leader-email'), msg: 'Enter a valid email address.', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    { el: $('r2-m2-name'),      msg: 'Member 2 name is required.' },
    { el: $('r2-m2-regno'),     msg: 'Member 2 register number is required.' },
    { el: $('r2-m3-name'),      msg: 'Member 3 name is required.' },
    { el: $('r2-m3-regno'),     msg: 'Member 3 register number is required.' },
  ];

  if (!validateFields(fields)) return;

  // Check for duplicate register numbers within the team
  const regnos = [
    ($('r2-leader-regno').value || '').trim().toLowerCase(),
    ($('r2-m2-regno').value     || '').trim().toLowerCase(),
    ($('r2-m3-regno').value     || '').trim().toLowerCase(),
  ];
  const uniqueNos = new Set(regnos);
  if (uniqueNos.size !== regnos.length) {
    showToast('All 3 team members must have different register numbers.', 'error');
    return;
  }

  // Capture team data
  S2.teamData = {
    teamName:     $('r2-team-name').value.trim(),
    leaderName:   $('r2-leader-name').value.trim(),
    leaderRegno:  $('r2-leader-regno').value.trim(),
    leaderPhone:  $('r2-leader-phone').value.trim(),
    leaderEmail:  $('r2-leader-email').value.trim().toLowerCase(),
    member2Name:  $('r2-m2-name').value.trim(),
    member2Regno: $('r2-m2-regno').value.trim(),
    member3Name:  $('r2-m3-name').value.trim(),
    member3Regno: $('r2-m3-regno').value.trim(),
  };

  // Move to step 2
  goToStep(2);
  loadBasicSensorPool();
}

/* ════════════════════════════════════════════════════════════
   STEP 2 — SENSOR ASSIGNMENT
   ════════════════════════════════════════════════════════════ */
function initStep2() {
  $('step2-back-btn')?.addEventListener('click', () => goToStep(1));
  $('btn-keep-sensor')?.addEventListener('click', keepSuggested);
  $('btn-choose-another')?.addEventListener('click', showSearchPanel);
  $('ssd-change')?.addEventListener('click', () => {
    $('selected-sensor-display').style.display = 'none';
    $('sensor-action-btns').style.display = 'flex';
    showSearchPanel();
    S2.selectedSensorId = null; S2.selectedSensorName = null;
    setStep2NextEnabled(false);
  });
  $('step2-next-btn')?.addEventListener('click', handleStep2Next);
  initBasicSensorSearch();
}

async function loadBasicSensorPool() {
  // Reset UI
  $('ssc-loading').style.display        = 'flex';
  $('ssc-content').style.display        = 'none';
  $('ssc-unavail').style.display        = 'none';
  $('sensor-action-btns').style.display = 'none';
  $('basic-search-panel').style.display = 'none';
  $('selected-sensor-display').style.display = 'none';
  setStep2NextEnabled(false);
  S2.usingFallback = false;

  const claimedSet = new Set(
    (Array.isArray(window.CLAIMED_SENSORS_DATA) ? window.CLAIMED_SENSORS_DATA : []).map(c =>
      normalizeSensorName(typeof c === 'object' ? (c.normalizedName || c.name) : c)
    )
  );

  let pool = null, suggestedId = null, suggestedName = null;

  try {
    const res  = await fetch(`${CFG.GAS_URL}?action=getBasicSensorPool`, { cache: 'no-store' });
    const data = await res.json();

    // GAS must return a valid pool array; old GAS versions return { status: '...' }
    if (data.pool && Array.isArray(data.pool) && data.pool.length > 0) {
      pool = data.pool.map(s => {
        const norm = normalizeSensorName(s.name);
        return {
          ...s,
          available: claimedSet.has(norm) ? false : Boolean(s.available)
        };
      });
      const availSensors = pool.filter(s => s.available);
      if (data.suggestedId && availSensors.some(s => s.id === data.suggestedId)) {
        suggestedId   = data.suggestedId;
        suggestedName = data.suggestedName;
      } else if (availSensors.length > 0) {
        suggestedId   = availSensors[0].id;
        suggestedName = availSensors[0].name;
      } else {
        suggestedId   = null;
        suggestedName = null;
      }
    } else {
      // Old GAS or empty pool — fall through to client-side fallback
      throw new Error('Pool not in response — using fallback');
    }
  } catch (err) {
    // Network error OR old GAS (no pool endpoint) OR empty pool
    // Use client-side fallback; backend will do the real availability check on submit
    console.warn('[SENSORA 2nd] Using client-side sensor fallback:', err.message);
    S2.usingFallback = true;
    pool = BASIC_POOL_FALLBACK.map(s => {
      const norm = normalizeSensorName(s.name);
      return {
        id:             s.id,
        name:           s.name,
        normalizedName: norm,
        available:      !claimedSet.has(norm),
        allocCount:     0,
      };
    });
    const availSensors = pool.filter(s => s.available);
    if (availSensors.length > 0) {
      const pick = availSensors[Math.floor(Math.random() * Math.min(8, availSensors.length))];
      suggestedId   = pick.id;
      suggestedName = pick.name;
    } else {
      suggestedId   = null;
      suggestedName = null;
    }
  }

  S2.basicPool     = pool;
  S2.suggestedId   = suggestedId;
  S2.suggestedName = suggestedName;
  S2.poolLoaded    = true;

  $('ssc-loading').style.display = 'none';

  if (S2.suggestedId && S2.suggestedName) {
    $('ssc-name').textContent = S2.suggestedName;

    // Fallback notice
    const availEl = $('ssc-available');
    if (availEl) {
      availEl.textContent = S2.usingFallback
        ? '✓ Beginner Friendly  ·  Availability verified at submission'
        : '✓ Available  ·  ✓ Beginner Friendly';
      availEl.style.color = S2.usingFallback ? 'var(--gold)' : '#86efac';
    }

    $('ssc-content').style.display        = 'block';
    $('sensor-action-btns').style.display = 'flex';
    S2.selectedSensorId   = S2.suggestedId;
    S2.selectedSensorName = S2.suggestedName;
  } else {
    $('ssc-unavail').style.display = 'block';
  }

  renderBasicChips();
}

function keepSuggested() {
  if (!S2.suggestedId) return;
  S2.selectedSensorId   = S2.suggestedId;
  S2.selectedSensorName = S2.suggestedName;

  $('btn-keep-sensor').classList.add('selected');
  $('basic-search-panel').style.display = 'none';

  showSelectedSensor(S2.suggestedName);
  setStep2NextEnabled(true);
  showToast(`✅ "${S2.suggestedName}" selected!`, 'success');
}

function showSearchPanel() {
  $('basic-search-panel').style.display = 'block';
  $('sensor-action-btns').style.display = 'none';
  $('basic-sensor-search-input')?.focus();
}

function selectBasicSensor(id, name) {
  S2.selectedSensorId   = id;
  S2.selectedSensorName = name;
  $('basic-search-panel').style.display = 'none';
  showSelectedSensor(name);
  setStep2NextEnabled(true);
  // Update chips highlight
  renderBasicChips();
}

function showSelectedSensor(name) {
  $('ssd-name').textContent = name;
  $('selected-sensor-display').style.display = 'flex';
}

function setStep2NextEnabled(enabled) {
  const btn = $('step2-next-btn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '1' : '0.45';
}

function handleStep2Next() {
  if (!S2.selectedSensorId || !S2.selectedSensorName) {
    showToast('Please select a sensor before continuing.', 'error');
    return;
  }
  // Re-check availability locally before going to step 3
  const chosen = S2.basicPool.find(s => s.id === S2.selectedSensorId);
  if (chosen && !chosen.available) {
    showToast(`"${S2.selectedSensorName}" was just allocated to another team. Please choose another.`, 'error');
    S2.selectedSensorId = null; S2.selectedSensorName = null;
    setStep2NextEnabled(false);
    $('selected-sensor-display').style.display = 'none';
    $('sensor-action-btns').style.display = 'flex';
    return;
  }
  buildConfirmationCard();
  goToStep(3);
}

/* ── Basic Sensor Search Widget ──────────────────────────── */
function initBasicSensorSearch() {
  const input     = $('basic-sensor-search-input');
  const clearBtn  = $('basic-search-clear');
  const dropdown  = $('basic-results-dropdown');
  const list      = $('basic-results-list');
  if (!input) return;

  let debounce;
  let activeIdx = -1;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    clearBtn.style.display = q ? 'flex' : 'none';
    if (!q) { dropdown.style.display = 'none'; return; }
    debounce = setTimeout(() => renderSearchResults(q, list, dropdown), CFG.DEBOUNCE_MS);
  });

  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('.sensor-result-item');
    if (dropdown.style.display === 'none' || !items.length) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); updateActiveItem(items); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); updateActiveItem(items); }
    if (e.key === 'Enter')      { e.preventDefault(); if (activeIdx >= 0) items[activeIdx]?.click(); }
    if (e.key === 'Escape')     { dropdown.style.display = 'none'; }
  });

  clearBtn.addEventListener('click', () => {
    input.value = ''; clearBtn.style.display = 'none';
    dropdown.style.display = 'none'; input.focus();
    activeIdx = -1;
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#basic-search-panel')) dropdown.style.display = 'none';
  });

  function renderSearchResults(q, list, dropdown) {
    const ql = q.toLowerCase();
    const matches = S2.basicPool.filter(s => {
      const text = (s.name + ' ' + (s.id || '')).toLowerCase();
      return text.includes(ql);
    }).slice(0, CFG.MAX_RESULTS);

    list.innerHTML = '';
    activeIdx = -1;

    if (!matches.length) {
      list.innerHTML = `<li class="sensor-result-item sensor-result-item--no-match" style="pointer-events:none;">No results for "<em>${escHtml(q)}</em>"</li>`;
      dropdown.style.display = 'block';
      return;
    }

    matches.forEach(s => {
      const li = document.createElement('li');
      li.className = `sensor-result-item${s.available ? '' : ' sensor-result-item--claimed'}`;
      li.setAttribute('role', 'option');
      li.innerHTML = `
        <span class="sri-icon">${s.available ? '○' : '🔒'}</span>
        <span class="sri-name">${escHtml(s.name)}</span>
        ${s.available
          ? `<span class="sri-price" style="color:#86efac;font-size:0.75rem;">✓ Available</span>`
          : `<span class="sri-taken">Allocated</span>`}
      `;
      if (s.available) {
        li.addEventListener('click', () => {
          input.value = s.name;
          clearBtn.style.display = 'flex';
          dropdown.style.display = 'none';
          selectBasicSensor(s.id, s.name);
        });
      }
      list.appendChild(li);
    });
    dropdown.style.display = 'block';
  }

  function updateActiveItem(items) {
    items.forEach((el, i) => el.classList.toggle('sensor-result-item--active', i === activeIdx));
  }
}

/* ── Render Chip Grid ────────────────────────────────────── */
function renderBasicChips() {
  const container = $('bsp-chips');
  if (!container) return;
  container.innerHTML = '';

  const avail   = S2.basicPool.filter(s => s.available);
  const unavail = S2.basicPool.filter(s => !s.available);

  // Show available first, then taken (greyed)
  [...avail, ...unavail].forEach(s => {
    const chip = document.createElement('span');
    chip.className = `sensor-chip${s.available ? '' : ' taken'}${s.id === S2.selectedSensorId ? ' selected' : ''}`;
    chip.innerHTML = `<span class="chip-icon">${s.available ? '○' : '🔒'}</span>${escHtml(s.name)}`;
    if (s.available) {
      chip.addEventListener('click', () => selectBasicSensor(s.id, s.name));
    }
    container.appendChild(chip);
  });

  if (avail.length === 0) {
    container.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);padding:8px 0;">All basic sensors are currently allocated. Please contact the coordinator.</p>`;
  }
}

/* ════════════════════════════════════════════════════════════
   STEP 3 — CONFIRM
   ════════════════════════════════════════════════════════════ */
function initStep3() {
  $('step3-back-btn')?.addEventListener('click', () => goToStep(2));
  $('step3-confirm-btn')?.addEventListener('click', handleFinalSubmit);
}

function buildConfirmationCard() {
  const d   = S2.teamData;
  const card = $('confirmation-card');
  if (!card) return;
  card.innerHTML = `
    <div class="cc-section">
      <div class="cc-title">🏷️ Team</div>
      <div class="cc-row"><span class="cc-key">Team Name</span><span class="cc-val">${escHtml(d.teamName)}</span></div>
    </div>
    <div class="cc-section">
      <div class="cc-title">🌟 Team Leader</div>
      <div class="cc-row"><span class="cc-key">Name</span><span class="cc-val">${escHtml(d.leaderName)}</span></div>
      <div class="cc-row"><span class="cc-key">Reg No.</span><span class="cc-val">${escHtml(d.leaderRegno)}</span></div>
      <div class="cc-row"><span class="cc-key">Phone</span><span class="cc-val">${escHtml(d.leaderPhone)}</span></div>
      <div class="cc-row"><span class="cc-key">Email</span><span class="cc-val">${escHtml(d.leaderEmail)}</span></div>
    </div>
    <div class="cc-section">
      <div class="cc-title">👥 Members</div>
      <div class="cc-row"><span class="cc-key">Member 2</span><span class="cc-val">${escHtml(d.member2Name)} &nbsp;·&nbsp; ${escHtml(d.member2Regno)}</span></div>
      <div class="cc-row"><span class="cc-key">Member 3</span><span class="cc-val">${escHtml(d.member3Name)} &nbsp;·&nbsp; ${escHtml(d.member3Regno)}</span></div>
    </div>
    <div class="cc-section">
      <div class="cc-title">🔬 Selected Sensor</div>
      <div class="cc-sensor-name">${escHtml(S2.selectedSensorName || '—')}</div>
      <div class="cc-row" style="margin-top:6px;"><span class="cc-key">Sensor ID</span><span class="cc-val">${escHtml(S2.selectedSensorId || '—')}</span></div>
    </div>
    <div class="cc-row" style="margin-top:4px;font-size:0.8rem;color:var(--text-subtle);">
      <span class="cc-key">Year</span><span class="cc-val">2nd Year</span>
    </div>
  `;
}

async function handleFinalSubmit() {
  if (S2.submitLock) return;
  if (!S2.selectedSensorId || !S2.selectedSensorName) {
    showToast('No sensor selected. Please go back and select a sensor.', 'error');
    return;
  }

  const btn = $('step3-confirm-btn');
  setLoading(btn, true);
  S2.submitLock = true;

  try {
    // ── Step A: Fresh pool check (skip when using client-side fallback) ──
    if (!S2.usingFallback && S2.basicPool.length > 0) {
      let freshPool = [...S2.basicPool];
      try {
        const res  = await fetch(`${CFG.GAS_URL}?action=getBasicSensorPool`, { cache: 'no-store' });
        const data = await res.json();
        if (data.pool && Array.isArray(data.pool)) {
          freshPool = data.pool;
          S2.basicPool = freshPool;
        }
      } catch (_) { /* network hiccup — GAS backend will guard on write */ }

      const chosenInFresh = freshPool.find(s => s.id === S2.selectedSensorId);
      if (chosenInFresh && !chosenInFresh.available) {
        showToast(`"${S2.selectedSensorName}" was just taken. Please go back and choose another sensor.`, 'error');
        S2.selectedSensorId = null; S2.selectedSensorName = null;
        S2.submitLock = false;
        setLoading(btn, false);
        goToStep(2);
        loadBasicSensorPool();
        return;
      }
    }

    // ── Step B: POST to GAS ──
    const payload = {
      type:         'team2nd',
      teamName:     S2.teamData.teamName,
      leaderName:   S2.teamData.leaderName,
      leaderRegno:  S2.teamData.leaderRegno,
      leaderPhone:  S2.teamData.leaderPhone,
      leaderEmail:  S2.teamData.leaderEmail,
      member2Name:  S2.teamData.member2Name,
      member2Regno: S2.teamData.member2Regno,
      member3Name:  S2.teamData.member3Name,
      member3Regno: S2.teamData.member3Regno,
      sensorId:     S2.selectedSensorId,
      sensorName:   S2.selectedSensorName,
    };

    // Note: GAS via no-cors — response not readable; we generate display ID client-side.
    // The server-side GAS does the authoritative save with its own ID.
    await fetch(CFG.GAS_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
    });

    // ── Step C: Generate display ID ──
    const displayId = `SF2-2026-${String(Math.floor(10000 + Math.random() * 90000))}`;

    // ── Step D: Update local pool ──
    S2.basicPool = S2.basicPool.map(s =>
      s.id === S2.selectedSensorId ? { ...s, available: false } : s
    );

    // ── Step E: Show success modal ──
    showSuccessModal(displayId);

  } catch (err) {
    showErrorModal('Submission failed. Please check your connection and try again.\n\nIf the issue persists, note down your details and contact the coordinator.');
    console.error('[SENSORA 2nd] Submit error:', err);
  } finally {
    setLoading(btn, false);
    S2.submitLock = false;
  }
}

/* ════════════════════════════════════════════════════════════
   WIZARD NAVIGATION
   ════════════════════════════════════════════════════════════ */
function goToStep(stepNum) {
  S2.currentStep = stepNum;

  // Update step panels
  $$('.wizard-step').forEach(el => el.classList.remove('active'));
  const target = $(`step${stepNum}`);
  if (target) { target.classList.add('active'); }

  // Update step indicator dots
  $$('.step-dot').forEach(dot => {
    const n = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'done');
    if (n < stepNum)  dot.classList.add('done');
    if (n === stepNum) dot.classList.add('active');
  });

  // Update step lines
  $$('.step-line').forEach((line, i) => {
    line.classList.toggle('done', i + 1 < stepNum);
  });

  // Scroll to top of form
  document.getElementById('reg2nd-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ════════════════════════════════════════════════════════════
   MODALS
   ════════════════════════════════════════════════════════════ */
function initModals() {
  ['success-modal-overlay', 'error-modal-overlay'].forEach(id => {
    const overlay = $(id);
    if (!overlay) return;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
    overlay.querySelectorAll('.modal-close, .modal-ok').forEach(btn => {
      btn.addEventListener('click', () => overlay.classList.remove('open'));
    });
  });

  $('r2-modal-ok')?.addEventListener('click', () => {
    // Reset wizard for a new registration
    resetWizard();
  });

  $('r2-copy-btn')?.addEventListener('click', function () {
    const code = $('r2-modal-regid')?.textContent || '';
    navigator.clipboard.writeText(code).then(() => {
      this.textContent = '✓ Copied!';
      this.classList.add('copied');
      setTimeout(() => { this.textContent = '⎘ Copy ID'; this.classList.remove('copied'); }, 2500);
    }).catch(() => showToast('Copy: ' + code, 'info'));
  });
}

function showSuccessModal(regId) {
  $('r2-modal-regid').textContent = regId;
  $('r2-modal-summary').innerHTML = `
    <strong>Team:</strong> ${escHtml(S2.teamData.teamName)}<br>
    <strong>Leader:</strong> ${escHtml(S2.teamData.leaderName)} &nbsp;(${escHtml(S2.teamData.leaderRegno)})<br>
    <strong>Members:</strong>
      ${escHtml(S2.teamData.member2Name)} (${escHtml(S2.teamData.member2Regno)}),
      ${escHtml(S2.teamData.member3Name)} (${escHtml(S2.teamData.member3Regno)})<br>
    <strong>Sensor:</strong> ${escHtml(S2.selectedSensorName || '—')}<br>
    <strong>Year:</strong> 2nd Year
  `;
  $('success-modal-overlay').classList.add('open');
}

function showErrorModal(message) {
  $('r2-error-msg').innerHTML = escHtml(message).replace(/\n/g, '<br>');
  $('error-modal-overlay').classList.add('open');
}

/* ════════════════════════════════════════════════════════════
   RESET WIZARD (after successful registration)
   ════════════════════════════════════════════════════════════ */
function resetWizard() {
  $('success-modal-overlay').classList.remove('open');
  $('team-details-form')?.reset();
  $$('.member-check-badge').forEach(b => { b.textContent = ''; b.className = 'member-check-badge'; });
  $$('.error-text').forEach(e => { e.textContent = ''; });
  $$('.form-group').forEach(g => g.classList.remove('has-error'));

  S2.selectedSensorId   = null;
  S2.selectedSensorName = null;
  S2.suggestedId        = null;
  S2.suggestedName      = null;
  S2.basicPool          = [];
  S2.poolLoaded         = false;
  S2.usingFallback      = false;
  S2.teamData           = {};

  goToStep(1);
}

/* ════════════════════════════════════════════════════════════
   FORM VALIDATION
   ════════════════════════════════════════════════════════════ */
function validateFields(rules) {
  let valid = true, firstInvalid = null;
  rules.forEach(({ el, msg, pattern }) => {
    if (!el) return;
    const group = el.closest('.form-group');
    const errEl = group?.querySelector('.error-text');
    const val   = el.value?.trim() || '';
    const pass  = val !== '' && (!pattern || pattern.test(val));
    if (!pass) {
      if (valid) firstInvalid = el;
      valid = false;
      group?.classList.add('has-error');
      el.classList.add('error');
      if (errEl) errEl.textContent = msg;
    } else {
      group?.classList.remove('has-error');
      el.classList.remove('error');
      if (errEl) errEl.textContent = '';
    }
  });
  if (firstInvalid) firstInvalid.focus();
  return valid;
}

// Clear validation state on user input
document.addEventListener('input', e => {
  if (e.target.matches('.form-input, .form-select')) {
    e.target.closest('.form-group')?.classList.remove('has-error');
    e.target.classList.remove('error');
    const errEl = e.target.closest('.form-group')?.querySelector('.error-text');
    if (errEl) errEl.textContent = '';
  }
}, { passive: true });

/* ════════════════════════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════════════════════════ */
function setLoading(btn, state) {
  if (!btn) return;
  btn.disabled = state;
  btn.classList.toggle('loading', state);
}

function showToast(message, type = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 4500);
}

function initReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  $$('.reveal').forEach(el => io.observe(el));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
