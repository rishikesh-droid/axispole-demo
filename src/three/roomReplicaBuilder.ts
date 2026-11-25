import * as THREE from 'three';
import type {
  MeasuredRoomObject3D,
  ReplicaDepthMeshData,
  ReplicaRenderMode,
  RoomArchitecturalFeature,
  RoomReplicaObject,
  RoomReplicaScene,
} from '../types/pole';

export interface RoomReplicaRigHandle {
  group: THREE.Group;
  update: (
    sceneData: RoomReplicaScene | null,
    visible: boolean,
    showInferred: boolean,
    renderMode?: ReplicaRenderMode,
    showDimensions?: boolean,
    maxAnisotropy?: number
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
    map?: THREE.Texture;
  }
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: opts?.map ? new THREE.Color(0xffffff) : new THREE.Color(hex),
    roughness,
    metalness,
    map: opts?.map ?? null,
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
  const topThick = 0.038;
  const isBuiltInBays =
    obj.variant === 'built-in-bays' || (W >= 1.45 && obj.hasMonitor !== true);

  if (isBuiltInBays) {
    const deskMat = makeMat(obj.primaryColor, 0.52, 0.05);
    const backMat = makeMat(obj.secondaryColor, 0.72, 0.04);
    const towerMat = makeMat('#1f232b', 0.48, 0.25);

    // Continuous workstation counter surface
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, topThick, D), deskMat);
    top.position.y = H - topThick / 2;
    g.add(top);

    // Subtle raised rear backsplash + under-desk front apron rail
    const riserH = 0.14;
    const riser = new THREE.Mesh(new THREE.BoxGeometry(W, riserH, 0.026), deskMat);
    riser.position.set(0, H + riserH / 2, -D / 2 + 0.015);
    g.add(riser);

    const apron = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.055, 0.024), deskMat);
    apron.position.set(0, H - topThick - 0.028, D / 2 - 0.06);
    g.add(apron);

    // Rear lower wall modesty backing
    const modesty = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.02, H - topThick, 0.02),
      backMat
    );
    modesty.position.set(0, (H - topThick) / 2, -D / 2 + 0.014);
    g.add(modesty);

    // Bay vertical cheek partitions (ends + interior dividers)
    const bays = Math.max(1, Math.min(4, obj.bayCount ?? (W >= 1.9 ? 3 : 2)));
    const panelThick = 0.028;
    for (let i = 0; i <= bays; i++) {
      const px = -W / 2 + panelThick / 2 + (i / bays) * (W - panelThick);
      const sidePanel = new THREE.Mesh(
        new THREE.BoxGeometry(panelThick, H + (i > 0 && i < bays ? 0.34 : 0.12), D - 0.02),
        deskMat
      );
      sidePanel.position.set(
        px,
        (H + (i > 0 && i < bays ? 0.34 : 0.12)) / 2,
        0
      );
      g.add(sidePanel);
    }

    // Subtle under-desk PC tower / UPS footrest inside right bay when wide
    if (W >= 1.3) {
      const pc = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.42, 0.44), towerMat);
      pc.position.set(W * 0.16, 0.21, -0.04);
      const ups = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.24), towerMat);
      ups.position.set(W * 0.36, 0.045, -0.06);
      g.add(pc, ups);
    }
  } else {
    const topMat = makeMat(obj.primaryColor, 0.56, 0.06);
    const frameMat = makeMat(obj.secondaryColor, 0.35, 0.65);

    const top = new THREE.Mesh(new THREE.BoxGeometry(W, topThick, D), topMat);
    top.position.y = H - topThick / 2;
    g.add(top);

    const apron = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.045, D - 0.12), frameMat);
    apron.position.y = H - topThick - 0.022;
    g.add(apron);

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

    if (W >= 1.05 && obj.hasMonitor === true) {
      const pedW = Math.min(0.4, W * 0.28);
      const pedH = legH - 0.06;
      const ped = new THREE.Mesh(new THREE.BoxGeometry(pedW, pedH, D - 0.08), topMat);
      ped.position.set(W / 2 - pedW / 2 - 0.07, pedH / 2 + 0.03, 0);
      g.add(ped);
    }
  }

  // Only render monitor + keyboard if explicitly detected/visible in the photo
  if (obj.hasMonitor === true) {
    const frameMat = makeMat('#1f232b', 0.3, 0.6);
    const screenMat = makeMat('#11151e', 0.14, 0.3, {
      emissive: '#38bdf8',
      emissiveIntensity: 0.22,
    });
    const monW = Math.min(0.58, W * 0.42);
    const monH = monW * 0.56;
    const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.13), frameMat);
    standBase.position.set(-W * 0.06, H + 0.006, -D * 0.22);
    const standNeck = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.13, 0.022), frameMat);
    standNeck.position.set(-W * 0.06, H + 0.07, -D * 0.25);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(monW, monH, 0.022), frameMat);
    bezel.position.set(-W * 0.06, H + 0.11 + monH / 2, -D * 0.23);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(monW - 0.026, monH - 0.026), screenMat);
    screen.position.set(-W * 0.06, H + 0.11 + monH / 2, -D * 0.23 + 0.012);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.1), frameMat);
    kb.position.set(-W * 0.06, H + 0.006, D * 0.12);
    g.add(standBase, standNeck, bezel, screen, kb);
  }

  enableShadows(g);
  return g;
}

