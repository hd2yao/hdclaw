/**
 * Fal.ai Provider for Clawra Image Generation
 * Legacy support for xai/grok-imagine-image
 */

import { BaseProvider, ProviderInput, ProviderOutput } from "./base";

export class FalProvider extends BaseProvider {
  name = "fal";

  isConfigured(): boolean {
    return !!this.getApiKey("FAL_KEY");
  }

  getConfigRequirements(): string[] {
    return ["FAL_KEY"];
  }

  async generate(input: ProviderInput): Promise<ProviderOutput[]> {
    const apiKey = this.getApiKey("FAL_KEY");
    if (!apiKey) {
      throw new Error("FAL_KEY not configured");
    }

    const response = await fetch("https://fal.run/xai/grok-imagine-image", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: input.prompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Fal.ai API error: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      images?: Array<{ url?: string }>;
      url?: string;
    };

    const url = data.images?.[0]?.url || data.url;
    if (!url) {
      throw new Error("Fal.ai API error: empty image url");
    }

    return [{ url } as ProviderOutput];
  }
}
