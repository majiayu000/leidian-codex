const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
const storageKey = "thunder-high-score";

// Run the complete game script with synthetic DOM, animation and storage only.
// No browser profile or real localStorage is accessed.
function createGame(options = {}) {
  const elements = new Map();
  const frames = [];
  const writes = [];
  let saved = options.saved ?? null;
  const context2d = new Proxy({}, {
    get(target, name) {
      if (name === "createLinearGradient") return () => ({ addColorStop() {} });
      return target[name] ?? (() => {});
    },
  });
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set(id === "#startScreen" ? ["active"] : []);
      const listeners = new Map();
      elements.set(id, {
        textContent: "", hidden: false, style: {},
        classList: {
          add(name) { classes.add(name); },
          remove(name) { classes.delete(name); },
          contains(name) { return classes.has(name); },
        },
        replaceChildren() {},
        addEventListener(name, listener) { listeners.set(name, listener); },
        click() {
          assert.ok(listeners.has("click"), `${id} has a click handler`);
          listeners.get("click")();
        },
        getContext() { return context2d; },
        getBoundingClientRect() { return { width: 480, height: 720, left: 0, top: 0 }; },
      });
    }
    return elements.get(id);
  }
  const storage = {
    getItem(key) {
      assert.equal(key, storageKey);
      if (options.readThrows) throw new Error("synthetic storage read failure");
      return saved;
    },
    setItem(key, value) {
      assert.equal(key, storageKey);
      if (options.writeThrows) throw new Error("synthetic storage write failure");
      saved = value;
      writes.push(value);
    },
  };
  const sandbox = {
    document: { querySelector: element, createElement: () => ({}) },
    window: { addEventListener() {} },
    devicePixelRatio: 1,
    performance: { now: () => 0 },
    requestAnimationFrame(callback) { frames.push(callback); },
  };
  if (!options.missingStorage) {
    Object.defineProperty(sandbox, "localStorage", {
      get() {
        if (options.accessThrows) throw new Error("synthetic storage access failure");
        return storage;
      },
    });
  }
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { filename: "game.js", timeout: 1000 });
  function evaluate(code) { return vm.runInContext(code, context, { timeout: 1000 }); }
  return {
    element, writes, options,
    value() { return saved; },
    frame(time = 16) {
      assert.equal(frames.length, 1, "the animation loop remains scheduled");
      frames.shift()(time);
      assert.equal(frames.length, 1, "the next animation frame is scheduled");
    },
    start() { element("#startButton").click(); },
    restart() { element("#restartButton").click(); },
    earn(points) {
      assert.ok(Number.isSafeInteger(points) && points >= 0);
      evaluate(`destroyEnemy({ type: "scout", x: 50, y: 50, points: ${points} });`);
      assert.equal(element("#score").textContent, String(points).padStart(6, "0"));
    },
    finish() {
      // A lethal bullet goes through the real update -> hitPlayer -> endGame path.
      // No later score changes occur, keeping same-frame collision scoring separate.
      evaluate("player.lives = 1; player.invulnerable = 0; enemies = []; pickups = []; bullets = [{ x: player.x, y: player.y, vx: 0, vy: 0, r: 4, friendly: false }];");
      this.frame();
      assert.equal(element("#gameOverScreen").classList.contains("active"), true);
    },
  };
}

function completeAndRestart(game, highScore = 120) {
  game.start();
  game.earn(120);
  assert.deepEqual(game.writes, [], "scores are not persisted during a round");
  game.finish();
  assert.equal(game.element("#finalScore").textContent, "000120");
  assert.equal(game.element("#highScore").textContent, String(highScore).padStart(6, "0"));
  game.restart();
  assert.equal(game.element("#score").textContent, "000000");
  assert.equal(game.element("#gameOverScreen").classList.contains("active"), false);
  assert.equal(game.element("#highScore").textContent, String(highScore).padStart(6, "0"));
  game.frame(32);
  game.earn(120);
}

for (const [name, options] of [
  ["missing storage", { missingStorage: true }],
  ["storage getter failure", { accessThrows: true }],
  ["read failure", { readThrows: true }],
  ["write failure", { writeThrows: true }],
  ["read and write failures", { readThrows: true, writeThrows: true }],
]) {
  test(`${name} does not block startup, scoring, game over or restart`, () => {
    const game = createGame(options);
    assert.equal(game.element("#highScore").textContent, "000000");
    completeAndRestart(game);
  });
}

for (const saved of [null, "", "0", "not-a-score", "NaN", "Infinity", "-Infinity", "-120", "120.5", "9007199254740992"]) {
  test(`stored value ${JSON.stringify(saved)} falls back to a usable zero`, () => {
    const game = createGame({ saved });
    assert.equal(game.element("#highScore").textContent, "000000");
    completeAndRestart(game);
    assert.equal(game.value(), "120");
  });
}

test("a valid existing high score is loaded and lower/equal rounds do not overwrite it", () => {
  const game = createGame({ saved: "120" });
  assert.equal(game.element("#highScore").textContent, "000120");
  game.start();
  game.earn(50);
  game.finish();
  assert.equal(game.element("#newRecord").hidden, true);
  game.restart();
  game.earn(120);
  game.finish();
  assert.equal(game.element("#newRecord").hidden, true);
  assert.deepEqual(game.writes, []);
  assert.equal(game.value(), "120");
});

test("a new record persists at game over and loads in a fresh instance", () => {
  const game = createGame({ saved: "50" });
  completeAndRestart(game);
  assert.deepEqual(game.writes, ["120"]);
  const reloaded = createGame({ saved: game.value() });
  assert.equal(reloaded.element("#highScore").textContent, "000120");
});

test("a failed write keeps the session best across rounds and later records can save", () => {
  const options = { saved: "50", writeThrows: true };
  const game = createGame(options);
  game.start();
  game.earn(320);
  game.finish();
  assert.equal(game.element("#highScore").textContent, "000320");
  assert.equal(game.element("#newRecord").hidden, false);
  assert.equal(game.value(), "50");
  game.restart();
  game.earn(120);
  game.finish();
  assert.equal(game.element("#highScore").textContent, "000320");
  assert.equal(game.element("#newRecord").hidden, true);
  options.writeThrows = false;
  game.restart();
  game.earn(500);
  game.finish();
  assert.equal(game.element("#highScore").textContent, "000500");
  assert.equal(game.value(), "500");
  assert.deepEqual(game.writes, ["500"]);
});
