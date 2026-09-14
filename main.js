/* ============================================================
   DEEP SPACE DATANET — main.js
   no frameworks, no dependencies.
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
   1. STARFIELD — one cheap fullscreen shader
   ============================================================ */
const GLField = (() => {
  const cvs = $('#gl');
  let gl, prog, uni = {}, raf = 0, t0 = performance.now();
  let push = 0;                      // brief zoom on nav jump
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let quality = 1, fAvg = 16, fLast = performance.now(), fCount = 0, paused = false;

  const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

  /* 5 layers x 9 cells, single sample per layer — roughly a fifth of the
     work of the original, which is what was eating the scroll budget. */
  const FS = `
precision mediump float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_push;
uniform vec2  u_mouse;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 233.53));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float star(vec2 uv, float flare){
  float d = length(uv);
  float m = 0.028 / d;
  float rays = max(0.0, 1.0 - abs(uv.x * uv.y * 1100.0));
  m += rays * flare;
  m *= smoothstep(0.8, 0.15, d);
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
      float s = star(gv - off - vec2(n, fract(n * 34.0)) + 0.5, smoothstep(0.88, 1.0, size) * 0.45);
      vec3 c = mix(vec3(1.0, 0.96, 0.90), vec3(0.52, 0.76, 1.0), fract(n * 2145.32));
      c = mix(c, vec3(0.72, 0.90, 1.0), fract(n * 91.2) * 0.5);
      col += s * size * c;
    }
  }
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  uv *= 1.0 - u_push * 0.45;
  vec2 m = u_mouse * 0.22;
  float t = u_time * 0.035;

  vec3 col = vec3(0.0);
  for(int L = 0; L < 5; L++){
    float i = float(L) / 5.0;
    float depth = fract(i + t);
    float scale = mix(14.0, 0.35, depth);
    float fade  = depth * smoothstep(1.0, 0.86, depth);
    col += starLayer(uv * scale + i * 453.2 - m) * fade;
  }
  col *= 1.6;

  float r = length(uv);
  col += vec3(0.07, 0.20, 0.40) * (0.055 / (r * r + 0.24));
  col += vec3(0.05, 0.09, 0.19) * smoothstep(1.3, 0.1, r);
  col += vec3(0.85, 0.95, 1.0) * pow(u_push, 3.0) * 0.4;

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
      gl = cvs.getContext('webgl', { antialias:false, alpha:false, depth:false, stencil:false,
        powerPreference:'high-performance' });
    } catch(e){ gl = null; }
    if (!gl) { fallback(); return false; }

    const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { fallback(); return false; }
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fallback(); return false; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    uni.res   = gl.getUniformLocation(prog, 'u_res');
    uni.time  = gl.getUniformLocation(prog, 'u_time');
    uni.push  = gl.getUniformLocation(prog, 'u_push');
    uni.mouse = gl.getUniformLocation(prog, 'u_mouse');

    resize();
    addEventListener('resize', resize, { passive:true });
    document.addEventListener('visibilitychange', () => {
      paused = document.hidden;
      if (!paused){ fLast = performance.now(); loop(); }
    });
    loop();
    return true;
  }

  function fallback(){
    cvs.style.display = 'none';
    document.body.style.background =
      'radial-gradient(125% 95% at 50% 30%, #0a1e38, #03060d 62%)';
  }

  function resize(){
    if (!gl) return;
    // capped at 1x: the shader is fill-rate bound, and retina doubles the cost
    // for detail nobody can see through a vignette.
    const dpr = Math.min(devicePixelRatio || 1, 1) * quality;
    const w = Math.max(1, Math.floor(innerWidth * dpr));
    const h = Math.max(1, Math.floor(innerHeight * dpr));
    if (cvs.width !== w || cvs.height !== h){ cvs.width = w; cvs.height = h; }
    gl.viewport(0, 0, w, h);
  }

  function loop(){
    if (paused){ raf = 0; return; }
    raf = requestAnimationFrame(loop);

    const now = performance.now();
    const dt = now - fLast; fLast = now;
    fAvg = lerp(fAvg, dt, 0.05);
    if (++fCount > 120){
      fCount = 0;
      if (fAvg > 24 && quality > 0.55){ quality = Math.max(0.55, quality - 0.15); resize(); }
      else if (fAvg < 15 && quality < 1){ quality = Math.min(1, quality + 0.15); resize(); }
    }

    push *= 0.92;
    if (push < 0.002) push = 0;

    gl.uniform2f(uni.res, cvs.width, cvs.height);
    gl.uniform1f(uni.time, REDUCED ? 0 : (now - t0) / 1000);
    gl.uniform1f(uni.push, push);
    mouse.x = lerp(mouse.x, mouse.tx, 0.04);
    mouse.y = lerp(mouse.y, mouse.ty, 0.04);
    gl.uniform2f(uni.mouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    init,
    jump: (a = 0.85) => { if (!REDUCED) push = a; },
    look: (x, y) => { mouse.tx = x; mouse.ty = y; }
  };
})();

/* ============================================================
   2. SOUND — synthesized, off by default
   ============================================================ */
const SFX = (() => {
  let ctx = null, master = null, hum = null, on = false;

  function ensure(){
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    return ctx;
  }

  function startHum(){
    if (!ctx || hum) return;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 250; lp.Q.value = 5;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 52;
    const o2 = ctx.createOscillator(); o2.type = 'sine';     o2.frequency.value = 78.3;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.15;
    const lfoG = ctx.createGain(); lfoG.gain.value = 8;
    lfo.connect(lfoG); lfoG.connect(o1.frequency);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
    o1.start(); o2.start(); lfo.start();
    hum = true;
  }

  function blip(freq = 660, dur = 0.06, type = 'square', vol = 0.07){
    if (!on || !ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function swoosh(dur = 0.7){
    if (!on || !ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(320, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + dur * 0.7);
    const g = ctx.createGain(); g.gain.value = 0.14;
    src.connect(bp); bp.connect(g); g.connect(master); src.start();
  }

  function toggle(){
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    on = !on;
    startHum();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(on ? 0.85 : 0, ctx.currentTime + 0.35);
    if (on) blip(880, .07);
    return on;
  }

  return { toggle, blip, swoosh, isOn: () => on };
})();

/* ============================================================
   3. BOOT — short, and only once per browser session
   ============================================================ */
const Boot = (() => {
  const el = $('#boot'), log = $('#bootLog');
  const LINES = [
    'DEEP SPACE DATANET // NODE 7734',
    'subspace link .... <b>OK</b>',
    'decrypting personnel archive ....',
    'match: <b>JHA, RAGHAV</b> — clearance OMEGA',
    '<span class="ok">ARCHIVE UNSEALED.</span>'
  ];
  let done = false;

  function seen(){
    try { return sessionStorage.getItem('idn_boot') === '1'; } catch(e){ return false; }
  }
  function mark(){
    try { sessionStorage.setItem('idn_boot', '1'); } catch(e){}
  }

  function finish(){
    if (done) return; done = true;
    mark();
    el.classList.add('gone');
    document.body.classList.remove('locked');
    setTimeout(() => { el.remove(); Hero.start(); }, 650);
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function run(){
    if (seen() || REDUCED){ el.remove(); document.body.classList.remove('locked'); Hero.start(); return; }
    document.body.classList.add('locked');
    for (const txt of LINES){
      const line = document.createElement('div');
      line.innerHTML = '<span class="ok">›</span> ' + txt;
      log.appendChild(line);
      SFX.blip(420 + Math.random() * 400, .03, 'square', .04);
      await wait(230);
    }
    await wait(420);
    finish();
  }

  // any interaction skips straight through
  ['click','keydown','touchstart','wheel'].forEach(ev =>
    addEventListener(ev, () => { if (!done) finish(); }, { once:false, passive:true }));

  return { run };
})();

/* ============================================================
   4. HERO
   ============================================================ */
const Hero = (() => {
  const tw = $('.tw');
  let started = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function typeLoop(){
    const words = tw.dataset.words.split('|');
    let i = 0;
    for(;;){
      const w = words[i % words.length];
      for (let c = 1; c <= w.length; c++){ tw.textContent = w.slice(0, c); await sleep(45); }
      await sleep(2000);
      for (let c = w.length; c >= 0; c--){ tw.textContent = w.slice(0, c); await sleep(22); }
      await sleep(260);
      i++;
    }
  }

  function start(){
    if (started) return; started = true;
    if (REDUCED){ tw.textContent = 'SECURITY ENGINEER'; return; }
    typeLoop();
  }
  return { start };
})();

/* ============================================================
   5. SCROLL — one rAF-batched handler for everything
   ============================================================ */
(() => {
  const nav = $('#nav'), saberFill = $('#saberFill'), hudPct = $('#hudPct');
  const links = $$('.nav-links a');
  const sections = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  const track = $('#crawlTrack'), crawlText = $('#crawlText');
  let ticking = false, crawlBox = null, textH = 0;

  function measure(){
    if (!track) return;
    crawlBox = { top: track.offsetTop, h: track.offsetHeight };
    textH = crawlText ? crawlText.offsetHeight : 0;
  }
  measure();
  addEventListener('resize', () => { measure(); onScroll(); }, { passive:true });
  addEventListener('load', () => { measure(); onScroll(); });

  function onScroll(){
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? clamp(y / max, 0, 1) : 0;

    nav.classList.toggle('solid', y > 40);
    saberFill.style.transform = 'scaleY(' + pct.toFixed(4) + ')';
    hudPct.textContent = String(Math.round(pct * 100)).padStart(3, '0');

    // crawl advances with the scrollbar — the reader sets the pace
    if (crawlBox && crawlText && !REDUCED){
      const span = crawlBox.h - innerHeight;
      const p = clamp((y - crawlBox.top) / (span || 1), 0, 1);
      const startY = innerHeight * 0.62;
      const endY   = -(textH + innerHeight * 0.15);
      crawlText.style.transform =
        'rotateX(24deg) translate3d(0,' + lerp(startY, endY, p).toFixed(1) + 'px,0)';
    }

    let cur = null;
    for (const s of sections){
      if (s.getBoundingClientRect().top <= innerHeight * 0.42) cur = s.id;
    }
    for (const a of links) a.classList.toggle('active', a.getAttribute('href') === '#' + cur);

    ticking = false;
  }

  addEventListener('scroll', () => {
    if (!ticking){ ticking = true; requestAnimationFrame(onScroll); }
  }, { passive:true });
  onScroll();

  // reveals
  const io = new IntersectionObserver(entries => {
    for (const e of entries){
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      $$('.bar', e.target).forEach((b, i) => {
        setTimeout(() => {
          b.style.setProperty('--w', (+b.dataset.v / 100).toFixed(3));
          b.classList.add('lit');
        }, 70 * i);
      });
      io.unobserve(e.target);
    }
  }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  // radar animates only while on screen
  new IntersectionObserver(es => {
    for (const e of es) e.isIntersecting ? Radar.play() : Radar.stop();
  }, { threshold: .2 }).observe($('#radar'));
})();

/* ============================================================
   6. NAV
   ============================================================ */
(() => {
  const menuBtn = $('#menuBtn'), linksWrap = $('.nav-links');
  menuBtn.addEventListener('click', () => {
    const open = linksWrap.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
    SFX.blip(open ? 700 : 470, .05);
  });

  $$('[data-nav]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (!id || !id.startsWith('#')) return;
    const target = id === '#top' ? null : $(id);
    if (id !== '#top' && !target) return;
    e.preventDefault();
    linksWrap.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    GLField.jump(.7);
    SFX.swoosh(.45);
    const top = id === '#top' ? 0 : target.getBoundingClientRect().top + scrollY - 52;
    scrollTo({ top, behavior: REDUCED ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
  }));

  const sfxBtn = $('#sfxBtn');
  sfxBtn.addEventListener('click', () => {
    const on = SFX.toggle();
    sfxBtn.setAttribute('aria-pressed', String(on));
    sfxBtn.querySelector('.sfx-on').textContent = on ? '◉ SFX' : '○ SFX';
  });

  if (!COARSE){
    addEventListener('pointermove', e => {
      GLField.look((e.clientX / innerWidth - .5) * 2, -(e.clientY / innerHeight - .5) * 2);
    }, { passive:true });
  }
})();

/* ============================================================
   7. RADAR
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

  const pt = (i, r) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / N);
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
  };

  function draw(sweep){
    ctx.clearRect(0, 0, 440, 440);
    ctx.lineWidth = 1;

    for (let k = 1; k <= 4; k++){
      ctx.beginPath();
      for (let i = 0; i <= N; i++){ const [x, y] = pt(i % N, R * k / 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,45,45,' + (0.08 + k * 0.03) + ')';
      ctx.stroke();
    }

    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < N; i++){
      const [x, y] = pt(i, R);
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(255,45,45,.14)'; ctx.stroke();
      const [lx, ly] = pt(i, R + 30);
      ctx.fillStyle = 'rgba(196,172,172,.82)';
      ctx.fillText(AX[i][0], lx, ly);
    }

    ctx.beginPath();
    for (let i = 0; i < N; i++){
      const [x, y] = pt(i, R * AX[i][1] * p);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(CX, CY, 8, CX, CY, R);
    g.addColorStop(0, 'rgba(255,45,45,.42)');
    g.addColorStop(1, 'rgba(255,45,45,.09)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 2; ctx.stroke();

    for (let i = 0; i < N; i++){
      const [x, y] = pt(i, R * AX[i][1] * p);
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    }

    if (sweep){
      const a = -Math.PI / 2 + (performance.now() / 1800) % (Math.PI * 2);
      const sg = ctx.createLinearGradient(CX, CY, CX + Math.cos(a) * R, CY + Math.sin(a) * R);
      sg.addColorStop(0, 'rgba(255,45,45,0)'); sg.addColorStop(1, 'rgba(255,90,90,.45)');
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
      ctx.strokeStyle = sg; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function loop(){
    p = Math.min(1, p + 0.02);
    draw(!REDUCED);
    raf = requestAnimationFrame(loop);
  }

  return {
    play(){ if (!raf) { if (REDUCED){ p = 1; draw(false); return; } loop(); } },
    stop(){ if (raf){ cancelAnimationFrame(raf); raf = 0; } }
  };
})();

/* ============================================================
   8. CARD TILT — light touch
   ============================================================ */
if (!COARSE && !REDUCED){
  $$('[data-tilt]').forEach(card => {
    let queued = false, px = 0, py = 0;
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - .5;
      py = (e.clientY - r.top) / r.height - .5;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        card.style.transform =
          `perspective(1000px) rotateY(${(px * 5).toFixed(2)}deg) rotateX(${(-py * 5).toFixed(2)}deg)`;
        queued = false;
      });
    }, { passive:true });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}

/* ============================================================
   9. TERMINAL
   ============================================================ */
(() => {
  const term = $('#term'), out = $('#termOut'), inp = $('#termIn');
  let buf = '', hist = [], hi = -1;

  const print = (html) => {
    const d = document.createElement('div');
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
      '<span class="a">hire</span>      availability status<br>' +
      '<span class="a">scan</span>      run a security sweep<br>' +
      '<span class="a">jump</span>      engage hyperdrive<br>' +
      '<span class="a">clear</span>     wipe console'),
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
      'MSN-101  CYRAVENT platform ............... BUILDING<br>' +
      'MSN-600  FRDM-K66F realtime acquisition .. FIELD<br>' +
      'MSN-044  CNN + attention research ........ RESEARCH'),
    contact: () => print('<span class="a">raghavnjhaa@gmail.com</span> — channel open.'),
    hire: () => print('<span class="a">STATUS: OPEN</span> — security, fintech, embedded. graduating 2027.'),
    scan: () => {
      const steps = ['spidering target ....', 'active scan ....', 'testing injection vectors ....'];
      steps.forEach((s, i) => setTimeout(() => print(s), 240 * i));
      setTimeout(() => print('<span class="r">2 HIGH</span>, 1 MEDIUM found. reported. remediated.'), 240 * steps.length + 180);
    },
    jump: () => { GLField.jump(1); SFX.swoosh(.9); print('<span class="r">punch it.</span>'); },
    force: () => print('the Force is strong with this one. the pipeline still needs green tests.'),
    hyperspace: () => { GLField.jump(1); print('stand by ... coordinates locked.'); },
    yoda:  () => print('"Do. Or do not. There is no <span class="a">try { } catch { }</span>."'),
    r2d2:  () => print('<span class="a">beep-boop-whistle-BEEP</span> [translation unavailable]'),
    sudo:  () => print('<span class="r">permission denied.</span> you are not the captain of this vessel.'),
    ls:    () => print('projects/  dossier/  arsenal/  <span class="r">.secrets/</span>'),
    clear: () => { out.innerHTML = ''; }
  };

  const escapeHtml = s => s.replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

  const render = () => { inp.textContent = buf; };

  function submit(){
    const cmd = buf.trim().toLowerCase();
    print('<span class="term-ps">jha@datanet:~$</span> ' + escapeHtml(buf));
    if (cmd){
      hist.unshift(buf); hi = -1;
      if (CMDS[cmd]) CMDS[cmd]();
      else print('<span class="r">command not recognized:</span> ' + escapeHtml(cmd) + ' — try <span class="a">help</span>');
      SFX.blip(700, .04);
    }
    buf = ''; render();
  }

  term.addEventListener('click', () => term.focus());
  term.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace'){ e.preventDefault(); buf = buf.slice(0, -1); render(); return; }
    if (e.key === 'ArrowUp'){ e.preventDefault(); if (hist.length){ hi = Math.min(hi + 1, hist.length - 1); buf = hist[hi]; render(); } return; }
    if (e.key === 'ArrowDown'){ e.preventDefault(); hi = Math.max(hi - 1, -1); buf = hi < 0 ? '' : hist[hi]; render(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey){
      e.preventDefault(); buf += e.key; render();
      SFX.blip(380 + Math.random() * 140, .015, 'square', .022);
    }
  });

  print('<span class="a">NAVICOMP TERMINAL v4.77</span> — archive access granted.');
  print('type <span class="a">help</span> for the command index.');
})();

/* ============================================================
   10. GO
   ============================================================ */
$('#yr').textContent = new Date().getFullYear();
GLField.init();
Boot.run();

})();
