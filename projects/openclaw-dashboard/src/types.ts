export type NodeStatus = 'disconnected' | 'connecting' | 'connected' | 'degraded';
export type AgentStatus = 'idle' | 'busy' | 'offline' | 'unknown';

export interface ManagedNode {
  id: string;
  name: string;
  url: string;
  token?: string | null;
  status: NodeStatus;
  lastSeenAt?: string | null;
  reconnectAttempt: number;
}

export interface GatewaySnapshot {
  bindAddress: string | null;
  port: number | null;
  status: 'running' | 'stopped' | 'unknown';
}

export interface ResourceSnapshot {
  cpuPercent: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
}

export interface AgentSnapshot {
  nodeId: string;
  agentId: string;
  name: string;
  model: string | null;
  workspace: string | null;
  configJson: string | null;
  status: AgentStatus;
  busy: boolean;
  updatedAt: string;
}

export interface SessionSnapshot {
  nodeId: string;
  sessionId: string;
  agentId: string | null;
  status: string;
  queueDepth: number;
  updatedAt: string;
}

export interface MessageCounterSnapshot {
  nodeId: string;
  inbound: number;
  outbound: number;
  updatedAt: string;
}

export interface NodeTelemetryPayload {
  gateway: GatewaySnapshot;
  resources: ResourceSnapshot;
  agents: AgentSnapshot[];
  sessions: SessionSnapshot[];
  messages: MessageCounterSnapshot;
  collectedAt: string;
}

export interface DashboardEvent<T = unknown> {
  type: string;
  ts: string;
  payload: T;
}
