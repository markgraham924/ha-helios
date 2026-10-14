// node --test tests/panel  (no npm; node >= 20)
// The validator must refuse exactly what the clock refuses (dash: DashboardSpecTest, DashboardSpecV6Test), with the same words.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../custom_components/helios/panel/helios-schema.js';

const item = (id, type, column, row, width = 1, height = 1, extra = {}) => ({ id, type, column, row, width, height, ...extra });
const tile = (id, entity, column, row, extra = {}) => item(id, 'tile', column, row, 1, 1, { entity, ...extra });
function example() {
  return { pages: [
    { id: 'main', title: 'Home', items: [
      item('clock', 'clock', 1, 1, 2, 2, { title: 'Home' }),
      item('weather', 'weather', 3, 1, 2, 1, { entity: 'weather.forecast_dom' }),
      tile('salon', 'light.salon', 3, 2, { icon: 'mdi:ceiling-light', tap_action: { action: 'toggle' } }),
      tile('roleta', 'cover.roleta_salon', 4, 2),
      tile('temp', 'sensor.temperatura_salon', 1, 3, { title: 'Salon' }),
      tile('wilg', 'sensor.czujnik_salon', 2, 3, { attribute: 'humidity', icon: 'mdi:water-percent' }),
      tile('zamek', 'lock.drzwi', 3, 3, { tap_action: { action: 'lock' }, confirmation: { enabled: true, text: 'Zamknąć drzwi?' } }),
      item('music', 'music', 4, 3),
    ] },
    { id: 'sypialnia', title: 'Sypialnia', items: [
      item('rolety', 'cover_group', 1, 1, 1, 1, { covers: [{ entity: 'cover.a', title: 'Blind A' }, { entity: 'cover.b', title: 'Blind B' }] }),
      tile('noc', 'scene.noc', 2, 1, { icon: 'mdi:weather-night', title: 'Dobranoc' }),
      item('garaz', 'garage', 1, 3, 4, 1, { entity: 'cover.brama', visible_when: { entity: 'binary_sensor.wieczor', state: 'on' } }),
      item('swiatla', 'entity', 3, 1, 1, 1, { entity: 'sensor.swiatla', icon: 'lightbulb', off_entity: 'light.grupa' }),
    ] },
  ] };
}
const withItem = (id, patch) => { const m = example(); for (const p of m.pages) for (const i of p.items) if (i.id === id) Object.assign(i, patch); return m; };
const msgs = (m) => S.validate(m).map((e) => e.msg);
const rejects = (m, msg) => assert.ok(msgs(m).some((x) => x.startsWith(msg)), `expected "${msg}", got ${JSON.stringify(msgs(m))}`);

test('entities: displays three ordered readings from any HA entity domain', () => {
  const m = { pages: [{ id: 'main', items: [item('odczyty', 'entities', 1, 1, 1, 1, {
    entries: [{ entity: 'sensor.temperature', title: 'Temperatura' }, { entity: 'input_number.target' }, { entity: 'binary_sensor.window' }],
  })] }] };
  assert.deepEqual(S.validate(m), []);
});

test('entities: entries are required and limited to one through three readings', () => {
  const doc = (extra) => ({ pages: [{ id: 'main', items: [item('odczyty', 'entities', 1, 1, 1, 1, extra)] }] });
  for (const entries of [undefined, null, {}, [], [{ entity: 'sensor.a' }, { entity: 'sensor.b' }, { entity: 'sensor.c' }, { entity: 'sensor.d' }]]) {
    assert.deepEqual(msgs(doc(entries === undefined ? {} : { entries })), ['entities requires 1 to 3 entries']);
  }
  assert.deepEqual(msgs(doc({ entries: [{ entity: 'sensor.a' }] })), []);
});

test('entities: each entry strictly validates its HA id and optional label', () => {
  const doc = (entry) => ({ pages: [{ id: 'main', items: [item('odczyty', 'entities', 1, 1, 1, 1, { entries: [entry] })] }] });
  for (const [entry, want] of [
    [null, 'entries: each entry must be an object'],
    [[], 'entries: each entry must be an object'],
    ['sensor.a', 'entries: each entry must be an object'],
    [{}, 'Required field entity'],
    [{ entity: null }, 'Invalid field entity'],
    [{ entity: '' }, 'Invalid field entity'],
    [{ entity: 'sensor.' }, 'entries: invalid entity sensor.'],
    [{ entity: 'sensor.' + 'a'.repeat(122) }, 'Invalid field entity'],
    [{ entity: 'sensor.a', title: null }, 'Invalid field title'],
    [{ entity: 'sensor.a', title: ' ' }, 'Invalid field title'],
    [{ entity: 'sensor.a', title: 'x'.repeat(41) }, 'Invalid field title'],
    [{ entity: 'sensor.a', icon: 'mdi:eye' }, 'Unknown field entries: icon'],
    [{ entity: 'sensor.a', attribute: 'humidity' }, 'Unknown field entries: attribute'],
    [{ entity: 'sensor.a', unit: '%' }, 'Unknown field entries: unit'],
  ]) assert.deepEqual(msgs(doc(entry)), [want]);
  assert.deepEqual(msgs(doc({ entity: 'sensor.a', title: 'x'.repeat(40) })), []);
});

