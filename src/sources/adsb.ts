import { readFileSync } from 'node:fs';
import { getJson } from '../http.ts';

interface RawAircraft {
    hex: string;
    flight?: string;
    r?: string;
    t?: string;
    desc?: string;
    alt_baro?: number | 'ground';
    alt_geom?: number;
    gs?: number;
    track?: number;
    baro_rate?: number;
    geom_rate?: number;
    squawk?: string;
    category?: string;
    lat?: number;
    lon?: number;
}

export type AircraftKind = 'jet' | 'prop' | 'ga' | 'heli';

export interface Aircraft {
    hex: string;
    kind: AircraftKind;
    callsign: string | null;
    registration: string | null;
    typeCode: string | null;
    typeDescription: string | null;
    onGround: boolean;
    altitudeFt: number | null;
    groundSpeedKt: number | null;
    track: number | null;
    verticalRateFpm: number | null;
    squawk: string | null;
    lat: number;
    lon: number;
    distanceKm: number;
    bearing: number;
}

const KM_PER_NM = 1.852;
// Pseudo type codes used for towers and ground vehicles in the aircraft databases
const NON_AIRCRAFT = new Set(['TWR', 'GND', 'SERV', 'EMER']);
// ICAO type designator -> [kind, name], derived from ICAO Doc 8643 (via wiedehopf/tar1090-db)
const TYPES = JSON.parse(readFileSync(new URL('../data/aircraft-types.json', import.meta.url), 'utf8')) as Record<string, [AircraftKind, string]>;

/** Type table first, then the ADS-B emitter category (A1 light, A7 rotorcraft, B* gliders/ultralights). */
function kindOf(typeCode: string | undefined, category: string | undefined): AircraftKind {
    const known = typeCode ? TYPES[typeCode] : undefined;
    if (known) {
        return known[0];
    }
    if (category === 'A7') {
        return 'heli';
    }
    if (category === 'A1' || category?.startsWith('B')) {
        return 'ga';
    }
    return 'jet';
}
const SOURCES = [
    (lat: number, lon: number, nm: number) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`,
    (lat: number, lon: number, nm: number) => `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${nm}`,
];

function toRad(deg: number): number {
    return deg * Math.PI / 180;
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function clean(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

const SOURCE_BACKOFF_MS = 60_000;
const SHARED_RESPONSE_MS = 5_000;
const downUntil = SOURCES.map(() => 0);
// Several open tabs share one upstream call per position
const recent = new Map<string, { at: number; promise: Promise<RawAircraft[]> }>();

async function fetchFromSources(lat: number, lon: number, nm: number): Promise<RawAircraft[]> {
    const now = Date.now();
    const healthy = SOURCES.map((_, i) => i).filter((i) => downUntil[i] <= now);
    const order = healthy.length ? healthy : SOURCES.map((_, i) => i);
    let lastError: unknown;
    for (const i of order) {
        try {
            const data = await getJson<{ ac?: RawAircraft[] }>(SOURCES[i](lat, lon, nm), {}, 5000);
            if (!data) {
                throw new Error(`Empty response from ADS-B source ${i}`);
            }
            return data.ac ?? [];
        } catch (error) {
            downUntil[i] = Date.now() + SOURCE_BACKOFF_MS;
            lastError = error;
        }
    }
    throw lastError;
}

function fetchRaw(lat: number, lon: number, nm: number): Promise<RawAircraft[]> {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)},${nm}`;
    const now = Date.now();
    const hit = recent.get(key);
    if (hit && now - hit.at < SHARED_RESPONSE_MS) {
        return hit.promise;
    }
    for (const [k, entry] of recent) {
        if (now - entry.at >= SHARED_RESPONSE_MS) {
            recent.delete(k);
        }
    }
    const promise = fetchFromSources(lat, lon, nm);
    promise.catch(() => recent.delete(key));
    recent.set(key, { at: now, promise });
    return promise;
}

export async function nearbyAircraft(lat: number, lon: number, radiusKm: number): Promise<Aircraft[]> {
    // Upstreams take whole nautical miles; filter exactly afterwards
    const raw = await fetchRaw(lat, lon, Math.ceil(radiusKm / KM_PER_NM));
    const result: Aircraft[] = [];
    for (const ac of raw) {
        if (ac.lat === undefined || ac.lon === undefined) {
            continue;
        }
        const dist = distanceKm(lat, lon, ac.lat, ac.lon);
        if (dist > radiusKm) {
            continue;
        }
        const onGround = ac.alt_baro === 'ground';
        // C* categories are surface vehicles and obstacles; typeless ground targets are usually vehicles too
        if (ac.category?.startsWith('C') || (onGround && !ac.t) || NON_AIRCRAFT.has(ac.t ?? '')) {
            continue;
        }
        result.push({
            hex: ac.hex.toUpperCase(),
            kind: kindOf(clean(ac.t) ?? undefined, ac.category),
            // Some transponders send placeholders like "@@@@@@@@"
            callsign: /^[A-Z0-9]+$/.test(clean(ac.flight) ?? '') ? clean(ac.flight) : null,
            registration: clean(ac.r),
            typeCode: clean(ac.t),
            typeDescription: (ac.t && TYPES[ac.t]?.[1]) || clean(ac.desc),
            onGround,
            // Geometric altitude is true height; baro is pressure altitude referenced to 1013 hPa
            altitudeFt: onGround ? 0 : ac.alt_geom ?? (typeof ac.alt_baro === 'number' ? ac.alt_baro : null),
            groundSpeedKt: ac.gs ?? null,
            track: ac.track ?? null,
            verticalRateFpm: ac.baro_rate ?? ac.geom_rate ?? null,
            squawk: ac.squawk ?? null,
            lat: ac.lat,
            lon: ac.lon,
            distanceKm: dist,
            bearing: bearing(lat, lon, ac.lat, ac.lon),
        });
    }
    // Airborne first, then by distance
    return result.sort((a, b) => Number(a.onGround) - Number(b.onGround) || a.distanceKm - b.distanceKm);
}
