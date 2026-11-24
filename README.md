# la-vega-3d

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ilham270207/la-vega-3d/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ilham270207/la-vega-3d/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**La Vega 3D** — an open-world crime game in the sun-baked coastal city of **La Vega**. You are **Jax Vega**, a driver fresh off the ferry with one ticket and no cash. **La Rosa**, the fixer who runs the club, has twelve jobs for you across four acts: steal cars, run packages, race Neon Row, settle the score with the Vultures, buy clean wheels, and pull off the La Vega Score — five drops across the whole city, then the Harbor Heist and a five-star bridge chase home. Play as Jax or **Maya**, the crew driver — switch anytime with V.

Everything is original: the city, the characters, the cars, the story, the art and the music. No Rockstar Games assets or names.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Or open `game/index.html` through any static server. The game needs no build step and makes no network requests — it runs fully offline on desktop Chrome (PC keyboard/mouse) and on phones (touch controls auto-detect). Live preview: https://ilham270207.github.io/la-vega-3d/game/

## The city

A 400×400 m open world: the Marina, Downtown, Neon Row and South Beach districts, plus forest, desert, rocky hills and swamp biomes, a harbor with cranes and container ships, an airport, two bridges over the river, and the sea to the horizon — no void at the map edge. 21 named places: bank, jewelry store, minimarket, gas station, gun shop, safehouse, garage, workshop, club, restaurant, police station, hospital, car dealer, port warehouse, pet shop, mall, casino, villas and more — most with enterable interiors.

## Systems

- **Wanted 1–5 stars**: LVPD pursuit AI, roadblocks and spike strips at 3+, police helicopter with spotlight at 4+, SWAT at 5, officers who leave their cruisers on foot, BUSTED with a $100 bail, and police who remember your car's plates until a respray.
- **Vehicles**: supercar, muscle, sedan/SUV, 4×4 pickup, truck, city bus on a loop route, speedboat, jet ski, flyable helicopter — plus 15 buyable cars at Auto Palms. Car-to-car collision, body damage that hurts performance, fuel, nitro, drift and near-miss scoring.
- **Living city**: pedestrians with daily routines, gang territory, cashiers you can rob, safes to crack, bystanders who film you on their phones and post it to in-game social media, dogs, birds and crocodiles, dynamic weather (sun, cloud, rain, storm) and a full day/night cycle.
- **Campaign**: 12 missions in 4 acts with cutscene cards, dialogue, timers, checkpoints, a 5-star finale and district standing.
- **Phone, HUD & save**: in-game phone (contacts, GPS, social feed), full HUD (minimap with live police/mission blips, Health/Armor/Stamina, wanted stars, money, weapon/ammo, speedometer, fuel, weapon wheel, dispatch board), 3 save slots with auto-save, and customization at the clothes shop, salon and tattoo parlor.
- **Details that make it feel alive**: night headlights on every car, a crosshair when aiming, a gold marker that points at the nearest parked car for steal jobs, an officer on foot at every roadblock, a fisherman on the pier, pebbles and shells on the beach, and a single `ECONOMY` price table in `config.js` so every dollar amount in the game stays consistent.

## Build notes (recorded rebuild, Nov 2026)

The game was rebuilt from scratch in a make.fun-recorded session. Three.js 0.170.0 is vendored **minified** (`game/three/three.module.min.js` + minified GLTFLoader/SkeletonUtils/BufferGeometryUtils), so the dossier and the authorship gates see game code, not library code. All models are CC0/CC-BY (Quaternius via Poly Pizza) loaded by fetch with procedural fallbacks — the game boots even if a GLB fails.

Dossier staging (dev console, in-game): `window.__laVega.stageShot('beach' | 'downtown' | 'harbor')` — positions the player, sets golden-hour light, and (for `downtown`) raises wanted to 3 stars so the dispatch board shows.
- **Audio**: synthesized SFX and three procedural radio stations (Neon Tide FM, Mango Radio, Static Dub) — no copyrighted music. Human-voice barks use CC0 clips when present, otherwise Simlish-style synth mumbles. No AI text-to-speech.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive, sail, fly |
| Mouse drag / wheel | Orbit camera / zoom |
| Space | Jump / handbrake (car) / climb (heli) |
| Q / F (or click) | Punch / shoot |
| E | Enter/exit car, boat, heli, interiors · talk to La Rosa · refuel / repair |
| T | Phone |
| Tab / 1–5 | Weapon wheel / select weapon |
| X | Reload · N nitro · H horn · B buy |
| V | Switch Jax / Maya |
| Z / C / G | Crew abilities: swap plates / quick fix / eyes out |
| P | Pause · M mute · R radio station |

## Credits & license

Built by Muse.

MIT — see `LICENSE`. All code, story, art and audio are original or procedural. Character, car and weapon models are **Quaternius** models (CC0, via Poly Pizza). Engine: **Three.js** (MIT). Voice barks: CC0 clips (Freesound / OpenGameArt / Sonniss) when present in `game/audio/barks/`, otherwise synthesized mumbles. No copyrighted music, models or textures are used.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vs40zhzs&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## Fix round 3 (24 Nov 2026, recorded session)
HD detail pass after ilham's round-2 playtest: real beach with shoreline +
animated waves, Claude-style facade textures (256 px, mullions, floor
separators), ground-floor kit (proud base, canopy, crown cornice, floor
bands), 7 special named buildings, 4 silhouette variants, 3D signs, dense
city blocks (no empty lots), flat cloud sprites, HD procedural cars
(taxi/police/sport/pickup variants, split van cab+cargo, detailed truck),
GLB loader (15 s timeout, cars first), GPS beam to La Rosa, visible stunt
ramps, sea ambience. Maya no longer follows Jax (she is only playable via V).
