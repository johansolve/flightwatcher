import * as L from './vendor/leaflet/leaflet-src.esm.js';

const POLL_MS = 10000;
const GLIDE_MS = 1000;
const STORAGE_PREFIX = 'flightwatcher.';
const MY_POSITION = 'HÄR';
const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'];
const COMPASS_WORDS = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst'];
// Top-down silhouettes, nose up; each is one path so overlapping parts share one outline
const GLYPHS = {
    jet: 'M12 2c.8 0 1.3.9 1.3 2v5.2l7.7 4.6v2l-7.7-2.3v4.6l2.2 1.7V21L12 20l-3.5 1v-1.2l2.2-1.7v-4.6L3 15.8v-2l7.7-4.6V4c0-1.1.5-2 1.3-2z',
    prop: 'M11 4Q12 1.6 13 4V20H11Z M1 9H23V11.6H1Z M7.5 18.6H16.5V20.4H7.5Z M5.6 7H7.6V13H5.6Z M16.4 7H18.4V13H16.4Z M3.8 6.3H9.4V7.2H3.8Z M14.6 6.3H20.2V7.2H14.6Z',
    ga: 'M11.2 4.5Q12 2.8 12.8 4.5L12.6 19H11.4Z M1.5 8H22.5V10.2H1.5Z M8.5 17.6H15.5V19.2H8.5Z M9 3.2H15V4H9Z',
    heli: 'M12 5.5C14.2 5.5 15 7.5 15 10C15 12.8 13.8 14.5 12 14.5C10.2 14.5 9 12.8 9 10C9 7.5 9.8 5.5 12 5.5Z M11.4 14H12.6V21.5H11.4Z M10 20.6H14V21.6H10Z M3 2.2L3.7 1.5L21 18.8L20.3 19.5Z M20.3 1.5L21 2.2L3.7 19.5L3 18.8Z',
};
// Shown while no photo is available; Pinhead Map Icons (CC0), viewBox 0 0 15 15
const PROPELLER_ICON = 'M6.82.68H4.77c-.68 0-.68-.68 0-.68h5.45c.68 0 .68.68 0 .68H8.18S9 1.27 9 2.63V4h6v2L9 8l-.5 5l2.5 1.32V15H4v-.68L6.5 13L6 8L0 6V4h6V2.64c0-1.37.82-1.96.82-1.96';
const FALLBACK_ICONS = {
    jet: 'M4.47 2.82c.15-.01.29.04.4.13l4.82 4.42l3.89-.13c.74-.03 1.37.54 1.41 1.28c.07.8-.56 1.48-1.37 1.48H3.31c-.81-.01-1.53-.48-1.87-1.21L.02 5.63c-.06-.13.03-.28.16-.29l.58-.07c.18-.01.35.06.46.2L2.9 7.59l3.37-.11L3.71 3.2c-.06-.14.01-.29.17-.32z',
    prop: PROPELLER_ICON,
    ga: PROPELLER_ICON,
    heli: 'M4 2C3 2 3 3 4 3h4v1c-.28 0-.5.22-.5.5V5H3.93A2 2 0 0 0 2 3.5c-1.1 0-2 .9-2 2s.9 2 2 2c.37 0 .74-.11 1.05-.3l2.45 3.3C6.51 11.95 8.32 12 9 12h5s1 0 1-1v-.99c0-.74-.13-1.14-.5-1.51l-3-3s-.59-.5-1.27-.5H9.5v-.5c0-.28-.22-.5-.5-.5V3h4c1 0 1-1 0-1zM2 4.5c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1M10 6c.5 0 .79.32 1 .5L13.5 9H10S9 9 9 8V7s0-1 1-1',
};

const TILE_ATTRIBUTION = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const STAMEN_ATTRIBUTION = `${TILE_ATTRIBUTION} &copy; <a href="https://stamen.com/">Stamen Design</a>`;

