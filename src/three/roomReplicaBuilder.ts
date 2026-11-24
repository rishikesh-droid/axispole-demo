import * as THREE from 'three';
import type { RoomReplicaObject, RoomReplicaScene } from '../types/pole';

export interface RoomReplicaRigHandle {
  group: THREE.Group;
  update: (
    sceneData: RoomReplicaScene | null,
    visible: boolean,
    showInferred: boolean
  ) => void;
  dispose: () => void;
}

function makeMat(
  hex: string,
  roughness: number,
  metalness: number,
  opts?: {
    emissive?: string;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
  }
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness,
    metalness,
    emissive: opts?.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
  });
}

function enableShadows(root: THREE.Object3D, cast = true, receive = true): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = cast;
      obj.receiveShadow = receive;
    }
  });
}

function buildDesk(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const topThick = 0.042;
  const topMat = makeMat(obj.primaryColor, 0.56, 0.06);
  const frameMat = makeMat(obj.secondaryColor, 0.35, 0.65);
  const screenMat = makeMat('#11151e', 0.14, 0.3, {
    emissive: '#38bdf8',
    emissiveIntensity: 0.22,
  });

  // Tabletop with subtle under-apron
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, topThick, D), topMat);
  top.position.y = H - topThick / 2;
  g.add(top);

  const apron = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.045, D - 0.12), frameMat);
  apron.position.y = H - topThick - 0.022;
  g.add(apron);

  // 4 sleek steel legs + back modesty crossbar
  const legH = H - topThick;
  const legGeo = new THREE.BoxGeometry(0.042, legH, 0.042);
  const lx = W / 2 - 0.06;
  const lz = D / 2 - 0.06;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(sx * lx, legH / 2, sz * lz);
      g.add(leg);
    }
  }

  // Right-side 3-drawer pedestal cabinet
  if (W >= 0.95) {
    const pedW = Math.min(0.42, W * 0.3);
    const pedH = legH - 0.06;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(pedW, pedH, D - 0.08), topMat);
    ped.position.set(W / 2 - pedW / 2 - 0.07, pedH / 2 + 0.03, 0);
    g.add(ped);

    for (let i = 0; i < 3; i++) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.016), frameMat);
      handle.position.set(
        W / 2 - pedW / 2 - 0.07,
        0.16 + i * (pedH / 3.2),
        (D - 0.08) / 2 + 0.008
      );
      g.add(handle);
    }
  }

  // Sleek widescreen monitor + stand + keyboard on tabletop
  const monW = Math.min(0.62, W * 0.45);
  const monH = monW * 0.58;
  const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.14), frameMat);
  standBase.position.set(-W * 0.08, H + 0.006, -D * 0.22);
  const standNeck = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.14, 0.024), frameMat);
  standNeck.position.set(-W * 0.08, H + 0.075, -D * 0.25);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(monW, monH, 0.022), frameMat);
  bezel.position.set(-W * 0.08, H + 0.12 + monH / 2, -D * 0.23);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(monW - 0.026, monH - 0.026), screenMat);
  screen.position.set(-W * 0.08, H + 0.12 + monH / 2, -D * 0.23 + 0.012);
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.01, 0.11), frameMat);
  kb.position.set(-W * 0.08, H + 0.006, D * 0.12);
  g.add(standBase, standNeck, bezel, screen, kb);

  enableShadows(g);
  return g;
}

