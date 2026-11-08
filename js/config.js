/* ========================================================
   KasKelas v2.0 - Configuration & Constants
   ======================================================== */

(function(window){
  'use strict';

  var START_YEAR = 2026;   // Periode Agustus 2026 - Juli 2027
  var DEFAULT_WEEKLY_DUE = 2000; // Nominal dasar iuran per periode (Rp)
  var MAX_CHECKS = 4;
  
  var BULAN = [
    'Agustus', 'September', 'Oktober', 'November', 'Desember',
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli'
  ];

  function bulanLabel(i){
    return BULAN[i] + ' ' + (i < 5 ? START_YEAR : START_YEAR + 1);
  }

  var SCHOOL_START = new Date(Date.UTC(START_YEAR, 7, 1));
  var SCHOOL_END = new Date(Date.UTC(START_YEAR + 1, 6, 31));
  var WEEKS = [];
  for(var cursor = new Date(SCHOOL_START); cursor <= SCHOOL_END;){
    var daysUntilSunday = (7 - cursor.getUTCDay()) % 7;
    var end = new Date(cursor.getTime() + Math.min(daysUntilSunday, Math.round((SCHOOL_END - cursor) / 86400000)) * 86400000);
    WEEKS.push({start: new Date(cursor), end: end});
    cursor = new Date(end.getTime() + 86400000);
  }
  function shortDate(date){
    return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'UTC'}).format(date);
  }
  function weekLabel(i){
    var w = WEEKS[i]; if(!w) return 'Pekan ' + (i + 1);
    return 'Pekan ' + (i + 1) + ' · ' + shortDate(w.start) + '–' + shortDate(w.end);
  }
  function weekDateLabel(i){
    var w = WEEKS[i]; if(!w) return '';
    return shortDate(w.start) + ' – ' + shortDate(w.end) + ' ' + (w.end.getUTCFullYear());
  }

  /* Palet warna avatar inisial siswa */
  var AVATAR_COLORS = [
    {bg: '#e0e7ff', text: '#4338ca'},
    {bg: '#d1fae5', text: '#065f46'},
    {bg: '#fef3c7', text: '#92400e'},
    {bg: '#fce7f3', text: '#9d174d'},
    {bg: '#cffafe', text: '#155e75'},
    {bg: '#ffedd5', text: '#9a3412'},
    {bg: '#ede9fe', text: '#6d28d9'},
    {bg: '#f1f5f9', text: '#334155'}
  ];

  /* Ikon Vektor SVG Inline (Ringan & Offline) */
  var ICONS = {
    wallet: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    sun: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    moon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.41a8.21 8.21 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24m4.52 11.64c-.25-.13-1.47-.72-1.7-.8-.23-.09-.39-.13-.56.13-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.24-.75-.67-1.25-1.49-1.4-1.74-.14-.26-.02-.39.11-.52.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    print: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  };

  window.AppConfig = {
    START_YEAR: START_YEAR,
    DEFAULT_DUE: DEFAULT_WEEKLY_DUE,
    DEFAULT_WEEKLY_DUE: DEFAULT_WEEKLY_DUE,
    MAX_CHECKS: MAX_CHECKS,
    WEEKS: WEEKS,
    WEEK_COUNT: WEEKS.length,
    weekLabel: weekLabel,
    weekDateLabel: weekDateLabel,
    BULAN: BULAN,
    bulanLabel: bulanLabel,
    AVATAR_COLORS: AVATAR_COLORS,
    ICONS: ICONS
  };
})(window);