test('entities: remains read-only and cannot replace an empty alerts card', () => {
  const doc = (extra) => ({ pages: [{ id: 'main', items: [item('odczyty', 'entities', 1, 1, 1, 1, { entries: [{ entity: 'number.target' }], ...extra })] }] });
  for (const extra of [{ tap_action: { action: 'toggle' } }, { confirmation: { enabled: true } }, { entity: 'sensor.a' }]) {
    assert.ok(msgs(doc(extra)).length > 0);
  }
  assert.deepEqual(msgs(doc({ title: 'Liczby', icon: 'mdi:gauge' })), []);
  const alerts = { pages: [{ id: 'main', items: [item('uwagi', 'alerts', 1, 1, 2, 1, {
    sources: [{ title: 'A', entity: 'sensor.a', when: { entity: 'binary_sensor.a', state: 'on' } }],
    empty: { type: 'entities', entries: [{ entity: 'sensor.a' }] },
  })] }] };
  assert.deepEqual(msgs(alerts), ['empty: allowed types energy, climate, weather, clock, tile']);
});

test('entities: editing and saving preserve order and malformed typed entries for validation', () => {
  const wire = item('odczyty', 'entities', 1, 1, 1, 1, { title: 'Salon', entries: [{ entity: 'sensor.c', title: 'CO₂' }, { entity: 'sensor.t' }] });
  assert.deepEqual(S.fromForm('entities', S.toForm(wire)), wire);
  assert.deepEqual(S.fromLovelace({ helios: { version: 6, pages: [{ id: 'main', items: [wire] }] } }).model, { pages: [{ id: 'main', items: [wire] }] });
  for (const entries of [null, {}, [null], [{ entity: null }], [{ entity: 'sensor.a', title: null }], [{ entity: 'sensor.a', extra: true }]]) {
    const bad = { ...wire, entries };
    assert.deepEqual(S.fromForm('entities', S.toForm(bad)), bad);
  }
  const form = S.toForm(wire);
  form.entries.reverse();
  assert.equal(wire.entries[0].entity, 'sensor.c', 'editing the form must not mutate the saved model');
  const schema = S.schemaFor('entities', wire, null).find((s) => s.name === 'entries');
  assert.equal(schema.selector.object.multiple, true);
  assert.deepEqual(schema.selector.object.fields.entity.selector, { entity: {} });
  const fresh = S.emptyItem('entities', { column: 1, row: 1 }, []);
  assert.deepEqual(fresh.entries, [{ entity: '' }]);
});

test('entities: malformed lists use an object editor until repaired instead of crashing a row picker', () => {
  for (const entries of [null, {}, [null], ['sensor.a'], [[]]]) {
    const schema = S.schemaFor('entities', { entries }, null).find((s) => s.name === 'entries');
    assert.deepEqual(schema.selector, { object: {} });
  }
  const schema = S.schemaFor('entities', { entries: [{ entity: 'sensor.a' }] }, null).find((s) => s.name === 'entries');
  assert.equal(schema.selector.object.multiple, true);
});

test('entities: preview keeps the row labels and formats numeric states with their own units', () => {
  const i = { entries: [{ entity: 'sensor.temperature', title: 'Temp.' }, { entity: 'sensor.humidity' }, { entity: 'sensor.co2' }] };
  const states = {
    'sensor.temperature': { state: '23.46', attributes: { unit_of_measurement: '°C', friendly_name: 'Salon' } },
    'sensor.humidity': { state: '51', attributes: { unit_of_measurement: '%', friendly_name: 'Wilgotność' } },
    'sensor.co2': { state: '812', attributes: { unit_of_measurement: 'ppm' } },
  };
  assert.deepEqual(S.entitiesPreview(i, states), { title: 'Readings', rows: [
    { title: 'Temp.', value: '23.5 °C' }, { title: 'Wilgotność', value: '51 %' }, { title: 'Co2', value: '812 ppm' },
  ] });
  assert.deepEqual(S.entitiesPreview({ title: 'Status', entries: [{ entity: 'sensor.next_visit' }, { entity: 'input_number.target' }] }, {
    'sensor.next_visit': { state: 'jutro', attributes: {} }, 'input_number.target': { state: '-2.04', attributes: {} },
  }), { title: 'Status', rows: [{ title: 'Next visit', value: 'jutro' }, { title: 'Target', value: '-2' }] });
});

test('entities: unavailable rows keep an em dash beside the remaining known values', () => {
  assert.deepEqual(S.entitiesPreview({ entries: [{ entity: 'sensor.missing' }, { entity: 'sensor.unknown' }, { entity: 'sensor.offline' }] }, {
    'sensor.unknown': { state: 'unknown', attributes: {} }, 'sensor.offline': { state: 'unavailable', attributes: { unit_of_measurement: '%' } },
  }), { title: 'Readings', rows: [{ title: 'Missing', value: '—' }, { title: 'Unknown', value: '—' }, { title: 'Offline', value: '—' }] });
  assert.deepEqual(S.entitiesPreview({ entries: [{ entity: 'sensor.missing' }, { entity: 'sensor.ok' }] }, {
    'sensor.ok': { state: '42.04', attributes: { unit_of_measurement: 'W' } },
  }).rows, [{ title: 'Missing', value: '—' }, { title: 'Ok', value: '42 W' }]);
  assert.doesNotThrow(() => S.entitiesPreview({ entries: [null, { entity: null }] }, {}));
});

