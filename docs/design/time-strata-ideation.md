# Event Miner: time strata ideation

Date: 2026-10-24. Status: discussion draft, not a spec.

## 1. What the prototype does today

- One vehicle digs dirt and coal, flies up on fuel, and returns to one refinery fixed at the surface.
- The time rate is `1.1^depth`, continuous. At 24 tiles the factor is x10. At the world floor (146 tiles) it is about x1,000,000.
- The refinery advances by `delta / factor`. So the deeper the player is, the slower the refinery runs from the player's view. Above the surface the refinery runs faster.

What breaks:

- The main activity (dig deep) freezes the only building. A deep dive returns to zero fuel. The mechanic punishes the loop it should feed.
- There is no placement decision. The one building has a fixed position.
- The continuous exponent gives unreadable numbers. The player cannot plan with x37.4.

## 2. The one rule

Give each depth `y` a rate `r(y)`. Global time is `T`. A thing at depth `y` has its own clock: `dτ = r(y) · dT`.
The game runs on the player's clock. So one real second at player depth `p` advances a thing at depth `y` by `r(y) / r(p)` of its own seconds.

Consequences:

- Everything at your own depth runs normally. Always.
- Only ratios across depths matter. The whole mechanic lives in crossings: the player crossing, items crossing, power crossing, time-bound events on another stratum.
- A rate field with no crossings is invisible. Every mechanic below is a kind of crossing.
- Every duration has exactly one clock: the clock of the stratum its owner is in right now. An item that moves to another stratum decays at the new rate from that moment. (The Ultima-style dungeon post in section 10 shows what happens without this rule.)

## 3. Which way does time run?

| | Deep = slow (gravity well) | Deep = fast (current code) |
| --- | --- | --- |
| Physics | Matches gravitational time dilation. The core is an event horizon. | Inverted. |
| Dive experience | The surface runs ahead while you dig. You return to a changed base. | The surface freezes while you dig. Nothing happens. |
| Where to process | High. Fast strata finish batches in few of your minutes. | Deep. Everything wants to be as deep as possible. |
| Where to store | Deep. Slow strata preserve decaying things. | High. |
| Pressure | Every deep minute spends many surface minutes of any deadline. | No cost to depth. |

Recommendation: deep = slow. The name already says it: "Event Miner" reads as mining toward an event horizon. The dive becomes a dial: how much surface time am I willing to skip for this ore. The closest prior art (Temporal Engineer, section 10) made the same choice and got a clear stay-or-leave decision from it.

One general rule for the player follows: go down to skip world time, go up to buy more of your own time before a world event.

## 4. Strata, not a curve

Replace the continuous curve with discrete bands with powers of two:

| Stratum | Rate | Meaning for the player |
| --- | --- | --- |
| Sky (towers, later) | x2, x4 | Fast. Batches finish quickly. Decay is fast too. Late-game workshop before a deadline. |
| Surface | x1 | Reference clock. The base clock. |
| I | x1/2 | 1 minute here is 2 surface minutes. |
| II | x1/4 | |
| III | x1/8 | |
| IV | x1/16 | |
| Horizon | tends to 0 | Time nearly stops. The end of the map. |

Each band has its own tint and a clock label at the boundary. Powers of two keep every ratio mental-math friendly. Each band also gets harder rock, one new ore, and one upgrade the player feels in a single trip (the digger-genre pacing rule from section 10).

## 5. Five places the dilation bites

Each of these is a crossing and each creates a placement or routing decision.

