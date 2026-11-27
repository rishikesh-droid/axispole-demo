import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Crosshair,
  Maximize2,
  Minus,
  Plus,
} from 'lucide-react';
import type {
  FloorPlanUnit,
  LightingPreset,
  PoleClampResult,
  PoleContextMenuState,
  PoleInstance,
  PoleRigConfig,
  RoomReplicaScene,
} from '../types/pole';
import {
  clampPolePosition,
  getWallClearanceMarginM,
  isDarkLighting,
  POLE_FINISHES,
} from '../utils/poleConfig';
import {
  computeFloorPlanGridLines,
  computeFloorPlanRect,
  computePoleWallDistances,
  floorPlanToWorld,
  formatFloorArea,
  formatFloorPlanDim,
  worldToFloorPlan,
} from '../utils/floorPlan';
import { soundFx } from '../utils/soundFx';

interface FloorPlanViewProps {
  config: PoleRigConfig;
  poles: PoleInstance[];
  activePoleId: string;
  canAddPole: boolean;
  roomReplica: RoomReplicaScene | null;
  showInferredObjects: boolean;
  onSelectPole: (poleId: string) => void;
  onMovePole: (poleId: string, x: number, z: number, clamp: PoleClampResult) => void;
  onCenterActivePole: () => void;
  onAddPole: () => void;
  onChangeLighting: (lighting: LightingPreset) => void;
  onOpenContextMenu: (menu: PoleContextMenuState) => void;
  resetZoomSignal?: number;
}