test('entities: text readings use the clock translations for binary sensors, covers and switches', () => {
  for (const [entity, state, device_class, want] of [
    ['cover.blind', 'opening', undefined, 'Opening…'],
    ['lock.front', 'jammed', undefined, 'Jammed'],
    ['binary_sensor.window', 'on', 'window', 'Open'],
    ['binary_sensor.motion', 'off', 'motion', 'None'],
    ['binary_sensor.dock', 'on', undefined, 'Yes'],
    ['switch.socket', 'off', undefined, 'Off'],
    ['sensor.status', 'ready', undefined, 'ready'],
    ['sensor.status', 'toString', undefined, 'toString'],
  ]) {
    const preview = S.entitiesPreview({ entries: [{ entity }] }, { [entity]: { state, attributes: { device_class } } });
    assert.equal(preview.rows[0].value, want);
  }
});

test('entities: decimal half rounding matches the clock for positive and negative readings', () => {
  for (const [state, want] of [['1.25', '1.3'], ['-1.25', '-1.3'], ['21.45', '21.5'], ['-0.04', '-0']]) {
    assert.equal(S.entitiesPreview({ entries: [{ entity: 'sensor.n' }] }, { 'sensor.n': { state, attributes: {} } }).rows[0].value, want);
  }
});

test('the example is valid and round-trips as version 6', () => {
  assert.deepEqual(S.validate(example()), []);
  const doc = S.toHelios(example());
  assert.equal(doc.version, 6);
  assert.deepEqual(S.fromLovelace({ helios: doc }).model, example());
  assert.ok(JSON.stringify(doc).length < S.MAX_BYTES);
});
test('legacy documents load as one page and say so', () => {
  const v2 = { version: 2, grid: { columns: 4, rows: 3 }, items: [item('clock', 'clock', 1, 1, 4, 3)] };
  const parsed = S.fromLovelace({ helios: v2, views: [] });
  assert.equal(parsed.legacyVersion, 2);
  assert.deepEqual(parsed.model.pages, [{ id: 'main', items: v2.items }]);
  assert.match(parsed.notice, /Version 2/);
  assert.equal(S.fromLovelace({}).legacyVersion, null);
  assert.deepEqual(S.fromLovelace({}).model.pages, [{ id: 'main', items: [] }]);
  assert.equal(S.fromLovelace({ helios: { version: 9 } }).model, null);
});
test('geometry and identity rules use the clock wording', () => {
  rejects(withItem('garaz', { width: 5 }), 'Item garaz extends beyond the grid');
  rejects(withItem('roleta', { column: 3 }), 'Item roleta overlaps another item');
  rejects(withItem('roleta', { column: 0 }), 'Field column must be a number from 1 to 4');
  rejects(withItem('roleta', { id: 'Zła nazwa' }), 'Invalid ID: Zła nazwa');
  rejects(withItem('noc', { id: 'salon' }), 'Duplicate ID: salon');
  const many = example(); for (let i = 0; i < 9; i++) many.pages[1].items.push(tile('x' + i, 'light.x', 4, 1));
  rejects(many, 'items: at most 12 items');
  const pages = example(); for (let i = 0; i < 7; i++) pages.pages.push({ id: 'p' + i, items: [] });
  rejects(pages, 'pages: at most 8 pages');
  rejects({ pages: [{ id: 'main', items: [] }, { id: 'main', items: [] }] }, 'Duplicate page ID: main');
  rejects({ pages: [{ id: 'Zła', items: [] }] }, 'Invalid page ID: Zła');
  const music = example(); music.pages[0].items.push(item('music2', 'music', 4, 2));
  rejects(music, 'Only one tile is allowed for music');
  const twoPages = example(); twoPages.pages[1].items.push(item('music2', 'music', 4, 1));
  assert.deepEqual(S.validate(twoPages), []);
  rejects(withItem('temp', { title: 'x'.repeat(41) }), 'Invalid field title');
  assert.deepEqual(S.validate({ pages: [] }), [{ page: null, id: null, msg: 'Required field pages' }]);
});
test('entities, domains and fields per type', () => {
  rejects(withItem('weather', { entity: 'sensor.pogoda' }), 'Item weather requires an entity in domain weather');
  rejects(withItem('garaz', { entity: 'binary_sensor.brama' }), 'Item garaz requires an entity in domain cover');
  rejects(withItem('salon', { entity: 'light' }), 'Item salon requires an entity in domain tile');
  rejects(withItem('clock', { icon: 'information' }), 'Field not allowed for type clock: icon');
  rejects(withItem('salon', { off_entity: 'light.x' }), 'Field not allowed for type tile: off_entity');
  rejects(withItem('salon', { icn: 'x' }), 'Field not allowed for type tile: icn');
  rejects(withItem('wilg', { attribute: 'Bad-Name' }), 'Invalid attribute');
  rejects(withItem('weather', { temperature_entity: 'number.t' }), 'temperature_entity requires a sensor entity');
  rejects(withItem('weather', { forecast_entity: 'sensor.x' }), 'weather: forecast_entity and forecast_when must appear together');
  rejects(withItem('weather', { forecast_entity: 'sensor.x', forecast_when: { entity: 'binary_sensor.x', state: 'unavailable' } }), 'Missing data cannot indicate forecast mode');
  rejects(withItem('swiatla', { off_entity: 'switch.x' }), 'off_entity requires an entity in domain light');
  rejects(withItem('rolety', { covers: [{ entity: 'cover.a', title: 'A' }] }), 'cover_group requires exactly two covers entries');
  rejects(withItem('rolety', { covers: [{ entity: 'cover.a', title: 'A' }, { entity: 'cover.a', title: 'B' }] }), 'covers: the same blind appears twice');
  rejects(withItem('rolety', { covers: [{ entity: 'light.a', title: 'A' }, { entity: 'cover.b', title: 'B' }] }), 'covers requires an entity in domain cover');
  rejects(withItem('garaz', { visible_when: { entity: 'binary_sensor.x', state: 'unknown' } }), 'Missing data cannot indicate visibility');
  rejects(withItem('garaz', { visible_when: { entity: 'binary_sensor.x' } }), 'Required field state');
  rejects(withItem('temp', { type: 'button' }), 'Unsupported item type: button');
});
test('intents follow the domain and locks always ask', () => {
  rejects(withItem('temp', { tap_action: { action: 'toggle' } }), 'Entity sensor.temperatura_salon does not support action toggle');
  rejects(withItem('salon', { tap_action: { action: 'open' } }), 'Entity light.salon does not support action open');
  rejects(withItem('salon', { tap_action: { action: 'light.turn_on' } }), 'Entity light.salon does not support action light.turn_on');
  rejects(withItem('salon', { tap_action: { action: 'toggle', data: {} } }), 'Unknown field tap_action');
  rejects(withItem('zamek', { confirmation: { enabled: false } }), 'Action lock requires confirmation');
  assert.deepEqual(S.validate(withItem('temp', { confirmation: { enabled: true } })), []); // the clock accepts it on any tile
  rejects(withItem('temp', { confirmation: { enabled: 'yes' } }), 'confirmation.enabled must be a boolean');
  assert.deepEqual(S.validate(withItem('temp', { tap_action: { action: 'none' } })), []);
  rejects(withItem('garaz', { tap_action: { action: 'open' } }), 'Type garage allows only tap_action.action: close');
  rejects(withItem('swiatla', { tap_action: { action: 'toggle' } }), 'Type entity allows only tap_action.action: lights_off');
  assert.deepEqual(S.allowedIntents('lock'), ['none', 'details', 'lock', 'unlock']);
  assert.equal(S.defaultIntent('cover'), 'controls'); assert.equal(S.defaultIntent('script'), 'activate'); assert.equal(S.defaultIntent('sensor'), 'details');
});
test('icons: mdi names or the six legacy words', () => {
  rejects(withItem('salon', { icon: 'alert' }), 'Unknown icon: alert');
  rejects(withItem('salon', { icon: 'mdi:Bad Name' }), 'Unknown icon: mdi:Bad Name');
  assert.deepEqual(S.validate(withItem('salon', { icon: 'lightbulb' })), []);
  assert.deepEqual(S.validate(withItem('music', { icon: 'music' })), []);
});
test('slug: ascii, unique, bounded', () => {
  assert.equal(S.slug('Łazienka górna'), 'lazienka-gorna');
  assert.equal(S.slug('Łazienka górna', ['lazienka-gorna']), 'lazienka-gorna-2');
  assert.equal(S.slug('Łazienka górna', ['lazienka-gorna', 'lazienka-gorna-2']), 'lazienka-gorna-3');
  assert.equal(S.slug('!!!'), 'karta');
  assert.equal(S.slug('a'.repeat(50)).length, 40);
  assert.equal(S.slug('a'.repeat(50), ['a'.repeat(40)]).length, 40);
});
test('forms fold and unfold the nested wire fields', () => {
  const zamek = example().pages[0].items[6];
  const form = S.toForm(zamek);
  assert.equal(form.action, 'lock'); assert.equal(form.confirm_enabled, true); assert.equal(form.confirm_text, 'Zamknąć drzwi?');
  assert.deepEqual(S.fromForm('tile', form), zamek);
  const roleta = example().pages[0].items[3];
  assert.equal(S.toForm(roleta).action, 'controls');
  assert.deepEqual(S.fromForm('tile', S.toForm(roleta)), roleta); // the default intent is not written back
  assert.deepEqual(S.fromForm('tile', { ...S.toForm(roleta), action: 'none' }).tap_action, { action: 'none' });
  const garaz = example().pages[1].items[2];
  assert.deepEqual(S.fromForm('garage', S.toForm(garaz)), garaz);
  const rolety = example().pages[1].items[0];
  assert.deepEqual(S.fromForm('cover_group', S.toForm(rolety)), rolety);
  const weather = item('w', 'weather', 1, 1, 2, 1, { entity: 'weather.x', forecast_entity: 'sensor.j', forecast_when: { entity: 'binary_sensor.t', state: 'on' } });
  assert.deepEqual(S.fromForm('weather', S.toForm(weather)), weather);
  assert.equal(S.fromForm('tile', { ...S.toForm(roleta), title: '   ' }).title, undefined);
  assert.ok(S.schemaFor('tile', roleta).some((s) => s.name === 'action' && s.selector.select.options.map((o) => o.value).join() === 'none,details,controls,open,close,stop'));
  assert.ok(S.schemaFor('light', garaz, 2).some((s) => s.name === 'icon' && s.selector.select));
  assert.ok(!S.schemaFor('entity', garaz, 4).some((s) => s.name === 'off_entity'));
  assert.ok(S.schemaFor('entity', garaz, 5).some((s) => s.name === 'off_entity'));
});
test('legacy tiles convert to tile with the same behaviour', () => {
  const m = example();
  assert.deepEqual(S.toTile(m.pages[1].items[2]), { id: 'garaz', type: 'tile', column: 1, row: 3, width: 4, height: 1, entity: 'cover.brama', visible_when: { entity: 'binary_sensor.wieczor', state: 'on' }, icon: 'mdi:garage-open', tap_action: { action: 'close' }, confirmation: { enabled: true } });
  assert.equal(S.toTile(m.pages[1].items[3]), null); // entity + off_entity has no tile equivalent
  const light = item('l', 'light', 1, 1, 1, 1, { entity: 'light.x', title: 'L' });
  assert.deepEqual(S.toTile(light), { id: 'l', type: 'tile', column: 1, row: 1, width: 1, height: 1, entity: 'light.x', title: 'L', icon: 'mdi:lightbulb', tap_action: { action: 'toggle' } });
  const converted = example(); converted.pages[1].items[2] = S.toTile(converted.pages[1].items[2]);
  assert.deepEqual(S.validate(converted), []);
});
test('new items and placement', () => {
  const page = example().pages[0];
  assert.equal(S.fits(page.items, { column: 4, row: 2, width: 1, height: 1 }), false);
  assert.equal(S.fits(page.items, { column: 4, row: 2, width: 1, height: 1 }, 'roleta'), true);
  assert.equal(S.fits(page.items, { column: 4, row: 3, width: 2, height: 1 }, 'music'), false);
  const clock = S.emptyItem('clock', { column: 1, row: 1 }, ['zegar']);
  assert.equal(clock.id, 'zegar-2'); assert.equal(clock.width, 2);
  const t = S.emptyItem('tile', { column: 2, row: 2 }, [], 'light.x');
  assert.deepEqual(t, { id: 'kafelek', type: 'tile', column: 2, row: 2, width: 1, height: 1, entity: 'light.x' });
  assert.ok(S.emptyItem('cover_group', { column: 1, row: 1 }, []).covers.length === 2);
});
test('size limit', () => {
  const m = example(); m.pages[0].items[4].title = 'x'.repeat(40);
  for (let n = 0; n < 6; n++) m.pages.push({ id: 'p' + n, items: Array.from({ length: 12 }, (_, i) => tile('t' + n + '-' + i, 'sensor.' + 'a'.repeat(600), (i % 4) + 1, Math.floor(i / 4) + 1, { attribute: 'a'.repeat(64), visible_when: { entity: 'binary_sensor.' + 'b'.repeat(600), state: 'x'.repeat(60) } })) });
  rejects(m, 'The helios section exceeds 64 KiB');
});

