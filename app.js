/* ============================================================
   SENSORA 2K26 — Main Application (v2.0)
   ECE Activity Club · PTLCNCE · Kanchipuram
   113-sensor catalog · Searchable sensor widget
   Individual-first team gate · Global availability check
   Race-condition-proof · Custom sensor support
   ============================================================ */

'use strict';

/* ── Configuration ───────────────────────────────────────── */
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbznsdmc0JjvnZo9W02GWF3PEv6zUBSZKVLkZmLWomW7-D42jHAHUV1DvRiiGLHGVj_J/exec',
  // Event Date (Confirmed: 28th) — Default 28 September 2026 (change to 2026-10-28 if October)
  FEST_DATE: new Date('2026-09-28T09:00:00+05:30'),
  ADMIN_PASS: 'SENSORA@2K26',
  TEAM_CODE_PREFIX: 'SENSORA26',
  TEAM_SIZE: 3,           // Fixed team size — exactly 3 members
  SENSOR_SEARCH_DEBOUNCE: 200,   // ms
  SENSOR_MAX_RESULTS: 10,        // max dropdown suggestions
};

/* ── State ───────────────────────────────────────────────── */
const STATE = {
  sensors: [],
  themes: [],
  // claimedSensors: array of {name, normalizedName, year, status}
  claimedSensors: [],
  claimedNormalized: new Set(),  // fast-lookup by normalized name
  filteredSensors: [],
  adminLoggedIn: false,
  submitLock: false,
  // Individual-first gate
  individualRegComplete: false,
  currentRegId: null,           // Registration ID from backend after individual reg
  // Sensor search widget state
  sensorSearchQuery: '',
  selectedSensor: null,         // { name, id, category, isCustom }
  sensorAvailabilityChecking: false,
};

