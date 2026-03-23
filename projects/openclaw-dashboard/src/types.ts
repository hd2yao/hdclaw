export type NodeStatus = 'disconnected' | 'connecting' | 'connected' | 'degraded';
export type AgentStatus = 'idle' | 'busy' | 'offline' | 'unknown';
export type TimelineWindow = '1h' | '24h';
export type DashboardNodeHealth = 'online' | 'degraded' | 'offline';

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
  taskSummary: string | null;
  taskPhase: string | null;
  taskStartedAt: string | null;
  lastProgressAt: string | null;
  staleReason: string | null;
  updatedAt: string;
}

export interface SessionSnapshot {
  nodeId: string;
  sessionId: string;
  agentId: string | null;
  status: string;
  taskSummary: string | null;
  taskPhase: string | null;
  taskStartedAt: string | null;
  lastProgressAt: string | null;
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

export interface TelemetrySnapshotReadyPayload {
  nodeId: string;
  collectedAt: string;
}

export interface NodeStateChangedPayload {
  nodeId: string;
  from: NodeStatus;
  to: NodeStatus;
  reason?: string;
}

export interface AgentStateChangedPayload {
  nodeId: string;
  agentId: string;
  previousStatus: AgentStatus;
  currentStatus: AgentStatus;
  previousTaskPhase: string | null;
  currentTaskPhase: string | null;
  currentTaskSummary: string | null;
  lastProgressAt: string | null;
}

export interface TimelineEventCreatedPayload {
  nodeId: string;
  agentId: string;
  eventType: string;
  summary: string;
  status: string | null;
  createdAt: string;
}

export type DashboardInternalEvent =
  | { type: 'telemetry.snapshot.ready'; ts: string; payload: TelemetrySnapshotReadyPayload }
  | { type: 'node.state.changed'; ts: string; payload: NodeStateChangedPayload }
  | { type: 'agent.state.changed'; ts: string; payload: AgentStateChangedPayload }
  | { type: 'timeline.event.created'; ts: string; payload: TimelineEventCreatedPayload };

export interface AgentTimelineEvent {
  id?: number;
  nodeId: string;
  agentId: string;
  sessionId: string | null;
  eventType: string;
  summary: string;
  detail: string | null;
  status: string | null;
  createdAt: string;
}

export interface DashboardAgentSummary {
  id: string;
  name: string;
  model: string | null;
  workspace: string | null;
  status: string;
  busy: boolean;
  taskSummary: string | null;
  taskPhase: string | null;
  taskStartedAt: string | null;
  lastProgressAt: string | null;
  staleReason: string | null;
  updatedAt: string;
}

export interface DashboardNodeResources extends ResourceSnapshot {
  collectedAt: string;
}

export interface DashboardGatewayState extends GatewaySnapshot {
  collectedAt: string;
}

export interface DashboardNodeState {
  id: string;
  name: string;
  url: string;
  status: DashboardNodeHealth;
  lastSeenAt: string | null;
  gateway: DashboardGatewayState | null;
  resources: DashboardNodeResources | null;
  messages: MessageCounterSnapshot | null;
}

export interface DashboardOverviewNode extends DashboardNodeState {
  agents: DashboardAgentSummary[];
}

export interface DashboardSummary {
  nodeCount: number;
  onlineNodes: number;
  degradedNodes: number;
  offlineNodes: number;
  busyAgents: number;
  idleAgents: number;
  staleAgents: number;
  outputsLastHour: number;
}

export interface DashboardOverviewResponse {
  generatedAt: string;
  summary: DashboardSummary;
  nodes: DashboardOverviewNode[];
}

export interface DashboardNodeDetail extends DashboardNodeState {
  agents: DashboardAgentSummary[];
  resourceHistory: DashboardNodeResources[];
}
