/* Northern External Cleaning Co — small bits of behaviour.
   1. Mobile menu toggle
   2. Gallery filter buttons
   3. Quote form: builds a WhatsApp message from the fields and opens it.
      To switch to email delivery later, see README.md ("Quote form"). */

(function () {
  // Business details used by the form. Keep these in step with the HTML.
  var WHATSAPP_NUMBER = '447735894261'; // international format, no + or spaces

  // 1. Mobile menu
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // 2. Gallery filters
  var pills = document.querySelectorAll('[data-filter]');
  var figures = document.querySelectorAll('.tiles figure[data-cat]');
  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      var cat = pill.getAttribute('data-filter');
      pills.forEach(function (p) { p.classList.toggle('active', p === pill); p.setAttribute('aria-pressed', p === pill ? 'true' : 'false'); });
      figures.forEach(function (fig) {
        var cats = (fig.getAttribute('data-cat') || '').split(' ');
        fig.hidden = !(cat === 'all' || cats.indexOf(cat) !== -1);
      });
    });
  });

  // 3. Quote form -> WhatsApp
  var form = document.getElementById('quote-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      // If the form has a real action (e.g. Formspree), let it submit normally.
      if (form.getAttribute('action')) { return; }
      e.preventDefault();
      var get = function (name) { var el = form.elements[name]; return el && el.value ? el.value.trim() : ''; };
      var services = Array.prototype.slice.call(form.querySelectorAll('input[name="service"]:checked')).map(function (c) { return c.value; });
      var lines = [
        'Hi George, I\'d like a quote please.',
        'Name: ' + get('name'),
        'Phone: ' + get('phone'),
        get('email') ? 'Email: ' + get('email') : '',
        'Postcode: ' + get('postcode'),
        'Property: ' + get('property'),
        'Services: ' + (services.length ? services.join(', ') : 'not sure yet'),
        'How often: ' + get('frequency'),
        get('message') ? 'Notes: ' + get('message') : ''
      ].filter(Boolean);
      var url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
      window.open(url, '_blank', 'noopener');
      var note = document.getElementById('form-note');
      if (note) { note.textContent = 'WhatsApp should have opened with your details filled in. Just press send. If it did not open, call or text 07735 894261.'; }
    });
  }
})();
