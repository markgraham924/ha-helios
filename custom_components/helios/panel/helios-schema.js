// Helios dashboard model for the editor panel: pure, DOM-free, testable with `node --test`.
// Mirrors the clock's parser (dash: app/src/main/java/pl/mateusz/helios/DashboardSpec.java, ActionPolicy.java).
// Every message here is the clock's own wording, so what the editor refuses is exactly what the clock would refuse.

export const VERSION = 6;
export const COLUMNS = 4, ROWS = 3, MAX_ITEMS = 12, MAX_PAGES = 8, MAX_BYTES = 65536;
export const ID_RE = /^[a-z0-9_-]{1,40}$/, ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/, ATTRIBUTE_RE = /^[a-z0-9_]{1,64}$/, MDI_RE = /^mdi:[a-z0-9-]{1,40}$/;
export const LEGACY_ICONS = ['information', 'weather-rainy', 'lightbulb', 'window-shutter', 'garage-open', 'music'];

// type -> {label, fields (beyond id/type/geometry/title/visible_when), entityDomain ('' any, null none), legacy}
export const TYPES = {
  clock: { label: 'Clock', fields: [], entityDomain: null },
  weather: { label: 'Weather', fields: ['entity', 'temperature_entity', 'forecast_entity', 'forecast_when'], entityDomain: 'weather' },
  tile: { label: 'Tile (any entity)', fields: ['entity', 'icon', 'attribute', 'tap_action', 'confirmation'], entityDomain: '' },
  entities: { label: 'Readings (1–3 entities)', fields: ['entries', 'icon'], entityDomain: null },
  music: { label: 'Music', fields: ['icon'], entityDomain: null, singleton: true },
  cover_group: { label: 'Two blinds', fields: ['covers', 'icon'], entityDomain: null },
  climate: { label: 'Thermostat', fields: ['entity', 'icon'], entityDomain: 'climate' },
  energy: { label: 'Energy (solar, home, battery)', fields: ['entity', 'load_entity', 'battery_entity', 'icon'], entityDomain: 'sensor' },
  alerts: { label: 'Alerts (warnings)', fields: ['sources', 'empty'], entityDomain: null },
  entity: { label: 'Entity (versions 2-5)', fields: ['entity', 'attribute', 'icon', 'off_entity', 'tap_action', 'confirmation'], entityDomain: '', legacy: true },
  light: { label: 'Light (versions 2-5)', fields: ['entity', 'icon', 'tap_action', 'confirmation'], entityDomain: 'light', legacy: true, action: 'toggle' },
  cover: { label: 'Blind (versions 2-5)', fields: ['entity', 'icon', 'tap_action', 'confirmation'], entityDomain: 'cover', legacy: true, action: 'controls' },
  garage: { label: 'Garage door (versions 2-5)', fields: ['entity', 'icon', 'tap_action', 'confirmation'], entityDomain: 'cover', legacy: true, action: 'close' },
};
export const DOMAIN_ICON = { light: 'mdi:lightbulb', switch: 'mdi:toggle-switch', input_boolean: 'mdi:toggle-switch', fan: 'mdi:fan', cover: 'mdi:window-shutter', lock: 'mdi:lock', sensor: 'mdi:eye', binary_sensor: 'mdi:radiobox-blank', climate: 'mdi:thermostat', script: 'mdi:script-text', scene: 'mdi:palette', input_button: 'mdi:gesture-tap-button', button: 'mdi:gesture-tap-button', media_player: 'mdi:cast', weather: 'mdi:weather-partly-cloudy' };
export const LEGACY_DEFAULT_ICON = { energy: 'solar-power', entity: 'information', light: 'lightbulb', cover: 'window-shutter', garage: 'garage-open', music: 'music', cover_group: 'window-shutter' };

// --- intents (ActionPolicy) ---
const SWITCH_DOMAINS = ['light', 'switch', 'input_boolean', 'fan'], RUN_DOMAINS = ['script', 'scene', 'input_button', 'button'];
export const INTENT_LABEL = { none: 'None', details: 'Details', toggle: 'Toggle', turn_on: 'Turn on', turn_off: 'Turn off', controls: 'Blind controls', open: 'Open', close: 'Close', stop: 'Stop', activate: 'Activate', lock: 'Lock', unlock: 'Unlock' };
export function domainOf(entity) { return typeof entity === 'string' && entity.includes('.') ? entity.slice(0, entity.indexOf('.')) : ''; }
export function allowedIntents(domain) {
  if (SWITCH_DOMAINS.includes(domain)) return ['none', 'details', 'toggle', 'turn_on', 'turn_off'];
  if (domain === 'cover') return ['none', 'details', 'controls', 'open', 'close', 'stop'];
  if (domain === 'lock') return ['none', 'details', 'lock', 'unlock'];
  if (RUN_DOMAINS.includes(domain)) return ['none', 'details', 'activate'];
  return ['none', 'details'];
}
export function defaultIntent(domain) { return domain === 'cover' ? 'controls' : RUN_DOMAINS.includes(domain) ? 'activate' : 'details'; }
export const FORCED_CONFIRM = ['lock', 'unlock'];

