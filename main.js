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

      buildLine();
    }

    /* ---------- the Petrova line ----------
       A luminous arc of astrophage bending out from the star, the way it
       looks from the cupola. Drawn behind the stars, bowed toward the right
       so the headline column stays clear. */

    var line = {};
    var motes = [];

    function buildLine() {
      // anchored off-canvas at both ends, bowing out past the right edge.
      // on narrow screens it swings further right so it never crosses the copy.
      var narrow = W < 820;
      line.dim = narrow ? 0.62 : 1;

      if (narrow) {
        line.x0 =  0.66 * W;  line.y0 = 1.32 * H;
        line.cx =  1.92 * W;  line.cy = 0.58 * H;
        line.x1 =  1.34 * W;  line.y1 = -0.12 * H;
      } else {
        line.x0 = -0.02 * W;  line.y0 = 1.36 * H;
        line.cx =  1.44 * W;  line.cy = 0.60 * H;
        line.x1 =  1.02 * W;  line.y1 = -0.26 * H;
      }
      // the bright source sits just past the end of the curve
      line.sunX = line.x1; line.sunY = line.y1;

      motes = [];
      var n = Math.max(26, Math.round(W / 16));
      for (var i = 0; i < n; i++) {
        motes.push({
          t: Math.random(),
          v: rand(0.010, 0.030),          // travel toward the star
          r: rand(0.5, 1.5),
          a: rand(0.25, 0.85),
          off: rand(-7, 7)                 // scatter off the spine
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

      // layered strokes: wide + faint underneath, tight + bright on top
      var bands = [
        [150, 0.030], [64, 0.045], [26, 0.070], [9, 0.110], [2.2, 0.230]
      ];
      var breathe = reduced ? 1 : 0.88 + 0.12 * Math.sin(t * 0.42);

      for (var b = 0; b < bands.length; b++) {
        var grad = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
        grad.addColorStop(0.00, 'rgba(255,150,70,0)');
        grad.addColorStop(0.28, 'rgba(255,150,70,0.55)');
        grad.addColorStop(0.68, 'rgba(255,186,96,0.95)');
        grad.addColorStop(1.00, 'rgba(255,236,190,1)');

        ctx.globalAlpha = bands[b][1] * breathe * line.dim;
        ctx.strokeStyle = grad;
        ctx.lineWidth = bands[b][0];
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(line.x0, line.y0);
        ctx.quadraticCurveTo(line.cx, line.cy, line.x1, line.y1);
        ctx.stroke();
      }

      // the star at the far end
      var sunR = Math.max(W, H) * 0.34;
      var sg = ctx.createRadialGradient(line.sunX, line.sunY, 0, line.sunX, line.sunY, sunR);
      sg.addColorStop(0.00, 'rgba(255,244,214,' + (0.42 * breathe * line.dim).toFixed(3) + ')');
      sg.addColorStop(0.16, 'rgba(255,196,118,' + (0.17 * breathe * line.dim).toFixed(3) + ')');
      sg.addColorStop(0.55, 'rgba(255,150,70,0.045)');
      sg.addColorStop(1.00, 'rgba(255,150,70,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(line.sunX, line.sunY, sunR, 0, Math.PI * 2);
      ctx.fill();

      // astrophage drifting up the line toward the light
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        if (!reduced) {
          m.t += m.v * 0.016;
          if (m.t > 1) m.t -= 1;
        }
        var pt = curveAt(m.t);
        // perpendicular scatter so they don't sit on a perfect wire
        var pt2 = curveAt(Math.min(1, m.t + 0.01));
        var dx = pt2.x - pt.x, dy = pt2.y - pt.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var px = pt.x + (-dy / len) * m.off;
        var py = pt.y + (dx / len) * m.off;

        var fade = Math.sin(m.t * Math.PI);   // dim at both ends of the arc
        ctx.globalAlpha = m.a * fade * 0.9 * breathe * line.dim;
        ctx.fillStyle = 'rgba(255,214,150,1)';
        ctx.beginPath();
        ctx.arc(px, py, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    var t0 = performance.now();

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      drawPetrova(t, scrollY);

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
        ctx.clearRect(0, 0, W, H);
        drawPetrova(0, 0);
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
