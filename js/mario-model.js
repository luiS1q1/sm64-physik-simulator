// ============================================================
//  Mario-Modell: prozedural gebaut (160 Einheiten gross,
//  Proportionen nach dem SM64-Vorbild), Animationen nach Aktion.
// ============================================================
import * as THREE from 'three';
import { ACT, ACT_NAME, sins, coss, s16Wrap } from './physics.js';

const RED = 0xd02818, BLUE = 0x2038ec, SKIN = 0xf0a868, BROWN = 0x6a3410,
      WHITE = 0xf8f8f8, DARK = 0x402008, YELLOW = 0xf0c000;

function part(geo, color, x, y, z) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    return mesh;
}

export function buildMario() {
    const root = new THREE.Group();      // Position im Level
    const body = new THREE.Group();      // Rotation (Yaw)
    root.add(body);

    const parts = {};

    // Koerper
    parts.torso = part(new THREE.BoxGeometry(64, 52, 44), BLUE, 0, 92, 0);
    parts.chest = part(new THREE.BoxGeometry(66, 26, 46), RED, 0, 124, 0);
    // Overall-Traeger
    parts.strapL = part(new THREE.BoxGeometry(14, 40, 48), BLUE, -16, 118, 0);
    parts.strapR = part(new THREE.BoxGeometry(14, 40, 48), BLUE, 16, 118, 0);
    parts.buttonL = part(new THREE.SphereGeometry(6, 8, 8), YELLOW, -16, 104, 23);
    parts.buttonR = part(new THREE.SphereGeometry(6, 8, 8), YELLOW, 16, 104, 23);

    // Kopf + Kappe
    parts.head = part(new THREE.SphereGeometry(34, 16, 14), SKIN, 0, 152, 0);
    parts.nose = part(new THREE.SphereGeometry(12, 10, 8), SKIN, 0, 148, 30);
    parts.mustache = part(new THREE.BoxGeometry(34, 8, 10), DARK, 0, 142, 28);
    parts.earL = part(new THREE.SphereGeometry(9, 8, 8), SKIN, -32, 150, 2);
    parts.earR = part(new THREE.SphereGeometry(9, 8, 8), SKIN, 32, 150, 2);
    parts.cap = part(new THREE.SphereGeometry(35, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), RED, 0, 158, 0);
    parts.visor = part(new THREE.CylinderGeometry(30, 34, 8, 16, 1, false, -Math.PI / 3.2, Math.PI / 1.6), RED, 0, 152, 12);
    // Augen (M-förmig angedeutet: zwei blaue Bloecke)
    parts.eyeL = part(new THREE.SphereGeometry(6, 8, 8), 0x2244cc, -11, 154, 27);
    parts.eyeR = part(new THREE.SphereGeometry(6, 8, 8), 0x2244cc, 11, 154, 27);

    // Arme (Gruppen mit Pivot an der Schulter)
    parts.armL = new THREE.Group(); parts.armL.position.set(-38, 122, 0);
    parts.armR = new THREE.Group(); parts.armR.position.set(38, 122, 0);
    for (const [arm, side] of [[parts.armL, -1], [parts.armR, 1]]) {
        const sleeve = part(new THREE.SphereGeometry(13, 10, 8), RED, side * 6, 0, 0);
        const upper = part(new THREE.BoxGeometry(16, 34, 16), RED, 0, -14, 0);
        const glove = part(new THREE.SphereGeometry(12, 10, 8), WHITE, 0, -36, 0);
        arm.add(sleeve, upper, glove);
    }

    // Beine (Pivot an der Huefte)
    parts.legL = new THREE.Group(); parts.legL.position.set(-18, 66, 0);
    parts.legR = new THREE.Group(); parts.legR.position.set(18, 66, 0);
    for (const leg of [parts.legL, parts.legR]) {
        const thigh = part(new THREE.BoxGeometry(22, 40, 24), BLUE, 0, -16, 0);
        const shoe = part(new THREE.BoxGeometry(26, 18, 40), BROWN, 0, -44, 8);
        leg.add(thigh, shoe);
    }

    body.add(parts.torso, parts.chest, parts.strapL, parts.strapR, parts.buttonL, parts.buttonR,
        parts.head, parts.nose, parts.mustache, parts.earL, parts.earR, parts.cap, parts.visor,
        parts.eyeL, parts.eyeR, parts.armL, parts.armR, parts.legL, parts.legR);

    // Gesamtgroesse pruefen: Kopf oben bei ~192 -> aufs 160er-Mass gestaucht
    body.scale.set(0.83, 0.83, 0.83);

    parts.body = body;
    return { root, parts };
}

