// ============================================================
//  SM64-Physik - 1:1-Port der Decomp-Werte
//  Quelle: n64decomp/sm64 (MIT)
//  mario_step.c, mario.c, mario_actions_airborne.c,
//  mario_actions_moving.c, surface_collision.c
//  Logik-Tick 30 Hz, 4 Viertelschritte (qSteps) pro Tick,
//  s16-Winkelsystem wie im Original (65536 = 360 Grad).
// ============================================================

export const s16Wrap = (a) => { a = a % 65536; return a < 0 ? a + 65536 : a; };
export const sins = (a) => Math.sin(s16Wrap(a) * Math.PI / 32768);
export const coss = (a) => Math.cos(s16Wrap(a) * Math.PI / 32768);
export function atan2s(z, x) { return s16Wrap(Math.round(Math.atan2(x, z) * 32768 / Math.PI)); }
export function approach_f32(cur, target, inc, dec) {
    if (cur < target) return Math.min(cur + inc, target);
    return Math.max(cur - dec, target);
}

export const SURFACE = { DEFAULT: 0, SLIPPERY: 1, VERY_SLIPPERY: 2, NOT_SLIPPERY: 3, SLOW: 4, ICE: 5 };
export const SCLASS = { DEFAULT: 0, NOT_SLIPPERY: 1, SLIPPERY: 2, VERY_SLIPPERY: 3 };

export const ACT = {
    IDLE: 0, WALKING: 1, BRAKING: 2, TURNING_AROUND: 4, CROUCHING: 5, CROUCH_SLIDE: 6,
    GROUND_POUND: 8, GROUND_POUND_LAND: 9, PUNCHING: 10,
    JUMP: 20, DOUBLE_JUMP: 21, TRIPLE_JUMP: 22, FREEFALL: 23, BACKFLIP: 24,
    SIDE_FLIP: 25, LONG_JUMP: 26, DIVE: 27, SLIDE_KICK_SLIDE: 28, STOMACH_SLIDE: 29,
    WALL_SLIDE: 30, WALL_KICK_AIR: 31, SOFT_LAND: 32, HARD_BONK: 33,
    JUMP_LAND: 40, FREEFALL_LAND: 41, DOUBLE_JUMP_LAND: 42, TRIPLE_JUMP_LAND: 43,
    LONG_JUMP_LAND: 44, BACKFLIP_LAND: 45,
    JUMP_LAND_STOP: 46, FREEFALL_LAND_STOP: 47, DOUBLE_JUMP_LAND_STOP: 48,
    TRIPLE_JUMP_LAND_STOP: 49, LONG_JUMP_LAND_STOP: 50, BACKFLIP_LAND_STOP: 51,
    SIDE_FLIP_LAND_STOP: 52,
};
export const ACT_NAME = {
    0: "Idle", 1: "Walking", 2: "Braking", 4: "Turning around", 5: "Crouching",
    6: "Crouch slide", 8: "Ground pound", 9: "GP land", 10: "Punching",
    20: "Jump", 21: "Double jump", 22: "Triple jump", 23: "Freefall", 24: "Backflip",
    25: "Side flip", 26: "Long jump", 27: "Dive", 28: "Slide kick", 29: "Stomach slide",
    30: "Wall slide", 31: "Wall kick", 32: "Soft land", 33: "Hard bonk",
    40: "Jump land", 41: "Freefall land", 42: "Double jump land", 43: "Triple jump land",
    44: "Long jump land", 45: "Backflip land", 46: "Jump land stop", 47: "Freefall land stop",
    48: "Double jump land stop", 49: "Triple jump land stop", 50: "Long jump land stop",
    51: "Backflip land stop", 52: "Side flip land stop",
};

export const INPUT = {
    A_PRESSED: 1 << 0, A_DOWN: 1 << 1, B_PRESSED: 1 << 2, Z_PRESSED: 1 << 4,
    NONZERO_ANALOG: 1 << 6, OFF_FLOOR: 1 << 7, ABOVE_SLIDE: 1 << 8,
};
export const FLAG = { CONTROL_JUMP_HEIGHT: 1, SHORT_HITBOX: 2 };

export class MarioState {
    constructor() {
        this.pos = [0, 0, 0]; this.prevPos = [0, 0, 0];
        this.vel = [0, 0, 0];
        this.faceAngle = [0, 0, 0];
        this.intendedYaw = 0; this.intendedMag = 0;
        this.forwardVel = 0;
        this.action = ACT.IDLE; this.prevAction = ACT.IDLE; this.actionArg = 0;
        this.actionTimer = 0; this.actionState = 0; this.actionFlags = 0;
        this.floor = null; this.floorHeight = 0; this.floorAngle = 0;
        this.wall = null; this.ceilHeight = 1e9;
        this.peakHeight = 0;
        this.wallKickTimer = 0; this.doubleJumpTimer = 0;
        this.slideVelX = 0; this.slideVelZ = 0; this.slideYaw = 0;
        this.input = 0;
        this.aPressed = false; this.aDown = false; this.bPressed = false; this.zPressed = false; this.zDown = false;
        this.coinCount = 0;
        this.stickMagRaw = 0; this.stickX = 0; this.stickY = 0; // N64-Einheit: -80..80
    }
}

