import { LinearClient } from '@linear/sdk';

let linearClient: LinearClient | null = null;

export function getLinearClient(): LinearClient {
  if (!linearClient) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY environment variable is required');
    }
    linearClient = new LinearClient({ apiKey });
  }
  return linearClient;
}
