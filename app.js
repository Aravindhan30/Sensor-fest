/* ============================================================
   SENSORA 2K26 — Main Application
   ECE Activity Club · PTLCNCE · Kanchipuram
   High-performance, zero-lag, mobile-first SPA
   ============================================================ */

'use strict';

/* ── Configuration ───────────────────────────────────────── */
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbznsdmc0JjvnZo9W02GWF3PEv6zUBSZKVLkZmLWomW7-D42jHAHUV1DvRiiGLHGVj_J/exec',
  // Set FEST_DATE once confirmed. Example: new Date('2026-10-28T09:00:00+05:30')
  FEST_DATE: null,
  ADMIN_PASS: 'SENSORA@2K26',
  TEAM_CODE_PREFIX: 'SENSORA26',
  TEAM_SIZE: 3,           // Fixed team size — exactly 3 members
};

/* ── State ───────────────────────────────────────────────── */
const STATE = {
  sensors: [],
  themes: [],
  claimedSensors: new Set(),
  filteredSensors: [],
  adminLoggedIn: false,
  submitLock: false,
};

/* ── DOM helpers ─────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── Boot Sequence ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initNavbar();
  initHero();
  renderThemes();
  renderCatalog();
  initCatalogControls();
  initRegistration();
  initAdmin();
  initReveal();
  checkAdminRoute();
});

/* ── Data Loading ────────────────────────────────────────── */
async function loadData() {
  try {
    const [sensorsRes, themesRes] = await Promise.all([
      fetch('data/sensors.json').then(r => r.json()),
      fetch('data/themes.json').then(r => r.json()),
    ]);
    STATE.sensors = sensorsRes;
    STATE.themes  = themesRes;
    STATE.filteredSensors = [...STATE.sensors];
    // Non-blocking: fetch already-claimed sensors from GAS
    fetchClaimedSensors();
  } catch (err) {
    console.warn('[SENSORA] Data load failed:', err);
  }
}

async function fetchClaimedSensors() {
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=getClaimed`, { cache: 'no-store' });
    const data = await res.json();
    if (data.claimed && Array.isArray(data.claimed)) {
      STATE.claimedSensors = new Set(data.claimed.map(s => s.toLowerCase().trim()));
      populateIndividualSensorDropdown();
    }
  } catch (_) {
    // GAS GET failed silently; server re-checks on submit
  }
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
    // Date not yet decided — show placeholder
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
    card.innerHTML = `
      <div class="sensor-card-head">
        <div class="sensor-name">${escHtml(s.name)}</div>
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
      const matchQ = !q  || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
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

  populateIndividualSensorDropdown();
  $('individual-form').addEventListener('submit', handleIndividualSubmit);

  initTeamForm();
  $('team-form').addEventListener('submit', handleTeamSubmit);
}

