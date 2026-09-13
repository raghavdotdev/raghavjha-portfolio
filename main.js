/* ============================================================
   IMPERIAL DATANET — main.js
   no frameworks. no dependencies. all art is code.
   ============================================================ */
(() => {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE  = matchMedia('(pointer: coarse)').matches;

/* ============================================================
   1. WEBGL HYPERSPACE FIELD
   ============================================================ */
const GLField = (() => {
  const cvs = $('#gl');
  let gl, prog, uni = {}, raf = 0, t0 = performance.now();
  let warp = 0, warpTarget = 0, jump = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

  const FS = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_warp;
uniform vec2  u_mouse;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 233.53));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float star(vec2 uv, float flare){
  float d = length(uv);
  float m = 0.032 / d;
  float rays = max(0.0, 1.0 - abs(uv.x * uv.y * 900.0));
  m += rays * flare;
  uv *= mat2(0.707, -0.707, 0.707, 0.707);
  rays = max(0.0, 1.0 - abs(uv.x * uv.y * 900.0));
  m += rays * 0.3 * flare;
  m *= smoothstep(0.85, 0.15, d);
  return m;
}

vec3 starLayer(vec2 uv){
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  for(int y = -1; y <= 1; y++){
    for(int x = -1; x <= 1; x++){
      vec2 off = vec2(float(x), float(y));
      float n = hash21(id + off);
      float size = fract(n * 345.32);
      float s = star(gv - off - vec2(n, fract(n * 34.0)) + 0.5, smoothstep(0.86, 1.0, size) * 0.5);
      vec3 c = mix(vec3(1.0, 0.62, 0.58), vec3(1.0, 0.20, 0.20), fract(n * 2145.32));
      c = mix(c, vec3(0.80, 0.86, 1.0), fract(n * 91.2) * 0.45);
      col += s * size * c;
    }
  }
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 m  = u_mouse * 0.30;
  float t = u_time * 0.045 + u_warp * u_time * 0.16;

  vec3 col = vec3(0.0);
  float wsum = 0.0;

  for(int L = 0; L < 7; L++){
    float i = float(L) / 7.0;
    float depth = fract(i + t);
    float scale = mix(16.0, 0.32, depth);
    float fade  = depth * smoothstep(1.0, 0.88, depth);

    for(int j = 0; j < 3; j++){
      float fj = float(j) / 3.0;
      float w = 1.0 / (1.0 + fj * 2.4);
      vec2 quv = uv * (1.0 + fj * u_warp * 1.15);
      col  += starLayer(quv * scale + i * 453.2 - m) * fade * w;
      wsum += w * 0.142857;
    }
  }
  col /= max(wsum, 0.001);

  // imperial nebula haze
  float r = length(uv);
  col += vec3(0.36, 0.035, 0.055) * (0.05 / (r * r + 0.22)) * (0.55 + 0.45 * sin(u_time * 0.25));
  col += vec3(0.10, 0.01, 0.02) * smoothstep(1.3, 0.1, r);

  // hyperspace white-out
  col += vec3(1.0, 0.92, 0.92) * pow(u_warp, 3.0) * 0.55;

  col = pow(col, vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }

  function init(){
    try {
      gl = cvs.getContext('webgl', { antialias:false, alpha:false, powerPreference:'high-performance' })
        || cvs.getContext('experimental-webgl');
    } catch(e){ gl = null; }
    if (!gl) { document.body.style.background =
      'radial-gradient(120% 90% at 50% 30%, #2a0709, #050203 65%)'; return false; }

    const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return false; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    uni.res   = gl.getUniformLocation(prog, 'u_res');
    uni.time  = gl.getUniformLocation(prog, 'u_time');
    uni.warp  = gl.getUniformLocation(prog, 'u_warp');
    uni.mouse = gl.getUniformLocation(prog, 'u_mouse');

    resize();
    addEventListener('resize', resize, { passive:true });
    loop();
    return true;
  }

  let quality = 1;           // adaptive resolution scale
  let fAvg = 16, fLast = performance.now(), fCount = 0;

  function resize(){
    const dpr = clamp(devicePixelRatio || 1, 1, 1.35) * quality;
    const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
    gl.viewport(0, 0, w, h);
  }

  function loop(){
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    fAvg = lerp(fAvg, now - fLast, 0.06); fLast = now;
    if (++fCount > 90){                       // every ~1.5s, retune resolution
      fCount = 0;
      if (fAvg > 26 && quality > 0.5){ quality = Math.max(0.5, quality - 0.18); resize(); }
      else if (fAvg < 15 && quality < 1){ quality = Math.min(1, quality + 0.12); resize(); }
    }
    const t = (now - t0) / 1000;
    warp = lerp(warp, clamp(warpTarget + jump, 0, 1.6), 0.07);
    jump *= 0.955;
    gl.uniform2f(uni.res, cvs.width, cvs.height);
    gl.uniform1f(uni.time, REDUCED ? 0 : t);
    gl.uniform1f(uni.warp, warp);
    mouse.x = lerp(mouse.x, mouse.tx, 0.05);
    mouse.y = lerp(mouse.y, mouse.ty, 0.05);
    gl.uniform2f(uni.mouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    init,
    setWarp: v => { warpTarget = v; },
    hyperjump: (amt = 1.15) => { jump = amt; },
    look: (x, y) => { mouse.tx = x; mouse.ty = y; }
  };
})();

/* ============================================================
   2. SOUND — fully synthesized, zero assets
   ============================================================ */
const SFX = (() => {
  let ctx = null, master = null, hum = null, on = false;

  function ensure(){
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    return ctx;
  }

  function startHum(){
    if (!ctx || hum) return;
    const g = ctx.createGain(); g.gain.value = 0.055;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 6;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 52;
    const o2 = ctx.createOscillator(); o2.type = 'sine';     o2.frequency.value = 78.3;
    const lfo = ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value = 0.18;
    const lfoG = ctx.createGain(); lfoG.gain.value = 9;
    lfo.connect(lfoG); lfoG.connect(o1.frequency);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
    o1.start(); o2.start(); lfo.start();
    hum = { o1, o2, lfo, g };
  }

  function blip(freq = 660, dur = 0.07, type = 'square', vol = 0.09){
    if (!on || !ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function swoosh(dur = 0.85){
    if (!on || !ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(320, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(2600, ctx.currentTime + dur * 0.7);
    const g = ctx.createGain(); g.gain.value = 0.16;
    src.connect(bp); bp.connect(g); g.connect(master); src.start();
  }

  function toggle(){
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    on = !on;
    startHum();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(on ? 0.9 : 0.0, ctx.currentTime + 0.4);
    if (on) blip(880, .08, 'square', .07);
    return on;
  }

  return { toggle, blip, swoosh, isOn: () => on };
})();

/* ============================================================
   3. BOOT SEQUENCE
   ============================================================ */
const Boot = (() => {
  const el = $('#boot'), log = $('#bootLog'), enter = $('#bootEnter'), skip = $('#bootSkip');
  const LINES = [
    ['IMPERIAL DATANET // NODE 7734', 'ok'],
    ['establishing subspace link', 'dot'],
    ['handshake .... <b>OK</b>', 'ok'],
    ['decrypting personnel archive', 'dot'],
    ['cipher: SITH-512 .... <b>BROKEN</b>', 'ok'],
    ['scanning for lifeform signature', 'dot'],
    ['<span class="warn">WARNING: unauthorized presence detected</span>', 'ok'],
    ['running biometric cross-reference', 'dot'],
    ['match: <b>JHA, RAGHAV</b> — clearance OMEGA', 'ok'],
    ['loading dossier: security / embedded / full-stack', 'dot'],
    ['<span class="ok">ARCHIVE UNSEALED. WELCOME BACK, ENGINEER.</span>', 'ok']
  ];

  let done = false;

  function finish(){
    if (done) return; done = true;
    el.classList.add('gone');
    document.body.classList.remove('locked');
    setTimeout(() => { el.remove(); Hero.start(); }, 750);
  }

  async function run(){
    document.body.classList.add('locked');
    for (const [txt, kind] of LINES){
      const line = document.createElement('div');
      log.appendChild(line);
      if (kind === 'dot'){
        line.innerHTML = '<span class="ok">›</span> ' + txt;
        for (let i = 0; i < 3; i++){ await wait(110); line.innerHTML += '.'; }
      } else {
        line.innerHTML = '<span class="ok">›</span> ' + txt;
        SFX.blip(420 + Math.random() * 500, .04, 'square', .05);
      }
      log.scrollTop = log.scrollHeight;
      await wait(kind === 'dot' ? 90 : 150);
    }
    enter.hidden = false;
    enter.focus();
  }

  const wait = ms => new Promise(r => setTimeout(r, REDUCED ? Math.min(ms, 25) : ms));

  enter.addEventListener('click', () => { GLField.hyperjump(1.4); SFX.swoosh(); finish(); });
  skip.addEventListener('click', finish);
  addEventListener('keydown', e => { if (!done && e.key === 'Enter') finish(); });

  return { run };
})();

/* ============================================================
   4. HERO — typewriter + glitch
   ============================================================ */
const Hero = (() => {
  const tw = $('.tw');
  const title = $('.title');
  let started = false;

  async function typeLoop(){
    const words = tw.dataset.words.split('|');
    let i = 0;
    for(;;){
      const w = words[i % words.length];
      for (let c = 1; c <= w.length; c++){ tw.textContent = w.slice(0, c); await sleep(42); }
      await sleep(1700);
      for (let c = w.length; c >= 0; c--){ tw.textContent = w.slice(0, c); await sleep(20); }
      await sleep(240);
      i++;
    }
  }

  function glitchLoop(){
    setInterval(() => {
      if (Math.random() > .72){
        title.classList.add('glitching');
        setTimeout(() => title.classList.remove('glitching'), 300);
      }
    }, 3200);
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function start(){
    if (started) return; started = true;
    typeLoop();
    if (!REDUCED) glitchLoop();
  }
  return { start };
})();

/* ============================================================
   5. SCROLL — nav state, saber progress, warp, reveal, bars
   ============================================================ */
(() => {
  const nav = $('#nav'), saberFill = $('#saberFill'), hudPct = $('#hudPct');
  const links = $$('.nav-links a');
  const sections = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  let lastY = scrollY, vel = 0, ticking = false;

  function onScroll(){
    const y = scrollY;
    vel = lerp(vel, Math.abs(y - lastY), 0.35);
    lastY = y;
    const max = document.body.scrollHeight - innerHeight;
    const pct = max > 0 ? clamp(y / max, 0, 1) : 0;

    nav.classList.toggle('solid', y > 40);
    saberFill.style.height = (pct * 100).toFixed(1) + '%';
    hudPct.textContent = String(Math.round(pct * 100)).padStart(3, '0');
    GLField.setWarp(clamp(vel / 90, 0, .85));

    let cur = null;
    for (const s of sections){
      const r = s.getBoundingClientRect();
      if (r.top <= innerHeight * 0.42) cur = s.id;
    }
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
    ticking = false;
  }

  addEventListener('scroll', () => {
    if (!ticking){ ticking = true; requestAnimationFrame(onScroll); }
  }, { passive:true });

  // velocity decay so warp settles
  setInterval(() => { vel *= 0.7; GLField.setWarp(clamp(vel / 90, 0, .85)); }, 120);

  // reveal
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('.bar', e.target).forEach((b, i) => {
        setTimeout(() => { b.style.setProperty('--w', b.dataset.v + '%'); b.classList.add('lit'); }, 90 * i);
      });
      io.unobserve(e.target);
    });
  }, { threshold: .16, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  // crawl plays when on screen
  const crawl = $('#crawlText');
  new IntersectionObserver(es => es.forEach(e => crawl.classList.toggle('running', e.isIntersecting)),
    { threshold: .05 }).observe($('#crawl'));

  // radar draws once visible
  new IntersectionObserver((es, obs) => es.forEach(e => {
    if (e.isIntersecting){ Radar.play(); obs.disconnect(); }
  }), { threshold: .3 }).observe($('#radar'));
})();

/* ============================================================
   6. NAV / MENU / HYPERJUMP NAVIGATION
   ============================================================ */
(() => {
  const menuBtn = $('#menuBtn'), linksWrap = $('.nav-links');
  menuBtn.addEventListener('click', () => {
    const open = linksWrap.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
    SFX.blip(open ? 720 : 480, .06);
  });

  $$('[data-nav]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (!id || !id.startsWith('#')) return;
    const target = id === '#top' ? document.body : $(id);
    if (!target) return;
    e.preventDefault();
    linksWrap.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    GLField.hyperjump(.9);
    SFX.swoosh(.5);
    const top = id === '#top' ? 0 : target.getBoundingClientRect().top + scrollY - 56;
    scrollTo({ top, behavior: REDUCED ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
  }));

  const sfxBtn = $('#sfxBtn');
  sfxBtn.addEventListener('click', () => {
    const on = SFX.toggle();
    sfxBtn.setAttribute('aria-pressed', String(on));
    sfxBtn.querySelector('.sfx-on').textContent = on ? '◉ SFX' : '○ SFX';
  });

  $$('.btn, .clink, .chips span, .icon-btn').forEach(el =>
    el.addEventListener('mouseenter', () => SFX.blip(520 + Math.random() * 240, .035, 'square', .05)));
})();

/* ============================================================
   7. RADAR — threat assessment chart
   ============================================================ */
const Radar = (() => {
  const cvs = $('#radar');
  const ctx = cvs.getContext('2d');
  const AX = [
    ['APPSEC', .94], ['EMBEDDED', .88], ['FULL-STACK', .87],
    ['MACHINE LRN', .74], ['DEVOPS', .80], ['PRODUCT', .78]
  ];
  const N = AX.length, R = 150, CX = 220, CY = 220;
  let p = 0, raf = 0;

  function pt(i, r){
    const a = -Math.PI / 2 + i * (Math.PI * 2 / N);
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
  }

  function draw(){
    ctx.clearRect(0, 0, 440, 440);
    ctx.lineWidth = 1;

    // rings
    for (let k = 1; k <= 4; k++){
      ctx.beginPath();
      for (let i = 0; i <= N; i++){ const [x, y] = pt(i % N, R * k / 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,45,45,' + (0.09 + k * 0.035) + ')';
      ctx.stroke();
    }
    // spokes + labels
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < N; i++){
      const [x, y] = pt(i, R);
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(255,45,45,.16)'; ctx.stroke();
      const [lx, ly] = pt(i, R + 30);
      ctx.fillStyle = 'rgba(200,175,175,.8)';
      ctx.fillText(AX[i][0], lx, ly);
    }
    // value polygon
    ctx.beginPath();
    for (let i = 0; i < N; i++){
      const [x, y] = pt(i, R * AX[i][1] * p);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(CX, CY, 8, CX, CY, R);
    g.addColorStop(0, 'rgba(255,45,45,.45)');
    g.addColorStop(1, 'rgba(255,45,45,.10)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 2;
    ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
    // nodes
    for (let i = 0; i < N; i++){
      const [x, y] = pt(i, R * AX[i][1] * p);
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    }
    // sweep
    const a = -Math.PI / 2 + (performance.now() / 1400) % (Math.PI * 2);
    const sg = ctx.createLinearGradient(CX, CY, CX + Math.cos(a) * R, CY + Math.sin(a) * R);
    sg.addColorStop(0, 'rgba(255,45,45,0)'); sg.addColorStop(1, 'rgba(255,90,90,.55)');
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
    ctx.strokeStyle = sg; ctx.lineWidth = 2; ctx.stroke();
  }

  function loop(){
    p = Math.min(1, p + 0.018);
    draw();
    raf = requestAnimationFrame(loop);
  }
  return { play(){ if (!raf) loop(); } };
})();

/* ============================================================
   8. 3D TILT ON MISSION CARDS
   ============================================================ */
if (!COARSE && !REDUCED){
  $$('[data-tilt]').forEach(card => {
    let rq = 0;
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5;
      const py = (e.clientY - r.top) / r.height - .5;
      if (rq) return;
      rq = requestAnimationFrame(() => {
        card.style.transform =
          `perspective(900px) rotateY(${px * 11}deg) rotateX(${-py * 11}deg) translateZ(14px) scale(1.012)`;
        rq = 0;
      });
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}

/* ============================================================
   9. LIGHTSABER CURSOR + FX CANVAS (trail + TIE patrols)
   ============================================================ */
(() => {
  const saber = $('#saber'), dot = saber.firstElementChild;
  const fx = $('#fx'), c = fx.getContext('2d');
  let W = 0, H = 0, dpr = clamp(devicePixelRatio || 1, 1, 2);
  const trail = [], ties = [];
  let mx = innerWidth / 2, my = innerHeight / 2, sx = mx, sy = my;

  function size(){
    W = fx.width  = Math.floor(innerWidth * dpr);
    H = fx.height = Math.floor(innerHeight * dpr);
  }
  size(); addEventListener('resize', size, { passive:true });

  if (!COARSE){
    document.body.classList.add('saber-on');
    addEventListener('pointermove', e => {
      mx = e.clientX; my = e.clientY;
      GLField.look((e.clientX / innerWidth - .5) * 2, -(e.clientY / innerHeight - .5) * 2);
    }, { passive:true });
    addEventListener('pointerdown', () => { saber.classList.add('hot'); SFX.blip(300, .12, 'sawtooth', .07); });
    addEventListener('pointerup',   () => saber.classList.remove('hot'));
    $$('a,button,[data-tilt]').forEach(el => {
      el.addEventListener('mouseenter', () => saber.classList.add('hot'));
      el.addEventListener('mouseleave', () => saber.classList.remove('hot'));
    });
  }

  // --- TIE fighter silhouette, drawn procedurally ---
  function spawnTie(){
    const dir = Math.random() < .5 ? 1 : -1;
    ties.push({
      x: dir > 0 ? -120 : innerWidth + 120,
      y: 80 + Math.random() * (innerHeight - 200),
      v: dir * (2.4 + Math.random() * 3.4),
      s: .45 + Math.random() * .75,
      wob: Math.random() * 6.28
    });
  }
  function drawTie(t){
    const s = t.s;
    c.save();
    c.translate(t.x * dpr, (t.y + Math.sin(t.wob) * 12) * dpr);
    c.scale(s * dpr, s * dpr);
    c.strokeStyle = 'rgba(255,45,45,.55)';
    c.fillStyle   = 'rgba(10,3,4,.82)';
    c.lineWidth = 1.6;
    // wings
    c.beginPath(); c.moveTo(-26,-30); c.lineTo(-16,-30); c.lineTo(-16,30); c.lineTo(-26,30); c.closePath();
    c.fill(); c.stroke();
    c.beginPath(); c.moveTo(26,-30); c.lineTo(16,-30); c.lineTo(16,30); c.lineTo(26,30); c.closePath();
    c.fill(); c.stroke();
    // struts
    c.beginPath(); c.moveTo(-16,0); c.lineTo(-8,0); c.moveTo(16,0); c.lineTo(8,0); c.stroke();
    // pod
    c.beginPath(); c.arc(0,0,8.5,0,7); c.fill(); c.stroke();
    c.beginPath(); c.arc(0,0,4,0,7); c.strokeStyle='rgba(255,90,90,.8)'; c.stroke();
    c.restore();
  }

  function frame(){
    requestAnimationFrame(frame);
    c.clearRect(0, 0, W, H);

    if (!COARSE){
      sx = lerp(sx, mx, .32); sy = lerp(sy, my, .32);
      saber.style.transform = `translate(${sx}px, ${sy}px) translate(-50%,-50%)`;
      trail.push({ x: sx, y: sy, life: 1 });
      if (trail.length > 26) trail.shift();

      c.lineCap = 'round';
      for (let i = 1; i < trail.length; i++){
        const a = trail[i - 1], b = trail[i];
        const t = i / trail.length;
        c.beginPath();
        c.moveTo(a.x * dpr, a.y * dpr); c.lineTo(b.x * dpr, b.y * dpr);
        c.lineWidth = t * 5.5 * dpr;
        c.strokeStyle = `rgba(255,${60 + t * 120},${60 + t * 120},${t * .55})`;
        c.shadowColor = '#ff2d2d'; c.shadowBlur = 14 * t * dpr;
        c.stroke();
      }
      c.shadowBlur = 0;
    }

    if (!REDUCED){
      for (let i = ties.length - 1; i >= 0; i--){
        const t = ties[i];
        t.x += t.v; t.wob += .035;
        drawTie(t);
        if (t.x < -220 || t.x > innerWidth + 220) ties.splice(i, 1);
      }
    }
  }
  frame();

  if (!REDUCED) setInterval(() => { if (ties.length < 3 && Math.random() < .5) spawnTie(); }, 5200);
  window.__spawnTie = spawnTie;
})();

/* ============================================================
   10. IMPERIAL TERMINAL
   ============================================================ */
(() => {
  const term = $('#term'), out = $('#termOut'), inp = $('#termIn');
  let buf = '', hist = [], hi = -1;

  const print = (html, cls = '') => {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.innerHTML = html;
    out.appendChild(d);
    term.scrollTop = term.scrollHeight;
  };

  const CMDS = {
    help: () => print(
      'available commands:<br>' +
      '<span class="a">whoami</span>    identity readout<br>' +
      '<span class="a">skills</span>    capability matrix<br>' +
      '<span class="a">missions</span>  mission log index<br>' +
      '<span class="a">contact</span>   open comms<br>' +
      '<span class="a">hire</span>       availability status<br>' +
      '<span class="a">scan</span>       run a security sweep<br>' +
      '<span class="a">tie</span>        launch a patrol<br>' +
      '<span class="a">jump</span>       engage hyperdrive<br>' +
      '<span class="a">force</span>      ...<br>' +
      '<span class="a">clear</span>      wipe console'),
    whoami: () => print(
      '<span class="w">JHA, RAGHAV</span> — founding engineer @ Aptosi<br>' +
      'third-year B.SE, Seneca Polytechnic, Toronto (grad 2027)<br>' +
      'origin: Himmatnagar, Gujarat → North York, Toronto<br>' +
      'specialty: <span class="r">application security</span> × embedded × full-stack'),
    skills: () => print(
      'SEC   ██████████ appsec, ZAP, SAST/DAST, SPF/DKIM/DMARC<br>' +
      'EMB   █████████░ FreeRTOS, K66F, DMA, I2S/SAI, I2C/SPI<br>' +
      'WEB   █████████░ TypeScript, SvelteKit, FastAPI, Next.js<br>' +
      'DATA  ████████░░ PostgreSQL, Firestore, Redis<br>' +
      'ML    ███████░░░ CNN, VGG16, CBAM, LSTM, RL'),
    missions: () => print(
      'MSN-318  CASA Tier II assessment ......... <span class="r">CRITICAL</span><br>' +
      'MSN-292  merge-blocking SAST gate ........ SHIPPED<br>' +
      'MSN-207  QuickBooks OAuth integration .... ACTIVE<br>' +
      'MSN-101  CYRAVENT platform .............. BUILDING<br>' +
      'MSN-600  FRDM-K66F realtime acquisition .. FIELD<br>' +
      'MSN-044  CNN + attention research ....... RESEARCH'),
    contact: () => { print('opening secure channel...'); setTimeout(() => {
      print('<span class="a">raghavnjhaa@gmail.com</span>'); }, 400); },
    hire: () => print('<span class="a">STATUS: OPEN</span> — security, fintech, embedded. graduating 2027.<br>response time: faster than a parsec.'),
    scan: () => {
      const steps = ['spidering target ....', 'active scan ....', 'testing injection vectors ....',
        'evaluating auth boundaries ....'];
      steps.forEach((s, i) => setTimeout(() => print(s), 260 * i));
      setTimeout(() => print('<span class="r">2 HIGH</span>, 1 MEDIUM found. reported. remediated. as always.'), 260 * steps.length + 200);
    },
    tie: () => { window.__spawnTie(); window.__spawnTie(); print('patrol launched. look up.'); SFX.swoosh(.6); },
    jump: () => { GLField.hyperjump(1.5); SFX.swoosh(1.1); print('<span class="r">punch it.</span>'); },
    force: () => print('the Force is strong with this one. but the pipeline still needs green tests.'),
    vader: () => print('"I find your lack of input validation disturbing."'),
    yoda:  () => print('"Do. Or do not. There is no <span class="a">try { } catch { }</span>."'),
    r2d2:  () => print('<span class="a">beep-boop-whistle-BEEP</span> [translation unavailable]'),
    sudo:  () => print('<span class="r">permission denied.</span> this is an Imperial installation, not your laptop.'),
    ls:    () => print('projects/  dossier/  arsenal/  <span class="r">.secrets/</span>'),
    'cd .secrets': () => print('<span class="r">nice try.</span>'),
    clear: () => { out.innerHTML = ''; }
  };

  function render(){ inp.textContent = buf; }

  function submit(){
    const cmd = buf.trim().toLowerCase();
    print('<span class="term-ps">jha@datanet:~$</span> ' + (buf || ''));
    if (cmd){
      hist.unshift(buf); hi = -1;
      if (CMDS[cmd]) CMDS[cmd]();
      else print(`<span class="r">command not recognized:</span> ${escapeHtml(cmd)} — try <span class="a">help</span>`);
      SFX.blip(700, .05);
    }
    buf = ''; render();
  }

  const escapeHtml = s => s.replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

  term.addEventListener('click', () => term.focus());
  term.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace'){ e.preventDefault(); buf = buf.slice(0, -1); render(); SFX.blip(280, .02, 'square', .03); return; }
    if (e.key === 'ArrowUp'){ e.preventDefault(); if (hist.length){ hi = Math.min(hi + 1, hist.length - 1); buf = hist[hi]; render(); } return; }
    if (e.key === 'ArrowDown'){ e.preventDefault(); hi = Math.max(hi - 1, -1); buf = hi < 0 ? '' : hist[hi]; render(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey){
      e.preventDefault(); buf += e.key; render(); SFX.blip(380 + Math.random() * 160, .018, 'square', .028);
    }
  });

  print('<span class="a">IMPERIAL TERMINAL v4.77</span> — archive access granted.');
  print('type <span class="a">help</span> for the command index.');
})();

/* ============================================================
   11. KONAMI — order 66
   ============================================================ */
(() => {
  const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let i = 0;
  addEventListener('keydown', e => {
    i = (e.key === seq[i] || e.key.toLowerCase() === seq[i]) ? i + 1 : 0;
    if (i === seq.length){
      i = 0;
      GLField.hyperjump(1.6);
      SFX.swoosh(1.4);
      const b = document.createElement('div');
      b.textContent = 'EXECUTE ORDER 66';
      Object.assign(b.style, {
        position:'fixed', inset:'0', display:'grid', placeItems:'center', zIndex:'190',
        font:'900 clamp(24px,7vw,90px) Orbitron, sans-serif', letterSpacing:'.18em',
        color:'#ff2d2d', background:'rgba(5,1,2,.82)', textShadow:'0 0 60px #ff2d2d',
        pointerEvents:'none', transition:'opacity .7s'
      });
      document.body.appendChild(b);
      setTimeout(() => { b.style.opacity = '0'; setTimeout(() => b.remove(), 800); }, 1500);
    }
  });
})();

/* ============================================================
   12. GO
   ============================================================ */
$('#yr').textContent = new Date().getFullYear();
GLField.init();
Boot.run();

})();
