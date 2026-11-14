# Beast Ascent — Implementation Plan

Spec: [CLAUDE.md](CLAUDE.md) (the game bible). This plan covers **Milestone 1** (done) and the task list for **Milestone 2** (in progress, at the end of this file).

**Goal:** a playable vertical slice — pick Wolf, Lion or Bear, roam the Forest, fight, level up, eat, evolve to Adult, beat the Forest boss — with no console errors.

**Stack:** Three.js + Vite + TypeScript, plain DOM/CSS for UI. Dev-only: `playwright` (browser tests), `@types/three` (types for three).

## Global constraints (from the bible)

- Runs with `npm install && npm run dev`; `npm run build` produces a static site (relative `base`, deployable to itch.io / GitHub Pages).
- No external art assets. Animals are procedural, built from primitives on a parametric quadruped rig.
- No dependencies beyond `three`, `vite`, `typescript`, `playwright` (+ `@types/three`).
- All content (species, abilities, enemies, bosses, biomes, stages, numbers) lives in `src/data`. Nothing is hard-coded in systems.
- Only M1 content is playable. Later-milestone species exist as data and show as "Coming soon".
- Every stub is marked `TODO` in code and in CLAUDE.md.

## File layout

```
index.html, package.json, tsconfig.json, vite.config.ts
src/
  main.ts                  entry point
  style.css                HUD and menu styles
  core/
    types.ts               shared data types (Stats, SpeciesDef, AbilityDef, EnemyDef ...)
    math.ts                clamp/lerp/angles, seeded RNG, value noise
    events.ts              tiny typed event bus
  data/                    pure data, no three.js imports
    tuning.ts              global and player tunables (stamina costs, dodge, camera ...)
    stages.ts              life stages, XP curve, growth requirements
    species.ts             all 7 species and their variants (ONE file, as the bible requires)
    abilities.ts           ability definitions (effect kind + numbers)
    biomes.ts              4 biomes (Forest complete, the rest palette stubs), forest layout, spawn zones
    enemies.ts             forest wild animals
    bosses.ts              forest boss
    food.ts                food types and diet rules
  logic/                   pure functions, unit-tested with node --test
    stats.ts               final stats = base x stage x level x biome/ability modifiers
    progression.ts         XP/levels, ability points, growth meter, evolve rules, death penalty
    damage.ts              damage and defense formula
    biome.ts               which buff/nerf is active for a species in a biome
    saveData.ts            validates and clamps whatever comes out of storage
    dayNight.ts            time of day -> sun height, daylight, twilight, phase name
    heightfield.ts         forest terrain height function
  animals/
    AnimalModel.ts         interface gameplay code talks to (glTF can replace it later)
    ProceduralQuadruped.ts parametric rig + procedural animation
    toon.ts                toon materials, rim light, faceted shading helper
  world/
    terrain.ts             terrain mesh from the height function
    forest.ts              instanced trees/rocks/grass, pond, den, arena, gate, world queries
    sky.ts                 sky dome, sun, moon, stars, clouds, lights, fog; the day and night cycle
    colliders.ts           static circle colliders in a grid
  systems/
    input.ts               keyboard, mouse, pointer lock
    camera.ts              third-person orbit camera
    actor.ts               Actor (player, enemies, boss) + movement integration
    player.ts              player controller
    combat.ts              hit detection, damage, bleeds
    abilities.ts           runs ability effects, cooldowns
    ai.ts                  enemy state machine
    spawner.ts             spawn zones, respawn, boss
    food.ts                carcasses, fish, berries
    ambient.ts             peaceful animals behind the title screen (scenery, not the enemy AI)
    growth.ts              profile + both growth tracks
    fx.ts                  slashes, shockwaves, attack warnings
    save.ts                localStorage wrapper
    gameEvents.ts          event types shared by systems and UI
  ui/
    hud.ts                 HUD
    worldLabels.ts         enemy level tags, damage numbers
    menus.ts               title screen, pause menu
    speciesSelect.ts       species select + 3D turntable
    growthMenu.ts          Tab menu
    icons.ts, dom.ts       inline SVG icons, DOM helpers
  game/
    App.ts                 renderer, world, screen flow: title -> species select -> game
    Game.ts                one play session: owns the systems and the update loop
    debug.ts               test hooks (dev / ?debug only)
tests/
  unit/*.test.ts           32 logic and data tests (node --test, no extra dependency)
  e2e/smoke.mjs            Playwright: plays the core loop for each species, checks console, screenshots
```