// ---------- Kollisionswelt (Dreiecke, wie im Decomp surface_collision) ----------
export class CollisionWorld {
    constructor() { this.floors = []; this.walls = []; this.ceils = []; }
    addTri(x1, y1, z1, x2, y2, z2, x3, y3, z3, type = SURFACE.DEFAULT) {
        const ux = x2 - x1, uy = y2 - y1, uz = z2 - z1;
        const vx = x3 - x1, vy = y3 - y1, vz = z3 - z1;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        // Wall-Normale immer zur Kamera-/Spielerseite: +z bzw. horizontal dominanter Anteil
        let kind;
        if (ny > 0.7071) kind = 'floor';
        else if (ny < -0.7071) kind = 'ceil';
        else kind = 'wall';
        const tri = { x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, type, kind,
            minX: Math.min(x1, x2, x3), maxX: Math.max(x1, x2, x3),
            minZ: Math.min(z1, z2, z3), maxZ: Math.max(z1, z2, z3),
            minY: Math.min(y1, y2, y3), maxY: Math.max(y1, y2, y3) };
        if (kind === 'floor') this.floors.push(tri);
        else if (kind === 'ceil') this.ceils.push(tri);
        else this.walls.push(tri);
        return tri;
    }
    _inTriXZ(t, x, z) {
        const d1 = (x - t.x2) * (t.z1 - t.z2) - (t.x1 - t.x2) * (z - t.z2);
        const d2 = (x - t.x3) * (t.z2 - t.z3) - (t.x2 - t.x2) * (z - t.z3);
        const d3 = (x - t.x1) * (t.z3 - t.z1) - (t.x3 - t.x1) * (z - t.z1);
        const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(neg && pos);
    }
    _triHeightAt(t, x, z) {
        // Ebene durch 3 Punkte: h = -(nx*x + nz*z - d) / ny
        const d = t.nx * t.x1 + t.ny * t.y1 + t.nz * t.z1;
        if (Math.abs(t.ny) < 1e-9) return t.y1;
        return (d - t.nx * x - t.nz * z) / t.ny;
    }
    findFloor(x, y, z) { // Decomp find_floor: hoechster Boden <= y + 78
        let best = null, bestH = -1e9;
        for (const t of this.floors) {
            if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
            if (!this._inTriXZ(t, x, z)) continue;
            const h = this._triHeightAt(t, x, z);
            if (h <= y + 78.0 && h > bestH) { bestH = h; best = t; }
        }
        return best ? { tri: best, height: bestH } : null;
    }
    findCeil(x, y, z) { // niedrigste Decke >= y + 160
        let best = null, bestH = 1e9;
        for (const t of this.ceils) {
            if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
            if (!this._inTriXZ(t, x, z)) continue;
            const h = this._triHeightAt(t, x, z);
            if (h >= y + 160.0 && h < bestH) { bestH = h; best = t; }
        }
        return best ? { tri: best, height: bestH } : null;
    }
    resolveWalls(pos, offsetY, radius) {
        let hit = null;
        for (const t of this.walls) {
            if (pos[1] + offsetY < t.minY || pos[1] > t.maxY) continue;
            const d = t.nx * (pos[0] - t.x1) + t.nz * (pos[2] - t.z1);
            if (d < radius && d > -radius) {
                if (d >= 0) { pos[0] += t.nx * (radius - d); pos[2] += t.nz * (radius - d); }
                else { pos[0] += t.nx * (-radius - d); pos[2] += t.nz * (-radius - d); }
                hit = t;
            }
        }
        return hit;
    }
}

// ---------- Boden-Klassen (Decomp mario_get_floor_class etc.) ----------
function floorClass(m) {
    switch (m.floor ? m.floor.type : SURFACE.DEFAULT) {
        case SURFACE.NOT_SLIPPERY: return SCLASS.NOT_SLIPPERY;
        case SURFACE.SLIPPERY: case SURFACE.ICE: return SCLASS.SLIPPERY;
        case SURFACE.VERY_SLIPPERY: return SCLASS.VERY_SLIPPERY;
        default: return SCLASS.DEFAULT;
    }
}
export function floorIsSteep(m) {
    if (!m.floor) return false;
    let normY;
    switch (floorClass(m)) {
        case SCLASS.VERY_SLIPPERY: normY = 0.9659258; break; // cos 15
        case SCLASS.SLIPPERY:      normY = 0.9396926; break; // cos 20
        case SCLASS.NOT_SLIPPERY:  normY = 0.8660254; break; // cos 30
        default:                   normY = 0.8660254; break; // cos 30
    }
    return m.floor.ny <= normY;
}
export function floorIsSlope(m) {
    if (!m.floor) return false;
    let normY;
    switch (floorClass(m)) {
        case SCLASS.VERY_SLIPPERY: normY = 0.9961947; break; // cos 5
        case SCLASS.SLIPPERY:      normY = 0.9848077; break; // cos 10
        case SCLASS.NOT_SLIPPERY:  normY = 0.9396926; break; // cos 20
        default:                   normY = 0.9659258; break; // cos 15
    }
    return m.floor.ny <= normY;
}
export function floorIsSlippery(m) {
    const c = floorClass(m);
    return c === SCLASS.VERY_SLIPPERY || c === SCLASS.SLIPPERY;
}

// ---------- Stick (Decomp update_mario_joystick_inputs) ----------
function updateJoystickInputs(m, camYaw) {
    const mag = ((m.stickMagRaw / 64.0) * (m.stickMagRaw / 64.0)) * 64.0;
    m.intendedMag = mag / 2.0;
    if (m.intendedMag > 0.0) {
        m.intendedYaw = s16Wrap(atan2s(-m.stickY, m.stickX) + camYaw);
        m.input |= INPUT.NONZERO_ANALOG;
    } else {
        m.intendedYaw = m.faceAngle[1];
    }
}

// ---------- Gehen (Decomp update_walking_speed, exakt) ----------
export function updateWalkingSpeed(m) {
    const maxTargetSpeed = (m.floor && m.floor.type === SURFACE.SLOW) ? 24.0 : 32.0;
    const targetSpeed = m.intendedMag < maxTargetSpeed ? m.intendedMag : maxTargetSpeed;
    if (m.forwardVel <= 0.0) {
        m.forwardVel += 1.1;
    } else if (m.forwardVel <= targetSpeed) {
        m.forwardVel += 1.1 - m.forwardVel / 43.0;
    } else if (m.floor && m.floor.ny >= 0.95) {
        m.forwardVel -= 1.0;
    }
    if (m.forwardVel > 48.0) m.forwardVel = 48.0;
    m.faceAngle[1] = m.intendedYaw;
    setVelFromYaw(m);
}
export function setVelFromYaw(m) {
    m.vel[0] = m.slideVelX = m.forwardVel * sins(m.faceAngle[1]);
    m.vel[1] = 0.0;
    m.vel[2] = m.slideVelZ = m.forwardVel * coss(m.faceAngle[1]);
}
export function setForwardVel(m, speed) {
    m.slideVelX = speed * sins(m.faceAngle[1]);
    m.slideVelZ = speed * coss(m.faceAngle[1]);
    m.vel[0] = m.slideVelX; m.vel[1] = 0.0; m.vel[2] = m.slideVelZ;
    m.forwardVel = speed;
}
export function setYVelBasedOnFspeed(m, initialVel, multiplier) {
    m.vel[1] = initialVel + m.forwardVel * multiplier;
}

// ---------- Gravitation (Decomp apply_gravity, exakt) ----------
function shouldStrengthenGravityForJumpAscent(m) {
    if (!(m.actionFlags & FLAG.CONTROL_JUMP_HEIGHT)) return false;
    if (!(m.input & INPUT.A_DOWN) && m.vel[1] > 20.0) return true;
    return false;
}
export function applyGravity(m) {
    if (m.action === ACT.LONG_JUMP || m.action === ACT.SLIDE_KICK_SLIDE || m.action === ACT.STOMACH_SLIDE) {
        m.vel[1] -= 2.0;
        if (m.vel[1] < -75.0) m.vel[1] = -75.0;
    } else if (shouldStrengthenGravityForJumpAscent(m)) {
        m.vel[1] /= 4.0;
    } else {
        m.vel[1] -= 4.0;
        if (m.vel[1] < -75.0) m.vel[1] = -75.0;
    }
}

