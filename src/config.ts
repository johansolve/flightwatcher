function num(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && process.env[name] !== '' ? value : fallback;
}

const contact = process.env.CONTACT ?? '';
const modules = new URL('../node_modules/', import.meta.url);

export const config = {
    port: num('PORT', 8090),
    defaultLocations: (process.env.DEFAULT_LOCATIONS ?? 'HAD,AGH,CPH,GOT,ARN').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
    defaultLocation: (process.env.DEFAULT_LOCATION ?? 'AGH').toUpperCase(),
    defaultRadiusKm: num('DEFAULT_RADIUS_KM', 10),
    maxRadiusKm: num('MAX_RADIUS_KM', 50),
    aeroApiKey: process.env.AEROAPI_KEY ?? '',
    userAgent: contact ? `Flightwatcher/0.1 (+${contact})` : 'Flightwatcher/0.1',
    dbPath: new URL('../data/cache.sqlite', import.meta.url),
    publicDir: new URL('../public/', import.meta.url),
    // URL prefix -> directory, for client libraries installed via npm
    vendor: {
        '/vendor/leaflet/': new URL('leaflet/dist/', modules),
        '/vendor/archivo/': new URL('@fontsource-variable/archivo/', modules),
        '/vendor/plex-mono/': new URL('@fontsource/ibm-plex-mono/', modules),
        '/vendor/alegreya/': new URL('@fontsource-variable/alegreya/', modules),
        '/vendor/im-fell/': new URL('@fontsource/im-fell-english-sc/', modules),
        '/vendor/jost/': new URL('@fontsource-variable/jost/', modules),
        '/vendor/josefin/': new URL('@fontsource-variable/josefin-sans/', modules),
        '/vendor/yellowtail/': new URL('@fontsource/yellowtail/', modules),
    } as Record<string, URL>,
};
