import { Client, Connection } from '@temporalio/client';

let clientInstance: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  });

  clientInstance = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  });

  return clientInstance;
}

export const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || 'opencode-agent-tasks';

export function getAgentTaskWorkflowId(agentId: string, taskId: string): string {
  return `agent-task-${agentId}-${taskId}`;
}
