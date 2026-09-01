import type { Canonical } from "@/types/schema";

export const FLOOR_PLAN_SNAPSHOT_KEY = "corbel:floor-plan-snapshot:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type SerializedLibrary = {
  wallTypes: Array<[string, Canonical.WallType]>;
  doorTypes: Array<[string, Canonical.DoorType]>;
  windowTypes: Array<[string, Canonical.WindowType]>;
};

type SerializedSnapshot = {
  version: 1;
  floor: Canonical.Floor;
  library: SerializedLibrary;
};

export type FloorPlanSnapshot = {
  floor: Canonical.Floor;
  library: Canonical.Library;
};

function serializeLibrary(library: Canonical.Library): SerializedLibrary {
  return {
    wallTypes: [...library.wallTypes.entries()],
    doorTypes: [...library.doorTypes.entries()],
    windowTypes: [...library.windowTypes.entries()],
  };
}

function deserializeLibrary(library: SerializedLibrary): Canonical.Library {
  return {
    wallTypes: new Map(library.wallTypes),
    doorTypes: new Map(library.doorTypes),
    windowTypes: new Map(library.windowTypes),
  };
}

function isSerializedSnapshot(value: unknown): value is SerializedSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<SerializedSnapshot>;
  const library = snapshot.library;
  return snapshot.version === 1
    && Boolean(snapshot.floor && typeof snapshot.floor.id === "string")
    && Boolean(library)
    && Array.isArray(library?.wallTypes)
    && Array.isArray(library?.doorTypes)
    && Array.isArray(library?.windowTypes);
}

export function saveFloorPlanSnapshot(storage: StorageLike, floor: Canonical.Floor, library: Canonical.Library): void {
  const snapshot: SerializedSnapshot = {
    version: 1,
    floor,
    library: serializeLibrary(library),
  };
  storage.setItem(FLOOR_PLAN_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function loadFloorPlanSnapshot(storage: StorageLike): FloorPlanSnapshot | null {
  const raw = storage.getItem(FLOOR_PLAN_SNAPSHOT_KEY);
  if (!raw) return null;

  try {
    const snapshot: unknown = JSON.parse(raw);
    if (!isSerializedSnapshot(snapshot)) throw new Error("Invalid snapshot");
    return { floor: snapshot.floor, library: deserializeLibrary(snapshot.library) };
  } catch {
    storage.removeItem(FLOOR_PLAN_SNAPSHOT_KEY);
    return null;
  }
}
