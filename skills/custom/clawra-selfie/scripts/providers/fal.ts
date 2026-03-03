/**
 * Fal.ai Provider for Clawra Image Generation
 * Supports fixed reference-image locking via xai/grok-imagine-image/edit
 */

import { BaseProvider, ProviderInput, ProviderOutput } from "./base";

const DEFAULT_REFERENCE_IMAGE =
  "https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png";

type SelfieMode = "auto" | "mirror" | "direct";

export class FalProvider extends BaseProvider {
  name = "fal";

  isConfigured(): boolean {
    return !!this.getApiKey("FAL_KEY");
  }

  getConfigRequirements(): string[] {
    return ["FAL_KEY"];
  }

  private parseMode(raw: string | undefined): SelfieMode {
    switch ((raw || "auto").toLowerCase()) {
      case "mirror":
        return "mirror";
      case "direct":
        return "direct";
      default:
        return "auto";
    }
  }

  private detectMode(userContext: string): "mirror" | "direct" {
    const mirrorKeywords =
      /outfit|wearing|clothes|dress|suit|fashion|full-?body|mirror|reflection/i;
    const directKeywords =
      /cafe|restaurant|beach|park|city|close-?up|portrait|face|eyes|smile/i;

    if (directKeywords.test(userContext)) return "direct";
    if (mirrorKeywords.test(userContext)) return "mirror";
    return "mirror";
  }

  private buildLockedPrompt(userContext: string, mode: "mirror" | "direct"): string {
    const context = userContext.trim();
    if (mode === "direct") {
      return `a close-up selfie taken by herself at ${context}, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible`;
    }
    return `make a pic of this person, but ${context}. the person is taking a mirror selfie`;
  }

  async generate(input: ProviderInput): Promise<ProviderOutput[]> {
    const apiKey = this.getApiKey("FAL_KEY");
    if (!apiKey) {
      throw new Error("FAL_KEY not configured");
    }

    const useReferenceRaw = this.getSkillEnv("CLAWRA_USE_REFERENCE_IMAGE");
    const useReference = !useReferenceRaw || useReferenceRaw.toLowerCase() !== "false";
    const endpoint = useReference
      ? "https://fal.run/xai/grok-imagine-image/edit"
      : "https://fal.run/xai/grok-imagine-image";

    const mode = this.parseMode(this.getSkillEnv("CLAWRA_SELFIE_MODE"));
    const effectiveMode = mode === "auto" ? this.detectMode(input.prompt) : mode;
    const lockedPrompt = this.buildLockedPrompt(input.prompt, effectiveMode);

    const requestBody = useReference
      ? {
          image_url: this.getReferenceImage(DEFAULT_REFERENCE_IMAGE),
          prompt: lockedPrompt,
          num_images: input.num_images || 1,
          output_format: "jpeg",
        }
      : {
          prompt: input.prompt,
        };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Fal.ai API error: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      images?: Array<{ url?: string }>;
      url?: string;
      revised_prompt?: string;
    };

    const url = data.images?.[0]?.url || data.url;
    if (!url) {
      throw new Error("Fal.ai API error: empty image url");
    }

    return [
      {
        url,
        revised_prompt: data.revised_prompt,
      } as ProviderOutput,
    ];
  }
}