function buildOfficeChair(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const cushionMat = makeMat(obj.primaryColor, 0.78, 0.04);
  const metalMat = makeMat(obj.secondaryColor, 0.3, 0.75);
  const seatY = Math.min(0.48, H * 0.46);

  // 5-star caster base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.028, 0.27), metalMat);
    arm.position.set(Math.sin(a) * 0.13, 0.065, Math.cos(a) * 0.13);
    arm.rotation.y = a;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.026, 12), metalMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(Math.sin(a) * 0.24, 0.024, Math.cos(a) * 0.24);
    g.add(arm, wheel);
  }

  // Pneumatic cylinder
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, seatY - 0.07, 14), metalMat);
  stem.position.y = 0.07 + (seatY - 0.07) / 2;
  g.add(stem);

  // Contoured seat cushion
  const seat = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.072, D * 0.82), cushionMat);
  seat.position.y = seatY;
  g.add(seat);

  // Sculpted backrest + lumbar spine
  const backH = Math.max(0.38, H - seatY - 0.04);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, backH, 0.06), cushionMat);
  back.position.set(0, seatY + backH / 2 + 0.03, -D * 0.36);
  back.rotation.x = -0.09;
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, backH * 0.8, 0.035), metalMat);
  spine.position.set(0, seatY + backH * 0.4, -D * 0.4);
  g.add(back, spine);

  // Dual armrests
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.2, 0.035), metalMat);
    post.position.set(sx * (W * 0.44), seatY + 0.1, -0.02);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.026, D * 0.56), cushionMat);
    pad.position.set(sx * (W * 0.44), seatY + 0.21, 0.0);
    g.add(post, pad);
  }

  enableShadows(g);
  return g;
}

function buildChair(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const frameMat = makeMat(obj.primaryColor, 0.58, 0.06);
  const padMat = makeMat(obj.secondaryColor, 0.82, 0.02);
  const seatY = Math.min(0.46, H * 0.52);

  // 4 tapered legs
  const legGeo = new THREE.CylinderGeometry(0.018, 0.013, seatY, 10);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(sx * (W * 0.41), seatY / 2, sz * (D * 0.41));
      g.add(leg);
    }
  }

  const seat = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.052, D * 0.9), padMat);
  seat.position.y = seatY;
  g.add(seat);

  const backH = Math.max(0.32, H - seatY);
  for (const sx of [-1, 1]) {
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.032, backH, 0.032), frameMat);
    stile.position.set(sx * (W * 0.41), seatY + backH / 2, -D * 0.41);
    g.add(stile);
  }
  const railTop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.14, 0.028), frameMat);
  railTop.position.set(0, H - 0.09, -D * 0.41);
  const railMid = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.08, 0.024), padMat);
  railMid.position.set(0, seatY + backH * 0.48, -D * 0.4);
  g.add(railTop, railMid);

  enableShadows(g);
  return g;
}

function buildTable(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const topMat = makeMat(obj.primaryColor, 0.48, 0.06);
  const legMat = makeMat(obj.secondaryColor, 0.45, 0.35);

  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.045, D), topMat);
  top.position.y = H - 0.0225;
  const apron = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.06, D - 0.12), legMat);
  apron.position.y = H - 0.065;
  g.add(top, apron);

  const legH = H - 0.045;
  const legGeo = new THREE.CylinderGeometry(0.024, 0.017, legH, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(sx * (W / 2 - 0.08), legH / 2, sz * (D / 2 - 0.08));
      g.add(leg);
    }
  }

  // Subtle decorative stacked coffee-table book
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(0.28, W * 0.28), 0.026, Math.min(0.21, D * 0.32)),
    makeMat('#e7e1d6', 0.8, 0.02)
  );
  book.position.set(W * 0.12, H + 0.013, 0);
  book.rotation.y = 0.22;
  g.add(book);

  enableShadows(g);
  return g;
}

