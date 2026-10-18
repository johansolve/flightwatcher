import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAirport, isAirportCode } from './airports.ts';
import { config } from './config.ts';
import { nearbyFlights } from './nearby.ts';
import { timesAvailable } from './sources/aeroapi.ts';

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
}

function parseCoord(value: string | null, limit: number): number | null {
    const n = Number(value);
    return value !== null && value !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    let root = config.publicDir;
    let relative = pathname === '/' ? '/index.html' : pathname;
    for (const [prefix, dir] of Object.entries(config.vendor)) {
        if (pathname.startsWith(prefix)) {
            root = dir;
            relative = pathname.slice(prefix.length - 1);
        }
    }
    const file = new URL(`.${relative}`, root);
    if (!fileURLToPath(file).startsWith(fileURLToPath(root))) {
        res.writeHead(403).end();
        return;
    }
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file.pathname)] ?? 'application/octet-stream' });
        res.end(body);
    } catch {
        res.writeHead(404).end('Not found');
    }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET') {
        res.writeHead(405).end();
        return;
    }
    if (url.pathname === '/api/config') {
        sendJson(res, 200, {
            defaultLocations: config.defaultLocations.map(findAirport).filter(Boolean),
            defaultLocation: config.defaultLocation,
            defaultRadiusKm: config.defaultRadiusKm,
            maxRadiusKm: config.maxRadiusKm,
            timesAvailable: timesAvailable(),
        });
        return;
    }
    if (url.pathname === '/api/airports') {
        const codes = (url.searchParams.get('codes') ?? '').toUpperCase().split(',').filter(Boolean).slice(0, 30);
        if (!codes.length || !codes.every(isAirportCode)) {
            sendJson(res, 400, { error: 'Give codes as comma separated IATA or ICAO codes' });
            return;
        }
        const found = codes.map((code) => ({ code, airport: findAirport(code) }));
        sendJson(res, 200, {
            airports: found.flatMap((f) => (f.airport ? [f.airport] : [])),
            unknown: found.filter((f) => !f.airport).map((f) => f.code),
        });
        return;
    }
    if (url.pathname === '/api/nearby') {
        const lat = parseCoord(url.searchParams.get('lat'), 90);
        const lon = parseCoord(url.searchParams.get('lon'), 180);
        const radius = Number(url.searchParams.get('radius') ?? config.defaultRadiusKm);
        if (lat === null || lon === null || !(radius > 0 && radius <= config.maxRadiusKm)) {
            sendJson(res, 400, { error: 'Invalid lat, lon or radius' });
            return;
        }
        try {
            sendJson(res, 200, { flights: await nearbyFlights(lat, lon, radius), updated: new Date().toISOString() });
        } catch (error) {
            console.error(error);
            sendJson(res, 502, { error: 'ADS-B source unavailable' });
        }
        return;
    }
    await serveStatic(url.pathname, res);
}

// Malformed request targets can throw anywhere in handle(); never let them take the process down
const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
        console.warn(String(error));
        if (!res.headersSent) {
            res.writeHead(400);
        }
        res.end();
    });
});

server.listen(config.port, () => {
    console.log(`Flightwatcher on http://localhost:${config.port}/ (times ${timesAvailable() ? 'on' : 'off'})`);
});
