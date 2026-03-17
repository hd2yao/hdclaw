import type { DashboardEvent } from '../types.js';

type Listener = (event: DashboardEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: DashboardEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const eventBus = new EventBus();