// ---------- Luft ohne Drehung (Decomp update_air_without_turn, exakt) ----------
export function updateAirWithoutTurn(m) {
    const dragThreshold = m.action === ACT.LONG_JUMP ? 48.0 : 32.0;
    m.forwardVel = approach_f32(m.forwardVel, 0.0, 0.35, 0.35);
    if (m.input & INPUT.NONZERO_ANALOG) {
        const intendedDYaw = s16Wrap(m.intendedYaw - m.faceAngle[1]);
        const intendedMag = m.intendedMag / 32.0;
        m.forwardVel += 1.5 * coss(intendedDYaw) * intendedMag;
        m.faceAngle[1] = s16Wrap(Math.round(m.faceAngle[1] + 512 * sins(intendedDYaw) * intendedMag));
    }
    if (m.forwardVel > dragThreshold) m.forwardVel -= 1.0;
    if (m.forwardVel < -16.0) m.forwardVel += 2.0;
    setVelFromYaw(m);
}

// ---------- Luft-Qsteps (Decomp perform_air_quarter_step) ----------
export const AIR_STEP = { NONE: 0, LANDED: 1, HIT_WALL: 2, GRABBED_LEDGE: 3 };
function airQuarterStep(m, world, nextPos, intendedPos, checkLedge) {
    const upperWall = world.resolveWalls(nextPos, 150.0, 50.0);
    const lowerWall = world.resolveWalls(nextPos, 30.0, 50.0);
    const fl = world.findFloor(nextPos[0], nextPos[1], nextPos[2]);
    const floorHeight = fl ? fl.height : 0;
    const ce = world.findCeil(nextPos[0], nextPos[1], nextPos[2]);
    const ceilHeight = ce ? ce.height : 1e9;
    m.wall = upperWall;
    if (!fl) {
        if (nextPos[1] <= m.floorHeight) { m.pos[1] = m.floorHeight; return AIR_STEP.LANDED; }
        m.pos[1] = nextPos[1];
        return AIR_STEP.NONE;
    }
    if (nextPos[1] <= floorHeight) {
        if (ceilHeight - floorHeight > 160.0) {
            m.pos[0] = nextPos[0]; m.pos[2] = nextPos[2];
            m.floor = fl.tri; m.floorHeight = floorHeight;
        }
        m.pos[1] = floorHeight;
        return AIR_STEP.LANDED;
    }
    if (nextPos[1] + 160.0 > ceilHeight) {
        if (m.vel[1] >= 0.0) { m.vel[1] = 0.0; m.pos[1] = nextPos[1]; return AIR_STEP.NONE; }
        if (nextPos[1] <= m.floorHeight) { m.pos[1] = m.floorHeight; return AIR_STEP.LANDED; }
        m.pos[1] = nextPos[1];
        return AIR_STEP.NONE;
    }
    if (checkLedge && !upperWall && lowerWall) {
        const dispX = nextPos[0] - intendedPos[0], dispZ = nextPos[2] - intendedPos[2];
        if (m.vel[1] <= 0 && dispX * m.vel[0] + dispZ * m.vel[2] <= 0) {
            const lpx = nextPos[0] - lowerWall.nx * 60.0, lpz = nextPos[2] - lowerWall.nz * 60.0;
            const lf = world.findFloor(lpx, nextPos[1] + 160.0, lpz);
            if (lf && lf.height - nextPos[1] > 100.0) {
                m.pos[0] = lpx; m.pos[1] = lf.height; m.pos[2] = lpz;
                m.floor = lf.tri; m.floorHeight = lf.height;
                m.floorAngle = atan2s(lf.tri.nz, lf.tri.nx);
                m.faceAngle[1] = s16Wrap(atan2s(lowerWall.nz, lowerWall.nx) + 0x8000);
                return AIR_STEP.GRABBED_LEDGE;
            }
        }
        m.pos[0] = nextPos[0]; m.pos[1] = nextPos[1]; m.pos[2] = nextPos[2];
        m.floor = fl.tri; m.floorHeight = floorHeight;
        return AIR_STEP.NONE;
    }
    m.pos[0] = nextPos[0]; m.pos[1] = nextPos[1]; m.pos[2] = nextPos[2];
    m.floor = fl.tri; m.floorHeight = floorHeight;
    if (upperWall || lowerWall) {
        m.wall = upperWall || lowerWall;
        const wallDYaw = s16Wrap(atan2s(m.wall.nz, m.wall.nx) - m.faceAngle[1]);
        // decomp: Wand nur frontal getroffen, wenn |wallDYaw| > 0x6000 (135 Grad)
        if (wallDYaw >= 0x6000 && wallDYaw <= 0xA000) return AIR_STEP.HIT_WALL;
    }
    return AIR_STEP.NONE;
}

function performAirStep(m, world, checkLedge) {
    m.wall = null;
    let stepResult = AIR_STEP.NONE;
    for (let i = 0; i < 4; i++) {
        const intendedPos = [m.pos[0], m.pos[1], m.pos[2]];
        const nextPos = [m.pos[0] + m.vel[0] / 4.0, m.pos[1] + m.vel[1] / 4.0, m.pos[2] + m.vel[2] / 4.0];
        const r = airQuarterStep(m, world, nextPos, intendedPos, checkLedge);
        if (r !== AIR_STEP.NONE) stepResult = r;
        if (r === AIR_STEP.LANDED || r === AIR_STEP.GRABBED_LEDGE) break;
    }
    if (m.vel[1] >= 0.0) m.peakHeight = m.pos[1];
    applyGravity(m); // Decomp: perform_air_step ruft am Ende apply_gravity
    return stepResult;
}

// ---------- Boden-Qsteps (Decomp perform_ground_quarter_step) ----------
const GROUND_STEP = { NONE: 0, HIT_WALL: 1, LEFT_GROUND: 2, STOP: 3 };
function groundQuarterStep(m, world, nextPos) {
    const upperWall = world.resolveWalls(nextPos, 60.0, 50.0);
    const lowerWall = world.resolveWalls(nextPos, 30.0, 24.0);
    const fl = world.findFloor(nextPos[0], nextPos[1], nextPos[2]);
    const ce = world.findCeil(nextPos[0], nextPos[1], nextPos[2]);
    const ceilHeight = ce ? ce.height : 1e9;
    m.wall = upperWall;
    if (!fl) return GROUND_STEP.STOP; // decomp: HIT_WALL_STOP_QSTEPS
    const floorHeight = fl.height;
    if (nextPos[1] > floorHeight + 100.0) {
        if (nextPos[1] + 160.0 >= ceilHeight) return GROUND_STEP.STOP;
        m.pos[0] = nextPos[0]; m.pos[1] = nextPos[1]; m.pos[2] = nextPos[2];
        m.floor = fl.tri; m.floorHeight = floorHeight;
        return GROUND_STEP.LEFT_GROUND;
    }
    if (floorHeight + 160.0 >= ceilHeight) return GROUND_STEP.STOP;
    m.pos[0] = nextPos[0]; m.pos[1] = floorHeight; m.pos[2] = nextPos[2];
    m.floor = fl.tri; m.floorHeight = floorHeight;
    if (upperWall) {
        const wallDYaw = s16Wrap(atan2s(upperWall.nz, upperWall.nx) - m.faceAngle[1]);
        if (wallDYaw >= 0x2AAA && wallDYaw <= 0x5555) return GROUND_STEP.NONE;      // Streifer
        if (wallDYaw >= 0xAAAB && wallDYaw <= 0xD556) return GROUND_STEP.NONE;      // Streifer
        return GROUND_STEP.HIT_WALL; // decomp: CONTINUE_QSTEPS
    }
    return GROUND_STEP.NONE;
}