function buildSofa(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const fabricMat = makeMat(obj.primaryColor, 0.88, 0.02);
  const pillowMat = makeMat(obj.secondaryColor, 0.84, 0.02);
  const footMat = makeMat('#2b2623', 0.5, 0.2);

  // Recessed wooden feet
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.09, 10), footMat);
      foot.position.set(sx * (W / 2 - 0.12), 0.045, sz * (D / 2 - 0.1));
      g.add(foot);
    }
  }

  // Main base plinth
  const baseH = Math.min(0.22, H * 0.28);
  const base = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, baseH, D - 0.04), fabricMat);
  base.position.y = 0.09 + baseH / 2;
  g.add(base);

  // Armrests
  const armW = Math.min(0.18, W * 0.11);
  const armH = Math.min(0.54, H * 0.68);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, D - 0.02), fabricMat);
    arm.position.set(sx * (W / 2 - armW / 2), 0.09 + armH / 2, 0);
    g.add(arm);
  }

  // Seat & Back Cushions (2 or 3 cushions based on width)
  const innerW = W - armW * 2 - 0.03;
  const count = W >= 1.75 ? 3 : 2;
  const cW = innerW / count - 0.015;
  const seatTopY = 0.09 + baseH + 0.13;
  const backH = Math.max(0.32, H - seatTopY + 0.06);

  for (let i = 0; i < count; i++) {
    const cx = -innerW / 2 + (i + 0.5) * (innerW / count);
    const seatC = new THREE.Mesh(new THREE.BoxGeometry(cW, 0.14, D * 0.72), fabricMat);
    seatC.position.set(cx, 0.09 + baseH + 0.065, D * 0.08);
    const backC = new THREE.Mesh(new THREE.BoxGeometry(cW, backH, 0.17), fabricMat);
    backC.position.set(cx, seatTopY + backH / 2 - 0.04, -D / 2 + 0.15);
    backC.rotation.x = -0.14;
    g.add(seatC, backC);
  }

  // Accent throw pillows
  for (const sx of [-1, 1]) {
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.1), pillowMat);
    pillow.position.set(sx * (innerW * 0.38), seatTopY + 0.14, -D * 0.16);
    pillow.rotation.set(-0.2, sx * -0.35, sx * 0.08);
    g.add(pillow);
  }

  enableShadows(g);
  return g;
}

function buildBed(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const frameMat = makeMat(obj.secondaryColor, 0.65, 0.05);
  const sheetMat = makeMat('#f1eee8', 0.88, 0.01);
  const duvetMat = makeMat(obj.primaryColor, 0.86, 0.02);

  const frameH = Math.min(0.24, H * 0.4);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, frameH, D), frameMat);
  frame.position.y = frameH / 2 + 0.05;
  g.add(frame);

  // Headboard
  const headH = Math.max(0.92, H + 0.42);
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, headH, 0.09), frameMat);
  headboard.position.set(0, headH / 2, -D / 2 + 0.045);
  g.add(headboard);

  // Mattress
  const matH = Math.max(0.2, H - frameH);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, matH, D - 0.12), sheetMat);
  mattress.position.set(0, frameH + 0.05 + matH / 2, 0.03);
  g.add(mattress);

  // Folded duvet covering lower 70%
  const duvet = new THREE.Mesh(
    new THREE.BoxGeometry(W - 0.02, matH * 0.55, D * 0.66),
    duvetMat
  );
  duvet.position.set(0, frameH + 0.06 + matH * 0.8, D * 0.15);
  g.add(duvet);

  // Two plump pillows
  const pillowW = Math.min(0.62, W * 0.39);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pillowW, 0.12, 0.34), sheetMat);
    p.position.set(sx * (W * 0.24), frameH + 0.05 + matH + 0.06, -D / 2 + 0.34);
    p.rotation.x = 0.12;
    g.add(p);
  }

  enableShadows(g);
  return g;
}

function buildBookshelf(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const woodMat = makeMat(obj.primaryColor, 0.62, 0.05);
  const backMat = makeMat(obj.secondaryColor, 0.8, 0.04);
  const thick = 0.028;

  // Left & Right side uprights
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(thick, H, D), woodMat);
    side.position.set(sx * (W / 2 - thick / 2), H / 2, 0);
    g.add(side);
  }

  // Back panel
  const back = new THREE.Mesh(new THREE.BoxGeometry(W - thick, H - 0.04, 0.016), backMat);
  back.position.set(0, H / 2, -D / 2 + 0.008);
  g.add(back);

  // Horizontal shelves + decorative book blocks
  const shelfCount = Math.max(3, Math.min(6, Math.round(H / 0.36)));
  const bookColors = ['#b45309', '#334155', '#64748b', '#9f1239', '#0f766e', '#d6d3d1'];
  for (let i = 0; i <= shelfCount; i++) {
    const sy = i === 0 ? 0.04 : (i / shelfCount) * (H - 0.06) + 0.04;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - thick * 1.5, thick, D - 0.01), woodMat);
    shelf.position.set(0, sy, 0);
    g.add(shelf);

    if (i < shelfCount && i > 0) {
      const bookGroupW = (W - 0.14) * 0.68;
      const startX = -W / 2 + 0.08 + (i % 2) * 0.08;
      for (let b = 0; b < 4; b++) {
        const bw = bookGroupW / 5;
        const bh = 0.16 + ((i * 3 + b * 7) % 5) * 0.018;
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(bw * 0.85, bh, D * 0.62),
          makeMat(bookColors[(i + b) % bookColors.length], 0.78, 0.04)
        );
        book.position.set(startX + b * (bw + 0.015), sy + thick / 2 + bh / 2, 0.01);
        g.add(book);
      }
    }
  }

  enableShadows(g);
  return g;
}