// --- ids ---
export function slug(text, taken = []) {
  let s = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁ]/g, 'l').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  if (!s) s = 'karta';
  let out = s, n = 2;
  while (taken.includes(out)) { const suffix = '-' + n++; out = s.slice(0, 40 - suffix.length) + suffix; }
  return out;
}

/** SPEC 0.16: a free Lovelace url_path for a clock's own dashboard - "helios-" + slug of its name, -2, -3... when taken. */
export function dashboardPath(name, taken = []) {
  const base = 'helios-' + slug(name, []).replace(/^helios(-|$)/, '').replace(/^$/, 'zegar');
  let out = base, n = 2;
  while (taken.includes(out)) out = `${base}-${n++}`;
  return out;
}

// --- document <-> model ---
// model = {pages: [{id, title?, items: [helios item objects]}]}; items are the wire objects themselves.
export function fromLovelace(doc) {
  const helios = doc && typeof doc === 'object' ? doc.helios : undefined;
  if (!helios || typeof helios !== 'object') return { model: { pages: [{ id: 'main', items: [] }] }, legacyVersion: null, notice: 'This dashboard does not have a helios section yet - saving will create it.' };
  const v = helios.version;
  if (Number.isInteger(v) && v >= 2 && v <= 5) {
    const items = Array.isArray(helios.items) ? helios.items.map(clone) : [];
    return { model: { pages: [{ id: 'main', items }] }, legacyVersion: v, notice: `Version ${v} document. Saving will convert it to version 6 (pages). Requires Helios 0.12; older clocks will reject the document and keep the previous layout.` };
  }
  if (v === VERSION) {
    const pages = Array.isArray(helios.pages) ? helios.pages.map((p) => ({ id: p.id, ...(p.title ? { title: p.title } : {}), items: Array.isArray(p.items) ? p.items.map(clone) : [] })) : [];
    return { model: { pages: pages.length ? pages : [{ id: 'main', items: [] }] }, legacyVersion: null, notice: null };
  }
  return { model: null, legacyVersion: null, notice: `Unknown helios section version (${v}) - edit it manually.` };
}
export function toHelios(model) {
  return { version: VERSION, pages: model.pages.map((p) => ({ id: p.id, ...(p.title ? { title: p.title } : {}), items: p.items.map(clone) })) };
}
export function clone(o) { return JSON.parse(JSON.stringify(o)); }

// --- new items ---
// Stable ID stems are independent of translated display labels.
const ITEM_ID_STEMS = { clock: 'zegar', weather: 'pogoda', tile: 'kafelek', entities: 'odczyty', music: 'muzyka', cover_group: 'dwie', climate: 'termostat', energy: 'energia', alerts: 'uwagi', entity: 'encja', light: 'swiatlo', cover: 'roleta', garage: 'brama' };
export function emptyItem(type, cell, taken, entity) {
  const item = { id: slug(ITEM_ID_STEMS[type], taken), type, column: cell.column, row: cell.row, width: 1, height: 1 };
  if (type === 'clock') { item.width = 2; item.height = 2; item.title = 'Home'; }
  if (type === 'weather' || type === 'alerts') { item.width = 2; }
  if (type === 'alerts') item.sources = [];
  if (type === 'entities') item.entries = [{ entity: entity || '' }];
  if (type === 'cover_group') item.covers = [{ entity: '', title: 'Blind A' }, { entity: '', title: 'Blind B' }];
  if (TYPES[type].entityDomain !== null) item.entity = entity || '';
  return item;
}
/** Legacy light/cover/garage/entity as a tile with the same behaviour; entity+off_entity has no tile equivalent and stays. */
export function toTile(item) {
  if (item.type === 'entity' && item.off_entity) return null;
  const tile = { id: item.id, type: 'tile', column: item.column, row: item.row, width: item.width, height: item.height, entity: item.entity };
  if (item.title) tile.title = item.title;
  if (item.attribute) tile.attribute = item.attribute;
  if (item.visible_when) tile.visible_when = clone(item.visible_when);
  const icon = item.icon || LEGACY_DEFAULT_ICON[item.type];
  if (icon) tile.icon = icon.startsWith('mdi:') ? icon : 'mdi:' + icon;
  const action = { light: 'toggle', cover: 'controls', garage: 'close', entity: 'none' }[item.type];
  tile.tap_action = { action };
  if (item.type === 'garage') tile.confirmation = item.confirmation ? clone(item.confirmation) : { enabled: true };
  else if (item.confirmation) tile.confirmation = clone(item.confirmation);
  return tile;
}