/* ── DOM helpers ─────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── Boot Sequence ───────────────────────────────────────── */
function boot() {
  initDataSync();
  initNavbar();
  initHero();
  renderThemes();
  renderCatalog();
  initCatalogControls();
  initRegistration();
  initAdmin();
  initReveal();
  checkAdminRoute();

  // Background network sync (non-blocking)
  syncDataFromNetwork();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ── Synchronous Data Initialization ─────────────────────── */
function initDataSync() {
  if (window.SENSORS_DATA && Array.isArray(window.SENSORS_DATA)) {
    STATE.sensors = [...window.SENSORS_DATA];
    STATE.filteredSensors = [...STATE.sensors];
  }
  if (window.THEMES_DATA && Array.isArray(window.THEMES_DATA)) {
    STATE.themes = [...window.THEMES_DATA];
  }
  if (window.CLAIMED_SENSORS_DATA && Array.isArray(window.CLAIMED_SENSORS_DATA)) {
    STATE.claimedSensors = [...window.CLAIMED_SENSORS_DATA];
    STATE.claimedNormalized = new Set(window.CLAIMED_SENSORS_DATA.map(c =>
      (typeof c === 'object' ? c.normalizedName : normalizeSensorName(c)) || ''
    ));
  }
}

/* ── Background Network Sync (Non-blocking) ───────────────── */
async function syncDataFromNetwork() {
  try {
    const [sensorsRes, themesRes] = await Promise.all([
      fetch('data/sensors.json').then(r => r.json()),
      fetch('data/themes.json').then(r => r.json()),
    ]);
    if (Array.isArray(sensorsRes) && sensorsRes.length > 0) {
      STATE.sensors = sensorsRes;
      STATE.filteredSensors = [...STATE.sensors];
      renderCatalog();
      initCatalogControls();
    }
    if (Array.isArray(themesRes) && themesRes.length > 0) {
      STATE.themes = themesRes;
      renderThemes();
    }
  } catch (_) {
    // Offline or file:/// — standalone data is already active
  }

  fetchClaimedSensors();
}

async function fetchClaimedSensors() {
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=getClaimed`, { cache: 'no-store' });
    const data = await res.json();
    if (data.claimed && Array.isArray(data.claimed)) {
      // Merge live backend claims with pre-registered sensor list
      const base = Array.isArray(window.CLAIMED_SENSORS_DATA) ? window.CLAIMED_SENSORS_DATA : [];
      const combined = [...base, ...data.claimed];
      const seen = new Set();
      const unique = [];
      combined.forEach(c => {
        const norm = (typeof c === 'object' ? c.normalizedName : normalizeSensorName(c)) || '';
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          unique.push(c);
        }
      });
      STATE.claimedSensors = unique;
      STATE.claimedNormalized = seen;
    }
  } catch (_) {
    // GAS GET failed or offline: pre-registered claimed list remains safely active
  }
}

/* ── Sensor Name Normalization (client-side mirror of GAS) ── */
/**
 * Normalize a sensor name for duplicate detection.
 * Must stay in sync with normalizeSensor() in google-apps-script.gs
 */
function normalizeSensorName(name) {
  if (!name) return '';
  let s = String(name)
    .toLowerCase()
    .replace(/[-_]/g, '')
    .replace(/\s+/g, '')
    .trim();

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

/* ── Check sensor availability client-side ────────────────── */
function isSensorClaimed(sensorName) {
  const norm = normalizeSensorName(sensorName);
  if (STATE.claimedNormalized.has(norm)) return true;
  // Also do a plain case-insensitive check (fallback for old data format)
  const lower = sensorName.toLowerCase().trim();
  return STATE.claimedSensors.some(c => {
    const cn = typeof c === 'object' ? c.name : c;
    return (cn || '').toLowerCase().trim() === lower;
  });
}

/* ── Navbar ──────────────────────────────────────────────── */
function initNavbar() {
  const navbar     = $('navbar');
  const hamburger  = $('hamburger');
  const mobileMenu = $('mobile-menu');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
    mobileMenu.classList.toggle('open', isOpen);
  });

  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileMenu.classList.remove('open');
    });
  });

  // Active section highlight
  const sections = [
    'hero','about','highlights','participate','dates',
    'schedule','themes','catalog','prizes','registration','contact',
  ];
  const navLinks = $$('.nav-links a[data-section], #mobile-menu a[data-section]');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        navLinks.forEach(a => {
          a.classList.toggle('active', a.dataset.section === e.target.id);
        });
      }
    });
  }, { threshold: 0.35 });
  sections.forEach(id => { const el = $(id); if (el) observer.observe(el); });
}

/* ── Hero Countdown ──────────────────────────────────────── */
function initHero() {
  const IDS = ['cd-days', 'cd-hours', 'cd-mins', 'cd-secs'];

  if (!CONFIG.FEST_DATE) {
    IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.textContent = '--';
      el.style.fontSize       = 'clamp(1.4rem,3vw,2.2rem)';
      el.style.letterSpacing  = '0.08em';
    });
    const cdEl = document.querySelector('.countdown');
    if (cdEl) {
      const notice = document.createElement('p');
      notice.style.cssText =
        'font-size:0.78rem;color:var(--gold);letter-spacing:0.1em;' +
        'text-transform:uppercase;margin-top:10px;opacity:0.8;';
      notice.textContent = '⏳ Event date to be announced soon';
      cdEl.insertAdjacentElement('afterend', notice);
    }
    return;
  }

  const pad = n => String(n).padStart(2, '0');
  const set = (id, v) => { const el = $(id); if (el) el.textContent = pad(v); };

  function tick() {
    const diff = CONFIG.FEST_DATE - Date.now();
    if (diff <= 0) {
      IDS.forEach(id => { const el = $(id); if (el) el.textContent = '00'; });
      return;
    }
    set('cd-days',  Math.floor(diff / 86400000));
    set('cd-hours', Math.floor((diff % 86400000) / 3600000));
    set('cd-mins',  Math.floor((diff % 3600000)  / 60000));
    set('cd-secs',  Math.floor((diff % 60000)    / 1000));
  }
  tick();
  setInterval(tick, 1000);
}

/* ── Render Themes ───────────────────────────────────────── */
function renderThemes() {
  const grid = $('themes-grid');
  if (!grid) return;
  grid.innerHTML = STATE.themes.map(t => `
    <div class="theme-card reveal" style="--tc:${escHtml(t.color)}">
      <span class="theme-icon">${t.icon}</span>
      <div class="theme-name">${escHtml(t.name)}</div>
      <div class="theme-desc">${escHtml(t.description)}</div>
      <div class="theme-cats">
        ${t.categories.map(c => `<span class="cat-chip">${escHtml(c)}</span>`).join('')}
      </div>
    </div>
  `).join('');
  observeReveal(grid.querySelectorAll('.reveal'));
}

/* ── Render Catalog ──────────────────────────────────────── */
function renderCatalog(sensors) {
  const grid    = $('sensor-grid');
  const countEl = $('catalog-count');
  const list    = sensors || STATE.filteredSensors;

  if (countEl) countEl.textContent = `${list.length} sensor${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="no-results">
        <div class="nr-icon">🔍</div>
        <p>No sensors match your search. Try a different keyword.</p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach(s => {
    const card = document.createElement('div');
    card.className = 'sensor-card reveal';
    card.setAttribute('role', 'listitem');
    const isNew = s.source === 'new';
    card.innerHTML = `
      <div class="sensor-card-head">
        <div class="sensor-name">${escHtml(s.name)}${isNew ? '<span class="badge-new">NEW</span>' : ''}</div>
        <div class="sensor-price">₹${Number(s.price).toLocaleString('en-IN')}</div>
      </div>
      <div class="sensor-cat">${escHtml(s.category)}</div>
      <div class="sensor-desc">${escHtml(s.description)}</div>
      <div class="sensor-id">${escHtml(s.id)}</div>
    `;
    frag.appendChild(card);
  });
  grid.innerHTML = '';
  grid.appendChild(frag);
  observeReveal(grid.querySelectorAll('.reveal'));
}

/* ── Catalog Controls ────────────────────────────────────── */
function initCatalogControls() {
  const search = $('sensor-search');
  const filter = $('category-filter');

  // Populate category dropdown
  const categories = [...new Set(STATE.sensors.map(s => s.category))].sort();
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    filter.appendChild(opt);
  });

  let debounce;
  function applyFilter() {
    const q   = (search.value || '').toLowerCase().trim();
    const cat = filter.value;
    STATE.filteredSensors = STATE.sensors.filter(s => {
      const matchQ = !q  || s.name.toLowerCase().includes(q) ||
                            s.category.toLowerCase().includes(q) ||
                            s.description.toLowerCase().includes(q) ||
                            (s.keywords || '').toLowerCase().includes(q) ||
                            s.id.toLowerCase().includes(q);
      const matchC = !cat || s.category === cat;
      return matchQ && matchC;
    });
    renderCatalog();
  }

  search.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(applyFilter, 200); });
  filter.addEventListener('change', applyFilter);
}

/* ── Registration ────────────────────────────────────────── */
function initRegistration() {
  $$('.reg-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.reg-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      $$('.reg-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panel = $(tab.dataset.tab + '-panel');
      if (panel) panel.classList.add('active');
    });
  });

  initSensorSearchWidget();
  $('individual-form').addEventListener('submit', handleIndividualSubmit);

  initTeamForm();
  $('team-form').addEventListener('submit', handleTeamSubmit);
}

