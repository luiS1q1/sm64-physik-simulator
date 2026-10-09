// ============================================================
//  Level: "Hennef-Huegel" - kleines SM64-Testlevel
//  Kollisionsdreiecke in SM64-Einheiten (Mario 160 Einheiten
//  gross wie im Original). Windungen so, dass Normalen nach
//  oben (Boeden) bzw. nach aussen (Waende) zeigen.
// ============================================================
import * as THREE from 'three';
import { CollisionWorld, SURFACE } from './physics.js';

const world = new CollisionWorld();
const group = new THREE.Group();

// ---- Texturen: kleine 64px-Kacheln, Kachelgroesse 200 Einheiten ----
function canvasTex(draw) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    draw(cv.getContext('2d'));
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    return tex;
}
const T = {
    grass: canvasTex((c) => {
        c.fillStyle = '#3f8a36'; c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#4c9d40';
        for (let i = 0; i < 64; i += 8) for (let j = 0; j < 64; j += 16)
            c.fillRect(i + ((j >> 4) % 2) * 8, j, 8, 8);
    }),
    dirt: canvasTex((c) => {
        c.fillStyle = '#a1794a'; c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#946a3e';
        for (let i = 0; i < 40; i++) c.fillRect((i * 17) % 60, (i * 29) % 60, 4 + (i % 3) * 3, 3);
    }),
    stone: canvasTex((c) => {
        c.fillStyle = '#8f8f83'; c.fillRect(0, 0, 64, 64);
        c.strokeStyle = '#6f6f66'; c.lineWidth = 3;
        for (let y = 0; y <= 64; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(64, y); c.stroke(); }
        for (let y = 0; y < 64; y += 16) { const off = ((y >> 4) % 2) * 16; for (let x = off; x <= 64; x += 32) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 16); c.stroke(); } }
    }),
    wood: canvasTex((c) => {
        c.fillStyle = '#8a5a2a'; c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#7a4c20';
        for (let x = 0; x < 64; x += 16) c.fillRect(x, 0, 2, 64);
    }),
    ice: canvasTex((c) => {
        c.fillStyle = '#aee2ff'; c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#c4ecff';
        for (let i = 0; i < 6; i++) c.fillRect(0, i * 12 + 2, 64, 3);
    }),
    mud: canvasTex((c) => {
        c.fillStyle = '#6a5233'; c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#5c4629';
        for (let i = 0; i < 20; i++) c.fillRect((i * 13) % 58, (i * 23) % 58, 6, 4);
    }),
    check: canvasTex((c) => {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++)
            { c.fillStyle = (i + j) % 2 ? '#d8d8c8' : '#efece0'; c.fillRect(i * 32, j * 32, 32, 32); }
    }),
};
const MAT = {
    grass: new THREE.MeshLambertMaterial({ map: T.grass }),
    dirt:  new THREE.MeshLambertMaterial({ map: T.dirt }),
    stone: new THREE.MeshLambertMaterial({ map: T.stone }),
    brick: new THREE.MeshLambertMaterial({ color: 0xc46a4a }),
    wood:  new THREE.MeshLambertMaterial({ map: T.wood }),
    ice:   new THREE.MeshLambertMaterial({ map: T.ice, transparent: true, opacity: 0.92 }),
    mud:   new THREE.MeshLambertMaterial({ map: T.mud }),
    check: new THREE.MeshLambertMaterial({ map: T.check }),
};

function tri(p1, p2, p3, mat, type) {
    world.addTri(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], type);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p1, ...p2, ...p3], 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, mat));
}
function quad(p1, p2, p3, p4, mat, type) {
    tri(p1, p2, p3, mat, type);
    tri(p1, p3, p4, mat, type);
}
// Box: Decke (unten, Normale nach unten), 4 Waende nach aussen, Boden (oben, Normale nach oben)
function box(x0, x1, z0, z1, y0, y1, mat, type = SURFACE.DEFAULT) {
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], mat, type);   // oben (Boden)
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], mat, type);   // unten (Decke)
    quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], mat, type);   // -z Wand
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], mat, type);   // +x Wand
    quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], mat, type);   // +z Wand
    quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], mat, type);   // -x Wand
}
// Rampe entlang +z (steigt von z0/yLo zu z1/yHi), Seitenwaende
function rampZ(x0, x1, z0, z1, yLo, yHi, mat, type = SURFACE.DEFAULT) {
    quad([x0, yLo, z0], [x0, yHi, z1], [x1, yHi, z1], [x1, yLo, z0], mat, type);
    tri([x0, yLo, z0], [x0, yHi, z1], [x0, yHi, z0], mat, type);   // Seite -x
    tri([x1, yLo, z0], [x1, yHi, z1], [x1, yHi, z0], mat, type);   // Seite +x
}
// Rampe entlang +x
function rampX(x0, x1, z0, z1, yLo, yHi, mat, type = SURFACE.DEFAULT) {
    quad([x0, yLo, z0], [x0, yLo, z1], [x1, yHi, z1], [x1, yHi, z0], mat, type);
    tri([x0, yLo, z0], [x0, yLo, z1], [x1, yHi, z1], mat, type);
    tri([x0, yLo, z0], [x1, yHi, z0], [x1, yHi, z1], mat, type);
}