export function FloorPlanView({
  config,
  poles,
  activePoleId,
  canAddPole,
  roomReplica,
  showInferredObjects,
  onSelectPole,
  onMovePole,
  onCenterActivePole,
  onAddPole,
  onChangeLighting: _onChangeLighting,
  onOpenContextMenu,
  resetZoomSignal = 0,
}: FloorPlanViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 960, height: 740 });
  const [zoom, setZoom] = useState(1);
  const [unit, setUnit] = useState<FloorPlanUnit>('m');
  const [draggingPoleId, setDraggingPoleId] = useState<string | null>(null);
  const [hoveredPoleId, setHoveredPoleId] = useState<string | null>(null);
  const [dragBoundaryHit, setDragBoundaryHit] = useState<{ wall: boolean; pole: boolean }>({
    wall: false,
    pole: false,
  });

  useEffect(() => {
    if (resetZoomSignal > 0) setZoom(1);
  }, [resetZoomSignal]);

  useEffect(() => {
    if (!draggingPoleId) return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [draggingPoleId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isCompactViewport = viewportSize.width < 640;
  const padX = isCompactViewport ? 44 : 112;
  const padY = isCompactViewport ? 38 : 68;
  const dockSafeBottom = isCompactViewport ? 420 : 196;
  const mobileTopOffset = isCompactViewport ? 72 : 0;

  const planRect = useMemo(() => {
    const raw = computeFloorPlanRect(
      viewportSize.width,
      Math.max(210, viewportSize.height - dockSafeBottom),
      config.roomWidthM,
      config.roomDepthM,
      zoom,
      padX,
      padY
    );
    return {
      ...raw,
      y: raw.y + mobileTopOffset,
    };
  }, [
    viewportSize.width,
    viewportSize.height,
    dockSafeBottom,
    mobileTopOffset,
    config.roomWidthM,
    config.roomDepthM,
    zoom,
    padX,
    padY,
  ]);

  const gridLines = useMemo(
    () => computeFloorPlanGridLines(config.roomWidthM, config.roomDepthM, 0.5),
    [config.roomWidthM, config.roomDepthM]
  );

  const activePole = useMemo(
    () => poles.find((p) => p.id === activePoleId) ?? poles[0],
    [poles, activePoleId]
  );

  const wallMarginM = getWallClearanceMarginM(
    config.mount,
    config.enforceMinClearance,
    config.clearanceRadiusM
  );

  const activeDistances = useMemo(
    () => computePoleWallDistances(activePole, config.roomWidthM, config.roomDepthM, poles),
    [activePole, config.roomWidthM, config.roomDepthM, poles]
  );

  const isDark = isDarkLighting(config.lighting);
  const isNeon = config.lighting === 'mood-neon';
  const isSunset = config.lighting === 'sunset-flow';
  const isPulse = config.lighting === 'cyber-pulse';

  // Theme-adaptive architectural blueprint palette
  const accentHex = isNeon
    ? '#818cf8'
    : isSunset
      ? '#fb923c'
      : isPulse
        ? '#34d399'
        : isDark
          ? '#f59e0b'
          : '#5b21b6';

  const accentSoftFill = isNeon
    ? 'rgba(129, 140, 248, 0.14)'
    : isSunset
      ? 'rgba(251, 146, 60, 0.14)'
      : isPulse
        ? 'rgba(52, 211, 153, 0.14)'
        : isDark
          ? 'rgba(245, 158, 11, 0.14)'
          : 'rgba(91, 33, 182, 0.08)';

  const canvasBgClass = isNeon
    ? 'bg-[#0b0d15]'
    : isSunset
      ? 'bg-[#140d11]'
      : isPulse
        ? 'bg-[#081014]'
        : isDark
          ? 'bg-[#11100e]'
          : 'bg-[#f4f3ef]';

  const floorFill = isNeon
    ? '#141726'
    : isSunset
      ? '#1d1419'
      : isPulse
        ? '#0f1a20'
        : isDark
          ? '#1a1815'
          : '#eae6dc';

  const wallStroke = isDark ? '#cbd5e1' : '#33312d';
  const minorGridStroke = isDark ? 'rgba(255,255,255,0.055)' : 'rgba(60,55,46,0.08)';
  const majorGridStroke = isDark ? 'rgba(255,255,255,0.11)' : 'rgba(60,55,46,0.16)';
  const dimLineColor = isDark ? '#71717a' : '#78716c';
  const dimTextColor = isDark ? '#f4f4f5' : '#1c1917';
  const labelBgFill = isNeon
    ? '#0b0d15'
    : isSunset
      ? '#140d11'
      : isPulse
        ? '#081014'
        : isDark
          ? '#11100e'
          : '#f4f3ef';

  const surfaceToolbarClass = isNeon
    ? 'bg-[#12101f]/74 border-violet-300/20 text-zinc-100 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_28px_rgba(0,0,0,0.42)]'
    : isSunset
      ? 'bg-[#1f1218]/74 border-rose-300/22 text-rose-50 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_28px_rgba(0,0,0,0.42)]'
      : isPulse
        ? 'bg-[#0d181e]/74 border-emerald-300/22 text-emerald-50 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_28px_rgba(0,0,0,0.42)]'
        : isDark
          ? 'bg-[#171412]/76 border-amber-300/20 text-stone-100 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_28px_rgba(0,0,0,0.42)]'
          : 'bg-white/76 border-violet-900/12 text-stone-900 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_24px_rgba(30,20,55,0.08)]';

  const toolBtnHover = isDark ? 'hover:bg-white/10' : 'hover:bg-stone-200/80';

  const movePoleToClientPoint = useCallback(
    (poleId: string, clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const svgRect = svg.getBoundingClientRect();
      const sx = clientX - svgRect.left;
      const sy = clientY - svgRect.top;

      const raw = floorPlanToWorld(sx, sy, config.roomWidthM, config.roomDepthM, planRect);
      const others = poles.filter((p) => p.id !== poleId);
      const clamped = clampPolePosition(
        raw.x,
        raw.z,
        config.roomWidthM,
        config.roomDepthM,
        config.mount,
        others,
        config.enforceMinClearance
      );

      setDragBoundaryHit({
        wall: clamped.hitWallBoundary,
        pole: clamped.hitPoleBoundary,
      });
      onMovePole(poleId, clamped.x, clamped.z, clamped);
    },
    [
      config.roomWidthM,
      config.roomDepthM,
      config.mount,
      config.enforceMinClearance,
      planRect,
      poles,
      onMovePole,
    ]
  );

  const handlePolePointerDown = (
    e: ReactPointerEvent<SVGGElement>,
    poleId: string
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelectPole(poleId);
    setDraggingPoleId(poleId);
    setDragBoundaryHit({ wall: false, pole: false });
    soundFx.playDetent();
  };

  const handlePoleContextMenu = (
    e: ReactMouseEvent<SVGGElement>,
    poleId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectPole(poleId);
    onOpenContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      source: 'floor-plan',
      poleId,
    });
  };

  const handleCanvasContextMenu = (e: ReactMouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const svgRect = svg.getBoundingClientRect();
    const sx = e.clientX - svgRect.left;
    const sy = e.clientY - svgRect.top;
    const world = floorPlanToWorld(sx, sy, config.roomWidthM, config.roomDepthM, planRect);
    const insideRoom =
      sx >= planRect.x &&
      sx <= planRect.x + planRect.width &&
      sy >= planRect.y &&
      sy <= planRect.y + planRect.height;

    onOpenContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      source: 'floor-plan',
      poleId: null,
      worldX: insideRoom ? Number(world.x.toFixed(3)) : undefined,
      worldZ: insideRoom ? Number(world.z.toFixed(3)) : undefined,
    });
  };

  const handlePolePointerMove = (
    e: ReactPointerEvent<SVGGElement>,
    poleId: string
  ) => {
    if (draggingPoleId !== poleId) return;
    e.stopPropagation();
    movePoleToClientPoint(poleId, e.clientX, e.clientY);
  };

  const handlePolePointerUp = (
    e: ReactPointerEvent<SVGGElement>,
    poleId: string
  ) => {
    if (draggingPoleId !== poleId) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingPoleId(null);
    setDragBoundaryHit({ wall: false, pole: false });
  };

  const handlePoleKeyDown = (e: ReactKeyboardEvent<SVGGElement>, pole: PoleInstance) => {
    const step = e.shiftKey ? 0.25 : 0.1;
    let dx = 0;
    let dz = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dz = -step;
    else if (e.key === 'ArrowDown') dz = step;
    else return;

    e.preventDefault();
    onSelectPole(pole.id);
    const others = poles.filter((p) => p.id !== pole.id);
    const clamped = clampPolePosition(
      pole.x + dx,
      pole.z + dz,
      config.roomWidthM,
      config.roomDepthM,
      config.mount,
      others,
      config.enforceMinClearance
    );
    onMovePole(pole.id, clamped.x, clamped.z, clamped);
  };

  // Safe inner placement rectangle (inset by wallMarginM from all 4 walls)
  const safeInsetPx = Math.min(
    planRect.width / 2,
    planRect.height / 2,
    wallMarginM * planRect.pxPerMeter
  );
  const safeBoxX = planRect.x + safeInsetPx;
  const safeBoxY = planRect.y + safeInsetPx;
  const safeBoxW = Math.max(0, planRect.width - safeInsetPx * 2);
  const safeBoxH = Math.max(0, planRect.height - safeInsetPx * 2);

  // Active pole projected point
  const activePt = worldToFloorPlan(
    activePole.x,
    activePole.z,
    config.roomWidthM,
    config.roomDepthM,
    planRect
  );

  // Radial clearance vector angle (down-right at ~34 deg, matching reference screenshot)
  const clearanceRadiusPx = wallMarginM * planRect.pxPerMeter;
  const vectorAngleRad = (34 * Math.PI) / 180;
  const vectorEndX = activePt.sx + Math.cos(vectorAngleRad) * clearanceRadiusPx;
  const vectorEndY = activePt.sy + Math.sin(vectorAngleRad) * clearanceRadiusPx;

  const visibleReplicaObjects = useMemo(() => {
    if (config.environment !== 'replica' || !roomReplica) return [];
    return roomReplica.objects.filter((obj) => showInferredObjects || !obj.inferred);
  }, [config.environment, roomReplica, showInferredObjects]);

  return (
    <div
      ref={containerRef}
      data-testid="floor-plan-view"
      className={`relative w-full h-full overflow-hidden select-none transition-colors duration-200 ${canvasBgClass}`}
    >
      {/* Interactive Architectural SVG Floor Plan */}
      <svg
        ref={svgRef}
        width={viewportSize.width}
        height={viewportSize.height}
        viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
        onContextMenu={handleCanvasContextMenu}
        className={`w-full h-full block touch-none ${
          draggingPoleId ? 'cursor-grabbing' : hoveredPoleId ? 'cursor-grab' : 'cursor-default'
        }`}
        role="img"
        aria-label={`Interactive 2D floor plan of ${formatFloorPlanDim(config.roomWidthM, unit)} by ${formatFloorPlanDim(config.roomDepthM, unit)} room with ${poles.length} draggable pole${poles.length > 1 ? 's' : ''}`}
      >
        <defs>
          <marker
            id="clearance-arrowhead"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill={isDark ? '#e4e4e7' : '#262626'} />
          </marker>
          <clipPath id="room-interior-clip">
            <rect
              x={planRect.x}
              y={planRect.y}
              width={planRect.width}
              height={planRect.height}
            />
          </clipPath>
        </defs>

        {/* Room Interior Fill */}
        <rect
          x={planRect.x}
          y={planRect.y}
          width={planRect.width}
          height={planRect.height}
          fill={floorFill}
        />

        {/* Room Interior Architectural Grid + Optional Replica Objects (Clipped to Room) */}
        <g clipPath="url(#room-interior-clip)">
          {/* Vertical grid lines */}
          {gridLines.verticals.map((line) => {
            const xPos = planRect.x + line.offsetM * planRect.pxPerMeter;
            return (
              <line
                key={`gv-${line.offsetM}`}
                x1={xPos}
                y1={planRect.y}
                x2={xPos}
                y2={planRect.y + planRect.height}
                stroke={line.isMajor ? majorGridStroke : minorGridStroke}
                strokeWidth={line.isMajor ? 1.1 : 0.75}
              />
            );
          })}

          {/* Horizontal grid lines */}
          {gridLines.horizontals.map((line) => {
            const yPos = planRect.y + line.offsetM * planRect.pxPerMeter;
            return (
              <line
                key={`gh-${line.offsetM}`}
                x1={planRect.x}
                y1={yPos}
                x2={planRect.x + planRect.width}
                y2={yPos}
                stroke={line.isMajor ? majorGridStroke : minorGridStroke}
                strokeWidth={line.isMajor ? 1.1 : 0.75}
              />
            );
          })}

          {/* Scanned Room Replica Furniture Footprints (when My Room is active) */}
          {visibleReplicaObjects.map((obj) => {
            const pt = worldToFloorPlan(
              obj.x,
              obj.z,
              config.roomWidthM,
              config.roomDepthM,
              planRect
            );
            const wPx = Math.max(12, obj.widthM * planRect.pxPerMeter);
            const hPx = Math.max(12, obj.depthM * planRect.pxPerMeter);
            return (
              <g
                key={obj.id}
                transform={`translate(${pt.sx}, ${pt.sy}) rotate(${obj.rotationDeg})`}
                opacity={obj.inferred ? 0.52 : 0.8}
              >
                <rect
                  x={-wPx / 2}
                  y={-hPx / 2}
                  width={wPx}
                  height={hPx}
                  rx={3}
                  fill={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(68,64,60,0.1)'}
                  stroke={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(68,64,60,0.32)'}
                  strokeWidth={1}
                  strokeDasharray={obj.inferred ? '3 3' : undefined}
                />
                {wPx > 34 && hPx > 18 && (
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={500}
                    fill={isDark ? '#a1a1aa' : '#57534e'}
                  >
                    {obj.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Safe Placement Inner Zone Boundary (visible during drag or when clearance ring enabled) */}
          {(draggingPoleId !== null || config.showClearanceRing) && safeBoxW > 2 && safeBoxH > 2 && (
            <rect
              x={safeBoxX}
              y={safeBoxY}
              width={safeBoxW}
              height={safeBoxH}
              fill="none"
              stroke={
                dragBoundaryHit.wall
                  ? '#f59e0b'
                  : isDark
                    ? 'rgba(255,255,255,0.14)'
                    : 'rgba(68,64,60,0.18)'
              }
              strokeWidth={dragBoundaryHit.wall ? 1.8 : 1}
              strokeDasharray="5 5"
            />
          )}

          {/* Active Pole Crosshair Alignment Guides (wall-to-wall dashed lines like reference) */}
          <line
            x1={activePt.sx}
            y1={planRect.y}
            x2={activePt.sx}
            y2={planRect.y + planRect.height}
            stroke={accentHex}
            strokeOpacity={0.35}
            strokeWidth={1.3}
            strokeDasharray="5 5"
          />
          <line
            x1={planRect.x}
            y1={activePt.sy}
            x2={planRect.x + planRect.width}
            y2={activePt.sy}
            stroke={accentHex}
            strokeOpacity={0.35}
            strokeWidth={1.3}
            strokeDasharray="5 5"
          />

          {/* Clearance Zones for all poles */}
          {poles.map((pole) => {
            const pt = worldToFloorPlan(
              pole.x,
              pole.z,
              config.roomWidthM,
              config.roomDepthM,
              planRect
            );
            const isActive = pole.id === activePole.id;
            const showRing = config.showClearanceRing || isActive || draggingPoleId === pole.id;
            if (!showRing) return null;
            return (
              <circle
                key={`ring-${pole.id}`}
                cx={pt.sx}
                cy={pt.sy}
                r={clearanceRadiusPx}
                fill={isActive ? accentSoftFill : 'transparent'}
                stroke={
                  dragBoundaryHit.pole && isActive
                    ? '#f59e0b'
                    : isActive
                      ? accentHex
                      : isDark
                        ? 'rgba(255,255,255,0.22)'
                        : 'rgba(68,64,60,0.25)'
                }
                strokeOpacity={isActive ? 0.55 : 0.7}
                strokeWidth={isActive ? 1.5 : 1.1}
                strokeDasharray="6 5"
              />
            );
          })}

          {/* Signature Radial Dashed Clearance Vector Arrow on Active Pole (matching reference) */}
          {clearanceRadiusPx > 28 && (
            <g pointerEvents="none">
              <line
                x1={activePt.sx + Math.cos(vectorAngleRad) * 14}
                y1={activePt.sy + Math.sin(vectorAngleRad) * 14}
                x2={vectorEndX}
                y2={vectorEndY}
                stroke={accentHex}
                strokeOpacity={0.62}
                strokeWidth={3.2}
                strokeDasharray="4 4"
                markerEnd="url(#clearance-arrowhead)"
              />
              {/* Clearance Radius Label mid-way along the radial vector */}
              <g
                transform={`translate(${activePt.sx + Math.cos(vectorAngleRad) * (clearanceRadiusPx * 0.54) + 18}, ${
                  activePt.sy + Math.sin(vectorAngleRad) * (clearanceRadiusPx * 0.54) - 8
                })`}
              >
                <rect
                  x={-26}
                  y={-9}
                  width={52}
                  height={17}
                  rx={4}
                  fill={isDark ? 'rgba(14,16,24,0.88)' : 'rgba(250,249,246,0.92)'}
                  stroke={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(68,64,60,0.16)'}
                  strokeWidth={0.8}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fontFamily="var(--font-mono)"
                  fill={dimTextColor}
                >
                  r {formatFloorPlanDim(wallMarginM, unit)}
                </text>
              </g>
            </g>
          )}

          {/* Live Wall Clearance Distance Tags on Active Pole Crosshairs */}
          {planRect.width > 200 && planRect.height > 200 && (
            <g pointerEvents="none" fontFamily="var(--font-mono)" fontSize={9.5} fontWeight={600}>
              {/* Left distance */}
              {activePt.sx - planRect.x > 64 && (
                <text
                  x={(planRect.x + activePt.sx) / 2}
                  y={activePt.sy - 6}
                  textAnchor="middle"
                  fill={isDark ? '#a1a1aa' : '#57534e'}
                >
                  {formatFloorPlanDim(activeDistances.leftM, unit)}
                </text>
              )}
              {/* Right distance */}
              {planRect.x + planRect.width - activePt.sx > 64 && (
                <text
                  x={(activePt.sx + planRect.x + planRect.width) / 2}
                  y={activePt.sy - 6}
                  textAnchor="middle"
                  fill={isDark ? '#a1a1aa' : '#57534e'}
                >
                  {formatFloorPlanDim(activeDistances.rightM, unit)}
                </text>
              )}
              {/* Top distance */}
              {activePt.sy - planRect.y > 46 && (
                <text
                  x={activePt.sx + 7}
                  y={(planRect.y + activePt.sy) / 2 + 3}
                  textAnchor="start"
                  fill={isDark ? '#a1a1aa' : '#57534e'}
                >
                  {formatFloorPlanDim(activeDistances.topM, unit)}
                </text>
              )}
              {/* Bottom distance */}
              {planRect.y + planRect.height - activePt.sy > 46 && (
                <text
                  x={activePt.sx + 7}
                  y={(activePt.sy + planRect.y + planRect.height) / 2 + 3}
                  textAnchor="start"
                  fill={isDark ? '#a1a1aa' : '#57534e'}
                >
                  {formatFloorPlanDim(activeDistances.bottomM, unit)}
                </text>
              )}
            </g>
          )}
        </g>

        {/* Architectural Outer Room Walls (Thick crisp walls like reference) */}
        <rect
          x={planRect.x}
          y={planRect.y}
          width={planRect.width}
          height={planRect.height}
          fill="none"
          stroke={wallStroke}
          strokeWidth={4.5}
        />

        {/* Studio Architectural Wall Markers: Back Mirror Wall (Top) & Accent Slat Wall (Left) */}
        {config.environment === 'studio' && (
          <>
            <line
              x1={planRect.x + planRect.width * 0.14}
              y1={planRect.y + 4.5}
              x2={planRect.x + planRect.width * 0.86}
              y2={planRect.y + 4.5}
              stroke={isDark ? '#38bdf8' : '#0284c7'}
              strokeOpacity={0.75}
              strokeWidth={2.5}
            />
            <text
              x={planRect.x + planRect.width / 2}
              y={planRect.y + 16}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={isDark ? '#7dd3fc' : '#0369a1'}
              opacity={0.85}
            >
              Mirror Wall
            </text>

            <line
              x1={planRect.x + 4.5}
              y1={planRect.y + planRect.height * 0.18}
              x2={planRect.x + 4.5}
              y2={planRect.y + planRect.height * 0.82}
              stroke={isDark ? '#d97706' : '#92400e'}
              strokeOpacity={0.75}
              strokeWidth={2.5}
            />
          </>
        )}

        {/* Top External Architectural Dimension Line (Room Width) */}
        <g pointerEvents="none">
          <line
            x1={planRect.x}
            y1={planRect.y - 24}
            x2={planRect.x + planRect.width}
            y2={planRect.y - 24}
            stroke={dimLineColor}
            strokeWidth={1.1}
          />
          <line
            x1={planRect.x}
            y1={planRect.y - 29}
            x2={planRect.x}
            y2={planRect.y - 19}
            stroke={dimLineColor}
            strokeWidth={1.1}
          />
          <line
            x1={planRect.x + planRect.width}
            y1={planRect.y - 29}
            x2={planRect.x + planRect.width}
            y2={planRect.y - 19}
            stroke={dimLineColor}
            strokeWidth={1.1}
          />
          <rect
            x={planRect.x + planRect.width / 2 - 36}
            y={planRect.y - 34}
            width={72}
            height={20}
            rx={4}
            fill={labelBgFill}
          />
          <text
            x={planRect.x + planRect.width / 2}
            y={planRect.y - 20}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fontFamily="var(--font-mono)"
            fill={dimTextColor}
          >
            {formatFloorPlanDim(config.roomWidthM, unit)}
          </text>
        </g>

        {/* Left External Architectural Dimension Line (Room Depth) */}
        <g pointerEvents="none">
          <line
            x1={planRect.x - 26}
            y1={planRect.y}
            x2={planRect.x - 26}
            y2={planRect.y + planRect.height}
            stroke={dimLineColor}
            strokeWidth={1.1}
          />
          <line
            x1={planRect.x - 31}
            y1={planRect.y}
            x2={planRect.x - 21}
            y2={planRect.y}
            stroke={dimLineColor}
            strokeWidth={1.1}
          />
          <line
            x1={planRect.x - 31}
            y1={planRect.y + planRect.height}
            x2={planRect.x - 21}
            y2={planRect.y + planRect.height}
            stroke={dimLineColor}
            strokeWidth={1.1}
          />
          <g
            transform={`translate(${planRect.x - 26}, ${planRect.y + planRect.height / 2}) rotate(-90)`}
          >
            <rect x={-36} y={-10} width={72} height={20} rx={4} fill={labelBgFill} />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fontFamily="var(--font-mono)"
              fill={dimTextColor}
            >
              {formatFloorPlanDim(config.roomDepthM, unit)}
            </text>
          </g>
        </g>

        {/* Draggable Pole Markers (dynamically scaled to room space) */}
        {poles.map((pole, idx) => {
          const pt = worldToFloorPlan(
            pole.x,
            pole.z,
            config.roomWidthM,
            config.roomDepthM,
            planRect
          );
          const isActive = pole.id === activePole.id;
          const isDragging = draggingPoleId === pole.id;
          const isHovered = hoveredPoleId === pole.id;
          const finishSpec = POLE_FINISHES[pole.finish];
          const tag = `P${idx + 1}`;

          return (
            <g
              key={pole.id}
              transform={`translate(${pt.sx}, ${pt.sy})`}
              className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
              tabIndex={0}
              role="button"
              data-testid={`floor-plan-pole-${idx + 1}`}
              aria-label={`${pole.label} (${finishSpec.shortName}) at X ${pole.x.toFixed(2)}m, Z ${pole.z.toFixed(2)}m. Drag, arrow keys, or right-click to edit.`}
              onPointerEnter={() => setHoveredPoleId(pole.id)}
              onPointerLeave={() =>
                setHoveredPoleId((cur) => (cur === pole.id ? null : cur))
              }
              onPointerDown={(e) => handlePolePointerDown(e, pole.id)}
              onPointerMove={(e) => handlePolePointerMove(e, pole.id)}
              onPointerUp={(e) => handlePolePointerUp(e, pole.id)}
              onPointerCancel={(e) => handlePolePointerUp(e, pole.id)}
              onContextMenu={(e) => handlePoleContextMenu(e, pole.id)}
              onKeyDown={(e) => handlePoleKeyDown(e, pole)}
              style={{ outline: 'none' }}
            >
              {/* Generous invisible hit circle for effortless touch & mouse grabbing */}
              <circle r={26} fill="transparent" />

              {/* Outer active / hover halo */}
              {(isActive || isHovered) && (
                <circle
                  r={isDragging ? 20 : isHovered ? 18 : 16}
                  fill={accentHex}
                  fillOpacity={isDragging ? 0.28 : isHovered ? 0.22 : 0.16}
                />
              )}

              {/* Crisp white framing ring + inner finish swatch dot */}
              <circle
                r={isActive || isHovered ? 10.5 : 8.5}
                fill="#ffffff"
                stroke={isActive || isHovered ? accentHex : '#57534e'}
                strokeWidth={isActive ? 2.5 : isHovered ? 2 : 1.5}
              />
              <circle
                r={isActive ? 6.2 : 5}
                fill={isActive ? accentHex : finishSpec.swatchHex}
              />
              <circle r={2.2} fill={finishSpec.swatchHex} />

              {/* Pole Tag Label (P1, P2...) */}
              <text
                x={0}
                y={-18}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fontFamily="var(--font-display)"
                fill={isActive ? accentHex : dimTextColor}
              >
                {tag}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Top-Right (Desktop) / Top-Center below Mode Bar (Mobile) Frosted Blueprint Controls */}
      <div className="absolute top-[50px] sm:top-3 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 z-20 flex flex-col items-center sm:items-end gap-2 max-w-[calc(100vw-16px)]">
        <div
          className={`hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl border text-[11px] ${surfaceToolbarClass}`}
        >
          <span className="font-mono font-semibold tabular-nums">
            {formatFloorArea(config.roomWidthM, config.roomDepthM, unit)}
          </span>
          <span className={isDark ? 'text-zinc-600' : 'text-stone-300'} aria-hidden="true">
            |
          </span>
          <span className={isDark ? 'text-zinc-300' : 'text-stone-600'}>
            {draggingPoleId
              ? dragBoundaryHit.pole
                ? 'Min pole spacing reached'
                : dragBoundaryHit.wall
                  ? `Min ${formatFloorPlanDim(wallMarginM, unit)} wall margin`
                  : `Moving ${activePole.label} · ${activePole.x.toFixed(2)}m, ${activePole.z.toFixed(2)}m`
              : 'Drag pole to move · Right-click to edit'}
          </span>
        </div>

        <div className="flex flex-nowrap items-center justify-center sm:justify-end gap-1.5">
          <div
            className={`inline-flex items-center p-0.5 rounded-xl border ${surfaceToolbarClass}`}
            role="group"
            aria-label="Floor plan zoom controls"
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))))}
              aria-label="Zoom in floor plan"
              title="Zoom in"
              className={`min-h-[30px] min-w-[30px] rounded-lg flex items-center justify-center transition-colors ${toolBtnHover}`}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Reset floor plan zoom"
              title="Fit room to viewport"
              className={`min-h-[30px] px-2 rounded-lg font-mono text-[11px] font-semibold tabular-nums transition-colors ${toolBtnHover}`}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))}
              aria-label="Zoom out floor plan"
              title="Zoom out"
              className={`min-h-[30px] min-w-[30px] rounded-lg flex items-center justify-center transition-colors ${toolBtnHover}`}
            >
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div
            className={`inline-flex items-center p-0.5 rounded-xl border ${surfaceToolbarClass}`}
            role="group"
            aria-label="Floor plan actions"
          >
            <button
              type="button"
              onClick={() => setUnit((u) => (u === 'm' ? 'ft' : 'm'))}
              data-testid="floor-plan-unit-toggle"
              title="Switch metric / imperial units"
              className={`min-h-[30px] px-2 sm:px-2.5 rounded-lg font-mono text-[11px] font-semibold transition-colors whitespace-nowrap ${toolBtnHover}`}
            >
              <span className="sm:hidden">{unit === 'm' ? 'm' : 'ft'}</span>
              <span className="hidden sm:inline">{unit === 'm' ? 'Metric (m)' : 'Imperial (ft)'}</span>
            </button>
            <button
              type="button"
              onClick={onCenterActivePole}
              title="Center active pole in room"
              className={`min-h-[30px] px-2 sm:px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${toolBtnHover}`}
            >
              <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Center</span>
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Fit room view"
              title="Fit room"
              className={`hidden sm:flex min-h-[30px] min-w-[30px] rounded-lg items-center justify-center transition-colors ${toolBtnHover}`}
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onAddPole}
              disabled={!canAddPole}
              data-testid="floor-plan-add-pole"
              title={
                canAddPole
                  ? 'Add another pole within safe clearance'
                  : `Room full — no open ${formatFloorPlanDim(wallMarginM, unit)} clearance slot left`
              }
              className={`min-h-[30px] px-2 sm:px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                canAddPole ? toolBtnHover : 'opacity-40'
              }`}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{canAddPole ? 'Pole' : 'Full'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