// ---------- Animation pro Aktion ----------
export function animateMario(mario, m, dt, time) {
    const { root, parts } = mario;
    root.position.set(m.pos[0], m.pos[1], m.pos[2]);
    parts.body.rotation.y = s16Wrap(m.faceAngle[1]) * Math.PI / 32768;

    const moving = Math.hypot(m.vel[0], m.vel[2]) > 1;
    const walkPhase = time * Math.min(14, 2 + m.forwardVel * 0.45);
    const swing = Math.sin(walkPhase);

    // Grundhaltung
    parts.legL.rotation.x = 0; parts.legR.rotation.x = 0;
    parts.armL.rotation.x = 0; parts.armR.rotation.x = 0;
    parts.armL.rotation.z = 0.25; parts.armR.rotation.z = -0.25;
    parts.body.rotation.x = 0; parts.body.rotation.z = 0;
    parts.body.position.y = 0;
    parts.body.scale.y = 0.83;

    switch (m.action) {
        case ACT.WALKING: case ACT.TURNING_AROUND: case ACT.BRAKING:
            if (moving) {
                parts.legL.rotation.x = swing * 0.8;
                parts.legR.rotation.x = -swing * 0.8;
                parts.armL.rotation.x = -swing * 0.7;
                parts.armR.rotation.x = swing * 0.7;
                parts.body.rotation.x = 0.12 + m.forwardVel / 48 * 0.12; // Lauf-Lean
            }
            break;
        case ACT.JUMP: case ACT.DOUBLE_JUMP: case ACT.TRIPLE_JUMP: case ACT.WALL_KICK_AIR:
            // Arme hoch, Beine angezogen
            parts.armL.rotation.x = -2.6; parts.armR.rotation.x = -2.6;
            parts.legL.rotation.x = m.vel[1] > 0 ? 0.7 : 0.2;
            parts.legR.rotation.x = m.vel[1] > 0 ? 0.4 : 0.2;
            break;
        case ACT.FREEFALL:
            parts.armL.rotation.x = -2.2; parts.armR.rotation.x = -2.2;
            parts.legL.rotation.x = 0.3; parts.legR.rotation.x = -0.3;
            break;
        case ACT.BACKFLIP:
            parts.body.rotation.x = -Math.sin(time * 6) * 1.2;
            parts.armL.rotation.x = -2.8; parts.armR.rotation.x = -2.8;
            break;
        case ACT.SIDE_FLIP:
            parts.body.rotation.z = Math.sin(time * 6) * 1.2;
            parts.armL.rotation.x = -2.4; parts.armR.rotation.x = -2.4;
            break;
        case ACT.DIVE: case ACT.STOMACH_SLIDE: case ACT.SLIDE_KICK_SLIDE:
            // Hecht: Face-Pitch wie im Decomp (-0x2AAA max)
            parts.body.rotation.x = -1.25;
            parts.armL.rotation.x = -3.0; parts.armR.rotation.x = -3.0;
            parts.legL.rotation.x = 0.15; parts.legR.rotation.x = 0.15;
            break;
        case ACT.GROUND_POUND:
            if (m.actionState === 0) {
                parts.body.rotation.y += 0.0; // Drehung im Decomp anim-basiert
                parts.armL.rotation.x = -2.0; parts.armR.rotation.x = -2.0;
                parts.legL.rotation.x = -0.5; parts.legR.rotation.x = -0.5;
            } else {
                parts.legL.rotation.x = -0.9; parts.legR.rotation.x = -0.9;
                parts.armL.rotation.x = -0.6; parts.armR.rotation.x = -0.6;
            }
            break;
        case ACT.CROUCHING: case ACT.CROUCH_SLIDE:
            parts.body.scale.y = 0.55;
            parts.legL.rotation.x = 1.2; parts.legR.rotation.x = 1.2;
            parts.armL.rotation.x = 0.6; parts.armR.rotation.x = 0.6;
            break;
        case ACT.WALL_SLIDE:
            parts.armL.rotation.x = -2.9; parts.armR.rotation.x = -2.9;
            parts.legL.rotation.x = 0.9; parts.legR.rotation.x = 0.5;
            break;
        case ACT.PUNCHING:
            parts.armR.rotation.x = -1.5 + Math.sin(m.actionTimer) * 0.5;
            break;
        case ACT.SOFT_LAND: case ACT.HARD_BONK:
            parts.body.rotation.x = 0.4;
            parts.armL.rotation.x = 0.9; parts.armR.rotation.x = 0.9;
            break;
        default:
            if (moving) {
                parts.legL.rotation.x = swing * 0.6;
                parts.legR.rotation.x = -swing * 0.6;
                parts.armL.rotation.x = -swing * 0.5;
                parts.armR.rotation.x = swing * 0.5;
            }
            break;
    }
}
