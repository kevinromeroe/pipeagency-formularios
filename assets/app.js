/* Formulario de publicaciones · Datalítica
 * La cuenta sale de la página (/lci, /polar) y el código de acceso del enlace (#k=…).
 * Todo se guarda a través de la Edge Function `formulario` (Supabase). */
(function () {
  var CFG = {
    api: 'https://tidctfgcbzziiqnbjjer.supabase.co/functions/v1/formulario',
    apikey: 'sb_publishable_w9_HkfmW6ej1GxPFMvwV0A_usXTodfb',
    sitekey: '0x4AAAAAAF6CqCEKyCi1ZkaG'
  };
  var CUENTA = document.body.dataset.cuenta;
  var CODIGO = (location.hash.match(/k=([\w-]+)/) || [])[1] || '';
  try { if (CODIGO) sessionStorage.setItem('k:' + CUENTA, CODIGO); else CODIGO = sessionStorage.getItem('k:' + CUENTA) || ''; } catch (e) {}

  var ICON = {
    ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    tt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z"/></svg>',
    yt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/></svg>'
  };
  var NET = { ig: 'Instagram', tt: 'TikTok', yt: 'YouTube' };
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var state = { talentos: [], envios: [], token: '', widget: null, editando: null, recien: null };

  function api(body) {
    body.cuenta = CUENTA; body.codigo = CODIGO;
    return fetch(CFG.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.apikey },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'No pudimos conectarnos. Revisa tu conexión y vuelve a intentar.');
        return j;
      });
    }, function () { throw new Error('No pudimos conectarnos. Revisa tu conexión y vuelve a intentar.'); });
  }

  // Lectura del link en el navegador (el servidor vuelve a validarlo)
  function leer(u) {
    var s = (u || '').trim(), m;
    if (!s) return null;
    if ((m = s.match(/instagram\.com\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/i))) return { net: 'ig', fmt: m[1].toLowerCase() === 'p' ? 'Post' : 'Reel' };
    if ((m = s.match(/instagram\.com\/stories\/([\w.]+)\/(\d+)/i))) return { net: 'ig', fmt: 'Historia', who: '@' + m[1] };
    if ((m = s.match(/tiktok\.com\/@([\w.-]+)\/(?:video|photo)\/(\d+)/i))) return { net: 'tt', fmt: 'Video', who: '@' + m[1] };
    if (/(vt|vm)\.tiktok\.com\/\w+/i.test(s)) return { net: 'tt', fmt: 'Video' };
    if (/youtube\.com\/shorts\/[\w-]{6,}/i.test(s)) return { net: 'yt', fmt: 'Short' };
    if (/(youtube\.com\/watch\?(.*&)?v=|youtu\.be\/)[\w-]{6,}/i.test(s)) return { net: 'yt', fmt: 'Video' };
    return { bad: true };
  }

  function fecha(iso) { var d = new Date(iso); return d.getDate() + ' ' + MES[d.getMonth()]; }
  function nombre(id) { var t = state.talentos.filter(function (x) { return x.id === id; })[0]; return t ? t.nombre : 'Talento'; }

  function renderLista() {
    var box = $('sent');
    if (!state.envios.length) { box.innerHTML = '<p class="empty">Todavía no hay publicaciones enviadas. La primera que envíes aparece aquí.</p>'; return; }
    box.innerHTML = '<ul class="sent">' + state.envios.map(function (e) {
      var q = e.estado === 'en_cola';
      return '<li' + (e.id === state.recien ? ' class="new"' : '') + '><span class="net ' + e.red + '" role="img" aria-label="' + NET[e.red] + '">' + ICON[e.red] + '</span>' +
        '<span class="who"><b>' + esc(nombre(e.talento_id)) + '</b><small>' + esc(e.formato) + ' · enviada el ' + fecha(e.creado_en) + (e.salida_nueva ? '' : ' · complementa una salida') + '</small></span>' +
        '<span class="st ' + (q ? 'q' : 'm') + '">' + (q ? 'En cola' : 'Medida') + '</span>' +
        (q ? '<span class="acts"><button type="button" class="link-btn" data-edit="' + e.id + '">Corregir</button><button type="button" class="link-btn" data-del="' + e.id + '">Quitar</button></span>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function check() {
    var l = leer($('url').value);
    $('send').disabled = !(state.token && $('tal').value && l && !l.bad);
    $('wait').hidden = !!state.token;
  }

  function showRead() {
    var l = leer($('url').value), r = $('read');
    if (!l) { r.hidden = true; r.innerHTML = ''; return check(); }
    r.hidden = false;
    if (l.bad) { r.className = 'read bad'; r.innerHTML = '<p>Este link no es de Instagram, TikTok o YouTube. Copia el link desde el botón Compartir de la publicación.</p>'; return check(); }
    r.className = 'read';
    r.innerHTML = '<span class="net ' + l.net + '" aria-hidden="true">' + ICON[l.net] + '</span><dl>' +
      '<div><dt>Red</dt><dd>' + NET[l.net] + '</dd></div><div><dt>Formato</dt><dd>' + l.fmt + '</dd></div>' +
      (l.who ? '<div><dt>Cuenta</dt><dd>' + esc(l.who) + '</dd></div>' : '') +
      '<div><dt>Fecha y métricas</dt><dd>Las leemos nosotros</dd></div></dl>';
    check();
  }

  function resetForm() {
    $('f').reset(); state.editando = null; $('read').hidden = true;
    $('h-form').textContent = 'Enviar una publicación'; $('send').textContent = 'Enviar publicación'; $('cancel').hidden = true;
    $('ferr').hidden = true; check();
  }

  function editar(id) {
    var e = state.envios.filter(function (x) { return x.id === id; })[0]; if (!e) return;
    state.editando = id;
    $('tal').value = e.talento_id; $('url').value = e.link;
    document.querySelector('input[name=kind][value=' + (e.salida_nueva ? 'new' : 'add') + ']').checked = true;
    $('pay').value = e.valor_pagado_cop ? Number(e.valor_pagado_cop).toLocaleString('es-CO') : '';
    $('h-form').textContent = 'Corregir publicación'; $('send').textContent = 'Guardar cambios'; $('cancel').hidden = false;
    $('done').hidden = true; $('f').hidden = false; showRead(); $('tal').focus();
  }

  function newToken() { state.token = ''; check(); if (window.turnstile && state.widget !== null) window.turnstile.reset(state.widget); }

  function quitar(id) {
    if (!state.token) { alert('Espera a que termine la verificación y vuelve a intentar.'); return; }
    api({ accion: 'quitar', id: id, token: state.token }).then(function (j) {
      state.envios = j.envios; if (state.editando === id) resetForm(); renderLista();
    }).catch(function (e) { alert(e.message); }).then(newToken);
  }

  function submit(ev) {
    ev.preventDefault();
    if ($('send').disabled) return;
    var editing = state.editando;
    $('send').disabled = true; $('ferr').hidden = true;
    api({
      accion: editing ? 'corregir' : 'enviar', id: editing, token: state.token,
      talento: $('tal').value, link: $('url').value.trim(),
      salida_nueva: document.querySelector('input[name=kind]:checked').value === 'new',
      valor_pagado: $('pay').value
    }).then(function (j) {
      var t = nombre($('tal').value);
      state.envios = j.envios; state.recien = editing || (j.envios[0] && j.envios[0].id); renderLista();
      $('done-h').textContent = editing ? 'Cambios guardados' : 'Publicación enviada';
      $('done-p').textContent = editing
        ? 'Actualizamos la publicación de ' + t + '.'
        : 'Recibimos la publicación de ' + t + ' en ' + NET[j.red] + '. La medimos y aparece en el reporte en la próxima actualización.';
      resetForm(); $('f').hidden = true; $('done').hidden = false; $('again').focus();
    }).catch(function (e) {
      $('ferr').textContent = e.message; $('ferr').hidden = false;
    }).then(newToken);
  }

  function blocked(title, text) {
    $('app').innerHTML = '<div class="blocked"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p></div>';
  }

  window.onTurnstile = function () {
    state.widget = window.turnstile.render('#ts', {
      sitekey: CFG.sitekey, appearance: 'interaction-only', language: 'es',
      callback: function (t) { state.token = t; check(); },
      'expired-callback': function () { state.token = ''; check(); },
      'error-callback': function () { state.token = ''; check(); }
    });
  };

  function start() {
    if (!CODIGO) return blocked('Falta el código de acceso', 'Abre el formulario desde el enlace que te compartió Datalítica.');
    api({ accion: 'cargar' }).then(function (j) {
      var c = j.cuenta;
      document.title = 'Enviar publicaciones · ' + c.nombre;
      $('brand').innerHTML = (c.logo ? '<img src="../' + esc(c.logo) + '" alt="' + esc(c.nombre) + '">' : '<span class="wordmark">' + esc(c.nombre) + '</span>') +
        '<div><b>' + esc(c.nombre) + '</b>' + (c.campana ? '<small>' + esc(c.campana) + '</small>' : '') + '</div>';
      state.talentos = j.talentos; state.envios = j.envios;
      $('tal').innerHTML = '<option value="">Elige el talento</option>' + j.talentos.map(function (t) { return '<option value="' + t.id + '">' + esc(t.nombre) + '</option>'; }).join('');
      if (!j.talentos.length) { $('tal').disabled = true; $('tal').innerHTML = '<option>Todavía no hay talentos cargados</option>'; }
      renderLista();
      $('app').hidden = false; $('loading').hidden = true;
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstile'; s.async = true;
      document.head.appendChild(s);
    }).catch(function (e) { $('loading').hidden = true; $('app').hidden = false; blocked('No pudimos abrir el formulario', e.message); });

    $('url').addEventListener('input', showRead);
    $('tal').addEventListener('change', check);
    $('pay').addEventListener('input', function () { var d = $('pay').value.replace(/\D/g, '').slice(0, 11); $('pay').value = d ? Number(d).toLocaleString('es-CO') : ''; });
    $('f').addEventListener('submit', submit);
    $('cancel').addEventListener('click', resetForm);
    $('again').addEventListener('click', function () { state.recien = null; renderLista(); $('done').hidden = true; $('f').hidden = false; $('tal').focus(); });
    $('sent').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) editar(b.dataset.edit);
      if (b.dataset.del && confirm('¿Quitar esta publicación? No la mediremos.')) quitar(b.dataset.del);
    });
  }
  start();
})();
