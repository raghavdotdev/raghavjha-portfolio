/* raghavjha.com — no dependencies */
(() => {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- entrance ---------- */
requestAnimationFrame(() => document.body.classList.add('ready'));

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
