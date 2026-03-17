export type HealthState = 'online' | 'degraded' | 'offline';
export type SessionState = 'running' | 'completed' | 'error' | 'queued';

export interface ResourcePoint {
  timestamp: string;
  cpu: number;
  memory: number;
}

export interface MessageStats {
  sent: number;
  received: number;
  errors: number;
}

export interface AgentSummary {
  id: string;
  name: string;
  role: string;
  sessionId: string;
  status: SessionState;
  cpu: number;
  memory: number;
  messages: MessageStats;
  updatedAt: string;
}

export interface SessionEvent {
  id: string;
  timestamp: string;
  type: 'status' | 'message' | 'system';
  summary: string;
  detail: string;
  status: SessionState;
}

export interface NodeSummary {
  id: string;
  name: string;
  region: string;
  endpoint: string;
  status: HealthState;
  agentsOnline: number;
  totalAgents: number;
  cpu: number;
  memory: number;
  messages: MessageStats;
  lastHeartbeat: string;
  resourceHistory: ResourcePoint[];
  agents: AgentSummary[];
}

export interface DashboardSnapshot {
  generatedAt: string;
  nodes: NodeSummary[];
}

export interface DashboardState extends DashboardSnapshot {
  selectedNodeId: string | null;
  selectedAgentId: string | null;
  wsState: 'connecting' | 'open' | 'closed';
}