function buildOfficeChair(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const cushionMat = makeMat(obj.primaryColor, 0.72, 0.06);
  const metalMat = makeMat(obj.secondaryColor, 0.3, 0.75);
  const seatY = Math.min(0.47, H * 0.46);

  // 5-star caster base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, 0.26), metalMat);
    arm.position.set(Math.sin(a) * 0.125, 0.062, Math.cos(a) * 0.125);
    arm.rotation.y = a;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.024, 12), metalMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(Math.sin(a) * 0.235, 0.023, Math.cos(a) * 0.235);
    g.add(arm, wheel);
  }

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, seatY - 0.06, 14), metalMat);
  stem.position.y = 0.06 + (seatY - 0.06) / 2;
  g.add(stem);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.065, D * 0.8), cushionMat);
  seat.position.y = seatY;
  g.add(seat);

  // Sculpted ergonomic mesh-style backrest with horizontal ribs
  const backH = Math.max(0.38, H - seatY - 0.04);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W * 0.76, backH, 0.042), cushionMat);
  back.position.set(0, seatY + backH / 2 + 0.03, -D * 0.35);
  back.rotation.x = -0.09;
  g.add(back);

  for (let r = 0; r < 3; r++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.016, 0.048), metalMat);
    rib.position.set(0, seatY + 0.1 + (r / 2) * (backH - 0.12), -D * 0.355);
    rib.rotation.x = -0.09;
    g.add(rib);
  }

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.052, backH * 0.78, 0.03), metalMat);
  spine.position.set(0, seatY + backH * 0.38, -D * 0.39);
  g.add(spine);

  // Curved loop armrests
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.19, 0.03), metalMat);
    post.position.set(sx * (W * 0.43), seatY + 0.095, -0.02);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.024, D * 0.56), cushionMat);
    pad.position.set(sx * (W * 0.43), seatY + 0.2, 0.01);
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

  enableShadows(g);
  return g;
}

