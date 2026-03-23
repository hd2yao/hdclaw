import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAgentTimeline, fetchNodeDetail, fetchOverview, isNotFoundError } from '../lib/api';
import type {
  AgentDeltaFramePayload,
  AgentTimelineEvent,
  DashboardAlert,
  DashboardAgentSummary,
  DashboardNodeDetail,
  DashboardOverviewNode,
  DashboardOverviewResponse,
  DashboardWsFrame,
  NodeDeltaFramePayload,
  SessionEventFramePayload,
  TimelineWindow,
  WsState,
} from '../types/dashboard';

const WS_URL = import.meta.env.VITE_DASHBOARD_WS_URL ?? 'ws://127.0.0.1:3000/ws';
const FIRST_LOAD_TIMEOUT_MS = 5000;
const RECONNECT_DELAY_MS = 3000;
const STALE_AFTER_MS = 10000;

interface SelectionState {
  nodeId: string | null;
  agentId: string | null;
}

function normalizeSelection(overview: DashboardOverviewResponse, selection: SelectionState): SelectionState {
  const fallbackNodeId = overview.nodes[0]?.id ?? null;
  const nodeId = selection.nodeId && overview.nodes.some((node) => node.id === selection.nodeId)
    ? selection.nodeId
    : fallbackNodeId;
  if (!nodeId) return { nodeId: null, agentId: null };

  const selectedNode = overview.nodes.find((node) => node.id === nodeId) ?? null;
  const fallbackAgentId = selectedNode?.agents[0]?.id ?? null;
  const agentId = selection.agentId && selectedNode?.agents.some((agent) => agent.id === selection.agentId)
    ? selection.agentId
    : fallbackAgentId;

  return { nodeId, agentId };
}

function mergeUniqueAlerts(next: DashboardAlert[], previous: DashboardAlert[]): DashboardAlert[] {
  const seen = new Set<string>();
  const merged: DashboardAlert[] = [];
  for (const alert of [...next, ...previous]) {
    if (seen.has(alert.id)) continue;
    seen.add(alert.id);
    merged.push(alert);
  }
  return merged.slice(0, 120);
}

function deriveSeverityFromNodeStatus(status: DashboardOverviewNode['status']) {
  if (status === 'offline') return 'critical';
  if (status === 'degraded') return 'warning';
  return 'recovered';
}

function deriveSeverityFromSession(event: SessionEventFramePayload): DashboardAlert['severity'] {
  if (event.status === 'error') return 'critical';
  if (event.status === 'idle' || event.status === 'completed') return 'recovered';
  return 'warning';
}

function buildNodeStatusAlerts(overview: DashboardOverviewResponse): DashboardAlert[] {
  return overview.nodes
    .filter((node) => node.status !== 'online')
    .map((node) => ({
      id: `node-${node.id}-${overview.generatedAt}`,
      severity: deriveSeverityFromNodeStatus(node.status),
      nodeId: node.id,
      nodeName: node.name,
      agentId: null,
      summary: `${node.name} is ${node.status}`,
      detail: node.lastSeenAt ? `Last heartbeat ${node.lastSeenAt}` : 'No recent heartbeat',
      createdAt: overview.generatedAt,
      recovered: false,
    }));
}

function parseFrame(data: unknown): DashboardWsFrame | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as { type?: string; ts?: string; payload?: unknown };
    if (
      parsed.type !== 'dashboard.snapshot' &&
      parsed.type !== 'node.delta' &&
      parsed.type !== 'agent.delta' &&
      parsed.type !== 'session.event'
    ) {
      return null;
    }
    if (typeof parsed.ts !== 'string') return null;
    return parsed as DashboardWsFrame;
  } catch {
    return null;
  }
}

function mergeNodeDelta(overview: DashboardOverviewResponse, delta: NodeDeltaFramePayload, ts: string): DashboardOverviewResponse {
  const nodes = overview.nodes.map((node) => (node.id === delta.nodeId ? { ...node, ...delta.node } : node));
  return {
    ...overview,
    generatedAt: ts,
    summary: {
      ...overview.summary,
      onlineNodes: nodes.filter((node) => node.status === 'online').length,
      degradedNodes: nodes.filter((node) => node.status === 'degraded').length,
      offlineNodes: nodes.filter((node) => node.status === 'offline').length,
    },
    nodes,
  };
}