const els = {
    status: document.getElementById('status'),
    location: document.getElementById('location'),
    placeCode: document.getElementById('place-code'),
    placeName: document.getElementById('place-name'),
    radius: document.getElementById('radius'),
    radiusValue: document.getElementById('radius-value'),
    strips: document.getElementById('strips'),
    empty: document.getElementById('empty'),
    template: document.getElementById('strip-template'),
    theme: document.getElementById('theme'),
    placesList: document.getElementById('places-list'),
    placesAdd: document.getElementById('places-add'),
    placesCode: document.getElementById('places-code'),
    placesMsg: document.getElementById('places-msg'),
};

const state = {
    config: null,
    locations: [],
    pollGeneration: 0,
    lat: null,
    lon: null,
    radius: 5,
    placeShort: '',
    timer: null,
    selected: null,
};

// hex -> { flight, strip, marker, receivedAt }
const tracked = new Map();
const photos = new Map();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const numberFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const decimalFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });
const timeFmt = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });

// Initial view is replaced by frameMap(); circles need a view before they can be added
const map = L.map('map', { center: [56.3, 12.85], zoom: 10, zoomControl: false, scrollWheelZoom: false });
map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
const BASEMAPS = {
    atc: L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
        maxZoom: 16,
        attribution: TILE_ATTRIBUTION,
    }),
    plansch: L.layerGroup([
        L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg', {
            maxZoom: 16,
            attribution: STAMEN_ATTRIBUTION,
        }),
        L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 16,
            opacity: 0.55,
        }),
    ]),
};
const innerRing = L.circle([0, 0], { radius: 1, className: 'range-ring range-ring-inner', interactive: false }).addTo(map);
const ring = L.circle([0, 0], { radius: 1, className: 'range-ring', interactive: false }).addTo(map);
const centre = L.circleMarker([0, 0], { radius: 5, className: 'centre-mark', interactive: false }).addTo(map);

function load(key) {
    try {
        return localStorage.getItem(STORAGE_PREFIX + key);
    } catch {
        return null;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(STORAGE_PREFIX + key, String(value));
    } catch {
        // Storage unavailable, setting just won't persist
    }
}

function applyTheme(name) {
    const theme = [...els.theme.options].some((o) => o.value === name) ? name : 'atc';
    document.documentElement.dataset.theme = theme;
    els.theme.value = theme;
    for (const [name, layer] of Object.entries(BASEMAPS)) {
        if (name === theme) {
            map.addLayer(layer);
        } else {
            map.removeLayer(layer);
        }
    }
}

applyTheme(load('theme'));

function rad(deg) {
    return deg * Math.PI / 180;
}

/** Point reached from lat/lon after km along bearing (great circle). */
function project(lat, lon, bearing, km) {
    const d = km / 6371;
    const b = rad(bearing);
    const p1 = rad(lat);
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = rad(lon) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 * 180 / Math.PI, l2 * 180 / Math.PI];
}

function phase(f) {
    if (f.onGround) {
        return 'ground';
    }
    if (f.verticalRateFpm > 300) {
        return 'climb';
    }
    if (f.verticalRateFpm < -300) {
        return 'descend';
    }
    return 'cruise';
}

function airportCode(airport) {
    return airport ? airport.iata || airport.icao || airport.name : '?';
}

function airportPlace(airport) {
    return airport ? airport.city || airport.name : '';
}

function routeText(f) {
    if (!f.origin && !f.destination) {
        return '';
    }
    const from = `${airportCode(f.origin)} ${airportPlace(f.origin)}`.trim();
    const to = `${airportCode(f.destination)} ${airportPlace(f.destination)}`.trim();
    return `${from} – ${to}`;
}

function typeName(f) {
    return f.info ? `${f.info.manufacturer} ${f.info.type}` : f.typeDescription;
}

function formatTime(iso) {
    return iso ? timeFmt.format(new Date(iso)) : null;
}

