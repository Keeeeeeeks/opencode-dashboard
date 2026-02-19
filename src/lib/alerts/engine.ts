import db from '@/lib/db';
import type { AlertRule } from '@/lib/db/types';
import { eventBus } from '@/lib/events/eventBus';

type AlertTrigger = 'blocked' | 'completed' | 'error' | 'idle_too_long' | 'stale_task';
type AlertPriority = 'high' | 'medium' | 'low';

export interface AlertEvent {
  trigger: AlertTrigger;
  agentId: string;
  taskId: string;
  title: string;
  priority: AlertPriority;
  reason?: string;
  projectId?: string;
}

interface PendingAlert {
  event: AlertEvent;
  rule: AlertRule;
  timer: NodeJS.Timeout;
  scheduledAt: number;
}

type AlertChannel = AlertRule['channel'];

class AlertEngine {
  private pendingAlerts: Map<string, PendingAlert> = new Map();
  private batchQueue: AlertEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  private hourlyPushTimestamps: number[] = [];
  private agentHourlyPushTimestamps: Map<string, number[]> = new Map();
  private recentEventTimestamps: number[] = [];

  private static instance: AlertEngine;

  static getInstance(): AlertEngine {
    if (!AlertEngine.instance) {
      AlertEngine.instance = new AlertEngine();
    }
    return AlertEngine.instance;
  }

  processEvent(event: AlertEvent): void {
    this.trackEventRate();
    const rules = db.getAlertRulesForTrigger(event.trigger, event.priority);

    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }
      this.scheduleAlert(event, rule);
    }
  }

  cancelPendingAlerts(agentId: string, taskId?: string): number {
    let cancelled = 0;

    for (const [key, pending] of this.pendingAlerts) {
      if (pending.event.agentId === agentId && (!taskId || pending.event.taskId === taskId)) {
        clearTimeout(pending.timer);
        this.pendingAlerts.delete(key);
        cancelled += 1;
      }
    }

    return cancelled;
  }

  getPendingCount(): number {
    return this.pendingAlerts.size;
  }

  private scheduleAlert(event: AlertEvent, rule: AlertRule): void {
    const key = `${rule.id}:${event.agentId}:${event.taskId}`;

    if (this.pendingAlerts.has(key)) {
      clearTimeout(this.pendingAlerts.get(key)!.timer);
      this.pendingAlerts.delete(key);
    }

    if (rule.id === 'completed-batch') {
      if (event.priority === 'high') {
        return;
      }
      this.addToBatch(event, rule);
      return;
    }

    if (rule.delay_ms === 0) {
      this.fireAlert(event, rule);
      return;
    }

    const timer = setTimeout(() => {
      this.pendingAlerts.delete(key);
      this.fireAlert(event, rule);
    }, rule.delay_ms);

    this.pendingAlerts.set(key, {
      event,
      rule,
      timer,
      scheduledAt: Date.now(),
    });
  }

  private addToBatch(event: AlertEvent, rule: AlertRule): void {
    this.batchQueue.push(event);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), rule.delay_ms);
    }
  }

  private flushBatch(): void {
    if (this.batchQueue.length === 0) {
      this.batchTimer = null;
      return;
    }

    const events = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimer = null;

    const content =
      events.length === 1
        ? `Task completed: "${events[0].title}" (agent: ${events[0].agentId})`
        : `${events.length} tasks completed in the last 15 minutes: ${events.map((entry) => `"${entry.title}"`).join(', ')}`;

    db.createMessage({
      type: 'task_complete',
      content,
      todo_id: null,
      session_id: null,
      read: 0,
      project_id: events[0].projectId || null,
    });

    eventBus.publish({
      type: 'message:created',
      payload: { batch: true, count: events.length, digestMode: this.isDigestMode() },
      timestamp: Date.now(),
    });
  }

  private fireAlert(event: AlertEvent, rule: AlertRule): void {
    const content = this.buildMessage(event);
    const channel = this.resolveChannel(event.agentId, rule.channel);

    const messageType =
      event.trigger === 'error' ? 'error' : event.trigger === 'completed' ? 'task_complete' : 'state_change';

    db.createMessage({
      type: messageType,
      content,
      todo_id: null,
      session_id: null,
      read: 0,
      project_id: event.projectId || null,
    });

    eventBus.publish({
      type: 'message:created',
      payload: {
        alert: event,
        channel,
        digestMode: this.isDigestMode(),
      },
      timestamp: Date.now(),
    });
  }

  private buildMessage(event: AlertEvent): string {
    switch (event.trigger) {
      case 'blocked':
        return `[${event.priority.toUpperCase()}] Agent "${event.agentId}" blocked on "${event.title}": ${event.reason || 'Unknown'}`;
      case 'completed':
        return `Agent "${event.agentId}" completed "${event.title}"`;
      case 'error':
        return `[ERROR] Agent "${event.agentId}" error on "${event.title}": ${event.reason || 'Unknown'}`;
      case 'stale_task':
        return `[STALE] Task "${event.title}" blocked for >2h (agent: ${event.agentId})`;
      case 'idle_too_long':
        return `Agent "${event.agentId}" idle for >30min with pending tasks`;
      default:
        return `Alert: ${event.trigger} - ${event.title}`;
    }
  }

  private resolveChannel(agentId: string, channel: AlertChannel): AlertChannel {
    if (channel === 'in_app') {
      return 'in_app';
    }

    if (this.isDigestMode()) {
      return 'in_app';
    }

    const pushAllowed = this.tryRecordPush(agentId);
    if (!pushAllowed) {
      return 'in_app';
    }

    return channel;
  }

  private isDigestMode(): boolean {
    const now = Date.now();
    const minuteAgo = now - 60_000;
    this.recentEventTimestamps = this.recentEventTimestamps.filter((timestamp) => timestamp > minuteAgo);
    return this.recentEventTimestamps.length > 5;
  }

  private trackEventRate(): void {
    const now = Date.now();
    const minuteAgo = now - 60_000;
    this.recentEventTimestamps = this.recentEventTimestamps.filter((timestamp) => timestamp > minuteAgo);
    this.recentEventTimestamps.push(now);
  }

  private tryRecordPush(agentId: string): boolean {
    const now = Date.now();
    const hourAgo = now - 3_600_000;

    this.hourlyPushTimestamps = this.hourlyPushTimestamps.filter((timestamp) => timestamp > hourAgo);
    if (this.hourlyPushTimestamps.length >= 10) {
      return false;
    }

    const perAgent = this.agentHourlyPushTimestamps.get(agentId) || [];
    const prunedPerAgent = perAgent.filter((timestamp) => timestamp > hourAgo);
    if (prunedPerAgent.length >= 3) {
      this.agentHourlyPushTimestamps.set(agentId, prunedPerAgent);
      return false;
    }

    this.hourlyPushTimestamps.push(now);
    prunedPerAgent.push(now);
    this.agentHourlyPushTimestamps.set(agentId, prunedPerAgent);
    return true;
  }
}

export const alertEngine = AlertEngine.getInstance();
