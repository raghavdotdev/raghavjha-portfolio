/* raghavjha.com — starfield, parallax, reveals */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- year ---------- */
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- starfield ---------- */
  var canvas = document.getElementById('stars');
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var stars = [];
    var scrollY = window.scrollY || 0;

    // three depth layers: far/dim/slow → near/bright/fast
    var LAYERS = [
      { count: 0.00022, r: [0.35, 0.85], a: [0.18, 0.45], drift: 0.010, par: 0.06 },
      { count: 0.00014, r: [0.55, 1.15], a: [0.32, 0.66], drift: 0.022, par: 0.16 },
      { count: 0.000045, r: [0.90, 1.65], a: [0.55, 1.00], drift: 0.042, par: 0.34 }
    ];

    var TINTS = ['255,255,255', '255,255,255', '210,228,255', '255,222,178', '186,206,255'];

    function rand(a, b) { return a + Math.random() * (b - a); }

    function build() {
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars = [];
      var area = W * H;
      for (var L = 0; L < LAYERS.length; L++) {
        var cfg = LAYERS[L];
        var n = Math.max(12, Math.round(area * cfg.count));
        for (var i = 0; i < n; i++) {
          stars.push({
            x: Math.random() * W,
            y: Math.random() * (H * 1.6),      // extra vertical room for parallax
            r: rand(cfg.r[0], cfg.r[1]),
            a: rand(cfg.a[0], cfg.a[1]),
            drift: cfg.drift,
            par: cfg.par,
            tint: TINTS[(Math.random() * TINTS.length) | 0],
            tw: Math.random() * Math.PI * 2,
            twSpeed: rand(0.6, 1.9)
          });
        }
      }
    }

    var t0 = performance.now();

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var y = s.y - (scrollY * s.par) - (t * s.drift * 26);
        // wrap within the extended field
        var span = H * 1.6;
        y = ((y % span) + span) % span;
        if (y > H + 4) continue;

        var twinkle = reduced ? 1 : 0.72 + 0.28 * Math.sin(s.tw + t * s.twSpeed);
        ctx.globalAlpha = s.a * twinkle;
        ctx.fillStyle = 'rgb(' + s.tint + ')';
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();

        // soft halo on the brightest near-layer stars
        if (s.r > 1.35) {
          var R = s.r * 5;
          var g = ctx.createRadialGradient(s.x, y, 0, s.x, y, R);
          g.addColorStop(0, 'rgba(' + s.tint + ',' + (0.22 * twinkle).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(' + s.tint + ',0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, y, R, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }

    build();

    if (reduced) {
      // single static render
      requestAnimationFrame(function (n) {
        var t = 0;
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < stars.length; i++) {
          var s = stars[i];
          var y = s.y % H;
          ctx.globalAlpha = s.a;
          ctx.fillStyle = 'rgb(' + s.tint + ')';
          ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    } else {
      requestAnimationFrame(frame);
    }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(build, 180);
    });

    window.addEventListener('scroll', function () {
      scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }, { passive: true });
  }

  /* ---------- scroll progress + sticky nav ---------- */
  var bar = document.getElementById('progressBar');
  var nav = document.getElementById('nav');

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    if (nav) nav.classList.toggle('stuck', y > 12);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- reveals ---------- */
  var items = document.querySelectorAll('.reveal, .stagger');

  if (!('IntersectionObserver' in window) || reduced) {
    for (var i = 0; i < items.length; i++) items[i].classList.add('in');
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    for (var j = 0; j < items.length; j++) io.observe(items[j]);

    // hero staggers in on load rather than on scroll
    var hero = document.querySelectorAll('.hero .stagger');
    hero.forEach(function (el, k) {
      setTimeout(function () { el.classList.add('in'); }, 90 + k * 110);
    });
  }
})();
