import type { Door, FloorPlan, Point, Room, ValidationResult, Wall, Window } from '@/types/design';

export type PlanChatIntent = 'create' | 'edit' | 'configure' | 'analyze';

export interface PlanChatContext {
  floorPlan: FloorPlan | null;
  selectedElementIds: string[];
  selectedElements?: PlanChatSelection[];
  viewMode: '2d' | '3d' | 'split';
  validationResults?: ValidationResult[];
  canvasSnapshot?: string;
}

export interface PlanChatSelection {
  id: string;
  element: 'wall' | 'door' | 'window' | 'room' | 'object';
  data: unknown;
}

export type PlanChatOperation =
  | { type: 'update-wall'; id: string; updates: Partial<Pick<Wall, 'startPoint' | 'endPoint' | 'thickness' | 'material' | 'type' | 'height'>> }
  | { type: 'update-door'; id: string; updates: Partial<Pick<Door, 'position' | 'wallId' | 'width' | 'type' | 'swing' | 'openDirection'>> }
  | { type: 'update-window'; id: string; updates: Partial<Pick<Window, 'position' | 'wallId' | 'width' | 'height' | 'sillHeight'>> }
  | { type: 'update-room'; id: string; updates: Partial<Pick<Room, 'name' | 'type' | 'vertices'>> }
  | { type: 'add-wall'; wall: Wall }
  | { type: 'add-door'; door: Door }
  | { type: 'add-window'; window: Window }
  | { type: 'set-scale'; scale: number }
  | { type: 'rename-plan'; name: string }
  | { type: 'delete-element'; id: string; element: 'wall' | 'door' | 'window' | 'room' };

export interface PlanChatResponse {
  intent: PlanChatIntent;
  reply: string;
  requiresConfirmation: boolean;
  todo: PlanChatTodo[];
  operations: PlanChatOperation[];
}

export interface PlanChatTodo {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export function point(value: unknown): value is Point {
  return typeof value === 'object' && value !== null
    && Number.isFinite((value as { x?: unknown }).x)
    && Number.isFinite((value as { y?: unknown }).y);
}
