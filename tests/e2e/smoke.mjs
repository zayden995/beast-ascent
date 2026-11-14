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
  if (kind !== 'boss') await B.teleport(target.x, target.z + 2.2);
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
  check('4 species are locked as "Coming soon"', locked.length === 4 && locked.every((t) => /Coming soon/.test(t)), locked.join(' | ').replace(/\n/g, ' '));
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
  await B.teleport(deer.x, deer.z + 8);
  await B.advance(1.5);
  s = await B.state();
  const deerNow = s.enemies.find((e) => e.id === deer.id);
  check('deer flees on sight', deerNow.state === 'flee' && deerNow.dist > 8, `${deerNow.state}, ${deerNow.dist.toFixed(1)} m`);

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
  await B.teleport(prey.x, prey.z + 5);
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
