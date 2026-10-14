# Helios - Home Assistant integration for the Lenovo Smart Clock 2

## English interface fork

Editor 0.17.2 adds Spotify and Assistant card types for English Helios 0.19.2 or
later. Spotify is a fixed native-app shortcut, and Assistant invokes the clock's
existing voice pipeline. The editor can add, move and label both cards without
adding scripts or changing the voice pipeline.

This fork translates the dashboard editor, generated labels and validation
messages into English. It preserves the integration domain, configuration schema
and device protocol, and works with the English clock build at
[markgraham924/helios](https://github.com/markgraham924/helios/tree/english-ui).
The existing Polish Home Assistant locale remains available in `translations/pl.json`.

Home Assistant side of [Helios](https://github.com/SychPL/helios), an Android
app that turns a Lenovo Smart Clock 2 into a Home Assistant dashboard and voice
satellite. The clock connects to Home Assistant over its own WebSocket
connection; this integration registers the device and its entities, pairs the
clock with a six-digit code and hands it everything it needs to run.

No pip dependencies, push only (`iot_class: local_push`).

## What you get

| Entity | Source on the clock |
| --- | --- |
| `sensor` App version (diagnostic) | the Helios APK version |
| `sensor` Voice state | idle / listening / processing / responding / error |
| `sensor` Dock version (diagnostic) | firmware of the charging dock |
| `binary_sensor` Dock connected | the OEM dock listener |
| `binary_sensor` Phone charging | Qi charging listener; unavailable without a dock |
| `light` Dock lamp | on/off read from the OEM service, brightness 1-10 |
| `number` Device volume | `STREAM_MUSIC` 0-100 %, polled every 3 s |
| `media_player` Clock speaker | the same device volume as a player (`volume_set` / `volume_step` only), so Assist understands "louder" in the clock's area; music itself is a separate Music Assistant player |

The device carries the clock's stable installation id, so the area you assign in
Home Assistant becomes the room context of every voice command (the `device_id`
passed to `assist_pipeline/run`).

## Install

1. HACS -> Integrations -> three-dot menu -> **Custom repositories** -> add this
   repository's URL, category *Integration*.
2. Install **Helios** and restart Home Assistant.
3. On the clock (Helios 0.9.0 or newer): hold HELIOS -> **Paruj z HA** (Pair
   with HA) -> pick your Home Assistant from the mDNS list or type its address.
4. Settings -> Devices and services -> **Add integration** -> Helios. Home
   Assistant shows a six-digit code valid for five minutes. Leave that dialog
   open - it is what finishes the pairing.
5. On the clock tap **Dalej** (Next) and type the code. The clock receives its
   own Home Assistant token, and if the Music Assistant integration is present,
   music access too.
6. Assign the device to an area.

Pairing the same clock again refreshes the existing entry: a new user and token,
and the old ones are removed only once the new pairing succeeded.

## Security model

This integration creates a Home Assistant user and mints a token from an
endpoint that is **not authenticated**, so it is worth stating exactly what that
means before you install it.

- **What is created.** On a successful pairing the integration creates one Home
  Assistant user per clock: system-generated, **not an administrator**,
  `local_only` (it cannot be used from outside your LAN), in the plain users
  group. Its token is a system token with a ten-year expiry. That token is the
  only credential the clock ever holds; you never paste a long-lived admin token
  into the device.
- **Who may pair.** `POST /api/helios/pair` is unauthenticated because a clock
  that has never been paired has no credential to authenticate with. It only
  accepts a six-digit code that **you** generated in the Home Assistant UI
  moments earlier and that is valid for five minutes. Five wrong codes from one
  address block that address for five minutes. Error responses are uniform and
  reveal nothing; neither the code nor the token is ever logged.
- **What the clock can do with it.** The device channel accepts connections from
  that user only, and the command allowlist is closed: `lamp.turn_on`,
  `lamp.turn_off`, `lamp.set_brightness`, `audio.set_device_volume`. Home
  Assistant waits up to 10 s for a confirmation and never retries.
- **Removal cleans up.** Deleting the config entry deletes the clock's user, its
  Music Assistant token and its stored background image. The clock notices,
  stops reconnecting and asks to be paired again.
- **Music Assistant credentials.** The integration reads the address and token
  of the core `music_assistant` config entry in order to mint a separate token
  for the clock (it shows up in Music Assistant's own token list). This is a
  deliberate cross-integration read of another entry's data; if you would rather
  it did not, leave Music Assistant out and the clock simply runs without music.
  When Music Assistant runs as an add-on it refuses to mint a usable token at
  all, and you paste one yourself in the options - see below.

## Protocol

The WebSocket channel (`helios/connect`, `helios/state`, `helios/result`), the
pairing exchange (`GET`/`POST /api/helios/pair`) and the `connection` event are
described in **[docs/PROTOCOL.md](docs/PROTOCOL.md)**.

## Behaviour

- Entities stay unavailable until the clock sends its first snapshot;
  a dropped socket marks them `unavailable` with no extra heartbeats.
- Commands are confirmed or they fail: a second command for the same resource
  while the first is in flight gets `busy`.
- Music Assistant as an add-on authenticates Home Assistant as a system user,
  and Music Assistant refuses such tokens on its LAN web server. Paste a token
  once in Settings -> Devices and services -> Helios -> Configure -> *Music
  Assistant token for the clock*. It is stored as given, never verified, never
  revoked, and changing it refreshes music on the clock's next connect.
  A clock paired later takes the token already pasted for another clock, so it
  plays music from the start. A clock left without music while Music Assistant
  runs shows up in Settings -> Repairs.

## Clock appearance

Settings -> Devices and services -> Helios -> the clock -> **Configure**: theme
(warm graphite / night blue), background (theme colour, keep the current photo,
or upload a new JPEG/PNG up to 10 MB), dimming 35-80 % and a focus point, plus
the Sendspin, diagnostics and Music Assistant overrides.

An uploaded photo is normalised in Home Assistant (EXIF orientation applied,
metadata stripped, transparency flattened, bounded to 1600x960, JPEG under
2 MB) and stored privately in `config/helios/<entry_id>/`. The clock fetches it
with an authenticated `GET /api/helios/appearance/<entry_id>/<image_id>`, which
serves only the current image and only to that clock's user or an administrator.

## Dashboard editor

The sidebar entry **Helios** (administrators only) is a visual editor for the
clock's layout: a 4x3 canvas, pages, one form per card. Click an empty cell to
add a card, click a card to edit or delete it. Entity and icon pickers are Home
Assistant's own (`ha-form`); if they fail to load the panel falls back to plain
inputs with a datalist of your entities. The editor validates with the clock's
own rules and wording, so a layout it accepts is a layout the clock accepts.

The editor has one tab per paired clock, named after its Home Assistant device,
and each tab edits the dashboard that clock shows. Every clock starts on the
shared `helios-clock`; **Own dashboard** on a tab copies the current document
into a new hidden dashboard (`helios-<clock name>`) and switches that clock to
it on the spot, without a restart. The path is stored with the clock's config
entry and sent to the app in the `connection` event.

The card list includes **Energy (PV, house, battery)** (`energy`, Helios 0.14 or newer on the clock): PV
production and house load on top, the battery charge large under it; without a battery sensor the
production / load pair is the value.

**Thermostat** (`climate`, Helios 0.16 or newer): the measured temperature large, the setpoint under it; on the
clock a tap opens the full control panel (setpoint, mode, preset, fan, swing).

**Readings (1–3 entities)** (`entities`): one to three ordered rows, each with an entity and an optional short
label. Select the entities in the card's list editor; any HA entity domain is accepted. Numeric states use at most
one decimal place and their HA units; a missing, unknown or unavailable value shows `—` without hiding the other
rows. The card displays values only. Its title defaults to `Odczyty`, and its header icon to
`mdi:format-list-bulleted`. Update the clock to Helios 0.19 or newer before saving this card; older clocks reject the
document and retain their previous layout. The dashboard schema stays at version 6. Drag list entries by their
handles to change the display order.

**Alerts** (`alerts`, Helios 0.17 or newer): every warning in one 1x1, 1x2 or 2x1 tile - the count and the newest
few; on the clock a tap slides in the full list with "active since" times and an optional "turn off lights" button.
Each source is a text entity plus a condition (`when`); an optional stand-in card (`empty`: energy, climate, weather,
clock or tile) takes the tile's place while everything is known and nothing applies.

It edits the `helios` section of a storage-mode dashboard through the frontend's
`lovelace/config` and `lovelace/config/save` commands; everything else in that
dashboard is left untouched. Before saving it re-reads the dashboard and
refuses to overwrite a version changed elsewhere in the meantime. A document in
schema 2-5 loads as one page and is upgraded to schema 6 on the first save -
that needs Helios 0.12 on the clock; an older clock rejects the new document
and keeps its previous layout. The JavaScript is public (no secrets in it); the
only mutation path is `lovelace/config/save`, which Home Assistant gates to
administrators.

## Development

```bash
pip install -r requirements_test.txt
python -m pytest tests
node --test tests/panel/schema.test.mjs   # the editor's model and validator, no npm needed
```

Python 3.14; `pytest-homeassistant-custom-component` pulls in Home Assistant
2026.8.3. The suite covers the pure helpers plus component tests of pairing,
identity, the device channel and the editor panel registration; `node --test`
covers the editor's validator. GitHub Actions runs hassfest, HACS validation,
those tests, the node tests and an import check on every push.

Strings live in `strings.json` (English) and `translations/pl.json` (Polish).
Logs and exception texts are English; entity names come from translation keys,
so they follow the language of each Home Assistant user.

The Polish README is kept as [README.pl.md](README.pl.md).

The English editor also supports a compact **Predbat activity** card. Pair editor 0.17.3 with clock 0.19.3 or newer. The card renders current status detail, including the active target percentage, rather than a next-slot charge/export limit.
