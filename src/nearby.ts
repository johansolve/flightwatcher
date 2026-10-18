import { distanceKm, nearbyAircraft, type Aircraft } from './sources/adsb.ts';
import { aircraftByHex, routeByCallsign, type AircraftInfo, type Airport, type Route } from './sources/adsbdb.ts';
import { flightTimes, type FlightTimes } from './sources/aeroapi.ts';

export interface Flight extends Aircraft {
    airline: string | null;
    info: AircraftInfo | null;
    origin: Airport | null;
    destination: Airport | null;
    times: FlightTimes | null;
}

async function settle<T>(promise: Promise<T>): Promise<T | null> {
    try {
        return await promise;
    } catch (error) {
        console.warn(String(error));
        return null;
    }
}

/** adsbdb routes go stale when callsigns are reused; the aircraft should lie roughly between the airports. */
function plausible(route: Route, ac: Aircraft): boolean {
    const { origin: o, destination: d } = route;
    if (o.lat === undefined || o.lon === undefined || d.lat === undefined || d.lon === undefined) {
        return true;
    }
    const direct = distanceKm(o.lat, o.lon, d.lat, d.lon);
    const via = distanceKm(o.lat, o.lon, ac.lat, ac.lon) + distanceKm(ac.lat, ac.lon, d.lat, d.lon);
    return via <= direct * 1.2 + 100;
}

async function enrich(ac: Aircraft): Promise<Flight> {
    const cs = ac.callsign;
    const [info, adsbdbRoute, times] = await Promise.all([
        ac.hex.startsWith('~') ? null : settle(aircraftByHex(ac.hex)),
        cs ? settle(routeByCallsign(cs)) : null,
        cs ? settle(flightTimes(cs)) : null,
    ]);
    const route = adsbdbRoute && plausible(adsbdbRoute, ac) ? adsbdbRoute : null;
    // AeroAPI knows today's actual flight; adsbdb routes can be stale
    return {
        ...ac,
        airline: route?.airline ?? null,
        info,
        origin: times?.origin ?? route?.origin ?? null,
        destination: times?.destination ?? route?.destination ?? null,
        times: times ?? null,
    };
}

export async function nearbyFlights(lat: number, lon: number, radiusKm: number): Promise<Flight[]> {
    const aircraft = await nearbyAircraft(lat, lon, radiusKm);
    return Promise.all(aircraft.map(enrich));
}
