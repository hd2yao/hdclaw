/**
 * OpenAI Provider for Clawra Image Generation
 * Supports: gpt-image-1, dall-e-2, dall-e-3 (deprecated)
 * Handles b64_json (gpt-image-1 default) and url (dall-e-2) formats
 */

import { BaseProvider, ProviderInput, ProviderOutput } from "./base";

export class OpenAIProvider extends BaseProvider {
  name = "openai";

  isConfigured(): boolean {
    return !!this.getApiKey("OPENAI_API_KEY");
  }

  getConfigRequirements(): string[] {
    return ["OPENAI_API_KEY"];
  }

  async generate(input: ProviderInput): Promise<ProviderOutput[]> {
    const apiKey = this.getApiKey("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const model = this.getModel("gpt-image-1");
    const effectiveModel = input.model || model || "gpt-image-1";

    const requestBody: Record<string, unknown> = {
      model: effectiveModel,
      prompt: input.prompt,
      n: input.num_images || 1,
    };

    // response_format rules:
    // - gpt-image-*: do not set (defaults to b64_json)
    // - dall-e-2: set response_format=url
    // - dall-e-3: keep default behavior (deprecated)
    if (effectiveModel === "dall-e-2") {
      requestBody.response_format = "url";
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const data = (await response.json()) as { data?: Array<Record<string, unknown>> };
    if (!Array.isArray(data.data) || data.data.length === 0) {
      throw new Error("OpenAI API error: empty image response");
    }

    return data.data.map((item) => ({
      url: typeof item.url === "string" ? item.url : undefined,
      b64_json: typeof item.b64_json === "string" ? item.b64_json : undefined,
      mime_type: typeof item.mime_type === "string" ? item.mime_type : "image/png",
      revised_prompt:
        typeof item.revised_prompt === "string" ? item.revised_prompt : undefined,
    }));
  }
}