/* ── Sensor Search Widget ────────────────────────────────── */
function initSensorSearchWidget() {
  const searchInput   = $('sensor-search-input');
  const clearBtn      = $('sensor-search-clear');
  const dropdown      = $('sensor-results-dropdown');
  const resultsList   = $('sensor-results-list');
  const statusBadge   = $('sensor-status-badge');
  const customNotice  = $('sensor-custom-notice');
  const hiddenInput   = $('individual-sensor');
  const errorText     = $('sensor-error-text');

  if (!searchInput) return;

  // Prevent taps/scrolls inside dropdown from blurring input on touch devices
  if (dropdown) {
    dropdown.addEventListener('mousedown', e => e.preventDefault());
  }

  let debounceTimer;
  let activeIndex = -1;

  // Search handler
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value;
    if (!q.trim()) {
      clearSensorSelection(false);
      performSensorSearch('');
      return;
    }
    debounceTimer = setTimeout(() => performSensorSearch(q), CONFIG.SENSOR_SEARCH_DEBOUNCE);
  });

  // Focus & click handlers — show options immediately on interaction
  searchInput.addEventListener('focus', () => {
    performSensorSearch(searchInput.value);
  });

  searchInput.addEventListener('click', () => {
    if (dropdown.style.display === 'none') {
      performSensorSearch(searchInput.value);
    }
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', e => {
    const items = resultsList.querySelectorAll('.sensor-result-item');
    if (dropdown.style.display === 'none' || items.length === 0) {
      if (e.key === 'Escape') clearSensorSelection(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].click();
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  // Clear button
  clearBtn.addEventListener('click', () => clearSensorSelection(true));

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#sensor-search-group')) hideDropdown();
  });

  function performSensorSearch(query) {
    const raw = (query || '').trim();
    const q = raw.toLowerCase();
    const norm = normalizeSensorName(raw);

    // If query is empty, show initial catalog sensors as recommendations
    const matches = q
      ? STATE.sensors.filter(s => {
          const terms = [s.name, s.keywords || '', s.id, s.category, s.description];
          return terms.some(t => t.toLowerCase().includes(q));
        }).slice(0, CONFIG.SENSOR_MAX_RESULTS)
      : STATE.sensors.slice(0, CONFIG.SENSOR_MAX_RESULTS);

    // Build results list
    resultsList.innerHTML = '';
    activeIndex = -1;

    if (matches.length > 0) {
      matches.forEach(s => {
        const claimed = isSensorClaimed(s.name);
        const li = document.createElement('li');
        li.className = 'sensor-result-item' + (claimed ? ' sensor-result-item--claimed' : '');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.innerHTML = `
          <span class="sri-icon">${claimed ? '⚠️' : '○'}</span>
          <span class="sri-name">${escHtml(s.name)}</span>
          <span class="sri-cat">${escHtml(s.category)}</span>
          ${claimed ? '<span class="sri-taken">Already Registered</span>' : `<span class="sri-price">₹${s.price}</span>`}
        `;
        li.addEventListener('mousedown', e => e.preventDefault());
        li.addEventListener('click', () => {
          if (claimed) {
            showSensorUnavailable(s.name);
          } else {
            selectSensor({ name: s.name, id: s.id, category: s.category, isCustom: false });
          }
        });
        resultsList.appendChild(li);
      });

      // "Use custom entry" option at bottom if typed text doesn't exactly match
      if (raw.length >= 3) {
        const exactMatch = STATE.sensors.some(s => normalizeSensorName(s.name) === norm);
        if (!exactMatch) {
          addCustomSensorOption(resultsList, raw);
        }
      }
    } else {
      // No catalog matches — offer custom entry
      const li = document.createElement('li');
      li.className = 'sensor-result-item sensor-result-item--no-match';
      li.innerHTML = `
        <span class="sri-icon">🔎</span>
        <span class="sri-name">No catalog match for "<em>${escHtml(raw)}</em>"</span>
      `;
      li.setAttribute('role', 'option');
      resultsList.appendChild(li);
      if (raw.length >= 2) addCustomSensorOption(resultsList, raw);
    }

    showDropdown();
  }

  function addCustomSensorOption(list, query) {
    const li = document.createElement('li');
    li.className = 'sensor-result-item sensor-result-item--custom';
    li.setAttribute('role', 'option');
    li.innerHTML = `
      <span class="sri-icon">✏️</span>
      <span class="sri-name">Use "<strong>${escHtml(query)}</strong>" as custom sensor</span>
      <span class="sri-cat">Not in catalog</span>
    `;
    li.addEventListener('mousedown', e => e.preventDefault());
    li.addEventListener('click', () => {
      selectCustomSensor(query);
    });
    list.appendChild(li);
  }

  function updateActiveItem(items) {
    items.forEach((el, i) => {
      el.classList.toggle('sensor-result-item--active', i === activeIndex);
      el.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
    });
  }

  function showDropdown() {
    dropdown.style.display = 'block';
    searchInput.setAttribute('aria-expanded', 'true');
  }

  function hideDropdown() {
    dropdown.style.display = 'none';
    searchInput.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }

  /* ── Select a catalog sensor ── */
  function selectSensor(sensor) {
    STATE.selectedSensor = sensor;
    hiddenInput.value = sensor.name;
    searchInput.value = sensor.name;
    clearBtn.style.display = 'flex';
    hideDropdown();
    if (errorText) { errorText.textContent = ''; errorText.closest('.form-group')?.classList.remove('has-error'); }

    // Show availability badge
    const claimed = isSensorClaimed(sensor.name);
    if (claimed) {
      showSensorUnavailable(sensor.name);
    } else {
      statusBadge.style.display = 'flex';
      statusBadge.className = 'sensor-status-badge sensor-status-badge--ok';
      statusBadge.innerHTML = `<span>✅</span> <span><strong>${escHtml(sensor.name)}</strong> — Status: Available</span>`;
      customNotice.style.display = 'none';
    }
  }

  function showSensorUnavailable(name) {
    STATE.selectedSensor = null;
    hiddenInput.value = '';
    statusBadge.style.display = 'flex';
    statusBadge.className = 'sensor-status-badge sensor-status-badge--taken';
    statusBadge.innerHTML = `<span>⚠️</span> <span><strong>${escHtml(name)}</strong> — Already registered by another participant. Please choose another sensor.</span>`;
    customNotice.style.display = 'none';
    searchInput.value = '';
    clearBtn.style.display = 'none';
  }

  /* ── Select a custom (non-catalog) sensor ── */
  async function selectCustomSensor(query) {
    hideDropdown();
    STATE.selectedSensor = null;
    hiddenInput.value = '';
    statusBadge.style.display = 'none';

    // Show "not in catalog" notice
    customNotice.style.display = 'flex';
    customNotice.querySelector('.scn-text').textContent =
      `"${query}" is not in the current catalog. Checking availability against all existing registrations…`;

    searchInput.value = query;
    clearBtn.style.display = 'flex';
    STATE.sensorAvailabilityChecking = true;

    // Client-side quick check first
    const normQuery = normalizeSensorName(query);
    const claimedLocally = STATE.claimedNormalized.has(normQuery);

    if (claimedLocally) {
      customNotice.style.display = 'none';
      showSensorUnavailable(query);
      STATE.sensorAvailabilityChecking = false;
      return;
    }

    // Refresh claimed list from backend for freshness
    try {
      await fetchClaimedSensors();
      const claimedAfterRefresh = STATE.claimedNormalized.has(normQuery);
      if (claimedAfterRefresh) {
        customNotice.style.display = 'none';
        showSensorUnavailable(query);
        STATE.sensorAvailabilityChecking = false;
        return;
      }
    } catch (_) { /* silent */ }

    // Available — mark as custom sensor
    STATE.selectedSensor = { name: query, id: null, category: 'Custom', isCustom: true };
    hiddenInput.value = query;

    customNotice.querySelector('.scn-text').innerHTML =
      `<strong>✅ No existing registration found for "${escHtml(query)}".</strong><br>` +
      `You may continue with this sensor. A custom sensor request will be recorded for admin review.`;

    statusBadge.style.display = 'none';
    if (errorText) { errorText.textContent = ''; errorText.closest('.form-group')?.classList.remove('has-error'); }
    STATE.sensorAvailabilityChecking = false;
  }

  /* ── Clear selection ── */
  function clearSensorSelection(focusInput) {
    STATE.selectedSensor = null;
    hiddenInput.value = '';
    searchInput.value = '';
    clearBtn.style.display = 'none';
    statusBadge.style.display = 'none';
    customNotice.style.display = 'none';
    hideDropdown();
    if (focusInput) searchInput.focus();
  }

  // Make clearSensorSelection accessible to handleIndividualSubmit
  window._clearSensorSelection = clearSensorSelection;
}

