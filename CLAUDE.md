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
- M1: **CURRENT**. Built on 2026-11-13; every automated check passes (see "Verification"). Waiting for the user's own playtest and sign-off. Do not start M2 until the user says M1 is accepted.
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

### Commands
- `npm install`, then `npm run dev` to play (open the printed localhost address).
- `npm test`: unit tests for the rules in `src/logic` and the data in `src/data` (Node's built-in test runner, no extra dependency).
- `npm run test:e2e`: starts the dev server, opens the game in headless Chromium, plays the whole M1 loop with real key and mouse events for all three species, fails on any console error, and writes screenshots to `tests/e2e/screenshots/`. First time on a new machine: `npx playwright install chromium`.
- `npm run build`: typecheck plus a static site in `dist/` (relative paths, so it works from any sub-folder).
- Adding `?debug` to the URL (or running in dev) exposes `window.__beast` test hooks: step the simulation, teleport, grant XP. They are not present in a normal production page.

### State at the end of the M1 session (2026-11-13)
- Passing: 26 unit tests, 74 browser checks, production build, and a load of the built `dist/` from a sub-path.
- Not verified: frame rate on a real graphics card (the test browser renders in software), and how the game feels to play. Balance numbers are a first pass that no human has tuned yet.

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

## 16. Known Issues / TODO

### Stubs (marked `TODO` in code)
- **Alpha stage** (M2): defined in `src/data/stages.ts` but locked by `TUNING.maxPlayableStage = 'adult'`. The Tab menu and HUD say it arrives in Milestone 2.
- **Tiger, Elephant, Crocodile, Eagle** (M2): data only. Their stats and abilities are placeholders, and each placeholder ability has a `todo` note in `src/data/abilities.ts`. The rig cannot yet draw stripes, a trunk, a long crocodile jaw, or wings.
- **Plants as food** (M2): defined in `src/data/food.ts`, no source in the world yet (no herbivore is playable).
- **Gate to the Jungle** (M3): opens after the boss; pressing E only shows a message. Jungle, Plains and Winter are palette stubs in `src/data/biomes.ts`.
- **Boss phases, audio, settings** (M5): not started.

### Known rough edges in M1
- The camera can pass through trees and rocks; nothing moves it out of the way.
- Enemy level tags are visible through trees and hills.
- Animals do not path around obstacles; they slide along them.
- The player can walk around behind the gate (there is nothing there).
- Animal models are simple shapes. They read as wolf, lion and bear, but they are placeholders for nicer art.
- Balance is untuned by a human: fight length, XP pace and boss difficulty are first guesses in the data files.
- Frame rate on real hardware is unmeasured. A typical frame is about 270 draw calls and 340k triangles, which should be comfortable for a mid-range laptop.
- After pressing Esc, browsers refuse to re-lock the mouse for about a second. Resuming with the Resume button works; resuming by pressing Esc again may need one click on the game.
- `node_modules` sits inside a OneDrive folder, which makes installs slow and syncs thousands of files. Consider excluding it from sync or moving the project out of OneDrive.

### Notes for Milestone 2
- Set `TUNING.maxPlayableStage` to `'alpha'` and `TUNING.currentMilestone` to `2` in `src/data/tuning.ts`. Species unlock from their `playableFrom` value, and the save validator follows both settings.
- New rig features go in `src/animals/ProceduralQuadruped.ts` (see `FeatureId` in `src/core/types.ts`). The eagle needs a second class behind the same `AnimalModel` interface; `createAnimalModel` in `src/animals/AnimalModel.ts` is the one place that chooses a rig.
- Flight needs changes in `integrate` (`src/systems/actor.ts`) and the jump handling in `src/systems/player.ts`.
- Abilities are data. An existing effect kind (`leap`, `melee`, `aoe`, `buff`, `passive`) needs only a data entry; a new mechanic (hit from behind, grab, "unseen") needs a new field in `AbilityEffect` and its handling in `src/systems/abilities.ts`.
- Extend `tests/e2e/smoke.mjs` with a section per new species, as done for the lion and the bears.

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