## Key decisions

1. **Pure logic is separate from rendering.** Stats, XP, growth, damage and biome modifiers are pure functions over data, so they are unit-tested without a browser.
2. **One `Actor` type** for player, wild animals and the boss (position, stats, health, statuses, model). Combat and abilities work on Actors, so enemies and the boss reuse everything.
3. **One enemy AI state machine** (idle, wander, chase, attack, flee, return) driven by behaviour data. The boss is an enemy definition with extra attacks and an arena leash, not separate code.
4. **Abilities are data**: each has an effect kind (`leap`, `melee`, `aoe`, `buff`, `passive`) plus numbers and up to 3 ranks. Key 1 is the free signature ability; the others cost ability points.
5. **`AnimalModel` interface** hides the procedural rig. Stage changes rebuild the model from the species body plan (bigger, plus stage features such as mane or scars).
6. **World collision is simple**: terrain height function, circle colliders for trees/rocks, a circular world boundary. No physics library.
7. **UI is DOM over the canvas.** Enemy level tags and damage numbers are pooled DOM elements projected from 3D.
8. **Simulation can be stepped without rendering** through a debug hook, so the browser test is deterministic and fast even on a software GPU.
9. **Saving**: one versioned localStorage key, every call in try/catch, autosave on progress events.

Choices the bible leaves open (also recorded in its Decisions Log):

