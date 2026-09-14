/* raghavjha.com — no dependencies */
(() => {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- entrance ---------- */
requestAnimationFrame(() => document.body.classList.add('ready'));

/* ---------- starfield ----------
   Drawn once to a canvas and then only translated on scroll, so it costs
   nothing per frame. Three depth bands give it parallax without a loop. */
const Stars = (() => {
  const cvs = document.getElementById('stars');
  if (!cvs) return { parallax(){} };
  const ctx = cvs.getContext('2d');
  let h = 0, dpr = 1;

  const BANDS = [
    { count: 0.00016, r: [0.4, 0.9], a: [0.18, 0.42], speed: 0.04 },
    { count: 0.00010, r: [0.7, 1.3], a: [0.30, 0.62], speed: 0.09 },
    { count: 0.00004, r: [1.0, 1.9], a: [0.50, 0.92], speed: 0.16 }
  ];
  let bands = [];

  const rnd = (a, b) => a + Math.random() * (b - a);

  function build(){
    dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth;
    h = Math.round(innerHeight * 1.35);
    cvs.width  = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    cvs.style.height = h + 'px';

    bands = BANDS.map(b => {
      const n = Math.round(w * h * b.count);
      const list = [];
      for (let i = 0; i < n; i++){
        list.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: rnd(b.r[0], b.r[1]),
          a: rnd(b.a[0], b.a[1]),
          // a few stars get a faint warm or cool cast, like a real sky
          c: Math.random() < 0.12 ? (Math.random() < 0.5 ? '190,205,255' : '255,238,214') : '255,255,255'
        });
      }
      return { ...b, list };
    });

    draw();
  }

  function draw(){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    for (const band of bands){
      for (const s of band.list){
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.2832);
        ctx.fillStyle = `rgba(${s.c},${s.a})`;
        ctx.fill();
        if (s.r > 1.4){                       // the brightest few get a soft halo
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.2, 0, 6.2832);
          ctx.fillStyle = `rgba(${s.c},${s.a * 0.09})`;
          ctx.fill();
        }
      }
    }
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 180);
  }, { passive: true });

  build();

  return {
    parallax(y){
      if (REDUCED) return;
      // slowest band sets the drift; wraps so it never runs out of sky
      const offset = -(y * 0.14) % (h * 0.34);
      cvs.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
    }
  };
})();

/* ---------- scroll: nav state, progress bar, active link ---------- */
(() => {
  const nav = $('#nav');
  const bar = $('#progressBar');
  const links = $$('.nav-links a');
  const sections = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  let ticking = false;

  function update(){
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;

    nav.classList.toggle('solid', y > 8);
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    Stars.parallax(y);

    let current = null;
    for (const s of sections){
      if (s.getBoundingClientRect().top <= innerHeight * 0.35) current = s.id;
    }
    for (const a of links) a.classList.toggle('active', a.getAttribute('href') === '#' + current);

    ticking = false;
  }

  addEventListener('scroll', () => {
    if (!ticking){ ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
})();

/* ---------- reveal on scroll ---------- */
(() => {
  const items = $$('.reveal');
  if (REDUCED || !('IntersectionObserver' in window)){
    items.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries){
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
  items.forEach(el => io.observe(el));
})();

/* ---------- year ---------- */
$('#yr').textContent = new Date().getFullYear();

})();
