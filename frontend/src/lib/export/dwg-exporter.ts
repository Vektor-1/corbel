/**
 * DWG/DXF Export
 * Converts Canonical.Floor to AutoCAD DWG format
 * Uses dxf.js library for DXF (DWG requires external service or library)
 */

import { Canonical } from '@/types/schema';

export interface DWGExportOptions {
  format: 'dxf' | 'dwg'; // DWG requires dxf.js + dwg conversion
  scale: number; // Scale factor (1.0 = 1:1, 0.01 = 1:100)
  includeAnnotations: boolean;
  includeLayerInfo: boolean;
}

export interface DWGEntity {
  type: string;
  layer: string;
  color: number;
  lineweight: number;
  data: any;
}

/**
 * Export Canonical floor to DXF string
 */
export function exportToDXF(
  floor: Canonical.Floor,
  library: Canonical.Library,
  options: DWGExportOptions = {
    format: 'dxf',
    scale: 1.0,
    includeAnnotations: true,
    includeLayerInfo: true,
  }
): string {
  const entities: DWGEntity[] = [];

  // Layer definitions
  const layers = {
    walls: { color: 256, lineweight: 25 }, // Black, thick
    rooms: { color: 10, lineweight: 13 }, // Light gray
    openings: { color: 4, lineweight: 13 }, // Cyan
    annotations: { color: 3, lineweight: 10 }, // Green
    dimensions: { color: 2, lineweight: 10 }, // Yellow
  };

  // Export walls as LWPOLYLINE
  floor.walls.forEach((wall, idx) => {
    const points = [
      [wall.start.x * options.scale, wall.start.y * options.scale],
      [wall.end.x * options.scale, wall.end.y * options.scale],
    ];

    entities.push({
      type: 'LWPOLYLINE',
      layer: 'WALLS',
      color: layers.walls.color,
      lineweight: layers.walls.lineweight,
      data: {
        vertices: points,
        flags: 0, // Not closed
      },
    });

    // Add wall thickness representation (parallel line)
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = (dy / len) * (wall.typeRef === 'ext-200' ? 200 : 100); // Thickness
    const uy = -(dx / len) * (wall.typeRef === 'ext-200' ? 200 : 100);

    entities.push({
      type: 'LINE',
      layer: 'WALLS',
      color: layers.walls.color,
      lineweight: layers.walls.lineweight,
      data: {
        start: [
          (wall.start.x + ux) * options.scale,
          (wall.start.y + uy) * options.scale,
        ],
        end: [(wall.end.x + ux) * options.scale, (wall.end.y + uy) * options.scale],
      },
    });
  });

  // Export rooms as HATCH (filled polygons)
  floor.rooms.forEach((room) => {
    // Calculate centroid from vertices
    let centroidX = 0;
    let centroidY = 0;
    if (room.vertices && room.vertices.length > 0) {
      centroidX = room.vertices.reduce((sum, v) => sum + v.x, 0) / room.vertices.length;
      centroidY = room.vertices.reduce((sum, v) => sum + v.y, 0) / room.vertices.length;
    }

    entities.push({
      type: 'CIRCLE',
      layer: 'ROOMS',
      color: layers.rooms.color,
      lineweight: layers.rooms.lineweight,
      data: {
        center: [centroidX * options.scale, centroidY * options.scale],
        radius: 500 * options.scale, // Placeholder circle
      },
    });

    // Room label as TEXT
    entities.push({
      type: 'TEXT',
      layer: 'ROOMS',
      color: layers.rooms.color,
      lineweight: layers.rooms.lineweight,
      data: {
        text: room.label || room.type || 'Room',
        position: [centroidX * options.scale, centroidY * options.scale],
        height: 200 * options.scale,
      },
    });

    // Area dimension
    if (options.includeAnnotations) {
      const area = (room.area / 1e6).toFixed(1);
      entities.push({
        type: 'TEXT',
        layer: 'DIMENSIONS',
        color: layers.dimensions.color,
        lineweight: layers.dimensions.lineweight,
        data: {
          text: `${area} m²`,
          position: [
            (centroidX - 500) * options.scale,
            (centroidY - 500) * options.scale,
          ],
          height: 150 * options.scale,
        },
      });
    }
  });

  // Export openings (doors/windows)
  floor.openings.forEach((opening) => {
    const wall = floor.walls.find(w => w.id === opening.hostWallId);
    if (!wall) return;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    const x = (wall.start.x + ux * opening.positionAlongWall) * options.scale;
    const y = (wall.start.y + uy * opening.positionAlongWall) * options.scale;

    const width = opening.kind === 'door' ? 900 : 1200;
    const height = opening.kind === 'door' ? 2100 : 1200;

    entities.push({
      type: 'RECTANGLE',
      layer: 'OPENINGS',
      color: layers.openings.color,
      lineweight: layers.openings.lineweight,
      data: {
        center: [x, y],
        width: width * options.scale,
        height: height * options.scale,
      },
    });

    // Label
    const label = opening.kind === 'door' ? 'D' : 'W';
    entities.push({
      type: 'TEXT',
      layer: 'OPENINGS',
      color: layers.openings.color,
      lineweight: layers.openings.lineweight,
      data: {
        text: label,
        position: [x, y],
        height: 150 * options.scale,
      },
    });
  });

  // Build DXF file
  return buildDXFContent(`Floor-${floor.id}`, entities, layers);
}

