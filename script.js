(() => {
'use strict';
const $ = s => document.querySelector(s), T = THREE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Estações (também são obstáculos) ---------- */
const ST = {
  paper:  {x:-4.2, z:-6.6, w:2.4, d:1.2, h:.9,  c:0xffd166},
  closet: {x: 4.2, z:-6.6, w:2.4, d:1.2, h:2.2, c:0x4cc9f0},
  boss:   {x: 0,   z:-6.4, w:3.2, d:1.3, h:.9,  c:0xef476f},
  desk:   {x:-4.1, z:-1,   w:1.5, d:3.2, h:.9,  c:0x9b5de5},
  printer:{x: 4.4, z: .5,  w:1.3, d:1.7, h:1,   c:0x06d6a0},
  out:    {x:-4.2, z: 5.9, w:2.4, d:1.2, h:.9,  c:0xf8961e},
  water:  {x: 4.5, z: 5.8, w:1,   d:1,   h:1.1, c:0x48cae4}
};
const obst = Object.values(ST).map(s => ({x:s.x, z:s.z, w:s.w, d:s.d}));
obst.push({x:5.2, z:-3.2, w:.9, d:.9});

/* ---------- Tarefas ---------- */
const S = (k, st, l, need, give, dur) => ({k, st, l, need, give, dur});
const TYPES = {
  A: {n:'Relatório urgente', dl:30, steps: () => [
    S('p','paper','PEGAR PAPEL',null,'papel',.4),
    S('f','desk','PREPARAR RELATÓRIO','papel','relat',2),
    S('s','boss','ENTREGAR AO GERENTE','relat','assin',2),
    S('o','out','ENTREGAR ASSINADO','assin',null,.4)]},
  B: {n:'Documento p/ impressão', dl:28, steps: () => [
    S('d','desk','PEGAR DOCUMENTO',null,'doc',1),
    S('i','printer','USAR IMPRESSORA','doc','imp',3),
    S('o','out','ENTREGAR IMPRESSO','imp',null,.4)]},
  C: {n:'Material faltando', dl:20, steps: () => [
    S('m','closet','PEGAR MATERIAL',null,'mat',.5),
    S('c','desk','FINALIZAR TAREFA','mat',null,1.5)]}
};
const ITEM = {papel:['PAPEL',0xffffff], relat:['RELATÓRIO',0xfff3a0], assin:['ASSINADO',0x9be564], doc:['DOCUMENTO',0xcdb4ff],
  imp:['IMPRESSO',0xbde0fe], mat:['MATERIAL',0xffa94d], dev:['DEVOLVIDO',0xff6b6b], relat2:['CORRIGIDO',0xfff3a0]};

/* ---------- Estado ---------- */
let state = 'menu', tasks = [], uid = 0, done = 0, expired = 0, ret = 0, hold = null, doing = null;
let startT = 0, spawnIn = 0, listT = 0, warnedThirst = false, tt = 0, lastLabel = '';
const P = {x:0, z:3, rot:0, thirst:0, hop:0, moving:0};

/* ---------- Áudio (Web Audio, só após interação) ---------- */
let AC = null, muted = false;
function beep(f, d = .12, type = 'sine', v = .14, f2) {
  if (muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d);
  } catch (e) {}
}

/* ---------- Cena ---------- */
const renderer = new T.WebGLRenderer({canvas:$('#c'), antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new T.Scene();
scene.background = new T.Color(0xffe8b8);
const cam = new T.OrthographicCamera(-1, 1, 1, -1, .1, 100);
cam.position.set(0, 20, 10); cam.lookAt(0, 0, 0);
scene.add(new T.HemisphereLight(0xffffff, 0xffd9a0, .85));
const sun = new T.DirectionalLight(0xffffff, .6);
sun.position.set(-6, 14, 8); sun.castShadow = true; sun.shadow.mapSize.set(matchMedia('(pointer:fine)').matches ? 2048 : 1024, matchMedia('(pointer:fine)').matches ? 2048 : 1024);
Object.assign(sun.shadow.camera, {left:-10, right:10, top:10, bottom:-10});
scene.add(sun);

const mat = c => new T.MeshLambertMaterial({color:c});
function box(w, h, d, c, x, y, z, p = scene) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; p.add(m); return m;
}
function ball(r, c, x, y, z, p) {
  const m = new T.Mesh(new T.SphereGeometry(r, 14, 10), mat(c));
  m.position.set(x, y, z); m.castShadow = true; p.add(m); return m;
}
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h, ph = Math.max(19, 14 / a);
  renderer.setSize(w, h);
  cam.left = -ph * a / 2; cam.right = ph * a / 2; cam.top = ph / 2; cam.bottom = -ph / 2;
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

/* Piso e paredes */
for (let i = -5; i <= 5; i += 2) for (let j = -7; j <= 7; j += 2)
  box(2, .1, 2, ((i + j) / 2) % 2 ? 0xfff3d6 : 0xffd9a8, i, -.05, j).castShadow = false;
box(12, 3.5, .3, 0xfff0d0, 0, 1.75, -7.95);
box(.3, 2, 16, 0xffe0b2, -6.1, 1, 0);
const clock = new T.Mesh(new T.CylinderGeometry(.6, .6, .1, 20), mat(0xffffff));
clock.rotation.x = Math.PI / 2; clock.position.set(3, 2.2, -7.75); scene.add(clock);
box(.06, .45, .05, 0x222222, 3, 2.3, -7.68); box(.35, .06, .05, 0x222222, 3.15, 2.2, -7.68);

/* Móveis */
for (const k in ST) { const s = ST[k]; box(s.w, s.h, s.d, s.c, s.x, s.h / 2, s.z); }
box(.8, .25, .6, 0xffffff, -4.9, 1.02, -6.6); box(.8, .4, .6, 0xfafafa, -3.6, 1.1, -6.6);   // papel
box(1.1, 1.9, .05, 0x8fdcf7, 3.6, 1.1, -5.97); box(1.1, 1.9, .05, 0x8fdcf7, 4.8, 1.1, -5.97); // armário
box(.9, .6, .1, 0x222222, 0, 1.25, -6.5); box(.5, .05, .4, 0xffffff, 1.1, .95, -6.2);          // gerente
box(.1, .7, .9, 0x222222, -4.5, 1.3, -1); box(.5, .05, .4, 0xffffff, -3.8, .93, .2);           // mesa
box(.4, .05, .3, 0xffffff, -3.8, .93, -1.8); box(.05, .25, .05, 0x3a86ff, -3.6, 1, -1);
box(.9, .15, .9, 0x3a86ff, -2.8, .6, -1); box(.1, .8, .9, 0x3a86ff, -2.35, 1, -1);              // cadeira
box(1, .3, 1.2, 0xeeeeee, 4.4, 1.15, .5); box(.6, .04, .5, 0xffffff, 4.2, 1.32, .5);            // impressora
box(.9, .3, .7, 0xffffff, -4.6, 1.05, 5.9); box(.9, .2, .7, 0xffe5b4, -3.8, 1, 5.9);             // entrega
box(.7, .4, .7, 0xcfefff, 4.5, 1.3, 5.8); ball(.35, 0x90e0ef, 4.5, 1.75, 5.8, scene);           // bebedouro
box(.7, .6, .7, 0xc1440e, 5.2, .3, -3.2); ball(.6, 0x2ec27e, 5.2, 1.1, -3.2, scene);            // planta
box(.5, .6, .5, 0x6c757d, 1.8, .3, 6.9);                                                         // lixeira
[[-1.5,2],[2,-2.5],[-2,-3.5],[1,4],[3,3.4],[-1,6]].forEach(([x, z], i) => {
  const p = box(.6, .02, .45, 0xffffff, x, .03, z); p.rotation.y = i * 1.3; p.castShadow = false;
});

/* Personagens */
function makeChar(c) {
  const g = new T.Group(), b = new T.Group(); g.add(b);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const l = new T.Group(); l.position.set(s * .2, .8, 0);
    box(.3, .65, .32, c.pants, 0, -.35, 0, l); box(.34, .12, .42, c.shoe, 0, -.72, .05, l); b.add(l); legs.push(l);
    const a = new T.Group(); a.position.set(s * .5, 1.65, 0);
    box(.22, .3, .24, c.top, 0, -.1, 0, a); box(.18, .4, .2, c.skin, 0, -.45, 0, a); b.add(a); arms.push(a);
  }
  box(.78, .4, .5, c.pants, 0, .95, 0, b);
  box(.8, .7, .5, c.top, 0, 1.4, 0, b);
  const hd = new T.Group(); hd.position.y = 2.15; b.add(hd);
  ball(.5, c.skin, 0, 0, 0, hd).scale.set(1.05, .95, 1);
  ball(.52, c.hair, 0, .08, -.12, hd).scale.set(1.02, .9, .95);
  if (c.bun) ball(.2, c.hair, 0, .35, -.5, hd);
  for (const s of [-1, 1]) {
    ball(.06, 0x222222, s * .18, .05, .47, hd); ball(.07, 0xff9aa2, s * .3, -.12, .4, hd);
    if (c.glasses) { const r = new T.Mesh(new T.TorusGeometry(.15, .02, 6, 16), mat(0xe8d9a0)); r.position.set(s * .18, .05, .5); hd.add(r); }
  }
  box(.18, .04, .04, 0xc0392b, 0, -.2, .5, hd);
  if (c.bag) { const st = box(.1, 1, .55, 0x111111, 0, 1.4, 0, b); st.rotation.z = .7; box(.4, .35, .2, 0x111111, -.5, .95, .1, b); }
  if (c.tie) box(.12, .5, .05, 0xe63946, 0, 1.4, .27, b);
  g.userData = {b, legs, arms, hd};
  scene.add(g); return g;
}
const joana = makeChar({pants:0xa9cdf0, shoe:0xe8c3b0, top:0x9aa0a6, skin:0xf2c29b, hair:0x1a1210, glasses:1, bun:1, bag:1});
const boss = makeChar({pants:0x3d405b, shoe:0x222222, top:0xffffff, skin:0xe0ac84, hair:0x888888, tie:1});
boss.position.set(0, 0, -7.25);
const holdM = box(.55, .1, .42, 0xffffff, 0, 1.4, .7, joana.userData.b); holdM.visible = false;
const ring = new T.Mesh(new T.RingGeometry(.75, 1.1, 28), new T.MeshBasicMaterial({color:0xffd23f, side:T.DoubleSide}));
ring.rotation.x = -Math.PI / 2; ring.position.y = .08; ring.visible = false; scene.add(ring);

/* ---------- Entrada ---------- */
const J = {x:0, z:0}, keys = {};
const joy = $('#joy'), knob = $('#knob'); let jid = null;
function jm(e) {
  const r = joy.getBoundingClientRect(), R = r.width / 2;
  let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy);
  if (l > R) { dx *= R / l; dy *= R / l; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  const m = Math.hypot(dx, dy) / R; J.x = m < .12 ? 0 : dx / R; J.z = m < .12 ? 0 : dy / R;
}
function jr() { jid = null; J.x = J.z = 0; knob.style.transform = ''; }
joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); jm(e); e.preventDefault(); });
joy.addEventListener('pointermove', e => { if (e.pointerId === jid) jm(e); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => joy.addEventListener(t, jr));
addEventListener('keydown', e => { keys[e.code] = 1; if (['Space', 'Enter', 'KeyE'].includes(e.code)) { press(); e.preventDefault(); } });
addEventListener('keyup', e => { keys[e.code] = 0; });
document.addEventListener('touchmove', e => e.preventDefault(), {passive:false});
$('#act').addEventListener('pointerdown', e => { e.preventDefault(); press(); });
$('#mute').addEventListener('click', () => { muted = !muted; $('#mute').textContent = muted ? '🔇' : '🔊'; });

function input() {
  const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const kz = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  let x = J.x || kx, z = J.z || kz; const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  return {x, z};
}

/* ---------- Lógica ---------- */
function near(k) {
  const s = ST[k], dx = Math.max(Math.abs(P.x - s.x) - s.w / 2, 0), dz = Math.max(Math.abs(P.z - s.z) - s.d / 2, 0);
  return Math.hypot(dx, dz) < 1.1;
}
function avail() {
  for (const k in ST) {
    if (!near(k)) continue;
    if (k === 'water') return {k, l:'BEBER ÁGUA', dur:1.6, water:1};
    if (P.thirst >= 100) return {blocked:1, l:'SEDE! VÁ BEBER ÁGUA'};
    let best = null;
    for (const t of tasks) {
      const s = t.steps[t.i];
      if (s.st !== k) continue;
      if (s.need ? (hold && hold.task === t.id && hold.item === s.need) : !hold) if (!best || t.dl < best.dl) best = t;
    }
    if (best) { const s = best.steps[best.i]; return {k, t:best, s, l:s.l, dur:s.dur}; }
  }
  return null;
}
function press() {
  if (state !== 'play' || doing) return;
  if (AC && AC.state === 'suspended') AC.resume();
  const a = avail();
  if (!a) { beep(120, .1, 'square', .08); return; }
  if (a.blocked) { toast('💧 Beba água primeiro!', 'y'); beep(130, .2, 'square', .1); return; }
  doing = {k:a.k, t:a.t, p:0};
  $('#prog').classList.remove('hide');
}
function complete(a) {
  doing = null; $('#prog').classList.add('hide'); P.hop = .3;
  if (a.water) { P.thirst = 0; warnedThirst = false; beep(500, .3, 'sine', .15, 900); toast('💧 Hidratada!', ''); return; }
  const t = a.t, s = a.s;
  hold = s.give ? {item:s.give, task:t.id} : null;
  if (s.k === 's' && !t.ret && Math.random() < .35) {
    t.ret = 1; ret++; hold = {item:'dev', task:t.id};
    t.steps.splice(t.i + 1, 0, S('r','desk','CORRIGIR RELATÓRIO','dev','relat2',2), S('s2','boss','REENTREGAR AO GERENTE','relat2','assin',1.5));
    toast('↩ Gerente devolveu o relatório!', 'r'); beep(160, .35, 'sawtooth', .13, 90);
  } else beep(440, .1, 'triangle', .12, 620);
  t.i++;
  if (t.i >= t.steps.length) {
    tasks.splice(tasks.indexOf(t), 1); done++; hold = null;
    toast('✅ Tarefa concluída!', 'g'); beep(660, .25, 'triangle', .18, 1000);
  }
  syncHold();
}
function syncHold() {
  const h = $('#hold');
  holdM.visible = !!hold;
  if (hold) { const [n, c] = ITEM[hold.item]; holdM.material.color.setHex(c); h.textContent = '📄 ' + n; h.classList.remove('hide'); }
  else h.classList.add('hide');
}
function spawn(first) {
  if (tasks.length >= 8) return;
  const r = Math.random(), k = first || (r < .4 ? 'A' : r < .7 ? 'B' : 'C'), ty = TYPES[k];
  const el = state === 'play' ? (performance.now() - startT) / 1000 : 0, dl = ty.dl * (1 - .35 * el / 60);
  tasks.push({id:++uid, n:ty.n, steps:ty.steps(), i:0, dl, max:dl, warn:0});
  beep(880, .1, 'square', .08, 1200);
}
function toast(m, c) {
  const e = $('#toast'); e.textContent = m; e.className = 'show ' + c;
  clearTimeout(tt); tt = setTimeout(() => e.className = '', 1300);
}
function renderTasks() {
  const list = tasks.slice().sort((a, b) => a.dl - b.dl).slice(0, 2);
  $('#tasks').innerHTML = list.map(t => {
    const r = t.dl / t.max, c = r < .25 ? 'r' : r < .5 ? 'y' : '';
    return `<div class="tk ${c}"><b>${t.n}</b><span>→ ${t.steps[t.i].l}</span><i style="width:${clamp(r, 0, 1) * 100}%"></i></div>`;
  }).join('');
}

function update(dt) {
  const el = (performance.now() - startT) / 1000, rem = 60 - el;
  if (rem <= 0) return endGame();
  /* movimento */
  const inp = input(), sp = 5;
  const mv = (dx, dz) => {
    const nx = clamp(P.x + dx, -5.4, 5.4), nz = clamp(P.z + dz, -7, 7.2);
    for (const o of obst) if (Math.abs(nx - o.x) < o.w / 2 + .38 && Math.abs(nz - o.z) < o.d / 2 + .38) return;
    P.x = nx; P.z = nz;
  };
  mv(inp.x * sp * dt, 0); mv(0, inp.z * sp * dt);
  const mag = Math.hypot(inp.x, inp.z); P.moving = mag;
  if (mag > .05) {
    let d = Math.atan2(inp.x, inp.z) - P.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); P.rot += d * Math.min(1, dt * 14);
  }
  /* sede */
  P.thirst = Math.min(100, P.thirst + 2.1 * dt);
  if (P.thirst > 70 && !warnedThirst) { warnedThirst = true; toast('💧 Sede alta! Vá ao bebedouro', 'y'); beep(300, .2, 'triangle', .12); }
  /* tarefas */
  spawnIn -= dt;
  if (spawnIn <= 0) { spawn(); spawnIn = Math.max(1.8, 4.4 - el * .045) * (.8 + Math.random() * .4); }
  for (let i = tasks.length - 1; i >= 0; i--) {
    const t = tasks[i]; t.dl -= dt;
    if (t.dl < 6 && !t.warn) { t.warn = 1; beep(260, .25, 'sawtooth', .09); }
    if (t.dl <= 0) {
      tasks.splice(i, 1); expired++; toast('⏰ Prazo estourado!', 'r'); beep(110, .3, 'square', .12, 70);
      if (hold && hold.task === t.id) { hold = null; syncHold(); }
      if (doing && doing.t === t) { doing = null; $('#prog').classList.add('hide'); }
    }
  }
  /* ação em andamento */
  const a = avail();
  if (doing) {
    if (!a || a.blocked || a.k !== doing.k || a.t !== doing.t) { doing = null; $('#prog').classList.add('hide'); }
    else {
      const before = doing.p; doing.p += dt;
      if (a.k === 'printer' && Math.floor(doing.p * 6) !== Math.floor(before * 6)) beep(200 + Math.random() * 100, .05, 'square', .05);
      $('#prog i').style.width = Math.min(100, doing.p / a.dur * 100) + '%';
      if (doing.p >= a.dur) complete(a);
    }
  }
  /* HUD */
  const lab = a ? a.l : '—', btn = $('#act');
  if (lab !== lastLabel) { lastLabel = lab; btn.textContent = lab; btn.className = a ? (a.blocked ? 'bk' : 'on') : ''; }
  if (a && !a.blocked) {
    const s = ST[a.k]; ring.visible = true; ring.position.x = s.x; ring.position.z = s.z;
    const pu = 1 + .06 * Math.sin(performance.now() / 120); ring.scale.set((s.w / 2 + .4) * pu, (s.d / 2 + .4) * pu, 1);
  } else ring.visible = false;
  const tm = $('#time'); tm.textContent = Math.ceil(rem); tm.classList.toggle('u', rem <= 10);
  $('#done').textContent = done; $('#pend').textContent = tasks.length + expired;
  const tb = $('#tbar'); tb.style.width = P.thirst + '%'; tb.className = P.thirst > 90 ? 'r' : P.thirst > 70 ? 'y' : '';
  listT -= dt; if (listT <= 0) { listT = .2; renderTasks(); }
}