test('dashboardPath: helios- plus slug, Polish letters folded, free suffix, valid Lovelace url_path (SPEC 0.16)', () => {
  const lovelace = /^[a-z0-9]+(-[a-z0-9]+)+$/;
  assert.equal(S.dashboardPath('zegar gabinet'), 'helios-zegar-gabinet');
  assert.equal(S.dashboardPath('Łazienka Żółta'), 'helios-lazienka-zolta');
  assert.equal(S.dashboardPath('Helios 0f3c1b2a'), 'helios-0f3c1b2a');
  assert.equal(S.dashboardPath('Helios'), 'helios-zegar');
  assert.equal(S.dashboardPath(''), 'helios-karta');
  assert.equal(S.dashboardPath('zegar gabinet', ['helios-zegar-gabinet', 'helios-zegar-gabinet-2']), 'helios-zegar-gabinet-3');
  for (const n of ['zegar_sypialnia', '  x  ', 'Ä'.repeat(80), '---']) { const p = S.dashboardPath(n); assert.match(p, lovelace, n); assert.ok(p.length <= 64, n); }
});

test('energy: PV, required house load, optional battery - the clock\'s rules and words (SPEC 0.17)', () => {
  const energy = (extra = {}) => ({ pages: [{ id: 'main', items: [item('energia', 'energy', 4, 3, 1, 1, { entity: 'sensor.pv_power', load_entity: 'sensor.house_load', ...extra })] }] });
  assert.deepEqual(msgs(energy()), []);
  assert.deepEqual(msgs(energy({ battery_entity: 'sensor.battery_soc' })), []);
  const noLoad = energy(); delete noLoad.pages[0].items[0].load_entity;
  assert.deepEqual(msgs(noLoad), ['Required field load_entity']);
  assert.deepEqual(msgs(energy({ load_entity: 'switch.house' })), ['load_entity requires a sensor entity']);
  assert.deepEqual(msgs(energy({ battery_entity: 'battery.x' })), ['battery_entity requires a sensor entity']);
  assert.deepEqual(msgs(energy({ entity: 'light.pv' })), ['Item energia requires an entity in domain sensor']);
  assert.deepEqual(msgs(energy({ tap_action: { action: 'toggle' } })), ['Field not allowed for type energy: tap_action', 'Field not allowed for type energy: tap_action']);
  // the form round-trips all three sensors and labels the PV one
  const form = S.toForm(energy({ battery_entity: 'sensor.battery_soc' }).pages[0].items[0]);
  assert.deepEqual(S.fromForm('energy', form), energy({ battery_entity: 'sensor.battery_soc' }).pages[0].items[0]);
  const schema = S.schemaFor('energy', form, null);
  assert.equal(schema.find((f) => f.name === 'entity').label, 'Solar power (sensor)');
  assert.ok(schema.find((f) => f.name === 'load_entity').required && !schema.find((f) => f.name === 'battery_entity').required);
});

