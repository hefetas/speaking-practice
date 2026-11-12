(function (root) {
  'use strict';

  // ---------- pure math (unit-tested) ----------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Two-link inverse kinematics. Shoulder is the origin, (tx,ty) the wanted hand position.
  // side: -1 left arm / +1 right arm; the elbow bends outward, away from the body.
  function ik(l1, l2, tx, ty, side) {
    var d = Math.hypot(tx, ty);
    var phi = Math.atan2(ty, tx);
    var dd = clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    var cosA = clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1);
    var a = Math.acos(cosA);
    var e1 = { ex: l1 * Math.cos(phi + a), ey: l1 * Math.sin(phi + a) };
    var e2 = { ex: l1 * Math.cos(phi - a), ey: l1 * Math.sin(phi - a) };
    var pick = (side * e1.ex > side * e2.ex || (side * e1.ex === side * e2.ex && e1.ey >= e2.ey)) ? e1 : e2;
    return { ex: pick.ex, ey: pick.ey, hx: dd * Math.cos(phi), hy: dd * Math.sin(phi) };
  }

  // Damped spring: s = {x, v}. zeta 1 = critically damped (no overshoot); <1 bounces a little.
  function spring(s, target, dt, w, zeta) {
    var z = zeta == null ? 1 : zeta;
    var left = clamp(dt, 0, 0.25);
    var h = 1 / 120;
    while (left > 1e-9) {
      var step = Math.min(h, left);
      s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * step;
      s.x += s.v * step;
      left -= step;
    }
    return s;
  }

  function mouthOpen(t, speaking) {
    if (!speaking) return 0;
    var v = 0.55 * Math.abs(Math.sin(t * 10.5)) + 0.45 * Math.abs(Math.sin(t * 6.7 + 1.3));
    return clamp(v * (0.4 + 0.6 * Math.abs(Math.sin(t * 2.3 + 0.4))), 0, 1);
  }

  function estimateMs(text) {
    var n = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(900, n * 380 + 500);
  }

  // Every mood is a full set of rig targets. Hands are positions relative to each shoulder.
  var PARAMS = ['lean', 'headRot', 'headX', 'browLy', 'browRy', 'browA', 'smile', 'jaw', 'eyeOpen', 'lookX', 'lookY', 'hLx', 'hLy', 'hRx', 'hRy', 'shake'];
  function pose(o) {
    var base = { lean: 0, headRot: 0, headX: 0, browLy: 0, browRy: 0, browA: 0, smile: 0.15, jaw: 0, eyeOpen: 1, lookX: 0, lookY: 0,
      hLx: -12, hLy: 138, hRx: 12, hRy: 138, shake: 0 };
    Object.keys(o).forEach(function (k) { base[k] = o[k]; });
    return base;
  }
  var POSES = {
    idle: pose({}),
    listen: pose({ lean: 0.2, headRot: -3, browLy: -2, browRy: -2, smile: 0.1 }),
    excited: pose({ lean: 0.35, headRot: 4, browLy: -5, browRy: -5, smile: 0.9, eyeOpen: 1.15, hLx: -62, hLy: 10, hRx: 62, hRy: 10 }),
    angry: pose({ lean: 0.5, headRot: -2, browLy: 2, browRy: 2, browA: 16, smile: -0.7, eyeOpen: 0.8, hLx: -25, hLy: 100, hRx: 20, hRy: -38, shake: 1 }),
    think: pose({ lean: 0.2, headRot: 6, browLy: -3, browRy: 2, browA: -4, smile: -0.1, eyeOpen: 0.85, lookX: 0.6, lookY: -0.6, hRx: -43, hRy: -53, hLx: 28, hLy: 72 }),
    suspicious: pose({ lean: 0.85, headRot: -5, browLy: -7, browRy: 3, browA: 8, smile: -0.2, eyeOpen: 0.6, hRx: -34, hRy: -45, hLx: -14, hLy: 128 }),
    shock: pose({ lean: 0.3, browLy: -9, browRy: -9, browA: -6, smile: -0.3, jaw: 0.7, eyeOpen: 1.35, hLx: -42, hLy: -28, hRx: 42, hRy: -28 }),
    happy: pose({ lean: 0.25, headRot: 3, browLy: -3, browRy: -3, smile: 1, eyeOpen: 0.9, hLx: -30, hLy: 62, hRx: 38, hRy: -6 })
  };

  // ---------- drawing ----------
  var SK = '#e8b98f', SKD = '#c99a76', HAIR = '#2b2420', COAT = '#3a3f4b', CAPE = '#474d5b';
  var SHL = { x: 138, y: 318 }, SHR = { x: 262, y: 318 };
  var L1 = 82, L2 = 76;

  function svg() {
    var arm = function (n) {
      return '<path data-r="arm' + n + '1" fill="none" stroke="' + COAT + '" stroke-width="30" stroke-linecap="round"/>' +
        '<path data-r="arm' + n + '2" fill="none" stroke="' + COAT + '" stroke-width="25" stroke-linecap="round"/>' +
        '<circle data-r="cuff' + n + '" r="14" fill="#f3efe6"/><circle data-r="hand' + n + '" r="12" fill="' + SK + '" stroke="' + SKD + '" stroke-width="1.5"/>';
    };
    return '<svg viewBox="0 0 400 460" role="img" aria-label="Sherlock" preserveAspectRatio="xMidYMid slice">' +
      '<defs><linearGradient id="stWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e7cc"/><stop offset="1" stop-color="#e9cfa6"/></linearGradient>' +
      '<radialGradient id="stVig" cx="50%" cy="45%" r="75%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2b1a0a" stop-opacity="0.35"/></radialGradient></defs>' +
      // kitchen background (moves slightly against the camera for parallax)
      '<g data-r="bg"><rect x="-30" y="-20" width="460" height="500" fill="url(#stWall)"/>' +
      '<rect x="28" y="36" width="116" height="124" rx="6" fill="#bfe3ff" stroke="#8a6a4a" stroke-width="7"/><path d="M86 36v124M28 98h116" stroke="#8a6a4a" stroke-width="5"/>' +
      '<path d="M20 30q16 60 4 140h30q-14-80 0-140z" fill="#d86a5e" opacity=".9"/>' +
      '<rect x="292" y="52" width="96" height="340" rx="10" fill="#dfe7ef" stroke="#aab6c4" stroke-width="3"/><path d="M292 176h96" stroke="#aab6c4" stroke-width="3"/>' +
      '<rect x="300" y="112" width="12" height="40" rx="5" fill="#aab6c4"/>' +
      '<rect x="318" y="84" width="62" height="50" fill="#fff7a8" transform="rotate(-4 349 109)"/><text x="349" y="106" font-size="11" font-weight="700" text-anchor="middle" fill="#7a3b2e" transform="rotate(-4 349 109)">YOGURT:</text><text x="349" y="121" font-size="12" font-weight="800" text-anchor="middle" fill="#c0392b" transform="rotate(-4 349 109)">MINE!</text>' +
      '<rect x="-10" y="352" width="160" height="22" rx="4" fill="#a98763"/><rect x="-10" y="374" width="160" height="90" fill="#8d6f4f"/>' +
      '<ellipse cx="48" cy="346" rx="22" ry="5" fill="#c9d2da"/><path d="M30 342q18 4 40-2" stroke="#9aa6b2" stroke-width="3" fill="none"/>' +
      '<ellipse cx="96" cy="347" rx="9" ry="4" fill="#d8dde2"/><circle cx="101" cy="346" r="2.2" fill="#ff7aa8"/>' +
      '</g>' +
      '<g data-r="cam"><g data-r="body">' +
      '<path d="M86 340Q98 288 160 284L240 284Q302 288 314 340L324 470L76 470Z" fill="' + CAPE + '"/>' +
      '<path d="M112 470L122 330Q128 300 160 294L240 294Q272 300 278 330L288 470Z" fill="' + COAT + '"/>' +
      '<path d="M176 290L200 356L224 290Z" fill="#f3efe6"/><path d="M178 292L200 330L222 292" fill="none" stroke="#d8d2c4" stroke-width="2"/>' +
      '<path d="M200 330l-10 12 10 8 10-8z" fill="#a33a3a"/>' +
      '<rect x="186" y="256" width="28" height="42" rx="10" fill="' + SK + '"/></g>' +
      // head
      '<g data-r="head">' +
      '<circle cx="148" cy="206" r="10" fill="' + SK + '"/><circle cx="252" cy="206" r="10" fill="' + SK + '"/>' +
      '<ellipse cx="200" cy="202" rx="52" ry="62" fill="' + SK + '"/>' +
      '<path d="M150 190Q152 150 200 146Q248 150 250 190Q226 168 200 170Q174 168 150 190Z" fill="' + HAIR + '"/>' +
      // deerstalker cap (sits above the brows)
      '<g transform="translate(0 -15)"><path d="M144 184Q146 112 200 108Q254 112 256 184Q200 162 144 184Z" fill="#8c6a43"/>' +
      '<path d="M158 170Q200 146 242 170M164 150Q200 130 236 150M200 108V166" fill="none" stroke="#6a4c2c" stroke-width="2.5" opacity=".75"/>' +
      '<path d="M146 180Q200 200 254 180L257 191Q200 212 143 191Z" fill="#6a4c2c"/><circle cx="200" cy="106" r="6" fill="#6a4c2c"/>' +
      '<path d="M142 186q-8 22-2 40q8-8 10-30z" fill="#7a5a38"/><path d="M258 186q8 22 2 40q-8-8-10-30z" fill="#7a5a38"/></g>' +
      // face
      '<ellipse data-r="eyeL" cx="178" cy="208" rx="11" ry="9" fill="#fff" stroke="' + SKD + '" stroke-width="1"/><ellipse data-r="eyeR" cx="222" cy="208" rx="11" ry="9" fill="#fff" stroke="' + SKD + '" stroke-width="1"/>' +
      '<ellipse data-r="pupL" cx="178" cy="208" rx="4.6" ry="4.6" fill="' + HAIR + '"/><ellipse data-r="pupR" cx="222" cy="208" rx="4.6" ry="4.6" fill="' + HAIR + '"/>' +
      '<g data-r="browL"><path d="M-15 0Q0 -6 15 0" fill="none" stroke="' + HAIR + '" stroke-width="4.5" stroke-linecap="round"/></g>' +
      '<g data-r="browR"><path d="M-15 0Q0 -6 15 0" fill="none" stroke="' + HAIR + '" stroke-width="4.5" stroke-linecap="round"/></g>' +
      '<path d="M201 206Q192 232 203 237" fill="none" stroke="' + SKD + '" stroke-width="3" stroke-linecap="round"/>' +
      '<path data-r="mouth" stroke="#7a3a2e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</g>' +
      arm('L') + arm('R') + '</g>' +
      // first-person foreground: the table and your cup of tea
      '<g data-r="pov"><rect x="-10" y="434" width="420" height="40" fill="#6b4a2f"/><rect x="-10" y="434" width="420" height="5" fill="#8a6743"/>' +
      '<rect x="40" y="398" width="40" height="42" rx="6" fill="#f4f4f4" stroke="#cfcfcf" stroke-width="2"/><path d="M80 408q22 2 18 18q-4 12-18 10" fill="none" stroke="#f4f4f4" stroke-width="7"/>' +
      '<rect x="44" y="402" width="32" height="8" rx="3" fill="#b9733a"/>' +
      '<path data-r="steam1" d="M54 390q-6-10 0-18q6-8 0-16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>' +
      '<path data-r="steam2" d="M68 390q-6-10 0-18q6-8 0-16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/></g>' +
      '<rect width="400" height="460" fill="url(#stVig)" pointer-events="none"/></svg>';
  }

  function mount(el, opts) {
    opts = opts || {};
    var reduced = !!opts.reduced;
    el.innerHTML = svg();
    var q = function (n) { return el.querySelector('[data-r="' + n + '"]'); };
    var R = {};
    ['bg', 'cam', 'body', 'head', 'eyeL', 'eyeR', 'pupL', 'pupR', 'browL', 'browR', 'mouth', 'armL1', 'armL2', 'cuffL', 'handL', 'armR1', 'armR2', 'cuffR', 'handR', 'steam1', 'steam2']
      .forEach(function (n) { R[n] = q(n); });

    var st = {};
    PARAMS.forEach(function (k) { st[k] = { x: POSES.idle[k], v: 0 }; });
    var mouth = { x: 0, v: 0 };
    var nodS = { x: 0, v: 0 };
    var pose0 = POSES.idle;
    var talking = false;
    var t = 0, last = 0, raf = 0, nextBlink = 2.2, blinkT = -1, alive = true;

    function frame(now) {
      if (!alive) return;
      var dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      t += Math.min(dt, 0.25);
      if (t > nextBlink) { blinkT = 0; nextBlink = t + 2.4 + Math.random() * 2.8; }
      var blink = 1;
      if (blinkT >= 0) { blinkT += dt; var p = blinkT / 0.15; blink = p >= 1 ? (blinkT = -1, 1) : Math.abs(1 - 2 * p) * 0.92 + 0.08; }

      var w = reduced ? 40 : 13;
      PARAMS.forEach(function (k) { spring(st[k], pose0[k], dt, k === 'eyeOpen' || k === 'smile' ? w * 1.6 : w); });
      var m = spring(mouth, mouthOpen(t, talking), dt, 34).x;
      spring(nodS, 0, dt, 16, 0.32);

      var amp = reduced ? 0 : 1;
      var breath = Math.sin(t * 1.9) * 2.2 * amp;
      var sway = Math.sin(t * 0.55) * 3.5 * amp;
      var bob = talking ? Math.sin(t * 6) * 1.1 * amp : 0;
      var shake = st.shake.x * Math.sin(t * 19) * 7 * amp;
      var gest = talking ? Math.sin(t * 4.1) * 5 * amp : 0;

      var lean = st.lean.x;
      R.bg.setAttribute('transform', 'translate(' + (-sway * 0.5).toFixed(2) + ' 0)');
      R.cam.setAttribute('transform', 'translate(' + sway.toFixed(2) + ' ' + (-lean * 10).toFixed(2) + ') translate(200 460) scale(' + (1 + lean * 0.09).toFixed(4) + ') translate(-200 -460)');
      R.body.setAttribute('transform', 'translate(0 ' + breath.toFixed(2) + ')');
      R.head.setAttribute('transform', 'translate(' + st.headX.x.toFixed(2) + ' ' + (breath * 0.8 + nodS.x * 0.3 + bob).toFixed(2) + ') rotate(' + (st.headRot.x + nodS.x * 0.4 + Math.sin(t * 0.9) * 1.1 * amp).toFixed(2) + ' 200 268)');

      var eo = clamp(st.eyeOpen.x * blink, 0.05, 1.4);
      var ry = 9 * eo;
      var look = { x: st.lookX.x + Math.sin(t * 0.7) * 0.15 * amp, y: st.lookY.x };
      [['L', 178], ['R', 222]].forEach(function (e) {
        R['eye' + e[0]].setAttribute('ry', ry.toFixed(2));
        R['pup' + e[0]].setAttribute('cx', (e[1] + look.x * 3.6).toFixed(2));
        R['pup' + e[0]].setAttribute('cy', (208 + look.y * 3).toFixed(2));
        R['pup' + e[0]].setAttribute('ry', clamp(ry - 0.6, 0.1, 4.6).toFixed(2));
      });
      R.browL.setAttribute('transform', 'translate(178 ' + (186 + st.browLy.x).toFixed(2) + ') rotate(' + st.browA.x.toFixed(2) + ')');
      R.browR.setAttribute('transform', 'translate(222 ' + (186 + st.browRy.x).toFixed(2) + ') rotate(' + (-st.browA.x).toFixed(2) + ')');

      var sm = clamp(st.smile.x, -1, 1);
      var open = clamp(st.jaw.x + m, 0, 1);
      var half = 16 + Math.max(sm, 0) * 6;
      var yc = 247 - sm * 6;
      var x1 = 200 - half, x2 = 200 + half;
      var mid = yc + 8 * sm;
      var d;
      if (open > 0.05) {
        d = 'M' + x1.toFixed(1) + ' ' + yc.toFixed(1) + 'Q200 ' + (yc + 4 * sm).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + yc.toFixed(1) +
          'Q200 ' + (yc + 6 + open * 26 + Math.max(sm, 0) * 6).toFixed(1) + ' ' + x1.toFixed(1) + ' ' + yc.toFixed(1) + 'Z';
        R.mouth.setAttribute('fill', '#6e2323');
      } else {
        d = 'M' + x1.toFixed(1) + ' ' + yc.toFixed(1) + 'Q200 ' + mid.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + yc.toFixed(1);
        R.mouth.setAttribute('fill', 'none');
      }
      R.mouth.setAttribute('d', d);

      [['L', SHL, -1, st.hLx.x, st.hLy.x], ['R', SHR, 1, st.hRx.x, st.hRy.x]].forEach(function (a) {
        var tx = a[3] + shake * (a[0] === 'R' ? 1 : -0.6);
        var ty = a[4] + gest * (a[0] === 'R' ? 1 : 0.5) + breath * 0.6;
        var r = ik(L1, L2, tx, ty, a[2]);
        var S0 = a[1];
        var ex = S0.x + r.ex, ey = S0.y + r.ey, hx = S0.x + r.hx, hy = S0.y + r.hy + 0;
        R['arm' + a[0] + '1'].setAttribute('d', 'M' + S0.x + ' ' + (S0.y + breath).toFixed(2) + 'L' + ex.toFixed(2) + ' ' + ey.toFixed(2));
        R['arm' + a[0] + '2'].setAttribute('d', 'M' + ex.toFixed(2) + ' ' + ey.toFixed(2) + 'L' + hx.toFixed(2) + ' ' + hy.toFixed(2));
        R['cuff' + a[0]].setAttribute('cx', hx.toFixed(2)); R['cuff' + a[0]].setAttribute('cy', hy.toFixed(2));
        R['hand' + a[0]].setAttribute('cx', hx.toFixed(2)); R['hand' + a[0]].setAttribute('cy', (hy + 2).toFixed(2));
      });

      R.steam1.setAttribute('transform', 'translate(0 ' + (-((t * 14) % 14)).toFixed(2) + ')');
      R.steam1.setAttribute('opacity', (0.65 - ((t * 14) % 14) / 24).toFixed(2));
      R.steam2.setAttribute('transform', 'translate(0 ' + (-(((t * 14) + 7) % 14)).toFixed(2) + ')');
      R.steam2.setAttribute('opacity', (0.65 - (((t * 14) + 7) % 14) / 24).toFixed(2));

      raf = root.requestAnimationFrame(frame);
    }
    raf = root.requestAnimationFrame(frame);

    return {
      setMood: function (name) { pose0 = POSES[name] || POSES.idle; },
      speaking: function (on) { talking = !!on; },
      nod: function () { nodS.v += 160; },
      destroy: function () { alive = false; if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); }
    };
  }

  var api = { ik: ik, spring: spring, mouthOpen: mouthOpen, estimateMs: estimateMs, PARAMS: PARAMS, POSES: POSES, mount: mount, clamp: clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Stage = api;
})(typeof window !== 'undefined' ? window : globalThis);
