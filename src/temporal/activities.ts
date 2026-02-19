import db from '@/lib/db';
import { alertEngine } from '@/lib/alerts/engine';
import { eventBus } from '@/lib/events/eventBus';
import type { AgentTaskWorkflowInput, MonitorResult, NotificationPayload } from './types';

export async function registerAgent(input: AgentTaskWorkflowInput): Promise<void> {
  const existing = db.getAgent(input.agentId);

  if (!existing) {
    db.createAgent({
      id: input.agentId,
      name: input.agentName,
      type: input.agentType || 'sub-agent',
      parent_agent_id: input.parentAgentId || null,
      status: 'idle',
      soul_md: input.soulMd || null,
      skills: input.skills ? JSON.stringify(input.skills) : null,
      current_task_id: null,
      last_heartbeat: null,
      config: input.config ? JSON.stringify(input.config) : null,
    });
  }

  eventBus.publish({
    type: 'agent:status',
    payload: { agentId: input.agentId, action: 'registered' },
    timestamp: Date.now(),
  });
}

export async function startAgentTask(input: AgentTaskWorkflowInput): Promise<void> {
  const task = db.createAgentTask({
    id: input.taskId,
    agent_id: input.agentId,
    linear_issue_id: input.linearIssueId || null,
    project_id: input.projectId || null,
    title: input.title,
    status: 'in_progress',
    priority: input.priority || 'medium',
    blocked_reason: null,
    blocked_at: null,
    started_at: Math.floor(Date.now() / 1000),
    completed_at: null,
  });

  db.updateAgent(input.agentId, {
    status: 'working',
    current_task_id: task.id,
    last_heartbeat: Math.floor(Date.now() / 1000),
  });

  eventBus.publish({
    type: 'agent:status',
    payload: { agentId: input.agentId, action: 'task_started', taskId: task.id },
    timestamp: Date.now(),
  });
}

export async function monitorAgent(agentId: string, taskId: string): Promise<MonitorResult> {
  const agent = db.getAgent(agentId);
  if (!agent) {
    return { status: 'error', reason: 'Agent not found' };
  }

  db.updateAgent(agentId, { last_heartbeat: Math.floor(Date.now() / 1000) });

  const task = db.getAgentTask(taskId);
  if (!task) {
    return { status: 'error', reason: 'Task not found' };
  }

  if (task.status === 'completed') {
    return { status: 'completed' };
  }
  if (task.status === 'cancelled') {
    return { status: 'error', reason: 'Task cancelled externally' };
  }
  if (task.status === 'blocked') {
    return { status: 'blocked', reason: task.blocked_reason || 'Unknown' };
  }

  return { status: 'working' };
}

export async function updateDashboard(
  agentId: string,
  agentStatus: string,
  taskId: string,
  taskStatus?: string,
  blockedReason?: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const agentUpdates: Record<string, unknown> = { status: agentStatus, last_heartbeat: now };

  if (agentStatus === 'idle' || agentStatus === 'offline') {
    agentUpdates.current_task_id = null;
  }
  db.updateAgent(agentId, agentUpdates as any);

  if (taskStatus) {
    const taskUpdates: Record<string, unknown> = { status: taskStatus, updated_at: now };

    if (taskStatus === 'blocked') {
      taskUpdates.blocked_reason = blockedReason || null;
      taskUpdates.blocked_at = now;
    }
    if (taskStatus === 'completed' || taskStatus === 'cancelled') {
      taskUpdates.completed_at = now;
    }
    if (taskStatus === 'in_progress') {
      taskUpdates.blocked_reason = null;
      taskUpdates.blocked_at = null;
    }

    db.updateAgentTask(taskId, taskUpdates as any);
  }

  eventBus.publish({
    type: 'agent:status',
    payload: { agentId, status: agentStatus, taskId, taskStatus },
    timestamp: Date.now(),
  });
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  alertEngine.processEvent({
    trigger: payload.type,
    agentId: payload.agentId,
    taskId: payload.taskId,
    title: payload.title,
    priority: payload.priority || 'medium',
    reason: payload.reason,
    projectId: payload.projectId,
  });
}

export async function cancelAlerts(agentId: string, taskId?: string): Promise<number> {
  return alertEngine.cancelPendingAlerts(agentId, taskId);
}