/* ── Individual Submit — real-time availability check then POST ── */
async function handleIndividualSubmit(e) {
  e.preventDefault();
  if (STATE.submitLock) return;
  if (STATE.sensorAvailabilityChecking) {
    showToast('Please wait — checking sensor availability...', 'info');
    return;
  }

  const form   = e.target;
  const fields = {
    name:       $('ind-name'),
    regno:      $('ind-regno'),
    phone:      $('ind-phone'),
    email:      $('ind-email'),
    year:       $('ind-year'),
    department: $('ind-dept'),
  };

  // Validate standard fields
  const valid = validateForm([
    { el: fields.name,       msg: 'Full name is required.' },
    { el: fields.regno,      msg: 'Register number is required.' },
    { el: fields.phone,      msg: 'Enter a valid 10-digit mobile number.', pattern: /^\d{10}$/ },
    { el: fields.email,      msg: 'Enter a valid email address.', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    { el: fields.year,       msg: 'Please select your year.' },
    { el: fields.department, msg: 'Department is required.' },
  ]);

  // Validate sensor selection separately
  const sensorErrorEl = $('sensor-error-text');
  if (!STATE.selectedSensor || !STATE.selectedSensor.name) {
    if (sensorErrorEl) {
      sensorErrorEl.textContent = 'Please search and select a sensor.';
      $('sensor-search-group')?.classList.add('has-error');
    }
    $('sensor-search-input')?.focus();
    return;
  } else {
    if (sensorErrorEl) { sensorErrorEl.textContent = ''; }
    $('sensor-search-group')?.classList.remove('has-error');
  }

  if (!valid) return;

  const btn = form.querySelector('.btn-submit');
  setLoading(btn, true);
  STATE.submitLock = true;

  try {
    const sensorName = STATE.selectedSensor.name;
    const isCustom   = STATE.selectedSensor.isCustom;

    // ── Step 1: Fresh availability check from GAS ──
    try {
      await fetchClaimedSensors();
    } catch (_) {
      // Network issue on pre-check — continue; server-side GAS will guard
    }

    const normSensor = normalizeSensorName(sensorName);
    if (STATE.claimedNormalized.has(normSensor)) {
      showSensorConflictMessage(sensorName);
      return;
    }

    // ── Step 2: Build payload ──
    const payload = {
      type:        isCustom ? 'customSensor' : 'individual',
      name:        fields.name.value.trim(),
      regno:       fields.regno.value.trim(),
      phone:       fields.phone.value.trim(),
      email:       fields.email.value.trim(),
      year:        fields.year.value,
      department:  fields.department.value.trim(),
      sensor:      sensorName,
      requestedSensor: sensorName,  // for custom sensor requests
    };

    // ── Step 3: POST to GAS ──
    // NOTE: GAS deployed as web app with no-cors can't return readable body.
    // We use a two-call strategy:
    //  a) no-cors POST (fire-and-forget) — data saved
    //  b) for individual type, also POST normally to check response
    //     (this only works when same-origin proxy is used; otherwise rely on step 1)
    //
    // For this SPA (static hosting), we use no-cors for the POST and trust the
    // backend server-side lock + client-side pre-check.
    await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
    });

    // ── Step 4: Generate client-side reg ID (displayed to user) ──
    // The actual server-generated ID is in the sheet; we generate one for display
    const displayRegId = `REG-2026-${String(Math.floor(10000 + Math.random() * 90000))}`;
    STATE.currentRegId = displayRegId;

    // ── Step 5: Mark locally as claimed ──
    STATE.claimedNormalized.add(normSensor);
    STATE.claimedSensors.push({ name: sensorName, normalizedName: normSensor, year: fields.year.value, status: 'CONFIRMED' });

    // ── Step 6: Unlock team tab ──
    STATE.individualRegComplete = true;
    unlockTeamTab(displayRegId, payload);

    showSuccessModal('individual', { ...payload, sensor: sensorName, registrationId: displayRegId });
    form.reset();
    // Reset sensor widget
    if (window._clearSensorSelection) window._clearSensorSelection(false);
    showToast('Individual registration successful! 🎉 Team tab is now unlocked.', 'success');

  } catch (err) {
    showErrorModal('Submission failed. Please check your internet connection and try again.');
    console.error('[SENSORA] Individual submit error:', err);
  } finally {
    setLoading(btn, false);
    STATE.submitLock = false;
  }
}