function mergeAgentDelta(overview: DashboardOverviewResponse, delta: AgentDeltaFramePayload, ts: string): DashboardOverviewResponse {
  const nodes = overview.nodes.map((node) => {
    if (node.id !== delta.nodeId) return node;
    const hasAgent = node.agents.some((agent) => agent.id === delta.agentId);
    const agents = hasAgent
      ? node.agents.map((agent) => (agent.id === delta.agentId ? delta.agent : agent))
      : [delta.agent, ...node.agents];
    return { ...node, agents };
  });
  return {
    ...overview,
    generatedAt: ts,
    summary: {
      ...overview.summary,
      busyAgents: nodes.flatMap((node) => node.agents).filter((agent) => agent.busy).length,
      idleAgents: nodes.flatMap((node) => node.agents).filter((agent) => !agent.busy).length,
      staleAgents: nodes.flatMap((node) => node.agents).filter((agent) => agent.staleReason !== null).length,
    },
    nodes,
  };
}

function createTimelineEventFromSessionPayload(payload: SessionEventFramePayload): AgentTimelineEvent {
  return {
    nodeId: payload.nodeId,
    agentId: payload.agentId,
    sessionId: null,
    eventType: payload.eventType,
    summary: payload.summary,
    detail: null,
    status: payload.status,
    createdAt: payload.createdAt,
  };
}

function mergeTimelineEvent(items: AgentTimelineEvent[], nextItem: AgentTimelineEvent): AgentTimelineEvent[] {
  const exists = items.some((item) => item.createdAt === nextItem.createdAt && item.summary === nextItem.summary && item.eventType === nextItem.eventType);
  if (exists) return items;
  return [nextItem, ...items].sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1)).slice(0, 120);
}

interface UseDashboardSocketResult {
  overview: DashboardOverviewResponse | null;
  selectedNode: DashboardOverviewNode | null;
  selectedNodeDetail: DashboardNodeDetail | null;
  selectedAgent: DashboardAgentSummary | null;
  timeline: AgentTimelineEvent[];
  timelineWindow: TimelineWindow;
  wsState: WsState;
  loading: boolean;
  timedOut: boolean;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
  alerts: DashboardAlert[];
  selectNode: (nodeId: string) => void;
  selectAgent: (agentId: string) => void;
  setTimelineWindow: (window: TimelineWindow) => void;
  retry: () => Promise<void>;
}