1. The player crosses. A 3 minute dive at x1/8 is 24 surface minutes. The refinery you queued before the dive has run 24 minutes. The storm forecast for "in 10 minutes" has already passed. Decision: how deep, for how long, and what to queue first.
2. Items cross. A drill at III makes 1 ore per local second, which is 1 ore per 8 surface seconds. A surface smelter that eats 1 ore per second needs 8 such drills, or it idles 7/8 of the time. Put the smelter next to the drills and it is 1:1, but then its ingots trickle up at 1 per 8 surface seconds. Throughput in surface terms is pinned by the deep stage. Placement higher means fewer machines for the same output. Decision: lift raw ore (hoist load, many drills per smelter) or smelt deep (more machines deep, less hoist load).
3. Power crosses. A generator is energy per second. A surface generator at x1 feeds 8 consumers at III, because each consumer burns its energy in its own slow seconds. A generator placed at III gives 1/8 of its nameplate to the surface. Decision: fuel to energy belongs high. Batteries belong deep, where they leak slowly. A machine in a fast band also consumes faster, the same way Mindustry's overdrive scales consumption with speed.
4. Decay crosses. Anything that gets worse per local second (an unstable ore, heat in a reactor, a creature nest, a fire) advances slowly deep and fast high. A volatile deep ore is stable where it lies and decays once lifted. Decision: process it deep and accept the machine count, or lift it and race the decay with a short fast chain.
5. World events run in surface time. Day and night, storms, a supply ship, the collapse countdown. Deep work spends them fast. Decision: the dive length is a bet against the next event.

Forces that pull things deep: ore is deep, decay is slow deep, the surface is exposed to weather and raids that pass in surface time while you are away. Forces that pull things high: batches, generators, anything you want finished by the time you surface. The hoist shaft between them has a capacity. That tension is the game.

## 6. The smallest building set where placement matters

| Building | Wants to be | Why | What fights it |
| --- | --- | --- | --- |
| Drill | Deep | Ore is deep. | Runs slow in surface terms. Needs power from above. |
| Refinery / Smelter | High | Fast batches, fewer machines. | Inputs arrive slowly from below. Volatile ore decays on the way up. |
| Generator (fuel to energy) | High | Full nameplate in surface terms. | Fuel comes from the refinery, so it sits in the same fast band. Exposed to surface events. |
| Battery / Vault | Deep | Slow leak, slow spoil, sheltered. | Far from where power and items are used. |
| Hoist | Spans bands | The only bridge. Carries items and the player. | Fixed items per surface second. Slow in the slow bands. |

Two resources: coal (stable, fuel feedstock) and one volatile ore (decays per local second, needed for the win condition). The player's own fuel or oxygen is the return trigger, measured in their own seconds.

The hoist carrying the player is deliberate. The return trip is the top complaint in every digger reviewed in section 10, and the games that fixed it (SteamWorld Dig 2 warp tunnels, Super Motherload underground bases) kept players. A built shaft is our warp tunnel.

## 7. Three game shapes

| Shape | Loop | Dilation does | Scope | Risk |
| --- | --- | --- | --- | --- |
| A. Expedition plus idle base | Queue the base, dive, surface to a return receipt, upgrade, dive deeper. | Depth is the time-skip dial. Placement limited to the base bands. | One month. Closest to the prototype. | Dilation reads as "wait less". Thin placement game. |
| B. Vertical factory | Dig, place drills, hoists, smelters, generators, vaults at any depth. Chains cross bands. | Every placement is a throughput, power, or decay decision. | One quarter or more. Logistics sim plus UI. | Legibility. Solo factory game is a lot. |
| C. Puzzle shafts | Handmade small grids. Deliver X items by surface time Y with given machines. | The whole puzzle. | A weekend per prototype. | Less "digger" feel. No emergent economy. |

Recommendation: A's loop with B's mechanics, built in stages. Start with A and the five buildings above. Add the hoist and the volatile ore when the expedition loop feels right. C is the fastest way to test whether the crossings are fun at all, and can be the Stage 0 harness.

Length targets from the genre: a run of 30 to 60 minutes, a whole game of 2 to 7 hours. A Game About Digging a Hole shipped in about 14 days of work, runs 75 minutes to 3 hours, and sold a million copies. Small is fine.

## 8. The pressure

- Hard version: the planet crosses the horizon in N surface days. Build and launch the escape beacon first. Its parts need ore from III and IV. Every deep minute burns the countdown. The countdown shows in surface days and in "your minutes at this depth".
- Soft version: no final deadline. Storms and raids on the surface in surface time, decay of volatile ore, and a slowly rising horizon that eats the lowest band.
- Suggested: soft pressures from the start, the hard countdown as a late unlock the player triggers ("start the final descent").
- Two costs, always: one to stay (your fuel, surface time burning) and one to leave (the trip, the ore left behind). Dome Keeper's developer said that without the wave timer mining choices would not matter. Without a surface clock that matters, dilation has no stakes either.
- Outer Wilds shows the fairness rule for a time budget: progress must persist and the budget must be visible.

