(function () {
  'use strict';

  var CFG = window.LIDGEN_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.anonKey);

  var state = {
    session: null,
    profile: null,
    categories: [],
    addCategory: '',
    period: 'day'
  };

  var app = document.getElementById('app');
  var pageTitle = document.getElementById('pageTitle');
  var topUser = document.getElementById('topUser');
  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');
  var drawerList = document.getElementById('drawerList');
  var scrim = document.getElementById('scrim');
  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modalTitle');
  var modalBody = document.getElementById('modalBody');
  var modalOk = document.getElementById('modalOk');
  var modalCancel = document.getElementById('modalCancel');
  var toastEl = document.getElementById('toast');

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  function confirmDialog(title, body, okLabel, danger) {
    return new Promise(function (resolve) {
      modalTitle.textContent = title;
      modalBody.textContent = body;
      modalOk.textContent = okLabel || 'Подтвердить';
      modalOk.className = 'btn ' + (danger ? 'danger' : '');
      modal.hidden = false;
      function done(v) {
        modal.hidden = true;
        modalOk.removeEventListener('click', onOk);
        modalCancel.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onScrim);
        resolve(v);
      }
      function onOk() { done(true); }
      function onCancel() { done(false); }
      function onScrim(e) { if (e.target === modal) done(false); }
      modalOk.addEventListener('click', onOk);
      modalCancel.addEventListener('click', onCancel);
      modal.addEventListener('click', onScrim);
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

  function go(hash) { location.hash = hash; }

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
    if (!state.session) { renderLogin(); return; }
    if (!state.profile) { renderLogin(); return; }
    var r = route();
    burger.hidden = r.name !== 'add';
    loadCategories().then(function () {
      switch (r.name) {
        case '': renderMenu(); break;
        case 'add': renderAdd(); break;
        case 'delete': renderDeleteList(r.a); break;
        case 'edit': r.b ? renderEditForm(r.a, r.b) : renderEditList(r.a); break;
        case 'get': r.b ? renderGetLead(r.a, r.b) : renderGetList(r.a); break;
        case 'categories': renderCategories(); break;
        case 'settings': renderSettings(); break;
        case 'stats': renderStats(); break;
        default: renderMenu();
      }
    }).catch(function (e) { app.innerHTML = '<div class="card err">' + esc(e.message) + '</div>'; });
  }

  function renderLogin() {
    setTitle('Вход');
    topUser.textContent = '';
    burger.hidden = true;
    app.innerHTML =
      '<div class="card" style="margin-top:8vh">' +
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
        logActivity('login', 'session', null, null);
        go('');
        render();
      });
    }).catch(function (e) { err.textContent = e.message; });
  }

  function renderMenu() {
    setTitle('Главное меню');
    var items = [
      ['add', '➕', 'Добавить лид'],
      ['delete', '🗑', 'Удалить лид'],
      ['edit', '✏️', 'Изменить лид'],
      ['get', '📨', 'Получить лид'],
      ['categories', '🗂', 'Создать категорию'],
      ['stats', '📊', 'Статистика'],
      ['settings', '⚙️', 'Настройки']
    ];
    app.innerHTML = '<div class="menu-grid">' + items.map(function (i) {
      return '<button class="menubtn" data-go="' + i[0] + '"><span class="ico">' + i[1] + '</span>' + i[2] + '</button>';
    }).join('') + '</div>';
    app.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-go')); });
    });
  }

  function renderAdd() {
    setTitle('Добавить лид');
    var cat = state.addCategory;
    app.innerHTML =
      '<div class="card">' +
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
    document.getElementById('back').addEventListener('click', function () { go(''); });
    document.getElementById('save').addEventListener('click', function () {
      var url = document.getElementById('fUrl').value.trim();
      var text = document.getElementById('fText').value.trim();
      var err = document.getElementById('ae');
      err.textContent = '';
      if (!state.addCategory) { err.textContent = 'Выбери категорию (кнопка сверху)'; return; }
      if (!url) { err.textContent = 'Введи ссылку на соцсеть'; return; }
      if (!text) { err.textContent = 'Введи текст сообщения'; return; }
      sb.from('leads').insert({
        category_id: state.addCategory,
        social_url: url,
        message_text: text,
        created_by: state.profile.id
      }).select().then(function (r) {
        if (r.error) { err.textContent = r.error.message; return; }
        logActivity('lead_added', 'lead', r.data ? r.data[0].id : null, url);
        toast('Лид сохранён');
        document.getElementById('fUrl').value = '';
        document.getElementById('fText').value = '';
      });
    });
  }

  function categoryButtons(routeName, counts) {
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

  function renderDeleteList(catId) {
    if (!catId) {
      setTitle('Удалить лид');
      leadCounts(false).then(function (counts) {
        app.innerHTML = '<div class="card">' + categoryButtons('delete', counts) + '</div>';
        bindCatGo('delete');
      });
      return;
    }
    setTitle('Удалить: ' + catName(catId));
    sb.from('leads').select('*').eq('category_id', catId).order('created_at', { ascending: false }).then(function (r) {
      var leads = r.data || [];
      if (!leads.length) { app.innerHTML = '<div class="empty">В этой категории нет лидов.</div><button class="btn ghost" data-back>Назад</button>'; bindBack(); return; }
      app.innerHTML = leads.map(function (l) {
        return '<div class="lead">' +
          '<a class="lead-url" href="' + esc(l.social_url) + '" target="_blank" rel="noopener">' + esc(l.social_url) + '</a>' +
          '<div class="lead-spoiler" data-spoiler>' + esc(l.message_text) + '</div>' +
          '<div class="lead-meta"><span>' + esc(fmtDate(l.created_at)) + '</span>' + (l.sent_at ? '<span class="sent-badge">письмо отправлено</span>' : '') + '</div>' +
          '<div class="lead-actions"><button class="btn danger" data-del="' + esc(l.id) + '">Удалить</button></div>' +
          '</div>';
      }).join('') + '<button class="btn ghost" data-back>Назад</button>';
      bindBack();
      bindSpoilers();
      app.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-del');
          var lead = leads.find(function (x) { return x.id === id; });
          confirmDialog('Удалить лид?', lead.social_url + '\n\nДействие необратимо.', 'Удалить', true).then(function (ok) {
            if (!ok) return;
            sb.from('leads').delete().eq('id', id).then(function (d) {
              if (d.error) { toast('Ошибка: ' + d.error.message); return; }
              logActivity('lead_deleted', 'lead', id, lead.social_url);
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
        app.innerHTML = '<div class="card">' + categoryButtons('edit', counts) + '</div>';
        bindCatGo('edit');
      });
      return;
    }
    setTitle('Изменить: ' + catName(catId));
    sb.from('leads').select('*').eq('category_id', catId).order('created_at', { ascending: false }).then(function (r) {
      var leads = r.data || [];
      if (!leads.length) { app.innerHTML = '<div class="empty">В этой категории нет лидов.</div><button class="btn ghost" data-back>Назад</button>'; bindBack(); return; }
      app.innerHTML = leads.map(function (l) {
        return '<div class="lead" data-openlead="' + esc(l.id) + '" style="cursor:pointer">' +
          '<span class="lead-url" style="pointer-events:none">' + esc(l.social_url) + '</span>' +
          '<div class="lead-spoiler">' + esc(l.message_text) + '</div>' +
          '</div>';
      }).join('') + '<button class="btn ghost" data-back>Назад</button>';
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
      if (!l) { app.innerHTML = '<div class="empty">Лид не найден</div>'; return; }
      app.innerHTML =
        '<div class="card">' +
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
        sb.from('leads').update({
          social_url: url, message_text: text, category_id: cat,
          updated_at: new Date().toISOString(), updated_by: state.profile.id
        }).eq('id', leadId).then(function (u) {
          if (u.error) { err.textContent = u.error.message; return; }
          logActivity('lead_updated', 'lead', leadId, url);
          toast('Изменения сохранены');
          go('edit/' + cat);
        });
      });
    });
  }

  function renderGetList(catId) {
    if (!catId) {
      setTitle('Получить лид');
      leadCounts(true).then(function (counts) {
        app.innerHTML = '<div class="card">' + categoryButtons('get', counts) + '</div>';
        bindCatGo('get');
      });
      return;
    }
    setTitle('Получить: ' + catName(catId));
    sb.from('leads').select('*').eq('category_id', catId).is('sent_at', null).order('created_at', { ascending: true }).then(function (r) {
      var leads = r.data || [];
      if (!leads.length) {
        app.innerHTML = '<div class="empty">Все лиды этой категории уже получили письмо.</div><button class="btn ghost" data-back>Назад</button>';
        bindBack(); return;
      }
      app.innerHTML = leads.map(function (l) {
        return '<div class="lead" data-openlead="' + esc(l.id) + '" style="cursor:pointer">' +
          '<span class="lead-url" style="pointer-events:none">' + esc(l.social_url) + '</span>' +
          '<div class="lead-spoiler">' + esc(l.message_text) + '</div>' +
          '<div class="lead-meta"><span>создан ' + esc(fmtDate(l.created_at)) + '</span></div>' +
          '</div>';
      }).join('') + '<button class="btn ghost" data-back>Назад</button>';
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
      if (!l) { app.innerHTML = '<div class="empty">Лид не найден</div>'; return; }
      return sb.from('profiles').select('id, name').then(function (pr) {
        var map = {};
        (pr.data || []).forEach(function (p) { map[p.id] = p.name; });
        var author = map[l.created_by] || '';
      app.innerHTML =
        '<div class="card">' +
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
        confirmDialog('Отметить отправленным?', 'Лид «' + l.social_url + '» будет помечен как получивший письмо и исчезнет из выдачи.', 'Да, получил', false).then(function (ok) {
          if (!ok) return;
          sb.from('leads').update({ sent_at: new Date().toISOString(), sent_by: state.profile.id }).eq('id', leadId).then(function (u) {
            if (u.error) { toast('Ошибка: ' + u.error.message); return; }
            logActivity('lead_sent', 'lead', leadId, l.social_url);
            toast('Отмечено: лид получил письмо');
            go('get/' + catId);
          });
        });
      });
      });
    });
  }

  function renderCategories() {
    setTitle('Категории');
    leadCounts(false).then(function (counts) {
      app.innerHTML =
        '<div class="card">' +
        '<label for="nc">Новая категория</label>' +
        '<input id="nc" placeholder="Например: INST Барбершопы" autocomplete="off">' +
        '<div class="err" id="ce"></div>' +
        '<button class="btn" id="cadd">Создать категорию</button>' +
        '</div>' +
        '<div class="section-title">Существующие</div>' +
        (state.categories.length ? state.categories.map(function (c) {
          return '<div class="row-between card" style="margin-bottom:8px"><span>' + esc(c.name) +
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
    app.innerHTML =
      '<div class="card">' +
      '<div class="section-title" style="margin-top:0">Пользователь</div>' +
      '<div>Имя: <b>' + esc(state.profile.name) + '</b></div>' +
      '<div>Логин: <span class="mono">' + esc(state.profile.login) + '</span></div>' +
      '<div>Роль: ' + (isAdmin ? '<b>админ</b>' : 'пользователь') + '</div>' +
      '<button class="btn ghost" id="logout" style="margin-top:14px">Выйти из аккаунта</button>' +
      '</div>' +
      (isAdmin ?
        '<div class="card">' +
        '<div class="section-title" style="margin-top:0">Создать пользователя</div>' +
        '<label for="un">Имя</label><input id="un" placeholder="Имя сотрудника" autocomplete="off">' +
        '<label for="ul">Логин</label><input id="ul" placeholder="login" autocapitalize="none" autocomplete="off">' +
        '<label for="up">Пароль</label><input id="up" type="text" placeholder="минимум 8 символов" autocomplete="off">' +
        '<div class="err" id="ue"></div>' +
        '<button class="btn" id="uadd">Создать</button>' +
        '<div class="hint">Передай логин и пароль лично. Других способов регистрации нет.</div>' +
        '</div>' +
        '<div class="card"><div class="section-title" style="margin-top:0">Пользователи</div><div id="ulist" class="muted">Загрузка…</div></div>'
        : '');
    document.getElementById('logout').addEventListener('click', function () {
      sb.auth.signOut().then(function () {
        state.session = null; state.profile = null;
        go('login'); render();
      });
    });
    if (isAdmin) {
      sb.from('profiles').select('name, login, role, created_at').order('created_at').then(function (r) {
        document.getElementById('ulist').innerHTML = (r.data || []).map(function (p) {
          return '<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--line)">' +
            '<span>' + esc(p.name) + ' <span class="mono muted">' + esc(p.login) + '</span></span>' +
            '<span class="muted">' + (p.role === 'admin' ? 'админ' : 'пользователь') + '</span></div>';
        }).join('');
      });
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
    }
  }

  var PERIODS = [
    ['day', 'День'],
    ['3d', '3 дня'],
    ['week', 'Неделя'],
    ['month', 'Месяц'],
    ['all', 'Всё время']
  ];
  function periodStart(p) {
    var now = new Date();
    if (p === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (p === '3d') return new Date(now.getTime() - 3 * 86400000).toISOString();
    if (p === 'week') return new Date(now.getTime() - 7 * 86400000).toISOString();
    if (p === 'month') return new Date(now.getTime() - 30 * 86400000).toISOString();
    return null;
  }

  function renderStats() {
    setTitle('Статистика');
    var from = periodStart(state.period);
    var q = sb.from('activity').select('*').order('at', { ascending: false }).limit(500);
    if (from) q = q.gte('at', from);
    q.then(function (r) {
      var rows = r.data || [];
      var byUser = {};
      rows.forEach(function (a) {
        var key = a.user_name || '—';
        if (!byUser[key]) byUser[key] = { added: 0, sent: 0, updated: 0, deleted: 0, cats: 0 };
        if (a.action === 'lead_added') byUser[key].added++;
        if (a.action === 'lead_sent') byUser[key].sent++;
        if (a.action === 'lead_updated') byUser[key].updated++;
        if (a.action === 'lead_deleted') byUser[key].deleted++;
        if (a.action === 'category_created' || a.action === 'category_deleted') byUser[key].cats++;
      });
      var names = Object.keys(byUser);
      app.innerHTML =
        '<div class="chips">' + PERIODS.map(function (p) {
          return '<button class="chip' + (state.period === p[0] ? ' active' : '') + '" data-period="' + p[0] + '">' + p[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="card tablewrap"><table>' +
        '<tr><th>Кто</th><th class="n">Добавил</th><th class="n">Отправил</th><th class="n">Изменил</th><th class="n">Удалил</th><th class="n">Категории</th></tr>' +
        (names.length ? names.map(function (n) {
          var u = byUser[n];
          return '<tr' + (n === state.profile.name ? ' class="me"' : '') + '><td>' + esc(n) + '</td>' +
            '<td class="n">' + u.added + '</td><td class="n">' + u.sent + '</td><td class="n">' + u.updated +
            '</td><td class="n">' + u.deleted + '</td><td class="n">' + u.cats + '</td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted">За период действий нет</td></tr>') +
        '</table></div>' +
        '<div class="section-title">Лента действий</div>' +
        '<div class="card"><ul class="feed">' +
        (rows.length ? rows.slice(0, 60).map(function (a) {
          return '<li><b>' + esc(a.user_name || '—') + '</b> ' + esc(actionLabel(a.action)) +
            (a.details ? ' · ' + esc(a.details) : '') +
            '<span class="when">' + esc(fmtDate(a.at)) + '</span></li>';
        }).join('') : '<li>Пока пусто</li>') +
        '</ul></div>';
      app.querySelectorAll('[data-period]').forEach(function (b) {
        b.addEventListener('click', function () { state.period = b.getAttribute('data-period'); renderStats(); });
      });
    });
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
      login: 'вошёл(ла)'
    })[a] || a;
  }

  function bindBack() {
    app.querySelectorAll('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () { history.back(); });
    });
  }
  function bindCatGo(prefix) {
    app.querySelectorAll('[data-catgo]').forEach(function (b) {
      b.addEventListener('click', function () { go(prefix + '/' + b.getAttribute('data-catgo')); });
    });
  }
  function bindSpoilers() {
    app.querySelectorAll('[data-spoiler]').forEach(function (s) {
      s.addEventListener('click', function () { s.classList.toggle('open'); });
    });
  }

  start();
})();
