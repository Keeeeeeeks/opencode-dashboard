import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'opencode-agent-tasks',
    workflowsPath: require.resolve('./workflows'),
    activities,
  });

  console.log('Temporal worker started');
  await worker.run();
}

run().catch((err) => {
  console.error('Temporal worker failed:', err);
  process.exit(1);
});