function animate(now) {
  const t = now / 1000, u = joana.userData, w = P.moving > .05 ? 1 : 0;
  joana.position.set(P.x, 0, P.z); joana.rotation.y = P.rot;
  const s = Math.sin(t * 14) * .8 * w;
  u.legs[0].rotation.x = s; u.legs[1].rotation.x = -s;
  u.arms[0].rotation.x = -s * .8; u.arms[1].rotation.x = s * .8;
  if (hold) u.arms[0].rotation.x = u.arms[1].rotation.x = -1.1;
  const hopY = P.hop > 0 ? Math.sin(P.hop / .3 * Math.PI) * .5 : 0;
  u.b.position.y = Math.abs(Math.sin(t * 14)) * .12 * w + Math.sin(t * 3) * .02 + hopY;
  u.b.rotation.z = Math.sin(t * 7) * .06 * w;
  boss.userData.hd.rotation.y = Math.sin(t * 1.5) * .4;
  boss.userData.arms[0].rotation.x = Math.sin(t * 4) * .3;
  clock.rotation.z = t * .5;
}

/* ---------- Fluxo ---------- */
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id)); }
function ui(on) { ['#hud', '#ctrl'].forEach(s => $(s).classList.toggle('hide', !on)); }
function startGame() {
  tasks = []; uid = 0; done = expired = ret = 0; hold = null; doing = null; lastLabel = ''; warnedThirst = false;
  Object.assign(P, {x:0, z:3, rot:0, thirst:0, hop:0});
  $('#prog').classList.add('hide'); syncHold(); jr();
  startT = performance.now(); state = 'play'; spawn('A'); spawn('C'); spawn('B'); spawnIn = 3.2;
  renderTasks(); ui(true); show('');
  if (AC && AC.state === 'suspended') AC.resume();
  beep(520, .15, 'triangle', .15, 780);
}
function endGame() {
  state = 'end'; doing = null; ui(false); $('#prog').classList.add('hide'); $('#hold').classList.add('hide'); ring.visible = false;
  const pend = tasks.length + expired;
  $('#r-done').textContent = done; $('#r-pend').textContent = pend; $('#r-ret').textContent = ret;
  $('#r-msg').textContent = `Você concluiu ${done} tarefa${done === 1 ? '' : 's'}, deixou ${pend} pendente${pend === 1 ? '' : 's'} ` +
    (ret ? `e o gerente devolveu ${ret} relatório${ret === 1 ? '' : 's'}.` : 'e o gerente ainda está esperando aquele relatório.');
  beep(400, .6, 'sawtooth', .15, 80); show('result');
}
$('#go').addEventListener('click', startGame);
$('#r-next').addEventListener('click', () => show('reflect'));
$('#f-next').addEventListener('click', () => { show('final'); beep(520, .3, 'triangle', .15, 1040); });
$('#again').addEventListener('click', () => { state = 'menu'; show('start'); });
$('#foto').addEventListener('error', () => { $('#foto').classList.add('hide'); $('#fallback').classList.remove('hide'); });
(() => { const c = $('#confetti'), em = ['⭐', '🎉', '✨', '🎊', '🟡'];
  for (let i = 0; i < 16; i++) { const s = document.createElement('span'); s.textContent = em[i % 5];
    s.style.cssText = `left:${Math.random() * 100}%;animation-duration:${3 + Math.random() * 4}s;animation-delay:${-Math.random() * 6}s`; c.appendChild(s); } })();

/* ---------- Loop ---------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .25); last = now;
  if (state === 'play') update(dt);
  if (P.hop > 0) P.hop -= dt;
  animate(now);
  renderer.render(scene, cam);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
