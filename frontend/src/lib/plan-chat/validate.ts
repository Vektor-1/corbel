import type { Door, FloorPlan, Room, Wall, Window } from '@/types/design';
import type { PlanChatOperation, PlanChatResponse, PlanChatTodo } from './types';
import { point } from './types';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function validWall(value: unknown): value is Wall {
  return record(value) && typeof value.id === 'string' && point(value.startPoint) && point(value.endPoint)
    && finite(value.thickness) && finite(value.height) && (value.type === 'loadBearing' || value.type === 'partition')
    && ['sandcrete', 'laterite', 'concrete', 'timber'].includes(String(value.material));
}

function validDoor(value: unknown): value is Door {
  return record(value) && typeof value.id === 'string' && point(value.position) && typeof value.wallId === 'string'
    && finite(value.width) && (value.type === 'entry' || value.type === 'internal') && (value.swing === 'left' || value.swing === 'right');
}

function validWindow(value: unknown): value is Window {
  return record(value) && typeof value.id === 'string' && point(value.position) && typeof value.wallId === 'string'
    && finite(value.width) && finite(value.height) && finite(value.sillHeight);
}

function validUpdates(value: unknown): boolean {
  if (!record(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (['startPoint', 'endPoint', 'position'].includes(key)) return point(item);
    if (key === 'vertices') return Array.isArray(item) && item.length >= 3 && item.every(point);
    if (['thickness', 'height', 'width', 'sillHeight', 'scale'].includes(key)) return finite(item) && item > 0;
    if (key === 'material') return ['sandcrete', 'laterite', 'concrete', 'timber'].includes(String(item));
    if (key === 'type') return ['loadBearing', 'partition', 'entry', 'internal', 'bedroom', 'kitchen', 'bathroom', 'living', 'dining', 'other'].includes(String(item));
    if (key === 'swing') return item === 'left' || item === 'right';
    if (key === 'openDirection') return item === 'in' || item === 'out';
    if (['name', 'wallId'].includes(key)) return typeof item === 'string' && item.length <= 120;
    return false;
  });
}

export function parsePlanChatResponse(value: unknown): PlanChatResponse {
  if (!record(value) || typeof value.intent !== 'string' || !['create', 'edit', 'configure', 'analyze'].includes(value.intent)) throw new Error('Invalid AI plan action response.');
  if (typeof value.reply !== 'string' || value.reply.length > 2_000) throw new Error('Invalid AI response message.');
  if (!Array.isArray(value.operations) || value.operations.length > 50) throw new Error('Invalid AI plan operations.');
  const todo: PlanChatTodo[] = Array.isArray(value.todo)
    ? value.todo.slice(0, 8).map((item): PlanChatTodo => {
        if (!record(item) || typeof item.id !== 'string' || typeof item.title !== 'string' || item.title.length > 160
          || !['pending', 'in_progress', 'completed'].includes(String(item.status))) {
          throw new Error('Invalid AI task list.');
        }
        return { id: item.id, title: item.title, status: item.status as PlanChatTodo['status'] };
      })
    : [];

  const operations = value.operations.map((operation): PlanChatOperation => {
    if (!record(operation) || typeof operation.type !== 'string') throw new Error('Invalid AI plan operation.');
    switch (operation.type) {
      case 'update-wall':
      case 'update-door':
      case 'update-window':
      case 'update-room':
        if (typeof operation.id !== 'string' || !validUpdates(operation.updates)) throw new Error('Invalid update operation.');
        return operation as PlanChatOperation;
      case 'add-wall':
        if (!validWall(operation.wall)) throw new Error('Invalid add-wall operation.');
        return operation as PlanChatOperation;
      case 'add-door':
        if (!validDoor(operation.door)) throw new Error('Invalid add-door operation.');
        return operation as PlanChatOperation;
      case 'add-window':
        if (!validWindow(operation.window)) throw new Error('Invalid add-window operation.');
        return operation as PlanChatOperation;
      case 'set-scale':
        if (!finite(operation.scale) || operation.scale < 20 || operation.scale > 2_000) throw new Error('Invalid scale operation.');
        return operation as PlanChatOperation;
      case 'rename-plan':
        if (typeof operation.name !== 'string' || operation.name.trim().length < 1 || operation.name.length > 120) throw new Error('Invalid rename operation.');
        return operation as PlanChatOperation;
      case 'delete-element':
        if (typeof operation.id !== 'string' || typeof operation.element !== 'string' || !['wall', 'door', 'window', 'room'].includes(operation.element)) throw new Error('Invalid delete operation.');
        return operation as PlanChatOperation;
      default:
        throw new Error('Unsupported AI plan operation.');
    }
  });

  return { intent: value.intent as PlanChatResponse['intent'], reply: value.reply, requiresConfirmation: operations.length > 0 || value.requiresConfirmation !== false, todo, operations };
}