/** Scheduled time, struck through when the actual or estimated time differs. */
function setTimes(dd, block) {
    dd.replaceChildren();
    const scheduled = block && formatTime(block.scheduled);
    const effectiveIso = block && (block.actual || block.estimated);
    const effective = formatTime(effectiveIso);
    if (!scheduled && !effective) {
        dd.textContent = '–';
        return false;
    }
    if (scheduled && effective && effective !== scheduled) {
        const s = document.createElement('s');
        s.textContent = scheduled;
        dd.append(s, ` ${effective}`);
    } else {
        dd.textContent = scheduled || effective;
    }
    dd.title = block.actual ? 'Faktisk tid' : 'Beräknad tid';
    return Boolean(block.scheduled && effectiveIso && Date.parse(effectiveIso) - Date.parse(block.scheduled) > 15 * 60000);
}

function minutesLate(block) {
    const effective = block && (block.actual || block.estimated);
    if (!block || !block.scheduled || !effective) {
        return 0;
    }
    return Math.round((Date.parse(effective) - Date.parse(block.scheduled)) / 60000);
}

/** Facts as a running Swedish sentence, used by the wall-chart theme. */
function buildProse(f) {
    const where = `${decimalFmt.format(f.distanceKm)} km ${COMPASS_WORDS[Math.round(f.bearing / 45) % 8]} om ${state.placeShort}`;
    const sentences = [];
    if (f.onGround) {
        const kmh = (f.groundSpeedKt || 0) * 1.852;
        sentences.push(kmh > 10 ? `Rullar på marken i ${numberFmt.format(kmh)} km/h (${numberFmt.format(f.groundSpeedKt)} knop), ${where}.` : `Står på marken ${where}.`);
    } else {
        let flight = 'Flyger';
        if (f.altitudeFt !== null) {
            const meters = Math.round(f.altitudeFt * 0.3048 / 10) * 10;
            flight += ` på ${numberFmt.format(meters)} meters höjd (${numberFmt.format(f.altitudeFt)} fot)`;
        }
        const trend = { climb: ' och stiger', descend: ' och sjunker' }[phase(f)] || '';
        const speed = f.groundSpeedKt === null ? '' : ` i ${numberFmt.format(f.groundSpeedKt * 1.852)} km/h (${numberFmt.format(f.groundSpeedKt)} knop)`;
        sentences.push(`${flight}${trend}${speed}, ${where}.`);
    }

    const t = state.config.timesAvailable && f.times;
    if (t) {
        const parts = [];
        const dep = t.departure;
        const depTime = formatTime(dep.actual || dep.estimated || dep.scheduled);
        if (depTime) {
            const late = minutesLate(dep);
            const verb = dep.actual ? 'Avgick' : 'Beräknas avgå';
            const from = f.origin ? ` från ${airportPlace(f.origin)}` : '';
            parts.push(`${verb} ${depTime}${from}${late >= 5 ? `, ${late} minuter sent` : ''}`);
        }
        const arr = t.arrival;
        const arrTime = formatTime(arr.actual || arr.estimated || arr.scheduled);
        if (arrTime) {
            const late = minutesLate(arr);
            const verb = arr.actual ? 'landade' : 'väntas landa';
            const planned = Math.abs(late) >= 5 ? ` (tidtabellen säger ${formatTime(arr.scheduled)})` : '';
            const to = f.destination ? ` i ${airportPlace(f.destination)}` : '';
            parts.push(`${parts.length ? verb : verb[0].toUpperCase() + verb.slice(1)} ${arrTime}${to}${planned}`);
        }
        if (parts.length) {
            sentences.push(`${parts.join(' och ')}.`);
        }
    }
    return sentences.join(' ');
}