function buildCabinetOrWardrobe(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const isWallMounted = (obj.elevationM ?? 0) >= 0.35;
  const bodyMat = makeMat(obj.primaryColor, 0.6, 0.06);
  const trimMat = makeMat(obj.secondaryColor, 0.4, 0.55);

  const plinthH = isWallMounted ? 0 : 0.07;
  if (plinthH > 0) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, plinthH, D - 0.05), trimMat);
    plinth.position.y = plinthH / 2;
    g.add(plinth);
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H - plinthH, D - 0.025), bodyMat);
  body.position.set(0, plinthH + (H - plinthH) / 2, -0.01);
  g.add(body);

  // Recessed front doors (2..5 bays scaled to width) with vertical handles
  const doorCount = W >= 1.8 ? 4 : W >= 1.3 ? 3 : 2;
  const doorW = W / doorCount - 0.012;
  const doorH = H - plinthH - 0.03;
  for (let i = 0; i < doorCount; i++) {
    const dx = -W / 2 + (i + 0.5) * (W / doorCount);
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.02), bodyMat);
    door.position.set(dx, plinthH + doorH / 2 + 0.015, D / 2 - 0.01);
    const handleSide = i % 2 === 0 ? 1 : -1;
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, Math.min(0.2, doorH * 0.24), 0.022),
      trimMat
    );
    handle.position.set(
      dx + handleSide * Math.max(0.025, doorW * 0.34),
      isWallMounted ? doorH * 0.24 : plinthH + doorH * 0.54,
      D / 2 + 0.012
    );
    g.add(door, handle);
  }

  enableShadows(g);
  return g;
}

function buildTvStand(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const consoleMat = makeMat(obj.primaryColor, 0.52, 0.08);
  const screenFrameMat = makeMat(obj.secondaryColor, 0.25, 0.55);
  const screenGlassMat = makeMat('#0d111a', 0.12, 0.35, {
    emissive: '#1e293b',
    emissiveIntensity: 0.35,
  });

  // Low console body + legs
  const legH = 0.12;
  const bodyH = Math.max(0.28, H - legH);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, legH, 10), screenFrameMat);
      leg.position.set(sx * (W / 2 - 0.08), legH / 2, sz * (D / 2 - 0.06));
      g.add(leg);
    }
  }
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, D), consoleMat);
  consoleBox.position.y = legH + bodyH / 2;
  g.add(consoleBox);

  // Slim widescreen TV resting atop the console
  const tvW = Math.min(W * 0.84, 1.28);
  const tvH = tvW * 0.56;
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.16), screenFrameMat);
  ped.position.set(0, H + 0.01, -0.02);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.03), screenFrameMat);
  neck.position.set(0, H + 0.055, -0.03);
  const tvFrame = new THREE.Mesh(new THREE.BoxGeometry(tvW, tvH, 0.032), screenFrameMat);
  tvFrame.position.set(0, H + 0.08 + tvH / 2, -0.02);
  const tvDisplay = new THREE.Mesh(
    new THREE.PlaneGeometry(tvW - 0.03, tvH - 0.03),
    screenGlassMat
  );
  tvDisplay.position.set(0, H + 0.08 + tvH / 2, -0.002);
  g.add(ped, neck, tvFrame, tvDisplay);

  enableShadows(g);
  return g;
}

