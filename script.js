/* =========================================================================
   FITHUB — script.js
   Front-end demo application (HTML5 + CSS3 + vanilla ES6+, no build step)
   -------------------------------------------------------------------------
   !! SECURITY NOTICE !!
   Authentication in this file is a CLIENT-SIDE DEMONSTRATION ONLY.
   Anyone can open DevTools and bypass it. It is NOT production security.

   For production, replace the `Api` object below with real network calls
   (REST / Node.js / PHP / Firebase / Supabase backed by MySQL/PostgreSQL):
     • Credentials are verified on the server, passwords hashed (bcrypt/argon2).
     • The server issues an httpOnly, Secure, SameSite session cookie or a
       short-lived JWT + refresh token. Never store secrets in localStorage.
     • Every role permission (member / owner / superadmin) is enforced on the
       server for every request — the UI only hides what a role cannot use.
     • Card data is tokenised by a PCI-compliant gateway (e.g. Razorpay/Stripe);
       this app only ever keeps brand + last 4 digits.

   Structure
     1. Utilities           7. Modal system        13. Member portal
     2. Storage / session   8. Form helpers        14. Gym owner portal
     3. Icons               9. Data tables         15. Super admin console
     4. Demo data (DB)     10. Charts              16. Actions & handlers
     5. Api layer          11. Public views        17. Router & boot
     6. Toasts             12. Dashboard shell
   ========================================================================= */