function showSensorConflictMessage(sensorName) {
  // Update the sensor widget to show conflict
  const statusBadge  = $('sensor-status-badge');
  const customNotice = $('sensor-custom-notice');
  if (statusBadge) {
    statusBadge.style.display = 'flex';
    statusBadge.className = 'sensor-status-badge sensor-status-badge--taken';
    statusBadge.innerHTML = `<span>⚠️</span> <span><strong>${escHtml(sensorName)}</strong> was just registered by someone else. Please choose a different sensor.</span>`;
  }
  if (customNotice) customNotice.style.display = 'none';
  // Clear hidden value so form can't be resubmitted with it
  const hi = $('individual-sensor');
  if (hi) hi.value = '';
  STATE.selectedSensor = null;
  showToast(`"${sensorName}" was just claimed by another participant. Please choose a different sensor.`, 'error');
}

/* ── Unlock Team Tab after Individual Reg ─────────────────── */
function unlockTeamTab(regId, regData) {
  // Hide lock icon on team tab
  const lockIcon = $('team-tab-lock');
  if (lockIcon) lockIcon.style.display = 'none';

  // Show gate → form-card transition
  const gate     = $('team-gate-notice');
  const formCard = $('team-form-card');
  if (gate)     gate.style.display = 'none';
  if (formCard) formCard.style.display = 'block';

  // Show individual reg confirmation badge in team form
  const badge = $('ind-reg-badge');
  if (badge) {
    badge.innerHTML = `
      <span class="irb-icon">✅</span>
      <span class="irb-text">
        <strong>Individual Registration Confirmed</strong><br>
        ID: <code>${escHtml(regId)}</code> &nbsp;·&nbsp;
        Sensor: <strong>${escHtml(regData.sensor || '')}</strong>
      </span>
    `;
    badge.style.display = 'flex';
  }

  observeReveal(formCard?.querySelectorAll('.reveal') || []);
}

/* ── Team Form ───────────────────────────────────────────── */
function initTeamForm() {
  const membersList = $('members-list');
  const addBtn      = $('add-member-btn');

  // Team size is fixed at exactly 3 — hide the add button
  if (addBtn) addBtn.style.display = 'none';

  function createMemberRow(index) {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <input class="form-input member-input" type="text"
             placeholder="Member ${index} full name" maxlength="80"
             autocomplete="off" aria-label="Member ${index}">
    `;
    return row;
  }

  // Create exactly 3 member rows
  [1, 2, 3].forEach(i => membersList.appendChild(createMemberRow(i)));

  // Team sensor dropdowns — all 113 sensors
  ['team-sensor-1', 'team-sensor-2', 'team-sensor-3'].forEach((id, idx) => {
    const sel = $(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">— Select sensor ${idx + 1} —</option>`;
    STATE.sensors.forEach(s => {
      const opt = document.createElement('option');
      opt.value       = s.name;
      opt.textContent = `${s.name} (${s.category})`;
      sel.appendChild(opt);
    });
  });

  // Theme dropdown
  const themeSelect = $('team-theme');
  if (themeSelect) {
    themeSelect.innerHTML = '<option value="">— Select a theme —</option>';
    STATE.themes.forEach(t => {
      const opt = document.createElement('option');
      opt.value       = t.name;
      opt.textContent = `${t.icon}  ${t.name}`;
      themeSelect.appendChild(opt);
    });
  }
}