test('energy: field shapes as DashboardSpec.string() and the preview as the clock draws it (SPEC 0.17)', () => {
  const energy = (extra = {}) => ({ pages: [{ id: 'main', items: [item('energia', 'energy', 4, 3, 1, 1, { entity: 'sensor.pv', load_entity: 'sensor.load', ...extra })] }] });
  assert.deepEqual(msgs(energy({ battery_entity: null })), ['Invalid field battery_entity']);
  assert.deepEqual(msgs(energy({ load_entity: null })), ['Invalid field load_entity']);
  assert.deepEqual(msgs(energy({ load_entity: ['sensor.load'] })), ['Invalid field load_entity']);
  assert.deepEqual(msgs(energy({ load_entity: '   ' })), ['Invalid field load_entity']);
  assert.deepEqual(msgs(energy({ load_entity: 'sensor.' + 'x'.repeat(122) })), ['Invalid field load_entity']);
  const st = (state, unit) => ({ state, attributes: unit ? { unit_of_measurement: unit } : {} });
  const states = { 'sensor.pv': st('1504', 'W'), 'sensor.load': st('698.4', 'W'), 'sensor.bat': st('68', '%') };
  const withBattery = { entity: 'sensor.pv', load_entity: 'sensor.load', battery_entity: 'sensor.bat' };
  assert.deepEqual(S.energyPreview(withBattery, states), { title: '1504 / 698.4 W', value: '68 %' });
  assert.deepEqual(S.energyPreview({ entity: 'sensor.pv', load_entity: 'sensor.load' }, states), { title: 'PV', value: '1504 / 698.4 W' });
  assert.deepEqual(S.energyPreview(withBattery, { ...states, 'sensor.load': st('0.7', 'kW') }).title, '1504 W / 0.7 kW');
  assert.deepEqual(S.energyPreview(withBattery, { 'sensor.pv': st('1504', 'W'), 'sensor.bat': st('unavailable', '%') }), { title: '1504 W / —', value: '—' });
});

