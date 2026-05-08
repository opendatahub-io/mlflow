import { testData } from '../fixtures/testData';

export const BASE_URL = process.env.MLFLOW_E2E_BASE_URL || 'http://localhost:5000';

export const E2E_WORKSPACE = testData.workspace;

const WORKSPACE_HEADER = 'X-MLFLOW-WORKSPACE';

async function apiRequest(method: string, path: string, body: Record<string, unknown> = {}, apiVersion = '2.0') {
  const res = await fetch(`${BASE_URL}/api/${apiVersion}/mlflow/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      [WORKSPACE_HEADER]: E2E_WORKSPACE,
    },
    ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function apiPost(path: string, body: Record<string, unknown> = {}) {
  return apiRequest('POST', path, body);
}

function apiPatch(path: string, body: Record<string, unknown> = {}) {
  return apiRequest('PATCH', path, body);
}

function apiDelete(path: string, body: Record<string, unknown> = {}) {
  return apiRequest('DELETE', path, body);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// Workspaces
export async function createWorkspace(name: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/3.0/mlflow/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok && res.status !== 409 && res.status !== 400) {
    const text = await res.text();
    throw new Error(`POST workspaces failed (${res.status}): ${text}`);
  }
}

export async function deleteWorkspace(name: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/3.0/mlflow/workspaces/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`DELETE workspace ${name} failed (${res.status}): ${text}`);
  }
}

// Experiments
export async function createExperiment(name: string): Promise<string> {
  const data = await apiPost('experiments/create', { name });
  return data.experiment_id;
}

export async function deleteExperiment(experimentId: string): Promise<void> {
  await apiPost('experiments/delete', { experiment_id: experimentId });
}

export async function searchExperiments(): Promise<{ experiment_id: string; name: string }[]> {
  const data = await apiRequest('GET', 'experiments/search');
  return (data.experiments || []).map((e: { experiment_id: string; name: string }) => ({
    experiment_id: e.experiment_id,
    name: e.name,
  }));
}

export async function setExperimentTag(experimentId: string, key: string, value: string): Promise<void> {
  await apiPost('experiments/set-experiment-tag', { experiment_id: experimentId, key, value });
}

// Runs
export async function createRun(experimentId: string, runName?: string): Promise<string> {
  const data = await apiPost('runs/create', {
    experiment_id: experimentId,
    start_time: Date.now(),
    run_name: runName,
  });
  return data.run.info.run_id;
}

export async function updateRun(runId: string, status: string): Promise<void> {
  await apiPost('runs/update', { run_id: runId, status, end_time: Date.now() });
}

export async function logMetric(runId: string, key: string, value: number): Promise<void> {
  await apiPost('runs/log-metric', { run_id: runId, key, value, timestamp: Date.now() });
}

async function logParam(runId: string, key: string, value: string): Promise<void> {
  await apiPost('runs/log-parameter', { run_id: runId, key, value });
}

export async function createLoggedModel(experimentId: string, name: string, sourceRunId?: string): Promise<string> {
  const data = await apiPost('logged-models', {
    experiment_id: experimentId,
    name,
    source_run_id: sourceRunId,
  });
  return data.model.info.model_id;
}

export async function seedRun(
  experimentId: string,
  runName: string,
  metrics: Record<string, number>,
  params: Record<string, string>,
): Promise<string> {
  const runId = await createRun(experimentId, runName);
  for (const [key, value] of Object.entries(metrics)) {
    await logMetric(runId, key, value);
  }
  for (const [key, value] of Object.entries(params)) {
    await logParam(runId, key, value);
  }
  await updateRun(runId, 'FINISHED');
  return runId;
}

// Model Registry
export async function deleteRegisteredModel(name: string): Promise<void> {
  await apiDelete('registered-models/delete', { name });
}

// Traces
async function startTrace(
  experimentId: string,
  timestampMs: number,
  input = 'test prompt',
  tags?: { key: string; value: string }[],
): Promise<string> {
  const defaultTags = [{ key: 'mlflow.traceName', value: 'e2e-trace' }];
  const data = await apiPost('traces', {
    experiment_id: experimentId,
    timestamp_ms: timestampMs,
    request_metadata: [{ key: 'mlflow.traceInputs', value: JSON.stringify({ input }) }],
    tags: [...defaultTags, ...(tags ?? [])],
  });
  return data.trace_info?.request_id ?? data.request_id;
}

async function endTrace(requestId: string, timestampMs: number, output = 'test response'): Promise<void> {
  await apiPatch(`traces/${requestId}`, {
    timestamp_ms: timestampMs,
    status: 'OK',
    request_metadata: [{ key: 'mlflow.traceOutputs', value: JSON.stringify({ output }) }],
  });
}

export async function seedTrace(
  experimentId: string,
  input: string,
  output: string,
  tags?: { key: string; value: string }[],
): Promise<string> {
  const now = Date.now();
  const requestId = await startTrace(experimentId, now, input, tags);
  await endTrace(requestId, now + 500, output);
  return requestId;
}

export async function deleteTraces(experimentId: string, requestIds: string[]): Promise<void> {
  await apiPost('traces/delete-traces', { experiment_id: experimentId, request_ids: requestIds });
}

export async function setTraceTag(requestId: string, key: string, value: string): Promise<void> {
  await apiPatch(`traces/${requestId}/tags`, { key, value });
}

export async function createAssessment(
  traceId: string,
  name: string,
  value: boolean | string | number,
  sourceId = 'e2e-test',
): Promise<void> {
  await apiRequest(
    'POST',
    `traces/${traceId}/assessments`,
    {
      assessment: {
        assessment_name: name,
        source: { source_type: 'HUMAN', source_id: sourceId },
        feedback: { value },
      },
    },
    '3.0',
  );
}

export async function registerScorer(experimentId: string, name: string, serializedScorer: string): Promise<void> {
  await apiRequest(
    'POST',
    'scorers/register',
    {
      experiment_id: experimentId,
      name,
      serialized_scorer: serializedScorer,
    },
    '3.0',
  );
}
