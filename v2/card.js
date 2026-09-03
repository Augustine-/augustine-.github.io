/*
 * augustine.io/v2 — the card is real.
 *
 * No dependencies. Three tiny WebGL2 passes:
 *   - one per card face: paper grain, letterpress-debossed type, holographic
 *     foil, all lit by a point light that sits wherever the cursor is;
 *   - one for the table: the lamp's pool of light and the card's shadow.
 *
 * The type is drawn to a 2D canvas from the DOM's own layout, so the
 * transparent DOM text on top lines up with what the shader renders. That
 * keeps the links real: clickable, focusable, readable by screen readers.
 *
 * Coordinates follow CSS: x right, y down, z toward the viewer. Card-space
 * units are card widths, origin at the card's centre.
 */
(function () {
  'use strict';

  var html = document.documentElement;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hoverable = matchMedia('(hover: hover)').matches;
  var card = document.getElementById('card');
  var scene = card.parentElement;
  var faceEls = { front: card.querySelector('.face.front'), back: card.querySelector('.face.back') };
  var tableCanvas = document.querySelector('canvas.table');
  var hint = document.querySelector('.hint');
  var toggle = document.querySelector('.theme-toggle');
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var THEME_KEY = 'augustine-io-theme';
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var DEG = Math.PI / 180;
  var IDLE_MS = 4000;

  // Room presets. Colours are linear-ish display values; tuned by eye.
  var THEMES = {
    dark: {
      bg: '#141210',
      table: [0.30, 0.27, 0.23], tableAmb: 0.08, tablePow: 1.2, shadow: 0.28,
      lightCol: [1.0, 0.95, 0.86],
      paper: [0.925, 0.900, 0.845], ink: [0.12, 0.11, 0.09], cardAmb: 0.24, cardPow: 1.25
    },
    light: {
      bg: '#d8d5ce',
      table: [0.846, 0.835, 0.808], tableAmb: 0.86, tablePow: 0.32, shadow: 0.58,
      lightCol: [1.0, 0.97, 0.90],
      paper: [0.985, 0.980, 0.968], ink: [0.11, 0.10, 0.09], cardAmb: 0.82, cardPow: 0.42
    }
  };

  var S = {
    W: 0, H: 0, cx: 0, cy: 0, persp: 1400,
    lightH: 0, cardH: 0,
    light: { x: 0, y: 0, tx: 0, ty: 0 },
    pointer: { x: 0, y: 0, has: false, t: -1e9, down: false },
    orient: null,
    tilt: { x: 0, y: 0, vx: 0, vy: 0 },
    flip: { a: 0, v: 0, target: 0, dragging: false },
    hot: { face: null, rect: [0, 0, 0, 0], amt: 0, target: 0 },
    intro: { t0: 0, active: false },
    side: 0,
    theme: html.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    gl: false
  };

  /* ------------------------------------------------------------------ */
  /* shaders                                                             */
  /* ------------------------------------------------------------------ */

  var VS = '#version 300 es\n' +
    'in vec2 aPos; out vec2 vUv;\n' +
    'void main(){ vUv = vec2(aPos.x, -aPos.y) * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';

  var NOISE = [
    'float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }'
  ].join('\n');

  // Card face. Texture channels: R ink coverage, G foil coverage, B blurred height.
  var FACE_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; out vec4 fragColor;',
    'uniform sampler2D uTex; uniform vec2 uTexel; uniform float uAspect;',
    'uniform vec3 uLight; uniform vec3 uView;',
    'uniform float uTime; uniform float uAmbient; uniform float uPower; uniform float uSpin;',
    'uniform vec3 uPaper; uniform vec3 uInk; uniform vec3 uLightCol;',
    'uniform vec4 uHot; uniform float uHotAmt;',
    NOISE,
    'vec3 spectrum(float t){ return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }',
    'void main(){',
    '  vec4 s = texture(uTex, vUv);',
    '  float ink = s.r, foil = s.g;',
    '  vec2 pix = vUv / uTexel;',
    '  float inHot = step(uHot.x, vUv.x) * step(vUv.x, uHot.x + uHot.z) * step(uHot.y, vUv.y) * step(vUv.y, uHot.y + uHot.w) * uHotAmt;',
    '  ink = min(1.0, ink * (1.0 + 0.7 * inHot));',
    // letterpress: the type is pressed into the paper, so the normal tilts at glyph edges
    '  float hl = texture(uTex, vUv - vec2(uTexel.x, 0.0)).b, hr = texture(uTex, vUv + vec2(uTexel.x, 0.0)).b;',
    '  float hu = texture(uTex, vUv - vec2(0.0, uTexel.y)).b, hd = texture(uTex, vUv + vec2(0.0, uTexel.y)).b;',
    '  vec2 dcov = vec2(hr - hl, hd - hu);',
    // paper: fine grain plus a faint fibre direction
    '  float g1 = vnoise(pix * 0.55) - 0.5;',
    '  float g2 = vnoise(pix * 0.13 + 7.0) - 0.5;',
    '  float fib = vnoise(vec2(pix.x * 0.08, pix.y * 1.3) + 3.0) - 0.5;',
    '  vec2 gN = (vec2(g1, fib) * 0.05 + vec2(g2) * 0.02) * (1.0 - foil * 0.85);',
    '  vec3 N = normalize(vec3(dcov * 3.2 + gN, 1.0));',
    '  vec3 P = vec3(vUv.x - 0.5, (vUv.y - 0.5) * uAspect, 0.0);',
    '  vec3 Lv = uLight - P; float dist = length(Lv); vec3 L = Lv / dist;',
    '  vec3 V = normalize(uView - P);',
    '  vec3 H = normalize(L + V);',
    '  float att = uPower / (0.35 + dist * dist * 2.2);',
    '  float ndl = max(dot(N, L), 0.0);',
    '  float ndh = max(dot(N, H), 0.0);',
    '  vec3 paper = uPaper * (1.0 + g1 * 0.045 + g2 * 0.025);',
    '  vec3 base = mix(paper, uInk, ink);',
    '  float cavity = 1.0 - s.b * 0.22 * (1.0 - foil);',
    '  vec3 col = base * cavity * (uAmbient + ndl * att * uLightCol);',
    '  col += uLightCol * pow(ndh, 28.0) * att * mix(0.10, 0.03, ink);',
    // holographic foil: a diffraction grating, so the hue depends on the half-vector
    '  if (foil > 0.002) {',
    '    vec2 gdir = vec2(cos(uSpin), sin(uSpin));',
    '    float phase = dot(H.xy, gdir) * 2.6 + dot(vUv, vec2(1.7, 0.9)) * 2.4 + uTime * 0.03;',
    '    float phase2 = dot(H.xy, vec2(-gdir.y, gdir.x)) * 5.0 + vnoise(pix * 0.02) * 3.0;',
    '    vec3 rb = mix(spectrum(phase), spectrum(phase2), 0.35);',
    '    rb = mix(vec3(0.5), rb, 0.95);',
    '    float flash = pow(ndh, 3.0);',
    '    vec3 silver = vec3(0.55, 0.55, 0.60) * (uAmbient * 1.4 + ndl * att * 0.5);',
    '    vec3 fc = mix(silver, rb * (0.35 + 1.0 * att * ndl), 0.45 + 0.5 * flash);',
    '    fc += uLightCol * pow(ndh, 220.0) * att * 1.5;',
    '    fc *= 1.0 + 0.4 * inHot;',
    '    col = mix(col, fc, foil);',
    '  }',
    // a touch of darkening at the very edge of the stock
    '  vec2 e = min(vUv, 1.0 - vUv); float ed = smoothstep(0.0, 0.012, min(e.x, e.y / uAspect));',
    '  col *= 0.85 + 0.15 * ed;',
    '  col = min(col, 0.86) + (1.0 - exp(-max(col - 0.86, 0.0) * 2.5)) * 0.14;',
    '  fragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // Table: the lamp's pool of light and the card's soft shadow. Pixels are device px.
  var TABLE_FS = [
    '#version 300 es',
    'precision highp float;',
    'out vec4 fragColor;',
    'uniform vec2 uRes; uniform vec2 uLight; uniform float uLightH;',
    'uniform vec2 uCardC; uniform vec2 uCardHalf; uniform float uCardH; uniform float uFlipCos; uniform float uRadius;',
    'uniform vec3 uTable; uniform float uAmbient; uniform float uPower; uniform vec3 uLightCol; uniform float uShadow; uniform float uTime;',
    NOISE,
    'float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'void main(){',
    '  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  float sc = 1.0 / uRes.y;',
    '  vec3 d = vec3((p - uLight) * sc, uLightH * sc);',
    '  float lamp = uPower / (0.15 + dot(d, d) * 5.0);',
    '  float k = uCardH / max(uLightH - uCardH, 1.0);',
    '  vec2 shc = uCardC + (uCardC - uLight) * k;',
    '  vec2 shh = uCardHalf * (1.0 + k); shh.x *= max(abs(uFlipCos), 0.03);',
    '  float sd = sdRR(p - shc, shh, uRadius * (1.0 + k));',
    '  float pen = 8.0 + uCardH * 1.5;',
    '  float sha = mix(uShadow, 1.0, smoothstep(-pen * 0.3, pen, sd));',
    '  vec3 col = uTable * (uAmbient + lamp * uLightCol * sha);',
    '  vec2 q = p / uRes - 0.5; col *= 1.0 - dot(q, q) * 0.5;',
    '  col += (hash(p + fract(uTime)) - 0.5) * 0.012;',
    '  fragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ */
  /* WebGL plumbing                                                      */
  /* ------------------------------------------------------------------ */

  function Pass(canvas, fsSrc) {
    var gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (!gl) throw new Error('no webgl2');
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.gl = gl;
    this.prog = prog;
    this.vao = vao;
    this.locs = {};
  }
  Pass.prototype.u = function (name) {
    if (!(name in this.locs)) this.locs[name] = this.gl.getUniformLocation(this.prog, name);
    return this.locs[name];
  };
  Pass.prototype.set = function (name, v) {
    var gl = this.gl, l = this.u(name);
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
    else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
    else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
  };
  Pass.prototype.draw = function (w, h) {
    var gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /* ------------------------------------------------------------------ */
  /* card faces                                                          */
  /* ------------------------------------------------------------------ */

  // Layout position of `el` relative to `ancestor`, ignoring transforms.
  function rectIn(el, ancestor) {
    var x = 0, y = 0, n = el;
    while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }

  function clampi(i, n) { return i < 0 ? 0 : (i >= n ? n - 1 : i); }
  function boxBlurH(src, dst, w, h, r) {
    var div = 2 * r + 1;
    for (var y = 0; y < h; y++) {
      var row = y * w, sum = 0, k, x;
      for (k = -r; k <= r; k++) sum += src[row + clampi(k, w)];
      for (x = 0; x < w; x++) {
        dst[row + x] = sum / div;
        sum += src[row + clampi(x + r + 1, w)] - src[row + clampi(x - r, w)];
      }
    }
  }
  function boxBlurV(src, dst, w, h, r) {
    var div = 2 * r + 1;
    for (var x = 0; x < w; x++) {
      var sum = 0, k, y;
      for (k = -r; k <= r; k++) sum += src[clampi(k, h) * w + x];
      for (y = 0; y < h; y++) {
        dst[y * w + x] = sum / div;
        sum += src[clampi(y + r + 1, h) * w + x] - src[clampi(y - r, h) * w + x];
      }
    }
  }
  // Blurred coverage -> B channel. Three box passes approximate a gaussian.
  function heightMap(data, w, h, r) {
    var n = w * h, a = new Float32Array(n), b = new Float32Array(n), i;
    for (i = 0; i < n; i++) a[i] = Math.max(data[i * 4], data[i * 4 + 1] * 0.7) / 255;
    for (i = 0; i < 3; i++) { boxBlurH(a, b, w, h, r); boxBlurV(b, a, w, h, r); }
    for (i = 0; i < n; i++) data[i * 4 + 2] = Math.min(255, (a[i] * 255 + 0.5) | 0);
  }

  function Face(name, el, spin) {
    this.name = name;
    this.el = el;
    this.spin = spin;
    this.canvas = el.querySelector('canvas.paper');
    this.pass = new Pass(this.canvas, FACE_FS);
    var gl = this.pass.gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.off = document.createElement('canvas');
    this.octx = this.off.getContext('2d', { willReadFrequently: true });
    this.w = 0; this.h = 0;
  }
  Face.prototype.resize = function (W, H) {
    this.w = Math.max(2, Math.round(W * DPR));
    this.h = Math.max(2, Math.round(H * DPR));
    this.canvas.width = this.off.width = this.w;
    this.canvas.height = this.off.height = this.h;
    this.paint();
  };
  // Draw the DOM's type onto the offscreen canvas, at the DOM's own positions.
  Face.prototype.paint = function () {
    var ctx = this.octx, face = this.el, w = this.w, h = this.h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.scale(DPR, DPR);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var items = face.querySelectorAll('[data-t]');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (!el.offsetWidth) continue; // display:none
      var r = rectIn(el, face);
      var cs = getComputedStyle(el);
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      var foil = el.classList.contains('foil');
      var foilRule = el.classList.contains('foil-rule');
      var ink = foil ? 1 : parseFloat(el.getAttribute('data-ink') || '1');
      var text = el.textContent.trim();
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      var fs = parseFloat(cs.fontSize);
      ctx.fillStyle = foil ? 'rgb(0,255,0)' : 'rgb(' + Math.round(ink * 255) + ',0,0)';
      ctx.fillText(text, cx, cy);
      if (el.tagName === 'A' || foilRule) {
        var tw = ctx.measureText(text).width;
        var th = Math.max(1.5, fs * 0.075);
        var ty = Math.round((cy + fs * 0.55) * DPR) / DPR;
        ctx.fillStyle = foilRule ? 'rgb(0,255,0)' : 'rgb(' + Math.round(ink * 0.6 * 255) + ',0,0)';
        ctx.fillRect(cx - tw / 2, ty, tw, th);
      }
    }
    var img = ctx.getImageData(0, 0, w, h);
    heightMap(img.data, w, h, Math.max(1, Math.round(1.6 * DPR)));
    var gl = this.pass.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
    if (S.hot.el && S.hot.face === this) setHot(S.hot.el, this);
  };
  Face.prototype.render = function (light, view, T, time) {
    var p = this.pass, gl = p.gl;
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(p.u('uTex'), 0);
    p.set('uTexel', [1 / this.w, 1 / this.h]);
    p.set('uAspect', this.h / this.w);
    p.set('uLight', light);
    p.set('uView', view);
    p.set('uTime', time);
    p.set('uAmbient', T.cardAmb);
    p.set('uPower', T.cardPow);
    p.set('uSpin', this.spin);
    p.set('uPaper', T.paper);
    p.set('uInk', T.ink);
    p.set('uLightCol', T.lightCol);
    var hot = (S.hot.face === this) ? S.hot.rect : [0, 0, 0, 0];
    p.set('uHot', hot);
    p.set('uHotAmt', S.hot.amt);
    p.draw(this.w, this.h);
  };

  function Table(canvas) {
    this.canvas = canvas;
    this.pass = new Pass(canvas, TABLE_FS);
    this.w = 0; this.h = 0;
  }
  Table.prototype.resize = function () {
    this.w = Math.round(window.innerWidth * DPR);
    this.h = Math.round(window.innerHeight * DPR);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  };
  Table.prototype.render = function (T, time, flipCos, cardH) {
    var p = this.pass, gl = p.gl;
    var lifted = clamp((cardH - S.cardH) / (S.W * 0.08), 0, 1);
    gl.useProgram(p.prog);
    p.set('uRes', [this.w, this.h]);
    p.set('uLight', [S.light.x * DPR, S.light.y * DPR]);
    p.set('uLightH', S.lightH * DPR);
    p.set('uCardC', [S.cx * DPR, S.cy * DPR]);
    p.set('uCardHalf', [S.W / 2 * DPR, S.H / 2 * DPR]);
    p.set('uCardH', cardH * DPR);
    p.set('uFlipCos', flipCos);
    p.set('uRadius', S.W * 0.035 * DPR);
    p.set('uTable', T.table);
    p.set('uAmbient', T.tableAmb);
    p.set('uPower', T.tablePow);
    p.set('uLightCol', T.lightCol);
    p.set('uShadow', T.shadow + (1 - T.shadow) * 0.45 * lifted);
    p.set('uTime', reduced ? 0 : time);
    p.draw(this.w, this.h);
  };

  /* ------------------------------------------------------------------ */
  /* geometry                                                            */
  /* ------------------------------------------------------------------ */

  // CSS rotateX / rotateY, applied to a vector.
  function rotX(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]; }
  function rotY(v, a) { var c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function measure() {
    var r = scene.getBoundingClientRect();
    S.W = r.width; S.H = r.height;
    S.cx = r.left + r.width / 2;
    S.cy = r.top + r.height / 2;
    S.lightH = S.W * 0.55 + 40;              // the lamp hovers just above the card
    S.cardH = Math.max(18, S.W * 0.05);      // the card floats a little off the table
    S.persp = parseFloat(getComputedStyle(scene).perspective) || 1400;
  }

  /* ------------------------------------------------------------------ */
  /* state                                                               */
  /* ------------------------------------------------------------------ */

  var faces = null, table = null;

  function setHot(el, face) {
    var r = rectIn(el, face.el);
    var W = face.el.clientWidth, H = face.el.clientHeight;
    S.hot.el = el; S.hot.face = face;
    S.hot.rect = [(r.x - 4) / W, (r.y - 2) / H, (r.w + 8) / W, (r.h + 4) / H];
    S.hot.target = 1;
  }
  function clearHot() { S.hot.el = null; S.hot.target = 0; }

  function faceOf(el) {
    if (!faces) return null;
    return faceEls.front.contains(el) ? faces.front : faces.back;
  }

  function updateSide() {
    var side = ((Math.round(S.flip.a / 180) % 2) + 2) % 2;
    if (side === S.side) return;
    S.side = side;
    faceEls.front.toggleAttribute('inert', side === 1);
    faceEls.back.toggleAttribute('inert', side === 0);
  }

  function flipTo(target) {
    S.flip.target = target;
    if (reduced) { S.flip.a = target; S.flip.v = 0; }
  }

  function spring(pos, vel, target, k, damp, dt) {
    vel += (target - pos) * k * dt;
    vel *= Math.exp(-damp * dt);
    pos += vel * dt;
    return [pos, vel];
  }

  var lastT = 0, running = false;
  function frame(now) {
    if (!S.W) { running = false; lastT = 0; return; } // not laid out yet
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    var t = now / 1000;

    // --- where is the light? ---
    var tx, ty;
    if (S.intro.active) {
      var u = clamp((now - S.intro.t0) / 1700, 0, 1);
      var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      tx = S.cx + (-1.15 + 2.05 * e) * S.W;
      ty = S.cy + (0.35 - 0.7 * e) * S.H;
      if (u >= 1) S.intro.active = false;
    } else if (S.pointer.has && (hoverable || S.pointer.down) && (now - S.pointer.t < IDLE_MS || S.pointer.down)) {
      tx = S.pointer.x; ty = S.pointer.y;
    } else if (S.orient) {
      tx = S.cx + clamp(S.orient.gamma / 25, -1.6, 1.6) * S.W * 0.6;
      ty = S.cy + clamp((S.orient.beta - 40) / 25, -1.6, 1.6) * S.H * 0.6;
    } else if (reduced) {
      tx = S.cx - S.W * 0.35; ty = S.cy - S.H * 0.55;
    } else {
      tx = S.cx + Math.cos(t * 0.33) * S.W * 0.8;
      ty = S.cy + Math.sin(t * 0.26) * S.H * 0.75;
    }
    S.light.tx = tx; S.light.ty = ty;
    var k = reduced ? 1 : 1 - Math.exp(-dt * 12);
    S.light.x += (tx - S.light.x) * k;
    S.light.y += (ty - S.light.y) * k;

    // --- the card leans toward the light ---
    var nx = clamp((S.light.x - S.cx) / S.W, -1.2, 1.2);
    var ny = clamp((S.light.y - S.cy) / S.H, -1.2, 1.2);
    var MAX = 7;
    var ttx = -ny * MAX, tty = nx * MAX;
    if (reduced) { S.tilt.x = ttx; S.tilt.y = tty; }
    else {
      var r1 = spring(S.tilt.x, S.tilt.vx, ttx, 90, 9, dt); S.tilt.x = r1[0]; S.tilt.vx = r1[1];
      var r2 = spring(S.tilt.y, S.tilt.vy, tty, 90, 9, dt); S.tilt.y = r2[0]; S.tilt.vy = r2[1];
    }

    // --- flip ---
    if (!S.flip.dragging && !reduced) {
      var r3 = spring(S.flip.a, S.flip.v, S.flip.target, 60, 7.5, dt);
      S.flip.a = r3[0]; S.flip.v = r3[1];
      if (Math.abs(S.flip.a - S.flip.target) < 0.02 && Math.abs(S.flip.v) < 0.05) { S.flip.a = S.flip.target; S.flip.v = 0; }
    }
    updateSide();

    // --- hover glow ---
    S.hot.amt += (S.hot.target - S.hot.amt) * (reduced ? 1 : 1 - Math.exp(-dt * 14));

    card.style.transform = 'rotateX(' + S.tilt.x.toFixed(3) + 'deg) rotateY(' + (S.tilt.y + S.flip.a).toFixed(3) + 'deg)';
    card.classList.toggle('edge-on', Math.abs(Math.sin((S.tilt.y + S.flip.a) * DEG)) > 0.3);

    if (faces) render(t);

    var moving = S.intro.active || S.flip.dragging ||
      Math.abs(S.flip.a - S.flip.target) > 0.01 ||
      Math.abs(S.light.x - S.light.tx) + Math.abs(S.light.y - S.light.ty) > 0.3 ||
      Math.abs(S.hot.amt - S.hot.target) > 0.01 ||
      Math.abs(S.tilt.vx) + Math.abs(S.tilt.vy) > 0.01;
    var drifting = !reduced && faces; // the lamp wanders when idle, so keep the room alive
    if (moving || drifting) requestAnimationFrame(frame);
    else { running = false; lastT = 0; }
  }
  function wake() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function render(t) {
    var T = THEMES[S.theme];
    var ax = S.tilt.x * DEG, b = (S.tilt.y + S.flip.a) * DEG;
    var lift = S.cardH + Math.abs(Math.sin(S.flip.a * DEG)) * S.W * 0.08; // a card being flipped rises
    var lw = [(S.light.x - S.cx) / S.W, (S.light.y - S.cy) / S.W, (S.lightH - lift) / S.W];
    var vw = [0, 0, S.persp / S.W];
    var lc = rotY(rotX(lw, -ax), -b);
    var vc = rotY(rotX(vw, -ax), -b);
    var cb = Math.cos(b);
    if (cb > -0.05) faces.front.render(lc, vc, T, t);
    if (cb < 0.05) faces.back.render([-lc[0], lc[1], -lc[2]], [-vc[0], vc[1], -vc[2]], T, t);
    table.render(T, t, cb, lift);
  }

  /* ------------------------------------------------------------------ */
  /* input                                                               */
  /* ------------------------------------------------------------------ */

  function onPointerMove(e) {
    S.pointer.x = e.clientX; S.pointer.y = e.clientY;
    S.pointer.has = true; S.pointer.t = performance.now();
    wake();
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', function (e) { S.pointer.down = true; onPointerMove(e); }, { passive: true });
  window.addEventListener('pointerup', function () { S.pointer.down = false; wake(); }, { passive: true });
  window.addEventListener('pointercancel', function () { S.pointer.down = false; }, { passive: true });

  // Drag to flip. Pointer capture only once it's clearly a drag, so plain clicks still reach the links.
  var drag = null, suppressClick = false;
  card.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, a0: S.flip.a, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0 };
  });
  card.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      drag.moved = true;
      S.flip.dragging = true;
      card.classList.add('dragging');
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    }
    var now = performance.now(), dtm = Math.max(1, now - drag.lastT);
    drag.v = drag.v * 0.6 + ((e.clientX - drag.lastX) / dtm * 1000 / S.W * 180) * 0.4; // deg/s
    drag.lastX = e.clientX; drag.lastT = now;
    S.flip.a = drag.a0 + dx / S.W * 180;
    wake();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.moved) {
      S.flip.dragging = false;
      card.classList.remove('dragging');
      S.flip.v = drag.v;
      var guess = S.flip.a + S.flip.v * 0.12;
      flipTo(Math.round(guess / 180) * 180);
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      wake();
    }
    drag = null;
  }
  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);
  card.addEventListener('click', function (e) {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // The flip buttons.
  var flips = card.querySelectorAll('.flip');
  for (var f = 0; f < flips.length; f++) {
    flips[f].addEventListener('click', function () { flipTo(S.flip.target + 180); wake(); });
  }

  // Hover: the shader darkens the ink under the cursor.
  card.addEventListener('pointerover', function (e) {
    var el = e.target.closest ? e.target.closest('[data-t]') : null;
    if (!el || !(el.tagName === 'A' || el.tagName === 'BUTTON')) return;
    var face = faceOf(el);
    if (face) { setHot(el, face); wake(); }
  });
  card.addEventListener('pointerout', function (e) {
    var el = e.target.closest ? e.target.closest('[data-t]') : null;
    if (el && el === S.hot.el) { clearHot(); wake(); }
  });

  // Email: hover reveals the address, click copies it.
  var email = card.querySelector('.email');
  var address = email.getAttribute('data-email');
  var copied = false;
  function setEmailText(s) {
    if (email.textContent === s) return;
    email.textContent = s;
    if (faces) faces.front.paint();
    wake();
  }
  if (hoverable) {
    email.addEventListener('pointerenter', function () { if (!copied) setEmailText(address); });
    email.addEventListener('pointerleave', function () { if (!copied) setEmailText('email'); });
  }
  email.addEventListener('click', function (e) {
    if (!navigator.clipboard) return;
    e.preventDefault();
    navigator.clipboard.writeText(address).then(function () {
      copied = true;
      setEmailText('copied!');
      setTimeout(function () {
        copied = false;
        setEmailText(hoverable && email.matches(':hover') ? address : 'email');
      }, 1500);
    });
  });

  // Phones: tilting the device moves the light. iOS wants a gesture before it will say yes.
  function listenOrientation() {
    window.addEventListener('deviceorientation', function (e) {
      if (e.beta == null || e.gamma == null) return;
      S.orient = { beta: e.beta, gamma: e.gamma };
      wake();
    }, { passive: true });
  }
  if (!hoverable && typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      var asked = false;
      window.addEventListener('touchend', function ask() {
        if (asked) return;
        asked = true;
        DeviceOrientationEvent.requestPermission().then(function (s) { if (s === 'granted') listenOrientation(); }).catch(function () {});
        window.removeEventListener('touchend', ask);
      });
    } else {
      listenOrientation();
    }
  }

  // Room lights.
  function applyTheme(theme) {
    S.theme = theme;
    html.setAttribute('data-theme', theme);
    if (themeMeta) themeMeta.setAttribute('content', THEMES[theme].bg);
    try { localStorage.setItem(THEME_KEY, theme); } catch (err) {}
    wake();
  }
  toggle.addEventListener('click', function () { applyTheme(S.theme === 'dark' ? 'light' : 'dark'); });

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */

  function layout() {
    measure();
    if (faces) {
      faces.front.resize(S.W, S.H);
      faces.back.resize(S.W, S.H);
      table.resize();
    }
    wake();
  }

  function start() {
    try {
      faces = { front: new Face('front', faceEls.front, 0.6), back: new Face('back', faceEls.back, 2.3) };
      table = new Table(tableCanvas);
      html.classList.add('gl');
      S.gl = true;
    } catch (err) {
      faces = null; table = null;
      html.classList.remove('gl');
    }

    hint.textContent = !faces ? 'drag to flip' : (hoverable ? 'your cursor is a light · drag to flip' : 'tilt your phone · swipe to flip');

    layout();

    if (!reduced) {
      // Tossed onto the table: it lands with a wobble while the lamp sweeps across.
      S.intro.active = true;
      S.intro.t0 = performance.now();
      S.flip.a = -28; S.flip.v = 0;
      S.tilt.x = 9;
      S.light.x = S.cx - S.W * 1.15; S.light.y = S.cy + S.H * 0.35;
    } else {
      S.light.x = S.cx - S.W * 0.35; S.light.y = S.cy - S.H * 0.55;
    }
    card.classList.add('in');
    hint.classList.add('in');
    wake();

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(layout);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  }

  if (document.fonts && document.fonts.load) {
    document.fonts.load('16px MicroFLF').then(start, start);
  } else {
    start();
  }
})();
