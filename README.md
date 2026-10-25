# Techomato Game Hub

A website where 3D games play directly in the browser. React (Vite) portal + Three.js games.

## Run it

Requires Node 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs static files to dist/
npm run preview  # test the production build
```

`dist/` is a static site that works on any static host.

## Deploy to Vercel

`vercel.json` is already set up (Vite build, `dist` output, fallback to `index.html` so `/play/<id>` works on refresh, and cache headers).

1. Push this repo to GitHub.
2. On vercel.com choose **Add New, Project**, import the repo and click **Deploy**. No settings need changing.

Every push to `master` then redeploys automatically. For other hosts, serve `index.html` for unknown paths
(Netlify: a `public/_redirects` file with `/* /index.html 200`).

## Structure

```
src/
  config.js                 site name + tagline
  App.jsx, main.jsx         layout and routes
  pages/Home.jsx            game grid with genre filter
  pages/GamePage.jsx        game player page + controls
  router.jsx                tiny router (/ and /play/<id>; set window.GAMEHUB_HASH for #/play/<id>)
  components/GameCanvas.jsx mounts/destroys a game, full screen, tall frame for phone-friendly games
  games/registry.js         list of all games
  games/shared/net.js       peer-to-peer rooms (WebRTC data channels, PeerJS-compatible signalling)
  games/ascendants/         Ascendants (50-player anime-style ki battle royale, Three.js)
    data.js                 techniques and ultimates, ki, forms, modes, crates, items, heroes, auras,
                            daily challenges, storm phases, tuning, saves
    island.js               the island: heightmap (coast, hills, mountain, crater lake), named places, houses,
                            landmarks, forests (fellable), boulders, crate spots; ground/collision/ray queries
    islandview.js           splat terrain with shore foam and cloud shadows, animated sea, forests, boulders,
                            houses and landmarks, sky with a sun that sets over the match, drifting clouds, a
                            river and waterfall, morning mist, birds, grass and wildflowers
    texgen.js               generated textures (grass, rock, sand, snow, bark, leaves, facades, roofs)
    sim.js                  movement: dropship, skydive, glide, run/sprint, swim, free flight with boost and
                            supersonic dash, tumbling, rushes and dashes, charging/firing stances
    powers.js               every technique and ultimate: blasts, homing discs, beams and beam clashes, gathered
                            spheres, rushes, teleports, fighting copies, gravity fields, comets
    match.js                rules (offline or on the host): 50 players in solo/duos/squads, ki, forms, melee
                            combos and heavy smashes, vanish, downed/revive, crates and loot, damage, craters
                            and felled trees, the storm, snapshots for guests
    bots.js                 bot AI: drop spot, looting, flight, ki charging, technique choice, combos, vanish,
                            transforming, mashing in clashes, squad play and reviving
    hero.js                 heroes built from Core Breach's sculpted body/head/hands, suits, capes, LOD,
                            fighting poses, form glow
    fx.js, audio.js         particles, flying rocks, auras, beams, clashes, craters, falling trees, the storm
                            wall; synthesised sound
    hud.js, game.js         HUD (ki, forms, lock-on, squad, clash meter), menus; client (camera, input,
                            rendering, events, day cycle, progression)
    online.js               50-player rooms over shared/net.js (bots fill empty slots, teams by join order)
  games/hordesurge/         Horde Surge (3D crowd battler, Three.js)
    data.js                 tuning, upgrades, skins, champions, world themes, save file
    levels.js               seeded level generator: gates, crates, barriers, hazards, horde budget, bosses
    crowd.js                thousands of units per side in flat arrays, drawn with instanced meshes
    world.js                fortress, cannon, gates (animated glass shader), crates, barriers, hazards, brutes
    scenery.js              shader sky, clouds, low-poly terrain and mountains, lane, lamps, instanced props per world
    post.js                 bloom + colour grade + vignette
    ui.js                   HUD and menu styles, icons
    game.js                 simulation (spatial-grid combat), camera, particles, HUD, menus, input
    audio.js                synthesized sound
  games/corebreach/         Core Breach (3D tactical shooter, Three.js)
    data.js                 weapons, agents, economy, timings, saved settings
    level.js                Meridian map + practice range: collision grid, raycasts, A* navigation
    match.js                the rules: rounds, economy, the Core, damage, abilities (runs locally or on the host)
    bots.js                 bot AI: vision, hearing, aim, recoil control, site executes, holds, retakes
    sim.js, hit.js, proj.js shared movement, hitboxes, thrown utility (same code on every client)
    mapview.js, textures.js map meshes (walls with stone skirting and cornices) and generated noise-based textures
    grade.js                colour grade pass
    skin.js                 signed-distance sculpting + surface-nets mesher: each agent's clothed body is one continuous
                            skinned mesh bound to the rig (smooth shoulders, elbows, hips, knees), plus gloved hands
    head.js                 SDF-sculpted heads (skull, jaw, cheekbones, eye sockets, nose, lips, ears), hair styles and
                            snug headwear (hood, cap, mohawk, face masks, visor bands)
    body.js                 eyes with lids, boots, curved plates, pouches, cloth/skin/webbing maps
    guns.js                 weapon construction kit (filleted profiles with through-cut slots, lathed barrels, muzzle
                            devices, suppressors, rails, irons, holo and magnified optics) and all 18 weapons
    props.js                modelled map props: plank crates, corrugated cargo boxes, palms, AC units, balconies
    models.js               agents, first-person arms, weapons, the Core device and the watch turret
    game.js, gun.js         client: rendering, input, guns, abilities, camera, spectating
    hud.js, menus.js        HUD, buy menu, scoreboard, menus
    online.js               online lobby and host/guest sync
    progression.js          XP and levels, rank vs bots, daily missions, weapon skins, match history
    fx.js, audio.js         effects and synthesized sound
  games/midnight/           Midnight Pursuit (3D, Three.js)
    data.js                 cars, upgrades, events, Blacklist rivals, save system
    cars3d.js               detailed procedural car models (lofted bodies, wheels, lights)
    models.js               real .glb car models (bundled concept car + your own in public/models/cars/)
    city.js                 city layout: coastline, districts, road network graph, hills, routing (no three.js)
    props.js                detailed street props: hydrant, ribbed bin, fluted lamp column, signal heads with visors
    world.js                builds the city in 3D: terrain, roads, junctions, blocks of buildings, props, collisions
    vehicles.js             car models, driving physics, traffic
    game.js                 police, events, garage, HUD, menus, input
    post.js                 colour grading (Rockport look), speed motion blur, vignette, grain
    audio.js, fx.js         synthesized audio; skids, smoke, sparks, rain
    mp.js                   online: free roam together, races, co-op pursuits
```

## The site

A dark violet library: a full-width showcase that cycles through the games with real in-game cover art
(`public/covers/<id>.jpg`), cards with features, and a game page with a glowing frame, full screen,
keycap controls and "play next". Horde Surge gets a tall frame on phones held upright.

## The games

**Ascendants** (50-player anime-style battle royale, original heroes, techniques and names): ride the dropship
over a wild island, jump, skydive — or take off and fly. Everyone can fly (double-tap Space; Shift boosts and
breaks into a supersonic dash) and fights with ki: hold C to power up with a flaring aura while rocks lift off
the ground, then spend it on techniques. 18 techniques (ki volley, charged Radiant Wave beam, piercing ray,
homing Razor Halo, ki bomb, scatter storm, nova burst, kiai shout, blinding flash, meteor rush, instant step,
afterimage, ki barrier, inner calm, split form copies, energy lash, gravity press, earth breaker) and 8
ultimates (Gathered Sun, Final Radiance mega beam, Star Breaker, Crimson Surge, Comet Fall, Time Stop, Galaxy
Barrage, Spirit Fist). Beams that meet clash in a ball of energy — mash to push it back into your rival. Five-
hit melee combos, a held heavy smash that sends heroes tumbling through the trees, vanish (V) to appear behind
your lock-on target (T), and a form meter that fills as you fight: press G to ascend, and again for the second
stage (glowing hair, faster, stronger). Crates and fallen heroes give you techniques; equip three plus one
ultimate (Tab); duplicates level them up. Solo, duos or squads (downed teammates can be revived). The day goes
from morning to a golden sunset over a match; blasts burn craters and knock down trees. Level up to unlock
heroes and aura colours, with three daily challenges. Solo against bots, or online: one player hosts a room
(code), up to 50 players join and bots fill the rest.
Cel-shaded heroes with ink outlines and spiky hair that rises with each form, sandstone spires and mesas, and
anime impact frames with speed lines. A tactical HUD: hero select with a lock-in timer, a heading compass with
squad markers, alive / teams / kills counters, a gridded map and minimap with a line to the safe zone, an ability
bar with ki costs and ultimate pips, damage-direction arcs, an elimination banner, squad pings (middle mouse or
B; click the map to place a marker), a Tab inventory listing loot nearby, sky-cache airdrops under red
canopies, bombardment zones raining comets, and a customisable crosshair.

**Horde Surge** (3D crowd battler, original characters and art): hold to fire a stream of little units from
your cannon up a lane, drag to aim them through gates (×2, ×3, +N bonus, −N traps, moving gates), chew through
bonus crate stacks that burst into more units, smash HP barriers (some leave a bonus gate behind), dodge
spinning bars and sweeping saws, and crush the enemy horde pouring out of the fortress. Brutes with health bars
march down with the waves, every fifth level ends with a boss that smashes the ground, and the fortress sends
out more defenders the harder you hit it. Fire to charge your champion (Titan, Roller or Splitter) and launch it
to wrestle bosses and crash into the fortress. Five worlds (meadow, frost, dunes, candy, neon night), endless
seeded levels with a difficulty budget fitted to each layout, 1–3 stars, coins, five upgrades, six unit skins,
daily rewards, auto-fire, quality presets and automatic resolution. Up to 1,400 units per side.
Each world has its own scenery: meadow trees and flowers, snowy pines and snowfall, desert cacti and mesas,
candy lollipops and cotton-candy trees, neon crystals with fireflies. Bloom and a colour grade on Medium/High.

**Core Breach** (3D tactical shooter, original agents, weapons and maps): 5v5 attack/defend on two maps —
Meridian (sunny hillside town) and Harbor (sunset dockyard with cranes, a covered warehouse and a container yard).
Attackers plant the Core on site A or B, defenders stop or defuse it (half-way checkpoint).
30-second buy phases with an economy (kill/plant/win rewards, loss streak bonus), 17 weapons (sidearms and a
shotgun pistol, two SMGs, pump and auto shotguns, burst/semi/auto rifles, a scoped marksman rifle, two snipers, a heavy MG) with recoil patterns, spread bloom,
falloff and head/body/leg damage, light/heavy shields, knife backstabs.
Eight agents, each with four abilities (two bought, one free, an ultimate): flashes, firebombs, dashes, blinks,
smoke domes, slow fields, toxic gas, concussions, shock and recon darts, sensor traps, barrier walls, a watch turret,
heals, a revive, a map-wide reveal, a blinding supernova, a lockdown field and an orbital strike.
Characters are built from smooth parts with fabric-textured gear; both hands hold the gun through arm IK, and the
legs turn with the movement direction (strafe, backpedal, crouch, jump, directional death falls). Thrown abilities show their arc before you throw.
Bots see (field of view, walls, smoke, flashes), hear gunfire and footsteps, aim with human-like reaction and
error, control recoil, execute onto sites together, hold, rotate, retake and defuse.
Modes: vs bots (easy/normal/hard, short or standard length), deathmatch, practice range, and online rooms
(5v5 Core or deathmatch, bots fill empty slots). Spectating, killfeed, minimap with reveals, scoreboard,
crosshair editor, sensitivity/FOV/quality settings, saved stats. Keyboard + mouse and full touch controls.
Progression: account XP and levels, a rank earned against bots (Bronze to Legend), three daily missions,
weapon skins unlocked by level (Armory), match history and lifetime stats (Career), XP breakdown after each match.
Rendering: physical sky with per-map lighting and reflections, a static sun shadow map with soft blob shadows under
players, ambient occlusion (High), bloom, building facades (shuttered windows, doors, shop signs, AC units, pipes,
ivy), a separate first-person weapon pass, and automatic resolution scaling to hold the frame rate.

**Online play** (Core Breach and Midnight Pursuit): one player hosts a room and gets a 5-letter code, friends join
with it. Browsers connect directly (WebRTC); the free public PeerJS server only introduces them, so no game
server is needed. To use your own signalling server or add TURN servers (needed on some strict networks),
edit `NET` in `src/config.js`.

**Midnight Pursuit** (3D): open-world coastal city laid out like a real one rather than a grid: a downtown
of tall towers on its own tilted street grid crossed by diagonal avenues, older brick districts at other angles,
curving streets winding through hillside suburbs, a beach-front boulevard with a seawall, an industrial port
with container yards and cranes, a ring highway with sweeping bends and an elevated expressway on columns.
Roads form one connected network (about 350 junctions); city blocks are filled edge to edge with buildings;
the land has real hills and the roads climb them. Traffic, police, rivals, GPS and races all follow the road
network (A* routing), and races close side streets with chevron barriers.
World detail: four kinds of trees built from leaf cards (oaks, poplars, pines on the hills, palms by the beach),
woods and forested mountains around the city, textured grass, soft contact shadows at the foot of buildings,
suburban houses with porches, chimneys, attached garages and picket fences, wooden power-line poles with
sagging wires, bus shelters with lit adverts, street lamps, traffic lights, hydrants, bins and parked cars.
10 cars with engine/nitrous/handling upgrades, paint and customization (gloss/metallic/matte/pearl finish,
rim finish, caliper colour, underglow), arcade drift physics, nitrous, speedbreaker
slow motion, traffic with near misses, police pursuits with heat 1-5 (patrols, interceptors, heavy SUVs,
roadblocks, spike strips, helicopter), busted/evade/cooldown, bounty, 10 events (sprint, circuit,
speed trap, tollbooth, pursuit) plus drift, time trial and knockout events (16 in all), 8 Blacklist rival races that
unlock cars, 8 speed cameras with personal bests, 16 milestones with cash rewards, photo mode (orbit camera, lens,
exposure, depth of field, save as PNG; press H), automatic resolution scaling, minimap + full map with GPS,
3 cameras, overcast/day/sunset/night with cloud sky, rain, keyboard + gamepad + touch controls, autosave.
Old-city look (brick districts, cornices, rooftop water tanks, fire escapes), chevron race barriers,
street-racer HUD (rev counter with digital speed, round minimap, position/time/% complete panel),
WINNER results screen, tail-light streaks at speed and a loading screen.
Rendering: image-based lighting and reflections from real HDR photos (Poly Haven, CC0), photographed
skies, bloom, colour grading, shadows, live reflections on the player's car. The Kestrel, Nightfall and
Phantom use a detailed 3D car model ("Car Concept", CC BY 4.0, credits in `public/models/cars/CREDITS.txt`);
traffic, police, rivals and parked cars are procedural (lofted bodies with a painted livery atlas for windows,
pillars, door seams and lights). Buildings use generated PBR facades (recessed windows, sills, grime,
A/C units), varied storefronts, leaf-card trees and a photo asphalt texture.
More car models: `public/models/cars/README.txt`. Lighting, sky and road images: `public/assets/README.txt`.
Three.js 3D games export `mount(container)` and set `engine: 'three'` in the registry.

## Add a new game

1. Create `src/games/<name>/index.js` exporting:
   ```js
   export const engine = 'three';
   export function mount(container, opts) { /* build the game inside container */ return () => { /* clean up */ }; }
   ```
2. Add an entry to `src/games/registry.js` (id, title, genre, size, colors, controls, `load: () => import('./<name>/index.js')`).
3. Optionally add a cover image: `public/covers/<id>.svg` (shown on the home page).

The game appears on the home page and gets its own `/play/<id>` page automatically.

## Next steps

- Online: add TURN servers in `src/config.js` for players behind strict firewalls; a dedicated server would
  stop a host from cheating, if that ever matters.
- Accounts, leaderboards and saved progress: add an API + database.
- Mobile polish: games already accept touch input; test on real devices.