function performGroundStep(m, world) {
    let stepResult = GROUND_STEP.NONE;
    for (let i = 0; i < 4; i++) {
        const nY = m.floor ? m.floor.ny : 1.0;
        const nextPos = [
            m.pos[0] + nY * (m.vel[0] / 4.0),
            m.pos[1],
            m.pos[2] + nY * (m.vel[2] / 4.0),
        ];
        const r = groundQuarterStep(m, world, nextPos);
        if (r === GROUND_STEP.LEFT_GROUND || r === GROUND_STEP.STOP) { stepResult = r; break; }
        stepResult = r; // NONE oder HIT_WALL (weiterlaufen wie im Decomp)
    }
    return stepResult;
}

// ---------- Hangabtrieb (Decomp apply_slope_accel) ----------
function applySlopeAccel(m) {
    const floor = m.floor;
    if (!floor) { setVelFromYaw(m); return; }
    const steepness = Math.hypot(floor.nx, floor.nz);
    const floorDYaw = s16Wrap(m.floorAngle - m.faceAngle[1]);
    if (floorIsSlope(m)) {
        let slopeAccel;
        switch (floorClass(m)) {
            case SCLASS.VERY_SLIPPERY: slopeAccel = 5.3; break;
            case SCLASS.SLIPPERY:      slopeAccel = 2.7; break;
            case SCLASS.NOT_SLIPPERY:  slopeAccel = 0.0; break;
            default:                   slopeAccel = 1.7; break;
        }
        let fd = floorDYaw > 32767 ? floorDYaw - 65536 : floorDYaw;
        if (fd > -0x4000 && fd < 0x4000) m.forwardVel += slopeAccel * steepness;
        else m.forwardVel -= slopeAccel * steepness;
    }
    m.slideYaw = m.faceAngle[1];
    m.slideVelX = m.forwardVel * sins(m.faceAngle[1]);
    m.slideVelZ = m.forwardVel * coss(m.faceAngle[1]);
    m.vel[0] = m.slideVelX; m.vel[1] = 0.0; m.vel[2] = m.slideVelZ;
}

// ---------- Rutschen (Decomp update_sliding + update_sliding_angle, exakt) ----------
export function updateSliding(m, stopSpeed) {
    let stopped = false;
    let forward = coss(s16Wrap(m.faceAngle[1] - m.slideYaw));
    let sideward = sins(s16Wrap(m.faceAngle[1] - m.slideYaw));
    // 10k-Glitch (decomp exakt)
    if (forward < 0.0 && m.forwardVel >= 0.0) forward *= 0.5 + 0.5 * m.forwardVel / 100.0;
    let accel, lossFactor;
    switch (floorClass(m)) {
        case SCLASS.VERY_SLIPPERY: accel = 10.0; lossFactor = m.intendedMag / 32.0 * forward * 0.02 + 0.98; break;
        case SCLASS.SLIPPERY:      accel = 8.0;  lossFactor = m.intendedMag / 32.0 * forward * 0.02 + 0.96; break;
        case SCLASS.NOT_SLIPPERY:  accel = 5.0;  lossFactor = m.intendedMag / 32.0 * forward * 0.02 + 0.92; break;
        default:                   accel = 7.0;  lossFactor = m.intendedMag / 32.0 * forward * 0.02 + 0.92; break;
    }
    const oldSpeed = Math.hypot(m.slideVelX, m.slideVelZ);
    // decomp: leicht asymmetrisch (neues X, altes Z)
    m.slideVelX += m.slideVelZ * (m.intendedMag / 32.0) * sideward * 0.05;
    m.slideVelZ -= m.slideVelX * (m.intendedMag / 32.0) * sideward * 0.05;
    const newSpeed = Math.hypot(m.slideVelX, m.slideVelZ);
    if (oldSpeed > 0.0 && newSpeed > 0.0) {
        m.slideVelX = m.slideVelX * oldSpeed / newSpeed;
        m.slideVelZ = m.slideVelZ * oldSpeed / newSpeed;
    }
    updateSlidingAngle(m, accel, lossFactor);
    if (!floorIsSlope(m) && m.forwardVel * m.forwardVel < stopSpeed * stopSpeed) {
        setForwardVel(m, 0.0);
        stopped = true;
    }
    return stopped;
}

function updateSlidingAngle(m, accel, lossFactor) {
    const floor = m.floor;
    if (!floor) return;
    const slopeAngle = atan2s(floor.nz, floor.nx);
    const steepness = Math.hypot(floor.nx, floor.nz);
    m.slideVelX += accel * steepness * sins(slopeAngle);
    m.slideVelZ += accel * steepness * coss(slopeAngle);
    m.slideVelX *= lossFactor;
    m.slideVelZ *= lossFactor;
    m.slideYaw = atan2s(m.slideVelZ, m.slideVelX);
    let facingDYaw = s16Wrap(m.faceAngle[1] - m.slideYaw);
    let newFacingDYaw = facingDYaw;
    if (newFacingDYaw > 0 && newFacingDYaw <= 0x4000) {
        if ((newFacingDYaw -= 0x200) < 0) newFacingDYaw = 0;
    } else if (newFacingDYaw > 0xC000) {
        if ((newFacingDYaw += 0x200) > 0xFFFF) newFacingDYaw = 0; // Richtung Rueckwaerts-Facing annaehern
    } else if (newFacingDYaw >= 0x4000 && newFacingDYaw <= 0x8000) {
        newFacingDYaw = 0x8000;
    } else {
        newFacingDYaw = 0;
    }
    m.faceAngle[1] = s16Wrap(Math.round(m.slideYaw + newFacingDYaw));
    let speed = Math.hypot(m.slideVelX, m.slideVelZ);
    m.forwardVel = newFacingDYaw === 0x8000 ? -speed : speed;
    m.vel[0] = m.slideVelX; m.vel[1] = 0.0; m.vel[2] = m.slideVelZ;
}

