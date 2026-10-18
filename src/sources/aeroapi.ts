import { cached, cacheHas } from '../cache.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import type { Airport } from './adsbdb.ts';

interface RawAirport {
    code_iata: string | null;
    code_icao: string | null;
    name: string | null;
    city: string | null;
}

interface RawFlight {
    ident: string;
    operator: string | null;
    origin: RawAirport | null;
    destination: RawAirport | null;
    status: string;
    scheduled_out: string | null;
    estimated_out: string | null;
    actual_out: string | null;
    actual_off: string | null;
    actual_on: string | null;
    scheduled_in: string | null;
    estimated_in: string | null;
    estimated_on: string | null;
    actual_in: string | null;
}

export interface FlightTimes {
    origin: Airport | null;
    destination: Airport | null;
    status: string;
    departure: { scheduled: string | null; estimated: string | null; actual: string | null };
    arrival: { scheduled: string | null; estimated: string | null; actual: string | null };
}

// Personal tier allows 10 result sets per minute
const RATE_LIMIT = 10;
const requestLog: number[] = [];

function takeToken(): boolean {
    const now = Date.now();
    while (requestLog.length && requestLog[0] < now - 60_000) {
        requestLog.shift();
    }
    if (requestLog.length >= RATE_LIMIT) {
        return false;
    }
    requestLog.push(now);
    return true;
}

function airport(raw: RawAirport | null): Airport | null {
    if (!raw?.name) {
        return null;
    }
    return { iata: raw.code_iata, icao: raw.code_icao, name: raw.name, city: raw.city };
}

/** Prefer the flight currently airborne, otherwise the one scheduled closest to now. */
function pickFlight(flights: RawFlight[]): RawFlight | null {
    const now = Date.now();
    // Results include past days; a stale flight may never have received actual_on
    const airborne = flights.find((f) => f.actual_off && !f.actual_on && now - Date.parse(f.actual_off) < 86_400_000);
    if (airborne) {
        return airborne;
    }
    const distance = (f: RawFlight) => f.scheduled_out ? Math.abs(Date.parse(f.scheduled_out) - now) : Infinity;
    return [...flights].sort((a, b) => distance(a) - distance(b))[0] ?? null;
}

export function timesAvailable(): boolean {
    return config.aeroApiKey !== '';
}

/** Returns undefined when skipped (no key or rate limited), null when no flight found. */
export async function flightTimes(callsign: string): Promise<FlightTimes | null | undefined> {
    if (!timesAvailable()) {
        return undefined;
    }
    const key = `aeroapi:${callsign}`;
    if (!cacheHas(key) && !takeToken()) {
        return undefined;
    }
    return cached(key, 30 * 60, async () => {
        const data = await getJson<{ flights: RawFlight[] }>(
            `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(callsign)}?max_pages=1`,
            { 'x-apikey': config.aeroApiKey },
        );
        const flight = pickFlight(data?.flights ?? []);
        if (!flight) {
            return null;
        }
        return {
            origin: airport(flight.origin),
            destination: airport(flight.destination),
            status: flight.status,
            departure: {
                scheduled: flight.scheduled_out,
                estimated: flight.estimated_out,
                actual: flight.actual_out ?? flight.actual_off,
            },
            arrival: {
                scheduled: flight.scheduled_in,
                estimated: flight.estimated_in ?? flight.estimated_on,
                actual: flight.actual_in ?? flight.actual_on,
            },
        };
    });
}
