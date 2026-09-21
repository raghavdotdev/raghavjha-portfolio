// Progress text while the (30-60s) request runs. The form works without this.
(function () {
  var form = document.getElementById('tailor-form');
  if (!form) return;
  var btn = document.getElementById('go');
  var status = document.getElementById('status');
  var steps = ['Reading the posting…', 'Matching it against your resume…', 'Rewording bullets…', 'Writing the cover letter…', 'Checking nothing was invented…', 'Rendering PDFs…', 'Almost there…'];
  form.addEventListener('submit', function () {
    btn.disabled = true;
    btn.textContent = 'Working…';
    var i = 0;
    status.textContent = steps[0];
    setInterval(function () { i = Math.min(i + 1, steps.length - 1); status.textContent = steps[i]; }, 7000);
  });
})();
