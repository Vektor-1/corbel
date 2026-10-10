'use client';

import { useEffect } from 'react';
import { useDesignStore } from '@/store/designStore';

export function useKeyboardShortcuts() {
  const { setCurrentTool, cycleSnapMode, selectAll, selectedElementIds, groupElements, ungroupElements, deleteSelection, duplicateSelection, translateElements } =
    useDesignStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';

      if (modifier && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        (useDesignStore as any).temporal.getState().undo();
      } else if ((modifier && e.key === 'z' && e.shiftKey) || (modifier && e.key === 'y')) {
        e.preventDefault();
        (useDesignStore as any).temporal.getState().redo();
      } else if (modifier && e.key.toLowerCase() === 'a' && !isTyping) {
        e.preventDefault();
        selectAll();
      } else if (modifier && e.key.toLowerCase() === 'd' && !isTyping && selectedElementIds.length > 0) {
        e.preventDefault();
        duplicateSelection();
      } else if (modifier && e.key.toLowerCase() === 'g' && e.shiftKey && !isTyping) {
        e.preventDefault();
        ungroupElements(selectedElementIds);
      } else if (modifier && e.key.toLowerCase() === 'g' && !isTyping) {
        e.preventDefault();
        if (selectedElementIds.length >= 2) groupElements(selectedElementIds);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping && selectedElementIds.length > 0) {
        e.preventDefault();
        deleteSelection();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isTyping && selectedElementIds.length > 0) {
        e.preventDefault();
        // Step size: 10 units normally; 100 units with Shift (matches GRID_SIZE in src/lib/geometry/snap.ts)
        const step = e.shiftKey ? 100 : 10;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -step;
        else if (e.key === 'ArrowDown') dy = step;
        else if (e.key === 'ArrowLeft') dx = -step;
        else if (e.key === 'ArrowRight') dx = step;
        translateElements(selectedElementIds, dx, dy);
      } else if (e.key === 'd' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCurrentTool('door');
      } else if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCurrentTool('window');
      } else if (e.key === 'x' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCurrentTool('delete');
      } else if (e.key === 'w' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCurrentTool('wall');
      } else if (e.key === 'o' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCurrentTool('object');
      } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCurrentTool('scale');
      } else if (e.key === 's' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCurrentTool('select');
      } else if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !isTyping) {
        e.preventDefault();
        cycleSnapMode();
      } else if (e.key === 'Escape') {
        setCurrentTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCurrentTool, cycleSnapMode, selectAll, selectedElementIds, groupElements, ungroupElements, deleteSelection, duplicateSelection, translateElements]);
}
