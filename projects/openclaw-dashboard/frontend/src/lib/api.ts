import type {
  AlertFilter,
  DashboardAlertsResponse,
  DashboardNodeDetail,
  DashboardOverviewResponse,
  TimelineResponse,
  TimelineWindow,
} from '../types/dashboard';

const API_BASE_URL = import.meta.env.VITE_DASHBOARD_HTTP_URL ?? 'http://127.0.0.1:3000/api';
const API_TOKEN = import.meta.env.VITE_DASHBOARD_API_TOKEN ?? 'dev-key-for-testing';

type ApiErrorPayload = {
  error?: string;
};

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      authorization: `Bearer ${API_TOKEN}`,
      'content-type': 'application/json',
    },
  });

  if (!response.ok) {
    let reason = response.statusText;
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      reason = payload.error ?? reason;
    } catch {
      // Keep response status text.
    }
    throw new ApiError(response.status, reason);
  }

  return (await response.json()) as T;
}

export async function fetchOverview(): Promise<DashboardOverviewResponse> {
  return await requestJson<DashboardOverviewResponse>('/overview');
}

export async function fetchNodeDetail(nodeId: string): Promise<DashboardNodeDetail> {
  return await requestJson<DashboardNodeDetail>(`/nodes/${encodeURIComponent(nodeId)}`);
}

export async function fetchAgentTimeline(nodeId: string, agentId: string, window: TimelineWindow): Promise<TimelineResponse> {
  return await requestJson<TimelineResponse>(
    `/nodes/${encodeURIComponent(nodeId)}/agents/${encodeURIComponent(agentId)}/timeline?window=${encodeURIComponent(window)}`,
  );
}

export async function fetchAlerts(input: {
  window?: TimelineWindow;
  severity?: AlertFilter;
  nodeId?: string;
} = {}): Promise<DashboardAlertsResponse> {
  const query = new URLSearchParams();
  query.set('window', input.window ?? '24h');
  if (input.severity && input.severity !== 'all') {
    query.set('severity', input.severity);
  }
  if (input.nodeId) {
    query.set('nodeId', input.nodeId);
  }
  return await requestJson<DashboardAlertsResponse>(`/alerts?${query.toString()}`);
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