// ---------- Bremsen am Hang (Decomp apply_slope_decel) ----------
function applySlopeDecel(m, decelCoef) {
    let decel;
    switch (floorClass(m)) {
        case SCLASS.VERY_SLIPPERY: decel = decelCoef * 0.2; break;
        case SCLASS.SLIPPERY:      decel = decelCoef * 0.7; break;
        case SCLASS.NOT_SLIPPERY:  decel = decelCoef * 3.0; break;
        default:                   decel = decelCoef * 2.0; break;
    }
    const stopped = (m.forwardVel = approach_f32(m.forwardVel, 0.0, decel, decel)) === 0.0;
    applySlopeAccel(m);
    return stopped;
}

// ---------- Steilboden (Decomp mario_push_off_steep_floor) ----------
function pushOffSteepFloor(m, action, arg) {
    const floorDYaw = s16Wrap(m.floorAngle - m.faceAngle[1]);
    let fp = floorDYaw > 32767 ? floorDYaw - 65536 : floorDYaw;
    if (fp > -0x4000 && fp < 0x4000) {
        m.forwardVel = 16.0;
        m.faceAngle[1] = m.floorAngle;
    } else {
        m.forwardVel = -16.0;
        m.faceAngle[1] = s16Wrap(m.floorAngle + 0x8000);
    }
    setMarioAction(m, action, arg);
}

// ---------- Aktion setzen (Decomp set_mario_action, Kern) ----------
export function setMarioAction(m, action, arg = 0) {
    // decomp: prevAction wird am Ende von set_mario_action gesetzt (nach der
    // Gruppen-Verteilung), also zeigt es auf die soeben gesetzte Aktion. Genau
    // dadurch funktioniert die Sprungkette (prevAction == ACT_JUMP_LAND etc.).
    m.prevAction = action;
    m.action = action;
    m.actionArg = arg;
    m.actionTimer = 0;
    m.actionState = 0;
    m.actionFlags = 0;
    switch (action) {
        case ACT.JUMP:
        case ACT.DOUBLE_JUMP:
            setYVelBasedOnFspeed(m, action === ACT.JUMP ? 42.0 : 52.0, 0.25);
            m.actionFlags |= FLAG.CONTROL_JUMP_HEIGHT;
            m.forwardVel *= 0.8;
            break;
        case ACT.TRIPLE_JUMP:
            setYVelBasedOnFspeed(m, 69.0, 0.0);
            m.forwardVel *= 0.8;
            break;
        case ACT.BACKFLIP:
            m.forwardVel = -16.0;
            setYVelBasedOnFspeed(m, 62.0, 0.0);
            break;
        case ACT.WALL_KICK_AIR:
            setYVelBasedOnFspeed(m, 62.0, 0.0);
            if (m.forwardVel < 24.0) m.forwardVel = 24.0;
            m.wallKickTimer = 0;
            break;
        case ACT.SIDE_FLIP:
            setYVelBasedOnFspeed(m, 62.0, 0.0);
            m.forwardVel = 8.0;
            m.faceAngle[1] = m.intendedYaw;
            break;
        case ACT.LONG_JUMP:
            setYVelBasedOnFspeed(m, 30.0, 0.0);
            m.forwardVel *= 1.5;
            if (m.forwardVel > 48.0) m.forwardVel = 48.0;
            break;
        case ACT.DIVE: {
            let fv = m.forwardVel + 15.0;
            if (fv > 48.0) fv = 48.0;
            setForwardVel(m, fv);
            break;
        }
        case ACT.GROUND_POUND:
            m.vel[1] = 0.0;
            setForwardVel(m, 0.0);
            break;
    }
    if (action === ACT.FREEFALL || action === ACT.SOFT_LAND) m.actionFlags = 0;
    // Decomp: vel[1] bleibt; vel[0]/[2] nur aktualisieren, wo decomp explizit
    // mario_set_forward_vel aufruft (Dive, Ground Pound), sonst stale lassen.
    return true;
}

function setJumpingAction(m, action, arg) {
    if (floorIsSteep(m)) {
        // decomp set_steep_jump_action: Steilboden-Sprung
        setForwardVel(m, m.forwardVel > 8.0 ? 8.0 : m.forwardVel);
        m.vel[1] = 42.0;
        setMarioAction(m, ACT.FREEFALL, 0);
        m.vel[1] = 42.0;
    } else {
        setMarioAction(m, action, arg);
    }
    return true;
}

// ---------- Sprungkette (Decomp set_jump_from_landing, exakt) ----------
function setJumpFromLanding(m) {
    if (m.doubleJumpTimer === 0) {
        setMarioAction(m, ACT.JUMP, 0);
    } else {
        switch (m.prevAction) {
            case ACT.JUMP_LAND:
            case ACT.FREEFALL_LAND:
            case ACT.SIDE_FLIP_LAND_STOP:
                setMarioAction(m, ACT.DOUBLE_JUMP, 0);
                break;
            case ACT.DOUBLE_JUMP_LAND:
                if (m.forwardVel > 20.0) setMarioAction(m, ACT.TRIPLE_JUMP, 0);
                else setMarioAction(m, ACT.JUMP, 0);
                break;
            default:
                setMarioAction(m, ACT.JUMP, 0);
                break;
        }
    }
    m.doubleJumpTimer = 0;
    return true;
}

// ---------- Landungen (Decomp common_landing_cancels + LandingAction-Structs) ----------
const LAND_ACTIONS = {
    [ACT.JUMP_LAND]:        { timer: 5, stopAction: ACT.JUMP_LAND_STOP, fallAction: ACT.FREEFALL },
    [ACT.FREEFALL_LAND]:    { timer: 5, stopAction: ACT.FREEFALL_LAND_STOP, fallAction: ACT.FREEFALL },
    [ACT.DOUBLE_JUMP_LAND]: { timer: 5, stopAction: ACT.DOUBLE_JUMP_LAND_STOP, fallAction: ACT.FREEFALL },
    [ACT.TRIPLE_JUMP_LAND]: { timer: 0, stopAction: ACT.TRIPLE_JUMP_LAND_STOP, fallAction: ACT.FREEFALL },
    [ACT.LONG_JUMP_LAND]:   { timer: 5, stopAction: ACT.LONG_JUMP_LAND_STOP, fallAction: ACT.FREEFALL },
    [ACT.BACKFLIP_LAND]:    { timer: 0, stopAction: ACT.BACKFLIP_LAND_STOP, fallAction: ACT.FREEFALL },
    [ACT.SIDE_FLIP_LAND_STOP]: { timer: 5, stopAction: ACT.JUMP_LAND_STOP, fallAction: ACT.FREEFALL },
};
function commonLandingCancels(m, landing) {
    if (m.floor && m.floor.ny < 0.2923717) {
        pushOffSteepFloor(m, ACT.FREEFALL, 0);
        return true;
    }
    m.doubleJumpTimer = landing.timer;
    if (m.input & INPUT.A_PRESSED) { setJumpFromLanding(m); return true; }
    if (m.input & INPUT.OFF_FLOOR) { setMarioAction(m, landing.fallAction, 0); return true; }
    if (m.input & INPUT.ABOVE_SLIDE) { setMarioAction(m, ACT.CROUCH_SLIDE, 0); return true; }
    if (m.forwardVel * m.forwardVel < 256.0) {
        setMarioAction(m, landing.stopAction, 0);
        return true;
    }
    return false;
}
function applyLandingAccel(m) {
    m.forwardVel = approach_f32(m.forwardVel, 0.0, 0.98, 0.98);
    applySlopeAccel(m);
}
function commonLandingAction(m, world, airAction) {
    if (m.input & INPUT.NONZERO_ANALOG) {
        applyLandingAccel(m);
    } else if (m.forwardVel >= 16.0) {
        applySlopeDecel(m, 2.0);
    } else {
        m.vel[1] = 0.0;
    }
    const stepResult = performGroundStep(m, world);
    return stepResult;
}

