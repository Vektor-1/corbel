import type { CorbelAPI } from '@/lib/api/browser-sdk';

declare global {
  interface Window {
    CorbelAPI?: CorbelAPI;
  }
}
