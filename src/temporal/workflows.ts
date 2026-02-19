import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import type { AgentTaskWorkflowInput, AgentTaskWorkflowResult } from './types';
import type * as activities from './activities';

export const sleepSignal = defineSignal('sleep');
export const wakeSignal = defineSignal('wake');
export const unblockSignal = defineSignal<[string]>('unblock');
export const cancelSignal = defineSignal('cancel');

export const statusQuery = defineQuery<string>('status');
export const progressQuery = defineQuery<{ status: string; taskTitle: string; blockedReason?: string }>(
  'progress'
);

export async function agentTaskWorkflow(input: AgentTaskWorkflowInput): Promise<AgentTaskWorkflowResult> {
  const { registerAgent, startAgentTask, monitorAgent, updateDashboard, sendNotification, cancelAlerts } =
    proxyActivities<typeof activities>({
      startToCloseTimeout: '10 minutes',
      retry: { maximumAttempts: 3 },
    });

  let isSleeping = false;
  let isBlocked = false;
  let isCancelled = false;
  let blockedReason: string | undefined;
  let currentStatus = 'starting';

  setHandler(sleepSignal, () => {
    isSleeping = true;
    currentStatus = 'sleeping';
  });

  setHandler(wakeSignal, () => {
    isSleeping = false;
  });

  setHandler(unblockSignal, () => {
    isBlocked = false;
    blockedReason = undefined;
  });

  setHandler(cancelSignal, () => {
    isCancelled = true;
  });

  setHandler(statusQuery, () => currentStatus);
  setHandler(progressQuery, () => ({ status: currentStatus, taskTitle: input.title, blockedReason }));

  await registerAgent(input);
  currentStatus = 'registered';

  await startAgentTask(input);
  currentStatus = 'working';

  while (!isCancelled) {
    if (isSleeping) {
      await updateDashboard(input.agentId, 'sleeping', input.taskId);
      await condition(() => !isSleeping, '24h');

      if (isSleeping) {
        currentStatus = 'idle';
        break;
      }

      await updateDashboard(input.agentId, 'working', input.taskId);
      currentStatus = 'working';
    }

    const result = await monitorAgent(input.agentId, input.taskId);

    if (result.status === 'completed') {
      currentStatus = 'completed';
      await updateDashboard(input.agentId, 'idle', input.taskId, 'completed');
      await sendNotification({
        type: 'completed',
        agentId: input.agentId,
        taskId: input.taskId,
        title: input.title,
        priority: input.priority,
      });
      return { status: 'completed', agentId: input.agentId, taskId: input.taskId };
    }

    if (result.status === 'blocked') {
      isBlocked = true;
      blockedReason = result.reason;
      currentStatus = 'blocked';

      await updateDashboard(input.agentId, 'blocked', input.taskId, 'blocked', result.reason);
      await sendNotification({
        type: 'blocked',
        agentId: input.agentId,
        taskId: input.taskId,
        title: input.title,
        priority: input.priority,
        reason: result.reason,
      });

      const unblockedInTime = await condition(() => !isBlocked, '2h');
      if (!unblockedInTime) {
        await sendNotification({
          type: 'stale_task',
          agentId: input.agentId,
          taskId: input.taskId,
          title: input.title,
          priority: input.priority,
        });
      }

      if (isBlocked) {
        continue;
      }

      await cancelAlerts(input.agentId, input.taskId);
      await updateDashboard(input.agentId, 'working', input.taskId, 'in_progress');
      currentStatus = 'working';
    }

    if (result.status === 'error') {
      currentStatus = 'error';
      await updateDashboard(input.agentId, 'idle', input.taskId, 'cancelled');
      await sendNotification({
        type: 'error',
        agentId: input.agentId,
        taskId: input.taskId,
        title: input.title,
        priority: input.priority,
        reason: result.reason,
      });
      return { status: 'error', agentId: input.agentId, taskId: input.taskId, error: result.reason };
    }

    await sleep('10s');
  }

  await updateDashboard(input.agentId, 'offline', input.taskId, 'cancelled');
  return { status: 'cancelled', agentId: input.agentId, taskId: input.taskId };
}
