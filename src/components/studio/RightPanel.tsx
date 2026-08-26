/**
 * Right panel for floor plan editor.
 * Displays properties of selected room/wall and edits room name/type.
 */

"use client";

import React, { useEffect, useState } from "react";
import { useFloorPlanStore } from "@/lib/store/floorPlanStore";
import { ComparisonPanel } from "../editor/ComparisonPanel";
import { LayerTogglePanel } from "./LayerTogglePanel";
import { canonicalToLegacyFloorPlan } from "@/lib/utils/ghostClone";

const ROOM_TYPES = [
  "Bedroom",
  "Kitchen",
  "Bathroom",
  "Living Room",
  "Dining Room",
  "Hallway",
  "Store",
  "Other",
] as const;

export interface RightPanelProps {
  selectedElementId: string | null;
  selectedElementKind: "room" | "wall" | "opening" | null;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  selectedElementId,
  selectedElementKind,
}) => {
  const getRoom = useFloorPlanStore((s) => s.getRoom);
  const getWall = useFloorPlanStore((s) => s.getWall);
  const getWallOpenings = useFloorPlanStore((s) => s.getWallOpenings);
  const library = useFloorPlanStore((s) => s.library);
  const setRoomLabel = useFloorPlanStore((s) => s.setRoomLabel);
  const setRoomTypeStore = useFloorPlanStore((s) => s.setRoomType);

  const currentFloor = useFloorPlanStore((s) => s.currentFloor);
  const ghostFloor = useFloorPlanStore((s) => s.ghostFloor);

  const originalLegacy = ghostFloor ? canonicalToLegacyFloorPlan(ghostFloor, library) : null;
  const redesignLegacy = currentFloor ? canonicalToLegacyFloorPlan(currentFloor, library) : null;
  const room = selectedElementKind === "room" && selectedElementId ? getRoom(selectedElementId) : undefined;
  const wall = selectedElementKind === "wall" && selectedElementId ? getWall(selectedElementId) : undefined;

  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<string>("Other");

  useEffect(() => {
    if (!room) {
      setName("");
      setRoomType("Other");
      return;
    }
    setName(room.label ?? "");
    const storedType = room.type ?? "";
    const matched = ROOM_TYPES.find((t) => t.toLowerCase() === storedType.toLowerCase());
    setRoomType(matched ?? "Other");
  }, [room?.id, room?.label, room?.type]);

  return (
    <aside
      data-testid="studio-right-panel"
      style={{
        width: 260,
        flexShrink: 0,
        borderLeft: "1px solid #d7d0c2",
        background: "#fff",
        padding: 12,
        fontSize: 12,
        overflowY: "auto",
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>Properties</h2>

      <div style={{ marginBottom: 16 }}>
        <LayerTogglePanel />
      </div>

      {!selectedElementId || !selectedElementKind ? (
        ghostFloor ? (
          <ComparisonPanel original={originalLegacy} redesign={redesignLegacy} />
        ) : (
          <p style={{ color: "#6f685b", margin: 0 }}>Select a room or wall.</p>
        )
      ) : null}

      {room && selectedElementId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ color: "#6f685b", marginBottom: 4 }}>Room</div>
            <div style={{ fontFamily: "monospace", fontSize: 11 }}>{selectedElementId}</div>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Name</span>
            <input
              data-testid="room-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name !== room.label) setRoomLabel(selectedElementId, name.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              style={{ padding: "6px 8px", border: "1px solid #d7d0c2", borderRadius: 4 }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Type</span>
            <select
              data-testid="room-type-select"
              value={roomType}
              onChange={(e) => {
                const next = e.target.value;
                setRoomType(next);
                // Type only — leave room.label untouched.
                setRoomTypeStore(selectedElementId, next);
              }}
              style={{ padding: "6px 8px", border: "1px solid #d7d0c2", borderRadius: 4 }}
            >
              {ROOM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div style={{ color: "#6f685b" }}>Area</div>
            <div>{(room.area / 1e6).toFixed(2)} m²</div>
          </div>
        </div>
      ) : null}

      {wall && selectedElementId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ color: "#6f685b", marginBottom: 4 }}>Wall</div>
            <div style={{ fontFamily: "monospace", fontSize: 11 }}>{selectedElementId}</div>
          </div>
          <div>
            <div style={{ color: "#6f685b" }}>Length</div>
            <div>
              {(Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / 1000).toFixed(2)} m
            </div>
          </div>
          <div>
            <div style={{ color: "#6f685b" }}>Thickness</div>
            <div>
              {library.wallTypes.get(wall.typeRef)?.thickness ?? "—"} mm
              {library.wallTypes.get(wall.typeRef)?.loadBearing ? " (load-bearing)" : " (partition)"}
            </div>
          </div>
          <div>
            <div style={{ color: "#6f685b" }}>Openings</div>
            <div>{getWallOpenings(selectedElementId).length}</div>
          </div>
        </div>
      ) : null}

      {selectedElementKind === "opening" && selectedElementId ? (
        <div>
          <div style={{ color: "#6f685b", marginBottom: 4 }}>Opening</div>
          <div style={{ fontFamily: "monospace", fontSize: 11 }}>{selectedElementId}</div>
        </div>
      ) : null}
    </aside>
  );
};
