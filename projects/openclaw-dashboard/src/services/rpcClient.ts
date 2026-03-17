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

interface StatusResponse {
  health?: {
    ok?: boolean;
    agents?: StatusAgentEntry[];
  };
}

interface AgentsListResponse {
  agents?: Array<{
    id?: string;
    name?: string;
  }>;
}

interface SessionsListResponse {
  sessions?: Array<{
    key?: string;
    sessionId?: string;
    updatedAt?: number | string;
    kind?: string;
    abortedLastRun?: boolean;
  }>;
}

function toHttpOrigin(url: string): string {
  const parsed = new URL(url);
  const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return `${protocol}//${parsed.host}`;
}

function asIsoDate(value: unknown, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric).toISOString();
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
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

      return {
        gateway: this.buildGatewaySnapshot(statusResult),
        resources: {
          cpuPercent: null,
          memoryUsedMb: null,
          memoryTotalMb: null,
        },
        agents: this.buildAgents(statusResult, agentsResult, collectedAt),
        sessions: this.buildSessions(sessionsResult, collectedAt),
        messages: this.buildMessageCounters(collectedAt),
        collectedAt,
      };
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

  private buildGatewaySnapshot(status: StatusResponse): GatewaySnapshot {
    const parsed = new URL(this.url);
    return {
      bindAddress: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : parsed.protocol === 'wss:' ? 443 : 80,
      status: status.health?.ok ? 'running' : 'unknown',
    };
  }

  private buildAgents(status: StatusResponse, agentsResult: AgentsListResponse, collectedAt: string): AgentSnapshot[] {
    const statusAgents = new Map<string, StatusAgentEntry>();
    for (const entry of status.health?.agents ?? []) {
      if (typeof entry.agentId === 'string' && entry.agentId) {
        statusAgents.set(entry.agentId, entry);
      }
    }

    return (agentsResult.agents ?? [])
      .filter((entry): entry is { id: string; name?: string } => typeof entry.id === 'string' && entry.id.length > 0)
      .map((entry) => {
        const statusEntry = statusAgents.get(entry.id);
        return {
          nodeId: '',
          agentId: entry.id,
          name: entry.name ?? statusEntry?.name ?? entry.id,
          model: null,
          workspace: statusEntry?.sessions?.path ?? null,
          configJson: null,
          status: 'idle',
          busy: false,
          updatedAt: collectedAt,
        };
      });
  }

  private buildSessions(sessionsResult: SessionsListResponse, collectedAt: string): SessionSnapshot[] {
    return (sessionsResult.sessions ?? []).map((session) => ({
      nodeId: '',
      sessionId: session.sessionId ?? session.key ?? collectedAt,
      agentId: extractAgentId(session.key),
      status: session.abortedLastRun ? 'error' : session.kind ?? 'running',
      queueDepth: 0,
      updatedAt: asIsoDate(session.updatedAt, collectedAt),
    }));
  }

  private buildMessageCounters(collectedAt: string): MessageCounterSnapshot {
    return {
      nodeId: '',
      inbound: 0,
      outbound: 0,
      updatedAt: collectedAt,
    };
  }
}