function stationaryGroundStep(m, world) {
    setForwardVel(m, 0.0);
    m.pos[1] = m.floorHeight;
}

// ============================================================
//  Aktions-Implementierungen (Decomp-Aktionen)
// ============================================================
function actIdle(m, world) {
    if (m.input & INPUT.NONZERO_ANALOG) { setMarioAction(m, ACT.WALKING, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.CROUCHING, 0); return; }
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, ACT.PUNCHING, 0); return; }
    if (m.input & INPUT.A_PRESSED) { setJumpingAction(m, ACT.JUMP, 0); return; }
    stationaryGroundStep(m, world);
}
function actWalking(m, world) {
    if (floorIsSteep(m)) { setMarioAction(m, ACT.CROUCH_SLIDE, 0); return; }
    if (m.input & INPUT.A_PRESSED) { setJumpFromLanding(m); return; }
    if (m.input & INPUT.B_PRESSED) {
        // decomp check_ground_dive_or_punch (exakt: Speed-Kick)
        if (m.forwardVel >= 29.0 && m.stickMagRaw > 48.0) {
            m.vel[1] = 20.0;
            setMarioAction(m, ACT.DIVE, 1);
            return;
        }
        setMarioAction(m, ACT.PUNCHING, 0);
        return;
    }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.CROUCH_SLIDE, 0); return; }
    let d = s16Wrap(m.intendedYaw - m.faceAngle[1]); if (d > 32767) d -= 65536;
    const heldBack = d < -0x471C || d > 0x471C; // decomp analog_stick_held_back (signed)
    if (heldBack && m.forwardVel >= 16.0) { setMarioAction(m, ACT.TURNING_AROUND, 0); return; }
    updateWalkingSpeed(m);
    performGroundStep(m, world);
}
function actBraking(m, world) {
    if (m.input & INPUT.A_PRESSED) { setJumpingAction(m, ACT.JUMP, 0); return; }
    if (m.input & INPUT.NONZERO_ANALOG) { setMarioAction(m, ACT.WALKING, 0); return; }
    if (applySlopeDecel(m, 2.0)) { setMarioAction(m, ACT.IDLE, 0); return; }
    performGroundStep(m, world);
}
function actTurningAround(m, world) {
    if (m.input & INPUT.A_PRESSED) { setJumpingAction(m, ACT.SIDE_FLIP, 0); return; }
    let d = s16Wrap(m.intendedYaw - m.faceAngle[1]); if (d > 32767) d -= 65536;
    if (!(d < -0x471C || d > 0x471C)) { setMarioAction(m, ACT.WALKING, 0); return; }
    m.faceAngle[1] = m.intendedYaw;
    m.forwardVel = approach_f32(m.forwardVel, -16.0, 1.0, 1.0);
    setVelFromYaw(m);
    const r = performGroundStep(m, world);
    if (r === GROUND_STEP.LEFT_GROUND) setMarioAction(m, ACT.FREEFALL, 0);
}
function actCrouching(m, world) {
    if (m.input & INPUT.A_PRESSED) {
        if (m.forwardVel > 16.0) { setJumpingAction(m, ACT.LONG_JUMP, 0); return; }
        setJumpingAction(m, ACT.BACKFLIP, 0);
        return;
    }
    if (!(m.input & INPUT.Z_DOWN)) { setMarioAction(m, ACT.IDLE, 0); return; }
    if (m.input & INPUT.NONZERO_ANALOG) { setMarioAction(m, ACT.CROUCH_SLIDE, 0); return; }
    stationaryGroundStep(m, world);
}
function actCrouchSlide(m, world) {
    if (m.actionTimer < 30) m.actionTimer++;
    if (m.input & INPUT.A_PRESSED) {
        if (m.actionTimer < 30 && m.forwardVel > 10.0) { setJumpingAction(m, ACT.LONG_JUMP, 0); return; }
        setJumpingAction(m, ACT.JUMP, 0);
        return;
    }
    if (m.input & INPUT.B_PRESSED) {
        if (m.forwardVel >= 10.0) { m.vel[1] = 20.0; setMarioAction(m, ACT.DIVE, 0); return; }
        setMarioAction(m, ACT.PUNCHING, 0);
        return;
    }
    if (!(m.input & INPUT.Z_DOWN) && m.actionTimer >= 5) { setMarioAction(m, ACT.CROUCHING, 0); return; }
    if (updateSliding(m, 4.0)) { setMarioAction(m, ACT.CROUCHING, 0); return; }
    const r = performGroundStep(m, world);
    if (r === GROUND_STEP.LEFT_GROUND) setMarioAction(m, ACT.FREEFALL, 1);
}
function actPunching(m, world) {
    m.actionTimer++;
    if (m.actionTimer > 15) setMarioAction(m, ACT.IDLE, 0);
    stationaryGroundStep(m, world);
}

