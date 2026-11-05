/*
 * augustine.io — the guides' signup forms.
 *
 * Posts to the email list at list.augustine.io as JSON. Without JavaScript the
 * same forms still work: they post straight to the API, which answers with a page.
 */
(function () {
  var API = 'https://list.augustine.io';

  var MESSAGES = {
    email: "That doesn't look like an email address.",
    rate: 'Too many tries from this connection. Try again in an hour.',
    send: 'Something went wrong sending it. Try again in a minute, or email yo@augustine.io.',
    token: 'That link has expired. Enter your email instead.',
    other: 'Something went wrong. Try again in a minute, or email yo@augustine.io.'
  };

  function post(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    });
  }

  function problem(result) {
    if (result.status === 400 && result.data.error === 'email') return 'email';
    if (result.status === 404) return 'token';
    if (result.status === 429) return 'rate';
    if (result.status === 502) return 'send';
    return 'other';
  }

  // opts.path: the API path. opts.body(form): the JSON to send.
  // opts.done(): show the success state. opts.failed(kind): optional, runs before the message shows.
  function wire(form, opts) {
    var button = form.querySelector('button[type="submit"]');
    var status = form.querySelector('.status');
    var label = button.textContent;

    function say(text, isError) {
      status.textContent = text;
      status.className = isError ? 'status error' : 'status';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // Bots fill the hidden field; they get the same success a person would.
      var trap = form.querySelector('input[name="website"]');
      if (trap && trap.value) { opts.done(); return; }
      var email = form.querySelector('input[type="email"]');
      if (email && email.required && !email.checkValidity()) { say(MESSAGES.email, true); email.focus(); return; }

      button.disabled = true;
      button.textContent = 'Sending…';
      say('', false);
      post(opts.path, opts.body(form)).then(function (result) {
        if (result.status === 200) { opts.done(); return; }
        var kind = problem(result);
        if (opts.failed) opts.failed(kind);
        say(MESSAGES[kind], true);
      }).catch(function () {
        say(MESSAGES.other, true);
      }).then(function () {
        button.disabled = false;
        button.textContent = label;
      });
    });
  }

  window.augustineSignup = { wire: wire };
})();
