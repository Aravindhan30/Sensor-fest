# SENSORA 2K26 — Sensor Expo Web App

**ECE Activity Club · P.T. Lee Chengalvaraya Naicker College of Engineering & Technology**  
**Oovery – Kanchipuram 631502**  
*Dream. Design. Develop. Deliver.*

---

## 📋 Event Summary

| Field | Details |
|-------|---------|
| **Event Name** | SENSORA 2K26 — Sensor Expo |
| **Tagline** | Sense · Explore · Innovate |
| **Organised by** | ECE Activity Club, PTLCNCE |
| **Registration Opens** | Open Now |
| **Last Date to Register** | 26 September 2026 |
| **Event Day(s)** | 28 September 2026 (3-Day event) |
| **Contact Email** | eceactivityclub@ptlcecn.ac.in |

---

## 📁 Project Structure

```
sensora-2k26/
├── index.html                # Main SPA — all sections
├── style.css                 # Core premium CSS (design system, animations)
├── sections.css              # Section-specific CSS (schedule, prizes, dates…)
├── app.js                    # Application logic (catalog, forms, countdown, admin)
├── data/
│   ├── sensors.json          # 75 sensor modules (id, name, category, price, desc)
│   └── themes.json           # 6 project themes with category mappings
├── google-apps-script.gs     # Backend for Google Sheets (two-tab)
└── README.md
```

---

## 🗓️ Setting the Fest Date (When Confirmed)

Once the event date is finalised, open `app.js` and update line ~12:

```js
// Change from:
FEST_DATE: null,

// To (example — replace with actual date/time in IST):
FEST_DATE: new Date('2026-10-28T09:00:00+05:30'),
```

The countdown timer in the hero section will activate automatically.

---

## 🚀 Deployment Guide

### Option 1 — GitHub Pages (Free & Simple)
1. Create a GitHub repo (e.g. `sensora2k26`)
2. Upload all files — keep the `data/` folder intact
3. **Settings → Pages → Source → Deploy from branch → main**
4. Live at: `https://<your-username>.github.io/sensora2k26/`

### Option 2 — Netlify Drop
1. Zip the entire project folder
2. Drag & drop at [app.netlify.com/drop](https://app.netlify.com/drop)
3. Live in seconds — free custom domain available

### Option 3 — Vercel
```bash
npm i -g vercel
cd "sensora 2k26"
vercel --prod
```

---

## 🔧 Google Sheets Backend Setup

### Step 1 — Create the Spreadsheet
1. Go to [sheets.new](https://sheets.new)
2. Name it: **SENSORA 2K26 Registrations**
3. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**SHEET_ID**/edit`

### Step 2 — Set Up Apps Script
1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Paste the full contents of `google-apps-script.gs`
3. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your Sheet ID
4. Save (Ctrl+S)

### Step 3 — Deploy as Web App
1. **Deploy → New Deployment → Web App**
2. Settings:
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Click **Deploy** → Authorize → **Copy the Web App URL**

### Step 4 — Wire Up the Frontend
In `app.js`, update line ~11:
```js
GAS_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
```

### Step 5 — Sheet Tabs Auto-Created
On first submission, two tabs appear automatically with navy/gold styling:
- `Individual Registrations` — Timestamp, Name, Register No., Phone, Email, Sensor Chosen
- `Team Submissions` — Timestamp, Team Name, Members, Sensor 1–3, Theme, Project Title, Entry Code

---

## 🔒 Admin Panel

| Access Method | Details |
|---|---|
| URL | `yourdomain.com/?admin=1` |
| Password | `SENSORA@2K26` *(change in `app.js` → `CONFIG.ADMIN_PASS`)* |

Shows both Individual Registrations and Team Submissions as live tables with refresh.

---

## ⚙️ Key Configuration (`app.js` → `CONFIG`)

```js
const CONFIG = {
  GAS_URL:          'https://...your url...',    // Google Apps Script URL
  FEST_DATE:        null,                         // null = TBD | Set to Date() when confirmed
  ADMIN_PASS:       'SENSORA@2K26',               // Change this!
  TEAM_CODE_PREFIX: 'SENSORA26',                  // Entry code prefix
  MAX_TEAM_MEMBERS: 6,
  MIN_TEAM_MEMBERS: 2,
};
```

---

## 📋 Business Rules

| Rule | How It Works |
|------|-------------|
| One sensor per individual | Server re-checks at submit (race-condition safe via GAS LockService) |
| Team sensors independent | Team can pick any sensor regardless of individual claims |
| Duplicate team sensors | Client-side validation blocks same sensor twice |
| Entry code format | `SENSORA26-<RAND4><TS4>` — generated client-side |
| Phone validation | 10-digit Indian mobile number |
| Date TBD | Countdown shows `--` until `CONFIG.FEST_DATE` is set |

---

## 🎨 Design System

| Token | Value |
|-------|-------|
| `--navy` | `#0b1e3d` |
| `--gold` | `#e0a92e` |
| `--cream` | `#f6f3ea` |
| Heading | Outfit (Google Fonts) |
| Body | Inter (Google Fonts) |
| Mono | JetBrains Mono |

---

*© 2026 SENSORA · ECE Activity Club · PTLCNCE · Smart Sensors. Bigger Possibilities.*