test('climate: a climate entity only, icon optional, preview as the clock draws the tile (SPEC 0.19)', () => {
  const doc = (extra = {}) => ({ pages: [{ id: 'main', items: [item('t', 'climate', 3, 1, 1, 1, { entity: 'climate.salon', ...extra })] }] });
  assert.deepEqual(msgs(doc()), []);
  assert.deepEqual(msgs(doc({ icon: 'mdi:radiator' })), []);
  assert.deepEqual(msgs(doc({ entity: 'sensor.x' })), ['Item t requires an entity in domain climate']);
  assert.deepEqual(msgs(doc({ tap_action: { action: 'toggle' } })), ['Field not allowed for type climate: tap_action', 'Field not allowed for type climate: tap_action']);
  const st = (state, attributes) => ({ 'climate.salon': { state, attributes } });
  const i = { entity: 'climate.salon' };
  assert.deepEqual(S.climatePreview(i, st('heat', { current_temperature: 23, temperature: 20.5, friendly_name: 'Salon' })), { title: 'Salon', value: '23.0°', detail: 'Target 20.5°' });
  assert.deepEqual(S.climatePreview(i, st('off', { current_temperature: 22, temperature: 24 })).detail, 'Off');
  assert.deepEqual(S.climatePreview(i, st('heat', { temperature: 21 })).value, '—');
  assert.deepEqual(S.climatePreview(i, st('unavailable', {})), { title: 'climate.salon', value: '—', detail: 'Disconnected' });
  const f = S.toForm(doc().pages[0].items[0]);
  assert.deepEqual(S.fromForm('climate', f), doc().pages[0].items[0]);
});