// --- geometry ---
export function occupied(items, ignoreId) {
  const used = [];
  for (const i of items) { if (i.id === ignoreId) continue; for (let r = i.row; r < i.row + i.height; r++) for (let c = i.column; c < i.column + i.width; c++) used.push(`${c},${r}`); }
  return new Set(used);
}
export function fits(items, candidate, ignoreId) {
  if (candidate.column < 1 || candidate.row < 1 || candidate.column + candidate.width - 1 > COLUMNS || candidate.row + candidate.height - 1 > ROWS) return false;
  const used = occupied(items, ignoreId);
  for (let r = candidate.row; r < candidate.row + candidate.height; r++) for (let c = candidate.column; c < candidate.column + candidate.width; c++) if (used.has(`${c},${r}`)) return false;
  return true;
}

// --- validation (DashboardSpec.java wording) ---
export function validate(model) {
  const errors = [], push = (page, id, msg) => errors.push({ page, id, msg });
  if (!model || !Array.isArray(model.pages) || model.pages.length === 0) return [{ page: null, id: null, msg: 'Required field pages' }];
  if (model.pages.length > MAX_PAGES) push(null, null, `pages: at most ${MAX_PAGES} pages`);
  const pageIds = new Set(), ids = new Set();
  model.pages.forEach((p, pi) => {
    if (typeof p.id !== 'string' || !ID_RE.test(p.id)) push(pi, null, `Invalid page ID: ${p.id}`);
    else if (pageIds.has(p.id)) push(pi, null, `Duplicate page ID: ${p.id}`); else pageIds.add(p.id);
    if (p.title != null && (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 40)) push(pi, null, 'Invalid field title');
    const items = Array.isArray(p.items) ? p.items : [];
    if (items.length > MAX_ITEMS) push(pi, null, `items: at most ${MAX_ITEMS} items`);
    const used = new Set(); let music = 0;
    for (const i of items) {
      const e = (msg) => push(pi, i.id, msg);
      const def = TYPES[i.type];
      if (!def) { e(`Unsupported item type: ${i.type}`); continue; }
      if (typeof i.id !== 'string' || !ID_RE.test(i.id)) e(`Invalid ID: ${i.id}`);
      else if (ids.has(i.id)) e(`Duplicate ID: ${i.id}`); else ids.add(i.id);
      if (def.singleton && ++music > 1) e(`Only one tile is allowed for ${i.type}`);
      for (const k of ['column', 'row', 'width', 'height']) if (!Number.isInteger(i[k]) || i[k] < 1 || i[k] > (k === 'row' || k === 'height' ? ROWS : COLUMNS)) e(`Field ${k} must be a number from 1 to ${k === 'row' || k === 'height' ? ROWS : COLUMNS}`);
      if (Number.isInteger(i.column) && Number.isInteger(i.width) && Number.isInteger(i.row) && Number.isInteger(i.height)) {
        if (i.column + i.width - 1 > COLUMNS || i.row + i.height - 1 > ROWS) e(`Item ${i.id} extends beyond the grid`);
        else for (let r = i.row; r < i.row + i.height; r++) for (let c = i.column; c < i.column + i.width; c++) { const key = `${c},${r}`; if (used.has(key)) { e(`Item ${i.id} overlaps another item`); r = ROWS + 1; break; } used.add(key); }
      }
      const domainLabel = def.entityDomain === '' ? i.type : def.entityDomain;
      if (def.entityDomain !== null) {
        if (typeof i.entity !== 'string' || !ENTITY_RE.test(i.entity) || (def.entityDomain && !i.entity.startsWith(def.entityDomain + '.'))) e(`Item ${i.id} requires an entity in domain ${domainLabel}`);
      } else if (i.entity != null) e(`Field not allowed for type ${i.type}: entity`);
      for (const k of Object.keys(i)) if (!['id', 'type', 'column', 'row', 'width', 'height', 'title', 'visible_when', ...def.fields].includes(k)) e(`Field not allowed for type ${i.type}: ${k}`);
      if (i.temperature_entity != null && !/^sensor\.[a-z0-9_]+$/.test(i.temperature_entity)) e('temperature_entity requires a sensor entity');
      if (i.attribute != null && !ATTRIBUTE_RE.test(i.attribute)) e('Invalid attribute');
      if (i.off_entity != null && !/^light\.[a-z0-9_]+$/.test(i.off_entity)) e('off_entity requires an entity in domain light');
      if ((i.forecast_entity != null) !== (i.forecast_when != null)) e('weather: forecast_entity and forecast_when must appear together');
      if (i.forecast_entity != null && !/^sensor\.[a-z0-9_]+$/.test(i.forecast_entity)) e('forecast_entity requires a sensor entity');
      if (i.type === 'energy') { // SPEC 0.17, DashboardSpec.item: the house load is required, the battery optional, both sensors
        const load = field(i, 'load_entity', 128, true, e), battery = field(i, 'battery_entity', 128, false, e);
        if (load != null && !/^sensor\.[a-z0-9_]+$/.test(load)) e('load_entity requires a sensor entity');
        if (battery != null && !/^sensor\.[a-z0-9_]+$/.test(battery)) e('battery_entity requires a sensor entity');
      }
      // present as null is present on the clock (JSONObject.has), and then not an object
      for (const k of ['tap_action', 'confirmation', 'visible_when', 'forecast_when']) if (k in i && (typeof i[k] !== 'object' || i[k] === null || Array.isArray(i[k]))) e(`${k} must be an object`);
      if ('title' in i && (typeof i.title !== 'string' || !i.title.trim() || i.title.length > 40)) e('Invalid field title');
      if (i.confirmation && typeof i.confirmation === 'object') for (const k of Object.keys(i.confirmation)) if (k !== 'enabled' && k !== 'text') e(`Unknown field confirmation: ${k}`);
      if (i.type === 'alerts') alerts(i, e);
      if (i.type === 'entities') entries(i, e);
      if (i.forecast_when != null) when(i.forecast_when, 'forecast_when', e);
      if (i.visible_when != null) when(i.visible_when, 'visible_when', e);
      if (i.type === 'cover_group') {
        const covers = Array.isArray(i.covers) ? i.covers : [];
        if (covers.length !== 2) e('cover_group requires exactly two covers entries');
        else {
          for (const c of covers) { if (!/^cover\.[a-z0-9_]+$/.test(c.entity || '')) e('covers requires an entity in domain cover'); if (typeof c.title !== 'string' || !c.title.trim() || c.title.length > 40) e('Invalid field title'); }
          if (covers[0].entity && covers[0].entity === covers[1].entity) e('covers: the same blind appears twice');
        }
      }
      if (i.icon != null) {
        if (typeof i.icon !== 'string' || !(MDI_RE.test(i.icon) || LEGACY_ICONS.includes(i.icon))) e(`Unknown icon: ${i.icon}`);
      }
      let intent = null;
      if (i.type === 'tile') {
        const domain = domainOf(i.entity);
        intent = i.tap_action ? i.tap_action.action : defaultIntent(domain);
        if (i.tap_action && (typeof i.tap_action !== 'object' || Object.keys(i.tap_action).some((k) => k !== 'action'))) e('Unknown field tap_action');
        if (!allowedIntents(domain).includes(intent)) e(`Entity ${i.entity} does not support action ${intent}`);
      } else if (i.tap_action != null) {
        const action = def.action || (i.type === 'entity' && i.off_entity ? 'lights_off' : null);
        if (!action) e(`Field not allowed for type ${i.type}: tap_action`);
        else if (i.tap_action.action !== action) e(`Type ${i.type} allows only tap_action.action: ${action}`);
      }
      if (i.confirmation != null) {
        const tappable = i.type === 'tile' || !!(def.action || (i.type === 'entity' && i.off_entity)); // the clock takes confirmation on any tile, even a display-only one
        if (!tappable) e(`Field not allowed for type ${i.type}: confirmation`);
        if (typeof i.confirmation.enabled !== 'boolean') e('confirmation.enabled must be a boolean');
        if (i.confirmation.text != null && (typeof i.confirmation.text !== 'string' || !i.confirmation.text.trim() || i.confirmation.text.length > 80)) e('Invalid field text');
        if (FORCED_CONFIRM.includes(intent) && i.confirmation.enabled === false) e(`Action ${intent} requires confirmation`);
      }
    }
  });
  if (JSON.stringify(toHelios(model)).length > MAX_BYTES) push(null, null, 'The helios section exceeds 64 KiB');
  return errors;
}
/** DashboardSpec.string(): absent = missing (an error only when required); present but null, not a string, blank or too long = invalid. */
function field(i, key, max, required, e) {
  if (!Object.prototype.hasOwnProperty.call(i, key) || i[key] === undefined) { if (required) e(`Required field ${key}`); return null; }
  const v = i[key];
  if (typeof v !== 'string' || !v.trim() || v.length > max) { e(`Invalid field ${key}`); return null; }
  return v;
}
/** Read-only readings: an ordered list with only an entity and an optional short label per row. */
function entries(i, e) {
  if (!Array.isArray(i.entries) || i.entries.length < 1 || i.entries.length > 3) { e('entities requires 1 to 3 entries'); return; }
  for (const entry of i.entries) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) { e('entries: each entry must be an object'); continue; }
    for (const k of Object.keys(entry)) if (k !== 'entity' && k !== 'title') e(`Unknown field entries: ${k}`);
    const entity = field(entry, 'entity', 128, true, e);
    if (entity != null && !ENTITY_RE.test(entity)) e(`entries: invalid entity ${entity}`);
    field(entry, 'title', 40, false, e);
  }
}
/** The clock's compact readings list; bad rows remain visible while their form is being edited. */
export function entitiesPreview(item, states) {
  const nonblank = (v) => typeof v === 'string' && v.trim() ? v : null;
  const humanize = (id) => { const name = typeof id === 'string' ? id.slice(id.indexOf('.') + 1).replace(/_/g, ' ') : ''; return name ? name[0].toUpperCase() + name.slice(1) : 'Entity'; };
  const decimal = new Intl.NumberFormat('en-GB', { useGrouping: false, maximumFractionDigits: 1 });
  const stateText = (id, state, attributes) => {
    const domain = domainOf(id);
    const translated = (values) => Object.hasOwn(values, state) ? values[state] : null;
    if (domain === 'cover') return translated({ open: 'Open', closed: 'Closed', opening: 'Opening…', closing: 'Closing…' });
    if (domain === 'lock') return translated({ locked: 'Locked', unlocked: 'Unlocked', locking: 'Closing…', unlocking: 'Opening…', jammed: 'Jammed' });
    if (domain === 'binary_sensor' && (state === 'on' || state === 'off')) {
      if (['door', 'window', 'garage_door', 'opening', 'gate'].includes(attributes.device_class)) return state === 'on' ? 'Open' : 'Closed';
      if (['motion', 'occupancy', 'presence', 'moving'].includes(attributes.device_class)) return state === 'on' ? 'Detected' : 'None';
      return state === 'on' ? 'Yes' : 'No';
    }
    return translated({ on: 'On', off: 'Off' });
  };
  const rows = (Array.isArray(item.entries) ? item.entries : []).map((entry) => {
    const id = entry && entry.entity, entity = states[id], attributes = entity && entity.attributes || {};
    const title = nonblank(entry && entry.title) || nonblank(attributes.friendly_name) || humanize(id);
    if (!entity || !nonblank(entity.state) || entity.state === 'unknown' || entity.state === 'unavailable') return { title, value: '—' };
    const number = Number(entity.state);
    if (!Number.isFinite(number)) { const translated = stateText(id, entity.state, attributes); if (translated) return { title, value: translated }; }
    const text = Number.isFinite(number) ? decimal.format(number) : entity.state;
    const unit = nonblank(attributes.unit_of_measurement);
    return { title, value: unit ? `${text} ${unit}` : text };
  });
  return { title: nonblank(item.title) || 'Readings', rows };
}
/** The clock's climate tile (CardBodies.climate, SPEC 0.19) for the preview: measured temperature, "Zadana 20,5°" under it. */
export function climatePreview(item, states) {
  const e = states[item.entity], a = (e && e.attributes) || {};
  const known = e && e.state !== 'unknown' && e.state !== 'unavailable';
  const deg = (v, one) => { const n = Number(v); if (v == null || !Number.isFinite(n)) return null; const t = one ? n.toFixed(1) : String(Math.round(n * 10) / 10); return t + '°'; };
  const title = item.title || a.friendly_name || item.entity;
  if (!known) return { title, value: '—', detail: 'Disconnected' };
  const target = deg(a.temperature);
  return { title, value: deg(a.current_temperature, true) || '—', detail: e.state === 'off' ? 'Off' : target ? 'Target ' + target : e.state };
}
/** The clock's energy tile (CardBodies.energy) for the editor preview: {title, value}; `states` is hass.states. */
export function energyPreview(item, states) {
  const unit = (e) => (e && e.attributes && e.attributes.unit_of_measurement) || '';
  const known = (e) => e && e.state !== 'unknown' && e.state !== 'unavailable';
  const num = (e, u) => { if (!known(e)) return '—'; const v = Number(e.state); const t = Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : e.state; return u ? `${t} ${u}` : t; };
  const pv = states[item.entity], house = states[item.load_entity], pu = unit(pv), hu = unit(house);
  const pair = pu === hu ? `${num(pv, '')} / ${num(house, '')}${pu ? ' ' + pu : ''}` : `${num(pv, pu)} / ${num(house, hu)}`;
  if (!item.battery_entity) return { title: item.title || 'PV', value: pair };
  const b = states[item.battery_entity];
  return { title: pair, value: num(b, unit(b)) };
}
function when(w, key, e) {
  if (typeof w !== 'object' || w === null || Array.isArray(w)) { e(`${key} must be an object`); return; }
  for (const k of Object.keys(w)) if (k !== 'entity' && k !== 'state') e(`Unknown field ${key}: ${k}`);
  if (typeof w.entity !== 'string' || !ENTITY_RE.test(w.entity) || w.entity.length > 128) e(`Invalid entity ${key}`);
  if (typeof w.state !== 'string' || !w.state.trim()) e('Required field state');
  else if (w.state.length > 64) e('Invalid field state');
  else if (w.state === 'unknown' || w.state === 'unavailable') e(`Missing data cannot indicate ${key === 'visible_when' ? 'visibility' : key === 'when' ? 'an alert' : 'forecast mode'}`);
}