function buildSofa(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H } = obj;
  const fabricMat = makeMat(obj.primaryColor, 0.86, 0.02);
  const pillowMat = makeMat(obj.secondaryColor, 0.84, 0.02);
  const footMat = makeMat('#2b2623', 0.5, 0.2);

  const isArmchair = obj.variant === 'armchair' || W <= 1.18;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.06, 10), footMat);
      foot.position.set(sx * (W / 2 - 0.1), 0.03, sz * (D / 2 - 0.1));
      g.add(foot);
    }
  }

  if (isArmchair) {
    // Sleek sculpted corner lounge armchair (curved wrap-around back & arms)
    const baseH = Math.min(0.24, H * 0.34);
    const base = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, baseH, D - 0.02), fabricMat);
    base.position.y = 0.06 + baseH / 2;
    g.add(base);

    const armW = Math.min(0.14, W * 0.14);
    const armH = Math.min(0.42, H * 0.55);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, D - 0.02), fabricMat);
      arm.position.set(sx * (W / 2 - armW / 2), 0.06 + baseH + armH / 2 - 0.08, 0);
      g.add(arm);
    }

    const seatC = new THREE.Mesh(
      new THREE.BoxGeometry(W - armW * 2 - 0.02, 0.13, D * 0.78),
      fabricMat
    );
    seatC.position.set(0, 0.06 + baseH + 0.06, D * 0.07);

    const backH = Math.max(0.34, H - (0.06 + baseH));
    const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, backH, 0.15), fabricMat);
    back.position.set(0, 0.06 + baseH + backH / 2 - 0.06, -D / 2 + 0.085);
    g.add(seatC, back);

    enableShadows(g);
    return g;
  }

  const baseH = Math.min(0.22, H * 0.28);
  const base = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, baseH, D - 0.04), fabricMat);
  base.position.y = 0.06 + baseH / 2;
  g.add(base);

  const armW = Math.min(0.18, W * 0.11);
  const armH = Math.min(0.54, H * 0.68);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, D - 0.02), fabricMat);
    arm.position.set(sx * (W / 2 - armW / 2), 0.06 + armH / 2, 0);
    g.add(arm);
  }

  const innerW = W - armW * 2 - 0.03;
  const count = W >= 1.75 ? 3 : 2;
  const cW = innerW / count - 0.015;
  const seatTopY = 0.06 + baseH + 0.13;
  const backH = Math.max(0.32, H - seatTopY + 0.06);

  for (let i = 0; i < count; i++) {
    const cx = -innerW / 2 + (i + 0.5) * (innerW / count);
    const seatC = new THREE.Mesh(new THREE.BoxGeometry(cW, 0.14, D * 0.72), fabricMat);
    seatC.position.set(cx, 0.06 + baseH + 0.065, D * 0.08);
    const backC = new THREE.Mesh(new THREE.BoxGeometry(cW, backH, 0.17), fabricMat);
    backC.position.set(cx, seatTopY + backH / 2 - 0.04, -D / 2 + 0.15);
    backC.rotation.x = -0.14;
    g.add(seatC, backC);
  }

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

  const headH = Math.max(0.92, H + 0.42);
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, headH, 0.09), frameMat);
  headboard.position.set(0, headH / 2, -D / 2 + 0.045);
  g.add(headboard);

  const matH = Math.max(0.2, H - frameH);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, matH, D - 0.12), sheetMat);
  mattress.position.set(0, frameH + 0.05 + matH / 2, 0.03);
  g.add(mattress);

  const duvet = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, matH * 0.55, D * 0.66), duvetMat);
  duvet.position.set(0, frameH + 0.06 + matH * 0.8, D * 0.15);
  g.add(duvet);

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
  const isOpenWallLedge =
    obj.variant === 'open-wall-ledge' || ((obj.elevationM ?? 0) >= 0.45 && H <= 0.46);

  if (isOpenWallLedge) {
    // Crisp horizontal open wall cubby/shelf box (e.g. bright white open shelf under wall cupboards)
    const shelfMat = makeMat(obj.primaryColor, 0.52, 0.04);
    const backMat = makeMat(obj.secondaryColor, 0.72, 0.03);
    const thick = 0.028;

    const topBoard = new THREE.Mesh(new THREE.BoxGeometry(W, thick, D), shelfMat);
    topBoard.position.y = H - thick / 2;
    const botBoard = new THREE.Mesh(new THREE.BoxGeometry(W, thick, D), shelfMat);
    botBoard.position.y = thick / 2;
    const backBoard = new THREE.Mesh(
      new THREE.BoxGeometry(W - thick, H - thick * 1.4, 0.018),
      backMat
    );
    backBoard.position.set(0, H / 2, -D / 2 + 0.01);
    g.add(topBoard, botBoard, backBoard);

    const bays = Math.max(1, Math.min(4, obj.bayCount ?? (W >= 1.8 ? 3 : 2)));
    for (let i = 0; i <= bays; i++) {
      const px = -W / 2 + thick / 2 + (i / bays) * (W - thick);
      const divider = new THREE.Mesh(new THREE.BoxGeometry(thick, H, D), shelfMat);
      divider.position.set(px, H / 2, 0);
      g.add(divider);
    }

    enableShadows(g);
    return g;
  }

  const woodMat = makeMat(obj.primaryColor, 0.62, 0.05);
  const backMat = makeMat(obj.secondaryColor, 0.8, 0.04);
  const thick = 0.028;

  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(thick, H, D), woodMat);
    side.position.set(sx * (W / 2 - thick / 2), H / 2, 0);
    g.add(side);
  }

  const back = new THREE.Mesh(new THREE.BoxGeometry(W - thick, H - 0.04, 0.016), backMat);
  back.position.set(0, H / 2, -D / 2 + 0.008);
  g.add(back);

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
  const bodyMat = makeMat(obj.primaryColor, 0.56, 0.06);
  const trimMat = makeMat(obj.secondaryColor, 0.38, 0.55);
  const seamMat = makeMat('#1f2329', 0.8, 0.1);

  const plinthH = isWallMounted ? 0 : 0.07;
  if (plinthH > 0) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, plinthH, D - 0.05), trimMat);
    plinth.position.y = plinthH / 2;
    g.add(plinth);
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H - plinthH, D - 0.025), bodyMat);
  body.position.set(0, plinthH + (H - plinthH) / 2, -0.01);
  g.add(body);

  // Explicit doorCount or auto-scaled 2..5 doors with crisp recessed reveal seams
  const doorCount = obj.doorCount ?? (W >= 1.75 ? 4 : W >= 1.25 ? 3 : 2);
  const doorW = W / doorCount - 0.012;
  const doorH = H - plinthH - 0.024;
  for (let i = 0; i < doorCount; i++) {
    const dx = -W / 2 + (i + 0.5) * (W / doorCount);
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.022), bodyMat);
    door.position.set(dx, plinthH + doorH / 2 + 0.012, D / 2 - 0.008);
    g.add(door);

    if (i > 0) {
      const seamX = -W / 2 + i * (W / doorCount);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.009, doorH + 0.01, 0.026), seamMat);
      seam.position.set(seamX, plinthH + doorH / 2 + 0.012, D / 2 - 0.004);
      g.add(seam);
    }

    const handleSide = i % 2 === 0 ? 1 : -1;
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, Math.min(0.16, doorH * 0.24), 0.024),
      trimMat
    );
    handle.position.set(
      dx + handleSide * Math.max(0.025, doorW * 0.36),
      isWallMounted ? doorH * 0.18 : plinthH + doorH * 0.54,
      D / 2 + 0.012
    );
    g.add(handle);
  }

  // Horizontal upper reveal strip matching flush Euro-style overhead cupboards
  if (isWallMounted && H >= 0.45) {
    const topReveal = new THREE.Mesh(new THREE.BoxGeometry(W - 0.01, 0.008, 0.026), seamMat);
    topReveal.position.set(0, H * 0.72, D / 2 + 0.002);
    g.add(topReveal);
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

  const tvW = Math.min(W * 0.84, 1.28);
  const tvH = tvW * 0.56;
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.16), screenFrameMat);
  ped.position.set(0, H + 0.01, -0.02);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.03), screenFrameMat);
  neck.position.set(0, H + 0.055, -0.03);
  const tvFrame = new THREE.Mesh(new THREE.BoxGeometry(tvW, tvH, 0.032), screenFrameMat);
  tvFrame.position.set(0, H + 0.08 + tvH / 2, -0.02);
  const tvDisplay = new THREE.Mesh(new THREE.PlaneGeometry(tvW - 0.03, tvH - 0.03), screenGlassMat);
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
  const thick = type === 'fitness-mat' ? 0.014 : 0.015;

  const border = new THREE.Mesh(new THREE.BoxGeometry(W, thick, D), borderMat);
  border.position.y = thick / 2 + 0.005;
  const center = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.16, W - 0.06), thick + 0.003, Math.max(0.16, D - 0.06)),
    mainMat
  );
  center.position.y = thick / 2 + 0.006;
  g.add(border, center);

  enableShadows(g, false, true);
  return g;
}

