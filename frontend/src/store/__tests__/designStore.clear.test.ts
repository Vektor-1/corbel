import { describe, expect, it } from 'vitest';
import { useDesignStore } from '../designStore';

describe('clearDesign', () => {
  it('removes every editable element and the Trace baseline', () => {
    const store = useDesignStore.getState();
    store.setFloorPlan({
      id: 'clear-test', name: 'Clear test', width: 1000, height: 1000, scale: 100,
      walls: [{ id: 'w1', startPoint: { x: 0, y: 0 }, endPoint: { x: 100, y: 0 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 }],
      rooms: [], doors: [], windows: [], objects: [], createdAt: new Date(), updatedAt: new Date(),
    });
    store.beginRedesign(useDesignStore.getState().floorPlan!);

    useDesignStore.getState().clearDesign();
    const cleared = useDesignStore.getState();
    expect(cleared.floorPlan?.walls).toEqual([]);
    expect(cleared.floorPlan?.doors).toEqual([]);
    expect(cleared.ghostFloorPlan).toBeNull();
  });

  it('starts an image-first trace study and removes its reference when cleared', () => {
    const store = useDesignStore.getState();
    store.beginImageTrace('/api/plan-import/local-upload/reference.png', 'reference.png');

    expect(useDesignStore.getState().traceImage).toMatchObject({ scale: 0.7, opacity: 0.58, blur: 2 });
    expect(useDesignStore.getState().floorPlan?.walls).toEqual([]);

    useDesignStore.getState().clearDesign();
    expect(useDesignStore.getState().traceImage).toBeNull();
  });

  it('calibrates an image trace from a selected known-length wall without moving the drawing', () => {
    const store = useDesignStore.getState();
    store.beginImageTrace('/api/plan-import/local-upload/reference.png', 'reference.png');
    store.addWall({ id: 'calibration-wall', startPoint: { x: 10, y: 10 }, endPoint: { x: 310, y: 10 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 });

    expect(useDesignStore.getState().calibrateTraceFromWall('calibration-wall', 3000)).toBe(true);
    expect(useDesignStore.getState().floorPlan?.scale).toBe(100);
    expect(useDesignStore.getState().traceImage?.calibration).toMatchObject({ wallId: 'calibration-wall', knownLengthMm: 3000, pixelsPerMeter: 100 });
    expect(useDesignStore.getState().floorPlan?.walls[0].endPoint).toEqual({ x: 310, y: 10 });
  });
});