// ---------- Luft-Aktionen ----------
function commonAirActionStep(m, world, landAction, checkLedge) {
    const stepResult = performAirStep(m, world, checkLedge);
    switch (stepResult) {
        case AIR_STEP.LANDED: {
            const fallHeight = m.peakHeight - m.pos[1];
            if (fallHeight > 1150.0 && m.vel[1] < -55.0) {
                setMarioAction(m, ACT.SOFT_LAND, 0);
                m.hurtCounter = 12; // decomp: Harter Sturz (Simulator: kein Tod)
            } else if (fallHeight > 500.0) {
                setMarioAction(m, ACT.SOFT_LAND, 0);
            } else {
                setMarioAction(m, landAction, 0);
            }
            break;
        }
        case AIR_STEP.HIT_WALL:
            // decomp common_air_action_step: Wandabsprung mit A gehalten
            if ((m.input & INPUT.A_DOWN) && m.wall) {
                const wallAngle = atan2s(m.wall.nz, m.wall.nx);
                m.faceAngle[1] = s16Wrap(wallAngle + 0x8000);
                setForwardVel(m, 0.0);
                setMarioAction(m, ACT.WALL_SLIDE, 0);
            } else if (m.vel[1] > 0.0) {
                m.vel[1] = 0.0;
            }
            break;
    }
    return stepResult;
}
function actJump(m, world) {
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, m.forwardVel > 28.0 ? ACT.DIVE : ACT.PUNCHING, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    commonAirActionStep(m, world, ACT.JUMP_LAND, true);
}
function actDoubleJump(m, world) {
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, m.forwardVel > 28.0 ? ACT.DIVE : ACT.PUNCHING, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    commonAirActionStep(m, world, ACT.DOUBLE_JUMP_LAND, true);
}
function actTripleJump(m, world) {
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, ACT.DIVE, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    commonAirActionStep(m, world, ACT.TRIPLE_JUMP_LAND, false);
}
function actBackflip(m, world) {
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, ACT.DIVE, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    commonAirActionStep(m, world, ACT.BACKFLIP_LAND, false);
}
function actSideFlip(m, world) {
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, ACT.DIVE, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    commonAirActionStep(m, world, ACT.SIDE_FLIP_LAND_STOP, true);
}
function actFreefall(m, world) {
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, ACT.DIVE, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    commonAirActionStep(m, world, ACT.FREEFALL_LAND, true);
}
function actLongJump(m, world) {
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, ACT.DIVE, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    commonAirActionStep(m, world, ACT.LONG_JUMP_LAND, true);
}
function actWallKickAir(m, world) {
    if (m.input & INPUT.B_PRESSED) { setMarioAction(m, ACT.DIVE, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    commonAirActionStep(m, world, ACT.JUMP_LAND, true);
}
function marioBonkReflection(m, negateSpeed) {
    if (m.wall) {
        const wallAngle = atan2s(m.wall.nz, m.wall.nx);
        m.faceAngle[1] = s16Wrap(wallAngle - s16Wrap(m.faceAngle[1] - wallAngle));
    }
    if (negateSpeed) setForwardVel(m, -m.forwardVel);
    else m.faceAngle[1] = s16Wrap(m.faceAngle[1] + 0x8000);
}
function actDive(m, world) {
    updateAirWithoutTurn(m);
    const stepResult = performAirStep(m, world, false);
    switch (stepResult) {
        case AIR_STEP.LANDED: {
            const fallHeight = m.peakHeight - m.pos[1];
            if (fallHeight > 1150.0 && m.vel[1] < -55.0) { setMarioAction(m, ACT.HARD_BONK, 0); m.hurtCounter = 12; }
            else if (fallHeight > 500.0) { setMarioAction(m, ACT.HARD_BONK, 0); }
            else { setMarioAction(m, ACT.STOMACH_SLIDE, 0); }
            break;
        }
        case AIR_STEP.HIT_WALL:
            marioBonkReflection(m, true);
            if (m.vel[1] > 0.0) m.vel[1] = 0.0;
            break;
    }
}
function actWallSlide(m, world) {
    if (m.input & INPUT.A_PRESSED) {
        if (m.wall) {
            m.faceAngle[1] = s16Wrap(atan2s(m.wall.nz, m.wall.nx) + 0x8000);
        }
        setMarioAction(m, ACT.WALL_KICK_AIR, 0);
        return;
    }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.GROUND_POUND, 0); return; }
    if (!m.wall) { setMarioAction(m, ACT.FREEFALL, 0); return; }
    m.wallKickTimer = 5; // decomp mario_actions_airborne.c:1321/1329
    if (m.vel[1] < 0.0) m.vel[1] = Math.min(m.vel[1] + 1.0, -8.0);
    const stepResult = performAirStep(m, world, false);
    if (stepResult === AIR_STEP.LANDED) setMarioAction(m, ACT.FREEFALL_LAND, 0);
}
function actGroundPound(m, world) {
    if (m.actionState === 0) {
        // decomp: 10 Frames Anheben (yOffset = 20 - 2*actionTimer), vel[1] = -50
        if (m.actionTimer < 10) {
            const yOffset = 20 - 2 * m.actionTimer;
            if (m.pos[1] + yOffset + 160.0 < m.ceilHeight) {
                m.pos[1] += yOffset;
                m.peakHeight = m.pos[1];
            }
        }
        m.vel[1] = -50.0;
        setForwardVel(m, 0.0);
        m.actionTimer++;
        if (m.actionTimer >= 14) m.actionState = 1;
    } else {
        const stepResult = performAirStep(m, world, false);
        if (stepResult === AIR_STEP.LANDED) setMarioAction(m, ACT.GROUND_POUND_LAND, 0);
        else if (stepResult === AIR_STEP.HIT_WALL) {
            setForwardVel(m, -16.0);
            if (m.vel[1] > 0.0) m.vel[1] = 0.0;
        }
    }
}
function actStomachSlide(m, world) {
    if (updateSliding(m, 8.0)) { setForwardVel(m, 0.0); setMarioAction(m, ACT.IDLE, 0); return; }
    if (m.input & INPUT.A_PRESSED) { setJumpingAction(m, ACT.JUMP, 0); return; }
    const r = performGroundStep(m, world);
    if (r === GROUND_STEP.LEFT_GROUND) setMarioAction(m, ACT.FREEFALL, 2);
}
function actSlideKickSlide(m, world) {
    if (m.input & INPUT.A_PRESSED) { setJumpingAction(m, ACT.JUMP, 0); return; }
    if (updateSliding(m, 1.0)) { setMarioAction(m, ACT.IDLE, 0); return; }
    const r = performGroundStep(m, world);
    if (r === GROUND_STEP.LEFT_GROUND) setMarioAction(m, ACT.FREEFALL, 2);
}
function actLanding(m, world) {
    const landing = LAND_ACTIONS[m.action];
    if (!landing) { setMarioAction(m, ACT.IDLE, 0); return; }
    if (commonLandingCancels(m, landing)) return;
    commonLandingAction(m, world, landing.fallAction);
}
function actLandStop(m, world) {
    if (m.input & INPUT.A_PRESSED) { setJumpFromLanding(m); return; }
    if (m.input & INPUT.NONZERO_ANALOG) { setMarioAction(m, ACT.WALKING, 0); return; }
    if (m.input & INPUT.Z_PRESSED) { setMarioAction(m, ACT.CROUCHING, 0); return; }
    setForwardVel(m, 0.0);
    if (m.actionTimer > 6) setMarioAction(m, ACT.IDLE, 0);
    m.actionTimer++;
    stationaryGroundStep(m, world);
}
function actSoftLand(m, world) {
    if (commonLandingCancels(m, LAND_ACTIONS[ACT.JUMP_LAND])) return;
    commonLandingAction(m, world, ACT.FREEFALL);
    if (m.forwardVel * m.forwardVel < 256.0) setMarioAction(m, ACT.IDLE, 0);
}
function actHardBonk(m, world) {
    m.forwardVel = approach_f32(m.forwardVel, 0.0, 4.0, 4.0);
    setVelFromYaw(m);
    if (m.forwardVel === 0.0) { setMarioAction(m, ACT.IDLE, 0); return; }
    const r = performGroundStep(m, world);
    if (r === GROUND_STEP.LEFT_GROUND) setMarioAction(m, ACT.FREEFALL, 0);
}