function buildRugOrMat(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, type } = obj;
  const mainMat = makeMat(obj.primaryColor, 0.94, 0.0);
  const borderMat = makeMat(obj.secondaryColor, 0.9, 0.0);
  const thick = type === 'fitness-mat' ? 0.014 : 0.01;

  const border = new THREE.Mesh(new THREE.BoxGeometry(W, thick, D), borderMat);
  border.position.y = thick / 2 + 0.006;
  const center = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.2, W - 0.12), thick + 0.002, Math.max(0.2, D - 0.12)),
    mainMat
  );
  center.position.y = thick / 2 + 0.007;
  g.add(border, center);

  enableShadows(g, false, true);
  return g;
}

function buildPlant(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, heightM: H } = obj;
  const potMat = makeMat(obj.secondaryColor, 0.64, 0.06);
  const soilMat = makeMat('#3a2c22', 0.95, 0.0);
  const leafMat = makeMat(obj.primaryColor, 0.62, 0.03);

  const potR = Math.max(0.11, Math.min(0.22, W * 0.42));
  const potH = Math.min(0.38, H * 0.35);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.76, potH, 18), potMat);
  pot.position.y = potH / 2;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(potR * 0.9, potR * 0.9, 0.02, 16), soilMat);
  soil.position.y = potH - 0.015;
  g.add(pot, soil);

  // Layered multi-stem foliage fronds
  const stemCount = 7;
  for (let i = 0; i < stemCount; i++) {
    const a = (i / stemCount) * Math.PI * 2 + 0.3;
    const tilt = 0.22 + (i % 3) * 0.14;
    const frondH = Math.max(0.32, (H - potH) * (0.68 + (i % 3) * 0.15));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, frondH * 0.72, 6), leafMat);
    stem.position.set(
      Math.cos(a) * potR * 0.35,
      potH + frondH * 0.32,
      Math.sin(a) * potR * 0.35
    );
    stem.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);

    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.075, potR * 0.55), 10, 8),
      leafMat
    );
    leaf.scale.set(1.25, 0.45, 0.75);
    leaf.position.set(
      Math.cos(a) * (potR * 0.85 + 0.04),
      potH + frondH * 0.68,
      Math.sin(a) * (potR * 0.85 + 0.04)
    );
    leaf.rotation.set(0.2, -a, 0.25);
    g.add(stem, leaf);
  }

  enableShadows(g);
  return g;
}

function buildLamp(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, heightM: H } = obj;
  const metalMat = makeMat(obj.primaryColor, 0.32, 0.78);
  const shadeMat = makeMat(obj.secondaryColor, 0.65, 0.02, {
    emissive: '#fde68a',
    emissiveIntensity: 0.75,
  });

  const baseR = Math.max(0.11, Math.min(0.18, W * 0.42));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(baseR, baseR * 1.05, 0.026, 20), metalMat);
  base.position.y = 0.013;
  const poleH = Math.max(0.95, H - 0.28);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, poleH, 12), metalMat);
  pole.position.y = 0.026 + poleH / 2;
  const shadeR = Math.max(0.14, Math.min(0.22, W * 0.5));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(shadeR * 0.82, shadeR, 0.28, 20, 1, false),
    shadeMat
  );
  shade.position.y = H - 0.14;
  g.add(base, pole, shade);

  enableShadows(g);
  return g;
}

