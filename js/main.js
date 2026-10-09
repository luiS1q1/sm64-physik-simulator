// ============================================================
//  SM64-Physik-Simulator - Hauptdatei
//  Logik: 30 Hz fix (wie das Original), Rendering mit
//  Interpolation, Lakitu-Kamera, Gamepad + Maus + Tastatur.
// ============================================================
import * as THREE from 'three';
import { MarioState, marioStep, ACT, ACT_NAME, s16Wrap, atan2s, sins, coss, CONSTANTS_DOC, SURFACE } from './physics.js';
import { world, group, COINS, STAR } from './level.js';
import { buildMario, animateMario } from './mario-model.js';

// ---------- Szene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x64b4e6);
scene.fog = new THREE.Fog(0x64b4e6, 3000, 7000);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 10, 20000);

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff2cc, 1.1);
sun.position.set(1500, 2500, 1000);
scene.add(sun);
scene.add(group);

// Wolken (SM64-Style: flache weisse Blobs)
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(90 + Math.random() * 90, 10, 8), cloudMat);
        puff.position.set(j * 110 - 160, Math.random() * 40, Math.random() * 60);
        cloud.add(puff);
    }
    cloud.position.set((Math.random() - 0.5) * 7000, 1400 + Math.random() * 900, (Math.random() - 0.5) * 7000);
    scene.add(cloud);
}

// ---------- Mario ----------
const mario = buildMario();
scene.add(mario.root);

// Schatten
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -2600; sun.shadow.camera.right = 2600;
sun.shadow.camera.top = 2600; sun.shadow.camera.bottom = -2600;
sun.shadow.camera.far = 9000;
sun.shadow.bias = -0.0005;
group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
mario.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

const m = new MarioState();
const SPAWN = [0, 50, 1500];
function respawn() {
    m.pos = [...SPAWN]; m.prevPos = [...SPAWN];
    m.vel = [0, 0, 0]; m.forwardVel = 0;
    m.action = ACT.IDLE; m.faceAngle = [0, 0, 0];
    m.peakHeight = m.pos[1];
}
respawn();

// ---------- Muenzen & Stern (Objekte) ----------
const coinMeshes = new Map();
const coinGeo = new THREE.TorusGeometry(38, 12, 10, 20);
const coinMat = new THREE.MeshLambertMaterial({ color: 0xf0c000, emissive: 0x503800 });
for (const c of COINS) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.set(c.x, c.y, c.z);
    scene.add(mesh);
    coinMeshes.set(c, mesh);
}
const starMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(starShape(70), { depth: 24, bevelEnabled: false }),
    new THREE.MeshLambertMaterial({ color: 0xf0c000, emissive: 0x604000 }));
starMesh.position.set(STAR.x, STAR.y, STAR.z);
scene.add(starMesh);
function starShape(r) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.45;
        const a = Math.PI / 2 + i * Math.PI / 5;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
    }
    s.closePath();
    return s;
}

// ---------- Input: Gamepad + Tastatur + Maus ----------
const keys = {};
addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

// Maus: Kamera-Orbit per Drag
let dragging = false, lastX = 0, lastY = 0;
let camYawOff = 0, camPitch = 0.35, camDist = 650;
const camDists = [350, 650, 1000];
let camDistIdx = 1;
renderer.domElement.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
addEventListener('mouseup', () => dragging = false);
addEventListener('mousemove', e => {
    if (!dragging) return;
    camYawOff -= (e.clientX - lastX) * 0.008;
    camPitch = Math.min(1.2, Math.max(0.05, camPitch + (e.clientY - lastY) * 0.005));
    lastX = e.clientX; lastY = e.clientY;
});
addEventListener('wheel', e => {
    if (e.deltaY > 0) camDistIdx = Math.min(2, camDistIdx + 1);
    else camDistIdx = Math.max(0, camDistIdx - 1);
    camDist = camDists[camDistIdx];
});

