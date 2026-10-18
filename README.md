# Flightwatcher

What is that plane overhead? Flightwatcher shows the aircraft currently flying near an airport of your choice, with a photo of each individual aircraft, its type and airline, altitude, speed, distance and direction, and where it is coming from and going to, including scheduled and actual times.

It is a small, self-hosted web page meant for a home screen, a wall display or just a browser tab next to the window. The interface is in Swedish.

## Features

- **Live traffic within a radius** (1–50 km) of a chosen airport or your own position, refreshed every 10 seconds. Between refreshes, aircraft glide on the map by dead reckoning from their speed and track.
- **Wind at the chosen place**: observed wind from the airport's METAR, or modelled wind from Open-Meteo for your own position and airports without a METAR.
- **Map** with range rings and aircraft symbols that show both what the aircraft is (jet, turboprop, light aircraft, helicopter) and what it is doing (climbing, descending, cruising, on the ground).
- **Route and times**: origin and destination, scheduled, estimated and actual departure and arrival, with delays highlighted.
- **Photos** of the actual airframe from Planespotters.net, credited to the photographer. When no photo exists, an icon for the aircraft type is shown instead, so the layout stays stable.
- **Editable airport list**: add or remove airports by IATA or ICAO code directly in the page (for example `MMX` or `ESMS`). The list is stored per browser.
- **Five themes**, switchable from a dropdown:
  - *Flygledare* (air traffic control): a dark strip bay with flight progress strips colour-coded by phase of flight, photos as perforated stamps and a radar-style map.
  - *Skolplansch* (school wall chart): an aged paper chart hanging from wooden rods, with numbered figures, facts written as prose, softly vignetted photos and a watercolour map.
  - *Tavelvägg* (gallery wall): every aircraft as a framed print with a white mat, alternating black and oak frames, on a muted wall.
  - *Retro*: a very clean 1950s look with pastel accents, atomic starbursts and rounded photos.
  - *Minimal*: plain and airy, one aircraft per row with photo and facts alternating left and right.
- Light on resources: no build step, no framework, a single Node process with an SQLite cache.

## Requirements

- Node.js 24 or later. TypeScript runs directly through Node's built-in type stripping, and the cache uses the built-in `node:sqlite`.
- Optional: a [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/) key for departure and arrival times. Without one, routes are still shown but times are not.

## Getting started

```sh
npm install
cp .env.example .env    # optionally add AEROAPI_KEY
npm start               # or: npm run dev (restarts on file changes)
```

Then open <http://localhost:8090/>. Browser geolocation ("Min plats") requires `localhost` or HTTPS.

## Configuration

All settings live in `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8090` | HTTP port |
| `DEFAULT_LOCATIONS` | `HAD,AGH,CPH,GOT,ARN` | Airport list for first-time visitors (IATA or ICAO codes) |
| `DEFAULT_LOCATION` | `AGH` | Airport selected on first visit |
| `DEFAULT_RADIUS_KM` | `10` | Initial radius |
| `MAX_RADIUS_KM` | `50` | Upper limit of the radius slider |
| `AEROAPI_KEY` | empty | FlightAware AeroAPI key; enables times |
| `CONTACT` | empty | Contact URL or e-mail appended to the User-Agent sent to upstream APIs |

Each visitor's airport list, selected airport, radius and theme are stored in their own browser.

## How it works

```
Browser (vanilla ES6, Leaflet)
  │  GET /api/nearby?lat=..&lon=..&radius=..   every 10 s
  ▼
Node server (src/server.ts)
  ├─ ADS-B positions    adsb.lol, falls back to adsb.fi    shared for 5 s, failing source skipped for 60 s
  ├─ Aircraft and route adsbdb.com                         cached 30 days / 24 h in SQLite
  ├─ Times              FlightAware AeroAPI                cached 30 min, max 10 lookups per minute
  ├─ Wind               METAR, else Open-Meteo             cached 10 / 15 min
  └─ Airports and types src/data/*.json                    loaded at startup
Browser → Planespotters.net photo API directly (required by its terms)
```

Some details worth knowing:

- Ground vehicles, towers and transponders sending placeholder callsigns are filtered out.
- Routes from adsbdb are checked for plausibility: if the aircraft is far off the line between origin and destination, the route is considered stale and hidden. AeroAPI routes take precedence when available.
- Altitude is the GPS (geometric) altitude when available, since barometric altitude is referenced to 1013 hPa and can be off by hundreds of feet.
- Aircraft kind (jet, turboprop, light aircraft, helicopter) is derived from the ICAO type designator description, with the ADS-B emitter category as fallback.

## Data sources and terms

Flightwatcher relies on free services run by others. Please respect their terms and keep request volumes reasonable.

| Data | Source | Terms |
|---|---|---|
| Aircraft positions | [adsb.lol](https://adsb.lol), [adsb.fi](https://adsb.fi) | ODbL; community-run, rate limited |
| Aircraft and routes | [adsbdb](https://www.adsbdb.com) | Free API |
| Departure and arrival times | [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/) | Personal tier is for personal or academic use only |
| Photos | [Planespotters.net](https://www.planespotters.net/photo/api) | Photographer credit and link required; images may not be stored, proxied or used for AI training |
| Map tiles | [Stadia Maps](https://stadiamaps.com) (Alidade Smooth, Alidade Smooth Dark, Stamen Watercolor, Stamen Toner Lite), © OpenMapTiles, © OpenStreetMap contributors | Free without an account on localhost; a (free) account is needed for a public domain |
| Airports | [OurAirports](https://ourairports.com/data/) | Public domain |
| Aircraft types | ICAO Doc 8643 designators via [tar1090-db](https://github.com/wiedehopf/tar1090-db) | Factual reference data |
| Wind at airports | [NOAA aviationweather.gov](https://aviationweather.gov/data/api/) METAR | US government data, free |
| Wind elsewhere | [Open-Meteo](https://open-meteo.com) | CC BY 4.0, attribution required; free for non-commercial use |
| Fallback icons | [Pinhead Map Icons](https://github.com/waysidemapping/pinhead) | CC0 |
| Fonts | Archivo, IBM Plex Mono, Alegreya, IM Fell English SC, Jost, Josefin Sans, Yellowtail via Fontsource | SIL Open Font License / Apache 2.0 |

## Hosting publicly

Flightwatcher is built for personal use. Before exposing it on the internet, consider that `/api/nearby` has no rate limiting of its own, so anyone could use it to query the upstream services through your server and exhaust your AeroAPI quota. The AeroAPI Personal tier also does not permit commercial use, and the map tiles need a Stadia Maps account for non-localhost domains.

## Development

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # jshint public/app.js
```

## License

MIT, see [LICENSE](LICENSE). Third-party data and assets keep their own licenses as listed above.
