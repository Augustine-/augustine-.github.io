/*
 * augustine.io analytics — Google Analytics 4 (gtag) + PostHog
 *
 * Loaded on every page. Gives us:
 *   - pageviews per page / subpath (automatic in both)
 *   - outbound link clicks: github, linkedin, twitter, email
 *     (GA4 via "Enhanced measurement", PostHog via autocapture)
 *
 * Plus a custom `mondolla_setting_changed` event for the mondolla controls,
 * sent to both. The settings listeners are global but no-op on pages without
 * the lil-gui panel, so this one file is safe to include everywhere.
 */
(function () {
  var GA_ID = 'G-J0QNC4D9ND';
  var POSTHOG_TOKEN = 'phc_spL6csrfSs5LvVwuNCVd6ambLG3gVgJFxcvpLqcQkErM';

  // --- gtag bootstrap ---
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);

  // --- PostHog bootstrap ---
  // Loads the full library directly instead of the official inline stub;
  // events fired before load are dropped, which only affects the first
  // ~100ms of a visit. Pageviews/autocapture start on init regardless.
  var ph = document.createElement('script');
  ph.async = true;
  ph.crossOrigin = 'anonymous';
  ph.src = 'https://us-assets.i.posthog.com/static/array.js';
  ph.onload = function () {
    window.posthog.init(POSTHOG_TOKEN, {
      api_host: 'https://us.i.posthog.com',
      defaults: '2025-05-24'
    });
  };
  document.head.appendChild(ph);

  // --- mondolla: track changes to the lil-gui settings panel ---
  // The panel is built asynchronously by mondolla's bundle and the bundle
  // exposes nothing on window, so we listen at the document level and read
  // the control's label + value straight from the lil-gui DOM. Slider drags
  // don't fire a native `change`, so those are caught on pointer release.
  var lastFire = {};
  function emit(control, value) {
    if (typeof control !== 'string') return;
    var now = +new Date();
    if (lastFire[control] && now - lastFire[control] < 400) return; // de-dupe drag+change
    lastFire[control] = now;
    gtag('event', 'mondolla_setting_changed', {
      control: control,
      value: String(value)
    });
    if (window.posthog && window.posthog.capture) {
      window.posthog.capture('mondolla_setting_changed', {
        control: control,
        value: String(value)
      });
    }
  }
  function controllerOf(node) {
    return node && node.closest ? node.closest('.lil-controller') : null;
  }
  function labelOf(controller) {
    var n = controller.querySelector('.lil-name');
    return n ? n.textContent.trim() : 'unknown';
  }
  function valueOf(controller, target) {
    if (target && target.type === 'checkbox') return target.checked;
    var input = controller.querySelector('input, select');
    if (!input) return null;
    return input.type === 'checkbox' ? input.checked : input.value;
  }

  // dropdowns, checkboxes, and typed-number commits fire a native change
  document.addEventListener('change', function (e) {
    var c = controllerOf(e.target);
    if (c) emit(labelOf(c), valueOf(c, e.target));
  }, true);

  // sliders are mouse-driven — record the value when the drag ends, if it moved
  var dragCtl = null, dragStart = null;
  document.addEventListener('pointerdown', function (e) {
    var slider = e.target && e.target.closest ? e.target.closest('.lil-slider') : null;
    if (!slider) return;
    dragCtl = controllerOf(slider);
    dragStart = dragCtl ? valueOf(dragCtl, null) : null;
  }, true);
  document.addEventListener('pointerup', function () {
    if (!dragCtl) return;
    var now = valueOf(dragCtl, null);
    if (now !== dragStart) emit(labelOf(dragCtl), now);
    dragCtl = null; dragStart = null;
  }, true);
})();
