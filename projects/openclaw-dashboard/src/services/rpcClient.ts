import WebSocket from 'ws';
import fs from 'fs';
import { nowIso } from '../utils/time.js';
import type { NodeTelemetryPayload } from '../types.js';

export class OpenClawRpcClient {
  constructor(private readonly url: string, private readonly token?: string | null) {}

  async collectSnapshot(): Promise<NodeTelemetryPayload> {
    // 从本地 openclaw.json 读取 agents 配置
    const configPath = '/home/node/.openclaw/openclaw.json';
    let agents: any[] = [];
    
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      agents = config.agents?.list || [];
    } catch (err) {
      console.error('Failed to read openclaw.json:', err);
    }

    // 尝试连接 WebSocket 获取实时状态
    let gatewayStatus = 'unknown';
    let sessions: any[] = [];
    
    try {
      const ws = new WebSocket(this.url, {
        headers: this.token ? { authorization: `Bearer ${this.token}` } : undefined,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
        ws.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        ws.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      gatewayStatus = 'running';
      ws.close();
    } catch (err) {
      gatewayStatus = 'offline';
      console.error('WebSocket connection failed:', err);
    }

    // 获取系统资源
    const resources = await this.getSystemResources();

    return {
      gateway: { bindAddress: '0.0.0.0', port: 18789, status: gatewayStatus },
      resources,
      agents: agents.map(a => ({
        id: a.id,
        name: a.name || a.id,
        workspace: a.workspace || '/home/node/.openclaw/workspace',
        model: a.model || 'unknown',
        status: 'idle', // 简化状态
      })),
      sessions,
      messages: { nodeId: '', inbound: 0, outbound: 0, updatedAt: nowIso() },
      collectedAt: nowIso(),
    };
  }

  private async getSystemResources(): Promise<{ cpuPercent: number | null; memoryUsedMb: number | null; memoryTotalMb: number | null }> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // 获取内存信息
      const memResult = await execAsync('free -m | grep Mem');
      const memLines = memResult.stdout.trim().split('\n');
      if (memLines.length > 0) {
        const parts = memLines[0].split(/\s+/).filter(Boolean);
        if (parts.length >= 3) {
          return {
            cpuPercent: null, // 需要更复杂的计算
            memoryUsedMb: parseInt(parts[1]) || null,
            memoryTotalMb: parseInt(parts[2]) || null,
          };
        }
      }
    } catch (err) {
      console.error('Failed to get system resources:', err);
    }

    return { cpuPercent: null, memoryUsedMb: null, memoryTotalMb: null };
  }
}
