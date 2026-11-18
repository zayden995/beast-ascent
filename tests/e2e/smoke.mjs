// End-to-end check of Milestones 1 and 2 and the Jungle of Milestone 3: boots the real game in a headless browser, plays the core
// loop through real key/mouse events, and fails on any console error.
// The simulation is stepped through the debug hook so the run is deterministic and fast.
// Run with: npm run test:e2e
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { realPointerLock, releaseCursorClip, stubPointerLock } from './pointerLock.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const shots = path.join(here, 'screenshots');
fs.mkdirSync(shots, { recursive: true });

const results = [];
const problems = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// The real pointer lock would trap the user's own mouse cursor in the corner of the screen (see pointerLock.mjs).
if (!realPointerLock) await stubPointerLock(page);
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  if (m.type() === 'warning' && !/GPU stall|ReadPixels/i.test(m.text())) console.log(`  [warning] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));

const B = {
  state: () => page.evaluate(() => window.__beast.state()),
  advance: (s) => page.evaluate((sec) => window.__beast.advance(sec), s),
  teleport: (x, z, yaw) => page.evaluate(([a, b, c]) => window.__beast.teleport(a, b, c), [x, z, yaw]),
  lookAt: (x, z) => page.evaluate(([a, b]) => window.__beast.lookAt(a, b), [x, z]),
  call: (fn, ...args) => page.evaluate(([f, a]) => window.__beast[f](...a), [fn, args]),
};
// Rendering is off while the test fast-forwards (software GPUs are slow) and on for screenshots.
const shot = async (name) => {
  await page.evaluate(() => window.__beast.setRender(true));
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
  await page.evaluate(() => window.__beast.setRender(window.__beast.app.screen !== 'playing' || window.__beast.app.autoStep));
};
// The HUD is refreshed once per animation frame; wait for two before reading it.
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const tap = async (key, hold = 0.05) => {
  await page.keyboard.down(key);
  await B.advance(hold);
  await page.keyboard.up(key);
};
const nearest = (s, kind) =>
  s.enemies.filter((e) => e.alive && (kind ? e.kind === kind : !e.boss)).sort((a, b) => a.dist - b.dist)[0];
/** Ids of live animals of one kind that have open ground (no tree or rock) at each offset south of them. */
const withClearSpots = (kind, offsets, excludeIds = []) => page.evaluate(([k, offs, ex]) => {
  const g = window.__beast.app.game;
  const w = g.world;
  return g.spawner.enemies
    .filter((e) => e.def.id === k && e.alive && !ex.includes(e.id)
      && offs.every((d) => !w.colliders.blocked(e.pos.x, e.pos.z + d, 0.9) && Math.hypot(e.pos.x, e.pos.z + d) < w.boundary - 2))
    .map((e) => e.id);
}, [kind, offsets, excludeIds]);
/** Holds a wild animal still and idle, facing `yaw` (0 faces +z, PI faces -z), so its sight can be tested. */
const hold = (id, yaw) => page.evaluate(([animal, facing]) => {
  const e = window.__beast.app.game.spawner.enemies.find((x) => x.id === animal);
  e.state = 'idle';
  e.timer = 99;
  e.yaw = facing;
  e.vx = e.vz = 0;
  e.provoked = false;
  e.stun = 0;
  // A drinking animal turns to face the water: held still, it must face where the test says.
  e.drinking = false;
  e.drinkYaw = null;
  // Where it stands is its home now: an animal beyond its leash would give up a chase at once.
  e.homeX = e.pos.x;
  e.homeZ = e.pos.z;
}, [id, yaw]);

/** From the title: New Game, pick a save slot (confirming a replace if it holds an animal), then the species. */
/** A tree that bears this kind of food (fruit or nuts), with clear ground 2.6 m east of it to stand on. */
const pickTree = (kind) => page.evaluate((k) => {
  const w = window.__beast.app.world;
  const g = window.__beast.app.game;
  for (const t of g.trees.treatTrees().filter((x) => x.kind === k && Math.hypot(x.x, x.z) < 85)) {
    const px = t.x + 2.6;
    const pz = t.z;
    const crowded = w.treeSpots.some((o, i) => i !== t.index && Math.hypot(o.x - px, o.z - pz) < 5)
      || w.colliders.blocked(px, pz, 0.8) || w.waterDepth(px, pz) > 0 || w.inRefuge(px, pz, 2);
    if (!crowded) return t;
  }
  return null;
}, kind);

async function newGame(speciesName, variantName, slot = 1) {
  await page.getByRole('button', { name: /New Game/ }).click();
  await page.locator(`.save-slot[data-slot="${slot}"]`).click();
  const replace = page.getByRole('button', { name: /Pick an animal/ });
  if (await replace.isVisible()) await replace.click();
  await page.locator('.select').waitFor();
  await page.locator('.signpost .plank', { hasText: speciesName }).click();
  if (variantName) await page.locator('.variants .chip', { hasText: variantName }).click();
  return async () => {
    await page.getByRole('button', { name: /Begin as/ }).click();
    await page.locator('.hud').waitFor();
    await B.call('setAutoStep', false);
    await B.call('setRender', false);
    await B.advance(0.1);
  };
}

/** Stand next to an enemy and hold attack until it dies. Returns the fight summary. */
async function fight(kind, { maxSeconds = 40, keepAlive = false } = {}) {
  let s = await B.state();
  const target = kind === 'boss' ? s.enemies.find((e) => e.boss) : nearest(s, kind);
  if (!target) return { killed: false, reason: `no ${kind}` };
  if (kind !== 'boss') {
    await B.teleport(target.x, target.z + 2.2);
    await hold(target.id, 0); // facing the player (south of it), so that it notices and fights
  }
  await B.lookAt(target.x, target.z);
  await page.mouse.move(640, 360);
  await page.mouse.down();
  // Walk at the target (the camera is aimed at it) so knockback and retreats do not end the fight.
  await page.keyboard.down('KeyW');
  let hurt = false;
  let t = 0;
  let alive = true;
  const states = new Set();
  while (alive && t < maxSeconds) {
    await B.advance(0.25);
    t += 0.25;
    s = await B.state();
    const now = s.enemies.find((e) => e.id === target.id);
    alive = !!now && now.alive;
    if (now) states.add(now.state);
    if (s.player.hp < s.player.maxHp) hurt = true;
    if (keepAlive && s.player.hp < s.player.maxHp * 0.6) await B.call('setHp', s.player.maxHp);
    if (now && alive) await B.lookAt(now.x, now.z);
    if (s.player.dead) break;
  }
  await page.mouse.up();
  await page.keyboard.up('KeyW');
  return { killed: !alive, hurt, seconds: t, target, states };
}

/**
 * Hunt prey the way a player does: sprint at it and attack when in reach. With `flying` the hunter flies
 * low over the ground by tapping Space (an eagle on foot is too slow to hunt, so it hunts from the air).
 */
async function hunt(kind, maxSeconds = 45, { flying = false } = {}) {
  let spaceDown = false;
  let s = await B.state();
  const target = s.enemies
    .filter((e) => e.alive && e.kind === kind && ['idle', 'wander'].includes(e.state))
    .sort((a, b) => a.level - b.level)[0];
  if (!target) return { killed: false, reason: `no calm ${kind}` };
  await B.call('setHp', s.player.maxHp);
  // Start 20 m away so the prey notices the player and bolts, as in real play.
  await B.teleport(target.x, target.z + 20);
  await B.advance(0.3);
  await page.mouse.move(640, 360);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  let t = 0;
  let attacking = false;
  let fled = false;
  let alive = true;
  while (alive && t < maxSeconds) {
    s = await B.state();
    const now = s.enemies.find((e) => e.id === target.id);
    alive = !!now && now.alive;
    if (!alive) break;
    if (now.state === 'flee') fled = true;
    await B.lookAt(now.x, now.z);
    if (flying) {
      // Stay about a metre above the ground: a flier can only bite what is within its height plus 1.2 m.
      const wantUp = !s.player.flying || s.player.altitude < 0.8;
      if (wantUp && !spaceDown) { await page.keyboard.down('Space'); spaceDown = true; }
      if (!wantUp && spaceDown) { await page.keyboard.up('Space'); spaceDown = false; }
    }
    // This checks that prey can be caught, not that the hunter survives whatever else it runs into.
    if (s.player.hp < s.player.maxHp * 0.6) await B.call('setHp', s.player.maxHp);
    const inReach = now.dist < 2.6;
    if (inReach && !attacking) await page.mouse.down();
    if (!inReach && attacking) await page.mouse.up();
    attacking = inReach;
    await B.advance(0.1);
    t += 0.1;
  }
  if (attacking) await page.mouse.up();
  if (spaceDown) await page.keyboard.up('Space');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  return { killed: !alive, fled, seconds: Math.round(t * 10) / 10, level: target.level };
}

try {
  // ---------- Title and species select ----------
  await page.goto(url);
  await page.locator('.title').waitFor();
  await page.waitForTimeout(600);
  check('title screen shows', await page.locator('.title h1').isVisible());
  check('title offers New Game and Continue Game; Continue waits for a first save',
    (await page.getByRole('button', { name: /New Game/ }).isEnabled()) && (await page.getByRole('button', { name: /Continue Game/ }).isDisabled()));
  await page.getByRole('button', { name: /New Game/ }).click();
  await page.locator('.slot-card').waitFor();
  check('New Game shows four empty slots, all of them pickable',
    (await page.locator('.save-slot').count()) === 4 && (await page.locator('.save-slot.empty').count()) === 4 && (await page.locator('.save-slot:disabled').count()) === 0);
  await shot('01a-slots-new-empty');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.title').waitFor();
  const herd = await B.call('titleAnimals');
  await B.call('advanceTitle', 30);
  const herdLater = await B.call('titleAnimals');
  const roamed = herd.filter((a, i) => Math.hypot(herdLater[i].x - a.x, herdLater[i].z - a.z) > 0.5).length;
  check('animals roam behind the title screen: prey and predators', herd.length >= 8 && herd.some((a) => a.predator) && herd.some((a) => !a.predator) && roamed >= herd.length - 2, `${herd.length} animals, ${roamed} moved in 30 s`);
  // The animals stand all around the big pond (46, 12, radius 15), drink at its edge, and the camera swing never runs into a tree.
  const around = new Set(herd.map((a) => Math.floor((((Math.atan2(a.z - 12, a.x - 46) * 180) / Math.PI + 360) % 360) / 45)));
  check('the title animals stand all around the pond, not only in front of the camera', around.size >= 5, `${around.size} of 8 sides`);
  let drinkers = 0;
  const badDrinkers = [];
  for (let i = 0; i < 60; i++) {
    await B.call('advanceTitle', 2);
    for (const a of await B.call('titleAnimals')) {
      if (!a.drinking) continue;
      drinkers++;
      const d = Math.hypot(a.x - 46, a.z - 12);
      if (d < 14 || d > 19.5) badDrinkers.push(d.toFixed(1));
    }
  }
  check('title animals walk to the water and drink at its edge, on dry ground', drinkers > 0 && badDrinkers.length === 0, `${drinkers} drinking samples; off the shore at ${badDrinkers.join(', ')}`);
  const blockedOnArc = await page.evaluate(async () => {
    const { FOREST_TITLE } = await import('/src/data/biomes.ts');
    const { titleCameraPose } = await import('/src/logic/titleView.ts');
    const w = window.__beast.app.world;
    const v = FOREST_TITLE.view;
    let blocked = 0;
    for (let k = 0; k <= 40; k++) {
      const pose = titleCameraPose(v, (k / 40) * (v.period / 2), w.heightAt);
      let hit = w.colliders.blocked(pose.x, pose.z, 6);
      // A clear view of the pond: nothing within 3 m of the line from the camera to the shore.
      for (let d = 3; !hit && d < v.radius - 17; d += 1.5) {
        const px = pose.x + ((v.centre.x - pose.x) / v.radius) * d;
        const pz = pose.z + ((v.centre.z - pose.z) / v.radius) * d;
        if (w.colliders.blocked(px, pz, 3)) hit = true;
      }
      if (hit) blocked++;
    }
    return blocked;
  });
  check('the title camera swing keeps 6 m from every tree and rock and has a clear view of the pond', blockedOnArc === 0, `${blockedOnArc} of 41 points on the arc are blocked`);
  await B.call('setTimeOfDay', 0.34);
  await shot('01-title');

  let begin = await newGame('Lion');
  await shot('02-select-lion');
  const locked = await page.locator('.signpost .plank:disabled').allInnerTexts();
  check('all seven species can be picked: none is locked as "Coming soon"', locked.length === 0, locked.join(' | ').replace(/\n/g, ' '));
  await page.locator('.signpost .plank', { hasText: 'Bear' }).click();
  await page.locator('.variants .chip', { hasText: 'Polar' }).click();
  await page.locator('.stage-row .chip', { hasText: 'Adult' }).click();
  await shot('03-select-polar-bear-adult');
  check('bear has a variant toggle', (await page.locator('.variants .chip').count()) === 2);
  await page.locator('.signpost .plank', { hasText: 'Wolf' }).click();
  await page.locator('.stage-row .chip', { hasText: 'Juvenile' }).click();
  const boardText = await page.locator('.board').innerText();
  check('select shows diet, favored and disfavored biomes', /Carnivore/.test(boardText) && /Forest \+20% Speed/.test(boardText) && /Jungle -15% Speed/.test(boardText));
  await shot('04-select-wolf');

  // ---------- Wolf: the full core loop ----------
  await page.getByRole('button', { name: /Begin as/ }).click();
  await page.locator('.hud').waitFor();
  await B.call('setAutoStep', false);
  await B.call('setRender', false);
  await B.advance(0.1);
  let s = await B.state();
  check('game starts as a level 1 juvenile wolf', s.screen === 'playing' && s.player.level === 1 && s.player.stage === 'juvenile');
  check('wolf gets its Forest speed buff', s.player.mods.includes('speed:0.2') && Math.abs(s.player.moveSpeed - 6.2 * 1.2) < 0.01);
  check('juvenile is 0.6 size', Math.abs(s.player.size - 0.6) < 1e-6);
  const kinds = s.enemies.map((e) => e.kind);
  check('3 enemy types + boss are in the world', ['deer', 'boar', 'fox'].every((k) => kinds.includes(k)) && s.enemies.some((e) => e.boss), `${s.enemies.length} animals`);
  check('a wolf meets all the Forest\'s rival predators, its own kind included (a pair of wolves, a lion and a bear)',
    kinds.filter((k) => k === 'rival_lion').length === 1 && kinds.filter((k) => k === 'rival_bear').length === 1 && kinds.filter((k) => k === 'rival_wolf').length === 2, kinds.filter((k) => k.startsWith('rival')).join(' '));
  check('title animals are gone once the game starts', (await B.call('titleAnimals')) === null);
  await shot('05-gameplay-start');

  // Day and night.
  await settle();
  check('a session starts in daylight and the HUD says so', s.phase === 'day' && s.daylight === 1 && (await page.locator('.hud-biome small').textContent()) === 'Day', s.phase);
  // Kept short: a fox may wander up and attack an animal that stands idle at the den for long.
  const tod0 = s.timeOfDay;
  await B.advance(1.2);
  s = await B.state();
  check('time of day moves on while playing (6 minute cycle)', Math.abs(s.timeOfDay - tod0 - 1.2 / 360) < 1e-4, `${tod0.toFixed(4)} -> ${s.timeOfDay.toFixed(4)}`);
  await B.call('setTimeOfDay', 0.785);
  await settle();
  check('sunset is called Dusk', (await B.state()).phase === 'dusk' && (await page.locator('.hud-biome small').textContent()) === 'Dusk');
  await shot('20-sunset');
  await B.call('setTimeOfDay', 0);
  await settle();
  s = await B.state();
  check('midnight is Night, with no daylight', s.phase === 'night' && s.daylight === 0 && (await page.locator('.hud-biome small').textContent()) === 'Night');
  await shot('21-night');
  await B.call('setTimeOfDay', 0.34);

  // The den is a safe refuge: wild animals ignore a player inside it and never come in.
  await B.teleport(0, 43, Math.PI);
  await B.advance(0.1);
  await settle();
  s = await B.state();
  check('the player starts inside the den refuge and the HUD says so', s.player.safe && /Safe at the den/.test(await page.locator('.hud-status').textContent()));
  // The ring of stones is 12 m from the den (the user found the first 18 m too big). Put a boar 6 m
  // outside it, and stand 1.5 m inside it: about 7.5 m apart, well within the boar's notice range.
  const ring = await page.evaluate(() => window.__beast.app.world.layout.den.refugeRadius);
  const denZ = 52;
  const boarZ = denZ - ring - 6;
  const insideZ = denZ - ring + 1.5;
  check('the refuge ring is 12 m, down from 18 m', ring === 12, `${ring} m`);
  const moved = await page.evaluate((z) => {
    const g = window.__beast.app.game;
    const boar = g.spawner.enemies.find((e) => e.def.id === 'boar');
    const keep = { id: boar.id, x: boar.pos.x, z: boar.pos.z, homeX: boar.homeX, homeZ: boar.homeZ };
    boar.pos.set(0, g.world.heightAt(0, z), z);
    boar.homeX = 0;
    boar.homeZ = z;
    boar.state = 'idle';
    boar.timer = 99;
    boar.yaw = Math.PI; // faces -z, toward the player who will stand north of it
    return keep;
  }, boarZ);
  const guard = async () => (await B.state()).enemies.find((e) => e.id === moved.id);
  await B.teleport(0, insideZ, Math.PI);
  await B.advance(5);
  s = await B.state();
  let g1 = await guard();
  check('a boar ignores a player inside the refuge, 7.5 m away', s.player.safe && s.player.hp === s.player.maxHp && g1.state === 'idle' && g1.dist < 10, `${g1.state}, ${g1.dist.toFixed(1)} m`);
  // Stand on the far side of the boar, so that its knockback cannot push the player back into safety.
  await B.teleport(0, boarZ - 3.5, 0);
  await B.advance(1.5);
  s = await B.state();
  g1 = await guard();
  check('outside the refuge the same boar attacks', !s.player.safe && ['chase', 'windup', 'charging', 'recover'].includes(g1.state), g1.state);
  await B.teleport(0, 43, Math.PI);
  await B.advance(4);
  s = await B.state();
  g1 = await guard();
  const hpThen = s.player.hp;
  await B.advance(3);
  s = await B.state();
  check('it gives up when the player steps back in, and never enters the refuge',
    s.player.safe && s.player.hp >= hpThen && ['return', 'idle', 'wander'].includes(g1.state) && Math.hypot(g1.x, g1.z - denZ) >= ring - 0.01,
    `${g1.state}, ${Math.hypot(g1.x, g1.z - denZ).toFixed(1)} m from the den`);
  await page.evaluate((k) => {
    const g = window.__beast.app.game;
    const boar = g.spawner.enemies.find((e) => e.id === k.id);
    boar.pos.set(k.x, g.world.heightAt(k.x, k.z), k.z);
    boar.homeX = k.homeX;
    boar.homeZ = k.homeZ;
    boar.state = 'idle';
    boar.timer = 1;
    boar.provoked = false;
  }, moved);
  await B.call('setHp', s.player.maxHp);
  await B.teleport(0, 43, Math.PI);
  await B.advance(0.1);
  s = await B.state();

  const start = s.player;
  await page.keyboard.down('KeyW');
  await B.advance(1);
  s = await B.state();
  const walked = Math.hypot(s.player.x - start.x, s.player.z - start.z);
  check('W walks forward (north)', walked > 4 && s.player.z < start.z - 4, `${walked.toFixed(1)} m`);
  await page.keyboard.down('ShiftLeft');
  const before = s.player;
  await B.advance(1);
  s = await B.state();
  const ran = Math.hypot(s.player.x - before.x, s.player.z - before.z);
  check('Shift sprints faster and drains stamina', ran > walked * 1.3 && s.player.stamina < before.stamina - 8, `${ran.toFixed(1)} m, stamina ${s.player.stamina.toFixed(0)}`);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await B.advance(0.5);

  await page.keyboard.down('Space');
  await B.advance(0.2);
  await page.keyboard.up('Space');
  s = await B.state();
  check('Space jumps', !s.player.grounded);
  await B.advance(1.2);
  s = await B.state();
  check('lands again', s.player.grounded);

  const stBefore = s.player.stamina;
  await page.keyboard.down('KeyQ');
  await B.advance(0.1);
  await page.keyboard.up('KeyQ');
  s = await B.state();
  check('Q dodges with invulnerability and stamina cost', s.player.invuln > 0 && s.player.stamina < stBefore - 20);
  await B.advance(1);

  // Wolf cannot eat berries. (Leafy plants grow in random places: one beside the bush would be the nearest food,
  // and the message would name the plant, so clear any plant near the bush first, as the bear's check below does.)
  await page.evaluate(() => {
    const food = window.__beast.app.game.food;
    for (const item of [...food.items]) if (item.kind === 'plant' && Math.hypot(item.pos.x + 14, item.pos.z - 31.5) < 8) food.consume(item);
  });
  await B.teleport(-14, 31.5);
  await B.advance(0.1);
  s = await B.state();
  check('carnivore is told it cannot eat berries', !!s.prompt && s.prompt.key === '' && /cannot eat berries/.test(s.prompt.text), s.prompt?.text);

  // Prey flees.
  const deer = nearest(s, 'deer');
  await hold(deer.id, 0); // facing +z, toward the player 8 m south of it
  await B.teleport(deer.x, deer.z + 8);
  await B.advance(1.5);
  s = await B.state();
  const deerNow = s.enemies.find((e) => e.id === deer.id);
  check('deer flees on sight', deerNow.state === 'flee' && deerNow.dist > 8, `${deerNow.state}, ${deerNow.dist.toFixed(1)} m`);

  // Sight: animals see best ahead and worst behind. Prey that faces a hunter bolts from farther away,
  // and a hunter can creep up on an animal that has its back turned.
  const deerAt = async (id) => (await B.state()).enemies.find((e) => e.id === id);
  const watcherId = (await withClearSpots('deer', [13], [deer.id]))[0];
  await hold(watcherId, 0);
  const wPos = await deerAt(watcherId); // read after the animal is held: it may have moved since the last look
  await B.teleport(wPos.x, wPos.z + 13);
  await B.advance(0.4);
  let seen = await deerAt(watcherId);
  check('a deer that faces the hunter bolts from 13 m, beyond its old 11 m range', seen.state === 'flee', `${seen.state}, ${seen.dist.toFixed(1)} m`);
  const dozerId = (await withClearSpots('deer', [2, 4, 8], [deer.id, watcherId]))[0];
  await hold(dozerId, Math.PI); // faces -z, away from the player who stands south of it
  const dPos = await deerAt(dozerId);
  await B.teleport(dPos.x, dPos.z + 8);
  await B.advance(1.5);
  seen = await deerAt(dozerId);
  check('a deer with its back turned does not notice a hunter 8 m behind it', seen.state === 'idle', `${seen.state}, ${seen.dist.toFixed(1)} m`);
  await B.teleport(dPos.x, dPos.z + 4);
  await B.advance(1);
  seen = await deerAt(dozerId);
  check('nor a hunter 4 m behind it', seen.state === 'idle', `${seen.state}, ${seen.dist.toFixed(1)} m`);
  await B.teleport(dPos.x, dPos.z + 2);
  await B.advance(0.4);
  seen = await deerAt(dozerId);
  check('but it notices a hunter 2 m behind it, and bolts', seen.state === 'flee', `${seen.state}, ${seen.dist.toFixed(1)} m`);
  await B.call('setHp', s.player.maxHp);

  // A fox bolts once it is hurt.
  const foxFight = await fight('fox', { maxSeconds: 6 });
  check('fox attacks, then flees when hurt', foxFight.killed || (foxFight.states.has('flee') && foxFight.hurt), [...foxFight.states].join(' > '));

  // Kill a boar: it fights back.
  const boar = await fight('boar', { keepAlive: true });
  s = await B.state();
  check('boar fights back and can be killed with basic attacks', boar.killed && boar.hurt, `${boar.seconds}s`);
  check('kill gives XP', s.player.xp > 0 || s.player.level > 1, `level ${s.player.level}, xp ${s.player.xp}`);
  const carcass = s.food.filter((f) => f.kind === 'carcass' && f.available);
  check('defeated animal drops a carcass', carcass.length >= 1);
  await B.teleport(carcass[0].x, carcass[0].z + 0.5);
  await B.advance(0.1);
  s = await B.state();
  check('prompt offers to eat the carcass', s.prompt?.key === 'E' && /Eat carcass/.test(s.prompt.text), s.prompt?.text);
  await shot('06-carcass-prompt');
  await tap('KeyE');
  s = await B.state();
  check('eating fills the growth meter and uses up the carcass', s.player.growth > 0 && s.food.filter((f) => f.kind === 'carcass').length === carcass.length - 1, `growth ${s.player.growth}`);

  // Signature ability.
  // An animal with open ground south of it (no tree, rock or water in the 6 m the wolf leaps across) and no
  // other animal near that line: a trunk in the way stops the leap, and aim assist turns toward a nearer animal.
  const clearPreyId = await page.evaluate(() => {
    const g = window.__beast.app.game;
    const w = g.world;
    const live = g.spawner.enemies.filter((e) => e.alive && !e.isBoss);
    const clear = (e) => {
      for (let dz = -1; dz <= 8; dz += 0.5) if (w.colliders.blocked(e.pos.x, e.pos.z + dz, 1.4) || w.waterDepth(e.pos.x, e.pos.z + dz) > 0) return false;
      return Math.hypot(e.pos.x, e.pos.z + 8) < w.boundary - 2 && !w.inRefuge(e.pos.x, e.pos.z + 6, 3);
    };
    const alone = (e) => live.every((o) => o === e || Math.hypot(o.pos.x - e.pos.x, o.pos.z - (e.pos.z + 3)) > 9);
    return (live.filter((e) => e.def.id === 'boar').find((e) => clear(e) && alone(e)) ?? live.find((e) => clear(e) && alone(e)))?.id ?? null;
  });
  const prey = s.enemies.find((e) => e.id === clearPreyId) ?? nearest(s, 'boar') ?? nearest(s);
  // Held still and stunned, so that where it faces or whether it notices the wolf cannot change the result.
  await hold(prey.id, 0);
  await page.evaluate((id) => { window.__beast.app.game.spawner.enemies.find((e) => e.id === id).stun = 3; }, prey.id);
  await B.teleport(prey.x, prey.z + 6);
  await B.lookAt(prey.x, prey.z);
  const preyHp = prey.hp;
  await tap('Digit1');
  await B.advance(0.7);
  s = await B.state();
  const preyNow = s.enemies.find((e) => e.id === prey.id);
  check('signature ability (Pounce) goes on cooldown and hits', s.player.cooldowns[0] > 0 && (!preyNow || preyNow.hp < preyHp), `cd ${s.player.cooldowns[0].toFixed(1)}s`);
  await shot('07-combat');
  await B.teleport(0, 40, Math.PI);
  await B.advance(8);

  // Levels, ability points and the Tab menu.
  await B.call('grantXp', 600);
  s = await B.state();
  check('XP raises level and gives ability points', s.player.level >= 8 && s.player.abilityPoints >= 7, `level ${s.player.level}, ${s.player.abilityPoints} points`);
  await page.keyboard.press('Tab');
  await page.locator('.growth-card').waitFor();
  check('Tab opens the growth menu and pauses', (await B.state()).screen === 'growth');
  const evolveBtn = page.getByRole('button', { name: /Evolve into Adult/ });
  check('cannot evolve with level but without growth', await evolveBtn.isDisabled());
  for (let i = 0; i < 3; i++) await page.locator('.ability-row .chip:not(:disabled)', { hasText: 'Unlock' }).first().click();
  s = await B.state();
  check('3 abilities unlocked with points', Object.keys(s.player.ranks).length === 4, JSON.stringify(s.player.ranks));
  await page.locator('.ability-row .chip:not(:disabled)', { hasText: 'Upgrade' }).first().click();
  s = await B.state();
  check('abilities can be upgraded', Object.values(s.player.ranks).some((r) => r === 2));
  await shot('08-growth-menu');
  await page.keyboard.press('Tab');
  check('Tab closes the menu', (await B.state()).screen === 'playing');

  // Howl buff and bleed bite.
  await tap('Digit2');
  s = await B.state();
  check('Howl buffs speed and damage', s.player.buffs.includes('wolf_howl') && s.player.moveSpeed > 6.2 * 1.2 + 0.5, `speed ${s.player.moveSpeed.toFixed(2)}`);
  // Pick a boar that is standing its ground (one walking home would step out of reach).
  const calm = s.enemies.filter((e) => e.alive && e.kind === 'boar' && ['idle', 'wander'].includes(e.state)).sort((p, q) => p.dist - q.dist)[0];
  const victim = calm ?? nearest(s, 'boar') ?? nearest(s);
  await B.teleport(victim.x, victim.z + 1.2);
  await B.lookAt(victim.x, victim.z);
  await tap('Digit3');
  await B.advance(0.4);
  s = await B.state();
  const bled = s.enemies.find((e) => e.id === victim.id);
  check('Bleed Bite applies a bleed', !bled || bled.bleeds > 0 || !bled.alive, bled ? `bleeds ${bled.bleeds}, hp ${victim.hp.toFixed(0)} -> ${bled.hp.toFixed(0)}, dist ${bled.dist.toFixed(2)}, cd ${s.player.cooldowns[2].toFixed(1)}` : 'died');

  // Evolution needs both tracks.
  await B.teleport(0, 40, Math.PI);
  await B.advance(0.2);
  await B.call('addGrowth', 100);
  await B.call('setHp', 20);
  await page.keyboard.press('Tab');
  await evolveBtn.click();
  await B.advance(0.2);
  s = await B.state();
  check('evolves Juvenile -> Adult', s.player.stage === 'adult' && Math.abs(s.player.size - 1) < 1e-6 && s.screen === 'playing');
  check('evolving heals and raises stats', s.player.hp === s.player.maxHp && s.player.maxHp > 90 * 1.8, `hp ${s.player.maxHp.toFixed(0)}`);
  await shot('09-adult-wolf');
  await page.keyboard.press('Tab');
  await page.locator('.growth-card').waitFor();
  const alphaBtn = page.getByRole('button', { name: /Evolve into Alpha/ });
  const growthCardText = await page.locator('.growth-card').innerText();
  check('Alpha is offered, but not until the meter is full and the animal is level 18',
    (await alphaBtn.isDisabled()) && /Reach level 18/.test(growthCardText) && !/Milestone 2|not available yet/.test(growthCardText));
  await page.keyboard.press('Escape');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.slot1')));
  await B.advance(1.5);
  const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.slot1')));
  check('progress is saved to localStorage', saved2.speciesId === 'wolf' && saved2.progress.stage === 'adult' && saved2.progress.level === s.player.level, saved ? '' : 'first read empty');

  // ---------- Boss ----------
  await B.teleport(0, -45, Math.PI);
  await B.advance(1);
  s = await B.state();
  let boss = s.enemies.find((e) => e.boss);
  check('boss wakes when the player enters the arena', ['chase', 'windup', 'charging', 'recover'].includes(boss.state), boss.state);
  await settle();
  check('boss bar appears', await page.locator('.hud-boss').isVisible());
  await shot('10-boss-engaged');

  // Die to the boss: a first death keeps the Adult stage but drops to level 8 and wounds the animal.
  check('about to die as a grown animal', s.player.level >= 8 && s.player.stage === 'adult' && Object.keys(s.player.ranks).length === 4);
  await B.teleport(boss.x, boss.z + 4);
  await B.call('setHp', 1);
  let waited = 0;
  while (!(await B.state()).player.dead && waited < 30) {
    await B.advance(0.5);
    waited += 0.5;
    const cur = await B.state();
    if (!cur.player.dead) await B.call('setHp', 1);
  }
  s = await B.state();
  check('player can die', s.player.dead, `after ${waited}s`);
  const deathText = await page.locator('.hud-death').innerText();
  check('death screen shows what was lost, and warns that the animal is wounded',
    (await page.locator('.hud-death').isVisible()) && /keep your life stage/i.test(deathText) && /level 8 Adult Grey Wolf/.test(deathText) && /wounded/i.test(deathText), deathText.replace(/\n+/g, ' | '));
  const savedDead = await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.slot1')));
  check('the death is saved the moment the animal dies',
    savedDead.progress.level === 8 && savedDead.progress.stage === 'adult' && savedDead.progress.wounded === true);
  await shot('11-defeated');
  await B.advance(4);
  s = await B.state();
  const d = s.player;
  check('respawns at the den', !d.dead && d.alive && Math.hypot(d.x - 0, d.z - 43) < 2 && d.hp === d.maxHp);
  check('a first death keeps the stage: still an Adult, at level 8, no XP, every bought ability refunded as points',
    d.level === 8 && d.stage === 'adult' && d.xp === 0 && d.abilityPoints === 7 && JSON.stringify(d.ranks) === '{"wolf_pounce":1}',
    `level ${d.level} ${d.stage}, points ${d.abilityPoints}, ranks ${JSON.stringify(d.ranks)}`);
  check('the animal keeps its Adult size and health', Math.abs(d.size - 1) < 1e-6 && d.maxHp > 90 * 1.8, `size ${d.size}, hp ${d.maxHp}`);
  check('the HUD shows "Wounded"', /Wounded/.test(await page.locator('.hud-status').textContent()));
  await B.advance(12);
  s = await B.state();
  boss = s.enemies.find((e) => e.boss);
  check('boss resets to full health after the player dies', boss.hp === boss.maxHp && ['idle', 'wander', 'return'].includes(boss.state), `${boss.hp}/${boss.maxHp} ${boss.state}`);

  // Spend the refunded points again before taking on the boss.
  await page.keyboard.press('Tab');
  await page.locator('.growth-card').waitFor();
  check('the Growth menu says what another death would cost',
    /Wounded: dying before you gain a level drops you to Juvenile/.test(await page.locator('.growth-card').innerText()));
  for (let i = 0; i < 3; i++) await page.locator('.ability-row .chip:not(:disabled)', { hasText: 'Unlock' }).first().click();
  await page.keyboard.press('Escape');
  await B.advance(0.2);
  s = await B.state();
  check('refunded points buy the abilities back', s.player.stage === 'adult' && s.player.level === 8 && Object.keys(s.player.ranks).length === 4 && s.screen === 'playing');

  await B.teleport(boss.x, boss.z + 5);
  const watchXp = () => page.evaluate(() => {
    window.__xp = [];
    window.__beast.app.game.events.on('xp', (e) => window.__xp.push(e.amount));
  });
  await watchXp();
  const bossFight = await fight('boss', { maxSeconds: 240, keepAlive: true });
  s = await B.state();
  check('boss can be defeated', bossFight.killed, `${bossFight.seconds}s`);
  check('the first win over the boss pays 300 XP', (await page.evaluate(() => window.__xp)).join() === '300');
  check('"Forest Ruled": biome ruled, next biome unlocked, gate open', s.ruled.includes('forest') && s.unlocked.includes('jungle') && s.gateOpen);
  check('"Forest Ruled" banner shows', /Forest Ruled/.test(await page.locator('.hud').innerText()));
  await shot('12-forest-ruled');

  await B.teleport(0, -97, Math.PI);
  await B.advance(0.2);
  s = await B.state();
  check('the open gate offers the next biome', s.prompt?.key === 'E' && /Enter the Jungle/.test(s.prompt.text), s.prompt?.text);
  await shot('13-gate-open');

  // ---------- Through the gate to the Jungle (Milestone 3), and back ----------
  {
  const levelAtGate = s.player.level;
  await tap('KeyE');
  await B.advance(0.2);
  await settle();
  s = await B.state();
  const jungle = await page.evaluate(() => {
    const w = window.__beast.app.world;
    return { spawn: w.layout.playerSpawn, returnGate: w.layout.returnGate, gate: w.layout.gate, arrive: w.gateSpot('return') };
  });
  check('pressing E at the gate takes the animal to the Jungle, just inside its gate back, facing in',
    s.biome === 'jungle' && s.screen === 'playing' && s.player.alive && Math.hypot(s.player.x - jungle.arrive.x, s.player.z - jungle.arrive.z) < 1.5 && Math.abs(Math.cos(s.player.yaw) + 1) < 0.01,
    `${s.biome} at ${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}`);
  check('the journey keeps the animal as it was: level, abilities, ruled biomes, save slot',
    s.player.level === levelAtGate && s.player.stage === 'adult' && Object.keys(s.player.ranks).length === 4 && s.ruled.join() === 'forest' && s.slot === 1 && s.species === 'wolf');
  const hudText = await page.locator('.hud').innerText();
  check('a banner names the biome and says what it does to this animal', /The Jungle/.test(hudText) && /-15% speed/i.test(hudText), hudText.replace(/\n/g, ' ').slice(0, 160));
  check('the HUD names the Jungle and shows the Wolf\'s nerf there (-15% speed)', /Jungle/.test(await page.locator('.hud-biome').innerText()) && s.player.mods.join() === 'speed:-0.15', s.player.mods.join());
  check('no prompt nags the animal the moment it arrives', s.prompt === null, s.prompt?.text);
  const jungleKinds = new Set(s.enemies.map((e) => e.kind));
  check('the Jungle has its own animals, its own rivals and its own boss',
    ['capybara', 'monkey', 'tapir', 'rival_tiger', 'rival_crocodile', 'silverback'].every((k) => jungleKinds.has(k)) && !jungleKinds.has('deer') && !jungleKinds.has('ancient_stag'),
    [...jungleKinds].join(', '));
  check('the Jungle\'s gate onward is sealed until its boss is beaten', !s.gateOpen);
  check('the journey is saved: slot 1 says the animal is in the Jungle', JSON.parse(await page.evaluate(() => localStorage.getItem('beastAscent.save.slot1'))).biome === 'jungle' && s.savedBiome === 'jungle');
  await shot('13b-jungle-arrival');

  // Quitting from the Jungle: the title is the Forest as always, and Continue Game wakes the animal at the Jungle's den.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  await page.locator('.title').waitFor();
  check('the title screen is the Forest, whichever biome the game was in',
    (await page.evaluate(() => window.__beast.app.world.biome.id)) === 'forest' && (await B.call('titleAnimals')).length >= 8);
  await page.getByRole('button', { name: /Continue Game/ }).click();
  await page.locator('.save-slot[data-slot="1"]').click();
  await page.locator('.hud').waitFor();
  await B.call('setAutoStep', false);
  await B.call('setRender', false);
  await B.advance(0.2);
  s = await B.state();
  check('Continue Game wakes the animal in the Jungle, safe at its den',
    s.biome === 'jungle' && Math.hypot(s.player.x - jungle.spawn.x, s.player.z - jungle.spawn.z) < 1 && s.player.safe && s.player.level === levelAtGate,
    `${s.biome} at ${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}`);
  await shot('13c-jungle-den');

  // The gate back, at the south edge.
  await B.teleport(jungle.returnGate.x, jungle.returnGate.z - 5, 0);
  await B.advance(0.2);
  s = await B.state();
  check('the gate back offers the Forest', s.prompt?.key === 'E' && /Return to the Forest/.test(s.prompt.text), s.prompt?.text);
  await tap('KeyE');
  await B.advance(0.2);
  s = await B.state();
  boss = s.enemies.find((e) => e.boss);
  check('it leads to the Forest\'s gate, the Forest is still ruled and its gate still open',
    s.biome === 'forest' && Math.hypot(s.player.x, s.player.z + 91) < 1.5 && s.ruled.join() === 'forest' && s.gateOpen && s.savedBiome === 'forest',
    `${s.biome} at ${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}`);
  check('the Forest\'s boss is back, because the animal left the biome and returned', !!boss && boss.alive && boss.kind === 'ancient_stag' && boss.hp === boss.maxHp);
  check('the Wolf has its Forest buff again (+20% speed)', s.player.mods.join() === 'speed:0.2', s.player.mods.join());
  }

  // ---------- Pause, quit, continue ----------
  await page.keyboard.press('Escape');
  await page.locator('.pause-card').waitFor();
  check('Esc pauses', (await B.state()).screen === 'paused');
  await shot('14-pause');
  await page.getByRole('button', { name: 'Resume' }).click();
  check('Resume returns to the game', (await B.state()).screen === 'playing');
  const level = (await B.state()).player.level;
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  await page.locator('.title').waitFor();
  check('Continue Game is available once an animal is saved', await page.getByRole('button', { name: /Continue Game/ }).isEnabled());
  await page.getByRole('button', { name: /Continue Game/ }).click();
  await page.locator('.slot-card').waitFor();
  const slot1Text = await page.locator('.save-slot[data-slot="1"]').innerText();
  check('Continue Game lists the saved animal in slot 1, and the other three slots are empty and cannot be picked',
    /Adult Grey Wolf, level/.test(slot1Text) && /Forest ruled/.test(slot1Text)
    && (await page.locator('.save-slot.empty:disabled').count()) === 3 && (await page.locator('.save-slot.filled:enabled').count()) === 1,
    slot1Text.replace(/\n/g, ' '));
  await shot('14c-slots-continue');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.title').waitFor();

  // Starting a new game in a full slot asks first, and backing out erases nothing.
  await page.getByRole('button', { name: /New Game/ }).click();
  await page.locator('.save-slot[data-slot="1"]').click();
  check('picking a slot that holds an animal asks before replacing it', /Replace slot 1\?/.test(await page.locator('.slot-card').innerText()) && /Adult Grey Wolf/.test(await page.locator('.slot-card').innerText()));
  await shot('14d-slots-replace');
  await page.getByRole('button', { name: /Keep it/ }).click();
  check('"Keep it" goes back to the four slots', (await page.locator('.save-slot').count()) === 4);
  await page.locator('.save-slot[data-slot="1"]').click();
  await page.getByRole('button', { name: /Pick an animal/ }).click();
  await page.locator('.select').waitFor();
  await page.getByRole('button', { name: /Back to slots/ }).click();
  check('backing out of species select returns to the slots, with the saved animal still there',
    (await page.locator('.save-slot[data-slot="1"]').innerText()).includes('Adult Grey Wolf') && JSON.parse(await page.evaluate(() => localStorage.getItem('beastAscent.save.slot1'))).progress.stage === 'adult');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.title').waitFor();

  await page.reload();
  await page.locator('.title').waitFor();
  await page.getByRole('button', { name: /Continue Game/ }).click();
  await page.locator('.save-slot[data-slot="1"]').click();
  await page.locator('.hud').waitFor();
  await B.call('setAutoStep', false);
  await B.call('setRender', false);
  await B.advance(0.2);
  s = await B.state();
  check('Continue restores species, stage, level, abilities and ruled biomes after a reload',
    s.player.stage === 'adult' && s.player.level === level && Object.keys(s.player.ranks).length === 4 && s.ruled.includes('forest') && s.gateOpen);
  boss = s.enemies.find((e) => e.boss);
  check('the boss is back when the player returns to the Forest, at full health', !!boss && boss.alive && boss.hp === boss.maxHp, boss ? `${boss.hp}/${boss.maxHp}` : 'no boss');

  // Beating it again pays the small repeat XP and rules nothing new.
  await watchXp();
  await page.evaluate(() => {
    const g = window.__beast.app.game;
    g.combat.damage(g.player.actor, g.spawner.boss, { damage: 1e7, knockback: 0 });
  });
  await B.advance(0.3);
  await page.waitForTimeout(100);
  s = await B.state();
  check('a repeat win pays only 50 XP, says so, and keeps the Forest ruled',
    (await page.evaluate(() => window.__xp)).join() === '50' && /defeated again: \+50 XP/.test(await page.locator('.hud-toasts').innerText()) && s.ruled.join() === 'forest' && s.gateOpen && !/Forest Ruled/.test(await page.locator('.hud').innerText()));
  await B.advance(3);
  check('the beaten boss stays down for the rest of this visit', !(await B.state()).enemies.some((e) => e.boss));

  // ---------- Alpha, and the death rule at every stage ----------
  await B.teleport(0, 43, Math.PI);
  await B.call('grantXp', 9000);
  await B.call('addGrowth', 250);
  await B.advance(0.2);
  await page.keyboard.press('Tab');
  await page.locator('.growth-card').waitFor();
  const alphaEvolve = page.getByRole('button', { name: /Evolve into Alpha/ });
  check('Alpha can be chosen once the meter is full and the animal is level 18', await alphaEvolve.isEnabled());
  await alphaEvolve.click();
  await B.advance(0.2);
  s = await B.state();
  check('evolves Adult -> Alpha: size 1.4, three times the health of a Juvenile',
    s.player.stage === 'alpha' && Math.abs(s.player.size - 1.4) < 1e-6 && s.player.level >= 18 && s.player.maxHp > 90 * 3 && s.screen === 'playing', `size ${s.player.size}, hp ${s.player.maxHp.toFixed(0)}`);
  await settle();
  check('the HUD shows an Alpha with a full growth meter', /Alpha Grey Wolf/.test(await page.locator('.hud-growth .who').innerText()) && /Fully grown/.test(await page.locator('.hud-growth').innerText()));
  await shot('14a-alpha-wolf');

  await page.keyboard.press('Tab');
  await page.locator('.growth-card').waitFor();
  check('the Growth menu says Fully grown', /Fully grown/.test(await page.locator('.growth-card').innerText()));
  await page.keyboard.press('Escape');
  await B.advance(1.5);
  const alphaSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.slot1')));
  check('an Alpha is saved as an Alpha', alphaSaved.progress.stage === 'alpha' && alphaSaved.progress.wounded === false);

  const killPlayer = async () => {
    await page.evaluate(() => {
      const g = window.__beast.app.game;
      const foe = g.spawner.enemies.find((e) => e.alive);
      g.combat.damage(foe, g.player.actor, { damage: 1e7, knockback: 0 });
    });
    await B.advance(0.3);
    await settle();
  };
  const wake = async () => {
    await B.advance(4.2);
    return (await B.state()).player;
  };

  const alphaLevel = (await B.state()).player.level;
  await killPlayer();
  check('Alpha, first death: the death screen says the stage is kept', /keep your life stage/i.test(await page.locator('.hud-death').innerText()));
  let w = await wake();
  check('Alpha, first death: still an Alpha, back at level 18, wounded, abilities refunded',
    w.stage === 'alpha' && w.level === 18 && alphaLevel >= 18 && w.abilityPoints === 17 && JSON.stringify(w.ranks) === '{"wolf_pounce":1}' && Math.abs(w.size - 1.4) < 1e-6,
    `${w.stage} level ${w.level}, points ${w.abilityPoints}`);
  check('an Alpha that has died once is wounded', /Wounded/.test(await page.locator('.hud-status').textContent()) && (await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.slot1')))).progress.wounded === true);

  await killPlayer();
  check('Alpha, second death: the death screen says the animal falls back to Adult', /Alpha to Adult/.test(await page.locator('.hud-death').innerText()));
  w = await wake();
  check('second death before a new level: falls back to Adult at level 8, growth meter empty, still wounded',
    w.stage === 'adult' && w.level === 8 && w.growth === 0 && w.abilityPoints === 7 && Math.abs(w.size - 1) < 1e-6 && (await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.slot1')))).progress.wounded === true,
    `${w.stage} level ${w.level}, growth ${w.growth}`);
  await shot('14b-fallen-to-adult');

  // Gaining a level heals the wound, so the next death is a first death again.
  await B.call('grantXp', 400);
  await B.advance(0.2);
  await settle();
  s = await B.state();
  check('gaining a level heals the wound', s.player.level > 8 && s.player.stage === 'adult' && !/Wounded/.test(await page.locator('.hud-status').textContent()), `level ${s.player.level}`);
  await killPlayer();
  w = await wake();
  check('so the next death keeps the Adult stage, at level 8', w.stage === 'adult' && w.level === 8, `${w.stage} level ${w.level}`);

  await killPlayer();
  w = await wake();
  s = await B.state();
  check('then a second death in a row falls back to a level 1 Juvenile, no longer wounded',
    w.stage === 'juvenile' && w.level === 1 && w.abilityPoints === 0 && Math.abs(w.size - 0.6) < 1e-6 && Math.abs(w.maxHp - 90) < 0.01 && !/Wounded/.test(await page.locator('.hud-status').textContent()), `${w.stage} level ${w.level}`);
  check('every death keeps ruled biomes and the open gate', s.ruled.includes('forest') && s.unlocked.includes('jungle') && s.gateOpen);

  // ---------- Lion ----------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  // The Lion goes into slot 2, beside the Wolf in slot 1: two animals live side by side.
  begin = await newGame('Lion', undefined, 2);
  await begin();
  s = await B.state();
  check('lion: no Forest modifier, boss is back for a new game', s.player.mods.length === 0 && s.enemies.some((e) => e.boss) && !s.gateOpen);
  const slotsNow = async () => page.evaluate(() => [1, 2, 3, 4].map((n) => JSON.parse(localStorage.getItem(`beastAscent.save.slot${n}`))));
  let both = await slotsNow();
  check('a new animal in slot 2 leaves the Wolf in slot 1 alone',
    (await page.evaluate(() => window.__beast.app.game.slot)) === 2 && both[0]?.speciesId === 'wolf' && both[1]?.speciesId === 'lion' && both[2] === null && both[3] === null,
    both.map((x) => x?.speciesId ?? 'empty').join(', '));
  await B.call('grantXp', 5); // too little for a level, so the lion stays a level 1 for the checks below
  await B.advance(1.5);
  const lionXp = await page.evaluate(() => window.__beast.app.game.growth.progress.xp);
  both = await slotsNow();
  check('progress goes to the slot the animal lives in, and the Wolf in slot 1 is untouched',
    lionXp > 0 && both[1].progress.xp === lionXp && both[0].speciesId === 'wolf' && both[0].progress.level === 1,
    `lion saved xp ${both[1].progress.xp} (live ${lionXp}), wolf level ${both[0].progress.level}`);
  await settle();
  check('lion HUD shows "No modifier here"', /No modifier here/.test(await page.locator('.hud-biome').innerText()));
  const lionSpot = await pickTree('fruit');
  await B.teleport(lionSpot.x + 2.6, lionSpot.z);
  await B.advance(0.1);
  const lionPrompt = (await B.state()).prompt?.text ?? '';
  check('a lion gets no prompt at a fruit tree: it does not eat leaves or fruit', !/Eat|cannot/.test(lionPrompt), `prompt "${lionPrompt}"`);
  await B.teleport(0, 43, Math.PI);
  await B.advance(0.3);
  const lionTarget = nearest(s, 'boar');
  await B.teleport(lionTarget.x, lionTarget.z + 3);
  await B.lookAt(lionTarget.x, lionTarget.z);
  await tap('Digit1');
  await B.advance(0.4);
  s = await B.state();
  const roared = s.enemies.find((e) => e.id === lionTarget.id);
  check('Mighty Roar stuns and slows nearby enemies', roared.stun > 0 && roared.slow > 0, `stun ${roared.stun.toFixed(2)} slow ${roared.slow.toFixed(2)}`);
  await shot('15-lion-roar');
  await B.call('grantXp', 200);
  await page.keyboard.press('Tab');
  for (let i = 0; i < 3; i++) await page.locator('.ability-row .chip:not(:disabled)', { hasText: 'Unlock' }).first().click();
  await page.keyboard.press('Tab');
  s = await B.state();
  check('lion: Pride Presence passive adds defense', s.player.defense === 6 + 8, `defense ${s.player.defense}`);
  const lionFight = await fight('boar', { keepAlive: true });
  check('lion wins a fight', lionFight.killed, `${lionFight.seconds}s`);
  await tap('Digit2');
  await B.advance(0.5);
  await tap('Digit3');
  await B.advance(0.8);
  s = await B.state();
  check('lion: Claw Swipe and Pounce Slam go on cooldown', s.player.cooldowns[1] > 0 && s.player.cooldowns[2] > 0);
  await B.teleport(0, 40, Math.PI);
  await B.advance(20);
  const lionHunt = await hunt('deer');
  check('lion can run down and kill a fleeing deer', lionHunt.killed && lionHunt.fled, JSON.stringify(lionHunt));

  // Rival predators.
  s = await B.state();
  const lionRivals = s.enemies.map((e) => e.kind).filter((k) => k.startsWith('rival'));
  check('a lion meets a pair of wolves, a bear and another lion', lionRivals.sort().join() === 'rival_bear,rival_lion,rival_wolf,rival_wolf', lionRivals.join(' '));
  const rivalWolf = nearest(s, 'rival_wolf');
  await hold(rivalWolf.id, 0); // facing the player, who stands 9 m south of it
  await B.teleport(rivalWolf.x, rivalWolf.z + 9);
  await B.advance(1.2);
  const wolfNow = (await B.state()).enemies.find((e) => e.id === rivalWolf.id);
  check('a rival wolf attacks on sight', ['chase', 'windup', 'charging', 'recover'].includes(wolfNow.state), wolfNow.state);
  await B.call('grantXp', 400);
  const rivalFight = await fight('rival_wolf', { keepAlive: true, maxSeconds: 60 });
  check('a rival predator fights back and can be killed', rivalFight.killed && rivalFight.hurt, `${rivalFight.seconds}s`);

  // ---------- Bears ----------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  begin = await newGame('Bear', 'Polar');
  await begin();
  s = await B.state();
  check('polar bear: no Forest buff, Ice Slam on key 2', s.player.mods.length === 0 && s.player.abilities.join() === 'bear_heavy_swipe,bear_ice_slam');
  await shot('16-polar-bear');
  // Leafy plants grow in random places. If one grew beside this bush the bear would be offered the plant
  // (the nearest food) instead of the berries, so clear any plant near the bush first.
  await page.evaluate(() => {
    const food = window.__beast.app.game.food;
    for (const item of [...food.items]) if (item.kind === 'plant' && Math.hypot(item.pos.x + 14, item.pos.z - 31.5) < 8) food.consume(item);
  });
  await B.teleport(-14, 31.5);
  await B.advance(0.1);
  s = await B.state();
  check('omnivore can eat berries', s.prompt?.key === 'E' && /Eat berries/.test(s.prompt.text), s.prompt?.text);
  await tap('KeyE');
  s = await B.state();
  check('berries give growth', s.player.growth === 6, `growth ${s.player.growth}`);
  await B.teleport(46, 12);
  await B.advance(0.6);
  s = await B.state();
  check('animals swim in the pond', s.player.swimming);
  const fish = s.food.filter((f) => f.kind === 'fish' && f.available);
  const pondFish = await page.evaluate(() => window.__beast.app.world.layout.waters.map((w) => w.fish));
  check('fish live in every pond: 4 in the old one, and some in each of the three new ones', fish.length === pondFish.reduce((a, b) => a + b, 0) && pondFish.length === 4 && pondFish.every((n) => n >= 2), `${fish.length} fish, per pond ${pondFish.join(', ')}`);
  // Every pond can be swum in, and none of them is just a painted patch.
  const waterBodies = await page.evaluate(() => window.__beast.app.world.layout.waters);
  for (const [i, w] of waterBodies.entries()) {
    await B.teleport(w.x, w.z);
    await B.advance(0.6);
    const inWater = (await B.state()).player;
    check(`animals swim in pond ${i + 1} (radius ${w.radius} m)`, inWater.wet && inWater.swimming, `wet ${inWater.wet}, swimming ${inWater.swimming}`);
  }
  // Fish swim away from an animal that wades in, so catching one takes a little chase.
  const pond0 = waterBodies[0];
  const foodNow = (await B.state()).food;
  const fi = foodNow.findIndex((f) => f.kind === 'fish' && f.available && Math.hypot(f.x - pond0.x, f.z - pond0.z) < pond0.radius - 6);
  const fishPoked = foodNow[fi];
  const towardMiddle = Math.hypot(pond0.x - fishPoked.x, pond0.z - fishPoked.z) || 1;
  await B.teleport(fishPoked.x + ((pond0.x - fishPoked.x) / towardMiddle) * 3.5, fishPoked.z + ((pond0.z - fishPoked.z) / towardMiddle) * 3.5);
  await B.advance(0.1);
  const gap = async () => {
    const st = await B.state();
    return Math.hypot(st.food[fi].x - st.player.x, st.food[fi].z - st.player.z);
  };
  const gap0 = await gap();
  await B.advance(1.5);
  const gap1 = await gap();
  check('a fish swims away from a bear that wades in beside it', gap1 > gap0 + 1.2, `the gap grew from ${gap0.toFixed(1)} to ${gap1.toFixed(1)} m`);
  await B.teleport(46, 12);
  await B.advance(0.6);
  await B.call('grantXp', 200);
  await page.keyboard.press('Tab');
  for (let i = 0; i < 3; i++) await page.locator('.ability-row .chip:not(:disabled)', { hasText: 'Unlock' }).first().click();
  await page.keyboard.press('Tab');
  let ate = false;
  for (let i = 0; i < 40 && !ate; i++) {
    s = await B.state();
    const f = s.food.filter((x) => x.kind === 'fish' && x.available)[0];
    await B.teleport(f.x, f.z);
    await tap('KeyE', 0.02);
    ate = (await B.state()).player.growth > 6;
  }
  s = await B.state();
  check('polar bear: Arctic Swimmer gives +50% growth from fish', s.player.growth === 6 + 15, `growth ${s.player.growth}`);
  await shot('17-bear-swimming');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  begin = await newGame('Bear', 'Brown');
  await begin();
  s = await B.state();
  check('brown bear: +20% max health in the Forest', s.player.mods.includes('maxHealth:0.2') && Math.abs(s.player.maxHp - 180) < 0.01, `hp ${s.player.maxHp}`);
  const bearRivals = s.enemies.map((e) => e.kind).filter((k) => k.startsWith('rival'));
  check('a bear meets a pair of wolves, a lion and another bear', bearRivals.sort().join() === 'rival_bear,rival_lion,rival_wolf,rival_wolf', bearRivals.join(' '));
  const bearTarget = nearest(s, 'boar');
  await B.teleport(bearTarget.x, bearTarget.z + 1.6);
  await B.lookAt(bearTarget.x, bearTarget.z);
  await tap('Digit1');
  await B.advance(0.7);
  s = await B.state();
  const swiped = s.enemies.find((e) => e.id === bearTarget.id);
  check('Heavy Swipe hits hard', !swiped || swiped.hp < bearTarget.hp - 25, swiped ? `${bearTarget.hp.toFixed(0)} -> ${swiped.hp.toFixed(0)}` : 'killed');
  await shot('18-brown-bear');
  // The bear is the slowest playable animal, and a level 1 Juvenile here: the hardest case for catching prey.
  await B.teleport(0, 40, Math.PI);
  await B.advance(20);
  const bearDeer = await hunt('deer');
  check('juvenile bear (slowest species) can run down and kill a fleeing deer', bearDeer.killed && bearDeer.fled, JSON.stringify(bearDeer));
  await B.teleport(0, 40, Math.PI);
  await B.advance(10);
  const bearFox = await hunt('fox');
  check('juvenile bear can catch a fox that bolts when hurt', bearFox.killed, JSON.stringify(bearFox));

  // ---------- Tiger ----------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  begin = await newGame('Tiger');
  await begin();
  s = await B.state();
  check('tiger: a level 1 Juvenile with Ambush Strike on key 1 and no Forest modifier',
    s.player.stage === 'juvenile' && s.player.level === 1 && s.player.mods.length === 0 && s.player.abilities[0] === 'tiger_ambush_strike' && JSON.stringify(s.player.ranks) === '{"tiger_ambush_strike":1}',
    s.player.abilities.join());
  const tigerRivals = s.enemies.map((e) => e.kind).filter((k) => k.startsWith('rival'));
  check('a tiger meets all four rivals: a pair of wolves, a lion and a bear', tigerRivals.sort().join() === 'rival_bear,rival_lion,rival_wolf,rival_wolf', tigerRivals.join(' '));
  await shot('18a-tiger');

  // A stunned boar cannot turn, so its facing is fixed: yaw 0 faces +z, which puts its back toward -z.
  await page.evaluate(() => {
    const g = window.__beast.app.game;
    window.__dmg = [];
    g.events.on('damage', (e) => {
      if (e.attacker === g.player.actor) window.__dmg.push({
        target: e.target.id, amount: e.amount, kind: e.kind, ambush: !!e.ambush,
        dist: Math.hypot(e.target.pos.x - g.player.actor.pos.x, e.target.pos.z - g.player.actor.pos.z), yaw: g.player.actor.yaw,
      });
    });
  });
  const prepBoar = () => page.evaluate(() => {
    const g = window.__beast.app.game;
    const w = g.world;
    const boar = g.spawner.enemies.find((e) => e.def.id === 'boar' && e.alive && Math.hypot(e.pos.x, e.pos.z) < 90
      && !w.colliders.blocked(e.pos.x, e.pos.z - 1.5, 0.9) && !w.colliders.blocked(e.pos.x, e.pos.z + 1.5, 0.9));
    boar.hp = boar.stats.maxHealth;
    boar.stun = 6;
    boar.yaw = 0;
    boar.vx = boar.vz = 0;
    boar.knock.set(0, 0, 0);
    // Nobody else may knock the tiger away, or steal its aim, during the test.
    for (const o of g.spawner.enemies) {
      if (o !== boar && o.alive && Math.hypot(o.pos.x - boar.pos.x, o.pos.z - boar.pos.z) < 14) o.stun = 6;
    }
    g.player.abilities.resetCooldowns();
    g.player.actor.stamina = g.player.actor.stats.stamina;
    return { id: boar.id, x: boar.pos.x, z: boar.pos.z };
  });
  const strike = async (key, behind) => {
    const t = await prepBoar();
    await B.teleport(t.x, t.z + (behind ? -1.5 : 1.5));
    await B.lookAt(t.x, t.z);
    await page.evaluate(() => { window.__dmg = []; });
    const before = await B.state();
    await tap(key);
    await B.advance(0.9);
    // Only count hits on the boar being tested: another animal may be standing inside the arc.
    const log = (await page.evaluate(() => window.__dmg)).filter((d) => d.target === t.id);
    const after = await B.state();
    const boar = after.enemies.find((e) => e.id === t.id);
    const near = after.enemies.filter((e) => e.alive && e.id !== t.id && e.dist < 8).map((e) => `${e.kind}:${e.dist.toFixed(1)}:${e.state}`);
    const wanted = Math.atan2(boar.x - after.player.x, boar.z - after.player.z);
    const diag = `boar#${t.id} ${boar.state} stun ${boar.stun.toFixed(1)} at (${boar.x.toFixed(2)}, ${boar.z.toFixed(2)}) dist ${boar.dist.toFixed(2)}; `
      + `tiger (${before.player.x.toFixed(2)}, ${before.player.z.toFixed(2)}) -> (${after.player.x.toFixed(2)}, ${after.player.z.toFixed(2)}) yaw ${after.player.yaw.toFixed(2)} wanted ${wanted.toFixed(2)} `
      + `hp ${after.player.hp.toFixed(0)} dead ${after.player.dead} screen ${after.screen} grounded ${before.player.grounded}; `
      + `hit distances ${JSON.stringify(log.filter((d) => d.kind === 'hit').map((d) => +d.dist.toFixed(2)))}; near ${near.join(' ') || 'none'}`;
    return { log, boar, diag };
  };
  const front = await strike('Digit1', false);
  const behind = await strike('Digit1', true);
  check('Ambush Strike from the front is an ordinary hit', front.log.length === 1 && !front.log[0].ambush, `${JSON.stringify(front.log)} ${front.diag}`);
  check('Ambush Strike from behind is flagged as an ambush and hits about 75% harder',
    behind.log.length === 1 && !!front.log[0] && behind.log[0].ambush && behind.log[0].amount > front.log[0].amount * 1.5, `${front.log[0]?.amount} from the front, ${behind.log[0]?.amount} from behind; ${behind.diag}`);
  await settle();
  check('the damage number of an ambush is marked', (await page.locator('.dmg.ambush').count()) > 0);

  // Sneaking: a boar with its back turned does not notice a tiger creeping up behind it.
  const sneak = await page.evaluate(() => {
    const g = window.__beast.app.game;
    const w = g.world;
    const boar = g.spawner.enemies.find((e) => e.def.id === 'boar' && e.alive && Math.hypot(e.pos.x, e.pos.z) < 90
      && !w.colliders.blocked(e.pos.x, e.pos.z - 6, 0.9) && !w.colliders.blocked(e.pos.x, e.pos.z - 3.5, 0.9)
      && !w.colliders.blocked(e.pos.x, e.pos.z - 1.5, 0.9));
    return { id: boar.id, x: boar.pos.x, z: boar.pos.z };
  });
  const boarAt = async () => (await B.state()).enemies.find((e) => e.id === sneak.id);
  await hold(sneak.id, 0); // faces +z, so the tiger at -z is behind it
  await B.teleport(sneak.x, sneak.z - 6);
  await B.advance(1);
  let sneakNow = await boarAt();
  check('a boar with its back turned does not notice a tiger 6 m behind it', sneakNow.state === 'idle', `${sneakNow.state}, ${sneakNow.dist.toFixed(1)} m`);
  await B.teleport(sneak.x, sneak.z - 3.5);
  await B.advance(1);
  sneakNow = await boarAt();
  check('nor a tiger 3.5 m behind it', sneakNow.state === 'idle', `${sneakNow.state}, ${sneakNow.dist.toFixed(1)} m`);
  await B.teleport(sneak.x, sneak.z - 1.5);
  await B.advance(0.3);
  sneakNow = await boarAt();
  check('but it notices a tiger 1.5 m behind it', ['chase', 'windup', 'charging', 'recover'].includes(sneakNow.state), `${sneakNow.state}, ${sneakNow.dist.toFixed(1)} m`);
  await B.teleport(0, 43, Math.PI);
  await B.advance(6);
  await B.call('setHp', (await B.state()).player.maxHp);

  // Unlock the other three abilities.
  await B.call('grantXp', 200);
  await page.keyboard.press('Tab');
  await page.locator('.growth-card').waitFor();
  for (let i = 0; i < 3; i++) await page.locator('.ability-row .chip:not(:disabled)', { hasText: 'Unlock' }).first().click();
  await page.keyboard.press('Tab');
  s = await B.state();
  check('tiger: Rend, Double Claw and Stalk can be unlocked',
    s.player.ranks.tiger_rend === 1 && s.player.ranks.tiger_double_claw === 1 && s.player.ranks.tiger_stalk === 1 && s.player.abilities.join() === 'tiger_ambush_strike,tiger_rend,tiger_double_claw', JSON.stringify(s.player.ranks));
  const rend = await strike('Digit2', false);
  check('Rend leaves the target bleeding', rend.boar.bleeds > 0 && rend.log.some((d) => d.kind === 'hit'), `bleeds ${rend.boar.bleeds}; ${rend.diag}`);
  const claws = await strike('Digit3', false);
  check('Double Claw lands two hits', claws.log.filter((d) => d.kind === 'hit').length === 2, `${claws.log.filter((d) => d.kind === 'hit').length} hits; ${claws.diag}`);

  // Stalk: faster while no animal has noticed the tiger. After a fight an animal that is stunned or
  // mid-attack still counts as having noticed it, so wait (at the den, where chases are called off)
  // until the animals have calmed down.
  const stalkSpeed = 5.8 * 1.15;
  const waitUntilUnseen = async () => {
    await B.teleport(0, 43, Math.PI);
    let waited = 0;
    let st = await B.state();
    while (Math.abs(st.player.moveSpeed - stalkSpeed) >= 0.02 && waited < 12) {
      await B.advance(0.5);
      waited += 0.5;
      st = await B.state();
    }
    const alerts = st.enemies.filter((e) => e.alive && e.dist < 95 && ['chase', 'windup', 'charging', 'recover', 'flee'].includes(e.state)).map((e) => `${e.kind}:${e.state}`);
    return { state: st, waited, alerts };
  };
  let atDen = await waitUntilUnseen();
  await settle();
  s = atDen.state;
  check('Stalk: +15% speed while unseen, and the HUD says "Unseen"',
    Math.abs(s.player.moveSpeed - stalkSpeed) < 0.02 && /Unseen/.test(await page.locator('.hud-status').textContent()),
    `speed ${s.player.moveSpeed.toFixed(2)} after ${atDen.waited}s${atDen.alerts.length ? `, still alert: ${atDen.alerts.join(' ')}` : ''}`);
  const noticer = nearest(s, 'boar');
  await hold(noticer.id, 0); // facing the tiger, who stands 5 m south of it
  await B.teleport(noticer.x, noticer.z + 5);
  await B.advance(0.4);
  await settle();
  s = await B.state();
  check('Stalk stops once an animal has noticed the tiger',
    Math.abs(s.player.moveSpeed - 5.8) < 0.02 && !/Unseen/.test(await page.locator('.hud-status').textContent()), `speed ${s.player.moveSpeed.toFixed(2)}`);
  atDen = await waitUntilUnseen();
  check('and comes back within a few seconds of the tiger reaching the den', Math.abs(atDen.state.player.moveSpeed - stalkSpeed) < 0.02,
    `after ${atDen.waited}s${atDen.alerts.length ? `, still alert: ${atDen.alerts.join(' ')}` : ''}`);
  s = atDen.state;

  // A tiger is fast enough to catch prey.
  await B.call('setHp', s.player.maxHp);
  await B.advance(20);
  const tigerDeer = await hunt('deer');
  check('tiger can run down and kill a fleeing deer', tigerDeer.killed && tigerDeer.fled, JSON.stringify(tigerDeer));

  // ---------- Elephant, Crocodile and Eagle ----------
  /** Records every hit the player lands, with where it came from. Install once per game. */
  const trackDamage = () => page.evaluate(() => {
    const g = window.__beast.app.game;
    window.__dmg = [];
    g.events.on('damage', (e) => {
      if (e.attacker === g.player.actor) {
        window.__dmg.push({ target: e.target.id, amount: e.amount, kind: e.kind, ambush: !!e.ambush });
      }
    });
  });
  /**
   * Finds open ground with a clear run (8 m south, 14 m north) and puts still boars on it, `offsets`
   * metres north (negative) or south (positive) of the anchor. They face south, stunned for `stunFor`
   * seconds. Every other animal within 25 m is stunned so that nobody interferes.
   */
  const corridor = (offsets, stunFor = 6) => page.evaluate(([offs, stun]) => {
    const g = window.__beast.app.game;
    const w = g.world;
    const boars = g.spawner.enemies.filter((e) => e.alive && !e.isBoss && e.def.id === 'boar');
    const anchor = boars.find((b) => {
      for (let dz = -14; dz <= 8; dz++) if (w.colliders.blocked(b.pos.x, b.pos.z + dz, 1.6)) return false;
      return Math.hypot(b.pos.x, b.pos.z) < 85;
    }) ?? boars[0];
    const ax = anchor.pos.x;
    const az = anchor.pos.z;
    const ids = [];
    offs.forEach((dz, i) => {
      const b = boars[i];
      b.pos.set(ax, w.heightAt(ax, az + dz), az + dz);
      b.hp = b.stats.maxHealth;
      b.state = 'idle';
      b.timer = 99;
      b.yaw = 0;
      b.vx = b.vz = 0;
      b.knock.set(0, 0, 0);
      b.stun = stun;
      b.provoked = false;
      // Where it is placed is its home now: far from its own, it would give up a chase at once.
      b.homeX = b.pos.x;
      b.homeZ = b.pos.z;
      ids.push(b.id);
    });
    for (const o of g.spawner.enemies) {
      if (!o.alive || ids.includes(o.id)) continue;
      const d = Math.hypot(o.pos.x - ax, o.pos.z - az);
      // Animals that are not part of the test move out of the way (aim assist would turn toward them),
      // and the others nearby are stunned so that nobody interferes.
      if (d < 14) o.pos.set(o.pos.x + 30, g.world.heightAt(o.pos.x + 30, o.pos.z), o.pos.z);
      if (d < 25) o.stun = 6;
    }
    g.player.abilities.resetCooldowns();
    g.player.actor.stamina = g.player.actor.stats.stamina;
    return { ax, az, ids };
  }, [offsets, stunFor]);
  const duelNote = async (id) => {
    const st = await B.state();
    const b = st.enemies.find((e) => e.id === id);
    return `player (${st.player.x.toFixed(1)}, ${st.player.z.toFixed(1)}) yaw ${st.player.yaw.toFixed(2)} hp ${st.player.hp.toFixed(0)}; boar ${b.state} (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) stun ${b.stun.toFixed(2)} dist ${b.dist.toFixed(2)}`;
  };
  const hitsOn = async (id) => (await page.evaluate(() => window.__dmg)).filter((d) => d.target === id && d.kind === 'hit');
  const clearDamage = () => page.evaluate(() => { window.__dmg = []; });
  const unlockThree = async () => {
    await B.call('grantXp', 200);
    await page.keyboard.press('Tab');
    await page.locator('.growth-card').waitFor();
    for (let i = 0; i < 3; i++) await page.locator('.ability-row .chip:not(:disabled)', { hasText: 'Unlock' }).first().click();
    await page.keyboard.press('Tab');
  };

  // ---------- Elephant ----------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  begin = await newGame('Elephant');
  await begin();
  await trackDamage();
  s = await B.state();
  check('elephant: a level 1 Juvenile with Charge on key 1 and no Forest modifier',
    s.player.stage === 'juvenile' && s.player.mods.length === 0 && s.player.abilities[0] === 'elephant_charge' && Math.abs(s.player.size - 0.6) < 1e-6, s.player.abilities.join());
  const elephantRivals = s.enemies.map((e) => e.kind).filter((k) => k.startsWith('rival'));
  check('an elephant meets all four rivals', elephantRivals.sort().join() === 'rival_bear,rival_lion,rival_wolf,rival_wolf', elephantRivals.join(' '));
  await shot('18e-elephant');

  const plants = s.food.filter((f) => f.kind === 'plant' && f.reserve === undefined);
  const plantsAtDen = plants.filter((f) => Math.hypot(f.x, f.z - 52) < 12).length;
  check('the Forest has plants for herbivores, a few of them inside the den refuge', plants.length >= 28 && plantsAtDen >= 3, `${plants.length} plants, ${plantsAtDen} at the den`);
  const nearestPlant = plants.sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
  await B.teleport(nearestPlant.x, nearestPlant.z + 0.5);
  await B.advance(0.1);
  s = await B.state();
  check('an elephant can eat plants', s.prompt?.key === 'E' && /Eat plants/.test(s.prompt.text), s.prompt?.text);
  await tap('KeyE');
  s = await B.state();
  check('plants give growth, and grow back later', s.player.growth === 7 && s.food.filter((f) => f.kind === 'plant' && f.reserve === undefined && f.available).length === plants.length - 1, `growth ${s.player.growth}`);
  const fishAt = s.food.find((f) => f.kind === 'fish');
  await B.teleport(fishAt.x, fishAt.z);
  await B.advance(0.1);
  s = await B.state();
  check('a herbivore is told it cannot eat fish, with the right article', /^An elephant cannot eat fish/.test(s.prompt?.text ?? ''), s.prompt?.text);

  // Food on the trees: leaves on every tree, fruit on some broadleaf trees, nuts on some pines.
  const treats = await page.evaluate(() => window.__beast.treatTrees());
  const nFruit = treats.filter((t) => t.kind === 'fruit').length;
  const nNuts = treats.filter((t) => t.kind === 'nut').length;
  check('some trees bear fruit and some pines bear nuts', nFruit >= 15 && nNuts >= 15, `${nFruit} fruit trees, ${nNuts} nut trees`);
  const treeFeast = async (kind, word, growth) => {
    const tree = await pickTree(kind);
    await B.teleport(tree.x + 2.6, tree.z);
    await B.advance(0.1);
    s = await B.state();
    check(`an elephant is offered ${word} at a ${kind} tree`, new RegExp(`^Eat ${word}`).test(s.prompt?.text ?? ''), `prompt "${s.prompt?.text ?? ''}"`);
    let before = s.player.growth;
    await tap('KeyE');
    await B.advance(0.1);
    s = await B.state();
    check(`${word} give ${growth} growth`, s.player.growth - before === growth, `+${s.player.growth - before}`);
    check('the leaves are still there to eat afterwards', /^Eat leaves/.test(s.prompt?.text ?? ''), `prompt "${s.prompt?.text ?? ''}"`);
    before = s.player.growth;
    await tap('KeyE');
    await B.advance(0.1);
    s = await B.state();
    check('leaves give only 3 growth, the least of any food', s.player.growth - before === 3, `+${s.player.growth - before}`);
    check('and then the tree is bare', !/^Eat/.test(s.prompt?.text ?? ''), `prompt "${s.prompt?.text ?? ''}"`);
    for (let minute = 0; minute < 3; minute++) {
      await B.advance(21);
      await B.call('setHp', s.player.maxHp); // a wandering rival must not end the test early
    }
    await B.teleport(tree.x + 2.6, tree.z);
    await B.advance(0.2);
    s = await B.state();
    check(`${word} are back after a minute`, new RegExp(`^Eat ${word}`).test(s.prompt?.text ?? ''), `prompt "${s.prompt?.text ?? ''}"`);
  };
  await treeFeast('fruit', 'fruit', 8);
  await treeFeast('nut', 'nuts', 10);

  // The fox food reserves: calm guards, rich food, and a raid angers every fox nearby.
  s = await B.state();
  const guardFoxes = s.enemies.filter((e) => e.kind === 'fox' && e.calm);
  const allFoxes = s.enemies.filter((e) => e.kind === 'fox');
  check('seven calm foxes guard the two fox food reserves, besides the foxes elsewhere', guardFoxes.length === 7 && allFoxes.length >= 12, `${guardFoxes.length} guards, ${allFoxes.length} foxes`);
  const produce = s.food.filter((f) => f.reserve !== undefined);
  check('each reserve holds six different fruits and vegetables', [0, 1].every((r) => produce.filter((f) => f.reserve === r).length === 6) && new Set(produce.map((f) => f.label)).size === 6, [...new Set(produce.map((f) => f.label))].join(', '));
  const firstProduce = produce.find((f) => f.reserve === 0);
  await B.teleport(firstProduce.x + 1.6, firstProduce.z);
  await B.call('setHp', s.player.maxHp);
  await B.advance(2);
  s = await B.state();
  const nearGuards = s.enemies.filter((e) => e.kind === 'fox' && e.calm && Math.hypot(e.x - firstProduce.x, e.z - firstProduce.z) < 15);
  check('the guards ignore an animal that stands among their food', nearGuards.length >= 3 && nearGuards.every((e) => ['idle', 'wander'].includes(e.state)), nearGuards.map((e) => e.state).join(','));
  check('and the elephant is offered the produce', /^Eat (carrot|sweet potato|corn|apple|berries|cherry tomato)/.test(s.prompt?.text ?? ''), `prompt "${s.prompt?.text ?? ''}"`);
  await shot('18j-fox-reserve');
  const growthAtReserve = s.player.growth;
  await tap('KeyE');
  await B.advance(0.3);
  s = await B.state();
  check('reserve produce gives 12 growth, more than anything growing wild', s.player.growth - growthAtReserve === 12, `+${s.player.growth - growthAtReserve}`);
  const furious = s.enemies.filter((e) => e.kind === 'fox' && Math.hypot(e.x - firstProduce.x, e.z - firstProduce.z) <= 15);
  const faraway = s.enemies.filter((e) => e.kind === 'fox' && Math.hypot(e.x - firstProduce.x, e.z - firstProduce.z) > 20);
  check('raiding the reserve sends every fox nearby after the raider', furious.length >= 3 && furious.every((e) => e.provoked && !e.calm), `${furious.length} foxes, states ${furious.map((e) => e.state).join(',')}`);
  check('the foxes far away, and the guards of the other reserve, stay calm', faraway.length >= 6 && faraway.every((e) => !e.provoked), `${faraway.filter((e) => e.provoked).length} of ${faraway.length} far foxes angry`);
  await B.teleport(0, 43, Math.PI);
  await B.advance(0.5);
  await B.call('setHp', s.player.maxHp);

  // Charge: a ground dash that hits everything on the way, once each.
  let line = await corridor([0, -3]);
  await B.teleport(line.ax, line.az + 4);
  await B.lookAt(line.ax, line.az);
  await clearDamage();
  const chargeFrom = (await B.state()).player;
  await tap('Digit1');
  await B.advance(1.2);
  s = await B.state();
  const moved1 = Math.hypot(s.player.x - chargeFrom.x, s.player.z - chargeFrom.z);
  const hitCounts = await Promise.all(line.ids.map(async (id) => (await hitsOn(id)).length));
  check('Charge hits everything in its path, once each', hitCounts.every((n) => n === 1), `hits ${hitCounts.join(',')}; ${await duelNote(line.ids[1])}`);
  check('Charge carries the elephant forward and knocks them aside', moved1 > 6 && s.enemies.find((e) => e.id === line.ids[0]).z < line.az - 0.8, `moved ${moved1.toFixed(1)} m`);

  await unlockThree();
  s = await B.state();
  check('elephant: Stomp, Trunk Whip and Thick Skin unlock, and Thick Skin adds 10 defense',
    s.player.ranks.elephant_stomp === 1 && s.player.ranks.elephant_trunk_whip === 1 && s.player.ranks.elephant_thick_skin === 1 && s.player.defense === 24, `defense ${s.player.defense}`);
  line = await corridor([-2.5], 0);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 2.5);
  await clearDamage();
  await tap('Digit2');
  await B.advance(0.65);
  s = await B.state();
  check('Stomp hurts and staggers a nearby animal', (await hitsOn(line.ids[0])).length === 1 && s.enemies.find((e) => e.id === line.ids[0]).stun > 0);
  await B.advance(0.6); // the Stomp is still playing out: another ability would be refused as busy
  line = await corridor([-2.8], 6);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 2.8);
  await clearDamage();
  await tap('Digit3');
  await B.advance(0.7);
  check('Trunk Whip reaches an animal almost 3 m away', (await hitsOn(line.ids[0])).length >= 1, await duelNote(line.ids[0]));
  await B.teleport(0, 40, Math.PI);
  await B.advance(25);
  // The Elephant is a herbivore and has no reason to hunt: it fights what attacks it. A boar fights back and does not run to the
  // forest's edge, so this check is not held up by trees the way chasing a fleeing deer was (decided with the user on 2026-11-18).
  const elephantBoar = await hunt('boar', 60);
  check('juvenile elephant can fight and kill a boar', elephantBoar.killed, JSON.stringify(elephantBoar));

  // ---------- Crocodile ----------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  begin = await newGame('Crocodile', 'Alligator');
  await begin();
  await trackDamage();
  s = await B.state();
  await settle();
  check('crocodile (alligator skin): a level 1 Juvenile with Death Roll on key 1, named in the HUD',
    s.player.stage === 'juvenile' && s.player.abilities[0] === 'croc_death_roll' && /Juvenile Alligator/.test(await page.locator('.hud-growth .who').innerText()), s.player.abilities.join());
  const crocRivals = s.enemies.map((e) => e.kind).filter((k) => k.startsWith('rival'));
  check('a crocodile meets all four rivals', crocRivals.sort().join() === 'rival_bear,rival_lion,rival_wolf,rival_wolf', crocRivals.join(' '));
  await shot('18f-alligator');

  // Death Roll: the first hit takes hold, and the target cannot get away while the roll lands four hits.
  line = await corridor([-1.5], 0);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 1.5);
  await clearDamage();
  await tap('Digit1');
  await B.advance(0.4);
  s = await B.state();
  const heldBoar = s.enemies.find((e) => e.id === line.ids[0]);
  check('Death Roll takes hold: the target is helpless during the roll', heldBoar.stun > 0.3, `stun ${heldBoar.stun.toFixed(2)} s; ${await duelNote(line.ids[0])}`);
  await B.advance(1.2);
  check('Death Roll lands four hits', (await hitsOn(line.ids[0])).length === 4, `${(await hitsOn(line.ids[0])).length} hits; ${await duelNote(line.ids[0])}`);

  await unlockThree();
  s = await B.state();
  check('crocodile: Lunge, Tail Sweep and Water Ambush unlock', s.player.ranks.croc_lunge === 1 && s.player.ranks.croc_tail_sweep === 1 && s.player.ranks.croc_water_ambush === 1, JSON.stringify(s.player.ranks));
  line = await corridor([-20]);
  await B.teleport(line.ax, line.az + 3);
  await B.lookAt(line.ax, line.az - 10);
  const crocBefore = (await B.state()).player;
  await tap('Digit2');
  await B.advance(0.8);
  s = await B.state();
  check('Lunge bursts forward', Math.hypot(s.player.x - crocBefore.x, s.player.z - crocBefore.z) > 4, `${Math.hypot(s.player.x - crocBefore.x, s.player.z - crocBefore.z).toFixed(1)} m`);
  line = await corridor([2], 0);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 6); // facing away from the boar
  await clearDamage();
  await tap('Digit3');
  await B.advance(0.8);
  check('Tail Sweep hits an animal behind the crocodile', (await hitsOn(line.ids[0])).length >= 1, await duelNote(line.ids[0]));

  // Water Ambush: the same bite hurts about 35% more from the water.
  const firstHit = async (id) => (await hitsOn(id))[0]?.amount;
  line = await corridor([-1.5], 6);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 1.5);
  await clearDamage();
  await tap('Digit1');
  await B.advance(0.4);
  const landBite = await firstHit(line.ids[0]);
  const landNote = await duelNote(line.ids[0]);
  await B.advance(1.5);
  await page.evaluate((id) => {
    const g = window.__beast.app.game;
    const b = g.spawner.enemies.find((e) => e.id === id);
    b.pos.set(48, g.world.heightAt(48, 12), 12);
    b.hp = b.stats.maxHealth;
    b.stun = 6;
    b.vx = b.vz = 0;
    b.knock.set(0, 0, 0);
    g.player.abilities.resetCooldowns();
    g.player.actor.stamina = g.player.actor.stats.stamina;
  }, line.ids[0]);
  await B.teleport(48, 13.5);
  await B.advance(0.3);
  await B.lookAt(48, 12);
  s = await B.state();
  check('a crocodile in the pond is wet and swims', s.player.wet && s.player.swimming, `wet ${s.player.wet}, swimming ${s.player.swimming}`);
  await clearDamage();
  await tap('Digit1');
  await B.advance(0.4);
  const waterBite = await firstHit(line.ids[0]);
  check('Water Ambush: the same bite is about 35% harder in the water', !!landBite && !!waterBite && waterBite / landBite > 1.2 && waterBite / landBite < 1.5, `${landBite} on land, ${waterBite} in water; ${landNote}`);
  // Faster in the water than on land: it swims at 1.8 times its walking pace, above its land sprint of 7.4.
  await B.advance(2.5); // let the Death Roll finish: it roots the crocodile
  await B.teleport(46, 22);
  await B.lookAt(46, 0);
  await page.keyboard.down('KeyW');
  await B.advance(0.5);
  const swimFrom = await B.state();
  await B.advance(1);
  const swimTo = await B.state();
  await page.keyboard.up('KeyW');
  const swimSpeed = Math.hypot(swimTo.player.x - swimFrom.player.x, swimTo.player.z - swimFrom.player.z);
  check('a crocodile swims faster than it can sprint on land', swimTo.player.swimming && swimSpeed > 7.4 && swimSpeed < 9, `${swimSpeed.toFixed(2)} m/s in water (a land sprint is 7.4, a walk 4.4)`);
  await B.teleport(0, 40, Math.PI);
  await B.advance(25);
  const crocDeer = await hunt('deer', 90);
  check('juvenile crocodile can run down and kill a fleeing deer', crocDeer.killed && crocDeer.fled, JSON.stringify(crocDeer));

  // ---------- Eagle ----------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  begin = await newGame('Eagle');
  check('the Eagle is a Bald Eagle', /Bald Eagle/.test(await page.locator('.board').innerText()));
  check('the species screen warns that it has limited vision at night', /At night\s*Limited vision/.test(await page.locator('.board').innerText()));
  await shot('18g0-select-bald-eagle');
  await begin();
  await trackDamage();
  s = await B.state();
  check('eagle: a level 1 Juvenile on the ground with Dive Strike on key 1',
    s.player.stage === 'juvenile' && !s.player.flying && s.player.abilities[0] === 'eagle_dive_strike' && Math.abs(s.player.size - 0.6) < 1e-6, s.player.abilities.join());
  const eagleRivals = s.enemies.map((e) => e.kind).filter((k) => k.startsWith('rival'));
  check('an eagle meets all four rivals', eagleRivals.sort().join() === 'rival_bear,rival_lion,rival_wolf,rival_wolf', eagleRivals.join(' '));
  await shot('18g-eagle-perched');

  // An eagle must come down to eat: it can take a fish by skimming the water, not from high above it.
  const eagleFish = (await B.state()).food.find((f) => f.kind === 'fish' && f.available);
  await B.teleport(eagleFish.x, eagleFish.z);
  await B.call('setHp', (await B.state()).player.maxHp);
  const eagleAt = (height) => page.evaluate((h) => {
    const g = window.__beast.app.game;
    const a = g.player.actor;
    a.flying = true;
    a.grounded = false;
    a.swimming = false;
    a.pos.y = h === 'high' ? g.world.layout.waterY + 15 : g.world.layout.waterY + 1.0;
    a.vy = 0;
  }, height);
  await eagleAt('high');
  await B.advance(0.05);
  s = await B.state();
  check('a fish below an eagle 15 m up is out of reach', s.player.altitude > 10 && !/Eat fish/.test(s.prompt?.text ?? ''), `altitude ${s.player.altitude.toFixed(1)} m, prompt "${s.prompt?.text ?? ''}"`);
  const growthBefore = s.player.growth;
  await page.keyboard.press('KeyE');
  await B.advance(0.05);
  check('pressing E that high eats nothing', (await B.state()).player.growth === growthBefore);
  await eagleAt('low');
  await B.advance(0.05);
  s = await B.state();
  check('an eagle skimming the water is offered the fish', s.player.altitude < 2.5 && /Eat fish/.test(s.prompt?.text ?? ''), `altitude ${s.player.altitude.toFixed(1)} m, prompt "${s.prompt?.text ?? ''}"`);
  await page.keyboard.press('KeyE');
  await B.advance(0.05);
  check('and it takes the fish, which feeds its growth meter', (await B.state()).player.growth > growthBefore, `growth ${growthBefore} -> ${(await B.state()).player.growth}`);
  await page.evaluate(() => { const a = window.__beast.app.game.player.actor; a.flying = false; a.vy = 0; });
  await B.teleport(0, 43, Math.PI);
  await B.advance(0.5);
  await B.call('setHp', (await B.state()).player.maxHp);

  // Limited vision at night: the fog closes in and the level tags reach half as far.
  await B.call('setTimeOfDay', 0.5);
  await B.advance(0.2);
  const noonVision = (await B.state()).vision;
  await settle();
  check('by day the Bald Eagle sees as well as anyone and the HUD says nothing', Math.abs(noonVision.sight - 1) < 1e-9 && noonVision.fogFar > 150 && !/limited vision/.test(await page.locator('.hud-status').textContent()), JSON.stringify(noonVision));
  const boarFar = (await B.state()).enemies.find((e) => e.kind === 'boar' && e.alive);
  await B.teleport(boarFar.x, boarFar.z + 30);
  await hold(boarFar.id, Math.PI); // facing away, so that it does not notice the eagle
  await B.lookAt(boarFar.x, boarFar.z);
  await B.advance(0.1);
  await settle();
  const dayTags = await page.locator('.tag', { hasText: 'Boar' }).count();
  await B.call('setTimeOfDay', 0);
  await B.advance(0.2);
  await settle();
  const midnight = (await B.state()).vision;
  check('at midnight its sight halves and the fog closes in to 60%', Math.abs(midnight.sight - 0.5) < 0.02 && Math.abs(midnight.fogFar / noonVision.fogFar - 0.6) < 0.02, `${JSON.stringify(midnight)} against ${JSON.stringify(noonVision)}`);
  check('the HUD says "Night: limited vision"', /Night: limited vision/.test(await page.locator('.hud-status').textContent()));
  const nightTags = await page.locator('.tag', { hasText: 'Boar' }).count();
  check('a level tag 30 m away is seen by day but not at night', dayTags >= 1 && nightTags < dayTags, `${dayTags} boar tags by day, ${nightTags} at night`);
  await shot('18g1-eagle-night');
  await B.call('setTimeOfDay', 0.5);
  await B.advance(0.2);
  await B.teleport(0, 43, Math.PI);
  await B.advance(0.5);
  await B.call('setHp', (await B.state()).player.maxHp);

  // On foot the eagle walks at about 4.2 m/s and sprints at 6; in the air it is as fast as ever (6.5 and 12 m/s).
  const paceNow = async (sprint) => {
    await page.evaluate(() => { const a = window.__beast.app.game.player.actor; a.stamina = a.stats.stamina; });
    await B.lookAt(0, 20);
    await page.keyboard.down('KeyW');
    if (sprint) await page.keyboard.down('ShiftLeft');
    await B.advance(0.8);
    const speed = (await B.state()).player.speed;
    if (sprint) await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    return speed;
  };
  const footWalk = await paceNow(false);
  const footSpeed = await paceNow(true);
  check('on foot an eagle walks at only about 4.2 m/s', footWalk > 3.9 && footWalk < 4.5, `${footWalk.toFixed(2)} m/s`);
  check('and sprints at only 6 m/s, clearly faster than its walk', footSpeed > 5.7 && footSpeed < 6.3, `${footSpeed.toFixed(2)} m/s`);
  await B.teleport(0, 43, Math.PI);
  await page.evaluate(() => {
    const g = window.__beast.app.game;
    const a = g.player.actor;
    a.flying = true;
    a.grounded = false;
    a.pos.y = g.world.heightAt(a.pos.x, a.pos.z) + 12;
    a.vy = 0;
  });
  await B.advance(0.05);
  const airSpeed = await paceNow(true);
  check('in the air its sprint is as fast as ever, about 12 m/s', (await B.state()).player.flying && airSpeed > 11 && airSpeed < 12.6, `${airSpeed.toFixed(2)} m/s`);
  await page.evaluate(() => { const a = window.__beast.app.game.player.actor; a.flying = false; a.vy = 0; });
  await B.teleport(0, 43, Math.PI);
  await B.advance(0.5);
  await B.call('setHp', (await B.state()).player.maxHp);

  // Hold Space to take off and climb; let go to glide down; landing is automatic.
  await B.teleport(0, 43, Math.PI);
  await B.advance(0.2);
  const stamina0 = (await B.state()).player.stamina;
  await page.keyboard.down('Space');
  await B.advance(1.5);
  await settle();
  s = await B.state();
  check('holding Space takes off and climbs, and costs stamina', s.player.flying && s.player.altitude > 4 && s.player.stamina < stamina0, `altitude ${s.player.altitude.toFixed(1)} m`);
  check('the HUD says the eagle is flying', /Flying/.test(await page.locator('.hud-status').textContent()));
  await shot('18h-eagle-flying');
  await page.evaluate(() => { const g = window.__beast.app.game; g.player.actor.stamina = g.player.actor.stats.stamina; });
  await B.advance(8);
  s = await B.state();
  check('the eagle cannot climb above the 25 m ceiling', s.player.altitude <= 25.01 && s.player.altitude > 18, `altitude ${s.player.altitude.toFixed(1)} m`);
  await page.keyboard.up('Space');
  await B.advance(1.2);
  s = await B.state();
  check('letting go of Space glides down gently', s.player.flying && s.player.vy < -1 && s.player.vy > -2.7, `vy ${s.player.vy.toFixed(2)} m/s`);
  let glided = 0;
  while ((await B.state()).player.flying && glided < 20) {
    await B.advance(0.5);
    glided += 0.5;
  }
  s = await B.state();
  check('touching the ground lands the eagle automatically', !s.player.flying && s.player.grounded, `landed after ${glided + 1.2} s of gliding`);
  await page.evaluate(() => { window.__beast.app.game.player.actor.stamina = 0; });
  await page.keyboard.down('Space');
  await B.advance(0.2);
  s = await B.state();
  check('with no stamina left the eagle cannot take off', !s.player.flying, `stamina ${s.player.stamina.toFixed(1)}`);
  await page.keyboard.up('Space');

  // A flier passes over tree trunks.
  const tree = await page.evaluate(() => {
    const w = window.__beast.app.world;
    for (let x = -60; x <= 60; x += 1) {
      for (let z = -30; z <= 30; z += 1) {
        if (w.colliders.blocked(x, z, 0.1, 0) && !w.colliders.blocked(x, z, 0.1, 10) && !w.colliders.blocked(x - 5, z, 2, 0)) return { x, z };
      }
    }
    return null;
  });
  check('the Forest has trunks that stop at a height (the eagle can fly over them)', !!tree);
  if (tree) {
    await B.teleport(tree.x - 5, tree.z, Math.PI / 2);
    await B.lookAt(tree.x + 12, tree.z);
    await page.evaluate(() => {
      const g = window.__beast.app.game;
      const a = g.player.actor;
      a.flying = true;
      a.grounded = false;
      a.pos.y = g.world.heightAt(a.pos.x, a.pos.z) + 14;
      a.vy = 0;
    });
    await page.keyboard.down('Space');
    await page.keyboard.down('KeyW');
    await B.advance(1.6);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    s = await B.state();
    check('an eagle in the air flies straight through the trunk of a tree', s.player.x > tree.x + 1.5 && s.player.flying, `x ${s.player.x.toFixed(1)} past the tree at ${tree.x}`);
    // Back to the den: a juvenile eagle left alone in the forest would not last long.
    await page.evaluate(() => { const a = window.__beast.app.game.player.actor; a.flying = false; a.vy = 0; });
    await B.teleport(0, 43, Math.PI);
    await B.advance(0.5);
    await B.call('setHp', (await B.state()).player.maxHp);
  }

  // A fair fight: a boar cannot hit an eagle high above it, and gives up on one that is higher still.
  line = await corridor([0], 0);
  await B.teleport(line.ax, line.az + 3, Math.PI);
  await B.lookAt(line.ax, line.az);
  const holdAloft = async (altitude, seconds) => {
    for (let i = 0; i < seconds * 10; i++) {
      await page.evaluate((alt) => {
        const g = window.__beast.app.game;
        const a = g.player.actor;
        a.flying = true;
        a.grounded = false;
        a.pos.y = g.world.heightAt(a.pos.x, a.pos.z) + alt;
        a.vy = 0;
      }, altitude);
      await B.advance(0.1);
    }
  };
  const hpBefore = (await B.state()).player.hp;
  await holdAloft(4, 4);
  s = await B.state();
  const boarBelow = s.enemies.find((e) => e.id === line.ids[0]);
  check('a boar chasing an eagle 4 m above it cannot hit it', s.player.hp === hpBefore && ['chase', 'windup', 'charging', 'recover'].includes(boarBelow.state), `hp ${s.player.hp}/${hpBefore}, boar ${boarBelow.state}`);
  await holdAloft(8, 3);
  s = await B.state();
  check('and gives up once the eagle is higher than 6 m', ['return', 'idle', 'wander'].includes(s.enemies.find((e) => e.id === line.ids[0]).state), s.enemies.find((e) => e.id === line.ids[0]).state);
  await B.advance(0.5);

  // Dive Strike: from the air it hits much harder than the same move from the ground.
  line = await corridor([-10], 6);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 10);
  await clearDamage();
  await tap('Digit1');
  await B.advance(1.2);
  const poundHit = await firstHit(line.ids[0]);
  line = await corridor([-10], 6);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 10);
  await page.evaluate(() => {
    const g = window.__beast.app.game;
    const a = g.player.actor;
    a.flying = true;
    a.grounded = false;
    a.pos.y = g.world.heightAt(a.pos.x, a.pos.z) + 15;
    a.vy = 0;
  });
  await B.advance(0.1); // one step, so that the game knows the eagle's new altitude
  await clearDamage();
  await tap('Digit1');
  await B.advance(1.6);
  s = await B.state();
  const diveHit = await firstHit(line.ids[0]);
  check('Dive Strike from 15 m hits about 60% harder than from the ground, and the eagle pulls up',
    !!poundHit && !!diveHit && diveHit / poundHit > 1.35 && diveHit / poundHit < 1.85, `${poundHit} from the ground, ${diveHit} from 15 m; flying ${s.player.flying}`);

  await unlockThree();
  s = await B.state();
  check('eagle: Talon Grab, Gust and Eagle Eye unlock', s.player.ranks.eagle_talon_grab === 1 && s.player.ranks.eagle_gust === 1 && s.player.ranks.eagle_eye === 1, JSON.stringify(s.player.ranks));
  await page.evaluate(() => { const a = window.__beast.app.game.player.actor; a.flying = false; a.pos.y = window.__beast.app.world.heightAt(a.pos.x, a.pos.z); a.vy = 0; });
  line = await corridor([-1.4], 0);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 1.4);
  await clearDamage();
  await tap('Digit2');
  await B.advance(0.4);
  s = await B.state();
  check('Talon Grab holds the target helpless', (await hitsOn(line.ids[0])).length === 1 && s.enemies.find((e) => e.id === line.ids[0]).stun > 0.5, `stun ${s.enemies.find((e) => e.id === line.ids[0]).stun.toFixed(2)} s`);
  await B.advance(0.6);
  line = await corridor([-3], 6);
  await B.teleport(line.ax, line.az);
  await B.lookAt(line.ax, line.az - 3);
  await tap('Digit3');
  await B.advance(0.8);
  s = await B.state();
  check('Gust blows an animal away', s.enemies.find((e) => e.id === line.ids[0]).z < line.az - 3 - 0.8, `${(line.az - 3 - s.enemies.find((e) => e.id === line.ids[0]).z).toFixed(2)} m further`);
  await B.teleport(0, 40, Math.PI);
  await B.advance(25);
  // On foot (walk 4.2, sprint 6) an eagle can no longer reliably catch a deer: it hunts by flying low over it.
  const eagleDeer = await hunt('deer', 60, { flying: true });
  check('juvenile eagle can fly low over a fleeing deer and kill it', eagleDeer.killed && eagleDeer.fled, JSON.stringify(eagleDeer));
  await page.evaluate(() => { const a = window.__beast.app.game.player.actor; a.flying = false; a.vy = 0; });

  // ---------- Large time steps must not break the world ----------
  await B.teleport(96, 0, Math.PI / 2);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.evaluate(() => window.__beast.advance(4, 0.05));
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  s = await B.state();
  const edge = Math.hypot(s.player.x, s.player.z);
  const groundY = await page.evaluate(([x, z]) => window.__beast.app.world.heightAt(x, z), [s.player.x, s.player.z]);
  check('sprinting at the world edge with 20 fps steps stays inside and on the ground', edge <= 105.01 && Math.abs(s.player.y - groundY) < 0.05, `r=${edge.toFixed(2)} y-ground=${(s.player.y - groundY).toFixed(3)}`);

  // ---------- Bad saves and a real-time soak ----------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  await page.locator('.title').waitFor();
  // A damaged save reads as an empty slot, and never hides the animals in the other slots.
  await page.evaluate(() => localStorage.setItem('beastAscent.save.slot1', '{"version":1,"speciesId":"dragon"'));
  await page.reload();
  await page.locator('.title').waitFor();
  await page.getByRole('button', { name: /Continue Game/ }).click();
  check('a damaged slot looks empty and cannot be picked, while the Lion in slot 2 is still there',
    (await page.locator('.save-slot[data-slot="1"]').isDisabled()) && /Lion/.test(await page.locator('.save-slot[data-slot="2"]').innerText()) && (await page.locator('.save-slot[data-slot="2"]').isEnabled()));
  await page.getByRole('button', { name: 'Back' }).click();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('beastAscent.save.slot1', '{"version":1,"speciesId":"dragon"'));
  await page.reload();
  await page.locator('.title').waitFor();
  check('with only a damaged save, Continue Game stays disabled and nothing crashes', await page.getByRole('button', { name: /Continue Game/ }).isDisabled());

  // The single save of earlier versions moves into slot 1 on start, and the old key goes.
  await page.evaluate(() => {
    localStorage.clear();
    const progress = { level: 7, xp: 0, abilityPoints: 6, stage: 'adult', growth: 0, abilityRanks: {}, wounded: false };
    localStorage.setItem('beastAscent.save.v1', JSON.stringify({ version: 1, speciesId: 'lion', variantId: 'default', progress, unlockedBiomes: ['forest'], ruledBiomes: ['forest'] }));
  });
  await page.reload();
  await page.locator('.title').waitFor();
  check('an animal saved by an earlier version moves into slot 1 and the old key is removed',
    (await page.evaluate(() => localStorage.getItem('beastAscent.save.v1'))) === null && (await page.getByRole('button', { name: /Continue Game/ }).isEnabled()));
  await page.getByRole('button', { name: /Continue Game/ }).click();
  const migrated = await page.locator('.save-slot[data-slot="1"]').innerText();
  check('the moved animal shows up in slot 1 as it was', /Adult Savanna Lion, level 7/.test(migrated) && /Forest ruled/.test(migrated), migrated.replace(/\n/g, ' '));
  await shot('14e-slots-migrated');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.title').waitFor();

  // ---------- Admin sandbox (only with ?admin in the address) ----------
  check('without ?admin the title has no admin sandbox', (await page.getByRole('button', { name: /Admin sandbox/ }).count()) === 0);
  const slotsBefore = await page.evaluate(() => [1, 2, 3, 4].map((n) => localStorage.getItem(`beastAscent.save.slot${n}`)));
  await page.goto(`${url}?admin`);
  await page.locator('.title').waitFor();
  check('with ?admin the title offers the admin sandbox', (await page.getByRole('button', { name: /Admin sandbox/ }).count()) === 1);
  await shot('14f-admin-title');
  await page.getByRole('button', { name: /Admin sandbox/ }).click();
  await page.locator('.signpost .plank', { hasText: 'Tiger' }).click();
  check('the sandbox species screen goes back to the title, not to the slots', (await page.getByRole('button', { name: /Back to title/ }).count()) === 1);
  await page.getByRole('button', { name: /Begin as/ }).click();
  await page.locator('.hud').waitFor();
  await B.call('setAutoStep', false);
  await B.call('setRender', false);
  await B.advance(0.2);
  s = await B.state();
  check('the sandbox starts a level 1 Tiger that belongs to no save slot', s.screen === 'playing' && s.slot === null && s.species === 'tiger' && s.player.level === 1, `${s.species} level ${s.player.level} slot ${s.slot}`);
  check('a badge says that nothing is saved', /nothing is saved/.test(await page.locator('.admin-badge').innerText()));
  await B.call('setTimeOfDay', 0);
  await B.advance(0.2);
  check('a Tiger sees as well at midnight as by day', (await B.state()).vision.sight === 1 && !/limited vision/.test(await page.locator('.hud-status').textContent()));
  await B.call('setTimeOfDay', 0.5);
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor();
  check('J opens the admin panel and the game waits', (await B.state()).screen === 'admin');

  // A full growth meter does not mean the animal can evolve: the HUD says which level is still missing.
  await page.locator('.admin-row', { hasText: 'Growth meter' }).getByRole('button', { name: 'Full' }).click();
  await settle();
  const fullLabel = (await page.locator('.hud-growth').innerText()).replace(/\n/g, ' ');
  check('a full growth meter says which level is still needed and how much XP is left', /Fully fed, level 8 needed \(0\/525 XP\)/.test(fullLabel), fullLabel);
  await shot('14f0-admin-meter-full');
  await page.locator('.admin-row', { hasText: 'Growth meter' }).getByRole('button', { name: 'Empty' }).click();

  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  s = await B.state();
  check('admin: Alpha makes a level 18 Alpha at once, 1.4 times the size, with 17 points to spend',
    s.player.stage === 'alpha' && s.player.level === 18 && s.player.abilityPoints === 17 && Math.abs(s.player.size - 1.4) < 1e-6 && s.player.maxHp > 100 * 3,
    `${s.player.stage} level ${s.player.level}, points ${s.player.abilityPoints}, size ${s.player.size}`);
  await page.locator('.admin-row', { hasText: 'Level' }).getByRole('button', { name: '+5' }).click();
  s = await B.state();
  check('admin: +5 raises the level and earns the points', s.player.level === 23 && s.player.abilityPoints === 22, `level ${s.player.level}, points ${s.player.abilityPoints}`);
  await shot('14g-admin-panel');
  await page.locator('.admin-ability[data-ability="tiger_rend"]').getByRole('button', { name: '3', exact: true }).click();
  s = await B.state();
  check('admin: an ability can be set to rank 3 without spending points', s.player.ranks.tiger_rend === 3 && s.player.abilityPoints === 22, JSON.stringify(s.player.ranks));
  check('admin: the signature ability cannot be locked', await page.locator('.admin-ability[data-ability="tiger_ambush_strike"]').getByRole('button', { name: '0', exact: true }).isDisabled());

  await page.getByRole('button', { name: 'Adult', exact: true }).click();
  await page.locator('.admin-row', { hasText: 'Growth meter' }).getByRole('button', { name: 'Full' }).click();
  s = await B.state();
  check('admin: Adult keeps the higher level, and Full fills the growth meter', s.player.stage === 'adult' && s.player.level === 23 && s.player.growth === 250 && Math.abs(s.player.size - 1) < 1e-6, `${s.player.stage} level ${s.player.level}, growth ${s.player.growth}`);
  await page.getByRole('button', { name: 'Wounded', exact: true }).click();
  check('admin: the wounded mark can be set', await page.evaluate(() => window.__beast.app.game.growth.progress.wounded));
  await page.getByRole('button', { name: /Forest ruled/ }).click();
  s = await B.state();
  check('admin: ruling the Forest opens the gate and unlocks the Jungle', s.ruled.includes('forest') && s.gateOpen && s.unlocked.includes('jungle'));
  await page.getByRole('button', { name: /Forest ruled/ }).click();
  s = await B.state();
  check('admin: the rule can be taken away again', s.ruled.length === 0 && !s.gateOpen && !s.unlocked.includes('jungle'));

  await page.getByRole('button', { name: 'Bush Elephant' }).click();
  await page.locator('.admin-card').waitFor();
  s = await B.state();
  check('admin: switching animal starts it as an Elephant and keeps stage, level, growth and wound; abilities start again',
    s.species === 'elephant' && s.slot === null && s.player.stage === 'adult' && s.player.level === 23 && s.player.growth === 250
    && await page.evaluate(() => window.__beast.app.game.growth.progress.wounded) && Object.keys(s.player.ranks).join() === 'elephant_charge',
    `${s.species} ${s.player.stage} level ${s.player.level} growth ${s.player.growth} ranks ${Object.keys(s.player.ranks)}`);
  // The restart used to request the mouse after the panel had opened, which made the panel unclickable.
  check('the panel stays open after switching animal, and the mouse is free to click it', s.screen === 'admin' && (await page.evaluate(() => document.pointerLockElement === null)));
  await page.getByRole('button', { name: 'Max all' }).click();
  s = await B.state();
  check('admin: Max all sets every ability to rank 3', Object.keys(s.player.ranks).length === 4 && Object.values(s.player.ranks).every((r) => r === 3), JSON.stringify(s.player.ranks));

  await page.keyboard.press('Escape');
  await page.locator('.admin-card').waitFor({ state: 'detached' });
  check('Esc closes the panel and the game goes on', (await B.state()).screen === 'playing');
  // Wild animals now and then walk to a pond and drink there (the player rests at the den, where nobody comes).
  const ponds = await page.evaluate(() => window.__beast.app.world.layout.waters);
  let drinkingSeen = 0;
  const wrongPlace = [];
  for (let i = 0; i < 120; i++) {
    await B.advance(2.5);
    for (const e of (await B.state()).enemies) {
      if (!e.drinking) continue;
      drinkingSeen++;
      const onShore = ponds.some((w) => { const d = Math.hypot(e.x - w.x, e.z - w.z); return d >= w.radius && d <= w.radius + 3.5; });
      if (!onShore) wrongPlace.push(`${e.kind} at ${e.x.toFixed(0)}, ${e.z.toFixed(0)}`);
    }
  }
  check('wild animals walk to a pond and drink at its edge, never in the water', drinkingSeen > 0 && wrongPlace.length === 0, `${drinkingSeen} drinking samples in 300 s; wrong place: ${wrongPlace.slice(0, 3).join('; ')}`);
  await B.advance(1);
  await shot('14h-admin-elephant');

  // ---------- The Jungle (Milestone 3), reviewed from the admin sandbox ----------
  {
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor();
  check('admin: the panel lists the biomes that are built, with the Forest as the current one',
    (await page.getByRole('button', { name: 'Forest', exact: true }).getAttribute('aria-pressed')) === 'true'
    && (await page.getByRole('button', { name: 'Jungle', exact: true }).getAttribute('aria-pressed')) === 'false'
    && (await page.getByRole('button', { name: 'Plains', exact: true }).getAttribute('aria-pressed')) === 'false'
    && (await page.getByRole('button', { name: 'Winter', exact: true }).count()) === 0);
  await page.getByRole('button', { name: 'Jungle', exact: true }).click();
  await page.locator('.admin-card').waitFor();
  await B.advance(0.2);
  s = await B.state();
  check('admin: the Jungle button puts the same animal at the Jungle\'s den, with the panel still open and nothing saved',
    s.biome === 'jungle' && s.screen === 'admin' && s.slot === null && s.species === 'elephant' && s.player.level === 23 && s.unlocked.includes('jungle')
    && (await page.getByRole('button', { name: 'Jungle', exact: true }).getAttribute('aria-pressed')) === 'true',
    `${s.biome}, ${s.screen}, ${s.species} level ${s.player.level}`);
  await shot('20-jungle-admin-panel');
  await page.keyboard.press('Escape');
  await page.locator('.admin-card').waitFor({ state: 'detached' });
  await B.advance(0.2);
  s = await B.state();
  check('jungle: the Elephant is at home here (+20% max health)', s.player.mods.join() === 'maxHealth:0.2', s.player.mods.join());
  check('jungle: every wild animal is level 8 or higher (the Forest stops at 7)', s.enemies.filter((e) => !e.boss).every((e) => e.level >= 8) && s.enemies.length >= 20, `${s.enemies.length} animals`);
  await shot('20b-jungle-den');

  // What the tests need to know about the map.
  const J = await page.evaluate(() => {
    const w = window.__beast.app.world;
    const river = w.rivers.find((r) => r.id === 'river');
    const stream = w.rivers.find((r) => r.id === 'stream');
    const dry = (pts) => pts.map((p, i) => ({ ...p, i, bed: w.heightAt(p.x, p.z), pond: w.layout.waters.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < q.radius + 4) })).filter((p) => !p.pond);
    const open = dry(river.points);
    const dir = (r, i) => { const a = r.points[i - 1], b = r.points[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z); return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; };
    // A deep, straight reach of the river well away from the crocodiles: between the ford and the lagoon.
    const deep = open.filter((p) => p.bed < -1.5 && p.z > 30 && p.z < 46).sort((a, b) => a.i - b.i)[2];
    const ford = open.slice().sort((a, b) => b.bed - a.bed)[0];
    const onStream = stream.points[Math.floor(stream.points.length * 0.55)];
    return {
      layout: w.layout, fall: w.waterfall, current: river.current, streamY: stream.surfaceY,
      deep: { x: deep.x, z: deep.z, dir: dir(river, deep.i) }, ford: { x: ford.x, z: ford.z, bed: ford.bed }, onStream: { x: onStream.x, z: onStream.z },
    };
  });
  // Nobody picks a fight while the map itself is being tested.
  const calmAll = () => page.evaluate(() => { for (const e of window.__beast.app.game.spawner.enemies) { e.calm = true; e.provoked = false; if (e.state === 'chase') e.state = 'return'; } });
  await calmAll();

  // The current.
  await B.teleport(J.deep.x, J.deep.z, Math.atan2(J.deep.dir.x, J.deep.dir.z));
  await B.advance(0.4);
  s = await B.state();
  const flow0 = Math.hypot(s.player.current.x, s.player.current.z);
  check('jungle: an animal in the middle of the river swims, and the water there flows at the river\'s full speed', s.player.swimming && s.player.wet && Math.abs(flow0 - J.current) < 0.25, `swimming ${s.player.swimming}, current ${flow0.toFixed(2)} m/s`);
  const along = (p, from) => (p.x - from.x) * J.deep.dir.x + (p.z - from.z) * J.deep.dir.z;
  let from = { x: s.player.x, z: s.player.z };
  await B.advance(3);
  s = await B.state();
  const drift = along(s.player, from);
  check('jungle: left alone, the current carries the animal downstream, gently', drift > 2 && drift < J.current * 3 + 0.5, `${drift.toFixed(2)} m in 3 s`);

  const swim = async (yaw) => {
    await B.teleport(J.deep.x, J.deep.z, yaw);
    await B.advance(0.3);
    const a = (await B.state()).player;
    await page.keyboard.down('KeyW');
    await B.advance(2);
    await page.keyboard.up('KeyW');
    const b = (await B.state()).player;
    return along(b, a);
  };
  const down = await swim(Math.atan2(J.deep.dir.x, J.deep.dir.z));
  const up = await swim(Math.atan2(-J.deep.dir.x, -J.deep.dir.z));
  check('jungle: swimming against the current is slower than swimming with it, but an animal still makes headway', up < -1 && down > -up + 2.5, `${down.toFixed(1)} m downstream against ${(-up).toFixed(1)} m upstream in 2 s`);
  await shot('21-jungle-river');

  await B.teleport(J.ford.x, J.ford.z);
  await B.advance(0.4);
  s = await B.state();
  check('jungle: at the ford the river is shallow enough for a big animal to wade', s.player.wet && !s.player.swimming && s.player.waterDepth > 0.1 && s.player.waterDepth < 0.8, `depth ${s.player.waterDepth.toFixed(2)} m, swimming ${s.player.swimming}`);

  // The cliff.
  const hill = J.layout.hill;
  const polar = (deg, dist) => ({ x: hill.x + Math.cos((deg * Math.PI) / 180) * dist, z: hill.z + Math.sin((deg * Math.PI) / 180) * dist });
  const foot = polar(hill.cliff.towardDeg + 27, hill.plateauRadius + hill.cliff.width + 2);
  await B.teleport(foot.x, foot.z);
  await B.lookAt(hill.x, hill.z);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await B.advance(4);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  s = await B.state();
  check('jungle: the cliff cannot be climbed: sprinting at it for 4 s gets nowhere',
    s.player.y < hill.top - 8 && Math.hypot(s.player.x - hill.x, s.player.z - hill.z) > hill.plateauRadius + 1,
    `height ${s.player.y.toFixed(1)} m of ${hill.top}, ${Math.hypot(s.player.x - hill.x, s.player.z - hill.z).toFixed(1)} m from the middle`);
  await shot('22-jungle-cliff');

  // The back of the hill can be walked: pick a lane with no tree or rock in it.
  const lane = await page.evaluate(([h, toward]) => {
    const w = window.__beast.app.world;
    for (let off = 180; off <= 320; off += 10) {
      for (const sign of [1, -1]) {
        const a = ((toward + 180 + (off - 180) * sign) * Math.PI) / 180;
        let clear = true;
        for (let d = h.plateauRadius - 2; d <= h.plateauRadius + 22 && clear; d += 0.5) clear = !w.colliders.blocked(h.x + Math.cos(a) * d, h.z + Math.sin(a) * d, 2.4) && w.waterDepth(h.x + Math.cos(a) * d, h.z + Math.sin(a) * d) === 0;
        if (clear) return { x: h.x + Math.cos(a) * (h.plateauRadius + 20), z: h.z + Math.sin(a) * (h.plateauRadius + 20) };
      }
    }
    return null;
  }, [hill, hill.cliff.towardDeg]);
  if (lane) {
    await B.teleport(lane.x, lane.z);
    const startY = (await B.state()).player.y;
    await B.lookAt(hill.x, hill.z);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await B.advance(6);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    s = await B.state();
    check('jungle: the other sides of the hill are walked up to its flat top', s.player.y > hill.top - 1.5 && startY < hill.top - 4, `from ${startY.toFixed(1)} m up to ${s.player.y.toFixed(1)} m`);
  } else {
    check('jungle: a clear lane up the back of the hill exists for the test', false);
  }

  // Over the waterfall.
  await B.teleport(J.onStream.x, J.onStream.z);
  await B.advance(0.4);
  s = await B.state();
  const hpBefore = s.player.hp;
  check('jungle: the stream on the hill is shallow: an animal wades it, up at the height of the top', s.player.wet && !s.player.swimming && s.player.y > hill.top - 2, `depth ${s.player.waterDepth.toFixed(2)} m at ${s.player.y.toFixed(1)} m`);
  let rode = 0;
  let highest = 0;
  while (rode < 60 && (await B.state()).player.y > 2) {
    await B.advance(0.5);
    rode += 0.5;
    highest = Math.max(highest, (await B.state()).player.y);
  }
  await B.advance(1.5);
  s = await B.state();
  const fromFoot = Math.hypot(s.player.x - J.fall.bottomX, s.player.z - J.fall.bottomZ);
  check('jungle: the stream carries an animal that stands in it over the waterfall, down into the plunge pool, unhurt',
    rode < 60 && s.player.y < 1 && s.player.wet && fromFoot < 9 && s.player.alive && s.player.hp >= hpBefore - 0.5,
    `${rode} s to go over, now ${s.player.y.toFixed(1)} m high, ${fromFoot.toFixed(1)} m from the foot of the fall, hp ${Math.round(s.player.hp)}/${Math.round(hpBefore)}`);
  await shot('23-jungle-plunge-pool');

  // Palms bear coconuts.
  const palm = await pickTree('nut');
  if (palm) {
    // Leafy plants grow in random places: one beside the palm would be the nearest food and be offered instead of the
    // coconuts (seen once, 2026-11-18), so clear any plant near the palm first, as for the Forest's berry bush.
    await page.evaluate(([px, pz]) => {
      const food = window.__beast.app.game.food;
      for (const item of [...food.items]) if (item.kind === 'plant' && Math.hypot(item.pos.x - px, item.pos.z - pz) < 8) food.consume(item);
    }, [palm.x, palm.z]);
    await B.teleport(palm.x + 2.6, palm.z);
    await B.advance(0.2);
    s = await B.state();
    check('jungle: an Elephant at a palm is offered its coconuts', s.prompt?.key === 'E' && /Eat coconuts/.test(s.prompt.text), s.prompt?.text);
    await tap('KeyE');
    await B.advance(0.2);
    check('jungle: eating them says so', /Coconuts/.test(await page.locator('.hud-toasts').innerText()));
  } else {
    check('jungle: a palm with coconuts and clear ground beside it exists for the test', false);
  }

  // Animals drink at the river's banks as well as at the ponds, and the wild crocodiles are at home in the water.
  await B.teleport(J.layout.playerSpawn.x, J.layout.playerSpawn.z);
  let jungleDrinks = 0;
  let riverDrinks = 0;
  let crocsInWater = 0;
  const badDrinks = [];
  for (let i = 0; i < 100; i++) {
    await B.advance(2.5);
    const seen = await page.evaluate(() => {
      const g = window.__beast.app.game;
      const w = g.world;
      return g.spawner.enemies.filter((e) => e.alive).map((e) => ({
        kind: e.def.id, drinking: e.drinking, x: e.pos.x, z: e.pos.z, depth: w.waterDepth(e.pos.x, e.pos.z), near: w.nearWater(e.pos.x, e.pos.z),
        pond: w.layout.waters.some((q) => Math.hypot(e.pos.x - q.x, e.pos.z - q.z) < q.radius + 4),
      }));
    });
    for (const e of seen) {
      if (e.kind === 'rival_crocodile' && e.depth > 0.2) crocsInWater++;
      if (!e.drinking) continue;
      jungleDrinks++;
      if (!e.pond) riverDrinks++;
      if (e.depth > 0.25 || !e.near) badDrinks.push(`${e.kind} at ${e.x.toFixed(0)}, ${e.z.toFixed(0)} (depth ${e.depth.toFixed(2)})`);
    }
  }
  check('jungle: wild animals drink at the water\'s edge, at river banks as well as ponds, never in the water',
    jungleDrinks > 0 && riverDrinks > 0 && badDrinks.length === 0, `${jungleDrinks} drinking samples in 250 s, ${riverDrinks} of them at a river; wrong place: ${badDrinks.slice(0, 3).join('; ')}`);
  check('jungle: the wild crocodiles spend time in the water', crocsInWater > 0, `${crocsInWater} samples`);

  // Each animal's Jungle buff or nerf (bible section 4.4).
  const modsAs = async (variantName, x, z) => {
    await page.keyboard.press('KeyJ');
    await page.locator('.admin-card').waitFor();
    await page.getByRole('button', { name: variantName, exact: true }).click();
    await page.locator('.admin-card').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.admin-card').waitFor({ state: 'detached' });
    await calmAll();
    if (x !== undefined) await B.teleport(x, z);
    await B.advance(0.3);
    const st = await B.state();
    return { biome: st.biome, mods: st.player.mods.join() };
  };
  const dryLand = { x: J.layout.playerSpawn.x, z: J.layout.playerSpawn.z };
  let m = await modsAs('Bald Eagle');
  check('jungle: switching animal in the sandbox stays in the Jungle', m.biome === 'jungle');
  check('jungle: the Eagle is slowed by the dense canopy (-20% speed)', m.mods === 'speed:-0.2', m.mods);
  m = await modsAs('Brown Bear');
  check('jungle: the Bear has less stamina here (-20%)', m.mods === 'stamina:-0.2', m.mods);
  m = await modsAs('Savanna Lion');
  check('jungle: the Lion has no modifier here', m.mods === '', m.mods);
  m = await modsAs('Crocodile', dryLand.x, dryLand.z);
  check('jungle: the Crocodile has no buff away from the water...', m.mods === '', m.mods);
  await B.teleport(J.ford.x, J.ford.z);
  await B.advance(0.3);
  s = await B.state();
  check('jungle: ...and +25% damage in and near it, rivers included', s.player.mods.join() === 'damage:0.25', s.player.mods.join());
  check('jungle: a Crocodile player meets the wild crocodiles too, and the tigers', s.enemies.filter((e) => e.kind === 'rival_crocodile').length === 2 && s.enemies.filter((e) => e.kind === 'rival_tiger').length === 2);
  m = await modsAs('Bengal Tiger');
  check('jungle: the Tiger is at home here (+20% damage)', m.mods === 'damage:0.2', m.mods);
  s = await B.state();
  check('jungle: a Tiger player meets the wild tigers too, and the crocodiles', s.enemies.filter((e) => e.kind === 'rival_tiger').length === 2 && s.enemies.filter((e) => e.kind === 'rival_crocodile').length === 2);

  // A hunt and two fights, as an Alpha Tiger.
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor();
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.getByRole('button', { name: 'Max all' }).click();
  await page.keyboard.press('Escape');
  await page.locator('.admin-card').waitFor({ state: 'detached' });
  await B.advance(0.2);
  const capy = await hunt('capybara', 60);
  check('jungle: a capybara flees and can be run down', capy.killed && capy.fled, `${capy.seconds}s, level ${capy.level}`);
  const tapirFight = await fight('tapir', { maxSeconds: 60, keepAlive: true });
  check('jungle: a tapir fights back and can be beaten', tapirFight.killed && tapirFight.hurt, `${tapirFight.seconds}s`);
  const crocFight = await fight('rival_crocodile', { maxSeconds: 90, keepAlive: true });
  check('jungle: a wild crocodile fights back and can be beaten', crocFight.killed && crocFight.hurt, `${crocFight.seconds}s`);

  // A snake, out in the Jungle.
  const snakeFight = await fight('snake', { maxSeconds: 60, keepAlive: true });
  check('jungle: a snake rears back, strikes and can be beaten', snakeFight.killed && (snakeFight.states.has('windup') || snakeFight.states.has('charging')), `${snakeFight.seconds}s, states ${[...snakeFight.states].join(', ')}`);

  // ---------- Lake-bound animals (the Plains' alligators) ----------
  // The rule is switched on for the Jungle's lagoon crocodile at run time (`waterBound`: water plus an 8 m strip of shore), because
  // the Plains do not exist yet when it is built. A player just outside the zone is ignored, one inside it is attacked, and the
  // animal gives up and goes back to the water when the player leaves.
  {
    const site = await page.evaluate(() => {
      const w = window.__beast.app.game.world;
      const lagoon = w.layout.waters.find((q) => q.lilyPads);
      for (let deg = 0; deg < 360; deg += 15) {
        const dx = Math.cos((deg * Math.PI) / 180);
        const dz = Math.sin((deg * Math.PI) / 180);
        const at = (d) => ({ x: lagoon.x + dx * (lagoon.radius + d), z: lagoon.z + dz * (lagoon.radius + d) });
        const spots = { edge: at(6.5), inside: at(4), outside: at(12) };
        if (Math.hypot(spots.outside.x, spots.outside.z) > w.boundary - 6) continue;
        let clear = true;
        for (let d = 0; d <= 14; d += 1) {
          const p = at(d);
          if (w.colliders.blocked(p.x, p.z, 2.5) || w.waterDepth(p.x, p.z) > 0) clear = false;
        }
        if (!clear || w.nearWater(spots.outside.x, spots.outside.z) || !w.nearWater(spots.inside.x, spots.inside.z)) continue;
        return { lagoon: { x: lagoon.x, z: lagoon.z, radius: lagoon.radius }, ...spots };
      }
      return null;
    });
    check('lake-bound: a clear patch of shore beside the lagoon was found for the test', site !== null);
    if (site) {
      await page.evaluate(async () => {
        const { ENEMIES } = await import('/src/data/enemies.ts');
        ENEMIES.rival_crocodile.behavior.waterBound = 8;
      });
      await calmAll();
      const croc = await page.evaluate(() => {
        const e = window.__beast.app.game.spawner.enemies.find((q) => q.alive && q.def.id === 'rival_crocodile');
        return e ? e.id : null;
      });
      const placeCroc = (x, z, facingX, facingZ) => page.evaluate(([id, px, pz, fx, fz, home]) => {
        const g = window.__beast.app.game;
        const e = g.spawner.enemies.find((q) => q.id === id);
        e.pos.set(px, g.world.heightAt(px, pz), pz);
        e.vx = e.vz = 0;
        e.state = 'idle';
        e.timer = 1;
        e.calm = false;
        e.provoked = false;
        e.hp = e.stats.maxHealth;
        e.homeX = home.x;
        e.homeZ = home.z;
        e.yaw = Math.atan2(fx - px, fz - pz);
      }, [croc, x, z, facingX, facingZ, site.lagoon]);
      const crocNow = () => page.evaluate((id) => {
        const g = window.__beast.app.game;
        const e = g.spawner.enemies.find((q) => q.id === id);
        return { state: e.state, x: e.pos.x, z: e.pos.z, near: g.world.nearWater(e.pos.x, e.pos.z), depth: g.world.waterDepth(e.pos.x, e.pos.z) };
      }, croc);
      const fighting = ['chase', 'windup', 'charging', 'recover'];
      const fullHp = (await B.state()).player.maxHp;

      // Just outside the zone (4 m past its edge, 5.5 m from the animal): ignored.
      await B.call('setHp', fullHp);
      await placeCroc(site.edge.x, site.edge.z, site.outside.x, site.outside.z);
      await B.teleport(site.outside.x, site.outside.z);
      await B.advance(5);
      let c = await crocNow();
      s = await B.state();
      check('lake-bound: a player just outside the zone is ignored: no chase, no bite, and the animal stays in its zone',
        !fighting.includes(c.state) && s.player.hp === fullHp && c.near, `state ${c.state}, player hp ${s.player.hp}/${fullHp}, in its zone ${c.near}`);

      // Inside the zone (on the shore): attacked, and the animal still does not leave the zone.
      await placeCroc(site.edge.x, site.edge.z, site.inside.x, site.inside.z);
      await B.teleport(site.inside.x, site.inside.z);
      await B.advance(3);
      c = await crocNow();
      check('lake-bound: a player inside the zone is attacked, and the attacker stays in the zone', fighting.includes(c.state) && c.near, `state ${c.state}, in its zone ${c.near}`);

      // The player leaves: it gives up and goes back to the water.
      await B.teleport(site.outside.x, site.outside.z);
      await B.advance(25);
      c = await crocNow();
      check('lake-bound: when the player leaves the zone it gives up and goes back to the water', !fighting.includes(c.state) && c.depth > 0.2, `state ${c.state}, depth ${c.depth.toFixed(2)}`);

      await page.evaluate(async () => {
        const { ENEMIES } = await import('/src/data/enemies.ts');
        delete ENEMIES.rival_crocodile.behavior.waterBound;
      });
      await calmAll();
      await B.call('setHp', fullHp);
    }
  }

  // ---------- The snakes' cave, next to the boss's arena ----------
  {
    const cave = J.layout.caves[0];
    const arena = J.layout.arena;
    const nest = async () => (await B.state()).enemies.filter((e) => e.kind === 'cave_snake' && e.alive);
    const bait = async () => (await B.state()).food.filter((f) => f.bait);
    const insideCave = (p, r) => Math.hypot(p.x - cave.x, p.z - cave.z) < r;
    let snakes = await nest();
    let baits = await bait();
    check('cave: it is on the right of the boss\'s arena, with four carcasses lying inside it and three calm snakes of an Adult\'s level',
      cave.x > arena.x + arena.radius + 8 && baits.length === 4 && baits.every((f) => f.kind === 'carcass' && f.available && insideCave(f, cave.radius))
      && snakes.length === 3 && snakes.every((e) => e.calm && e.level >= 12 && e.level <= 14 && insideCave(e, cave.radius)),
      `${baits.length} carcasses, ${snakes.length} snakes at levels ${snakes.map((e) => e.level).join(', ')}, calm ${snakes.map((e) => e.calm).join(', ')}`);

    // The trail kept clear of trees: an animal walks from the arena's ring to the cave's mouth without being held up.
    await B.teleport(arena.x + arena.radius + 6, arena.z, Math.PI / 2);
    await B.advance(0.3);
    await page.keyboard.down('KeyW');
    for (let t = 0; t < 14 && (await B.state()).player.x < cave.x - 8; t += 0.25) await B.advance(0.25);
    await page.keyboard.up('KeyW');
    s = await B.state();
    check('cave: a trail leads from the arena through the trees to the cave\'s mouth, and an animal walks it without being held up',
      cave.z === arena.z && s.player.x >= cave.x - 8 && Math.abs(s.player.z - cave.z) < 3, `at ${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}; the mouth is at ${cave.x - 7}, ${cave.z}`);
    await shot('27a-cave-trail');

    // Walk in through the mouth: even the biggest animal fits.
    await B.teleport(cave.x - 15, cave.z, Math.PI / 2);
    await B.advance(0.3);
    await page.keyboard.down('KeyW');
    for (let t = 0; t < 5 && (await B.state()).player.x < cave.x - 2; t += 0.2) await B.advance(0.2);
    await page.keyboard.up('KeyW');
    await B.advance(0.2);
    s = await B.state();
    check('cave: an animal can walk in through the mouth, onto the dark floor, and nothing blocks the way', insideCave(s.player, cave.radius - 1) && !s.player.swimming, `at ${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}, the middle is ${cave.x}, ${cave.z}`);
    await shot('27-cave-inside');
    const hpInside = s.player.hp;
    await B.advance(4);
    s = await B.state();
    snakes = await nest();
    check('cave: standing among sleeping snakes is safe: they stay calm and nobody is hurt', snakes.length === 3 && snakes.every((e) => e.calm && e.state !== 'chase' && e.state !== 'windup') && s.player.hp >= hpInside, snakes.map((e) => `${e.state}${e.calm ? '' : ' angry'}`).join(', '));

    // The bait: a carnivore is offered a carcass; taking it wakes the nest.
    baits = await bait();
    await B.teleport(baits[0].x, baits[0].z + 1.4, 0);
    await B.advance(0.1);
    s = await B.state();
    check('cave: next to a carcass the animal is offered it to eat', s.prompt?.key === 'E' && /Eat carcass/.test(s.prompt.text), s.prompt?.text);
    await tap('KeyE');
    await B.advance(0.3);
    snakes = await nest();
    baits = await bait();
    check('cave: eating the bait wakes the whole nest: every snake is angry and comes for the animal',
      snakes.length === 3 && snakes.every((e) => !e.calm && ['chase', 'windup', 'charging', 'recover'].includes(e.state)) && baits.filter((f) => f.available).length === 3 && /bait/.test(await page.locator('.hud-toasts').innerText()),
      snakes.map((e) => `${e.state}${e.calm ? ' calm' : ''}`).join(', '));
    await shot('28-cave-nest-awake');

    // The fight: stand and fight them as they come.
    const seen = new Set();
    let hurt = false;
    await page.mouse.move(640, 360);
    await page.mouse.down();
    for (let t = 0; t < 60; t += 0.25) {
      s = await B.state();
      const alive = s.enemies.filter((e) => e.kind === 'cave_snake' && e.alive).sort((a, b) => a.dist - b.dist);
      for (const e of alive) seen.add(e.state);
      if (s.player.hp < s.player.maxHp) hurt = true;
      if (s.player.hp < s.player.maxHp * 0.6) await B.call('setHp', s.player.maxHp);
      if (alive.length === 0) break;
      await B.lookAt(alive[0].x, alive[0].z);
      await B.advance(0.25);
    }
    await page.mouse.up();
    snakes = await nest();
    check('cave: the nest can be beaten, and its snakes rear back, strike and bite', snakes.length === 0 && hurt && seen.has('windup') && seen.has('charging'), `left ${snakes.length}, hurt ${hurt}, seen ${[...seen].join(', ')}`);

    // They come back, and so does the bait.
    await B.teleport(cave.x - 25, cave.z, Math.PI / 2);
    await B.advance(190);
    snakes = await nest();
    baits = await bait();
    check('cave: three minutes later the nest is back, calm again, and the eaten carcass has been replaced',
      snakes.length === 3 && snakes.every((e) => e.calm) && baits.length === 4 && baits.every((f) => f.available), `${snakes.length} snakes, ${baits.filter((f) => f.available).length} carcasses`);

    // A lair with a wake distance (a den of the Plains; the cave's own has none) wakes, all together, when an animal comes near.
    // It is switched on for the cave's nest at run time, because the Plains' dens do not exist yet when it is built.
    const setWakeNear = (metres) => page.evaluate(async (m) => {
      const { JUNGLE_SPAWNS } = await import('/src/data/jungle.ts');
      const zone = JUNGLE_SPAWNS.find((z) => z.lair);
      if (m === null) delete zone.wakeNear;
      else zone.wakeNear = m;
    }, metres);
    await setWakeNear(14);
    await B.advance(2);
    snakes = await nest();
    check('lair: an animal 26 m from the den\'s middle does not wake the guards', snakes.length === 3 && snakes.every((e) => e.calm), snakes.map((e) => `${e.state}${e.calm ? ' calm' : ''}`).join(', '));
    await B.teleport(cave.x - 12, cave.z, Math.PI / 2);
    await B.advance(1);
    snakes = await nest();
    check('lair: an animal that comes within 14 m wakes all the guards together, without touching any bait',
      snakes.length === 3 && snakes.every((e) => !e.calm && ['chase', 'windup', 'charging', 'recover'].includes(e.state)) && (await bait()).every((f) => f.available),
      snakes.map((e) => `${e.state}${e.calm ? ' calm' : ''}`).join(', '));
    await setWakeNear(null);
    await B.teleport(cave.x - 25, cave.z, Math.PI / 2);
    await calmAll();
    await B.advance(1);

    // Hurting one snake of a sleeping nest wakes all of them, without the bait being touched.
    await page.evaluate(() => {
      const g = window.__beast.app.game;
      const one = g.spawner.enemies.find((e) => e.def.id === 'cave_snake' && e.alive);
      g.combat.damage(g.player.actor, one, { damage: 1, knockback: 0 });
    });
    await B.advance(0.2);
    snakes = await nest();
    check('cave: hurting one snake wakes the others too', snakes.length === 3 && snakes.every((e) => !e.calm), snakes.map((e) => `${e.state}${e.calm ? ' calm' : ''}`).join(', '));
    await B.teleport(arena.x, arena.z + 14, Math.PI);
    await calmAll();
    await B.advance(0.3);
  }

  // ---------- A boss that calls a pack (the Plains' Hyena Matriarch) ----------
  // Switched on for the Silverback at run time, with tapirs as the pack, because the Plains do not exist yet when it is built.
  // The user's rule: 3 are called when the fight starts; 6 s after all 3 are dead the next 3 come; the pack goes when the fight
  // ends; the pack gives no XP and drops no carcasses.
  {
    const arena = J.layout.arena;
    await page.evaluate(async () => {
      const { BOSSES } = await import('/src/data/bosses.ts');
      BOSSES.silverback.summon = { enemyId: 'tapir', count: 3, waitSeconds: 6, levelMin: 10, levelMax: 11 };
    });
    const fullHp = (await B.state()).player.maxHp;
    // Advances in small steps and keeps the player alive: this checks the boss's pack, not whether the player survives it.
    const advanceAlive = async (seconds) => {
      for (let t = 0; t < seconds - 1e-9; t += 0.25) {
        await B.call('setHp', fullHp);
        await B.advance(0.25);
      }
    };
    const pack = async () => (await B.state()).enemies.filter((e) => e.summoned);
    const alivePack = async () => (await pack()).filter((e) => e.alive);
    const carcasses = async () => (await B.state()).food.filter((f) => f.kind === 'carcass' && !f.bait).length;
    await page.evaluate(() => { window.__beast.app.game.spawner.boss.calm = false; });
    await watchXp();

    // The fight starts: the boss notices the player in its arena, and calls a pack of 3.
    await B.teleport(arena.x, arena.z + 12, Math.PI);
    await advanceAlive(0.5);
    let alive = await alivePack();
    check('summon: when the boss begins to fight it calls a pack of 3, which stand in its arena and attack',
      alive.length === 3 && alive.every((e) => e.kind === 'tapir' && Math.hypot(e.x - arena.x, e.z - arena.z) < arena.radius + 6 && !e.boss),
      `${alive.length} called: ${alive.map((e) => `${e.kind} ${e.state}`).join(', ')}`);

    // Kill all 3 the way the player would: no XP and no carcasses come of it.
    const carcassesBefore = await carcasses();
    await page.evaluate(() => {
      const g = window.__beast.app.game;
      for (const e of g.spawner.enemies.filter((q) => q.summoned && q.alive)) g.combat.damage(g.player.actor, e, { damage: 1e7, knockback: 0 });
    });
    await advanceAlive(0.3);
    check('summon: the pack gives no XP and leaves no carcass', (await page.evaluate(() => window.__xp)).length === 0 && (await carcasses()) === carcassesBefore,
      `xp ${(await page.evaluate(() => window.__xp)).join() || 'none'}, carcasses ${carcassesBefore} -> ${await carcasses()}`);

    // 5 s after the last one died there is still no new pack; by 7 s there is.
    await advanceAlive(4.7);
    alive = await alivePack();
    check('summon: 5 s after all 3 died the boss has not called again', alive.length === 0, `${alive.length} alive`);
    await advanceAlive(2.5);
    alive = await alivePack();
    check('summon: about 6 s after all 3 died the boss calls the next 3', alive.length === 3, `${alive.length} alive`);

    // The player leaves the arena: the fight ends and the pack goes.
    await B.teleport(arena.x, arena.z + 80, Math.PI);
    await B.advance(1);
    check('summon: when the player leaves the arena the pack is gone within a second, even if the boss is mid-swing', (await pack()).length === 0, `${(await pack()).length} left`);
    await B.advance(4);
    check('summon: and the boss goes home', !/chase|windup|charging|recover/.test((await B.state()).enemies.find((e) => e.boss).state), (await B.state()).enemies.find((e) => e.boss).state);
    await page.evaluate(async () => {
      const { BOSSES } = await import('/src/data/bosses.ts');
      delete BOSSES.silverback.summon;
    });
    await calmAll();
    await B.call('setHp', fullHp);
    await B.advance(15);
    await B.teleport(arena.x, arena.z + 14, Math.PI);
    await B.advance(0.3);
  }

  // The boss.
  s = await B.state();
  boss = s.enemies.find((e) => e.boss);
  check('jungle: the Great Silverback waits in its arena', !!boss && boss.kind === 'silverback' && Math.hypot(boss.x - J.layout.arena.x, boss.z - J.layout.arena.z) < J.layout.arena.radius && boss.level === 20, boss ? `level ${boss.level}` : 'no boss');
  await B.teleport(J.layout.arena.x, J.layout.arena.z + 10, Math.PI);
  await B.advance(0.5);
  await shot('24-jungle-boss');
  await B.teleport(J.layout.gate.x, J.layout.gate.z + 4, Math.PI);
  await B.advance(0.2);
  check('jungle: the gate onward is sealed while the Silverback lives', /Sealed. Defeat the Jungle boss/.test((await B.state()).prompt?.text ?? ''), (await B.state()).prompt?.text);
  await B.teleport(boss.x, boss.z + 5);
  await watchXp();
  const silverback = await fight('boss', { maxSeconds: 300, keepAlive: true });
  s = await B.state();
  check('jungle: the Silverback can be defeated, and it uses its attacks', silverback.killed && silverback.hurt, `${silverback.seconds}s, states ${[...silverback.states].join(', ')}`);
  check('jungle: the first win pays 700 XP', (await page.evaluate(() => window.__xp)).includes(700), (await page.evaluate(() => window.__xp)).join());
  check('"Jungle Ruled": the Jungle is ruled, the Plains are unlocked and the gate is open', s.ruled.includes('jungle') && s.unlocked.includes('plains') && s.gateOpen && /Jungle Ruled/.test(await page.locator('.hud').innerText()), `ruled ${s.ruled.join()}, unlocked ${s.unlocked.join()}`);
  await shot('25-jungle-ruled');
  await B.teleport(J.layout.gate.x, J.layout.gate.z + 4, Math.PI);
  await B.advance(0.2);
  s = await B.state();
  check('jungle: the open gate offers the Plains', s.prompt?.key === 'E' && /Enter the Plains/.test(s.prompt.text), s.prompt?.text);
  // ---------- The Plains (Milestone 3): through the Jungle's gate ----------
  await tap('KeyE');
  await B.advance(0.2);
  await page.waitForTimeout(100);
  s = await B.state();
  check('jungle: the open gate leads to the Plains, and the banner names them', s.biome === 'plains' && /Plains/.test(await page.locator('.hud').innerText()), s.biome);
  await shot('28-plains-arrival');
  const PL = await page.evaluate(() => { const w = window.__beast.app.world; return { layout: w.layout, trees: w.treeSpots.length }; });
  check('plains: the Tiger is slowed to recover its stamina here (-15%)', s.player.mods.join() === 'staminaRegen:-0.15', s.player.mods.join());
  const plainsKinds = new Set(s.enemies.map((e) => e.kind));
  check('plains: its own animals, rivals, den guards and boss, and none from the other biomes',
    ['antelope', 'buffalo', 'hyena', 'den_lion', 'rival_elephant', 'rival_lion', 'alligator', 'hyena_matriarch'].every((k) => plainsKinds.has(k))
    && !['deer', 'boar', 'capybara', 'tapir', 'rival_tiger', 'silverback'].some((k) => plainsKinds.has(k)), [...plainsKinds].join(', '));
  check('plains: every wild animal is level 16 or higher; three alligators live in the lakes, and two Elephants and a lion roam as rivals',
    s.enemies.filter((e) => !e.boss).every((e) => e.level >= 16) && s.enemies.filter((e) => e.kind === 'alligator').length === 3
    && s.enemies.filter((e) => e.kind === 'rival_elephant').length === 2 && s.enemies.filter((e) => e.kind === 'rival_lion').length === 1,
    `${s.enemies.length} animals`);
  check('plains: wide and open: about 90 trees where the Forest has 430', PL.trees >= 60 && PL.trees <= 100, `${PL.trees} trees`);
  await shot('28b-plains-den');
  await calmAll();

  // The alligators never leave their lake and a strip of shore, and do spend time in the water.
  let gatorsOutside = 0;
  let gatorsInWater = 0;
  for (let i = 0; i < 48; i++) {
    await B.advance(2.5);
    const gators = await page.evaluate(() => {
      const g = window.__beast.app.game;
      return g.spawner.enemies.filter((e) => e.alive && e.def.id === 'alligator').map((e) => ({ zone: g.world.inLakeZone(e.pos.x, e.pos.z, 8), depth: g.world.waterDepth(e.pos.x, e.pos.z) }));
    });
    for (const a of gators) {
      if (!a.zone) gatorsOutside++;
      if (a.depth > 0.2) gatorsInWater++;
    }
  }
  check('plains: the alligators never leave their lake and a strip of shore, and spend time in the water', gatorsOutside === 0 && gatorsInWater > 0, `${gatorsOutside} samples outside, ${gatorsInWater} in the water`);

  // The two dens: four calm guards each, which all wake together when an animal comes within 14 m.
  const [hyenaDen, lionDen] = PL.layout.caves;
  // A den's guards are counted by the den they belong to (their home), not by where they stand: one that lunges at the player leaves the circle.
  const denGuards = async (kind, den) => (await B.state()).enemies.filter((e) => e.kind === kind && e.alive && e.lair && Math.hypot(e.homeX - den.x, e.homeZ - den.z) < den.radius + 3);
  const engaged = ['chase', 'windup', 'charging', 'recover'];
  for (const [name, kind, den, side] of [['hyena', 'hyena', hyenaDen, 1], ['lion', 'den_lion', lionDen, -1]]) {
    let guards = await denGuards(kind, den);
    check(`plains: the ${name}'s den holds four calm guards`, guards.length === 4 && guards.every((e) => e.calm), `${guards.length} guards`);
    await B.teleport(den.x + side * 17, den.z, -side * (Math.PI / 2));
    await B.advance(1.5);
    guards = await denGuards(kind, den);
    check(`plains: an animal 17 m from the ${name}'s den does not wake its guards`, guards.length === 4 && guards.every((e) => e.calm), guards.map((e) => (e.calm ? 'calm' : e.state)).join(', '));
    await B.teleport(den.x + side * 12, den.z, -side * (Math.PI / 2));
    await B.call('setHp', (await B.state()).player.maxHp);
    await B.advance(1);
    guards = await denGuards(kind, den);
    check(`plains: an animal that comes within 14 m of the ${name}'s den wakes all four guards together`,
      guards.length === 4 && guards.every((e) => !e.calm && engaged.includes(e.state)), guards.map((e) => (e.calm ? 'calm' : e.state)).join(', '));
    await shot(`28c-plains-${name}-den`);
    await B.teleport(PL.layout.playerSpawn.x, PL.layout.playerSpawn.z);
    await calmAll();
    await B.advance(2);
  }

  // Each animal's Plains buff or nerf (bible section 4.4).
  let pm = await modsAs('Savanna Lion');
  check('plains: the Lion is at home here (+20% damage)', pm.biome === 'plains' && pm.mods === 'damage:0.2', pm.mods);
  pm = await modsAs('Bush Elephant');
  check('plains: the Elephant is at home here (+20% max health)', pm.mods === 'maxHealth:0.2', pm.mods);
  pm = await modsAs('Grey Wolf');
  check('plains: the Wolf has no modifier here', pm.mods === '', pm.mods);

  // A hunt and a fight, as an Alpha Wolf: an antelope flees faster and for longer than a deer, and a wolf can still run it down.
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor();
  await page.getByRole('button', { name: 'Max all' }).click();
  await page.keyboard.press('Escape');
  await page.locator('.admin-card').waitFor({ state: 'detached' });
  await B.advance(0.2);
  const antelopeHunt = await hunt('antelope', 150);
  check('plains: an antelope flees, and an Alpha Wolf can still run it down', antelopeHunt.killed && antelopeHunt.fled, `${antelopeHunt.seconds}s, level ${antelopeHunt.level}`);
  const buffaloFight = await fight('buffalo', { maxSeconds: 90, keepAlive: true });
  check('plains: a buffalo fights back and can be beaten', buffaloFight.killed && buffaloFight.hurt, `${buffaloFight.seconds}s`);
  const hyenaFight = await fight('hyena', { maxSeconds: 60, keepAlive: true });
  check('plains: a hyena bites and lunges and can be beaten', hyenaFight.killed && hyenaFight.hurt, `${hyenaFight.seconds}s`);

  // The boss: the Hyena Matriarch waits in her arena, calls a pack of 3 when the fight starts, and can be beaten.
  const arenaP = PL.layout.arena;
  s = await B.state();
  const matriarch = s.enemies.find((e) => e.boss);
  check('plains: the Hyena Matriarch waits in her arena', !!matriarch && matriarch.kind === 'hyena_matriarch' && matriarch.level === 30 && Math.hypot(matriarch.x - arenaP.x, matriarch.z - arenaP.z) < arenaP.radius,
    matriarch ? `${matriarch.kind} level ${matriarch.level}` : 'no boss');
  await page.evaluate(() => { window.__beast.app.game.spawner.boss.calm = false; });
  await B.call('setHp', (await B.state()).player.maxHp);
  await B.teleport(arenaP.x, arenaP.z + 12, Math.PI);
  await B.advance(0.6);
  let pack = (await B.state()).enemies.filter((e) => e.summoned && e.alive);
  check('plains: when the fight starts the Matriarch calls a pack of 3 hyenas', pack.length === 3 && pack.every((e) => e.kind === 'hyena'), `${pack.length} called: ${pack.map((e) => e.kind).join(', ')}`);
  await shot('28d-plains-boss');
  await B.teleport(arenaP.x, arenaP.z + 70, Math.PI);
  await B.advance(1);
  check('plains: when the player leaves the arena the pack is gone', (await B.state()).enemies.filter((e) => e.summoned).length === 0);
  await B.advance(12);
  await B.teleport(matriarch.x, matriarch.z + 5);
  await watchXp();
  const matriarchFight = await fight('boss', { maxSeconds: 420, keepAlive: true });
  s = await B.state();
  check('plains: the Hyena Matriarch can be defeated', matriarchFight.killed && matriarchFight.hurt, `${matriarchFight.seconds}s, states ${[...matriarchFight.states].join(', ')}`);
  const xpEvents = await page.evaluate(() => window.__xp);
  check('plains: the first win pays 1100 XP, and nothing the Matriarch called paid any', xpEvents.join() === '1100', xpEvents.join());
  check('"Plains Ruled": the Plains are ruled, Winter is unlocked and the gate is open',
    s.ruled.includes('plains') && s.unlocked.includes('winter') && s.gateOpen && /Plains Ruled/.test(await page.locator('.hud').innerText()), `ruled ${s.ruled.join()}, unlocked ${s.unlocked.join()}`);
  await B.advance(1);
  check('plains: the pack goes with the boss', (await B.state()).enemies.filter((e) => e.summoned).length === 0);
  await shot('28e-plains-ruled');
  await B.teleport(PL.layout.gate.x, PL.layout.gate.z + 4, Math.PI);
  await B.advance(0.2);
  s = await B.state();
  check('plains: the open gate offers Winter', s.prompt?.key === 'E' && /Enter the Winter/.test(s.prompt.text), s.prompt?.text);
  await tap('KeyE');
  await B.advance(0.2);
  await page.waitForTimeout(100);
  s = await B.state();
  check('plains: Winter is not built yet: the gate says so and the animal stays in the Plains', s.biome === 'plains' && /The way to the Winter is not open yet/.test(await page.locator('.hud-toasts').innerText()));

  // Death in the Plains: the animal wakes at the Plains' den.
  await page.evaluate(() => {
    const g = window.__beast.app.game;
    g.combat.damage(g.spawner.enemies.find((e) => e.alive), g.player.actor, { damage: 1e7, knockback: 0 });
  });
  await B.advance(5);
  s = await B.state();
  check('plains: an animal that dies here wakes at the Plains\' den, and keeps the biomes it rules',
    s.biome === 'plains' && s.player.alive && Math.hypot(s.player.x - PL.layout.playerSpawn.x, s.player.z - PL.layout.playerSpawn.z) < 1 && s.ruled.includes('plains') && s.gateOpen,
    `${s.biome} at ${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}`);

  // ---------- The pet (M3, 2026-11-19): a liger cub or a hyena pup that follows the player and fights beside it ----------
  {
  const SP = PL.layout.playerSpawn;
  const petOf = async () => (await B.state()).pet;
  /** Puts the pet somewhere by hand (the test's stand-in for it wandering). */
  const placePet = (x, z) => page.evaluate(([a, b]) => { const g = window.__beast.app.game; g.pet.pos.set(a, g.world.heightAt(a, b), b); g.pet.vx = g.pet.vz = 0; }, [x, z]);
  await calmAll();
  await B.teleport(SP.x, SP.z, Math.PI);
  await B.advance(0.2);
  check('pet: an animal starts with no pet', (await petOf()) === null);

  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor();
  const petRow = page.locator('.admin-row[data-row="pet"]');
  check('admin: the panel has a Pet row with None, Liger cub, Hyena pup and Injure', (await petRow.getByRole('button').allInnerTexts()).join() === 'None,Liger cub,Hyena pup,Injure',
    (await petRow.getByRole('button').allInnerTexts().catch(() => [])).join());
  await petRow.getByRole('button', { name: 'Liger cub' }).click();
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor({ state: 'detached' });
  await B.advance(0.2);
  s = await B.state();
  let pet = s.pet;
  check('admin: Liger cub gives the sandbox a liger cub, beside the animal', pet?.kind === 'liger' && pet.alive && pet.dist < 4, JSON.stringify(pet));
  const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
  check('pet: a liger cub has 35% of the player\'s health, 30% of its damage and the same defense, at about half an adult\'s size',
    !!pet && near(pet.maxHp, s.player.maxHp * 0.35) && near(pet.damage, s.player.damage * 0.3) && pet.defense === s.player.defense && pet.size > 0.4 && pet.size < 0.7,
    pet && `hp ${pet.maxHp} of ${s.player.maxHp}, damage ${pet.damage.toFixed(1)} of ${s.player.damage.toFixed(1)}, size ${pet.size}`);
  await shot('29-pet-liger');
  await settle();
  check('pet: a green tag over it says it is the player\'s', /Your cub/.test(await page.locator('.tag.pet').innerText().catch(() => '')));

  // Its strength follows the player's.
  const before = pet.maxHp;
  await B.call('grantXp', 20000);
  await B.advance(0.1);
  pet = await petOf();
  check('pet: when the player grows stronger, so does its pet', pet.maxHp > before, `${before} -> ${pet.maxHp}`);

  // Following, and catching up.
  await B.teleport(SP.x + 12, SP.z - 6, Math.PI);
  await B.advance(5);
  pet = await petOf();
  check('pet: it follows the player and stays close', pet.dist < 4, `${pet.dist.toFixed(1)} m`);
  await B.teleport(SP.x - 30, SP.z - 30, Math.PI);
  await B.advance(0.2);
  pet = await petOf();
  check('pet: left more than 35 m behind, it appears beside the player', pet.dist < 4, `${pet.dist.toFixed(1)} m`);

  // Its health comes back slowly, like the player's.
  await page.evaluate(() => { const p = window.__beast.app.game.pet; p.hp = p.stats.maxHealth / 2; });
  await B.advance(15);
  pet = await petOf();
  check('pet: it heals slowly when it is not being hurt', pet.hp > pet.maxHp / 2 + 1, `${pet.hp.toFixed(0)} of ${pet.maxHp}`);

  // The player's own attacks never touch it; a wild animal's do.
  const teamCheck = await page.evaluate(() => {
    const g = window.__beast.app.game;
    const p = g.pet.pos;
    const wild = g.spawner.enemies.find((e) => e.alive);
    return {
      player: g.combat.targetsInRadius(g.player.actor, p.x, p.z, 30).includes(g.pet) || g.combat.targetsInArc(g.player.actor, 50, 360).includes(g.pet),
      wild: g.combat.targetsInRadius(wild, p.x, p.z, 3).includes(g.pet),
    };
  });
  check('pet: the player\'s area attacks and swipes pass through its pet; a wild animal\'s area attack can hit it', !teamCheck.player && teamCheck.wild, JSON.stringify(teamCheck));
  // Inside the den's ring (wild animals never come in), with a record of who hits the pet.
  await calmAll();
  await B.teleport(SP.x, SP.z, Math.PI);
  await B.advance(0.2);
  s = await B.state();
  await placePet(s.player.x + Math.sin(s.player.yaw) * 1.6, s.player.z + Math.cos(s.player.yaw) * 1.6);
  await page.evaluate(() => {
    const g = window.__beast.app.game;
    window.__petHitBy = [];
    window.__offPetHits = g.events.on('damage', ({ target, attacker }) => {
      if (target === g.pet) window.__petHitBy.push(attacker === g.player.actor ? 'player' : (attacker?.name ?? 'nobody'));
    });
  });
  const petHp = (await petOf()).hp;
  await page.mouse.move(640, 360);
  for (let i = 0; i < 3; i++) {
    await page.mouse.down();
    await B.advance(0.1);
    await page.mouse.up();
    await B.advance(0.6);
  }
  await tap('Digit3');
  await B.advance(1);
  const petHitBy = await page.evaluate(() => { window.__offPetHits(); return window.__petHitBy; });
  check('pet: the player\'s real attacks and an ability key at the pet do it no harm', petHitBy.length === 0 && (await petOf()).hp >= petHp,
    `${petHp.toFixed(0)} -> ${(await petOf()).hp.toFixed(0)}, hit by: ${petHitBy.join(', ') || 'nobody'}`);

  // It leaves a calm den guard alone, even right beside it.
  await calmAll();
  await B.teleport(hyenaDen.x + 18, hyenaDen.z, -Math.PI / 2);
  const calmGuard = (await denGuards('hyena', hyenaDen))[0];
  const hits0 = (await petOf()).hits;
  await placePet(calmGuard.x + 1.5, calmGuard.z);
  await B.advance(3);
  check('pet: it never wakes a calm den guard or starts a fight', (await petOf()).hits === hits0 && (await denGuards('hyena', hyenaDen)).every((e) => e.calm),
    `${(await petOf()).hits - hits0} bites, guards ${(await denGuards('hyena', hyenaDen)).map((e) => (e.calm ? 'calm' : e.state)).join(', ')}`);

  // It fights an animal that is fighting the player, and the kill is the player's.
  await B.teleport(SP.x, SP.z - 30, Math.PI);
  const foe = nearest(await B.state(), 'buffalo');
  await B.teleport(foe.x, foe.z + 3, Math.PI);
  await placePet(foe.x + 1.5, foe.z + 2);
  await page.evaluate((id) => { const e = window.__beast.app.game.spawner.enemies.find((x) => x.id === id); e.calm = false; e.provoked = true; e.state = 'chase'; e.homeX = e.pos.x; e.homeZ = e.pos.z; }, foe.id);
  const hits1 = (await petOf()).hits;
  for (let i = 0; i < 8; i++) {
    await B.advance(0.5);
    await B.call('setHp', (await B.state()).player.maxHp);
  }
  pet = await petOf();
  check('pet: it bites an animal that is fighting the player', pet.hits > hits1, `${pet.hits - hits1} bites, target ${pet.targetId}, foe ${foe.id}`);
  const xp0 = (await B.state()).player;
  await page.evaluate((id) => { window.__beast.app.game.spawner.enemies.find((x) => x.id === id).hp = 1; }, foe.id);
  for (let i = 0; i < 12 && (await B.state()).enemies.find((e) => e.id === foe.id)?.alive; i++) {
    await B.advance(0.5);
    await B.call('setHp', (await B.state()).player.maxHp);
  }
  s = await B.state();
  pet = s.pet;
  check('pet: an animal its pet kills gives the player its XP and leaves a carcass',
    pet.kills >= 1 && (s.player.level > xp0.level || s.player.xp > xp0.xp) && s.food.some((f) => f.kind === 'carcass' && Math.hypot(f.x - foe.x, f.z - foe.z) < 8),
    `kills ${pet.kills}, level ${xp0.level} -> ${s.player.level}, xp ${xp0.xp.toFixed(0)} -> ${s.player.xp.toFixed(0)}`);

  // ----- 3d: wild animals fight the pet too; injury, tending and death -----
  await settle();
  check('pet: a plaque on the HUD names the pet and shows its health', /Liger cub/.test(await page.locator('.hud-pet').innerText().catch(() => ''))
    && (await page.locator('.hud-pet .meter').count()) === 1 && !(await page.locator('.hud-pet').evaluate((n) => n.classList.contains('injured')).catch(() => true)));

  // An animal fighting the player turns on the pet once the pet bites it.
  await calmAll();
  const foeOf = async (id) => (await B.state()).enemies.find((e) => e.id === id);
  const rival = nearest(await B.state(), 'buffalo');
  await B.teleport(rival.x, rival.z + 2.6, Math.PI);
  await placePet(rival.x + 5, rival.z + 4);
  await page.evaluate((id) => { const e = window.__beast.app.game.spawner.enemies.find((x) => x.id === id); e.calm = false; e.provoked = true; e.state = 'chase'; e.homeX = e.pos.x; e.homeZ = e.pos.z; e.lastHitBy = null; }, rival.id);
  await B.advance(0.1);
  const firstFoe = (await foeOf(rival.id)).foe;
  let turned = false;
  let petHurt = false;
  const petHp0 = (await petOf()).hp;
  for (let i = 0; i < 16 && !(turned && petHurt); i++) {
    await B.advance(0.5);
    await B.call('setHp', (await B.state()).player.maxHp);
    turned ||= (await foeOf(rival.id))?.foe === 'pet';
    petHurt ||= (await petOf()).hp < petHp0 - 1;
  }
  check('pet: a fighting animal goes for the nearer of the two, then turns on the pet once the pet bites it, and can hurt it',
    firstFoe === 'player' && turned && petHurt, `first ${firstFoe}, turned ${turned}, pet hurt ${petHurt}`);

  // At 0 health the pet is injured, not dead: it lies down, cannot be hit, and nothing fights it.
  await page.evaluate((id) => { const g = window.__beast.app.game; g.combat.damage(g.spawner.enemies.find((x) => x.id === id), g.pet, { damage: 1e7, knockback: 0 }); }, rival.id);
  await B.advance(0.2);
  pet = await petOf();
  const injuredCheck = await page.evaluate((id) => {
    const g = window.__beast.app.game;
    const wild = g.spawner.enemies.find((x) => x.id === id);
    return { hittable: g.combat.targetsInRadius(wild, g.pet.pos.x, g.pet.pos.z, 5).includes(g.pet) };
  }, rival.id);
  await B.advance(1);
  check('pet: at 0 health it is injured, not dead: it cannot be hit and the animal goes back to the player',
    pet.phase === 'injured' && pet.alive && !injuredCheck.hittable && (await foeOf(rival.id))?.foe === 'player',
    `${pet.phase}, alive ${pet.alive}, hittable ${injuredCheck.hittable}, foe ${(await foeOf(rival.id))?.foe}`);
  check('pet: lying injured it keeps its own colours (no hit flash stuck on it, found in a screenshot)', (await petOf()).flash === 0, `flash ${(await petOf()).flash}`);
  await settle();
  const plaque = await page.locator('.hud-pet').innerText().catch(() => '');
  check('pet: the plaque turns red and counts down from 1:00, and says to hold E beside it',
    (await page.locator('.hud-pet.injured').count()) === 1 && /Injured/.test(plaque) && /0:5\d|1:00/.test(plaque) && /Hold E/.test(plaque) && (await page.locator('.tag.pet.injured').count()) === 1,
    plaque.replace(/\s+/g, ' '));
  await shot('29b-pet-injured');
  check('pet: the save marks it injured', (await page.evaluate(() => window.__beast.app.game.growth.profile.pet?.injured)) === true);

  // Tending: hold E beside it for 3 s; a hit on the player starts the 3 s again.
  await calmAll();
  await B.advance(0.5);
  pet = await petOf();
  await B.teleport(pet.x + 1.6, pet.z, -Math.PI / 2);
  await B.advance(0.1);
  s = await B.state();
  check('pet: beside the injured pet the prompt says to hold E', s.prompt?.key === 'E' && /tend to your cub/.test(s.prompt.text), s.prompt?.text);
  await page.keyboard.down('KeyE');
  await B.advance(2);
  pet = await petOf();
  await settle();
  const ring = await page.locator('.hud-prompt .ring').count();
  const held = pet.tendHeld;
  await page.evaluate((id) => { const g = window.__beast.app.game; g.combat.damage(g.spawner.enemies.find((x) => x.id === id), g.player.actor, { damage: 5, knockback: 0 }); }, rival.id);
  await B.advance(0.1);
  const afterHit = (await petOf()).tendHeld;
  await B.advance(2.5);
  const notYet = (await petOf()).phase;
  await B.advance(0.8);
  await page.keyboard.up('KeyE');
  pet = await petOf();
  check('pet: holding E fills the ring, a hit on the player starts it again, and 3 s of tending bring it back with 40% of its health',
    held > 1.8 && ring === 1 && afterHit < 0.3 && notYet === 'injured' && pet.phase === 'healthy' && Math.abs(pet.hp - pet.maxHp * 0.4) < pet.maxHp * 0.03,
    `held ${held.toFixed(2)}, ring ${ring}, after the hit ${afterHit.toFixed(2)}, then ${notYet}, now ${pet.phase} at ${pet.hp.toFixed(0)} of ${pet.maxHp}`);
  check('pet: once tended, the save no longer marks it injured', (await page.evaluate(() => window.__beast.app.game.growth.profile.pet?.injured)) === false);

  // Injured in the water: it stays where it is, and can be tended there.
  const lake = PL.layout.waters[0];
  const wade = await page.evaluate(([lx, lz, r]) => {
    const w = window.__beast.app.world;
    for (let a = 0; a < Math.PI * 2; a += 0.2) for (let d = r - 1; d > 0; d -= 0.5) {
      const x = lx + Math.cos(a) * d; const z = lz + Math.sin(a) * d;
      const depth = w.waterDepth(x, z);
      if (depth > 0.3 && depth < 0.9 && !w.colliders.blocked(x, z, 1)) return { x, z, depth };
    }
    return null;
  }, [lake.x, lake.z, lake.radius]);
  await B.teleport(wade.x + 1.5, wade.z, -Math.PI / 2);
  await placePet(wade.x, wade.z);
  await page.evaluate(() => { const g = window.__beast.app.game; g.pet.hp = 0; });
  await B.advance(3);
  pet = await petOf();
  const drift = Math.hypot(pet.x - wade.x, pet.z - wade.z);
  await page.keyboard.down('KeyE');
  await B.advance(3.3);
  await page.keyboard.up('KeyE');
  check('pet: injured in the water it stays put, and can be tended there', pet.phase === 'injured' && drift < 0.3 && (await petOf()).phase === 'healthy',
    `${pet.phase}, moved ${drift.toFixed(2)} m, depth ${wade.depth.toFixed(2)}, then ${(await petOf()).phase}`);

  // Its target vanishing mid-fight (a boss's pack is dismissed when the fight ends): it gives up and comes back.
  await B.teleport(SP.x, SP.z - 30, Math.PI);
  const prey = nearest(await B.state(), 'hyena') ?? nearest(await B.state(), 'buffalo');
  // The pet only joins a fight within 15 m of the player.
  await B.teleport(prey.x, prey.z + 6, Math.PI);
  await placePet(prey.x + 1.5, prey.z);
  await page.evaluate((id) => { const e = window.__beast.app.game.spawner.enemies.find((x) => x.id === id); e.calm = false; e.provoked = true; e.state = 'chase'; e.homeX = e.pos.x; e.homeZ = e.pos.z; }, prey.id);
  await B.advance(1);
  const hadTarget = (await petOf()).targetId === prey.id;
  await page.evaluate((id) => { const sp = window.__beast.app.game.spawner; const e = sp.enemies.find((x) => x.id === id); e.model.dispose(); sp.enemies = sp.enemies.filter((x) => x !== e); }, prey.id);
  await B.advance(6);
  pet = await petOf();
  check('pet: when its target vanishes mid-fight it gives up and comes back to the player', hadTarget && pet.targetId === null && pet.dist < 4,
    `had target ${hadTarget}, target ${pet.targetId}, ${pet.dist.toFixed(1)} m`);

  // The admin panel can injure it; left untended for 60 s, it dies, and the slot has no pet.
  await calmAll();
  await B.teleport(SP.x, SP.z, Math.PI);
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor();
  await petRow.getByRole('button', { name: 'Injure' }).click();
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor({ state: 'detached' });
  await B.advance(0.2);
  check('admin: Injure injures the pet', (await petOf())?.phase === 'injured');
  await B.teleport(SP.x + 8, SP.z, Math.PI);
  await B.advance(58);
  check('pet: an injured pet still lives at 58 s', (await petOf())?.phase === 'injured');
  await B.advance(5);
  await settle();
  check('pet: untended for 60 s it dies: the slot has no pet, and the player is told',
    (await petOf()) === null && (await page.evaluate(() => window.__beast.app.game.growth.profile.pet)) === null && /has died/.test(await page.locator('.hud-toasts').innerText())
    && !(await page.locator('.hud-pet').isVisible()));

  // The hyena pup, and no pet.
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor();
  await petRow.getByRole('button', { name: 'Hyena pup' }).click();
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor({ state: 'detached' });
  await B.advance(0.2);
  s = await B.state();
  pet = s.pet;
  check('admin: Hyena pup swaps the cub for a hyena pup with 40% of the player\'s health and 20% of its damage',
    pet?.kind === 'hyena' && near(pet.maxHp, s.player.maxHp * 0.4) && near(pet.damage, s.player.damage * 0.2) && pet.dist < 4,
    pet && `hp ${pet.maxHp} of ${s.player.maxHp}, damage ${pet.damage.toFixed(1)}`);
  await shot('29-pet-hyena');
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor();
  await petRow.getByRole('button', { name: 'None' }).click();
  await page.keyboard.press('KeyJ');
  await page.locator('.admin-card').waitFor({ state: 'detached' });
  check('admin: None takes the pet away', (await petOf()) === null && (await page.evaluate(() => window.__beast.app.game.growth.profile.pet)) === null);

  // ----- 3e: the egg -----
  const eggsOf = async () => (await B.state()).eggs;
  const killDen = (kind, den) => page.evaluate(([k, x, z, r]) => {
    const g = window.__beast.app.game;
    for (const e of g.spawner.enemies.filter((a) => a.alive && a.def.id === k && a.zone?.lair && Math.hypot(a.pos.x - x, a.pos.z - z) < r + 4)) {
      g.combat.damage(g.player.actor, e, { damage: 1e9, knockback: 0 });
    }
  }, [kind, den.x, den.z, den.radius]);
  await calmAll();
  await B.teleport(SP.x, SP.z, Math.PI);
  await B.advance(0.5);
  check('egg: no den shows an egg while its guards live', (await eggsOf()).length === 0, JSON.stringify(await eggsOf()));
  await killDen('hyena', hyenaDen);
  await B.advance(0.5);
  let eggs = await eggsOf();
  check('egg: once all four guards of the hyena\'s den are dead, a hyena egg lies in the den, and none at the lion\'s',
    eggs.length === 1 && eggs[0].kind === 'hyena' && Math.hypot(eggs[0].x - hyenaDen.x, eggs[0].z - hyenaDen.z) < hyenaDen.radius, JSON.stringify(eggs));
  await B.teleport(eggs[0].x + 1.8, eggs[0].z, -Math.PI / 2);
  await B.advance(0.1);
  s = await B.state();
  check('egg: beside it the prompt offers to take it', s.prompt?.key === 'E' && /Take the egg/.test(s.prompt.text), s.prompt?.text);
  await shot('29c-egg-in-den');
  await tap('KeyE');
  await B.advance(0.2);
  s = await B.state();
  check('egg: taking it gives the slot a hyena pup at once (saved), the egg starts hatching beside the player, and the den is empty',
    s.pet?.phase === 'egg' && s.pet.kind === 'hyena' && s.pet.dist < 4 && s.eggs.length === 0
    && (await page.evaluate(() => JSON.stringify(window.__beast.app.game.growth.profile.pet))) === '{"kind":"hyena","injured":false}', JSON.stringify(s.pet));
  await B.advance(5);
  await shot('29d-egg-hatching');
  await B.advance(4);
  check('egg: it has not hatched at 9 s', (await petOf()).phase === 'egg');
  await B.advance(1.5);
  pet = await petOf();
  await settle();
  check('egg: at 10 s it hatches into a hyena pup beside the player', pet.phase === 'healthy' && pet.kind === 'hyena' && pet.dist < 4 && /hatched/.test(await page.locator('.hud-toasts').innerText()), JSON.stringify(pet));
  await shot('29e-egg-hatched');
  await killDen('den_lion', lionDen);
  await B.advance(0.5);
  check('egg: with a pet in the slot, beating the lion\'s den gives no egg (one pet per slot)', (await eggsOf()).length === 0, JSON.stringify(await eggsOf()));

  // When the pet dies, both beaten dens give an egg again; the next one can be the other kind.
  await page.evaluate(() => window.__beast.app.game.adminInjurePet());
  await B.advance(62.5);
  eggs = await eggsOf();
  check('egg: after the pet dies, both beaten dens give an egg again', (await petOf()) === null && eggs.map((e) => e.kind).sort().join() === 'hyena,liger', JSON.stringify(eggs));
  check('pet: the message of its death says where a new egg comes from', /new egg/.test(await page.locator('.hud-toasts').innerText()));
  const ligerEgg = eggs.find((e) => e.kind === 'liger');
  await B.teleport(ligerEgg.x + 1.8, ligerEgg.z, -Math.PI / 2);
  await B.advance(0.1);
  await tap('KeyE');
  await B.advance(10.5);
  pet = await petOf();
  check('egg: the lion\'s den\'s egg hatches into a liger cub, and the hyena\'s egg is gone', pet?.kind === 'liger' && pet.phase === 'healthy' && (await eggsOf()).length === 0, JSON.stringify(pet));
  }

  // Back through the gate to the Jungle.
  await B.teleport(PL.layout.returnGate.x, PL.layout.returnGate.z - 4, 0);
  await B.advance(0.2);
  s = await B.state();
  check('plains: the gate at the south edge offers the way back to the Jungle', s.prompt?.key === 'E' && /Return to the Jungle/.test(s.prompt.text), s.prompt?.text);
  await tap('KeyE');
  await B.advance(0.2);
  await page.waitForTimeout(100);
  s = await B.state();
  check('plains: the way back leads to the Jungle', s.biome === 'jungle', s.biome);
  check('pet: the pet goes through the gate with the player and arrives beside it', s.pet?.kind === 'liger' && s.pet.phase === 'healthy' && s.pet.dist < 4, JSON.stringify(s.pet));
  await page.evaluate(() => { const p = window.__beast.app.game.pet; p.hp = p.stats.maxHealth / 3; });

  // Death in the Jungle: the animal wakes at the Jungle's den.
  const killPlayer = () => page.evaluate(() => {
    const g = window.__beast.app.game;
    g.combat.damage(g.spawner.enemies.find((e) => e.alive), g.player.actor, { damage: 1e7, knockback: 0 });
  });
  await killPlayer();
  await B.advance(5);
  s = await B.state();
  check('jungle: an animal that dies here wakes at the Jungle\'s den, and keeps the biomes it rules',
    s.biome === 'jungle' && s.player.alive && Math.hypot(s.player.x - J.layout.playerSpawn.x, s.player.z - J.layout.playerSpawn.z) < 1 && s.ruled.includes('jungle') && s.gateOpen,
    `${s.biome} at ${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}`);
  check('pet: when the player dies, a healthy pet wakes beside it at the den, at full health', s.pet?.phase === 'healthy' && s.pet.dist < 4 && Math.abs(s.pet.hp - s.pet.maxHp) < 1, JSON.stringify(s.pet));
  // An injured pet stays injured through the player's death, its countdown still running.
  await page.evaluate(() => window.__beast.app.game.adminInjurePet());
  await B.advance(0.2);
  const left0 = (await B.state()).pet.injuredLeft;
  await killPlayer();
  await B.advance(5);
  s = await B.state();
  check('pet: an injured pet wakes at the den with the player, still injured, its countdown still running',
    s.player.alive && s.pet?.phase === 'injured' && s.pet.dist < 4 && s.pet.injuredLeft < left0 - 4, JSON.stringify(s.pet));

  // Night falls in the Jungle too.
  await B.call('setTimeOfDay', 0);
  await B.advance(0.2);
  await shot('26-jungle-night');
  await B.call('setTimeOfDay', 0.5);
  await B.advance(0.2);

  // Through a gate while the pet is injured: the gate warns, and going on leaves it behind (it dies).
  await B.teleport(J.layout.returnGate.x, J.layout.returnGate.z - 4, 0);
  await B.advance(0.2);
  s = await B.state();
  check('pet: at a gate with the pet injured, the prompt warns that it would be left behind', s.pet?.phase === 'injured' && s.prompt?.key === 'E' && /injured.*leave it behind/i.test(s.prompt.text), s.prompt?.text);
  await tap('KeyE');
  await B.advance(0.2);
  await page.waitForTimeout(100);
  s = await B.state();
  check('pet: going on through the gate leaves it behind: it dies, and the animal arrives alone',
    s.biome === 'forest' && s.pet === null && (await page.evaluate(() => window.__beast.app.game.growth.profile.pet)) === null, `${s.biome}, pet ${JSON.stringify(s.pet)}`);
  }
  await page.keyboard.press('Escape');
  await page.locator('.pause-card').waitFor();
  check('pausing a sandbox offers to leave it, not to save', (await page.getByRole('button', { name: /Leave the sandbox/ }).count()) === 1 && (await page.getByRole('button', { name: /Save and return to title/ }).count()) === 0);
  await page.getByRole('button', { name: /Leave the sandbox/ }).click();
  await page.locator('.title').waitFor();
  check('leaving the sandbox removes its badge', (await page.locator('.admin-badge').count()) === 0);
  const slotsAfter = await page.evaluate(() => [1, 2, 3, 4].map((n) => localStorage.getItem(`beastAscent.save.slot${n}`)));
  check('the sandbox wrote nothing to the four save slots', JSON.stringify(slotsAfter) === JSON.stringify(slotsBefore));

  // Continue Game with an injured pet: it lies beside the animal at the den, with a fresh 60 s. (Slot 4 is put back afterwards.)
  const slot4Before = await page.evaluate(() => {
    const keys = [1, 2, 3, 4].map((n) => `beastAscent.save.slot${n}`);
    const old = localStorage.getItem(keys[3]);
    const save = JSON.parse(keys.map((k) => localStorage.getItem(k)).find((v) => v));
    save.pet = { kind: 'liger', injured: true };
    save.biome = 'forest';
    localStorage.setItem(keys[3], JSON.stringify(save));
    return old;
  });
  await page.goto(url);
  await page.locator('.title').waitFor();
  await page.getByRole('button', { name: /Continue Game/ }).click();
  await page.locator('.slot-card').waitFor();
  const card4 = await page.locator('.save-slot[data-slot="4"]').innerText();
  check('the slot card says the animal has an injured pet', /with an injured liger cub/.test(card4), card4.replace(/\n/g, ' '));
  await page.locator('.save-slot[data-slot="4"]').click();
  await page.locator('.hud').waitFor();
  await B.call('setAutoStep', false);
  await B.call('setRender', false);
  await B.advance(0.2);
  const resumed = (await B.state()).pet;
  check('Continue Game with an injured pet: it lies beside the animal at the den, with a fresh 60 s',
    resumed?.kind === 'liger' && resumed.phase === 'injured' && resumed.dist < 4 && resumed.injuredLeft > 59, JSON.stringify(resumed));
  await page.evaluate((old) => {
    const key = 'beastAscent.save.slot4';
    if (old === null) localStorage.removeItem(key);
    else localStorage.setItem(key, old);
  }, slot4Before);
  await page.goto(url);
  await page.locator('.title').waitFor();

  // Storage that throws (private mode, blocked cookies) must not break the game.
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
    Storage.prototype.getItem = () => { throw new Error('storage blocked'); };
    Storage.prototype.removeItem = () => { throw new Error('storage blocked'); };
  });
  begin = await newGame('Wolf');
  await page.getByRole('button', { name: /Begin as/ }).click();
  await page.locator('.hud').waitFor();
  await page.evaluate(() => window.__beast.grantXp(50));
  check('game runs when localStorage throws', (await B.state()).player.level > 1 && (await page.evaluate(() => window.__beast.app.game.save())) === false);
  await page.keyboard.down('KeyW');
  await page.mouse.move(700, 380);
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  s = await B.state();
  check('real-time loop runs (no manual stepping)', s.time > 0.5 && s.player.z < 42, `t=${s.time.toFixed(2)}s z=${s.player.z.toFixed(1)}`);
  await shot('19-realtime');

  // ---------- Pointer lock: mouse look, pause when the lock is lost, menus release it ----------
  const isLocked = () => page.evaluate(() => document.pointerLockElement?.id === 'game');
  await page.mouse.click(640, 360);
  await page.waitForTimeout(300);
  if (await isLocked()) {
    const yaw0 = await page.evaluate(() => window.__beast.app.cam.yaw);
    await page.mouse.move(760, 360);
    await page.mouse.move(860, 380);
    await page.waitForTimeout(250);
    const yaw1 = await page.evaluate(() => window.__beast.app.cam.yaw);
    check('mouse orbits the camera while the pointer is locked', yaw1 < yaw0 - 0.1, `${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)}`);
    await page.evaluate(() => document.exitPointerLock()); // what the browser does on Esc
    await page.locator('.pause-card').waitFor();
    check('losing the pointer lock pauses the game', (await B.state()).screen === 'paused');
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(300);
    check('Resume re-locks the pointer', (await B.state()).screen === 'playing' && (await isLocked()));
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    check('Tab menu frees the pointer without pausing', (await B.state()).screen === 'growth' && !(await isLocked()));
    await page.keyboard.press('Tab');
  } else {
    console.log('SKIP  pointer lock checks (this browser refused the lock; the game stays playable with drag-to-orbit)');
  }
} catch (err) {
  problems.push(`test script crashed: ${err.stack ?? err}`);
  await page.screenshot({ path: path.join(shots, 'crash.png') }).catch(() => {});
}

check('no console errors, page errors or failed requests', problems.length === 0);
for (const p of problems) console.log(`  ! ${p}`);

await browser.close();
await server.close();
if (realPointerLock) releaseCursorClip();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