function seededRandom(text) {
    let seed = 0;
    for (const ch of text) {
        seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    }
    return () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let r = Math.imul(seed ^ (seed >>> 15), seed | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

/** Feathered superellipse with a slightly wobbly rim, unique per aircraft. */
function blobMask(hex) {
    const random = seededRandom(hex);
    const waves = [2, 3, 5].map((k) => ({ k, amp: 0.012 + random() * 0.022, phase: random() * Math.PI * 2 }));
    const n = 3.6;
    const points = [];
    for (let i = 0; i < 96; i++) {
        const a = i / 96 * Math.PI * 2;
        const wobble = 1 + waves.reduce((sum, w) => sum + w.amp * Math.sin(w.k * a + w.phase), 0);
        const c = Math.cos(a);
        const s = Math.sin(a);
        const x = 150 + 140 * wobble * Math.sign(c) * Math.abs(c) ** (2 / n);
        const y = 100 + 82 * wobble * Math.sign(s) * Math.abs(s) ** (2 / n);
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" preserveAspectRatio="none">` +
        `<filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3 7"/></filter>` +
        `<polygon points="${points.join(' ')}" fill="#000" filter="url(#f)"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function loadPhoto(hex) {
    if (!photos.has(hex)) {
        const promise = fetch(`https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(hex)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                const photo = data && data.photos && data.photos[0];
                return photo && photo.thumbnail_large && /^https:/.test(photo.link) ? photo : null;
            })
            .catch(() => null);
        photos.set(hex, promise);
    }
    return photos.get(hex);
}

function attachPhoto(strip, hex) {
    if (hex.startsWith('~')) {
        return;
    }
    loadPhoto(hex).then((photo) => {
        if (!photo) {
            return;
        }
        const img = strip.querySelector('.stamp img');
        img.src = photo.thumbnail_large.src;
        img.hidden = false;
        strip.querySelector('.stamp-link').href = photo.link;
        strip.querySelector('.stamp-credit-text').textContent = `Foto ${photo.photographer}, Planespotters.net`;
        strip.classList.add('has-photo');
    });
}

function setField(root, name, text) {
    root.querySelector(`[data-field="${name}"]`).textContent = text;
}

function select(hex, scroll) {
    state.selected = state.selected === hex ? null : hex;
    for (const [key, item] of tracked) {
        const on = key === state.selected;
        item.strip.classList.toggle('selected', on);
        item.marker.getElement()?.classList.toggle('selected', on);
    }
    const item = tracked.get(state.selected);
    if (item && scroll) {
        item.strip.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
}

function createStrip(hex) {
    const strip = els.template.content.firstElementChild.cloneNode(true);
    strip.addEventListener('click', (event) => {
        if (!event.target.closest('a')) {
            select(hex, false);
        }
    });
    strip.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select(hex, false);
        }
    });
    strip.querySelector('.stamp-paper').style.setProperty('--blob', blobMask(hex));
    attachPhoto(strip, hex);
    return strip;
}

function createMarker(hex) {
    const el = document.createElement('div');
    el.className = 'plane';
    el.innerHTML = `<svg class="plane-glyph" viewBox="0 0 24 24" aria-hidden="true"><path/></svg><span class="plane-label"></span><span class="plane-no"></span>`;
    const marker = L.marker([0, 0], { icon: L.divIcon({ html: el, className: 'plane-icon', iconSize: [0, 0] }), keyboard: false });
    marker.on('click', () => select(hex, true));
    return marker.addTo(map);
}