// Gamepad-Zustand
let padPrev = {};
function readGamepad(m) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return null;
    // Linker Stick -> N64-Einheit (-64..64), radiale Totzone wie N64
    let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const len = Math.hypot(ax, ay);
    let mag64 = 0;
    if (len > 0.24) {
        const scaled = Math.min(1, (len - 0.24) / 0.76);
        mag64 = 16 + scaled * 48;
        m.stickX = Math.round(ax / len * mag64);
        m.stickY = Math.round(ay / len * mag64); // +y = unten, wie N64
        m.stickMagRaw = mag64;
    } else {
        m.stickX = 0; m.stickY = 0; m.stickMagRaw = 0;
    }
    const pressed = i => pad.buttons[i] && pad.buttons[i].pressed;
    const out = {
        a: pressed(0), b: pressed(2) || pressed(1),
        z: pressed(5) || pressed(4) || pressed(6) || pressed(7),
        cRot: (pad.axes[2] || 0) + (pressed(14) ? -1 : 0) + (pressed(15) ? 1 : 0),
        cPitch: (pad.axes[3] || 0),
    };
    return out;
}

// ---------- Kamera (Lakitu-Style) ----------
let camPos = new THREE.Vector3(0, 300, 2500);
function updateCamera(dt, pad, smooth) {
    // C-Knoepfe (Gamepad rechtes X) drehen wie im Original
    if (pad) {
        if (Math.abs(pad.cRot) > 0.3) camYawOff -= pad.cRot * dt * 2.0;
        camPitch = Math.min(1.2, Math.max(0.05, camPitch + (pad.cPitch || 0) * dt * 1.5));
    }
    if (keys.ArrowLeft) camYawOff += dt * 2.0;
    if (keys.ArrowRight) camYawOff -= dt * 2.0;
    if (keys.ArrowUp) camPitch = Math.min(1.2, camPitch + dt * 1.2);
    if (keys.ArrowDown) camPitch = Math.max(0.05, camPitch - dt * 1.2);

    const camYaw = s16Wrap(Math.round(camYawOff * 32768 / Math.PI));
    const target = new THREE.Vector3(m.pos[0], m.pos[1] + 200, m.pos[2]);
    const desired = new THREE.Vector3(
        m.pos[0] - Math.sin(camYawOff) * camDist * Math.cos(camPitch),
        m.pos[1] + 200 + Math.sin(camPitch) * camDist,
        m.pos[2] - Math.cos(camYawOff) * camDist * Math.cos(camPitch));
    // Kamera nicht unter den Boden
    const fl = world.findFloor(desired.x, desired.y + 100, desired.z);
    if (fl && desired.y < fl.height + 120) desired.y = fl.height + 120;
    const k = smooth ? 1 - Math.pow(0.0001, dt) : 1;
    camPos.lerp(desired, k);
    camera.position.copy(camPos);
    camera.lookAt(target);
    return camYaw;
}