function buildWindow(obj: RoomReplicaObject, ceilingHeightM: number): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, heightM: H } = obj;
  const frameMat = makeMat(obj.primaryColor, 0.55, 0.08);
  const glassMat = makeMat(obj.secondaryColor, 0.12, 0.1, {
    emissive: obj.secondaryColor,
    emissiveIntensity: 0.48,
  });
  const curtainMat = makeMat('#ece7de', 0.9, 0.02);

  const sillY = Math.max(0.72, Math.min(ceilingHeightM - H - 0.22, 0.92));
  const centerY = sillY + H / 2;

  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.06), frameMat);
  frame.position.set(0, centerY, 0);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, H - 0.1), glassMat);
  glass.position.set(0, centerY, 0.032);
  const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.032, H - 0.08, 0.025), frameMat);
  mullionV.position.set(0, centerY, 0.036);
  const mullionH = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.032, 0.025), frameMat);
  mullionH.position.set(0, centerY, 0.036);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.035, 0.12), frameMat);
  sill.position.set(0, sillY - 0.01, 0.04);

  // Soft side curtain drapes
  const drapeH = Math.min(ceilingHeightM - 0.14, H + 0.55);
  for (const sx of [-1, 1]) {
    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.18, drapeH, 0.075), curtainMat);
    drape.position.set(sx * (W / 2 + 0.08), centerY - 0.08, 0.055);
    g.add(drape);
  }
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, W + 0.42, 10),
    makeMat('#2a2d34', 0.35, 0.7)
  );
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, Math.min(ceilingHeightM - 0.12, sillY + H + 0.12), 0.08);

  g.add(frame, glass, mullionV, mullionH, sill, rod);
  enableShadows(g, false, true);
  return g;
}

function buildDoor(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, heightM: H } = obj;
  const isOpenDoorway = obj.label.toLowerCase().includes('doorway');

  if (isOpenDoorway) {
    const jambMat = makeMat(obj.secondaryColor, 0.55, 0.08);
    const corridorMat = makeMat(obj.primaryColor, 0.85, 0.02, {
      emissive: obj.primaryColor,
      emissiveIntensity: 0.28,
    });
    const jambW = 0.065;
    for (const sx of [-1, 1]) {
      const sideJamb = new THREE.Mesh(new THREE.BoxGeometry(jambW, H, 0.08), jambMat);
      sideJamb.position.set(sx * (W / 2 + jambW / 2), H / 2, 0.02);
      g.add(sideJamb);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(W + jambW * 2, jambW, 0.08), jambMat);
    header.position.set(0, H + jambW / 2, 0.02);
    const passageBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(W, H), corridorMat);
    passageBackdrop.position.set(0, H / 2, 0.004);
    g.add(header, passageBackdrop);
    enableShadows(g, false, true);
    return g;
  }

  const leafMat = makeMat(obj.primaryColor, 0.58, 0.05);
  const jambMat = makeMat(obj.secondaryColor, 0.5, 0.15);
  const handleMat = makeMat('#c8a96e', 0.25, 0.85);

  const jamb = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, H + 0.04, 0.05), jambMat);
  jamb.position.set(0, (H + 0.04) / 2, 0);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, H - 0.02, 0.045), leafMat);
  leaf.position.set(0, (H - 0.02) / 2, 0.012);
  const panelTop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.68, H * 0.34, 0.012), jambMat);
  panelTop.position.set(0, H * 0.72, 0.036);
  const panelBot = new THREE.Mesh(new THREE.BoxGeometry(W * 0.68, H * 0.28, 0.012), jambMat);
  panelBot.position.set(0, H * 0.26, 0.036);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.045), handleMat);
  lever.position.set(W * 0.36, 0.96, 0.048);

  g.add(jamb, leaf, panelTop, panelBot, lever);
  enableShadows(g, false, true);
  return g;
}

function buildMirrorOrArt(obj: RoomReplicaObject, ceilingHeightM: number): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, heightM: H, type } = obj;
  const frameMat = makeMat(obj.primaryColor, 0.4, 0.55);
  const centerY =
    type === 'mirror'
      ? Math.min(ceilingHeightM - H / 2 - 0.12, Math.max(H / 2 + 0.08, 1.12))
      : Math.min(ceilingHeightM - H / 2 - 0.18, 1.52);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.034), frameMat);
  frame.position.set(0, centerY, 0);
  g.add(frame);

  if (type === 'mirror') {
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.06, H - 0.06),
      new THREE.MeshPhysicalMaterial({
        color: 0xdbe4ee,
        metalness: 0.9,
        roughness: 0.06,
        envMapIntensity: 1.35,
      })
    );
    glass.position.set(0, centerY, 0.019);
    g.add(glass);
  } else {
    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.07, H - 0.07),
      makeMat(obj.secondaryColor, 0.88, 0.02)
    );
    canvas.position.set(0, centerY, 0.019);
    const motif = new THREE.Mesh(
      new THREE.CircleGeometry(Math.min(W, H) * 0.25, 24),
      makeMat(obj.primaryColor, 0.8, 0.04)
    );
    motif.position.set(0, centerY + 0.02, 0.022);
    g.add(canvas, motif);
  }

  enableShadows(g, false, true);
  return g;
}