- Forest boss is the **Ancient Stag** (melee antler swing + telegraphed charge). Phases wait for M5.
- Forest enemies: **deer** (flees on sight), **boar** (fights back, charges), **fox** (small, fast, flees when hurt).
- Each player level adds a small stat bonus so that visible enemy levels are a fair comparison.
- Eating also heals a little; slow health regeneration out of combat.
- Death: a first death keeps the life stage and drops to its first level; a second death before gaining a level drops a stage; ruled biomes are kept. (First build: lose 25% of XP progress; then a full reset to a level 1 Juvenile; softened in M2 step 1, see the bible's Decisions Log.)
- The boss returns each time the player re-enters its biome; the biome stays ruled.
- Day and night cycle: 6 minutes per day, visual only (moved forward from M4 after the user's playtest).
- The boss pays its full XP once, then 50 XP per repeat win.
- The den is a safe refuge (ring of stones; 18 m at first, 12 m since M2 step 1): wild animals never enter and ignore a player inside.
- Rival predators (wild wolves, lion, bear) live at the edges of the Forest; the player's own species is left out.
- The title screen shows the forest's animals roaming by the pond.
- `@types/three` (type definitions only) was added as a dev dependency.
- Evolving is done from the Tab menu (no extra key).
- Polar bear has two active abilities (Heavy Swipe, Ice Slam) and two passives, exactly as listed in the bible.
- Alpha stage is data-defined but locked in M1 (marked TODO for M2).

## Milestone 1 task list

Status on 2026-11-14: M1 is DONE and accepted by the user. All tasks built, and the user's playtest points addressed (tasks 16 and 17). Verified with 32 unit tests, 101 browser checks and a production build. M2 is next; its plan is not written yet (discuss it with the user first, see CLAUDE.md "Notes for Milestone 2").

- [x] **1. Scaffold** — Vite + TS project, scripts (`dev`, `build`, `test`, `test:e2e`), `.gitignore`. Check: `npm run build` succeeds.
- [x] **2. Data + logic** — all data files, pure logic, unit tests written first. Check: `npm test` passes.
- [x] **3. World** — terrain, sky/fog/lights, instanced trees/rocks/grass, pond, den, arena, gate, boundary. Check: screenshot.
- [x] **4. Animal rig** — `AnimalModel` + procedural quadruped for wolf, lion, bear (2 variants), deer, boar, fox, stag; walk/run, idle, attack, hit flash, death.
- [x] **5. Player** — input, third-person orbit camera, walk/sprint/jump/dodge, stamina, swimming in the pond, collisions.
- [x] **6. Combat** — basic attack arcs, damage/defense, knockback, i-frames, statuses (stun, slow, bleed, buffs).
- [x] **7. Abilities** — effect handlers, cooldowns, ranks, passives; signature + 3 unlockables per playable species.
- [x] **8. Enemies** — AI state machine, 3 enemy types, spawn zones, respawn, carcass drops.
- [x] **9. Growth** — XP/levels/ability points, food (carcass, fish, berries by diet), growth meter, Juvenile -> Adult evolution, Alpha stub.
- [x] **10. HUD** — health, stamina, XP/level, growth, ability icons with cooldowns, biome + modifier, prompts, damage numbers, level tags, boss bar.
- [x] **11. Boss + gate** — Ancient Stag in the arena, "Forest Ruled" banner, gate opens to the stubbed Jungle.
- [x] **12. Death + save** — respawn at den with penalty; save/load/continue.
- [x] **13. Menus** — title, species select with 3D turntable, pause, Tab growth/ability menu.
- [x] **14. Verification** — Playwright run of the whole loop for each species, zero console errors, screenshots reviewed, `npm run build` clean.
- [x] **15. Wrap-up** — update CLAUDE.md (Milestone Status, Decisions Log, Known Issues, notes for M2).
- [x] **16. Playtest feedback (2026-11-14)** — catchable prey, boss returns on re-entry, day and night cycle, death resets the animal, animals on the title screen. Details in the CLAUDE.md Decisions Log.
- [x] **17. Second round of feedback (2026-11-14)** — repeat boss wins pay 50 XP, den refuge, 6 minute day, rival predators.

## Review focus (things the tests must not miss)

- Pointer lock refused or lost (Esc) must pause cleanly, never throw.
- localStorage unavailable or holding a corrupt/old save must fall back to a new game.
- Dying during the boss fight resets the boss. Dying anywhere resets the animal to a level 1 Juvenile, saves at once, and never removes a ruled biome.
- Prey must stay catchable by the slowest playable species (unit test on the data, hunt checks in the browser test).
- Evolving while buffs or biome modifiers are active keeps health ratio and stats consistent.
- A low frame rate (large `dt`) must not let actors tunnel through the boundary or fall through terrain.

---

# Milestone 2 task list

Scope: the full Alpha stage and the four remaining species (Tiger, Elephant, Crocodile, Eagle with flight). Agreed with the user on 2026-11-14; the reasons and the choices made are in the bible's Decisions Log. Built one step at a time, tests first for the rules, each step verified (unit tests, typecheck, browser test) before the next.

- [x] **1. Alpha, death rule, den ring, rival limit.** Alpha playable (`maxPlayableStage = 'alpha'`). Death: first death keeps the stage and drops to its first level (wounded); a second death before gaining a level drops a stage; a level heals the wound (`applyDeath`, `deathText`, `progress.wounded` in the save). Den ring 12 m. Rival limit 5. Checks: 41 unit tests, 117 browser checks, typecheck.
- [ ] **2. Tiger.** Stripes on the rig (`FeatureId`), Ambush Strike (a hit-from-behind bonus is a new `AbilityEffect` field), Rend, Stalk, Double Claw; replace the placeholder numbers. Unlock Tiger alone (see "Notes for Milestone 2" in the bible). Hunt check against deer and foxes.
- [ ] **3. Elephant.** Trunk and tusks on the rig, Charge, Stomp, Trunk Whip, Thick Skin; plants as food (herbivore diet needs a food source in the Forest); the slowest species, so check it can still catch fleeing prey.
- [ ] **4. Crocodile.** Long jaw and ridge on the rig, Death Roll (grab), Lunge, Tail Sweep, Water Ambush; the pond is its home (damage bonus near water).
- [ ] **5. Eagle with flight.** Winged rig behind `AnimalModel` (`createAnimalModel` chooses the rig), flight in `integrate` and the player controller (hold Space to climb, release to glide, stamina cost, ceiling about 25 m), height-aware colliders, charge-hit height check in `ai.ts`, Dive Strike, Talon Grab, Gust, Eagle Eye. Biggest piece, so last.
- [ ] **6. Wrap-up.** Title-screen cast with the new species, balance notes, bible and this file updated, final report.

Review focus for M2: every species can catch the prey (unit test plus the hunt bot), a save from Milestone 1 still loads, the death rule at every stage, and no console errors.
