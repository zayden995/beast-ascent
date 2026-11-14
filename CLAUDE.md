# BEAST ASCENT — GAME BIBLE (single source of truth)

> **Instructions for Claude Code (read this first, every session):**
> 1. Read this entire file at the start of every session, before writing or changing any code.
> 2. This file is the source of truth for the design. Do NOT invent mechanics, species, biomes, abilities or numbers that contradict it. If something is not specified here, make the simplest reasonable choice, record it in the "Decisions Log" at the bottom, and tell the user in your final report.
> 3. Build ONLY the milestone marked as CURRENT in "Milestone Status". Never build ahead. (Exception already made: at the user's request the day and night cycle was built in M1, ahead of M4.)
> 4. Never claim something works unless you ran it. Verify by running (see "Verification").
> 5. At the end of each session, update "Milestone Status", the "Decisions Log" and the "Known Issues / TODO" sections of this file.
> 6. Numbers marked *(tunable)* are starting values. Keep them in data files so they are easy to change.

(Tip for the user: you can save this file as `CLAUDE.md` in the project root so Claude Code loads it automatically, or keep the name `BEAST_ASCENT_GAME_BIBLE.md` and start every session with: "Read BEAST_ASCENT_GAME_BIBLE.md fully, then continue with the CURRENT milestone.")

---

## 1. Concept

Working title: **Beast Ascent**.

A browser-based **3D open-world** animal game. The player chooses an animal species, starts as a weak **Juvenile**, and grows into an apex **Alpha** by fighting other animals, earning XP and eating food. The world is divided into four biomes: **Forest, Jungle, Plains, Winter**. The player "rules" a biome by defeating that biome's boss. Ruling a biome unlocks the next one (the player may keep exploring any biome already reached). **Final goal: rule all four biomes.**

Theme: beast / animal inspired. Tone: **cartoonish but realistic-feeling** (believable animal proportions, stylized toon visuals, not goofy).

### Pillars
1. **Grow from weak to dominant**: the feeling of getting bigger, stronger and more feared.
2. **Species matter**: each species plays differently and is better or worse in different biomes.
3. **Explore and fight**: open-world roaming, wild animals, bosses.
4. **Readable and fair**: enemy levels are visible; the player always understands why they won or lost a fight.

---

## 2. Look and Feel

- Inspiration: **Genshin Impact** in structure and mood (third-person camera behind the character, bright stylized world, boss arenas, ability keys, stamina, dodge), NOT in scale. Small, focused version.
- Toon/flat shading, soft rim light or thin outlines, saturated palette, soft skybox, light fog.
- Animals: believable proportions, simplified shapes, expressive silhouettes.
- Each biome has a distinct palette and atmosphere:
  - Forest: green and brown, dappled light, tall trees, a pond.
  - Jungle: dense deep green, vines, humid haze, swamps/water.
  - Plains: golden grass, wide open sky, scattered acacia-style trees.
  - Winter: white and icy blue, snow, pine trees, cold haze.
- No external art assets in early milestones (see Technical Constraints).

---

## 3. Controls (keyboard + mouse only for now)

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Orbit camera (pointer lock) |
| Shift | Sprint (uses stamina) |
| Space | Jump (Eagle: hold to take off and climb, release to glide down; touching the ground lands it) |
| Q | Dodge roll (short invulnerability, uses stamina) |
| Left click | Basic attack |
| 1 / 2 / 3 | Abilities |
| E | Eat / interact |
| Tab | Growth and ability menu |
| Esc | Pause |

Touch / mobile controls: **not now**. Possibly later.

---

## 4. Core Systems

### 4.1 Stats
Every animal (player, enemies, bosses) uses: **Max Health, Stamina (and regen), Damage, Move Speed, Sprint Speed, Attack Speed, Defense, Size (scale)**. Base stats are defined per species and per life stage in data files.

### 4.2 Growth has TWO separate tracks

**Track 1: XP -> Abilities**
- Defeating animals gives XP. XP raises the player's **level**.
- Each level-up gives **ability points**.
- Ability points unlock or upgrade abilities from that species' ability list (Section 6).

**Track 2: Food -> Life Stage**
- The player eats **food** to fill a **growth meter**.
- Food sources depend on the species **diet**:
  - **Carnivore**: carcasses dropped by defeated animals, fish.
  - **Herbivore**: fruit, plants, bushes.
  - **Omnivore**: carcasses, fish, fruit, plants (the bear is an omnivore).
- Evolving to the next stage requires BOTH: the growth meter is full AND the player has reached the level requirement for that stage.
- When both are met, the player can press a key/prompt to **evolve**.
- Life stages: **Juvenile -> Adult -> Alpha**.
- Each stage increases size and base stats and visibly changes the model (bigger, extra features such as mane, horns/tusks, scars, markings).

Starting values *(tunable)*:

| Stage | Level required | Size scale | Stat multiplier (health/damage) |
|---|---|---|---|
| Juvenile | 1 | 0.6 | 1.0x |
| Adult | 8 | 1.0 | 1.8x |
| Alpha | 18 | 1.4 | 3.0x |

### 4.3 Combat
- Real-time combat.
- Health, stamina, hit detection (hitboxes/arcs), knockback, damage numbers, hit flash.
- Basic attack on left click. Abilities on 1/2/3 with cooldowns.
- Dodge roll with brief invulnerability.
- **Enemy AI states**: idle/wander, aggro, chase, attack, and **flee** (prey animals flee at low health or on sight). Fleeing animals sprint in short bursts, then tire, and slow down as they are wounded, so that every playable species can run them down.
- **Sight**: wild animals notice the player by sight. They see best straight ahead and worst straight behind: the full range inside a cone in front of them, only a quarter of it inside a cone straight behind, and a blend on the sides. Prey (the deer) also sees farther than its normal range when it faces a hunter, so it starts fleeing before the hunter is near. This lets a hunter, above all the Tiger, creep up on an animal that has its back turned. Bosses notice anyone in their arena and ignore this. (Added in M2 at the user's request.)
- **Flight and reach** (Eagle, M2): hitting across a big height gap is only possible between animals that are both on the ground. Once either one flies, a hit must be within the attacker's own height plus about 1.2 m, so a ground animal cannot hit a high eagle and an eagle has to swoop low (or dive) to attack. Wild animals notice a flier only below 5 m and give up a chase above 6 m, so an eagle circling high is left alone.
- Enemies have a **visible level** above them so danger is readable (color-coded relative to the player's level).
- Defeated animals drop **food** (carcass) and give XP.
- Death: the player respawns at a **den**, as the same species. **First death**: the animal keeps its life stage but falls to that stage's first level (Juvenile 1, Adult 8, Alpha 18), loses its XP progress, and is marked **wounded**. Bought abilities are refunded as ability points (one per level above 1). **A second death before gaining a level** drops it one whole stage (Alpha to Adult, Adult to Juvenile) and empties its growth meter; it stays wounded. **Gaining a level heals the wound.** Ruled and unlocked biomes are kept. (Changed at the user's request: first a small XP penalty, then a full reset to a level 1 Juvenile, and on 2026-11-14 in M2 this softer rule, because losing a hard-won Alpha felt too harsh.)

### 4.4 Biomes, buffs and nerfs
Each biome gives species-dependent **buffs or nerfs**. They are data-driven. Each species has favored and disfavored biomes, applying roughly **+/-15 to 25%** to one stat *(tunable)*. The HUD shows the active modifier.

| Species | Favored biome (buff) | Disfavored biome (nerf) |
|---|---|---|
| Lion | Plains: +20% damage | Winter: -20% speed |
| Tiger | Jungle: +20% damage | Plains: -15% stamina regen |
| Wolf | Forest: +20% speed | Jungle: -15% speed |
| Bear (brown) | Forest: +20% max health | Jungle: -20% stamina |
| Bear (polar) | Winter: +25% max health | Jungle: -20% stamina |
| Elephant | Jungle and Plains: +20% max health | Winter: -20% speed |
| Crocodile | Jungle: +25% damage near water | Winter: -30% speed |
| Eagle | Plains: +20% speed | Jungle: -20% speed (dense canopy) |

Species not listed as favored or disfavored in a biome get no modifier there.

### 4.5 Bosses and ruling a biome
- Each biome has **one boss**: a large unique animal fought in an **arena**.
- Defeating the boss = **that biome is ruled**. A "Biome Ruled" message appears and the gate to the next biome opens.
- The boss **returns every time the player leaves the biome and comes back** (like a domain boss). The biome stays ruled and its gate stays open; beating the boss again unlocks nothing new and pays only a small repeat XP (Forest: 300 XP the first time, 50 XP after that).
- Biome order: **Forest -> Jungle -> Plains -> Winter** *(tunable)*.
- The player may freely re-explore ruled biomes and any biome already unlocked.
- **Win condition**: all four biomes ruled.
- Boss ideas (placeholders): Forest = huge ancient stag or giant boar; Jungle = giant python or huge gorilla-like beast; Plains = giant buffalo or mega hyena pack leader; Winter = giant mammoth-like beast or ice-wolf alpha. Bosses get phases in Milestone 5.

### 4.6 Save system
Save to **localStorage** (selected species and variant, level, XP, life stage, growth meter, unlocked and ruled biomes, unlocked abilities). Wrap all storage calls in try/catch because storage can fail.

---

## 5. World

- Four biomes, each with distinct terrain, plants, enemies, boss arena and den spots.
- Early milestones: one biome at a time, with a bounded world (world boundary).
- A **day and night cycle** runs in every biome (built in M1 at the user's request; 6 minutes per day; visual only for now).
- The **den is a safe refuge**: a ring of pale stones marks it, wild animals never enter it, and they ignore a player who is inside.
- Later milestones: larger world, minimap, dens/rest spots.
- Not planned: massive streamed worlds, dungeons, NPC dialogue, crafting, multiplayer (multiplayer may be considered after Milestone 5).

Starter enemy roster (placeholders, to be refined; all enemy animals are data-driven):
- **Forest**: deer (prey, flees), boar (fights back), fox or rabbit (small and fast).
- **Jungle**: monkey, snake, capybara/tapir.
- **Plains**: zebra/antelope (prey), hyena, buffalo.
- **Winter**: arctic hare, seal, arctic fox.
- Wild animals also include the other predator species not chosen by the player, so players meet "competing" animals. In the Forest (built in M1): a pair of wolves, a lion and a bear, each in its own territory; the player's own species is left out, so a wolf meets 2 rivals, a lion or bear meets 3, and (from M2) a Tiger, Elephant, Crocodile or Eagle meets all 4. The limit is 5 rival animals per species. Rivals for the new species belong in their home biomes in M3.

---

## 6. Species (all 7 defined in data, playability by milestone)

All seven species must be defined in ONE species data file (stats, diet, abilities, biome modifiers, colors, body proportions, stage appearance). Not all are playable in Milestone 1.

| Species | Role | Diet | Playable from |
|---|---|---|---|
| Wolf | Fast, agile pack hunter | Carnivore | M1 |
| Lion | Balanced strong melee, strong roar | Carnivore | M1 |
| Bear (brown / polar variants) | Tank, high health, heavy hits | Omnivore | M1 |
| Tiger | High damage, stealthy ambusher | Carnivore | M2 |
| Elephant | Huge health, slow, charges and stomps | Herbivore | M2 |
| Crocodile (alligator skin variant) | Ambusher strong near water, death roll | Carnivore | M2 |
| Eagle | Flying, ranged/dive attacks, fragile | Carnivore | M2 (flight) |

Species locked for the current milestone appear on the selection screen as **"Coming soon"**.

### Ability lists (placeholders; the user may edit these; keep them in data files)
Each species has a **signature ability** (available at level 1 to 3) plus upgradable abilities unlocked with ability points. Milestone 1 needs at least **3 unlockable abilities per playable species**, with working effects.

| Species | Signature | Other ability ideas |
|---|---|---|
| Wolf | Pounce (leap attack) | Howl (buff speed/damage), Bleed bite (damage over time), Pack Hunter (bonus damage on low-health targets) |
| Lion | Mighty Roar (stun/slow nearby enemies) | Claw Swipe (wide arc), Pounce Slam, Pride Presence (defense buff) |
| Bear (brown) | Heavy Swipe (high damage, slow) | Bear Hug/Maul, Ground Slam (area), Thick Hide (defense) |
| Bear (polar) | Heavy Swipe | Ice Slam (area + slow), Thick Hide, Swim/Fishing bonus |
| Tiger | Ambush Strike (bonus from behind) | Rend (bleed), Stalk (speed while unseen), Double Claw |
| Elephant | Charge (dash that knocks back) | Stomp (area), Trunk Whip, Thick Skin |
| Crocodile | Death Roll (grab and heavy damage) | Lunge, Tail Sweep, Water Ambush bonus |
| Eagle | Dive Strike (aerial dive) | Talon Grab, Gust (knockback), Eagle Eye (reveals enemies) |

---

## 7. HUD and Menus

HUD: health bar, stamina bar, XP bar and level, growth meter, ability icons with cooldowns, biome name with active buff/nerf indicator, damage numbers, enemy level tags, interaction prompts (eat, enter gate).

Menus: Title screen (the biome's animals roam peacefully behind it) -> Species select (3D turntable preview showing stats, diet, favored/disfavored biomes, variant toggle for bear) -> Game. Pause menu. Tab growth/ability menu (unlock abilities, see growth meter, evolve button when eligible).

---

## 8. Technical Constraints

- **Three.js + Vite**. TypeScript preferred. No UI framework (plain DOM/CSS for HUD).
- Must run with `npm install && npm run dev`. `npm run build` must produce a static site deployable to itch.io or GitHub Pages.
- **No external art assets** and no downloaded or licensed assets in early milestones. Build animals **procedurally** from primitives with a **parametric quadruped rig** (body, head, legs, tail, species features) and **procedural animation** (walk/run cycle, idle breathing, attack lunge, hit flash). Eagle uses a separate winged rig (M2).
- Hide animal models behind an interface (for example `AnimalModel`) so real **glTF** models can replace the procedural ones later without touching gameplay code.
- Performance target: **60 fps on a mid-range laptop**. Use instancing for trees/grass/rocks, cull distant objects. Keep collision simple (capsules plus a terrain height function) unless a physics library is clearly needed.
- **Architecture**: data-driven config in `src/data` (species, biomes, abilities, enemies, bosses, growth stages), systems separated (input, camera, player, combat, ai, growth, world, ui, save). Small focused files.
- Do not add dependencies beyond `three` and `vite` (plus `typescript`, and `playwright` as a dev dependency for testing) without asking the user.
- Do not invent Three.js APIs. Check the installed version's types or docs when unsure.

---

## 9. Milestone Plan

| Milestone | Scope |
|---|---|
| **M1** | Playable vertical slice: Forest only, Wolf/Lion/Bear, core loop (see Section 10) |
| M2 | Remaining species (Tiger, Elephant, Crocodile, Eagle with flight) and the full Alpha stage |
| M3 | Jungle, Plains and Winter biomes, with bosses and the buff/nerf system fully active across biomes |
| M4 | Larger open world, minimap, dens/rest spots. (The day/night cycle was built early, in M1. Gameplay effects of night, if wanted, belong here.) |
| M5 | Audio, boss phases, balance pass, polish, settings, optional glTF art |
| After | Optional: multiplayer, touch controls, real animal art (Higgsfield or free glTF assets) |

### Milestone Status
- M1: **DONE, accepted by the user on 2026-11-14.** Built on 2026-11-13, then revised the same day after the user's two rounds of playtest feedback (catchable prey, boss returns on re-entry and pays 50 XP after the first win, day and night cycle of 6 minutes, death resets the animal, animals on the title screen, a safe den refuge, rival predators). See the Decisions Log. Every automated check passes (see "Verification"). Acceptance was inferred from "seems good" plus the user's wish to start M2; the user did not separately comment on the camera, UI style or the `@types/three` dev dependency, so those stand as built.
- M2: **BUILT, waiting for the user's review** (not yet accepted). All six steps are done: (1) Alpha stage, the new death rule, the 12 m den ring and the rival limit of 5; (2) Tiger, plus the sight rule the user asked for; (3) Elephant, with plants as food; (4) Crocodile; (5) Eagle with flight; (6) the title-screen cast, the docs and a clean test run. 60 unit tests, 175 browser checks, typecheck and production build pass. The task list is in `PLAN.md`. **Commits:** steps 1 and 2 are committed (`67cbf62`, `fc3c90e`). The sight rule and steps 3 to 6 are NOT committed: the user approved commits one at a time and was away, so nothing was committed without permission. **Nothing is pushed** (the user asked to push only after every step is committed).
- M3 to M5: not started

(Update this list at the end of every session.)

---

## 10. Milestone 1 Scope (DONE)

- Title screen (forest animals roaming by the pond) -> species select (3D turntable preview, stats, diet, favored/disfavored biomes) -> Forest world.
- Playable: **Wolf, Lion, Bear (brown and polar)**. Other species shown as locked "Coming soon".
- **Forest biome**: rolling terrain, trees, rocks, grass, a pond, fog, sky with a day and night cycle, world boundary, a den respawn point.
- Player: walk, sprint, jump, dodge, basic attack, plus one working signature ability per species. Third-person camera with smooth orbit.
- **3 wild enemy types** with AI (for example a fleeing prey animal, a fighting boar-type, a small fast animal). They respawn and drop food. Plus **rival predators** (wild wolves, lion, bear; never the player's own species).
- XP and levels, ability points, **at least 3 unlockable abilities per playable species**.
- Food and growth meter, and **Juvenile -> Adult** evolution (Alpha can be a stub that is clearly marked as a TODO).
- Full HUD as in Section 7, including the biome buff/nerf indicator.
- **Forest boss**: a large animal in an arena. Defeating it shows "Forest Ruled" and opens a gate to the (stubbed) next biome. It is back each time the player re-enters the Forest.
- Death and respawn at the den, with the animal reset to a level 1 Juvenile (ruled biomes kept). The den is a safe refuge from wild animals. (As built in M1; the death rule was softened in M2, see section 4.3.)
- Save and load via localStorage.

### Done when
`npm run dev` launches the game and the user can pick wolf, lion or bear, roam the forest, fight, level up, eat, evolve and beat the boss, with **no console errors**, and this file is updated with notes for M2.

---

## 11. Process (how to work)

1. At the start of a session: read this file fully. If this is the first session, write `PLAN.md` (file layout, key decisions, current milestone task list). Give the user a brief summary of the plan, then continue building unless something genuinely blocks you.
2. `git init` (first session) and build in small verified steps, committing after each. Suggested M1 order: scene + camera + terrain -> player movement -> animal rig -> combat -> enemy AI -> growth systems -> HUD -> boss -> menus and saving.
3. Do not rewrite working systems when adding features.
4. When adding a new species, biome, enemy or ability, add it through the data files, not by hard-coding.

## 12. Verification (required)

- Start the dev server and load the game in a headless browser (install Playwright if possible).
- Confirm there are **no console errors**.
- Take screenshots of the species select screen and gameplay, look at them, and fix what looks wrong.
- Never claim something works without running it. If a browser cannot be run, say so and list exactly what is untested.

### Commands
- `npm install`, then `npm run dev` to play (open the printed localhost address).
- `npm test`: unit tests for the rules in `src/logic` and the data in `src/data` (Node's built-in test runner, no extra dependency).
- `npm run test:e2e`: starts the dev server, opens the game in headless Chromium, plays the whole M1 loop with real key and mouse events for all three species, fails on any console error, and writes screenshots to `tests/e2e/screenshots/`. First time on a new machine: `npx playwright install chromium`.
- `npm run build`: typecheck plus a static site in `dist/` (relative paths, so it works from any sub-folder).
- Adding `?debug` to the URL (or running in dev) exposes `window.__beast` test hooks: step the simulation, teleport, grant XP, set the time of day (`__beast.setTimeOfDay(0)` is midnight, `0.5` is noon). They are not present in a normal production page.

### State at the end of the M1 feedback session (2026-11-14)
- Passing: 32 unit tests, 101 browser checks (run three times in a row), production build.
- The browser test now also hunts prey like a player would (sprint and attack, real key and mouse events): a lion and a level 1 Juvenile bear, the slowest species, each run down and kill a fleeing deer; the bear also catches a fox.
- Not verified: frame rate on a real graphics card (the test browser renders in software), and how the changes feel to a human. The prey numbers were tuned against a bot that never misses, so a person will take longer than its 8 to 17 seconds per deer.
- Not re-checked this session: loading the built `dist/` from a sub-path (checked on 2026-11-13; the build settings have not changed).

## 13. Things to Avoid

- Building all four biomes or all seven species before their milestone.
- Inventing Three.js APIs.
- Adding unrequested dependencies.
- Rewriting working systems when adding features.
- Leaving stubs that look finished. Mark every unimplemented piece as `TODO` here and in code.
- Changing the design in this file silently. If a change seems necessary, propose it to the user and log it.

## 14. Final Report Format (end of each session)

Keep it short: what works, what is rough, how to run it, what was changed in this file, and suggested next-milestone tasks.

---

## 15. Decisions Log (append only)

- 2026-11-13: Chose 3D (Three.js, browser) over 2D at the user's request. Procedural low-poly animals; no external assets for now.
- 2026-11-13: Growth is two separate tracks: XP unlocks abilities; food fills a growth meter that, with a level requirement, evolves the animal (Juvenile -> Adult -> Alpha).
- 2026-11-13: Ruling a biome requires only defeating its boss; this unlocks the next biome and the player may keep exploring unlocked biomes.
- 2026-11-13: Controls are keyboard + mouse first.
- 2026-11-13 (M1 build): Added `@types/three` as a dev dependency. It is the type definitions for three.js, needed for TypeScript; it adds nothing to the shipped game. This is one package beyond the list in section 8 and was added without asking first.
- 2026-11-13 (M1 build): Forest boss is the **Ancient Stag** (level 10): antler swing, a telegraphed charge and a ground stomp. Phases wait for M5.
- 2026-11-13 (M1 build): Forest enemies are **deer** (flees on sight), **boar** (attacks on sight, charges) and **fox** (small and fast, nips, flees below 40% health and comes back once recovered). "Other predator species as wild animals" is not in M1.
- 2026-11-13 (M1 build): Each player level above 1 adds +3% max health and damage, so that visible enemy levels are a fair comparison. Wild animals gain +12% health and +10% damage per level.
- 2026-11-13 (M1 build): Key 1 is the signature ability (free at level 1). Every ability has 3 ranks; each rank after the first adds 20% to its effect. One ability point per level.
- 2026-11-13 (M1 build): Polar bear has two active abilities (Heavy Swipe, Ice Slam) and two passives (Thick Hide, Arctic Swimmer), exactly as listed in section 6, so its key 3 is empty. Brown bear has Heavy Swipe, Maul, Ground Slam and Thick Hide.
- 2026-11-13 (M1 build): Evolving is done with the button in the Tab menu; there is no separate evolve key. The HUD says when evolution is ready.
- 2026-11-13 (M1 build): Eating also heals (carcass 20%, fish 12%, berries 8% of max health). Health regenerates slowly after 6 seconds without taking damage.
- 2026-11-13 (M1 build): Death penalty is 25% of the XP progress toward the next level. Growth is not reduced.
- 2026-11-13 (M1 build): Food in the Forest: carcasses from defeated animals (rot after 90 s), 4 fish in the pond, 8 berry bushes (bear only in M1). Fish and berries come back after a while.
- 2026-11-13 (M1 build): Animals swim across the pond at 60% speed instead of walking on the bottom.
- 2026-11-13 (M1 build): XP curve is 20 + 12 x (level - 1)^1.3 per level (about 525 XP to reach level 8). Growth needed: 100 for Adult, 250 for Alpha.
- 2026-11-13 (M1 build): Attacks turn the animal toward the nearest enemy in front of the camera (light aim assist), so melee connects in third person.
- 2026-11-13 (M1 build): The game pauses while the Tab menu is open.
- 2026-11-13 (M1 build): UI style is a trailhead signpost: arrow-ended sign planks for menu choices, dark bark panels, cream lettering, one system signage typeface (Bahnschrift with fallbacks, no downloaded fonts). Open to change if the user prefers another direction.
- 2026-11-14 (M1 feedback): **Prey can be caught.** Measured first: a lion or a bear chasing a deer with a perfect bot landed no hit in 60 seconds, because deer sprinted about as fast as they do and outlasted their stamina. Now deer sprint at 7.4 (was 8.6) and foxes at 7.6 (was 9), below every playable species; they bolt for 3.5 s / 2.5 s, then are winded for 5 s / 4.5 s; they slow down as they lose health (down to 65% / 70% speed); deer notice the player at 11 m (was 13 m). All of it is data in `src/data/enemies.ts`. A unit test keeps every fleeing animal slower than the slowest playable species.
- 2026-11-14 (M1 feedback): **The boss returns on re-entry.** The user asked for the boss to come back whenever the player leaves the biome and returns. In M1 that means quitting to the title and pressing Continue; from M3 it also means travelling between biomes. The Forest stays ruled and the gate stays open. A repeat win gives the boss's XP and carcass again and shows a short message instead of the "Forest Ruled" banner. Within one visit a beaten boss stays down.
- 2026-11-14 (M1 feedback): **Death resets the animal.** This replaces the 25% XP penalty above. The user chose: same species, back to a level 1 Juvenile with no XP, growth, ability points or bought abilities (the signature ability stays); ruled and unlocked biomes are kept. The reset is applied and saved the moment the animal dies, so closing the game on the death screen cannot undo it. Respawn takes 3.5 s (was 2.5 s) so the message can be read.
- 2026-11-14 (M1 feedback): **Day and night cycle, moved forward from M4** at the user's request. One full day lasts 8 minutes (`TUNING.dayNight.cycleSeconds`), about 58% of it daylight. Sun, moon, stars, sky, fog, light colour and shadows all follow the time of day. Every session starts in the morning; the time of day is not saved. It is visual only: night does not change stats, enemies or spawns. Night is kept bright enough to play. The HUD shows Dawn / Day / Dusk / Night under the biome name.
- 2026-11-14 (M1 feedback): **Animals on the title screen.** The title now shows the clearing on the west shore of the pond with ten animals living there: three deer, two foxes, a boar, a brown bear at the water, two wolves and a lion. They wander, stop and move on; nobody fights, and prey trots away when a predator comes within 3.5 m. The camera sits low and pans slowly. The cast and the camera path are data (`FOREST_TITLE` in `src/data/biomes.ts`); the animals are scenery (`src/systems/ambient.ts`) and do not use the game's enemy AI.
- 2026-11-14 (M1 feedback, second round): **Repeat boss wins pay 50 XP.** Only the first win over a boss pays its full XP (300 for the Ancient Stag). Every later win pays `repeatXp` from `src/data/bosses.ts` (50). "First" means the biome was not yet ruled, so it stays "repeat" after a death too, because ruled biomes are kept.
- 2026-11-14 (M1 feedback, second round): **The den is a safe refuge.** A circle of 18 m around the den (`den.refugeRadius`; the den clearing itself is still 8 m), marked by a ring of pale stones, which covers the spawn point with 9 m to spare. Wild animals never enter it, do not pick spots inside it to wander to or spawn in, do not notice a player who is inside, and break off a chase the moment the player steps in. The HUD shows "Safe at the den". It gives no healing bonus beyond the normal slow regeneration. The trees were left where they are, so the rest of the Forest's layout is unchanged.
- 2026-11-14 (M1 feedback, second round): **A day lasts 6 minutes** (was 8). `TUNING.dayNight.cycleSeconds = 360`.
- 2026-11-14 (M1 feedback, second round): **Rival predators** (this replaces the 2026-11-13 note that they were not in M1). The user asked for 1 to 3 predators in the biome. Built as the bible's "competing animals": a pair of wolves (level 4 to 5, west edge), a lion (level 5 to 6, east of the pond) and a bear (level 6 to 7, south-east), using the playable species' adult bodies. The player's own species is left out, so a wolf meets 2 rivals and a lion or bear meets 3. They attack on sight, never flee, each have two attacks, give more XP and growth than a boar, and come back 150 s after being killed. Their chase speed is below every playable species' sprint, so a fight can always be escaped. They are hostile to the player only: **they do not hunt deer or fight each other** (wild animals cannot damage one another yet).

- 2026-11-14 (M2 plan): **Order of M2**: Alpha stage + death rule + den ring first, then Tiger, Elephant (with plants as food), Crocodile, and the Eagle with flight last as the biggest piece. Each species is playable only once its own step is done and tested.
- 2026-11-14 (M2, step 1): **Rival limit is 5 animals per species** (it was 1 to 3). The user raised it so that Tiger, Elephant, Crocodile and Eagle can meet all four existing Forest rivals (wolf pair, lion, bear) without new rival models. Rivals for the new species are planned for their home biomes in M3. The unit test now checks 1 to 5.
- 2026-11-14 (M2, step 1): **Death rule softened** (replaces "death resets to a level 1 Juvenile"). The user proposed dropping to the lowest level of the current stage, and a stage lower on a later death. As built: a first death keeps the stage and falls to the stage's first level (Juvenile 1, Adult 8, Alpha 18); a death while still **wounded** (no level gained since the last death) drops one stage and empties the growth meter; **gaining a level heals the wound**. Choices made by me, not the user: the wound heals on one level gained (the user left this open and said to go ahead); bought abilities are always refunded as points, never kept above the level's allowance; food already eaten stays while the stage is kept; a Juvenile is never wounded. The mark is saved (`progress.wounded`; older saves load as not wounded) and applied the moment the animal dies. Logic is `applyDeath` in `src/logic/progression.ts`; the messages are `src/logic/deathText.ts`. The HUD shows "Wounded" and the Tab menu says what another death costs.
- 2026-11-14 (M2, step 1): **Alpha stage is playable** (`TUNING.maxPlayableStage = 'alpha'`): level 18 and a full 250 growth meter, size 1.4, 3.0x health and damage, ruff/mane/hump plus a scar. It has no growth meter of its own.
- 2026-11-14 (M2, step 1): **Den ring shrunk from 18 m to 12 m** (`den.refugeRadius`), because the user felt it was too big. The player's spawn point stays 9 m from the den, so it is now 3 m inside the ring (it was 9 m inside). It was not moved because the Forest's trees are placed from a seeded random sequence that depends on the spawn position, so moving it would reshuffle the whole forest. The number of ring stones follows the radius. Move the spawn closer only if the user asks for it, and expect a different tree layout.
- 2026-11-14 (M2, agreed design for the Eagle, built last): hold Space to flap and climb, release to glide down, landing is automatic, no new keys. Climbing drains stamina, gliding barely does, and with none left the eagle can only glide down. Ceiling of about 25 m (a guess to tune). Trunks and rocks block only below about 4 m. Fighting needs no new rule because `combat.ts` already ignores hits across a large height gap (a ground animal cannot hit a high eagle, and the eagle must swoop low or dive); the boar and stag charge check in `ai.ts` needs the same height check. The den refuge stays a column, safe at any height inside the ring. There are no flying wild animals, and the Eagle is not a wild rival in the Forest.

- 2026-11-14 (M2, step 2): **Tiger is playable** (Bengal Tiger). Stats unchanged from the placeholders (health 100, stamina 105, damage 16, speed 5.8 / sprint 10, defense 5). Abilities: **Ambush Strike** (signature, 1.6x damage, +75% against a target that has its back to the tiger), **Rend** (bleed), **Double Claw** (two hits), **Stalk** (passive, +15% speed while unseen). Ambush Strike's damage was 1.9x in the placeholder; it is 1.6x now because the behind bonus adds to it (about 23 from the front and 40 from behind on a boar at level 1). Numbers are first guesses for M5 balance.
- 2026-11-14 (M2, step 2): **"From behind" and "unseen" are new rules.** Behind = the attacker stands inside the rear 120 degrees of the direction the target faces (`isBehind` in `src/logic/damage.ts`); melee abilities take a `behindBonus` and the hit reports `ambush`, so the damage number turns gold and ends in "!" (the player can see why it hit hard). Unseen = no awake wild animal is chasing, attacking or fleeing from the player (`playerIsUnseen` in `src/logic/stealth.ts`); the player controller refreshes its stats when that flips, and the HUD shows "Unseen" while Stalk is active. A stunned animal that was chasing still counts as having noticed the player, and animals that were fighting need a few seconds at the den to calm down, so Stalk can take a few seconds to return after a fight.
- 2026-11-14 (M2, step 2): **Species unlock per species.** `TUNING.currentMilestone` is now 2, and a species also needs to be finished: `unfinished: true` in `src/data/species.ts` keeps Elephant, Crocodile and Eagle "Coming soon" even in Milestone 2. Remove the flag when that species' step is done. `isPlayable` is the one place that checks both.
- 2026-11-14 (M2, step 2): **Tiger look.** A new rig feature `stripes`: dark bands over the back and flanks, stripes on the outer side of the legs, rings on the tail with a dark tip (`tailTipDark`) and marks on the forehead and cheeks, at every life stage (the Alpha also has a scar). It is built from primitives like the rest of the rig. A thin tail now takes the tail-tip colour (before, only bushy and tuft tails did).

- 2026-11-14 (M2, step 2, sight): **Animals see best ahead and worst behind.** The user asked for sneak attacks, and for prey that faces a hunter to start fleeing before the hunter is near. How far an animal notices the player is its aggro radius times a multiplier by where the player is compared with where the animal faces (`noticeMultiplier` in `src/logic/senses.ts`): the full `front` range within 60 degrees of straight ahead, only the `rear` range (a quarter) within 30 degrees of straight behind, and a straight blend between. `TUNING.enemies.senses` holds the cones and the defaults (front 1, rear 0.25); an enemy can override them in its `behavior.senses`. The deer has `front: 1.35`, so a deer that faces a hunter bolts from about 15 m (11 m before). Bosses ignore it. Effects: a boar or a wolf 6 m behind its back is not noticed at 6 m or 3.5 m; hunting is a little easier from behind and a little harder head-on. Choices made by me, not the user: prey only (not predators) gets the longer front range, so wolves, lions, bears and boars are no more dangerous head-on than before; "able to see you" means facing, with no blocking by trees or hills; the rear fraction (0.25) and the cone widths are first guesses.

- 2026-11-14 (M2, step 3): **Elephant is playable** (Bush Elephant). Its walk is 4.7 and its sprint 8.0 (the placeholders were 4.2 and 7.2), because a deer out-sprints 7.2 and a winded fox out-walks anything under 4.6, and the user's rule is that every species can catch prey (the unit tests check it). Charge (Elephant signature) is a new effect kind, `charge`: a ground dash of 9 m that hits everything on the way once each and knocks them aside; the charger is not slowed by the animals it hits (`Actor.plowing`, used in `Game.separate`). Stomp, Trunk Whip and Thick Skin are as in the bible. **Plants as food** are in the Forest: 30 plants (4 inside the den refuge so that a herbivore can feed safely), 7 growth each and 7% healing, growing back after 45 s; with the 8 berry bushes one sweep gives about 258 growth, enough for a full Adult meter. The eat prompt now says "An elephant cannot eat fish" (`withArticle`). The rig has a new `trunk` feature: a six-part trunk that hangs from the face, curls at the tip, sways, and lifts when the elephant attacks; tusks as before. The Elephant's snout was shortened to make room for it.
- 2026-11-14 (M2, step 4): **Crocodile is playable** (Crocodile and Alligator skins). Walk 4.7 and sprint 8.0 (placeholders 4.4 and 7.6), for the same prey rule. **Death Roll** holds its target helpless for the whole roll (`grab` on a melee ability: the first hit stuns it for as long as the roll lasts) and the crocodile rolls over while it holds on. A grab has no knockback (a unit test checks it): with the first version the four bites pushed the target about 0.4 m away, and on some runs the last bite fell out of reach. **Tail Sweep** is a full circle (the first version was 300 degrees, which left a blind spot straight behind the animal, found by testing). **Water Ambush** adds 35% damage while the crocodile stands in water of any depth (`Actor.wet`, `waterDamage` on the passive, applied to abilities and basic attacks) and keeps the swim speed bonus. The rig has new features: `jaw` (a long flat snout, teeth, raised eyes), `sprawl` (legs splayed to the sides and a low body), and a `heavy` tail (as thick as the body at the root, tapering).
- 2026-11-14 (M2, step 5): **Eagle is playable, with flight**, as agreed. Hold Space to take off and climb (5.5 m/s), release to glide down (2.4 m/s); touching the ground lands it. Taking off costs 8 stamina, flapping 11 per second, gliding nothing; with no stamina the eagle cannot take off or climb until it has recovered 20%. The ceiling is 25 m above the ground. All numbers are in `TUNING.flight` and the pure rules are in `src/logic/flight.ts`. Trunks and rocks have a height (`ColliderGrid` takes a `top`): a flier passes over them and through the foliage above the trunks; the arena stones, the den boulders (6 m) and the gate still block. **Dive Strike** from the air falls at 16 m/s onto the target 10 m ahead and hits 4% harder for every metre of height (about 60% harder from 15 m); from the ground it is a short pounce. **Talon Grab** holds a target helpless for 1.2 s (the same `grab` as the Death Roll; carrying it was not built). **Gust** knocks animals back. **Eagle Eye** shows enemy level tags up to 90 m away (42 m normally). Fairness: see section 4.3 ("Flight and reach"). Animals notice a flier only below 5 m and give up a chase above 6 m; they were first given 12 m and 6 m, which made a boar flip between chasing and returning every frame (found by testing). The bird rig is a second class behind `AnimalModel` (`ProceduralBird`, chosen by `createAnimalModel`): folded wings and a hop on the ground, flapping while climbing, level wings when gliding, swept back in a dive, legs tucked in flight, a hooked beak, tail fan and talons.
- 2026-11-14 (M2, step 6): **Title screen**: a tiger, an elephant and a crocodile (in the water) join the clearing; the Eagle does not (the title scene has no flight). **Every species is playable** (`unfinished` is no longer used by any species; the flag stays in the code in case it is needed again).
- 2026-11-14 (M2, tests): **Flaky browser checks were found and fixed, not ignored.** The game seeds its randomness from the clock, so each run differs. Causes found: test coordinates read before an animal had moved; an animal facing away that therefore never noticed the player (after the sight rule); a second animal inside an ability's arc or standing where the player was put (aim assist turns toward the nearest animal, even one underneath the player); an ability refused because the one before it was still casting; stale altitude or flying state after a test moved the player by hand (the `teleport` hook now lands the animal). Helpers in `tests/e2e/smoke.mjs`: `hold` (freeze an animal facing a given way), `withClearSpots`, `corridor` (a clear run with held animals and nobody else in the way), `duelNote` (positions in a failure message).

## 16. Known Issues / TODO

### Stubs (marked `TODO` in code)
- **None left from M2.** The Elephant, Crocodile and Eagle are finished (placeholder numbers tuned for M5).
- **Gate to the Jungle** (M3): opens after the boss; pressing E only shows a message. Jungle, Plains and Winter are palette stubs in `src/data/biomes.ts`.
- **Boss phases, audio, settings** (M5): not started.

### Known rough edges (M1 and M2)
- The camera can pass through trees and rocks; nothing moves it out of the way.
- Enemy level tags are visible through trees and hills.
- Animals do not path around obstacles; they slide along them.
- The player can walk around behind the gate (there is nothing there).
- Animal models are simple shapes. They read as wolf, lion and bear, but they are placeholders for nicer art.
- Balance is only partly tuned: prey speed was fixed from the user's playtest, but fight length, XP pace and boss difficulty are still first guesses in the data files.
- A level 1 Juvenile that walks into a rival's territory (levels 4 to 7) will lose; their level tags show red as a warning. Death is softer since M2 (see section 4.3), but a second death in a row still costs a life stage. Untested by a human: whether "heal the wound with one level" is the right pace for an Alpha, whose next level costs about 500 XP.
- The respawn point is only 3 m inside the 12 m den ring, so a freshly woken animal that walks north leaves safety almost at once. Moving the spawn closer would reshuffle the Forest's trees (see the Decisions Log).
- **Sneaking is possible but narrow for a Juvenile Tiger.** Animals now notice the player at only a quarter of their range from straight behind (see the Decisions Log), but a boar behind-notices at about 2.5 m while a Juvenile Tiger's Ambush Strike reaches only about 2 m, and the boar turns within a fraction of a second once it notices. An Adult (about 3 m of reach) or an Alpha (about 4 m) can strike from outside that range. Untested by a human; the quarter (`TUNING.enemies.senses.rear`) is the number to change if sneaking feels too easy or too hard.
- Sight is only about facing and distance: trees, rocks and hills do not block it, and an idle animal never turns its head, so it keeps looking the same way until it wanders off. Animals do not hear the player either, whatever its speed.
- Alpha animals look like their Adult selves with a ruff or mane and a scar (the data's `stageFeatures`), at 1.4 size. Nothing else about the model changes yet.
- A level 18 Alpha is far stronger than anything in the Forest (rivals are level 4 to 7, the boss level 10), so the Forest stops being a challenge. That is expected until the harder biomes arrive in M3.
- Rival predators ignore prey and each other; only the player is attacked. A player can also stand just inside the refuge and hit an animal at its edge without being hit back; the animal walks away and heals, so it gains little.
- Rival stats are a first guess, untested by a human.
- Night is visual only, and the moon is rarely on screen: the hills around the Forest and the camera's upward limit hide most of the high sky.
- Frame rate on real hardware is unmeasured. A typical frame is about 270 draw calls and 340k triangles, which should be comfortable for a mid-range laptop.
- After pressing Esc, browsers refuse to re-lock the mouse for about a second. Resuming with the Resume button works; resuming by pressing Esc again may need one click on the game.
- The project is a git repository on branch `main` with remote `origin` (github.com/zayden995/beast-ascent). `dist/`, `node_modules/` and the test screenshots are not tracked.
- `node_modules` sits inside a OneDrive folder, which makes installs slow and syncs thousands of files. Consider excluding it from sync or moving the project out of OneDrive.

- **Untested by a human, all of M2**: how flight feels (the climb and glide speeds, the 25 m ceiling, the camera while flying), how the Elephant's size feels among trees (an Alpha Elephant is about 3.3 m across and the trees are at least 3.6 m apart), how the Death Roll, Charge and Dive look in motion, and every ability number (all first guesses for M5).
- Trees, rocks and hills do not hide an animal from sight, and the foliage above a trunk does not stop an eagle (it flies through leaves). A flying eagle is not noticed above 5 m, so it can hover over a fight unseen.
- The eagle's Talon Grab holds a target but does not carry it. Wild animals cannot fly and no rival eagle exists.
- The new animals are simple shapes like the others. The Elephant's trunk is stiff (it sways and lifts, but does not curl), and the Crocodile's legs are straight sticks that splay out.
- The Elephant (and the Crocodile) are slow on land; with prey tuned for the bear, the Elephant needs up to a minute to run down a deer in the browser test.

### Notes for Milestone 3
- All seven species are playable. `isPlayable(species, TUNING.currentMilestone)` is the one check (`playableFrom` reached and not `unfinished`).
- **Rivals for the new species** belong in their home biomes (Tiger and Crocodile in the Jungle, Elephant on the Plains). New rivals are just data in `src/data/enemies.ts` (the `rival()` helper copies a playable species' adult body). An Eagle rival would need a flying AI; no wild animal flies yet.
- **Biomes**: the new species' buffs and nerfs are already data (Tiger Jungle +20% damage, Crocodile +25% damage near water in the Jungle, Elephant Jungle and Plains +20% health, Eagle Plains +20% speed). Each new biome needs its own plants for the herbivore (`FOREST_LAYOUT.plants` is the Forest's), colliders with a height (`ColliderGrid.add(x, z, r, top)`) so that the eagle can fly over them, and water where the crocodile wants it (`nearWater` and `wet` come from the pond).
- **Wild animals' sight** is `TUNING.enemies.senses` (cones and ranges); an enemy overrides it in `behavior.senses` (the deer sees farther ahead). **Flight** is `TUNING.flight`. Both are data and are covered by unit tests.
- Abilities are data. The effect kinds are `leap` (with `dive`), `charge`, `melee` (with `hits`, `bleed`, `behindBonus`, `grab`), `aoe`, `buff` and `passive` (with `mods`, `whileUnseen`, `swim`, `foodBonus`, `waterDamage`, `reveal`). A new mechanic needs a field in `AbilityEffect` and its handling in `src/systems/abilities.ts`.
- Rig features are in `FeatureId` (`src/core/types.ts`); the four-legged rig is `ProceduralQuadruped`, the bird is `ProceduralBird`.
- The browser test hunts prey with a bot (`hunt()`); a unit test keeps every fleeing animal slower than the slowest playable species and its winded walk below the slowest walk.
- Run order for a clean start on a new machine: `npm install`, `npx playwright install chromium`, `npm test`, `npm run test:e2e`.
- Tests: `npm test` runs 60 unit tests; `npm run test:e2e` runs 175 browser checks (state at the end of M2). The game seeds its randomness from the clock, so run the browser test a few times: two checks passed by luck at first (a second animal inside an ability's arc, and animals still alert after a fight), and were fixed to count only the target's hits and to wait for calm. Since the sight rule, a browser test that needs an animal to notice the player must first face it at the player (the `hold(id, yaw)` helper in `tests/e2e/smoke.mjs`), because an animal that faces away will not notice from a short distance. The browser test reads the den ring radius from the game's own layout, so changing `den.refugeRadius` needs only the explicit "ring is 12 m" check updated.

# CLAUDE.md

These are general working instructions for coding and non-coding projects. Apply each instruction where it is relevant to the task and project; interpret or omit rules that do not apply. Follow more specific user instructions for the current task when they differ.

## 1. Documentation and Project Continuity

### Keep documentation up to date

When a project change affects existing documentation, update the relevant documentation as part of the same task, before reporting the work as complete. This may include changes to features or content, files or structure, data, dependencies or configuration, design, workflows, or significant decisions and issues.

Update only the documentation affected by the change. Do not update documentation for minor edits that do not affect what it describes.

### Documentation responsibilities

- Keep the project’s user or developer guide accurate and useful where one exists.
- Keep any handover or continuity notes accurate about the current state, decisions, issues, and next steps where such notes are used.
- Correct outdated information in the relevant documentation.
- Create or reorganise documentation only when the project needs it; do not add unnecessary paperwork.

## 2. Working Preferences and Communication

### Planning and clarification

- For new projects and major changes, discuss requirements and the proposed approach first, clarify material uncertainties, and obtain approval before implementation.
- For small tasks, fixes, and straightforward modifications, use reasonable judgment and proceed without unnecessary approval requests.
- Avoid assumptions that could significantly affect the outcome. Ask when missing information could materially change the result.

### Visual design and previews

- When a task involves visual design, provide actual examples or previews when practical. Use interactive previews when they help evaluate visual behaviour.
- Claude may make minor design decisions independently, such as small spacing, typography, or alignment adjustments.
- Seek approval before making major visual decisions or implementing a substantially different visual direction.
- Visual previews are needed only for tasks involving visual design.

### Explain trade-offs and follow requirements

- Explain material limitations, compromises, risks, and likely effects on functionality, performance, usability, or maintainability before implementation when they could affect the user's decision.
- Present alternatives when useful; do not hide limitations or present materially different outcomes as equivalent.
- Implement the user's requirements as described. Do not silently substitute an approximation or add unrelated features.
- If an exact result is not feasible, explain why and offer practical alternatives.

### Communication

- Communicate clearly and directly, using accessible explanations and an appropriate level of detail.
- When something goes wrong, explain the cause before proposing a solution.
- Distinguish completed work from proposed changes and outstanding tasks.
- Be honest about uncertainty, limitations, and what has or has not been done.

## 3. Content, Data and Project Management

### Use authentic information

- Do not invent real-world facts, statistics, prices, company details, contact information, or other factual content.
- Mark missing or unverified information clearly, for example with `[PLACEHOLDER]`, or ask for it when it materially affects the result.
- Preserve user-provided content, assets, and files. Fictional or sample content is acceptable when the user explicitly requests or approves it and it follows their requirements.

### Project organisation and existing work

- Understand the existing structure and conventions before making changes.
- Keep work organised in a way that suits the project; avoid unnecessary files, clutter, and changes outside the agreed scope.
- Avoid overwriting or removing existing functionality without justification.
- Do not discard the user's existing or uncommitted work.
- When asked to undo a change, fully revert everything introduced by that change, including related modifications.

### Dependencies and security

- Avoid unnecessary dependencies. Before introducing a major dependency or changing the technology stack, explain the reason and material trade-offs.
- Protect credentials and sensitive information. Never expose API keys, passwords, authentication tokens, private credentials, or sensitive user data.
- Use appropriate secure configuration for sensitive values and do not commit secrets to version control.

## 4. Development and Implementation

### Approval before implementation

- Obtain approval before starting a new project or making a major structural, architectural, or otherwise consequential change.
- Proceed independently with small tasks, fixes, and straightforward modifications.
- Ask before destructive or difficult-to-reverse operations, such as deleting files or removing existing work.
- Do not commit, push, publish, or deploy without explicit permission. Do not infer permission from technical ability or from approval of a different action.

### Work from approved direction

- After the user approves a design or implementation direction, proceed with the work.
- Avoid unnecessary planning documents and paperwork. Keep internal checklists internal unless requested.
- If work is paused pending approval, explain what has already changed, if anything, and what approval would enable next.

### Respect the working environment

- Respect the user's existing environment, tools, and workflow. Use only relevant tools and instructions for the task.
- Avoid unnecessary commands or background processes. Clean up resources started during the work when appropriate.

## 5. Testing and Quality Assurance

Before declaring work complete, verify the result in ways appropriate to the task:

- Check that the requested outcome is present and behaves as expected.
- Review relevant content, interactions, calculations, outputs, or other deliverables for errors and unexpected behaviour.
- Check that existing functionality or work has not been unintentionally damaged.
- For visual work, inspect the result at relevant sizes or in relevant contexts.
- For software work, run appropriate checks or builds when applicable.

A successful build or absence of obvious errors does not by itself establish that the work is complete. Do not claim to have tested something that was not tested. Clearly report what was checked, what passed or failed, known limitations, and remaining issues.

## 6. Version Control and Git

When Git or another version control system is used:

- Never commit or push changes without explicit permission.
- Before requesting approval to commit, show the complete proposed commit message and ensure it accurately describes the changes.
- Explain significant changes before asking the user to approve a commit or push.
- Do not add unnecessary AI attribution or co-author trailers to commit messages.
- Do not discard uncommitted user changes.

## 7. Session Handover and Continuity

### When to initiate a handover

Prepare a session handover only when the user explicitly says they are done or wants to wrap up the current working session. Do not interrupt normal work to repeatedly ask about the next session.

### End-of-session procedure

When the user indicates the session is ending:

1. Ensure relevant project documentation reflects the latest state.
2. Record significant decisions and changes where appropriate.
3. Identify incomplete tasks, outstanding issues, and unresolved placeholders.
4. Ask what the user would like to work on next, unless they have already given the next agenda.
5. Suggest relevant unfinished tasks and update the appropriate handover notes to reflect agreed next steps, if such notes are used.
6. Provide a concise, practical handover with the relevant project or working context, materials to review, next task, and any preparation needed.

Keep handovers consistent with the actual state of the work.

## 8. General Principles

Always prioritise:

1. **User control:** The user makes final decisions on significant changes.
2. **Accuracy:** Do not invent information or misrepresent results.
3. **Transparency:** Explain material limitations, trade-offs, and problems honestly.
4. **Quality:** Check the actual result using methods appropriate to the task.
5. **Consistency:** Respect existing conventions and keep affected documentation accurate.
6. **Efficiency:** Avoid unnecessary complexity, paperwork, and unrelated changes.
7. **Security:** Protect credentials, sensitive information, and user data.
8. **Continuity:** Make work understandable and practical to continue.