function buildReplicaObjectMesh(obj: RoomReplicaObject, ceilingHeightM: number): THREE.Group {
  let meshGroup: THREE.Group;
  switch (obj.type) {
    case 'desk':
      meshGroup = buildDesk(obj);
      break;
    case 'office-chair':
      meshGroup = buildOfficeChair(obj);
      break;
    case 'chair':
      meshGroup = buildChair(obj);
      break;
    case 'table':
      meshGroup = buildTable(obj);
      break;
    case 'sofa':
      meshGroup = buildSofa(obj);
      break;
    case 'bed':
      meshGroup = buildBed(obj);
      break;
    case 'bookshelf':
      meshGroup = buildBookshelf(obj);
      break;
    case 'cabinet':
    case 'wardrobe':
      meshGroup = buildCabinetOrWardrobe(obj);
      break;
    case 'tv-stand':
      meshGroup = buildTvStand(obj);
      break;
    case 'rug':
    case 'fitness-mat':
      meshGroup = buildRugOrMat(obj);
      break;
    case 'plant':
      meshGroup = buildPlant(obj);
      break;
    case 'lamp':
      meshGroup = buildLamp(obj);
      break;
    case 'window':
      meshGroup = buildWindow(obj, ceilingHeightM);
      break;
    case 'door':
      meshGroup = buildDoor(obj);
      break;
    case 'mirror':
    case 'wall-art':
      meshGroup = buildMirrorOrArt(obj, ceilingHeightM);
      break;
    default:
      meshGroup = buildCabinetOrWardrobe(obj);
      break;
  }

  meshGroup.name = `Replica_${obj.type}_${obj.id}`;
  meshGroup.position.set(obj.x, obj.elevationM ?? 0, obj.z);
  meshGroup.rotation.y = THREE.MathUtils.degToRad(obj.rotationDeg);
  meshGroup.userData.inferred = obj.inferred;
  return meshGroup;
}

function disposeGroupChildren(parent: THREE.Group): void {
  while (parent.children.length > 0) {
    const child = parent.children[0];
    parent.remove(child);
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        if (Array.isArray(node.material)) {
          node.material.forEach((m) => m.dispose());
        } else {
          node.material.dispose();
        }
      }
    });
  }
}

/**
 * Manages the procedural 3D furniture & architectural replica meshes inside the studio scene.
 * Rebuilds cleanly only when the scanned RoomReplicaScene changes, and toggles inferred
 * unseen-zone furniture visibility in O(n) without geometry churn.
 */
export function createRoomReplicaRig(parent: THREE.Group): RoomReplicaRigHandle {
  const group = new THREE.Group();
  group.name = 'AxisPole_RoomReplica';
  group.visible = false;
  parent.add(group);

  let builtKey = '';

  function update(
    sceneData: RoomReplicaScene | null,
    visible: boolean,
    showInferred: boolean
  ): void {
    if (!visible || !sceneData) {
      group.visible = false;
      return;
    }

    const nextKey = `${sceneData.capturedAt}|${sceneData.objects.length}|${sceneData.ceilingHeightCm}`;
    if (builtKey !== nextKey) {
      disposeGroupChildren(group);
      const ceilingM = sceneData.ceilingHeightCm / 100;
      for (const obj of sceneData.objects) {
        const mesh = buildReplicaObjectMesh(obj, ceilingM);
        group.add(mesh);
      }
      builtKey = nextKey;
    }

    group.visible = true;
    for (const child of group.children) {
      const isInferred = Boolean(child.userData.inferred);
      child.visible = !isInferred || showInferred;
    }
  }

  return {
    group,
    update,
    dispose: () => {
      disposeGroupChildren(group);
      parent.remove(group);
    },
  };
}
