/*
 * augustine.io/v2 — the card is real.
 *
 * No dependencies. Three tiny WebGL2 passes:
 *   - one per card face: bone paper with a watermark, letterpress type, a
 *     raised lacquered-black name, all lit by a point light at the cursor;
 *   - one for the tablecloth: the lamp's pool of light and the card's shadow.
 *
 * The type is drawn to a 2D canvas from the DOM's own layout, so the
 * transparent DOM text on top lines up with what the shader renders. That
 * keeps the links real: clickable, focusable, readable by screen readers.
 *
 * Orientation is a rotation matrix, so the card flips about either axis and
 * the face on show is always upright. Coordinates follow CSS: x right,
 * y down, z toward the viewer. Card-space units are card widths.
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

  // Room presets. Colours are display values, tuned by eye.
  var THEMES = {
    dark: {
      bg: '#0a0a0b',
      table: [0.105, 0.105, 0.11], tableAmb: 0.10, tablePow: 1.0, shadow: 0.35, weave: 0.16, fuzz: 0.10, vignette: 0.55,
      lightCol: [1.0, 0.98, 0.94],
      paper: [0.92, 0.905, 0.865], ink: [0.13, 0.12, 0.11], cardAmb: 0.24, cardPow: 1.25
    },
    light: {
      bg: '#d9d7d1',
      table: [0.875, 0.87, 0.855], tableAmb: 0.84, tablePow: 0.26, shadow: 0.62, weave: 0.045, fuzz: 0.035, vignette: 0.26,
      lightCol: [1.0, 0.99, 0.96],
      paper: [0.975, 0.97, 0.955], ink: [0.12, 0.11, 0.10], cardAmb: 0.82, cardPow: 0.42
    }
  };

  /* ------------------------------------------------------------------ */
  /* small matrices (row-major 3x3, CSS handedness)                      */
  /* ------------------------------------------------------------------ */

  var ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  var RX180 = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  var RY180 = [-1, 0, 0, 0, 1, 0, 0, 0, -1];
  function mmul(A, B) {
    var r = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
    return r;
  }
  function mvec(A, v) {
    return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
  }
  function mT(A) { return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]; }
  function msnap(A) { return A.map(function (n) { return Math.round(n); }); }
  function rotXm(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotYm(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function css3d(A) {
    var m = [A[0], A[3], A[6], 0, A[1], A[4], A[7], 0, A[2], A[5], A[8], 0, 0, 0, 0, 1];
    return 'matrix3d(' + m.map(function (n) { return +n.toFixed(5); }).join(',') + ')';
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var S = {
    W: 0, H: 0, cx: 0, cy: 0, persp: 1400,
    lightH: 0, cardH: 0,
    light: { x: 0, y: 0, tx: 0, ty: 0 },
    pointer: { x: 0, y: 0, has: false, t: -1e9, down: false },
    orient: null,
    tilt: { x: 0, y: 0, vx: 0, vy: 0 },
    // q: settled orientation (identity or RY180). During a flip the card is R_axis(a) * q.
    // F / B: each face's own transform, chosen so the face on show reads upright.
    flip: { q: ID, F: ID, B: RY180, axis: 'y', a: 0, v: 0, target: 0, dragging: false },
    hot: { el: null, face: null, rect: [0, 0, 0, 0], amt: 0, target: 0 },
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

  // Card face. Texture channels: R ink coverage, G gloss (raised, lacquered ink),
  // B height (0.5 is flat; raised type above, pressed type below), A watermark.
  // The canvas is transparent: the shader draws the card's own antialiased silhouette.
  var FACE_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; out vec4 fragColor;',
    'uniform sampler2D uTex; uniform vec2 uTexel; uniform float uAspect; uniform vec2 uSize; uniform float uRadius;',
    'uniform vec3 uLight; uniform vec3 uView;',
    'uniform float uTime; uniform float uAmbient; uniform float uPower;',
    'uniform vec3 uPaper; uniform vec3 uInk; uniform vec3 uLightCol;',
    'uniform vec4 uHot; uniform float uHotAmt;',
    NOISE,
    'float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'void main(){',
    // silhouette: a rounded rectangle inset one pixel, with a soft one-pixel edge
    '  vec2 ppx = (vUv - 0.5) * uSize;',
    '  float sd = sdRR(ppx, uSize * 0.5 - 1.0, uRadius);',
    '  float alpha = 1.0 - smoothstep(-0.75, 0.75, sd);',
    '  if (alpha <= 0.001) { fragColor = vec4(0.0); return; }',
    '  vec4 s = texture(uTex, vUv);',
    '  float ink = s.r, gloss = s.g, wm = s.a;',
    '  vec2 pix = vUv / uTexel;',
    '  float inHot = step(uHot.x, vUv.x) * step(vUv.x, uHot.x + uHot.z) * step(uHot.y, vUv.y) * step(vUv.y, uHot.y + uHot.w) * uHotAmt;',
    '  ink = min(1.0, ink * (1.0 + 0.7 * inHot));',
    // relief: raised type bumps up, pressed type sinks; the normal comes from the height gradient
    '  float hl = texture(uTex, vUv - vec2(uTexel.x, 0.0)).b, hr = texture(uTex, vUv + vec2(uTexel.x, 0.0)).b;',
    '  float hu = texture(uTex, vUv - vec2(0.0, uTexel.y)).b, hd = texture(uTex, vUv + vec2(0.0, uTexel.y)).b;',
    '  vec2 dh = vec2(hr - hl, hd - hu);',
    // paper: fine grain plus a faint fibre direction; the lacquer is smooth
    '  float g1 = vnoise(pix * 0.6) - 0.5;',
    '  float g2 = vnoise(pix * 0.12 + 7.0) - 0.5;',
    '  float fib = vnoise(vec2(pix.x * 0.07, pix.y * 1.4) + 3.0) - 0.5;',
    '  vec2 gN = (vec2(g1, fib) * 0.04 + vec2(g2) * 0.015) * (1.0 - gloss);',
    '  vec3 N = normalize(vec3(-dh * mix(4.5, 3.8, gloss) + gN, 1.0));',
    '  vec3 P = vec3(vUv.x - 0.5, (vUv.y - 0.5) * uAspect, 0.0);',
    '  vec3 Lv = uLight - P; float dist = length(Lv); vec3 L = Lv / dist;',
    '  vec3 V = normalize(uView - P);',
    '  vec3 H = normalize(L + V);',
    '  float att = uPower / (0.35 + dist * dist * 2.2);',
    '  float ndl = max(dot(N, L), 0.0);',
    '  float ndh = max(dot(N, H), 0.0);',
    '  float ndv = max(dot(N, V), 0.0);',
    // albedo: bone paper with a watermark, matte ink, lacquered black
    '  vec3 paper = uPaper * (1.0 + g1 * 0.035 + g2 * 0.02) * (1.0 - wm * 0.032);',
    '  vec3 inkCol = mix(uInk, vec3(0.018, 0.017, 0.016), gloss);',
    '  vec3 base = mix(paper, inkCol, ink);',
    '  float pressed = max(0.5 - s.b, 0.0) * 2.0;',
    '  float cavity = 1.0 - pressed * 0.14;',
    '  vec3 col = base * cavity * (uAmbient + ndl * att * uLightCol);',
    // specular: satin on the paper, a hard lacquer on the gloss ink, Schlick fresnel on both
    '  float fres = pow(1.0 - ndv, 5.0);',
    '  float F0 = mix(0.03, 0.06, gloss);',
    '  float F = F0 + (1.0 - F0) * fres;',
    '  float specPow = mix(26.0, 90.0, gloss);',
    '  float spec = pow(ndh, specPow) * (specPow + 2.0) / 8.0;',
    '  spec *= mix(0.35, 1.0, gloss) * (1.0 + wm * 0.35) * (1.0 + 0.6 * inHot * gloss);',
    '  col += uLightCol * spec * F * att;',
    // the lacquer reflects the room: black turns grey at grazing angles
    '  col += vec3(gloss * F * uAmbient * 1.3);',
    '  col = min(col, 0.86) + (1.0 - exp(-max(col - 0.86, 0.0) * 2.5)) * 0.14;',
    '  fragColor = vec4(col * alpha, alpha);',
    '}'
  ].join('\n');

  // Table: a cloth under the lamp, and the card's soft shadow. Pixels are device px.
  var TABLE_FS = [
    '#version 300 es',
    'precision highp float;',
    'out vec4 fragColor;',
    'uniform vec2 uRes; uniform float uDpr; uniform vec2 uLight; uniform float uLightH;',
    'uniform vec2 uCardC; uniform vec2 uCardHalf; uniform float uCardH; uniform vec2 uFlipScale; uniform float uRadius;',
    'uniform vec3 uTable; uniform float uAmbient; uniform float uPower; uniform vec3 uLightCol; uniform float uShadow; uniform float uTime;',
    'uniform float uWeave; uniform float uFuzz; uniform float uVignette;',
    NOISE,
    'float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'void main(){',
    '  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  float sc = 1.0 / uRes.y;',
    '  vec3 d = vec3((p - uLight) * sc, uLightH * sc);',
    '  float lamp = uPower / (0.15 + dot(d, d) * 5.0);',
    '  float k = uCardH / max(uLightH - uCardH, 1.0);',
    '  vec2 shc = uCardC + (uCardC - uLight) * k;',
    '  vec2 shh = uCardHalf * (1.0 + k) * max(uFlipScale, vec2(0.03));',
    '  float sd = sdRR(p - shc, shh, min(uRadius * (1.0 + k), min(shh.x, shh.y)));',
    '  float pen = 8.0 + uCardH * 1.5;',
    '  float sha = mix(uShadow, 1.0, smoothstep(-pen * 0.3, pen, sd));',
    // the weave: threads a few pixels apart, plus fuzz
    '  float f = 6.28318 / (2.4 * uDpr);',
    '  float weave = sin(p.x * f) * sin(p.y * f);',
    '  float fuzz = vnoise(p * 0.45 / uDpr) * 0.6 + vnoise(p * 0.09 / uDpr) * 0.4 - 0.5;',
    '  float tex = 1.0 + uWeave * weave + uFuzz * fuzz;',
    '  vec3 col = uTable * tex * (uAmbient + lamp * uLightCol * sha);',
    '  vec2 q = p / uRes - 0.5; col *= 1.0 - dot(q, q) * uVignette;',
    '  col += (hash(p + fract(uTime)) - 0.5) * 0.01;',
    '  fragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ */
  /* WebGL plumbing                                                      */
  /* ------------------------------------------------------------------ */

  function Pass(canvas, fsSrc, alpha) {
    var gl = canvas.getContext('webgl2', { alpha: !!alpha, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
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
  // Relief -> B channel, centred on 0.5. `depth` is a second canvas: R is how far raised
  // (gloss type), G how far pressed (plain ink). Three box passes approximate a gaussian;
  // pressed type gets a narrower bevel than raised. The watermark was drawn into B of
  // the main canvas beforehand, so it is moved to A first.
  function heightMap(data, depth, w, h, rUp, rDown) {
    var n = w * h, up = new Float32Array(n), down = new Float32Array(n), tmp = new Float32Array(n), i, v;
    for (i = 0; i < n; i++) {
      data[i * 4 + 3] = data[i * 4 + 2];
      up[i] = depth[i * 4] / 255;
      down[i] = depth[i * 4 + 1] / 255;
    }
    for (i = 0; i < 3; i++) { boxBlurH(up, tmp, w, h, rUp); boxBlurV(tmp, up, w, h, rUp); }
    for (i = 0; i < 3; i++) { boxBlurH(down, tmp, w, h, rDown); boxBlurV(tmp, down, w, h, rDown); }
    for (i = 0; i < n; i++) {
      v = 0.5 + 0.5 * (up[i] - down[i]);
      data[i * 4 + 2] = Math.max(0, Math.min(255, (v * 255 + 0.5) | 0));
    }
  }

  // Draw one run of text the way the DOM laid it out: from the left edge of its box,
  // one glyph at a time when it is tracked. Returns the run's width.
  function drawRun(ctx, text, x, y, tracking) {
    if (!tracking) { ctx.fillText(text, x, y); return ctx.measureText(text).width; }
    var x0 = x;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + tracking;
    }
    return x - x0 - tracking;
  }

  function Face(name, el) {
    this.name = name;
    this.el = el;
    this.canvas = el.querySelector('canvas.paper');
    this.pass = new Pass(this.canvas, FACE_FS, true);
    var gl = this.pass.gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.off = document.createElement('canvas');
    this.octx = this.off.getContext('2d', { willReadFrequently: true });
    this.dep = document.createElement('canvas');
    this.dctx = this.dep.getContext('2d', { willReadFrequently: true });
    this.w = 0; this.h = 0;
  }
  Face.prototype.resize = function (W, H) {
    this.w = Math.max(2, Math.round(W * DPR));
    this.h = Math.max(2, Math.round(H * DPR));
    this.canvas.width = this.off.width = this.dep.width = this.w;
    this.canvas.height = this.off.height = this.dep.height = this.h;
    this.paint();
  };
  // Draw the DOM's type onto the offscreen canvas, at the DOM's own positions.
  Face.prototype.paint = function () {
    var ctx = this.octx, dctx = this.dctx, face = this.el, w = this.w, h = this.h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.scale(DPR, DPR);
    ctx.textBaseline = 'middle';
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.fillStyle = '#000';
    dctx.fillRect(0, 0, w, h);
    dctx.scale(DPR, DPR);
    dctx.textBaseline = 'middle';
    dctx.textAlign = 'left';
    // the watermark, into B for now (heightMap moves it to A)
    var wmText = face.getAttribute('data-watermark');
    if (wmText) {
      var cw = w / DPR, ch = h / DPR;
      ctx.textAlign = 'center';
      ctx.font = 'normal 500 ' + Math.round(Math.min(cw, ch) * 0.62) + 'px ' + getComputedStyle(face).fontFamily;
      ctx.fillStyle = 'rgb(0,0,255)';
      ctx.fillText(wmText, cw / 2, ch * 0.52);
    }
    ctx.textAlign = 'left';
    var items = face.querySelectorAll('[data-t]');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (!el.offsetWidth) continue; // display:none
      var text = el.textContent.trim();
      if (!text) continue;
      var r = rectIn(el, face);
      var cs = getComputedStyle(el);
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      if (cs.textTransform === 'uppercase') text = text.toUpperCase();
      var tracking = parseFloat(cs.letterSpacing) || 0;
      var gloss = el.classList.contains('gloss');
      var glossRule = el.classList.contains('gloss-rule');
      var ink = gloss ? 1 : parseFloat(el.getAttribute('data-ink') || '1');
      var x0 = r.x + (parseFloat(cs.paddingLeft) || 0);
      var cy = r.y + r.h / 2;
      var fs = parseFloat(cs.fontSize);
      // how deep the impression is: big type gets full relief, small type a shallow, crisp one
      var depth = clamp((fs - 9) / 20, 0.22, 1);
      var depthCol = gloss ? 'rgb(' + Math.round(depth * 255) + ',0,0)' : 'rgb(0,' + Math.round(depth * 255) + ',0)';
      ctx.fillStyle = gloss ? 'rgb(255,255,0)' : 'rgb(' + Math.round(ink * 255) + ',0,0)';
      var tw = drawRun(ctx, text, x0, cy, tracking);
      dctx.font = ctx.font;
      dctx.fillStyle = depthCol;
      drawRun(dctx, text, x0, cy, tracking);
      if (el.tagName === 'A' || glossRule) {
        var th = Math.max(1, fs * 0.055);
        var ty = Math.round((cy + fs * 0.5) * DPR) / DPR;
        ctx.fillStyle = glossRule ? 'rgb(255,255,0)' : 'rgb(' + Math.round(ink * 0.55 * 255) + ',0,0)';
        ctx.fillRect(x0, ty, tw, th);
        dctx.fillStyle = glossRule ? 'rgb(' + Math.round(depth * 255) + ',0,0)' : 'rgb(0,' + Math.round(depth * 0.6 * 255) + ',0)';
        dctx.fillRect(x0, ty, tw, th);
      }
    }
    var img = ctx.getImageData(0, 0, w, h);
    var dep = dctx.getImageData(0, 0, w, h);
    heightMap(img.data, dep.data, w, h, Math.max(1, Math.round(1.6 * DPR)), Math.max(1, Math.round(1.0 * DPR)));
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
    p.set('uSize', [S.W, S.H]);
    p.set('uRadius', 0.0);
    p.set('uLight', light);
    p.set('uView', view);
    p.set('uTime', time);
    p.set('uAmbient', T.cardAmb);
    p.set('uPower', T.cardPow);
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
    this.dpr = Math.min(DPR, 1);
    this.w = 0; this.h = 0;
  }
  Table.prototype.resize = function () {
    this.w = Math.round(window.innerWidth * this.dpr);
    this.h = Math.round(window.innerHeight * this.dpr);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  };
  Table.prototype.render = function (T, time, M, cardH) {
    var p = this.pass, gl = p.gl;
    var lifted = clamp((cardH - S.cardH) / (S.W * 0.08), 0, 1);
    gl.useProgram(p.prog);
    var d = this.dpr;
    p.set('uRes', [this.w, this.h]);
    p.set('uDpr', d);
    p.set('uLight', [S.light.x * d, S.light.y * d]);
    p.set('uLightH', S.lightH * d);
    p.set('uCardC', [S.cx * d, S.cy * d]);
    p.set('uCardHalf', [S.W / 2 * d, S.H / 2 * d]);
    p.set('uCardH', cardH * d);
    p.set('uFlipScale', [Math.abs(M[0]), Math.abs(M[4])]);
    p.set('uRadius', 0.0);
    p.set('uTable', T.table);
    p.set('uAmbient', T.tableAmb);
    p.set('uPower', T.tablePow);
    p.set('uLightCol', T.lightCol);
    p.set('uShadow', T.shadow + (1 - T.shadow) * 0.45 * lifted);
    p.set('uWeave', T.weave);
    p.set('uFuzz', T.fuzz);
    p.set('uVignette', T.vignette);
    p.set('uTime', reduced ? 0 : time);
    p.draw(this.w, this.h);
  };

  /* ------------------------------------------------------------------ */
  /* geometry and state                                                  */
  /* ------------------------------------------------------------------ */

  function measure() {
    var r = scene.getBoundingClientRect();
    S.W = r.width; S.H = r.height;
    S.cx = r.left + r.width / 2;
    S.cy = r.top + r.height / 2;
    S.lightH = S.W * 0.55 + 40;              // the lamp hovers just above the card
    S.cardH = Math.max(18, S.W * 0.05);      // the card floats a little off the table
    S.persp = parseFloat(getComputedStyle(scene).perspective) || 1400;
  }

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

  // The card's rotation right now (without the tilt).
  function flipMatrix() {
    var f = S.flip;
    var R = f.axis === 'x' ? rotXm(f.a * DEG) : rotYm(f.a * DEG);
    return mmul(R, f.q);
  }
  function applyFaceTransforms() {
    var f = S.flip;
    faceEls.front.style.transform = css3d(f.F) + ' translateZ(1px)';
    faceEls.back.style.transform = css3d(f.B) + ' translateZ(1px)';
  }
  function settled() {
    var f = S.flip;
    return !f.dragging && f.a === 0 && f.target === 0;
  }
  // Within reach of rest: a completed half-turn plus a small wobble, or the landing wobble.
  function nearlySettled() {
    var f = S.flip;
    if (f.dragging) return false;
    var near = Math.round(f.a / 180) * 180;
    return Math.abs(f.a - near) < 35;
  }
  // Fold whole half-turns into q and put q, F and B back in canonical form. Whatever
  // remains of `a` keeps the card exactly where it is on screen.
  function fold(near) {
    var f = S.flip;
    var R = f.axis === 'x' ? rotXm(near * DEG) : rotYm(near * DEG);
    var q = msnap(mmul(R, f.q));
    f.q = mvec(q, [0, 0, 1])[2] > 0 ? ID : RY180;
    f.F = ID; f.B = RY180;
    f.a -= near; f.target = 0;
  }
  // Start turning about an axis. Any finished half-turn is folded in first. The face
  // that will be on show at the end gets a transform that makes it read upright once
  // it arrives; it is hidden right now.
  function beginFlip(axis) {
    var f = S.flip;
    if (!nearlySettled()) return false;
    fold(Math.round(f.a / 180) * 180);
    if (axis !== f.axis) { f.a = 0; f.v = 0; }
    f.axis = axis;
    var qEnd = msnap(mmul(axis === 'x' ? RX180 : RY180, f.q));
    if (mvec(qEnd, [0, 0, 1])[2] > 0) f.F = mT(qEnd); else f.B = mT(qEnd);
    applyFaceTransforms();
    return true;
  }
  // A turn has ended: fold it in and come to rest.
  function settleFlip() {
    var f = S.flip;
    f.a = f.target;
    fold(f.target);
    f.a = 0; f.v = 0;
    applyFaceTransforms();
  }
  // Aim the current turn at a new angle. The face that will be on show at the end gets
  // its upright transform, but only if it is hidden right now; if it is visible it is
  // already in canonical form and must not jump.
  function flipTo(target) {
    var f = S.flip;
    f.target = target;
    var R = f.axis === 'x' ? rotXm(target * DEG) : rotYm(target * DEG);
    var qEnd = msnap(mmul(R, f.q));
    var local = mT(qEnd);
    var Mnow = flipMatrix();
    if (mvec(qEnd, [0, 0, 1])[2] > 0) {
      if (mvec(mmul(Mnow, f.F), [0, 0, 1])[2] < 0) f.F = local;
    } else {
      if (mvec(mmul(Mnow, f.B), [0, 0, 1])[2] < 0) f.B = local;
    }
    applyFaceTransforms();
    if (reduced) { f.a = target; f.v = 0; settleFlip(); }
  }
  // Click-to-flip: a horizontal turn, or one more half-turn if the card is already moving.
  function requestFlip() {
    var f = S.flip;
    if (nearlySettled()) {
      if (!beginFlip('y')) return;
      flipTo(180);
    } else if (!f.dragging) {
      flipTo(f.target === 0 ? 180 : f.target + (f.target > 0 ? 180 : -180));
    } else {
      return;
    }
    wake();
  }

  function updateSide() {
    var n = mvec(flipMatrix(), [0, 0, 1]);
    var side = n[2] >= 0 ? 0 : 1;
    if (side === S.side) return;
    S.side = side;
    faceEls.front.toggleAttribute('inert', side === 1);
    faceEls.back.toggleAttribute('inert', side === 0);
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
    var k = reduced ? 1 : 1 - Math.exp(-dt * 22);
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
    var f = S.flip;
    if (!f.dragging && !reduced) {
      if (Math.abs(f.a - f.target) > 0.05 || Math.abs(f.v) > 0.5) {
        var r3 = spring(f.a, f.v, f.target, 60, 7.5, dt);
        f.a = r3[0]; f.v = r3[1];
      } else if (f.a !== 0 || f.target !== 0) {
        settleFlip();
      }
    }
    updateSide();

    // --- hover glow ---
    S.hot.amt += (S.hot.target - S.hot.amt) * (reduced ? 1 : 1 - Math.exp(-dt * 14));

    var M = flipMatrix();
    var tilt = mmul(rotXm(S.tilt.x * DEG), rotYm(S.tilt.y * DEG));
    var Mw = mmul(tilt, M);
    card.style.transform = 'rotateX(' + S.tilt.x.toFixed(3) + 'deg) rotateY(' + S.tilt.y.toFixed(3) + 'deg) ' + css3d(M);
    card.classList.toggle('edge-on', Math.abs(mvec(Mw, [0, 0, 1])[2]) < 0.955);

    if (faces) render(t, Mw);

    var moving = S.intro.active || f.dragging ||
      f.a !== 0 || f.target !== 0 ||
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

  function render(t, Mw) {
    var T = THEMES[S.theme];
    var f = S.flip;
    var lift = S.cardH + Math.abs(Math.sin(f.a * DEG)) * S.W * 0.08; // a card being turned rises
    var lw = [(S.light.x - S.cx) / S.W, (S.light.y - S.cy) / S.W, (S.lightH - lift) / S.W];
    var vw = [0, 0, S.persp / S.W];
    var Mf = mmul(Mw, f.F), Mb = mmul(Mw, f.B);
    var nf = mvec(Mf, [0, 0, 1])[2], nb = mvec(Mb, [0, 0, 1])[2];
    if (nf > -0.05) faces.front.render(mvec(mT(Mf), lw), mvec(mT(Mf), vw), T, t);
    if (nb > -0.05) faces.back.render(mvec(mT(Mb), lw), mvec(mT(Mb), vw), T, t);
    table.render(T, t, Mw, lift);
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

  // Drag to turn the card, about whichever axis the drag starts along. Pointer capture
  // only once it's clearly a drag, so plain clicks still reach the links.
  var drag = null, suppressClick = false;
  card.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || !nearlySettled()) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, axis: 'y', a0: 0, last: e.clientX, lastT: performance.now(), v: 0 };
  });
  card.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'y' : 'x';
      if (!beginFlip(drag.axis)) { drag = null; return; }
      drag.a0 = S.flip.a;
      drag.moved = true;
      drag.last = drag.axis === 'y' ? e.clientX : e.clientY;
      S.flip.dragging = true;
      card.classList.add('dragging');
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    }
    var now = performance.now(), dtm = Math.max(1, now - drag.lastT);
    var pos = drag.axis === 'y' ? e.clientX : e.clientY;
    var span = drag.axis === 'y' ? S.W : S.H;
    var sign = drag.axis === 'y' ? 1 : -1; // pulling the surface down tips the top edge toward you
    var delta = drag.axis === 'y' ? dx : dy;
    drag.v = drag.v * 0.6 + (sign * (pos - drag.last) / dtm * 1000 / span * 180) * 0.4; // deg/s
    drag.last = pos; drag.lastT = now;
    S.flip.a = drag.a0 + sign * delta / span * 180;
    wake();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.moved) {
      S.flip.dragging = false;
      card.classList.remove('dragging');
      S.flip.v = drag.v;
      var guess = S.flip.a + S.flip.v * 0.12;
      flipTo(clamp(Math.round(guess / 180), -1, 1) * 180);
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
  for (var i = 0; i < flips.length; i++) flips[i].addEventListener('click', requestFlip);

  // "links" opens the contact row in place.
  var linksToggle = card.querySelector('.links-toggle');
  linksToggle.addEventListener('click', function () {
    faceEls.front.classList.add('open');
    linksToggle.setAttribute('aria-expanded', 'true');
    if (faces) faces.front.paint();
    var first = card.querySelector('.contacts a');
    if (first && linksToggle.matches(':focus-visible')) first.focus();
    wake();
  });

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

  // Email: hovering shows the address on the line beneath, clicking copies it.
  var email = card.querySelector('.email');
  var note = card.querySelector('.note');
  var address = email.getAttribute('data-email');
  var copied = false;
  function setNote(s) {
    if (note.textContent === s) return;
    note.textContent = s;
    if (faces) faces.front.paint();
    wake();
  }
  if (hoverable) {
    email.addEventListener('pointerenter', function () { if (!copied) setNote(address); });
    email.addEventListener('pointerleave', function () { if (!copied) setNote(''); });
  }
  email.addEventListener('focus', function () { if (!copied) setNote(address); });
  email.addEventListener('blur', function () { if (!copied) setNote(''); });
  email.addEventListener('click', function (e) {
    if (!navigator.clipboard) return;
    e.preventDefault();
    navigator.clipboard.writeText(address).then(function () {
      copied = true;
      setNote('copied');
      setTimeout(function () {
        copied = false;
        setNote((hoverable && email.matches(':hover')) || email.matches(':focus') ? address : '');
      }, 1500);
    });
  });

  // Phones: tilting the device moves the light. iOS wants a tap before it will say yes.
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
      faces = { front: new Face('front', faceEls.front), back: new Face('back', faceEls.back) };
      table = new Table(tableCanvas);
      html.classList.add('gl');
      S.gl = true;
    } catch (err) {
      faces = null; table = null;
      html.classList.remove('gl');
    }

    hint.textContent = hoverable ? 'drag to flip' : 'swipe to flip';
    applyFaceTransforms();
    layout();

    if (!reduced) {
      // Tossed onto the table: it lands with a wobble while the lamp sweeps across.
      S.intro.active = true;
      S.intro.t0 = performance.now();
      if (settled()) { beginFlip('y'); S.flip.a = -28; S.flip.v = 0; }
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
    Promise.all([
      document.fonts.load('500 16px "EB Garamond"'),
      document.fonts.load('italic 400 16px "EB Garamond"')
    ]).then(start, start);
  } else {
    start();
  }
})();
