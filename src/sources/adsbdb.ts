import { cached } from '../cache.ts';
import { getJson } from '../http.ts';

interface RawAirport {
    iata_code: string;
    icao_code: string;
    name: string;
    municipality: string;
    latitude: number;
    longitude: number;
}

interface RawRoute {
    airline?: { name: string; iata: string; icao: string } | null;
    origin: RawAirport;
    destination: RawAirport;
}

interface RawAircraftInfo {
    type: string;
    icao_type: string;
    manufacturer: string;
    registration: string;
    registered_owner: string;
}

export interface Airport {
    iata: string | null;
    icao: string | null;
    name: string;
    city: string | null;
    lat?: number;
    lon?: number;
}

export interface Route {
    airline: string | null;
    origin: Airport;
    destination: Airport;
}

export interface AircraftInfo {
    manufacturer: string;
    type: string;
    owner: string;
}

const BASE = 'https://api.adsbdb.com/v0';
const DAY = 86400;

function airport(raw: RawAirport): Airport {
    return {
        iata: raw.iata_code || null,
        icao: raw.icao_code || null,
        name: raw.name,
        city: raw.municipality || null,
        lat: raw.latitude,
        lon: raw.longitude,
    };
}

export function routeByCallsign(callsign: string): Promise<Route | null> {
    return cached(`adsbdb:route:${callsign}`, DAY, async () => {
        const data = await getJson<{ response: { flightroute?: RawRoute } }>(`${BASE}/callsign/${encodeURIComponent(callsign)}`);
        const route = data?.response.flightroute;
        if (!route) {
            return null;
        }
        return {
            airline: route.airline?.name ?? null,
            origin: airport(route.origin),
            destination: airport(route.destination),
        };
    });
}

export function aircraftByHex(hex: string): Promise<AircraftInfo | null> {
    return cached(`adsbdb:aircraft:${hex}`, 30 * DAY, async () => {
        const data = await getJson<{ response: { aircraft?: RawAircraftInfo } }>(`${BASE}/aircraft/${encodeURIComponent(hex)}`);
        const info = data?.response.aircraft;
        if (!info) {
            return null;
        }
        return {
            manufacturer: info.manufacturer,
            type: info.type,
            owner: info.registered_owner,
        };
    });
}
