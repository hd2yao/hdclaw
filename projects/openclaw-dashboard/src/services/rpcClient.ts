import WebSocket from 'ws';
import { nowIso } from '../utils/time.js';
import type {
  AgentSnapshot,
  GatewaySnapshot,
  MessageCounterSnapshot,
  NodeTelemetryPayload,
  SessionSnapshot,
} from '../types.js';

const CONTROL_UI_CLIENT_ID = 'openclaw-control-ui';
const CONTROL_UI_MODE = 'webchat';
const CONTROL_UI_SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing'] as const;

interface GatewayResponseError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface GatewayReqMessage {
  type: 'req';
  id: string;
  method: string;
  params: unknown;
}

interface GatewayResMessage {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: GatewayResponseError;
}

interface GatewayEventMessage {
  type: 'event';
  event: string;
  payload?: unknown;
}

interface StatusAgentEntry {
  agentId?: string;
  name?: string;
  sessions?: {
    path?: string;
  };
}

interface SessionOrigin {
  label?: string;
}

interface SessionLike {
  key?: string;
  sessionId?: string;
  updatedAt?: number | string;
  kind?: string;
  displayName?: string;
  origin?: SessionOrigin;
  model?: string;
  abortedLastRun?: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

interface StatusAgentSessionsEntry {
  agentId?: string;
  path?: string;
  recent?: SessionLike[];
}

interface StatusResponse {
  health?: {
    ok?: boolean;
    agents?: StatusAgentEntry[];
  };
  sessions?: {
    byAgent?: Record<string, StatusAgentSessionsEntry> | StatusAgentSessionsEntry[];
  };
}

interface AgentsListResponse {
  agents?: Array<{
    id?: string;
    name?: string;
  }>;
}

interface SessionsListResponse {
  sessions?: SessionLike[];
}

function toHttpOrigin(url: string): string {
  const parsed = new URL(url);
  const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return `${protocol}//${parsed.host}`;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    const parsed = new Date(value).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asIsoDate(value: unknown, fallback: string): string {
  const timestamp = asTimestamp(value);
  if (timestamp !== null) {
    return new Date(timestamp).toISOString();
  }

  return fallback;
}

function extractAgentId(sessionKey: unknown): string | null {
  if (typeof sessionKey !== 'string') return null;
  const parts = sessionKey.split(':');
  if (parts.length >= 2 && parts[0] === 'agent') {
    return parts[1] || null;
  }
  return null;
}

function pickSessionSummary(session: SessionLike): string | null {
  if (typeof session.displayName === 'string' && session.displayName.trim()) {
    return session.displayName;
  }
  if (typeof session.origin?.label === 'string' && session.origin.label.trim()) {
    return session.origin.label;
  }
  if (typeof session.key === 'string' && session.key.trim()) {
    return session.key;
  }
  if (typeof session.sessionId === 'string' && session.sessionId.trim()) {
    return session.sessionId;
  }
  return null;
}

function isRecentlyActive(updatedAt: unknown, collectedAt: string): boolean {
  const updatedAtMs = asTimestamp(updatedAt);
  const collectedAtMs = asTimestamp(collectedAt);
  if (updatedAtMs === null || collectedAtMs === null) {
    return false;
  }
  return collectedAtMs - updatedAtMs <= 2 * 60_000;
}

function toByAgentEntries(status: StatusResponse): StatusAgentSessionsEntry[] {
  const byAgent = status.sessions?.byAgent;
  if (!byAgent) return [];
  if (Array.isArray(byAgent)) return byAgent;
  return Object.values(byAgent);
}

function pickLatestSession(sessions: SessionLike[]): SessionLike | null {
  let latest: SessionLike | null = null;
  let latestTs = Number.NEGATIVE_INFINITY;
  for (const session of sessions) {
    const ts = asTimestamp(session.updatedAt);
    if (ts === null) continue;
    if (ts > latestTs) {
      latestTs = ts;
      latest = session;
    }
  }
  return latest;
}

function buildStatusAgentLookup(status: StatusResponse): Map<string, { workspace: string | null; latestSession: SessionLike | null }> {
  const lookup = new Map<string, { workspace: string | null; latestSession: SessionLike | null }>();

  for (const entry of status.health?.agents ?? []) {
    if (typeof entry.agentId !== 'string' || !entry.agentId) continue;
    lookup.set(entry.agentId, {
      workspace: entry.sessions?.path ?? null,
      latestSession: null,
    });
  }

  for (const byAgentEntry of toByAgentEntries(status)) {
    if (typeof byAgentEntry.agentId !== 'string' || !byAgentEntry.agentId) continue;
    const previous = lookup.get(byAgentEntry.agentId);
    lookup.set(byAgentEntry.agentId, {
      workspace: byAgentEntry.path ?? previous?.workspace ?? null,
      latestSession: pickLatestSession(byAgentEntry.recent ?? []) ?? previous?.latestSession ?? null,
    });
  }

  return lookup;
}

function buildLatestSessionByAgent(sessionsResult: SessionsListResponse): Map<string, SessionLike> {
  const sessionsByAgent = new Map<string, SessionLike>();
  for (const session of sessionsResult.sessions ?? []) {
    const agentId = extractAgentId(session.key);
    if (!agentId) continue;
    const previous = sessionsByAgent.get(agentId);
    const currentTs = asTimestamp(session.updatedAt) ?? Number.NEGATIVE_INFINITY;
    const previousTs = asTimestamp(previous?.updatedAt) ?? Number.NEGATIVE_INFINITY;
    if (!previous || currentTs >= previousTs) {
      sessionsByAgent.set(agentId, session);
    }
  }
  return sessionsByAgent;
}

function inferGatewayStatus(status: StatusResponse): GatewaySnapshot['status'] {
  if (status.health?.ok === false) {
    return 'stopped';
  }
  if (status.health?.ok === true || status.sessions) {
    return 'running';
  }
  return 'unknown';
}

function buildGatewaySnapshot(url: string, status: StatusResponse): GatewaySnapshot {
  const parsed = new URL(url);
  return {
    bindAddress: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === 'wss:' ? 443 : 80,
    status: inferGatewayStatus(status),
  };
}

function buildAgents(
  statusResult: StatusResponse,
  agentsResult: AgentsListResponse,
  sessionsResult: SessionsListResponse,
  collectedAt: string,
): AgentSnapshot[] {
  const statusLookup = buildStatusAgentLookup(statusResult);
  const latestSessionByAgent = buildLatestSessionByAgent(sessionsResult);

  return (agentsResult.agents ?? [])
    .filter((entry): entry is { id: string; name?: string } => typeof entry.id === 'string' && entry.id.length > 0)
    .map((entry) => {
      const statusInfo = statusLookup.get(entry.id);
      const latestSession = latestSessionByAgent.get(entry.id) ?? statusInfo?.latestSession ?? null;
      const active = latestSession ? isRecentlyActive(latestSession.updatedAt, collectedAt) : false;
      const hasError = latestSession?.abortedLastRun === true;
      const status: AgentSnapshot['status'] = hasError ? 'unknown' : active ? 'busy' : 'idle';
      const lastProgressAt = latestSession ? asIsoDate(latestSession.updatedAt, collectedAt) : null;

      return {
        nodeId: '',
        agentId: entry.id,
        name: entry.name ?? entry.id,
        model: typeof latestSession?.model === 'string' ? latestSession.model : null,
        workspace: statusInfo?.workspace ?? null,
        configJson: null,
        status,
        busy: status === 'busy',
        taskSummary: latestSession ? pickSessionSummary(latestSession) : null,
        taskPhase: typeof latestSession?.kind === 'string' ? latestSession.kind : null,
        taskStartedAt: null,
        lastProgressAt,
        staleReason: hasError ? 'last run aborted' : null,
        updatedAt: lastProgressAt ?? collectedAt,
      };
    });
}

function buildSessions(sessionsResult: SessionsListResponse, collectedAt: string): SessionSnapshot[] {
  return (sessionsResult.sessions ?? []).map((session) => {
    const updatedAt = asIsoDate(session.updatedAt, collectedAt);
    const running = isRecentlyActive(session.updatedAt, collectedAt);
    return {
      nodeId: '',
      sessionId: session.sessionId ?? session.key ?? collectedAt,
      agentId: extractAgentId(session.key),
      status: session.abortedLastRun ? 'error' : running ? 'running' : 'idle',
      taskSummary: pickSessionSummary(session),
      taskPhase: typeof session.kind === 'string' ? session.kind : null,
      taskStartedAt: null,
      lastProgressAt: updatedAt,
      queueDepth: 0,
      updatedAt,
    };
  });
}

function buildMessageCounters(sessionsResult: SessionsListResponse, collectedAt: string): MessageCounterSnapshot {
  let inbound = 0;
  let outbound = 0;
  let latestUpdatedAt: unknown = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const session of sessionsResult.sessions ?? []) {
    if (typeof session.inputTokens === 'number' && Number.isFinite(session.inputTokens)) {
      inbound += session.inputTokens;
    }
    if (typeof session.outputTokens === 'number' && Number.isFinite(session.outputTokens)) {
      outbound += session.outputTokens;
    }
    const updatedAtMs = asTimestamp(session.updatedAt);
    if (updatedAtMs !== null && updatedAtMs >= latestTimestamp) {
      latestTimestamp = updatedAtMs;
      latestUpdatedAt = session.updatedAt;
    }
  }

  return {
    nodeId: '',
    inbound,
    outbound,
    updatedAt: asIsoDate(latestUpdatedAt, collectedAt),
  };
}

export interface NormalizeGatewaySnapshotInput {
  url: string;
  collectedAt: string;
  statusResult: StatusResponse;
  agentsResult: AgentsListResponse;
  sessionsResult: SessionsListResponse;
}

export function normalizeGatewaySnapshot(input: NormalizeGatewaySnapshotInput): NodeTelemetryPayload {
  return {
    gateway: buildGatewaySnapshot(input.url, input.statusResult),
    resources: {
      cpuPercent: null,
      memoryUsedMb: null,
      memoryTotalMb: null,
    },
    agents: buildAgents(input.statusResult, input.agentsResult, input.sessionsResult, input.collectedAt),
    sessions: buildSessions(input.sessionsResult, input.collectedAt),
    messages: buildMessageCounters(input.sessionsResult, input.collectedAt),
    collectedAt: input.collectedAt,
  };
}

class GatewayRpcConnection {
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  private nextId = 1;

