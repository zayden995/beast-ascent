# BEAST ASCENT — GAME BIBLE (single source of truth)

> **Instructions for Claude Code (read this first, every session):**
> 1. Read this entire file at the start of every session, before writing or changing any code.
> 2. This file is the source of truth for the design. Do NOT invent mechanics, species, biomes, abilities or numbers that contradict it. If something is not specified here, make the simplest reasonable choice, record it in the "Decisions Log" at the bottom, and tell the user in your final report.
> 3. Build ONLY the milestone marked as CURRENT in "Milestone Status". Never build ahead.
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
| Space | Jump (Eagle: flap / ascend, from Milestone 2) |
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
- **Enemy AI states**: idle/wander, aggro, chase, attack, and **flee** (prey animals flee at low health or on sight).
- Enemies have a **visible level** above them so danger is readable (color-coded relative to the player's level).
- Defeated animals drop **food** (carcass) and give XP.
- Death: the player respawns at a **den** with a small penalty (lose some XP progress or growth-meter fill; never lose a life stage or level).

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
- Later milestones: larger world, minimap, day/night cycle, dens/rest spots.
- Not planned: massive streamed worlds, dungeons, NPC dialogue, crafting, multiplayer (multiplayer may be considered after Milestone 5).

Starter enemy roster (placeholders, to be refined; all enemy animals are data-driven):
- **Forest**: deer (prey, flees), boar (fights back), fox or rabbit (small and fast).
- **Jungle**: monkey, snake, capybara/tapir.
- **Plains**: zebra/antelope (prey), hyena, buffalo.
- **Winter**: arctic hare, seal, arctic fox.
- Wild animals also can include other predator species not chosen by the player, so players meet "competing" animals.

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

Menus: Title screen -> Species select (3D turntable preview showing stats, diet, favored/disfavored biomes, variant toggle for bear) -> Game. Pause menu. Tab growth/ability menu (unlock abilities, see growth meter, evolve button when eligible).

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
| M4 | Larger open world, minimap, day/night cycle, dens/rest spots |
| M5 | Audio, boss phases, balance pass, polish, settings, optional glTF art |
| After | Optional: multiplayer, touch controls, real animal art (Higgsfield or free glTF assets) |

### Milestone Status
- M1: **CURRENT** (not started)
- M2 to M5: not started

(Update this list at the end of every session.)

---

## 10. Milestone 1 Scope (CURRENT)

- Title screen -> species select (3D turntable preview, stats, diet, favored/disfavored biomes) -> Forest world.
- Playable: **Wolf, Lion, Bear (brown and polar)**. Other species shown as locked "Coming soon".
- **Forest biome**: rolling terrain, trees, rocks, grass, a pond, fog, sky, world boundary, a den respawn point.
- Player: walk, sprint, jump, dodge, basic attack, plus one working signature ability per species. Third-person camera with smooth orbit.
- **3 wild enemy types** with AI (for example a fleeing prey animal, a fighting boar-type, a small fast animal). They respawn and drop food.
- XP and levels, ability points, **at least 3 unlockable abilities per playable species**.
- Food and growth meter, and **Juvenile -> Adult** evolution (Alpha can be a stub that is clearly marked as a TODO).
- Full HUD as in Section 7, including the biome buff/nerf indicator.
- **Forest boss**: a large animal in an arena. Defeating it shows "Forest Ruled" and opens a gate to the (stubbed) next biome.
- Death and respawn at the den with a small penalty.
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

## 16. Known Issues / TODO

(Empty. Add items here as they come up.)
