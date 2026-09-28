export type EditorCommand = {
  id: string;
  label: string;
  keywords?: string[];
  shortcut?: string;
  enabled?: () => boolean;
  run: () => void;
};

const commands = new Map<string, EditorCommand>();

export function registerEditorCommands(items: EditorCommand[]): () => void {
  items.forEach((item) => commands.set(item.id, item));
  return () => items.forEach((item) => commands.delete(item.id));
}

export function findEditorCommands(query = ''): EditorCommand[] {
  const needle = query.trim().toLowerCase();
  return [...commands.values()]
    .filter((command) => !needle || [command.label, ...(command.keywords ?? [])].join(' ').toLowerCase().includes(needle))
    .filter((command) => command.enabled?.() !== false)
    .sort((a, b) => a.label.localeCompare(b.label));
}
