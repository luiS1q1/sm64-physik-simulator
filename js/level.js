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

const MAT = {
    grass: new THREE.MeshLambertMaterial({ color: 0x58b849 }),
    dirt:  new THREE.MeshLambertMaterial({ color: 0xb08850 }),
    stone: new THREE.MeshLambertMaterial({ color: 0x9a9a8e }),
    brick: new THREE.MeshLambertMaterial({ color: 0xc46a4a }),
    wood:  new THREE.MeshLambertMaterial({ color: 0x8a5a2a }),
    ice:   new THREE.MeshLambertMaterial({ color: 0xaee2ff }),
    mud:   new THREE.MeshLambertMaterial({ color: 0x6a5233 }),
    check: new THREE.MeshLambertMaterial({ color: 0xd8d8c8 }),
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
