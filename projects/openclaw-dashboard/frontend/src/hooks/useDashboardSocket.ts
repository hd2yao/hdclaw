import { useEffect, useMemo, useState } from 'react';
import { mockSessionHistory, mockSnapshot } from '../mocks/dashboard-data';
import type { DashboardState, SessionEvent } from '../types/dashboard';

const WS_URL = import.meta.env.VITE_DASHBOARD_WS_URL ?? 'ws://localhost:3000/ws';

function createInitialState(): DashboardState {
  return {
    ...mockSnapshot,
    selectedNodeId: mockSnapshot.nodes[0]?.id ?? null,
    selectedAgentId: mockSnapshot.nodes[0]?.agents[0]?.id ?? null,
    wsState: 'connecting',
  };
}

export function useDashboardSocket() {
  const [state, setState] = useState<DashboardState>(createInitialState);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      setState((current) => ({ ...current, wsState: 'connecting' }));

      try {
        socket = new WebSocket(WS_URL);
      } catch {
        setState((current) => ({ ...current, wsState: 'closed' }));
        reconnectTimer = window.setTimeout(connect, 3000);
        return;
      }

      socket.addEventListener('open', () => {
        setState((current) => ({ ...current, wsState: 'open' }));
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data) as Partial<DashboardState>;
          setState((current) => ({ ...current, ...payload, wsState: 'open' }));
        } catch {
          // Ignore malformed frames; telemetry should not take down the UI.
        }
      });

      socket.addEventListener('close', () => {
        setState((current) => ({ ...current, wsState: 'closed' }));
        reconnectTimer = window.setTimeout(connect, 3000);
      });
    };

    connect();

    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  const selectedNode = useMemo(
    () => state.nodes.find((node) => node.id === state.selectedNodeId) ?? state.nodes[0] ?? null,
    [state.nodes, state.selectedNodeId],
  );

  const selectedAgent = useMemo(
    () => selectedNode?.agents.find((agent) => agent.id === state.selectedAgentId) ?? selectedNode?.agents[0] ?? null,
    [selectedNode, state.selectedAgentId],
  );

  const sessionHistory: SessionEvent[] = selectedAgent ? mockSessionHistory[selectedAgent.id] ?? [] : [];

  return {
    state,
    selectedNode,
    selectedAgent,
    sessionHistory,
    selectNode: (nodeId: string) => {
      setState((current) => {
        const nextNode = current.nodes.find((node) => node.id === nodeId);
        return {
          ...current,
          selectedNodeId: nodeId,
          selectedAgentId: nextNode?.agents[0]?.id ?? null,
        };
      });
    },
    selectAgent: (agentId: string) => {
      setState((current) => ({ ...current, selectedAgentId: agentId }));
    },
  };
}
