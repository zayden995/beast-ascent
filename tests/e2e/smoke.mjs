// End-to-end check of Milestones 1 and 2: boots the real game in a headless browser, plays the core
// loop through real key/mouse events, and fails on any console error.
// The simulation is stepped through the debug hook so the run is deterministic and fast.
// Run with: npm run test:e2e
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

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
  // Where it stands is its home now: an animal beyond its leash would give up a chase at once.
  e.homeX = e.pos.x;
  e.homeZ = e.pos.z;
}, [id, yaw]);

async function newGame(speciesName, variantName) {
  await page.getByRole('button', { name: /New game/ }).click();
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

/** Hunt prey the way a player does: sprint at it and attack when in reach. */
async function hunt(kind, maxSeconds = 45) {
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
  check('no Continue without a save', (await page.getByRole('button', { name: /Continue/ }).count()) === 0);
  const herd = await B.call('titleAnimals');
  await B.call('advanceTitle', 30);
  const herdLater = await B.call('titleAnimals');
  const roamed = herd.filter((a, i) => Math.hypot(herdLater[i].x - a.x, herdLater[i].z - a.z) > 0.5).length;
  check('animals roam behind the title screen: prey and predators', herd.length >= 8 && herd.some((a) => a.predator) && herd.some((a) => !a.predator) && roamed >= herd.length - 2, `${herd.length} animals, ${roamed} moved in 30 s`);
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
  check('a wolf meets rival predators (a lion and a bear), never its own kind',
    kinds.filter((k) => k === 'rival_lion').length === 1 && kinds.filter((k) => k === 'rival_bear').length === 1 && !kinds.includes('rival_wolf'), kinds.filter((k) => k.startsWith('rival')).join(' '));
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

  // Wolf cannot eat berries.
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
  const prey = nearest(s, 'boar') ?? nearest(s);
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

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.v1')));
  await B.advance(1.5);
  const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.v1')));
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
  const savedDead = await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.v1')));
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
  check('gate offers the (stubbed) next biome', s.prompt?.key === 'E' && /Enter the Jungle/.test(s.prompt.text), s.prompt?.text);
  await tap('KeyE');
  await page.waitForTimeout(100);
  check('gate stub says the Jungle is not built yet', /Milestone 3/.test(await page.locator('.hud-toasts').innerText()));
  await shot('13-gate-open');

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
  const cont = page.getByRole('button', { name: /Continue/ });
  check('title offers Continue with the saved animal', /Adult Grey Wolf, level/.test(await cont.innerText()), (await cont.innerText()).replace(/\n/g, ' '));

  await page.reload();
  await page.locator('.title').waitFor();
  await page.getByRole('button', { name: /Continue/ }).click();
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
  const alphaSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.v1')));
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
  check('an Alpha that has died once is wounded', /Wounded/.test(await page.locator('.hud-status').textContent()) && (await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.v1')))).progress.wounded === true);

  await killPlayer();
  check('Alpha, second death: the death screen says the animal falls back to Adult', /Alpha to Adult/.test(await page.locator('.hud-death').innerText()));
  w = await wake();
  check('second death before a new level: falls back to Adult at level 8, growth meter empty, still wounded',
    w.stage === 'adult' && w.level === 8 && w.growth === 0 && w.abilityPoints === 7 && Math.abs(w.size - 1) < 1e-6 && (await page.evaluate(() => JSON.parse(localStorage.getItem('beastAscent.save.v1')))).progress.wounded === true,
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
  begin = await newGame('Lion');
  await begin();
  s = await B.state();
  check('lion: no Forest modifier, boss is back for a new game', s.player.mods.length === 0 && s.enemies.some((e) => e.boss) && !s.gateOpen);
  await settle();
  check('lion HUD shows "No modifier here"', /No modifier here/.test(await page.locator('.hud-biome').innerText()));
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
  check('a lion meets a pair of wolves and a bear, never another lion', lionRivals.sort().join() === 'rival_bear,rival_wolf,rival_wolf', lionRivals.join(' '));
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
  check('fish live in the pond', fish.length === 4);
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
  check('a bear meets a pair of wolves and a lion, never another bear', bearRivals.sort().join() === 'rival_lion,rival_wolf,rival_wolf', bearRivals.join(' '));
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

  const plants = s.food.filter((f) => f.kind === 'plant');
  const plantsAtDen = plants.filter((f) => Math.hypot(f.x, f.z - 52) < 12).length;
  check('the Forest has plants for herbivores, a few of them inside the den refuge', plants.length >= 28 && plantsAtDen >= 3, `${plants.length} plants, ${plantsAtDen} at the den`);
  const nearestPlant = plants.sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
  await B.teleport(nearestPlant.x, nearestPlant.z + 0.5);
  await B.advance(0.1);
  s = await B.state();
  check('an elephant can eat plants', s.prompt?.key === 'E' && /Eat plants/.test(s.prompt.text), s.prompt?.text);
  await tap('KeyE');
  s = await B.state();
  check('plants give growth, and grow back later', s.player.growth === 7 && s.food.filter((f) => f.kind === 'plant' && f.available).length === plants.length - 1, `growth ${s.player.growth}`);
  const fishAt = s.food.find((f) => f.kind === 'fish');
  await B.teleport(fishAt.x, fishAt.z);
  await B.advance(0.1);
  s = await B.state();
  check('a herbivore is told it cannot eat fish, with the right article', /^An elephant cannot eat fish/.test(s.prompt?.text ?? ''), s.prompt?.text);

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
  const elephantDeer = await hunt('deer', 90);
  check('juvenile elephant can run down and kill a fleeing deer', elephantDeer.killed && elephantDeer.fled, JSON.stringify(elephantDeer));

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
  await B.teleport(0, 40, Math.PI);
  await B.advance(25);
  const crocDeer = await hunt('deer', 90);
  check('juvenile crocodile can run down and kill a fleeing deer', crocDeer.killed && crocDeer.fled, JSON.stringify(crocDeer));

  // ---------- Eagle ----------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /return to title/ }).click();
  begin = await newGame('Eagle');
  await begin();
  await trackDamage();
  s = await B.state();
  check('eagle: a level 1 Juvenile on the ground with Dive Strike on key 1',
    s.player.stage === 'juvenile' && !s.player.flying && s.player.abilities[0] === 'eagle_dive_strike' && Math.abs(s.player.size - 0.6) < 1e-6, s.player.abilities.join());
  const eagleRivals = s.enemies.map((e) => e.kind).filter((k) => k.startsWith('rival'));
  check('an eagle meets all four rivals', eagleRivals.sort().join() === 'rival_bear,rival_lion,rival_wolf,rival_wolf', eagleRivals.join(' '));
  await shot('18g-eagle-perched');

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
  const eagleDeer = await hunt('deer', 60);
  check('juvenile eagle can run down and kill a fleeing deer on the ground', eagleDeer.killed && eagleDeer.fled, JSON.stringify(eagleDeer));

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
  await page.evaluate(() => localStorage.setItem('beastAscent.save.v1', '{"version":1,"speciesId":"dragon"'));
  await page.reload();
  await page.locator('.title').waitFor();
  check('corrupt save is ignored (no Continue, no crash)', (await page.getByRole('button', { name: /Continue/ }).count()) === 0);

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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