(() => {
  'use strict';

  /* 1. UTILITIES -------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}`;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const DAY = 864e5;
  const startOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = () => startOf(new Date());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((startOf(b) - startOf(a)) / DAY);
  const minsAgo = (m) => new Date(Date.now() - m * 6e4);
  const sameDay = (a, b) => startOf(a).getTime() === startOf(b).getTime();
  const isoDate = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtShort = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const fmtDateTime = (d) => `${fmtShort(d)}, ${fmtTime(d)}`;
  const fmtNum = (n) => Math.round(n).toLocaleString('en-IN');
  const fmtINR = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const fmtCompactINR = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L` : fmtINR(n));
  const fmtDuration = (mins) => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`);
  const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const firstName = (name) => String(name).split(' ')[0];
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14);
  const relDay = (d) => {
    const n = daysBetween(d, today());
    if (n <= 0) return 'Today';
    if (n === 1) return 'Yesterday';
    if (n < 7) return `${n} days ago`;
    if (n < 30) return `${Math.round(n / 7)} wk ago`;
    return fmtShort(d);
  };
  const relTime = (d) => {
    const m = Math.round((Date.now() - new Date(d)) / 6e4);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    const dd = Math.round(h / 24);
    return dd === 1 ? 'Yesterday' : `${dd} days ago`;
  };
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  /* Deterministic pseudo-random generator so demo data is stable */
  const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* File helpers */
  function download(filename, content, mime = 'text/csv') {
    const blob = new Blob([mime === 'text/csv' ? '﻿' + content : content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function toCSV(header, rows) {
    const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [header, ...rows].map((r) => r.map(q).join(',')).join('\n');
  }

  /* 2. STORAGE / SESSION ------------------------------------------------ */
  const STORAGE_PREFIX = 'fithub.';
  const Storage = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(STORAGE_PREFIX + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } },
    remove(key) { try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (e) { /* ignore */ } },
    clearAll() { try { Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ } },
  };
  const Session = {
    get() { return Storage.get('session'); },
    set(s) { Storage.set('session', s); },
    clear() { Storage.remove('session'); },
  };

  /* 3. ICONS (Lucide-style, stroke based) ------------------------------ */
  const ICONS = {
    grid: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
    dumbbell: '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    idcard: '<rect width="20" height="16" x="2" y="4" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 17a3 3 0 0 1 6 0"/><path d="M14 9h5"/><path d="M14 13h5"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    bar: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
    crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    biceps: '<path d="M12.409 13.017A5 5 0 0 1 22 15c0 3.866-4 7-9 7-4.077 0-8.153-.82-10.371-2.462-.426-.316-.631-.832-.62-1.362C2.118 12.723 2.627 2 10 2a3 3 0 0 1 3 3 2 2 0 0 1-2 2c-1.105 0-1.64-.444-2-1"/><path d="M15 14a5 5 0 0 0-7.584 2"/><path d="M9.964 6.825C8.019 7.977 9.5 13 8 15"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    shieldcheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
    menu: '<line x1="4" x2="20" y1="7" y2="7"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="14" y1="17" y2="17"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    weight: '<circle cx="12" cy="5" r="3"/><path d="M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z"/>',
    banknote: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    snow: '<line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>',
  };
  const icon = (name, cls = '') =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  const starIcon = (filled) =>
    `<svg class="icon ${filled ? '' : 'is-empty'}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${ICONS.star}</svg>`;
  const logo = (cls = '') => `<span class="logo ${cls}" aria-label="FitHub"><span class="fit">FIT</span><span class="hub">HUB</span></span>`;

  /* 4. DEMO DATA ---------------------------------------------------------
     In production each collection below is fetched from the backend
     (e.g. GET /api/gyms/:id/members). Shapes are kept API-friendly.       */
  const T = today();
  const R = rng(20260927);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const emailOf = (name, domain) => `${name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.')}@${domain}`;
  const phoneOf = () => `+91 9${Math.floor(R() * 9e8 + 1e8).toString().replace(/(\d{4})(\d{5})/, '$1 $2')}`;

  const PLAN_ORDER = ['basic', 'premium', 'annual'];

  const DB = {
    plans: [
      { id: 'basic', name: 'Basic', price: 1499, period: 'month', durationDays: 30, members: 214, active: true,
        features: ['Gym floor access, 6am – 11pm', 'Locker & shower access', '1 fitness assessment', 'App check-in & attendance'] },
      { id: 'premium', name: 'Premium', price: 2499, period: 'month', durationDays: 30, members: 318, active: true, featured: true,
        features: ['Everything in Basic', 'Unlimited group classes', '2 trainer check-ins per month', 'Progress tracking & reports'] },
      { id: 'annual', name: 'Annual Pro', price: 24999, period: 'year', durationDays: 365, members: 110, active: true,
        features: ['Everything in Premium', '4 personal training sessions / month', 'Custom nutrition plan', '6 guest passes per year', 'Priority class booking'] },
      { id: 'student', name: 'Student Flex', price: 999, period: 'month', durationDays: 30, members: 0, active: false,
        features: ['Off-peak access (6am – 4pm)', 'Valid student ID required', 'App check-in & attendance'] },
    ],
  };

  /* ---- Member (logged-in member portal) ---- */
  DB.member = {
    name: 'Arjun Mehta', email: 'user@fithub.com', phone: '+91 98765 43210', dob: '1994-06-14',
    gym: 'Iron Temple Fitness', branch: 'Andheri West, Mumbai', memberId: 'FH-IT-10482',
    joined: addDays(T, -412), planId: 'premium', billing: 'quarterly', cycleDays: 90,
    renewal: addDays(T, 31), autoRenew: true, scheduledPlan: null, frozen: false,
    goal: 'Build strength', height: 178, trainer: 'Vikram Singh',
    streak: 12, bestStreak: 21, visitsThisMonth: 18, sessionsDone: 37, sessionsPlanned: 50,
    weekly: [62, 48, 75, 0, 58, 90, 35],
    workout: {
      title: 'Strength — Upper Body', focus: 'Chest · Back · Shoulders · Arms', duration: 65, logged: false,
      exercises: [
        { id: 'e1', name: 'Bench Press', sets: 4, reps: '8', load: '70 kg', done: true },
        { id: 'e2', name: 'Incline Dumbbell Press', sets: 3, reps: '10', load: '24 kg', done: true },
        { id: 'e3', name: 'Lat Pulldown', sets: 4, reps: '10', load: '55 kg', done: false },
        { id: 'e4', name: 'Seated Cable Row', sets: 3, reps: '12', load: '50 kg', done: false },
        { id: 'e5', name: 'Lateral Raise', sets: 3, reps: '15', load: '8 kg', done: false },
        { id: 'e6', name: 'Triceps Pushdown', sets: 3, reps: '12', load: '25 kg', done: false },
      ],
    },
    weekPlan: [
      { day: 'MON', title: 'Strength — Upper Body' }, { day: 'TUE', title: 'Strength — Lower Body' },
      { day: 'WED', title: 'HIIT Conditioning' }, { day: 'THU', title: 'Rest & Mobility', rest: true },
      { day: 'FRI', title: 'Push + Core' }, { day: 'SAT', title: 'Pull + Posterior Chain' }, { day: 'SUN', title: 'Strength — Upper Body' },
    ],
    sessions: [
      { id: uid('s'), date: addDays(T, -1), type: 'Pull + Posterior Chain', duration: 72, notes: 'Deadlift 145 kg × 3 — new PR' },
      { id: uid('s'), date: addDays(T, -2), type: 'Push + Core', duration: 61, notes: '' },
      { id: uid('s'), date: addDays(T, -4), type: 'HIIT Conditioning', duration: 38, notes: 'Assault bike intervals' },
      { id: uid('s'), date: addDays(T, -5), type: 'Strength — Lower Body', duration: 70, notes: '' },
    ],
    attendance: [],
    invoices: [],
    methods: [
      { id: 'pm1', type: 'card', brand: 'VISA', last4: '4242', exp: '08/28', name: 'Arjun Mehta', primary: true },
      { id: 'pm2', type: 'upi', upi: 'arjun.mehta@okhdfcbank', primary: false },
    ],
    progress: {
      weight: [82.4, 81.9, 81.1, 80.6, 80.2, 79.5, 79.1, 78.6, 78.2, 77.6, 77.1, 76.8],
      weightDates: Array.from({ length: 12 }, (_, i) => addDays(T, -7 * (11 - i))),
      strength: [
        { lift: 'Bench Press', start: 70, current: 85, goal: 100 },
        { lift: 'Back Squat', start: 95, current: 115, goal: 140 },
        { lift: 'Deadlift', start: 120, current: 145, goal: 180 },
        { lift: 'Overhead Press', start: 40, current: 52, goal: 60 },
      ],
      runLabels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      runKm: [18, 22, 26, 24, 31, 34],
      fiveK: [31.4, 30.2, 29.1, 28.3, 27.2, 26.4],
      completion: [68, 72, 70, 78, 81, 74],
    },
  };
  // attendance history (last visits)
  [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 18, 20, 22, 24].forEach((off) => {
    const h = 6 + Math.floor(R() * 3), m = Math.floor(R() * 60);
    const d = addDays(T, -off); d.setHours(h, m);
    DB.member.attendance.push({ id: uid('a'), date: d, gym: 'Iron Temple · Andheri West', duration: 45 + Math.floor(R() * 45), status: 'Completed' });
  });
  // invoices
  DB.member.invoices = [
    { id: 'INV-2026-0729', date: addDays(T, -59), desc: 'Premium · Quarterly (3 months)', amount: 7497, method: 'VISA •••• 4242', status: 'Paid' },
    { id: 'INV-2026-0712', date: addDays(T, -76), desc: 'Personal training pack · 4 sessions', amount: 3600, method: 'UPI', status: 'Paid' },
    { id: 'INV-2026-0430', date: addDays(T, -149), desc: 'Premium · Quarterly (3 months)', amount: 7497, method: 'VISA •••• 4242', status: 'Paid' },
    { id: 'INV-2026-0318', date: addDays(T, -193), desc: 'Body composition scan', amount: 1200, method: 'UPI', status: 'Paid' },
    { id: 'INV-2026-0130', date: addDays(T, -239), desc: 'Premium · Quarterly (3 months)', amount: 7497, method: 'VISA •••• 4242', status: 'Paid' },
    { id: 'INV-2025-1101', date: addDays(T, -329), desc: 'Premium · Quarterly (3 months)', amount: 7497, method: 'Net banking', status: 'Refunded' },
  ];

  /* ---- Gym owner (Iron Temple Fitness) ---- */
  const trainerSeed = [
    ['Vikram Singh', 'Strength & Powerlifting', 4.9, 128, 'available', 24, 9, ['NSCA-CSCS', 'K11 Master Trainer'], 'Mon–Sat · 06:00–14:00', 'Former national-level powerlifter. Builds strength programs around progressive overload and clean technique.'],
    ['Neha Kapoor', 'Yoga & Mobility', 4.8, 96, 'in-session', 31, 7, ['RYT-500', 'FRC Mobility Specialist'], 'Mon–Fri · 07:00–12:00, 17:00–20:00', 'Blends vinyasa flow with functional-range mobility to improve recovery and range of motion.'],
    ['Rohan Das', 'HIIT & Conditioning', 4.7, 84, 'available', 19, 5, ['ACE-CPT', 'CrossFit L2'], 'Tue–Sun · 15:00–22:00', 'High-energy conditioning coach focused on engine building and fat-loss programming.'],
    ['Aisha Khan', 'Functional Training', 4.9, 112, 'off', 22, 8, ['NASM-CPT', 'FMS Level 2'], 'Wed–Sun · 06:00–13:00', 'Movement-first coach specialising in injury prevention and athletic performance.'],
    ['Karan Malhotra', 'Bodybuilding & Physique', 4.6, 73, 'available', 17, 6, ['ISSA Bodybuilding', 'Precision Nutrition L1'], 'Mon–Sat · 16:00–22:00', 'Physique coach combining hypertrophy training with sustainable nutrition coaching.'],
    ['Priya Nair', 'Pilates & Core', 4.8, 91, 'in-session', 26, 6, ['STOTT Pilates', 'Pre/Post-natal Certified'], 'Mon–Fri · 08:00–14:00', 'Reformer and mat Pilates instructor focused on posture, core stability and control.'],
  ];
  const memberSeed = [
    ['Arjun Mehta', 'premium', 0, 31, 'active', 412], ['Sneha Iyer', 'annual', 1, 212, 'active', 520], ['Rohit Sharma', 'basic', 3, 5, 'active', 88],
    ['Kavya Reddy', 'premium', 0, 18, 'active', 190], ['Aman Gupta', 'basic', 12, -4, 'active', 301], ['Meera Joshi', 'annual', 2, 140, 'active', 610],
    ['Siddharth Rao', 'premium', 21, 46, 'paused', 240], ['Tanvi Shah', 'premium', 1, 3, 'active', 140], ['Nikhil Bansal', 'basic', 0, 22, 'active', 65],
    ['Ishita Menon', 'annual', 4, 301, 'active', 64], ['Farhan Qureshi', 'premium', 2, 6, 'active', 330], ['Pooja Kulkarni', 'basic', 9, -12, 'active', 410],
    ['Varun Chopra', 'premium', 0, 58, 'active', 122], ['Riya Desai', 'basic', 35, 12, 'paused', 205], ['Aditya Nair', 'annual', 1, 188, 'active', 177],
    ['Zoya Ahmed', 'premium', 5, 2, 'active', 95],
  ];
  DB.gym = {
    id: 'gym_irontemple', name: 'Iron Temple Fitness', branch: 'Andheri West, Mumbai',
    owner: 'Rahul Verma', email: 'admin@irontemple.com', phone: '+91 22 4012 7788',
    address: '2nd Floor, Link Square, Linking Road, Andheri West, Mumbai 400058',
    open: '05:30', close: '23:00', capacity: 120,
    stats: { active: 642, checkins: 118, revenue: 846000, expiring: 27, collected: 846000, pending: 42300, refunds: 6500, avgSession: 68, newThisMonth: 18 },
    hourlyLabels: ['6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'],
    hourly: [14, 19, 16, 9, 6, 5, 7, 6, 4, 5, 6, 9, 12, 0, 0, 0],
    revenueLabels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    revenueTrend: [692000, 718000, 764000, 790000, 812000, 846000],
    zones: [
      { id: 'weights', name: 'Weights', capacity: 40, base: 14 },
      { id: 'cardio', name: 'Cardio', capacity: 30, base: 8 },
      { id: 'studio', name: 'Studio', capacity: 20, base: 6 },
      { id: 'functional', name: 'Functional', capacity: 16, base: 5 },
    ],
    members: memberSeed.map(([name, planId, last, ren, status, joined], i) => ({
      id: `m${i + 1}`, name, planId, status, email: i === 0 ? 'user@fithub.com' : emailOf(name, 'gmail.com'), phone: i === 0 ? '+91 98765 43210' : phoneOf(),
      lastVisit: addDays(T, -last), renewal: addDays(T, ren), joined: addDays(T, -joined), visits: 20 + Math.floor(R() * 160),
    })),
    trainers: trainerSeed.map(([name, spec, rating, reviews, availability, clients, exp, certs, schedule, bio], i) => ({
      id: `t${i + 1}`, name, spec, rating, reviews, availability, clients, exp, certs, schedule, bio, maxClients: 30,
      email: emailOf(name, 'irontemple.com'), phone: phoneOf(),
    })),
    payments: [],
    live: [],
    settings: { checkinMethod: 'qr', autoCheckout: '3', dailySummary: true, renewalReminders: true, lowAttendance: false, paymentAlerts: true },
    reportsHistory: [
      { id: uid('r'), name: 'Revenue Report · August 2026', at: addDays(T, -26), format: 'CSV' },
      { id: uid('r'), name: 'Attendance Report · August 2026', at: addDays(T, -26), format: 'Preview' },
    ],
  };
  // payments
  const payNames = ['Kavya Reddy', 'Varun Chopra', 'Nikhil Bansal', 'Sneha Iyer', 'Tanvi Shah', 'Farhan Qureshi', 'Zoya Ahmed', 'Rohit Sharma', 'Aditya Nair', 'Meera Joshi', 'Aman Gupta', 'Pooja Kulkarni', 'Ishita Menon', 'Arjun Mehta'];
  const payStatus = ['paid', 'paid', 'paid', 'paid', 'pending', 'paid', 'pending', 'pending', 'paid', 'paid', 'overdue', 'refunded', 'paid', 'paid'];
  const payMethods = ['UPI', 'Card', 'UPI', 'Net banking', 'UPI', 'Card', 'Cash', 'UPI', 'Card', 'UPI', 'UPI', 'Card', 'Card', 'Card'];
  DB.gym.payments = payNames.map((name, i) => {
    const m = DB.gym.members.find((x) => x.name === name);
    const plan = DB.plans.find((p) => p.id === m.planId);
    return { id: `INV-24${String(871 - i).padStart(3, '0')}`, member: name, memberId: m.id, plan: plan.name,
      amount: plan.id === 'annual' ? plan.price : plan.id === 'premium' && i % 3 === 0 ? plan.price * 3 : plan.price,
      date: addDays(T, -Math.floor(i * 1.6)), status: payStatus[i], method: payMethods[i] };
  });
  // live floor
  const liveSeed = [['Kavya Reddy', 'weights', 52], ['Nikhil Bansal', 'cardio', 44], ['Varun Chopra', 'weights', 38], ['Sneha Iyer', 'studio', 31], ['Rohan Pillai', 'functional', 27],
    ['Devika Sen', 'cardio', 22], ['Aditya Nair', 'weights', 18], ['Tanvi Shah', 'studio', 12], ['Harsh Vora', 'functional', 7], ['Ananya Bose', 'weights', 3]];
  DB.gym.live = liveSeed.map(([name, zone, m]) => ({ id: uid('l'), name, zone, checkIn: minsAgo(m) }));
  const WALK_IN_POOL = ['Kabir Anand', 'Mira Pillai', 'Yash Thakur', 'Nisha Rao', 'Dev Malik', 'Sara Thomas', 'Om Prakash', 'Leela Iyer', 'Rehan Shaikh', 'Ira Kapoor'];

  /* ---- Platform (super admin) ---- */
  const gymSeed = [
    ['Iron Temple Fitness', 'Mumbai', 642, 'Rahul Verma', 'active', 412], ['Pulse Arena', 'Bengaluru', 518, 'Deepa Krishnan', 'active', 380],
    ['Forge Athletics', 'Delhi', 734, 'Manish Arora', 'active', 505], ['Titan Strength Club', 'Pune', 389, 'Sameer Kulkarni', 'active', 290],
    ['Core Collective', 'Hyderabad', 455, 'Lakshmi Reddy', 'active', 260], ['Apex Performance', 'Chennai', 297, 'Arvind Subramanian', 'active', 214],
    ['Urban Grit', 'Mumbai', 211, 'Tara Fernandes', 'pending', 6], ['Momentum Studio', 'Kolkata', 168, 'Sourav Ghosh', 'pending', 3],
    ['Ironside Gym', 'Ahmedabad', 402, 'Hardik Patel', 'suspended', 330], ['Kinetic Lab', 'Bengaluru', 276, 'Deepa Krishnan', 'active', 120],
    ['Vertex Fitness', 'Jaipur', 183, 'Nidhi Agarwal', 'active', 98], ['Beast Mode Gym', 'Delhi', 540, 'Manish Arora', 'active', 450],
  ];
  const ownerSeed = [
    ['Rahul Verma', 'admin@irontemple.com', 12, 'active'], ['Deepa Krishnan', 'deepa@pulsearena.in', 95, 'active'], ['Manish Arora', 'manish@forgeathletics.in', 240, 'active'],
    ['Sameer Kulkarni', 'sameer@titanstrength.in', 1500, 'active'], ['Lakshmi Reddy', 'lakshmi@corecollective.in', 3100, 'active'], ['Arvind Subramanian', 'arvind@apexperformance.in', 520, 'active'],
    ['Tara Fernandes', 'tara@urbangrit.in', 60, 'invited'], ['Sourav Ghosh', 'sourav@momentumstudio.in', 26, 'invited'], ['Hardik Patel', 'hardik@ironsidegym.in', 12400, 'suspended'],
    ['Nidhi Agarwal', 'nidhi@vertexfitness.in', 2880, 'active'],
  ];
  DB.platform = {
    stats: { gyms: 86, members: 18420, gmv: 28400000, uptime: 99.98, newGyms: 4, newMembers: 740 },
    gyms: gymSeed.map(([name, city, members, owner, status, age], i) => ({
      id: `G-${1040 + i}`, name, city, members, owner, status, created: addDays(T, -age),
      plan: members > 500 ? 'Enterprise' : members > 300 ? 'Growth' : 'Starter', revenue: members * (1150 + Math.floor(R() * 500)), email: `hello@${slug(name)}.in`,
    })),
    owners: ownerSeed.map(([name, email, lastMins, status], i) => ({ id: `O-${210 + i}`, name, email, lastActive: minsAgo(lastMins), status, phone: phoneOf(), joined: addDays(T, -(60 + i * 37)) })),
    members: [
      ['Arjun Mehta', 'Iron Temple Fitness', 'Premium', 412, 'active'], ['Ritika Sinha', 'Forge Athletics', 'Annual Pro', 220, 'active'], ['Mohit Jain', 'Pulse Arena', 'Basic', 45, 'active'],
      ['Sana Mirza', 'Core Collective', 'Premium', 130, 'active'], ['Gaurav Bhatia', 'Beast Mode Gym', 'Premium', 300, 'paused'], ['Ankita Das', 'Momentum Studio', 'Basic', 2, 'active'],
      ['Kunal Shetty', 'Titan Strength Club', 'Annual Pro', 180, 'active'], ['Priyanka Roy', 'Kinetic Lab', 'Premium', 60, 'active'], ['Jatin Solanki', 'Ironside Gym', 'Basic', 280, 'suspended'],
      ['Divya Menon', 'Apex Performance', 'Premium', 95, 'active'], ['Rahul Khanna', 'Vertex Fitness', 'Basic', 30, 'expired'], ['Fatima Sheikh', 'Urban Grit', 'Premium', 4, 'active'],
      ['Tushar Goyal', 'Forge Athletics', 'Premium', 150, 'active'], ['Neelam Chawla', 'Iron Temple Fitness', 'Annual Pro', 520, 'active'],
    ].map(([name, gym, plan, joined, status], i) => ({ id: `PM-${58210 + i}`, name, gym, plan, joined: addDays(T, -joined), status, email: emailOf(name, 'gmail.com') })),
    activity: [
      ['gym', 'Gym created', 'Urban Grit · Mumbai registered by Tara Fernandes', 'System', 8, 'success'],
      ['owner', 'Owner invited', 'Invitation sent to sourav@momentumstudio.in', 'Ananya Rao', 26, 'info'],
      ['payment', 'Payment webhook processed', 'Razorpay · 312 events · ₹4.82L settled', 'Webhook', 41, 'success'],
      ['import', 'Member import completed', 'Forge Athletics · 184 imported, 3 skipped (duplicate phone)', 'Manish Arora', 95, 'warning'],
      ['verify', 'Gym verification approved', 'Kinetic Lab · KYC & GST verified', 'Ananya Rao', 180, 'success'],
      ['report', 'Report exported', 'Platform revenue report · Aug 2026 (CSV)', 'Ananya Rao', 260, 'success'],
      ['payment', 'Payment webhook failed', 'Ironside Gym · 2 events · retry scheduled', 'Webhook', 330, 'failed'],
      ['security', 'Two-factor enforced', '2FA now required for all gym admins', 'Ananya Rao', 540, 'success'],
      ['gym', 'Gym suspended', 'Ironside Gym · 3 unresolved chargebacks', 'Ananya Rao', 1320, 'warning'],
      ['import', 'Member import completed', 'Vertex Fitness · 183 members imported', 'Nidhi Agarwal', 1700, 'success'],
      ['owner', 'Owner access reset', 'Password reset link sent to lakshmi@corecollective.in', 'Ananya Rao', 2300, 'info'],
      ['system', 'Scheduled maintenance completed', 'Database upgrade · 4 min read-only window', 'System', 2900, 'success'],
    ].map(([type, title, detail, actor, m, status]) => ({ id: uid('ev'), type, title, detail, actor, at: minsAgo(m), status })),
    analytics: {
      members: [9820, 10640, 11380, 12150, 12960, 13720, 14480, 15310, 16120, 16940, 17680, 18420],
      gmv: [14200000, 15500000, 16300000, 17400000, 18600000, 19800000, 20700000, 22100000, 23800000, 25200000, 26700000, 28400000],
      gyms: [41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 82, 86],
      mrr: [2180000, 2360000, 2490000, 2640000, 2810000, 2990000, 3160000, 3350000, 3580000, 3810000, 4060000, 4260000],
      retention: [['Month 1', 94], ['Month 2', 89], ['Month 3', 85], ['Month 6', 78], ['Month 9', 74], ['Month 12', 71]],
      churn: 2.4, churnPrev: 2.7,
    },
    settings: {
      supportEmail: 'support@fithub.com', maintenance: false, sessionTimeout: '30', passwordPolicy: 'strong', sso: false,
      twoFactor: true, twoFactorScope: 'admins', auditRetention: '365', notifyEmail: true, notifyIncidents: true, weeklyDigest: true, notifySlack: false,
    },
  };
  const monthLabels = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(T.getFullYear(), T.getMonth() - (n - 1 - i), 1); return d.toLocaleDateString('en-IN', { month: 'short' }); });

  const NOTIFICATIONS = {
    member: [
      { text: 'Vikram Singh updated your Upper Body program.', at: minsAgo(35), unread: true },
      { text: 'Your membership renews in 31 days.', at: minsAgo(300), unread: true },
      { text: 'New PR logged: Deadlift 145 kg. Keep it up!', at: minsAgo(1500), unread: false },
    ],
    owner: [
      { text: '27 memberships expire in the next 7 days.', at: minsAgo(20), unread: true },
      { text: 'Payment of ₹2,499 received from Kavya Reddy.', at: minsAgo(64), unread: true },
      { text: 'Neha Kapoor’s 6 PM yoga class is fully booked.', at: minsAgo(140), unread: true },
      { text: 'Weekly attendance report is ready.', at: minsAgo(1400), unread: false },
    ],
    superadmin: [
      { text: '2 gyms awaiting verification approval.', at: minsAgo(10), unread: true },
      { text: 'Payment webhook failure · Ironside Gym.', at: minsAgo(330), unread: true },
      { text: 'Monthly GMV crossed ₹2.8Cr.', at: minsAgo(900), unread: false },
    ],
  };

  /* Apply persisted preferences / settings (demo persistence) */
  Object.assign(DB.platform.settings, Storage.get('platformSettings', {}));
  const savedGym = Storage.get('gymSettings');
  if (savedGym) { Object.assign(DB.gym.settings, savedGym.settings || {}); ['name', 'branch', 'phone', 'email', 'address', 'open', 'close'].forEach((k) => { if (savedGym[k]) DB.gym[k] = savedGym[k]; }); }
  const savedProfile = Storage.get('memberProfile');
  if (savedProfile) Object.assign(DB.member, savedProfile);
  const Prefs = Object.assign({ workoutReminders: true, renewalAlerts: true, classUpdates: true, marketing: false, units: 'metric' }, Storage.get('memberPrefs', {}));

  /* Derived helpers */
  const planById = (id) => DB.plans.find((p) => p.id === id);
  const memberStatus = (m) => {
    if (m.status === 'paused') return 'paused';
    const d = daysBetween(T, m.renewal);
    if (d < 0) return 'expired';
    if (d <= 7) return 'expiring';
    return 'active';
  };
  const STATUS_TONE = {
    active: 'success', expiring: 'warning', paused: 'info', expired: 'danger', paid: 'success', pending: 'warning', overdue: 'danger',
    refunded: 'neutral', suspended: 'danger', invited: 'info', success: 'success', failed: 'danger', warning: 'warning', completed: 'success',
    'in progress': 'accent', available: 'success', 'in-session': 'warning', off: 'neutral', disabled: 'neutral',
  };
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const badge = (text, tone) => `<span class="badge badge--${tone || STATUS_TONE[String(text).toLowerCase()] || 'neutral'}">${esc(cap(text))}</span>`;
  const periodLabel = (p) => ({ month: '/ month', quarter: '/ quarter', year: '/ year' }[p] || `/ ${p}`);

  /* 5. API LAYER -------------------------------------------------------
     Every method returns a Promise so the UI already behaves like it is
     talking to a server. Swap the bodies for fetch() calls, e.g.:
       login: (body) => fetch('/api/auth/login', { method:'POST',
         credentials:'include', headers:{'Content-Type':'application/json'},
         body: JSON.stringify(body) }).then(r => r.ok ? r.json() : Promise.reject(r))
  ------------------------------------------------------------------------ */
  const DEMO_ACCOUNTS = {
    member: { email: 'user@fithub.com', name: 'Arjun Mehta', mobile: '9876543210' },
    owner: { email: 'admin@irontemple.com', name: 'Rahul Verma', mobile: '9820012345' },
    superadmin: { email: 'superadmin@fithub.com', name: 'Ananya Rao' },
  };
  const Api = {
    async login({ role, identifier, password }) {
      await wait(600); // simulate network latency
      if (!password) throw new Error('Password is required.');
      const id = identifier.trim().toLowerCase();
      const digits = id.replace(/\D/g, '').slice(-10);
      const demo = DEMO_ACCOUNTS[role];
      let user = null;
      if (id === demo.email || (demo.mobile && digits === demo.mobile)) user = { name: demo.name, email: demo.email };
      if (!user && role === 'member') {
        const acc = Storage.get('accounts', []).find((a) => a.email === id);
        if (acc) user = { name: acc.name, email: acc.email };
      }
      if (!user) throw new Error(`No ${role === 'member' ? 'member' : role === 'owner' ? 'gym admin' : 'super admin'} account found for “${identifier}”. Use the demo credentials above.`);
      return { role, user, token: `demo.${uid('t')}`, issuedAt: Date.now() };
    },
    async register({ name, email }) {
      await wait(500);
      const accounts = Storage.get('accounts', []);
      const e = email.trim().toLowerCase();
      if (e === DEMO_ACCOUNTS.member.email || accounts.some((a) => a.email === e)) throw new Error('An account with this email already exists. Sign in instead.');
      accounts.push({ name: name.trim(), email: e, createdAt: Date.now() }); // NOTE: never store passwords client-side
      Storage.set('accounts', accounts);
      return { role: 'member', user: { name: name.trim(), email: e }, token: `demo.${uid('t')}`, issuedAt: Date.now() };
    },
    async logout() { await wait(150); return true; },
  };

  /* 6. TOASTS ---------------------------------------------------------- */
  const TOAST_ICON = { success: 'checkCircle', error: 'xCircle', info: 'info', warning: 'alert' };
  const Toast = {
    show(message, { type = 'success', title = '', duration = 3400 } = {}) {
      const root = $('#toast-root');
      const el = document.createElement('div');
      el.className = `toast toast--${type}`;
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
      el.innerHTML = `<span class="toast__icon">${icon(TOAST_ICON[type] || 'info')}</span>
        <div class="toast__body">${title ? `<strong>${esc(title)}</strong>` : ''}<span>${esc(message)}</span></div>
        <button type="button" class="toast__close" aria-label="Dismiss notification">${icon('x')}</button>
        <span class="toast__bar" style="animation-duration:${duration}ms"></span>`;
      root.appendChild(el);
      let timer;
      const remove = () => {
        if (el.classList.contains('is-leaving')) return;
        clearTimeout(timer);
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 260);
      };
      timer = setTimeout(remove, duration);
      el.addEventListener('mouseenter', () => clearTimeout(timer));
      el.addEventListener('mouseleave', () => { timer = setTimeout(remove, 1400); });
      el.querySelector('.toast__close').addEventListener('click', remove);
      while (root.children.length > 4) root.firstElementChild.remove();
    },
    success(msg, title) { this.show(msg, { type: 'success', title }); },
    error(msg, title) { this.show(msg, { type: 'error', title }); },
    info(msg, title) { this.show(msg, { type: 'info', title }); },
    warning(msg, title) { this.show(msg, { type: 'warning', title }); },
  };

  /* 7. MODAL SYSTEM ---------------------------------------------------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const Modal = {
    lastFocus: null,
    resolver: null,
    get isOpen() { return !$('#modal-root').hidden; },
    /**
     * open({ title, eyebrow, body, footer, size, onSubmit, submitLabel, danger, onOpen })
     * If onSubmit is provided, body is wrapped in a validated <form>.
     * onSubmit(data, form) may return false (or a Promise resolving false) to keep the modal open.
     */
    open({ title, eyebrow = '', body = '', footer, size = 'md', onSubmit, submitLabel = 'Save changes', cancelLabel = 'Cancel', danger = false, onOpen } = {}) {
      const wasOpen = this.isOpen;
      this.settle(false);
      if (!wasOpen) this.lastFocus = document.activeElement;
      const root = $('#modal-root');
      const hasForm = typeof onSubmit === 'function';
      const foot = footer !== undefined ? footer
        : `<button type="button" class="btn btn--secondary" data-action="modal-close">${esc(cancelLabel)}</button>${hasForm ? `<button type="submit" form="modal-form" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(submitLabel)}</button>` : ''}`;
      root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
        <div class="modal modal--${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
          <header class="modal__head">
            <div>${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h2 class="modal__title" id="modal-title">${esc(title)}</h2></div>
            <button type="button" class="icon-btn modal__close" data-action="modal-close" aria-label="Close dialog">${icon('x')}</button>
          </header>
          <div class="modal__body">${hasForm ? `<form id="modal-form" novalidate>${body}</form>` : body}</div>
          ${foot ? `<footer class="modal__foot">${foot}</footer>` : ''}
        </div></div>`;
      root.hidden = false;
      document.body.classList.add('modal-open');
      const modal = $('.modal', root);
      if (hasForm) {
        const form = $('#modal-form', root);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!Form.validate(form)) return;
          const btn = $('button[type="submit"]', root);
          btn?.classList.add('is-loading');
          const result = await onSubmit(Form.data(form), form);
          btn?.classList.remove('is-loading');
          if (result !== false && form.isConnected) this.close();
        });
      }
      onOpen?.(modal);
      requestAnimationFrame(() => {
        const target = $('[autofocus]', modal) || $('.modal__body ' + FOCUSABLE.split(', ').join(', .modal__body '), modal) || $('.modal__foot .btn', modal) || modal;
        target.focus({ preventScroll: true });
      });
      return modal;
    },
    settle(value) { if (this.resolver) { const r = this.resolver; this.resolver = null; r(value); } },
    close() {
      const root = $('#modal-root');
      if (root.hidden) return;
      this.settle(false);
      root.hidden = true;
      root.innerHTML = '';
      document.body.classList.remove('modal-open');
      const back = this.lastFocus && document.contains(this.lastFocus) ? this.lastFocus : $('#page-heading');
      back?.focus({ preventScroll: true });
      this.lastFocus = null;
    },
    /** Promise-based confirmation dialog */
    confirm({ title, message, confirmLabel = 'Confirm', danger = false, eyebrow = 'Please confirm' }) {
      return new Promise((resolve) => {
        this.open({
          title, eyebrow, size: 'sm', body: `<p class="modal__text">${message}</p>`,
          footer: `<button type="button" class="btn btn--secondary" data-action="modal-close">Cancel</button>
                   <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-modal-confirm>${esc(confirmLabel)}</button>`,
        });
        this.resolver = resolve;
        $('[data-modal-confirm]').addEventListener('click', () => { this.settle(true); this.close(); });
      });
    },
    trap(e) {
      const modal = $('#modal-root .modal');
      if (!modal) return;
      const items = $$(FOCUSABLE, modal).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    },
  };

  /* 8. FORM HELPERS ---------------------------------------------------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const MOBILE_RE = /^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;
  let fieldSeq = 0;
  const Form = {
    field({ name, label, type = 'text', value = '', required = false, placeholder = '', options = null, hint = '', full = false, attrs = '', autocomplete = 'off', rows = 4, optional = true }) {
      const id = `f-${name}-${++fieldSeq}`;
      const req = required ? 'required aria-required="true"' : '';
      let control;
      if (type === 'select') {
        control = `<select class="input" id="${id}" name="${name}" ${req} ${attrs}>${options.map((o) => {
          const [v, l] = Array.isArray(o) ? o : [o, o];
          return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
        }).join('')}</select>`;
      } else if (type === 'textarea') {
        control = `<textarea class="input" id="${id}" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}" ${req} ${attrs}>${esc(value)}</textarea>`;
      } else if (type === 'password') {
        control = `<div class="input-wrap"><input class="input" id="${id}" name="${name}" type="password" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="${autocomplete}" ${req} ${attrs}>
          <button type="button" class="input-wrap__btn" data-action="toggle-password" aria-label="Show password" aria-controls="${id}">${icon('eye', 'icon--sm')}</button></div>`;
      } else {
        control = `<input class="input" id="${id}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="${autocomplete}" ${req} ${attrs}>`;
      }
      return `<div class="field ${full ? 'field--full' : ''}">
        <label for="${id}">${esc(label)}${!required && optional ? '<span class="optional">Optional</span>' : ''}</label>
        ${control}${hint ? `<p class="field-hint">${esc(hint)}</p>` : ''}<p class="field-error" id="${id}-err"></p></div>`;
    },
    toggle({ name, label, desc = '', checked = false }) {
      const id = `t-${name}-${++fieldSeq}`;
      return `<div class="setting-row"><div class="setting-row__text"><strong id="${id}-l">${esc(label)}</strong>${desc ? `<span id="${id}-d">${esc(desc)}</span>` : ''}</div>
        <label class="switch"><input type="checkbox" role="switch" name="${name}" ${checked ? 'checked' : ''} aria-labelledby="${id}-l" ${desc ? `aria-describedby="${id}-d"` : ''}><span class="switch__track"></span></label></div>`;
    },
    labelOf(el) { return el.closest('.field')?.querySelector('label')?.firstChild?.textContent?.trim() || 'This field'; },
    check(el) {
      if (el.closest('[hidden]')) return '';
      const v = el.value.trim();
      const label = this.labelOf(el);
      if (el.required && !v) return `${label.charAt(0) + label.slice(1).toLowerCase()} is required.`;
      if (!v) return '';
      if (el.type === 'email' && !EMAIL_RE.test(v)) return 'Enter a valid email address.';
      const rule = el.dataset.validate;
      if (rule === 'emailOrMobile' && !(EMAIL_RE.test(v) || MOBILE_RE.test(v))) return 'Enter a valid email or 10-digit mobile number.';
      if (rule === 'phone' && !/^\+?[\d\s-]{10,16}$/.test(v)) return 'Enter a valid phone number.';
      if (rule === 'card' && !/^\d{13,19}$/.test(v.replace(/\s/g, ''))) return 'Enter a valid card number.';
      if (rule === 'expiry') {
        const m = v.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
        if (!m) return 'Use MM/YY format.';
        const exp = new Date(2000 + Number(m[2]), Number(m[1]), 1);
        if (exp <= new Date()) return 'This card has expired.';
      }
      if (rule === 'cvv' && !/^\d{3,4}$/.test(v)) return 'CVV must be 3 or 4 digits.';
      if (rule === 'upi' && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(v)) return 'Enter a valid UPI ID (e.g. name@bank).';
      if (rule === 'match') { const other = el.form?.elements[el.dataset.match]; if (other && other.value !== el.value) return 'Passwords do not match.'; }
      if (el.type === 'number') {
        const n = Number(v);
        if (Number.isNaN(n)) return 'Enter a number.';
        if (el.min !== '' && n < Number(el.min)) return `Must be at least ${el.min}.`;
        if (el.max !== '' && n > Number(el.max)) return `Must be ${el.max} or less.`;
      }
      if (el.minLength > 0 && v.length < el.minLength) return `Must be at least ${el.minLength} characters.`;
      return '';
    },
    setError(el, msg) {
      const err = el.closest('.field')?.querySelector('.field-error');
      if (err) { err.textContent = msg; el.setAttribute('aria-describedby', err.id); }
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    },
    validate(form) {
      let first = null;
      $$('input, select, textarea', form).forEach((el) => {
        if (['checkbox', 'radio', 'hidden', 'submit', 'button'].includes(el.type)) return;
        const msg = this.check(el);
        this.setError(el, msg);
        if (msg && !first) first = el;
      });
      first?.focus();
      return !first;
    },
    data(form) {
      const out = {};
      $$('input, select, textarea', form).forEach((el) => {
        if (!el.name || el.closest('[hidden]')) return;
        if (el.type === 'checkbox') {
          if (el.value && el.value !== 'on') { out[el.name] = out[el.name] || []; if (el.checked) out[el.name].push(el.value); }
          else out[el.name] = el.checked;
        } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
        else out[el.name] = el.value.trim();
      });
      return out;
    },
  };

  /* 9. DATA TABLES ------------------------------------------------------
     dataTable(id, config) renders a searchable / filterable table.
     Search & filters re-render only <tbody>, so filtering is instant.    */
  const Tables = {};
  const tableState = {};
  function dataTable(id, cfg) {
    Tables[id] = cfg;
    const st = (tableState[id] ||= { q: '', filters: {} });
    const filters = (cfg.filters || []).map((f) => `<label class="filter"><span class="sr-only">${esc(f.label)}</span>
      <select class="input input--sm" data-table-filter="${id}" data-key="${f.key}">
        ${[['', f.all], ...f.options].map(([v, l]) => `<option value="${esc(v)}" ${(st.filters[f.key] || '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select></label>`).join('');
    return `<section class="card table-card" aria-labelledby="${id}-title">
      <div class="card__head"><div><h2 class="card__title" id="${id}-title">${esc(cfg.title)}</h2>${cfg.sub ? `<p class="card__sub">${cfg.sub}</p>` : ''}</div>${cfg.actions ? `<div class="card__actions">${cfg.actions}</div>` : ''}</div>
      ${cfg.search !== false || filters ? `<div class="toolbar">
        ${cfg.search !== false ? `<label class="search"><span class="sr-only">${esc(cfg.searchLabel || 'Search')}</span>${icon('search')}
          <input type="search" class="input" placeholder="${esc(cfg.searchPlaceholder || 'Search…')}" value="${esc(st.q)}" data-table-search="${id}" aria-controls="${id}" autocomplete="off"></label>` : ''}
        ${filters}</div>` : ''}
      <div class="table-wrap"><table class="table" id="${id}">
        <caption class="sr-only">${esc(cfg.title)}</caption>
        <thead><tr>${cfg.columns.map((c) => `<th scope="col" class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${tableBody(id)}</tbody></table></div>
      <p class="table-foot" id="${id}-foot" aria-live="polite">${esc(tableFoot(id))}</p>
    </section>`;
  }
  function filteredRows(id) {
    const cfg = Tables[id], st = tableState[id];
    const q = st.q.trim().toLowerCase();
    return cfg.rows().filter((r) =>
      (!q || cfg.searchText(r).toLowerCase().includes(q)) &&
      Object.entries(st.filters).every(([k, v]) => !v || cfg.filterValue(r, k) === v));
  }
  function tableBody(id) {
    const cfg = Tables[id];
    const rows = filteredRows(id);
    if (!rows.length) {
      return `<tr class="empty-row"><td colspan="${cfg.columns.length}"><div class="empty">${icon('search')}<p>No ${esc(cfg.noun)} match your search or filters.</p>
        <button type="button" class="btn btn--secondary btn--sm" data-action="table-clear" data-table="${id}">Clear filters</button></div></td></tr>`;
    }
    return rows.map((r) => `<tr data-row="${esc(cfg.rowId ? cfg.rowId(r) : '')}" class="${cfg.rowClass ? cfg.rowClass(r) : ''}">${cfg.columns.map((c) =>
      `<td data-label="${esc(c.label)}" class="${c.cls || ''}"><div>${c.render(r)}</div></td>`).join('')}</tr>`).join('');
  }
  function tableFoot(id) {
    const cfg = Tables[id];
    return `Showing ${filteredRows(id).length} of ${cfg.rows().length} ${cfg.noun}${cfg.footNote ? ` · ${cfg.footNote}` : ''}`;
  }
  function refreshTable(id) {
    const t = document.getElementById(id);
    if (!t || !Tables[id]) return;
    t.tBodies[0].innerHTML = tableBody(id);
    const foot = document.getElementById(`${id}-foot`);
    if (foot) foot.textContent = tableFoot(id);
  }
  const cellUser = (name, sub, accent = false) =>
    `<div class="cell-user"><span class="avatar ${accent ? 'avatar--accent' : ''}" aria-hidden="true">${esc(initials(name))}</span><div><div class="cell-user__name">${esc(name)}</div>${sub ? `<div class="cell-user__sub">${esc(sub)}</div>` : ''}</div></div>`;
  const actBtn = (action, id, ic, label, tone = '') =>
    `<button type="button" class="icon-btn icon-btn--sm ${tone ? `icon-btn--${tone}` : ''}" data-action="${action}" data-id="${esc(id)}" aria-label="${esc(label)}" title="${esc(label)}">${icon(ic)}</button>`;

  /* 10. CHARTS ---------------------------------------------------------- */
  function niceStep(raw) {
    if (raw <= 0) return 1;
    const exp = 10 ** Math.floor(Math.log10(raw));
    const f = raw / exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  }
  function scale(values, zero = true) {
    const max = Math.max(...values), min = Math.min(...values);
    if (zero) {
      const step = niceStep((max || 1) / 5);
      const hi = Math.max(step * 3, Math.ceil((max * 1.04) / step) * step);
      const ticks = []; for (let v = 0; v <= hi + 1e-9; v += step) ticks.push(v);
      return { lo: 0, hi, ticks };
    }
    const pad = (max - min) * 0.15 || 1;
    const step = niceStep((max - min + pad * 2) / 4);
    const lo = Math.floor((min - pad) / step) * step, hi = Math.ceil((max + pad) / step) * step;
    const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(4));
    return { lo, hi, ticks };
  }
  function chartFrame({ ticks, fmtTick, height, dense, label, plot, xLabels, bars }) {
    return `<div class="chart ${dense ? 'chart--dense' : ''}" style="--h:${height}px" role="img" aria-label="${esc(label)}">
      <div class="chart__y" aria-hidden="true">${[...ticks].reverse().map((t) => `<span>${esc(fmtTick(t))}</span>`).join('')}</div>
      <div class="chart__plot"><div class="chart__grid" aria-hidden="true">${ticks.map(() => '<span></span>').join('')}</div>${plot}</div>
      <div class="chart__x ${bars ? 'chart__x--bars' : ''}" aria-hidden="true">${xLabels}</div>
    </div>`;
  }
  /** Vertical bar chart (HTML/CSS bars for crisp, responsive labels) */
  function barChart({ labels, values, highlight = -1, fmt = (v) => fmtNum(v), fmtTick = (v) => fmtNum(v), height = 220, label = 'Bar chart', tone = '' }) {
    const { hi, ticks } = scale(values, true);
    const bars = values.map((v, i) => `<div class="bar-col"><div class="bar ${i === highlight ? 'is-hl' : tone} ${v === 0 ? 'is-zero' : ''}"
        style="--v:${((v / hi) * 100).toFixed(2)}%;--d:${i * 45}ms" data-tip="${esc(labels[i])}: ${esc(fmt(v))}" tabindex="0" aria-label="${esc(labels[i])}: ${esc(fmt(v))}"></div></div>`).join('');
    return chartFrame({
      ticks, fmtTick, height, label, bars: true, dense: labels.length > 8,
      plot: `<div class="chart__bars" style="--bar-gap:${labels.length > 10 ? 6 : 10}px">${bars}</div>`,
      xLabels: labels.map((l, i) => `<span class="${i === highlight ? 'is-hl' : ''}">${esc(l)}</span>`).join(''),
    });
  }
  /** Line / area chart (SVG path + HTML dots and tooltips) */
  function lineChart({ labels, series, fmt = (v) => fmtNum(v), fmtTick = (v) => fmtNum(v), height = 220, zero = false, label = 'Line chart', area = true }) {
    const all = series.flatMap((s) => s.values);
    const { lo, hi, ticks } = scale(all, zero);
    const n = labels.length;
    const X = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
    const Y = (v) => 100 - ((v - lo) / (hi - lo || 1)) * 100;
    let svg = '', dots = '';
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => `${X(i).toFixed(2)},${Y(v).toFixed(2)}`);
      const line = `M${pts.join(' L')}`;
      if (area && si === 0) svg += `<path class="chart__area" d="${line} L100,100 L0,100 Z"/>`;
      svg += `<path class="chart__line ${s.tone ? `chart__line--${s.tone}` : ''}" d="${line}"/>`;
      if (!s.noDots) {
        dots += s.values.map((v, i) => `<span class="chart__dot ${s.tone ? `chart__dot--${s.tone}` : ''} ${i === n - 1 && si === 0 ? 'chart__dot--last' : ''}" style="left:${X(i)}%;top:${Y(v)}%"
          data-tip="${esc(labels[i])}: ${esc(fmt(v))}" tabindex="0" aria-label="${esc(s.name || '')} ${esc(labels[i])}: ${esc(fmt(v))}"></span>`).join('');
      }
    });
    return chartFrame({
      ticks, fmtTick, height, label, dense: n > 8,
      plot: `<svg class="chart__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>${dots}`,
      xLabels: labels.map((l) => `<span>${esc(l)}</span>`).join(''),
    });
  }
  function ring(pct, { size = 132, stroke = 11, label = '', sub = '', tone = '' } = {}) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - clamp(pct, 0, 100) / 100);
    return `<div class="ring" style="--size:${size}px" role="img" aria-label="${esc(`${label} ${sub}`)}">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="ring__value ${tone ? `ring__value--${tone}` : ''}" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" style="--c:${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
      <div class="ring__center"><strong>${esc(label)}</strong><span>${esc(sub)}</span></div></div>`;
  }
  const progress = (pct, tone = '', size = '', labelText = '') =>
    `<div class="progress ${tone ? `progress--${tone}` : ''} ${size ? `progress--${size}` : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" ${labelText ? `aria-label="${esc(labelText)}"` : ''}><span style="--v:${clamp(pct, 0, 100)}%"></span></div>`;
  const stars = (rating, reviews) => `<span class="stars" aria-label="Rated ${rating} out of 5${reviews ? ` from ${reviews} reviews` : ''}">${[1, 2, 3, 4, 5].map((i) => starIcon(rating >= i - 0.25)).join('')}<b>${rating.toFixed(1)}</b>${reviews ? `<em>(${reviews})</em>` : ''}</span>`;

  /* Generic building blocks */
  const pageHead = ({ eyebrow, title, sub = '', actions = '' }) => `<header class="page-head">
      <div><p class="eyebrow">${esc(eyebrow)}</p><h1 class="page-title" id="page-heading" tabindex="-1">${esc(title)}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
  const kpi = ({ label, value, meta = '', ic = 'activity', tone = '' }) => `<article class="kpi ${tone ? `kpi--${tone}` : ''}">
      <div class="kpi__top"><span class="kpi__label">${esc(label)}</span><span class="kpi__icon">${icon(ic)}</span></div>
      <p class="kpi__value">${value}</p>${meta ? `<p class="kpi__meta">${meta}</p>` : ''}</article>`;
  const card = ({ title, sub = '', actions = '', body = '', cls = '', id = '' }) => `<section class="card ${cls}" ${id ? `id="${id}"` : ''} ${title ? `aria-label="${esc(title)}"` : ''}>
      ${title ? `<div class="card__head"><div><h2 class="card__title">${esc(title)}</h2>${sub ? `<p class="card__sub">${sub}</p>` : ''}</div>${actions ? `<div class="card__actions">${actions}</div>` : ''}</div>` : ''}${body}</section>`;
  const btn = (label, { action = '', variant = 'secondary', ic = '', size = '', attrs = '', href = '' } = {}) => href
    ? `<a class="btn btn--${variant} ${size ? `btn--${size}` : ''}" href="${href}" ${attrs}>${ic ? icon(ic) : ''}${esc(label)}</a>`
    : `<button type="button" class="btn btn--${variant} ${size ? `btn--${size}` : ''}" ${action ? `data-action="${action}"` : ''} ${attrs}>${ic ? icon(ic) : ''}${esc(label)}</button>`;
  const delta = (text, dir = 'up') => `<span class="delta delta--${dir}">${dir === 'up' ? '↑' : dir === 'down' ? '↓' : ''} ${esc(text)}</span>`;
  const listItem = ({ ic, tone = '', title, sub = '', right = '' }) => `<li class="list-item">${ic ? `<span class="list-item__icon ${tone ? `list-item__icon--${tone}` : ''}">${icon(ic)}</span>` : ''}
      <div class="list-item__main"><p class="list-item__title">${title}</p>${sub ? `<p class="list-item__sub">${sub}</p>` : ''}</div>${right}</li>`;

  /* 11. PUBLIC VIEWS ---------------------------------------------------- */
  const app = () => $('#app');
  const ROLE_ROUTES = { member: 'login-member', owner: 'login-owner', superadmin: 'login-superadmin' };
  const ROLE_NAMES = { member: 'Member', owner: 'Gym Admin', superadmin: 'Super Admin' };

  function renderLanding() {
    document.body.className = 'landing-body';
    const s = Session.get();
    const features = [
      ['idcard', 'Memberships & plans', 'Create plans, automate renewals and see every expiring membership before it churns.'],
      ['scan', 'Attendance & live floor', 'QR check-ins, live zone occupancy and session duration tracking in real time.'],
      ['dumbbell', 'Workout programming', 'Trainers assign programs; members log sets, reps and completion from their phone.'],
      ['wallet', 'Payments & invoicing', 'UPI, cards and cash reconciled in one ledger with pending and refund tracking.'],
      ['trending', 'Progress analytics', 'Weight, strength and cardio progress charts that keep members accountable.'],
      ['globe', 'Multi-gym network', 'One console for platform owners to approve, monitor and scale hundreds of gyms.'],
    ];
    app().innerHTML = `
    <div class="landing">
      <button type="button" class="skip-link" data-action="skip-to" data-target="main">Skip to content</button>
      <header class="site-header" id="site-header">
        <div class="container site-header__inner">
          <a href="#/" aria-label="FitHub home">${logo()}</a>
          <nav class="site-nav" aria-label="Primary">
            <button type="button" data-action="scroll-to" data-target="features">Features</button>
            <button type="button" data-action="scroll-to" data-target="members">For Members</button>
            <button type="button" data-action="scroll-to" data-target="gyms">For Gyms</button>
            <button type="button" data-action="scroll-to" data-target="about">About</button>
          </nav>
          <div class="site-header__actions">
            ${s ? btn('Open dashboard', { href: '#/dashboard', variant: 'primary', size: 'sm', ic: 'grid' })
              : `<a class="btn btn--secondary btn--sm hide-md" href="#/roles">Login</a>${btn('Get Started', { href: '#/roles', variant: 'primary', size: 'sm' })}`}
            <button type="button" class="icon-btn site-header__menu" data-action="toggle-site-menu" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu">${icon('menu')}</button>
          </div>
        </div>
        <div class="mobile-menu" id="mobile-menu">
          <button type="button" data-action="scroll-to" data-target="features">Features</button>
          <button type="button" data-action="scroll-to" data-target="members">For Members</button>
          <button type="button" data-action="scroll-to" data-target="gyms">For Gyms</button>
          <button type="button" data-action="scroll-to" data-target="about">About</button>
          ${btn(s ? 'Open dashboard' : 'Login', { href: s ? '#/dashboard' : '#/roles', variant: 'secondary', attrs: 'style="width:100%"' })}
        </div>
      </header>

      <main id="main" tabindex="-1">
        <section class="hero" aria-labelledby="hero-title">
          <div class="container hero__grid">
            <div>
              <div class="hero__brand"><span class="rule"></span>${logo()}<span>Your complete fitness ecosystem</span></div>
              <h1 class="hero__title" id="hero-title"><span>Train.</span><span>Track.</span><span>Grow.</span></h1>
              <p class="hero__subtitle">Your complete fitness ecosystem.</p>
              <p class="hero__desc">FitHub connects gym members, gym owners and fitness businesses in one intelligent platform for memberships, attendance, workouts, payments and gym management.</p>
              <div class="hero__cta">
                ${btn('Enter FitHub', { href: '#/roles', variant: 'primary', size: 'lg', ic: 'arrowRight' })}
                ${btn('Explore Features', { action: 'scroll-to', variant: 'secondary', size: 'lg', attrs: 'data-target="features"' })}
              </div>
              <div class="hero__proof">
                <div><strong>86</strong><span>Gyms on the network</span></div>
                <div><strong>18,420</strong><span>Active members</span></div>
                <div><strong>99.98%</strong><span>Platform uptime</span></div>
              </div>
            </div>
            <div class="hero-visual" aria-hidden="true">
              <span class="hero-visual__word">FIT</span>
              <span class="hero-visual__slash"></span>
              <div class="float-chip float-chip--a"><span class="list-item__icon list-item__icon--success">${icon('scan')}</span><div><strong>118</strong><span>Check-ins today</span></div></div>
              <div class="hero-panel">
                <div class="hero-panel__head"><div><p>Sunday · Member</p><h3>Arjun’s Week</h3></div>${badge('12 day streak', 'accent')}</div>
                <div class="hero-panel__row">${ring(74, { size: 96, stroke: 9, label: '74%', sub: 'Program' })}
                  <div class="mini-bars">${[62, 48, 75, 4, 58, 90, 35].map((v, i) => `<span class="${i === 6 ? 'is-hl' : ''}" style="--v:${v}%;--d:${i * 60}ms"></span>`).join('')}</div></div>
                <div class="hero-panel__row" style="display:block">
                  ${[['Bench Press', '4 × 8', true], ['Incline DB Press', '3 × 10', true], ['Lat Pulldown', '4 × 10', false], ['Seated Cable Row', '3 × 12', false]]
                    .map(([n, r, d]) => `<div class="hero-panel__ex"><span><span class="tick ${d ? 'is-done' : ''}">${d ? icon('check') : ''}</span>${n}</span><span class="muted">${r}</span></div>`).join('')}
                </div>
              </div>
              <div class="float-chip float-chip--b"><span class="list-item__icon list-item__icon--accent">${icon('trending')}</span><div><strong>₹8.46L</strong><span>Monthly revenue · ↑ 6.4%</span></div></div>
            </div>
          </div>
        </section>

        <section class="band" aria-label="Platform numbers">
          <div class="container band__grid">
            <div class="band__item"><strong>86</strong><span>Partner gyms across 12 cities</span></div>
            <div class="band__item"><strong>18.4K</strong><span>Members training every month</span></div>
            <div class="band__item"><strong>₹2.84Cr</strong><span>Monthly payments processed</span></div>
            <div class="band__item"><strong>1.2M</strong><span>Check-ins recorded</span></div>
          </div>
        </section>

        <section class="section" id="features" aria-labelledby="features-title">
          <div class="container">
            <div class="section-head"><p class="eyebrow">Features</p><h2 class="section-title" id="features-title">One platform. <em>Every rep.</em></h2>
              <p class="section-lead">From the front desk to the platform console, FitHub replaces spreadsheets, paper registers and five disconnected apps.</p></div>
            <div class="feature-grid">${features.map(([ic, t, d], i) => `<article class="feature"><span class="feature__num">0${i + 1}</span><div class="feature__icon">${icon(ic)}</div><h3>${t}</h3><p>${d}</p></article>`).join('')}</div>
          </div>
        </section>

        <section class="section" id="members" aria-labelledby="members-title" style="padding-top:0">
          <div class="container split">
            <div>
              <p class="eyebrow">For Members</p>
              <h2 class="section-title" id="members-title">Your training, <em>in your pocket.</em></h2>
              <p class="section-lead">Check in with a tap, follow today’s workout, watch your streak grow and manage your membership without queuing at the desk.</p>
              <ul class="check-list">
                ${[['One-tap check-in', 'Instant attendance and streak tracking.'], ['Guided workouts', 'Sets, reps and loads from your trainer.'], ['Progress you can see', 'Weight, strength and running trends.'], ['Self-serve billing', 'Renew, upgrade and download invoices.']]
                  .map(([t, d]) => `<li><span class="tick is-done">${icon('check')}</span><div><strong>${t}</strong><p>${d}</p></div></li>`).join('')}
              </ul>
              <div class="hero__cta">${btn('Join as a member', { href: '#/login-member', variant: 'primary', ic: 'biceps' })}</div>
            </div>
            <div class="showcase" aria-hidden="true">
              <div class="flex between" style="margin-bottom:18px"><div><p class="eyebrow">Weekly activity</p><p class="muted text-sm mt-8">Minutes trained</p></div>${badge('+18% vs last week', 'success')}</div>
              ${barChart({ labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], values: [62, 48, 75, 0, 58, 90, 35], highlight: 6, height: 190, fmt: (v) => `${v} min` })}
            </div>
          </div>
        </section>

        <section class="section" id="gyms" aria-labelledby="gyms-title" style="padding-top:0">
          <div class="container split split--rev">
            <div>
              <p class="eyebrow">For Gyms</p>
              <h2 class="section-title" id="gyms-title">Run the floor. <em>Grow the business.</em></h2>
              <p class="section-lead">Owners get a real-time command centre: who is inside, who is about to churn, what was collected today and which trainers are delivering.</p>
              <ul class="check-list">
                ${[['Member CRM', 'Search, pause, renew and message in seconds.'], ['Live attendance', 'Zone occupancy and peak-hour insight.'], ['Revenue control', 'Collected, pending and refunds at a glance.'], ['Reports on demand', 'Revenue, attendance and membership CSV exports.']]
                  .map(([t, d]) => `<li><span class="tick is-done">${icon('check')}</span><div><strong>${t}</strong><p>${d}</p></div></li>`).join('')}
              </ul>
              <div class="hero__cta">${btn('Open gym console', { href: '#/login-owner', variant: 'primary', ic: 'building' })}</div>
            </div>
            <div class="showcase" aria-hidden="true">
              <div class="showcase__kpis">
                <div class="showcase__kpi"><span>Active members</span><strong>642</strong></div>
                <div class="showcase__kpi"><span>Today’s check-ins</span><strong>118</strong></div>
                <div class="showcase__kpi"><span>Monthly revenue</span><strong class="text-accent">₹8.46L</strong></div>
                <div class="showcase__kpi"><span>Expiring soon</span><strong class="text-warning">27</strong></div>
              </div>
              <div class="mt-20">${lineChart({ labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], series: [{ values: [6.92, 7.18, 7.64, 7.9, 8.12, 8.46] }], height: 150, fmt: (v) => `₹${v}L`, fmtTick: (v) => `${v}L` })}</div>
            </div>
          </div>
        </section>

        <section class="section" id="about" aria-labelledby="about-title" style="padding-top:0">
          <div class="container">
            <div class="section-head"><p class="eyebrow">About FitHub</p><h2 class="section-title" id="about-title">Built for the <em>modern gym.</em></h2>
              <p class="section-lead">FitHub is a fitness operating system for independent gyms and growing chains. We obsess over speed at the front desk and clarity in the numbers.</p></div>
            <div class="about">
              <article class="about__card"><h3>Three roles, one ecosystem</h3><p>Members, gym owners and platform administrators each get a purpose-built workspace, connected by the same live data — no exports, no double entry.</p></article>
              <article class="about__card"><h3>Designed for mobile first</h3><p>Most check-ins, workouts and renewals happen on a phone. Every FitHub screen is built to work one-handed on the gym floor, then scales up to a full desktop console.</p></article>
            </div>
            <div class="cta mt-24">
              <div><h2>Ready to train smarter?</h2><p>Choose your role and explore the full FitHub demo in under a minute.</p></div>
              ${btn('Enter FitHub', { href: '#/roles', variant: 'primary', size: 'lg', ic: 'arrowRight' })}
            </div>
          </div>
        </section>
      </main>
      <footer class="site-footer"><div class="container site-footer__inner">${logo()}<span>© ${new Date().getFullYear()} FitHub. Your complete fitness ecosystem.</span><span>Front-end demo · sample data only</span></div></footer>
    </div>`;
  }

  function renderRoles() {
    document.body.className = 'auth-body';
    const s = Session.get();
    const roles = [
      ['member', 'biceps', 'Member', 'Find gyms, track attendance, manage membership', ''],
      ['owner', 'building', 'Gym Owner / Admin', 'Manage members, view enquiries, track activity', ''],
      ['superadmin', 'crown', 'Super Admin', 'Full platform control — all gyms and members', 'role-card--gold'],
    ];
    app().innerHTML = `<main class="auth" id="main" tabindex="-1">
      <div class="auth__inner">
        <div class="auth__brand"><a href="#/" aria-label="FitHub home">${logo('logo--xl')}</a><p class="auth__tagline">Your complete fitness ecosystem</p></div>
        ${s ? `<div class="session-banner">${icon('user')}<p>Signed in as <strong>${esc(s.user.name)}</strong> · ${ROLE_NAMES[s.role]}</p>${btn('Continue', { href: '#/dashboard', variant: 'primary', size: 'sm' })}</div>` : ''}
        <h1 class="auth__label">CHOOSE YOUR ROLE</h1>
        <div class="role-list">
          ${roles.map(([id, ic, title, desc, cls]) => `<a class="role-card ${cls}" href="#/${ROLE_ROUTES[id]}">
            <span class="role-card__icon">${icon(ic)}</span>
            <span class="role-card__body"><span class="role-card__title">${title}</span><span class="role-card__desc" style="display:block">${desc}</span></span>
            <span class="role-card__arrow">${icon('chevronRight')}</span></a>`).join('')}
        </div>
        <div class="auth__foot"><a class="back-link" href="#/">${icon('arrowLeft')} Back to home</a></div>
      </div></main>`;
  }

  const LOGIN_CONFIG = {
    member: { heading: 'WELCOME BACK', idLabel: 'Email / Mobile', idPlaceholder: 'you@example.com or mobile', submit: 'Sign In', demoTitle: 'DEMO CREDENTIALS', back: '← Back to roles', demo: 'user@fithub.com', extra: true },
    owner: { heading: 'GYM OWNER LOGIN', idLabel: 'Email or Mobile', idPlaceholder: 'admin@yourgym.com', submit: 'Sign In as Admin', demoTitle: 'DEMO CREDENTIALS', back: '← Back to roles', demo: 'admin@irontemple.com' },
    superadmin: { heading: 'SUPER ADMIN', idLabel: 'Email', idPlaceholder: 'you@fithub.com', submit: 'Access Super Admin', demoTitle: 'PLATFORM OWNER ACCESS', back: '← Back', demo: 'superadmin@fithub.com', gold: true },
  };
  function renderLogin(role) {
    document.body.className = 'auth-body';
    const c = LOGIN_CONFIG[role];
    app().innerHTML = `<main class="auth ${c.gold ? 'auth--gold' : ''}" id="main" tabindex="-1">
      <div class="auth__inner">
        <div class="auth__brand"><a href="#/" aria-label="FitHub home">${logo('logo--xl')}</a></div>
        <h1 class="auth__heading">${c.heading}</h1>
        <div class="demo-card ${c.gold ? 'demo-card--gold' : ''}">
          <div class="demo-card__body">
            <p class="demo-card__title">${c.gold ? icon('crown') : ''}${c.demoTitle}</p>
            <p class="demo-card__row">Email: <b>${c.demo}</b></p>
            <p class="demo-card__row">Password: <b>any</b></p>
          </div>
          <button type="button" class="btn btn--sm ${c.gold ? 'btn--gold' : 'btn--secondary'}" data-action="fill-demo" data-email="${c.demo}">Use demo</button>
        </div>
        <form class="auth__form" data-form="login" data-role="${role}" novalidate>
          <div class="form-alert" id="login-alert" role="alert" hidden>${icon('alert')}<span></span></div>
          ${Form.field({ name: 'identifier', label: c.idLabel, type: role === 'superadmin' ? 'email' : 'text', required: true, placeholder: c.idPlaceholder, autocomplete: 'username', attrs: role === 'superadmin' ? 'inputmode="email"' : 'data-validate="emailOrMobile" inputmode="email"' })}
          ${Form.field({ name: 'password', label: 'Password', type: 'password', required: true, placeholder: 'Enter your password', autocomplete: 'current-password' })}
          <div class="auth__actions">
            <button type="submit" class="btn btn--lg btn--block ${c.gold ? 'btn--gold' : 'btn--primary'}">${esc(c.submit)}</button>
            ${c.extra ? `<button type="button" class="btn btn--lg btn--block btn--secondary" data-action="create-account">Create Account</button>` : ''}
          </div>
        </form>
        <div class="auth__foot"><a class="back-link" href="#/roles">${esc(c.back)}</a></div>
        <p class="auth__note">${icon('lock')}Demo environment · client-side sign-in for demonstration only.<br>Production authentication must be verified by a secure server.</p>
      </div></main>`;
  }

  /* 12. DASHBOARD SHELL -------------------------------------------------- */
  const ROLE_META = {
    member: {
      home: 'overview',
      nav: [['overview', 'Overview', 'grid'], ['workouts', 'My Workouts', 'dumbbell'], ['attendance', 'Attendance', 'calendar'], ['membership', 'Membership', 'idcard'], ['payments', 'Payments', 'card'], ['progress', 'Progress', 'trending'], ['profile', 'Profile', 'user']],
      context: () => ({ eyebrow: 'Member', title: DB.member.gym, sub: DB.member.branch }),
    },
    owner: {
      home: 'overview',
      nav: [['overview', 'Overview', 'grid'], ['members', 'Members', 'users'], ['attendance', 'Attendance', 'scan'], ['plans', 'Plans', 'clipboard'], ['trainers', 'Trainers', 'award'], ['payments', 'Payments', 'wallet'], ['reports', 'Reports', 'bar'], ['settings', 'Settings', 'sliders']],
      context: () => ({ eyebrow: 'Gym Admin', title: DB.gym.name, sub: DB.gym.branch }),
    },
    superadmin: {
      home: 'overview',
      nav: [['overview', 'Overview', 'grid'], ['gyms', 'Gyms', 'building'], ['owners', 'Owners', 'shield'], ['members', 'Members', 'users'], ['activity', 'Activity', 'activity'], ['analytics', 'Analytics', 'bar'], ['settings', 'System Settings', 'sliders']],
      context: () => ({ eyebrow: 'Super Admin', title: 'FitHub Platform', sub: 'All regions · 86 gyms' }),
    },
  };
  const UI = { role: null, section: null, rangeMonths: 12 };

  function renderShell(role, session) {
    document.body.className = 'app-body';
    const meta = ROLE_META[role];
    const ctx = meta.context();
    const user = session.user;
    const unread = NOTIFICATIONS[role].filter((n) => n.unread).length;
    const bottom = meta.nav.slice(0, 4);
    app().innerHTML = `<div class="shell" data-role="${role}">
      <button type="button" class="skip-link" data-action="skip-to" data-target="main-content">Skip to content</button>
      <aside class="sidebar" id="sidebar" aria-label="Sidebar">
        <div class="sidebar__brand"><a href="#/dashboard/${meta.home}" aria-label="FitHub dashboard home">${logo()}</a>
          <button type="button" class="icon-btn sidebar__close" data-action="close-drawer" aria-label="Close menu">${icon('x')}</button></div>
        <div class="sidebar__context"><p class="eyebrow">${esc(ctx.eyebrow)}</p><strong>${esc(ctx.title)}</strong><span>${esc(ctx.sub)}</span></div>
        <nav class="nav" aria-label="Dashboard navigation">
          <p class="nav__label">Menu</p>
          ${meta.nav.map(([id, label, ic]) => `<a class="nav__link" href="#/dashboard/${id}" data-section="${id}">${icon(ic)}<span>${label}</span></a>`).join('')}
        </nav>
        <div class="sidebar__foot"><div class="user-chip"><span class="avatar avatar--accent" aria-hidden="true">${esc(initials(user.name))}</span>
          <div class="user-chip__text"><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span></div>
          <button type="button" class="icon-btn" data-action="logout" aria-label="Log out" title="Log out">${icon('logout')}</button></div></div>
      </aside>
      <div class="scrim" data-action="close-drawer" hidden></div>
      <div class="main">
        <div class="maintenance-bar" id="maintenance-bar" ${DB.platform.settings.maintenance ? '' : 'hidden'} role="status">${icon('alert')}Maintenance mode is ON — members and gym admins see a maintenance notice.</div>
        <header class="topbar">
          <button type="button" class="icon-btn topbar__menu" data-action="open-drawer" aria-label="Open navigation menu" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>
          <a class="topbar__logo" href="#/dashboard/${meta.home}" aria-label="FitHub dashboard home">${logo()}</a>
          <div class="topbar__crumb">${esc(ctx.title)} ${icon('chevronRight')} <strong id="crumb-current">Overview</strong></div>
          <div class="topbar__actions">
            ${role !== 'member' ? `<button type="button" class="btn btn--secondary btn--sm hide-sm" data-action="open-announcement">${icon('megaphone')}Announcement</button>` : `<button type="button" class="btn btn--primary btn--sm hide-sm" data-action="quick-checkin">${icon('scan')}Check in</button>`}
            <div class="popover-anchor">
              <button type="button" class="icon-btn" data-action="toggle-popover" data-popover="notif-pop" aria-haspopup="true" aria-expanded="false" aria-label="Notifications${unread ? `, ${unread} unread` : ''}">${icon('bell')}${unread ? `<span class="count" id="notif-count">${unread}</span>` : ''}</button>
              <div class="popover" id="notif-pop" hidden role="dialog" aria-label="Notifications">
                <div class="popover__head"><strong>Notifications</strong><button type="button" class="card__link" data-action="mark-all-read">Mark all read</button></div>
                <div class="popover__body">${NOTIFICATIONS[role].map((n) => `<div class="notif ${n.unread ? 'is-unread' : ''}"><span class="notif__dot"></span><div><p>${esc(n.text)}</p><span>${relTime(n.at)}</span></div></div>`).join('')}</div>
              </div>
            </div>
            <div class="popover-anchor">
              <button type="button" class="icon-btn topbar__avatar" data-action="toggle-popover" data-popover="user-pop" aria-haspopup="true" aria-expanded="false" aria-label="Account menu"><span class="avatar avatar--accent">${esc(initials(user.name))}</span></button>
              <div class="popover" id="user-pop" hidden style="width:260px">
                <div class="popover__user"><strong>${esc(user.name)}</strong><span>${esc(user.email)} · ${ROLE_NAMES[role]}</span></div>
                <div class="menu-list">
                  ${role === 'member' ? `<a href="#/dashboard/profile">${icon('user')}Profile</a>` : `<a href="#/dashboard/settings">${icon('sliders')}Settings</a>`}
                  <a href="#/roles">${icon('refresh')}Switch role</a>
                  <button type="button" data-action="logout">${icon('logout')}Log out</button>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main class="content" id="main-content" tabindex="-1"></main>
      </div>
      <nav class="bottom-nav" aria-label="Quick navigation"><div class="bottom-nav__inner">
        ${bottom.map(([id, label, ic]) => `<a class="bottom-nav__link" href="#/dashboard/${id}" data-section="${id}">${icon(ic)}<span>${label.replace('My ', '')}</span></a>`).join('')}
        <button type="button" class="bottom-nav__link" data-action="open-drawer" aria-label="More navigation options">${icon('more')}<span>More</span></button>
      </div></nav>
    </div>`;
  }

  function setActiveNav(section) {
    $$('[data-section]').forEach((a) => {
      const on = a.dataset.section === section;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const label = ROLE_META[UI.role].nav.find((n) => n[0] === section)?.[1] || '';
    const crumb = $('#crumb-current');
    if (crumb) crumb.textContent = label;
    document.title = `${label} · FitHub ${ROLE_NAMES[UI.role]}`;
  }
  function openDrawer() {
    $('#sidebar')?.classList.add('is-open');
    const scrim = $('.scrim'); if (scrim) scrim.hidden = false;
    document.body.classList.add('drawer-open');
    $('.topbar__menu')?.setAttribute('aria-expanded', 'true');
    $('#sidebar .nav__link.is-active, #sidebar .nav__link')?.focus();
  }
  function closeDrawer() {
    const sb = $('#sidebar');
    if (!sb || !sb.classList.contains('is-open')) return;
    sb.classList.remove('is-open');
    const scrim = $('.scrim'); if (scrim) scrim.hidden = true;
    document.body.classList.remove('drawer-open');
    $('.topbar__menu')?.setAttribute('aria-expanded', 'false');
  }
  function closePopovers(except) {
    $$('.popover').forEach((p) => {
      if (p.id === except) return;
      p.hidden = true;
      $(`[data-popover="${p.id}"]`)?.setAttribute('aria-expanded', 'false');
    });
  }

  /* 13. MEMBER PORTAL --------------------------------------------------- */
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIdx = () => (new Date().getDay() + 6) % 7;
  const M = () => DB.member;
  const memberDaysLeft = () => Math.max(0, daysBetween(T, M().renewal));
  const programPct = () => Math.round((M().sessionsDone / M().sessionsPlanned) * 100);
  const workoutDone = () => M().workout.exercises.filter((e) => e.done).length;
  const checkedInToday = () => M().attendance[0] && sameDay(M().attendance[0].date, new Date());

  function exerciseList(numbered = false) {
    return `<ol class="exercise-list" aria-label="Exercises">${M().workout.exercises.map((e, i) => `<li class="exercise ${e.done ? 'is-done' : ''}">
      ${numbered ? `<span class="exercise__num" aria-hidden="true">${i + 1}</span>` : ''}
      <button type="button" class="exercise__check" data-action="toggle-exercise" data-id="${e.id}" aria-pressed="${e.done}" aria-label="${e.done ? 'Mark as not done' : 'Mark as complete'}: ${esc(e.name)}">${icon('check')}</button>
      <div class="exercise__info"><p class="exercise__name">${esc(e.name)}</p><p class="exercise__meta">${e.sets} sets × ${esc(e.reps)} reps · ${esc(e.load)}</p></div>
      ${e.done ? badge('Done', 'success') : badge('Pending', 'neutral')}</li>`).join('')}</ol>`;
  }
  function workoutCard({ full = false } = {}) {
    const w = M().workout, done = workoutDone(), total = w.exercises.length, pct = (done / total) * 100;
    return card({
      title: "Today's Workout",
      sub: `${DOW[todayIdx()]} · assigned by ${esc(M().trainer)}`,
      actions: full ? `${btn('Reset', { action: 'reset-workout', variant: 'ghost', size: 'sm', ic: 'undo' })}${btn('Complete all', { action: 'complete-all', variant: 'primary', size: 'sm', ic: 'check' })}` : `<a class="card__link" href="#/dashboard/workouts">Details ${icon('chevronRight')}</a>`,
      body: `<div class="workout-head"><div><h3>${esc(w.title)}</h3><p>${esc(w.focus)} · ~${w.duration} min</p></div>${done === total ? badge('Completed', 'success') : badge(`${done}/${total} done`, 'accent')}</div>
        <div class="workout-progress">${progress(pct, done === total ? 'success' : '', '', 'Workout completion')}<span class="tabular">${Math.round(pct)}%</span></div>
        ${exerciseList(full)}`,
    });
  }
  function attendanceTable(limit) {
    const rows = limit ? M().attendance.slice(0, limit) : M().attendance;
    return `<div class="table-wrap"><table class="table"><caption class="sr-only">Attendance history</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Gym</th><th scope="col">Check-in</th><th scope="col">Duration</th><th scope="col">Status</th></tr></thead>
      <tbody>${rows.map((a) => `<tr><td data-label="Date" class="col-primary"><div class="cell-user"><span class="list-item__icon ${a.status === 'In progress' ? 'list-item__icon--accent' : ''}">${icon('calendar')}</span><div><div class="cell-user__name">${fmtDate(a.date)}</div><div class="cell-user__sub">${relDay(a.date)}</div></div></div></td>
        <td data-label="Gym">${esc(a.gym)}</td><td data-label="Check-in" class="tabular">${fmtTime(a.date)}</td>
        <td data-label="Duration" class="tabular">${a.duration ? fmtDuration(a.duration) : '—'}</td><td data-label="Status">${badge(a.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  const MemberSections = {
    overview() {
      const m = M(), days = memberDaysLeft(), weekTotal = m.weekly.reduce((a, b) => a + b, 0);
      const plan = planById(m.planId);
      return `${pageHead({ eyebrow: 'Member', title: 'Member Dashboard', sub: `Welcome back, <strong>${esc(firstName(m.name))}</strong>. ${checkedInToday() ? 'You’re checked in — have a strong session.' : 'Ready for today’s upper body session?'}`,
          actions: btn(checkedInToday() ? 'Checked in' : 'Quick Check-in', { action: 'quick-checkin', variant: 'primary', ic: 'scan' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Current Streak', value: `${m.streak}<small>days</small>`, meta: `Best: ${m.bestStreak} days`, ic: 'flame', tone: 'accent' })}
            ${kpi({ label: 'Visits This Month', value: m.visitsThisMonth, meta: `${delta('4 vs last month')}`, ic: 'calendar', tone: 'success' })}
            ${kpi({ label: 'Workout Progress', value: `${programPct()}<small>%</small>`, meta: `${m.sessionsDone} of ${m.sessionsPlanned} sessions`, ic: 'target', tone: 'info' })}
            ${kpi({ label: 'Membership', value: `${days}<small>days</small>`, meta: `${esc(plan.name)} · renews ${fmtShort(m.renewal)}`, ic: 'idcard', tone: days <= 7 ? 'warning' : '' })}
          </div>
          <div class="grid grid--main">
            ${card({ title: 'Weekly Activity', sub: 'Minutes trained this week', actions: badge('+18% vs last week', 'success'),
              body: `<div class="chart-summary"><div><span>Total</span><strong>${fmtDuration(weekTotal)}</strong></div><div><span>Daily avg</span><strong>${Math.round(weekTotal / 7)} min</strong></div><div><span>Active days</span><strong>${m.weekly.filter(Boolean).length}/7</strong></div></div>
                ${barChart({ labels: DOW, values: m.weekly, highlight: todayIdx(), fmt: (v) => `${v} min`, label: 'Minutes trained per day this week', height: 230 })}` })}
            ${workoutCard()}
          </div>
          <div class="grid grid--main-r">
            ${card({ title: 'Quick Actions', body: `<div class="quick-grid">
              <button type="button" class="quick quick--primary" data-action="quick-checkin"><span class="quick__icon">${icon('scan')}</span><span><span class="quick__title" style="display:block">Quick Check-in</span><span class="quick__sub" style="display:block">${checkedInToday() ? 'Checked in today' : 'Iron Temple · Andheri'}</span></span></button>
              <a class="quick" href="#/dashboard/membership"><span class="quick__icon">${icon('idcard')}</span><span><span class="quick__title" style="display:block">Membership</span><span class="quick__sub" style="display:block">${days} days left</span></span></a>
              <a class="quick" href="#/dashboard/progress"><span class="quick__icon">${icon('trending')}</span><span><span class="quick__title" style="display:block">Progress</span><span class="quick__sub" style="display:block">−5.6 kg in 12 weeks</span></span></a>
              <button type="button" class="quick" data-action="ask-trainer"><span class="quick__icon">${icon('message')}</span><span><span class="quick__title" style="display:block">Ask Trainer</span><span class="quick__sub" style="display:block">${esc(m.trainer)}</span></span></button>
            </div>` })}
            <section class="card table-card" aria-labelledby="att-recent"><div class="card__head"><div><h2 class="card__title" id="att-recent">Member Attendance</h2><p class="card__sub">Your most recent visits</p></div><a class="card__link" href="#/dashboard/attendance">View all ${icon('chevronRight')}</a></div>
              ${attendanceTable(5)}</section>
          </div>
        </div>`;
    },

    workouts() {
      const m = M();
      const avg = Math.round(m.sessions.reduce((a, s) => a + s.duration, 0) / (m.sessions.length || 1));
      return `${pageHead({ eyebrow: 'Member', title: 'My Workouts', sub: `Program: <strong>12-Week Strength Builder</strong> · Coach ${esc(m.trainer)}`, actions: btn('Log workout', { action: 'log-workout', variant: 'primary', ic: 'plus' }) + btn('Ask trainer', { action: 'ask-trainer', ic: 'message' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Program Progress', value: `${programPct()}<small>%</small>`, meta: `${m.sessionsDone}/${m.sessionsPlanned} sessions`, ic: 'target', tone: 'accent' })}
            ${kpi({ label: 'Sessions This Week', value: 6, meta: 'Target: 6', ic: 'dumbbell', tone: 'success' })}
            ${kpi({ label: 'Avg Session', value: `${avg}<small>min</small>`, meta: 'Last 4 sessions', ic: 'timer', tone: 'info' })}
            ${kpi({ label: 'Weekly Volume', value: '18.4<small>t</small>', meta: delta('6% vs last week'), ic: 'weight' })}
          </div>
          <div class="grid grid--main">
            ${workoutCard({ full: true })}
            <div class="stack">
              ${card({ title: 'This Week', sub: 'Your training split', body: `<div class="week" style="grid-template-columns:repeat(2,minmax(0,1fr))">${m.weekPlan.map((d, i) => {
                const isToday = i === todayIdx(), past = i < todayIdx();
                const status = d.rest ? `<span class="week__status">${icon('heart')}Recovery</span>` : isToday ? `<span class="week__status" style="color:var(--accent)">${icon('flame')}Today</span>` : past ? `<span class="week__status done">${icon('checkCircle')}Done</span>` : `<span class="week__status">${icon('clock')}Planned</span>`;
                return `<div class="week__day ${isToday ? 'is-today' : ''}"><b>${d.day}</b><p>${esc(d.title)}</p>${status}</div>`; }).join('')}</div>` })}
            </div>
          </div>
          ${card({ title: 'Recent Sessions', sub: 'Logged workouts', actions: btn('Log workout', { action: 'log-workout', size: 'sm', ic: 'plus' }),
            body: `<ul class="list">${m.sessions.map((s) => listItem({ ic: 'dumbbell', tone: 'accent', title: esc(s.type), sub: `${fmtDate(s.date)} · ${fmtDuration(s.duration)}${s.notes ? ` · ${esc(s.notes)}` : ''}`, right: badge('Completed', 'success') })).join('')}</ul>` })}
        </div>`;
    },

    attendance() {
      const m = M();
      const visitsSet = new Set(m.attendance.map((a) => isoDate(a.date)));
      const first = new Date(T.getFullYear(), T.getMonth(), 1);
      const daysInMonth = new Date(T.getFullYear(), T.getMonth() + 1, 0).getDate();
      const lead = (first.getDay() + 6) % 7;
      const cal = [...Array(lead)].map(() => '<span class="calendar__day is-blank"></span>').join('') +
        Array.from({ length: daysInMonth }, (_, i) => {
          const d = new Date(T.getFullYear(), T.getMonth(), i + 1);
          const visit = visitsSet.has(isoDate(d)), isT = sameDay(d, T), fut = d > T;
          return `<span class="calendar__day ${visit ? 'is-visit' : ''} ${isT ? 'is-today' : ''} ${fut ? 'is-future' : ''}" aria-label="${fmtDate(d)}${visit ? ', visited' : ''}">${i + 1}</span>`;
        }).join('');
      const avg = Math.round(m.attendance.filter((a) => a.duration).reduce((s, a) => s + a.duration, 0) / m.attendance.filter((a) => a.duration).length);
      return `${pageHead({ eyebrow: 'Member', title: 'Attendance', sub: 'Every check-in at Iron Temple Fitness', actions: btn(checkedInToday() ? 'Checked in today' : 'Quick Check-in', { action: 'quick-checkin', variant: 'primary', ic: 'scan' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Visits This Month', value: m.visitsThisMonth, meta: 'Goal: 20 visits', ic: 'calendar', tone: 'accent' })}
            ${kpi({ label: 'Current Streak', value: `${m.streak}<small>days</small>`, meta: 'Rest days don’t break it', ic: 'flame', tone: 'success' })}
            ${kpi({ label: 'Avg Duration', value: `${avg}<small>min</small>`, meta: 'Per visit', ic: 'timer', tone: 'info' })}
            ${kpi({ label: 'Best Streak', value: `${m.bestStreak}<small>days</small>`, meta: 'Personal record', ic: 'award' })}
          </div>
          <div class="grid grid--main-r">
            ${card({ title: T.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), sub: 'Highlighted days are gym visits',
              body: `<div class="calendar" role="group" aria-label="Monthly attendance calendar">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="calendar__dow" aria-hidden="true">${d}</span>`).join('')}${cal}</div>
                <div class="mt-16">${progress((m.visitsThisMonth / 20) * 100, '', '', 'Monthly visit goal')}<p class="text-sm muted mt-8">${m.visitsThisMonth} of 20 visits · ${Math.max(0, 20 - m.visitsThisMonth)} to go</p></div>` })}
            <section class="card table-card" aria-labelledby="att-all"><div class="card__head"><div><h2 class="card__title" id="att-all">Attendance History</h2><p class="card__sub">${m.attendance.length} recorded visits</p></div>
              ${btn('Export', { action: 'export-attendance', size: 'sm', ic: 'download' })}</div>${attendanceTable()}</section>
          </div>
        </div>`;
    },

    membership() {
      const m = M(), plan = planById(m.planId), days = memberDaysLeft();
      const pct = (days / m.cycleDays) * 100;
      const plans = DB.plans.filter((p) => PLAN_ORDER.includes(p.id) && p.active);
      const curIdx = PLAN_ORDER.indexOf(m.planId);
      return `${pageHead({ eyebrow: 'Member', title: 'Membership', sub: `Member ID <strong>${m.memberId}</strong> · since ${fmtDate(m.joined)}` })}
        <div class="stack">
          <div class="grid grid--main">
            ${card({ title: 'Current Plan', actions: m.frozen ? badge('Frozen', 'info') : badge('Active', 'success'),
              body: `<div class="membership-hero">
                  ${ring(pct, { size: 150, stroke: 12, label: String(days), sub: 'days left', tone: days <= 7 ? 'warning' : '' })}
                  <div>
                    <p class="membership-hero__plan">${esc(plan.name)}</p>
                    <p class="plan-price" style="margin-top:8px"><strong style="font-size:40px">${fmtINR(plan.price)}</strong><span>${periodLabel(plan.period)}${m.billing === 'quarterly' ? ' · billed quarterly' : ''}</span></p>
                    <dl class="info-grid mt-16">
                      <div><dt>Renewal date</dt><dd>${fmtDate(m.renewal)}</dd></div>
                      <div><dt>Days remaining</dt><dd>${days} of ${m.cycleDays}</dd></div>
                      <div><dt>Home gym</dt><dd>${esc(m.gym)}</dd></div>
                      <div><dt>Payment</dt><dd>${esc(m.methods.find((x) => x.primary)?.type === 'upi' ? 'UPI' : `VISA •••• ${m.methods.find((x) => x.primary)?.last4 || ''}`)}</dd></div>
                    </dl>
                  </div>
                </div>
                <div class="mt-20">${progress(100 - pct, days <= 7 ? 'warning' : '', 'lg', 'Billing cycle used')}<p class="text-sm muted mt-8">${Math.round(100 - pct)}% of current cycle used</p></div>
                ${m.scheduledPlan ? `<div class="notice mt-16">${icon('info')}<p>Switching to <strong>${esc(planById(m.scheduledPlan).name)}</strong> on ${fmtDate(m.renewal)}. <button type="button" class="card__link" data-action="cancel-switch" style="display:inline">Cancel switch</button></p></div>` : ''}
                <hr class="divider">
                ${Form.toggle({ name: 'autoRenew', label: 'Auto-renew', desc: 'Charge your primary payment method on the renewal date', checked: m.autoRenew }).replace('<input', '<input data-change="auto-renew"')}
                <div class="flex gap-8 wrap mt-16">
                  ${btn('Renew now', { action: 'renew-membership', variant: 'primary', ic: 'refresh' })}
                  ${btn(m.frozen ? 'Unfreeze' : 'Freeze membership', { action: 'freeze-membership', ic: 'snow' })}
                </div>` })}
            ${card({ title: 'Included Benefits', sub: `With ${esc(plan.name)}`, body: `<ul class="feature-list" style="margin:0">${plan.features.map((f) => `<li>${icon('checkCircle')}${esc(f)}</li>`).join('')}</ul>
              <div class="notice notice--accent mt-20">${icon('zap')}<p>Upgrade to <strong>Annual Pro</strong> and save <strong>${fmtINR(2499 * 12 - 24999)}</strong> a year plus 4 PT sessions every month.</p></div>` })}
          </div>
          <section aria-labelledby="plans-title">
            <div class="flex between wrap gap-12" style="margin-bottom:16px"><h2 class="card__title" id="plans-title">Available Plans</h2><p class="muted text-sm">Prices include GST · cancel anytime</p></div>
            <div class="plan-grid">${plans.map((p) => {
              const idx = PLAN_ORDER.indexOf(p.id), isCur = p.id === m.planId;
              const label = isCur ? 'Current plan' : idx > curIdx ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
              return `<article class="plan-card ${isCur ? 'is-current' : ''} ${p.featured && !isCur ? 'is-featured' : ''}">
                <div class="plan-card__top"><h3 class="plan-card__name">${esc(p.name)}</h3>${isCur ? badge('Current', 'accent') : p.id === 'annual' ? badge('Best value', 'success') : ''}</div>
                <p class="plan-price"><strong>${fmtINR(p.price)}</strong><span>${periodLabel(p.period)}</span></p>
                <ul class="feature-list">${p.features.map((f) => `<li>${icon('check')}${esc(f)}</li>`).join('')}</ul>
                <div class="plan-card__actions"><button type="button" class="btn ${isCur ? 'btn--secondary' : idx > curIdx ? 'btn--primary' : 'btn--outline'}" data-action="choose-plan" data-id="${p.id}" ${isCur ? 'disabled' : ''}>${esc(label)}</button></div>
              </article>`; }).join('')}</div>
          </section>
        </div>`;
    },

    payments() {
      const m = M();
      const paid = m.invoices.filter((i) => i.status === 'Paid').reduce((s, i) => s + i.amount, 0);
      return `${pageHead({ eyebrow: 'Member', title: 'Payments', sub: 'Invoices, receipts and saved payment methods', actions: btn('Download Invoice', { action: 'download-invoice', ic: 'download', attrs: `data-id="${m.invoices[0]?.id}"` }) + btn('Add Payment Method', { action: 'add-payment-method', variant: 'primary', ic: 'plus' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Paid This Year', value: fmtCompactINR(paid), meta: `${m.invoices.filter((i) => i.status === 'Paid').length} invoices`, ic: 'wallet', tone: 'accent' })}
            ${kpi({ label: 'Next Payment', value: fmtINR(planById(m.planId).id === 'annual' ? 24999 : planById(m.planId).price * 3), meta: `Due ${fmtShort(m.renewal)}`, ic: 'calendar', tone: 'warning' })}
            ${kpi({ label: 'Outstanding', value: '₹0', meta: 'You’re all settled', ic: 'checkCircle', tone: 'success' })}
            ${kpi({ label: 'Saved Methods', value: m.methods.length, meta: 'Cards & UPI', ic: 'card', tone: 'info' })}
          </div>
          <div class="grid grid--main">
            <section class="card table-card" aria-labelledby="inv-title"><div class="card__head"><div><h2 class="card__title" id="inv-title">Invoices</h2><p class="card__sub">Download GST invoices for any payment</p></div></div>
              <div class="table-wrap"><table class="table"><caption class="sr-only">Invoices</caption>
                <thead><tr><th scope="col">Invoice</th><th scope="col">Date</th><th scope="col" class="col-num">Amount</th><th scope="col">Payment Method</th><th scope="col">Status</th><th scope="col" class="col-actions">Action</th></tr></thead>
                <tbody>${m.invoices.map((i) => `<tr><td data-label="Invoice" class="col-primary"><div class="cell-user"><span class="list-item__icon">${icon('file')}</span><div><div class="cell-user__name">${i.id}</div><div class="cell-user__sub">${esc(i.desc)}</div></div></div></td>
                  <td data-label="Date">${fmtDate(i.date)}</td><td data-label="Amount" class="col-num fw-600">${fmtINR(i.amount)}</td><td data-label="Payment Method">${esc(i.method)}</td><td data-label="Status">${badge(i.status)}</td>
                  <td data-label="Action" class="col-actions"><button type="button" class="btn btn--ghost btn--sm" data-action="download-invoice" data-id="${i.id}">${icon('download')}Download</button></td></tr>`).join('')}</tbody></table></div></section>
            ${card({ title: 'Payment Methods', sub: 'Tokenised by our payment partner', actions: btn('Add', { action: 'add-payment-method', size: 'sm', ic: 'plus' }),
              body: m.methods.length ? m.methods.map((p) => `<div class="pay-method"><span class="pay-method__logo ${p.type === 'upi' ? 'pay-method__logo--upi' : ''}">${p.type === 'upi' ? 'UPI' : esc(p.brand)}</span>
                <div class="pay-method__main"><strong>${p.type === 'upi' ? esc(p.upi) : `•••• •••• •••• ${esc(p.last4)}`}</strong><span>${p.type === 'upi' ? 'UPI AutoPay' : `Expires ${esc(p.exp)}`}${p.primary ? ' · Primary' : ''}</span></div>
                ${p.primary ? badge('Primary', 'accent') : `<button type="button" class="btn btn--ghost btn--sm" data-action="set-primary-method" data-id="${p.id}">Make primary</button>${actBtn('remove-method', p.id, 'trash', 'Remove payment method', 'danger')}`}</div>`).join('')
                : `<div class="empty">${icon('card')}<p>No saved payment methods.</p></div>` })}
          </div>
        </div>`;
    },

    progress() {
      const p = M().progress, w = p.weight;
      const change = (w[w.length - 1] - w[0]).toFixed(1);
      const best5k = Math.min(...p.fiveK), mm = Math.floor(best5k), ss = Math.round((best5k - mm) * 60);
      return `${pageHead({ eyebrow: 'Member', title: 'Progress', sub: 'Measured results from your last 12 weeks', actions: btn('Log measurement', { action: 'log-measurement', variant: 'primary', ic: 'plus' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Body Weight', value: `${w[w.length - 1]}<small>kg</small>`, meta: delta(`${Math.abs(change)} kg`, change <= 0 ? 'down' : 'up').replace('delta--down', 'delta--up') + ' since start', ic: 'weight', tone: 'accent' })}
            ${kpi({ label: 'Bench Press 1RM', value: `${p.strength[0].current}<small>kg</small>`, meta: delta(`${p.strength[0].current - p.strength[0].start} kg`), ic: 'dumbbell', tone: 'success' })}
            ${kpi({ label: '5K Best', value: `${mm}:${String(ss).padStart(2, '0')}`, meta: delta(`${((p.fiveK[0] - best5k)).toFixed(1)} min faster`), ic: 'timer', tone: 'info' })}
            ${kpi({ label: 'Workout Completion', value: `${programPct()}<small>%</small>`, meta: 'Of planned sessions', ic: 'target' })}
          </div>
          <div class="grid grid--main">
            ${card({ title: 'Weight Trend', sub: 'Weekly weigh-ins (kg)', actions: `<span class="legend"><span><i></i>Weight</span><span><i class="muted-swatch"></i>Goal 75 kg</span></span>`,
              body: lineChart({ labels: p.weightDates.map((d) => fmtShort(d)), series: [{ name: 'Weight', values: w }, { name: 'Goal', values: w.map(() => 75), tone: 'muted', noDots: true }], fmt: (v) => `${v} kg`, fmtTick: (v) => `${v}`, label: 'Weight trend over 12 weeks', height: 240 }) })}
            ${card({ title: 'Strength', sub: 'Estimated 1RM vs goal', body: `<div class="hbars">${p.strength.map((s) => {
              const pct = ((s.current - s.start) / (s.goal - s.start)) * 100;
              return `<div><div class="hbar__top"><span class="fw-600">${esc(s.lift)}</span><span>${s.current} / ${s.goal} kg</span></div>${progress(pct, '', '', `${s.lift} progress to goal`)}<p class="text-xs subtle mt-8">Started at ${s.start} kg · ${Math.round(pct)}% to goal</p></div>`; }).join('')}</div>` })}
          </div>
          <div class="grid grid--2">
            ${card({ title: 'Running', sub: 'Monthly distance (km)', actions: badge(`${p.runKm[p.runKm.length - 1]} km this month`, 'info'),
              body: barChart({ labels: p.runLabels, values: p.runKm, highlight: p.runKm.length - 1, fmt: (v) => `${v} km`, label: 'Monthly running distance', height: 200 }) })}
            ${card({ title: 'Workout Completion', sub: 'Planned sessions completed per month', body: lineChart({ labels: p.runLabels, series: [{ name: 'Completion', values: p.completion, tone: 'success' }], zero: true, fmt: (v) => `${v}%`, fmtTick: (v) => `${v}%`, label: 'Monthly workout completion', height: 200, area: false }) })}
          </div>
        </div>`;
    },

    profile() {
      const m = M();
      return `${pageHead({ eyebrow: 'Member', title: 'Profile', sub: 'Personal details, goals and preferences' })}
        <div class="grid grid--main">
          <div class="stack">
            ${card({ title: 'Personal Details', body: `<form data-form="profile" novalidate><div class="form-grid">
                ${Form.field({ name: 'name', label: 'Full name', value: m.name, required: true, autocomplete: 'name' })}
                ${Form.field({ name: 'email', label: 'Email', type: 'email', value: m.email, required: true, autocomplete: 'email' })}
                ${Form.field({ name: 'phone', label: 'Mobile', type: 'tel', value: m.phone, required: true, attrs: 'data-validate="phone"', autocomplete: 'tel' })}
                ${Form.field({ name: 'dob', label: 'Date of birth', type: 'date', value: m.dob })}
                ${Form.field({ name: 'goal', label: 'Primary goal', type: 'select', value: m.goal, options: ['Build strength', 'Lose fat', 'Improve endurance', 'Mobility & recovery', 'General fitness'] })}
                ${Form.field({ name: 'height', label: 'Height (cm)', type: 'number', value: m.height, attrs: 'min="100" max="250"' })}
              </div><div class="flex gap-8 mt-20">${`<button type="submit" class="btn btn--primary">${icon('check')}Save profile</button>`}</div></form>` })}
            ${card({ title: 'Preferences', body: `<form data-form="prefs" novalidate>
                ${Form.toggle({ name: 'workoutReminders', label: 'Workout reminders', desc: 'A nudge 1 hour before planned sessions', checked: Prefs.workoutReminders })}
                ${Form.toggle({ name: 'renewalAlerts', label: 'Renewal alerts', desc: '7 days and 1 day before renewal', checked: Prefs.renewalAlerts })}
                ${Form.toggle({ name: 'classUpdates', label: 'Class updates', desc: 'Schedule changes and new classes', checked: Prefs.classUpdates })}
                ${Form.toggle({ name: 'marketing', label: 'Offers & news', desc: 'Occasional promotions from your gym', checked: Prefs.marketing })}
                <div class="setting-row"><div class="setting-row__text"><strong>Units</strong><span>Used for weights and distances</span></div>
                  <label class="sr-only" for="pref-units">Units</label><select class="input input--sm" id="pref-units" name="units" style="max-width:180px"><option value="metric" ${Prefs.units === 'metric' ? 'selected' : ''}>Metric (kg, km)</option><option value="imperial" ${Prefs.units === 'imperial' ? 'selected' : ''}>Imperial (lb, mi)</option></select></div>
                <div class="mt-20"><button type="submit" class="btn btn--secondary">Save preferences</button></div></form>` })}
          </div>
          <div class="stack">
            ${card({ body: `<div class="profile-head"><span class="avatar avatar--xl avatar--accent" aria-hidden="true">${esc(initials(m.name))}</span><div><h3>${esc(m.name)}</h3><p>${esc(planById(m.planId).name)} member · ${esc(m.gym)}</p></div></div>
              <dl class="info-grid"><div><dt>Member ID</dt><dd>${m.memberId}</dd></div><div><dt>Member since</dt><dd>${fmtDate(m.joined)}</dd></div><div><dt>Trainer</dt><dd>${esc(m.trainer)}</dd></div><div><dt>Branch</dt><dd>${esc(m.branch)}</dd></div></dl>` })}
            ${card({ title: 'Security', body: `<ul class="list">
                ${listItem({ ic: 'key', title: 'Password', sub: 'Last changed 3 months ago', right: btn('Change', { action: 'change-password', size: 'sm' }) })}
                ${listItem({ ic: 'logout', tone: 'danger', title: 'Sign out', sub: 'End your session on this device', right: btn('Log out', { action: 'logout', size: 'sm', variant: 'danger' }) })}
              </ul>` })}
          </div>
        </div>`;
    },
  };

  /* 14. GYM OWNER PORTAL ------------------------------------------------ */
  const G = () => DB.gym;
  const zoneCount = (z) => z.base + G().live.filter((l) => l.zone === z.id).length;
  const insideNow = () => G().zones.reduce((s, z) => s + zoneCount(z), 0);
  const expiringList = () => G().members.filter((m) => ['expiring', 'expired'].includes(memberStatus(m))).sort((a, b) => a.renewal - b.renewal);
  const trainerAvail = { available: 'Available', 'in-session': 'In session', off: 'Off today' };
  const PAY_STATUS_OPTS = [['paid', 'Paid'], ['pending', 'Pending'], ['overdue', 'Overdue'], ['refunded', 'Refunded']];

  function membersTableConfig() {
    return {
      title: 'Member Management', sub: 'Search, filter and manage every membership', noun: 'members',
      searchPlaceholder: 'Search name, email or phone…', searchLabel: 'Search members',
      rows: () => G().members, rowId: (m) => m.id,
      searchText: (m) => `${m.name} ${m.email} ${m.phone}`,
      filterValue: (m, k) => (k === 'plan' ? m.planId : memberStatus(m)),
      filters: [
        { key: 'plan', label: 'Filter by plan', all: 'All plans', options: DB.plans.map((p) => [p.id, p.name]) },
        { key: 'status', label: 'Filter by status', all: 'All statuses', options: [['active', 'Active'], ['expiring', 'Expiring'], ['paused', 'Paused'], ['expired', 'Expired']] },
      ],
      footNote: `${fmtNum(G().stats.active)} active members at this branch`,
      columns: [
        { label: 'Name', cls: 'col-primary', render: (m) => cellUser(m.name, m.email) },
        { label: 'Plan', render: (m) => esc(planById(m.planId)?.name || '—') },
        { label: 'Last Visit', render: (m) => relDay(m.lastVisit) },
        { label: 'Renewal', render: (m) => { const d = daysBetween(T, m.renewal); return `${fmtDate(m.renewal)}<span class="cell-sub">${d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? 'Today' : `in ${d} days`}</span>`; } },
        { label: 'Status', render: (m) => badge(memberStatus(m)) },
        { label: 'Action', cls: 'col-actions', render: (m) => `<div class="row-actions">
            ${actBtn('view-member', m.id, 'eye', `View ${m.name}`)}${actBtn('edit-member', m.id, 'pencil', `Edit ${m.name}`)}
            ${m.status === 'paused' ? actBtn('pause-member', m.id, 'play', `Resume ${m.name}`, 'success') : actBtn('pause-member', m.id, 'pause', `Pause ${m.name}`)}
            ${actBtn('renew-member', m.id, 'refresh', `Renew ${m.name}`, 'success')}${actBtn('delete-member', m.id, 'trash', `Delete ${m.name}`, 'danger')}</div>` },
      ],
    };
  }

  const OwnerSections = {
    overview() {
      const g = G(), s = g.stats;
      const exp = expiringList().slice(0, 5);
      return `${pageHead({ eyebrow: 'Gym Admin', title: g.name, sub: `${esc(g.branch)} · ${greeting()}, <strong>${esc(firstName(g.owner))}</strong>`,
          actions: btn('Announcement', { action: 'open-announcement', ic: 'megaphone' }) + btn('Add member', { action: 'add-member', variant: 'primary', ic: 'userplus' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Active Members', value: fmtNum(s.active), meta: `${delta(`${s.newThisMonth} this month`)}`, ic: 'users', tone: 'accent' })}
            ${kpi({ label: "Today's Check-ins", value: fmtNum(s.checkins), meta: `<span class="live-dot"></span> ${insideNow()} inside now`, ic: 'scan', tone: 'success' })}
            ${kpi({ label: 'Monthly Revenue', value: fmtCompactINR(s.revenue), meta: delta('6.4% vs Aug'), ic: 'wallet', tone: 'info' })}
            ${kpi({ label: 'Expiring Soon', value: s.expiring, meta: 'Next 7 days', ic: 'alert', tone: 'warning' })}
          </div>
          <div class="grid grid--main">
            ${card({ title: "Today's Check-ins", sub: 'By hour · peak 7–8 AM', actions: `<a class="card__link" href="#/dashboard/attendance">Live floor ${icon('chevronRight')}</a>`,
              body: barChart({ labels: g.hourlyLabels, values: g.hourly, highlight: 1, fmt: (v) => `${v} check-ins`, label: 'Check-ins by hour today', height: 230 }) })}
            ${card({ title: 'Revenue Trend', sub: 'Last 6 months', actions: badge('+22% since Apr', 'success'),
              body: lineChart({ labels: g.revenueLabels, series: [{ name: 'Revenue', values: g.revenueTrend }], fmt: fmtCompactINR, fmtTick: (v) => `${(v / 1e5).toFixed(1)}L`, label: 'Monthly revenue trend', height: 230 }) })}
          </div>
          <div class="grid grid--3">
            ${card({ title: 'Expiring Memberships', sub: `${s.expiring} in the next 7 days`, actions: `<a class="card__link" href="#/dashboard/members">All ${icon('chevronRight')}</a>`,
              body: exp.length ? `<ul class="list">${exp.map((m) => { const d = daysBetween(T, m.renewal); return listItem({ title: esc(m.name), sub: `${esc(planById(m.planId).name)} · ${d < 0 ? `expired ${Math.abs(d)}d ago` : `expires in ${d}d`}`, right: `<button type="button" class="btn btn--secondary btn--sm" data-action="renew-member" data-id="${m.id}">Renew</button>` }).replace('<li class="list-item">', `<li class="list-item"><span class="avatar" aria-hidden="true">${esc(initials(m.name))}</span>`); }).join('')}</ul>` : `<div class="empty">${icon('checkCircle')}<p>No memberships expiring this week.</p></div>` })}
            ${card({ title: 'Trainers on Duty', sub: `${g.trainers.filter((t) => t.availability !== 'off').length} of ${g.trainers.length} active today`, actions: `<a class="card__link" href="#/dashboard/trainers">All ${icon('chevronRight')}</a>`,
              body: `<ul class="list">${g.trainers.slice(0, 5).map((t) => listItem({ title: esc(t.name), sub: esc(t.spec), right: badge(trainerAvail[t.availability], STATUS_TONE[t.availability]) }).replace('<li class="list-item">', `<li class="list-item"><span class="avatar avatar-status avatar-status--${t.availability}" aria-hidden="true">${esc(initials(t.name))}</span>`)).join('')}</ul>` })}
            ${card({ title: 'Recent Payments', sub: 'Latest transactions', actions: `<a class="card__link" href="#/dashboard/payments">All ${icon('chevronRight')}</a>`,
              body: `<ul class="list">${g.payments.slice(0, 5).map((p) => listItem({ ic: 'banknote', tone: STATUS_TONE[p.status] === 'success' ? 'success' : STATUS_TONE[p.status] === 'danger' ? 'danger' : 'warning', title: `${esc(p.member)}`, sub: `${p.id} · ${relDay(p.date)}`, right: `<span class="fw-600 tabular">${fmtINR(p.amount)}</span>` })).join('')}</ul>` })}
          </div>
        </div>`;
    },

    members() {
      const counts = { active: 0, expiring: 0, paused: 0, expired: 0 };
      G().members.forEach((m) => { counts[memberStatus(m)]++; });
      return `${pageHead({ eyebrow: 'Gym Admin', title: 'Members', sub: `${fmtNum(G().stats.active)} active members · ${G().stats.expiring} expiring this week`,
          actions: btn('Export CSV', { action: 'export-members', ic: 'download' }) + btn('Add member', { action: 'add-member', variant: 'primary', ic: 'userplus' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Active', value: counts.active, meta: 'In this list', ic: 'checkCircle', tone: 'success' })}
            ${kpi({ label: 'Expiring', value: counts.expiring, meta: 'Within 7 days', ic: 'alert', tone: 'warning' })}
            ${kpi({ label: 'Paused', value: counts.paused, meta: 'Frozen memberships', ic: 'pause', tone: 'info' })}
            ${kpi({ label: 'Expired', value: counts.expired, meta: 'Needs follow-up', ic: 'xCircle' })}
          </div>
          ${dataTable('members-table', membersTableConfig())}
        </div>`;
    },

    attendance() {
      const g = G();
      const avg = Math.round(g.live.reduce((s, l) => s + (Date.now() - l.checkIn) / 6e4, 0) / (g.live.length || 1));
      return {
        html: `${pageHead({ eyebrow: 'Gym Admin', title: 'Live Attendance', sub: `<span class="live-dot"></span>&nbsp; Live · updates automatically · ${fmtTime(new Date())}`,
            actions: btn('Manual check-in', { action: 'manual-checkin', variant: 'primary', ic: 'scan' }) })}
          <div class="stack">
            <div class="grid grid--kpi-3">
              ${kpi({ label: 'Inside Now', value: `<span id="live-inside">${insideNow()}</span>`, meta: `Capacity ${g.capacity}`, ic: 'users', tone: 'accent' })}
              ${kpi({ label: "Today's Check-ins", value: `<span id="live-total">${g.stats.checkins}</span>`, meta: delta('9% vs last Sun'), ic: 'scan', tone: 'success' })}
              ${kpi({ label: 'Average Session', value: `${g.stats.avgSession}<small>min</small>`, meta: `Floor avg now: ${avg} min`, ic: 'timer', tone: 'info' })}
            </div>
            <div class="zone-grid" id="zone-grid">${zoneCards()}</div>
            ${dataTable('live-table', {
              title: 'Live Activity', sub: 'Members currently on the floor', noun: 'check-ins', search: true, searchPlaceholder: 'Search member…',
              rows: () => g.live, rowId: (l) => l.id, rowClass: (l) => (l.fresh ? 'is-new' : ''),
              searchText: (l) => l.name, filterValue: (l, k) => l[k],
              filters: [{ key: 'zone', label: 'Filter by zone', all: 'All zones', options: g.zones.map((z) => [z.id, z.name]) }],
              columns: [
                { label: 'Member', cls: 'col-primary', render: (l) => cellUser(l.name, l.fresh ? 'Just checked in' : 'Member') },
                { label: 'Zone', render: (l) => esc(g.zones.find((z) => z.id === l.zone)?.name) },
                { label: 'Checked In', render: (l) => `<span class="tabular">${fmtTime(l.checkIn)}</span>` },
                { label: 'Duration', render: (l) => `<span class="tabular" data-since="${l.checkIn.getTime()}">${fmtDuration(Math.max(0, Math.round((Date.now() - l.checkIn) / 6e4)))}</span>` },
                { label: 'Status', render: (l) => badge('In session', 'success') },
                { label: 'Action', cls: 'col-actions', render: (l) => `<button type="button" class="btn btn--ghost btn--sm" data-action="checkout" data-id="${l.id}">${icon('logout')}Check out</button>` },
              ],
            })}
          </div>`,
        mount: startLiveTicker,
      };
    },

    plans() {
      return `${pageHead({ eyebrow: 'Gym Admin', title: 'Membership Plans', sub: `${DB.plans.filter((p) => p.active).length} active plans · ${fmtNum(DB.plans.reduce((s, p) => s + p.members, 0))} members enrolled`, actions: btn('Create plan', { action: 'create-plan', variant: 'primary', ic: 'plus' }) })}
        <div class="plan-grid plan-grid--4">${DB.plans.map((p) => `<article class="plan-card ${p.featured ? 'is-featured' : ''} ${p.active ? '' : 'is-disabled'}">
            <div class="plan-card__top"><h2 class="plan-card__name">${esc(p.name)}</h2>${p.active ? badge('Active', 'success') : badge('Disabled', 'neutral')}</div>
            <p class="plan-price"><strong>${fmtINR(p.price)}</strong><span>${periodLabel(p.period)}</span></p>
            <div class="plan-card__meta"><span class="chip">${icon('clock', 'icon--sm')}${p.durationDays} days</span><span class="chip">${icon('users', 'icon--sm')}${fmtNum(p.members)} members</span></div>
            <ul class="feature-list">${p.features.map((f) => `<li>${icon('check')}${esc(f)}</li>`).join('')}</ul>
            <div class="plan-card__actions">
              <button type="button" class="btn btn--secondary btn--sm" data-action="edit-plan" data-id="${p.id}">${icon('pencil')}Edit</button>
              <button type="button" class="btn ${p.active ? 'btn--danger' : 'btn--primary'} btn--sm" data-action="toggle-plan" data-id="${p.id}">${icon(p.active ? 'pause' : 'play')}${p.active ? 'Disable' : 'Enable'}</button>
            </div></article>`).join('')}</div>`;
    },

    trainers() {
      const g = G();
      return `${pageHead({ eyebrow: 'Gym Admin', title: 'Trainers', sub: `${g.trainers.length} coaches · ${g.trainers.filter((t) => t.availability === 'available').length} available right now`, actions: btn('Add trainer', { action: 'add-trainer', variant: 'primary', ic: 'userplus' }) })}
        <div class="trainer-grid">${g.trainers.map((t) => `<article class="card card--hover trainer-card">
            <div class="trainer-card__top"><span class="avatar avatar--lg avatar-status avatar-status--${t.availability}" aria-hidden="true">${esc(initials(t.name))}</span>
              <div style="min-width:0"><h2 class="trainer-card__name">${esc(t.name)}</h2><p class="trainer-card__spec">${esc(t.spec)}</p><div class="mt-8">${stars(t.rating, t.reviews)}</div></div></div>
            <div class="flex between"><span class="text-sm muted">${icon('clock', 'icon--sm')}</span><span class="text-sm muted" style="flex:1;margin-left:8px">${esc(t.schedule)}</span>${badge(trainerAvail[t.availability], STATUS_TONE[t.availability])}</div>
            <div class="trainer-card__stats"><div><span>Clients</span><strong>${t.clients}</strong></div><div><span>Experience</span><strong>${t.exp} yrs</strong></div><div><span>Rating</span><strong>${t.rating}</strong></div></div>
            <div class="trainer-card__actions">
              <button type="button" class="btn btn--secondary btn--sm" data-action="view-trainer" data-id="${t.id}">View</button>
              <button type="button" class="btn btn--secondary btn--sm" data-action="edit-trainer" data-id="${t.id}">Edit</button>
              <button type="button" class="btn btn--primary btn--sm" data-action="manage-trainer" data-id="${t.id}">Manage</button>
            </div></article>`).join('')}</div>`;
    },

    payments() {
      const s = G().stats, pays = G().payments;
      const pendingN = pays.filter((p) => ['pending', 'overdue'].includes(p.status)).length;
      return `${pageHead({ eyebrow: 'Gym Admin', title: 'Payments', sub: 'Revenue collected, pending dues and refunds for this month',
          actions: btn('Export CSV', { action: 'export-payments', ic: 'download' }) + btn('Record payment', { action: 'record-payment', variant: 'primary', ic: 'plus' }) })}
        <div class="stack">
          <div class="grid grid--kpi-3">
            ${kpi({ label: 'Collected', value: fmtCompactINR(s.collected), meta: delta('6.4% vs Aug'), ic: 'wallet', tone: 'success' })}
            ${kpi({ label: 'Pending', value: fmtCompactINR(s.pending), meta: `${pendingN} invoices awaiting payment`, ic: 'clock', tone: 'warning' })}
            ${kpi({ label: 'Refunds', value: fmtCompactINR(s.refunds), meta: 'This month', ic: 'undo', tone: 'info' })}
          </div>
          <div class="grid grid--main-r">
            ${card({ title: 'Collection Mix', sub: 'By payment method', body: `<div class="hbars">${[['UPI', 58], ['Card', 27], ['Net banking', 9], ['Cash', 6]].map(([n, v]) => `<div><div class="hbar__top"><span class="fw-600">${n}</span><span>${v}%</span></div>${progress(v, n === 'UPI' ? '' : 'info', 'sm', `${n} share`)}</div>`).join('')}</div>
              <hr class="divider"><div class="chart-summary" style="margin:0"><div><span>Collection rate</span><strong class="text-success">95.2%</strong></div><div><span>Avg ticket</span><strong>${fmtINR(3140)}</strong></div></div>` })}
            ${dataTable('payments-table', {
              title: 'Transactions', sub: 'All member payments', noun: 'payments', searchPlaceholder: 'Search member or invoice…', searchLabel: 'Search payments',
              rows: () => G().payments, rowId: (p) => p.id, searchText: (p) => `${p.member} ${p.id}`, filterValue: (p, k) => p[k],
              filters: [{ key: 'status', label: 'Filter by status', all: 'All statuses', options: PAY_STATUS_OPTS }],
              columns: [
                { label: 'Member', cls: 'col-primary', render: (p) => cellUser(p.member, p.plan) },
                { label: 'Invoice', render: (p) => `<span class="tabular">${p.id}</span>` },
                { label: 'Amount', cls: 'col-num', render: (p) => `<span class="fw-600">${fmtINR(p.amount)}</span>` },
                { label: 'Date', render: (p) => `${fmtDate(p.date)}<span class="cell-sub">${esc(p.method)}</span>` },
                { label: 'Status', render: (p) => badge(p.status) },
                { label: 'Action', cls: 'col-actions', render: (p) => `<div class="row-actions">${['pending', 'overdue'].includes(p.status) ? `<button type="button" class="btn btn--secondary btn--sm" data-action="mark-paid" data-id="${p.id}">${icon('check')}Mark paid</button>` : ''}
                    ${p.status === 'paid' ? actBtn('refund-payment', p.id, 'undo', `Refund ${p.id}`) : ''}${actBtn('download-payment', p.id, 'download', `Download ${p.id}`)}</div>` },
              ],
            })}
          </div>
        </div>`;
    },

    reports() {
      const reports = [
        ['revenue', 'wallet', 'Revenue Report', 'Collections, pending dues, refunds and plan-wise revenue breakdown.'],
        ['attendance', 'scan', 'Attendance Report', 'Daily check-ins, peak hours, zone usage and average session length.'],
        ['membership', 'idcard', 'Membership Report', 'New joins, renewals, churn and active members by plan.'],
      ];
      const periods = [['this-month', 'This month'], ['last-month', 'Last month'], ['quarter', 'Last 3 months'], ['ytd', 'Year to date']];
      return `${pageHead({ eyebrow: 'Gym Admin', title: 'Reports', sub: 'Generate business reports or export raw data as CSV' })}
        <div class="stack">
          <div class="grid grid--3">${reports.map(([id, ic, title, desc]) => `<article class="card card--hover report-card">
              <div class="flex between"><span class="report-card__icon">${icon(ic)}</span>${badge('Ready', 'success')}</div>
              <div><h2>${title}</h2><p>${desc}</p></div>
              <div class="field"><label for="period-${id}">Period</label><select class="input input--sm" id="period-${id}" data-report-period="${id}">${periods.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
              <div class="report-card__actions">
                <button type="button" class="btn btn--primary btn--sm" data-action="generate-report" data-id="${id}">${icon('bar')}Generate Report</button>
                <button type="button" class="btn btn--secondary btn--sm" data-action="export-report" data-id="${id}">${icon('download')}Export CSV</button>
              </div></article>`).join('')}</div>
          ${card({ title: 'Recent Reports', sub: 'Generated and exported in this workspace', body: `<ul class="list" id="report-history">${G().reportsHistory.map((r) => listItem({ ic: 'file', tone: 'accent', title: esc(r.name), sub: `${fmtDateTime(r.at)}`, right: badge(r.format, r.format === 'CSV' ? 'info' : 'neutral') })).join('')}</ul>` })}
        </div>`;
    },

    settings() {
      const g = G(), st = g.settings;
      return `${pageHead({ eyebrow: 'Gym Admin', title: 'Settings', sub: 'Gym profile, check-in rules and notifications' })}
        <form data-form="gym-settings" novalidate><div class="grid grid--main">
          ${card({ title: 'Gym Profile', body: `<div class="form-grid">
              ${Form.field({ name: 'name', label: 'Gym name', value: g.name, required: true })}
              ${Form.field({ name: 'branch', label: 'Branch', value: g.branch, required: true })}
              ${Form.field({ name: 'phone', label: 'Front desk phone', type: 'tel', value: g.phone, required: true, attrs: 'data-validate="phone"' })}
              ${Form.field({ name: 'email', label: 'Contact email', type: 'email', value: g.email, required: true })}
              ${Form.field({ name: 'address', label: 'Address', type: 'textarea', value: g.address, full: true, rows: 3 })}
              ${Form.field({ name: 'open', label: 'Opens at', type: 'time', value: g.open, required: true })}
              ${Form.field({ name: 'close', label: 'Closes at', type: 'time', value: g.close, required: true })}
            </div>` })}
          <div class="stack">
            ${card({ title: 'Check-in Rules', body: `<div class="form-grid form-grid--1">
                ${Form.field({ name: 'checkinMethod', label: 'Check-in method', type: 'select', value: st.checkinMethod, options: [['qr', 'QR code at entrance'], ['app', 'Member app (geo-fenced)'], ['rfid', 'RFID card / band']] })}
                ${Form.field({ name: 'autoCheckout', label: 'Auto check-out after', type: 'select', value: st.autoCheckout, options: [['2', '2 hours'], ['3', '3 hours'], ['4', '4 hours']] })}
              </div>` })}
            ${card({ title: 'Notifications', body: `${Form.toggle({ name: 'dailySummary', label: 'Daily summary email', desc: 'Revenue and attendance at 10 PM', checked: st.dailySummary })}
                ${Form.toggle({ name: 'renewalReminders', label: 'Automatic renewal reminders', desc: 'Notify members 7 and 1 day before expiry', checked: st.renewalReminders })}
                ${Form.toggle({ name: 'lowAttendance', label: 'Low attendance alerts', desc: 'Members inactive for 14+ days', checked: st.lowAttendance })}
                ${Form.toggle({ name: 'paymentAlerts', label: 'Payment failure alerts', desc: 'Instant alert on failed auto-debits', checked: st.paymentAlerts })}` })}
            <div class="flex gap-8 wrap"><button type="submit" class="btn btn--primary">${icon('check')}Save settings</button>${btn('Reset demo data', { action: 'reset-demo', variant: 'ghost', ic: 'refresh' })}</div>
          </div>
        </div></form>`;
    },
  };

  function zoneCards() {
    return G().zones.map((z) => {
      const n = zoneCount(z), pct = (n / z.capacity) * 100;
      const [label, tone] = pct >= 85 ? ['Full', 'danger'] : pct >= 55 ? ['Busy', 'warning'] : ['Comfortable', 'success'];
      return `<article class="card zone"><div class="zone__top"><span class="zone__name">${esc(z.name)}</span>${badge(label, tone)}</div>
        <p class="zone__count">${n}<small> / ${z.capacity}</small></p>${progress(pct, tone === 'success' ? 'success' : tone, '', `${z.name} occupancy`)}</article>`;
    }).join('');
  }

  /* Live floor simulation (only runs while Attendance is visible) */
  let liveTimer = null;
  function stopTickers() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }
  function startLiveTicker() {
    stopTickers();
    let tick = 0;
    liveTimer = setInterval(() => {
      if (!document.getElementById('live-table')) { stopTickers(); return; }
      tick++;
      $$('[data-since]').forEach((el) => { el.textContent = fmtDuration(Math.max(0, Math.round((Date.now() - Number(el.dataset.since)) / 6e4))); });
      if (tick % 3 === 0) { // simulate floor movement every ~24s
        const g = G();
        g.live.forEach((l) => { l.fresh = false; });
        if (R() > 0.4) {
          const name = pick(WALK_IN_POOL.filter((n) => !g.live.some((l) => l.name === n))) || pick(WALK_IN_POOL);
          g.live.unshift({ id: uid('l'), name, zone: pick(g.zones).id, checkIn: new Date(), fresh: true });
          g.stats.checkins++;
        } else if (g.live.length > 4) {
          g.live.sort((a, b) => a.checkIn - b.checkIn).shift();
          g.live.sort((a, b) => b.checkIn - a.checkIn);
        }
        refreshLive();
      }
    }, 8000);
  }
  function refreshLive() {
    refreshTable('live-table');
    const zg = $('#zone-grid'); if (zg) zg.innerHTML = zoneCards();
    const inside = $('#live-inside'); if (inside) inside.textContent = insideNow();
    const total = $('#live-total'); if (total) total.textContent = G().stats.checkins;
  }

  /* 15. SUPER ADMIN CONSOLE -------------------------------------------- */
  const P = () => DB.platform;
  const ownerGymCount = (o) => P().gyms.filter((g) => g.owner === o.name).length;
  const cities = () => [...new Set(P().gyms.map((g) => g.city))].sort();
  const EVENT_ICON = { gym: ['building', 'accent'], owner: ['userplus', 'info'], payment: ['wallet', 'success'], import: ['upload', 'info'], verify: ['shieldcheck', 'success'], report: ['file', 'accent'], security: ['lock', 'warning'], system: ['server', 'info'], announcement: ['megaphone', 'accent'] };
  const eventIcon = (e) => { const [ic, tone] = EVENT_ICON[e.type] || ['activity', '']; return `<span class="list-item__icon list-item__icon--${e.status === 'failed' ? 'danger' : tone}">${icon(ic)}</span>`; };
  function logActivity(type, title, detail, status = 'success') {
    P().activity.unshift({ id: uid('ev'), type, title, detail, actor: Session.get()?.user?.name || 'System', at: new Date(), status });
  }

  function gymsTableConfig() {
    return {
      title: 'Gym Network', sub: 'Every gym on the FitHub platform', noun: 'gyms', footNote: 'demo dataset of 86 gyms',
      searchPlaceholder: 'Search gym, owner or city…', searchLabel: 'Search gyms',
      rows: () => P().gyms, rowId: (g) => g.id, searchText: (g) => `${g.name} ${g.owner} ${g.city} ${g.id}`,
      filterValue: (g, k) => g[k],
      filters: [
        { key: 'city', label: 'Filter by city', all: 'All cities', options: cities().map((c) => [c, c]) },
        { key: 'status', label: 'Filter by status', all: 'All statuses', options: [['active', 'Active'], ['pending', 'Pending'], ['suspended', 'Suspended']] },
      ],
      columns: [
        { label: 'Gym', cls: 'col-primary', render: (g) => `<div class="cell-user"><span class="avatar" aria-hidden="true">${icon('building', 'icon--sm')}</span><div><div class="cell-user__name">${esc(g.name)}</div><div class="cell-user__sub">${g.id} · ${g.plan}</div></div></div>` },
        { label: 'City', render: (g) => esc(g.city) },
        { label: 'Members', cls: 'col-num', render: (g) => fmtNum(g.members) },
        { label: 'Owner', render: (g) => esc(g.owner) },
        { label: 'Status', render: (g) => badge(g.status) },
        { label: 'Action', cls: 'col-actions', render: (g) => `<div class="row-actions">${g.status === 'pending' ? `<button type="button" class="btn btn--primary btn--sm" data-action="approve-gym" data-id="${g.id}">${icon('check')}Approve</button>` : ''}
            ${actBtn('view-gym', g.id, 'eye', `View ${g.name}`)}${actBtn('manage-gym', g.id, 'sliders', `Manage ${g.name}`)}
            ${g.status === 'suspended' ? actBtn('suspend-gym', g.id, 'play', `Reactivate ${g.name}`, 'success') : g.status === 'active' ? actBtn('suspend-gym', g.id, 'pause', `Suspend ${g.name}`, 'danger') : ''}</div>` },
      ],
    };
  }

  const SuperSections = {
    overview() {
      const s = P().stats, a = P().analytics;
      const pending = P().gyms.filter((g) => g.status === 'pending');
      const top = [...P().gyms].filter((g) => g.status === 'active').sort((x, y) => y.members - x.members).slice(0, 5);
      return `${pageHead({ eyebrow: 'Super Admin', title: 'Platform Console', sub: `FitHub network overview · ${greeting()}, <strong>${esc(firstName(Session.get().user.name))}</strong>`,
          actions: btn('Quick settings', { action: 'quick-settings', ic: 'sliders' }) + btn('Add gym', { action: 'add-gym', variant: 'primary', ic: 'plus' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Active Gyms', value: s.gyms, meta: delta(`${s.newGyms} this month`), ic: 'building', tone: 'accent' })}
            ${kpi({ label: 'Total Members', value: fmtNum(s.members), meta: delta(`${fmtNum(s.newMembers)} this month`), ic: 'users', tone: 'success' })}
            ${kpi({ label: 'Monthly GMV', value: fmtCompactINR(s.gmv), meta: delta('6.4% MoM'), ic: 'wallet', tone: 'info' })}
            ${kpi({ label: 'Platform Uptime', value: `${s.uptime}<small>%</small>`, meta: 'Rolling 30 days · SLA 99.9%', ic: 'server', tone: 'success' })}
          </div>
          <div class="grid grid--main">
            ${card({ title: 'GMV Growth', sub: 'Gross payments processed · last 12 months', actions: `<a class="card__link" href="#/dashboard/analytics">Analytics ${icon('chevronRight')}</a>`,
              body: lineChart({ labels: monthLabels(12), series: [{ name: 'GMV', values: a.gmv }], fmt: fmtCompactINR, fmtTick: (v) => `${(v / 1e7).toFixed(1)}Cr`, label: 'Monthly GMV over 12 months', height: 240 }) })}
            ${card({ title: 'Pending Approvals', sub: `${pending.length} gyms awaiting verification`, body: pending.length ? `<ul class="list">${pending.map((g) => listItem({ ic: 'building', tone: 'warning', title: esc(g.name), sub: `${esc(g.city)} · ${esc(g.owner)} · ${fmtNum(g.members)} members`,
                right: `<div class="flex gap-8"><button type="button" class="btn btn--primary btn--sm" data-action="approve-gym" data-id="${g.id}">Approve</button>${actBtn('view-gym', g.id, 'eye', `Review ${g.name}`)}</div>` })).join('')}</ul>`
                : `<div class="empty">${icon('checkCircle')}<p>All gyms are verified.</p></div>` })}
          </div>
          <div class="grid grid--2">
            ${card({ title: 'Top Gyms', sub: 'By active members', actions: `<a class="card__link" href="#/dashboard/gyms">All gyms ${icon('chevronRight')}</a>`,
              body: `<div class="hbars">${top.map((g) => `<div><div class="hbar__top"><span class="fw-600">${esc(g.name)} <span class="subtle">· ${esc(g.city)}</span></span><span>${fmtNum(g.members)}</span></div>${progress((g.members / top[0].members) * 100, '', 'sm', `${g.name} members`)}</div>`).join('')}</div>` })}
            ${card({ title: 'Recent Activity', sub: 'System events', actions: `<a class="card__link" href="#/dashboard/activity">View log ${icon('chevronRight')}</a>`,
              body: `<div class="timeline">${P().activity.slice(0, 5).map((e) => `<div class="timeline__item">${eventIcon(e)}<div class="list-item__main"><p class="list-item__title">${esc(e.title)}</p><p class="list-item__sub">${esc(e.detail)} · ${relTime(e.at)}</p></div>${badge(e.status)}</div>`).join('')}</div>` })}
          </div>
        </div>`;
    },

    gyms() {
      const g = P().gyms;
      return `${pageHead({ eyebrow: 'Super Admin', title: 'Gyms', sub: `${P().stats.gyms} active gyms across ${cities().length} cities`,
          actions: btn('Export CSV', { action: 'export-gyms', ic: 'download' }) + btn('Add gym', { action: 'add-gym', variant: 'primary', ic: 'plus' }) })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'Active', value: g.filter((x) => x.status === 'active').length, meta: 'In this dataset', ic: 'checkCircle', tone: 'success' })}
            ${kpi({ label: 'Pending', value: g.filter((x) => x.status === 'pending').length, meta: 'Awaiting approval', ic: 'clock', tone: 'warning' })}
            ${kpi({ label: 'Suspended', value: g.filter((x) => x.status === 'suspended').length, meta: 'Access blocked', ic: 'pause', tone: 'info' })}
            ${kpi({ label: 'Members', value: fmtNum(g.reduce((s, x) => s + x.members, 0)), meta: 'Across listed gyms', ic: 'users' })}
          </div>
          ${dataTable('gyms-table', gymsTableConfig())}
        </div>`;
    },

    owners() {
      return `${pageHead({ eyebrow: 'Super Admin', title: 'Owners', sub: 'Gym owners and administrators with console access', actions: btn('Invite owner', { action: 'invite-owner', variant: 'primary', ic: 'userplus' }) })}
        ${dataTable('owners-table', {
          title: 'Owner Management', sub: 'Access, activity and gyms per owner', noun: 'owners', searchPlaceholder: 'Search owner name or email…', searchLabel: 'Search owners',
          rows: () => P().owners, rowId: (o) => o.id, searchText: (o) => `${o.name} ${o.email}`, filterValue: (o, k) => o[k],
          filters: [{ key: 'status', label: 'Filter by status', all: 'All statuses', options: [['active', 'Active'], ['invited', 'Invited'], ['suspended', 'Suspended']] }],
          columns: [
            { label: 'Owner', cls: 'col-primary', render: (o) => cellUser(o.name, o.id) },
            { label: 'Email', render: (o) => `<a class="card__link" href="mailto:${esc(o.email)}">${esc(o.email)}</a>` },
            { label: 'Gyms', cls: 'col-num', render: (o) => ownerGymCount(o) },
            { label: 'Last Active', render: (o) => (o.status === 'invited' ? '<span class="subtle">Never</span>' : relTime(o.lastActive)) },
            { label: 'Status', render: (o) => badge(o.status) },
            { label: 'Action', cls: 'col-actions', render: (o) => `<div class="row-actions">${actBtn('view-owner', o.id, 'eye', `View ${o.name}`)}
                ${o.status === 'suspended' ? actBtn('suspend-owner', o.id, 'play', `Reactivate ${o.name}`, 'success') : actBtn('suspend-owner', o.id, 'pause', `Suspend ${o.name}`, 'danger')}
                ${actBtn('reset-owner', o.id, 'key', `Reset access for ${o.name}`)}</div>` },
          ],
        })}`;
    },

    members() {
      return `${pageHead({ eyebrow: 'Super Admin', title: 'Members', sub: `${fmtNum(P().stats.members)} members across the network`, actions: btn('Export CSV', { action: 'export-platform-members', ic: 'download' }) })}
        ${dataTable('pmembers-table', {
          title: 'Platform Members', sub: 'Search members across every gym', noun: 'members', footNote: `sample of ${fmtNum(P().stats.members)} total`,
          searchPlaceholder: 'Search member, email or gym…', searchLabel: 'Search platform members',
          rows: () => P().members, rowId: (m) => m.id, searchText: (m) => `${m.name} ${m.email} ${m.gym} ${m.id}`, filterValue: (m, k) => m[k],
          filters: [
            { key: 'gym', label: 'Filter by gym', all: 'All gyms', options: [...new Set(P().members.map((m) => m.gym))].sort().map((g) => [g, g]) },
            { key: 'status', label: 'Filter by status', all: 'All statuses', options: [['active', 'Active'], ['paused', 'Paused'], ['expired', 'Expired'], ['suspended', 'Suspended']] },
          ],
          columns: [
            { label: 'Member', cls: 'col-primary', render: (m) => cellUser(m.name, m.email) },
            { label: 'Gym', render: (m) => esc(m.gym) },
            { label: 'Plan', render: (m) => esc(m.plan) },
            { label: 'Joined', render: (m) => fmtDate(m.joined) },
            { label: 'Status', render: (m) => badge(m.status) },
            { label: 'Action', cls: 'col-actions', render: (m) => actBtn('view-platform-member', m.id, 'eye', `View ${m.name}`) },
          ],
        })}`;
    },

    activity() {
      return `${pageHead({ eyebrow: 'Super Admin', title: 'System Activity', sub: 'Audit trail of platform events', actions: btn('Export log', { action: 'export-activity', ic: 'download' }) })}
        ${dataTable('activity-table', {
          title: 'Activity Log', sub: `Retention: ${P().settings.auditRetention} days`, noun: 'events', searchPlaceholder: 'Search events…', searchLabel: 'Search activity log',
          actions: btn('Load older', { action: 'load-more-activity', size: 'sm', ic: 'clock' }),
          rows: () => P().activity, rowId: (e) => e.id, rowClass: (e) => (e.fresh ? 'is-new' : ''), searchText: (e) => `${e.title} ${e.detail} ${e.actor}`, filterValue: (e, k) => e[k],
          filters: [
            { key: 'type', label: 'Filter by type', all: 'All events', options: [['gym', 'Gyms'], ['owner', 'Owners'], ['payment', 'Payments'], ['import', 'Imports'], ['verify', 'Verification'], ['report', 'Reports'], ['security', 'Security'], ['system', 'System'], ['announcement', 'Announcements']] },
            { key: 'status', label: 'Filter by status', all: 'All statuses', options: [['success', 'Success'], ['info', 'Info'], ['warning', 'Warning'], ['failed', 'Failed']] },
          ],
          columns: [
            { label: 'Event', cls: 'col-primary', render: (e) => `<div class="cell-user">${eventIcon(e)}<div><div class="cell-user__name">${esc(e.title)}</div><div class="cell-user__sub" style="white-space:normal">${esc(e.detail)}</div></div></div>` },
            { label: 'Actor', render: (e) => esc(e.actor) },
            { label: 'Timestamp', render: (e) => `${fmtDateTime(e.at)}<span class="cell-sub">${relTime(e.at)}</span>` },
            { label: 'Status', render: (e) => badge(e.status, e.status === 'info' ? 'info' : undefined) },
          ],
        })}`;
    },

    analytics() {
      const a = P().analytics, n = UI.rangeMonths, sl = (arr) => arr.slice(-n);
      const labels = monthLabels(n);
      const mrr = a.mrr[a.mrr.length - 1];
      const arpu = mrr / P().stats.members;
      const seg = [6, 12].map((v) => `<button type="button" data-action="set-range" data-value="${v}" aria-pressed="${n === v}">${v}M</button>`).join('');
      return `${pageHead({ eyebrow: 'Super Admin', title: 'Platform Analytics', sub: 'Subscription revenue, growth and retention', actions: `<div class="segmented" role="group" aria-label="Date range">${seg}</div>` })}
        <div class="stack">
          <div class="grid grid--kpi">
            ${kpi({ label: 'MRR', value: fmtCompactINR(mrr), meta: delta('4.9% MoM'), ic: 'trending', tone: 'accent' })}
            ${kpi({ label: 'ARR', value: fmtCompactINR(mrr * 12), meta: 'Run-rate', ic: 'bar', tone: 'success' })}
            ${kpi({ label: 'Churn', value: `${a.churn}<small>%</small>`, meta: `<span class="delta delta--up">↓ ${(a.churnPrev - a.churn).toFixed(1)} pts</span> monthly`, ic: 'undo', tone: 'warning' })}
            ${kpi({ label: 'ARPU', value: fmtINR(arpu), meta: 'Per member / month', ic: 'users', tone: 'info' })}
          </div>
          <div class="grid grid--2">
            ${card({ title: 'Member Growth', sub: `Total members · last ${n} months`, body: lineChart({ labels, series: [{ name: 'Members', values: sl(a.members) }], fmtTick: (v) => `${(v / 1000).toFixed(0)}K`, fmt: fmtNum, label: 'Member growth', height: 220 }) })}
            ${card({ title: 'Revenue Growth', sub: 'Platform MRR by month', body: barChart({ labels, values: sl(a.mrr), highlight: n - 1, fmt: fmtCompactINR, fmtTick: (v) => `${(v / 1e5).toFixed(0)}L`, label: 'MRR by month', height: 220, tone: 'bar--accent' }) })}
            ${card({ title: 'Gym Growth', sub: 'Active gyms on the network', body: lineChart({ labels, series: [{ name: 'Gyms', values: sl(a.gyms), tone: 'info' }], fmt: (v) => `${v} gyms`, label: 'Gym growth', height: 220, area: false }) })}
            ${card({ title: 'Retention', sub: 'Member cohort retention', actions: badge('Industry avg 63%', 'neutral'),
              body: `<div class="hbars">${a.retention.map(([l, v]) => `<div><div class="hbar__top"><span class="fw-600">${l}</span><span>${v}%</span></div>${progress(v, v >= 85 ? 'success' : v >= 75 ? '' : 'warning', '', `${l} retention`)}</div>`).join('')}</div>` })}
          </div>
        </div>`;
    },

    settings() {
      const s = P().settings;
      return `${pageHead({ eyebrow: 'Super Admin', title: 'System Settings', sub: 'Platform-wide configuration · changes are audited' })}
        <form data-form="system-settings" novalidate><div class="grid grid--2">
          ${card({ title: 'General', body: `<div class="form-grid form-grid--1">${Form.field({ name: 'supportEmail', label: 'Platform support email', type: 'email', value: s.supportEmail, required: true, hint: 'Shown to gyms and members on help pages' })}</div>
              <hr class="divider">${Form.toggle({ name: 'maintenance', label: 'Maintenance mode', desc: 'Show a maintenance notice and pause member check-ins', checked: s.maintenance })}` })}
          ${card({ title: 'Authentication', body: `<div class="form-grid">
              ${Form.field({ name: 'sessionTimeout', label: 'Session timeout', type: 'select', value: s.sessionTimeout, options: [['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['240', '4 hours']] })}
              ${Form.field({ name: 'passwordPolicy', label: 'Password policy', type: 'select', value: s.passwordPolicy, options: [['standard', 'Standard (8+ chars)'], ['strong', 'Strong (12+, mixed)'], ['strict', 'Strict (14+, rotation)']] })}
            </div><hr class="divider">${Form.toggle({ name: 'sso', label: 'Single sign-on (SAML)', desc: 'Allow enterprise gym chains to use their IdP', checked: s.sso })}` })}
          ${card({ title: 'Two-Factor Authentication', body: `${Form.toggle({ name: 'twoFactor', label: 'Require two-factor authentication', desc: 'TOTP app or SMS one-time code', checked: s.twoFactor })}
              <div class="form-grid form-grid--1 mt-16">${Form.field({ name: 'twoFactorScope', label: 'Enforce for', type: 'select', value: s.twoFactorScope, options: [['admins', 'Super admins & gym admins'], ['all', 'Everyone including members'], ['super', 'Super admins only']] })}</div>` })}
          ${card({ title: 'Audit & Notifications', body: `<div class="form-grid form-grid--1">${Form.field({ name: 'auditRetention', label: 'Audit log retention', type: 'select', value: s.auditRetention, options: [['90', '90 days'], ['180', '180 days'], ['365', '1 year'], ['730', '2 years']] })}</div>
              <hr class="divider">${Form.toggle({ name: 'notifyEmail', label: 'Email notifications', desc: 'Approvals, suspensions and exports', checked: s.notifyEmail })}
              ${Form.toggle({ name: 'notifyIncidents', label: 'Incident alerts', desc: 'Webhook failures and downtime', checked: s.notifyIncidents })}
              ${Form.toggle({ name: 'weeklyDigest', label: 'Weekly digest', desc: 'Platform KPIs every Monday', checked: s.weeklyDigest })}` })}
        </div><div class="flex gap-8 mt-20"><button type="submit" class="btn btn--primary">${icon('check')}Save settings</button></div></form>`;
    },
  };

  const SECTIONS = { member: MemberSections, owner: OwnerSections, superadmin: SuperSections };

  /* 16. ACTIONS & HANDLERS -------------------------------------------- */
  function paintSection({ animate = false } = {}) {
    const main = $('#main-content');
    if (!main) return;
    const out = SECTIONS[UI.role][UI.section]();
    main.innerHTML = typeof out === 'string' ? out : out.html;
    if (animate) { main.style.animation = 'none'; void main.offsetWidth; main.style.animation = ''; }
    if (out && out.mount) out.mount();
  }
  function rerender({ focus } = {}) {
    if (!UI.role) return;
    const y = window.scrollY;
    stopTickers();
    paintSection();
    window.scrollTo(0, y);
    if (focus) $(focus)?.focus({ preventScroll: true });
  }
  function rebuildShell() { UI.role = null; router(); }

  const findBy = (arr, id) => arr.find((x) => x.id === id);
  const optionsFrom = (arr, v = (x) => x.id, l = (x) => x.name) => arr.map((x) => [v(x), l(x)]);
  const planOptions = (activeOnly = true) => DB.plans.filter((p) => !activeOnly || p.active).map((p) => [p.id, `${p.name} · ${fmtINR(p.price)} ${periodLabel(p.period)}`]);
  const periodText = { 'this-month': 'This month', 'last-month': 'Last month', quarter: 'Last 3 months', ytd: 'Year to date' };

  function invoiceHTML({ id, date, billedTo, email, items, method, status }) {
    const total = items.reduce((s, [, a]) => s + a, 0);
    const gst = Math.round(total - total / 1.18);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(id)} · FitHub</title>
      <style>body{font-family:Inter,Arial,sans-serif;color:#111;max-width:720px;margin:40px auto;padding:0 24px}h1{font-size:34px;letter-spacing:1px;margin:0}h1 span{color:#F0441D}
      table{width:100%;border-collapse:collapse;margin-top:28px}th,td{padding:12px 8px;border-bottom:1px solid #eee;text-align:left}th{font-size:12px;text-transform:uppercase;color:#777;letter-spacing:.08em}
      .r{text-align:right}.meta{display:flex;justify-content:space-between;margin-top:28px;font-size:14px;line-height:1.6}.tot td{font-weight:700;font-size:16px;border:0}.muted{color:#777;font-size:12px}</style></head>
      <body><h1><span>FIT</span>HUB</h1><p class="muted">Tax invoice · ${esc(DB.gym.name)} · ${esc(DB.gym.address)}</p>
      <div class="meta"><div><strong>Billed to</strong><br>${esc(billedTo)}<br>${esc(email || '')}</div><div class="r"><strong>${esc(id)}</strong><br>Date: ${fmtDate(date)}<br>Status: ${esc(cap(status))}<br>Paid via: ${esc(method)}</div></div>
      <table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>${items.map(([d, a]) => `<tr><td>${esc(d)}</td><td class="r">${fmtINR(a)}</td></tr>`).join('')}
      <tr><td class="muted">Includes GST @ 18%</td><td class="r muted">${fmtINR(gst)}</td></tr><tr class="tot"><td>Total</td><td class="r">${fmtINR(total)}</td></tr></tbody></table>
      <p class="muted" style="margin-top:40px">Generated by FitHub demo · This is a sample document with fictional data.</p></body></html>`;
  }

  function buildReport(type, period) {
    const k = { 'this-month': 1, 'last-month': 0.96, quarter: 2.9, ytd: 8.6 }[period] || 1;
    const plans = DB.plans.filter((p) => p.members > 0);
    if (type === 'revenue') {
      const rev = plans.map((p) => Math.round((p.id === 'annual' ? p.members * p.price / 12 : p.members * p.price) * 0.62 * k));
      const total = rev.reduce((a, b) => a + b, 0);
      return { title: 'Revenue Report', kpis: [['Collected', fmtCompactINR(G().stats.collected * k)], ['Pending', fmtCompactINR(G().stats.pending * Math.min(k, 1.4))], ['Refunds', fmtCompactINR(G().stats.refunds * k)]],
        chart: { labels: plans.map((p) => p.name), values: rev, fmt: fmtCompactINR, tick: (v) => `${(v / 1e5).toFixed(1)}L`, sub: 'Revenue by plan' },
        header: ['Plan', 'Members', 'Revenue (INR)', 'Share'], rows: plans.map((p, i) => [p.name, p.members, rev[i], `${((rev[i] / total) * 100).toFixed(1)}%`]) };
    }
    if (type === 'attendance') {
      const zones = G().zones.map((z, i) => Math.round([1480, 920, 610, 410][i] * k));
      return { title: 'Attendance Report', kpis: [['Check-ins', fmtNum(zones.reduce((a, b) => a + b, 0))], ['Daily average', fmtNum(3420 / 30)], ['Avg session', `${G().stats.avgSession} min`]],
        chart: { labels: G().hourlyLabels.slice(0, 13), values: [96, 118, 104, 71, 44, 38, 49, 42, 31, 36, 52, 88, 110].map((v) => Math.round(v * k)), fmt: (v) => `${fmtNum(v)} check-ins`, tick: fmtNum, sub: 'Check-ins by hour' },
        header: ['Zone', 'Check-ins', 'Avg session (min)', 'Peak hour'], rows: G().zones.map((z, i) => [z.name, zones[i], [74, 41, 55, 48][i], ['7 AM', '6 AM', '7 PM', '6 PM'][i]]) };
    }
    const joins = plans.map((p) => Math.round(p.members * 0.06 * k));
    return { title: 'Membership Report', kpis: [['New joins', fmtNum(joins.reduce((a, b) => a + b, 0))], ['Renewals', fmtNum(Math.round(188 * k))], ['Churn rate', '3.1%']],
      chart: { labels: plans.map((p) => p.name), values: plans.map((p) => p.members), fmt: (v) => `${v} members`, tick: fmtNum, sub: 'Active members by plan' },
      header: ['Plan', 'Active members', 'New joins', 'Renewals', 'Churned'], rows: plans.map((p, i) => [p.name, p.members, joins[i], Math.round(p.members * 0.29 * Math.min(k, 3)), Math.round(p.members * 0.03 * k)]) };
  }
  function addReportHistory(name, format) {
    G().reportsHistory.unshift({ id: uid('r'), name, at: new Date(), format });
    const ul = $('#report-history');
    if (ul) ul.innerHTML = G().reportsHistory.map((r) => listItem({ ic: 'file', tone: 'accent', title: esc(r.name), sub: fmtDateTime(r.at), right: badge(r.format, r.format === 'CSV' ? 'info' : 'neutral') })).join('');
  }

  function checkWorkoutCompletion() {
    const w = M().workout, all = w.exercises.every((e) => e.done);
    if (all && !w.logged) {
      w.logged = uid('s');
      M().sessionsDone++;
      M().sessions.unshift({ id: w.logged, date: new Date(), type: w.title, duration: w.duration, notes: 'Completed from today’s plan' });
      Toast.success(`${w.title} logged. Program progress is now ${programPct()}%.`, 'Workout completed');
    } else if (!all && w.logged) {
      M().sessions = M().sessions.filter((s) => s.id !== w.logged);
      M().sessionsDone--;
      w.logged = false;
    }
  }

  function saveSystemSettings(data) {
    const s = P().settings, wasMaint = s.maintenance;
    Object.keys(data).forEach((k) => { if (k in s) s[k] = data[k]; });
    Storage.set('platformSettings', s);
    const bar = $('#maintenance-bar'); if (bar) bar.hidden = !s.maintenance;
    logActivity('system', 'System settings updated', `Support: ${s.supportEmail} · 2FA ${s.twoFactor ? 'on' : 'off'} · retention ${s.auditRetention}d`, 'success');
    if (s.maintenance !== wasMaint) Toast.show(s.maintenance ? 'Members and gym admins now see a maintenance notice.' : 'The platform is live for everyone again.', { type: s.maintenance ? 'warning' : 'success', title: s.maintenance ? 'Maintenance mode enabled' : 'Maintenance mode disabled' });
    else Toast.success('System settings were saved and recorded in the audit log.', 'Settings saved');
  }

  function memberForm(m = {}) {
    return `<div class="form-grid">
      ${Form.field({ name: 'name', label: 'Full name', value: m.name || '', required: true, placeholder: 'e.g. Priya Sharma', attrs: 'autofocus' })}
      ${Form.field({ name: 'email', label: 'Email', type: 'email', value: m.email || '', required: true, placeholder: 'name@example.com' })}
      ${Form.field({ name: 'phone', label: 'Mobile', type: 'tel', value: m.phone || '', required: true, placeholder: '+91 98xxx xxxxx', attrs: 'data-validate="phone"' })}
      ${Form.field({ name: 'planId', label: 'Plan', type: 'select', value: m.planId || 'premium', options: planOptions(!m.id) })}
      ${m.id ? Form.field({ name: 'renewal', label: 'Renewal date', type: 'date', value: isoDate(m.renewal), required: true })
             : Form.field({ name: 'start', label: 'Start date', type: 'date', value: isoDate(T), required: true })}
      ${m.id ? Form.field({ name: 'status', label: 'Status', type: 'select', value: m.status, options: [['active', 'Active'], ['paused', 'Paused']] })
             : Form.field({ name: 'payment', label: 'Payment', type: 'select', value: 'paid', options: [['paid', 'Collected now'], ['pending', 'Collect later']] })}
    </div>`;
  }
  function planForm(p = {}) {
    return `<div class="form-grid">
      ${Form.field({ name: 'name', label: 'Plan name', value: p.name || '', required: true, placeholder: 'e.g. Weekend Warrior', attrs: 'autofocus' })}
      ${Form.field({ name: 'price', label: 'Price (₹)', type: 'number', value: p.price ?? '', required: true, attrs: 'min="0" max="500000" step="1"' })}
      ${Form.field({ name: 'period', label: 'Billing period', type: 'select', value: p.period || 'month', options: [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']] })}
      ${Form.field({ name: 'durationDays', label: 'Duration (days)', type: 'number', value: p.durationDays ?? 30, required: true, attrs: 'min="1" max="730"' })}
      ${Form.field({ name: 'features', label: 'Features', type: 'textarea', value: (p.features || []).join('\n'), required: true, full: true, hint: 'One feature per line', rows: 5 })}
    </div><div class="mt-16">${Form.toggle({ name: 'active', label: 'Plan is active', desc: 'Active plans can be sold at the desk and in the member app', checked: p.active ?? true })}</div>`;
  }
  function trainerForm(t = {}) {
    return `<div class="form-grid">
      ${Form.field({ name: 'name', label: 'Full name', value: t.name || '', required: true, attrs: 'autofocus' })}
      ${Form.field({ name: 'spec', label: 'Specialization', value: t.spec || '', required: true, placeholder: 'e.g. Strength & Conditioning' })}
      ${Form.field({ name: 'email', label: 'Email', type: 'email', value: t.email || '', required: true })}
      ${Form.field({ name: 'phone', label: 'Mobile', type: 'tel', value: t.phone || '', required: true, attrs: 'data-validate="phone"' })}
      ${Form.field({ name: 'exp', label: 'Experience (years)', type: 'number', value: t.exp ?? 1, required: true, attrs: 'min="0" max="50"' })}
      ${Form.field({ name: 'schedule', label: 'Schedule', value: t.schedule || 'Mon–Fri · 06:00–14:00', required: true })}
      ${Form.field({ name: 'certs', label: 'Certifications', value: (t.certs || []).join(', '), hint: 'Comma separated', full: true })}
      ${Form.field({ name: 'bio', label: 'Bio', type: 'textarea', value: t.bio || '', full: true, rows: 3 })}
    </div>`;
  }
  function gymForm(g = {}) {
    return `<div class="form-grid">
      ${Form.field({ name: 'name', label: 'Gym name', value: g.name || '', required: true, attrs: 'autofocus' })}
      ${Form.field({ name: 'city', label: 'City', value: g.city || '', required: true, placeholder: 'e.g. Pune' })}
      ${g.id ? Form.field({ name: 'owner', label: 'Owner', type: 'select', value: g.owner, options: P().owners.map((o) => [o.name, o.name]) })
             : Form.field({ name: 'owner', label: 'Owner name', required: true, placeholder: 'Owner full name' })}
      ${g.id ? Form.field({ name: 'members', label: 'Members', type: 'number', value: g.members, required: true, attrs: 'min="0" max="100000"' })
             : Form.field({ name: 'ownerEmail', label: 'Owner email', type: 'email', required: true, placeholder: 'owner@gym.in' })}
      ${Form.field({ name: 'plan', label: 'Platform tier', type: 'select', value: g.plan || 'Starter', options: ['Starter', 'Growth', 'Enterprise'] })}
      ${Form.field({ name: 'status', label: 'Status', type: 'select', value: g.status || 'pending', options: [['pending', 'Pending verification'], ['active', 'Active'], ['suspended', 'Suspended']] })}
    </div>`;
  }

  const Actions = {
    /* ---- Global ---- */
    'modal-close': () => Modal.close(),
    'open-drawer': openDrawer,
    'close-drawer': closeDrawer,
    'skip-to': (el) => { const t = document.getElementById(el.dataset.target); t?.focus(); t?.scrollIntoView({ block: 'start' }); },
    'scroll-to': (el) => {
      const t = document.getElementById(el.dataset.target);
      $('#mobile-menu')?.classList.remove('is-open');
      $('[data-action="toggle-site-menu"]')?.setAttribute('aria-expanded', 'false');
      if (t) { window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' }); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
    },
    'toggle-site-menu': (el) => { const m = $('#mobile-menu'); const open = !m.classList.contains('is-open'); m.classList.toggle('is-open', open); el.setAttribute('aria-expanded', String(open)); el.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); el.innerHTML = icon(open ? 'x' : 'menu'); },
    'toggle-popover': (el) => {
      const pop = document.getElementById(el.dataset.popover);
      const open = pop.hidden;
      closePopovers(open ? pop.id : undefined);
      pop.hidden = !open;
      el.setAttribute('aria-expanded', String(open));
    },
    'mark-all-read': () => {
      NOTIFICATIONS[UI.role].forEach((n) => { n.unread = false; });
      $$('.notif.is-unread').forEach((n) => n.classList.remove('is-unread'));
      $('#notif-count')?.remove();
      Toast.info('All notifications marked as read.');
    },
    'toggle-password': (el) => {
      const input = document.getElementById(el.getAttribute('aria-controls'));
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      el.innerHTML = icon(show ? 'eyeOff' : 'eye', 'icon--sm');
    },
    'fill-demo': (el) => {
      const form = $('form[data-form="login"]');
      form.elements.identifier.value = el.dataset.email;
      form.elements.password.value = 'demo';
      $$('input', form).forEach((i) => Form.setError(i, ''));
      $('#login-alert').hidden = true;
      form.querySelector('button[type="submit"]').focus();
      Toast.info('Demo credentials filled in. Press sign in to continue.');
    },
    'table-clear': (el) => {
      const id = el.dataset.table;
      tableState[id] = { q: '', filters: {} };
      $$(`[data-table-search="${id}"]`).forEach((i) => { i.value = ''; });
      $$(`[data-table-filter="${id}"]`).forEach((s) => { s.value = ''; });
      refreshTable(id);
      $(`[data-table-search="${id}"]`)?.focus();
    },
    'create-account': () => Modal.open({
      title: 'Create Account', eyebrow: 'Join FitHub', submitLabel: 'Create account',
      body: `<div class="form-grid">${Form.field({ name: 'name', label: 'Full name', required: true, autocomplete: 'name', attrs: 'autofocus' })}
        ${Form.field({ name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email' })}
        ${Form.field({ name: 'mobile', label: 'Mobile', type: 'tel', required: true, attrs: 'data-validate="phone"', autocomplete: 'tel' })}
        ${Form.field({ name: 'gym', label: 'Home gym', type: 'select', value: 'Iron Temple Fitness', options: P().gyms.filter((g) => g.status === 'active').map((g) => [g.name, `${g.name} · ${g.city}`]) })}
        ${Form.field({ name: 'password', label: 'Password', type: 'password', required: true, attrs: 'minlength="6"', autocomplete: 'new-password' })}
        ${Form.field({ name: 'confirm', label: 'Confirm password', type: 'password', required: true, attrs: 'data-validate="match" data-match="password"', autocomplete: 'new-password' })}
        </div><p class="text-xs subtle mt-16">Demo only — your details stay in this browser. Passwords are never stored.</p>`,
      onSubmit: async (d, form) => {
        try {
          const session = await Api.register(d);
          Session.set(session);
          Toast.success(`Welcome to FitHub, ${firstName(d.name)}!`, 'Account created');
          location.hash = '#/dashboard/overview';
        } catch (err) { Form.setError(form.elements.email, err.message); form.elements.email.focus(); return false; }
      },
    }),
    logout: async () => {
      await Api.logout();
      Session.clear();
      stopTickers();
      UI.role = null;
      Toast.info('You have been signed out securely.', 'Logged out');
      location.hash = '#/roles';
    },
    'open-announcement': () => {
      const isSuper = UI.role === 'superadmin';
      const aud = isSuper ? [['owners', `All gym owners (${P().owners.length})`], ['members', `All members (${fmtNum(P().stats.members)})`], ['city', 'Gyms in Mumbai (2)']]
        : [['all', `All members (${fmtNum(G().stats.active)})`], ['expiring', `Expiring members (${G().stats.expiring})`], ['trainers', `Trainers (${G().trainers.length})`]];
      Modal.open({
        title: 'New Announcement', eyebrow: isSuper ? 'Platform broadcast' : DB.gym.name, submitLabel: 'Send announcement', size: 'lg',
        body: `<div class="form-grid">
          ${Form.field({ name: 'title', label: 'Title', required: true, placeholder: isSuper ? 'e.g. Scheduled maintenance on Sunday' : 'e.g. New HIIT batch at 7 PM', full: true, attrs: 'autofocus maxlength="80"' })}
          ${Form.field({ name: 'audience', label: 'Audience', type: 'select', options: aud })}
          ${Form.field({ name: 'when', label: 'Send', type: 'select', options: [['now', 'Immediately'], ['tomorrow', 'Tomorrow, 9:00 AM'], ['weekend', 'Saturday, 8:00 AM']] })}
          ${Form.field({ name: 'message', label: 'Message', type: 'textarea', required: true, full: true, attrs: 'minlength="10" maxlength="500"', placeholder: 'Write your announcement…' })}
          <div class="field field--full"><span class="label">Channels</span><div class="check-group">
            ${[['push', 'Push', true], ['email', 'Email', true], ['sms', 'SMS', false]].map(([v, l, c]) => `<label class="check-pill"><input type="checkbox" name="channels" value="${v}" ${c ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div></div></div>`,
        onSubmit: async (d) => {
          const ch = [].concat(d.channels || []);
          if (!ch.length) { Toast.error('Select at least one delivery channel.'); return false; }
          await wait(400);
          const label = aud.find((a) => a[0] === d.audience)[1];
          if (isSuper) logActivity('announcement', 'Announcement sent', `“${d.title}” → ${label} via ${ch.join(', ')}`, 'success');
          Toast.success(`“${d.title}” ${d.when === 'now' ? 'sent' : 'scheduled'} to ${label.toLowerCase()} via ${ch.join(' + ')}.`, 'Announcement sent');
        },
      });
    },

    /* ---- Member ---- */
    'quick-checkin': () => {
      if (checkedInToday()) { Toast.info(`You checked in at ${fmtTime(M().attendance[0].date)} today. Enjoy your session!`, 'Already checked in'); return; }
      const m = M();
      m.attendance.unshift({ id: uid('a'), date: new Date(), gym: 'Iron Temple · Andheri West', duration: null, status: 'In progress' });
      m.visitsThisMonth++; m.streak++; m.bestStreak = Math.max(m.bestStreak, m.streak);
      Toast.success(`Checked in at ${m.gym} · ${fmtTime(new Date())}. Streak: ${m.streak} days.`, 'Check-in successful');
      if (UI.section) rerender();
    },
    'toggle-exercise': (el) => {
      const ex = findBy(M().workout.exercises, el.dataset.id);
      ex.done = !ex.done;
      checkWorkoutCompletion();
      rerender({ focus: `[data-action="toggle-exercise"][data-id="${ex.id}"]` });
    },
    'complete-all': () => { M().workout.exercises.forEach((e) => { e.done = true; }); checkWorkoutCompletion(); rerender(); },
    'reset-workout': () => { M().workout.exercises.forEach((e) => { e.done = false; }); checkWorkoutCompletion(); rerender(); Toast.info('Today’s workout has been reset.'); },
    'log-workout': () => Modal.open({
      title: 'Log Workout', eyebrow: 'Training log', submitLabel: 'Log workout',
      body: `<div class="form-grid">${Form.field({ name: 'type', label: 'Workout type', type: 'select', options: ['Strength — Upper Body', 'Strength — Lower Body', 'HIIT Conditioning', 'Running', 'Yoga & Mobility', 'Swimming', 'Sports'] })}
        ${Form.field({ name: 'date', label: 'Date', type: 'date', value: isoDate(T), required: true, attrs: `max="${isoDate(T)}"` })}
        ${Form.field({ name: 'duration', label: 'Duration (minutes)', type: 'number', value: 45, required: true, attrs: 'min="5" max="300"' })}
        ${Form.field({ name: 'effort', label: 'Effort', type: 'select', value: 'Hard', options: ['Easy', 'Moderate', 'Hard', 'Max effort'] })}
        ${Form.field({ name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 3, placeholder: 'PRs, how you felt, anything your trainer should know' })}</div>`,
      onSubmit: (d) => {
        M().sessions.unshift({ id: uid('s'), date: parseISO(d.date), type: d.type, duration: Number(d.duration), notes: [d.effort, d.notes].filter(Boolean).join(' · ') });
        M().sessions.sort((a, b) => b.date - a.date);
        Toast.success(`${d.type} · ${d.duration} min added to your training log.`, 'Workout logged');
        rerender();
      },
    }),
    'ask-trainer': () => Modal.open({
      title: 'Ask Trainer', eyebrow: 'Message your coach', submitLabel: 'Send message',
      body: `<div class="form-grid">${Form.field({ name: 'trainer', label: 'Trainer', type: 'select', value: M().trainer, options: G().trainers.map((t) => [t.name, `${t.name} · ${t.spec}`]) })}
        ${Form.field({ name: 'topic', label: 'Topic', type: 'select', options: ['Workout program', 'Form & technique', 'Nutrition', 'Injury or pain', 'Book a PT session'] })}
        ${Form.field({ name: 'message', label: 'Message', type: 'textarea', required: true, full: true, attrs: 'minlength="10" autofocus', placeholder: 'e.g. My lower back feels tight on seated rows — should I adjust the weight?' })}</div>`,
      onSubmit: async (d) => { await wait(400); Toast.success(`${d.trainer} usually replies within 2 hours.`, 'Message sent'); },
    }),
    'choose-plan': (el) => {
      const m = M(), p = planById(el.dataset.id), cur = planById(m.planId);
      const upgrade = PLAN_ORDER.indexOf(p.id) > PLAN_ORDER.indexOf(m.planId);
      if (!upgrade) {
        Modal.confirm({ title: `Switch to ${p.name}?`, eyebrow: 'Change plan', confirmLabel: 'Schedule switch',
          message: `You’ll keep all <strong>${esc(cur.name)}</strong> benefits until <strong>${fmtDate(m.renewal)}</strong>. From then you’ll be billed <strong>${fmtINR(p.price)} ${periodLabel(p.period)}</strong>.` })
          .then((ok) => { if (!ok) return; m.scheduledPlan = p.id; rerender(); Toast.info(`Your plan will switch to ${p.name} on ${fmtDate(m.renewal)}.`, 'Switch scheduled'); });
        return;
      }
      const cycleValue = cur.id === 'annual' ? cur.price : cur.price * 3;
      const credit = Math.round((cycleValue * memberDaysLeft()) / m.cycleDays);
      const charge = p.id === 'annual' ? p.price : p.price * 3;
      const due = Math.max(0, charge - credit);
      Modal.open({
        title: `Upgrade to ${p.name}`, eyebrow: 'Membership upgrade', submitLabel: `Pay ${fmtINR(due)} & upgrade`,
        body: `<ul class="list">
            ${listItem({ ic: 'idcard', tone: 'accent', title: `${esc(p.name)} ${p.id === 'annual' ? '(12 months)' : '(3 months)'}`, right: `<span class="fw-600">${fmtINR(charge)}</span>` })}
            ${listItem({ ic: 'undo', tone: 'success', title: `Credit for unused ${esc(cur.name)}`, sub: `${memberDaysLeft()} days remaining`, right: `<span class="fw-600 text-success">− ${fmtINR(credit)}</span>` })}
            ${listItem({ ic: 'wallet', title: '<strong>Due today</strong>', right: `<span class="kpi__value" style="font-size:30px;margin:0">${fmtINR(due)}</span>` })}
          </ul><div class="form-grid form-grid--1 mt-20">${Form.field({ name: 'method', label: 'Pay with', type: 'select', value: m.methods.find((x) => x.primary)?.id, options: m.methods.map((x) => [x.id, x.type === 'upi' ? `UPI · ${x.upi}` : `${x.brand} •••• ${x.last4}`]) })}</div>`,
        onSubmit: async (d) => {
          await wait(700);
          const method = findBy(m.methods, d.method);
          m.planId = p.id; m.scheduledPlan = null;
          m.cycleDays = p.id === 'annual' ? 365 : 90; m.billing = p.id === 'annual' ? 'annual' : 'quarterly';
          m.renewal = addDays(T, m.cycleDays);
          m.invoices.unshift({ id: `INV-${T.getFullYear()}-${String(Math.floor(R() * 9000) + 1000)}`, date: new Date(), desc: `Upgrade to ${p.name} (credit ${fmtINR(credit)} applied)`, amount: due, method: method.type === 'upi' ? 'UPI' : `${method.brand} •••• ${method.last4}`, status: 'Paid' });
          const gm = findBy(G().members, 'm1'); if (gm) { gm.planId = p.id; gm.renewal = m.renewal; }
          Toast.success(`You’re now on ${p.name}. Valid until ${fmtDate(m.renewal)}.`, 'Upgrade complete');
          rerender();
        },
      });
    },
    'cancel-switch': () => { M().scheduledPlan = null; rerender(); Toast.info('Scheduled plan switch cancelled.'); },
    'renew-membership': () => {
      const m = M(), p = planById(m.planId), amount = p.id === 'annual' ? p.price : p.price * 3;
      Modal.confirm({ title: 'Renew Membership', eyebrow: p.name, confirmLabel: `Pay ${fmtINR(amount)}`,
        message: `Renew <strong>${esc(p.name)}</strong> for another ${m.cycleDays} days. Your new expiry will be <strong>${fmtDate(addDays(m.renewal, m.cycleDays))}</strong>. The charge goes to your primary payment method.` })
        .then((ok) => {
          if (!ok) return;
          m.renewal = addDays(m.renewal, m.cycleDays);
          const pm = m.methods.find((x) => x.primary);
          m.invoices.unshift({ id: `INV-${T.getFullYear()}-${String(Math.floor(R() * 9000) + 1000)}`, date: new Date(), desc: `${p.name} · renewal`, amount, method: pm ? (pm.type === 'upi' ? 'UPI' : `${pm.brand} •••• ${pm.last4}`) : 'Card', status: 'Paid' });
          Toast.success(`Membership extended to ${fmtDate(m.renewal)}.`, 'Payment recorded');
          rerender();
        });
    },
    'freeze-membership': () => {
      const m = M();
      if (m.frozen) { m.frozen = false; rerender(); Toast.success('Your membership is active again. Welcome back!', 'Membership unfrozen'); return; }
      Modal.open({
        title: 'Freeze Membership', eyebrow: 'Pause your plan', submitLabel: 'Freeze membership',
        body: `<p class="modal__text">Travelling or recovering? Freezing pauses your membership and extends your renewal date by the same number of days.</p>
          <div class="form-grid mt-16">${Form.field({ name: 'days', label: 'Freeze for', type: 'select', value: '14', options: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] })}
          ${Form.field({ name: 'reason', label: 'Reason', type: 'select', options: ['Travel', 'Injury / medical', 'Work', 'Other'] })}</div>`,
        onSubmit: (d) => { m.frozen = true; m.renewal = addDays(m.renewal, Number(d.days)); rerender(); Toast.success(`Frozen for ${d.days} days. New renewal date: ${fmtDate(m.renewal)}.`, 'Membership frozen'); },
      });
    },
    'download-invoice': (el) => {
      const inv = findBy(M().invoices, el.dataset.id);
      if (!inv) { Toast.error('Invoice not found.'); return; }
      download(`${inv.id}.html`, invoiceHTML({ id: inv.id, date: inv.date, billedTo: M().name, email: M().email, items: [[inv.desc, inv.amount]], method: inv.method, status: inv.status }), 'text/html');
      Toast.success(`${inv.id} saved to your downloads.`, 'Invoice downloaded');
    },
    'add-payment-method': () => Modal.open({
      title: 'Add Payment Method', eyebrow: 'Payments', submitLabel: 'Save payment method',
      body: `<div class="segmented" role="group" aria-label="Payment method type" style="margin-bottom:18px">
          <button type="button" data-pay-type="card" aria-pressed="true">${'Card'}</button><button type="button" data-pay-type="upi" aria-pressed="false">UPI</button></div>
        <input type="hidden" name="type" value="card">
        <div class="form-grid" data-group="card">
          ${Form.field({ name: 'number', label: 'Card number', required: true, placeholder: '4242 4242 4242 4242', full: true, attrs: 'data-validate="card" inputmode="numeric" maxlength="23" autocomplete="cc-number"' })}
          ${Form.field({ name: 'cardName', label: 'Name on card', required: true, value: M().name, autocomplete: 'cc-name' })}
          ${Form.field({ name: 'exp', label: 'Expiry (MM/YY)', required: true, placeholder: '08/29', attrs: 'data-validate="expiry" inputmode="numeric" maxlength="5" autocomplete="cc-exp"' })}
          ${Form.field({ name: 'cvv', label: 'CVV', type: 'password', required: true, placeholder: '•••', attrs: 'data-validate="cvv" inputmode="numeric" maxlength="4" autocomplete="cc-csc"' })}
        </div>
        <div class="form-grid form-grid--1" data-group="upi" hidden>
          ${Form.field({ name: 'upi', label: 'UPI ID', required: true, placeholder: 'name@okhdfcbank', attrs: 'data-validate="upi"' })}
        </div>
        <div class="mt-16">${Form.toggle({ name: 'primary', label: 'Set as primary', desc: 'Use for renewals and upgrades', checked: false })}</div>
        <div class="notice mt-16">${icon('lock')}<p>Card details are tokenised by the payment gateway. FitHub never stores your full card number or CVV.</p></div>`,
      onOpen: (modal) => {
        $$('[data-pay-type]', modal).forEach((b) => b.addEventListener('click', () => {
          const t = b.dataset.payType;
          $$('[data-pay-type]', modal).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          $('input[name="type"]', modal).value = t;
          $$('[data-group]', modal).forEach((g) => { g.hidden = g.dataset.group !== t; });
        }));
        const num = $('input[name="number"]', modal);
        num.addEventListener('input', () => { num.value = num.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '); });
        const exp = $('input[name="exp"]', modal);
        exp.addEventListener('input', () => { const v = exp.value.replace(/\D/g, '').slice(0, 4); exp.value = v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v; });
      },
      onSubmit: async (d, form) => {
        await wait(500);
        const type = form.elements.type.value;
        const digits = (d.number || '').replace(/\D/g, '');
        const method = type === 'upi' ? { id: uid('pm'), type: 'upi', upi: d.upi, primary: false }
          : { id: uid('pm'), type: 'card', brand: /^4/.test(digits) ? 'VISA' : /^5[1-5]/.test(digits) ? 'MC' : /^6/.test(digits) ? 'RUPAY' : 'CARD', last4: digits.slice(-4), exp: d.exp, name: d.cardName, primary: false };
        if (d.primary || !M().methods.length) { M().methods.forEach((x) => { x.primary = false; }); method.primary = true; }
        M().methods.push(method);
        Toast.success(type === 'upi' ? `UPI ID ${d.upi} saved.` : `Card ending ${method.last4} saved.`, 'Payment method added');
        rerender();
      },
    }),
    'set-primary-method': (el) => { M().methods.forEach((x) => { x.primary = x.id === el.dataset.id; }); rerender(); Toast.success('Primary payment method updated.'); },
    'remove-method': (el) => {
      const pm = findBy(M().methods, el.dataset.id);
      Modal.confirm({ title: 'Remove payment method?', danger: true, confirmLabel: 'Remove', message: `<strong>${esc(pm.type === 'upi' ? pm.upi : `${pm.brand} •••• ${pm.last4}`)}</strong> will no longer be available for payments.` })
        .then((ok) => { if (!ok) return; M().methods = M().methods.filter((x) => x.id !== pm.id); rerender(); Toast.success('Payment method removed.'); });
    },
    'log-measurement': () => Modal.open({
      title: 'Log Measurement', eyebrow: 'Progress', submitLabel: 'Save measurement',
      body: `<div class="form-grid">${Form.field({ name: 'weight', label: 'Body weight (kg)', type: 'number', required: true, value: M().progress.weight.at(-1), attrs: 'min="30" max="250" step="0.1" autofocus' })}
        ${Form.field({ name: 'date', label: 'Date', type: 'date', value: isoDate(T), required: true, attrs: `max="${isoDate(T)}"` })}
        ${Form.field({ name: 'bench', label: 'Bench press 1RM (kg)', type: 'number', value: M().progress.strength[0].current, attrs: 'min="0" max="400" step="0.5"' })}
        ${Form.field({ name: 'fiveK', label: '5K time (minutes)', type: 'number', value: M().progress.fiveK.at(-1), attrs: 'min="10" max="90" step="0.1"' })}</div>`,
      onSubmit: (d) => {
        const p = M().progress;
        p.weight.push(Number(d.weight)); p.weightDates.push(parseISO(d.date));
        if (p.weight.length > 12) { p.weight.shift(); p.weightDates.shift(); }
        if (d.bench) p.strength[0].current = Number(d.bench);
        if (d.fiveK) p.fiveK[p.fiveK.length - 1] = Math.min(p.fiveK.at(-1), Number(d.fiveK));
        Toast.success(`Weight ${d.weight} kg logged for ${fmtShort(parseISO(d.date))}.`, 'Measurement saved');
        rerender();
      },
    }),
    'change-password': () => Modal.open({
      title: 'Change Password', eyebrow: 'Security', size: 'sm', submitLabel: 'Update password',
      body: `<div class="form-grid form-grid--1">${Form.field({ name: 'current', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password' })}
        ${Form.field({ name: 'next', label: 'New password', type: 'password', required: true, attrs: 'minlength="8"', hint: 'At least 8 characters', autocomplete: 'new-password' })}
        ${Form.field({ name: 'confirm', label: 'Confirm new password', type: 'password', required: true, attrs: 'data-validate="match" data-match="next"', autocomplete: 'new-password' })}</div>`,
      onSubmit: async () => { await wait(500); Toast.success('Use your new password next time you sign in.', 'Password updated'); },
    }),
    'export-attendance': () => {
      download('fithub-attendance.csv', toCSV(['Date', 'Gym', 'Check-in', 'Duration (min)', 'Status'], M().attendance.map((a) => [isoDate(a.date), a.gym, fmtTime(a.date), a.duration ?? '', a.status])));
      Toast.success('Attendance history exported as CSV.', 'Export ready');
    },

    /* ---- Gym owner ---- */
    'add-member': () => Modal.open({
      title: 'Add Member', eyebrow: DB.gym.name, submitLabel: 'Add member', body: memberForm(),
      onSubmit: async (d, form) => {
        if (G().members.some((m) => m.email.toLowerCase() === d.email.toLowerCase())) { Form.setError(form.elements.email, 'A member with this email already exists.'); form.elements.email.focus(); return false; }
        await wait(400);
        const plan = planById(d.planId), start = parseISO(d.start);
        const m = { id: uid('m'), name: d.name, email: d.email, phone: d.phone, planId: plan.id, status: 'active', lastVisit: start, renewal: addDays(start, plan.durationDays), joined: start, visits: 0 };
        G().members.unshift(m);
        G().stats.active++; G().stats.newThisMonth++; plan.members++;
        G().payments.unshift({ id: `INV-24${Math.floor(R() * 900) + 100}`, member: m.name, memberId: m.id, plan: plan.name, amount: plan.price, date: new Date(), status: d.payment, method: d.payment === 'paid' ? 'UPI' : '—' });
        if (d.payment === 'paid') G().stats.collected += plan.price; else G().stats.pending += plan.price;
        Toast.success(`${d.name} joined on ${plan.name}. Welcome email sent.`, 'Member added successfully');
        rerender();
      },
    }),
    'view-member': (el) => {
      const m = findBy(G().members, el.dataset.id), plan = planById(m.planId), d = daysBetween(T, m.renewal);
      Modal.open({
        title: 'Member Profile', eyebrow: m.id.toUpperCase(), size: 'lg',
        body: `<div class="profile-head"><span class="avatar avatar--lg avatar--accent" aria-hidden="true">${esc(initials(m.name))}</span><div><h3>${esc(m.name)}</h3><p>${esc(plan.name)} · ${badge(memberStatus(m))}</p></div></div>
          <div class="stat-strip"><div><span>Total visits</span><strong>${m.visits}</strong></div><div><span>${d < 0 ? 'Overdue' : 'Renews in'}</span><strong>${Math.abs(d)}d</strong></div><div><span>Member for</span><strong>${Math.max(1, Math.round(daysBetween(m.joined, T) / 30))}mo</strong></div></div>
          <dl class="info-grid"><div><dt>Email</dt><dd>${esc(m.email)}</dd></div><div><dt>Mobile</dt><dd>${esc(m.phone)}</dd></div><div><dt>Plan</dt><dd>${esc(plan.name)} · ${fmtINR(plan.price)} ${periodLabel(plan.period)}</dd></div>
            <div><dt>Renewal</dt><dd>${fmtDate(m.renewal)}</dd></div><div><dt>Joined</dt><dd>${fmtDate(m.joined)}</dd></div><div><dt>Last visit</dt><dd>${relDay(m.lastVisit)}</dd></div></dl>`,
        footer: `<button type="button" class="btn btn--secondary" data-action="modal-close">Close</button><button type="button" class="btn btn--secondary" data-action="edit-member" data-id="${m.id}">${icon('pencil')}Edit</button><button type="button" class="btn btn--primary" data-action="renew-member" data-id="${m.id}">${icon('refresh')}Renew</button>`,
      });
    },
    'edit-member': (el) => {
      const m = findBy(G().members, el.dataset.id);
      Modal.open({
        title: 'Edit Member', eyebrow: m.name, body: memberForm(m),
        onSubmit: (d) => {
          if (m.planId !== d.planId) { planById(m.planId).members--; planById(d.planId).members++; }
          Object.assign(m, { name: d.name, email: d.email, phone: d.phone, planId: d.planId, renewal: parseISO(d.renewal), status: d.status });
          Toast.success(`${m.name}’s details were updated.`, 'Member updated');
          rerender();
        },
      });
    },
    'pause-member': async (el) => {
      const m = findBy(G().members, el.dataset.id);
      if (m.status === 'paused') { m.status = 'active'; Toast.success(`${m.name}’s membership is active again.`, 'Membership resumed'); rerender(); return; }
      const ok = await Modal.confirm({ title: 'Pause membership?', confirmLabel: 'Pause', message: `<strong>${esc(m.name)}</strong> won’t be able to check in until the membership is resumed. Remaining days are preserved.` });
      if (!ok) return;
      m.status = 'paused';
      Toast.info(`${m.name}’s membership is paused.`, 'Membership paused');
      rerender();
    },
    'renew-member': async (el) => {
      const m = findBy(G().members, el.dataset.id), plan = planById(m.planId);
      const base = m.renewal > T ? m.renewal : T, next = addDays(base, plan.durationDays);
      const ok = await Modal.confirm({ title: 'Renew membership', eyebrow: m.name, confirmLabel: `Collect ${fmtINR(plan.price)}`,
        message: `Renew <strong>${esc(plan.name)}</strong> for <strong>${esc(m.name)}</strong>. New renewal date: <strong>${fmtDate(next)}</strong>.` });
      if (!ok) return;
      const wasExpiring = ['expiring', 'expired'].includes(memberStatus(m));
      m.renewal = next; m.status = 'active';
      if (wasExpiring) G().stats.expiring = Math.max(0, G().stats.expiring - 1);
      G().payments.unshift({ id: `INV-24${Math.floor(R() * 900) + 100}`, member: m.name, memberId: m.id, plan: plan.name, amount: plan.price, date: new Date(), status: 'paid', method: 'UPI' });
      G().stats.collected += plan.price; G().stats.revenue += plan.price;
      Toast.success(`${m.name} renewed until ${fmtDate(next)} · ${fmtINR(plan.price)} collected.`, 'Payment recorded');
      rerender();
    },
    'delete-member': async (el) => {
      const m = findBy(G().members, el.dataset.id);
      const ok = await Modal.confirm({ title: 'Delete member?', danger: true, confirmLabel: 'Delete member', eyebrow: 'This cannot be undone',
        message: `<strong>${esc(m.name)}</strong> and their attendance history will be permanently removed from ${esc(DB.gym.name)}.` });
      if (!ok) return;
      G().members = G().members.filter((x) => x.id !== m.id);
      G().stats.active = Math.max(0, G().stats.active - 1);
      planById(m.planId).members = Math.max(0, planById(m.planId).members - 1);
      Toast.success(`${m.name} was removed.`, 'Member deleted');
      rerender();
    },
    'export-members': () => {
      download('iron-temple-members.csv', toCSV(['ID', 'Name', 'Email', 'Phone', 'Plan', 'Last visit', 'Renewal', 'Status'], filteredRows('members-table').map((m) => [m.id, m.name, m.email, m.phone, planById(m.planId).name, isoDate(m.lastVisit), isoDate(m.renewal), memberStatus(m)])));
      Toast.success(`${filteredRows('members-table').length} members exported.`, 'Export ready');
    },
    'manual-checkin': () => Modal.open({
      title: 'Manual Check-in', eyebrow: 'Front desk', submitLabel: 'Check in',
      body: `<div class="form-grid">${Form.field({ name: 'member', label: 'Member', type: 'select', full: true, options: G().members.filter((m) => !['paused', 'expired'].includes(memberStatus(m)) && !G().live.some((l) => l.name === m.name)).map((m) => [m.name, `${m.name} · ${planById(m.planId).name}`]) })}
        ${Form.field({ name: 'zone', label: 'Zone', type: 'select', options: G().zones.map((z) => [z.id, z.name]) })}
        ${Form.field({ name: 'method', label: 'Method', type: 'select', options: ['Front desk', 'QR code', 'RFID band'] })}</div>`,
      onSubmit: (d) => {
        if (G().live.some((l) => l.name === d.member)) { Toast.warning(`${d.member} is already on the floor.`); return false; }
        G().live.forEach((l) => { l.fresh = false; });
        G().live.unshift({ id: uid('l'), name: d.member, zone: d.zone, checkIn: new Date(), fresh: true });
        G().stats.checkins++;
        const gm = G().members.find((m) => m.name === d.member); if (gm) { gm.lastVisit = new Date(); gm.visits++; }
        refreshLive();
        Toast.success(`${d.member} checked in to ${G().zones.find((z) => z.id === d.zone).name}.`, 'Check-in recorded');
      },
    }),
    checkout: (el) => {
      const l = findBy(G().live, el.dataset.id);
      if (!l) return;
      G().live = G().live.filter((x) => x.id !== l.id);
      refreshLive();
      Toast.success(`${l.name} checked out · ${fmtDuration(Math.max(1, Math.round((Date.now() - l.checkIn) / 6e4)))} session.`, 'Checked out');
    },
    'create-plan': () => Modal.open({
      title: 'Create Plan', eyebrow: 'Membership plans', submitLabel: 'Create plan', body: planForm(),
      onSubmit: (d) => {
        DB.plans.push({ id: `${slug(d.name)}-${uid('p').slice(-4)}`, name: d.name, price: Number(d.price), period: d.period, durationDays: Number(d.durationDays), features: d.features.split('\n').map((f) => f.trim()).filter(Boolean), active: d.active, members: 0 });
        Toast.success(`${d.name} is ${d.active ? 'live and available for sale' : 'saved as disabled'}.`, 'Plan created');
        rerender();
      },
    }),
    'edit-plan': (el) => {
      const p = planById(el.dataset.id);
      Modal.open({
        title: 'Edit Plan', eyebrow: p.name, body: planForm(p),
        onSubmit: (d) => {
          Object.assign(p, { name: d.name, price: Number(d.price), period: d.period, durationDays: Number(d.durationDays), features: d.features.split('\n').map((f) => f.trim()).filter(Boolean), active: d.active });
          Toast.success(`${p.name} was updated.`, 'Plan saved');
          rerender();
        },
      });
    },
    'toggle-plan': async (el) => {
      const p = planById(el.dataset.id);
      if (p.active) {
        const ok = await Modal.confirm({ title: `Disable ${p.name}?`, danger: true, confirmLabel: 'Disable plan',
          message: `New members won’t be able to buy <strong>${esc(p.name)}</strong>. ${p.members ? `The ${fmtNum(p.members)} existing members keep it until their renewal date.` : ''}` });
        if (!ok) return;
      }
      p.active = !p.active;
      Toast.show(`${p.name} is now ${p.active ? 'active' : 'disabled'}.`, { type: p.active ? 'success' : 'info', title: p.active ? 'Plan enabled' : 'Plan disabled' });
      rerender();
    },
    'add-trainer': () => Modal.open({
      title: 'Add Trainer', eyebrow: 'Coaching team', submitLabel: 'Add trainer', size: 'lg', body: trainerForm(),
      onSubmit: (d) => {
        G().trainers.push({ id: uid('t'), name: d.name, spec: d.spec, email: d.email, phone: d.phone, exp: Number(d.exp), schedule: d.schedule, certs: d.certs.split(',').map((c) => c.trim()).filter(Boolean), bio: d.bio, rating: 5, reviews: 0, availability: 'available', clients: 0, maxClients: 30 });
        Toast.success(`${d.name} has been added to the coaching team.`, 'Trainer added');
        rerender();
      },
    }),
    'view-trainer': (el) => {
      const t = findBy(G().trainers, el.dataset.id);
      Modal.open({
        title: 'Trainer Profile', eyebrow: t.spec, size: 'lg',
        body: `<div class="profile-head"><span class="avatar avatar--xl avatar--accent avatar-status avatar-status--${t.availability}" aria-hidden="true">${esc(initials(t.name))}</span><div><h3>${esc(t.name)}</h3><p>${esc(t.spec)}</p><div class="mt-8">${stars(t.rating, t.reviews)}</div></div></div>
          <div class="stat-strip"><div><span>Clients</span><strong>${t.clients}/${t.maxClients}</strong></div><div><span>Experience</span><strong>${t.exp} yrs</strong></div><div><span>Status</span><strong style="font-size:20px">${trainerAvail[t.availability]}</strong></div></div>
          ${t.bio ? `<p class="modal__text">${esc(t.bio)}</p>` : ''}
          <div class="flex wrap gap-8 mt-16">${t.certs.map((c) => `<span class="chip">${icon('award', 'icon--sm')}${esc(c)}</span>`).join('')}</div>
          <hr class="divider"><dl class="info-grid"><div><dt>Schedule</dt><dd>${esc(t.schedule)}</dd></div><div><dt>Email</dt><dd>${esc(t.email)}</dd></div><div><dt>Mobile</dt><dd>${esc(t.phone)}</dd></div><div><dt>Client capacity</dt><dd>${Math.round((t.clients / t.maxClients) * 100)}% booked</dd></div></dl>`,
        footer: `<button type="button" class="btn btn--secondary" data-action="modal-close">Close</button><button type="button" class="btn btn--primary" data-action="manage-trainer" data-id="${t.id}">Manage</button>`,
      });
    },
    'edit-trainer': (el) => {
      const t = findBy(G().trainers, el.dataset.id);
      Modal.open({
        title: 'Edit Trainer', eyebrow: t.name, size: 'lg', body: trainerForm(t),
        onSubmit: (d) => { Object.assign(t, { name: d.name, spec: d.spec, email: d.email, phone: d.phone, exp: Number(d.exp), schedule: d.schedule, certs: d.certs.split(',').map((c) => c.trim()).filter(Boolean), bio: d.bio }); Toast.success(`${t.name}’s profile was updated.`, 'Trainer saved'); rerender(); },
      });
    },
    'manage-trainer': (el) => {
      const t = findBy(G().trainers, el.dataset.id);
      Modal.open({
        title: 'Manage Trainer', eyebrow: t.name, submitLabel: 'Save changes',
        body: `<div class="form-grid">${Form.field({ name: 'availability', label: 'Availability', type: 'select', value: t.availability, options: [['available', 'Available'], ['in-session', 'In session'], ['off', 'Off today']] })}
          ${Form.field({ name: 'maxClients', label: 'Max clients', type: 'number', value: t.maxClients, required: true, attrs: `min="${t.clients}" max="60"` })}
          ${Form.field({ name: 'schedule', label: 'Weekly schedule', value: t.schedule, required: true, full: true })}
          ${Form.field({ name: 'assign', label: 'Assign a member', type: 'select', full: true, value: '', options: [['', '— No new assignment —'], ...G().members.map((m) => [m.id, m.name])], hint: `${t.clients} clients currently assigned` })}</div>`,
        onSubmit: (d) => {
          if (d.assign && t.clients >= Number(d.maxClients)) { Toast.error(`${t.name} is at full capacity. Increase max clients first.`); return false; }
          Object.assign(t, { availability: d.availability, maxClients: Number(d.maxClients), schedule: d.schedule });
          if (d.assign) t.clients++;
          const who = d.assign ? findBy(G().members, d.assign)?.name : '';
          Toast.success(who ? `${who} assigned to ${t.name}.` : `${t.name} is now ${trainerAvail[t.availability].toLowerCase()}.`, 'Trainer updated');
          rerender();
        },
      });
    },
    'record-payment': () => Modal.open({
      title: 'Record Payment', eyebrow: 'Payments', submitLabel: 'Record payment',
      body: `<div class="form-grid">${Form.field({ name: 'member', label: 'Member', type: 'select', full: true, options: G().members.map((m) => [m.id, `${m.name} · ${planById(m.planId).name}`]) })}
        ${Form.field({ name: 'amount', label: 'Amount (₹)', type: 'number', required: true, value: 2499, attrs: 'min="1" max="500000"' })}
        ${Form.field({ name: 'method', label: 'Method', type: 'select', options: ['UPI', 'Card', 'Cash', 'Net banking'] })}
        ${Form.field({ name: 'status', label: 'Status', type: 'select', value: 'paid', options: [['paid', 'Paid'], ['pending', 'Pending']] })}
        ${Form.field({ name: 'date', label: 'Date', type: 'date', value: isoDate(T), required: true })}</div>`,
      onOpen: (modal) => {
        const sel = $('select[name="member"]', modal), amt = $('input[name="amount"]', modal);
        const sync = () => { const m = findBy(G().members, sel.value); if (m) amt.value = planById(m.planId).price; };
        sel.addEventListener('change', sync); sync();
      },
      onSubmit: (d) => {
        const m = findBy(G().members, d.member), amount = Number(d.amount);
        G().payments.unshift({ id: `INV-24${Math.floor(R() * 900) + 100}`, member: m.name, memberId: m.id, plan: planById(m.planId).name, amount, date: parseISO(d.date), status: d.status, method: d.method });
        if (d.status === 'paid') { G().stats.collected += amount; G().stats.revenue += amount; } else G().stats.pending += amount;
        Toast.success(`${fmtINR(amount)} from ${m.name} · ${d.method}.`, 'Payment recorded');
        rerender();
      },
    }),
    'mark-paid': (el) => {
      const p = findBy(G().payments, el.dataset.id);
      p.status = 'paid'; if (p.method === '—') p.method = 'UPI';
      G().stats.pending = Math.max(0, G().stats.pending - p.amount); G().stats.collected += p.amount; G().stats.revenue += p.amount;
      Toast.success(`${p.id} · ${fmtINR(p.amount)} from ${p.member}.`, 'Payment recorded');
      rerender();
    },
    'refund-payment': async (el) => {
      const p = findBy(G().payments, el.dataset.id);
      const ok = await Modal.confirm({ title: 'Issue refund?', danger: true, confirmLabel: `Refund ${fmtINR(p.amount)}`, message: `Refund <strong>${fmtINR(p.amount)}</strong> to <strong>${esc(p.member)}</strong> for ${p.id}. Refunds reach the original ${esc(p.method)} in 5–7 working days.` });
      if (!ok) return;
      p.status = 'refunded';
      G().stats.refunds += p.amount; G().stats.collected = Math.max(0, G().stats.collected - p.amount);
      Toast.info(`${fmtINR(p.amount)} refund initiated for ${p.member}.`, 'Refund issued');
      rerender();
    },
    'download-payment': (el) => {
      const p = findBy(G().payments, el.dataset.id), m = findBy(G().members, p.memberId);
      download(`${p.id}.html`, invoiceHTML({ id: p.id, date: p.date, billedTo: p.member, email: m?.email, items: [[`${p.plan} membership`, p.amount]], method: p.method, status: p.status }), 'text/html');
      Toast.success(`${p.id} downloaded.`, 'Invoice ready');
    },
    'export-payments': () => {
      const rows = filteredRows('payments-table');
      download('iron-temple-payments.csv', toCSV(['Invoice', 'Member', 'Plan', 'Amount (INR)', 'Date', 'Method', 'Status'], rows.map((p) => [p.id, p.member, p.plan, p.amount, isoDate(p.date), p.method, p.status])));
      Toast.success(`${rows.length} payments exported.`, 'Export ready');
    },
    'generate-report': async (el) => {
      const type = el.dataset.id, period = $(`[data-report-period="${type}"]`)?.value || 'this-month';
      el.classList.add('is-loading');
      await wait(650);
      el.classList.remove('is-loading');
      const r = buildReport(type, period);
      addReportHistory(`${r.title} · ${periodText[period]}`, 'Preview');
      Modal.open({
        title: r.title, eyebrow: `${DB.gym.name} · ${periodText[period]}`, size: 'lg',
        body: `<div class="report-preview-kpis stat-strip">${r.kpis.map(([l, v]) => `<div><span>${l}</span><strong>${v}</strong></div>`).join('')}</div>
          <p class="label" style="margin-bottom:12px">${r.chart.sub}</p>
          ${barChart({ labels: r.chart.labels, values: r.chart.values, highlight: r.chart.values.indexOf(Math.max(...r.chart.values)), fmt: r.chart.fmt, fmtTick: r.chart.tick, height: 180, label: r.chart.sub })}
          <div class="table-wrap mt-20" style="margin-left:-24px;margin-right:-24px"><table class="table"><thead><tr>${r.header.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>
            <tbody>${r.rows.map((row) => `<tr>${row.map((c, i) => `<td data-label="${r.header[i]}" class="${i === 0 ? 'col-primary fw-600' : ''}">${typeof c === 'number' && r.header[i].includes('INR') ? fmtINR(c) : typeof c === 'number' ? fmtNum(c) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
        footer: `<button type="button" class="btn btn--secondary" data-action="modal-close">Close</button><button type="button" class="btn btn--primary" data-action="export-report" data-id="${type}" data-period="${period}">${icon('download')}Export CSV</button>`,
      });
      Toast.success(`${r.title} for ${periodText[period].toLowerCase()} is ready.`, 'Report generated');
    },
    'export-report': (el) => {
      const type = el.dataset.id, period = el.dataset.period || $(`[data-report-period="${type}"]`)?.value || 'this-month';
      const r = buildReport(type, period);
      download(`fithub-${type}-report-${period}.csv`, toCSV(r.header, r.rows));
      addReportHistory(`${r.title} · ${periodText[period]}`, 'CSV');
      Toast.success(`${r.title} exported as CSV.`, 'Export ready');
    },
    'reset-demo': async () => {
      const ok = await Modal.confirm({ title: 'Reset demo data?', danger: true, confirmLabel: 'Reset', message: 'Saved settings, preferences and created accounts in this browser will be cleared. You will stay signed in.' });
      if (!ok) return;
      const s = Session.get(); Storage.clearAll(); if (s) Session.set(s);
      location.reload();
    },

    /* ---- Super admin ---- */
    'quick-settings': () => {
      const s = P().settings;
      Modal.open({
        title: 'System Settings', eyebrow: 'Quick settings', submitLabel: 'Save settings',
        body: `<div class="form-grid form-grid--1">${Form.field({ name: 'supportEmail', label: 'Platform support email', type: 'email', value: s.supportEmail, required: true })}
          ${Form.field({ name: 'auditRetention', label: 'Audit log retention', type: 'select', value: s.auditRetention, options: [['90', '90 days'], ['180', '180 days'], ['365', '1 year'], ['730', '2 years']] })}</div>
          <div class="mt-16">${Form.toggle({ name: 'maintenance', label: 'Maintenance mode', desc: 'Pause check-ins and show a notice', checked: s.maintenance })}
          ${Form.toggle({ name: 'twoFactor', label: 'Two-factor authentication', desc: 'Required for admin accounts', checked: s.twoFactor })}</div>
          <p class="text-sm muted mt-16">More options in <a class="card__link" style="display:inline" href="#/dashboard/settings">System Settings</a>.</p>`,
        onSubmit: (d) => { saveSystemSettings(d); if (UI.section === 'settings' || UI.section === 'overview') rerender(); },
      });
    },
    'add-gym': () => Modal.open({
      title: 'Add Gym', eyebrow: 'Gym network', submitLabel: 'Add gym', body: gymForm(),
      onSubmit: async (d) => {
        await wait(400);
        const g = { id: `G-${1040 + P().gyms.length + Math.floor(R() * 50)}`, name: d.name, city: d.city, members: 0, owner: d.owner, status: d.status, created: new Date(), plan: d.plan, revenue: 0, email: d.ownerEmail };
        P().gyms.unshift(g);
        if (!P().owners.some((o) => o.name === d.owner)) P().owners.unshift({ id: `O-${300 + P().owners.length}`, name: d.owner, email: d.ownerEmail, lastActive: new Date(), status: 'invited', phone: '—', joined: new Date() });
        if (g.status === 'active') P().stats.gyms++;
        logActivity('gym', 'Gym created', `${g.name} · ${g.city} added with owner ${g.owner}`, 'success');
        Toast.success(`${g.name} was added${g.status === 'pending' ? ' and is awaiting verification' : ''}. Owner invite sent to ${d.ownerEmail}.`, 'Gym added successfully');
        rerender();
      },
    }),
    'view-gym': (el) => {
      const g = findBy(P().gyms, el.dataset.id);
      Modal.open({
        title: g.name, eyebrow: `${g.id} · ${g.city}`, size: 'lg',
        body: `<div class="flex gap-8 wrap" style="margin-bottom:18px">${badge(g.status)}<span class="chip">${esc(g.plan)} tier</span><span class="chip">${icon('mapPin', 'icon--sm')}${esc(g.city)}</span></div>
          <div class="stat-strip"><div><span>Members</span><strong>${fmtNum(g.members)}</strong></div><div><span>Est. monthly GMV</span><strong>${fmtCompactINR(g.revenue)}</strong></div><div><span>On FitHub</span><strong>${Math.max(0, Math.round(daysBetween(g.created, T) / 30))}mo</strong></div></div>
          <dl class="info-grid"><div><dt>Owner</dt><dd>${esc(g.owner)}</dd></div><div><dt>Contact</dt><dd>${esc(g.email || '—')}</dd></div><div><dt>Onboarded</dt><dd>${fmtDate(g.created)}</dd></div><div><dt>Verification</dt><dd>${g.status === 'pending' ? 'KYC documents submitted' : 'KYC & GST verified'}</dd></div></dl>
          ${g.status === 'suspended' ? `<div class="notice notice--warning mt-20">${icon('alert')}<p><strong>Suspended.</strong> Members of this gym cannot check in and payments are on hold.</p></div>` : ''}`,
        footer: `<button type="button" class="btn btn--secondary" data-action="modal-close">Close</button><button type="button" class="btn btn--secondary" data-action="manage-gym" data-id="${g.id}">${icon('sliders')}Manage</button>${g.status === 'pending' ? `<button type="button" class="btn btn--primary" data-action="approve-gym" data-id="${g.id}">${icon('check')}Approve</button>` : ''}`,
      });
    },
    'manage-gym': (el) => {
      const g = findBy(P().gyms, el.dataset.id);
      Modal.open({
        title: 'Manage Gym', eyebrow: g.name, body: gymForm(g),
        onSubmit: (d) => {
          const prev = g.status;
          Object.assign(g, { name: d.name, city: d.city, owner: d.owner, members: Number(d.members), plan: d.plan, status: d.status });
          if (prev !== 'active' && g.status === 'active') P().stats.gyms++;
          if (prev === 'active' && g.status !== 'active') P().stats.gyms--;
          logActivity('gym', 'Gym updated', `${g.name} · ${prev !== g.status ? `status ${prev} → ${g.status}` : 'details changed'}`, 'info');
          Toast.success(`${g.name} was updated.`, 'Gym saved');
          rerender();
        },
      });
    },
    'suspend-gym': async (el) => {
      const g = findBy(P().gyms, el.dataset.id), suspending = g.status !== 'suspended';
      const ok = await Modal.confirm({ title: suspending ? `Suspend ${g.name}?` : `Reactivate ${g.name}?`, danger: suspending, confirmLabel: suspending ? 'Suspend gym' : 'Reactivate',
        message: suspending ? `All <strong>${fmtNum(g.members)}</strong> members lose check-in access and pending payouts are held until reactivation.` : `Members and staff of <strong>${esc(g.name)}</strong> regain full access immediately.` });
      if (!ok) return;
      g.status = suspending ? 'suspended' : 'active';
      P().stats.gyms += suspending ? -1 : 1;
      logActivity('gym', suspending ? 'Gym suspended' : 'Gym reactivated', `${g.name} · ${g.city}`, suspending ? 'warning' : 'success');
      Toast.show(`${g.name} is now ${g.status}.`, { type: suspending ? 'warning' : 'success', title: suspending ? 'Gym suspended' : 'Gym reactivated' });
      rerender();
    },
    'approve-gym': (el) => {
      const g = findBy(P().gyms, el.dataset.id);
      if (!g || g.status !== 'pending') return;
      g.status = 'active'; P().stats.gyms++;
      const o = P().owners.find((x) => x.name === g.owner); if (o && o.status === 'invited') o.status = 'active';
      logActivity('verify', 'Gym verification approved', `${g.name} · KYC & GST verified`, 'success');
      Modal.close();
      Toast.success(`${g.name} is now live on FitHub.`, 'Gym approved');
      rerender();
    },
    'export-gyms': () => {
      const rows = filteredRows('gyms-table');
      download('fithub-gyms.csv', toCSV(['ID', 'Gym', 'City', 'Members', 'Owner', 'Tier', 'Status'], rows.map((g) => [g.id, g.name, g.city, g.members, g.owner, g.plan, g.status])));
      logActivity('report', 'Report exported', `Gym network (${rows.length} gyms, CSV)`, 'success');
      Toast.success(`${rows.length} gyms exported.`, 'Export ready');
    },
    'invite-owner': () => Modal.open({
      title: 'Invite Owner', eyebrow: 'Owner access', submitLabel: 'Send invitation', size: 'sm',
      body: `<div class="form-grid form-grid--1">${Form.field({ name: 'name', label: 'Full name', required: true, attrs: 'autofocus' })}
        ${Form.field({ name: 'email', label: 'Email', type: 'email', required: true })}
        ${Form.field({ name: 'role', label: 'Access level', type: 'select', options: [['owner', 'Owner (full gym access)'], ['manager', 'Manager (no payouts)'], ['frontdesk', 'Front desk only']] })}</div>`,
      onSubmit: async (d, form) => {
        if (P().owners.some((o) => o.email.toLowerCase() === d.email.toLowerCase())) { Form.setError(form.elements.email, 'This email already has owner access.'); return false; }
        await wait(400);
        P().owners.unshift({ id: `O-${300 + P().owners.length}`, name: d.name, email: d.email, lastActive: new Date(), status: 'invited', phone: '—', joined: new Date() });
        logActivity('owner', 'Owner invited', `Invitation sent to ${d.email}`, 'info');
        Toast.success(`Invitation sent to ${d.email}. It expires in 72 hours.`, 'Owner invited');
        rerender();
      },
    }),
    'view-owner': (el) => {
      const o = findBy(P().owners, el.dataset.id), gyms = P().gyms.filter((g) => g.owner === o.name);
      Modal.open({
        title: 'Owner Profile', eyebrow: o.id,
        body: `<div class="profile-head"><span class="avatar avatar--lg avatar--accent" aria-hidden="true">${esc(initials(o.name))}</span><div><h3>${esc(o.name)}</h3><p>${esc(o.email)} · ${badge(o.status)}</p></div></div>
          <dl class="info-grid"><div><dt>Phone</dt><dd>${esc(o.phone)}</dd></div><div><dt>Last active</dt><dd>${o.status === 'invited' ? 'Never' : relTime(o.lastActive)}</dd></div><div><dt>Owner since</dt><dd>${fmtDate(o.joined)}</dd></div><div><dt>2FA</dt><dd>${P().settings.twoFactor ? 'Enforced' : 'Optional'}</dd></div></dl>
          <hr class="divider"><p class="label" style="margin-bottom:10px">Gyms (${gyms.length})</p>
          ${gyms.length ? `<ul class="list">${gyms.map((g) => listItem({ ic: 'building', tone: 'accent', title: esc(g.name), sub: `${esc(g.city)} · ${fmtNum(g.members)} members`, right: badge(g.status) })).join('')}</ul>` : '<p class="muted text-sm">No gyms linked yet.</p>'}`,
        footer: `<button type="button" class="btn btn--secondary" data-action="modal-close">Close</button><button type="button" class="btn btn--secondary" data-action="reset-owner" data-id="${o.id}">${icon('key')}Reset access</button>`,
      });
    },
    'suspend-owner': async (el) => {
      const o = findBy(P().owners, el.dataset.id), suspending = o.status !== 'suspended';
      const ok = await Modal.confirm({ title: suspending ? `Suspend ${o.name}?` : `Reactivate ${o.name}?`, danger: suspending, confirmLabel: suspending ? 'Suspend owner' : 'Reactivate',
        message: suspending ? `<strong>${esc(o.name)}</strong> will be signed out everywhere and lose console access. Their gyms stay online.` : `<strong>${esc(o.name)}</strong> will regain console access.` });
      if (!ok) return;
      o.status = suspending ? 'suspended' : 'active';
      logActivity('security', suspending ? 'Owner suspended' : 'Owner reactivated', `${o.name} · ${o.email}`, suspending ? 'warning' : 'success');
      Toast.show(`${o.name} is now ${o.status}.`, { type: suspending ? 'warning' : 'success', title: suspending ? 'Owner suspended' : 'Owner reactivated' });
      rerender();
    },
    'reset-owner': async (el) => {
      const o = findBy(P().owners, el.dataset.id);
      const ok = await Modal.confirm({ title: 'Reset access?', confirmLabel: 'Send reset link', message: `Active sessions for <strong>${esc(o.name)}</strong> will be revoked and a password reset link sent to <strong>${esc(o.email)}</strong>. 2FA will need to be set up again.` });
      if (!ok) return;
      logActivity('owner', 'Owner access reset', `Password reset link sent to ${o.email}`, 'info');
      Toast.success(`Reset link sent to ${o.email}.`, 'Access reset');
      if (UI.section === 'activity') rerender();
    },
    'view-platform-member': (el) => {
      const m = findBy(P().members, el.dataset.id);
      Modal.open({
        title: 'Member Details', eyebrow: m.id, size: 'sm',
        body: `<div class="profile-head"><span class="avatar avatar--lg avatar--accent" aria-hidden="true">${esc(initials(m.name))}</span><div><h3>${esc(m.name)}</h3><p>${esc(m.email)}</p></div></div>
          <dl class="info-grid"><div><dt>Gym</dt><dd>${esc(m.gym)}</dd></div><div><dt>Plan</dt><dd>${esc(m.plan)}</dd></div><div><dt>Joined</dt><dd>${fmtDate(m.joined)}</dd></div><div><dt>Status</dt><dd>${badge(m.status)}</dd></div></dl>`,
        footer: `<button type="button" class="btn btn--secondary" data-action="modal-close">Close</button>`,
      });
    },
    'export-platform-members': () => {
      const rows = filteredRows('pmembers-table');
      download('fithub-platform-members.csv', toCSV(['ID', 'Name', 'Email', 'Gym', 'Plan', 'Joined', 'Status'], rows.map((m) => [m.id, m.name, m.email, m.gym, m.plan, isoDate(m.joined), m.status])));
      logActivity('report', 'Report exported', `Platform members (${rows.length}, CSV)`, 'success');
      Toast.success(`${rows.length} members exported.`, 'Export ready');
    },
    'export-activity': () => {
      const rows = filteredRows('activity-table');
      download('fithub-activity-log.csv', toCSV(['Timestamp', 'Event', 'Details', 'Actor', 'Status'], rows.map((e) => [new Date(e.at).toISOString(), e.title, e.detail, e.actor, e.status])));
      Toast.success(`${rows.length} events exported.`, 'Export ready');
    },
    'load-more-activity': () => {
      const act = P().activity, oldest = act[act.length - 1]?.at || new Date();
      const pool = [['payment', 'Payment webhook processed', 'Razorpay · 208 events settled', 'Webhook', 'success'], ['import', 'Member import completed', 'Pulse Arena · 96 members imported', 'Deepa Krishnan', 'success'],
        ['security', 'Login from new device', 'Super admin · Chrome on macOS · Mumbai', 'Ananya Rao', 'info'], ['report', 'Report exported', 'Gym network summary (CSV)', 'Ananya Rao', 'success'], ['system', 'Backup completed', 'Nightly database snapshot · 4.2 GB', 'System', 'success']];
      pool.forEach(([type, title, detail, actor, status], i) => act.push({ id: uid('ev'), type, title, detail, actor, status, at: new Date(new Date(oldest).getTime() - (i + 1) * 5.5 * 36e5) }));
      refreshTable('activity-table');
      Toast.info('5 older events loaded.');
    },
    'set-range': (el) => { UI.rangeMonths = Number(el.dataset.value); rerender({ focus: `[data-action="set-range"][data-value="${el.dataset.value}"]` }); },
  };

  /* Page-level form submit handlers (non-modal forms) */
  const FormHandlers = {
    async login(data, form) {
      const alert = $('#login-alert');
      const btnEl = $('button[type="submit"]', form);
      alert.hidden = true;
      btnEl.classList.add('is-loading'); btnEl.disabled = true;
      try {
        const session = await Api.login({ role: form.dataset.role, identifier: data.identifier, password: data.password });
        Session.set(session);
        Toast.success(`Welcome back, ${firstName(session.user.name)}.`, 'Login successful');
        location.hash = '#/dashboard/overview';
      } catch (err) {
        $('span', alert).textContent = err.message;
        alert.hidden = false;
        form.elements.identifier.setAttribute('aria-invalid', 'true');
        form.elements.identifier.focus();
      } finally {
        if (btnEl.isConnected) { btnEl.classList.remove('is-loading'); btnEl.disabled = false; }
      }
    },
    profile(d) {
      Object.assign(DB.member, { name: d.name, email: d.email, phone: d.phone, dob: d.dob, goal: d.goal, height: Number(d.height) || DB.member.height });
      Storage.set('memberProfile', { name: d.name, email: d.email, phone: d.phone, dob: d.dob, goal: d.goal, height: DB.member.height });
      const s = Session.get(); s.user = { name: d.name, email: d.email }; Session.set(s);
      Toast.success('Your profile details were saved.', 'Profile updated');
      rebuildShell();
    },
    prefs(d) {
      Object.assign(Prefs, d);
      Storage.set('memberPrefs', Prefs);
      Toast.success('Notification and unit preferences saved.', 'Preferences saved');
    },
    'gym-settings'(d) {
      const g = DB.gym;
      ['name', 'branch', 'phone', 'email', 'address', 'open', 'close'].forEach((k) => { g[k] = d[k]; });
      ['checkinMethod', 'autoCheckout', 'dailySummary', 'renewalReminders', 'lowAttendance', 'paymentAlerts'].forEach((k) => { g.settings[k] = d[k]; });
      Storage.set('gymSettings', { name: g.name, branch: g.branch, phone: g.phone, email: g.email, address: g.address, open: g.open, close: g.close, settings: g.settings });
      Toast.success('Gym profile and preferences were updated.', 'Settings saved');
      rebuildShell();
    },
    'system-settings'(d) { saveSystemSettings(d); },
  };

  const ChangeHandlers = {
    'auto-renew': (el) => { M().autoRenew = el.checked; Toast.show(el.checked ? 'We’ll renew automatically on your renewal date.' : 'You’ll need to renew manually before expiry.', { type: el.checked ? 'success' : 'info', title: `Auto-renew ${el.checked ? 'on' : 'off'}` }); },
  };

  /* 17. ROUTER & BOOT ------------------------------------------------- */
  const PUBLIC_ROUTES = {
    '': [renderLanding, 'FitHub — Train. Track. Grow.'],
    roles: [renderRoles, 'Choose your role · FitHub'],
    'login-member': [() => renderLogin('member'), 'Member login · FitHub'],
    'login-owner': [() => renderLogin('owner'), 'Gym owner login · FitHub'],
    'login-superadmin': [() => renderLogin('superadmin'), 'Super admin · FitHub'],
  };
  let booted = false;

  function renderDashboard(sub) {
    const s = Session.get();
    if (!s || !ROLE_META[s.role]) {
      UI.role = null;
      Toast.info('Please sign in to continue.', 'Sign-in required');
      location.replace('#/roles');
      return;
    }
    const meta = ROLE_META[s.role];
    if (!meta.nav.some((n) => n[0] === sub)) { location.replace(`#/dashboard/${meta.home}`); return; }
    if (s.role === 'member') { DB.member.name = s.user.name; DB.member.email = s.user.email; }
    let fresh = false;
    if (UI.role !== s.role || !$('.shell')) { renderShell(s.role, s); UI.role = s.role; fresh = true; }
    UI.section = sub;
    setActiveNav(sub);
    closeDrawer();
    paintSection({ animate: !fresh });
    window.scrollTo(0, 0);
    if (booted && !fresh) $('#page-heading')?.focus({ preventScroll: true });
  }

  function router() {
    stopTickers();
    closePopovers();
    if (Modal.isOpen) Modal.close();
    const [path = '', sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
    if (path === 'dashboard') { renderDashboard(sub); booted = true; return; }
    const route = PUBLIC_ROUTES[path];
    if (!route) { location.replace('#/'); return; }
    UI.role = null; UI.section = null;
    route[0]();
    document.title = route[1];
    window.scrollTo(0, 0);
    if (booted) $('#main')?.focus({ preventScroll: true });
    booted = true;
  }

  /* Global event delegation — no inline handlers anywhere */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!e.target.closest('.popover-anchor')) closePopovers();
    if (!el || el.disabled) return;
    const fn = Actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.target.matches('[data-modal-backdrop]')) Modal.close();
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (!Form.validate(form)) return;
    FormHandlers[form.dataset.form]?.(Form.data(form), form);
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-table-search]')) { tableState[t.dataset.tableSearch].q = t.value; refreshTable(t.dataset.tableSearch); return; }
    if (t.getAttribute('aria-invalid') === 'true' && t.closest('.field')) Form.setError(t, Form.check(t));
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-table-filter]')) { tableState[t.dataset.tableFilter].filters[t.dataset.key] = t.value; refreshTable(t.dataset.tableFilter); return; }
    if (t.dataset.change) ChangeHandlers[t.dataset.change]?.(t, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (Modal.isOpen) { Modal.close(); return; }
      const openPop = $('.popover:not([hidden])');
      if (openPop) { closePopovers(); $(`[data-popover="${openPop.id}"]`)?.focus(); return; }
      if ($('#sidebar.is-open')) { closeDrawer(); $('.topbar__menu')?.focus(); return; }
      const menu = $('#mobile-menu.is-open');
      if (menu) Actions['toggle-site-menu']($('[data-action="toggle-site-menu"]'));
    }
    if (e.key === 'Tab' && Modal.isOpen) Modal.trap(e);
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.bar[tabindex], .chart__dot[tabindex]')) e.preventDefault();
  });
  window.addEventListener('scroll', () => { $('#site-header')?.classList.toggle('is-scrolled', window.scrollY > 8); }, { passive: true });
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024) closeDrawer(); });
  window.addEventListener('hashchange', router);

  router();
})();