function updateStrip(strip, f) {
    strip.dataset.phase = phase(f);
    setField(strip, 'callsign', f.callsign || f.registration || f.hex);
    setField(strip, 'typeCode', f.typeCode || '');
    setField(strip, 'registration', f.callsign && f.registration ? f.registration : '');
    setField(strip, 'route', routeText(f));
    if (strip.dataset.kind !== f.kind) {
        strip.dataset.kind = f.kind;
        strip.querySelector('.sketch path').setAttribute('d', FALLBACK_ICONS[f.kind] || FALLBACK_ICONS.jet);
    }
    const airline = f.airline || (f.info && f.info.owner) || '';
    const type = typeName(f) || '';
    setField(strip, 'airline', airline);
    setField(strip, 'typeSuffix', airline && type ? `, ${type}` : type);
    setField(strip, 'typeName', [type, airline].filter(Boolean).join(', '));
    strip.querySelector('.operator').hidden = !airline && !type;

    if (f.onGround) {
        setField(strip, 'altitude', 'Marken');
        setField(strip, 'altitudeFt', '');
    } else if (f.altitudeFt === null) {
        setField(strip, 'altitude', '–');
        setField(strip, 'altitudeFt', '');
    } else {
        setField(strip, 'altitude', `${numberFmt.format(Math.round(f.altitudeFt * 0.3048 / 10) * 10)} m`);
        setField(strip, 'altitudeFt', `${numberFmt.format(f.altitudeFt)} ft`);
    }
    setField(strip, 'speed', f.groundSpeedKt === null ? '–' : `${numberFmt.format(f.groundSpeedKt * 1.852)} km/h`);
    setField(strip, 'speedKt', f.groundSpeedKt === null ? '' : `${numberFmt.format(f.groundSpeedKt)} kt`);
    setField(strip, 'distance', `${decimalFmt.format(f.distanceKm)} km ${COMPASS[Math.round(f.bearing / 45) % 8]}`);
    setField(strip, 'prose', buildProse(f));

    const showTimes = state.config.timesAvailable && f.times;
    for (const row of ['departure', 'arrival']) {
        const box = strip.querySelector(`[data-row="${row}"]`);
        box.hidden = !showTimes;
        if (showTimes) {
            box.classList.toggle('delayed', setTimes(box.querySelector('dd'), f.times[row]));
        }
    }
}

function updateMarker(marker, f, figure) {
    const el = marker.getElement();
    el.querySelector('.plane-no').textContent = figure;
    const plane = el.querySelector('.plane');
    plane.dataset.phase = phase(f);
    if (plane.dataset.kind !== f.kind) {
        plane.dataset.kind = f.kind;
        plane.querySelector('path').setAttribute('d', GLYPHS[f.kind] || GLYPHS.jet);
    }
    el.querySelector('.plane-glyph').style.setProperty('--track', `${f.track || 0}deg`);
    // Ground traffic clusters at the airport; labels there are unreadable
    el.querySelector('.plane-label').textContent = f.onGround ? '' : f.callsign || f.registration || '';
}

function layoutSnapshot() {
    const rects = new Map();
    for (const el of els.strips.children) {
        if (!el.classList.contains('leaving')) {
            rects.set(el, el.getBoundingClientRect());
        }
    }
    return { rects, host: els.strips.getBoundingClientRect() };
}

/** FLIP: slide moved strips from their old position, fade new ones in and leaving ones out in place. */
function animateLayout(before, added, leaving) {
    if (reducedMotion) {
        leaving.forEach((el) => el.remove());
        return;
    }
    for (const el of leaving) {
        const r = before.rects.get(el);
        if (!r) {
            el.remove();
            continue;
        }
        el.classList.add('leaving');
        Object.assign(el.style, {
            position: 'absolute',
            left: `${r.left - before.host.left}px`,
            top: `${r.top - before.host.top}px`,
            width: `${r.width}px`,
            margin: '0',
            pointerEvents: 'none',
        });
        el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 450, easing: 'ease-in' })
            .onfinish = () => el.remove();
    }
    for (const [el, r] of before.rects) {
        if (!el.isConnected || el.classList.contains('leaving')) {
            continue;
        }
        const after = el.getBoundingClientRect();
        const dx = r.left - after.left;
        const dy = r.top - after.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
                duration: 600,
                easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
                composite: 'add',
            });
        }
    }
    for (const el of added) {
        el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], {
            duration: 550,
            delay: 200,
            easing: 'ease-out',
            fill: 'backwards',
        });
    }
}

