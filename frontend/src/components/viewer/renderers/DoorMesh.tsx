import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { materials } from '@/lib/viewer/theme';
import type { Shading, ViewerTheme } from '@/lib/viewer/theme';
import type { ColorPreset } from '@/store/designStore';
import { tintForConfidence } from '@/lib/geometry/confidence-tint';
import { ElementMaterial } from './ElementMaterial';
import { ElementEdges } from './ElementEdges';
import type { Wall, Door } from '@/types/design';

const FRAME_THICKNESS = 0.05;
/** How far the leaf swings open, in radians (just short of 90 deg). */
const OPEN_SWEEP = Math.PI / 2 - 0.08;
/** Radians per second the leaf swings toward its target angle. */
const SWING_SPEED = Math.PI * 2.5;

export function DoorMesh({
  door,
  wall,
  pixelsPerMetre,
  selected = false,
  theme,
  colorPreset = 'standard',
  shading = 'rendered',
  showEdges = false,
  edgeColor = '#232323',
  onSelect,
  onHoverStart,
  onHoverEnd,
}: {
  door: Door;
  wall: Wall;
  pixelsPerMetre: number;
  selected?: boolean;
  theme: ViewerTheme;
  colorPreset?: ColorPreset;
  shading?: Shading;
  showEdges?: boolean;
  edgeColor?: string;
  onSelect?: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pivotRef = useRef<Group>(null);
  const currentSwing = useRef(0);

  const doorWidth = Math.max(0.6, door.width / 1000);
  const doorHeight = Math.min(wall.height / 1000, 2.1);
  const wallDepth = Math.max(0.05, wall.thickness / 1000);

  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  const t = door.position.x / wallLength;

  const doorX = (wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t) / pixelsPerMetre;
  const doorZ = (wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t) / pixelsPerMetre;
  const angle = Math.atan2(dy, dx);

  // Same hinge/swing convention as the 2D plan (Canvas2D.tsx): `swing`
  // picks which end of the opening the leaf pivots from, `openDirection`
  // picks which side of the wall it swings into. Mirrored here so the 3D
  // leaf opens toward the same side the 2D arc already shows.
  const halfWidth = doorWidth / 2;
  const direction = { x: Math.cos(angle), z: Math.sin(angle) };
  const hingeX = door.swing === 'left' ? doorX - direction.x * halfWidth : doorX + direction.x * halfWidth;
  const hingeZ = door.swing === 'left' ? doorZ - direction.z * halfWidth : doorZ + direction.z * halfWidth;
  const closedAngle = door.swing === 'left' ? angle : angle + Math.PI;
  const openDirection = door.openDirection ?? 'in';
  const sweepSign = openDirection === 'out' ? -1 : 1;
  const targetSwing = open ? sweepSign * OPEN_SWEEP : 0;

  useFrame((_, delta) => {
    const diff = targetSwing - currentSwing.current;
    if (Math.abs(diff) < 0.001) {
      currentSwing.current = targetSwing;
    } else {
      currentSwing.current += Math.sign(diff) * Math.min(Math.abs(diff), SWING_SPEED * delta);
    }
    if (pivotRef.current) pivotRef.current.rotation.y = -(closedAngle + currentSwing.current);
  });

  const baseColor = door.type === 'entry' ? materials[theme].doorEntry : materials[theme].doorInternal;
  const doorColor = selected
    ? '#2563eb'
    : colorPreset === 'validation'
      ? tintForConfidence(baseColor, door.confidence)
      : baseColor;
  const frameColor = selected ? '#2563eb' : materials[theme].windowFrame;

  const toggle = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setOpen((current) => !current);
    onSelect?.();
  };
  const hoverHandlers = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHoverStart?.();
    },
    onPointerOut: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHoverEnd?.();
    },
  };

  return (
    <>
      {/* Head (the frame's top bar) — fixed to the opening, does not swing.
          Positioned and oriented independently of the pivot below: both are
          expressed directly in world space so their rotations never compose. */}
      <mesh position={[doorX, doorHeight + FRAME_THICKNESS / 2, doorZ]} rotation={[0, -angle, 0]} castShadow receiveShadow>
        <boxGeometry args={[doorWidth + FRAME_THICKNESS * 2, FRAME_THICKNESS, wallDepth]} />
        <ElementMaterial color={frameColor} shading={shading} roughness={0.7} metalness={0.05} />
        <ElementEdges show={showEdges} color={edgeColor} />
      </mesh>
      {/* Leaf, pivoted at the hinge. `pivotRef`'s rotation is driven entirely
          by useFrame as an absolute world-space angle (-(closedAngle +
          currentSwing)), so this group must stay a direct, unrotated-parent
          child — nesting it inside the head's rotated group above would
          compose the two rotations instead of just applying this one. */}
      <group ref={pivotRef} position={[hingeX, 0, hingeZ]} {...hoverHandlers} onClick={toggle}>
        <mesh position={[halfWidth, doorHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[doorWidth, doorHeight, 0.05]} />
          <ElementMaterial color={doorColor} shading={shading} roughness={0.55} metalness={0.05} />
          <ElementEdges show={showEdges} color={edgeColor} />
        </mesh>
      </group>
    </>
  );
}