function populateIndividualSensorDropdown() {
  const sel = $('individual-sensor');
  if (!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">— Select a sensor —</option>';
  STATE.sensors
    .filter(s => !STATE.claimedSensors.has(s.name.toLowerCase().trim()))
    .forEach(s => {
      const opt = document.createElement('option');
      opt.value       = s.name;
      opt.textContent = `${s.name} (₹${s.price})`;
      sel.appendChild(opt);
    });
  if (prevVal && !STATE.claimedSensors.has(prevVal.toLowerCase().trim())) {
    sel.value = prevVal;
  }
}

/* Individual Submit — real-time availability check then POST */
async function handleIndividualSubmit(e) {
  e.preventDefault();
  if (STATE.submitLock) return;

  const form   = e.target;
  const fields = {
    name:   $('ind-name'),
    regno:  $('ind-regno'),
    phone:  $('ind-phone'),
    email:  $('ind-email'),
    sensor: $('individual-sensor'),
  };

  if (!validateForm([
    { el: fields.name,   msg: 'Full name is required.' },
    { el: fields.regno,  msg: 'Register number is required.' },
    { el: fields.phone,  msg: 'Enter a valid 10-digit mobile number.', pattern: /^\d{10}$/ },
    { el: fields.email,  msg: 'Enter a valid email address.', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    { el: fields.sensor, msg: 'Please select a sensor.' },
  ])) return;

  const btn = form.querySelector('.btn-submit');
  setLoading(btn, true);
  STATE.submitLock = true;

  try {
    const payload = {
      type:   'individual',
      name:   fields.name.value.trim(),
      regno:  fields.regno.value.trim(),
      phone:  fields.phone.value.trim(),
      email:  fields.email.value.trim(),
      sensor: fields.sensor.value,
    };

    // ── Step 1: Fresh availability check via GET (race-condition guard) ──
    let freshClaimed = new Set(STATE.claimedSensors);
    try {
      const chk  = await fetch(`${CONFIG.GAS_URL}?action=getClaimed`, { cache: 'no-store' });
      const data = await chk.json();
      if (data.claimed && Array.isArray(data.claimed)) {
        freshClaimed = new Set(data.claimed.map(s => s.toLowerCase().trim()));
      }
    } catch (_) {
      // Network issue on pre-check — continue; server-side GAS script will still guard
    }

    if (freshClaimed.has(payload.sensor.toLowerCase().trim())) {
      // Update local state so dropdown reflects reality
      STATE.claimedSensors = freshClaimed;
      populateIndividualSensorDropdown();
      showErrorModal(
        `"${payload.sensor}" was just claimed by someone else.\n\nPlease select a different sensor and try again.`
      );
      return;
    }

    // ── Step 2: POST to GAS (no-cors — we can't read the response body) ──
    await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
    });

    // ── Step 3: Mark locally as claimed; refresh dropdown ──
    STATE.claimedSensors.add(payload.sensor.toLowerCase().trim());
    populateIndividualSensorDropdown();

    showSuccessModal('individual', payload);
    form.reset();
    showToast('Registration successful! 🎉', 'success');

  } catch (err) {
    showErrorModal('Submission failed. Please check your internet connection and try again.');
    console.error('[SENSORA] Individual submit error:', err);
  } finally {
    setLoading(btn, false);
    STATE.submitLock = false;
  }
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

  // Create exactly 3 member rows (team size is fixed)
  [1, 2, 3].forEach(i => membersList.appendChild(createMemberRow(i)));

  // Team sensor dropdowns — ALL 75 sensors, independent of individual claims
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
      type:         'team',
      teamName,
      members:      members.join(', '),
      sensor1, sensor2, sensor3,
      theme,
      projectTitle: projTitle,
      entryCode,
    };

    await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
    });

    showSuccessModal('team', payload);
    showToast('Team registered! 🚀', 'success');

    // Reset form
    form.reset();
    const ml = $('members-list');
    ml.innerHTML = '';
    [1, 2].forEach(i => {
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
    const pass = $('admin-pass').value;
    if (pass === CONFIG.ADMIN_PASS) {
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
}

function checkAdminRoute() {
  if (window.location.search.includes('admin=1')) {
    const adminSection = $('admin');
    if (adminSection) {
      adminSection.style.display = 'block';
      setTimeout(() => adminSection.scrollIntoView({ behavior: 'smooth' }), 300);
    }
  }
}

async function loadAdminData() {
  const btn = $('admin-refresh');
  if (btn) btn.textContent = '⟳ Loading…';
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=getAll`, { cache: 'no-store' });
    const data = await res.json();

    renderAdminTable('admin-individual-table', data.individual || [], [
      'Timestamp', 'Name', 'Register No.', 'Phone', 'Email', 'Sensor Chosen',
    ]);
    renderAdminTable('admin-team-table', data.team || [], [
      'Timestamp', 'Team Name', 'Members', 'Sensor 1', 'Sensor 2', 'Sensor 3',
      'Theme', 'Project Title', 'Entry Code',
    ]);

    const ib = $('individual-badge');
    const tb = $('team-badge');
    if (ib) ib.textContent = (data.individual || []).length;
    if (tb) tb.textContent = (data.team || []).length;

    showToast('Data refreshed successfully.', 'success');
  } catch (err) {
    showToast('Could not fetch data. Check GAS URL or sheet permissions.', 'error');
    console.error('[SENSORA] Admin load error:', err);
  } finally {
    if (btn) btn.textContent = '⟳ Refresh';
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
    $('modal-subtitle').textContent = 'Your individual registration was successful.';
    codeBox.style.display  = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
    summary.innerHTML = `
      <strong>Name:</strong> ${escHtml(data.name)}<br>
      <strong>Register No.:</strong> ${escHtml(data.regno)}<br>
      <strong>Sensor Claimed:</strong> ${escHtml(data.sensor)}
    `;
  }
  overlay.classList.add('open');
}

function showErrorModal(message) {
  const overlay = $('error-modal-overlay');
  // Preserve newlines in the error message
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
      // Fallback for browsers without clipboard API
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
  rules.forEach(({ el, msg, pattern }) => {
    const group = el?.closest('.form-group');
    const errEl = group?.querySelector('.error-text');
    const val   = el?.value?.trim() || '';
    const pass  = val !== '' && (!pattern || pattern.test(val));
    if (!pass) {
      valid = false;
      group?.classList.add('has-error');
      if (errEl) errEl.textContent = msg;
      el?.classList.add('error');
      if (valid === false && el) el.focus(); // focus first invalid field
    } else {
      group?.classList.remove('has-error');
      el?.classList.remove('error');
    }
  });
  return valid;
}

// Clear validation state on user input
document.addEventListener('input', e => {
  if (e.target.matches('.form-input, .form-select')) {
    e.target.closest('.form-group')?.classList.remove('has-error');
    e.target.classList.remove('error');
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