// --- Haupt-Plaza (4000 x 4000, bis -400 massiv) ---
box(-2000, 2000, -2000, 2000, -400, 0, MAT.grass);
box(-2200, 2200, -2200, 2200, -500, -400, MAT.dirt);

// --- Mittelhuegel: Rampe (ca. 20 Grad, lauffaehig) + Plateau ---
rampZ(-500, 500, -900, 200, 0, 400, MAT.dirt);
box(-500, 500, 200, 1000, 350, 400, MAT.dirt);

// --- Steile Eis-Rutschrampe (35 Grad: steil => Rutschen) ---
rampX(900, 1470, -300, 300, 400, 0, MAT.ice, SURFACE.VERY_SLIPPERY);
box(1470, 1600, -300, 300, -50, 0, MAT.stone);

// --- Matsch-Ecke (langsam, Ziel 24 statt 32) ---
box(900, 1300, 900, 1300, -10, 6, MAT.mud, SURFACE.SLOW);

// --- Langsprung-Schlucht (500 Einheiten Loch, void darunter) ---
box(-1800, -1200, 900, 1500, -400, 0, MAT.check);
box(-2900, -2300, 900, 1500, -400, 0, MAT.check);

// --- Wall-Kick-Korridor: Waende 250 auseinander, Plattform oben ---
box(-150, 100, -1500, -1400, 0, 1300, MAT.brick);
box(350, 600, -1500, -1400, 0, 1300, MAT.brick);
box(-150, 600, -1600, -1400, 1250, 1350, MAT.wood);

// --- Schwebende Sprung-Plattformen (Uebungskette) ---
box(-100, 200, -1050, -850, 130, 180, MAT.wood);
box(150, 450, -1250, -1050, 280, 330, MAT.wood);
box(-100, 200, -1350, -1150, 430, 480, MAT.wood);

// --- Treppe (Stufen je 100 hoch, wie im Original begehbar) ---
for (let i = 0; i < 4; i++) {
    box(600 + i * 200, 800 + i * 200, 900, 1100, -400, (i + 1) * 100, MAT.stone);
}

// --- Baeume ---
function tree(x, z) {
    box(x - 40, x + 40, z - 40, z + 40, 0, 200, MAT.wood);
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(35, 45, 200, 8), MAT.wood);
    trunk.position.y = 100;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(180, 12, 10),
        new THREE.MeshLambertMaterial({ color: 0x2f7d2f }));
    crown.position.y = 340;
    g.add(trunk, crown);
    g.position.set(x, 0, z);
    group.add(g);
}
tree(-800, -400); tree(-1000, -600); tree(700, -700); tree(-600, 1200); tree(1300, 900); tree(1600, -900);

// --- Schild am Start ---
box(200, 320, 400, 520, 0, 260, MAT.wood);
const signTop = new THREE.Mesh(new THREE.BoxGeometry(220, 140, 20),
    new THREE.MeshLambertMaterial({ color: 0xf0e6c8 }));
signTop.position.set(260, 330, 460);
group.add(signTop);

// --- Muenzen & Stern ---
export const COINS = [];
function coin(x, y, z) { COINS.push({ x, y, z, taken: false }); }
for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    coin(Math.cos(a) * 700, 100, Math.sin(a) * 700);
}
coin(50, 260, -950);
coin(300, 410, -1150);
coin(50, 560, -1250);
coin(225, 1420, -1500);
coin(0, 480, 600); coin(0, 480, 700);

export const STAR = { x: 225, y: 1450, z: -1500, taken: false };

export { world, group, MAT };
