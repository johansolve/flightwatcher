import { readFileSync } from 'node:fs';

export interface Airport {
    code: string;
    name: string;
    short: string;
    lat: number;
    lon: number;
}

// [icao, iata, name, municipality, lat, lon], derived from OurAirports (public domain)
type Row = [string, string, string, string, number, number];

const rows = JSON.parse(readFileSync(new URL('./data/airports.json', import.meta.url), 'utf8')) as Row[];
const index = new Map<string, Row>();
for (const row of rows) {
    if (row[0]) {
        index.set(row[0], row);
    }
}
for (const row of rows) {
    if (row[1] && !index.has(row[1])) {
        index.set(row[1], row);
    }
}

export function isAirportCode(code: string): boolean {
    return /^[A-Z0-9]{3,4}$/.test(code);
}

/** Looks up an IATA (3 letters) or ICAO (4 letters) code. */
export function findAirport(code: string): Airport | null {
    const row = index.get(code.trim().toUpperCase());
    if (!row) {
        return null;
    }
    const [icao, iata, name, city, lat, lon] = row;
    return { code: iata || icao, name, short: city || name, lat, lon };
}
