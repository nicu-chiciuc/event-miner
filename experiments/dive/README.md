# Dive

One vehicle and deterministic tile simulation, with two surface economies.

- `/experiments/dive/?mode=waves`: supply the generator, survive the waves, build an Anchor, and return a Heart from the bottom.
- `/experiments/dive/?mode=years`: supply the colony, queue research, dive to advance its calendar, and return after the Beacon is complete.
- No mode selects Waves. `law=exp|linear|step`, `double`, `cap`, and `sky` pass through the shared field parser.

Arrows or A/S/D move and drill sideways or down. Up, W, or Space fires the thruster. E opens the workshop. Number keys match its buttons. H opens help. R restarts the same seed. Touch buttons send the same commands. The surface service deck parks, unloads, and refuels the vehicle. A rescue loses cargo and costs two coal.

The receipt and help pause the simulation. The workshop does not. Fuel burns on the player's clock only while an engine, drill, or thruster works. Research and waves use their surface or Anchor clock. The renderer never changes simulation state directly.

## Tuning

Tiles are 2 m, with 32 columns. Cutting a matching tier takes 3.2 player seconds; hardness and drill power increase by 1.65 per band. The 72-unit starting tank grows by 48 per upgrade. The hold starts at 10 items and grows by 7. Gravity is 18 tiles/s², upward speed caps at 4.8 tiles/s, and thrust ramps over about 0.14 seconds.

Waves arrive every 90 base seconds, with strength `13 + 0.65 * wave`. Coal yields 32 energy, starting generation is 0.24 energy/base second, and the Anchor divides the entire base clock by four. It consumes one penultimate-layer ore every 720 base seconds. Lower coal yield made supply trips necessary in the middle; the balanced run reaches the end with an empty coal store. Drill upgrades cost 12 previous-layer ore in Waves.

Years uses 60 calendar seconds per surface second. Research for drill tier `n + 2` takes `18 * 2^n` surface seconds and four ore of layer `n`. Coal consumption is 0.00008 units/person/calendar day. Early projects take minutes or hours; late projects take months and years. The Beacon needs six bottom-band ore and four calendar years. These timings keep the 17-band world within a first-run session.

The requested Years benchmarks cannot all hold with the specified exponential field: one surface minute represents one calendar hour, so at 50 m it represents 32 hours, while at 170 m it represents about 15 years. The field is preserved exactly. The raw clock exchange and the calendar scale are both labeled in the HUD.

## Verification and limits

Run `node scripts/sim-dive.ts` for the real 60 Hz input policies and checks. [metrics.md](metrics.md) records the final run, including every balanced dive. The policies can inspect ore and empty passages, but they only affect the sim through movement, thrust, drill, purchase, and dismiss commands. Balanced prioritizes equipment and supply reserves. Greedy aims two bands beyond its drill and returns with almost no fuel. Shallow stays in the top band. Route planning has perfect map knowledge, so human timings can be slower.

The checks cover both timing targets, failing or stalled naive policies, increasing dive depth, surface-time growth, deterministic replay, exact clock integration, idle fuel, docking, and the three field laws. Browser checks cover keyboard drilling and return, touch drilling and return, receipts, and the workshop at 1280 x 800 and 390 x 844.

The weakest loop is Years' repeated drill research. Its calendar payoff is strong, but there are many short trips before the first full year. The metrics establish pacing and failure paths, not whether those trips stay fun.
