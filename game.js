"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const ui = {
  score: document.querySelector("#score"), highScore: document.querySelector("#highScore"),
  stage: document.querySelector("#stage"), lives: document.querySelector("#lives"),
  power: document.querySelector("#powerPips"), start: document.querySelector("#startScreen"),
  gameOver: document.querySelector("#gameOverScreen"), finalScore: document.querySelector("#finalScore"),
  newRecord: document.querySelector("#newRecord"), pause: document.querySelector("#pauseLabel"),
  bossBar: document.querySelector("#bossBar"), bossHealth: document.querySelector("#bossHealth"),
};

const TAU = Math.PI * 2;
const keys = new Set();
let width = 0, height = 0, dpr = 1, lastTime = 0, state = "menu";
let score = 0, highScore = Number(localStorage.getItem("thunder-high-score") || 0);
let wave = 1, waveTimer = 0, spawnTimer = 0, shake = 0, flash = 0, touchActive = false;
let player = null;
let bullets = [];
let enemies = [];
let particles = [];
let pickups = [];
let stars = [];
let boss = null;

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  width = rect.width; height = rect.height;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (player) { player.x = Math.min(player.x, width - 30); player.y = Math.min(player.y, height - 40); }
  createStars();
}

function createStars() {
  stars = Array.from({ length: Math.floor(width * height / 6000) }, () => ({
    x: Math.random() * width, y: Math.random() * height, size: Math.random() * 1.8 + .3,
    speed: Math.random() * 70 + 25, alpha: Math.random() * .65 + .2,
  }));
}

function resetGame() {
  score = 0; wave = 1; waveTimer = 0; spawnTimer = .4; shake = 0; flash = 0; boss = null;
  bullets = []; enemies = []; particles = []; pickups = [];
  player = { x: width / 2, y: height - 100, r: 15, speed: 330, lives: 3, power: 1, cooldown: 0, invulnerable: 0 };
  state = "playing";
  ui.start.classList.remove("active"); ui.gameOver.classList.remove("active"); ui.pause.hidden = true;
  updateUI();
}

function updateUI() {
  ui.score.textContent = String(score).padStart(6, "0");
  ui.highScore.textContent = String(highScore).padStart(6, "0");
  ui.stage.textContent = boss ? `首领 · 第 ${wave} 波` : `第 ${wave} 波`;
  ui.lives.replaceChildren(...Array.from({ length: player?.lives || 0 }, () => {
    const icon = document.createElement("span"); icon.className = "life-icon"; return icon;
  }));
  ui.power.textContent = "◆".repeat(player?.power || 1) + "◇".repeat(4 - (player?.power || 1));
  ui.bossBar.hidden = !boss;
  if (boss) ui.bossHealth.style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
}

function shoot() {
  if (player.cooldown > 0) return;
  const spread = [-.18, -.09, 0, .09, .18].slice(2 - Math.floor(player.power / 2), 3 + Math.floor((player.power - 1) / 2));
  spread.forEach((angle) => bullets.push({ x: player.x, y: player.y - 22, vx: Math.sin(angle) * 230, vy: -560, r: 3, friendly: true, damage: 1 }));
  player.cooldown = Math.max(.085, .18 - player.power * .018);
  burst(player.x, player.y - 22, "#8ff8ff", 3, 70);
}

function spawnEnemy() {
  const roll = Math.random();
  const type = wave > 2 && roll > .77 ? "tank" : roll > .48 ? "zigzag" : "scout";
  const stats = type === "tank" ? [34, 5, 65, 320] : type === "zigzag" ? [19, 2, 105, 190] : [15, 1, 130, 120];
  enemies.push({ type, x: 28 + Math.random() * (width - 56), y: -40, r: stats[0], hp: stats[1], maxHp: stats[1], speed: stats[2], points: stats[3], age: 0, cooldown: Math.random() * 1.3 + .7, phase: Math.random() * TAU });
}

function spawnBoss() {
  const hp = 60 + wave * 12;
  boss = { type: "boss", x: width / 2, y: -90, r: 60, hp, maxHp: hp, speed: 52, points: 5000, age: 0, cooldown: 1 };
  enemies.push(boss); updateUI();
}

function enemyShoot(enemy) {
  const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const count = enemy.type === "boss" ? 7 : 1;
  for (let i = 0; i < count; i++) {
    const a = angle + (i - (count - 1) / 2) * (enemy.type === "boss" ? .22 : 0);
    bullets.push({ x: enemy.x, y: enemy.y + enemy.r * .5, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, r: enemy.type === "boss" ? 5 : 4, friendly: false });
  }
}

function burst(x, y, color, count = 12, speed = 150) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU, velocity = Math.random() * speed;
    particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: Math.random() * .55 + .25, maxLife: .8, size: Math.random() * 4 + 1, color });
  }
}