function buildPlant(obj: RoomReplicaObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, heightM: H } = obj;
  const potMat = makeMat(obj.secondaryColor, 0.62, 0.08);
  const soilMat = makeMat('#3a2c22', 0.95, 0.0);
  const leafMat = makeMat(obj.primaryColor, 0.66, 0.03);
  const trunkMat = makeMat('#6b5340', 0.85, 0.02);

  const isSmallShelfPot =
    obj.variant === 'small-shelf-pot' || H <= 0.34 || (obj.elevationM ?? 0) >= 0.45;
  const isTallTree = obj.variant === 'tall-tree' || H >= 1.35;

  if (isSmallShelfPot) {
    const potR = Math.max(0.038, Math.min(0.065, W * 0.36));
    const potH = Math.min(0.08, H * 0.42);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.8, potH, 14), potMat);
    pot.position.y = potH / 2;
    g.add(pot);

    const tuftCount = 6;
    for (let i = 0; i < tuftCount; i++) {
      const a = (i / tuftCount) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(potR * 0.72, 0), leafMat);
      leaf.position.set(
        Math.cos(a) * potR * 0.48,
        potH + (H - potH) * 0.48 + (i % 2) * 0.015,
        Math.sin(a) * potR * 0.48
      );
      leaf.scale.set(1.0, 0.85, 0.9);
      g.add(leaf);
    }
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(potR * 0.75, 0), leafMat);
    crown.position.y = potH + (H - potH) * 0.72;
    g.add(crown);
    enableShadows(g);
    return g;
  }

  if (isTallTree) {
    // Tall indoor tree (sculpted ribbed planter + woody trunk + lush multi-tier botanical crown)
    const potR = Math.max(0.14, Math.min(0.22, W * 0.36));
    const potH = Math.min(0.36, H * 0.22);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.76, potH, 18), potMat);
    pot.position.y = potH / 2;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(potR * 0.9, potR * 0.9, 0.02, 16), soilMat);
    soil.position.y = potH - 0.012;

    const trunkH = H * 0.76;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.028, trunkH, 10),
      trunkMat
    );
    trunk.position.y = potH + trunkH * 0.42;
    g.add(pot, soil, trunk);

    // Multi-tier foliage crowns (lower & upper canopy tufts)
    const tiers = [
      { y: potH + trunkH * 0.56, r: potR * 1.15, count: 6 },
      { y: potH + trunkH * 0.88, r: potR * 1.35, count: 8 },
    ];
    for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
      const tier = tiers[tIdx];
      for (let i = 0; i < tier.count; i++) {
        const a = (i / tier.count) * Math.PI * 2 + tIdx * 0.4;
        const rad = tier.r * (0.45 + (i % 2) * 0.35);
        const cluster = new THREE.Mesh(
          new THREE.DodecahedronGeometry(tier.r * 0.52, 1),
          leafMat
        );
        cluster.position.set(
          Math.cos(a) * rad,
          tier.y + ((i % 3) - 1) * 0.1,
          Math.sin(a) * rad
        );
        cluster.scale.set(1.15, 0.82, 1.05);
        g.add(cluster);
      }
    }
    const topCrown = new THREE.Mesh(new THREE.DodecahedronGeometry(potR * 0.85, 1), leafMat);
    topCrown.position.y = H - 0.14;
    g.add(topCrown);

    enableShadows(g);
    return g;
  }

  const potR = Math.max(0.11, Math.min(0.22, W * 0.42));
  const potH = Math.min(0.38, H * 0.35);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.76, potH, 18), potMat);
  pot.position.y = potH / 2;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(potR * 0.9, potR * 0.9, 0.02, 16), soilMat);
  soil.position.y = potH - 0.015;
  g.add(pot, soil);

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

    const leaf = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.075, potR * 0.55), 10, 8), leafMat);
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
  const isOpenDoorway =
    obj.variant === 'open-doorway' || obj.label.toLowerCase().includes('doorway');

  if (isOpenDoorway) {
    const jambMat = makeMat(obj.secondaryColor, 0.52, 0.08);
    const corridorWallMat = makeMat(obj.primaryColor, 0.85, 0.02, {
      emissive: obj.primaryColor,
      emissiveIntensity: 0.24,
    });
    const corridorFloorMat = makeMat('#d8d3ca', 0.38, 0.04, {
      emissive: obj.primaryColor,
      emissiveIntensity: 0.12,
    });

    const jambW = 0.068;
    const alcoveD = 0.42;
    for (const sx of [-1, 1]) {
      const sideJamb = new THREE.Mesh(new THREE.BoxGeometry(jambW, H, 0.12), jambMat);
      sideJamb.position.set(sx * (W / 2 + jambW / 2), H / 2, 0.02);
      const alcoveSide = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, alcoveD), corridorWallMat);
      alcoveSide.position.set(sx * (W / 2 - 0.015), H / 2, -alcoveD / 2);
      g.add(sideJamb, alcoveSide);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(W + jambW * 2, jambW, 0.12), jambMat);
    header.position.set(0, H + jambW / 2, 0.02);

    const alcoveBack = new THREE.Mesh(new THREE.PlaneGeometry(W, H), corridorWallMat);
    alcoveBack.position.set(0, H / 2, -alcoveD);
    const alcoveFloor = new THREE.Mesh(new THREE.PlaneGeometry(W, alcoveD), corridorFloorMat);
    alcoveFloor.rotation.x = -Math.PI / 2;
    alcoveFloor.position.set(0, 0.008, -alcoveD / 2);

    // Subtle console stand silhouette inside adjacent hallway for authentic depth parallax
    const hallStand = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(0.36, W * 0.38), 0.72, 0.22),
      makeMat('#6b5e50', 0.55, 0.18)
    );
    hallStand.position.set(-W * 0.15, 0.36, -alcoveD * 0.55);
    const hallVase = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.14, 0),
      makeMat('#e7b9ac', 0.75, 0.02)
    );
    hallVase.position.set(-W * 0.15, 0.85, -alcoveD * 0.55);

    g.add(header, alcoveBack, alcoveFloor, hallStand, hallVase);
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