function render(flights) {
    const now = performance.now();
    const before = layoutSnapshot();
    const seen = new Set();
    const added = [];
    for (const [index, f] of flights.entries()) {
        seen.add(f.hex);
        let item = tracked.get(f.hex);
        if (!item) {
            item = { strip: createStrip(f.hex), marker: createMarker(f.hex) };
            tracked.set(f.hex, item);
            added.push(item.strip);
        }
        item.flight = f;
        item.receivedAt = now;
        item.marker.setLatLng([f.lat, f.lon]);
        updateStrip(item.strip, f);
        setField(item.strip, 'figure', `Fig. ${index + 1}`);
        updateMarker(item.marker, f, index + 1);
        item.strip.classList.toggle('selected', f.hex === state.selected);
        els.strips.appendChild(item.strip);
    }
    const leaving = [];
    for (const [hex, item] of tracked) {
        if (!seen.has(hex)) {
            item.marker.remove();
            tracked.delete(hex);
            leaving.push(item.strip);
        }
    }
    animateLayout(before, added, leaving);
    els.empty.hidden = flights.length > 0;
    els.empty.textContent = `Inget i luften inom ${state.radius} km just nu. Dra ut radien eller vänta på nästa plan.`;
}

/** Dead-reckon each aircraft between polls so the map keeps moving. */
function glide() {
    const now = performance.now();
    for (const item of tracked.values()) {
        const f = item.flight;
        if (f.onGround || !f.groundSpeedKt || f.track === null) {
            continue;
        }
        const seconds = Math.min((now - item.receivedAt) / 1000, 30);
        item.marker.setLatLng(project(f.lat, f.lon, f.track, f.groundSpeedKt * 1.852 * seconds / 3600));
    }
}

function setStatus(text) {
    els.status.textContent = text;
}

async function poll() {
    clearTimeout(state.timer);
    if (state.lat === null) {
        return;
    }
    // A slow answer for a previous location or radius must not overwrite a newer one
    const generation = ++state.pollGeneration;
    try {
        const params = new URLSearchParams({ lat: state.lat.toFixed(4), lon: state.lon.toFixed(4), radius: state.radius });
        const res = await fetch(`/api/nearby?${params}`);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (generation !== state.pollGeneration) {
            return;
        }
        render(data.flights);
        setStatus(`${data.flights.length} plan inom ${state.radius} km, uppdaterat ${timeFmt.format(new Date(data.updated))}`);
    } catch (error) {
        setStatus(`Flygdatan svarar inte (${error.message}). Nytt försök om tio sekunder.`);
    }
    if (!document.hidden) {
        state.timer = setTimeout(poll, POLL_MS);
    }
}

function frameMap() {
    const centreLatLng = [state.lat, state.lon];
    ring.setLatLng(centreLatLng).setRadius(state.radius * 1000);
    innerRing.setLatLng(centreLatLng).setRadius(state.radius * 500);
    centre.setLatLng(centreLatLng);
    map.fitBounds(ring.getBounds(), { padding: [10, 10], animate: false });
}

function moveTo(lat, lon) {
    state.lat = lat;
    state.lon = lon;
    frameMap();
    for (const item of tracked.values()) {
        item.strip.remove();
        item.marker.remove();
    }
    tracked.clear();
    poll();
}

function chooseLocation(code) {
    const locations = state.locations;
    const loc = locations.find((l) => l.code === code) || locations.find((l) => l.code === state.config.defaultLocation) || locations[0];
    if (code === MY_POSITION) {
        els.placeCode.textContent = MY_POSITION;
        els.placeName.textContent = 'Min plats';
        state.placeShort = 'dig';
        setStatus('Hämtar din plats …');
        navigator.geolocation.getCurrentPosition(
            (pos) => moveTo(pos.coords.latitude, pos.coords.longitude),
            () => {
                setStatus('Platsen gick inte att hämta. Välj en flygplats i stället.');
                els.location.value = loc.code;
                chooseLocation(loc.code);
            },
            { timeout: 10000, maximumAge: 60000 },
        );
        return;
    }
    els.location.value = loc.code;
    els.placeCode.textContent = loc.code;
    els.placeName.textContent = loc.name;
    state.placeShort = loc.short;
    moveTo(loc.lat, loc.lon);
}

