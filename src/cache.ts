import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

mkdirSync(new URL('.', config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)');
db.exec(`DELETE FROM cache WHERE expires < ${Date.now()}`);

const selectStmt = db.prepare('SELECT value FROM cache WHERE key = ? AND expires > ?');
const upsertStmt = db.prepare('INSERT OR REPLACE INTO cache (key, value, expires) VALUES (?, ?, ?)');
const inflight = new Map<string, Promise<unknown>>();

/** True when key is cached or currently being loaded. */
export function cacheHas(key: string): boolean {
    return inflight.has(key) || selectStmt.get(key, Date.now()) !== undefined;
}

/**
 * Returns the cached value for key, or runs loader and caches its result (null included).
 * Loader errors propagate and are not cached.
 */
export function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const row = selectStmt.get(key, Date.now()) as { value: string } | undefined;
    if (row) {
        return Promise.resolve(JSON.parse(row.value) as T);
    }
    const pending = inflight.get(key);
    if (pending) {
        return pending as Promise<T>;
    }
    const promise = loader()
        .then((value) => {
            upsertStmt.run(key, JSON.stringify(value ?? null), Date.now() + ttlSeconds * 1000);
            return value;
        })
        .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
}