function makeGraphicCanvasTexture(
  wPx: number,
  hPx: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, wPx, hPx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildMirrorOrArt(obj: RoomReplicaObject, ceilingHeightM: number): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, heightM: H, type } = obj;
  const frameMat = makeMat(obj.primaryColor, 0.4, 0.55);
  const centerY =
    type === 'mirror'
      ? Math.min(ceilingHeightM - H / 2 - 0.12, Math.max(H / 2 + 0.08, 1.12))
      : Math.min(ceilingHeightM - H / 2 - 0.18, 1.52);

  if (obj.variant === 'switch-panel') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.016), makeMat('#f3f4f6', 0.35, 0.05));
    plate.position.set(0, 1.18, 0);
    g.add(plate);
    enableShadows(g, false, true);
    return g;
  }

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

function buildArchitecturalFeature(
  feat: RoomArchitecturalFeature,
  ceilingHeightM: number
): THREE.Group {
  const g = new THREE.Group();
  const { widthM: W, depthM: D, heightM: H, primaryColor, secondaryColor } = feat;

  switch (feat.type) {
    case 'soffit-beam': {
      const beamMat = makeMat(primaryColor, 0.72, 0.03);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), beamMat);
      beam.position.set(0, H / 2, 0);
      g.add(beam);

      if (feat.textLabel) {
        const tex = makeGraphicCanvasTexture(1024, 256, (ctx, cw, ch) => {
          ctx.fillStyle = primaryColor;
          ctx.fillRect(0, 0, cw, ch);
          ctx.fillStyle = secondaryColor;
          // Accent corner triangles
          ctx.beginPath();
          ctx.moveTo(42, 24);
          ctx.lineTo(94, 24);
          ctx.lineTo(68, 72);
          ctx.closePath();
          ctx.fill();

          ctx.font = '700 66px "Plus Jakarta Sans", sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'right';
          const lines = feat.textLabel!.split(/\s+/).slice(0, 4);
          if (lines.length === 2) {
            ctx.fillText(lines[0], cw - 64, ch * 0.34);
            ctx.fillText(lines[1], cw - 64, ch * 0.72);
          } else {
            ctx.fillText(feat.textLabel!, cw - 64, ch * 0.52);
          }
        });
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(W * 0.98, H * 0.94),
          makeMat('#ffffff', 0.78, 0.02, { map: tex })
        );
        face.position.set(0, H / 2, D / 2 + 0.003);
        g.add(face);
      }
      g.position.set(
        feat.x,
        Math.min(ceilingHeightM - H, Math.max(1.6, feat.elevationM)),
        feat.z
      );
      break;
    }

    case 'ceiling-fan': {
      const rodMat = makeMat(secondaryColor, 0.35, 0.65);
      const bladeMat = makeMat(primaryColor, 0.42, 0.12);
      const rodH = Math.min(0.26, Math.max(0.14, H * 0.65));

      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.04, 16), rodMat);
      canopy.position.y = -0.02;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, rodH, 12), rodMat);
      rod.position.y = -rodH / 2 - 0.02;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.07, 20), rodMat);
      hub.position.y = -rodH - 0.03;
      g.add(canopy, rod, hub);

      const bladeLen = Math.max(0.38, Math.min(0.58, W * 0.46));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const bladePivot = new THREE.Group();
        bladePivot.position.y = -rodH - 0.03;
        bladePivot.rotation.y = a;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeLen, 0.012, 0.11), bladeMat);
        blade.position.x = bladeLen * 0.5 + 0.05;
        blade.rotation.x = 0.12;
        bladePivot.add(blade);
        g.add(bladePivot);
      }
      g.position.set(feat.x, ceilingHeightM, feat.z);
      break;
    }

    case 'ceiling-spotlights': {
      const canMat = makeMat(primaryColor, 0.35, 0.6);
      const lensMat = makeMat('#fff8e6', 0.15, 0.1, {
        emissive: '#fef3c7',
        emissiveIntensity: 1.4,
      });
      const n = Math.max(1, Math.min(6, feat.count ?? 3));
      for (let i = 0; i < n; i++) {
        const ox = n === 1 ? 0 : -W / 2 + 0.14 + (i / (n - 1)) * Math.max(0.2, W - 0.28);
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.11, 16), canMat);
        can.position.set(ox, -0.055, 0);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.036, 14), lensMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(ox, -0.111, 0);
        g.add(can, lens);
      }
      g.position.set(feat.x, ceilingHeightM, feat.z);
      break;
    }

    case 'slatted-panel': {
      const backMat = makeMat(secondaryColor, 0.85, 0.04);
      const slatMat = makeMat(primaryColor, 0.62, 0.08);
      const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, Math.max(0.016, D * 0.5)), backMat);
      back.position.set(0, H / 2, 0);
      g.add(back);

      const slatCount = Math.max(4, Math.min(36, feat.count ?? Math.round(W * 14)));
      const slatW = Math.min(0.036, (W / slatCount) * 0.56);
      const slatGeo = new THREE.BoxGeometry(slatW, H - 0.01, Math.max(0.022, D * 0.65));
      for (let i = 0; i < slatCount; i++) {
        const sx = -W / 2 + (i + 0.5) * (W / slatCount);
        const slat = new THREE.Mesh(slatGeo, slatMat);
        slat.position.set(sx, H / 2, D * 0.35);
        g.add(slat);
      }
      g.position.set(feat.x, feat.elevationM, feat.z);
      break;
    }

    case 'wall-logo': {
      const logoMat = makeMat(primaryColor, 0.32, 0.25);
      // Stylized twin slanted geometric chevron bars + triangle emblem (or crisp monogram)
      const hUnit = H * 0.85;
      const barW = W * 0.22;
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(barW, hUnit, 0.032), logoMat);
      bar1.position.set(-W * 0.02, H / 2, 0.016);
      bar1.rotation.z = -0.22;
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(barW, hUnit, 0.032), logoMat);
      bar2.position.set(W * 0.24, H / 2, 0.016);
      bar2.rotation.z = -0.22;
      const dot = new THREE.Mesh(new THREE.BoxGeometry(barW * 0.9, hUnit * 0.36, 0.032), logoMat);
      dot.position.set(-W * 0.26, H * 0.72, 0.016);
      dot.rotation.z = -0.22;
      g.add(dot, bar1, bar2);
      g.position.set(feat.x, feat.elevationM, feat.z);
      break;
    }

    case 'wall-mural': {
      const tex = makeGraphicCanvasTexture(512, 512, (ctx, cw, ch) => {
        ctx.clearRect(0, 0, cw, ch);
        // Subtle triangle accent cluster + clean wall typography
        ctx.fillStyle = primaryColor;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3 - r; c++) {
            const tx = cw * 0.45 + c * 48 + r * 24;
            const ty = 48 + r * 44;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + 34, ty);
            ctx.lineTo(tx + 17, ty + 28);
            ctx.closePath();
            ctx.strokeStyle = c % 2 === 0 ? primaryColor : secondaryColor;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        }
        if (feat.textLabel) {
          ctx.fillStyle = primaryColor;
          ctx.font = '600 32px "DM Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(feat.textLabel.slice(0, 26), 28, ch * 0.56);
        }
      });
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        makeMat('#ffffff', 0.85, 0.02, { map: tex, transparent: true })
      );
      plane.position.set(0, H / 2, 0.012);
      g.add(plane);
      g.position.set(feat.x, feat.elevationM, feat.z);
      break;
    }

    case 'door-garland': {
      const orangeMat = makeMat(primaryColor, 0.72, 0.02);
      const yellowMat = makeMat(secondaryColor, 0.72, 0.02);
      const beads = Math.max(8, Math.min(26, Math.round(H * 14)));
      for (let i = 0; i < beads; i++) {
        const y = H - (i + 0.5) * (H / beads);
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(0.026, 8, 6),
          i > beads * 0.66 && i < beads * 0.84 ? yellowMat : orangeMat
        );
        bead.position.set(0, y, 0.025);
        g.add(bead);
      }
      g.position.set(feat.x, feat.elevationM, feat.z);
      break;
    }

    case 'desk-box': {
      const boxMat = makeMat(primaryColor, 0.86, 0.02);
      const labelMat = makeMat(secondaryColor, 0.85, 0.01);
      const body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.45, D), boxMat);
      body.position.y = H * 0.225;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, H * 0.55, 0.016), boxMat);
      lid.position.set(0, H * 0.65, -D * 0.42);
      lid.rotation.x = 0.25;
      const sticker = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.35, H * 0.22), labelMat);
      sticker.position.set(W * 0.2, H * 0.24, D / 2 + 0.002);
      g.add(body, lid, sticker);
      g.position.set(feat.x, feat.elevationM, feat.z);
      break;
    }
  }

  g.name = `Replica_Feat_${feat.type}_${feat.id}`;
  g.rotation.y = THREE.MathUtils.degToRad(feat.rotationDeg);
  enableShadows(g, feat.type !== 'wall-mural', true);
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