async function handleTeamSubmit(e) {
  e.preventDefault();
  if (STATE.submitLock) return;

  const form       = e.target;
  const teamName   = $('team-name').value.trim();
  const sensor1    = $('team-sensor-1').value;
  const sensor2    = $('team-sensor-2').value;
  const sensor3    = $('team-sensor-3').value;
  const theme      = $('team-theme').value;
  const projTitle  = $('team-project-title').value.trim();
  const members    = [...$$('#members-list .member-input')]
                       .map(i => i.value.trim())
                       .filter(Boolean);

  const errors = [];
  if (!teamName)                                    errors.push('Team name is required.');
  if (members.length !== CONFIG.TEAM_SIZE)          errors.push(`Exactly ${CONFIG.TEAM_SIZE} member names are required.`);
  if (!sensor1)                                     errors.push('Please select Sensor 1.');
  if (!sensor2)                                     errors.push('Please select Sensor 2.');
  if (!sensor3)                                     errors.push('Please select Sensor 3.');
  if (sensor1 && sensor2 && sensor1 === sensor2)    errors.push('Sensor 1 and Sensor 2 must be different.');
  if (sensor2 && sensor3 && sensor2 === sensor3)    errors.push('Sensor 2 and Sensor 3 must be different.');
  if (sensor1 && sensor3 && sensor1 === sensor3)    errors.push('Sensor 1 and Sensor 3 must be different.');
  if (!theme)                                       errors.push('Please select a theme.');
  if (!projTitle)                                   errors.push('Project title is required.');

  // Duplicate member names check
  const uniqueMembers = new Set(members.map(m => m.toLowerCase().trim()));
  if (uniqueMembers.size !== members.length)        errors.push('Each team member name must be unique.');

  if (errors.length > 0) {
    showErrorModal(errors.join('\n'));
    return;
  }

  const btn = form.querySelector('.btn-submit');
  setLoading(btn, true);
  STATE.submitLock = true;

  try {
    const entryCode = generateEntryCode();
    const payload   = {
      type:            'team',
      teamName,
      members:         members.join(', '),
      sensor1, sensor2, sensor3,
      theme,
      projectTitle:    projTitle,
      entryCode,
      individualRegId: STATE.currentRegId || '',
    };

    await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
    });

    showSuccessModal('team', payload);
    showToast('Team registered! 🚀', 'success');

    // Reset form but keep team form visible
    form.reset();
    const ml = $('members-list');
    ml.innerHTML = '';
    [1, 2, 3].forEach(i => {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.innerHTML = `<input class="form-input member-input" type="text" placeholder="Member ${i} full name" maxlength="80" autocomplete="off">`;
      ml.appendChild(row);
    });

  } catch (err) {
    showErrorModal('Submission failed. Please check your internet connection and try again.');
    console.error('[SENSORA] Team submit error:', err);
  } finally {
    setLoading(btn, false);
    STATE.submitLock = false;
  }
}

/* ── Entry Code Generator ────────────────────────────────── */
function generateEntryCode() {
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const ts   = Date.now().toString(36).slice(-4).toUpperCase();
  return `${CONFIG.TEAM_CODE_PREFIX}-${rand}${ts}`;
}

/* ── Admin ───────────────────────────────────────────────── */
function initAdmin() {
  const adminSection = $('admin');
  if (!adminSection) return;

  $('admin-login-form').addEventListener('submit', e => {
    e.preventDefault();
    const pass = ($('admin-pass').value || '').trim();
    if (pass.toUpperCase() === CONFIG.ADMIN_PASS.toUpperCase()) {
      STATE.adminLoggedIn = true;
      $('admin-gate').style.display      = 'none';
      $('admin-dashboard').style.display = 'block';
      $('admin-dashboard').classList.add('reveal', 'visible');
      loadAdminData();
    } else {
      showToast('Incorrect password. Please try again.', 'error');
      $('admin-pass').value = '';
      $('admin-pass').classList.add('error');
      setTimeout(() => $('admin-pass').classList.remove('error'), 2000);
    }
  });

  $$('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(t   => t.classList.remove('active'));
      $$('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = $('admin-' + tab.dataset.panel + '-panel');
      if (panel) panel.classList.add('active');
    });
  });

  $('admin-refresh').addEventListener('click', loadAdminData);
  window.addEventListener('hashchange', checkAdminRoute);
}

window.openAdminSection = function() {
  const adminSection = $('admin');
  if (adminSection) {
    adminSection.style.display = 'block';
    adminSection.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => $('admin-pass')?.focus(), 300);
  }
};

function checkAdminRoute() {
  const hasAdminQuery = window.location.search.includes('admin=1');
  const hasAdminHash  = window.location.hash.toLowerCase().includes('admin');
  if (hasAdminQuery || hasAdminHash) {
    window.openAdminSection();
  }
}

