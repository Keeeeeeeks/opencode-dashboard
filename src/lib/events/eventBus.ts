import { EventEmitter } from 'events';

export type DashboardEvent = {
  type:
    | 'todo:updated'
    | 'todo:created'
    | 'todo:deleted'
    | 'message:created'
    | 'sprint:updated'
    | 'sprint:created'
    | 'agent:status'
    | 'project:updated';
  payload: Record<string, unknown>;
  timestamp: number;
};

class DashboardEventBus extends EventEmitter {
  private static instance: DashboardEventBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): DashboardEventBus {
    if (!DashboardEventBus.instance) {
      DashboardEventBus.instance = new DashboardEventBus();
    }
    return DashboardEventBus.instance;
  }

  emit(event: string, data?: DashboardEvent): boolean {
    return super.emit(event, data);
  }

  publish(event: DashboardEvent): void {
    this.emit('dashboard-event', event);
  }
}

export const eventBus = DashboardEventBus.getInstance();