function makeDimensionTagSprite(
  obj: MeasuredRoomObject3D,
  isDarkTheme: boolean
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Crisp architectural dimension callout badge
    ctx.fillStyle = isDarkTheme ? 'rgba(10, 18, 34, 0.92)' : 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = isDarkTheme ? 'rgba(56, 189, 248, 0.85)' : 'rgba(15, 23, 42, 0.75)';
    ctx.lineWidth = 4;
    const r = 14;
    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, r);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDarkTheme ? '#e0f2fe' : '#0f172a';
    ctx.font = '700 28px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obj.label.slice(0, 24), canvas.width / 2, 42);

    ctx.fillStyle = isDarkTheme ? '#38bdf8' : '#0369a1';
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.fillText(
      `W ${obj.widthM.toFixed(2)}m · D ${obj.depthM.toFixed(2)}m · H ${obj.heightM.toFixed(2)}m`,
      canvas.width / 2,
      78
    );
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.56, 0.124, 1);
  sprite.position.set(obj.x, Math.max(0.72, obj.maxY + 0.14), obj.z);
  sprite.renderOrder = 25;
  return sprite;
}

function buildMetricFloorTileGrid(
  bounds: ReplicaDepthMeshData['bounds'],
  roomW: number,
  roomD: number,
  renderMode: ReplicaRenderMode
): THREE.Group {
  const floorGroup = new THREE.Group();
  floorGroup.name = 'Replica_MetricFloorGrid';

  const isBp = renderMode === 'blueprint';
  const minX = Math.min(bounds.minX, -roomW * 0.5) - 0.35;
  const maxX = Math.max(bounds.maxX, roomW * 0.5) + 0.35;
  const minZ = Math.min(bounds.minZ, -roomD * 0.5) - 0.25;
  const maxZ = Math.max(bounds.maxZ, roomD * 0.5) + 0.35;

  const spanX = Math.max(2.4, maxX - minX);
  const spanZ = Math.max(2.4, maxZ - minZ);
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  // Clean grounding floor sheet under the pole & room footprint (zero void on orbit!)
  const baseGeo = new THREE.PlaneGeometry(spanX, spanZ);
  baseGeo.rotateX(-Math.PI / 2);
  const baseMat = new THREE.MeshBasicMaterial({
    color: isBp ? 0x0b1324 : 0xfafbfd,
    transparent: renderMode === 'textured',
    opacity: renderMode === 'textured' ? 0.65 : 1.0,
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 4,
  });
  const basePlane = new THREE.Mesh(baseGeo, baseMat);
  basePlane.position.set(cx, Math.min(-0.028, bounds.minY - 0.008), cz);
  floorGroup.add(basePlane);

  // Crisp 0.60m architectural floor tile grid (matches architectural CAD floor tiles!)
  const tileSize = 0.6;
  const gridVerts: number[] = [];
  const startX = Math.floor(minX / tileSize) * tileSize;
  const endX = Math.ceil(maxX / tileSize) * tileSize;
  const startZ = Math.floor(minZ / tileSize) * tileSize;
  const endZ = Math.ceil(maxZ / tileSize) * tileSize;

  for (let x = startX; x <= endX + 1e-4; x += tileSize) {
    gridVerts.push(x, 0.003, startZ, x, 0.003, endZ);
  }
  for (let z = startZ; z <= endZ + 1e-4; z += tileSize) {
    gridVerts.push(startX, 0.003, z, endX, 0.003, z);
  }

  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridVerts, 3));
  const gridMat = new THREE.LineBasicMaterial({
    color: isBp ? 0x38bdf8 : 0x64748b,
    transparent: true,
    opacity: isBp ? 0.34 : 0.32,
    depthWrite: false,
  });
  const gridLines = new THREE.LineSegments(gridGeo, gridMat);
  gridLines.renderOrder = 3;
  floorGroup.add(gridLines);

  // Clean outer architectural floor border
  const borderVerts = [
    startX, 0.004, startZ, endX, 0.004, startZ,
    endX, 0.004, startZ, endX, 0.004, endZ,
    endX, 0.004, endZ, startX, 0.004, endZ,
    startX, 0.004, endZ, startX, 0.004, startZ,
  ];
  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderVerts, 3));
  const borderMat = new THREE.LineBasicMaterial({
    color: isBp ? 0x7dd3fc : 0x1e293b,
    transparent: true,
    opacity: isBp ? 0.55 : 0.45,
    depthWrite: false,
  });
  floorGroup.add(new THREE.LineSegments(borderGeo, borderMat));

  return floorGroup;
}

