(function (root) {
  'use strict';

  // 3D crime-scene stage for the Sherlock series. Hand-written WebGL 1 (no libraries, no network):
  // a Baker Street flat kitchen lit by a window (real shadow map), a warm lamp and the fire,
  // a jointed Sherlock who walks between clues, and a camera that travels to each clue per beat.
  // Same public API as stage.js (setMood / speaking / nod / destroy) plus shot(name).

  // ---------- math (column-major 4x4, unit-tested) ----------
  function ident() { var o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }
  function T(x, y, z) { var o = ident(); o[12] = x; o[13] = y; o[14] = z; return o; }
  function S(x, y, z) { var o = ident(); o[0] = x; o[5] = y == null ? x : y; o[10] = z == null ? x : z; return o; }
  function RX(a) { var o = ident(), c = Math.cos(a), s = Math.sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; }
  function RY(a) { var o = ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; }
  function RZ(a) { var o = ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
  function persp(fovy, asp, n, f) {
    var o = new Float32Array(16), t = 1 / Math.tan(fovy / 2);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  }
  function ortho(l, r, b, t, n, f) {
    var o = ident();
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n);
    return o;
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function lookAt(e, c, up) {
    var z = norm(sub(e, c)), x = norm(cross(up || [0, 1, 0], z)), y = cross(z, x);
    var o = ident();
    o[0] = x[0]; o[4] = x[1]; o[8] = x[2];
    o[1] = y[0]; o[5] = y[1]; o[9] = y[2];
    o[2] = z[0]; o[6] = z[1]; o[10] = z[2];
    o[12] = -dot(x, e); o[13] = -dot(y, e); o[14] = -dot(z, e);
    return o;
  }
  function apply(m, p) {
    var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w];
  }
  // inverse-transpose of the upper 3x3 (normal matrix), column-major mat3
  function normalMat(m) {
    var a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var det = a * A + b * B + c * C || 1e-9;
    var D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    var G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
    // cofactor matrix rows: [A B C],[D E F],[G H I]; (M^-1)^T = cof / det
    var o = new Float32Array(9);
    o[0] = A / det; o[1] = D / det; o[2] = G / det;
    o[3] = B / det; o[4] = E / det; o[5] = H / det;
    o[6] = C / det; o[7] = F / det; o[8] = I / det;
    return o;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function spring(s, target, dt, w, zeta) {
    var z = zeta == null ? 1 : zeta, left = clamp(dt, 0, 0.25), h = 1 / 120;
    while (left > 1e-9) {
      var st = Math.min(h, left);
      s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * st;
      s.x += s.v * st;
      left -= st;
    }
    return s;
  }
  function angDiff(a, b) { var d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; }

  // One walking step on the floor plane. st = {x, z, yaw, speed}; returns true while still walking.
  function walkStep(st, tx, tz, faceYaw, dt) {
    var dx = tx - st.x, dz = tz - st.z, d = Math.hypot(dx, dz);
    var maxV = 1.25;
    if (d > 0.07) {
      var want = Math.atan2(dx, dz);
      st.yaw += angDiff(st.yaw, want) * clamp(dt * 7, 0, 1);
      var face = Math.cos(angDiff(st.yaw, want));
      var goal = Math.max(0.35, Math.min(maxV, d * 2.2)) * clamp(face, 0.15, 1);
      st.speed += (goal - st.speed) * clamp(dt * 5, 0, 1);
      var step = Math.min(st.speed * dt, d);
      st.x += dx / d * step; st.z += dz / d * step;
      return true;
    }
    st.speed += (0 - st.speed) * clamp(dt * 8, 0, 1);
    if (faceYaw != null) st.yaw += angDiff(st.yaw, faceYaw) * clamp(dt * 5, 0, 1);
    return false;
  }

  // Steer around round obstacles [x, z, r]: returns a waypoint if the straight line is blocked.
  var OBST = [[0, -0.35, 0.95], [1.85, -0.75, 0.55]];
  function route(x, z, tx, tz, obst) {
    var dx = tx - x, dz = tz - z, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return [tx, tz];
    for (var i = 0; i < obst.length; i++) {
      var o = obst[i];
      if (Math.hypot(tx - o[0], tz - o[1]) < o[2] || Math.hypot(x - o[0], z - o[1]) < o[2] * 0.6) continue;
      var k = clamp(((o[0] - x) * dx + (o[1] - z) * dz) / L2, 0, 1);
      var cx = x + dx * k, cz = z + dz * k, d = Math.hypot(cx - o[0], cz - o[1]);
      if (d < o[2]) {
        var nx, nz;
        if (d > 1e-4) { nx = (cx - o[0]) / d; nz = (cz - o[1]) / d; } else { var l = Math.sqrt(L2); nx = -dz / l; nz = dx / l; }
        return [o[0] + nx * (o[2] + 0.3), o[1] + nz * (o[2] + 0.3)];
      }
    }
    return [tx, tz];
  }

  // ---------- poses (every mood sets every parameter) ----------
  // arm: [pitch (negative = forward/up), roll (positive = outward), elbow (negative = bend forward)]
  var PARAMS = ['lean', 'hPitch', 'hRoll', 'brow', 'browA', 'browD', 'smile', 'jaw', 'eyeOpen', 'aLp', 'aLr', 'aLe', 'aRp', 'aRr', 'aRe', 'shake'];
  function pose(o) {
    var b = { lean: 0.03, hPitch: 0, hRoll: 0, brow: 0, browA: 0, browD: 0, smile: 0.15, jaw: 0, eyeOpen: 1,
      aLp: 0.05, aLr: 0.12, aLe: -0.3, aRp: 0.05, aRr: 0.12, aRe: -0.3, shake: 0 };
    Object.keys(o).forEach(function (k) { b[k] = o[k]; });
    return b;
  }
  var POSES = {
    idle: pose({}),
    listen: pose({ lean: 0.06, hRoll: 0.1, hPitch: 0.05, brow: 0.004, smile: 0.1, aLp: -0.25, aLr: -0.35, aLe: -1.5, aRp: -0.35, aRr: -0.3, aRe: -1.45 }),
    excited: pose({ lean: 0.1, hPitch: -0.08, brow: 0.012, smile: 0.95, eyeOpen: 1.15, aLp: -2.4, aLr: 0.5, aLe: -0.5, aRp: -2.4, aRr: 0.5, aRe: -0.5 }),
    angry: pose({ lean: 0.16, hPitch: 0.06, brow: -0.006, browA: 0.4, smile: -0.8, eyeOpen: 0.8, aLp: -0.35, aLr: 0.7, aLe: -1.7, aRp: -2.55, aRr: 0.2, aRe: -1.0, shake: 1 }),
    think: pose({ lean: 0.05, hPitch: -0.12, hRoll: -0.08, brow: 0.004, browD: 0.012, browA: -0.15, smile: -0.1, eyeOpen: 0.85, aLp: -0.55, aLr: -0.55, aLe: -1.25, aRp: -0.75, aRr: -0.42, aRe: -2.35 }),
    point: pose({ lean: 0.08, hPitch: 0.04, brow: 0.008, browD: -0.008, smile: 0.25, aRp: -1.35, aRr: 0.05, aRe: -0.1, aLp: 0.05, aLr: 0.15, aLe: -0.4 }),
    suspicious: pose({ lean: 0.24, hPitch: 0.1, hRoll: -0.14, brow: -0.002, browD: 0.016, browA: 0.2, smile: -0.25, eyeOpen: 0.6, aRp: -1.25, aRr: -0.12, aRe: -0.25, aLp: 0.05, aLr: 0.1, aLe: -0.4 }),
    shock: pose({ lean: -0.08, hPitch: -0.06, brow: 0.018, browA: -0.15, smile: -0.3, jaw: 0.75, eyeOpen: 1.35, aLp: -1.9, aLr: 0.4, aLe: -1.6, aRp: -1.9, aRr: 0.4, aRe: -1.6 }),
    happy: pose({ lean: 0.08, hRoll: 0.06, brow: 0.008, smile: 1, eyeOpen: 0.9, aRp: -2.55, aRr: 0.4, aRe: -0.8, aLp: 0.0, aLr: 0.2, aLe: -0.4 })
  };

  // Camera shots. cam = eye, look = target, at = where Sherlock stands (x, z),
  // face = 'cam' or a point he turns to, mood = gesture override while this shot is on, clue = glowing object.
  var SHOTS = {
    door: { cam: [0.45, 1.62, 2.3], look: [0.1, 1.25, -0.8], at: [0.2, 0.25], face: 'cam' },
    fridge: { cam: [0.9, 1.58, 0.65], look: [2.1, 1.3, -1.75], at: [1.25, -0.95], face: 'cam', clue: 'note' },
    sink: { cam: [-0.75, 1.62, 1.05], look: [-2.3, 1.05, -0.85], at: [-1.75, -0.05], face: [-2.7, 0.9, -0.9], gesture: 'point', clue: 'spoon' },
    spoon: { cam: [-2.15, 1.32, -0.35], look: [-2.7, 0.78, -0.93], at: [-1.95, -1.55], face: [-2.7, 0.8, -0.9], clue: 'spoon' },
    keys: { cam: [1.7, 1.55, 1.5], look: [2.95, 1.36, 0.62], at: [2.05, -0.1], face: [3, 1.4, 0.65], gesture: 'point', clue: 'keys' },
    close: { cam: [0.05, 1.62, 2.15], look: [0, 1.55, 0.9], at: [0.02, 1.2], face: 'cam' },
    sleeve: { cam: [0.05, 1.62, 2.15], look: [0.05, 1.42, 1.0], at: [0.02, 1.2], face: 'cam', arm: true, clue: 'sleeve' },
    end: { cam: [-0.35, 1.62, 2.2], look: [1.9, 1.3, 0.95], at: [2.3, 1.0], face: 'cam' }
  };

  function supported() {
    try {
      if (!root.document) return false;
      var c = root.document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  }

  // ---------- geometry ----------
  function geoBox() {
    var F = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    var v = [], ix = [];
    F.forEach(function (f, fi) {
      var n = f[0], u = f[1], w = f[2];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
        v.push(n[0] * 0.5 + u[0] * s[0] * 0.5 + w[0] * s[1] * 0.5, n[1] * 0.5 + u[1] * s[0] * 0.5 + w[1] * s[1] * 0.5, n[2] * 0.5 + u[2] * s[0] * 0.5 + w[2] * s[1] * 0.5,
          n[0], n[1], n[2], (s[0] + 1) / 2, (s[1] + 1) / 2);
      });
      var b = fi * 4; ix.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    return { v: v, i: ix };
  }
  // y from 0 to 1, radius rb at the bottom and rt at the top
  function geoCyl(rt, rb, seg) {
    var v = [], ix = [], k, a, c, s, ny = rb - rt;
    for (k = 0; k <= seg; k++) {
      a = k / seg * Math.PI * 2; c = Math.cos(a); s = Math.sin(a);
      var nl = Math.hypot(1, ny);
      v.push(c * rb, 0, s * rb, c / nl, ny / nl, s / nl, k / seg, 0);
      v.push(c * rt, 1, s * rt, c / nl, ny / nl, s / nl, k / seg, 1);
    }
    for (k = 0; k < seg; k++) { var b = k * 2; ix.push(b, b + 1, b + 3, b, b + 3, b + 2); }
    [[0, rb, -1], [1, rt, 1]].forEach(function (cap) {
      if (cap[1] <= 0) return;
      var base = v.length / 8;
      v.push(0, cap[0], 0, 0, cap[2], 0, 0.5, 0.5);
      for (k = 0; k <= seg; k++) {
        a = k / seg * Math.PI * 2;
        v.push(Math.cos(a) * cap[1], cap[0], Math.sin(a) * cap[1], 0, cap[2], 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      }
      for (k = 0; k < seg; k++) ix.push(base, base + 1 + k, base + 2 + k);
    });
    return { v: v, i: ix };
  }
  function geoSphere(seg, rings, maxTheta) {
    var v = [], ix = [], th = maxTheta || Math.PI;
    for (var r = 0; r <= rings; r++) {
      var t = r / rings * th, st = Math.sin(t), ct = Math.cos(t);
      for (var k = 0; k <= seg; k++) {
        var p = k / seg * Math.PI * 2, x = st * Math.cos(p), z = st * Math.sin(p);
        v.push(x, ct, z, x, ct, z, k / seg, r / rings);
      }
    }
    for (r = 0; r < rings; r++) for (var j = 0; j < seg; j++) {
      var a = r * (seg + 1) + j, b = a + seg + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return { v: v, i: ix };
  }
  function geoPlane() { return { v: [-0.5, -0.5, 0, 0, 0, 1, 0, 0, 0.5, -0.5, 0, 0, 0, 1, 1, 0, 0.5, 0.5, 0, 0, 0, 1, 1, 1, -0.5, 0.5, 0, 0, 0, 1, 0, 1], i: [0, 1, 2, 0, 2, 3] }; }

  // ---------- shaders ----------
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute vec2 aU;' +
    'uniform mat4 uM,uVP,uLVP;uniform mat3 uNM;' +
    'varying vec3 vW,vN,vO;varying vec2 vU;varying vec4 vL;' +
    'void main(){vec4 w=uM*vec4(aP,1.);vW=w.xyz;vN=uNM*aN;vO=aP;vU=aU;vL=uLVP*w;gl_Position=uVP*w;}';
  var FS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    'varying vec3 vW,vN,vO;varying vec2 vU;varying vec4 vL;' +
    'uniform vec3 uC,uC2,uEm,uLD,uKey,uSky,uGnd,uLamp,uLampC,uFire,uFireC,uEye,uFog;' +
    'uniform float uPat,uSpec,uUseTex,uShOn,uShTx,uTime,uFogD,uAlpha;uniform sampler2D uTex,uSh;' +
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}' +
    'float unpack(vec4 c){return dot(c,vec4(1.,1./255.,1./65025.,1./16581375.));}' +
    'float shadow(vec3 n){if(uShOn<.5)return 1.;vec3 p=vL.xyz/vL.w*.5+.5;' +
    'if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.)return 1.;float b=.0015+.003*(1.-abs(dot(n,uLD)));float s=0.;' +
    'for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){s+=step(p.z-b,unpack(texture2D(uSh,p.xy+vec2(float(x),float(y))*uShTx)));}return s/9.;}' +
    'vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}' +
    'void main(){' +
    'if(uPat>6.5&&uPat<7.5){float f=(1.-vU.y)*(.75+.25*sin(uTime*.7+vW.x*2.+vW.y));f*=smoothstep(0.,.25,vU.x)*smoothstep(1.,.75,vU.x);gl_FragColor=vec4(uEm*f,1.);return;}' +
    'vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;vec3 base=uC;' +
    'if(uPat>.5&&uPat<1.5){vec2 g=vW.xz*2.857;float k=mod(floor(g.x)+floor(g.y),2.);vec2 e=abs(fract(g)-.5);float gr=smoothstep(.47,.5,max(e.x,e.y));base=mix(mix(uC,uC2,k),uC*.55,gr)*(.92+.08*noise(vW.xz*9.));}' +
    'else if(uPat>1.5&&uPat<2.5){float gr=noise(vec2(vW.x*3.+vW.z*3.,vW.y*40.+vW.z*40.+vW.x*25.));base=uC*(.82+.3*gr);}' +
    'else if(uPat>2.5&&uPat<3.5){float t=vW.x+vW.z;float st=smoothstep(.0,.03,abs(fract(t*4.)-.5)-.38);vec2 d=vec2(t*8.,vW.y*8.);vec2 f=abs(fract(d+vec2(0.,.5*mod(floor(t*8.),2.)))-.5);float dm=step(f.x+f.y,.18);base=mix(uC2,uC,st);base=mix(base,uC*1.25,dm*.6);}' +
    'else if(uPat>3.5&&uPat<4.5){vec2 g=vec2(vW.x+vW.z,vW.y)*6.6;vec2 e=abs(fract(g)-.5);base=mix(uC,uC2,smoothstep(.44,.49,max(e.x,e.y)));}' +
    'else if(uPat>4.5&&uPat<5.5){vec3 q=vO*9.;float a=step(.5,fract(q.x+q.z*.0))*.5+step(.5,fract(q.y))*.5;base=mix(uC,uC2,a*.6)*(.9+.2*noise(vO.xy*80.+vO.z*30.));}' +
    'else if(uPat>5.5&&uPat<6.5){vec2 u=vU;vec3 sky=mix(vec3(.85,.88,.9),vec3(.55,.62,.7),u.y);float bx=floor(u.x*9.);float h=.18+.3*hash(vec2(bx,3.));' +
    'float bld=step(u.y,h);float win=step(.6,hash(floor(u*vec2(54.,40.))))*bld*step(.15,fract(u.x*54.))*step(.3,fract(u.y*40.));sky=mix(sky,vec3(.32,.35,.4),bld*.85)+vec3(1.,.8,.45)*win*.6;' +
    'float col=floor(u.x*70.);float r=step(.93,hash(vec2(col,1.)))*step(fract(u.y*1.3+uTime*(1.4+hash(vec2(col,2.)))+hash(vec2(col,5.))),.08);' +
    'gl_FragColor=vec4(pow(aces((sky+vec3(r*.3))*1.6),vec3(1./2.2)),1.);return;}' +
    'else if(uPat>7.5){vec2 u=abs(vU-.5);float bd=step(.42,max(u.x,u.y))-step(.46,max(u.x,u.y));float m=step(.5,fract((vU.x+vU.y)*10.))*step(max(u.x,u.y),.38);base=mix(uC,uC2,max(bd,m*.35));}' +
    'if(uUseTex>.5){vec4 tx=texture2D(uTex,vU);base=tx.rgb;}' +
    'vec3 V=normalize(uEye-vW);float sh=shadow(n);float nd=max(dot(n,-uLD),0.);' +
    'vec3 col=base*(mix(uGnd,uSky,n.y*.5+.5)+uKey*nd*sh);' +
    'vec3 lp=uLamp-vW;float dl=length(lp);col+=base*uLampC*max(dot(n,lp/dl),0.)/(1.+dl*dl*1.1);' +
    'vec3 fp=uFire-vW;float df=length(fp);col+=base*uFireC*max(dot(n,fp/df)*.8+.2,0.)/(1.+df*df*1.6);' +
    'vec3 H=normalize(-uLD+V);col+=uKey*sh*pow(max(dot(n,H),0.),48.)*uSpec;' +
    'vec3 H2=normalize(lp/dl+V);col+=uLampC*pow(max(dot(n,H2),0.),32.)*uSpec*.25/(1.+dl*dl);' +
    'col+=base*pow(1.-max(dot(n,V),0.),3.)*.18*uSky;col+=uEm;' +
    'float fg=1.-exp(-uFogD*length(vW-uEye));col=mix(col,uFog,fg);' +
    'gl_FragColor=vec4(pow(aces(col),vec3(1./2.2)),uAlpha);}';
  var DVS = 'attribute vec3 aP;attribute vec3 aN;attribute vec2 aU;uniform mat4 uM,uLVP;void main(){gl_Position=uLVP*uM*vec4(aP,1.);}';
  var DFS = 'precision highp float;void main(){vec4 e=fract(vec4(1.,255.,65025.,16581375.)*gl_FragCoord.z);e-=e.yzww*vec4(1./255.,1./255.,1./255.,0.);gl_FragColor=e;}';
  var PVS = 'attribute vec3 aP;attribute vec3 aN;attribute vec2 aU;uniform mat4 uVP;uniform float uT,uPx;varying float vA;' +
    'void main(){vec3 p=aP+vec3(sin(uT*.21+aN.x*6.3)*.12,sin(uT*.13+aN.y*6.3)*.1-fract(uT*.012+aN.z)*.25,cos(uT*.17+aN.z*6.3)*.12);' +
    'gl_Position=uVP*vec4(p,1.);gl_PointSize=uPx*.022/gl_Position.w;vA=.35+.65*fract(aN.x*7.1+uT*.05*aN.y);}';
  var PFS = 'precision mediump float;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float a=smoothstep(.5,.0,length(d));gl_FragColor=vec4(vec3(1.,.95,.85)*a*vA*.55,1.);}';

  function hex(h, k) {
    var n = parseInt(h.slice(1), 16), f = k == null ? 1 : k;
    return [Math.pow(((n >> 16) & 255) / 255, 2.2) * f, Math.pow(((n >> 8) & 255) / 255, 2.2) * f, Math.pow((n & 255) / 255, 2.2) * f];
  }

  function mount(el, opts) {
    opts = opts || {};
    var reduced = !!opts.reduced;
    var doc = root.document;
    var canvas = doc.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', opts.label || 'Sherlock 3D scene');
    var gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl', { antialias: true, alpha: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    el.innerHTML = '';
    el.classList.add('s3d');
    el.appendChild(canvas);
    var hint = null;
    if (opts.hint) {
      hint = doc.createElement('div');
      hint.className = 's3d-hint';
      hint.textContent = opts.hint;
      el.appendChild(hint);
    }

    function compile(vs, fs) {
      var p = gl.createProgram();
      [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (x) {
        var s = gl.createShader(x[0]); gl.shaderSource(s, x[1]); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      });
      gl.bindAttribLocation(p, 0, 'aP'); gl.bindAttribLocation(p, 1, 'aN'); gl.bindAttribLocation(p, 2, 'aU');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
      return { p: p, u: u };
    }
    var prog, dprog, pprog;
    try { prog = compile(VS, FS); dprog = compile(DVS, DFS); pprog = compile(PVS, PFS); } catch (e) {
      if (root.console) root.console.warn(e);
      el.classList.remove('s3d');
      return null;
    }

    // meshes
    var meshes = {};
    function upload(g) {
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.v), gl.STATIC_DRAW);
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.i), gl.STATIC_DRAW);
      return { vb: vb, ib: ib, n: g.i.length };
    }
    function mesh(key) {
      if (meshes[key]) return meshes[key];
      var p = key.split(':');
      var g = p[0] === 'box' ? geoBox() : p[0] === 'plane' ? geoPlane() : p[0] === 'sph' ? geoSphere(+p[1] || 20, +p[2] || 14)
        : p[0] === 'hemi' ? geoSphere(+p[1] || 20, 8, Math.PI / 2) : geoCyl(+p[1], +p[2], +p[3] || 18);
      meshes[key] = upload(g);
      return meshes[key];
    }

    // canvas textures (decals with words)
    var texs = {};
    function makeTex(name, draw) {
      var c = doc.createElement('canvas'); c.width = 256; c.height = 256;
      var x = c.getContext('2d'); draw(x);
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      texs[name] = t;
    }
    function paper(x, bg) { x.fillStyle = bg; x.fillRect(0, 0, 256, 256); for (var i = 0; i < 900; i++) { x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.04) + ')'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } }
    makeTex('note', function (x) {
      paper(x, '#f7e98a');
      x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, 0, 256, 34);
      x.fillStyle = '#7a3b2e'; x.font = 'bold 44px Georgia, serif'; x.textAlign = 'center';
      x.fillText('YOGURT:', 128, 100);
      x.fillStyle = '#b3261e'; x.font = 'bold 64px Georgia, serif'; x.fillText('MINE!', 128, 172);
      x.fillStyle = '#5a3a2a'; x.font = 'italic 30px Georgia, serif'; x.fillText('— S.H.', 150, 225);
    });
    makeTex('spare', function (x) {
      paper(x, '#efe4cc');
      x.strokeStyle = '#8a6a4a'; x.lineWidth = 8; x.strokeRect(10, 10, 236, 236);
      x.fillStyle = '#3a2a1e'; x.font = 'bold 58px Georgia, serif'; x.textAlign = 'center';
      x.fillText('SPARE', 128, 118); x.font = 'italic 34px Georgia, serif'; x.fillText('(neighbor)', 128, 180);
    });
    makeTex('paint', function (x) {
      var g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#c9b48a'); g.addColorStop(0.55, '#8c9a8a'); g.addColorStop(1, '#3f4a3c');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      x.fillStyle = '#2f3a2c'; x.beginPath(); x.moveTo(0, 190); x.quadraticCurveTo(80, 120, 150, 170); x.quadraticCurveTo(210, 130, 256, 160); x.lineTo(256, 256); x.lineTo(0, 256); x.fill();
      x.fillStyle = '#f2e3b3'; x.beginPath(); x.arc(190, 70, 22, 0, 7); x.fill();
      x.fillStyle = 'rgba(40,30,20,.6)'; x.fillRect(60, 150, 8, 40); x.beginPath(); x.arc(64, 140, 22, 0, 7); x.fill();
    });
    makeTex('paper', function (x) {
      paper(x, '#e9e2cf');
      x.fillStyle = '#222'; x.font = 'bold 30px Georgia, serif'; x.textAlign = 'center'; x.fillText('LONDON GAZETTE', 128, 40);
      x.fillRect(16, 50, 224, 3);
      x.font = 'bold 22px Georgia, serif'; x.fillText('Mystery in Baker St.', 128, 82);
      x.fillStyle = 'rgba(30,30,30,.55)';
      for (var r = 0; r < 12; r++) { x.fillRect(16, 100 + r * 12, 104, 5); x.fillRect(136, 100 + r * 12, 104, 5); }
    });
    makeTex('plate', function (x) {
      x.fillStyle = '#b08a3e'; x.fillRect(0, 0, 256, 256);
      x.fillStyle = '#e2c278'; x.fillRect(12, 12, 232, 232);
      x.fillStyle = '#2a1e10'; x.font = 'bold 96px Georgia, serif'; x.textAlign = 'center'; x.fillText('221B', 128, 160);
    });

    // materials
    function M(c, o) { o = o || {}; return { c: hex(c), c2: o.c2 ? hex(o.c2) : hex(c), pat: o.pat || 0, em: o.em || [0, 0, 0], spec: o.spec == null ? 0.15 : o.spec, tex: o.tex || null }; }
    var MAT = {
      floor: M('#d8ccb0', { c2: '#2e383d', pat: 1, spec: 0.35 }),
      ceil: M('#e7dcc4'), paper: M('#46625a', { c2: '#3b554e', pat: 3, spec: 0.05 }),
      wain: M('#5b3a24', { pat: 2, spec: 0.25 }), trim: M('#efe6d4', { spec: 0.2 }),
      cab: M('#d9cfb6', { spec: 0.2 }), cabLine: M('#9c917b'), top: M('#a8916d', { pat: 2, spec: 0.4 }),
      tile: M('#ebe7dc', { c2: '#9a968c', pat: 4, spec: 0.5 }), porcelain: M('#e4e6e4', { spec: 0.9 }), chrome: M('#c9ced3', { spec: 1.6 }),
      fridge: M('#e6e8e3', { spec: 0.8 }), wood: M('#6e4a2e', { pat: 2, spec: 0.3 }), darkwood: M('#43291a', { pat: 2, spec: 0.3 }),
      marble: M('#2c2b2e', { spec: 0.7 }), soot: M('#0d0b0a', { spec: 0 }), brass: M('#c09140', { spec: 1.4 }),
      leather: M('#7b2b22', { spec: 0.6 }), rug: M('#6a1f22', { c2: '#c9a45c', pat: 8, spec: 0.02 }), velvet: M('#7a1f24', { spec: 0.1 }),
      cloth: M('#efe9db', { spec: 0.05 }), shade: M('#2e6a4a', { spec: 0.8 }), bulb: M('#ffe1a0', { em: hex('#ffd38a', 3.2) }),
      book1: M('#7d2a24'), book2: M('#2d4a6a'), book3: M('#3e5a2e'), book4: M('#b08a3e'), book5: M('#4a3a5a'),
      apple: M('#b5262a', { spec: 0.9 }), green: M('#5a7a2a', { spec: 0.6 }), bone: M('#e6dcc4', { spec: 0.4 }), hole: M('#1a1410', { spec: 0 }),
      sky: { c: [1, 1, 1], c2: [1, 1, 1], pat: 6, em: [1, 1, 1], spec: 0, tex: null },
      pink: M('#ff5f9a', { em: hex('#ff3d86', 0.25), spec: 1.2 }), fire1: M('#ff8a2a', { em: hex('#ff7a1a', 2.6) }), fire2: M('#ffd36a', { em: hex('#ffc04a', 3.4) }),
      note: { c: [1, 1, 1], c2: [1, 1, 1], pat: 0, em: [0, 0, 0], spec: 0.05, tex: 'note' },
      spare: { c: [1, 1, 1], c2: [1, 1, 1], pat: 0, em: [0, 0, 0], spec: 0.05, tex: 'spare' },
      paint: { c: [1, 1, 1], c2: [1, 1, 1], pat: 0, em: [0, 0, 0], spec: 0.1, tex: 'paint' },
      news: { c: [1, 1, 1], c2: [1, 1, 1], pat: 0, em: [0, 0, 0], spec: 0.05, tex: 'paper' },
      plate: { c: [1, 1, 1], c2: [1, 1, 1], pat: 0, em: [0, 0, 0], spec: 1.0, tex: 'plate' },
      // Sherlock
      skin: M('#e2b08c', { spec: 0.25 }), hair: M('#2a1f1a', { spec: 0.5 }), tweed: M('#7a6649', { c2: '#5a4a35', pat: 5, spec: 0.08 }),
      coat: M('#4f4336', { c2: '#463b30', pat: 5, spec: 0.08 }), trousers: M('#34353a', { spec: 0.1 }), shoe: M('#1a1614', { spec: 1.0 }),
      shirt: M('#f3efe6'), tie: M('#7a1e22', { spec: 0.4 }), eyeW: M('#f6f3ee', { spec: 0.6 }), iris: M('#3c4c5a', { spec: 1.6 }), lip: M('#5a2420', { spec: 0.2 }),
      sleeve: M('#2f4b78', { spec: 0.1 }), myskin: M('#e0aa84', { spec: 0.2 })
    };

    // ---------- static scene ----------
    var items = [];
    function put(meshKey, m, mat, o) {
      o = o || {};
      var it = { mesh: mesh(meshKey), m: m, nm: normalMat(m), mat: mat, cast: o.cast !== false, clue: o.clue || null };
      items.push(it);
      return it;
    }
    function box(x, y, z, w, h, d, mat, o) { o = o || {}; return put('box', chain(T(x, y, z), RY(o.ry || 0), RZ(o.rz || 0), RX(o.rx || 0), S(w, h, d)), mat, o); }
    function cyl(x, y, z, rt, rb, h, mat, o) { o = o || {}; return put('cyl:' + rt + ':' + rb + ':' + (o.seg || 20), chain(T(x, y, z), RY(o.ry || 0), RZ(o.rz || 0), RX(o.rx || 0), S(o.sx || 1, h, o.sz || 1)), mat, o); }
    function sph(x, y, z, rx, ry, rz, mat, o) { o = o || {}; return put(o.hemi ? 'hemi:20' : 'sph:20:14', chain(T(x, y, z), RY(o.ry || 0), RZ(o.rz || 0), RX(o.rx || 0), S(rx, ry, rz)), mat, o); }
    function plane(x, y, z, w, h, mat, o) { o = o || {}; return put('plane', chain(T(x, y, z), RY(o.ry || 0), RZ(o.rz || 0), S(w, h, 1)), mat, o); }

    var X0 = -3, X1 = 3, Z0 = -2.5, Z1 = 2.5, H = 2.8;
    box(0, -0.05, 0, 6.2, 0.1, 5.2, MAT.floor);
    box(0, H + 0.05, 0, 6.2, 0.1, 5.2, MAT.ceil);
    // back wall with a window opening (x -1.0..0.4, y 0.95..2.35): the light pours through it
    var wx0 = -1.0, wx1 = 0.4, wy0 = 0.95, wy1 = 2.35, wcx = (wx0 + wx1) / 2;
    box((X0 + wx0) / 2, H / 2, Z0 - 0.05, wx0 - X0, H, 0.1, MAT.paper);
    box((wx1 + X1) / 2, H / 2, Z0 - 0.05, X1 - wx1, H, 0.1, MAT.paper);
    box(wcx, wy0 / 2, Z0 - 0.05, wx1 - wx0, wy0, 0.1, MAT.paper);
    box(wcx, (wy1 + H) / 2, Z0 - 0.05, wx1 - wx0, H - wy1, 0.1, MAT.paper);
    box(X0 - 0.05, H / 2, 0, 0.1, H, 5.2, MAT.paper);
    box(X1 + 0.05, H / 2, 0, 0.1, H, 5.2, MAT.paper);
    box(0, H / 2, Z1 + 0.05, 6.2, H, 0.1, MAT.paper);
    // wainscot, chair rail, skirting, cornice
    [[0, Z0 + 0.01, 6, 0], [0, Z1 - 0.01, 6, 0]].forEach(function (w) {
      box(w[0], 0.45, w[1], w[2], 0.9, 0.025, MAT.wain); box(w[0], 0.92, w[1], w[2], 0.05, 0.05, MAT.trim); box(w[0], 2.74, w[1], w[2], 0.1, 0.06, MAT.trim);
    });
    [X0 + 0.01, X1 - 0.01].forEach(function (x) {
      box(x, 0.45, 0, 0.025, 0.9, 5, MAT.wain); box(x, 0.92, 0, 0.05, 0.05, 5, MAT.trim); box(x, 2.74, 0, 0.06, 0.1, 5, MAT.trim);
    });
    // window: sky outside, frame, sash bars, sill, curtains
    plane(wcx, (wy0 + wy1) / 2, Z0 - 0.35, 2.6, 2.2, MAT.sky, { cast: false });
    box(wcx, wy0 - 0.03, Z0 + 0.05, wx1 - wx0 + 0.3, 0.06, 0.22, MAT.trim);
    box(wx0 - 0.04, (wy0 + wy1) / 2, Z0, 0.08, wy1 - wy0 + 0.1, 0.14, MAT.trim);
    box(wx1 + 0.04, (wy0 + wy1) / 2, Z0, 0.08, wy1 - wy0 + 0.1, 0.14, MAT.trim);
    box(wcx, wy1 + 0.04, Z0, wx1 - wx0 + 0.16, 0.08, 0.14, MAT.trim);
    box(wcx, (wy0 + wy1) / 2, Z0 - 0.06, 0.045, wy1 - wy0, 0.04, MAT.trim);
    box(wcx, (wy0 + wy1) / 2 + 0.05, Z0 - 0.06, wx1 - wx0, 0.045, 0.04, MAT.trim);
    box(wcx, wy0 + 0.35, Z0 - 0.06, wx1 - wx0, 0.03, 0.03, MAT.trim);
    box(wcx, wy1 - 0.35, Z0 - 0.06, wx1 - wx0, 0.03, 0.03, MAT.trim);
    [-1, 1].forEach(function (s) {
      var cx = s < 0 ? wx0 - 0.28 : wx1 + 0.28;
      for (var k = 0; k < 5; k++) cyl(cx + (k - 2) * 0.07, 0.05, Z0 + 0.12 + (k % 2) * 0.03, 0.05, 0.06, 2.6, MAT.velvet, { seg: 10 });
    });
    box(wcx, 2.66, Z0 + 0.12, 2.3, 0.04, 0.04, MAT.brass);
    // painting left of the window, bookshelf right of it, "V.R." in bullet holes above the shelf
    box(-2.0, 1.72, Z0 + 0.02, 0.78, 0.62, 0.04, MAT.brass);
    plane(-2.0, 1.72, Z0 + 0.045, 0.66, 0.5, MAT.paint, { cast: false });
    box(1.3, 0.95, Z0 + 0.03, 1.1, 1.9, 0.03, MAT.darkwood);
    box(0.765, 0.95, Z0 + 0.17, 0.03, 1.9, 0.32, MAT.darkwood); box(1.835, 0.95, Z0 + 0.17, 0.03, 1.9, 0.32, MAT.darkwood);
    box(1.3, 1.91, Z0 + 0.17, 1.14, 0.04, 0.34, MAT.darkwood);
    var bookMats = [MAT.book1, MAT.book2, MAT.book3, MAT.book4, MAT.book5];
    for (var sh = 0; sh < 4; sh++) {
      var sy = 0.18 + sh * 0.45;
      box(1.3, sy - 0.02, Z0 + 0.17, 1.04, 0.03, 0.3, MAT.darkwood);
      var bx = 0.82;
      for (var bk = 0; bx < 1.74; bk++) {
        var bw = 0.04 + ((bk * 37 + sh * 11) % 5) * 0.012, bh = 0.26 + ((bk * 13 + sh * 7) % 4) * 0.035;
        box(bx + bw / 2, sy + bh / 2, Z0 + 0.2, bw, bh, 0.24, bookMats[(bk + sh * 2) % 5], { rz: (bk % 7 === 3) ? 0.15 : 0 });
        bx += bw + 0.006;
      }
    }
    var VR = [[0, 2], [0.04, 1], [0.08, 0], [0.12, 1], [0.16, 2], [0.28, 0], [0.28, 1], [0.28, 2], [0.32, 2], [0.36, 1.6], [0.32, 1.1], [0.36, 0.5], [0.4, 0]];
    VR.forEach(function (p) { sph(1.08 + p[0] * 1.6, 2.06 + p[1] * 0.12, Z0 + 0.005, 0.014, 0.014, 0.004, MAT.hole, { cast: false }); });

    // kitchen counter on the left wall with the sink
    // cabinet body stops at 0.74 so the sink basin is really hollow; apron and end panels close the gap
    box(-2.7, 0.37, -1.0, 0.6, 0.74, 2.8, MAT.cab);
    box(-2.415, 0.82, -1.0, 0.03, 0.16, 2.8, MAT.cab);
    box(-2.7, 0.82, -2.39, 0.6, 0.16, 0.02, MAT.cab); box(-2.7, 0.82, 0.39, 0.6, 0.16, 0.02, MAT.cab);
    for (var cd = 0; cd < 5; cd++) box(-2.395, 0.47, -2.12 + cd * 0.56, 0.01, 0.74, 0.5, MAT.cabLine, { cast: false }), box(-2.39, 0.47, -2.12 + cd * 0.56, 0.012, 0.7, 0.46, MAT.cab, { cast: false }), sph(-2.37, 0.7, -1.95 + cd * 0.56, 0.015, 0.015, 0.015, MAT.brass, { cast: false });
    // countertop pieces around the sink hole (x -2.95..-2.45, z -1.2..-0.6)
    box(-2.68, 0.925, -1.82, 0.66, 0.05, 1.24, MAT.top);
    box(-2.68, 0.925, -0.09, 0.66, 0.05, 1.02, MAT.top);
    box(-2.4, 0.925, -0.9, 0.1, 0.05, 0.6, MAT.top);
    box(-2.975, 0.925, -0.9, 0.05, 0.05, 0.6, MAT.top);
    box(-2.7, 0.76, -0.9, 0.5, 0.02, 0.6, MAT.porcelain);
    box(-2.7, 0.85, -1.195, 0.5, 0.18, 0.012, MAT.porcelain); box(-2.7, 0.85, -0.605, 0.5, 0.18, 0.012, MAT.porcelain);
    box(-2.945, 0.85, -0.9, 0.012, 0.18, 0.6, MAT.porcelain); box(-2.455, 0.85, -0.9, 0.012, 0.18, 0.6, MAT.porcelain);
    cyl(-2.88, 0.95, -0.9, 0.018, 0.022, 0.32, MAT.chrome);
    box(-2.78, 1.26, -0.9, 0.2, 0.03, 0.03, MAT.chrome);
    cyl(-2.69, 1.18, -0.9, 0.012, 0.012, 0.08, MAT.chrome);
    sph(-2.88, 1.05, -1.0, 0.03, 0.012, 0.012, MAT.chrome); sph(-2.88, 1.05, -0.8, 0.03, 0.012, 0.012, MAT.chrome);
    // THE spoon, washed in a hurry, with a pink drop
    var spoonM = M('#8e959b', { spec: 2.2 });
    box(-2.76, 0.776, -0.95, 0.2, 0.01, 0.022, spoonM, { ry: 0.6, clue: 'spoon' });
    sph(-2.62, 0.78, -1.04, 0.048, 0.013, 0.034, spoonM, { ry: 0.6, clue: 'spoon' });
    sph(-2.615, 0.794, -1.04, 0.013, 0.008, 0.013, MAT.pink, { clue: 'spoon' });
    cyl(-2.79, 0.771, -0.76, 0.075, 0.06, 0.012, M('#f6f4ee', { spec: 1 }), { seg: 24 }); // a plate
    // tiled splashback, upper cabinets, kettle, jars
    box(-2.985, 1.22, -1.0, 0.02, 0.55, 2.8, MAT.tile, { cast: false });
    box(-2.82, 1.98, -1.55, 0.36, 0.7, 1.7, MAT.cab);
    box(-2.635, 1.98, -1.98, 0.01, 0.62, 0.78, MAT.cabLine, { cast: false }); box(-2.635, 1.98, -1.12, 0.01, 0.62, 0.78, MAT.cabLine, { cast: false });
    box(-2.82, 1.64, 0.0, 0.3, 0.025, 0.9, MAT.wood);
    [[-0.3, '#b9733a'], [-0.1, '#7a8a5a'], [0.12, '#d9c38a'], [0.32, '#8a3a2a']].forEach(function (j) {
      cyl(-2.84, 1.655, j[0], 0.05, 0.05, 0.16, M(j[1], { spec: 0.9 })); cyl(-2.84, 1.815, j[0], 0.052, 0.052, 0.03, MAT.brass);
    });
    sph(-2.72, 1.03, -0.15, 0.11, 0.1, 0.11, M('#3a5a7a', { spec: 1.2 })); cyl(-2.72, 1.11, -0.15, 0.03, 0.03, 0.05, MAT.darkwood);
    box(-2.6, 1.05, -0.06, 0.12, 0.025, 0.025, M('#3a5a7a', { spec: 1.2 }), { rz: 0.5 });
    box(-2.72, 1.0, 0.25, 0.3, 0.12, 0.2, MAT.wood); // bread box

    // fridge with Sherlock's note (back-right corner)
    box(2.45, 0.92, -2.08, 0.76, 1.84, 0.72, MAT.fridge);
    box(2.45, 1.2, -1.715, 0.74, 0.008, 0.01, MAT.cabLine, { cast: false });
    box(2.13, 1.45, -1.69, 0.03, 0.4, 0.04, MAT.chrome); box(2.13, 0.75, -1.69, 0.03, 0.3, 0.04, MAT.chrome);
    plane(2.42, 1.42, -1.714, 0.26, 0.26, MAT.note, { rz: -0.07, cast: false, clue: 'note' });
    sph(2.42, 1.54, -1.71, 0.018, 0.018, 0.01, MAT.apple, { cast: false });

    // fireplace on the right wall
    box(2.86, 0.62, -0.5, 0.28, 1.24, 1.5, MAT.marble);
    box(2.76, 0.36, -0.5, 0.14, 0.62, 0.78, MAT.soot);
    box(2.82, 1.27, -0.5, 0.42, 0.07, 1.7, MAT.marble);
    box(2.74, 0.08, -0.5, 0.2, 0.06, 0.8, MAT.brass);
    var flames = [];
    [[-0.18, 0.7], [0, 1], [0.17, 0.8], [-0.07, 0.6], [0.09, 0.55]].forEach(function (f, k) {
      flames.push(put('cyl:0:1:10', chain(T(2.78, 0.1, -0.5 + f[0]), S(0.07, 0.22 * f[1], 0.07)), k % 2 ? MAT.fire2 : MAT.fire1, { cast: false }));
    });
    box(2.78, 0.11, -0.5, 0.12, 0.04, 0.5, MAT.wood, { ry: 0.2 });
    // mantel things: clock, skull, candle, a framed painting above
    box(2.82, 1.42, -0.5, 0.12, 0.24, 0.2, MAT.darkwood); sph(2.755, 1.45, -0.5, 0.005, 0.06, 0.06, M('#f3ead2'));
    sph(2.84, 1.37, -0.95, 0.07, 0.065, 0.08, MAT.bone); sph(2.79, 1.36, -0.92, 0.012, 0.014, 0.012, MAT.hole, { cast: false }); sph(2.79, 1.36, -0.98, 0.012, 0.014, 0.012, MAT.hole, { cast: false });
    cyl(2.84, 1.3, -0.08, 0.018, 0.018, 0.18, M('#f2ead6')); sph(2.84, 1.5, -0.08, 0.012, 0.025, 0.012, MAT.fire2, { cast: false });
    box(2.985, 1.9, -0.5, 0.04, 0.6, 0.8, MAT.brass);
    plane(2.96, 1.9, -0.5, 0.68, 0.48, MAT.paint, { ry: -Math.PI / 2, cast: false });
    // armchair by the fire, with the violin on it
    (function () {
      var cx = 1.85, cz = -0.75, ry = Math.PI / 2 - 0.35;
      function rel(x, y, z) { var c = Math.cos(ry), s = Math.sin(ry); return [cx + x * c + z * s, y, cz - x * s + z * c]; }
      function cb(x, y, z, w, h, d, mat) { var p = rel(x, y, z); box(p[0], p[1], p[2], w, h, d, mat, { ry: ry }); }
      cb(0, 0.22, 0, 0.72, 0.44, 0.68, MAT.leather); cb(0, 0.66, -0.3, 0.72, 0.9, 0.16, MAT.leather);
      cb(-0.33, 0.5, 0.02, 0.12, 0.36, 0.7, MAT.leather); cb(0.33, 0.5, 0.02, 0.12, 0.36, 0.7, MAT.leather);
      var v = rel(0.05, 0.47, 0.05);
      sph(v[0], v[1], v[2], 0.11, 0.03, 0.17, M('#8a4a1e', { spec: 1.3 }), { ry: ry + 0.6 });
      var nk = rel(0.17, 0.47, 0.22); box(nk[0], nk[1], nk[2], 0.035, 0.025, 0.22, MAT.soot, { ry: ry + 0.6 });
    })();

    // the door to the landing and the key rack (right wall, front)
    box(2.985, 1.06, 1.5, 0.06, 2.12, 0.98, MAT.darkwood);
    [[1.55, 0.6], [0.6, 0.6]].forEach(function (p) { box(2.95, p[0], 1.5, 0.02, p[1] + 0.05, 0.36, MAT.wood, { cast: false }); });
    box(2.96, 1.06, 0.97, 0.06, 2.2, 0.08, MAT.trim); box(2.96, 1.06, 2.03, 0.06, 2.2, 0.08, MAT.trim); box(2.96, 2.18, 1.5, 0.06, 0.08, 1.14, MAT.trim);
    sph(2.93, 1.0, 1.14, 0.03, 0.03, 0.03, MAT.brass);
    plane(2.948, 1.85, 1.5, 0.16, 0.08, MAT.plate, { ry: -Math.PI / 2, cast: false });
    box(2.975, 1.45, 0.62, 0.03, 0.09, 0.42, MAT.wood, { clue: 'keys' });
    [0.48, 0.62, 0.76].forEach(function (z, k) {
      cyl(2.95, 1.43, z, 0.006, 0.006, 0.05, MAT.brass, { rz: Math.PI / 2 + 0.3, clue: 'keys' });
      if (k !== 1) {
        cyl(2.93, 1.37, z, 0.016, 0.016, 0.004, MAT.brass, { rz: Math.PI / 2, clue: 'keys' });
        box(2.93, 1.31, z, 0.006, 0.08, 0.014, MAT.brass, { clue: 'keys' });
      }
    });
    plane(2.958, 1.36, 0.62, 0.09, 0.09, MAT.spare, { ry: -Math.PI / 2, cast: false, clue: 'keys' });

    // table, chairs, rug, lamp
    box(0, 0.006, -0.3, 2.6, 0.012, 1.9, MAT.rug, { cast: false });
    cyl(0, 0.72, -0.3, 0.6, 0.6, 0.05, MAT.wood, { seg: 32 });
    cyl(0, 0.765, -0.3, 0.42, 0.42, 0.006, MAT.cloth, { seg: 32 });
    cyl(0, 0.08, -0.3, 0.05, 0.07, 0.64, MAT.darkwood);
    cyl(0, 0.0, -0.3, 0.26, 0.3, 0.08, MAT.darkwood, { seg: 24 });
    // teapot, cups, newspaper, fruit
    sph(0.12, 0.85, -0.32, 0.11, 0.09, 0.11, M('#f2f0ea', { spec: 1.1 })); cyl(0.12, 0.93, -0.32, 0.03, 0.05, 0.04, M('#f2f0ea', { spec: 1.1 }));
    box(0.25, 0.86, -0.32, 0.1, 0.02, 0.02, M('#f2f0ea', { spec: 1.1 }), { rz: 0.6 });
    [[-0.2, -0.05], [0.3, -0.05]].forEach(function (c) { cyl(c[0], 0.77, -0.3 + c[1] + 0.25, 0.04, 0.03, 0.06, M('#f2f0ea', { spec: 1.1 })); });
    plane(-0.2, 0.772, -0.55, 0.34, 0.34, MAT.news, { cast: false, ry: 0.4 }).m = chain(T(-0.2, 0.772, -0.55), RY(0.4), RX(-Math.PI / 2), S(0.34, 0.34, 1));
    items[items.length - 1].nm = normalMat(items[items.length - 1].m);
    cyl(-0.1, 0.77, -0.1, 0.12, 0.08, 0.06, MAT.brass, { seg: 18 });
    sph(-0.13, 0.85, -0.09, 0.04, 0.04, 0.04, MAT.apple); sph(-0.06, 0.85, -0.12, 0.04, 0.04, 0.04, MAT.green); sph(-0.1, 0.88, -0.05, 0.04, 0.04, 0.04, MAT.apple);
    function chair(x, z, ry) {
      var c = Math.cos(ry), s = Math.sin(ry);
      function r(px, pz) { return [x + px * c + pz * s, z - px * s + pz * c]; }
      var p = r(0, 0); box(p[0], 0.45, p[1], 0.44, 0.04, 0.42, MAT.wood, { ry: ry });
      [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]].forEach(function (l) { var q = r(l[0], l[1]); box(q[0], 0.22, q[1], 0.035, 0.45, 0.035, MAT.darkwood, { ry: ry }); });
      [-0.18, 0.18].forEach(function (lx) { var q = r(lx, -0.19); box(q[0], 0.7, q[1], 0.035, 0.5, 0.035, MAT.darkwood, { ry: ry }); });
      var t = r(0, -0.19); box(t[0], 0.9, t[1], 0.42, 0.08, 0.03, MAT.darkwood, { ry: ry }); box(t[0], 0.68, t[1], 0.36, 0.04, 0.025, MAT.darkwood, { ry: ry });
    }
    chair(-0.75, -0.45, Math.PI / 2 + 0.3);
    chair(0.62, -0.95, -0.7);
    cyl(0, 2.1, -0.3, 0.006, 0.006, 0.7, MAT.soot, { cast: false });
    cyl(0, 1.94, -0.3, 0.06, 0.26, 0.18, MAT.shade, { seg: 24, cast: false });
    sph(0, 1.95, -0.3, 0.05, 0.05, 0.05, MAT.bulb, { cast: false });
    // a pile of newspapers on the floor
    for (var np = 0; np < 4; np++) box(-1.55, 0.02 + np * 0.025, 1.7, 0.42, 0.022, 0.3, MAT.cloth, { ry: 0.2 + np * 0.12 });

    // light beam through the window (additive volume) + dust motes floating in it
    var LD = norm([0.28, -0.52, 0.81]);
    var beamMesh = (function () {
      var C = [[wx0, wy0], [wx1, wy0], [wx1, wy1], [wx0, wy1]].map(function (p) { return [p[0], p[1], Z0 + 0.02]; });
      var far = C.map(function (p) { var t = p[1] / -LD[1]; return [p[0] + LD[0] * t, 0.01, p[2] + LD[2] * t]; });
      var v = [], ix = [];
      for (var k = 0; k < 4; k++) {
        var a = C[k], b = C[(k + 1) % 4], c = far[(k + 1) % 4], d = far[k], base = v.length / 8;
        [[a, 0, 0], [b, 1, 0], [c, 1, 1], [d, 0, 1]].forEach(function (q) { v.push(q[0][0], q[0][1], q[0][2], 0, 0, 1, q[1], q[2]); });
        ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      // a soft middle sheet so the beam reads from every angle
      var m0 = [(C[0][0] + C[1][0]) / 2, wy0, Z0 + 0.02], m1 = [(C[0][0] + C[1][0]) / 2, wy1, Z0 + 0.02];
      var f0 = [m0[0] + LD[0] * (m0[1] / -LD[1]), 0.01, m0[2] + LD[2] * (m0[1] / -LD[1])], f1 = [m1[0] + LD[0] * (m1[1] / -LD[1]), 0.01, m1[2] + LD[2] * (m1[1] / -LD[1])];
      var bb = v.length / 8;
      [[m0, 0, 0], [m1, 1, 0], [f1, 1, 1], [f0, 0, 1]].forEach(function (q) { v.push(q[0][0], q[0][1], q[0][2], 0, 0, 1, q[1], q[2]); });
      ix.push(bb, bb + 1, bb + 2, bb, bb + 2, bb + 3);
      return upload({ v: v, i: ix });
    })();
    var dust = (function () {
      var v = [], n = 220;
      for (var k = 0; k < n; k++) {
        var px = wx0 + Math.random() * (wx1 - wx0), py = wy0 + Math.random() * (wy1 - wy0), t = Math.random() * (py / -LD[1]) * 0.9;
        v.push(px + LD[0] * t, py + LD[1] * t, Z0 + 0.05 + LD[2] * t, Math.random(), Math.random(), Math.random(), 0, 0);
      }
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      return { vb: b, n: n };
    })();

    // shadow map
    var SHS = (el.clientWidth || 400) < 600 ? 1024 : 2048, shOn = false, fbo = null, shTex = null;
    try {
      shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHS, SHS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHS, SHS);
      fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      shOn = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } catch (e) { shOn = false; }
    var sc0 = [0, 1, 0];
    var LVP = mul(ortho(-4.6, 4.6, -4.2, 4.2, 0.5, 16), lookAt([sc0[0] - LD[0] * 8, sc0[1] - LD[1] * 8, sc0[2] - LD[2] * 8], sc0, [0, 1, 0]));

    // ---------- Sherlock ----------
    var guy = { x: 1.55, z: -1.5, yaw: -0.4, speed: 0 };
    var st = {};
    PARAMS.forEach(function (k) { st[k] = { x: POSES.idle[k], v: 0 }; });
    var moodName = 'idle', gesture = null, talking = false;
    var mouth = { x: 0, v: 0 }, nodS = { x: 0, v: 0 }, walkAmt = { x: 0, v: 0 }, phase = 0, headYaw = { x: 0, v: 0 }, headPit = { x: 0, v: 0 };
    var armUp = { x: 0, v: 0 };
    var dyn = [];
    function dput(meshKey, m, mat, clue) { dyn.push({ mesh: mesh(meshKey), m: m, nm: normalMat(m), mat: mat, cast: true, clue: clue || null }); }

    function drawSherlock(t, blink, mOpen) {
      var amp = reduced ? 0 : 1;
      var w = walkAmt.x, sp = Math.sin(phase), cp = Math.cos(phase);
      var bob = Math.abs(Math.sin(phase)) * 0.025 * w + Math.sin(t * 1.9) * 0.004 * amp;
      var root0 = chain(T(guy.x, bob, guy.z), RY(guy.yaw));
      // legs
      [[1, 0], [-1, Math.PI]].forEach(function (L) {
        var a = Math.sin(phase + L[1]) * 0.5 * w, knee = Math.max(0, -Math.sin(phase + L[1] + 0.9)) * 0.75 * w + 0.03;
        var hip = chain(root0, T(L[0] * 0.09, 0.92, 0), RX(a));
        dput('cyl:0.07:0.058:12', chain(hip, T(0, -0.47, 0), S(1, 0.47, 1)), MAT.trousers);
        var kn = chain(hip, T(0, -0.46, 0), RX(knee));
        dput('cyl:0.055:0.046:12', chain(kn, T(0, -0.43, 0), S(1, 0.43, 1)), MAT.trousers);
        dput('box', chain(kn, T(0, -0.45, 0.04), RX(-knee - a), S(0.095, 0.06, 0.25)), MAT.shoe);
      });
      // upper body pivots at the hips (lean, sway, breathing)
      var lean = st.lean.x + nodS.x * 0.002;
      var shake = st.shake.x * Math.sin(t * 19) * 0.05 * amp;
      var body = chain(root0, T(0, 0.92, 0), RX(lean + w * 0.06), RZ(Math.sin(phase) * 0.03 * w + Math.sin(t * 0.55) * 0.012 * amp), T(0, -0.92, 0));
      var breath = 1 + Math.sin(t * 1.9) * 0.012 * amp;
      // long coat skirt, torso, Inverness cape, collar, tie
      dput('cyl:0.2:0.27:22', chain(body, T(0, 0.42, 0), S(1, 0.6, 0.78)), MAT.coat);
      dput('cyl:0.215:0.2:22', chain(body, T(0, 0.98, 0), S(1, 0.52 * breath, 0.72)), MAT.coat);
      dput('cyl:0.16:0.31:22', chain(body, T(0, 1.15, 0), S(1, 0.36, 0.8)), MAT.tweed);
      dput('cyl:0.1:0.165:18', chain(body, T(0, 1.47, 0), S(1, 0.06, 0.8)), MAT.tweed);
      dput('cyl:0.05:0.055:12', chain(body, T(0, 1.5, 0), S(1, 0.09, 1)), MAT.skin);
      dput('box', chain(body, T(0, 1.47, 0.115), RX(-0.25), S(0.07, 0.07, 0.03)), MAT.shirt);
      dput('box', chain(body, T(0, 1.43, 0.13), RX(-0.2), S(0.035, 0.07, 0.02)), MAT.tie);
      for (var bt = 0; bt < 3; bt++) dput('sph:8:6', chain(body, T(0, 1.05 + bt * 0.11, 0.165), S(0.012)), MAT.soot);
      // arms
      var gst = talking ? Math.sin(t * 4.1) * 0.12 * amp : 0;
      var swing = Math.sin(phase) * 0.45 * w;
      [[1, 'L'], [-1, 'R']].forEach(function (A) {
        var s = A[0], k = A[1];
        var wp = 1 - w * 0.75;
        var p = st['a' + k + 'p'].x * wp + (s > 0 ? -swing : swing) * w + (k === 'R' ? gst : gst * 0.4) + (k === 'R' ? shake * 3 : 0);
        var r = st['a' + k + 'r'].x * wp + 0.1 * (1 - wp), e = st['a' + k + 'e'].x * wp - 0.25 * (1 - wp);
        var sh = chain(body, T(s * 0.215, 1.44, 0), RX(p), RZ(s * r));
        dput('sph:12:8', chain(sh, S(0.075, 0.07, 0.075)), MAT.tweed);
        dput('cyl:0.06:0.052:12', chain(sh, T(0, -0.3, 0), S(1, 0.3, 1)), MAT.coat);
        var el = chain(sh, T(0, -0.3, 0), RX(e));
        dput('cyl:0.052:0.045:12', chain(el, T(0, -0.27, 0), S(1, 0.27, 1)), MAT.coat);
        dput('cyl:0.05:0.05:12', chain(el, T(0, -0.29, 0), S(1, 0.03, 1)), MAT.shirt);
        dput('sph:12:8', chain(el, T(0, -0.34, 0.005), S(0.042, 0.055, 0.03)), MAT.skin);
        dput('sph:8:6', chain(el, T(0, -0.37, 0.025), S(0.016, 0.03, 0.016)), MAT.skin);
      });
      // head: looks at you (or the clue) within neck limits, plus mood tilt and nod
      var head = chain(body, T(0, 1.6, 0.01), RY(headYaw.x), RX(headPit.x + st.hPitch.x + nodS.x * 0.004), RZ(st.hRoll.x + Math.sin(t * 0.9) * 0.02 * amp), T(0, 0.1, 0));
      dput('sph:24:18', chain(head, S(0.1, 0.13, 0.112)), MAT.skin);
      dput('sph:14:10', chain(head, T(0, -0.085, 0.035), S(0.068, 0.05, 0.075)), MAT.skin);
      dput('sph:20:14', chain(head, T(0, 0.03, -0.04), S(0.104, 0.11, 0.1)), MAT.hair);
      [1, -1].forEach(function (s) { dput('sph:10:8', chain(head, T(s * 0.1, -0.005, -0.005), S(0.018, 0.032, 0.022)), MAT.skin); });
      // deerstalker
      var hat = chain(head, T(0, 0.04, 0), RX(-0.08));
      dput('hemi:22', chain(hat, S(0.118, 0.11, 0.126)), MAT.tweed);
      dput('sph:18:10', chain(hat, T(0, 0.005, 0.12), RX(0.25), S(0.09, 0.012, 0.075)), MAT.tweed);
      dput('sph:18:10', chain(hat, T(0, 0.005, -0.12), RX(-0.25), S(0.09, 0.012, 0.075)), MAT.tweed);
      dput('cyl:0.121:0.121:22', chain(hat, T(0, -0.005, 0), S(1, 0.02, 1.06)), MAT.coat);
      dput('sph:8:6', chain(hat, T(0, 0.112, 0), S(0.014)), MAT.coat);
      [1, -1].forEach(function (s) { dput('box', chain(hat, T(s * 0.105, 0.07, 0), RZ(s * 0.55), S(0.012, 0.06, 0.08)), MAT.tweed); });
      // face
      var eo = clamp(st.eyeOpen.x * blink, 0.06, 1.4);
      var lk = Math.sin(t * 0.7) * 0.004 * amp;
      [1, -1].forEach(function (s) {
        dput('sph:12:10', chain(head, T(s * 0.038, 0.012, 0.099), S(0.021, 0.015 * eo, 0.011)), MAT.eyeW);
        dput('sph:10:8', chain(head, T(s * 0.036 + lk, 0.011, 0.108), S(0.0105, 0.0105 * Math.min(eo, 1), 0.004)), MAT.iris);
        dput('box', chain(head, T(s * 0.04, 0.038 + st.brow.x + s * st.browD.x * 0.5, 0.1), RZ(s * st.browA.x), S(0.05, 0.009, 0.012)), MAT.hair);
      });
      dput('sph:12:10', chain(head, T(0, -0.005, 0.11), RX(0.25), S(0.016, 0.04, 0.024)), MAT.skin);
      var sm = clamp(st.smile.x, -1, 1), open = clamp(st.jaw.x + mOpen, 0, 1);
      dput('sph:14:10', chain(head, T(0, -0.068 - open * 0.006, 0.097), S(0.026 + Math.max(sm, 0) * 0.006, 0.004 + open * 0.02, 0.012)), MAT.soot);
      [1, -1].forEach(function (s) { dput('sph:10:8', chain(head, T(s * 0.02, -0.066 + sm * 0.006, 0.098), RZ(s * sm * 0.5), S(0.017, 0.0045, 0.011)), MAT.lip); });
    }

    function drawMyArm(camWorld, t) {
      var u = armUp.x;
      if (u < 0.01) return;
      var amp = reduced ? 0 : 1;
      var base = chain(camWorld, T(0.3, -0.5 + u * 0.3 + Math.sin(t * 1.6) * 0.006 * amp, -0.55), RY(-0.45), RZ(Math.PI / 2 - 0.22 - (1 - u) * 0.4));
      dput('cyl:0.046:0.055:18', chain(base, S(1, 0.44, 1)), MAT.sleeve);
      dput('cyl:0.047:0.047:18', chain(base, T(0, 0.42, 0), S(1, 0.035, 1)), MAT.shirt);
      dput('sph:12:10', chain(base, T(0, 0.5, 0.005), S(0.042, 0.06, 0.03)), MAT.myskin);
      dput('sph:8:6', chain(base, T(0.02, 0.555, 0.01), S(0.014, 0.03, 0.014)), MAT.myskin);
      dput('sph:12:8', chain(base, T(0, 0.24, 0.046), S(0.024, 0.02, 0.008)), MAT.pink, 'sleeve');
      dput('sph:8:6', chain(base, T(0.012, 0.275, 0.047), S(0.011, 0.009, 0.006)), MAT.pink, 'sleeve');
    }

    // ---------- camera & interaction ----------
    var shotName = 'door', shot = SHOTS.door;
    var cam = [{ x: 0.6, v: 0 }, { x: 1.9, v: 0 }, { x: 2.35, v: 0 }], look = [{ x: 0.3, v: 0 }, { x: 1.5, v: 0 }, { x: -1.2, v: 0 }];
    var yawOff = { x: 0, v: 0 }, pitOff = { x: 0, v: 0 }, drag = null, dragYaw = 0, dragPit = 0, lastDrag = -10;
    function onDown(e) { drag = { x: e.clientX, y: e.clientY, yaw: dragYaw, pit: dragPit }; if (hint) hint.classList.add('gone'); }
    function onMove(e) {
      if (!drag) return;
      dragYaw = clamp(drag.yaw - (e.clientX - drag.x) * 0.006, -0.9, 0.9);
      dragPit = clamp(drag.pit - (e.clientY - drag.y) * 0.004, -0.35, 0.35);
      lastDrag = tNow;
    }
    function onUp() { drag = null; lastDrag = tNow; }
    canvas.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    var lost = false;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; });

    // ---------- render loop ----------
    var tNow = 0, last = 0, raf = 0, alive = true, nextBlink = 2, blinkT = -1;
    function setUniformsFor(it, u, extraEm) {
      gl.uniformMatrix4fv(u.uM, false, it.m);
      gl.uniformMatrix3fv(u.uNM, false, it.nm);
      var m = it.mat;
      gl.uniform3fv(u.uC, m.c); gl.uniform3fv(u.uC2, m.c2); gl.uniform1f(u.uPat, m.pat); gl.uniform1f(u.uSpec, m.spec);
      var em = m.em;
      if (extraEm) em = [em[0] + extraEm[0], em[1] + extraEm[1], em[2] + extraEm[2]];
      gl.uniform3fv(u.uEm, em);
      if (m.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texs[m.tex]); gl.uniform1f(u.uUseTex, 1); } else gl.uniform1f(u.uUseTex, 0);
    }
    function bindMesh(ms) {
      gl.bindBuffer(gl.ARRAY_BUFFER, ms.vb);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ms.ib);
    }
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);

    var eye = [0, 1.6, 2], tg = [0, 1.4, 0], VP = ident(), slowT = 0, dprCap = 2, blinkNow = 1;
    function frame(now) {
      if (!alive) return;
      raf = root.requestAnimationFrame(frame);
      if (lost) return;
      var real = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      // adaptive quality: drop the pixel ratio if the device is struggling
      if (real > 0.045 && real < 1) { slowT += real; if (slowT > 2 && dprCap > 1) { dprCap = 1; slowT = 0; } } else slowT = Math.max(0, slowT - real);
      update(Math.min(real, 0.1));
      render();
    }
    function update(dt) {
      tNow += dt;
      var t = tNow, amp = reduced ? 0 : 1;

      // blink
      if (t > nextBlink) { blinkT = 0; nextBlink = t + 2.2 + Math.random() * 2.8; }
      var blink = 1;
      if (blinkT >= 0) { blinkT += dt; var bp = blinkT / 0.14; if (bp >= 1) blinkT = -1; else blink = Math.abs(1 - 2 * bp) * 0.94 + 0.06; }

      // camera springs
      var cw0 = reduced ? 30 : 2.1;
      for (var i = 0; i < 3; i++) { spring(cam[i], shot.cam[i], dt, cw0); spring(look[i], shot.look[i], dt, cw0 * 1.15); }
      if (!drag && t - lastDrag > 2.2) { dragYaw *= Math.max(0, 1 - dt * 1.5); dragPit *= Math.max(0, 1 - dt * 1.5); }
      spring(yawOff, dragYaw, dt, 9); spring(pitOff, dragPit, dt, 9);
      eye = [cam[0].x + Math.sin(t * 0.37) * 0.012 * amp, cam[1].x + Math.sin(t * 0.53) * 0.008 * amp, cam[2].x];
      tg = [look[0].x, look[1].x, look[2].x];
      var dv = sub(tg, eye), dist = Math.hypot(dv[0], dv[1], dv[2]);
      var yaw0 = Math.atan2(dv[0], -dv[2]) + yawOff.x, pit0 = Math.asin(clamp(dv[1] / dist, -1, 1)) + pitOff.x;
      tg = [eye[0] + Math.sin(yaw0) * Math.cos(pit0) * dist, eye[1] + Math.sin(pit0) * dist, eye[2] - Math.cos(yaw0) * Math.cos(pit0) * dist];

      // Sherlock: walk to his mark, face you or the clue, head tracks your eyes
      var faceYaw = null, fp = shot.face;
      if (fp === 'cam') faceYaw = Math.atan2(eye[0] - guy.x, eye[2] - guy.z);
      else if (fp) faceYaw = Math.atan2(fp[0] - guy.x, fp[2] - guy.z);
      var wp = route(guy.x, guy.z, shot.at[0], shot.at[1], OBST);
      var walking = walkStep(guy, wp[0], wp[1], faceYaw, dt) || wp[0] !== shot.at[0] || wp[1] !== shot.at[1];
      spring(walkAmt, walking ? clamp(guy.speed / 1.1, 0, 1) : 0, dt, 8);
      phase += dt * (2.2 + guy.speed * 5.2) * (walkAmt.x > 0.02 ? 1 : 0);
      var pz = POSES[(walking ? null : gesture) || moodName] || POSES.idle;
      var w = reduced ? 40 : 11;
      PARAMS.forEach(function (k) { spring(st[k], pz[k], dt, k === 'eyeOpen' || k === 'smile' || k === 'jaw' ? w * 1.6 : w); });
      var headWorld = [guy.x, 1.72, guy.z];
      var toEye = sub(eye, headWorld);
      var hy = angDiff(guy.yaw, Math.atan2(toEye[0], toEye[2]));
      var hp = -Math.atan2(toEye[1], Math.hypot(toEye[0], toEye[2]));
      spring(headYaw, Math.abs(hy) < 1.9 ? clamp(hy, -0.95, 0.95) : 0, dt, 7);
      spring(headPit, clamp(hp, -0.5, 0.45), dt, 7);
      var mo = talking ? (0.55 * Math.abs(Math.sin(t * 10.5)) + 0.45 * Math.abs(Math.sin(t * 6.7 + 1.3))) * (0.4 + 0.6 * Math.abs(Math.sin(t * 2.3 + 0.4))) : 0;
      spring(mouth, mo, dt, 34);
      spring(nodS, 0, dt, 16, 0.32);
      spring(armUp, shot.arm ? 1 : 0, dt, reduced ? 30 : 5);
      blinkNow = blink;
    }
    function render() {
      var t = tNow, amp = reduced ? 0 : 1;
      var dpr = Math.min(root.devicePixelRatio || 1, dprCap);
      var cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
      var cap = 1800000 / (cw * ch); if (cap < 1) { cw = Math.round(cw * Math.sqrt(cap)); ch = Math.round(ch * Math.sqrt(cap)); }
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      VP = mul(persp(0.9, canvas.width / canvas.height, 0.04, 30), lookAt(eye, tg, [0, 1, 0]));
      var blink = blinkNow;
      dyn = [];
      drawSherlock(t, blink, clamp(mouth.x, 0, 1));
      var camWorld = (function () { var z = norm(sub(eye, tg)), x = norm(cross([0, 1, 0], z)), y = cross(z, x); var o = ident(); o[0] = x[0]; o[1] = x[1]; o[2] = x[2]; o[4] = y[0]; o[5] = y[1]; o[6] = y[2]; o[8] = z[0]; o[9] = z[1]; o[10] = z[2]; o[12] = eye[0]; o[13] = eye[1]; o[14] = eye[2]; return o; })();
      drawMyArm(camWorld, t);

      // fire flicker
      var fl = reduced ? 1 : 0.8 + 0.2 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1) + 0.1 * Math.sin(t * 23.0);
      flames.forEach(function (f, k) {
        var s = 1 + (reduced ? 0 : 0.25 * Math.sin(t * (7 + k * 1.7) + k));
        f.m = chain(T(2.78, 0.1, -0.5 + [-0.18, 0, 0.17, -0.07, 0.09][k]), S(0.07, 0.22 * [0.7, 1, 0.8, 0.6, 0.55][k] * s, 0.07));
      });

      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      var all = items.concat(dyn);

      // 1) shadow pass
      if (shOn) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, SHS, SHS);
        gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(dprog.p);
        gl.uniformMatrix4fv(dprog.u.uLVP, false, LVP);
        for (var a = 0; a < all.length; a++) {
          if (!all[a].cast) continue;
          bindMesh(all[a].mesh);
          gl.uniformMatrix4fv(dprog.u.uM, false, all[a].m);
          gl.drawElements(gl.TRIANGLES, all[a].mesh.n, gl.UNSIGNED_SHORT, 0);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      // 2) main pass
      gl.viewport(0, 0, canvas.width, canvas.height);
      var fog = hex('#2a2622', 0.6);
      gl.clearColor(0.1, 0.09, 0.08, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var u = prog.u;
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniformMatrix4fv(u.uLVP, false, LVP);
      gl.uniform3fv(u.uLD, LD); gl.uniform3fv(u.uKey, hex('#fff1dc', 3.1));
      gl.uniform3fv(u.uSky, hex('#a8b4c4', 0.42)); gl.uniform3fv(u.uGnd, hex('#7a5a40', 0.22));
      gl.uniform3fv(u.uLamp, [0, 1.85, -0.3]); gl.uniform3fv(u.uLampC, hex('#ffcf8a', 1.35));
      gl.uniform3fv(u.uFire, [2.55, 0.5, -0.5]); gl.uniform3fv(u.uFireC, hex('#ff8a3a', 1.6 * fl));
      gl.uniform3fv(u.uEye, eye); gl.uniform3fv(u.uFog, fog); gl.uniform1f(u.uFogD, 0.035);
      gl.uniform1f(u.uTime, t); gl.uniform1f(u.uAlpha, 1);
      gl.uniform1f(u.uShOn, shOn ? 1 : 0); gl.uniform1f(u.uShTx, 1 / SHS);
      gl.uniform1i(u.uTex, 0); gl.uniform1i(u.uSh, 1);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shOn ? shTex : null);
      var glow = 0.5 + 0.5 * Math.sin(t * 3.4), clueEm = [0.5 * glow * 0.55, 0.42 * glow * 0.55, 0.15 * glow * 0.55];
      for (var b = 0; b < all.length; b++) {
        var it = all[b];
        bindMesh(it.mesh);
        setUniformsFor(it, u, it.clue && it.clue === shot.clue ? clueEm : null);
        gl.drawElements(gl.TRIANGLES, it.mesh.n, gl.UNSIGNED_SHORT, 0);
      }

      // 3) light beam + dust (additive)
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      bindMesh(beamMesh);
      gl.uniformMatrix4fv(u.uM, false, ident()); gl.uniformMatrix3fv(u.uNM, false, normalMat(ident()));
      gl.uniform1f(u.uPat, 7); gl.uniform1f(u.uUseTex, 0); gl.uniform3fv(u.uEm, hex('#fff0d0', 0.07));
      gl.drawElements(gl.TRIANGLES, beamMesh.n, gl.UNSIGNED_SHORT, 0);
      gl.useProgram(pprog.p);
      gl.uniformMatrix4fv(pprog.u.uVP, false, VP); gl.uniform1f(pprog.u.uT, reduced ? 0 : t); gl.uniform1f(pprog.u.uPx, canvas.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, dust.vb);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      gl.drawArrays(gl.POINTS, 0, dust.n);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    raf = root.requestAnimationFrame(frame);

    var api = {
      kind: '3d',
      setMood: function (name) { moodName = POSES[name] ? name : 'idle'; },
      speaking: function (on) { talking = !!on; },
      nod: function () { nodS.v += 160; },
      shot: function (name) {
        if (!SHOTS[name]) return;
        shotName = name; shot = SHOTS[name]; gesture = shot.gesture || null;
        dragYaw = 0; dragPit = 0;
      },
      // test hook: run the simulation forward without drawing (headless browsers render slowly)
      _advance: function (sec) { for (var k = 0; k < Math.round(sec * 30); k++) update(1 / 30); },
      current: function () { return { shot: shotName, x: guy.x, z: guy.z, walking: guy.speed > 0.05, shadows: shOn }; },
      destroy: function () {
        alive = false;
        if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
        canvas.removeEventListener('pointerdown', onDown);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerup', onUp);
        root.removeEventListener('pointercancel', onUp);
        try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {}
      }
    };
    return api;
  }

  var api = {
    supported: supported, mount: mount, route: route, OBST: OBST, POSES: POSES, PARAMS: PARAMS, SHOTS: SHOTS, walkStep: walkStep, spring: spring, angDiff: angDiff,
    M: { ident: ident, mul: mul, T: T, S: S, RX: RX, RY: RY, RZ: RZ, persp: persp, ortho: ortho, lookAt: lookAt, apply: apply, normalMat: normalMat }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Stage3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
