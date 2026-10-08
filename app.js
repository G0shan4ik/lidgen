(function () {
  'use strict';

  var CFG = window.LIDGEN_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.anonKey);

  var state = {
    session: null,
    profile: null,
    categories: [],
    addCategory: '',
    addDraft: { url: '', text: '' },
    period: 'day',
    customDays: 14,
    historyFilter: 'all'
  };

  var app = document.getElementById('app');
  var pageTitle = document.getElementById('pageTitle');
  var topUser = document.getElementById('topUser');
  var homeBtn = document.getElementById('homeBtn');
  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');
  var drawerList = document.getElementById('drawerList');
  var scrim = document.getElementById('scrim');
  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modalTitle');
  var modalBody = document.getElementById('modalBody');
  var modalInputWrap = document.getElementById('modalInputWrap');
  var modalInput = document.getElementById('modalInput');
  var modalOk = document.getElementById('modalOk');
  var modalCancel = document.getElementById('modalCancel');
  var toastEl = document.getElementById('toast');

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normUrl(t) {
    return String(t || '').trim().replace(/\/+$/, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  function skeleton() {
    app.innerHTML = '<div class="skel-wrap fade">' +
      '<div class="skel"></div><div class="skel"></div><div class="skel short"></div>' +
      '</div>';
  }

  function confirmDialog(title, body, okLabel, danger) {
    return askDialog(title, body, okLabel, danger, false).then(function (r) { return r.ok; });
  }

  function promptDialog(title, body, okLabel, danger, placeholder) {
    return askDialog(title, body, okLabel, danger, true, placeholder);
  }

  function askDialog(title, body, okLabel, danger, withInput, placeholder) {
    return new Promise(function (resolve) {
      modalTitle.textContent = title;
      modalBody.textContent = body;
      modalOk.textContent = okLabel || 'Подтвердить';
      modalOk.className = 'btn ' + (danger ? 'danger' : '');
      modalInputWrap.hidden = !withInput;
      modalInput.value = '';
      modalInput.placeholder = placeholder || '';
      modal.hidden = false;
      if (withInput) setTimeout(function () { modalInput.focus(); }, 60);
      function done(ok) {
        modal.hidden = true;
        modalOk.removeEventListener('click', onOk);
        modalCancel.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onScrim);
        modalInput.removeEventListener('keydown', onKey);
        resolve({ ok: ok, value: modalInput.value });
      }
      function onOk() { done(true); }
      function onCancel() { done(false); }
      function onScrim(e) { if (e.target === modal) done(false); }
      function onKey(e) { if (e.key === 'Enter' && withInput) done(true); }
      modalOk.addEventListener('click', onOk);
      modalCancel.addEventListener('click', onCancel);
      modal.addEventListener('click', onScrim);
      modalInput.addEventListener('keydown', onKey);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function logActivity(action, targetType, targetId, details) {
    if (!state.profile) return Promise.resolve();
    return sb.from('activity').insert({
      user_id: state.profile.id,
      user_name: state.profile.name,
      action: action,
      target_type: targetType || null,
      target_id: targetId || null,
      details: details || null
    }).then(function () {});
  }

  function leadContext(lead) {
    return lead.social_url + ' · ' + catName(lead.category_id);
  }

  function loadCategories() {
    return sb.from('categories').select('*').order('name').then(function (r) {
      if (r.error) throw r.error;
      state.categories = r.data || [];
      return state.categories;
    });
  }

  function catName(id) {
    for (var i = 0; i < state.categories.length; i++) {
      if (state.categories[i].id === id) return state.categories[i].name;
    }
    return '—';
  }

  function setTitle(t) { pageTitle.textContent = t; }
  function setTopUser() {
    topUser.textContent = state.profile ? (state.profile.name + (state.profile.role === 'admin' ? ' · админ' : '')) : '';
  }

  function openDrawer() {
    drawer.hidden = false;
    scrim.hidden = false;
    requestAnimationFrame(function () { drawer.classList.add('open'); });
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    scrim.hidden = true;
    setTimeout(function () { drawer.hidden = true; }, 220);
  }
  function renderDrawer() {
    if (!state.categories.length) {
      drawerList.innerHTML = '<div class="empty">Категорий пока нет.<br>Создай в меню «Создать категорию».</div>';
      return;
    }
    drawerList.innerHTML = state.categories.map(function (c) {
      return '<button class="drawer-item' + (state.addCategory === c.id ? ' active' : '') + '" data-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>';
    }).join('');
  }
  burger.addEventListener('click', function () { renderDrawer(); openDrawer(); });
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  drawerList.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]');
    if (!b) return;
    state.addCategory = b.getAttribute('data-cat');
    closeDrawer();
    render();
  });
  homeBtn.addEventListener('click', function () { go(''); });

  function go(hash) { location.hash = hash ? '/' + hash : '/'; }

  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    return { name: parts[0] || '', a: parts[1] || '', b: parts[2] || '' };
  }

  function start() {
    sb.auth.getSession().then(function (r) {
      state.session = r.data.session;
      if (!state.session) { go('login'); render(); return; }
      return loadProfile().then(function () {
        if (!location.hash || location.hash === '#/login') go('');
        render();
      });
    });
  }

  function loadProfile() {
    return sb.from('profiles').select('*').eq('id', state.session.user.id).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      state.profile = r.data;
      setTopUser();
      return state.profile;
    });
  }

  window.addEventListener('hashchange', render);

  function render() {
    if (!state.session || !state.profile) { renderLogin(); return; }
    var r = route();
    homeBtn.hidden = (r.name === '' || r.name === 'login');
    burger.hidden = r.name !== 'add';
    skeleton();
    loadCategories().then(function () {
      switch (r.name) {
        case '': renderMenu(); break;
        case 'add': renderAdd(); break;
        case 'delete': renderDeleteList(r.a); break;
        case 'edit': r.b ? renderEditForm(r.a, r.b) : renderEditList(r.a); break;
        case 'get': r.b ? renderGetLead(r.a, r.b) : renderGetList(r.a); break;
        case 'history': renderHistory(r.a); break;
        case 'categories': renderCategories(); break;
        case 'settings': renderSettings(); break;
        case 'stats': renderStats(); break;
        default: renderMenu();
      }
    }).catch(function (e) { app.innerHTML = '<div class="card err fade">' + esc(e.message) + '</div>'; });
  }

  function renderLogin() {
    setTitle('Вход');
    topUser.textContent = '';
    homeBtn.hidden = true;
    burger.hidden = true;
    app.innerHTML =
      '<div class="card fade" style="margin-top:8vh">' +
      '<h1 style="margin:0 0 4px;font-size:22px">LidGen</h1>' +
      '<div class="muted" style="margin-bottom:14px">База сообщений для лидов</div>' +
      '<label for="li">Логин</label><input id="li" autocomplete="username" autocapitalize="none">' +
      '<label for="lp">Пароль</label><input id="lp" type="password" autocomplete="current-password">' +
      '<div class="err" id="le"></div>' +
      '<button class="btn" id="lb">Войти</button>' +
      '</div>';
    document.getElementById('lb').addEventListener('click', doLogin);
    document.getElementById('lp').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  }

  function doLogin() {
    var login = document.getElementById('li').value.trim();
    var pass = document.getElementById('lp').value;
    var err = document.getElementById('le');
    err.textContent = '';
    if (!login || !pass) { err.textContent = 'Введи логин и пароль'; return; }
    sb.auth.signInWithPassword({ email: login + '@' + CFG.emailDomain, password: pass }).then(function (r) {
      if (r.error) { err.textContent = 'Неверный логин или пароль'; return; }
      state.session = r.data.session;
      return loadProfile().then(function () {
        if (!state.profile) { err.textContent = 'Профиль не найден, обратись к админу'; sb.auth.signOut(); state.session = null; return; }
        go('');
        render();
      });
    }).catch(function (e) { err.textContent = e.message; });
  }

  function unsentTotal() {
    return sb.from('leads').select('id', { count: 'exact', head: true }).is('sent_at', null).then(function (r) {
      return r.count || 0;
    });
  }

  function renderMenu() {
    setTitle('Главное меню');
    Promise.all([unsentTotal()]).then(function (res) {
      var unsent = res[0];
      var items = [
        ['add', '➕', 'Добавить лид', ''],
        ['delete', '🗑', 'Удалить лид', ''],
        ['edit', '✏️', 'Изменить лид', ''],
        ['get', '📨', 'Отправить сообщение', unsent ? 'к отправке: ' + unsent : ''],
        ['history', '🕘', 'История лидов', ''],
        ['categories', '🗂', 'Создать категорию', ''],
        ['stats', '📊', 'Статистика', ''],
        ['settings', '⚙️', 'Настройки', '']
      ];
      app.innerHTML = '<div class="menu-grid fade">' + items.map(function (i) {
        return '<button class="menubtn" data-go="' + i[0] + '"><span class="ico">' + i[1] + '</span>' +
          '<span style="flex:1">' + i[2] + '</span>' +
          (i[3] ? '<span class="cnt">' + i[3] + '</span>' : '') + '</button>';
      }).join('') + '</div>';
      app.querySelectorAll('[data-go]').forEach(function (b) {
        b.addEventListener('click', function () { go(b.getAttribute('data-go')); });
      });
    });
  }

  function findDup(url, exceptId) {
    var n = normUrl(url);
    var q = sb.from('leads').select('id, category_id, sent_at').eq('social_url_norm', n);
    if (exceptId) q = q.neq('id', exceptId);
    return q.maybeSingle().then(function (r) { return r.data; });
  }

  function renderAdd() {
    setTitle('Добавить лид');
    var cat = state.addCategory;
    app.innerHTML =
      '<div class="card fade">' +
      '<label>Категория</label>' +
      '<button class="btn ghost" id="pickCat" style="text-align:left">' +
      (cat ? '🗂 ' + esc(catName(cat)) : '☰ Выбрать категорию') + '</button>' +
      '<label for="fUrl">Ссылка на соцсеть</label>' +
      '<input id="fUrl" type="url" inputmode="url" placeholder="https://instagram.com/..." autocomplete="off">' +
      '<label for="fText">Текст сообщения</label>' +
      '<textarea id="fText" placeholder="Текст письма для этого лида"></textarea>' +
      '<div class="err" id="ae"></div>' +
      '<div class="btnrow">' +
      '<button class="btn" id="save">Сохранить</button>' +
      '<button class="btn ghost" id="back">Назад</button>' +
      '</div></div>';
    document.getElementById('pickCat').addEventListener('click', function () { renderDrawer(); openDrawer(); });
    document.getElementById('fUrl').value = state.addDraft.url;
    document.getElementById('fText').value = state.addDraft.text;
    document.getElementById('fUrl').addEventListener('input', function (e) { state.addDraft.url = e.target.value; });
    document.getElementById('fText').addEventListener('input', function (e) { state.addDraft.text = e.target.value; });
    document.getElementById('back').addEventListener('click', function () { go(''); });
    document.getElementById('save').addEventListener('click', function () {
      var url = document.getElementById('fUrl').value.trim();
      var text = document.getElementById('fText').value.trim();
      var err = document.getElementById('ae');
      err.textContent = '';
      if (!state.addCategory) { err.textContent = 'Выбери категорию (кнопка сверху)'; return; }
      if (!url) { err.textContent = 'Введи ссылку на соцсеть'; return; }
      if (!text) { err.textContent = 'Введи текст сообщения'; return; }
      findDup(url).then(function (dup) {
        if (dup) { err.textContent = 'Лид с такой ссылкой уже есть в категории «' + catName(dup.category_id) + '»'; return; }
        return sb.from('leads').insert({
          category_id: state.addCategory,
          social_url: url,
          social_url_norm: normUrl(url),
          message_text: text,
          created_by: state.profile.id
        }).select().then(function (r) {
          if (r.error) {
            err.textContent = String(r.error.message).indexOf('duplicate') > -1
              ? 'Лид с такой ссылкой уже существует'
              : r.error.message;
            return;
          }
          var lead = r.data[0];
          logActivity('lead_added', 'lead', lead.id, leadContext(lead));
          toast('Лид сохранён');
          state.addDraft = { url: '', text: '' };
          document.getElementById('fUrl').value = '';
          document.getElementById('fText').value = '';
        });
      });
    });
  }

  function categoryButtons(counts) {
    if (!state.categories.length) return '<div class="empty">Категорий пока нет.</div>';
    return state.categories.map(function (c) {
      return '<button class="catbtn" data-catgo="' + esc(c.id) + '"><span>' + esc(c.name) +
        '</span><span class="cnt">' + (counts && counts[c.id] !== undefined ? counts[c.id] : '') + '</span></button>';
    }).join('');
  }

  function leadCounts(onlyUnsent) {
    return sb.from('leads').select('category_id, sent_at').then(function (r) {
      var m = {};
      (r.data || []).forEach(function (l) {
        if (onlyUnsent && l.sent_at) return;
        m[l.category_id] = (m[l.category_id] || 0) + 1;
      });
      return m;
    });
  }

  function spoilerBlock(text, extraClass) {
    return '<div class="lead-spoiler ' + (extraClass || '') + '" data-spoiler>' + esc(text) + '</div>';
  }

  function spoilerStatic(text) {
    return '<div class="lead-spoiler static">' + esc(text) + '</div>';
  }

  function renderDeleteList(catId) {
    if (!catId) {
      setTitle('Удалить лид');
      leadCounts(false).then(function (counts) {
        app.innerHTML = '<div class="card fade">' + categoryButtons(counts) + '</div><button class="btn ghost" data-back>Назад</button>';
        bindCatGo('delete');
        bindBack();
      });
      return;
    }
    setTitle('Удалить: ' + catName(catId));
    sb.from('leads').select('*').eq('category_id', catId).order('created_at', { ascending: false }).then(function (r) {
      var leads = r.data || [];
      if (!leads.length) { app.innerHTML = '<div class="empty fade">В этой категории нет лидов.</div><button class="btn ghost" data-back>Назад</button>'; bindBack(); return; }
      app.innerHTML = '<div class="fade">' + leads.map(function (l) {
        return '<div class="lead ' + (l.sent_at ? 'is-sent' : 'is-new') + '">' +
          '<a class="lead-url" href="' + esc(l.social_url) + '" target="_blank" rel="noopener">' + esc(l.social_url) + '</a>' +
          spoilerBlock(l.message_text) +
          '<div class="lead-meta"><span>' + esc(fmtDate(l.created_at)) + '</span>' + (l.sent_at ? '<span class="sent-badge">письмо отправлено</span>' : '<span class="new-badge">не отправлено</span>') + '</div>' +
          '<div class="lead-actions"><button class="btn danger" data-del="' + esc(l.id) + '">Удалить</button></div>' +
          '</div>';
      }).join('') + '<button class="btn ghost" data-back>Назад</button></div>';
      bindBack();
      bindSpoilers();
      app.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-del');
          var lead = leads.find(function (x) { return x.id === id; });
          confirmDialog('Удалить лид?', lead.social_url + '\n\nЛид полностью исчезнет из базы, и ссылку можно будет использовать снова.', 'Удалить', true).then(function (ok) {
            if (!ok) return;
            sb.from('leads').delete().eq('id', id).then(function (d) {
              if (d.error) { toast('Ошибка: ' + d.error.message); return; }
              logActivity('lead_deleted', 'lead', id, leadContext(lead));
              toast('Лид удалён');
              renderDeleteList(catId);
            });
          });
        });
      });
    });
  }

  function renderEditList(catId) {
    if (!catId) {
      setTitle('Изменить лид');
      leadCounts(false).then(function (counts) {
        app.innerHTML = '<div class="card fade">' + categoryButtons(counts) + '</div><button class="btn ghost" data-back>Назад</button>';
        bindCatGo('edit');
        bindBack();
      });
      return;
    }
    setTitle('Изменить: ' + catName(catId));
    sb.from('leads').select('*').eq('category_id', catId).order('created_at', { ascending: false }).then(function (r) {
      var leads = r.data || [];
      if (!leads.length) { app.innerHTML = '<div class="empty fade">В этой категории нет лидов.</div><button class="btn ghost" data-back>Назад</button>'; bindBack(); return; }
      app.innerHTML = '<div class="fade">' + leads.map(function (l) {
        return '<div class="lead ' + (l.sent_at ? 'is-sent' : 'is-new') + '" data-openlead="' + esc(l.id) + '" style="cursor:pointer">' +
          '<span class="lead-url" style="pointer-events:none">' + esc(l.social_url) + '</span>' +
          spoilerStatic(l.message_text) +
          '</div>';
      }).join('') + '<button class="btn ghost" data-back>Назад</button></div>';
      bindBack();
      app.querySelectorAll('[data-openlead]').forEach(function (el) {
        el.addEventListener('click', function () { go('edit/' + catId + '/' + el.getAttribute('data-openlead')); });
      });
    });
  }

  function renderEditForm(catId, leadId) {
    setTitle('Редактирование лида');
    sb.from('leads').select('*').eq('id', leadId).maybeSingle().then(function (r) {
      var l = r.data;
      if (!l) { app.innerHTML = '<div class="empty fade">Лид не найден</div>'; return; }
      var oldText = l.message_text;
      var oldUrl = l.social_url;
      app.innerHTML =
        '<div class="card fade">' +
        '<label>Категория</label><select id="eCat">' +
        state.categories.map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (c.id === l.category_id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
        }).join('') + '</select>' +
        '<label for="eUrl">Ссылка на соцсеть</label><input id="eUrl" value="' + esc(l.social_url) + '">' +
        '<label for="eText">Текст сообщения</label><textarea id="eText">' + esc(l.message_text) + '</textarea>' +
        '<div class="err" id="ee"></div>' +
        '<div class="btnrow"><button class="btn" id="esave">Сохранить</button><button class="btn ghost" id="eback">Назад</button></div>' +
        '</div>';
      document.getElementById('eback').addEventListener('click', function () { go('edit/' + catId); });
      document.getElementById('esave').addEventListener('click', function () {
        var url = document.getElementById('eUrl').value.trim();
        var text = document.getElementById('eText').value.trim();
        var cat = document.getElementById('eCat').value;
        var err = document.getElementById('ee');
        err.textContent = '';
        if (!url || !text) { err.textContent = 'Ссылка и текст не могут быть пустыми'; return; }
        findDup(url, leadId).then(function (dup) {
          if (dup) { err.textContent = 'Лид с такой ссылкой уже есть в категории «' + catName(dup.category_id) + '»'; return; }
          var changed = [];
          if (normUrl(url) !== normUrl(oldUrl)) changed.push('ссылка: «' + short(oldUrl) + '» → «' + short(url) + '»');
          if (text !== oldText) changed.push('текст: «' + short(oldText) + '» → «' + short(text) + '»');
          if (cat !== l.category_id) changed.push('категория: «' + catName(l.category_id) + '» → «' + catName(cat) + '»');
          return sb.from('leads').update({
            social_url: url,
            social_url_norm: normUrl(url),
            message_text: text,
            category_id: cat,
            updated_at: new Date().toISOString(),
            updated_by: state.profile.id
          }).eq('id', leadId).then(function (u) {
            if (u.error) {
              err.textContent = String(u.error.message).indexOf('duplicate') > -1 ? 'Лид с такой ссылкой уже существует' : u.error.message;
              return;
            }
            var ctx = url + ' · ' + catName(cat);
            logActivity('lead_updated', 'lead', leadId, changed.length ? ctx + ' · было: ' + changed.join('; ') : ctx);
            toast('Изменения сохранены');
            go('edit/' + cat);
          });
        });
      });
    });
  }

  function short(s, n) {
    s = String(s || '').replace(/\s+/g, ' ');
    n = n || 40;
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function renderGetList(catId) {
    if (!catId) {
      setTitle('Отправить сообщение');
      Promise.all([leadCounts(true), unsentTotal()]).then(function (res) {
        var counts = res[0], total = res[1];
        app.innerHTML = '<div class="fade"><div class="card row-between"><span>Всего к отправке</span><b style="font-size:20px">' + total + '</b></div>' +
          '<div class="card">' + categoryButtons(counts) + '</div>' +
          '<button class="btn ghost" data-back>Назад</button></div>';
        bindCatGo('get');
        bindBack();
      });
      return;
    }
    setTitle('Отправить: ' + catName(catId));
    sb.from('leads').select('*').eq('category_id', catId).is('sent_at', null).order('created_at', { ascending: true }).then(function (r) {
      var leads = r.data || [];
      if (!leads.length) {
        app.innerHTML = '<div class="empty fade">Все лиды этой категории уже получили письмо.</div><button class="btn ghost" data-back>Назад</button>';
        bindBack(); return;
      }
      app.innerHTML = '<div class="fade">' + leads.map(function (l) {
        return '<div class="lead is-new" data-openlead="' + esc(l.id) + '" style="cursor:pointer">' +
          '<span class="lead-url" style="pointer-events:none">' + esc(l.social_url) + '</span>' +
          spoilerStatic(l.message_text) +
          '<div class="lead-meta"><span>создан ' + esc(fmtDate(l.created_at)) + '</span></div>' +
          '</div>';
      }).join('') + '<button class="btn ghost" data-back>Назад</button></div>';
      bindBack();
      app.querySelectorAll('[data-openlead]').forEach(function (el) {
        el.addEventListener('click', function () { go('get/' + catId + '/' + el.getAttribute('data-openlead')); });
      });
    });
  }

  function renderGetLead(catId, leadId) {
    setTitle('Лид');
    sb.from('leads').select('*').eq('id', leadId).maybeSingle().then(function (r) {
      var l = r.data;
      if (!l) { app.innerHTML = '<div class="empty fade">Лид не найден</div>'; return; }
      return sb.from('profiles').select('id, name').then(function (pr) {
        var map = {};
        (pr.data || []).forEach(function (p) { map[p.id] = p.name; });
        var author = map[l.created_by] || '';
        app.innerHTML =
          '<div class="card fade">' +
          '<div class="muted" style="margin-bottom:8px">' + esc(catName(l.category_id)) + '</div>' +
          '<a class="btn ghost" id="gUrl" href="' + esc(l.social_url) + '" target="_blank" rel="noopener" style="margin-bottom:12px">🔗 ' + esc(l.social_url) + '</a>' +
          '<label>Текст сообщения — нажми, чтобы скопировать</label>' +
          '<div class="copybox" id="gText">' + esc(l.message_text) + '</div>' +
          '<div class="lead-meta" style="margin:10px 0"><span>создан ' + esc(fmtDate(l.created_at)) + (author ? ' · ' + esc(author) : '') + '</span></div>' +
          '<button class="btn good" id="gSent">✅ Лид получил письмо</button>' +
          '<button class="btn ghost" data-back style="margin-top:10px">Назад</button>' +
          '</div>';
        bindBack();
        document.getElementById('gText').addEventListener('click', function () {
          copyText(l.message_text).then(function (ok) { toast(ok ? 'Текст скопирован' : 'Не удалось скопировать'); });
        });
        document.getElementById('gSent').addEventListener('click', function () {
          confirmDialog('Отметить отправленным?', 'Лид «' + l.social_url + '» из категории «' + catName(l.category_id) + '» будет помечен как получивший письмо и исчезнет из выдачи.', 'Да, получил', false).then(function (ok) {
            if (!ok) return;
            sb.from('leads').update({ sent_at: new Date().toISOString(), sent_by: state.profile.id }).eq('id', leadId).then(function (u) {
              if (u.error) { toast('Ошибка: ' + u.error.message); return; }
              logActivity('lead_sent', 'lead', leadId, leadContext(l));
              toast('Отмечено: лид получил письмо');
              go('get/' + catId);
            });
          });
        });
      });
    });
  }

  function renderHistory(catId) {
    if (!catId) {
      setTitle('История лидов');
      leadCounts(false).then(function (counts) {
        app.innerHTML = '<div class="card fade">' + categoryButtons(counts) + '</div><button class="btn ghost" data-back>Назад</button>';
        bindCatGo('history');
        bindBack();
      });
      return;
    }
    setTitle('История: ' + catName(catId));
    sb.from('leads').select('*').eq('category_id', catId).order('created_at', { ascending: false }).then(function (r) {
      var all = r.data || [];
      var leads = all.filter(function (l) {
        if (state.historyFilter === 'sent') return !!l.sent_at;
        if (state.historyFilter === 'unsent') return !l.sent_at;
        return true;
      });
      var chips = [['all', 'Все'], ['sent', 'Отправленные'], ['unsent', 'Не отправленные']];
      app.innerHTML = '<div class="fade">' +
        '<div class="chips">' + chips.map(function (c) {
          return '<button class="chip' + (state.historyFilter === c[0] ? ' active' : '') + '" data-hf="' + c[0] + '">' + c[1] + '</button>';
        }).join('') + '</div>' +
        (leads.length ? leads.map(function (l) {
          return '<div class="lead ' + (l.sent_at ? 'is-sent' : 'is-new') + '">' +
            '<a class="lead-url" href="' + esc(l.social_url) + '" target="_blank" rel="noopener">' + esc(l.social_url) + '</a>' +
            spoilerBlock(l.message_text) +
            '<div class="lead-meta"><span>создан ' + esc(fmtDate(l.created_at)) + '</span>' +
            (l.sent_at ? '<span class="sent-badge">отправлено ' + esc(fmtDate(l.sent_at)) + '</span>' : '<span class="new-badge">не отправлено</span>') +
            '</div></div>';
        }).join('') : '<div class="empty">Нет лидов по выбранному фильтру</div>') +
        '<button class="btn ghost" data-back>Назад</button></div>';
      bindBack();
      bindSpoilers();
      app.querySelectorAll('[data-hf]').forEach(function (b) {
        b.addEventListener('click', function () { state.historyFilter = b.getAttribute('data-hf'); renderHistory(catId); });
      });
    });
  }

  function renderCategories() {
    setTitle('Категории');
    leadCounts(false).then(function (counts) {
      app.innerHTML =
        '<div class="card fade">' +
        '<label for="nc">Новая категория</label>' +
        '<input id="nc" placeholder="Например: INST Барбершопы" autocomplete="off">' +
        '<div class="err" id="ce"></div>' +
        '<button class="btn" id="cadd">Создать категорию</button>' +
        '</div>' +
        '<div class="section-title">Существующие</div>' +
        (state.categories.length ? state.categories.map(function (c) {
          return '<div class="row-between card fade" style="margin-bottom:8px"><span>' + esc(c.name) +
            ' <span class="muted">(' + (counts[c.id] || 0) + ')</span></span>' +
            '<button class="btn danger" style="width:auto;padding:8px 14px;font-size:13px" data-cdel="' + esc(c.id) + '">Удалить</button></div>';
        }).join('') : '<div class="empty">Пока пусто</div>');
      document.getElementById('cadd').addEventListener('click', function () {
        var name = document.getElementById('nc').value.trim();
        var err = document.getElementById('ce');
        err.textContent = '';
        if (!name) { err.textContent = 'Введи название категории'; return; }
        sb.from('categories').insert({ name: name, created_by: state.profile.id }).select().then(function (r) {
          if (r.error) { err.textContent = r.error.message; return; }
          logActivity('category_created', 'category', r.data[0].id, name);
          toast('Категория создана');
          render();
        });
      });
      app.querySelectorAll('[data-cdel]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-cdel');
          confirmDialog('Удалить категорию?', catName(id) + '\nВместе с ней удалятся все её лиды (' + (counts[id] || 0) + ').', 'Удалить', true).then(function (ok) {
            if (!ok) return;
            sb.from('categories').delete().eq('id', id).then(function (d) {
              if (d.error) { toast('Ошибка: ' + d.error.message); return; }
              logActivity('category_deleted', 'category', id, catName(id));
              toast('Категория удалена');
              render();
            });
          });
        });
      });
    });
  }

  function renderSettings() {
    setTitle('Настройки');
    var isAdmin = state.profile.role === 'admin';
    sb.from('profiles').select('id, name, login, role, created_at').order('created_at').then(function (pr) {
      var users = pr.data || [];
      app.innerHTML =
        '<div class="card fade">' +
        '<div class="section-title" style="margin-top:0">Пользователь</div>' +
        '<div>Имя: <b>' + esc(state.profile.name) + '</b></div>' +
        '<div>Логин: <span class="mono">' + esc(state.profile.login) + '</span></div>' +
        '<div>Роль: ' + (isAdmin ? '<b>админ</b>' : 'пользователь') + '</div>' +
        '<label for="ownPass">Сменить свой пароль</label>' +
        '<input id="ownPass" type="text" placeholder="новый пароль, от 8 символов" autocomplete="off">' +
        '<button class="btn ghost" id="ownSave" style="margin-top:8px">Сменить мой пароль</button>' +
        '<div class="err" id="ownErr"></div>' +
        '<button class="btn ghost" id="logout" style="margin-top:14px">Выйти из аккаунта</button>' +
        '</div>' +
        (isAdmin ?
          '<div class="card fade">' +
          '<div class="section-title" style="margin-top:0">Создать пользователя</div>' +
          '<label for="un">Имя</label><input id="un" placeholder="Имя сотрудника" autocomplete="off">' +
          '<label for="ul">Логин</label><input id="ul" placeholder="login" autocapitalize="none" autocomplete="off">' +
          '<label for="up">Пароль</label><input id="up" type="text" placeholder="минимум 8 символов" autocomplete="off">' +
          '<div class="err" id="ue"></div>' +
          '<button class="btn" id="uadd">Создать</button>' +
          '<div class="hint">Передай логин и пароль лично. Других способов регистрации нет.</div>' +
          '</div>' +
          '<div class="card fade"><div class="section-title" style="margin-top:0">Пользователи</div>' +
          users.map(function (u) {
            return '<div class="userrow">' +
              '<div style="flex:1;min-width:0"><b>' + esc(u.name) + '</b> <span class="mono muted">' + esc(u.login) + '</span>' +
              '<div class="muted">' + (u.role === 'admin' ? 'админ' : 'пользователь') + '</div></div>' +
              '<div class="useracts">' +
              '<button class="btn ghost tiny" data-pw="' + esc(u.id) + '">Пароль</button>' +
              (u.role === 'admin' ? '' : '<button class="btn danger tiny" data-udel="' + esc(u.id) + '">Удалить</button>') +
              '</div></div>';
          }).join('') +
          '</div>'
          : '');

      document.getElementById('logout').addEventListener('click', function () {
        sb.auth.signOut().then(function () {
          state.session = null; state.profile = null;
          go('login'); render();
        });
      });
      document.getElementById('ownSave').addEventListener('click', function () {
        var p = document.getElementById('ownPass').value;
        var err = document.getElementById('ownErr');
        err.textContent = '';
        if (p.length < 8) { err.textContent = 'Пароль минимум 8 символов'; return; }
        sb.auth.updateUser({ password: p }).then(function (r) {
          if (r.error) { err.textContent = r.error.message; return; }
          logActivity('password_changed', 'user', state.profile.id, state.profile.login + ' (сам себе)');
          toast('Твой пароль изменён');
          document.getElementById('ownPass').value = '';
        });
      });

      if (isAdmin) {
        document.getElementById('uadd').addEventListener('click', function () {
          var name = document.getElementById('un').value.trim();
          var login = document.getElementById('ul').value.trim();
          var pass = document.getElementById('up').value;
          var err = document.getElementById('ue');
          err.textContent = '';
          if (!name || !login || !pass) { err.textContent = 'Заполни все три поля'; return; }
          sb.rpc('admin_create_user', { p_name: name, p_login: login, p_pass: pass }).then(function (r) {
            if (r.error) { err.textContent = r.error.message; return; }
            if (r.data && r.data.error) { err.textContent = r.data.error; return; }
            toast('Пользователь ' + login + ' создан');
            document.getElementById('un').value = '';
            document.getElementById('ul').value = '';
            document.getElementById('up').value = '';
            renderSettings();
          }).catch(function (e) { err.textContent = e.message; });
        });
        app.querySelectorAll('[data-pw]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-pw');
            var u = users.find(function (x) { return x.id === id; });
            promptDialog('Новый пароль', 'Пользователь: ' + u.name + ' (' + u.login + ')\nСессии пользователя будут завершены.', 'Сменить пароль', false, 'минимум 8 символов').then(function (res) {
              if (!res.ok) return;
              var p = res.value;
              if (p.length < 8) { toast('Пароль минимум 8 символов'); return; }
              sb.rpc('admin_set_password', { p_user_id: id, p_pass: p }).then(function (r) {
                var msg = r.error ? r.error.message : (r.data && r.data.error) ? r.data.error : null;
                if (msg) { toast('Ошибка: ' + msg); return; }
                toast('Пароль ' + u.login + ' изменён');
              });
            });
          });
        });
        app.querySelectorAll('[data-udel]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-udel');
            var u = users.find(function (x) { return x.id === id; });
            confirmDialog('Удалить пользователя?', u.name + ' (' + u.login + ')\nДоступ будет закрыт, его действия в ленте останутся без привязки.', 'Удалить', true).then(function (ok) {
              if (!ok) return;
              sb.rpc('admin_delete_user', { p_user_id: id }).then(function (r) {
                var msg = r.error ? r.error.message : (r.data && r.data.error) ? r.data.error : null;
                if (msg) { toast('Ошибка: ' + msg); return; }
                toast('Пользователь ' + u.login + ' удалён');
                renderSettings();
              });
            });
          });
        });
      }
    });
  }

  var PERIODS = [
    ['day', 'День'],
    ['3d', '3 дня'],
    ['week', 'Неделя'],
    ['month', 'Месяц'],
    ['custom', 'Свой диапазон'],
    ['all', 'Всё время']
  ];

  function periodStart(p, days) {
    var now = new Date();
    if (p === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (p === '3d') return new Date(now.getTime() - 3 * 86400000).toISOString();
    if (p === 'week') return new Date(now.getTime() - 7 * 86400000).toISOString();
    if (p === 'month') return new Date(now.getTime() - 30 * 86400000).toISOString();
    if (p === 'custom') return new Date(now.getTime() - (days || 1) * 86400000).toISOString();
    return null;
  }

  function renderStats() {
    setTitle('Статистика');
    var from = periodStart(state.period, state.customDays);
    var q = sb.from('activity').select('*').order('at', { ascending: false }).limit(500);
    if (from) q = q.gte('at', from);
    Promise.all([q, sb.from('profiles').select('id, name, login, role').order('name')]).then(function (res) {
      var rows = res[0].data || [];
      var users = res[1].data || [];
      var byUser = {};
      users.forEach(function (u) { byUser[u.name] = { added: 0, sent: 0 }; });
      rows.forEach(function (a) {
        var key = a.user_name || '—';
        if (!byUser[key]) byUser[key] = { added: 0, sent: 0 };
        if (a.action === 'lead_added') byUser[key].added++;
        if (a.action === 'lead_sent') byUser[key].sent++;
      });
      var names = Object.keys(byUser).sort();
      var isAdmin = state.profile.role === 'admin';
      var feedRows = rows.filter(function (a) { return a.action !== 'login'; });

      app.innerHTML =
        '<div class="fade">' +
        '<div class="chips">' + PERIODS.map(function (p) {
          return '<button class="chip' + (state.period === p[0] ? ' active' : '') + '" data-period="' + p[0] + '">' + p[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="card row-between" id="customBox" style="' + (state.period === 'custom' ? '' : 'display:none') + '">' +
        '<span class="muted">Дней:</span><input id="cdays" type="number" min="1" max="3650" value="' + esc(state.customDays) + '" style="width:90px">' +
        '<button class="btn ghost" id="capply" style="width:auto;padding:8px 14px">Применить</button></div>' +
        '<div class="card tablewrap"><table>' +
        '<tr><th>Кто</th><th class="n">Добавил лидов</th><th class="n">Отправил писем</th></tr>' +
        (names.length ? names.map(function (n) {
          var u = byUser[n];
          return '<tr' + (n === state.profile.name ? ' class="me"' : '') + '><td>' + esc(n) + '</td>' +
            '<td class="n">' + u.added + '</td><td class="n">' + u.sent + '</td></tr>';
        }).join('') : '<tr><td colspan="3" class="muted">Пользователей нет</td></tr>') +
        '</table></div>' +
        (isAdmin ?
          '<div class="section-title">Лента действий</div>' +
          '<div class="card"><ul class="feed">' +
          (feedRows.length ? feedRows.slice(0, 80).map(feedItem).join('') : '<li>За период действий нет</li>') +
          '</ul></div>'
          : '') +
        '</div>';

      app.querySelectorAll('[data-period]').forEach(function (b) {
        b.addEventListener('click', function () { state.period = b.getAttribute('data-period'); renderStats(); });
      });
      var capply = document.getElementById('capply');
      if (capply) capply.addEventListener('click', function () {
        var v = parseInt(document.getElementById('cdays').value, 10);
        state.customDays = isNaN(v) || v < 1 ? 1 : v;
        renderStats();
      });
    });
  }

  function feedItem(a) {
    var details = String(a.details || '');
    var main = details;
    var spoiler = '';
    var idx = details.indexOf(' · было: ');
    if (idx > -1) {
      main = details.slice(0, idx);
      spoiler = details.slice(idx + 3);
    }
    return '<li><b>' + esc(a.user_name || '—') + '</b> ' + esc(actionLabel(a.action)) +
      (main ? ' · ' + esc(main) : '') +
      (spoiler ? '<div class="feed-spoiler" data-spoiler>' + esc(spoiler) + '</div>' : '') +
      '<span class="when">' + esc(fmtDate(a.at)) + '</span></li>';
  }

  function actionLabel(a) {
    return ({
      lead_added: 'добавил(а) лид',
      lead_sent: 'отправил(а) письмо лиду',
      lead_updated: 'изменил(а) лид',
      lead_deleted: 'удалил(а) лид',
      category_created: 'создал(а) категорию',
      category_deleted: 'удалил(а) категорию',
      user_created: 'создал(а) пользователя',
      user_deleted: 'удалил(а) пользователя',
      password_changed: 'сменил(а) пароль',
      login: 'вошёл(ла)'
    })[a] || a;
  }

  function parentRoute() {
    var r = route();
    if (r.name === 'delete') return r.a ? 'delete' : '';
    if (r.name === 'edit') return r.b ? 'edit/' + r.a : (r.a ? 'edit' : '');
    if (r.name === 'get') return r.b ? 'get/' + r.a : (r.a ? 'get' : '');
    if (r.name === 'history') return r.a ? 'history' : '';
    return '';
  }

  function bindBack(target) {
    var t = target !== undefined ? target : parentRoute();
    app.querySelectorAll('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () { go(t); });
    });
  }
  function bindCatGo(prefix) {
    app.querySelectorAll('[data-catgo]').forEach(function (b) {
      b.addEventListener('click', function () { go(prefix + '/' + b.getAttribute('data-catgo')); });
    });
  }
  function bindSpoilers() {
    app.querySelectorAll('[data-spoiler]').forEach(function (s) {
      s.addEventListener('click', function (e) { e.stopPropagation(); s.classList.toggle('open'); });
    });
  }

  start();
})();