async function loadAdminData() {
  const btn = $('admin-refresh');
  if (btn) {
    btn.textContent = '⟳ Loading…';
    btn.disabled = true;
  }
  try {
    const res = await fetch(`${CONFIG.GAS_URL}?action=getAll`, { cache: 'no-store' });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      throw new Error('GAS returned invalid response. Make sure google-apps-script.gs is deployed.');
    }

    // Filter out blank/ghost rows
    const cleanRows = (rows) => (rows || []).filter(r => {
      const cells = Array.isArray(r) ? r : Object.values(r);
      return cells.some(c => String(c ?? '').trim().length > 0);
    });

    const indRows = cleanRows(data.individual);
    const teamRows = cleanRows(data.team);
    const customRows = cleanRows(data.custom);
    const syRows = cleanRows(data.secondYearTeams);

    // Render 3rd/4th year tables
    renderAdminTable('admin-individual-table', indRows, [
      'Timestamp', 'Name', 'Register No.', 'Phone', 'Email', 'Sensor Chosen',
      'Year', 'Department', 'Registration ID', 'Status',
    ]);
    renderAdminTable('admin-team-table', teamRows, [
      'Timestamp', 'Team Name', 'Members', 'Sensor 1', 'Sensor 2', 'Sensor 3',
      'Theme', 'Project Title', 'Entry Code', 'Ind. Reg ID',
    ]);
    renderCustomRequestsTable('admin-custom-table', customRows);

    // Render 2nd year teams
    render2ndYearTable('admin-secondyear-table', syRows, data.stats);

    // Update badges
    const ib  = $('individual-badge');
    const tb  = $('team-badge');
    const cb  = $('custom-badge');
    const syb = $('secondyear-badge');
    if (ib)  ib.textContent  = indRows.length;
    if (tb)  tb.textContent  = teamRows.length;
    if (cb)  cb.textContent  = customRows.length;
    if (syb) syb.textContent = syRows.length;

    // Update sensor stats
    if (data.stats) renderAdminStats(data.stats);

    showToast('Admin data refreshed successfully.', 'success');
  } catch (err) {
    showToast(
      'Could not load admin data: ' + (err.message || 'Please check network and GAS deployment.'),
      'error'
    );
    console.error('[SENSORA] Admin load error:', err);
  } finally {
    if (btn) {
      btn.textContent = '⟳ Refresh Data';
      btn.disabled = false;
    }
  }
}



function renderAdminStats(stats) {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('stat-total-num',     stats.total     || 113);
  set('stat-allocated-num', stats.allocated || 0);
  set('stat-available-num', stats.available || 0);
  set('stat-custom-num',    stats.pending   || 0);
  set('stat-3rd-num',       (stats.byYear && stats.byYear['3rd Year']) || 0);
  set('stat-4th-num',       (stats.byYear && stats.byYear['4th Year']) || 0);
  // 2nd Year teams stat card (main stats panel)
  if (stats.secondYear) {
    set('stat-2nd-num', stats.secondYear.teams || 0);
  }
}

function renderAdminTable(tableId, rows, headers) {
  const wrap = document.getElementById(tableId + '-wrap');
  if (!wrap) return;
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="no-results" style="padding:30px;"><p>No submissions yet.</p></div>';
    return;
  }
  const thead = `<tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>`;
  const tbody = rows.map(row =>
    `<tr>${(Array.isArray(row) ? row : Object.values(row))
      .map(cell => `<td>${escHtml(String(cell ?? ''))}</td>`)
      .join('')}</tr>`
  ).join('');
  wrap.innerHTML = `<table class="data-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function renderCustomRequestsTable(tableId, rows) {
  const wrap = document.getElementById(tableId + '-wrap');
  if (!wrap) return;
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="no-results" style="padding:30px;"><p>No custom sensor requests yet.</p></div>';
    return;
  }
  const headers = ['Timestamp', 'Name', 'Reg No.', 'Requested Sensor', 'Normalized', 'Year', 'Reg ID', 'Status', 'Admin Note', 'Actions'];
  const thead = `<tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>`;
  const tbody = rows.map((row, idx) => {
    const cells = Array.isArray(row) ? row : Object.values(row);
    const status = String(cells[7] || '').toUpperCase();
    const rowIdx = idx + 1;
    const actionBtns = (status === 'PENDING')
      ? `<div class="admin-action-btns">
           <button class="btn-admin-action btn-approve" onclick="adminActionCustom(${rowIdx},'approve')">✅ Approve</button>
           <button class="btn-admin-action btn-reject"  onclick="adminActionCustom(${rowIdx},'reject')">❌ Reject</button>
         </div>`
      : `<span style="color:var(--gold);font-size:0.8rem;">${escHtml(status)}</span>`;
    const rowHtml = cells.slice(0, 9).map(cell => `<td>${escHtml(String(cell ?? ''))}</td>`).join('');
    return `<tr>${rowHtml}<td>${actionBtns}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<table class="data-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

