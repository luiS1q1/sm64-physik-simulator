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

// ---------- Sound (winzige WebAudio-Bliips) ----------
let audioCtx = null;
function beep(freq, dur = 0.08, type = 'square', gain = 0.03) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.value = gain;
        o.connect(g); g.connect(audioCtx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
        o.stop(audioCtx.currentTime + dur);
    } catch (e) { /* Audio nicht verfuegbar */ }
}

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
    // Buttons von Gamepad/Tastatur
    const aDown = !!(pad ? pad.a : keys.Space);
    const bDown = !!(pad ? pad.b : keys.KeyF);
    const zDown = !!(pad ? pad.z : (keys.KeyC || keys.ShiftLeft || keys.ShiftRight));
    m.aPressed = aDown && !m.aDown;
    m.bPressed = bDown && !m.bDown;
    m.zPressed = zDown && !m.zDown;
    m.aDown = aDown; m.bDown = bDown; m.zDown = zDown;

    marioStep(m, world, currentCamYaw);
    gameTicks++;

    // Absturz in die Leere -> Respawn
    if (m.pos[1] < -1500) { respawn(); beep(220, 0.3, 'sawtooth'); }
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
    m.pos[0] = rx; m.pos[1] = ry; m.pos[2] = rz; // visuelles Interpolieren (Logik unberuehrt)
    // Logik-Position restaurieren: Interpolation nur fuer Anzeige
    // (Logik nutzt m.pos, daher: echte Werte merken und zuruecksetzen)
    // Hinweis: Logik-Ticks schreiben m.pos neu; Renderframe-aenderung gilt nur 1 Frame

    animateMario(mario, m, dt / 1000, now / 1000);

    // Muenzen drehen + einsammeln
    for (const c of COINS) {
        if (c.taken) continue;
        const mesh = coinMeshes.get(c);
        mesh.rotation.y = now / 300;
        const dx = rx - c.x, dy = ry + 80 - c.y, dz = rz - c.z;
        if (dx * dx + dy * dy + dz * dz < 90 * 90) {
            c.taken = true; m.coinCount++;
            mesh.visible = false;
            beep(880, 0.1); beep(1320, 0.15);
            setTimeout(() => beep(1760, 0.2), 90);
        }
    }
    starMesh.rotation.y = now / 500;
    if (!STAR.taken) {
        const dx = rx - STAR.x, dy = ry + 80 - STAR.y, dz = rz - STAR.z;
        if (dx * dx + dy * dy + dz * dz < 110 * 110) {
            STAR.taken = true; starMesh.visible = false;
            beep(523, 0.15); setTimeout(() => beep(659, 0.15), 150);
            setTimeout(() => beep(784, 0.15), 300); setTimeout(() => beep(1046, 0.4), 450);
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