## 9. Legibility toolkit

- Band tints and a clock label at every boundary. A hidden rate reads as a bug (TimeShift, Timelie, and a jam platformer in section 10 all lean on persistent tints or timelines).
- Two clocks on the HUD: You and Surface. The surface clock visibly spins when you are deep.
- Base ticker while deep: a one-line feed of what the surface did since you left.
- Return receipt on surfacing: "While you were away (26 surface min): refinery +31 fuel, vault lost 2 crystals, storm hit the east conveyor."
- Placement preview: "runs at 1/4 surface speed, 4 min per batch, feeds 2 surface smelters".
- Rates in the UI as fractions, never decimals.
- The player stays on the reference clock and keeps position and velocity across band boundaries (Quantum Conundrum's rule; its complaints came from tightly timed jumps inside slow zones, so no platforming that depends on the rate).

## 10. Prior art and lessons

Researched 2026-10-24. Items marked (U) rest on a single source or a search snippet.

### 10.1 Position or zone based time rates

| Game | Mechanic | Lesson for us | Link |
| --- | --- | --- | --- |
| Braid, World 4 | Time follows the player's horizontal position. | Drive the rate from one axis the player already controls, so they can predict the clock before they move. | [Wikipedia](https://en.wikipedia.org/wiki/Braid_(video_game)) |
| Temporal Engineer (48 h jam) | Near a black hole your time slows, so outside enemies seem faster. Stay or leave for score and fuel. | Closest analog. The cost lands on the other clock. Supports deep = slow. | [itch.io](https://joshpattman.itch.io/temporal-engineer) |
| Quantum Conundrum | A slow dimension runs objects 10x slower, the player stays normal, position and velocity carry over. | Keep the player on the reference clock. Timed jumps inside slow zones drew complaints. | [Wikipedia](https://en.wikipedia.org/wiki/Quantum_Conundrum) |
| Mindustry overdrive projector | Area boost 1.5x (2.5x dome), overlaps take the max, consumption scales with the boost, power upkeep. | Bounded ratios, no stacking, faster also means hungrier. | [Source](https://github.com/Anuken/Mindustry/blob/master/core/src/mindustry/world/blocks/defense/OverdriveProjector.java) |
| Factorio beacons | 9x9 speed area, diminishing with count, always draws power, poor for machines that rarely run. | A speed zone is a siting choice only when it has upkeep or limits. | [Wiki](https://wiki.factorio.com/Beacon) |
| Ultima-style dungeons (dev blog) | Time 100x slower on zoomed maps broke poison and buff durations. | Every duration has one named clock. | [Ultima Codex](https://ultimacodex.com/2013/03/the-dark-unknown-time-dilation-and-spell-durations/) |
| EVE Online TiDi | Server slows the clock under load; reinforcement timers are exempt so players cannot game them. | Decide on purpose which timers the player may game. Ours: the countdown runs in surface time; the sky band is a legitimate way to buy your own time. | [CCP article](https://www.eveonline.com/article/introducing-time-dilation-tidi) |
| Stardew Valley, Skull Cavern | The day clock runs about 25% slower there (U). | The only shipped depth-time precedent found. | [Wiki](https://stardewvalleywiki.com/Skull_cavern) |
| Interstellar, Miller's planet | Hours for the crew, 23 years outside. | The return receipt is the emotional beat. | [Wikipedia](https://en.wikipedia.org/wiki/Interstellar_(film)) |
| Outer Wilds | A 22 minute budget; only the ship log persists. Complaints: no direction, unfair deaths. | A time budget is fair when progress persists and the budget is visible. | [Game Developer](https://www.gamedeveloper.com/design/road-to-the-igf-alex-beachum-s-i-outer-wilds-i-) |
| TimeShift, Timelie, Chrono-Logical | Rate shown by a persistent tint or a scrubbable timeline. A jam game's unmarked speed zones were called not obvious (U). | Always show the rate. | [TimeShift](https://en.wikipedia.org/wiki/TimeShift_(video_game)), [Chrono-Logical](https://pineappleblue.itch.io/chrono-logical) |
| Singularity (2010) | Age or de-age objects. IGN: a neat idea handcuffed to an ordinary shooter. | A time mechanic bolted onto a standard loop reads as a gimmick. The loop itself must need it. | [Wikipedia](https://en.wikipedia.org/wiki/Singularity_(video_game)) |

Gap: no factory or colony game with per-zone simulation speed was found. Factorio has one unanswered forum idea. Gravitational dilation as a core mechanic exists only in jam games. The idea is open ground.

### 10.2 Digger core loops

| Game | Loop and forcing function | Lesson | Link |
| --- | --- | --- | --- |
| Motherload / Super Motherload | Dig, haul, sell, refuel, upgrade. Fuel, cargo, hull. | Upgrades are "the best part", the middle is grind. Underground bases soften the trip. | [Game Informer](https://gameinformer.com/games/super_motherload/b/playstation4/archive/2013/11/22/digging-deep-shallow-play) |
| SteamWorld Dig 1 and 2 | Dig, sell in town, buy upgrades. Light, bag, pickaxe compete for money. | First playtests: players dug straight down and never returned. Warp tunnels in part 2 fixed the trip. | [Game Developer](https://www.gamedeveloper.com/design/game-design-deep-dive-the-digging-mechanic-in-i-steamworld-dig-i-) |
| Dome Keeper | Mine between waves, defend the dome. Winning run 30 to 60 min. | Developer: without the timer, mining choices would not matter. | [Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-dome-keeper-focuses-on-systems-that-feed-into-one-another) |
| Wall World | Mine from a mobile base, haul when full, defend on alarm. | "Dig deeper or move on" is a real choice. Meta grind is the complaint. | [LadiesGamers](https://ladiesgamers.com/wall-world-review/) |
| A Game About Digging a Hole (2025) | Dig, sell, upgrade shovel, battery, bag. 75 min to 3 h. About 14 days of development, 1M copies. | Short is fine. Complaints: nothing to buy late, battery return annoying. | [Wikipedia](https://en.wikipedia.org/wiki/A_Game_About_Digging_a_Hole) |
| Mr. Mine, Idle Miner Tycoon | Idle. Coming back is a reward, not a cost. | The return receipt pattern already works in idle games. | [Mr. Mine](https://store.steampowered.com/app/1397920/Mr.Mine) |
| Techtonica | Underground factory. Weak forcing function. | Complaints: slow start, tedious excavation. Steam Mixed (U). | [Steam](https://store.steampowered.com/app/1457320/Techtonica/) |

Lessons:

1. Tension needs two costs: one to stay and one to leave.
2. Shrink the return trip as depth grows, or players quit.
3. Gate tiers by tool: harder rock, a new ore, an upgrade you feel in one trip.
4. Where players leave: the loop never changes, nothing to buy, slow start, unclear rules, meta grind.
5. Make the forcing function early and obvious, or players dig straight down and never return.

## 11. Tooling and assets

Checked 2026-10-24.

- Phaser 4.0.0 stable shipped 2026-04-10; npm latest is 4.2.1 (2026-07-09). The prototype pins 4.0.0-rc.5 (2025-08-22). If Phaser stays, use a `TilemapLayer` with `putTileAt` / `removeTileAt` and one collider against the layer. One sprite per tile in a static group is the wrong path. `TilemapGPULayer` is for maps that do not change. ([download page](https://phaser.io/download/stable), [tilemap skill](https://unpkg.com/phaser@4.2.1/skills/tilemaps/SKILL.md))
- Recommendation: PixiJS 8 (8.22.0, 2026-10-01) as a renderer only, with the simulation in plain TypeScript. Reason: the simulation must own time. Each band keeps its own tick accumulator, the player's clock drives the step, and a seeded RNG makes a run replayable. Pixi has no opinion on any of that and only reads state to draw. Phaser as renderer-only also works but carries scenes and Arcade physics that the design does not use. ([PixiJS](https://pixijs.com))
- Rejected for this: Excalibur 0.32 (pre-1.0, no stable release in 10 months), KAPLAY 4000 (alpha), LittleJS (fixed 60 Hz loop but one global timestep that the engine objects own). ([Excalibur releases](https://github.com/excaliburjs/Excalibur/releases), [KAPLAY releases](https://github.com/kaplayjs/kaplay/releases), [LittleJS](https://github.com/KilledByAPixel/LittleJS))
- Tiles: Kenney [Pixel Platformer](https://kenney.nl/assets/pixel-platformer), [Industrial Expansion](https://kenney.nl/assets/pixel-platformer-industrial-expansion), and [Blocks](https://kenney.nl/assets/pixel-platformer-blocks) (CC0, 18x18, one family). [Kenney Tiny Factory](https://kenney.nl/assets/tiny-factory) (CC0, 16x16, conveyors). [OpenGameArt Factory tileset](https://opengameart.org/content/factory-tileset) (CC0, conveyor, pipe). [JoyTree Caves and Mines](https://joytree-studios.itch.io/caves-and-mines-tileset-2d-asset-pack) (16x16, 12 ores with ingots; the page says CC0 and also "no redistribution", ask the author). [gtkampos Cave tileset](https://gtkampos.itch.io/cave-tileset) (CC0, small).
- No CC0 drill or extractor sprites were found. Plan to draw the five machines ourselves in the Kenney 18x18 style, or buy [Elthen's factory automation pack](https://elthen.itch.io/2d-pixel-art-factory-automation-pack) (paid, U).
- Fonts: [Kenney Fonts](https://kenney.nl/assets/kenney-fonts) (CC0), [Pixelify Sans](https://github.com/google/fonts/tree/main/ofl/pixelifysans), [Silkscreen](https://github.com/google/fonts/tree/main/ofl/silkscreen) (OFL).
- Sound: [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) (CC0), [ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT, procedural), [jsfxr](https://github.com/chr15m/jsfxr).

## 12. Build plan

- Stage 0, one evening: a headless simulation in TypeScript. Bands, rates, machines, items, a scripted dive. Print the return receipt. Tune rates until the numbers feel right. No renderer.
- Stage 1: expedition loop. Digging, fuel return trigger, bands with tints, refinery, generator, battery, return receipt. Movement rebuilt on a fixed timestep.
- Stage 2: hoist and the volatile ore. Placement starts to matter.
- Stage 3: soft pressures, upgrades, the countdown, art pass, sound.

## 13. Open questions

1. Deep = slow, as recommended, or keep deep = fast?
2. Does "Event Miner" mean event horizon? If yes, the fiction is set: a planet falling into a black hole.
3. Shape A first, or straight to B?
4. Hard countdown, soft pressures, or soft first with the countdown as a late unlock?
5. Scope: a weekend harness (C), a month (A), a quarter (B)?

## 14. Revisions after discussion (2026-10-24)

Positions above that changed after the first discussion:

- Continuous field, not bands. Section 4 is withdrawn. The time rate is a smooth function of depth so the player sees it change while flying or falling. The readable law replaces the band table: time halves every N metres (N is a tuning constant, around 20). A depth ruler marks each halving. The placement preview still shows the effective rate per building. The prototype's `1.1^depth` has the right shape and a far too steep base.
- Direction stays deep = slow, held as one sign parameter in the simulation. Deciding reason: the ore is where time is slow, so the player pays in surface time, and the return finds a changed base.
- The world may be a falling-sand cellular world (Noita, Sandustry) with coarse cells (4 to 8 px) instead of 48 px tiles. Reason: a continuous time field needs a body to be seen. Sand falls slower deeper, smoke speeds up as it rises, water creeps in the deep. The gradient is visible without a HUD. Gravity also gives free downward transport: crushed ore falls down a shaft into a hopper. Cost: an engineering spike. Mitigation: typed arrays, chunk dirty flags, rate applied as a per-row update probability, and a Rust to WASM kernel only if measured slow (Sandspiel shows that path stays in the browser).
- No conveyors. Logistics in three steps: the player hauls (Dome Keeper), then gravity down a shaft, then one vertical lift primitive with a throughput and no routing. Power and item pickup are radius based (poles, antennas, bots as in Nova Lands). No 2D belt routing.
- Frame: an Anno production chain laid out vertically. Height sets each node's speed, the vertical hop is the transport. A smelter placed where time runs twice as fast needs half as many smelters for the same drills.
- Stack: stay on the web until the gameplay exists. Steam is a packaging step later; Vampire Survivors shipped its Phaser build on Steam before the Unity port. Rust is not required for a sandbox; WASM covers it. The simulation is written headless in TypeScript so the renderer choice can wait.
- Revised Stage 0: a falling-sand vertical slice with a time gradient and a digger, no economy. Goal: see whether the visible gradient alone is compelling. Then hauling plus two buildings (the return receipt), then ratios.

Verified 2026-10-24: Sandustry (Lantto Games, Hooded Horse) entered Steam Early Access 2026-08-13 with conveyors, pumps, filters, drones and logic gates in a falling-sand world; one outlet reports about 12,500 peak concurrent players and 97% positive ([PCGamesN](https://www.pcgamesn.com/sandustry/steam-hooded-horse), [Game Developer](https://www.gamedeveloper.com/press-release/pixel-automation-game-sandustry-out-now-in-early-access)). Sandspiel is Rust via WASM in the browser, MIT ([write-up](https://maxbittker.com/making-sandspiel)). Vampire Survivors ran on Phaser until version 1.6 ([Phaser news](https://phaser.io/news/2024/02/vampire-survivors-space-54)). Nova Lands moves items between buildings with bots ([review](https://gameluster.com/?p=89769)).

## 15. Reference: Dev Ed's drill prototype, and building upward (2026-10-24)

Reference found: [Dev Ed's post of 2026-10-14](https://x.com/developedbyed/status/2110458510525735349), "a little digging game in C++ where every pixel is simulated", unreleased. The video shows:

- An orange drill vehicle. Digging is aimed with the mouse, free-form, no tile grid. Dust, a light cone, water pools, gold and blue ore pockets, caves with stalactites, a "Falling rock" warning.
- A depth meter in metres with named strata: Topsoil, Stone, then bit tiers named The aquifer, Shale, Deep rock.
- Runs. Fuel is a per-run timer (48 s base). Each run has goals: money targets, skulls, depth 3/10. "Daily, 1 try today". "Start deeper" to begin a run lower.
- Between runs: upgrades (drill bit 1.25x dig speed, fuel tank, radiator for cooling, armour, workshop) and a town tab with buildings (a trading post sells one-run boosts). Hull, cooling, earnings multiplier as stats.
- Underground stations with FUEL and PERKS at about 214 m.

What to take:

- The feel. A vehicle with a big bit in a fully simulated world sets the visual target. Cell size is our performance knob, the look is this.
- Metres and named strata. Our continuous law reads the same way: a depth ruler in metres, named layers, the time rate as one more line on the meter.
- The run structure maps onto the dive. A run is a dive measured in the diver's seconds. Between runs the surface has advanced by the dive's dilation integral. Between-run upgrades become the base. The underground fuel and perk stations become our deep buildings.

What not to take: coins as the whole economy. Our economy is the chain.

Building upward: yes. The field continues above the surface and saturates, because far from the mass time runs at its true rate. A tower is the fast workshop. Batches, growth, and research finish quickly there, and decay and surface events run faster there too. Relative to a tower, the surface countdown looks slow, so the tower is where the player goes to buy their own time before a deadline. A saturation cap near x4 keeps the speed bounded. The symmetry: dig down to store and to skip world time, build up to finish and to buy your own time.

## 16. Mechanics under the time field: inventory, interactions, balance (2026-10-24)

Graphics are parked. This section is the mechanics-only model.

### 16.1 Quantities

- `r(y)` is the rate at depth `y`. Surface `r = 1`. Below: `r(y) = 2^(-y/H)` down to a floor `r_min` at the horizon. Above: `r` rises and saturates at `r_max` (about 4).
- Every mechanic is a process with a duration in its own seconds at its own depth. Its speed in surface terms is multiplied by `r(y)`. Its speed as you see it from depth `p` is multiplied by `r(y) / r(p)`.
- Two budgets. Your seconds (fuel, oxygen, patience) and surface seconds (events, decay elsewhere, the countdown). Dilation is the exchange rate: one of your seconds at depth `p` costs `1 / r(p)` surface seconds.

### 16.2 Inventory

| Mechanic | Runs on | What depth does to it | Decision it creates |
| --- | --- | --- | --- |
| Digging, moving | Your clock | A trip to depth `y` costs the surface `∫ dy / (v · r(y))`, which grows exponentially with depth. | Dive depth and dive length. |
| Fuel, oxygen | Your clock | Caps dive length in your seconds, at any depth. | Which budget binds: fuel (shallow) or world time (deep). |
| Production | The machine's clock | Surface output `= q · r(y)`. Higher means fewer machines for the same output. | Where to put each stage. |
| Vertical transport | The cage's clock where it is | Round trip in surface time is the same exponential integral. Hoist throughput falls exponentially with depth. | Lift raw ore or compress first. |
| Power | Generator and consumer clocks | Grid balance in surface terms: `Σ P · r(y_gen) ≥ Σ D · r(y_use)`. | Generators high, consumers deep. |
| Decay, spoilage, leaks | The item's clock where it is | Surface half-life `h / r(y)`. In transit, decay depends on trip distance only, not on the field. | Where stock waits. Vaults deep. |
| Growth, research, incubation | The thing's clock | Same as decay with the sign flipped. Capped by `r_max`. | Put it high. |
| World events | Surface clock | Arrive at `1 / r(p)` per your second while you are at `p`. | Dive length is a bet against the next event. |
| Local threats (nests, cave-ins) | Their clock | Quiet from above, normal when you are there. | Deep danger is slow in surface terms, not in yours. |
| Build time | Your clock | The world moves `1 / r(p)` meanwhile. | Build high, drop down. Gravity is free downward transport. |

### 16.3 Interactions that decide balance

1. Dive value. `value = ore(p, d) + base production during the elapsed surface time − base damage during it − countdown spent`. Surface time is a cost only when something costs in surface time, and a benefit only when the base produces. With a producing base and no damage, deeper is always better. Damage and the countdown are the only brakes.
2. Safe dive length. `safe seconds at depth p = base survival time in surface seconds × r(p)`. Deeper means shorter safe dives in your seconds. So base resilience upgrades (shelter, storage, repair) unlock depth, not the drill. Fuel binds shallow, resilience binds deep. The binding constraint rotates with progress. That is progression without inflation.
3. Chain output. `output = min over stages of n_i · q_i · r(y_i)`. Extraction is deep and slow, so the whole economy is extraction bound and gets worse with depth. Richer ore deep only breaks even if richness grows exponentially, which is the incremental trap. Instead: each stratum holds an ore that exists only there and is required for the next tier. Depth is an unlock, not a multiplier.
4. Hoist against placement. Smelting deep compresses ore into fewer ingots before the lift and saves hoist capacity, at the price of more machines deep. Smelting high saves machines and loads the hoist. Because hoist throughput falls exponentially with depth, the right answer flips from "lift raw" (shallow) to "compress first" (deep). A decision whose answer changes with depth is a good decision.
5. Decay against storage. Deep vaults cost nothing in surface time and cost a trip plus hoist capacity to retrieve. Perishables left high rot fast relative to a deep player.
6. Build time against depth. Building deep spends surface time. Prefabs built high and dropped down avoid it.

### 16.4 Where it breaks, and the fixes

- The exponential field is an incremental cost curve. An unbounded field plus unbounded machine counts gives the incremental failure: nothing you buy makes a dent.
- Fixes: bound the field (floor at the horizon, cap in the sky); bound counts by space, power, and hoist capacity instead of money; make decisions placements and ratios, not quantities; make depth an unlock; rotate the binding constraint (fuel, then resilience, then hoist, then countdown); end the game.
- The test for the model: the optimal dive depth must move as upgrades land, and no single depth may dominate for the whole game. If value against depth has one peak that never moves, the balance is broken.

### 16.5 Stage 0 is headless

A parametric TypeScript model with no renderer. Inputs: the field law (`H`, `r_min`, `r_max`), base production, damage rate, countdown, fuel, and chain placements. Sweeps: dive depth against dive length, and drill, smelter, and hoist placement. Output: markdown tables of value against depth and of chain output against placement. One evening. The question it answers: does the optimal depth move.

## 17. Direction settled, the exponential feel, artifacts, and the test loop (2026-10-24)

### 17.1 The direction, stated once

The wished-for effects are all one direction: your watch runs slow when deep, the surface races. Then:

- Years pass up top while you dig. Interstellar.
- The base goes derelict if you stay down too long.
- Dome Keeper pressure grows with depth. Waves live on the surface clock. With a doubling every 25 m, a wave every 10 surface minutes arrives every 75 of your seconds at 75 m. Deep does not escape the waves, it compresses them.

The prototype displays this number ("Time: x2.59", surface speed relative to you) and applies it inverted: the refinery gets `delta / dilation`. The wished-for behaviour is `delta * dilation`. One operator. The README described the inverted version on purpose, so this is a change of intent, not a bug fix.

HUD convention from here: the displayed rate is the surface clock relative to you. It goes up with depth. "x8" means one of your minutes is eight surface minutes.

### 17.2 Keep the exponential, make it readable

The complaint about the prototype is right: with a doubling every 7 tiles the number crawls and then explodes. The fix is not a linear law. It is three things:

1. Slow doubling. One doubling every 25 m or so, tuned in the model. A 150 m world then spans x1 to x64.
2. Harder rock per doubling. Each layer costs more of your seconds per metre. Then each doubling takes similar effort, so the ladder feels steady in your hands while the surface clock compounds. The last stretch before the horizon costs decades up top. That is the "years pass" feeling, and it comes from hardness times rate, not from the rate alone.
3. Log-scale presentation. The depth ruler is marked in doublings, not metres. The HUD shows the exchange rate as a sentence: "1 min here = 2 h up there". People read magnitudes on a log scale anyway. A steady ladder of doublings reads as a steady pace, and the surface counter reads as drama.

Why not a linear law: the ratio between two machines would then depend on their absolute depths, and every placement rule in section 16 stops being a one-liner. With an exponential law, "move it up one doubling" halves its machine count anywhere in the world. The model can still sweep other laws to check this.

### 17.3 Artifacts and anchors: the late-game verb

A local rate modifier. An artifact or a built anchor multiplies the rate inside a radius, bounded and non-stacking (Mindustry's overdrive rule), with upkeep paid in the volatile ore. Two uses:

- Slow bubble around the player or a vault: the outside races past. A time skip on demand, or stasis for a stockpile.
- Fast bubble on the base: the base keeps producing at x4 while you dive, which raises the safe dive length (section 16.3, item 2).

This gives the game three acts with a changing verb, which is the answer to clicker-style late games where only the numbers grow: act one, read the field; act two, exploit it with placement; act three, rewrite it with anchors.

### 17.4 Deeper is harder

Rock hardness by layer (Dev Ed's bit tiers are the model: Topsoil, Stone, Aquifer, Shale, Deep rock), plus heat or pressure as a hull cost. Hardness multiplies the surface cost of depth, see 17.2. Deep ore is required, not merely richer (section 16.3, item 3).

### 17.5 The build-test loop

Text mode is the game. One deterministic simulation with a command line: dive to a depth for a duration, build a machine at a depth, surface, wait, read the return receipt. The renderer later draws the same state. This loop runs without a renderer:

1. I build one mechanic into text mode.
2. I run scripted policies through it (greedy diver, base-first, deep-first, balanced) and play it by hand.
3. I report metrics: no single depth dominates for the whole run; at least two policies finish within 10% of the best; a naive policy loses by a clear margin; surface time per dive grows geometrically; every return receipt can be explained in one sentence.
4. You play the text mode for ten minutes for feel, which the metrics cannot measure.
5. One mechanic per cycle. Tune, then the next mechanic.

Fun is not measurable. Its preconditions are: a decision whose best answer changes with state, outcomes close enough to feel tense, and numbers the player can explain.
