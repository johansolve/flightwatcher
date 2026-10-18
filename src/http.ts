import { config } from './config.ts';

export class HttpError extends Error {
    status: number;

    constructor(status: number, url: string) {
        super(`HTTP ${status} from ${url}`);
        this.status = status;
    }
}

/** GET JSON with timeout. Returns null on 404, throws on other failures. */
export async function getJson<T>(url: string, headers: Record<string, string> = {}, timeoutMs = 6000): Promise<T | null> {
    const res = await fetch(url, {
        headers: { 'User-Agent': config.userAgent, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        throw new HttpError(res.status, url);
    }
    return await res.json() as T;
}
