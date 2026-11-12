(function (root) {
  'use strict';

  function validTime(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t)); }
  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }

  // Daily recurring reminder (floating local time). startKey = 'YYYY-MM-DD'.
  function make(o) {
    var time = validTime(o.time) ? o.time : '20:00';
    var hhmm = time.replace(':', '');
    var start = String(o.startKey).replace(/-/g, '') + 'T' + hhmm + '00';
    var summary = esc(o.summary || 'Speaking practice');
    var desc = esc(o.description || '');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Konus//Daily reminder//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:konus-daily-reminder@local',
      'DTSTAMP:' + String(o.startKey).replace(/-/g, '') + 'T000000Z',
      'DTSTART:' + start,
      'DURATION:PT10M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:' + summary,
      desc ? 'DESCRIPTION:' + desc : null,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + summary,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
      ''
    ].filter(function (x) { return x !== null; }).join('\r\n');
  }

  var api = { make: make, validTime: validTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Ics = api;
})(typeof window !== 'undefined' ? window : globalThis);
