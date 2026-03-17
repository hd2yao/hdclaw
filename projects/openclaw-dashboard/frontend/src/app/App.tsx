import { useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_DASHBOARD_HTTP_URL ?? 'http://127.0.0.1:3000/api';
const API_TOKEN = import.meta.env.VITE_DASHBOARD_API_TOKEN ?? 'dev-key-for-testing';

interface Node {
  id: string;
  name: string;
  status: string;
  lastSeenAt?: string | null;
  agents: Array<{
    id: string;
    name: string;
    model: string;
  }>;
}

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/overview`, {
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
          },
        });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = (await res.json()) as Node[];
        setNodes(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
    const interval = setInterval(fetchOverview, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-4 text-center">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-4">
        <h1 className="text-2xl font-bold">OpenClaw Dashboard</h1>
        <p className="text-sm opacity-80">Multi-Node Agent Monitoring</p>
      </header>

      <main className="p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {nodes.map((node) => (
            <div key={node.id} className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{node.name}</h2>
                <span className={`px-2 py-1 rounded text-xs ${
                  node.status === 'online' ? 'bg-green-100 text-green-800' :
                  node.status === 'offline' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {node.status}
                </span>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">Total Agents</p>
                <p className="text-3xl font-bold">{node.agents.length}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Last seen: {node.lastSeenAt ? new Date(node.lastSeenAt).toLocaleString() : 'n/a'}
                </p>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-2">Model Distribution</h3>
                <div className="space-y-1">
                  {Object.entries(
                    node.agents.reduce<Record<string, number>>((acc, agent) => {
                      const model = agent.model || 'unknown';
                      acc[model] = (acc[model] || 0) + 1;
                      return acc;
                    }, {}),
                  ).map(([model, count]) => (
                    <div key={model} className="flex justify-between text-sm">
                      <span className="text-gray-600 truncate">{model}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
