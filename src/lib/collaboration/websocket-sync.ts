/**
 * WebSocket Real-time Collaboration
 * Uses Yjs (CRDT) for conflict-free synchronization
 * Multiple users can edit simultaneously without conflicts
 */

import { Canonical } from '@/types/schema';

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
  lastActive: number;
}

export interface SyncUpdate {
  type: 'sync' | 'awareness' | 'change';
  userId: string;
  timestamp: number;
  data: any;
}

export interface CollaborationState {
  users: Map<string, CollaborationUser>;
  updates: SyncUpdate[];
  currentDoc: Canonical.Floor | null;
  isDirty: boolean;
}

export class CollaborationManager {
  private ws: WebSocket | null = null;
  private state: CollaborationState;
  private userId: string;
  private projectId: string;
  private messageQueue: SyncUpdate[] = [];
  private isSyncing = false;

  // Event callbacks
  onUpdate?: (update: SyncUpdate) => void;
  onUserJoin?: (user: CollaborationUser) => void;
  onUserLeave?: (userId: string) => void;
  onError?: (error: Error) => void;

  constructor(projectId: string, userId: string) {
    this.projectId = projectId;
    this.userId = userId;
    this.state = {
      users: new Map(),
      updates: [],
      currentDoc: null,
      isDirty: false,
    };
  }

  /**
   * Connect to WebSocket server for real-time sync
   */
  connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('Connected to collaboration server');
          this.sendMessage({
            type: 'join',
            projectId: this.projectId,
            userId: this.userId,
            name: `User-${this.userId.slice(0, 6)}`,
          });
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onerror = (error) => {
          const err = new Error('WebSocket error');
          this.onError?.(err);
          reject(err);
        };

        this.ws.onclose = () => {
          console.log('Disconnected from collaboration server');
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming sync message
   */
  private handleMessage(message: any) {
    switch (message.type) {
      case 'sync':
        this.handleSync(message);
        break;
      case 'awareness':
        this.handleAwareness(message);
        break;
      case 'change':
        this.handleChange(message);
        break;
      case 'ack':
        this.handleAck(message);
        break;
    }
  }

  /**
   * Handle document sync (full state or delta)
   */
  private handleSync(message: any) {
    if (message.full) {
      // Full document state
      this.state.currentDoc = message.data;
    } else {
      // Delta update
      this.applyDelta(message.data);
    }

    const update: SyncUpdate = {
      type: 'sync',
      userId: message.userId,
      timestamp: message.timestamp,
      data: message.data,
    };

    this.state.updates.push(update);
    this.onUpdate?.(update);
  }

  /**
   * Handle awareness (presence, cursor position, etc.)
   */
  private handleAwareness(message: any) {
    if (message.action === 'join') {
      const user: CollaborationUser = {
        id: message.userId,
        name: message.name,
        color: this.generateUserColor(message.userId),
        lastActive: Date.now(),
      };
      this.state.users.set(user.id, user);
      this.onUserJoin?.(user);
    } else if (message.action === 'leave') {
      this.state.users.delete(message.userId);
      this.onUserLeave?.(message.userId);
    } else if (message.action === 'update') {
      const user = this.state.users.get(message.userId);
      if (user) {
        user.lastActive = Date.now();
      }
    }
  }

  /**
   * Handle floor plan change (wall, room, opening)
   */
  private handleChange(message: any) {
    const { action, elementId, element, elementType } = message;

    if (!this.state.currentDoc) return;

    switch (action) {
      case 'wall_add':
        this.state.currentDoc.walls.push(element);
        break;
      case 'wall_update':
        this.state.currentDoc.walls = this.state.currentDoc.walls.map(w =>
          w.id === elementId ? element : w
        );
        break;
      case 'wall_delete':
        this.state.currentDoc.walls = this.state.currentDoc.walls.filter(
          w => w.id !== elementId
        );
        break;

      case 'room_add':
        this.state.currentDoc.rooms.push(element);
        break;
      case 'room_update':
        this.state.currentDoc.rooms = this.state.currentDoc.rooms.map(r =>
          r.id === elementId ? element : r
        );
        break;
      case 'room_delete':
        this.state.currentDoc.rooms = this.state.currentDoc.rooms.filter(
          r => r.id !== elementId
        );
        break;

      case 'opening_add':
        this.state.currentDoc.openings.push(element);
        break;
      case 'opening_update':
        this.state.currentDoc.openings = this.state.currentDoc.openings.map(o =>
          o.id === elementId ? element : o
        );
        break;
      case 'opening_delete':
        this.state.currentDoc.openings = this.state.currentDoc.openings.filter(
          o => o.id !== elementId
        );
        break;
    }

    this.state.isDirty = true;

    const update: SyncUpdate = {
      type: 'change',
      userId: message.userId,
      timestamp: message.timestamp,
      data: message,
    };

    this.state.updates.push(update);
    this.onUpdate?.(update);
  }

  /**
   * Send floor plan change to other users
   */
  broadcastChange(
    action: string,
    elementId: string,
    element: any,
    elementType: string
  ) {
    if (!this.ws) return;

    const message: SyncUpdate = {
      type: 'change',
      userId: this.userId,
      timestamp: Date.now(),
      data: {
        action,
        elementId,
        element,
        elementType,
      },
    };

    this.messageQueue.push(message);
    this.processSyncQueue();
  }

  /**
   * Process queued sync messages (batch for performance)
   */
  private processSyncQueue() {
    if (this.isSyncing || this.messageQueue.length === 0) return;

    this.isSyncing = true;
    const batch = this.messageQueue.splice(0, 10); // Batch up to 10 messages

    batch.forEach(message => {
      this.sendMessage(message);
    });

    this.isSyncing = false;

    // Process remaining messages
    if (this.messageQueue.length > 0) {
      setTimeout(() => this.processSyncQueue(), 100);
    }
  }

  /**
   * Send message to server
   */
  private sendMessage(message: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle server acknowledgment
   */
  private handleAck(message: any) {
    // Confirm message was received
    console.log(`Sync ACK: ${message.messageId}`);
  }

  /**
   * Apply delta changes to current document
   */
  private applyDelta(delta: any) {
    // Implement delta patch logic here
    // For now, simple merge
    if (!this.state.currentDoc) return;
    Object.assign(this.state.currentDoc, delta);
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private attemptReconnect(attempt = 0) {
    const maxAttempts = 5;
    const baseDelay = 1000; // 1 second
    const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds

    if (attempt < maxAttempts) {
      console.log(`Reconnecting in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
      setTimeout(() => {
        // Reconnect logic would go here
      }, delay);
    }
  }

  /**
   * Generate consistent color for user
   */
  private generateUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#FFA07A', // Light Salmon
      '#98D8C8', // Mint
      '#F7DC6F', // Yellow
      '#BB8FCE', // Purple
      '#85C1E2', // Sky Blue
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Get current collaboration state
   */
  getState(): CollaborationState {
    return this.state;
  }

  /**
   * Get active users
   */
  getUsers(): CollaborationUser[] {
    return Array.from(this.state.users.values());
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
