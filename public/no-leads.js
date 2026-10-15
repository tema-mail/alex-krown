/* Копия сайта не принимает заявки (решение владельца 15.10.2026).
   1. Отправка формы и клик по кнопке «Отправить» ловятся на window в фазе
      захвата – раньше обработчиков Тильды, Zero-форм и плагинов Nolim.
   2. Запасной рубеж: запросы на приёмники заявок Тильды, Calltouch и загрузку файлов
      (XHR, fetch, sendBeacon, form.submit) не уходят.
   3. Рассрочка Т-Банка: клик по кнопке и вызов tinkoff.create перехвачены.
   Вместо отправки – строка внизу экрана. */
(function () {
  var LEAD = /forms\d?\.tilda(cdn|api)\.|tildaapi\.[a-z]+\/procces|calltouch|upwidget\.tilda|uploadcare|tinkoff|tbank/i;
  var SUBMIT = '.t-submit, .tn-form__submit, button[type="submit"], input[type="submit"]';
  /* рассрочка Т-Банка: кнопка вне формы, анкета открывается через window.tinkoff.create */
  var CREDIT = '.tkf-button';

  function notice() {
    var el = document.getElementById('no-leads-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'no-leads-notice';
      el.setAttribute('role', 'status');
      el.style.cssText =
        'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
        'max-width:calc(100% - 32px);padding:14px 20px;border-radius:12px;background:#111;color:#fff;' +
        'font:15px/1.4 Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);text-align:center';
      el.textContent = 'Это копия сайта: заявки пока не отправляются.';
      document.body.appendChild(el);
    }
    el.style.display = 'block';
    clearTimeout(notice.t);
    notice.t = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function stop(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    notice();
  }

  window.addEventListener('submit', stop, true);
  window.addEventListener(
    'click',
    function (e) {
      if (!e.target.closest) return;
      var btn = e.target.closest(SUBMIT);
      if ((btn && btn.closest('form, .t-form, .tn-form')) || e.target.closest(CREDIT)) stop(e);
    },
    true,
  );

  var open = XMLHttpRequest.prototype.open;
  var send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) {
    this.__lead = LEAD.test(String(url));
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__lead) return notice();
    return send.apply(this, arguments);
  };
  if (window.fetch) {
    var f = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : input && input.url;
      if (LEAD.test(String(url))) {
        notice();
        return Promise.reject(new Error('заявки отключены'));
      }
      return f.apply(this, arguments);
    };
  }
  if (navigator.sendBeacon) {
    var beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url) {
      return LEAD.test(String(url)) ? false : beacon.apply(null, arguments);
    };
  }
  /* скрипт forma.tinkoff.ru может загрузиться, но глобальный tinkoff заменён заглушкой,
     которую он не сможет перезаписать */
  var credit = { create: function () { notice(); }, createDemo: function () { notice(); } };
  try {
    Object.defineProperty(window, 'tinkoff', { get: function () { return credit; }, set: function () {}, configurable: false });
  } catch (e) {}
  var formSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (LEAD.test(this.action || '')) return notice();
    return formSubmit.apply(this, arguments);
  };
})();
