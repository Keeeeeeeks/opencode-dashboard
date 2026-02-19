export interface AgentTaskWorkflowInput {
  agentId: string;
  agentName: string;
  agentType?: 'primary' | 'sub-agent';
  parentAgentId?: string;
  taskId: string;
  title: string;
  priority?: 'high' | 'medium' | 'low';
  linearIssueId?: string;
  projectId?: string;
  soulMd?: string;
  skills?: string[];
  config?: Record<string, unknown>;
}

export interface AgentTaskWorkflowResult {
  status: 'completed' | 'error' | 'cancelled';
  agentId: string;
  taskId: string;
  error?: string;
}

export interface MonitorResult {
  status: 'working' | 'completed' | 'blocked' | 'error';
  reason?: string;
}

export interface NotificationPayload {
  type: 'blocked' | 'completed' | 'error' | 'stale_task' | 'idle_too_long';
  agentId: string;
  taskId: string;
  title: string;
  priority?: 'high' | 'medium' | 'low';
  reason?: string;
  projectId?: string;
}