test('alerts: sources, sizes and the stand-in card - the clock\'s rules and words (SPEC 0.20)', () => {
  const src = (flag, extra = {}) => ({ title: flag, entity: `sensor.${flag}`, when: { entity: `binary_sensor.${flag}_pokaz`, state: 'on' }, ...extra });
  const alerts = (extra = {}, w = 2, h = 1) => ({ pages: [{ id: 'main', items: [item('uwagi', 'alerts', 1, 1, w, h, { sources: [src('garaz'), src('swiatla', { off_entity: 'light.grupa', icon: 'mdi:lightbulb' })], ...extra })] }] });
  assert.deepEqual(msgs(alerts()), []);
  assert.deepEqual(msgs(alerts({}, 1, 1)), []);
  assert.deepEqual(msgs(alerts({}, 1, 2)), []);
  assert.deepEqual(msgs(alerts({}, 2, 2)), ['The alerts tile must be 1x1, 1x2 or 2x1']);
  assert.deepEqual(msgs(alerts({ sources: [] })), ['alerts requires 1 to 12 sources entries']);
  assert.deepEqual(msgs(alerts({ sources: [src('a'), src('a')] })), ['sources: duplicate condition binary_sensor.a_pokaz = on']);
  assert.deepEqual(msgs(alerts({ sources: [src('a', { off_entity: 'switch.x' })] })), ['off_entity requires an entity in domain light']);
  assert.deepEqual(msgs(alerts({ sources: [src('a', { show_since: 'tak' })] })), ['show_since must be a boolean']);
  assert.deepEqual(msgs(alerts({ sources: [src('a', { kolor: 'red' })] })), ['Unknown field sources: kolor']);
  assert.deepEqual(msgs(alerts({ sources: [src('a', { when: { entity: 'binary_sensor.a', state: 'unavailable' } })] })), ['Missing data cannot indicate an alert']);
  const noWhen = src('a'); delete noWhen.when;
  assert.deepEqual(msgs(alerts({ sources: [noWhen] })), ['when must be an object']);
  assert.deepEqual(msgs(alerts({ empty: { type: 'energy', entity: 'sensor.pv', load_entity: 'sensor.dom' } })), []);
  assert.deepEqual(msgs(alerts({ empty: { type: 'music' } })), ['empty: allowed types energy, climate, weather, clock, tile']);
  assert.deepEqual(msgs(alerts({ empty: { type: 'clock', column: 3 } })), ['empty: field column is inherited from the alerts tile']);
  assert.deepEqual(msgs(alerts({ empty: { type: 'energy', entity: 'sensor.pv' } })), ['Required field load_entity'], 'the stand-in is checked as a card of its own');
  assert.deepEqual(msgs(alerts({ entity: 'sensor.x' })), ['Field not allowed for type alerts: entity', 'Field not allowed for type alerts: entity']);
  // the form edits sources flat and gives the wire shape back unchanged
  const wire = alerts({ empty: { type: 'clock' } }).pages[0].items[0];
  wire.sources[0].show_since = false;
  const back = S.fromForm('alerts', S.toForm(wire));
  assert.deepEqual(back, wire);
  // preview: the clock's three states
  const now = '2026-09-25T10:00:00+00:00', older = '2026-09-25T08:00:00+00:00';
  const i = alerts().pages[0].items[0];
  assert.equal(S.alertsPreview(i, {}).value, '- · No data');
  assert.equal(S.alertsPreview(i, { 'binary_sensor.garaz_pokaz': { state: 'off' }, 'binary_sensor.swiatla_pokaz': { state: 'off' } }).value, '0 · No alerts');
  assert.equal(S.alertsPreview(i, { 'binary_sensor.garaz_pokaz': { state: 'on', last_changed: older }, 'binary_sensor.swiatla_pokaz': { state: 'on', last_changed: now } }).value, '2 · swiatla +1');
});

test('alerts: source fields mirror the clock exactly (types, nulls, lengths, aliases, untrimmed state)', () => {
  const one = (s) => ({ pages: [{ id: 'main', items: [item('uwagi', 'alerts', 1, 1, 2, 1, { sources: [{ title: 'A', entity: 'sensor.a', when: { entity: 'binary_sensor.a', state: 'on' }, ...s }] })] }] });
  assert.deepEqual(msgs(one({ icon: 'lightbulb' })), [], 'a legacy name is an alias on the clock');
  assert.deepEqual(msgs(one({ off_entity: null })), ['Invalid field off_entity']);
  assert.deepEqual(msgs(one({ off_entity: ['light.a'] })), ['Invalid field off_entity']);
  assert.deepEqual(msgs(one({ show_since: null })), ['show_since must be a boolean']);
  assert.deepEqual(msgs(one({ when: { entity: 'binary_sensor.a', state: 'on', extra: 1 } })), ['Unknown field when: extra']);
  assert.deepEqual(msgs(one({ when: { entity: 'binary_sensor.a', state: 'x'.repeat(65) } })), ['Invalid field state']);
  const f = S.toForm(one({ when: { entity: 'binary_sensor.a', state: ' on ' } }).pages[0].items[0]);
  assert.equal(S.fromForm('alerts', f).sources[0].when.state, ' on ');
  const i = one({}).pages[0].items[0]; i.sources.push({ title: 'B', entity: 'sensor.b', when: { entity: 'binary_sensor.b', state: 'on' } });
  assert.equal(S.alertsPreview(i, { 'binary_sensor.a': { state: 'on' } }).value, '1 · A · No data: 1');
});