  constructor(private readonly ws: WebSocket) {
    this.ws.on('message', (buffer) => {
      const raw = String(buffer);
      let parsed: GatewayResMessage | GatewayEventMessage;
      try {
        parsed = JSON.parse(raw) as GatewayResMessage | GatewayEventMessage;
      } catch {
        return;
      }

      if (parsed.type !== 'res') return;
      const pending = this.pending.get(parsed.id);
      if (!pending) return;
      this.pending.delete(parsed.id);

      if (parsed.ok) {
        pending.resolve(parsed.payload);
        return;
      }

      pending.reject(new Error(parsed.error?.message ?? 'gateway request failed'));
    });
  }

  request<T>(method: string, params: unknown): Promise<T> {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('gateway not connected'));
    }

    const id = String(this.nextId++);
    const message: GatewayReqMessage = { type: 'req', id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`gateway request timeout: ${method}`));
      }, 5000);

      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      this.ws.send(JSON.stringify(message), (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      });

      const current = this.pending.get(id);
      if (!current) return;
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        },
      });
    });
  }

  close(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error('gateway connection closed'));
    }
    this.pending.clear();
    this.ws.close();
  }
}

export class OpenClawRpcClient {
  constructor(private readonly url: string, private readonly token?: string | null) {}

  async collectSnapshot(): Promise<NodeTelemetryPayload> {
    const collectedAt = nowIso();
    const connection = await this.connect();

    try {
      const [statusResult, agentsResult, sessionsResult] = await Promise.all([
        connection.request<StatusResponse>('status', {}),
        connection.request<AgentsListResponse>('agents.list', {}),
        connection.request<SessionsListResponse>('sessions.list', {}),
      ]);

      return normalizeGatewaySnapshot({
        url: this.url,
        collectedAt,
        statusResult,
        agentsResult,
        sessionsResult,
      });
    } finally {
      connection.close();
    }
  }

