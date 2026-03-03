/**
 * Provider Base Abstraction for Clawra Image Generation
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface ProviderInput {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  num_images?: number;
}

export interface ProviderOutput {
  url?: string;
  b64_json?: string;
  mime_type?: string;
  revised_prompt?: string;
}

export interface ImageProvider {
  name: string;
  isConfigured(): boolean;
  generate(input: ProviderInput): Promise<ProviderOutput[]>;
  getConfigRequirements(): string[];
}

type SkillEntry = {
  env?: Record<string, string>;
};

type OpenClawConfig = {
  skills?: {
    entries?: Record<string, SkillEntry>;
  };
};

let cachedConfig: OpenClawConfig | null | undefined;

function loadOpenClawConfig(): OpenClawConfig | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const configPath =
    process.env.OPENCLAW_CONFIG_PATH ||
    path.join(os.homedir(), ".openclaw", "openclaw.json");

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as OpenClawConfig;
    cachedConfig = parsed;
    return parsed;
  } catch {
    cachedConfig = null;
    return null;
  }
}

export abstract class BaseProvider implements ImageProvider {
  abstract name: string;
  abstract isConfigured(): boolean;
  abstract generate(input: ProviderInput): Promise<ProviderOutput[]>;
  abstract getConfigRequirements(): string[];

  protected getModel(defaultModel: string): string {
    return process.env.CLAWRA_IMAGE_MODEL || defaultModel;
  }

  protected getApiKey(envVar: string): string | undefined {
    const fromEnv = process.env[envVar];
    if (fromEnv) {
      return fromEnv;
    }

    const config = loadOpenClawConfig();
    if (!config) {
      return undefined;
    }

    const skillId = process.env.CLAWRA_SKILL_ID || "clawra-selfie";
    const fromConfig = config.skills?.entries?.[skillId]?.env?.[envVar];
    return fromConfig || undefined;
  }
}
