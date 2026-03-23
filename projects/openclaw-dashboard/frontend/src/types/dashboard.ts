export type NodeHealth = 'online' | 'degraded' | 'offline';
export type GatewayStatus = 'running' | 'stopped' | 'unknown';
export type TimelineWindow = '1h' | '24h';
export type WsState = 'connecting' | 'open' | 'closed';
export type AlertSeverity = 'critical' | 'warning' | 'recovered';
export type AlertFilter = 'all' | AlertSeverity;

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

export interface DashboardGatewayState {
  bindAddress: string | null;
  port: number | null;
  status: GatewayStatus;
  collectedAt: string;
}

export interface DashboardNodeResources {
  cpuPercent: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  collectedAt: string;
}

export interface DashboardMessageCounters {
  nodeId: string;
  inbound: number;
  outbound: number;
  updatedAt: string;
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

export interface DashboardNodeState {
  id: string;
  name: string;
  url: string;
  status: NodeHealth;
  lastSeenAt: string | null;
  gateway: DashboardGatewayState | null;
  resources: DashboardNodeResources | null;
  messages: DashboardMessageCounters | null;
}

export interface DashboardOverviewNode extends DashboardNodeState {
  agents: DashboardAgentSummary[];
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

export interface TimelineResponse {
  items: AgentTimelineEvent[];
}

export interface NodeDeltaFramePayload {
  nodeId: string;
  node: DashboardNodeState;
  reason?: string | null;
}

export interface AgentDeltaFramePayload {
  nodeId: string;
  agentId: string;
  agent: DashboardAgentSummary;
}

export interface SessionEventFramePayload {
  nodeId: string;
  agentId: string;
  eventType: string;
  summary: string;
  status: string | null;
  createdAt: string;
}

export type DashboardWsFrame =
  | { type: 'dashboard.snapshot'; ts: string; payload: DashboardOverviewResponse }
  | { type: 'node.delta'; ts: string; payload: NodeDeltaFramePayload }
  | { type: 'agent.delta'; ts: string; payload: AgentDeltaFramePayload }
  | { type: 'session.event'; ts: string; payload: SessionEventFramePayload };

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  nodeId: string;
  nodeName: string;
  agentId: string | null;
  summary: string;
  detail: string | null;
  createdAt: string;
  recovered: boolean;
}

export interface DashboardAlertsResponse {
  generatedAt: string;
  items: DashboardAlert[];
}
