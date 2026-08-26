import type { FloorPlan, Door, Window, Wall, Room } from "@/types/design";

export interface DesignFloorJsonExport {
  exportVersion: 1;
  exportedAt: string;
  generator: "corbel";
  meta: {
    planId: string;
    planName: string;
  };
  canvas: {
    widthMm: number;
    heightMm: number;
  };
  walls: Array<{
    id: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    thickness: number;
    loadBearing: boolean;
  }>;
  rooms: Array<{
    id: string;
    name: string;
    type?: string;
    area: number;
  }>;
  doors: Array<{
    id: string;
    x: number;
    y: number;
    swing: string;
    width: number;
    height: number;
  }>;
  windows: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    sillHeight: number;
  }>;
}

export function createDesignFloorJsonExport(
  floorPlan: FloorPlan,
  exportedAt = new Date().toISOString(),
): DesignFloorJsonExport {
  return {
    exportVersion: 1,
    exportedAt,
    generator: "corbel",
    meta: {
      planId: floorPlan.id,
      planName: floorPlan.name,
    },
    canvas: {
      widthMm: floorPlan.width,
      heightMm: floorPlan.height,
    },
    walls: floorPlan.walls.map((wall) => ({
      id: wall.id,
      startX: wall.startX,
      startY: wall.startY,
      endX: wall.endX,
      endY: wall.endY,
      thickness: wall.thickness,
      loadBearing: wall.loadBearing,
    })),
    rooms: floorPlan.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      type: room.type,
      area: room.area,
    })),
    doors: floorPlan.doors.map((door) => ({
      id: door.id,
      x: door.x,
      y: door.y,
      swing: door.swing,
      width: door.width,
      height: door.height,
    })),
    windows: floorPlan.windows.map((window) => ({
      id: window.id,
      x: window.x,
      y: window.y,
      width: window.width,
      height: window.height,
      sillHeight: window.sillHeight,
    })),
  };
}

export function exportFileName(planId: string): string {
  const safeId = planId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safeId || "corbel-floor"}.corbel.json`;
}

export function downloadDesignFloorJson(exported: DesignFloorJsonExport, filename: string): void {
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
