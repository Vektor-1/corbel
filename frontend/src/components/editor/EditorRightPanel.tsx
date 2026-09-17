'use client';

import { Canonical } from '@/types/schema';
import { ValidationPanel } from './ValidationPanel';
import { LayerTogglePanel } from '../studio/LayerTogglePanel';
import { AnnotationPanel } from '../studio/AnnotationPanel';
import { TraceToLearnView } from '../studio/TraceToLearnView';
import { ThreeDPropsPanel } from './ThreeDPropsPanel';

interface EditorRightPanelProps {
  floor: Canonical.Floor | null;
  library: Canonical.Library;
  ghostFloor: Canonical.Floor | null;
  selectedElementId: string | null;
  onSelectElement: (elementId: string, kind: 'wall' | 'room' | 'opening') => void;
}

export function EditorRightPanel({
  floor,
  library,
  ghostFloor,
  selectedElementId,
  onSelectElement,
}: EditorRightPanelProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 16,
        overflowY: 'auto',
      }}
    >
      {/* Layer Controls */}
      <div>
        <LayerTogglePanel />
      </div>

      {/* Annotations */}
      <div>
        <AnnotationPanel annotations={[]} />
      </div>

      {/* Trace-to-Learn (if baseline exists) */}
      {ghostFloor && floor && (
        <div>
          <TraceToLearnView
            baseline={ghostFloor}
            redesign={floor}
          />
        </div>
      )}

      {/* 3D Element Properties & Materials */}
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#94a3b8', textTransform: 'uppercase' }}>
          3D Properties
        </h3>
        <ThreeDPropsPanel />
      </div>

      {/* Validation */}
      <div>
        <ValidationPanel
          floor={floor}
          library={library}
          selectedElementId={selectedElementId ?? undefined}
          onSelectElement={(elementId, elementType) => {
            const kind = elementType as 'wall' | 'room' | 'opening';
            onSelectElement(elementId, kind);
          }}
        />
      </div>

      {/* Statistics */}
      <div style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#94a3b8' }}>
          Statistics
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            fontSize: 12,
          }}
        >
          <div
            style={{
              background: '#1e293b',
              padding: 12,
              borderRadius: 4,
            }}
          >
            <div style={{ color: '#94a3b8' }}>Walls</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa' }}>
              {floor?.walls.length || 0}
            </div>
          </div>
          <div
            style={{
              background: '#1e293b',
              padding: 12,
              borderRadius: 4,
            }}
          >
            <div style={{ color: '#94a3b8' }}>Rooms</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa' }}>
              {floor?.rooms.length || 0}
            </div>
          </div>
          <div
            style={{
              background: '#1e293b',
              padding: 12,
              borderRadius: 4,
            }}
          >
            <div style={{ color: '#94a3b8' }}>Doors</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa' }}>
              {floor?.openings.filter((o) => o.kind === 'door').length || 0}
            </div>
          </div>
          <div
            style={{
              background: '#1e293b',
              padding: 12,
              borderRadius: 4,
            }}
          >
            <div style={{ color: '#94a3b8' }}>Windows</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa' }}>
              {floor?.openings.filter((o) => o.kind === 'window').length || 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