test('alerts: broken input stays visible to validation and never breaks the form', () => {
  const card = (extra) => item('uwagi', 'alerts', 1, 1, 2, 1, { sources: [{ title: 'A', entity: 'sensor.a', when: { entity: 'binary_sensor.a', state: 'on' } }], ...extra });
  assert.doesNotThrow(() => S.toForm(card({ sources: {} })));
  assert.doesNotThrow(() => S.toForm(card({ sources: [null] })));
  const f = S.toForm(card({})); f.empty_card = 'oops';
  const back = S.fromForm('alerts', f);
  assert.equal(back.empty, 'oops');
  assert.deepEqual(msgs({ pages: [{ id: 'main', items: [back] }] }), ['empty must be an object']);
  const typed = S.fromForm('alerts', { ...S.toForm(card({})), sources: [null] });
  assert.deepEqual(typed.sources, [null]);
  assert.deepEqual(msgs({ pages: [{ id: 'main', items: [typed] }] }), ['sources: each entry must be an object']);
});

test('an object field present as null is refused, as on the clock (also inside a stand-in card)', () => {
  const m = { pages: [{ id: 'main', items: [tile('t', 'light.a', 1, 1, { tap_action: null })] }] };
  assert.deepEqual(msgs(m), ['tap_action must be an object']);
  const a = { pages: [{ id: 'main', items: [item('uwagi', 'alerts', 1, 1, 2, 1, { sources: [{ title: 'A', entity: 'sensor.a', when: { entity: 'binary_sensor.a', state: 'on' } }], empty: { type: 'tile', entity: 'sensor.a', tap_action: null } })] }] };
  assert.deepEqual(msgs(a), ['tap_action must be an object']);
});

test('wrong types in object fields, a null title and unknown confirmation keys are refused like on the clock', () => {
  const one = (extra) => msgs({ pages: [{ id: 'main', items: [tile('t', 'light.a', 1, 1, extra)] }] });
  assert.deepEqual(one({ tap_action: false }), ['tap_action must be an object']);
  assert.deepEqual(one({ title: null }), ['Invalid field title']);
  assert.deepEqual(one({ confirmation: { enabled: true, unexpected: 1 } }), ['Unknown field confirmation: unexpected']);
});

test('alerts: a "done" button per source mirrors the clock (SPEC 0.20 pkt 4a)', () => {
  const one = (s) => msgs({ pages: [{ id: 'main', items: [item('uwagi', 'alerts', 1, 1, 2, 1, { sources: [{ title: 'Śmieci jutro', entity: 'sensor.s', when: { entity: 'binary_sensor.s', state: 'on' }, ...s }] })] }] });
  assert.deepEqual(one({ done_entity: 'script.helios_smieci_wyniesione', done_label: 'Wyniesione' }), []);
  assert.deepEqual(one({ done_entity: 'input_button.x' }), []);
  assert.deepEqual(one({ done_entity: 'light.a' }), ['done_entity requires a script, input_boolean, input_button or button entity']);
  assert.deepEqual(one({ done_label: 'Gotowe' }), ['done_label requires done_entity']);
  assert.deepEqual(one({ done_entity: 'script.a', done_label: 'Bardzo dluga nazwa' }), ['Invalid field done_label']);
  assert.deepEqual(one({ done_entity: 'script.a', off_entity: 'light.a' }), ['sources: off_entity and done_entity are mutually exclusive']);
  const wire = item('uwagi', 'alerts', 1, 1, 2, 1, { sources: [{ title: 'Śmieci jutro', entity: 'sensor.s', when: { entity: 'binary_sensor.s', state: 'on' }, done_entity: 'script.w', done_label: 'Wyniesione' }] });
  assert.deepEqual(S.fromForm('alerts', S.toForm(wire)), wire);
});

test('alerts: blink per source mirrors the clock (SPEC 0.20 pkt 4b)', () => {
  const one = (s) => msgs({ pages: [{ id: 'main', items: [item('uwagi', 'alerts', 1, 1, 2, 1, { sources: [{ title: 'Garaż', entity: 'sensor.g', when: { entity: 'binary_sensor.g', state: 'on' }, ...s }] })] }] });
  assert.deepEqual(one({ blink: true }), []);
  assert.deepEqual(one({ blink: 'tak' }), ['blink must be a boolean']);
  const wire = item('uwagi', 'alerts', 1, 1, 2, 1, { sources: [{ title: 'Garaż', entity: 'sensor.g', when: { entity: 'binary_sensor.g', state: 'on' }, blink: true }, { title: 'B', entity: 'sensor.b', when: { entity: 'binary_sensor.b', state: 'on' } }] });
  assert.deepEqual(S.fromForm('alerts', S.toForm(wire)), wire, 'blink kept when on, not added when off');
});
