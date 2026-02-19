import db from '@/lib/db';
import { alertEngine } from '@/lib/alerts/engine';
import type { AgentTask } from '@/lib/db/types';
import { eventBus } from '@/lib/events/eventBus';

export interface TaskAssignment {
  agentId: string;
  taskId: string;
  linearIssueId?: string;
  projectId?: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
}

export interface BlockContext {
  source: 'explicit' | 'question' | 'repeated_errors' | 'idle' | 'resource_denied';
  reason: string;
  taskId: string;
}

export interface SleepSchedule {
  startHour: number;
  endHour: number;
  timezone: string;
  enabled: boolean;
}

class AgentLifecycleManager {
  private static instance: AgentLifecycleManager;
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();
  private errorCounters: Map<string, { count: number; windowStart: number }> = new Map();
  private messageThrottles: Map<string, { lastSent: number; count: number }> = new Map();
  private sleepSchedule: SleepSchedule = {
    startHour: 2,
    endHour: 6,
    timezone: 'America/Los_Angeles',
    enabled: false,
  };

  static getInstance(): AgentLifecycleManager {
    if (!AgentLifecycleManager.instance) {
      AgentLifecycleManager.instance = new AgentLifecycleManager();
    }
    return AgentLifecycleManager.instance;
  }

  async assignTask(assignment: TaskAssignment): Promise<AgentTask> {
    const agent = db.getAgent(assignment.agentId);
    if (!agent) {
      throw new Error(`Agent ${assignment.agentId} not found`);
    }

    const task = db.createAgentTask({
      id: assignment.taskId,
      agent_id: assignment.agentId,
      linear_issue_id: assignment.linearIssueId || null,
      project_id: assignment.projectId || null,
      title: assignment.title,
      status: 'pending',
      priority: assignment.priority,
      blocked_reason: null,
      blocked_at: null,
      started_at: null,
      completed_at: null,
    });

    db.updateAgent(assignment.agentId, {
      status: 'working',
      current_task_id: task.id,
      last_heartbeat: Math.floor(Date.now() / 1000),
    });

    this.startIdleMonitor(assignment.agentId);

    if (assignment.linearIssueId) {
      try {
        db.linkAgentToIssue(assignment.linearIssueId, task.id);
      } catch (error) {
        console.error('Failed to link task to Linear issue:', error);
      }
    }

    eventBus.publish({
      type: 'agent:status',
      payload: { agentId: assignment.agentId, action: 'task_assigned', taskId: task.id },
      timestamp: Date.now(),
    });

    return task;
  }

  detectBlocked(agentId: string, context: BlockContext): void {
    const now = Math.floor(Date.now() / 1000);
    const task = db.getAgentTask(context.taskId);
    if (!task) {
      return;
    }

    db.updateAgentTask(context.taskId, {
      status: 'blocked',
      blocked_reason: `[${context.source}] ${context.reason}`,
      blocked_at: now,
    });

    db.updateAgent(agentId, { status: 'blocked', current_task_id: context.taskId });

    alertEngine.processEvent({
      trigger: 'blocked',
      agentId,
      taskId: context.taskId,
      title: task.title,
      priority: task.priority,
      reason: context.reason,
      projectId: task.project_id || undefined,
    });

    eventBus.publish({
      type: 'agent:status',
      payload: { agentId, action: 'blocked', taskId: context.taskId, reason: context.reason, source: context.source },
      timestamp: Date.now(),
    });
  }

  recordError(agentId: string, taskId: string): boolean {
    const key = `${agentId}:${taskId}`;
    const now = Date.now();
    const counter = this.errorCounters.get(key);

    if (!counter || now - counter.windowStart > 600_000) {
      this.errorCounters.set(key, { count: 1, windowStart: now });
      return false;
    }

    counter.count += 1;

    if (counter.count >= 5) {
      this.detectBlocked(agentId, {
        source: 'repeated_errors',
        reason: `${counter.count} consecutive errors in ${Math.floor((now - counter.windowStart) / 1000)}s`,
        taskId,
      });
      this.triggerSleep(agentId, 'error_threshold', `${counter.count} errors in 10 minutes`);
      return true;
    }

    if (counter.count >= 3) {
      this.detectBlocked(agentId, {
        source: 'repeated_errors',
        reason: `${counter.count} consecutive errors in ${Math.floor((now - counter.windowStart) / 1000)}s`,
        taskId,
      });
      return true;
    }

    return false;
  }

  refreshHeartbeat(agentId: string): void {
    db.updateAgent(agentId, { last_heartbeat: Math.floor(Date.now() / 1000) });
    this.startIdleMonitor(agentId);
  }