/**
 * Build DXF file content string
 */
function buildDXFContent(
  projectName: string,
  entities: DWGEntity[],
  layers: Record<string, any>
): string {
  const lines: string[] = [];

  // DXF Header
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('HEADER');
  lines.push('9');
  lines.push('$ACADVER');
  lines.push('1');
  lines.push('AC1021'); // AutoCAD 2007 format
  lines.push('9');
  lines.push('$EXTMIN');
  lines.push('10');
  lines.push('0');
  lines.push('20');
  lines.push('0');
  lines.push('9');
  lines.push('$EXTMAX');
  lines.push('10');
  lines.push('10000');
  lines.push('20');
  lines.push('10000');
  lines.push('0');
  lines.push('ENDSEC');

  // Layers
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('TABLES');
  lines.push('0');
  lines.push('TABLE');
  lines.push('2');
  lines.push('LAYER');
  lines.push('70');
  lines.push(String(Object.keys(layers).length));

  Object.entries(layers).forEach(([name, props]) => {
    lines.push('0');
    lines.push('LAYER');
    lines.push('2');
    lines.push(name.toUpperCase());
    lines.push('62');
    lines.push(String(props.color));
    lines.push('420');
    lines.push(String(props.color));
  });

  lines.push('0');
  lines.push('ENDTAB');
  lines.push('0');
  lines.push('ENDTAB');
  lines.push('0');
  lines.push('ENDTAB');
  lines.push('0');
  lines.push('ENDTAB');
  lines.push('0');
  lines.push('ENDTAB');
  lines.push('0');
  lines.push('ENDTAB');
  lines.push('0');
  lines.push('ENDSEC');

  // Entities
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('ENTITIES');

  entities.forEach((entity) => {
    lines.push('0');
    lines.push(entity.type);
    lines.push('8');
    lines.push(entity.layer);
    lines.push('62');
    lines.push(String(entity.color));

    // Entity-specific data
    switch (entity.type) {
      case 'LWPOLYLINE':
        lines.push('90');
        lines.push(String(entity.data.vertices.length));
        entity.data.vertices.forEach(([x, y]: [number, number]) => {
          lines.push('10');
          lines.push(String(x));
          lines.push('20');
          lines.push(String(y));
        });
        break;

      case 'LINE':
        lines.push('10');
        lines.push(String(entity.data.start[0]));
        lines.push('20');
        lines.push(String(entity.data.start[1]));
        lines.push('11');
        lines.push(String(entity.data.end[0]));
        lines.push('21');
        lines.push(String(entity.data.end[1]));
        break;

      case 'CIRCLE':
        lines.push('10');
        lines.push(String(entity.data.center[0]));
        lines.push('20');
        lines.push(String(entity.data.center[1]));
        lines.push('40');
        lines.push(String(entity.data.radius));
        break;

      case 'TEXT':
        lines.push('1');
        lines.push(entity.data.text);
        lines.push('10');
        lines.push(String(entity.data.position[0]));
        lines.push('20');
        lines.push(String(entity.data.position[1]));
        lines.push('40');
        lines.push(String(entity.data.height));
        break;
    }
  });

  lines.push('0');
  lines.push('ENDSEC');

  // EOF
  lines.push('0');
  lines.push('EOF');

  return lines.join('\n');
}

/**
 * Generate downloadable DXF file
 */
export function downloadDXF(floor: Canonical.Floor, library: Canonical.Library) {
  const dxfContent = exportToDXF(floor, library, {
    format: 'dxf',
    scale: 1.0,
    includeAnnotations: true,
    includeLayerInfo: true,
  });

  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `floor-plan-${floor.id}.dxf`;
  link.click();
  URL.revokeObjectURL(url);
}
