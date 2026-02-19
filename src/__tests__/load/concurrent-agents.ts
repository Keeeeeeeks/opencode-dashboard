const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const API_KEY = process.env.DASHBOARD_API_KEY || 'test123';
const AGENT_COUNT = Number.parseInt(process.env.AGENT_COUNT || '100', 10);

interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  responseTimes: number[];
  errors: string[];
}

const metrics: Metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [],
  errors: [],
};

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] || 0;
}

async function timedRequest(url: string, init: RequestInit): Promise<Response> {
  const started = performance.now();
  metrics.totalRequests += 1;
  try {
    const response = await fetch(url, init);
    const elapsed = performance.now() - started;
    metrics.responseTimes.push(elapsed);
    if (response.ok) {
      metrics.successfulRequests += 1;
      return response;
    }

    metrics.failedRequests += 1;
    const body = await response.text();
    metrics.errors.push(`${init.method || 'GET'} ${url} -> ${response.status} ${body}`);
    return response;
  } catch (error) {
    const elapsed = performance.now() - started;
    metrics.responseTimes.push(elapsed);
    metrics.failedRequests += 1;
    metrics.errors.push(`${init.method || 'GET'} ${url} -> ${(error as Error).message}`);
    throw error;
  }
}

async function registerAgent(agentId: string): Promise<void> {
  await timedRequest(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      id: agentId,
      name: agentId,
      type: 'sub-agent',
      status: 'idle',
    }),
  });
}

async function runAgentFlow(agentId: string): Promise<void> {
  const taskId = `load-task-${agentId}`;
  await timedRequest(`${API_BASE}/api/agents/${agentId}/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      id: taskId,
      title: `Load task for ${agentId}`,
      priority: 'medium',
      status: 'pending',
    }),
  });

  await timedRequest(`${API_BASE}/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: 'working', current_task_id: taskId }),
  });

  for (let i = 0; i < 5; i += 1) {
    await timedRequest(`${API_BASE}/api/agents/${agentId}/heartbeat`, {
      method: 'POST',
      headers: authHeaders(),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await timedRequest(`${API_BASE}/api/agents/${agentId}/complete`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ taskId }),
  });
}

async function cleanupAgent(agentId: string): Promise<void> {
  await timedRequest(`${API_BASE}/api/agents/${agentId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const agentIds = Array.from({ length: AGENT_COUNT }, (_, i) => `load-agent-${i + 1}-${Date.now()}`);

  console.log(`Load test starting for ${AGENT_COUNT} agents at ${API_BASE}`);

  const registrationResults = await Promise.allSettled(agentIds.map((agentId) => registerAgent(agentId)));
  const registeredIds = agentIds.filter((_, index) => registrationResults[index]?.status === 'fulfilled');

  const flowResults = await Promise.allSettled(registeredIds.map((agentId) => runAgentFlow(agentId)));
  const cleanupResults = await Promise.allSettled(registeredIds.map((agentId) => cleanupAgent(agentId)));

  const durationSeconds = (performance.now() - startedAt) / 1000;
  const successRate = metrics.totalRequests === 0 ? 0 : (metrics.successfulRequests / metrics.totalRequests) * 100;
  const errorRate = metrics.totalRequests === 0 ? 0 : (metrics.failedRequests / metrics.totalRequests) * 100;

  console.log('--- Load Test Summary ---');
  console.log(`Registered agents: ${registeredIds.length}/${AGENT_COUNT}`);
  console.log(`Agent flows fulfilled: ${flowResults.filter((r) => r.status === 'fulfilled').length}/${registeredIds.length}`);
  console.log(`Cleanup fulfilled: ${cleanupResults.filter((r) => r.status === 'fulfilled').length}/${registeredIds.length}`);
  console.log(`Duration: ${durationSeconds.toFixed(2)}s`);
  console.log(`Total requests: ${metrics.totalRequests}`);
  console.log(`Requests/sec: ${(metrics.totalRequests / Math.max(durationSeconds, 0.001)).toFixed(2)}`);
  console.log(`Success rate: ${successRate.toFixed(2)}%`);
  console.log(`Error rate: ${errorRate.toFixed(2)}%`);
  console.log(`Avg latency: ${(metrics.responseTimes.reduce((acc, val) => acc + val, 0) / Math.max(metrics.responseTimes.length, 1)).toFixed(2)}ms`);
  console.log(`p50 latency: ${percentile(metrics.responseTimes, 50).toFixed(2)}ms`);
  console.log(`p95 latency: ${percentile(metrics.responseTimes, 95).toFixed(2)}ms`);
  console.log(`p99 latency: ${percentile(metrics.responseTimes, 99).toFixed(2)}ms`);

  if (metrics.errors.length > 0) {
    console.log('--- Errors (up to 20) ---');
    for (const error of metrics.errors.slice(0, 20)) {
      console.log(error);
    }
  }

  process.exit(metrics.failedRequests > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Load test failed to run:', error);
  process.exit(1);
});