async function fetchAirports(codes) {
    const res = await fetch(`/api/airports?codes=${encodeURIComponent(codes.join(','))}`);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

/** The viewer's own airport list, or the server default on first visit. */
async function loadLocations(defaults) {
    try {
        const codes = JSON.parse(load('locations') || 'null');
        if (Array.isArray(codes) && codes.length) {
            const { airports } = await fetchAirports(codes);
            if (airports.length) {
                return airports;
            }
        }
    } catch {
        // Fall back to defaults on corrupt storage or lookup failure
    }
    return defaults;
}

function saveLocations() {
    save('locations', JSON.stringify(state.locations.map((l) => l.code)));
}

function renderLocations() {
    const current = els.location.value;
    const options = state.locations.map((l) => new Option(`${l.code} ${l.name}`, l.code));
    if (navigator.geolocation) {
        options.push(new Option('Min plats', MY_POSITION));
    }
    els.location.replaceChildren(...options);
    if (current) {
        els.location.value = current;
    }

    els.placesList.replaceChildren(...state.locations.map((l) => {
        const li = document.createElement('li');
        const code = document.createElement('span');
        code.className = 'places-code';
        code.textContent = l.code;
        const name = document.createElement('span');
        name.className = 'places-name';
        name.textContent = l.name;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Ta bort ${l.code}`);
        remove.addEventListener('click', () => removeLocation(l.code));
        li.append(code, name, remove);
        return li;
    }));
}

function setPlacesMessage(text) {
    els.placesMsg.textContent = text;
}

async function addLocation(raw) {
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(code)) {
        setPlacesMessage('Skriv en IATA-kod (3 tecken) eller ICAO-kod (4 tecken).');
        return;
    }
    try {
        const { airports } = await fetchAirports([code]);
        const airport = airports[0];
        if (!airport) {
            setPlacesMessage(`Ingen flygplats har koden ${code}.`);
            return;
        }
        if (state.locations.some((l) => l.code === airport.code)) {
            setPlacesMessage(`${airport.code} finns redan i listan.`);
            return;
        }
        state.locations.push(airport);
        saveLocations();
        renderLocations();
        els.placesCode.value = '';
        setPlacesMessage(`Lade till ${airport.code} ${airport.name}.`);
        save('location', airport.code);
        chooseLocation(airport.code);
    } catch (error) {
        setPlacesMessage(`Uppslagningen misslyckades (${error.message}).`);
    }
}

function removeLocation(code) {
    if (state.locations.length === 1) {
        setPlacesMessage('Minst en flygplats behövs.');
        return;
    }
    state.locations = state.locations.filter((l) => l.code !== code);
    saveLocations();
    renderLocations();
    setPlacesMessage(`Tog bort ${code}.`);
    if (els.placeCode.textContent === code) {
        chooseLocation(state.locations[0].code);
    }
}

async function init() {
    const config = await fetch('/api/config').then((res) => res.json());
    state.config = config;
    state.radius = Math.min(Number(load('radius')) || config.defaultRadiusKm, config.maxRadiusKm);
    els.radius.max = config.maxRadiusKm;
    els.radius.value = state.radius;
    els.radiusValue.textContent = state.radius;

    state.locations = await loadLocations(config.defaultLocations);
    renderLocations();
    els.placesAdd.addEventListener('submit', (event) => {
        event.preventDefault();
        addLocation(els.placesCode.value);
    });

    els.theme.addEventListener('change', () => {
        applyTheme(els.theme.value);
        save('theme', els.theme.value);
    });
    els.location.addEventListener('change', () => {
        save('location', els.location.value);
        chooseLocation(els.location.value);
    });
    els.radius.addEventListener('input', () => {
        els.radiusValue.textContent = els.radius.value;
    });
    els.radius.addEventListener('change', () => {
        state.radius = Number(els.radius.value);
        save('radius', state.radius);
        frameMap();
        poll();
    });
    // Polling pauses in background tabs to spare the upstream APIs
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            poll();
        }
    });
    if (!reducedMotion) {
        setInterval(glide, GLIDE_MS);
    }

    chooseLocation(load('location') || config.defaultLocation);
}

init().catch((error) => setStatus(`Sidan kunde inte starta: ${error.message}`));