export function useDashboardSocket(): UseDashboardSocketResult {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [selection, setSelection] = useState<SelectionState>({ nodeId: null, agentId: null });
  const [selectedNodeDetail, setSelectedNodeDetail] = useState<DashboardNodeDetail | null>(null);
  const [timeline, setTimeline] = useState<AgentTimelineEvent[]>([]);
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>('1h');
  const [wsState, setWsState] = useState<WsState>('connecting');
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const hasLoadedRef = useRef(false);
  const overviewRef = useRef<DashboardOverviewResponse | null>(null);
  const selectionRef = useRef<SelectionState>({ nodeId: null, agentId: null });

  const selectedNode = useMemo(() => {
    if (!overview || !selection.nodeId) return null;
    return overview.nodes.find((node) => node.id === selection.nodeId) ?? null;
  }, [overview, selection.nodeId]);

  const selectedAgent = useMemo(() => {
    if (!selectedNode || !selection.agentId) return null;
    return selectedNode.agents.find((agent) => agent.id === selection.agentId) ?? null;
  }, [selectedNode, selection.agentId]);

  const stale = lastUpdatedAt !== null && clockTick - lastUpdatedAt > STALE_AFTER_MS;

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    overviewRef.current = overview;
  }, [overview]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  async function applyOverview(nextOverview: DashboardOverviewResponse) {
    hasLoadedRef.current = true;
    setOverview(nextOverview);
    setSelection((current) => normalizeSelection(nextOverview, current));
    setLastUpdatedAt(Date.now());
    setTimedOut(false);
    setError(null);
    setAlerts((current) => mergeUniqueAlerts(buildNodeStatusAlerts(nextOverview), current));
  }

  async function loadOverview() {
    setRefreshing(true);
    try {
      const nextOverview = await fetchOverview();
      await applyOverview(nextOverview);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'failed to fetch dashboard overview';
      setError(message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;
    let disposed = false;
    const timeoutTimer = window.setTimeout(() => {
      if (!hasLoadedRef.current) {
        setTimedOut(true);
      }
    }, FIRST_LOAD_TIMEOUT_MS);

    const connect = () => {
      if (disposed) return;
      setWsState('connecting');
      try {
        socket = new WebSocket(WS_URL);
      } catch {
        setWsState('closed');
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
        return;
      }

      socket.addEventListener('open', () => {
        setWsState('open');
      });

      socket.addEventListener('message', (event) => {
        const frame = parseFrame(event.data);
        if (!frame) return;

        setLastUpdatedAt(Date.now());
        if (frame.type === 'dashboard.snapshot') {
          void applyOverview(frame.payload);
          return;
        }

        if (frame.type === 'node.delta') {
          setOverview((current) => (current ? mergeNodeDelta(current, frame.payload, frame.ts) : current));
          if (frame.payload.reason || frame.payload.node.status !== 'online') {
            const severity = frame.payload.node.status === 'online' ? 'recovered' : deriveSeverityFromNodeStatus(frame.payload.node.status);
            const nodeAlert: DashboardAlert = {
              id: `node-delta-${frame.payload.nodeId}-${frame.ts}`,
              severity,
              nodeId: frame.payload.nodeId,
              nodeName: frame.payload.node.name,
              agentId: null,
              summary: `${frame.payload.node.name} status ${frame.payload.node.status}`,
              detail: frame.payload.reason ?? null,
              createdAt: frame.ts,
              recovered: severity === 'recovered',
            };
            setAlerts((current) => mergeUniqueAlerts([nodeAlert], current));
          }

          setSelectedNodeDetail((current) => {
            if (!current || current.id !== frame.payload.nodeId) return current;
            return { ...current, ...frame.payload.node };
          });
          return;
        }

        if (frame.type === 'agent.delta') {
          setOverview((current) => (current ? mergeAgentDelta(current, frame.payload, frame.ts) : current));
          setSelectedNodeDetail((current) => {
            if (!current || current.id !== frame.payload.nodeId) return current;
            const hasAgent = current.agents.some((agent) => agent.id === frame.payload.agentId);
            const agents = hasAgent
              ? current.agents.map((agent) => (agent.id === frame.payload.agentId ? frame.payload.agent : agent))
              : [frame.payload.agent, ...current.agents];
            return { ...current, agents };
          });
          return;
        }

        const alert: DashboardAlert = {
          id: `session-${frame.payload.nodeId}-${frame.payload.agentId}-${frame.payload.createdAt}-${frame.payload.summary}`,
          severity: deriveSeverityFromSession(frame.payload),
          nodeId: frame.payload.nodeId,
          nodeName: overviewRef.current?.nodes.find((node) => node.id === frame.payload.nodeId)?.name ?? frame.payload.nodeId,
          agentId: frame.payload.agentId,
          summary: frame.payload.summary,
          detail: frame.payload.eventType,
          createdAt: frame.payload.createdAt,
          recovered: deriveSeverityFromSession(frame.payload) === 'recovered',
        };
        setAlerts((current) => mergeUniqueAlerts([alert], current));

        setTimeline((current) => {
          if (selectionRef.current.nodeId !== frame.payload.nodeId || selectionRef.current.agentId !== frame.payload.agentId) {
            return current;
          }

          return mergeTimelineEvent(current, createTimelineEventFromSessionPayload(frame.payload));
        });
      });

      socket.addEventListener('close', () => {
        setWsState('closed');
        if (disposed) return;
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      });
    };

    void loadOverview();
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(timeoutTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (!selection.nodeId) {
      setSelectedNodeDetail(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const detail = await fetchNodeDetail(selection.nodeId!);
        if (cancelled) return;
        setSelectedNodeDetail(detail);
        setSelection((current) => {
          if (current.nodeId !== detail.id) return current;
          if (current.agentId && detail.agents.some((agent) => agent.id === current.agentId)) return current;
          return {
            ...current,
            agentId: detail.agents[0]?.id ?? null,
          };
        });
      } catch (nextError) {
        if (cancelled) return;
        if (isNotFoundError(nextError)) {
          setSelectedNodeDetail(null);
          return;
        }
        const message = nextError instanceof Error ? nextError.message : 'failed to fetch node detail';
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selection.nodeId]);

  useEffect(() => {
    if (!selection.nodeId || !selection.agentId) {
      setTimeline([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchAgentTimeline(selection.nodeId!, selection.agentId!, timelineWindow);
        if (cancelled) return;
        setTimeline(response.items);
      } catch (nextError) {
        if (cancelled) return;
        const message = nextError instanceof Error ? nextError.message : 'failed to fetch timeline';
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selection.nodeId, selection.agentId, timelineWindow]);

  return {
    overview,
    selectedNode,
    selectedNodeDetail,
    selectedAgent,
    timeline,
    timelineWindow,
    wsState,
    loading,
    timedOut,
    refreshing,
    stale,
    error,
    alerts,
    selectNode: (nodeId) => {
      setSelection((current) => {
        if (!overview) return current;
        const node = overview.nodes.find((item) => item.id === nodeId) ?? null;
        if (!node) return current;
        const nextAgentId = node.agents.find((agent) => agent.id === current.agentId)?.id ?? node.agents[0]?.id ?? null;
        return {
          nodeId,
          agentId: nextAgentId,
        };
      });
    },
    selectAgent: (agentId) => {
      setSelection((current) => ({ ...current, agentId }));
    },
    setTimelineWindow,
    retry: async () => {
      setTimedOut(false);
      setError(null);
      await loadOverview();
    },
  };
}