// --- alerts (SPEC 0.20, DashboardSpec.alerts) ---
export const EMPTY_TYPES = ['energy', 'climate', 'weather', 'clock', 'tile'];
const SOURCE_KEYS = ['title', 'entity', 'icon', 'when', 'off_entity', 'show_since', 'done_entity', 'done_label', 'blink'];
function alerts(i, e) {
  const size = (i.width === 1 && i.height === 1) || (i.width === 1 && i.height === 2) || (i.width === 2 && i.height === 1);
  if (!size) e('The alerts tile must be 1x1, 1x2 or 2x1');
  const list = Array.isArray(i.sources) ? i.sources : null;
  if (!list || list.length === 0 || list.length > MAX_ITEMS) { e(`alerts requires 1 to ${MAX_ITEMS} sources entries`); return; }
  const seen = new Set();
  for (const src of list) {
    if (typeof src !== 'object' || src === null || Array.isArray(src)) { e('sources: each entry must be an object'); continue; }
    for (const k of Object.keys(src)) if (!SOURCE_KEYS.includes(k)) e(`Unknown field sources: ${k}`);
    field(src, 'title', 40, true, e);
    const entity = field(src, 'entity', 128, true, e);
    if (entity != null && !ENTITY_RE.test(entity)) e(`sources: invalid entity ${entity}`);
    when(src.when, 'when', e); // absent is "when musi być obiektem", as on the clock
    if (src.when && typeof src.when === 'object') {
      const key = `${src.when.entity}=${src.when.state}`;
      if (seen.has(key)) e(`sources: duplicate condition ${src.when.entity} = ${src.when.state}`); else seen.add(key);
    }
    // present means present, also as JSON null - the clock rejects a null exactly like a wrong type
    if ('off_entity' in src) { const off = field(src, 'off_entity', 128, true, e); if (off != null && !/^light\.[a-z0-9_]+$/.test(off)) e('off_entity requires an entity in domain light'); }
    if ('show_since' in src && typeof src.show_since !== 'boolean') e('show_since must be a boolean');
    if ('blink' in src && typeof src.blink !== 'boolean') e('blink must be a boolean');
    // SPEC 0.20 pkt 4a: one "done" button per row, never together with "Zgaś"
    let done = null;
    if ('done_entity' in src) { done = field(src, 'done_entity', 128, true, e); if (done != null && !/^(script|input_boolean|input_button|button)\.[a-z0-9_]+$/.test(done)) e('done_entity requires a script, input_boolean, input_button or button entity'); }
    if ('done_label' in src) { if (!('done_entity' in src)) e('done_label requires done_entity'); else field(src, 'done_label', 12, true, e); }
    if ('off_entity' in src && 'done_entity' in src) e('sources: off_entity and done_entity are mutually exclusive');
    if ('icon' in src) { const icon = field(src, 'icon', 40, true, e); if (icon != null && !(MDI_RE.test(icon) || LEGACY_ICONS.includes(icon))) e(`Unknown icon: ${icon}`); }
  }
  if (i.empty === undefined) return;
  const x = i.empty;
  if (typeof x !== 'object' || x === null || Array.isArray(x)) { e('empty must be an object'); return; }
  for (const k of ['id', 'column', 'row', 'width', 'height', 'visible_when']) if (k in x) e(`empty: field ${k} is inherited from the alerts tile`);
  const type = field(x, 'type', 16, true, e);
  if (type == null) return;
  if (!EMPTY_TYPES.includes(type)) { e(`empty: allowed types ${EMPTY_TYPES.join(', ')}`); return; }
  // the stand-in is validated as a card of its own in the tile's place, exactly as the clock does
  const card = { ...x, id: i.id, column: i.column, row: i.row, width: i.width, height: i.height };
  for (const err of validate({ pages: [{ id: 'empty', items: [card] }] })) e(err.msg);
}
/** Active/unknown/inactive per source, as the clock's AlertsModel decides it (a missing or unavailable entity is unknown). */
export function alertsPreview(item, states) {
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const active = [], unknown = [];
  for (const s of sources) {
    const w = s && s.when && states[s.when.entity];
    if (!w || w.state === 'unknown' || w.state === 'unavailable') unknown.push(s);
    else if (w.state === s.when.state) active.push({ s, lc: Date.parse(w.last_changed) || 0 });
  }
  active.sort((a, b) => (a.lc === 0) !== (b.lc === 0) ? (a.lc === 0 ? 1 : -1) : b.lc - a.lc);
  const title = item.title || 'Alerts';
  if (active.length) return { title, value: `${active.length} · ${active[0].s.title}${active.length > 1 ? ' +' + (active.length - 1) : ''}${unknown.length ? ` · No data: ${unknown.length}` : ''}`, state: 'active' };
  if (unknown.length) return { title, value: '- · No data', state: 'unknown' };
  return { title, value: item.empty ? `0 · in this place: ${(TYPES[item.empty.type] || { label: item.empty.type }).label}` : '0 · No alerts', state: 'empty' };
}
/** The form edits sources flat (when -> when_entity/when_state); this is the wire shape back. */
export function sourceFromForm(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return f; // not a source at all: kept as typed, validation names it
  const t = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const state = typeof f.when_state === 'string' && f.when_state.trim() ? f.when_state : ''; // compared exactly on the clock: never trimmed
  const out = { title: t(f.title) || '', entity: t(f.entity) || '', when: { entity: t(f.when_entity) || '', state } };
  if (t(f.icon)) out.icon = t(f.icon);
  if (t(f.off_entity)) out.off_entity = t(f.off_entity);
  if (f.show_since === false) out.show_since = false;
  if (f.blink === true) out.blink = true;
  if (t(f.done_entity)) { out.done_entity = t(f.done_entity); if (t(f.done_label)) out.done_label = t(f.done_label); }
  return out;
}
export function sourceToForm(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { title: '', entity: '', when_entity: '', when_state: '', show_since: true }; // broken input: validation already names it
  const f = { title: s.title, entity: s.entity, when_entity: s.when && s.when.entity, when_state: s.when && s.when.state, show_since: s.show_since !== false };
  if (s.icon) f.icon = s.icon;
  if (s.off_entity) f.off_entity = s.off_entity;
  f.blink = s.blink === true;
  if (s.done_entity) f.done_entity = s.done_entity;
  if (s.done_label) f.done_label = s.done_label;
  return f;
}

