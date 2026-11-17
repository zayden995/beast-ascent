# Beast Ascent — Implementation Plan

Spec: [CLAUDE.md](CLAUDE.md) (the game bible). This plan covers **Milestone 1** and **Milestone 2** (both done and accepted) and the task list for **Milestone 3** (in progress, at the end of this file).

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
    layout.ts              the shape of a biome's map as data (BiomeLayout: terrain, ponds, rivers, hill, gates ...)
    math.ts                clamp/lerp/angles, seeded RNG, value noise
    events.ts              tiny typed event bus
  data/                    pure data, no three.js imports
    tuning.ts              global and player tunables (stamina costs, dodge, camera ...)
    stages.ts              life stages, XP curve, growth requirements
    species.ts             all 7 species and their variants (ONE file, as the bible requires)
    abilities.ts           ability definitions (effect kind + numbers)
    biomes.ts              4 biomes (Forest and Jungle built, Plains and Winter palette stubs), the Forest's layout and spawn zones, the registry of built biomes
    jungle.ts              the Jungle's layout and spawn zones
    enemies.ts             wild animals of the Forest and the Jungle
    bosses.ts              the Forest's and the Jungle's boss
    food.ts                food types and diet rules
  logic/                   pure functions, unit-tested with node --test
    stats.ts               final stats = base x stage x level x biome/ability modifiers
    progression.ts         XP/levels, ability points, growth meter, evolve rules, death penalty
    damage.ts              damage and defense formula
    biome.ts               which buff/nerf is active for a species in a biome
    saveData.ts            validates and clamps whatever comes out of storage
    saveSlots.ts           the four save slots, moving the old single save into a slot, the two lines a slot card shows
    admin.ts               rules for the admin sandbox: stage, level, points, ranks, growth and wound edits that stay consistent
    growthText.ts          the words on the growth meter, including "Fully fed, level 8 needed (340/525 XP)"
    vision.ts              night vision: how much an animal sees as it gets dark, and the level-tag range
    dayNight.ts            time of day -> sun height, daylight, twilight, phase name
    heightfield.ts         any biome's terrain height from its layout (rolls, bumps, ponds, river channels, a hill with a cliff)
    river.ts               rivers: the smoothed course, "in the river", the current, drinking spots on the bank
    water.ts               ponds and rivers together: the water surface at a point, "near water", where to drink
    waterfall.ts           where a layout's waterfall leaves the cliff and where it lands
    cave.ts                the Jungle's cave: its ring of boulders and mouth, its roof, where the bait lies
    climb.ts               cliffs: ground too steep to walk up, sliding along its foot, sliding down a cliff face
  animals/
    AnimalModel.ts         interface gameplay code talks to (glTF can replace it later)
    ProceduralQuadruped.ts parametric rig + procedural animation
    ProceduralSnake.ts     the legless rig: a snake that slithers, rears back, strikes and rolls over when it dies
    toon.ts                toon materials, rim light, faceted shading helper
  world/
    terrain.ts             terrain mesh from the height function
    world.ts               BiomeWorld: one biome built from its layout (instanced trees/rocks/grass, ponds, rivers, waterfall, den, arena, gates), and the world queries
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
    save.ts                localStorage wrapper (reads the four slots, saves into the animal's slot)
    gameEvents.ts          event types shared by systems and UI
  ui/
    hud.ts                 HUD
    worldLabels.ts         enemy level tags, damage numbers
    menus.ts               title screen, save slot screen, pause menu
    speciesSelect.ts       species select + 3D turntable
    growthMenu.ts          Tab menu
    adminPanel.ts          the admin panel (J in an admin sandbox game, with ?admin)
    icons.ts, dom.ts       inline SVG icons, DOM helpers
  game/
    App.ts                 renderer, world, screen flow: title -> species select -> game
    Game.ts                one play session: owns the systems and the update loop
    debug.ts               test hooks (dev / ?debug only)
tests/
  unit/*.test.ts           172 logic and data tests (node --test, no extra dependency)
  e2e/smoke.mjs            Playwright: plays the core loop for each species and reviews the Jungle, checks console, screenshots
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
9. **Saving**: four save slots (one animal each), one versioned localStorage key per slot, every call in try/catch, autosave on progress events. The slot rules are pure logic (`saveSlots.ts`) so they can be unit-tested.

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

Scope: the full Alpha stage and the four remaining species (Tiger, Elephant, Crocodile, Eagle with flight). Agreed with the user on 2026-11-14 (all six steps are now built); the reasons and the choices made are in the bible's Decisions Log. Built one step at a time, tests first for the rules, each step verified (unit tests, typecheck, browser test) before the next.

- [x] **1. Alpha, death rule, den ring, rival limit.** Alpha playable (`maxPlayableStage = 'alpha'`). Death: first death keeps the stage and drops to its first level (wounded); a second death before gaining a level drops a stage; a level heals the wound (`applyDeath`, `deathText`, `progress.wounded` in the save). Den ring 12 m. Rival limit 5. Checks: 41 unit tests, 117 browser checks, typecheck.
- [x] **2. Tiger.** Done. Stripes on the rig (`stripes` feature), Ambush Strike (`behindBonus`, `isBehind`), Rend, Double Claw, Stalk (`whileUnseen`, `playerIsUnseen`), per-species unlock (`unfinished` flag, `currentMilestone` 2). Added at the user's request: wild animals now see best ahead and worst behind (`noticeMultiplier`, `TUNING.enemies.senses`), so a hunter can sneak up on an animal with its back turned, and a deer that faces a hunter bolts from about 15 m. Checks: 49 unit tests, 136 browser checks (front and back strikes, Stalk on and off, bleed, two-hit claw, a deer hunt, four rivals, sneaking up on a deer and a boar), typecheck, build.
- [x] **3. Elephant.** Done. `trunk` on the rig, Charge (a new `charge` effect, a ground dash that hits each animal once and ploughs through them), Stomp, Trunk Whip, Thick Skin; plants as food (30 in the Forest, 4 inside the den refuge, growing back); walk 4.7 and sprint 8.0 so that prey stays catchable; the eat prompt says "An elephant".
- [x] **4. Crocodile.** Done. `jaw`, `sprawl` and a `heavy` tail on the rig; Death Roll (`grab`, and the body rolls), Lunge, a full-circle Tail Sweep, Water Ambush (+35% damage in water, `Actor.wet`); Crocodile and Alligator skins.
- [x] **5. Eagle with flight.** Done. `ProceduralBird` behind `AnimalModel`; flight in `integrate` and the player controller (hold Space, `TUNING.flight`, `src/logic/flight.ts`); colliders with a height; the vertical-reach rule (`withinVerticalReach`) so that fights stay fair; animals notice a flier only below 5 m; Dive Strike (+4% per metre), Talon Grab, Gust, Eagle Eye (tags to 90 m).
- [x] **6. Wrap-up.** Done. A tiger, an elephant and a crocodile on the title screen; the bible and this file updated; 60 unit tests, 175 browser checks (run several times in a row, with the flaky ones fixed), typecheck and build. All of M2 is committed (`67cbf62`, `fc3c90e`, `ea93f66`). Pushed.

Review focus for M2: every species can catch the prey (unit test plus the hunt bot), a save from Milestone 1 still loads, the death rule at every stage, and no console errors.

---

# Save slots (asked for by the user after M2)

Title screen with **New Game** and **Continue Game**, both opening four save slots, one animal per slot (the user's wording: "something similar to LEGO games"). Agreed with the user on 2026-11-14 before building; the decisions are in the bible's Decisions Log.

- [x] **Rules first (unit-tested):** `src/logic/saveSlots.ts`: four slots with their own keys, reading and writing one slot without touching the others, a damaged slot reads as empty, the old single save moves into the first empty slot (and is kept if the copy fails), the two lines a slot card shows. 17 unit tests.
- [x] **Wiring:** `src/systems/save.ts` (slots, migration on start), `Game` takes its slot and saves into it, `App` flow title -> slots -> species select -> game (`showSlots`, `showSelect(slot)`, `startGame(profile, slot)`), `createTitleScreen` and `createSlotScreen` in `src/ui/menus.ts`, styles in `src/style.css`.
- [x] **Checks:** 77 unit tests, typecheck, 185 browser checks (13 slot checks, which replace 3 old title checks: both buttons, four empty slots, the saved animal in its slot, the replace question and "Keep it", backing out erases nothing, a second animal in slot 2 leaves slot 1 alone, progress goes to its own slot, a damaged slot, the old save moving into slot 1). Screenshots looked at: title, new game, replace question, continue, phone width.
- [x] **Committed** as `bbc365f`. Pushed.
- [ ] **Waiting for the user:** a look at the slot screens in a real browser.
- Not built, on purpose: a Delete button, play time or last-played date on the cards, anything that syncs saves between browsers.

---

# M2 review feedback (plan agreed 2026-11-15)

The user reviewed M2 and sent feedback in pieces (12 items: admin function, bald eagle, crocodile speeds, water bodies and the fish and animals that use them, prey stamina, more Elephant food and fox food reserves, the growth meter hint). The list, what the data says about each item, and the agreed plan are in the bible, section 16, "Feedback from the user's review of M2". One item is parked for after M5: different animals start in different biomes. Each step below gets tests first, a full browser run and screenshots, and its own commit that the user approves.

- [x] **1. Admin sandbox.** Built. `?admin` adds a sandbox button to the title; J opens the panel; the sandbox belongs to no save slot and saves nothing. Rules in `src/logic/admin.ts` (10 unit tests), panel in `src/ui/adminPanel.ts`, `Game.slot` is `number | null`. Found by testing and fixed: the pointer lock requested after a switch of animal made the panel unclickable. Checks: 87 unit tests, 206 browser checks (22 new), typecheck, build. Committed as `a469fe6`; pushed.
- [x] **2. Animal balance.** Built. Elephant 4.2 / 7.2; Crocodile 4.4 / 7.4 on land and 7.9 m/s swimming (`swimSpeedMult`, `swimSpeedFactor`); tiring prey (winded 45% of sprint) with the new rule "a tired animal is at least 15% slower than the slowest walker" and the hunt test; the two rivals' sprint lowered to 7.0 so that a fight can still be escaped; Bald Eagle (white head and tail, health 50, reach 2.0 m, Talon Grab 2.2 m, Winter buff) that can eat only from 2.5 m or lower; the HUD hint when the growth meter is full (`meterLabel`, option D, numbers unchanged); and the Bald Eagle's limited vision at night (tags and Eagle Eye reach half as far, the fog closes in to 60%, fading with dusk and dawn: `vision.ts`, `Sky.setVisibility`, `TUNING.labels`). New logic: `vision.ts`, `growthText.ts`, `swimSpeedFactor`, `withinEatingHeight`, `xpForLevel`, `totalXp`. Checks: 107 unit tests, 219 browser checks (run twice), typecheck, build. Committed as `52c8456`; pushed.
- [x] **2b. Eagle pace on foot (asked for after step 2).** Built. On foot the Eagle walks at about 4.2 m/s and sprints at 6.0 (`groundWalkMult` 0.65, `groundSprintMult` 0.5; `groundWalkSpeed`, `groundSprintSpeed`); flying is still 6.5 and 12. On foot it cannot outrun a rival, so it escapes by flying, and it can no longer reliably run down a deer on foot (3 of 6 in 120 s), so it hunts by flying low over its prey (6 of 6 in 7 to 9 s; the browser test hunts that way). Checks: 111 unit tests, 222 browser checks. Committed as `069ac22`; pushed.
- [x] **3. Water.** Built. 3a: the pond is a list of four water bodies (the old one plus radius 11, 9 and 7), fish in each, the trees moved with the new layout (`src/logic/water.ts`, `FOREST_LAYOUT.waters`). 3b: fish that swim away from a wading animal (`src/logic/fish.ts`, `TUNING.fish`), wild animals and title animals that walk to a pond and drink (`shoreStandPoint`, `TUNING.drink`, a head-down animation), and a title scene with animals on every shore and a camera that swings across the west and north-west shores (`src/logic/titleView.ts`). Checks: 130 unit tests, 231 browser checks. Committed as `bc230a2`; pushed.
- [x] **4. Food.** Built. Leaves (3 growth), fruit (8) and nuts (10) on trees for the Elephant and the Bear (`treeFood.ts`, `TREE_FOOD`, the new `leaf` and `nut` kinds); two fox food reserves with six kinds of fruit and vegetable (12 growth each), guarded by calm foxes that all attack when one is raided (`foxReserve.ts`, `EnemyActor.calm`, `guardOf`). Checks: 142 unit tests, 252 browser checks. Committed as `4f574a9`; pushed.
- [x] **5. Docs and final checks.** Done. The bible and this file are up to date; the final run is 142 unit tests, 252 browser checks (several runs in a row), typecheck and production build. Everything is committed and pushed (2026-11-15). Waiting for the user's review; the handover notes are in the bible, section 16.

---

# Milestone 3 task list

Scope: the Jungle, the Plains and Winter, with bosses, and the buffs and nerfs active across biomes. Agreed with the user on 2026-11-17: **one biome at a time**, each reviewed before the next, the groundwork and the Jungle first. The decisions and their reasons are in the bible's Decisions Log; how to add the next biome is in its "Notes for the rest of Milestone 3".

- [x] **1. Groundwork and the Jungle.** Built on 2026-11-17; waiting for the user's review; not committed yet.
  - One world class for every biome (`BiomeWorld`, `BiomeLayout`, `BIOME_LAYOUTS`, `createHeight`); the Forest checked to be exactly as it was (a fingerprint of its trees and terrain, identical before and after).
  - Rivers with a current (`river.ts`, `water.ts`), water at more than one height, cliffs (`climb.ts`), a waterfall (`waterfall.ts`).
  - Travel through the gates both ways, the biome saved with the animal, the title always the Forest, a Biome row in the admin panel.
  - The Jungle's map (`src/data/jungle.ts`): hill, cliff, spring, stream, waterfall, plunge pool, river with a ford, lagoon; canopy trees, palms with coconuts, vines, ferns, lily pads, mist.
  - Its animals (capybara, monkey, snake, tapir; rival tigers and crocodiles) and its boss (the Great Silverback, level 20, a gorilla).
  - Added after the first look: **snakes** (a third rig, `ProceduralSnake`), a **gorilla-shaped Silverback** (the `knuckle` and `brow` markings), and a **cave** deep in the trees east of the boss's arena (62 m from it, with a trail kept clear of trees leading to it) with four carcasses as bait and a calm nest of three Cave Snakes that all attack once the bait is eaten or one is hurt (`cave.ts`, `lair` zones, `CAVE_FOOD`). After the cave was added the full browser run was made four times: three passed all 310 checks, and one failed a single Forest check ("carnivore is told it cannot eat berries": a leafy plant had grown beside the berry bush and was the nearest food, a flake of the kind the bear's check had already been fixed for; the wolf's check now clears plants near the bush the same way, and the run after that passed all 310).
  - The camera moves in front of trunks and rocks (the Forest too).
  - Checks at the first review: 172 unit tests (30 new: rivers, climbing, the Jungle's map and animals), 301 browser checks (50 new or changed: the gates there and back, Continue Game in the Jungle, the current, the ford, the cliff, the ride over the waterfall, coconuts, drinking at the river, each animal's Jungle buff or nerf, a hunt, two fights, the Silverback, "Jungle Ruled", death in the Jungle), typecheck, production build. Screenshots looked at.
- [ ] **2. The Plains.** Design agreed with the user on 2026-11-18 (see the bible's Decisions Log, "M3, the Plains: design"). Built in this order, tests first for every new rule, each part asked about before it is committed:
  - [x] 2a. A player meets wild animals of their own species too (the filter in `Game.ts` goes; tests updated). Built 2026-11-18: the five rival checks in the browser test were changed first and failed (306 of 311), then the filter was removed. Not committed yet.
  - [x] 2b. Lake-bound animals (`waterBound`: an alligator stays in its lake and an 8 m strip of shore, attacks anyone in it, gives up when they leave, returns to the water). Built 2026-11-18: `src/logic/waterBound.ts` (4 unit tests, written first), `EnemyBehavior.waterBound` and three places in `src/systems/ai.ts`. The browser test switches the flag on for the Jungle's lagoon crocodile at run time (3 new checks; the two that should fail did, 313 of 315 passed, before the AI was changed). The Plains' alligator itself comes in 2e. Not committed yet.
  - [ ] 2c. Dens that wake when the player comes near (a trigger radius, all guards together); the layout allows two caves.
  - [ ] 2d. Boss summoning (packs of 3, a 6 s wait after all 3 are dead, the pack vanishes with the boss or when the player leaves or dies, summoned animals give no XP).
  - [ ] 2e. The Plains' data and look: layout (`src/data/plains.ts`), acacias and golden grass, two lakes with alligators, the lion's den (harder) and the hyena's den, antelope (hard to catch), buffalo, hyenas, rival Elephants and a lion, the Hyena Matriarch boss; a hyena rig look.
  - [ ] 2f. Docs, a clean test run, screenshots for the user. Not built here, on purpose: the pet (an egg, hatched after a den is beaten, into a baby liger from the lion's den or a baby hyena from the hyena's: its own step after the Plains), zebra, a title scene.
- [ ] **3. Winter.** Snow, pines, cold haze. Its animals (arctic hare, seal, arctic fox), rivals, boss (mammoth-like beast or ice-wolf alpha), and what happens when the last biome is ruled (the win condition). To discuss with the user first.
- [ ] **4. Wrap-up of M3.** The docs, a clean test run, and the user's acceptance.

Review focus for M3: the Forest must not change; a save from before M3 still loads (in the Forest); every place on a new map can be reached; an animal can always get out of the water; no console errors in any biome.
