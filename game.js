/*
 * Bot Arena - top-down team shooter vs bots.
 * Plain JavaScript + <canvas>, no dependencies. See README.md for controls and tweaking.
 */
(() => {
  'use strict';

  /* =====================================================================
   *  Settings (tweak these!)
   * ===================================================================== */
  const CELL = 32;                 // world size of one map tile
  const VW = 1280, VH = 768;       // canvas resolution
  const WIN_SCORE = 3;             // first team to this many round wins takes the match
  const COUNTDOWN = 3;             // seconds before every round
  const ROUND_END_DELAY = 2.4;     // pause after a round ends
  const ROUND_LIMIT = 75;          // seconds; on timeout the team with more players alive wins
  const RADIUS = 12;               // player / bot body radius
  const PLAYER_SPEED = 170;
  const TEAM_COLORS = ['#3b82f6', '#ef4444'];   // 0 = you (blue), 1 = enemy (red)

  const WEAPON = {
    playerRate: 0.12,              // seconds between player shots
    botRate: 0.15,                 // seconds between bot shots inside a burst
    speed: 880,                    // bullet speed
    dmg: 20,                       // 5 hits to kill (100 hp)
    life: 1.4,                     // bullet lifetime in seconds
    playerSpread: 0.03,            // radians
  };

  const DIFFICULTY = {
    easy:   { speed: 125, spread: 0.17,  react: 0.70, turn: 4.5, lead: 0.0,  pause: [0.7, 1.4] },
    normal: { speed: 148, spread: 0.095, react: 0.38, turn: 7.5, lead: 0.35, pause: [0.4, 0.9] },
    hard:   { speed: 165, spread: 0.05,  react: 0.20, turn: 11,  lead: 0.75, pause: [0.2, 0.5] },
  };

  const SOLID_CHARS = new Set(['#', 'x', 'v']);
  const MAPS = window.BOT_MAPS;

  /* =====================================================================
   *  DOM
   * ===================================================================== */
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const menu = $('menu');
  const screenMain = $('screen-main');
  const screenMaps = $('screen-maps');
  const mapList = $('map-list');
  const mapsTitle = $('maps-title');
  const resultEl = $('result');

  /* =====================================================================
   *  State
   * ===================================================================== */
  let difficulty = 'normal';
  let state = 'menu';              // menu | countdown | playing | roundEnd | paused
  let pausedFrom = null;
  let g = null;                    // the current match
  let muted = false;

  const keys = { up: false, down: false, left: false, right: false };
  const mouse = { x: VW / 2, y: VH / 2, down: false };   // canvas-space coordinates

  /* =====================================================================
   *  Small helpers
   * ===================================================================== */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function angDiff(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* =====================================================================
   *  Sound (tiny WebAudio beeps, no files needed)
   * ===================================================================== */
  let actx = null;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    try {
      const o = a.createOscillator();
      const gn = a.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
      gn.gain.setValueAtTime(vol, a.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(gn);
      gn.connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur);
    } catch (e) { /* ignore audio errors */ }
  }

  const sfx = {
    shot: (vol) => tone(520, 0.06, 'square', vol, 140),
    hit: () => tone(180, 0.07, 'sawtooth', 0.05, 90),
    kill: () => tone(300, 0.22, 'triangle', 0.08, 70),
    beep: () => tone(660, 0.12, 'sine', 0.09),
    go: () => tone(990, 0.35, 'sine', 0.1),
    win: () => { tone(523, 0.18, 'triangle', 0.1); setTimeout(() => tone(784, 0.3, 'triangle', 0.1), 160); },
    lose: () => { tone(300, 0.25, 'triangle', 0.1, 200); setTimeout(() => tone(200, 0.4, 'triangle', 0.1, 120), 220); },
  };

  /* =====================================================================
   *  Map drawing (used for the in-game map and for the menu previews)
   * ===================================================================== */
  function drawMap(c, map, cell) {
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const ch = map.grid[y][x];
        const px = x * cell, py = y * cell;
        const checker = (x + y) & 1;

        if (ch === '#') {
          c.fillStyle = '#464d5e';
          c.fillRect(px, py, cell, cell);
          c.fillStyle = '#5f687d';
          c.fillRect(px + 1, py + 1, cell - 2, cell - 2);
          c.fillStyle = '#6f7a91';
          c.fillRect(px + 1, py + 1, cell - 2, Math.max(1, cell * 0.12));
        } else if (ch === 'x') {
          c.fillStyle = '#262c38';
          c.fillRect(px, py, cell, cell);
          const m = cell * 0.1;
          c.fillStyle = '#7a5228';
          c.fillRect(px + m, py + m, cell - m * 2, cell - m * 2);
          c.fillStyle = '#b07d44';
          c.fillRect(px + m * 2, py + m * 2, cell - m * 4, cell - m * 4);
          c.strokeStyle = '#7a5228';
          c.lineWidth = Math.max(1, cell * 0.06);
          c.beginPath();
          c.moveTo(px + m * 2, py + m * 2); c.lineTo(px + cell - m * 2, py + cell - m * 2);
          c.moveTo(px + cell - m * 2, py + m * 2); c.lineTo(px + m * 2, py + cell - m * 2);
          c.stroke();
        } else if (ch === 'v') {
          c.fillStyle = '#262c38';
          c.fillRect(px, py, cell, cell);
          c.fillStyle = '#35513f';
          c.fillRect(px, py, cell, cell);
          c.fillStyle = '#4a7459';
          c.fillRect(px + 1, py + 1, cell - 2, cell - 2);
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fillRect(px + 1, py + 1, cell - 2, Math.max(1, cell * 0.2));
        } else if (ch === ',') {
          c.fillStyle = checker ? '#39463a' : '#3c4a3d';
          c.fillRect(px, py, cell, cell);
        } else {
          c.fillStyle = checker ? '#2b3240' : '#2e3544';
          c.fillRect(px, py, cell, cell);
        }
      }
    }
  }

  function makeMapCanvas(map, cell) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(map.w * cell);
    cv.height = Math.ceil(map.h * cell);
    drawMap(cv.getContext('2d'), map, cell);
    return cv;
  }

  /* =====================================================================
   *  Match / round flow
   * ===================================================================== */
  function startMatch(mode, map) {
    audio();   // unlock sound on first user click

    const fit = Math.min(VW / (map.w * CELL), VH / (map.h * CELL)) * 0.92;
    const s = Math.min(fit, 1.5);
    const solid = new Uint8Array(map.w * map.h);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (SOLID_CHARS.has(map.grid[y][x])) solid[y * map.w + x] = 1;
      }
    }

    g = {
      mode,
      map,
      w: map.w,
      h: map.h,
      size: map.size,
      solid,
      s,
      ox: (VW - map.w * CELL * s) / 2,
      oy: (VH - map.h * CELL * s) / 2 + 8,
      mapCanvas: makeMapCanvas(map, CELL * s),
      diff: DIFFICULTY[difficulty],
      scores: [0, 0],
      round: 0,
      ents: [],
      bullets: [],
      sparks: [],
      feed: [],
      cd: 0,
      lastCd: 99,
      roundT: 0,
      endT: 0,
      fight: 0,
      banner: '',
      bannerSub: '',
      bannerColor: '#fff',
      time: 0,
    };

    menu.classList.add('hidden');
    startRound();
  }

  function startRound() {
    g.round++;
    g.bullets = [];
    g.sparks = [];
    g.feed = [];
    g.ents = [];
    g.roundT = 0;
    g.fight = 0;
    g.banner = '';

    for (let team = 0; team < 2; team++) {
      const spawns = team === 0 ? g.map.spawnsA : g.map.spawnsB;
      for (let i = 0; i < g.size; i++) {
        const sx = (spawns[i][0] + 0.5) * CELL;
        const sy = (spawns[i][1] + 0.5) * CELL;
        g.ents.push({
          team,
          idx: i,
          x: sx, y: sy, vx: 0, vy: 0,
          r: RADIUS,
          hp: 100,
          alive: true,
          angle: team === 0 ? 0 : Math.PI,
          isPlayer: team === 0 && i === 0,
          name: team === 0 ? (i === 0 ? 'You' : 'Ally ' + i) : (g.size === 1 ? 'Bot' : 'Enemy ' + (i + 1)),
          cd: rand(0.3, 0.7),
          flash: 0,
          hurt: 0,
          kills: 0,
          // bot brain
          burstLeft: 3,
          strafeDir: Math.random() < 0.5 ? -1 : 1,
          strafeT: rand(0.2, 1),
          seeT: 0,
          target: null,
          lastSeen: null,
          path: null,
          pathT: rand(0, 0.3),
          jitter: { x: rand(-200, 200), y: rand(-200, 200) },
          stuckT: 0, lx: sx, ly: sy,
          unstuck: 0, unDir: 0,
        });
      }
    }

    state = 'countdown';
    g.cd = COUNTDOWN;
    g.lastCd = 99;
  }

  function aliveCount(team) {
    let n = 0;
    for (const e of g.ents) if (e.team === team && e.alive) n++;
    return n;
  }

  function teamHp(team) {
    let n = 0;
    for (const e of g.ents) if (e.team === team && e.alive) n += e.hp;
    return n;
  }

  function checkRoundEnd() {
    const a = aliveCount(0), b = aliveCount(1);
    const timeout = g.roundT >= ROUND_LIMIT;
    if (a > 0 && b > 0 && !timeout) return;

    let winner = -1;
    let sub = '';
    if (a === 0 && b === 0) {
      winner = -1;
    } else if (b === 0) {
      winner = 0;
    } else if (a === 0) {
      winner = 1;
    } else {
      sub = 'Time ran out';
      if (a !== b) winner = a > b ? 0 : 1;
      else if (teamHp(0) !== teamHp(1)) winner = teamHp(0) > teamHp(1) ? 0 : 1;
    }

    if (winner >= 0) g.scores[winner]++;
    if (winner === 0) { g.banner = 'ROUND WON'; g.bannerColor = '#4ade80'; sfx.win(); }
    else if (winner === 1) { g.banner = 'ROUND LOST'; g.bannerColor = '#f87171'; sfx.lose(); }
    else { g.banner = 'ROUND DRAW'; g.bannerColor = '#e5e7eb'; sub = sub || 'Nobody scores'; }
    g.bannerSub = sub;

    state = 'roundEnd';
    g.endT = ROUND_END_DELAY;
  }

  function endMatch() {
    const win = g.scores[0] >= WIN_SCORE;
    const scores = g.scores.slice();
    g = null;
    state = 'menu';
    showMenu({ win, scores });
  }

  function quitToMenu() {
    g = null;
    state = 'menu';
    pausedFrom = null;
    showMenu(null);
  }

  /* =====================================================================
   *  Collision / line of sight / pathfinding
   * ===================================================================== */
  function solidCell(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return true;
    return g.solid[cy * g.w + cx] === 1;
  }

  function solidAt(px, py) {
    return solidCell(Math.floor(px / CELL), Math.floor(py / CELL));
  }

  function blocked(x, y, r) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!solidCell(cx, cy)) continue;
        const nx = clamp(x, cx * CELL, cx * CELL + CELL);
        const ny = clamp(y, cy * CELL, cy * CELL + CELL);
        const dx = x - nx, dy = y - ny;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  function moveEnt(e, dx, dy) {
    if (dx) {
      const nx = e.x + dx;
      if (!blocked(nx, e.y, e.r)) e.x = nx;
    }
    if (dy) {
      const ny = e.y + dy;
      if (!blocked(e.x, ny, e.r)) e.y = ny;
    }
  }

  function los(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const steps = Math.ceil(Math.hypot(dx, dy) / 8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (solidAt(x1 + dx * t, y1 + dy * t)) return false;
    }
    return true;
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // breadth-first search on the tile grid (8 directions, no corner cutting)
  function findPath(x0, y0, x1, y1) {
    const w = g.w, h = g.h;
    const sx = clamp(Math.floor(x0 / CELL), 0, w - 1), sy = clamp(Math.floor(y0 / CELL), 0, h - 1);
    const gx = clamp(Math.floor(x1 / CELL), 0, w - 1), gy = clamp(Math.floor(y1 / CELL), 0, h - 1);
    const start = sy * w + sx, goal = gy * w + gx;
    if (g.solid[goal]) return null;

    const prev = new Int16Array(w * h).fill(-2);
    const queue = new Int16Array(w * h);
    let head = 0, tail = 0;
    prev[start] = -1;
    queue[tail++] = start;

    while (head < tail) {
      const cur = queue[head++];
      if (cur === goal) break;
      const cx = cur % w, cy = (cur / w) | 0;
      for (let i = 0; i < 8; i++) {
        const dx = DIRS[i][0], dy = DIRS[i][1];
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const idx = ny * w + nx;
        if (prev[idx] !== -2 || g.solid[idx]) continue;
        if (dx && dy && (g.solid[cy * w + nx] || g.solid[ny * w + cx])) continue;
        prev[idx] = cur;
        queue[tail++] = idx;
      }
    }
    if (prev[goal] === -2) return null;

    const path = [];
    for (let c = goal; c !== -1; c = prev[c]) path.push([c % w, (c / w) | 0]);
    path.reverse();
    return path;
  }

  /* =====================================================================
   *  Combat
   * ===================================================================== */
  function shoot(e, spread, vol) {
    const a = e.angle + (Math.random() * 2 - 1) * spread;
    g.bullets.push({
      x: e.x + Math.cos(a) * (e.r + 4),
      y: e.y + Math.sin(a) * (e.r + 4),
      vx: Math.cos(a) * WEAPON.speed,
      vy: Math.sin(a) * WEAPON.speed,
      team: e.team,
      owner: e,
      life: WEAPON.life,
    });
    e.flash = 0.06;
    sfx.shot(vol);
  }

  function addSparks(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(40, 200);
      g.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.15, 0.4), max: 0.4, color });
    }
  }

  function hitEnt(e, b) {
    e.hp -= WEAPON.dmg;
    e.hurt = 0.14;
    addSparks(b.x, b.y, 5, '#ff6b6b');
    if (e.hp <= 0) {
      e.hp = 0;
      e.alive = false;
      b.owner.kills++;
      g.feed.push({ text: b.owner.name + '  ▸  ' + e.name, team: b.owner.team, t: 4.5 });
      if (g.feed.length > 5) g.feed.shift();
      addSparks(e.x, e.y, 18, TEAM_COLORS[e.team]);
      sfx.kill();
    } else if (e.isPlayer) {
      sfx.hit();
    }
  }

  function updateBullets(dt) {
    for (const b of g.bullets) {
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      const steps = Math.max(1, Math.ceil((WEAPON.speed * dt) / 6));
      const sdt = dt / steps;
      for (let i = 0; i < steps && !b.dead; i++) {
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        if (solidAt(b.x, b.y)) {
          b.dead = true;
          addSparks(b.x - b.vx * sdt, b.y - b.vy * sdt, 3, '#ffd89b');
          break;
        }
        for (const e of g.ents) {
          if (!e.alive || e.team === b.team) continue;
          const dx = e.x - b.x, dy = e.y - b.y;
          const rr = e.r + 2;
          if (dx * dx + dy * dy <= rr * rr) { hitEnt(e, b); b.dead = true; break; }
        }
      }
    }
    g.bullets = g.bullets.filter((b) => !b.dead);
  }

  function updateFx(dt) {
    for (const s of g.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    g.sparks = g.sparks.filter((s) => s.life > 0);
    for (const f of g.feed) f.t -= dt;
    g.feed = g.feed.filter((f) => f.t > 0);
    for (const e of g.ents) {
      if (e.flash > 0) e.flash -= dt;
      if (e.hurt > 0) e.hurt -= dt;
    }
    if (g.fight > 0) g.fight -= dt;
  }

  /* =====================================================================
   *  Player + bot behaviour
   * ===================================================================== */
  function mouseWorld() {
    return { x: (mouse.x - g.ox) / g.s, y: (mouse.y - g.oy) / g.s };
  }

  function aimPlayer(p) {
    const m = mouseWorld();
    p.angle = Math.atan2(m.y - p.y, m.x - p.x);
  }

  function updatePlayer(p, dt) {
    aimPlayer(p);
    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    moveEnt(p, dx * PLAYER_SPEED * dt, dy * PLAYER_SPEED * dt);

    p.cd -= dt;
    if (mouse.down && p.cd <= 0) {
      shoot(p, WEAPON.playerSpread, 0.05);
      p.cd = WEAPON.playerRate;
    }
  }

  function updateBot(e, dt) {
    const D = g.diff;
    e.cd -= dt;

    // 1. look for the closest enemy we can see
    let vis = null, vd = Infinity;
    for (const o of g.ents) {
      if (!o.alive || o.team === e.team) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < vd && d < 760 && los(e.x, e.y, o.x, o.y)) { vis = o; vd = d; }
    }

    let mx = 0, my = 0;

    if (vis) {
      // 2a. engage: aim, strafe, keep a sensible distance, fire in bursts
      if (e.target !== vis) { e.target = vis; e.seeT = 0; }
      e.seeT += dt;
      e.lastSeen = { x: vis.x, y: vis.y, t: g.roundT };

      const direct = Math.atan2(vis.y - e.y, vis.x - e.x);
      const lead = (vd / WEAPON.speed) * D.lead;
      const aim = Math.atan2(vis.y + vis.vy * lead - e.y, vis.x + vis.vx * lead - e.x);
      const maxTurn = D.turn * dt;
      e.angle += clamp(angDiff(e.angle, aim), -maxTurn, maxTurn);

      e.strafeT -= dt;
      if (e.strafeT <= 0) {
        e.strafeDir = Math.random() < 0.18 ? 0 : (Math.random() < 0.5 ? -1 : 1);
        e.strafeT = rand(0.5, 1.5);
      }
      const approach = vd > 360 ? 1 : (vd < 160 ? -1 : 0);
      mx = Math.cos(direct) * approach + Math.cos(direct + Math.PI / 2) * e.strafeDir * 0.9;
      my = Math.sin(direct) * approach + Math.sin(direct + Math.PI / 2) * e.strafeDir * 0.9;

      if (e.seeT >= D.react && e.cd <= 0 && Math.abs(angDiff(e.angle, aim)) < 0.16) {
        const pl = g.ents[0];
        const near = pl && pl.alive ? Math.hypot(pl.x - e.x, pl.y - e.y) < 520 : false;
        shoot(e, D.spread, near ? 0.025 : 0.0);
        e.burstLeft--;
        if (e.burstLeft <= 0) {
          e.burstLeft = 3 + ((Math.random() * 4) | 0);
          e.cd = rand(D.pause[0], D.pause[1]);
        } else {
          e.cd = WEAPON.botRate;
        }
      }
    } else {
      // 2b. hunt: walk the shortest path toward an enemy (or where one was last seen)
      e.seeT = 0;
      e.target = null;

      const enemies = g.ents.filter((o) => o.alive && o.team !== e.team);
      if (!enemies.length) return;
      const tgt = enemies[e.idx % enemies.length];
      let goal = { x: tgt.x, y: tgt.y };
      if (e.lastSeen && g.roundT - e.lastSeen.t < 2.5) {
        goal = { x: e.lastSeen.x, y: e.lastSeen.y };
      } else if (g.diff !== DIFFICULTY.hard) {
        const jx = clamp(tgt.x + e.jitter.x, CELL, (g.w - 1) * CELL);
        const jy = clamp(tgt.y + e.jitter.y, CELL, (g.h - 1) * CELL);
        if (!solidAt(jx, jy)) goal = { x: jx, y: jy };
      }

      e.pathT -= dt;
      if (!e.path || e.pathT <= 0) {
        e.path = findPath(e.x, e.y, goal.x, goal.y);
        e.pathT = rand(0.3, 0.5);
      }
      if (e.path && e.path.length > 1) {
        const wp = e.path[1];
        mx = (wp[0] + 0.5) * CELL - e.x;
        my = (wp[1] + 0.5) * CELL - e.y;
      } else {
        mx = goal.x - e.x;
        my = goal.y - e.y;
      }
      const ml = Math.hypot(mx, my);
      if (ml > 0.001) { mx /= ml; my /= ml; }

      if (ml > 0.001) {
        const ha = Math.atan2(my, mx);
        const maxTurn = D.turn * dt;
        e.angle += clamp(angDiff(e.angle, ha), -maxTurn, maxTurn);
      }
    }

    // 3. get unstuck if we are barely moving but want to
    e.stuckT += dt;
    if (e.stuckT > 0.6) {
      if ((mx || my) && Math.hypot(e.x - e.lx, e.y - e.ly) < 4) {
        e.unstuck = 0.45;
        e.unDir = Math.random() * Math.PI * 2;
        e.pathT = 0;
      }
      e.lx = e.x; e.ly = e.y; e.stuckT = 0;
    }
    if (e.unstuck > 0) {
      e.unstuck -= dt;
      mx = Math.cos(e.unDir);
      my = Math.sin(e.unDir);
    }

    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    moveEnt(e, mx * D.speed * dt, my * D.speed * dt);
  }

  // stop players from standing inside each other
  function separate() {
    const list = g.ents.filter((e) => e.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min) continue;
        if (d < 0.001) { moveEnt(b, rand(-1, 1), rand(-1, 1)); continue; }
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        moveEnt(a, -nx * push, -ny * push);
        moveEnt(b, nx * push, ny * push);
      }
    }
  }

  function simulate(dt) {
    g.roundT += dt;
    for (const e of g.ents) {
      if (!e.alive) continue;
      const px = e.x, py = e.y;
      if (e.isPlayer) updatePlayer(e, dt);
      else updateBot(e, dt);
      e.vx = (e.x - px) / dt;
      e.vy = (e.y - py) / dt;
    }
    separate();
    updateBullets(dt);
    updateFx(dt);
  }

  /* =====================================================================
   *  Frame step
   * ===================================================================== */
  function step(dt) {
    if (!g) return;
    g.time += dt;

    if (state === 'countdown') {
      const p = g.ents[0];
      if (p && p.alive) aimPlayer(p);
      g.cd -= dt;
      const n = Math.ceil(g.cd);
      if (n !== g.lastCd && n > 0) { g.lastCd = n; sfx.beep(); }
      if (g.cd <= 0) {
        state = 'playing';
        g.fight = 0.9;
        g.roundT = 0;
        sfx.go();
      }
    } else if (state === 'playing') {
      simulate(dt);
      if (state === 'playing') checkRoundEnd();
    } else if (state === 'roundEnd') {
      updateBullets(dt);
      updateFx(dt);
      g.endT -= dt;
      if (g.endT <= 0) {
        if (g.scores[0] >= WIN_SCORE || g.scores[1] >= WIN_SCORE) endMatch();
        else startRound();
      }
    }
  }

  /* =====================================================================
   *  Rendering
   * ===================================================================== */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(str, x, y, size, color, align) {
    ctx.font = '800 ' + size + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#fff';
    ctx.fillText(str, x, y);
  }

  // enemies are only drawn while one of your living teammates can see them
  function visibleToYou(o) {
    if (state === 'roundEnd') return true;
    for (const e of g.ents) {
      if (e.team === 0 && e.alive && los(e.x, e.y, o.x, o.y)) return true;
    }
    return aliveCount(0) === 0;
  }

  function drawEnt(e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    if (!e.alive) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#6b7280';
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(2, 3, e.r, e.r * 0.9, 0, 0, Math.PI * 2); ctx.fill();

    // gun
    ctx.rotate(e.angle);
    ctx.fillStyle = '#10141b';
    ctx.fillRect(e.r * 0.4, -2.5, e.r + 9, 5);

    // body
    ctx.fillStyle = e.hurt > 0 ? '#ffffff' : TEAM_COLORS[e.team];
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = e.isPlayer ? 3 : 2;
    ctx.strokeStyle = e.isPlayer ? '#ffffff' : 'rgba(0,0,0,0.45)';
    ctx.stroke();

    // little "face" so you can tell which way they look
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(e.r * 0.45, 0, 3.2, 0, Math.PI * 2); ctx.fill();

    // muzzle flash
    if (e.flash > 0) {
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(e.r + 12, 0, 5 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // health bar
    const bw = 26;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 11, bw, 4);
    ctx.fillStyle = e.hp > 50 ? '#4ade80' : e.hp > 25 ? '#facc15' : '#f87171';
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 11, bw * (e.hp / 100), 4);
  }

  function drawWorld() {
    ctx.drawImage(g.mapCanvas, g.ox, g.oy);

    ctx.save();
    ctx.translate(g.ox, g.oy);
    ctx.scale(g.s, g.s);

    // bodies first, living on top of dead
    for (const e of g.ents) if (!e.alive && (e.team === 0 || visibleToYou(e))) drawEnt(e);
    for (const e of g.ents) if (e.alive && (e.team === 0 || visibleToYou(e))) drawEnt(e);

    // bullets
    ctx.lineCap = 'round';
    for (const b of g.bullets) {
      ctx.strokeStyle = b.team === 0 ? '#bcd7ff' : '#ffc4c4';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      ctx.stroke();
    }

    // sparks
    for (const s of g.sparks) {
      ctx.globalAlpha = clamp(s.life / s.max, 0, 1);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHUD() {
    // scoreboard
    const pw = 440, ph = 46, px = (VW - pw) / 2, py = 4;
    ctx.fillStyle = 'rgba(8,11,16,0.88)';
    roundRect(px, py, pw, ph, 12);
    ctx.fill();

    const leftName = g.size === 1 ? 'YOU' : 'YOUR TEAM';
    const rightName = g.size === 1 ? 'BOT' : 'ENEMY TEAM';
    text(leftName, px + 16, py + 16, 15, TEAM_COLORS[0], 'left');
    text(rightName, px + pw - 16, py + 16, 15, TEAM_COLORS[1], 'right');
    text(g.scores[0] + '  :  ' + g.scores[1], VW / 2, py + 17, 26, '#fff', 'center');

    const left = Math.max(0, Math.ceil(ROUND_LIMIT - g.roundT));
    const timer = state === 'playing' ? ' · ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : '';
    text('ROUND ' + g.round + timer + '  ·  FIRST TO ' + WIN_SCORE, VW / 2, py + 37, 11, '#8b97ab', 'center');

    // alive pips on both sides of the scoreboard
    for (let team = 0; team < 2; team++) {
      let k = 0;
      for (const e of g.ents) {
        if (e.team !== team) continue;
        const cx = team === 0 ? px - 18 - k * 20 : px + pw + 18 + k * 20;
        ctx.beginPath();
        ctx.arc(cx, py + 23, 7, 0, Math.PI * 2);
        ctx.fillStyle = e.alive ? TEAM_COLORS[team] : 'rgba(120,128,140,0.35)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.stroke();
        k++;
      }
    }

    // player health
    const me = g.ents[0];
    if (me) {
      ctx.fillStyle = 'rgba(8,11,16,0.88)';
      roundRect(14, VH - 38, 230, 28, 9);
      ctx.fill();
      text('HP', 28, VH - 24, 13, '#8b97ab', 'left');
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(56, VH - 30, 150, 12);
      ctx.fillStyle = me.hp > 50 ? '#4ade80' : me.hp > 25 ? '#facc15' : '#f87171';
      ctx.fillRect(56, VH - 30, 150 * (me.hp / 100), 12);
      text(String(me.hp), 232, VH - 24, 13, '#fff', 'right');
      if (!me.alive) text('YOU DIED – watching your team', VW / 2, VH - 24, 16, '#f87171', 'center');
    }

    // kill feed
    let fy = 66;
    for (const f of g.feed) {
      ctx.globalAlpha = clamp(f.t, 0, 1);
      ctx.font = '700 14px system-ui, sans-serif';
      const w = ctx.measureText(f.text).width + 20;
      ctx.fillStyle = 'rgba(8,11,16,0.8)';
      roundRect(VW - w - 14, fy - 12, w, 24, 8);
      ctx.fill();
      text(f.text, VW - 24, fy, 14, TEAM_COLORS[f.team], 'right');
      fy += 28;
    }
    ctx.globalAlpha = 1;
  }

  function drawOverlays() {
    if (state === 'countdown') {
      ctx.fillStyle = 'rgba(5,8,12,0.38)';
      ctx.fillRect(0, 0, VW, VH);
      const n = Math.ceil(g.cd);
      const frac = g.cd - Math.floor(g.cd);        // 1 -> 0 inside each second
      const scale = 1 + frac * 0.35;
      ctx.save();
      ctx.translate(VW / 2, VH / 2);
      ctx.scale(scale, scale);
      text(String(n), 0, 0, 180, '#ffffff', 'center');
      ctx.restore();
      text('ROUND ' + g.round, VW / 2, VH / 2 - 150, 34, '#cbd5e1', 'center');
      text('GET READY', VW / 2, VH / 2 + 130, 22, '#8b97ab', 'center');
    } else if (state === 'playing' && g.fight > 0) {
      ctx.globalAlpha = clamp(g.fight / 0.5, 0, 1);
      text('FIGHT!', VW / 2, VH / 2, 110, '#facc15', 'center');
      ctx.globalAlpha = 1;
    } else if (state === 'roundEnd') {
      ctx.fillStyle = 'rgba(5,8,12,0.45)';
      ctx.fillRect(0, VH / 2 - 90, VW, 180);
      text(g.banner, VW / 2, VH / 2 - 18, 76, g.bannerColor, 'center');
      const sub = g.bannerSub || (g.scores[0] + '  –  ' + g.scores[1]);
      text(sub, VW / 2, VH / 2 + 42, 26, '#cbd5e1', 'center');
    } else if (state === 'paused') {
      ctx.fillStyle = 'rgba(5,8,12,0.7)';
      ctx.fillRect(0, 0, VW, VH);
      text('PAUSED', VW / 2, VH / 2 - 40, 84, '#fff', 'center');
      text('Esc  resume      Q  quit to menu      M  mute', VW / 2, VH / 2 + 30, 22, '#8b97ab', 'center');
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, VW, VH);
    if (!g) return;
    drawWorld();
    drawHUD();
    drawOverlays();
  }

  /* =====================================================================
   *  Menu
   * ===================================================================== */
  function showScreen(name) {
    screenMain.classList.toggle('hidden', name !== 'main');
    screenMaps.classList.toggle('hidden', name !== 'maps');
  }

  function showMenu(result) {
    menu.classList.remove('hidden');
    showScreen('main');
    if (result) {
      resultEl.className = 'result ' + (result.win ? 'win' : 'lose');
      resultEl.innerHTML =
        '<div class="r-title">' + (result.win ? 'YOU WIN' : 'YOU LOSE') + '</div>' +
        '<div class="r-sub">Final score ' + result.scores[0] + ' – ' + result.scores[1] + '</div>';
      if (result.win) sfx.win(); else sfx.lose();
    } else {
      resultEl.className = 'result hidden';
      resultEl.innerHTML = '';
    }
  }

  function openMapSelect(mode) {
    mapsTitle.textContent = (mode === '5v5' ? '5 v 5' : '1 v 1') + ' – choose a map';
    mapList.innerHTML = '';
    for (const map of MAPS[mode]) {
      const card = document.createElement('button');
      card.className = 'card';

      const cv = document.createElement('canvas');
      const pc = 9;
      cv.width = map.w * pc;
      cv.height = map.h * pc;
      const pctx = cv.getContext('2d');
      drawMap(pctx, map, pc);
      const dot = (cell, color) => {
        pctx.fillStyle = color;
        pctx.beginPath();
        pctx.arc((cell[0] + 0.5) * pc, (cell[1] + 0.5) * pc, pc * 0.45, 0, Math.PI * 2);
        pctx.fill();
      };
      for (let i = 0; i < map.size; i++) { dot(map.spawnsA[i], TEAM_COLORS[0]); dot(map.spawnsB[i], TEAM_COLORS[1]); }

      const title = document.createElement('h3');
      title.textContent = map.name;
      const desc = document.createElement('p');
      desc.textContent = map.desc;

      card.appendChild(cv);
      card.appendChild(title);
      card.appendChild(desc);
      card.addEventListener('click', () => startMatch(mode, map));
      mapList.appendChild(card);
    }
    showScreen('maps');
  }

  document.querySelectorAll('.big').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio();
      openMapSelect(btn.dataset.size === '5' ? '5v5' : '1v1');
    });
  });

  document.querySelectorAll('.chip[data-diff]').forEach((btn) => {
    btn.addEventListener('click', () => {
      difficulty = btn.dataset.diff;
      document.querySelectorAll('.chip[data-diff]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  $('back').addEventListener('click', () => showScreen('main'));

  /* =====================================================================
   *  Input
   * ===================================================================== */
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
  };

  function inGame() { return state === 'countdown' || state === 'playing' || state === 'roundEnd'; }

  function togglePause() {
    if (inGame()) { pausedFrom = state; state = 'paused'; }
    else if (state === 'paused') { state = pausedFrom || 'playing'; }
  }

  window.addEventListener('keydown', (ev) => {
    const k = KEYMAP[ev.code];
    if (k) {
      keys[k] = true;
      if (g) ev.preventDefault();
    } else if (ev.code === 'Escape') {
      togglePause();
    } else if (ev.code === 'KeyQ' && state === 'paused') {
      quitToMenu();
    } else if (ev.code === 'KeyM') {
      muted = !muted;
    }
  });

  window.addEventListener('keyup', (ev) => {
    const k = KEYMAP[ev.code];
    if (k) keys[k] = false;
  });

  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = false;
    mouse.down = false;
    if (inGame()) togglePause();
  });

  function updateMouse(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) * VW) / r.width;
    mouse.y = ((ev.clientY - r.top) * VH) / r.height;
  }

  window.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) { mouse.down = true; updateMouse(ev); audio(); }
  });
  window.addEventListener('mouseup', (ev) => { if (ev.button === 0) mouse.down = false; });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  /* =====================================================================
   *  Main loop
   * ===================================================================== */
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000) || 0);
    last = ts;
    if (dt > 0) step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  showMenu(null);
  requestAnimationFrame(loop);

  // hook used only by the automated tests in the repo (harmless in the browser)
  if (window.__BOTARENA_TEST__) {
    window.__game = {
      startMatch, step,
      setDifficulty: (d) => { difficulty = d; },
      get state() { return state; },
      get g() { return g; },
      keys, mouse,
    };
  }
})();
