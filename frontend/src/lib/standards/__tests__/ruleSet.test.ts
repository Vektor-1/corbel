import { describe, expect, it } from 'vitest';
import type { FloorPlan } from '@/types/design';
import {
  DEFAULT_RULE_SET,
  GHANA_THRESHOLDS,
  RULE_SETS,
  ghanaBuildingCode,
  runRuleSet,
  validateFloorPlan,
} from '..';
import { citationForRuleIn, type CodeRuleSet } from '../ruleSet';

const plan = (overrides: Partial<FloorPlan> = {}): FloorPlan => ({
  id: 'p',
  name: 'Plan',
  width: 12000,
  height: 9000,
  scale: 100,
  walls: [],
  doors: [],
  windows: [],
  objects: [],
  rooms: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const thinWall = {
  id: 'wall-1',
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 4000, y: 0 },
  thickness: 100,
  material: 'sandcrete' as const,
  type: 'loadBearing' as const,
  height: 2700,
};

describe('validateFloorPlan via rule sets', () => {
  it('returns nothing for a null plan', () => {
    expect(validateFloorPlan(null)).toEqual([]);
  });

  it('defaults to the Ghana building code', () => {
    expect(DEFAULT_RULE_SET).toBe(ghanaBuildingCode);
    expect(RULE_SETS).toContain(ghanaBuildingCode);
  });

  it('still finds the thickness and span issues the inline engine found', () => {
    const results = validateFloorPlan(plan({ walls: [thinWall] }));
    const rules = results.map((result) => result.rule);

    expect(rules).toContain('wall-thickness-insufficient');
    expect(rules).toContain('span-thickness-ratio-high');
  });

  it('flags an opening that overhangs its host wall', () => {
    const results = validateFloorPlan(
      plan({
        walls: [thinWall],
        doors: [
          {
            id: 'door-1',
            wallId: 'wall-1',
            position: { x: 3990, y: 0 },
            width: 900,
            type: 'internal',
            swing: 'left',
            openDirection: 'in',
          },
        ],
      })
    );

    expect(results).toContainEqual(
      expect.objectContaining({ rule: 'opening-host-fit', targetId: 'door-1' })
    );
  });

  it('reports an opening on a missing wall rather than silently skipping it', () => {
    const results = validateFloorPlan(
      plan({
        windows: [
          {
            id: 'win-1',
            wallId: 'does-not-exist',
            position: { x: 10, y: 0 },
            width: 900,
            height: 1200,
            sillHeight: 900,
          },
        ],
      })
    );

    expect(results).toContainEqual(
      expect.objectContaining({ rule: 'opening-host-fit', targetId: 'win-1' })
    );
  });

  it('threads storey count into thickness rules instead of assuming one storey', () => {
    // 150mm satisfies a single-storey sandcrete wall but not a three-storey one.
    const singleStorey = validateFloorPlan(
      plan({ walls: [{ ...thinWall, thickness: 150, endPoint: { x: 1000, y: 0 } }] })
    );
    const threeStorey = validateFloorPlan(
      plan({ walls: [{ ...thinWall, thickness: 150, endPoint: { x: 1000, y: 0 } }] }),
      ghanaBuildingCode,
      3
    );

    expect(singleStorey.map((r) => r.rule)).not.toContain('wall-thickness-insufficient');
    expect(threeStorey.map((r) => r.rule)).toContain('wall-thickness-insufficient');
  });
});

describe('rule sets are genuinely pluggable', () => {
  it('lets a different jurisdiction change an outcome without touching the engine', () => {
    const strictRoomCode: CodeRuleSet = {
      ...ghanaBuildingCode,
      id: 'test-strict',
      name: 'Strict test code',
      jurisdiction: 'Test',
      rules: ghanaBuildingCode.rules.map((rule) =>
        rule.id === 'room-area-small'
          ? {
              ...rule,
              evaluate: ({ floorPlan }) =>
                floorPlan.rooms
                  .filter((room) => room.area < 40)
                  .map((room) => ({
                    id: `strict-${room.id}`,
                    type: 'error' as const,
                    message: 'Room below the strict minimum.',
                    targetId: room.id,
                    rule: 'room-area-small',
                  })),
            }
          : rule
      ),
    };

    const rooms = [
      { id: 'room-1', name: 'Bedroom', type: 'bedroom' as const, vertices: [], area: 12 },
    ];

    // 12m² clears Ghana's 9m² bedroom minimum but not the strict code's 40m².
    expect(validateFloorPlan(plan({ rooms })).map((r) => r.rule)).not.toContain('room-area-small');
    expect(validateFloorPlan(plan({ rooms }), strictRoomCode).map((r) => r.rule)).toContain(
      'room-area-small'
    );
  });

  it('runs every rule in a set and concatenates their findings', () => {
    const results = runRuleSet(ghanaBuildingCode, { floorPlan: plan({ walls: [thinWall] }), stories: 1 });
    expect(results.length).toBeGreaterThan(1);
  });

  it('gives every rule a stable id and a summary', () => {
    const ids = ghanaBuildingCode.rules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of ghanaBuildingCode.rules) expect(rule.summary.length).toBeGreaterThan(0);
  });

  it('keeps thresholds as data rather than literals in the checks', () => {
    expect(GHANA_THRESHOLDS.maxSpanToThicknessRatio).toBe(30);
    expect(GHANA_THRESHOLDS.minimumRoomAreaM2.bedroom).toBe(9);
  });
});

describe('rule-set citations keep the no-fabrication promise', () => {
  it('cites wall thickness from the audited registry', () => {
    expect(citationForRuleIn(ghanaBuildingCode, 'wall-thickness-insufficient')).toBe(
      'GS 1207:2018 Part 7'
    );
  });

  it('leaves Corbel review thresholds uncited rather than inventing a code section', () => {
    for (const rule of ['span-thickness-ratio-high', 'opening-oversized', 'room-area-small']) {
      expect(citationForRuleIn(ghanaBuildingCode, rule)).toBeUndefined();
    }
  });

  it('never invents a citation for an unknown rule', () => {
    expect(citationForRuleIn(ghanaBuildingCode, 'not-a-rule')).toBeUndefined();
  });
});
