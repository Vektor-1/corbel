'use client';

import { useEffect } from 'react';
import { useDesignStore } from '@/store/designStore';

export function useKeyboardShortcuts() {
  const { setCurrentTool } = useDesignStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        (useDesignStore as any).temporal.getState().undo();
      } else if ((modifier && e.key === 'z' && e.shiftKey) || (modifier && e.key === 'y')) {
        e.preventDefault();
        (useDesignStore as any).temporal.getState().redo();
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
      } else if (e.key === 's' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCurrentTool('select');
      } else if (e.key === 'Escape') {
        setCurrentTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCurrentTool]);
}