// --- forms (ha-form data is flat; nested wire fields are folded and unfolded here) ---
export function toForm(item) {
  const f = { ...item };
  delete f.visible_when; delete f.confirmation; delete f.tap_action; delete f.covers; delete f.forecast_when;
  if (item.visible_when) { f.visible_entity = item.visible_when.entity; f.visible_state = item.visible_when.state; }
  if (item.forecast_when) { f.forecast_when_entity = item.forecast_when.entity; f.forecast_when_state = item.forecast_when.state; }
  if (item.confirmation) { f.confirm_enabled = item.confirmation.enabled; if (item.confirmation.text) f.confirm_text = item.confirmation.text; }
  if (item.type === 'tile') f.action = item.tap_action ? item.tap_action.action : defaultIntent(domainOf(item.entity));
  if (item.type === 'entities' && item.entries !== undefined) f.entries = clone(item.entries);
  if (item.type === 'alerts') { f.sources = (Array.isArray(item.sources) ? item.sources : []).map(sourceToForm); delete f.empty; if (item.empty !== undefined) f.empty_card = clone(item.empty); }
  if (item.covers) { f.cover1_entity = item.covers[0]?.entity; f.cover1_title = item.covers[0]?.title; f.cover2_entity = item.covers[1]?.entity; f.cover2_title = item.covers[1]?.title; }
  return f;
}
export function fromForm(type, data) {
  const def = TYPES[type], item = { id: data.id, type, column: data.column, row: data.row, width: data.width, height: data.height };
  const text = (k) => (typeof data[k] === 'string' && data[k].trim() ? data[k].trim() : undefined);
  if (text('title')) item.title = text('title');
  for (const k of ['entity', 'load_entity', 'battery_entity', 'temperature_entity', 'forecast_entity', 'attribute', 'off_entity', 'icon']) if (def.fields.includes(k) && text(k)) item[k] = text(k);
  if (def.fields.includes('forecast_when') && (text('forecast_when_entity') || text('forecast_when_state'))) item.forecast_when = { entity: text('forecast_when_entity') || '', state: text('forecast_when_state') || '' };
  if (text('visible_entity') || text('visible_state')) item.visible_when = { entity: text('visible_entity') || '', state: text('visible_state') || '' };
  if (type === 'tile') { const action = data.action || defaultIntent(domainOf(item.entity)); if (action !== defaultIntent(domainOf(item.entity)) || data.action === 'none') item.tap_action = { action }; }
  else if (def.action && data.tap_action_set) item.tap_action = { action: def.action };
  if (def.fields.includes('confirmation') && typeof data.confirm_enabled === 'boolean') { item.confirmation = { enabled: data.confirm_enabled }; if (text('confirm_text')) item.confirmation.text = text('confirm_text'); }
  if (type === 'entities' && data.entries !== undefined) item.entries = clone(data.entries);
  if (type === 'alerts') {
    item.sources = Array.isArray(data.sources) ? data.sources.map(sourceFromForm) : data.sources == null ? [] : data.sources;
    // anything typed that is not an empty object stays in the item, so validation names it instead of it vanishing on save
    const x = data.empty_card;
    if (x !== undefined && x !== null && x !== '' && !(typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 0)) item.empty = clone(x);
  }
  if (def.fields.includes('covers')) item.covers = [{ entity: text('cover1_entity') || '', title: text('cover1_title') || '' }, { entity: text('cover2_entity') || '', title: text('cover2_title') || '' }];
  return item;
}
/** ha-form schema per type; `item` decides the intent options (domain) and `version` the icon selector. */
export function schemaFor(type, item, legacyVersion) {
  const def = TYPES[type], s = [];
  s.push({ name: 'id', required: true, selector: { text: {} } });
  s.push({ name: 'title', selector: { text: {} } });
  s.push({ type: 'grid', name: '', schema: [
    { name: 'column', required: true, selector: { number: { min: 1, max: COLUMNS, mode: 'box' } } },
    { name: 'row', required: true, selector: { number: { min: 1, max: ROWS, mode: 'box' } } },
    { name: 'width', required: true, selector: { number: { min: 1, max: COLUMNS, mode: 'box' } } },
    { name: 'height', required: true, selector: { number: { min: 1, max: ROWS, mode: 'box' } } },
  ] });
  if (def.entityDomain !== null) s.push({ name: 'entity', required: true, selector: { entity: def.entityDomain ? { domain: def.entityDomain } : {} }, ...(type === 'energy' ? { label: 'Solar power (sensor)' } : {}) });
  if (def.fields.includes('load_entity')) { s.push({ name: 'load_entity', required: true, selector: { entity: { domain: 'sensor' } } }); s.push({ name: 'battery_entity', selector: { entity: { domain: 'sensor' } } }); }
  if (def.fields.includes('temperature_entity')) s.push({ name: 'temperature_entity', selector: { entity: { domain: 'sensor' } } });
  if (def.fields.includes('forecast_entity')) {
    s.push({ name: 'forecast_entity', selector: { entity: { domain: 'sensor' } } });
    s.push({ name: 'forecast_when_entity', selector: { entity: {} } });
    s.push({ name: 'forecast_when_state', selector: { text: {} } });
  }
  if (def.fields.includes('attribute')) s.push({ name: 'attribute', selector: { text: {} } });
  if (def.fields.includes('off_entity') && (legacyVersion == null || legacyVersion >= 5)) s.push({ name: 'off_entity', selector: { entity: { domain: 'light' } } });
  if (def.fields.includes('icon')) s.push(def.legacy || type === 'music' || type === 'cover_group'
    ? { name: 'icon', selector: { select: { mode: 'dropdown', options: LEGACY_ICONS.map((v) => ({ value: v, label: v })) } } }
    : { name: 'icon', selector: { icon: {} } });
  if (type === 'tile') s.push({ name: 'action', selector: { select: { mode: 'dropdown', options: allowedIntents(domainOf(item.entity)).map((v) => ({ value: v, label: INTENT_LABEL[v] })) } } });
  if (def.fields.includes('confirmation')) { s.push({ name: 'confirm_enabled', selector: { boolean: {} } }); s.push({ name: 'confirm_text', selector: { text: {} } }); }
  if (type === 'entities') {
    // The HA row selector dereferences every entry. Keep malformed typed lists in its YAML editor until repaired.
    const structured = Array.isArray(item.entries) && item.entries.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
    s.push({ name: 'entries', label: 'Readings (1 to 3, in display order)', required: true, selector: { object: structured ? { multiple: true, label_field: 'entity', fields: {
      entity: { label: 'Entity', required: true, selector: { entity: {} } },
      title: { label: 'Name (optional, up to 40 characters)', selector: { text: {} } },
    } } : {} } });
  }
  if (type === 'alerts') {
    s.push({ name: 'sources', required: true, selector: { object: { multiple: true, label_field: 'title', fields: {
      title: { label: 'Title', required: true, selector: { text: {} } },
      entity: { label: 'List text (entity)', required: true, selector: { entity: {} } },
      when_entity: { label: 'Active when entity', required: true, selector: { entity: {} } },
      when_state: { label: 'has state', required: true, selector: { text: {} } },
      icon: { label: 'Icon', selector: { icon: {} } },
      off_entity: { label: 'Lights to turn off (light)', selector: { entity: { domain: 'light' } } },
      show_since: { label: 'Show the "Active since" time', selector: { boolean: {} } },
      blink: { label: 'Blink dock light while active (high priority only)', selector: { boolean: {} } },
      done_entity: { label: '"Done" button: script / switch / button (instead of Turn off)', selector: { entity: { domain: ['script', 'input_boolean', 'input_button', 'button'] } } },
      done_label: { label: 'Button label (up to 12 characters, defaults to Done)', selector: { text: {} } },
    } } } });
    s.push({ name: 'empty_card', selector: { object: {} } });
  }
  if (def.fields.includes('covers')) for (const n of [1, 2]) { s.push({ name: `cover${n}_entity`, required: true, selector: { entity: { domain: 'cover' } } }); s.push({ name: `cover${n}_title`, required: true, selector: { text: {} } }); }
  s.push({ name: 'visible_entity', selector: { entity: {} } });
  s.push({ name: 'visible_state', selector: { text: {} } });
  return s;
}
export const LABELS = { sources: 'Warnings', empty_card: `Card shown here when there are no alerts (YAML without id or position; types: ${EMPTY_TYPES.join(', ')}; empty = "No alerts")`, load_entity: 'Home consumption (sensor)', battery_entity: 'Battery % (optional)', id: 'Identifier', title: 'Title', column: 'Column', row: 'Row', width: 'Width', height: 'Height', entity: 'Entity', temperature_entity: 'Temperature sensor', forecast_entity: 'Forecast for tomorrow (sensor)', forecast_when_entity: 'Forecast mode: entity', forecast_when_state: 'Forecast mode: state', attribute: 'Attribute instead of state', off_entity: 'Lights to turn off (light)', icon: 'Icon', action: 'Tap action', confirm_enabled: 'Confirm before running', confirm_text: 'Confirmation text', cover1_entity: 'Blind A: entity', cover1_title: 'Blind A: name', cover2_entity: 'Blind B: entity', cover2_title: 'Blind B: name', visible_entity: 'Visible when entity', visible_state: 'has state' };