/* ── 2nd Year Teams Table ─────────────────────────────────── */
function render2ndYearTable(tableId, rows, stats) {
  const wrap     = document.getElementById(tableId + '-wrap');
  const statsBar = $('admin-2nd-stats');

  // Update mini stats bar inside the panel
  if (statsBar && stats && stats.secondYear) {
    const sy = stats.secondYear;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('a2s-teams',       sy.teams           || 0);
    set('a2s-students',    sy.students        || 0);
    set('a2s-basic-avail', sy.basicAvailable  || 0);
    set('a2s-basic-alloc', sy.basicAllocated  || 0);
    statsBar.style.display = 'flex';
  }

  if (!wrap) return;
  if (!rows || rows.length === 0) {
    wrap.innerHTML = '<div class="no-results" style="padding:30px;"><p>No 2nd year team registrations yet.</p></div>';
    return;
  }

  // Sheet columns: Timestamp(0) | RegID(1) | TeamName(2) | LeaderName(3) | LeaderRegNo(4)
  //   | LeaderPhone(5) | LeaderEmail(6) | M2RegNo(7) | M2Name(8) | M3RegNo(9) | M3Name(10)
  //   | SensorID(11) | SensorName(12) | Status(13)
  const headers = [
    'Timestamp', 'Reg ID', 'Team Name',
    'Leader', 'Leader Reg No',
    'M2 Reg No', 'M2 Name',
    'M3 Reg No', 'M3 Name',
    'Sensor ID', 'Sensor Name', 'Status'
  ];
  const thead = `<tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>`;

  const tbody = rows.map(row => {
    const r = Array.isArray(row) ? row : Object.values(row);
    const cols = [r[0],r[1],r[2],r[3],r[4], r[7],r[8], r[9],r[10], r[11],r[12],r[13]];
    const status = String(r[13] || '').toUpperCase();
    const statusStyle = status === 'CONFIRMED'
      ? 'color:#86efac;font-weight:700;'
      : (status === 'CANCELLED' ? 'color:#f87171;' : '');
    const cells = cols.slice(0, 11).map(cell =>
      `<td>${escHtml(String(cell ?? ''))}</td>`
    ).join('');
    return `<tr>${cells}<td style="${statusStyle}">${escHtml(status)}</td></tr>`;
  }).join('');

  wrap.innerHTML = `<table class="data-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

/* ── Admin Action: Approve/Reject Custom Sensor ─────────── */
window.adminActionCustom = async function(rowIndex, action) {

  if (!STATE.adminLoggedIn) return;
  const note = action === 'approve'
    ? (prompt('Optional: Add a note or canonical sensor name:') || '')
    : (prompt('Rejection reason (optional):') || '');

  try {
    await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify({
        type:      'adminAction',
        action,
        rowIndex,
        note,
        adminPass: CONFIG.ADMIN_PASS,
      }),
    });
    showToast(`Custom sensor request ${action}d. Refreshing data...`, 'success');
    setTimeout(loadAdminData, 1500);
  } catch (err) {
    showToast('Action failed. Please try again.', 'error');
  }
};

/* ── Modals ──────────────────────────────────────────────── */
function showSuccessModal(type, data) {
  const overlay = $('success-modal-overlay');
  const codeBox = $('modal-entry-code-box');
  const summary = $('modal-summary');
  const copyBtn = $('copy-code-btn');

  if (type === 'team') {
    $('modal-title').textContent    = 'Team Registered! 🚀';
    $('modal-subtitle').textContent = 'Your team submission was recorded. Save your entry code below.';
    codeBox.style.display  = 'block';
    if (copyBtn) copyBtn.style.display = 'flex';
    $('modal-code-value').textContent = data.entryCode;
    summary.innerHTML = `
      <strong>Team Name:</strong> ${escHtml(data.teamName)}<br>
      <strong>Theme:</strong> ${escHtml(data.theme)}<br>
      <strong>Project Title:</strong> ${escHtml(data.projectTitle)}<br>
      <strong>Sensors:</strong> ${[data.sensor1, data.sensor2, data.sensor3].map(escHtml).join(' · ')}<br>
      <strong>Members:</strong> ${escHtml(data.members)}
    `;
  } else {
    $('modal-title').textContent    = 'Registered! ✅';
    $('modal-subtitle').textContent = 'Your individual registration was successful. The Team tab is now unlocked!';
    codeBox.style.display  = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
    summary.innerHTML = `
      <strong>Name:</strong> ${escHtml(data.name)}<br>
      <strong>Register No.:</strong> ${escHtml(data.regno)}<br>
      <strong>Year:</strong> ${escHtml(data.year || '')}<br>
      <strong>Department:</strong> ${escHtml(data.department || '')}<br>
      <strong>Sensor Claimed:</strong> ${escHtml(data.sensor)}
      ${data.registrationId ? `<br><strong>Registration ID:</strong> <code>${escHtml(data.registrationId)}</code>` : ''}
    `;
  }
  overlay.classList.add('open');
}

function showErrorModal(message) {
  const overlay = $('error-modal-overlay');
  $('error-modal-message').innerHTML = escHtml(message).replace(/\n/g, '<br>');
  overlay.classList.add('open');
}

// Modal close bindings (run once on DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
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

  // Copy entry code button
  $('copy-code-btn')?.addEventListener('click', function () {
    const code = $('modal-code-value').textContent;
    navigator.clipboard.writeText(code).then(() => {
      this.textContent = '✓ Copied!';
      this.classList.add('copied');
      setTimeout(() => {
        this.textContent = '⎘ Copy Code';
        this.classList.remove('copied');
      }, 2500);
    }).catch(() => {
      showToast('Please copy the code manually: ' + code, 'info');
    });
  });
});

/* ── Toast Notifications ─────────────────────────────────── */
function showToast(message, type = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '•'}</span>
    <span>${escHtml(message)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 4000);
}

/* ── Form Validation ─────────────────────────────────────── */
function validateForm(rules) {
  let valid = true;
  let firstInvalid = null;
  rules.forEach(({ el, msg, pattern }) => {
    const group = el?.closest('.form-group');
    const errEl = group?.querySelector('.error-text');
    const val   = el?.value?.trim() || '';
    const pass  = val !== '' && (!pattern || pattern.test(val));
    if (!pass) {
      if (valid) firstInvalid = el; // track first invalid for focus
      valid = false;
      group?.classList.add('has-error');
      if (errEl) errEl.textContent = msg;
      el?.classList.add('error');
    } else {
      group?.classList.remove('has-error');
      el?.classList.remove('error');
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

/* ── Loading State ───────────────────────────────────────── */
function setLoading(btn, state) {
  if (!btn) return;
  btn.disabled = state;
  btn.classList.toggle('loading', state);
}

/* ── Scroll Reveal ───────────────────────────────────────── */
function initReveal() {
  observeReveal($$('.reveal'));
}

function observeReveal(els) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
  els.forEach(el => io.observe(el));
}

/* ── HTML Escape (XSS prevention) ───────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
