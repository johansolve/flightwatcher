import { cached } from '../cache.ts';
import { getJson } from '../http.ts';

export interface Wind {
    source: 'metar' | 'model';
    station: string | null;
    observed: string | null;
    directionDeg: number | null;
    variable: boolean;
    speedKt: number;
    gustKt: number | null;
}

interface RawMetar {
    icaoId: string;
    reportTime: string;
    wdir: number | 'VRB' | null;
    wspd: number | null;
    wgst: number | null;
}

interface RawOpenMeteo {
    current?: {
        time: string;
        wind_speed_10m: number;
        wind_direction_10m: number;
        wind_gusts_10m: number;
    };
}

/** Observed wind from the airport's METAR (NOAA aviationweather.gov). */
function metarWind(icao: string): Promise<Wind | null> {
    return cached(`metar:${icao}`, 10 * 60, async () => {
        const data = await getJson<RawMetar[]>(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`);
        const m = data?.[0];
        if (!m || m.wspd === null || m.wspd === undefined) {
            return null;
        }
        return {
            source: 'metar' as const,
            station: m.icaoId,
            observed: m.reportTime,
            directionDeg: typeof m.wdir === 'number' ? m.wdir : null,
            variable: m.wdir === 'VRB',
            speedKt: m.wspd,
            gustKt: m.wgst ?? null,
        };
    });
}

/** Modelled 10 m wind for any coordinate (Open-Meteo). */
function modelWind(lat: number, lon: number): Promise<Wind | null> {
    const key = `openmeteo:${lat.toFixed(2)},${lon.toFixed(2)}`;
    return cached(key, 15 * 60, async () => {
        const params = new URLSearchParams({
            latitude: lat.toFixed(2),
            longitude: lon.toFixed(2),
            current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
            wind_speed_unit: 'kn',
            timezone: 'GMT',
        });
        const data = await getJson<RawOpenMeteo>(`https://api.open-meteo.com/v1/forecast?${params}`);
        const c = data?.current;
        if (!c) {
            return null;
        }
        return {
            source: 'model' as const,
            station: null,
            observed: `${c.time}:00Z`,
            directionDeg: c.wind_direction_10m,
            variable: false,
            speedKt: c.wind_speed_10m,
            gustKt: c.wind_gusts_10m,
        };
    });
}

/** METAR when the airport reports one, otherwise the model value for the coordinate. */
export async function windAt(lat: number, lon: number, icao: string | null): Promise<Wind | null> {
    if (icao) {
        try {
            const observed = await metarWind(icao);
            if (observed) {
                return observed;
            }
        } catch (error) {
            console.warn(String(error));
        }
    }
    return modelWind(lat, lon);
}