  shouldSendMessage(agentId: string, type: 'push' | 'in_app'): boolean {
    if (type === 'in_app') {
      return true;
    }

    const now = Date.now();
    const throttle = this.messageThrottles.get(agentId);

    if (!throttle || now - throttle.lastSent > 3_600_000) {
      this.messageThrottles.set(agentId, { lastSent: now, count: 1 });
      return true;
    }

    if (throttle.count >= 3) {
      return false;
    }

    throttle.count += 1;
    throttle.lastSent = now;
    return true;
  }

  triggerSleep(agentId: string, reason: string, detail?: string): void {
    const agent = db.getAgent(agentId);
    if (!agent || agent.status === 'sleeping' || agent.status === 'offline') {
      return;
    }

    db.updateAgent(agentId, { status: 'sleeping' });
    this.clearIdleMonitor(agentId);

    eventBus.publish({
      type: 'agent:status',
      payload: { agentId, action: 'sleep', reason, detail },
      timestamp: Date.now(),
    });
  }

  triggerWake(agentId: string, reason: string): void {
    const agent = db.getAgent(agentId);
    if (!agent || agent.status !== 'sleeping') {
      return;
    }

    db.updateAgent(agentId, {
      status: 'idle',
      last_heartbeat: Math.floor(Date.now() / 1000),
    });

    this.startIdleMonitor(agentId);

    eventBus.publish({
      type: 'agent:status',
      payload: { agentId, action: 'wake', reason },
      timestamp: Date.now(),
    });
  }

  isInSleepWindow(): boolean {
    if (!this.sleepSchedule.enabled) {
      return false;
    }

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: this.sleepSchedule.timezone,
      });

      const currentHour = Number.parseInt(formatter.format(new Date()), 10);
      if (!Number.isFinite(currentHour)) {
        return false;
      }

      const { startHour, endHour } = this.sleepSchedule;
      if (startHour < endHour) {
        return currentHour >= startHour && currentHour < endHour;
      }
      return currentHour >= startHour || currentHour < endHour;
    } catch (error) {
      console.error('Failed to evaluate sleep window:', error);
      return false;
    }
  }

  getSleepSchedule(): SleepSchedule {
    return { ...this.sleepSchedule };
  }

  setSleepSchedule(schedule: Partial<SleepSchedule>): void {
    this.sleepSchedule = { ...this.sleepSchedule, ...schedule };
  }

  completeTask(agentId: string, taskId: string): void {
    const now = Math.floor(Date.now() / 1000);
    const task = db.getAgentTask(taskId);
    if (!task) {
      return;
    }

    db.updateAgentTask(taskId, {
      status: 'completed',
      completed_at: now,
    });

    const pendingTasks = db.getAgentTasks(agentId).filter((entry) => entry.status === 'pending');

    if (pendingTasks.length === 0) {
      if (this.isInSleepWindow()) {
        this.triggerSleep(agentId, 'schedule', 'Sleep window active, no pending tasks');
      } else {
        db.updateAgent(agentId, { status: 'idle', current_task_id: null });
      }
    } else {
      db.updateAgent(agentId, { current_task_id: null });
    }

    this.clearIdleMonitor(agentId);

    alertEngine.processEvent({
      trigger: 'completed',
      agentId,
      taskId,
      title: task.title,
      priority: task.priority,
      projectId: task.project_id || undefined,
    });

    eventBus.publish({
      type: 'agent:status',
      payload: { agentId, action: 'task_completed', taskId },
      timestamp: Date.now(),
    });
  }

  dispose(): void {
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    this.errorCounters.clear();
    this.messageThrottles.clear();
  }

  private startIdleMonitor(agentId: string): void {
    this.clearIdleMonitor(agentId);
    const timer = setTimeout(() => {
      this.checkIdle(agentId);
    }, 5 * 60 * 1000);
    this.idleTimers.set(agentId, timer);
  }

  private clearIdleMonitor(agentId: string): void {
    const timer = this.idleTimers.get(agentId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.idleTimers.delete(agentId);
  }

  private checkIdle(agentId: string): void {
    const agent = db.getAgent(agentId);
    if (!agent || agent.status !== 'working') {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const heartbeatAge = agent.last_heartbeat ? now - agent.last_heartbeat : Number.POSITIVE_INFINITY;

    if (heartbeatAge > 300 && agent.current_task_id) {
      this.detectBlocked(agentId, {
        source: 'idle',
        reason: `Agent idle for ${Math.floor(heartbeatAge / 60)} minutes with in_progress task`,
        taskId: agent.current_task_id,
      });
    }

    const pendingTasks = db.getAgentTasks(agentId).filter((task) => task.status === 'pending');
    if (heartbeatAge > 1_800 && pendingTasks.length > 0) {
      alertEngine.processEvent({
        trigger: 'idle_too_long',
        agentId,
        taskId: pendingTasks[0].id,
        title: pendingTasks[0].title,
        priority: 'medium',
        projectId: pendingTasks[0].project_id || undefined,
      });
    }
  }
}

export const lifecycleManager = AgentLifecycleManager.getInstance();
