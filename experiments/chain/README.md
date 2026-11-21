# Chain

Open `/experiments/chain/`. A five-contract production puzzle about placing machines on different clocks. No avatar or engine.

Visit a depth with the ruler, slider, wheel, or up/down. Choose a tool with 1-6 and a bay with left/right; Enter builds. Click a distant bay to visit it, then click again to build. Delete, right click, or a 1.4-second hold removes. A shorter hold shows the inspector. Space pauses, R restarts, H opens help. A switches the next anchor between fast and slow. Touch buttons provide the same actions.

The dock wants ingots. Three ore become one ingot. The supplied lift counts toward the budget. Buildings can only be placed or removed within 6 m of the watch; travelling and construction spend surface time. Pausing freezes travel too. Removal returns building credit, but peak simultaneous buildings decide the budget star. Stored goods are scrapped.

Each generator comes with up to 240 coal from a finite 600-coal reserve. It burns fuel even when idle; removal recovers unused coal. Level 1 has shore power. Same-depth goods pass directly between bays. All other transport uses the fixed lift cars. Vaults catch overflow. Ore stabilizes when a smelting batch starts. Anchors have six local seconds of starter charge, then need ore; overlapping bubbles use the oldest active anchor and never stack. The observer's watch always follows the natural field.

The default exponential field doubles every 20 m. `?law=linear`, `?law=step`, and `?double=30` work through the shared core. Star targets are tuned for the default field.

Run `node scripts/sim-chain.ts` for reference and naive policies, the complete smelter-depth sweep, and deterministic mechanics checks. Reference layouts live in `src/experiments/chain/levels.ts`; both scripted and manual play use the same commands, travel, construction, clocks and item simulation. The reference watch is 60 m in contracts 1-2 and 80 m in contracts 3-5. Deeper watching can finish a settled chain much sooner in real time.

The main tuning choices are a 1-second drill, 12-second furnace, 3:1 compression, 0.6-power generator with a 90 m radius, two slow cars from contract 3, eight local seconds of volatile life, and a 22 m anchor radius. These make high smelting efficient first, then make transport and decay pull it deeper. The weakest part is the quiet stretch after a working layout is built; deeper watching skips that wait, but does not add another decision.
