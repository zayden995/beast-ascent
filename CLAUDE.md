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
| J | Admin panel (only in an admin sandbox game, see "Verification") |

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
  - **Herbivore**: fruit, plants, bushes, and (added in the M2 review) leaves, fruit and nuts from trees and the fox food reserves.
  - **Omnivore**: carcasses, fish, fruit, plants, leaves and nuts (the bear is an omnivore).
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
- **Enemy AI states**: idle/wander, aggro, chase, attack, and **flee** (prey animals flee at low health or on sight). Fleeing animals sprint in short bursts, then tire (a tired deer or fox moves at about 45% of its sprint, below the slowest species' walk), and slow down as they are wounded, so that every playable species can run them down even though prey may out-sprint the slowest predators (the Eagle, slow on foot, hunts by flying low over its prey).
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
| Eagle (Bald Eagle) | Winter: +20% speed | Jungle: -20% speed (dense canopy) |

Species not listed as favored or disfavored in a biome get no modifier there.

**Night (added in the M2 review at the user's request)**: the Bald Eagle has **limited vision in the dark**. At full night its enemy level tags (and Eagle Eye) reach half as far (21 m instead of 42 m, 45 m instead of 90 m) and the fog closes in to 60% of its daytime distance; both fade in through dusk and fade out through dawn. The HUD shows "Night: limited vision" and the species screen lists it. No other animal has it (it is data: `nightVision` on a species variant).

### 4.5 Bosses and ruling a biome
- Each biome has **one boss**: a large unique animal fought in an **arena**.
- Defeating the boss = **that biome is ruled**. A "Biome Ruled" message appears and the gate to the next biome opens.
- The boss **returns every time the player leaves the biome and comes back** (like a domain boss). The biome stays ruled and its gate stays open; beating the boss again unlocks nothing new and pays only a small repeat XP (Forest: 300 XP the first time, 50 XP after that).
- Biome order: **Forest -> Jungle -> Plains -> Winter** *(tunable)*.
- The player may freely re-explore ruled biomes and any biome already unlocked.
- **Travelling (built in M3)**: each biome is its own map. The gate north of a biome's arena leads on to the next biome once its boss is beaten (press E at it); a gate at the south edge of every biome after the first leads back, and is always open. An animal arrives just inside the gate at the other end. The game saves which biome the animal is in; Continue Game and a death both wake it at that biome's den.
- **Win condition**: all four biomes ruled.
- Bosses: Forest = the **Ancient Stag** (level 10); Jungle = the **Great Silverback**, a giant gorilla (level 20, built in M3). Ideas for the rest (placeholders): Plains = giant buffalo or mega hyena pack leader; Winter = giant mammoth-like beast or ice-wolf alpha. Bosses get phases in Milestone 5.

### 4.6 Save system
Save to **localStorage**, in **four save slots** (added after M2 at the user's request, like the LEGO games). **Each slot holds one animal**: selected species and variant, level, XP, life stage, growth meter, wounded mark, unlocked and ruled biomes, the biome it is in (since M3), unlocked abilities. New Game picks a slot for a new animal; Continue Game picks a saved animal. Wrap all storage calls in try/catch because storage can fail. Saves live in the player's browser (there is no login), so another browser or device, or cleared site data, starts with four empty slots.

---

## 5. World

- Four biomes, each with distinct terrain, plants, enemies, boss arena and den spots.
- Early milestones: one biome at a time, with a bounded world (world boundary).
- A **day and night cycle** runs in every biome (built in M1 at the user's request; 6 minutes per day; visual only for now, with one exception: the Bald Eagle has limited vision in the dark, see section 4.4).
- The Forest has **four ponds** (a big one, two middle-sized, one small), each with fish. Fish swim away from an animal that wades in (a little chase, never faster than the slowest fish-eater can swim), and wild animals now and then walk to a pond and drink at its edge.
- The **den is a safe refuge**: a ring of pale stones marks it, wild animals never enter it, and they ignore a player who is inside. Every biome has one.
- The **Jungle** (built in M3, as the user pictured it: more trees, bumpier ground, flowing rivers, a waterfall, a hill): a flat-topped hill in the west with a spring and a shallow stream on top; the stream goes over the hill's east side, which is a **cliff**, as a **waterfall** into a plunge pool; from the pool a **river** winds across the middle of the map to a lily-pad lagoon in the south-east, with one shallow ford. Tall canopy trees and palms (640 trees, the Forest has 430), hanging vines, ferns, mud at the water's edge. A **cave** stands deep in the trees east of the boss's arena (on the right as an animal comes in from the south, 62 m from it), its mouth toward the arena, with a trail kept clear of trees leading to it, carcasses inside as bait and a nest of snakes guarding them: see the Decisions Log.
- **Rivers flow**: the water carries any animal that is in it downstream (the user: a real current, but not too strong, a little resistance). Strongest in the middle, nothing at the banks, less in shallow water. Every animal can swim against it. The stream on the hill carries an animal over the waterfall, unhurt.
- **Cliffs** (the Jungle): ground too steep to climb stops an animal, which slides along its foot; an animal that ends up on a cliff face slides down it. The Forest has no cliffs.
- Later milestones: larger world, minimap, dens/rest spots.
- Not planned: massive streamed worlds, dungeons, NPC dialogue, crafting, multiplayer (multiplayer may be considered after Milestone 5).

Starter enemy roster (placeholders, to be refined; all enemy animals are data-driven):
- **Forest**: deer (prey, flees), boar (fights back), fox or rabbit (small and fast).
- **Jungle** (built in M3): capybara (prey, flees), monkey (small, fast, in troops), tapir (fights back, charges). Rivals: two tigers, each alone, and two crocodiles that live in the river and the lagoon. **Snakes** (built later the same day, with a legless body rig): a few lie about the undergrowth, and a nest of bigger ones guards the cave beside the boss's arena.
- **Plains**: zebra/antelope (prey), hyena, buffalo.
- **Winter**: arctic hare, seal, arctic fox.
- Wild animals also include the other predator species not chosen by the player, so players meet "competing" animals. In the Forest (built in M1): a pair of wolves, a lion and a bear, each in its own territory; the player's own species is left out, so a wolf meets 2 rivals, a lion or bear meets 3, and (from M2) a Tiger, Elephant, Crocodile or Eagle meets all 4. The limit is 5 rival animals per species. Rivals for the new species live in their home biomes: tigers and crocodiles in the Jungle (M3), the Elephant on the Plains (still to build).

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
| Crocodile (alligator skin variant) | Ambusher, a little slow on land and fast in water, strong near water, death roll | Carnivore | M2 |
| Eagle (Bald Eagle) | Flying, dive attacks, long reach, the most fragile | Carnivore | M2 (flight) |

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

Menus: Title screen (New Game and Continue Game, plus Admin sandbox when the address has `?admin`; the biome's animals roam peacefully behind it) -> Save slots (four; New Game picks a slot for a new animal, Continue Game picks a saved animal) -> Species select, for a new animal only (3D turntable preview showing stats, diet, favored/disfavored biomes, variant toggle for bear) -> Game (in the biome the animal was last in). Pause menu. Tab growth/ability menu (unlock abilities, see growth meter, evolve button when eligible).

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
| M4 | Larger open world, minimap, dens/rest spots. (The day/night cycle was built early, in M1. Gameplay effects of night, if wanted, belong here; the only one so far is the Bald Eagle's limited night vision, added in the M2 review.) |
| M5 | Audio, boss phases, balance pass, polish, settings, optional glTF art |
| Back to after M5 | **Different animals start in different biomes**: choosing an animal decides which biome the player starts in (user request, 2026-11-14; which biome suits which animal is still to be decided, and it needs the M3 biomes) |
| After | Optional: multiplayer, touch controls, real animal art (Higgsfield or free glTF assets) |

### Milestone Status
- M1: **DONE, accepted by the user on 2026-11-14.** Built on 2026-11-13, then revised the same day after the user's two rounds of playtest feedback (catchable prey, boss returns on re-entry and pays 50 XP after the first win, day and night cycle of 6 minutes, death resets the animal, animals on the title screen, a safe den refuge, rival predators). See the Decisions Log. Every automated check passes (see "Verification"). Acceptance was inferred from "seems good" plus the user's wish to start M2; the user did not separately comment on the camera, UI style or the `@types/three` dev dependency, so those stand as built.
- M2: **ACCEPTED by the user on 2026-11-17** ("i think M2 is good"; the review batch below is part of it). Earlier status line, kept for the record: BUILT, waiting for the user's review. All six steps are done: (1) Alpha stage, the new death rule, the 12 m den ring and the rival limit of 5; (2) Tiger, plus the sight rule the user asked for; (3) Elephant, with plants as food; (4) Crocodile; (5) Eagle with flight; (6) the title-screen cast, the docs and a clean test run. 60 unit tests, 175 browser checks, typecheck and production build passed at that point (142 and 252 after the review batch below). The task list is in `PLAN.md`. **Commits:** all of M2 is committed (`67cbf62`, `fc3c90e`, `ea93f66`). Pushed with the rest of the batch on 2026-11-15 (the user asked to push only after every step was committed).
- Save slots (a feature the user asked for after M2, built before M3): **BUILT and committed** (`bbc365f`; pushed). The title has New Game and Continue Game; both open four save slots, each holding one animal. See section 4.6 and the Decisions Log.
- Review of M2 (the user's feedback of 2026-11-14 and 15, plan agreed 2026-11-15): **ALL BUILT, COMMITTED AND PUSHED (2026-11-15)**, waiting for the user's review. Step 1, the admin sandbox (`a469fe6`); step 2, animal balance with the Bald Eagle and its night vision (`52c8456`); the Eagle's pace on foot, asked for after step 2 (`069ac22`); step 3, water: four ponds, fish that dodge, drinking animals and a title around the water, plus the fix for the test browser trapping the user's mouse (`bc230a2`); step 4, food: leaves, fruit and nuts on trees and the two fox food reserves (`4f574a9`); step 5, the final docs and checks (see below). The decisions are in the Decisions Log, the list of requests in section 16. 142 unit tests, 252 browser checks (run several times in a row), typecheck and production build pass.
- M3: **CURRENT. Step 1 of 3 (the groundwork and the Jungle) is BUILT on 2026-11-17, waiting for the user's review; committed on `main` and pushed to `origin/main` on 2026-11-17 (`4fede1c`), and live on Vercel (the user confirmed it works).** Built: one world class that makes any biome from data, travel through the gates both ways, the biome saved with the animal, the Jungle's map (hill, cliff, waterfall, stream, river with a current, lagoon), its trees and plants, its animals (capybara, monkey, snake, tapir, rival tigers and crocodiles), its boss (the Great Silverback, a gorilla), a cave deep in the trees east of the boss's arena with a nest of snakes and carcasses as bait, a Biome row in the admin panel, and a camera that moves in front of trunks and rocks. 185 unit tests, 311 browser checks, typecheck and production build pass (see the Decisions Log entries "M3, tests" and "M3, snakes, gorilla and cave" for how often the full browser run passed every check). **Still to build in M3: the Plains, then Winter** (one at a time, each reviewed by the user; the user plans to build them with Sonnet 5.5). The task list is in `PLAN.md`.
- M4 and M5: not started

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
- Save and load via localStorage. (As built in M1: one save. Four save slots since the work after M2, see section 4.6.)

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
- `npm run test:e2e`: starts the dev server, opens the game in headless Chromium, plays the whole M1 loop with real key and mouse events for all three species, fails on any console error, and writes screenshots to `tests/e2e/screenshots/`. First time on a new machine: `npx playwright install chromium`. The test browser uses a stand-in mouse lock (`tests/e2e/pointerLock.mjs`) so that it cannot trap the cursor of whoever is at the computer; `REAL_POINTER_LOCK=1 npm run test:e2e` uses the browser's own lock instead (then the cursor is released at the end).
- `npm run build`: typecheck plus a static site in `dist/` (relative paths, so it works from any sub-folder).
- Adding `?debug` to the URL (or running in dev) exposes `window.__beast` test hooks: step the simulation, teleport, grant XP, set the time of day (`__beast.setTimeOfDay(0)` is midnight, `0.5` is noon). `__beast.travel('jungle')` goes through a gate as pressing E would. They are not present in a normal production page.
- Adding `?admin` to the URL (also on a deployed copy) adds an **Admin sandbox** button to the title screen. It starts a game that belongs to no save slot and saves nothing; press **J** in it to open the admin panel (switch to any animal, set its life stage, level, ability points, growth meter, wounded mark, ability ranks and whether the Forest is ruled). It is for reviewing the game without playing through the progression. Since M3 the panel also has a **Biome** row: one click puts the animal at the den of any biome that is built (the Forest, the Jungle), unlocked or not.

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

- 2026-11-14 (save slots, after M2): **Four save slots, one animal each**, as the user asked ("like the LEGO games"; the user confirmed that a slot holds one animal, not a whole account with all seven species). The title screen always shows **New Game** and **Continue Game**. Continue Game is greyed out until something is saved. Both open the same four-slot screen. **New Game**: any slot can be picked; a slot that holds an animal asks "Replace slot N?" first, and nothing is erased until the player presses Begin on the species screen (backing out keeps the old animal). **Continue Game**: only slots with an animal can be picked. Every save (autosave, pause, quit) goes to the slot the animal was started in (`Game.slot`). The slot screen keeps `screen === 'title'`, so the forest animals keep roaming behind it, and the species screen's button says "Back to slots". Each slot card shows `Stage Variant, level N` and the biomes ruled (or "No biome ruled yet"). Storage: one key per slot (`beastAscent.save.slot1` to `slot4`, `TUNING.save`); the save format itself is unchanged (version 1). The rules are pure logic in `src/logic/saveSlots.ts` (unit-tested); `src/systems/save.ts` wraps localStorage. **Your existing save is not lost**: on start, the single save of earlier versions (`beastAscent.save.v1`) is copied into the first empty slot and the old key is removed only after the copy reads back; an unreadable old save is left alone. Choices made by me, not the user: no Delete button (a slot is freed by replacing it); the replace question comes before species select; Continue Game gets the highlighted look when a save exists, New Game when none does; the slot cards use the existing signpost style (planks on a bark plaque, the slot number on a key cap). Found by looking at a screenshot: the HUD already used the CSS class `slot` for ability icons, which squashed the first version of the slot rows, so they are named `save-slot`.

- 2026-11-15 (review of M2, step 1): **Admin sandbox**, asked for by the user because reaching the late stages takes a long time and they wanted to review every animal quickly. It exists only when the address has `?admin` (a third button on the title; nothing in the game links to it). Choices made by me, not the user: **it stays in the finished game, hidden behind `?admin`** (the user left this to me); it is a **sandbox game that belongs to no save slot** (`Game.slot` is `null`, and `save()` writes nothing), so nothing done there can overwrite one of the four animals, and the title's Admin sandbox starts at the species screen, whose back button goes to the title; **J** opens the panel, which pauses the game like the Growth menu and works only in sandbox games; the pause menu says "Leave the sandbox (nothing is saved)" and a badge on screen says nothing is saved. The panel (`src/ui/adminPanel.ts`) sets the animal and skin (all nine), the life stage, the level, the ability points, the growth meter, the wounded mark, whether the Forest is ruled (which opens its gate and unlocks the Jungle), and every ability's rank (rank 3 for all, or reset). The rules are pure logic in `src/logic/admin.ts` (unit-tested): a stage change raises the level to the stage's first level but never lowers a higher one and empties the meter; a level change recomputes the points as "earned minus spent"; ranks are clamped, the signature ability is never locked, and a rank costs no points; the meter is clamped to the stage's meter (an Alpha has none); a Juvenile is never wounded. **The stage changes live** (the model, stats and size follow at once, through `Growth.adminEdit`), **switching animal restarts the sandbox** (species and skin cannot change while a game runs) and keeps the stage, level, growth and wound, with the abilities starting again. Not included, because it was not asked for: god mode, teleports, spawning animals. Found by testing: after switching animal the game asked for the mouse a moment after the panel had opened, so the panel could not be clicked; a sandbox restart no longer asks (`startGame(..., lockPointer = false)`), and a browser check guards it. The `?admin` flag is not a secret (anyone can type it), which is fine for a single-player game; the older `?debug` test hooks have always been reachable the same way.

- 2026-11-15 (review of M2, step 2): **Animal balance**, as agreed with the user. **Elephant** back to walk 4.2 and sprint 7.2 (the slowest animal; M2 had raised it to 4.7 and 8.0 only to keep prey catchable). **Crocodile** walk 4.4 and sprint 7.4 on land, and it swims at 1.8 times its walking pace, about 7.9 m/s (measured 7.92 in the browser test), faster than its land sprint. The new species field `swimSpeedMult` holds this (every other animal keeps the 60% standard, `TUNING.player.swimSpeedMult`, which the user said is fine for now); the rule is `swimSpeedFactor` in `src/logic/stats.ts`. **Water Ambush no longer gives swim speed** (it was +60%, which still left the Crocodile slower in water than on land); it keeps the +35% damage in water. **Prey tire sooner**: a winded deer or fox moves at 45% of its sprint (about 3.3 and 3.4 m/s; it was 55% and 60%), below the Elephant's walk of 4.2, with the bursts unchanged (3.5 s and 2.5 s). The old unit-test rule "every fleeing animal sprints slower than the slowest species" is replaced by "a tired animal is at least 15% slower than the slowest walker", and the browser test's hunts prove the catching (in two runs the Elephant took 11 and 24 s and the Crocodile 24 and 12 s per deer, for a bot that never misses, against 6 to 10 s for the others; a person will take longer). **Knock-on change not asked for by the user, made by me**: the Elephant's new sprint of 7.2 is below the rival wolf's 7.8 and the rival lion's 7.4, which broke the M1 rule that a fight can always be escaped, so I lowered those two rivals' sprint to 7.0 (a unit test still checks the rule). **Bald Eagle** (the Golden Eagle renamed; the variant id stays `default` so older saves load): dark brown body (0x4a3322), white head and tail (new optional `head` and `tail` colours in `BodyColors`, used by the bird rig), yellow beak and talons; health 65 to 50 (the least of any animal, under 60% of everyone else's, a unit test); basic reach 1.2 to 2.0 m and Talon Grab 1.6 to 2.2 m at Adult size (Juvenile 0.6x, Alpha 1.4x); its biome buff moves from the Plains to **Winter, +20% speed** (Jungle -20% stays, nothing on the Plains), and the bible's table in section 4.4 is changed to match (the user agreed to the change in principle; Winter was my pick, to suit a bird of lakes and cold forests). **A flier can eat only from 2.5 m or lower** (`TUNING.flight.eatAltitude`, `withinEatingHeight`): an eagle can take a fish by skimming the water (over deep water its altitude is measured from the surface) but cannot eat from 20 m up; before this, eating ignored height. **Growth meter hint (option D)**: a full meter now reads "Fully fed, level 8 needed (340/525 XP)" (`meterLabel` in `src/logic/growthText.ts`, `xpForLevel` and `totalXp` in `progression.ts`); the meter sizes and XP numbers are NOT changed. Choices made by me: the Tab menu keeps its own text ("Reach level 18"); the eating-height limit is 2.5 m; the Bald Eagle's colours are my guess at the usual look.

- 2026-11-15 (review of M2, step 2, night vision): **The Bald Eagle has limited vision at night**, asked for by the user after step 2 was built, and built with it. It is the first gameplay effect of night (the bible had night as visual only). As approved by the user: at full night the level tags and Eagle Eye reach half as far (`sight` 0.5: 21 m instead of 42 m, 45 m instead of 90 m, and a boss tag 40 m instead of 80 m) and the fog distances shrink to 60% (`fog` 0.6: the Forest's far fog goes from 190 m to 114 m, measured in the browser test); both follow `daylight` (0 at night, 1 by day), so they fade in through dusk and out through dawn. The HUD adds "Night: limited vision" to the status line while daylight is below 0.5 (`TUNING.dayNight.limitedBelowDaylight`), and the species screen adds "At night: Limited vision". It is data (`NightVision` on a `SpeciesVariant`, only the Bald Eagle has it); the rules are `nightVisionFactor`, `visionLimited` and `tagRange` in `src/logic/vision.ts` (unit-tested); `Sky.setVisibility` scales the fog, `Game.vision` holds the current factors, and `Game.dispose` gives the shared sky its normal distance back. The level-tag range and boss-tag range moved into `TUNING.labels`. Choices made by me, not the user: the boss tag shrinks too; the label threshold of 0.5; I chose to apply the same 0.5 to Eagle Eye. Aim assist and what animals notice are NOT affected (the user was offered a harder debuff such as a shorter aim-assist range and chose the version above).

- 2026-11-15 (review of M2, eagle foot sprint): **The Eagle sprints slower on foot**, asked for by the user ("decrease the speed of the eagle sprinting on foot") without a number (I first made it 8 m/s, then the user asked for **6**: "have it sprint at 6 only"). Before this the Eagle used one sprint speed on the ground and in the air (12 m/s), so lowering `sprintSpeed` would also have slowed its flight. A sprint of 6 is below the Eagle's walk of 6.5, so Shift would have slowed it down; I offered three options and **the user chose A**: on foot the Eagle walks at about **4.2 m/s** (the Elephant's walk) and sprints at **6.0 m/s**, while flying stays 6.5 walking and 12 sprinting. Two species fields do this, and apply only while the animal is not flying (`PlayerController`): `groundWalkMult` 0.65 and `groundSprintMult` 0.5 (the browser test measured about 4.2 and 6.0 on foot and 12.00 in the air); `groundWalkSpeed` and `groundSprintSpeed` in `src/logic/stats.ts` are the rules, and they are the numbers to change. Consequences: on foot the Eagle can no longer outrun the rivals (7.0), so it escapes by **flying** (rivals ignore a flier above 5 m and give up above 6 m): the "a fight can always be escaped" unit test counts a winged animal's flying sprint, and another test checks that the Eagle out-flies every rival; on foot it is the slowest animal, level with the Elephant, and tired prey (3.3 and 3.4 m/s) are still slower than it, but **my claim that ground hunts would "just be slower" was wrong**: measured with the browser test's bot (which never misses), a Juvenile Eagle on foot caught a deer in only 3 of 6 tries within 120 s (37, 44 and 118 s), because the deer out-sprints it (7.4 against 6.0) and re-bolts as soon as it recovers. **Flying low over the deer works well**: 6 of 6 tries, in 7 to 9 s, with real stamina use (about 30 of 130 left). So the Eagle is now a hunter of the air: the browser test's hunt for the Eagle flies about a metre above the ground (the bot taps Space; `hunt(kind, seconds, { flying: true })`), and the bible's rule "every species can run down prey" holds for the Eagle by flying, not on foot. The user was told this; the Eagle's swimming pace follows its on-foot walk (about 2.5 m/s). The debug state gained `player.speed` (the current horizontal speed) for the browser test.

- 2026-11-15 (review of M2, step 3a, water bodies): **The Forest has four ponds**, as agreed with the user. `FOREST_LAYOUT.pond` became `FOREST_LAYOUT.waters` (a list of `WaterBody`: x, z, radius, depth and the number of fish) plus one `waterY` for the surface. The old pond is where it was (46, 12, radius 15, 4 fish); the new ones, picked by a scan of the terrain for natural low spots that satisfy the layout rules, are radius 11 at (-56, 16) with 3 fish, radius 9 at (-26, -26) with 2 fish, and radius 7 at (56, -74) with 2 fish (a corner of the Forest, 93 m from the middle), 11 fish in all. Unit tests (written first) check that every pond is inside the world, clear of the den and its refuge, the spawn point, the arena and its flattened ring, the gate, the berry bushes and each other, that each is a bowl below the water line with dry ground all round, and the rules `bodyAt` and `nearWater` in `src/logic/water.ts`. The height field, terrain colours, water meshes, "near water" (the Crocodile's Jungle buff), where grass and animals may stand, the animals' swimming and the fish all follow the list. **The trees and rocks moved**, as the user accepted (the world is generated from a seeded random sequence that skips water); the berry bushes stay at their fixed spots, and a unit test checks that none is near water. A browser check swims the player in every pond. A map of the new layout was shown to the user. Step 3b was built next, see the following entry.

- 2026-11-15 (review of M2, step 3b, fish, drinking, title): **Fish dodge, animals drink, the title circles the pond.** **Fish** (`src/logic/fish.ts`, `TUNING.fish`): a fish swims away from an animal that is in the water within 6 m, at 2.2 m/s, and darts at 3.0 m/s for 0.5 s when the animal gets within 1.6 m (then 2.5 s before it can dart again); it never leaves the water (at the shore it slides along it), its swimming circle stops while it flees, and once left alone it drifts back to the circle at 1 m/s. Only an animal that is wading or swimming alarms them, so an eagle skimming the water does not (it keeps its advantage). Unit tests check that the slowest fish-eating swimmer (the Bear, about 2.9 m/s) is faster than a fleeing fish (2.2) and than its average pace (2.4), so every fish-eater can catch one, with a little chase; the Crocodile (about 7.9) catches them easily. **Drinking** (`TUNING.drink`): when a wild animal picks its next walk, 25% of the time it walks to the nearest pond within 30 m instead (if the spot is within 80% of its leash, on open dry ground, outside the den's refuge), stands facing the water 1.3 m from the shore with its head down for 4 to 7 s, and then carries on; anything that disturbs it (a stun, a hunter, a fight) ends the drink. Bosses never drink; the Crocodile and the title's wading animals do not either. A new head-down animation (`AnimState.drinking`, `Actor.drinking`) lowers the neck of the four-legged rig. The title scene's roaming animals do the same (`src/systems/ambient.ts`). **Title scene**: the cast (the same 13 animals) now stands on every shore of the big pond (the crocodile lies in the water, the bear wades) and the camera swings along an arc at 26 m from the middle of the pond (`FOREST_TITLE.view`, `titleCameraPose` in `src/logic/titleView.ts`), looking 8 m to one side of the pond so that the animals sit right of the lettering. Choices made by me, not the user: the camera cannot circle the whole pond, because the forest around it is dense (the longest arc where the camera is 6 m from every tree and rock and has a clear view of the pond is 78 degrees, from west-south-west to north-west, found by scanning the real forest); a browser check walks the whole arc and fails if a tree or rock gets in the way; the title view type changed from a straight pan to an arc. Wolves and the lion sometimes stand behind the title lettering from some angles. Found by testing: a held animal in the browser test helper kept its drink and turned to face the water, which made a sight test fail once; the helper now cancels a drink. Also found by testing: when the title scene was built, each animal started at the map origin, so its very first placement could be a drink measured from there, and two foxes were put at the middle pond (55 m from home); the first placement now never drinks (`pickTarget(r, false)`), and the browser check that title animals drink only at the big pond catches it.

- 2026-11-15 (review of M2, step 4, food): **Tree food and the fox food reserves**, as agreed with the user. **Trees** (`src/logic/treeFood.ts`, `src/systems/treeFood.ts`, `TREE_FOOD` in `src/data/food.ts`): every tree has leaves (growth 3, healing 4%, the poorest food, as the user asked for "a little lesser"); exactly 1 in 8 broadleaf trees bears fruit (growth 8, shown as red dots among the leaves) and exactly 1 in 4 pines bears nuts (growth 10, shown as cones): 31 fruit trees and 46 nut trees in the Forest, chosen from the Forest's seed so they are the same every time and spread out. A plant-eater (Elephant, Bear) stands at the trunk and presses E: it is offered the fruit or nuts first, then the leaves; taking one does not strip the other; a bare tree grows back after 60 s. Only plant-eaters get a prompt at a tree (a wolf walking through a forest is not nagged at every trunk). New food kinds `leaf` and `nut` are for herbivores and omnivores only. The user's "a little lesser XP" for leaves was read as less growth (food gives growth, never XP). **Fox food reserves** (`FOREST_LAYOUT.foxReserves`, `RESERVE_PRODUCE`): two, at (-24, 8) and (48, -32), found by scanning the Forest for open ground (no tree or rock within 7 m, clear of the ponds, den, arena and gate; unit-tested); each is a patch of dark earth ringed with stones with one of each carrot, sweet potato, corn (plants) and apple, berries, cherry tomato (fruit), each worth 12 growth and back after 120 s. They are guarded by 3 and 4 foxes (`guardOf` on a spawn zone) that stay **calm** (`EnemyActor.calm`) until the reserve is raided or they are attacked, besides the 5 foxes spread through the Forest as before (12 in all). Eating from a reserve angers every living fox within 15 m (`foxesToProvoke`): they stop being calm and attack. Choices made by me, not the user: the user spoke of a "den" once, and I built food reserves only (as the plan said); the guards roam within the guard zone plus 2 m of the middle of the reserve (`guardWanderRadius`) and never walk off to drink, so that a raid always reaches all of them (found by testing: the foxes' normal 14 m roam, and a walk to a pond 21 m away, each took a guard out of range); the reserves' places; reserve produce is worth 12, more than nuts. The debug state gained `calm`, `provoked`, the reserve and label of food items, and `treatTrees()`. Found by testing: the reserve's carrots and corn are plants too, so the browser test's plant counts now skip reserve items.

- 2026-11-15 (tests, the user's mouse): **The test browser trapped the user's real cursor, and that is fixed.** The user kept finding their mouse stuck in the top-left of the screen while the tests ran, and afterwards. Measured with a watcher on the Windows cursor clip during a full run: about 40 s in, the clip changed from the whole screen (0,0 to 1707,1067) to 0,0 to 853,480 (the browser window) and stayed after the browser had closed, until it was released by hand. Cause: the game takes the browser's pointer lock when a game starts (for mouse-look), and in the test browser that real lock confines the real cursor to the window. Fix: the browser test (`tests/e2e/smoke.mjs`) replaces the page's pointer lock with a stand-in (`stubPointerLock` in `tests/e2e/pointerLock.mjs`) that gives the game the same `document.pointerLockElement`, `pointerlockchange` event and `exitPointerLock` and never touches the system; every pointer-lock check still passes (mouse look, pause on losing the lock, resume, the Tab menu), and a watcher run showed no change to the clip at all. `REAL_POINTER_LOCK=1` opts back in to the real lock (and then releases the clip at the end with `releaseCursorClip`). The same stand-in is used in every throwaway browser script. A browser or tab that is left open must also be closed afterwards; I check for leftover processes.

- 2026-11-15 (tests): **Another flaky browser check was found and fixed.** In one run the bear section failed 3 checks ("omnivore can eat berries", "berries give growth", "Arctic Swimmer gives +50% growth from fish"). Cause: the test stands at a fixed berry bush, but leafy plants (added with the Elephant) grow in random places, and when one grew beside the bush the nearest food was the plant (growth 7, not 6), which also shifted the next growth number by one. It is a test problem, about a 1 in 50 chance per run; the test now clears any plant within 8 m of the bush first. The game itself was right: the nearest food is offered.

- 2026-11-17 (M3): **M2 is accepted** by the user ("i think M2 is good"). **M3 is built one biome at a time**: the groundwork and the Jungle first, then the Plains, then Winter, each reviewed by the user before the next. The user asked which Claude model suits the milestone; advice given: the strongest model for the groundwork and the Jungle (rivers, a waterfall and cliffs touch many systems), a lighter one for the Plains and Winter once biomes are data. The user built the Jungle with Fable 5.2 and plans Sonnet 5.5 for the other two.
- 2026-11-17 (M3, groundwork): **One world class makes every biome** (`BiomeWorld` in `src/world/world.ts`; it replaces `ForestWorld` in `forest.ts`). A biome's map is data: a `BiomeLayout` (`src/core/layout.ts`: terrain numbers, den, spawn, ponds, rivers, an optional hill and waterfall, arena, gates, counts of trees, rocks, grass and plants, and a `style` for the look of its plants). `BIOME_LAYOUTS` and `BIOME_SPAWNS` in `src/data/biomes.ts` hold the maps and animals of the biomes that are built; the Jungle's are in `src/data/jungle.ts`. `createHeight(layout)` in `src/logic/heightfield.ts` makes any biome's terrain (the Forest's numbers are unchanged). **The Forest was checked to be exactly as it was**: a fingerprint taken in the browser before and after the change (all 430 trees with their sizes, the ground height, water depth, blocked and open ground on a 4 m grid over the whole map, and the number of meshes and instances) is identical byte for byte. To keep that true, everything a biome adds beyond the Forest's features (rivers, the waterfall, lily pads, ferns, vines) uses its own random sequence, so adding to it never moves a Forest tree.
- 2026-11-17 (M3, the Jungle's map): built as the user pictured it ("more trees, bumpier surfaces, flowing rivers, maybe a waterfall, a hill"). World radius 112 m. **Bumpier**: rolls of 5.0 m (Forest 4.4) and small bumps of 1.0 m (Forest 0.45). **More trees**: 640 against 430, closer together (3.1 m against 3.6 m), with only a few small clearings. **The hill**: a flat top 14 m high and 32 m across, at (-52, -4); its sides fall to the land over 28 m and can be walked, except the east side, which is a **cliff** about 22 m wide where the ground drops within 4 m. **The spring and the stream**: a pond of 5 m radius on the hill and a stream 3.6 m wide and 0.5 m deep (it is waded, not swum) that runs 21 m to the lip of the cliff. **The waterfall**: the water falls 13.6 m and lands 4.6 m out, in a plunge pool of 9 m radius. **The river**: 106 m long, 7 to 8 m wide and about 1.7 m deep, from the pool east and then south to a lagoon of 14 m radius with 18 lily pads; where it turns south there is a **ford**, 11 m wide and 0.4 m deep. The river and the hill lie across the middle of the map, so the way from the den (south) to the arena (north) crosses the river or goes over the hill. Fish live in the three ponds (4, 5 and 2), not in the river. 12 fruit bushes (two on the hill), 34 leafy plants. Choices made by me, not the user: every number and position above; a ford; that the river ends in a lagoon instead of leaving the map (the edge of the world is a wall); no fox-style food reserve in the Jungle.
- 2026-11-17 (M3, rivers and the current): the user chose **a real current, "not TOO strong, just enough to provide a little resistance"**. A river is a line of points with a width and a depth at each (`RiverDef`), smoothed into short pieces (`buildRiver` in `src/logic/river.ts`); the same curve carves the channel in the ground, draws the water and drives the current. The current is 1.2 m/s in the middle of the river and 1.0 m/s in the stream (`current` on each river), falls to nothing at the banks, and pushes less in shallow water (`depthGrip`: a quarter of its strength where an animal only paddles, all of it from 1 m deep, `TUNING.river.fullCurrentDepth`). It moves any animal that is in the water, the player and wild animals alike (`integrate` in `src/systems/actor.ts`), not fish and not a flier. The slowest swimmers (the Elephant and the Eagle, about 2.5 m/s) keep about half their pace against it; a unit test holds every river to at most half the slowest swimmer's pace. Measured in the browser test with an adult Elephant: left alone it drifts 3.6 m in 3 s; in 2 s it swims 7.2 m downstream but only 2.5 m upstream. A river is cut off square at its ends, so the stream's water stops at the lip of the cliff; its last point is a step past the edge of the hilltop, so **the stream carries an animal that stands in it over the waterfall**. There is no fall damage. Water on the hill has its own height (`surfaceY` on a pond or river); swimming, wading, fish and "near water" all read the water at the animal's own spot (`BiomeWorld.waterSurface`). The Crocodile's "+25% damage near water" counts rivers. Wild animals drink at river banks as well as at ponds (`drinkSpot` in `src/logic/water.ts`).
- 2026-11-17 (M3, cliffs): a new rule, **only in a biome whose terrain names a `maxClimbSlope`** (the Jungle: 1.6, about 58 degrees; the Forest names none and is unchanged). Ground that rises more steeply than that ahead of an animal stops it (`climbStep` in `src/logic/climb.ts`; the animal slides along the foot of the slope instead of sticking), whether it walks, sprints, dodges, jumps at it or is knocked into it. Going down is always allowed: an animal can walk off the top and fall. An animal that ends up on ground a quarter steeper still slides to the bottom at 7 m/s (`slideStep`, `TUNING.cliff.slideSpeed`), which is what takes it from the lip of the waterfall into the pool. Fliers ignore all of it. Steep ground is drawn as bare rock (`rockSlope`). Unit tests: the cliff face cannot be climbed, every river bank can, and from the den every place that matters (arena, both gates, the hilltop, the spring, the foot of the waterfall, the lagoon, every spawn zone and fruit bush) can be reached on foot or by swimming, by the game's own rule on a 1 m grid.
- 2026-11-17 (M3, travelling): **the gates work**. Press E at the Forest's open gate to go to the Jungle; the animal arrives 10 m inside the Jungle's gate back (at its south edge), facing in, and a banner names the biome and says what it does to this animal ("Grey Wolf: -15% speed"). Press E at the gate back to return; the animal arrives at the Forest's gate, and the Forest's boss is back, as the 2026-11-14 rule says. The app builds the other biome's world when the animal travels (`App.setBiome`; one world exists at a time) and starts the same animal in it; the time of day carries on through a gate. **The biome is saved with the animal** (`biome` in the save and the profile): Continue Game wakes it at the den of the biome it was in, and so does a death. The save format's version is still 1: an older save has no `biome` and loads in the Forest, and a biome that is not unlocked or not built yet also loads as the Forest. **The title screen is always the Forest.** The Jungle's gate onward opens when the Silverback is beaten and offers the Plains; pressing E there says the way is not open yet (a `TODO(M3)`). Choices made by me, not the user: travel is by pressing E, with a short pause while the other biome is built (no loading screen, no fade); a gate's opening is walled, so nobody walks through it; the arrival point is 10 m in, so that the "Return" prompt does not appear the moment the animal arrives; the title shows only the Forest (a Jungle title scene was not asked for).
- 2026-11-17 (M3, the Jungle's animals): the bible's placeholders were "monkey, snake, capybara/tapir". Built: **capybara** (prey: flees on sight in bursts and tires, like the deer; levels 8 to 11), **monkey** (small and quick, in troops of 3 and 4, bites, bolts below 35% health; levels 8 to 12), **tapir** (a fighter with a pale saddle that charges like the boar; levels 10 to 13). **No snake** at first: the rig drew four-legged animals and birds, and a snake needs a third, legless one (the user then asked for snakes the same day: see "M3, snakes, gorilla and cave"). **Rivals** are the Jungle's own: two **tigers**, each alone in its territory (levels 12 to 14), and two **crocodiles** (levels 13 to 15), one on the river and one in the lagoon; the wild crocodile is the first animal that wanders into water (`aquatic` on its behaviour) and it never walks off to drink. A Tiger player meets only the crocodiles and a Crocodile player only the tigers; everyone else meets all four (the limit of 5 holds). All of them sprint slower than the slowest playable species (7.0 and 6.4 against the Elephant's 7.2), so a fight can still be escaped on land; in the water a wild animal is not slowed and a swimming player is, so a crocodile cannot be outswum except by the Crocodile, and getting out of the river is the escape. Levels run from 8 to 15 (the Forest: 1 to 7), for an Adult on its way to Alpha; their XP grows with their level, so the long climb from level 8 to 18 is shorter here than in the Forest. Every stat is a first guess.
- 2026-11-17 (M3, the Jungle's boss): the bible offered "giant python or huge gorilla-like beast". Built: the **Great Silverback** ("Great Silverback, Lord of the Jungle"), level 20, 2000 health (the Stag: 900), 46 damage (24), 2.3 times normal size, with a silver saddle and a scar. Three attacks, all of kinds the game already had: a wide fist swing, a ground pound of 7 m radius, and a charge. 700 XP for the first win, 80 for a repeat. Chosen over the python because the gorilla walks on all fours and so uses the existing rig, while a python needs the legless rig a snake would. Phases wait for M5. The numbers are first guesses, sized for an Alpha of about level 18.
- 2026-11-17 (M3, jungle touches): the user said "feel free to add more of a jungle touch". Added: **tall canopy trees** with wide flat crowns and buttress roots, and **leaning palms** (the Jungle's second kind of tree, in the place of the Forest's pines); **coconuts** on a quarter of the palms (the Jungle's "nuts": an Elephant or a Bear at a palm is offered "Eat coconuts") and fruit under an eighth of the canopy trees; **vines** hanging from the crowns; **ferns** over the floor; **mud** instead of sand at the water's edge; **lily pads**, some in flower, on the lagoon; **mist and foam** at the foot of the waterfall; streaks on the river and the waterfall that slide with the flow. A new rig marking, `saddle` (a pale patch over the back), is used by the tapir and the Silverback. None of the plants blocks an animal except the tree trunks. The canopy trees' trunks are taller (about 6.6 m against 3.4 m), so an eagle must fly higher to pass over them, which suits its Jungle nerf.
- 2026-11-17 (M3, camera): **the camera moves in when a trunk or a rock would stand between it and the animal** (`ThirdPersonCamera.update` takes the world's colliders): it stops short of the obstacle at once, never closer than 1.6 m, and eases back out afterwards. This was a known rough edge since M1 ("the camera can pass through trees and rocks"); it is fixed now because the Jungle is dense, and **it changes the Forest too**. I told the user I would do it with the Jungle. `TUNING.camera.minDistance` and `clearance` are the numbers.
- 2026-11-17 (M3, admin sandbox): the panel has a **Biome** row. One click puts the animal at the den of any biome that is built, unlocked or not, keeping the animal as it is; switching animal keeps the biome. Added so that the user can review the Jungle without beating the Stag first. It writes nothing to the save slots, like the rest of the sandbox.
- 2026-11-17 (M3, tests): the browser test was run four times in full. Runs 1 and 4 passed every check (301 of 301); runs 2 and 3 each failed one, a different one each time, both in the **Forest** and both in checks that the Jungle work did not touch (the Forest's fingerprint is identical and its movement code takes the same path as before). **(1) "Pounce goes on cooldown and hits"** (run 2): the test dropped the wolf 6 m south of the nearest boar without looking for a tree, rock or second animal on that line; it now picks an animal with clear ground and nobody near (fixed, a test problem). **(2) "a juvenile elephant can run down and kill a fleeing deer"** (run 3, not killed in 90 s): **not fixed, and it is the game, not the test.** Run on its own 14 times, the hunt failed once and took over 70 s twice; on the last committed version, 20 times, it never failed but once took 77.5 s. What happens: the deer flees to the edge of the Forest, the Elephant (the slowest and widest animal) is held up behind the trees there, and the deer walks home and recovers its health. So the Elephant's hunt has a long tail that was already there in M2, and the 90 s limit catches it now and then (once in the 5 full runs and 14 single hunts made on 2026-11-17). See Known rough edges.

- 2026-11-17 (M3, snakes, gorilla and cave), asked for by the user after reviewing the first Jungle: "add snakes and make the silverback gorilla look more gorilla, now it's a little more like a bear. afterwards add a cave towards the right side of the boss battleground for either snakes or a bear, adult level (see which u think is better), and leave some carcasses inside as loot/bait".
  **Snakes.** A third rig, `ProceduralSnake` (`src/animals/ProceduralSnake.ts`, chosen by `rig: 'serpent'` on an enemy definition): 30 rounded pieces that follow a wave running back along the body. It slithers, rests in a loose S with its head raised and its tongue flicking, rears back in the wind-up (and glows red, like every wind-up), lunges in the strike, shivers when stunned and dies belly up. It reads the same body plan as the other rigs but uses only three numbers: `bodyLength` (the whole snake), `bodyWidth` (how thick) and `headSize`. Two kinds (`src/data/enemies.ts`): the **Snake** (golden with brown bands, 1.9 m, 48 health, levels 8 to 11, two groups of three lying about the Jungle) and the **Cave Snake** (black with pale bands, 2.3 m and 1.35 times bigger again, 66 health, harder hits, levels 12 to 14). Both are slow (walk 1.8, chase 5.6 and 5.8 m/s, below the sprint of every animal on foot, the Eagle's 6.0 being the slowest, so a snake can always be outrun; a unit test) and fight with a bite and a short fast strike (a 4 m charge after a 0.5 s rearing wind-up). Choices made by me, not the user: their colours, sizes and numbers; **no venom** (it would be a new status effect, and it was not asked for; it is a candidate for later).
  **Gorilla.** The Silverback looked like a bear because it was the plain four-legged rig with a short snout, round ears and a level back. Two new rig markings (`FeatureId`) change that. **`knuckle`** pitches the whole body up at the front by 0.36 rad (about 21 degrees), so the shoulders stand above the hips and the back slopes down to the rump; each leg is cut to reach the ground from where it hangs, which makes the arms long and the hind legs short; thicker arms, big hands, a mound of shoulder muscle, a barrel chest, and the head sunk forward between the shoulders. **`brow`** gives it a flat dark face, a heavy bony brow, wide nostrils, a broad mouth and a crest on top of the skull. With no tail, small round ears and a silver saddle (the new optional `BodyColors.saddle`) it reads as a gorilla in the screenshots (side, front and from above). It still has no fingers and walks the ordinary four-legged walk. Its stats and attacks are unchanged.
  **The cave** (`CaveDef` in `src/core/layout.ts`, rules in `src/logic/cave.ts`, built by `BiomeWorld.buildCave`). The user left the choice to me and **I chose snakes**, for a reason that comes from the game's rules and not the look: the game never meets a player with a rival of their own species, so a cave guarded by a bear would be empty, with its bait free, for anyone playing a Bear, while snakes are nobody's species and work the same for all seven animals. Snakes also suit a cave (a nest coiled among the carcasses), they are new (so the cave shows them off), and the bear stays a Forest rival. The cave stands **on the right of the arena as an animal comes in from the south** (north is -z, so east, +x), **deep in the jungle trees**: its middle is at (62, -62), 62 m from the arena's middle, with its mouth facing the arena. (It was first built at (36, -62), 16 m outside the arena's ring of standing stones; the user then asked for it "further deeper into the jungle trees on the right", and it was moved to its present place the same day. That meant moving one of the rival tigers' territories, which had been at (62, -50) and is now at (72, -28), and the fruit bush that stood there, now at (44, -44).) It has a floor of 6 m radius on level ground (the land's own height at its middle, flattened over the floor and the walls, and coloured dirt), a ring of 15 overlapping boulders with a 6.4 m gap for the mouth (a unit test walks the widest animal, an Alpha Elephant, in through it, and checks that there is no other way in), a roof of nine flat stones about 3 m up, a dark low dome inside that hides the gaps between the stones, a dark floor and 18 bones. The walls are colliders 6.5 m tall (a flier clears them) and the roof blocks nothing. Trees, plants, rocks and grass keep 11 m away from it, which **changed the Jungle's tree layout** (not yet reviewed by the user). **A trail** (`caveTrail` in `src/logic/cave.ts`) leads from the cave's mouth straight west to just outside the arena's ring of standing stones (to the point 23 m from the arena's middle): a strip 4 m wide of bare earth, kept clear of trees, plants, rocks and grass, over ground that is gentle (the steepest bit is 0.23, a unit test checks it). I added it because a cave this far into dense forest would otherwise be hard to find, and the trees (3.1 m apart) would hold up the biggest animals on the way; it was not asked for, and can be taken out (the cave would then be hidden) if the user prefers.
  **The nest and the bait.** Four carcasses (`CAVE_FOOD` in `src/data/food.ts`: 22 growth each, the richest food in the Jungle for a meat-eater; they never rot and come back 180 s after being eaten) lie in an arc at the back. Three Cave Snakes (the `lair: true` zone, levels 12 to 14, an Adult's level) lie among them and are **calm**: they ignore the player, even one standing among them, until the bait is eaten or one of them is hurt, and then **all of them attack** (`Game.wakeLair`; the same idea as the guards of the fox food reserves, which `isGuardZone` now treats alike: they stay near home, never walk off to drink, and return after a chase). They come back 180 s after being killed. So it is a trap with a reward: walk in, take the bait (meat-eaters only: an Elephant gets nothing from carcasses), and fight a nest of three. Choices made by me, not the user: the cave's size and shape; that the snakes stay calm until provoked (I read "bait" as a lure); 22 growth; 180 s; that the nest wakes together; and the cave's decoration (bones, a dark floor).
  **Checks**: 13 new unit tests (`tests/unit/cave.test.ts`: the cave's walls, mouth, roof and floor; the trail; where it stands; the snakes' data and their speed; the gorilla's markings; and **every wild animal and boss built and animated through every state**, which would catch a number that is not a number) and 10 new browser checks (a snake fights; the cave's contents; walking the trail from the arena to the mouth; walking in; standing among the sleeping snakes unharmed; the prompt at a carcass; the nest waking when it is eaten; beating the nest; three minutes later the nest and the bait are back; hurting one snake wakes the others). With the cave first built beside the arena, the full browser run was made four times: three passed all 310 checks, and one failed a single Forest check ("carnivore is told it cannot eat berries": a leafy plant had grown beside the berry bush and was the nearest food, a flake of the kind the bear's check had already been fixed for; the wolf's check now clears plants near the bush the same way, and the run after that passed all 310). After the cave was moved deeper into the trees and the trail added, the full run was made twice and passed all 311 checks both times.

## 16. Known Issues / TODO

### Handover for the next session (written 2026-11-17, at the end of the session)

**State.**
- M1 and M2 are accepted. **M3 step 1 (the groundwork and the Jungle) is built, committed and pushed** (`origin/main` at `4fede1c`, plus the commit that carries this handover if it has been made; see `git log`). It includes the snakes, the gorilla-shaped Silverback and the cave with its nest and bait.
- **It is live on Vercel**: the user linked the repo and confirmed on 2026-11-17 that it works. The address is **https://beast-ascent.vercel.app/** (given by the user on 2026-11-17). **Every push to `main` now publishes to that site**, so a push is a publish: still ask before every push.
- The user looked at the Jungle and said "okay seems good" (2026-11-17) and had it deployed. They have **not** sent detailed playtest feedback, so every Jungle number is still a first guess and the Jungle is not formally accepted as a finished step.
- Checks at the end: 185 unit tests, 311 browser checks (both full runs after the last change passed all of them; the history of the two flaky Forest checks is in the Decisions Log entries "M3, tests" and "M3, snakes, gorilla and cave"), typecheck and production build. The Forest was checked to be byte-for-byte unchanged by the Jungle work.

**To start.** `git pull`, `npm install`, `npx playwright install chromium`, `npm run dev`. To see the Jungle quickly: add `?admin` to the address, start the Admin sandbox, press J, click **Jungle** in the Biome row (the cave is east of the boss arena, reached by a trail). Tests: `npm test` (a second) and `npm run test:e2e` (about 4 minutes; it uses a stand-in mouse lock, `tests/e2e/pointerLock.mjs`).

**Working rules** (the user's CLAUDE.md and the saved memory). Ask before every commit and show the whole message; **never add a Co-Authored-By or any AI attribution line** (the user said so again on 2026-11-17, even though the tool's own reminder suggests one); push only when asked (and a push publishes the live site); discuss and get approval before big changes and new biomes; give previews (screenshots) for visual changes; update the docs in the same task; **always make sure any browser or tab used for testing is closed afterwards**. The user switches Claude models by milestone: the Jungle was built with Fable 5.2, and they plan **Sonnet 5.5 for the Plains and Winter**.

**Suggested agenda for the next session, in this order.**
1. **Ask the user how the Jungle plays** on the live site and in the sandbox, and take their feedback first. Things worth asking about: the look (trees, vines, how dark it is under the canopy), the river's current (too weak or too strong), the waterfall ride, the cliff, the cave (the trail, the bait, the fight against three snakes), the snakes' look and movement, the Silverback as a gorilla and how hard it is (a maxed Alpha Tiger beat it in 17 s in the test), the camera moving in front of trunks (also in the Forest), and travelling through the gates.
2. **Get three small decisions** that are waiting: (a) the **Elephant's deer hunt** sometimes takes over 70 s because the deer runs to the Forest's edge and the Elephant is held up by trees (options: a deer that turns back from the edge sooner, a deer that keeps its wounds longer, or a longer limit in the test); (b) **keep or remove the cave's trail** (without it the cave is hidden); (c) whether to **hide `?admin`** on the public Vercel copy (it works there now, as `?debug` does).
3. **M3 step 2: the Plains.** A new biome is a major change, so **discuss it with the user and get approval before building** (CLAUDE.md section 2). Starting points from the bible, all to be confirmed with the user, none decided: golden grass, wide open sky, scattered acacia-style trees; animals zebra or antelope (prey), hyena, buffalo; the Elephant lives here as a rival (the bible's table also gives the Lion +20% damage, the Elephant +20% max health and the Tiger -15% stamina regen on the Plains); a boss of a giant buffalo or a hyena pack leader; levels above the Jungle's 8 to 15 (an Alpha is level 18 or more). Ask which of the Jungle's features they want again in a new form (a watering hole or river, a rock outcrop, a cave, a hill) and what should make the Plains feel different (it is open where the Jungle is dense). Then build it by the recipe in "Notes for the rest of Milestone 3" below, one step at a time, with tests first for any new rule.
4. Then **Winter** (and what happens when the last biome is ruled: the win condition needs an ending, since the last gate leads nowhere), then the **M3 wrap-up** and the user's acceptance, then M4.

**Open items.**
1. **Next in M3: the Plains, then Winter** (see the agenda above and the Notes below).
2. **Not built in the Jungle, on purpose** (each can be added if wanted): venom on the snakes (a new status effect), fish in the river (they live in the three ponds), a Jungle title scene (the title is always the Forest), a loading screen or fade when travelling, fall damage, fireflies or other night life, sound, a map that shows the cave.
3. **Parked until after M5:** choosing an animal starts the player in a different biome (which biome suits which animal is undecided).
4. **The user's "etc."** after drinking: other idle behaviours (grazing, resting). Ask which they want. **A fox den** was mentioned once; only food reserves were built.
5. **Deployment (Vercel): done by the user on 2026-11-17 and working.** Vercel settings used or recommended: Framework Preset Vite, build command `npm run build`, output directory `dist`, Node 22, no environment variables. Saves live per web address in the player's browser, so players should keep to one production address (not the per-deploy preview ones). The production address is https://beast-ascent.vercel.app/.
6. **Balance:** every Jungle number is a first guess (animal and boss stats, levels, the current, the cliff rule, tree counts, the bait's value).
7. **Known flaky browser checks:** the Elephant's deer hunt (a game weakness, see agenda item 2); leafy plants growing beside the berry bush were a test flake, now fixed for both the wolf's and the bear's checks.

### Stubs (marked `TODO` in code)
- **None left from M2.** The Elephant, Crocodile and Eagle are finished (placeholder numbers tuned for M5).
- **Gate to the Plains** (M3): the Jungle's gate opens after the Silverback; pressing E only shows a message (`TODO(M3)` in `src/game/Game.ts`). The Plains and Winter are palette stubs in `src/data/biomes.ts` with no map (`BIOME_LAYOUTS` has no entry for them).
- **Boss phases, audio, settings** (M5): not started.

### Known rough edges (M1 and M2)
- The camera moves in front of tree trunks and rocks since M3 (see the Decisions Log), but it can still pass through foliage, and in a dense spot it sits close to the animal. Untested by a human.
- **Untested by a human, all of the Jungle** (built 2026-11-17): how the current feels, whether the ford is easy to find, the ride over the waterfall (an animal that goes over lands in the pool unhurt, after sliding down the last of the cliff), how dark it is under the canopy, whether the dense trees make fights hard to read, the Silverback's difficulty, and how a fight with a crocodile in the water feels (a swimming player is slow; a wild animal is not slowed by water).
- **The cave, the snakes and the gorilla are untested by a human** (built 2026-11-17 after the first look): how the cave feels to walk into and fight in (the room is 10 m across inside, and three snakes at once), whether the bait is worth the fight, how the snakes read and move, and whether the Silverback now reads as a gorilla (it has no fingers and the ordinary four-legged walk).
- The cave's roof is only a picture: a flying Eagle can fly in through the mouth and through the roof stones, and the level tags of the animals inside show through its walls (tags show through trees and hills too).
- Snakes (like every wild animal) do not path around obstacles, and a snake that chases the player out of the cave stops at its leash (24 m) and goes home.
- In the Jungle the ground mesh is coarser than the rules: the ground is drawn in squares of about 1.1 m, while animals follow the exact height, so at a river bank or the lip of the cliff an animal can look a little sunk in or raised. The water's edge is drawn as a straight-sided ribbon and can look jagged against the bank.
- An animal on the cliff face slides down it, but one standing on the very top edge can hang half over it. The waterfall is a picture: it does not push, hide or hurt anything. Nothing is behind it.
- **The Elephant's deer hunt sometimes goes wrong** (found on 2026-11-17, present since M2): when a deer flees to the edge of the Forest, the Elephant can be held up behind the trees there long enough for the deer to walk home and heal, and the hunt starts again. A few hunts in a hundred take over 70 s for a bot that never misses, which fails the browser test's 90 s check now and then ("a juvenile elephant can run down and kill a fleeing deer"). The cause is that animals (and the test's bot) do not path around obstacles. Not changed, because it is a balance question for the user: options are a deer that turns back from the edge sooner, a deer that keeps its wounds for longer, or a longer limit in the test.
- Wild animals do not path around the river or the cliff: one that chases the player to the foot of the cliff runs against it until its leash ends, and one that follows into the river is carried by the current like the player.
- Travelling between biomes pauses the game for a moment while the other world is built (no loading screen). Every journey rebuilds the whole world.
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
- Night is visual only except for the Bald Eagle's limited vision (it does not change stats, enemies or spawns), and the moon is rarely on screen: the hills around the Forest and the camera's upward limit hide most of the high sky.
- Frame rate on real hardware is unmeasured. A typical frame is about 270 draw calls and 340k triangles, which should be comfortable for a mid-range laptop.
- After pressing Esc, browsers refuse to re-lock the mouse for about a second. Resuming with the Resume button works; resuming by pressing Esc again may need one click on the game.
- **Save slots**: there is no Delete button (only replacing frees a slot), and the cards show no play time or last-played date. Saves live in one browser (no login, no sync between devices); clearing the site's data empties all four slots. The look of the slot screen has been seen only in headless screenshots, not by the user.
- The project is a git repository on branch `main` with remote `origin` (github.com/zayden995/beast-ascent). `dist/`, `node_modules/` and the test screenshots are not tracked.
- `node_modules` sits inside a OneDrive folder, which makes installs slow and syncs thousands of files. Consider excluding it from sync or moving the project out of OneDrive.

- **Untested by a human, all of M2**: how flight feels (the climb and glide speeds, the 25 m ceiling, the camera while flying), how the Elephant's size feels among trees (an Alpha Elephant is about 3.3 m across and the trees are at least 3.6 m apart), how the Death Roll, Charge and Dive look in motion, and every ability number (all first guesses for M5).
- **Untested by a human, the review batch** (admin sandbox, save slots, Bald Eagle, the Eagle's pace, water, food): how the Eagle feels with a 4.2 walk and a 6 sprint on foot (it hunts by flying low, 6 of 6 in the test, but only 3 of 6 on foot); the Elephant and Crocodile hunting a deer with their slow land speeds; the fish chase with a real mouse; how often animals drink and whether it looks right; whether the title camera's swing (78 degrees, the longest clear stretch in a dense forest) shows enough of the pond, and the wolves and lion that sometimes sit behind the lettering; the tree fruit and nut markers; the fox reserves (their places, the 15 m raid range, the guards' calm).
- Only an animal that wades or swims alarms the fish (a flier skimming the pond does not, and wild animals do not either). Drinking is the only new idle behaviour; grazing and resting are candidates for the user's "etc.". The Forest has no fox den, only the two food reserves.
- Trees, rocks and hills do not hide an animal from sight, and the foliage above a trunk does not stop an eagle (it flies through leaves). A flying eagle is not noticed above 5 m, so it can hover over a fight unseen.
- The eagle's Talon Grab holds a target but does not carry it. Wild animals cannot fly and no rival eagle exists.
- The new animals are simple shapes like the others. The Elephant's trunk is stiff (it sways and lifts, but does not curl), and the Crocodile's legs are straight sticks that splay out.
- The Elephant and the Crocodile are slow on land on purpose. In the browser test (a bot that never misses) a Juvenile Elephant or Crocodile runs down a deer in 11 to 24 s (it varies from run to run with the deer), against 6 to 10 s for the others, so a person will take longer; the Crocodile's real hunting ground is meant to be the water's edge (see the notes on drinking animals in step 3).

### Feedback from the user's review of M2 (2026-11-14 and 15): ALL APPLIED (item 11 is parked for after M5)
The user sent this list in pieces and asked for it to be consolidated before anything was changed; the plan was agreed on 2026-11-15 and every item below is built (see each item and the Decisions Log), except item 11, which waits until after M5, and the "etc." of item 9 (other idle behaviours besides drinking), which the user has not named yet.

User's requests, in their words as closely as possible:
1. An **admin function** to access the game, switch to any animal, and toggle with their abilities and progress. Done in step 1 (`?admin`, then J).
2. Change the **golden eagle to a bald eagle**, give the bird a **bigger attack range**, and make it **more squishy** (less health). Done in step 2.
3. The **crocodile can move a little slower on land and faster in the water.** Confirmed: it must be faster in the water than on land. Done in step 2.
4. **Animals on the title page can be around the water body**, not just in front. Done in step 3b: the animals stand on every shore, the camera swings across the west and north-west shores, and they drink.
5. **Fish should try to dodge** the player who enters the water, not too fast, so that there is a little chase and challenge. ("River" meant water bodies, such as ponds, not a flowing stream.) Done in step 3b.
6. **Land animals can move slightly slower in the water.** The user says the current 60% is OK for now, so no change for now.
7. **Add more water bodies** to the biome. Done in step 3a (four ponds).
8. **Prey tire, so slower predators can still catch them** (the user's answer to the prey-rule conflict below): idle animals have stamina, slow down and do not run far, so catching prey stays very possible even if some animals (the Crocodile, perhaps others) are made slower. Done in step 2.
9. **Wild animals do more than roam**: drinking water at the water's edge, "etc." (the other idle behaviours are still to be named). Meant for the animals in general, with the title scene as the first place the user will see it. Done in step 3b (drinking only; the user's "etc." is still open).
10. **More food for the Elephant** (done in step 4): fruits and nuts on trees; **fox food reserves** (the user's list: vegetables such as carrots, sweet potatoes and corn; fruits such as apples, berries and cherry tomatoes), where eating from them makes nearby foxes attack; and **eating leaves**, with "a little lesser XP gained". (Food fills the growth meter, not XP, so what "XP" means here is to be asked.)
11. Later (after M5): choosing a different animal starts the player in a different biome (see the Milestone Plan).
12. **Growth meter fills much faster than XP** (the user's playtest, 2026-11-15: the meter was full while waiting for XP to level). Explained to the user, who decided on 2026-11-15 to take **option D only**: when the growth meter is full, the HUD says which level is still needed and how much XP is left (for example "Fully fed, level 8 needed (340/525 XP)"). To be built in step 2. **The meter sizes and XP numbers are NOT retuned.** The user understands the two tracks, and notes that an animal that can kill but cannot eat what it kills (the Elephant, a herbivore) is meant to gain only XP from fights, with its growth coming from plants and fruit. Options A (retune), B (a use for extra food) and C (food gives XP) were not chosen. Option D was built in step 2.
13. **Night debuff for the Bald Eagle: limited vision at night** (the user, 2026-11-15, after step 2 was built). **Built, together with step 2**, as proposed to and approved by the user: see the Decisions Log ("night vision").
14. **Decrease the speed of the eagle sprinting on foot** (the user, 2026-11-15, after step 2 was committed; then "have it sprint at 6 only"). Built, with option A chosen by the user: on foot the Eagle walks at about 4.2 and sprints at 6.0 m/s, flying unchanged. See the Decisions Log ("eagle foot sprint").

**Agreed plan (2026-11-15)**: the user approved this order and the defaults. Five steps, each with tests first, a full browser run, screenshots, and its own commit that the user approves (message shown first); pushed until the user says.
1. **Admin sandbox** (BUILT, see the Decisions Log): opens only with `?admin` in the address; a panel sets animal and skin, stage, level, ability points, growth meter, ability ranks, the wounded mark and ruled biomes; changing animal restarts the Forest, the rest (the stage too) applies live; it never writes to the four slots (no god mode, teleports or spawning unless asked). The user left it to me whether it stays in the finished game: **it stays, hidden behind `?admin`** (my call).
2. **Animal balance** (BUILT, see the Decisions Log): Elephant walk 4.2 / sprint 7.2; Crocodile 4.4 / 7.4 on land and about 8 m/s swimming (faster than its land sprint), Water Ambush keeps +35% damage, every other animal stays at 60% in water; prey winded pace down to about 45% of sprint (about 3.3 m/s deer, 3.4 fox), so the old "every species sprints faster than prey" rule becomes "every species out-walks a tired animal" plus the hunt test killing a deer and a fox with each species; **Bald Eagle** (dark brown body, white head and tail, yellow beak and talons), health 65 to 50, basic reach 1.2 to 2.0 m and Talon Grab 1.6 to 2.2 m at Adult size, and its biome buff moves from Plains to Winter (+20% speed; Jungle -20% stays), which changes the bible's table (log it when built); it may snatch fish by skimming low over water if the eating code allows; and the **full-meter hint** on the HUD (option D, see item 12: no retuning of the growth or XP numbers).
3. **Water**: three more water bodies (radius about 7, 9 and 11 m) away from the den, arena and gate (the trees will move); fish in every water body that swim away at about 2.2 m/s from an animal wading in within about 6 m, darting at 3 m/s when it gets close; title animals gather around the whole shore; wild animals walk to water now and then to drink (drinking is the only new idle behaviour; grazing and resting are candidates for the user's "etc.").
4. **Food**: leaves from any tree (growth about 3, the tree bare for about 60 s), fruit on some trees (about 8), nuts on others (about 10), for the Elephant and the bear (press E at the trunk, regrow in about 60 s); two fox food reserves (carrots, sweet potatoes, corn, apples, berries, cherry tomatoes), each guarded by 3 or 4 foxes with the other foxes still spread out, and eating there turns every fox within about 15 m hostile; reserve food is worth about 12 growth. All numbers are first guesses.
5. **Docs and final checks**, with the Decisions Log updated.

**XP and growth pacing** (what the data says; nothing changed): the meter needs 100 growth for Adult and 250 for Alpha, while level 8 needs 525 XP in total and level 18 needs 3632 (3107 more after level 8). A boar gives 24 XP and a carcass worth 20 growth (a deer 12 and 14, a fox 10 and 8), and the Forest's animals give the same XP however high the player's level. So the Adult meter is full after about 5 boar carcasses, but level 8 takes about 22 boar kills (about 4 times the fighting); for Alpha it is about 13 carcasses against about 130 kills (about 10 times). The meter is therefore a box that ticks itself long before the level arrives, and food eaten while it is full is wasted. **Decision: the numbers stay; a HUD hint (option D) tells the player what is still missing.**

What the data said before the changes (kept as a record; the Decisions Log says what was built) (so the changes start from facts; found while answering the user's question about the Elephant, Crocodile and Eagle):
- **Water speed**: every animal swims at 60% of its walking speed and cannot sprint in water (`TUNING.swimSpeedMult`, the player controller). The Crocodile's Water Ambush adds +60% swim speed at rank 1, which makes it about 4.5 m/s in water, against 4.7 walking and 8.0 sprinting on land; without that passive it swims at about 2.8. So today the Crocodile is never faster in water than on land (item 3). Item 6 says land animals should be slower in water, and they already are (60%): whether the user wants it slower still, or has not noticed it, is to be asked.
- **Prey rule against item 3**: the Crocodile's land speeds (4.7 walk, 8.0 sprint) were raised in M2 so that it can catch prey (a unit test keeps every species faster than fleeing prey; a winded fox walks at 4.6, a deer sprints at 7.4). Slowing it on land will break that rule unless prey, the rule, or the Crocodile's way of hunting changes (for example, prey that comes to the water).
- **Eagle**: base health 65 is already the lowest (wolf 90, tiger 100, lion 110, bear 150); basic attack reach is 1.2 m x size (0.72 m Juvenile, 1.2 m Adult, 1.68 m Alpha), 90 degrees, the shortest of all species.
- **Fish** swim in fixed circles of 1.6 to 3 m around a spot in the pond and do not react to the player.
- **Water used to be one pond** (`FOREST_LAYOUT.pond`: a single circle at 46, 12 with radius 15); since step 3 it is a list, `FOREST_LAYOUT.waters` (see the Decisions Log). Water depth, "near water", tree and grass placement, the fish, the title scene and the animals' swimming all read it.
- **Prey stamina today** (`src/data/enemies.ts`): the deer bolts for 3.5 s then is winded for 5 s at 55% of its sprint (about 4.1 m/s); the fox bolts 2.5 s, winded 4.5 s at 60% (about 4.6 m/s); the boar and the rivals never flee. A unit test requires every fleeing animal's sprint to be below the slowest species' sprint and its winded walk below the slowest species' walk; that is the rule item 3 collides with, and item 8 is how to change it (shorter bursts, a lower winded speed, and a rule based on catching prey in the hunt test).
- **Food values today** (`src/data/food.ts`), growth meter and healing: carcass 12 and 20%, fish 10 and 12%, berries 6 and 8%, plants 7 and 7%. Carnivores eat carcasses and fish, herbivores berries and plants, omnivores (the bear) everything. Fruit and nuts on trees would feed the bear as well as the Elephant unless restricted.
- **Title scene**: the cast stands in the clearing on the pond's west shore (`FOREST_TITLE` in `src/data/biomes.ts`).
- Things to ask the user when the list is complete: how the admin function is reached (a hidden key, a URL, a menu) and whether it should exist in the finished game; how much bigger the Eagle's reach and how much less its health; how much slower or faster the Crocodile; (answered: "river" meant water bodies); what colour and markings a bald eagle needs (white head and tail on a dark brown body is the usual look).

### Notes for the rest of Milestone 3 (the Plains, then Winter)
- **A biome is data plus a look.** To add one: (1) write its `BiomeLayout` in a new file like `src/data/jungle.ts` (copy the Jungle's or the Forest's and change it) with its spawn zones; (2) add both to `BIOME_LAYOUTS` and `BIOME_SPAWNS` in `src/data/biomes.ts`, set `implemented: true` and its `bossId` in `BIOMES`; (3) add its animals to `src/data/enemies.ts` and its boss to `src/data/bosses.ts`; (4) give it a `style` (`BiomeStyle` in `src/core/layout.ts`) and, in `src/world/world.ts`, its two kinds of tree (`forestTrees`, `jungleTrees` are the pattern) and anything only it has. The gates, travel, saving, the admin panel's Biome row and the HUD need nothing: they follow `BIOME_ORDER` and `BIOME_LAYOUTS`. Then remove the "not built yet" branch for it (it disappears by itself once the layout exists).
- **Every biome after the first needs a `returnGate`** (south edge); its `gate` (north edge) leads on. Winter is the last biome: its gate has nowhere to go (`nextBiome` is null and the gate shows no prompt), so the win condition (all four ruled) needs an ending there.
- **Keep the Forest and the Jungle unchanged** when adding to the world code: anything new gets its own random sequence (`mulberry32(layout.seed + n)`), never `this.rand`, or the trees of the finished biomes move. `tests/e2e/tmp` held a throwaway fingerprint script for this during the Jungle build (deleted afterwards); the idea is to dump `world.treeSpots` and a grid of `heightAt` before and after, and compare.
- **What a layout can hold**: `terrain` (roll and bump heights, `segments` for the ground mesh, `maxClimbSlope` for cliffs, `rockSlope`), `waters` (ponds; `surfaceY` for one on raised ground, `lilyPads`), `rivers` (points with width and depth, a `current`, a `surfaceY`), one `hill` (flat top, optional cliff side), a `waterfall` (names the stream that feeds it), `berryBushes`, `foxReserves` with guard zones (`guardOf`), a `cave` (with a `lair` zone for the animals inside, and the bait), `plants`. The Plains are wide and open (a low `trees` count, a high clearing threshold in `buildTrees`); Winter could freeze its ponds (not built: ice is new).
- **Buffs and nerfs** are already data for all four biomes (section 4.4): the Lion +20% damage and the Elephant +20% health on the Plains, the Tiger -15% stamina regen there; in Winter the Polar Bear +25% health and the Eagle +20% speed, and the Lion, Elephant and Crocodile slowed. The HUD and the arrival banner show them.
- **Rivals** for a new biome are data (`rival()` in `src/data/enemies.ts` copies a playable species' adult body): the Elephant belongs on the Plains, perhaps with lions; Winter could have wolves and polar bears. An Eagle rival would need a flying AI; no wild animal flies. `aquatic: true` on a behaviour lets an animal wander into water.
- **Rigs**: `createAnimalModel` picks one by `rig`: four-legged (the default), winged (the Eagle) and serpent (`ProceduralSnake`, chosen by `rig: 'serpent'` on an enemy). A seal or a fish would be a fourth. The four-legged rig takes a `BodyPlan` and `FeatureId` markings (`knuckle` and `brow` make a gorilla, `saddle` a pale back).
- **Levels**: the Forest is 1 to 7 with a level 10 boss, the Jungle 8 to 15 with a level 20 boss. An Alpha needs level 18, so the Plains and Winter are for Alphas: their animals need to be worth fighting for an animal with 3 times its base health and damage.
- **Tests**: `tests/unit/jungle.test.ts` is the pattern for a new map (water clear of the den and gates, banks that can be climbed, everything reachable from the den by the game's own climbing rule, rivals within the limit of 5 and escapable). The browser test reviews the Jungle from the admin sandbox (the "Biome" row), which is the quick way into any biome.
- Run order for a clean start on a new machine: `npm install`, `npx playwright install chromium`, `npm test`, `npm run test:e2e`.
- Tests: `npm test` runs 172 unit tests; `npm run test:e2e` runs 301 browser checks. The game seeds its randomness from the clock, so run the browser test a few times. A browser test that needs an animal to notice the player must first face it at the player (the `hold(id, yaw)` helper), and one that tests the map itself should first calm every animal (`calmAll` in the Jungle section).

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