function buildDepthWireframeReplicaGroup(
  sceneData: RoomReplicaScene,
  depthMesh: ReplicaDepthMeshData,
  renderMode: ReplicaRenderMode,
  maxAnisotropy: number,
  onTextureReady?: () => void
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Replica_DepthCADWireframe';

  const isBp = renderMode === 'blueprint';
  const isTextured = renderMode === 'textured';

  // 1. Hidden-line 3D depth-displaced architectural surface mesh
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.BufferAttribute(depthMesh.positions, 3));
  surfGeo.setAttribute('uv', new THREE.BufferAttribute(depthMesh.uvs, 2));
  surfGeo.setIndex(new THREE.BufferAttribute(depthMesh.indices, 1));
  surfGeo.computeVertexNormals();

  const texUrl = isBp
    ? depthMesh.blueprintEdgeDataUrl
    : isTextured
      ? depthMesh.sourcePhotoDataUrl
      : depthMesh.cadEdgeDataUrl;

  const surfMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });

  if (texUrl) {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      surfMat.map = tex;
      surfMat.needsUpdate = true;
      onTextureReady?.();
    };
    img.src = texUrl;
  } else {
    surfMat.color.setHex(isBp ? 0x0d1526 : 0xf8fafc);
  }

  const surfMesh = new THREE.Mesh(surfGeo, surfMat);
  surfMesh.name = 'Replica_DepthSurface';
  surfMesh.renderOrder = 1;
  root.add(surfMesh);

  // 1b. Clean occlusion-cliff side skirts (matte architectural paper in Wireframe/Blueprint, seamless UV in Photo 3D)
  if (depthMesh.skirtIndices && depthMesh.skirtIndices.length > 0) {
    const skirtGeo = new THREE.BufferGeometry();
    skirtGeo.setAttribute('position', new THREE.BufferAttribute(depthMesh.positions, 3));
    skirtGeo.setAttribute('uv', new THREE.BufferAttribute(depthMesh.uvs, 2));
    skirtGeo.setIndex(new THREE.BufferAttribute(depthMesh.skirtIndices, 1));
    skirtGeo.computeVertexNormals();
    const skirtMat = isTextured
      ? surfMat
      : new THREE.MeshBasicMaterial({
          color: isBp ? 0x0d1526 : 0xf6f8fb,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: 3,
          polygonOffsetUnits: 3,
        });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.name = 'Replica_OcclusionSkirt';
    skirtMesh.renderOrder = 1;
    root.add(skirtMesh);
  }

  // 2. Subtle structural quad wireframe across room shell (clean architectural white walls!)
  if (depthMesh.wireframePositions.length > 0) {
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(depthMesh.wireframePositions, 3));
    const wireMat = new THREE.LineBasicMaterial({
      color: isBp ? 0x38bdf8 : 0x475569,
      transparent: true,
      opacity: isTextured ? 0.05 : isBp ? 0.22 : 0.08,
      depthWrite: false,
    });
    const wireLines = new THREE.LineSegments(wireGeo, wireMat);
    wireLines.name = 'Replica_StructuralWireframe';
    wireLines.renderOrder = 4;
    root.add(wireLines);
  }

  // 3. Clean CAD quad mesh emphasizing foreground 3D furniture & planters (sofa, pots)
  if (depthMesh.foregroundWirePositions.length > 0) {
    const fgGeo = new THREE.BufferGeometry();
    fgGeo.setAttribute('position', new THREE.BufferAttribute(depthMesh.foregroundWirePositions, 3));
    const fgMat = new THREE.LineBasicMaterial({
      color: isBp ? 0x7dd3fc : 0x1e293b,
      transparent: true,
      opacity: isTextured ? 0.1 : isBp ? 0.42 : 0.24,
      depthWrite: false,
    });
    const fgLines = new THREE.LineSegments(fgGeo, fgMat);
    fgLines.name = 'Replica_ForegroundQuadMesh';
    fgLines.renderOrder = 5;
    root.add(fgLines);
  }

  // 4. Crisp 3D depth-silhouette & corner-crease architectural contour lines
  if (depthMesh.silhouettePositions.length > 0) {
    const silGeo = new THREE.BufferGeometry();
    silGeo.setAttribute('position', new THREE.BufferAttribute(depthMesh.silhouettePositions, 3));
    const silMat = new THREE.LineBasicMaterial({
      color: isBp ? 0xe0f2fe : 0x0f172a,
      transparent: true,
      opacity: isTextured ? 0.18 : isBp ? 0.72 : 0.48,
      depthWrite: false,
    });
    const silLines = new THREE.LineSegments(silGeo, silMat);
    silLines.name = 'Replica_SilhouetteContours';
    silLines.renderOrder = 6;
    root.add(silLines);
  }

  // 5. Calibrated metric architectural floor tile grid grounded cleanly at Y = 0
  root.add(
    buildMetricFloorTileGrid(
      depthMesh.bounds,
      sceneData.roomWidthM,
      sceneData.roomDepthM,
      renderMode
    )
  );

  // 6. Toggleable 3D Measured Object Dimension Wireframes & W x D x H metric tags
  const dimsGroup = new THREE.Group();
  dimsGroup.name = 'Replica_MeasuredObjectDimensions';
  dimsGroup.userData.isDimensionOverlay = true;

  for (const obj of depthMesh.measuredObjects) {
    const boxGeo = new THREE.BoxGeometry(obj.widthM, obj.heightM, obj.depthM);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();

    const edgeMat = new THREE.LineBasicMaterial({
      color: isBp ? 0x22d3ee : 0x0284c7,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const wireframeBox = new THREE.LineSegments(edgesGeo, edgeMat);
    wireframeBox.position.set(obj.x, obj.minY + obj.heightM * 0.5, obj.z);
    wireframeBox.renderOrder = 18;
    dimsGroup.add(wireframeBox);

    dimsGroup.add(makeDimensionTagSprite(obj, isBp));
  }
  root.add(dimsGroup);

  return root;
}

function disposeGroupChildren(parent: THREE.Group): void {
  while (parent.children.length > 0) {
    const child = parent.children[0];
    parent.remove(child);
    child.traverse((node) => {
      if (
        node instanceof THREE.Mesh ||
        node instanceof THREE.LineSegments ||
        node instanceof THREE.Line ||
        node instanceof THREE.Sprite
      ) {
        if ('geometry' in node && node.geometry) {
          node.geometry.dispose();
        }
        const mat = node.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if ('map' in m && m.map) (m.map as THREE.Texture).dispose();
            m.dispose();
          });
        } else if (mat) {
          if ('map' in mat && mat.map) (mat.map as THREE.Texture).dispose();
          mat.dispose();
        }
      }
    });
  }
}

