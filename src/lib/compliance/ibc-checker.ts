/**
 * IBC (International Building Code) Compliance Checker
 * Validates floor plans against building code requirements
 */

import { Canonical } from '@/types/schema';

export interface CodeViolation {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string; // IBC section (e.g., "IBC 1208.2")
  title: string;
  description: string;
  affectedElementId: string;
  suggestedFix: string;
}

export interface CodeCheckResult {
  violations: CodeViolation[];
  compliant: boolean;
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

const IBC_RULES = {
  // Bedroom minimum area
  BEDROOM_MIN_AREA: {
    code: 'IBC 1208.2',
    minArea: 70, // m²
    description: 'Bedroom must be at least 70 m² (750 ft²)',
  },

  // Kitchen minimum area
  KITCHEN_MIN_AREA: {
    code: 'IBC 1210',
    minArea: 50, // m²
    description: 'Kitchen must be at least 50 m² (550 ft²)',
  },

  // Bathroom minimum area
  BATHROOM_MIN_AREA: {
    code: 'IBC 1211',
    minArea: 7.5, // m²
    description: 'Bathroom must be at least 7.5 m² (80 ft²)',
  },

  // Hallway minimum width
  HALLWAY_MIN_WIDTH: {
    code: 'IBC 1003.2',
    minWidth: 1070, // mm (42 inches)
    description: 'Hallway/corridor must be at least 1070mm (42") wide',
  },

  // Door minimum width (accessible)
  DOOR_MIN_WIDTH: {
    code: 'IBC 1008.1.1',
    minWidth: 820, // mm (32 inches)
    description: 'Door opening must be at least 820mm (32") wide',
  },

  // ADA Accessibility
  ADA_TURNING_RADIUS: {
    code: 'ADA 304.3',
    minRadius: 1500, // mm (5 feet)
    description: 'Accessible route requires 1500mm (5 ft) turning radius',
  },

  // Egress minimum door width
  EGRESS_DOOR_WIDTH: {
    code: 'IBC 1005.1',
    minWidth: 860, // mm (34 inches)
    description: 'Exit door must be at least 860mm (34") wide',
  },

  // Room to room door height
  INTERIOR_DOOR_HEIGHT: {
    code: 'IBC 1008.1.2',
    minHeight: 1980, // mm (78 inches)
    description: 'Interior door must be at least 1980mm (78") tall',
  },

  // Ceiling height minimum
  CEILING_HEIGHT: {
    code: 'IBC 1208.2',
    minHeight: 2400, // mm (8 feet)
    description: 'Habitable room ceiling must be at least 2400mm (8 ft)',
  },
};

export class IBCChecker {
  /**
   * Check floor plan for code compliance
   */
  static checkCompliance(floor: Canonical.Floor): CodeCheckResult {
    const violations: CodeViolation[] = [];
    let idCounter = 0;

    // Check each room
    floor.rooms.forEach(room => {
      // Check minimum areas by room type
      const areaM2 = room.area / 1e6;

      if (room.type === 'bedroom' && areaM2 < IBC_RULES.BEDROOM_MIN_AREA.minArea) {
        violations.push({
          id: `v-${idCounter++}`,
          severity: 'error',
          code: IBC_RULES.BEDROOM_MIN_AREA.code,
          title: 'Bedroom too small',
          description: `${room.label || 'Bedroom'} is ${areaM2.toFixed(1)}m², minimum is ${IBC_RULES.BEDROOM_MIN_AREA.minArea}m²`,
          affectedElementId: room.id,
          suggestedFix: `Expand room to at least ${IBC_RULES.BEDROOM_MIN_AREA.minArea}m²`,
        });
      }

      if (room.type === 'kitchen' && areaM2 < IBC_RULES.KITCHEN_MIN_AREA.minArea) {
        violations.push({
          id: `v-${idCounter++}`,
          severity: 'error',
          code: IBC_RULES.KITCHEN_MIN_AREA.code,
          title: 'Kitchen too small',
          description: `Kitchen is ${areaM2.toFixed(1)}m², minimum is ${IBC_RULES.KITCHEN_MIN_AREA.minArea}m²`,
          affectedElementId: room.id,
          suggestedFix: `Expand kitchen to at least ${IBC_RULES.KITCHEN_MIN_AREA.minArea}m²`,
        });
      }

      if (room.type === 'bathroom' && areaM2 < IBC_RULES.BATHROOM_MIN_AREA.minArea) {
        violations.push({
          id: `v-${idCounter++}`,
          severity: 'warning',
          code: IBC_RULES.BATHROOM_MIN_AREA.code,
          title: 'Bathroom undersized',
          description: `Bathroom is ${areaM2.toFixed(1)}m², recommended is ${IBC_RULES.BATHROOM_MIN_AREA.minArea}m²`,
          affectedElementId: room.id,
          suggestedFix: `Expand bathroom to at least ${IBC_RULES.BATHROOM_MIN_AREA.minArea}m²`,
        });
      }
    });

    // Check hallway widths
    const hallways = floor.rooms.filter(r => r.type === 'hallway');
    hallways.forEach(hallway => {
      // Estimate hallway width (would need geometry calculation)
      // For now, just flag potential issues
      violations.push({
        id: `v-${idCounter++}`,
        severity: 'info',
        code: IBC_RULES.HALLWAY_MIN_WIDTH.code,
        title: 'Verify hallway width',
        description: `${hallway.label || 'Hallway'} must be at least ${IBC_RULES.HALLWAY_MIN_WIDTH.minWidth}mm wide`,
        affectedElementId: hallway.id,
        suggestedFix: 'Ensure hallway width is sufficient for code compliance',
      });
    });

    // Check door widths
    floor.openings.forEach(opening => {
      if (opening.kind === 'door') {
        const doorWidth = 900; // Standard door width

        if (doorWidth < IBC_RULES.DOOR_MIN_WIDTH.minWidth) {
          violations.push({
            id: `v-${idCounter++}`,
            severity: 'error',
            code: IBC_RULES.DOOR_MIN_WIDTH.code,
            title: 'Door too narrow',
            description: `Door is ${doorWidth}mm, minimum accessible width is ${IBC_RULES.DOOR_MIN_WIDTH.minWidth}mm`,
            affectedElementId: opening.id,
            suggestedFix: 'Use standard 820mm+ width door',
          });
        }

        if (doorWidth < IBC_RULES.EGRESS_DOOR_WIDTH.minWidth) {
          violations.push({
            id: `v-${idCounter++}`,
            severity: 'warning',
            code: IBC_RULES.EGRESS_DOOR_WIDTH.code,
            title: 'Exit door width check',
            description: `Exit door should be at least ${IBC_RULES.EGRESS_DOOR_WIDTH.minWidth}mm wide`,
            affectedElementId: opening.id,
            suggestedFix: 'Consider wider door for better accessibility',
          });
        }
      }
    });

    // Summary
    const summary = {
      errors: violations.filter(v => v.severity === 'error').length,
      warnings: violations.filter(v => v.severity === 'warning').length,
      info: violations.filter(v => v.severity === 'info').length,
    };

    return {
      violations,
      compliant: summary.errors === 0,
      summary,
    };
  }

  /**
   * Get specific code section details
   */
  static getCodeDetails(codeSection: string): any {
    for (const [key, rule] of Object.entries(IBC_RULES)) {
      if (rule.code === codeSection) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Generate compliance report
   */
  static generateReport(floor: Canonical.Floor): string {
    const result = this.checkCompliance(floor);
    const lines: string[] = [];
    const floorWithMetadata = floor as (Canonical.Floor & { name?: string });

    lines.push(`Floor Plan Compliance Report: ${floorWithMetadata.name || floor.id}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    lines.push(`Status: ${result.compliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}`);
    lines.push('');

    lines.push('Summary:');
    lines.push(`  Errors: ${result.summary.errors}`);
    lines.push(`  Warnings: ${result.summary.warnings}`);
    lines.push(`  Info: ${result.summary.info}`);
    lines.push('');

    if (result.violations.length > 0) {
      lines.push('Violations:');
      result.violations.forEach(violation => {
        lines.push(`  [${violation.severity.toUpperCase()}] ${violation.code}: ${violation.title}`);
        lines.push(`    Description: ${violation.description}`);
        lines.push(`    Fix: ${violation.suggestedFix}`);
        lines.push('');
      });
    }

    return lines.join('\n');
  }
}