  private async connect(): Promise<GatewayRpcConnection> {
    if (!this.token) {
      throw new Error('missing node token');
    }

    return await new Promise<GatewayRpcConnection>((resolve, reject) => {
      const ws = new WebSocket(this.url, {
        headers: {
          Origin: toHttpOrigin(this.url),
        },
      });

      const connection = new GatewayRpcConnection(ws);
      let settled = false;

      const onError = (error: Error) => fail(error instanceof Error ? error : new Error(String(error)));
      const onClose = (code: number, reason: Buffer) => {
        fail(new Error(`gateway closed (${code}): ${String(reason)}`));
      };
      const onHandshakeMessage = async (buffer: WebSocket.RawData) => {
        let parsed: GatewayResMessage | GatewayEventMessage;
        try {
          parsed = JSON.parse(String(buffer)) as GatewayResMessage | GatewayEventMessage;
        } catch {
          return;
        }

        if (parsed.type !== 'event' || parsed.event !== 'connect.challenge') {
          return;
        }

        try {
          await connection.request('connect', {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: CONTROL_UI_CLIENT_ID,
              version: 'control-ui',
              platform: 'node',
              mode: CONTROL_UI_MODE,
            },
            role: 'operator',
            scopes: [...CONTROL_UI_SCOPES],
            caps: ['tool-events'],
            auth: { token: this.token },
            userAgent: 'openclaw-dashboard',
            locale: 'en-US',
          });
          if (settled) return;
          settled = true;
          cleanup();
          resolve(connection);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const cleanup = () => {
        ws.off('message', onHandshakeMessage);
        ws.off('error', onError);
        ws.off('close', onClose);
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          connection.close();
        } catch {
          // Ignore close failures during setup.
        }
        reject(error);
      };

      ws.on('message', onHandshakeMessage);
      ws.on('error', onError);
      ws.on('close', onClose);
    });
  }
}