function hitPlayer() {
  if (player.invulnerable > 0) return;
  player.lives--; player.invulnerable = 2; shake = 13; flash = .15;
  burst(player.x, player.y, "#5beaff", 28, 260); updateUI();
  if (player.lives <= 0) endGame();
}

function destroyEnemy(enemy) {
  score += enemy.points; shake = enemy.type === "boss" ? 18 : 4;
  burst(enemy.x, enemy.y, enemy.type === "boss" ? "#ff547f" : "#ffb54c", enemy.type === "boss" ? 70 : 18, enemy.type === "boss" ? 330 : 190);
  if (enemy.type === "boss") { boss = null; wave++; waveTimer = 0; }
  else if (Math.random() < .12) pickups.push({ x: enemy.x, y: enemy.y, r: 10, vy: 85, spin: 0 });
  updateUI();
}

function endGame() {
  state = "gameover";
  const isRecord = score > highScore;
  if (isRecord) { highScore = score; localStorage.setItem("thunder-high-score", String(score)); }
  ui.finalScore.textContent = String(score).padStart(6, "0"); ui.newRecord.hidden = !isRecord;
  ui.gameOver.classList.add("active"); updateUI();
}

function update(dt) {
  stars.forEach((star) => { star.y += star.speed * dt * (state === "playing" ? 1 : .25); if (star.y > height) { star.y = -2; star.x = Math.random() * width; } });
  if (state !== "playing") return;
  waveTimer += dt; spawnTimer -= dt; player.cooldown -= dt; player.invulnerable -= dt; shake *= .88; flash -= dt;

  let dx = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  let dy = (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);
  if (dx && dy) { dx *= .707; dy *= .707; }
  player.x = Math.max(22, Math.min(width - 22, player.x + dx * player.speed * dt));
  player.y = Math.max(80, Math.min(height - 35, player.y + dy * player.speed * dt));
  if (keys.has("Space") || touchActive) shoot();

  const bossWave = wave % 4 === 0;
  if (bossWave && !boss && enemies.length === 0 && waveTimer > 1.5) spawnBoss();
  if (!bossWave && spawnTimer <= 0) {
    spawnEnemy(); spawnTimer = Math.max(.28, 1.02 - wave * .055) * (Math.random() * .5 + .75);
  }
  if (!bossWave && waveTimer > 16) { wave++; waveTimer = 0; }

  bullets.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
  particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt; });
  pickups.forEach((p) => { p.y += p.vy * dt; p.spin += dt * 4; });

  enemies.forEach((enemy) => {
    enemy.age += dt; enemy.cooldown -= dt;
    if (enemy.type === "boss") {
      if (enemy.y < 115) enemy.y += enemy.speed * dt; else enemy.x = width / 2 + Math.sin(enemy.age * .8) * width * .3;
      if (enemy.cooldown <= 0) { enemyShoot(enemy); enemy.cooldown = Math.max(.45, 1.15 - wave * .035); }
    } else {
      enemy.y += enemy.speed * dt;
      if (enemy.type === "zigzag") enemy.x += Math.sin(enemy.age * 4 + enemy.phase) * 105 * dt;
      if (enemy.type === "tank" && enemy.cooldown <= 0 && enemy.y < height * .7) { enemyShoot(enemy); enemy.cooldown = 1.5; }
    }
  });

  for (const bullet of bullets) {
    if (bullet.friendly) {
      for (const enemy of enemies) {
        if (enemy.hp > 0 && distance(bullet, enemy) < bullet.r + enemy.r) { bullet.dead = true; enemy.hp -= bullet.damage; burst(bullet.x, bullet.y, "#d9ffff", 3, 50); if (enemy.hp <= 0) destroyEnemy(enemy); break; }
      }
    } else if (distance(bullet, player) < bullet.r + player.r) { bullet.dead = true; hitPlayer(); }
  }
  for (const enemy of enemies) if (enemy.hp > 0 && distance(enemy, player) < enemy.r + player.r) { enemy.hp = 0; destroyEnemy(enemy); hitPlayer(); }
  for (const pickup of pickups) if (distance(pickup, player) < pickup.r + player.r) { pickup.dead = true; player.power = Math.min(4, player.power + 1); score += 250; burst(pickup.x, pickup.y, "#ffe85f", 18, 150); updateUI(); }

  bullets = bullets.filter((b) => !b.dead && b.y > -30 && b.y < height + 30 && b.x > -30 && b.x < width + 30);
  enemies = enemies.filter((e) => e.hp > 0 && e.y < height + 100 && e.x > -120 && e.x < width + 120);
  particles = particles.filter((p) => p.life > 0); pickups = pickups.filter((p) => !p.dead && p.y < height + 30);
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function polygon(points, fill, stroke) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function drawPlayer() {
  if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2) return;
  ctx.save(); ctx.translate(player.x, player.y);
  const flame = 17 + Math.random() * 12;
  ctx.shadowBlur = 18; ctx.shadowColor = "#00cfff";
  polygon([[-6, 14], [0, flame + 13], [6, 14]], "#7ffaff");
  polygon([[-23, 15], [-9, -3], [-5, -22], [0, -31], [5, -22], [9, -3], [23, 15], [7, 9], [0, 22], [-7, 9]], "#d7f8ff", "#43dfff");
  polygon([[-15, 11], [-8, -4], [-6, 10]], "#2673cc"); polygon([[15, 11], [8, -4], [6, 10]], "#2673cc");
  polygon([[-5, -17], [0, -26], [5, -17], [4, 3], [-4, 3]], "#167fbb");
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.shadowBlur = 15; ctx.shadowColor = enemy.type === "boss" ? "#ff315f" : "#ff8b3d";
  if (enemy.type === "boss") {
    ctx.rotate(Math.sin(enemy.age) * .035);
    polygon([[-64,-18],[-38,-38],[-17,-31],[0,-51],[17,-31],[38,-38],[64,-18],[48,19],[22,31],[0,22],[-22,31],[-48,19]], "#601633", "#ff5d7e");
    polygon([[-25,-15],[0,-31],[25,-15],[17,13],[0,21],[-17,13]], "#1b2448", "#ff9bb0");
    ctx.fillStyle = "#fff"; ctx.fillRect(-4, -16, 8, 17);
  } else if (enemy.type === "tank") {
    polygon([[-29,-25],[20,-25],[31,-5],[25,27],[0,20],[-25,27],[-34,-4]], "#6a2931", "#ff9c53");
    polygon([[-12,-16],[13,-16],[18,11],[0,19],[-18,11]], "#222a49", "#ffcb64");
  } else {
    polygon([[0,24],[-18,-9],[-10,-22],[0,-14],[10,-22],[18,-9]], enemy.type === "zigzag" ? "#6e245e" : "#71342a", "#ff9b55");
    ctx.fillStyle = "#ffed83"; ctx.fillRect(-3, -11, 6, 13);
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  const sx = shake ? (Math.random() - .5) * shake : 0, sy = shake ? (Math.random() - .5) * shake : 0;
  ctx.save(); ctx.translate(sx, sy);
  const bg = ctx.createLinearGradient(0, 0, 0, height); bg.addColorStop(0, "#07132c"); bg.addColorStop(.55, "#091634"); bg.addColorStop(1, "#020711"); ctx.fillStyle = bg; ctx.fillRect(-20, -20, width + 40, height + 40);
  ctx.strokeStyle = "#2a67aa18"; ctx.lineWidth = 1;
  const gridOffset = (performance.now() * .05) % 44;
  for (let y = gridOffset - 44; y < height; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  stars.forEach((s) => { ctx.globalAlpha = s.alpha; ctx.fillStyle = "#b7e9ff"; ctx.fillRect(s.x, s.y, s.size, s.size * 2.4); }); ctx.globalAlpha = 1;
  particles.forEach((p) => { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.shadowBlur = 8; ctx.shadowColor = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  pickups.forEach((p) => { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.shadowBlur = 16; ctx.shadowColor = "#ffdb31"; polygon([[0,-12],[10,0],[0,12],[-10,0]], "#ffe55c", "#fff5af"); ctx.restore(); });
  bullets.forEach((b) => { ctx.fillStyle = b.friendly ? "#8ef9ff" : "#ff4d79"; ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.friendly ? b.r * 2.5 : b.r, 0, 0, TAU); ctx.fill(); }); ctx.shadowBlur = 0;
  enemies.forEach(drawEnemy); if (player && state !== "menu") drawPlayer();
  ctx.restore();
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 2})`; ctx.fillRect(0, 0, width, height); }
}

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, .033); lastTime = time;
  update(dt); draw(); requestAnimationFrame(loop);
}

function togglePause() {
  if (state === "playing") { state = "paused"; ui.pause.hidden = false; }
  else if (state === "paused") { state = "playing"; ui.pause.hidden = true; lastTime = performance.now(); }
}

function pointerMove(event) {
  if (!touchActive || state !== "playing") return;
  const rect = canvas.getBoundingClientRect(); player.x = Math.max(22, Math.min(width - 22, event.clientX - rect.left)); player.y = Math.max(80, Math.min(height - 35, event.clientY - rect.top - 34));
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => { if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(event.code)) event.preventDefault(); keys.add(event.code); if (event.code === "KeyP" || event.code === "Escape") togglePause(); });
window.addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("pointerdown", (event) => { touchActive = true; canvas.setPointerCapture(event.pointerId); pointerMove(event); });
canvas.addEventListener("pointermove", pointerMove);
canvas.addEventListener("pointerup", () => touchActive = false); canvas.addEventListener("pointercancel", () => touchActive = false);
document.querySelector("#startButton").addEventListener("click", resetGame);
document.querySelector("#restartButton").addEventListener("click", resetGame);

ui.highScore.textContent = String(highScore).padStart(6, "0"); resize(); requestAnimationFrame(loop);
