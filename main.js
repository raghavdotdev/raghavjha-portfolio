/* raghavjha.com — astrophage field, Petrova line, parallax, reveals */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  var canvas = document.getElementById('stars');
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var scrollY = window.scrollY || 0;

    function rand(a, b) { return a + Math.random() * (b - a); }

    /* ------------------------------------------------------------
       ASTROPHAGE FIELD
       Three sharp depth layers of motes plus a near layer rendered
       as out-of-focus bokeh — the look of flying into the cloud,
       where the close grains blur out and the far ones stay pins.
       ------------------------------------------------------------ */

    var grains = [];   // sharp, far/mid
    var bokeh  = [];   // soft, near

    // astrophage runs red; a few cold stars survive behind it
    var HOT  = ['255,96,74', '255,124,92', '255,162,120', '255,196,158'];
    var COLD = ['206,224,255', '255,255,255'];

    var LAYERS = [
      { count: 0.00075, r: [0.30, 0.75], a: [0.16, 0.44], drift:  4, par: 0.05, hot: 0.55 },
      { count: 0.00046, r: [0.50, 1.10], a: [0.28, 0.64], drift: 11, par: 0.16, hot: 0.78 },
      { count: 0.00016, r: [0.90, 1.70], a: [0.45, 0.92], drift: 22, par: 0.34, hot: 0.88 }
    ];

    function buildField() {
      grains = [];
      var area = W * H;

      for (var L = 0; L < LAYERS.length; L++) {
        var cfg = LAYERS[L];
        var n = Math.max(14, Math.round(area * cfg.count));
        for (var i = 0; i < n; i++) {
          grains.push({
            x: Math.random() * W,
            y: Math.random() * (H * 1.6),
            r: rand(cfg.r[0], cfg.r[1]),
            a: rand(cfg.a[0], cfg.a[1]),
            drift: cfg.drift,
            par: cfg.par,
            tint: Math.random() < cfg.hot
              ? HOT[(Math.random() * HOT.length) | 0]
              : COLD[(Math.random() * COLD.length) | 0],
            tw: Math.random() * Math.PI * 2,
            twSpeed: rand(0.5, 1.8)
          });
        }
      }

      // near-field bokeh: big, soft, slow-falling, barely there
      bokeh = [];
      var bn = Math.max(14, Math.round(area * 0.000052));
      for (var b = 0; b < bn; b++) {
        bokeh.push({
          x: Math.random() * W,
          y: Math.random() * (H * 1.5),
          r: rand(8, 30),
          a: rand(0.016, 0.050),
          drift: rand(16, 40),
          par: rand(0.45, 0.72),
          tint: HOT[(Math.random() * HOT.length) | 0],
          tw: Math.random() * Math.PI * 2,
          twSpeed: rand(0.25, 0.7)
        });
      }
    }

    function drawField(t) {
      var span, y, i, s, tw;

      // --- bokeh first, so sharp grains sit on top of the blur ---
      span = H * 1.5;
      for (i = 0; i < bokeh.length; i++) {
        s = bokeh[i];
        y = s.y + (scrollY * s.par) + (t * s.drift);
        y = ((y % span) + span) % span;
        if (y < -s.r || y > H + s.r) continue;

        tw = reduced ? 1 : 0.78 + 0.22 * Math.sin(s.tw + t * s.twSpeed);
        var bg = ctx.createRadialGradient(s.x, y, 0, s.x, y, s.r);
        bg.addColorStop(0.00, 'rgba(' + s.tint + ',' + (s.a * tw).toFixed(4) + ')');
        bg.addColorStop(0.55, 'rgba(' + s.tint + ',' + (s.a * tw * 0.62).toFixed(4) + ')');
        bg.addColorStop(0.86, 'rgba(' + s.tint + ',' + (s.a * tw * 0.24).toFixed(4) + ')');
        bg.addColorStop(1.00, 'rgba(' + s.tint + ',0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- sharp grains ---
      span = H * 1.6;
      for (i = 0; i < grains.length; i++) {
        s = grains[i];
        y = s.y - (scrollY * s.par) - (t * s.drift);
        y = ((y % span) + span) % span;
        if (y > H + 4) continue;

        tw = reduced ? 1 : 0.70 + 0.30 * Math.sin(s.tw + t * s.twSpeed);

        if (s.r > 1.3) {
          var R = s.r * 5;
          var g = ctx.createRadialGradient(s.x, y, 0, s.x, y, R);
          g.addColorStop(0, 'rgba(' + s.tint + ',' + (0.20 * tw).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(' + s.tint + ',0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, y, R, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = 'rgb(' + s.tint + ')';
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    /* ------------------------------------------------------------
       THE PETROVA LINE
       The dense core of the cloud, bowed right so it never crosses
       the copy; dimmed and swung further out on narrow screens.
       ------------------------------------------------------------ */

    var line = {};
    var trail = [];

    function buildLine() {
      var narrow = W < 820;
      line.dim = narrow ? 0.60 : 1;

      if (narrow) {
        line.x0 =  0.66 * W; line.y0 =  1.32 * H;
        line.cx =  1.92 * W; line.cy =  0.58 * H;
        line.x1 =  1.34 * W; line.y1 = -0.12 * H;
      } else {
        line.x0 = -0.02 * W; line.y0 =  1.36 * H;
        line.cx =  1.44 * W; line.cy =  0.60 * H;
        line.x1 =  1.02 * W; line.y1 = -0.26 * H;
      }
      line.sunX = line.x1; line.sunY = line.y1;

      trail = [];
      var n = Math.max(30, Math.round(W / 13));
      for (var i = 0; i < n; i++) {
        trail.push({
          t: Math.random(),
          v: rand(0.010, 0.032),
          r: rand(0.5, 1.6),
          a: rand(0.25, 0.9),
          off: rand(-11, 11)
        });
      }
    }

    function curveAt(t) {
      var u = 1 - t;
      return {
        x: u * u * line.x0 + 2 * u * t * line.cx + t * t * line.x1,
        y: u * u * line.y0 + 2 * u * t * line.cy + t * t * line.y1
      };
    }

    function drawPetrova(t, shift) {
      ctx.save();
      ctx.translate(0, -shift * 0.10);

      var bands = [[170, 0.028], [72, 0.042], [28, 0.062], [10, 0.100], [2.4, 0.210]];
      var breathe = reduced ? 1 : 0.88 + 0.12 * Math.sin(t * 0.42);

      for (var b = 0; b < bands.length; b++) {
        var grad = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
        grad.addColorStop(0.00, 'rgba(255,74,58,0)');
        grad.addColorStop(0.28, 'rgba(255,86,64,0.60)');
        grad.addColorStop(0.66, 'rgba(255,140,96,0.95)');
        grad.addColorStop(1.00, 'rgba(255,214,178,1)');

        ctx.globalAlpha = bands[b][1] * breathe * line.dim;
        ctx.strokeStyle = grad;
        ctx.lineWidth = bands[b][0];
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(line.x0, line.y0);
        ctx.quadraticCurveTo(line.cx, line.cy, line.x1, line.y1);
        ctx.stroke();
      }

      var sunR = Math.max(W, H) * 0.34;
      var sg = ctx.createRadialGradient(line.sunX, line.sunY, 0, line.sunX, line.sunY, sunR);
      sg.addColorStop(0.00, 'rgba(255,228,196,' + (0.40 * breathe * line.dim).toFixed(3) + ')');
      sg.addColorStop(0.16, 'rgba(255,150,96,' + (0.18 * breathe * line.dim).toFixed(3) + ')');
      sg.addColorStop(0.55, 'rgba(255,80,56,0.05)');
      sg.addColorStop(1.00, 'rgba(255,80,56,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(line.sunX, line.sunY, sunR, 0, Math.PI * 2);
      ctx.fill();

      for (var i = 0; i < trail.length; i++) {
        var m = trail[i];
        if (!reduced) { m.t += m.v * 0.016; if (m.t > 1) m.t -= 1; }
        var pt = curveAt(m.t);
        var pt2 = curveAt(Math.min(1, m.t + 0.01));
        var dx = pt2.x - pt.x, dy = pt2.y - pt.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var px = pt.x + (-dy / len) * m.off;
        var py = pt.y + (dx / len) * m.off;
        var fade = Math.sin(m.t * Math.PI);

        ctx.globalAlpha = m.a * fade * 0.9 * breathe * line.dim;
        ctx.fillStyle = 'rgba(255,182,138,1)';
        ctx.beginPath();
        ctx.arc(px, py, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* ---------- driver ---------- */

    function build() {
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildField();
      buildLine();
    }

    var t0 = performance.now();

    function render(t) {
      ctx.clearRect(0, 0, W, H);
      // additive: glows stack into haze instead of flatly overpainting
      ctx.globalCompositeOperation = 'lighter';
      drawPetrova(t, scrollY);
      drawField(t);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      render((now - t0) / 1000);
      requestAnimationFrame(frame);
    }

    build();

    if (reduced) {
      requestAnimationFrame(function () { render(0); });
    } else {
      requestAnimationFrame(frame);
    }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { build(); if (reduced) render(0); }, 180);
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
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    for (var j = 0; j < items.length; j++) io.observe(items[j]);

    document.querySelectorAll('.hero .stagger').forEach(function (el, k) {
      setTimeout(function () { el.classList.add('in'); }, 90 + k * 110);
    });
  }
})();
