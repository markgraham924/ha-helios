// Helios dashboard editor: an admin custom panel that edits the `helios` section of a storage-mode Lovelace dashboard,
// one tab per paired clock (SPEC 0.16): each tab edits the dashboard that clock shows.
// Vanilla ES module, no build step. The model, validation and forms live in helios-schema.js (node-testable).
import * as S from './helios-schema.js?v=0.17.2';

const STYLE = `
:host{display:block;padding:16px;font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif);color:var(--primary-text-color);box-sizing:border-box}
*{box-sizing:border-box}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.bar select{padding:6px 8px;font:inherit}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);cursor:pointer}
button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
button:disabled{opacity:.5;cursor:default}
.notice{padding:10px 12px;border-radius:8px;background:var(--secondary-background-color);margin-bottom:12px}
.notice.warn{background:var(--warning-color,#ffa600);color:#000}
.notice.error{background:var(--error-color,#db4437);color:#fff}
.tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
.tabs button.on{background:var(--primary-color);color:var(--text-primary-color,#fff)}
.clocks button .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:var(--disabled-text-color,#999)}
.clocks button .dot.online{background:var(--success-color,#43a047)}
.work{display:grid;grid-template-columns:minmax(320px,2fr) minmax(280px,1fr);gap:16px}
@media (max-width:820px){.work{grid-template-columns:1fr}}
.screen{aspect-ratio:800/480;background:#1c1b19;border-radius:12px;padding:8px;display:grid;grid-template-rows:44px 1fr;gap:8px;min-width:0}
.top{color:#8f8a80;font-size:12px;letter-spacing:.18em;display:flex;align-items:center;padding-left:16px}
.grid{display:grid;grid-template-columns:repeat(${S.COLUMNS},1fr);grid-template-rows:repeat(${S.ROWS},1fr);gap:8px;min-height:0}
.cell{border:1px dashed #3a3834;border-radius:10px;background:transparent;color:#6a655c;font-size:22px;cursor:pointer}
.cell:hover{border-color:#8f8a80;color:#c9c3b6}
.card{border-radius:10px;background:#2a2824;color:#e8e2d6;padding:8px 10px;text-align:left;display:flex;flex-direction:column;gap:2px;overflow:hidden;cursor:pointer;border:2px solid transparent;min-width:0}
.card.on{border-color:var(--primary-color)}
.card.bad{border-color:var(--error-color,#db4437)}
.card .t{font-size:12px;color:#a8a296;display:flex;gap:6px;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .v{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .readings{display:flex;flex-direction:column;justify-content:center;gap:3px;flex:1;min-height:0}
.card .reading{display:flex;align-items:center;gap:6px;min-width:0;line-height:1.2}
.card .reading .label{font-size:12px;color:#a8a296;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .reading .value{font-size:14px;text-align:right;max-width:62%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card ha-icon{--mdc-icon-size:16px}
.side{background:var(--card-background-color);border-radius:12px;padding:16px;border:1px solid var(--divider-color)}
.side h3{margin:0 0 12px}
.row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
label.f{display:block;margin:8px 0 4px;font-size:13px;color:var(--secondary-text-color)}
input,select{width:100%;padding:6px 8px;font:inherit}
ul.err{margin:8px 0 0;padding-left:18px;color:var(--error-color,#db4437)}
.muted{color:var(--secondary-text-color);font-size:13px}
`;

class HeliosPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = { clocks: [], clockId: null, dashboards: [], urlPath: null, doc: null, baseline: null, model: null, legacyVersion: null, notice: null, page: 0, sel: null, dirty: false, stale: false, saving: false, formsReady: null, errors: [] };
    this._hass = null; this._loaded = false; this._unsub = null;
    this.shadowRoot.addEventListener('click', (e) => this._click(e));
    this._beforeUnload = (e) => { if (this.state.dirty) { e.preventDefault(); e.returnValue = ''; } };
  }
  set panel(p) { this._cfg = (p && p.config) || {}; if (!this.state.urlPath) this.state.urlPath = this._cfg.dashboard_path || 'helios-clock'; }
  set hass(h) {
    this._hass = h;
    if (h && !this._loaded) { this._loaded = true; this._load(); }
    else if (h && this._form) this._form.hass = h;
    if (h && this._loaded && this.state.model) this._renderGrid(); // live state text on the preview
  }
  get hass() { return this._hass; }
  connectedCallback() { window.addEventListener('beforeunload', this._beforeUnload); this._render(); }
  disconnectedCallback() { window.removeEventListener('beforeunload', this._beforeUnload); if (this._unsub) { this._unsub(); this._unsub = null; } }

  // --- loading and saving ---
  async _load() {
    const h = this._hass, st = this.state;
    try {
      const list = await h.callWS({ type: 'lovelace/dashboards/list' });
      st.dashboards = list.filter((d) => d.mode === 'storage');
    } catch (err) { st.dashboards = []; }
    await this._loadClocks();
    if (!this._unsub) this._unsub = await h.connection.subscribeEvents((ev) => { if (ev.data && ev.data.url_path === st.urlPath && !st.saving) { st.stale = true; this._render(); } }, 'lovelace_updated');
    await this._loadDashboard();
    this.state.formsReady = await ensureHaForm();
    this._render();
  }
  /** The panel's tabs: one per clock, each pointing at the dashboard that clock shows; the chosen tab survives a refresh. */
  async _loadClocks() {
    const st = this.state;
    try { st.clocks = (await this._hass.callWS({ type: 'helios/clocks' })).clocks; }
    catch (err) { st.clocks = []; st.notice = 'Could not load the clock list: ' + (err.message || err.code || err); }
    const clock = st.clocks.find((c) => c.entry_id === st.clockId) || st.clocks[0];
    if (clock) { st.clockId = clock.entry_id; st.urlPath = clock.dashboard_path; }
  }
  _clock() { return this.state.clocks.find((c) => c.entry_id === this.state.clockId) || null; }
  _sharing() { const c = this._clock(); return c ? this.state.clocks.filter((o) => o.dashboard_path === c.dashboard_path && o.entry_id !== c.entry_id) : []; }
  /** Gives the current clock a copy of the dashboard it shares: create, copy, repoint the clock (SPEC 0.16 pkt 4). */
  async _ownDashboard() {
    const st = this.state, clock = this._clock();
    if (!clock || st.dirty || st.saving) return;
    st.saving = true; this._render();
    try {
      const list = await this._hass.callWS({ type: 'lovelace/dashboards/list' });
      const urlPath = S.dashboardPath(clock.name, list.map((d) => d.url_path));
      const source = await this._fetch(st.urlPath, true); // fresh from HA, never the editor's model
      await this._hass.callWS({ type: 'lovelace/dashboards/create', url_path: urlPath, title: `Helios - ${clock.name}`, icon: 'mdi:clock-digital', show_in_sidebar: false, require_admin: true, mode: 'storage' });
      await this._hass.callWS({ type: 'lovelace/config/save', url_path: urlPath, config: structuredClone(source) });
      await this._hass.callWS({ type: 'helios/clock/set_dashboard', entry_id: clock.entry_id, dashboard_path: urlPath });
      // HA acknowledged the switch: from here the editor targets the new document whatever the refreshes below do
      clock.dashboard_path = urlPath; st.urlPath = urlPath;
      if (!st.dashboards.some((d) => d.url_path === urlPath)) st.dashboards.push({ url_path: urlPath, title: `Helios - ${clock.name}`, mode: 'storage' });
      await this._loadDashboard();
      st.notice = st.model ? `${clock.name} now has its own dashboard at ${urlPath} - the clock will switch automatically.` : `${clock.name} switched to ${urlPath}, but it could not be loaded - use Reload.`;
    } catch (err) { st.notice = 'Could not create a separate dashboard: ' + (err.message || err.code || err); }
    finally { st.saving = false; this._render(); }
  }
  async _fetch(urlPath, strict = false) {
    try { return await this._hass.callWS({ type: 'lovelace/config', url_path: urlPath, force: true }); }
    catch (err) { if (!strict && err && err.code === 'config_not_found') return {}; throw err; } // strict: a copy of nothing is an error, not an empty layout
  }
  async _loadDashboard() {
    const st = this.state;
    st.sel = null; st.dirty = false; st.stale = false; st.errors = [];
    if (!st.dashboards.some((d) => d.url_path === st.urlPath)) { st.doc = null; st.model = null; st.notice = `No storage-mode dashboard at ${st.urlPath}.`; this._render(); return; }
    const urlPath = st.urlPath;
    let doc;
    try { doc = await this._fetch(urlPath); }
    catch (err) { st.doc = null; st.model = null; st.notice = 'Could not load the dashboard: ' + (err.message || err.code || err); this._render(); return; }
    if (st.urlPath !== urlPath) return; // the user moved on to another dashboard while this one loaded
    st.doc = doc;
    const parsed = S.fromLovelace(st.doc);
    st.model = parsed.model; st.legacyVersion = parsed.legacyVersion; st.notice = parsed.notice;
    st.baseline = JSON.stringify(st.doc.helios ?? null);
    st.page = 0;
    this._validate();
    this._render();
  }
  async _createDashboard() {
    const st = this.state;
    try {
      await this._hass.callWS({ type: 'lovelace/dashboards/create', url_path: st.urlPath, title: 'Helios', icon: 'mdi:clock-digital', show_in_sidebar: true, require_admin: true, mode: 'storage' });
      st.dashboards = (await this._hass.callWS({ type: 'lovelace/dashboards/list' })).filter((d) => d.mode === 'storage');
      await this._loadDashboard();
    } catch (err) { st.notice = 'Could not create the dashboard: ' + (err.message || err.code || err); this._render(); }
  }
  async _save() {
    const st = this.state;
    if (!st.model || st.saving) return;
    st.errors = S.validate(st.model);
    if (st.errors.length) { this._render(); return; }
    if (st.legacyVersion != null && !window.confirm(`This version ${st.legacyVersion} document will be saved as version 6. Requires Helios 0.12 - older clocks will reject it and keep the previous layout. Save?`)) return;
    // the target and the document are pinned for the whole save: the selector is disabled meanwhile, and a switch that
    // slipped through could otherwise write this dashboard's whole config over another one
    const urlPath = st.urlPath, model = st.model;
    st.saving = true; this._render();
    try {
      const fresh = await this._fetch(urlPath);
      if (JSON.stringify(fresh.helios ?? null) !== st.baseline) {
        st.doc = fresh; const parsed = S.fromLovelace(fresh); st.model = parsed.model; st.legacyVersion = parsed.legacyVersion;
        st.baseline = JSON.stringify(fresh.helios ?? null); st.sel = null; st.dirty = false; st.stale = false; st.page = 0;
        st.notice = 'The configuration changed in the meantime - the new version has been loaded. Please apply your changes again.';
        return;
      }
      const next = structuredClone(fresh); next.helios = S.toHelios(model);
      await this._hass.callWS({ type: 'lovelace/config/save', url_path: urlPath, config: next });
      const verify = await this._fetch(urlPath);
      st.doc = verify; st.baseline = JSON.stringify(verify.helios ?? null); st.legacyVersion = null; st.dirty = false; st.stale = false;
      st.notice = JSON.stringify(verify.helios) === JSON.stringify(next.helios) ? 'Saved - the clock will refresh automatically.' : 'Saved, but the loaded result differs from what was saved - check the text editor.';
    } catch (err) { st.notice = 'Save failed: ' + (err.message || err.code || err); }
    finally { st.saving = false; this._render(); }
  }

  // --- model edits ---
  _validate() { this.state.errors = this.state.model ? S.validate(this.state.model) : []; }
  _touch() { this.state.dirty = true; this._validate(); this._render(); }
  _page() { return this.state.model.pages[this.state.page]; }
  _allIds() { return this.state.model.pages.flatMap((p) => p.items.map((i) => i.id)); }
  _addAt(cell) {
    const type = this._addType || 'tile';
    const item = S.emptyItem(type, cell, this._allIds());
    if (!S.fits(this._page().items, item)) { item.width = 1; item.height = 1; }
    if (!S.fits(this._page().items, item)) { this.state.notice = `Item ${item.id} overlaps another item`; this._render(); return; }
    this._page().items.push(item); this.state.sel = item.id; this._touch();
  }
  /** A field edit: the model, the preview and the error list move, the form the user is typing in stays put. */
  _commit(next) {
    if (this.state.saving) return;
    const page = this._page(), idx = page.items.findIndex((i) => i.id === this.state.sel);
    if (idx < 0) return;
    page.items[idx] = next; this.state.sel = next.id; this.state.dirty = true; this._validate();
    this._renderGrid(); this._renderStatus();
  }
  _delete() {
    const page = this._page(); page.items = page.items.filter((i) => i.id !== this.state.sel); this.state.sel = null; this._touch();
  }
  _convert() {
    const item = this._page().items.find((i) => i.id === this.state.sel), tile = item && S.toTile(item);
    if (tile) { this._commit(tile); this._renderSide(); } // a new type needs a new form
  }
  _addPage() {
    const title = window.prompt('Page name', `Page ${this.state.model.pages.length + 1}`);
    if (title == null) return;
    const id = S.slug(title, this.state.model.pages.map((p) => p.id));
    this.state.model.pages.push({ id, title, items: [] }); this.state.page = this.state.model.pages.length - 1; this.state.sel = null; this._touch();
  }
  _renamePage() {
    const p = this._page(), title = window.prompt('Page name', p.title || '');
    if (title == null) return;
    if (title.trim()) p.title = title.trim(); else delete p.title;
    this._touch();
  }
  _deletePage() {
    if (this.state.model.pages.length < 2) return;
    const p = this._page();
    if (!window.confirm(`Delete page ${p.title || p.id} with ${p.items.length} items?`)) return;
    this.state.model.pages.splice(this.state.page, 1); this.state.page = Math.max(0, this.state.page - 1); this.state.sel = null; this._touch();
  }

  // --- events ---
  _click(e) {
    const el = e.composedPath().find((n) => n instanceof HTMLElement && n.dataset && n.dataset.act);
    if (!el) return;
    const act = el.dataset.act, st = this.state;
    if (st.saving) return; // a copy or a save in flight: the model it will replace must not take edits
    if (act === 'reload') { this._loadDashboard(); return; }
    if (act === 'save') { this._save(); return; }
    if (act === 'create') { this._createDashboard(); return; }
    if (act === 'clock') { this._onClockChange(el.dataset.id); return; }
    if (act === 'own') { this._ownDashboard(); return; }
    if (act === 'page') { st.page = Number(el.dataset.n); st.sel = null; this._render(); return; }
    if (act === 'add-page') { this._addPage(); return; }
    if (act === 'rename-page') { this._renamePage(); return; }
    if (act === 'delete-page') { this._deletePage(); return; }
    if (act === 'cell') { this._addAt({ column: Number(el.dataset.c), row: Number(el.dataset.r) }); return; }
    if (act === 'card') { st.sel = el.dataset.id; this._render(); return; }
    if (act === 'delete') { this._delete(); return; }
    if (act === 'convert') { this._convert(); return; }
    if (act === 'close') { st.sel = null; this._render(); return; }
  }
  _onClockChange(entryId) {
    const st = this.state, clock = st.clocks.find((c) => c.entry_id === entryId);
    if (st.saving || !clock || entryId === st.clockId) return;
    if (st.dirty && !window.confirm('Discard unsaved changes?')) return;
    st.clockId = entryId; st.urlPath = clock.dashboard_path; st.notice = null; this._loadDashboard();
  }
  _errorsHtml() {
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return this.state.errors.length ? `<ul class="err">${this.state.errors.map((e) => `<li>${e.page != null ? `page ${e.page + 1}${e.id ? ` / ${esc(e.id)}` : ''}: ` : ''}${esc(e.msg)}</li>`).join('')}</ul>` : '';
  }
  _renderStatus() {
    const st = this.state, root = this.shadowRoot, errors = root.getElementById('errors'), save = root.getElementById('save'), dirty = root.getElementById('dirty');
    if (errors) errors.innerHTML = this._errorsHtml();
    if (save) save.disabled = !st.model || st.saving || st.errors.length > 0 || (!st.dirty && st.legacyVersion == null);
    if (dirty) dirty.textContent = st.dirty ? 'Unsaved changes' : '';
    const own = root.getElementById('own');
    if (own) { own.disabled = st.saving || st.dirty; own.title = st.dirty ? 'Save or reload first' : 'A copy of the current document for this clock only'; }
  }

  // --- rendering ---
  _render() {
    const st = this.state, root = this.shadowRoot;
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const known = st.dashboards.some((d) => d.url_path === st.urlPath), clock = this._clock(), sharing = this._sharing();
    const clocks = `<div class="tabs clocks">${st.clocks.map((c) => `<button class="${c.entry_id === st.clockId ? 'on' : ''}" data-act="clock" data-id="${esc(c.entry_id)}" ${st.saving ? 'disabled' : ''} title="${c.online ? 'connected' : 'disconnected'}"><span class="dot ${c.online ? 'online' : ''}"></span>${esc(c.name)}${c.area ? ` · ${esc(c.area)}` : ''}</button>`).join('')}</div>`;
    const where = clock ? `<div class="muted">Dashboard: ${esc(st.urlPath)}${sharing.length ? ` · shared with: ${sharing.map((c) => esc(c.name)).join(', ')}` : ''}</div>` : '';
    const bar = `${clocks}<div class="bar">
      ${known ? '' : '<button data-act="create">Create dashboard</button>'}
      ${clock && known && sharing.length ? `<button id="own" data-act="own" ${st.saving || st.dirty ? 'disabled' : ''} title="${st.dirty ? 'Save or reload first' : 'A copy of the current document for this clock only'}">Separate dashboard</button>` : ''}
      <button data-act="reload" ${st.saving ? 'disabled' : ''}>Reload</button>
      <button class="primary" id="save" data-act="save" ${!st.model || st.saving || st.errors.length || (!st.dirty && st.legacyVersion == null) ? 'disabled' : ''}>${st.saving ? 'Saving…' : 'Save'}</button>
      <span class="muted" id="dirty">${st.dirty ? 'Unsaved changes' : ''}</span></div>${where}`;
    const notices = [
      st.stale ? '<div class="notice warn">Changed outside the editor - Reload to see the current layout.</div>' : '',
      st.notice ? `<div class="notice ${st.legacyVersion != null ? 'warn' : ''}">${esc(st.notice)}</div>` : '',
      st.formsReady === false ? '<div class="notice">Home Assistant forms unavailable - using basic fields.</div>' : '',
      st.clocks.length === 0 ? '<div class="notice">No paired clocks.</div>' : '',
    ].join('');
    if (!st.model) { root.innerHTML = `<style>${STYLE}</style>${bar}${notices}`; this._wire(); return; }
    const tabs = `<div class="tabs">${st.model.pages.map((p, n) => `<button class="${n === st.page ? 'on' : ''}" data-act="page" data-n="${n}">${esc(p.title || p.id)}</button>`).join('')}
      <button data-act="add-page" ${st.model.pages.length >= S.MAX_PAGES ? 'disabled' : ''}>+ page</button><button data-act="rename-page">rename</button><button data-act="delete-page" ${st.model.pages.length < 2 ? 'disabled' : ''}>delete page</button></div>`;
    root.innerHTML = `<style>${STYLE}</style>${bar}${notices}${tabs}
      <div class="work"><div><div class="screen"><div class="top">HELIOS ${st.page === 0 ? '' : '· page ' + (st.page + 1) +  ' of ' + st.model.pages.length + ' (swipe on the clock)'}</div><div class="grid" id="grid"></div></div>
      <div class="row"><label class="muted">New card: <select id="addtype">${Object.entries(S.TYPES).filter(([, d]) => !d.legacy).map(([k, d]) => `<option value="${k}" ${(this._addType || 'tile') === k ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select> - click an empty cell</label></div><div id="errors">${this._errorsHtml()}</div></div>
      <div class="side" id="side"></div></div>`;
    this._wire();
    this._renderGrid();
    this._renderSide();
  }
  _wire() {
    const addtype = this.shadowRoot.getElementById('addtype');
    if (addtype) addtype.addEventListener('change', (e) => { this._addType = e.target.value; });
  }
  _renderGrid() {
    const grid = this.shadowRoot.getElementById('grid');
    if (!grid || !this.state.model) return;
    const st = this.state, page = this._page(), esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const bad = new Set(st.errors.filter((e) => e.page === st.page && e.id).map((e) => e.id));
    const used = S.occupied(page.items);
    const cells = [];
    for (let r = 1; r <= S.ROWS; r++) for (let c = 1; c <= S.COLUMNS; c++) if (!used.has(`${c},${r}`)) cells.push(`<button class="cell" data-act="cell" data-c="${c}" data-r="${r}" style="grid-column:${c};grid-row:${r}" title="Add card">+</button>`);
    const cards = page.items.map((i) => {
      const def = S.TYPES[i.type], e = this._hass && i.entity ? this._hass.states[i.entity] : null;
      const title = i.title || (e && e.attributes.friendly_name) || (def ? def.label.split(' ')[0] : i.type);
      const icon = i.type === 'alerts' ? 'mdi:bell-alert' : i.icon ? (i.icon.startsWith('mdi:') ? i.icon : 'mdi:' + i.icon) : i.type === 'entities' ? 'mdi:format-list-bulleted' : (i.type === 'tile' ? S.DOMAIN_ICON[S.domainOf(i.entity)] : S.LEGACY_DEFAULT_ICON[i.type] ? 'mdi:' + S.LEGACY_DEFAULT_ICON[i.type] : null);
      const hs = (this._hass && this._hass.states) || {};
      const readings = i.type === 'entities' ? S.entitiesPreview(i, hs) : null;
      const energy = i.type === 'energy' ? S.energyPreview(i, hs) : i.type === 'climate' ? S.climatePreview(i, hs) : i.type === 'alerts' ? S.alertsPreview(i, hs) : null;
      const value = energy ? energy.value : i.type === 'spotify' ? 'Open' : i.type === 'assistant' ? (e && e.state !== 'idle' ? e.state : 'Talk') : i.type === 'clock' ? '12:00' : i.type === 'music' ? '—' : i.type === 'cover_group' ? 'A / B' : e ? `${e.state}${e.attributes.unit_of_measurement ? ' ' + e.attributes.unit_of_measurement : ''}` : (i.entity || '');
      const body = readings ? `<div class="readings">${readings.rows.map((r) => `<div class="reading"><span class="label" title="${esc(r.title)}">${esc(r.title)}</span><span class="value" title="${esc(r.value)}">${esc(r.value)}</span></div>`).join('')}</div>` : `<div class="v">${esc(value)}</div>`;
      return `<div class="card ${i.id === st.sel ? 'on' : ''} ${bad.has(i.id) ? 'bad' : ''}" data-act="card" data-id="${esc(i.id)}" style="grid-column:${i.column} / span ${i.width};grid-row:${i.row} / span ${i.height}">
        <div class="t">${icon ? `<ha-icon icon="${esc(icon)}"></ha-icon>` : ''}<span>${esc(readings ? readings.title : energy ? energy.title : title)}</span></div>${body}${i.visible_when ? '<div class="t">conditional</div>' : ''}</div>`;
    });
    grid.innerHTML = cells.join('') + cards.join('');
  }
  _renderSide() {
    const side = this.shadowRoot.getElementById('side');
    if (!side) return;
    const st = this.state, item = st.sel ? this._page().items.find((i) => i.id === st.sel) : null;
    this._form = null;
    if (!item) { side.innerHTML = '<h3>Card</h3><p class="muted">Click a card to edit it, or an empty cell to add a new one.</p>'; return; }
    const def = S.TYPES[item.type] || { label: item.type, fields: [] };
    side.innerHTML = `<h3>${def.label}</h3><div id="form"></div>
      <div class="row">${def.legacy && S.toTile(item) ? '<button data-act="convert">Convert to tile</button>' : ''}<button data-act="delete">Delete</button><button data-act="close">Close</button></div>`;
    const host = side.querySelector('#form'), schema = S.schemaFor(item.type, item, st.legacyVersion), data = S.toForm(item);
    // The form outlives single edits, so every commit reads the item as it is now (renamed, converted), never the one it was built for.
    const commit = (value) => {
      const current = this._page().items.find((i) => i.id === st.sel);
      if (!current) return;
      const domainChanged = current.type === 'tile' && value.entity !== undefined && S.domainOf(value.entity) !== S.domainOf(current.entity);
      if (domainChanged) value = { ...value, action: S.defaultIntent(S.domainOf(value.entity)) }; // the old intent may not exist on the new domain
      const next = S.fromForm(current.type, { ...data, ...value });
      const entriesSchemaChanged = current.type === 'entities' && JSON.stringify(S.schemaFor(current.type, current, st.legacyVersion)) !== JSON.stringify(S.schemaFor(next.type, next, st.legacyVersion));
      if (next.id !== current.id && this._allIds().includes(next.id)) { st.notice = `Duplicate ID: ${next.id}`; this._render(); return; }
      Object.assign(data, value);
      this._commit(next);
      if (domainChanged || entriesSchemaChanged) {
        if (this._form) { this._form.schema = S.schemaFor(next.type, next, st.legacyVersion); this._form.data = data; } // the same object the commits mutate: a copy would freeze later edits at this moment
        else this._renderSide();
      }
    };
    if (st.formsReady && customElements.get('ha-form')) {
      const f = document.createElement('ha-form');
      f.hass = this._hass; f.schema = schema; f.data = data; f.computeLabel = (s) => s.label || S.LABELS[s.name] || s.name;
      f.addEventListener('value-changed', (e) => { e.stopPropagation(); commit(e.detail.value); });
      host.appendChild(f); this._form = f;
    } else host.appendChild(fallbackForm(schema, data, this._hass, commit));
  }
}

/** ha-form is a lazy chunk: it exists only after some HA editor loaded it. Card helpers force that load; a timeout falls back to plain inputs. */
async function ensureHaForm() {
  if (customElements.get('ha-form')) return true;
  try {
    const helpers = await window.loadCardHelpers();
    const card = helpers.createCardElement({ type: 'entities', entities: [] });
    await card.constructor.getConfigElement();
  } catch (err) { console.warn('helios: card helpers unavailable', err); }
  await Promise.race([customElements.whenDefined('ha-form'), new Promise((r) => setTimeout(r, 4000))]);
  return !!customElements.get('ha-form');
}

/** Plain inputs bound to the same flat data; entity pickers are datalists from hass.states. */
function fallbackForm(schema, data, hass, commit) {
  const box = document.createElement('div');
  const flat = schema.flatMap((s) => (s.type === 'grid' ? s.schema : [s]));
  const entities = Object.keys((hass && hass.states) || {}).sort();
  let listId = 0;
  for (const s of flat) {
    const label = document.createElement('label'); label.className = 'f'; label.textContent = s.label || S.LABELS[s.name] || s.name; box.appendChild(label);
    let input;
    const sel = s.selector || {};
    if (sel.object) {
      input = document.createElement('textarea'); input.rows = 8; input.style.width = '100%'; input.style.fontFamily = 'monospace';
      input.value = data[s.name] == null ? '' : JSON.stringify(data[s.name], null, 1);
      input.addEventListener('change', () => {
        if (!input.value.trim()) { commit({ [s.name]: sel.object.multiple ? [] : undefined }); return; }
        try { commit({ [s.name]: JSON.parse(input.value) }); input.style.outline = ''; } catch (err) { input.style.outline = '2px solid var(--error-color,#db4437)'; } // JSON that does not parse stays out of the model
      });
      box.appendChild(input); continue;
    }
    if (sel.select) { input = document.createElement('select'); input.innerHTML = '<option value=""></option>' + sel.select.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join(''); input.value = data[s.name] ?? ''; }
    else if (sel.boolean) { input = document.createElement('input'); input.type = 'checkbox'; input.style.width = 'auto'; input.checked = !!data[s.name]; }
    else if (sel.number) { input = document.createElement('input'); input.type = 'number'; input.min = sel.number.min; input.max = sel.number.max; input.value = data[s.name] ?? ''; }
    else {
      input = document.createElement('input'); input.type = 'text'; input.value = data[s.name] ?? '';
      if (sel.entity) {
        const list = document.createElement('datalist'); list.id = 'l' + listId++;
        const domain = sel.entity.domain;
        list.innerHTML = entities.filter((e) => !domain || e.startsWith(domain + '.')).map((e) => `<option value="${e}"></option>`).join('');
        box.appendChild(list); input.setAttribute('list', list.id);
      }
      if (sel.icon) input.pattern = '^mdi:[a-z0-9-]+$';
    }
    input.addEventListener('change', () => {
      const value = sel.boolean ? input.checked : sel.number ? (input.value === '' ? undefined : Number(input.value)) : input.value;
      commit({ [s.name]: value });
    });
    box.appendChild(input);
  }
  return box;
}

customElements.define('helios-panel', HeliosPanel);