/**
 * Manages the 3D Room Replica inside the viewport:
 * - When `sceneData.depthMesh` is available (all new scans), renders the high-precision
 *   metric 3D depth-displaced architectural CAD wireframe + measured W x D x H volumes.
 * - Falls back gracefully to procedural furniture meshes for legacy scenes without depthMesh.
 */
export function createRoomReplicaRig(
  parent: THREE.Group,
  onTextureReady?: () => void
): RoomReplicaRigHandle {
  const group = new THREE.Group();
  group.name = 'AxisPole_RoomReplica';
  group.visible = false;
  parent.add(group);

  let builtKey = '';

  function update(
    sceneData: RoomReplicaScene | null,
    visible: boolean,
    showInferred: boolean,
    renderMode: ReplicaRenderMode = 'wireframe',
    showDimensions = false,
    maxAnisotropy = 4
  ): void {
    if (!visible || !sceneData) {
      group.visible = false;
      return;
    }

    const hasDepthMesh = Boolean(sceneData.depthMesh);
    const featCount = sceneData.architecturalFeatures?.length ?? 0;
    const nextKey = hasDepthMesh
      ? `depth|${sceneData.capturedAt}|${renderMode}|${sceneData.ceilingHeightCm}|${sceneData.depthMesh!.gridW}x${sceneData.depthMesh!.gridH}`
      : `proc|${sceneData.capturedAt}|${sceneData.objects.length}|${featCount}|${sceneData.ceilingHeightCm}`;

    if (builtKey !== nextKey) {
      disposeGroupChildren(group);
      if (hasDepthMesh && sceneData.depthMesh) {
        group.add(
          buildDepthWireframeReplicaGroup(
            sceneData,
            sceneData.depthMesh,
            renderMode,
            maxAnisotropy,
            onTextureReady
          )
        );
      } else {
        const ceilingM = sceneData.ceilingHeightCm / 100;
        for (const obj of sceneData.objects) {
          group.add(buildReplicaObjectMesh(obj, ceilingM));
        }
        if (sceneData.architecturalFeatures) {
          for (const feat of sceneData.architecturalFeatures) {
            group.add(buildArchitecturalFeature(feat, ceilingM));
          }
        }
      }
      builtKey = nextKey;
    }

    group.visible = true;
    for (const child of group.children) {
      if (hasDepthMesh) {
        child.visible = true;
        child.traverse((node) => {
          if (node.userData.isDimensionOverlay) {
            node.visible = showDimensions;
          }
        });
      } else {
        const isInferred = Boolean(child.userData.inferred);
        child.visible = !isInferred || showInferred;
      }
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