// ---------- Sound (WebAudio-Synthese, keine Originaldateien) ----------
let audioCtx = null;
function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}
function tone(freq, dur, { type = 'square', gain = 0.05, slide = null, delay = 0 } = {}) {
    try {
        const c = ac(), t0 = c.currentTime + delay;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t0);
        if (slide !== null) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* Audio nicht verfuegbar */ }
}
function noise(dur, { gain = 0.1, freq = 800, delay = 0 } = {}) {
    try {
        const c = ac(), t0 = c.currentTime + delay;
        const len = Math.max(1, Math.floor(c.sampleRate * dur));
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const s = c.createBufferSource(); s.buffer = buf;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
        const g = c.createGain(); g.gain.value = gain;
        s.connect(f); f.connect(g); g.connect(c.destination);
        s.start(t0);
    } catch (e) { /* Audio nicht verfuegbar */ }
}
const sfx = {
    jump(a) {
        if (a === ACT.DOUBLE_JUMP) tone(300, 0.22, { slide: 700 });
        else if (a === ACT.TRIPLE_JUMP) { tone(260, 0.3, { slide: 900 }); tone(520, 0.3, { type: 'sine', gain: 0.03, slide: 1200, delay: 0.08 }); }
        else tone(240, 0.18, { slide: 520 });
    },
    longJump() { tone(200, 0.25, { slide: 640 }); noise(0.2, { freq: 500, gain: 0.05 }); },
    backflip() { tone(180, 0.35, { slide: 800 }); },
    sideFlip() { tone(280, 0.3, { slide: 760 }); },
    wallKick() { tone(400, 0.12, { slide: 640 }); },
    dive() { tone(500, 0.25, { type: 'sawtooth', gain: 0.04, slide: 180 }); },
    groundPound() { noise(0.3, { freq: 300, gain: 0.16 }); tone(90, 0.25, { type: 'sine', gain: 0.1 }); },
    land() { noise(0.08, { freq: 400, gain: 0.07 }); },
    step() { noise(0.045, { freq: 900, gain: 0.03 }); },
    punch() { tone(180, 0.08, { type: 'sawtooth', gain: 0.05, slide: 90 }); },
    coin() { tone(988, 0.09, { gain: 0.06 }); tone(1319, 0.35, { gain: 0.06, delay: 0.09 }); },
    star() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { gain: 0.06, delay: i * 0.13 })); },
    fall() { tone(600, 0.5, { slide: 150 }); },
};
function sfxForAction(a) {
    switch (a) {
        case ACT.JUMP: case ACT.DOUBLE_JUMP: case ACT.TRIPLE_JUMP: return sfx.jump(a);
        case ACT.LONG_JUMP: return sfx.longJump();
        case ACT.BACKFLIP: return sfx.backflip();
        case ACT.SIDE_FLIP: return sfx.sideFlip();
        case ACT.WALL_KICK_AIR: return sfx.wallKick();
        case ACT.DIVE: return sfx.dive();
        case ACT.GROUND_POUND: return sfx.groundPound();
        case ACT.PUNCHING: return sfx.punch();
    }
}
const AIR_ACTIONS = [ACT.JUMP, ACT.DOUBLE_JUMP, ACT.TRIPLE_JUMP, ACT.FREEFALL, ACT.LONG_JUMP,
    ACT.BACKFLIP, ACT.SIDE_FLIP, ACT.WALL_KICK_AIR, ACT.DIVE, ACT.GROUND_POUND];

// ---------- HUD ----------
const hud = document.getElementById('hud');
const hudAction = document.getElementById('hud-action');
const hudSpeed = document.getElementById('hud-speed');
const hudVel = document.getElementById('hud-vel');
const hudPos = document.getElementById('hud-pos');
const hudStick = document.getElementById('hud-stick');
const hudCoins = document.getElementById('hud-coins');
const hudDev = document.getElementById('hud-dev');
let hudVisible = true, devVisible = false;
addEventListener('keydown', e => {
    if (e.code === 'KeyH') hudVisible = !hudVisible;
    if (e.code === 'KeyF3' || e.code === 'KeyG') devVisible = !devVisible;
    if (e.code === 'KeyR') respawn();
    hud.style.opacity = hudVisible ? 1 : 0;
    hudDev.style.opacity = devVisible ? 1 : 0;
});

// Win-Overlay
const winOverlay = document.getElementById('win');
function showWin() {
    winOverlay.style.display = 'flex';
    setTimeout(() => { winOverlay.style.display = 'none'; respawn(); }, 4000);
}

// ---------- Loop: 30 Hz Logik, Rendering mit Interpolation ----------
const LOGIC_DT = 1000 / 30;
let last = performance.now(), acc = 0, gameTicks = 0;
let lastPad = null;

