# Beast Ascent — Implementation Plan

Spec: [CLAUDE.md](CLAUDE.md) (the game bible). This plan covers **Milestone 1 only**.

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
    heightfield.ts         forest terrain height function
  animals/
    AnimalModel.ts         interface gameplay code talks to (glTF can replace it later)
    ProceduralQuadruped.ts parametric rig + procedural animation
    toon.ts                toon materials, rim light, faceted shading helper
  world/
    terrain.ts             terrain mesh from the height function
    forest.ts              instanced trees/rocks/grass, pond, den, arena, gate, world queries
    sky.ts                 sky dome, clouds, lights, fog
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
  unit/*.test.ts           26 logic and data tests (node --test, no extra dependency)
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
- Death penalty: lose 25% of the XP progress toward the next level.
- `@types/three` (type definitions only) was added as a dev dependency.
- Evolving is done from the Tab menu (no extra key).
- Polar bear has two active abilities (Heavy Swipe, Ice Slam) and two passives, exactly as listed in the bible.
- Alpha stage is data-defined but locked in M1 (marked TODO for M2).

## Milestone 1 task list

Status on 2026-11-13: all tasks built and verified (26 unit tests, 74 browser checks, production build). Waiting for the user's playtest.

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

## Review focus (things the tests must not miss)

- Pointer lock refused or lost (Esc) must pause cleanly, never throw.
- localStorage unavailable or holding a corrupt/old save must fall back to a new game.
- Dying during the boss fight resets the boss and never removes a level or life stage.
- Evolving while buffs or biome modifiers are active keeps health ratio and stats consistent.
- A low frame rate (large `dt`) must not let actors tunnel through the boundary or fall through terrain.