// ============================================================
//  Haupt-Schritt (Decomp update_mario-Flow, exakte Reihenfolge)
// ============================================================
export function marioStep(m, world, camYaw) {
    m.prevPos = [m.pos[0], m.pos[1], m.pos[2]];
    m.input = 0;

    // Wandkollision vor Bewegung (decomp update_mario_geometry_inputs: 60/50 + 30/24)
    world.resolveWalls(m.pos, 60.0, 50.0);
    world.resolveWalls(m.pos, 30.0, 24.0);

    const fl = world.findFloor(m.pos[0], m.pos[1], m.pos[2]);
    m.floor = fl ? fl.tri : null;
    m.floorHeight = fl ? fl.height : -1e9;
    const ce = world.findCeil(m.pos[0], m.pos[1], m.pos[2]);
    m.ceilHeight = ce ? ce.height : 1e9;
    if (m.floor) {
        m.floorAngle = atan2s(m.floor.nz, m.floor.nx);
        if (m.floorHeight < m.pos[1] - 100.0) m.input |= INPUT.OFF_FLOOR;
        if (floorIsSteep(m) && m.floorHeight >= m.pos[1] - 4.0) m.input |= INPUT.ABOVE_SLIDE;
    } else {
        m.input |= INPUT.OFF_FLOOR;
    }

    if (m.aPressed) m.input |= INPUT.A_PRESSED;
    if (m.aDown) m.input |= INPUT.A_DOWN;
    if (m.bPressed) m.input |= INPUT.B_PRESSED;
    if (m.zPressed) m.input |= INPUT.Z_PRESSED;
    if (m.zDown) m.input |= INPUT.Z_DOWN;

    updateJoystickInputs(m, camYaw);

    if (m.wallKickTimer > 0) m.wallKickTimer--;
    if (m.doubleJumpTimer > 0) m.doubleJumpTimer--;

    switch (m.action) {
        case ACT.IDLE:            actIdle(m, world); break;
        case ACT.WALKING:         actWalking(m, world); break;
        case ACT.BRAKING:         actBraking(m, world); break;
        case ACT.TURNING_AROUND:  actTurningAround(m, world); break;
        case ACT.CROUCHING:       actCrouching(m, world); break;
        case ACT.CROUCH_SLIDE:    actCrouchSlide(m, world); break;
        case ACT.PUNCHING:        actPunching(m, world); break;
        case ACT.JUMP:            actJump(m, world); break;
        case ACT.DOUBLE_JUMP:     actDoubleJump(m, world); break;
        case ACT.TRIPLE_JUMP:     actTripleJump(m, world); break;
        case ACT.BACKFLIP:        actBackflip(m, world); break;
        case ACT.SIDE_FLIP:       actSideFlip(m, world); break;
        case ACT.FREEFALL:        actFreefall(m, world); break;
        case ACT.LONG_JUMP:       actLongJump(m, world); break;
        case ACT.DIVE:            actDive(m, world); break;
        case ACT.WALL_SLIDE:      actWallSlide(m, world); break;
        case ACT.WALL_KICK_AIR:   actWallKickAir(m, world); break;
        case ACT.GROUND_POUND:    actGroundPound(m, world); break;
        case ACT.STOMACH_SLIDE:   actStomachSlide(m, world); break;
        case ACT.SLIDE_KICK_SLIDE:actSlideKickSlide(m, world); break;
        case ACT.JUMP_LAND: case ACT.FREEFALL_LAND: case ACT.DOUBLE_JUMP_LAND:
        case ACT.TRIPLE_JUMP_LAND: case ACT.LONG_JUMP_LAND: case ACT.BACKFLIP_LAND:
            actLanding(m, world); break;
        case ACT.JUMP_LAND_STOP: case ACT.FREEFALL_LAND_STOP: case ACT.DOUBLE_JUMP_LAND_STOP:
        case ACT.TRIPLE_JUMP_LAND_STOP: case ACT.LONG_JUMP_LAND_STOP: case ACT.BACKFLIP_LAND_STOP:
            actLandStop(m, world); break;
        case ACT.SOFT_LAND:       actSoftLand(m, world); break;
        case ACT.HARD_BONK:       actHardBonk(m, world); break;
        default:                  m.action = ACT.IDLE; break;
    }
}

// ---------- Kurz-Referenz aller Konstanten (fuer das HUD/About) ----------
export const CONSTANTS_DOC = [
    ["Logik-Tick", "30 Hz, 4 Viertelschritte (qSteps)"],
    ["Gehen: Zielgeschwindigkeit", "min(Stick, 32) (24 auf langsamem Boden)"],
    ["Gehen: Beschleunigung", "+1.1 - fwdVel/43 pro Tick"],
    ["Lauf-Cap", "48"],
    ["Sprung (A)", "vy = 42 + fwdVel*0.25, fwdVel *= 0.8"],
    ["Doppelsprung", "vy = 52 + fwdVel*0.25, fwdVel *= 0.8"],
    ["Dreifachsprung", "vy = 69, fwdVel *= 0.8"],
    ["Rueckwaertssalto", "vy = 62, fwdVel = -16"],
    ["Seitwaertssalto (Side Flip)", "vy = 62, fwdVel = 8"],
    ["Langsprung (Z+A)", "vy = 30, fwdVel = min(fwdVel*1.5, 48)"],
    ["Wandsprung", "vy = 62, fwdVel = max(fwdVel, 24)"],
    ["Hechtsprung (Dive)", "fwdVel = min(fwdVel + 15, 48); Speed-Kick ab fwdVel >= 29"],
    ["Gravitation", "-4/Tick (Langsprung & Slide: -2), Terminal -75"],
    ["Variable Sprunghoehe", "A loslassen und vy > 20: vy /= 4 pro Tick"],
    ["Luft: Beschleunigung", "+1.5*cos(dyaw)*stick, Drehung 512*sin(dyaw)*stick"],
    ["Luft: Drag", "0.35/Tick, ueber 32 (Langsprung 48): -1/Tick"],
    ["Sprungkette", "Landen + A innerhalb 5 Ticks: Doppelsprung, ab fwdVel > 20 Dreifachsprung"],
    ["Hitbox", "Radius 37, Hoehe 160 (100 geduckt)"],
    ["Wand-Radius", "50 (Kopf) / 24 (Fuesse), Luft: 50 an 150+30"],
    ["Steiler Boden", "Rutschen ab cos-Schwellen 15/20/30 Grad je Bodenklasse"],
    ["Bodenpound", "10 Ticks Anheben, vel[1] = -50"],
];