function logicTick(pad) {
    // Tastatur -> Stick (WASD); ohne Eingabe nullen, wenn kein Gamepad da ist
    if (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) {
        const sx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
        const sy = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
        const len = Math.hypot(sx, sy);
        m.stickX = Math.round(sx / len * 64);
        m.stickY = Math.round(sy / len * 64);
        m.stickMagRaw = 64;
    } else if (!pad) {
        m.stickX = 0; m.stickY = 0; m.stickMagRaw = 0;
    }

    // Buttons von Gamepad/Tastatur
    const aDown = !!(pad ? pad.a : keys.Space);
    const bDown = !!(pad ? pad.b : keys.KeyF);
    const zDown = !!(pad ? pad.z : (keys.KeyC || keys.ShiftLeft || keys.ShiftRight));
    m.aPressed = aDown && !m.aDown;
    m.bPressed = bDown && !m.bDown;
    m.zPressed = zDown && !m.zDown;
    m.aDown = aDown; m.bDown = bDown; m.zDown = zDown;

    const before = m.action;
    const wasAir = AIR_ACTIONS.includes(m.action);
    marioStep(m, world, currentCamYaw);
    if (m.action !== before) sfxForAction(m.action);
    else if (wasAir && !AIR_ACTIONS.includes(m.action)) sfx.land();
    else if (m.action === ACT.WALKING && m.forwardVel > 4) {
        m.stepDist = (m.stepDist || 0) + m.forwardVel;
        if (m.stepDist > 90) { m.stepDist = 0; sfx.step(); }
    }
    gameTicks++;

    // Absturz in die Leere -> Respawn
    if (m.pos[1] < -1500) { respawn(); sfx.fall(); }
}

let currentCamYaw = 0;
let prevRenderPos = [0, 0, 0];

function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(100, now - last);
    last = now;
    acc += dt;

    const pad = readGamepad(m);
    let ticks = 0;
    while (acc >= LOGIC_DT && ticks < 4) {
        logicTick(pad);
        acc -= LOGIC_DT;
        ticks++;
    }

    // Kamera-Update pro Frame (weich)
    currentCamYaw = updateCamera(dt / 1000, pad, true);

    // Interpolation zwischen Logik-Ticks
    const alpha = Math.min(1, acc / LOGIC_DT);
    const rx = m.prevPos[0] + (m.pos[0] - m.prevPos[0]) * alpha;
    const ry = m.prevPos[1] + (m.pos[1] - m.prevPos[1]) * alpha;
    const rz = m.prevPos[2] + (m.pos[2] - m.prevPos[2]) * alpha;

    animateMario(mario, m, dt / 1000, now / 1000);
    mario.root.position.set(rx, ry, rz);

    // Muenzen drehen + einsammeln
    for (const c of COINS) {
        if (c.taken) continue;
        const mesh = coinMeshes.get(c);
        mesh.rotation.y = now / 300;
        const dx = rx - c.x, dy = ry + 80 - c.y, dz = rz - c.z;
        if (dx * dx + dy * dy + dz * dz < 90 * 90) {
            c.taken = true; m.coinCount++;
            mesh.visible = false;
            sfx.coin();
        }
    }
    starMesh.rotation.y = now / 500;
    if (!STAR.taken) {
        const dx = rx - STAR.x, dy = ry + 80 - STAR.y, dz = rz - STAR.z;
        if (dx * dx + dy * dy + dz * dz < 110 * 110) {
            STAR.taken = true; starMesh.visible = false;
            sfx.star();
            showWin();
        }
    }

    // HUD
    hudAction.textContent = ACT_NAME[m.action] || ('Aktion ' + m.action);
    hudSpeed.textContent = m.forwardVel.toFixed(2);
    hudVel.textContent = m.vel[1].toFixed(2);
    hudPos.textContent = `${m.pos[0].toFixed(0)} / ${m.pos[1].toFixed(0)} / ${m.pos[2].toFixed(0)}`;
    hudStick.textContent = m.stickMagRaw.toFixed(0);
    hudCoins.textContent = m.coinCount;
    hudDev.textContent = `action=${m.action} prev=${m.prevAction} arg=${m.actionArg} timer=${m.actionTimer} wallKick=${m.wallKickTimer} dj=${m.doubleJumpTimer} peak=${m.peakHeight.toFixed(0)} floorNy=${m.floor ? m.floor.ny.toFixed(3) : '-'}`;

    renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
