/**
 * Runware Provider for Clawra Image Generation
 * Uses Runware HTTP API imageInference task.
 */

import { randomUUID } from "crypto";

import { BaseProvider, ProviderInput, ProviderOutput } from "./base";

type RunwareTaskResult = {
  taskType?: string;
  imageURL?: string;
  imageBase64Data?: string;
  imageDataURI?: string;
};

type RunwareResponse = {
  data?: RunwareTaskResult[];
  errors?: Array<{ message?: string; code?: string }>;
};

export class RunwareProvider extends BaseProvider {
  name = "runware";

  isConfigured(): boolean {
    return !!this.getApiKey("RUNWARE_API_KEY");
  }

  getConfigRequirements(): string[] {
    return ["RUNWARE_API_KEY"];
  }

  async generate(input: ProviderInput): Promise<ProviderOutput[]> {
    const apiKey = this.getApiKey("RUNWARE_API_KEY");
    if (!apiKey) {
      throw new Error("RUNWARE_API_KEY not configured");
    }

    const model = input.model || this.getModel("runware:101@1");
    const parsedWidth = Number.parseInt(process.env.CLAWRA_IMAGE_WIDTH || "1024", 10);
    const parsedHeight = Number.parseInt(
      process.env.CLAWRA_IMAGE_HEIGHT || "1024",
      10
    );
    const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 1024;
    const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 1024;
    const numberResults = input.num_images || 1;

    const response = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          taskType: "imageInference",
          taskUUID: randomUUID(),
          positivePrompt: input.prompt,
          model,
          width,
          height,
          numberResults,
          outputType: "URL",
          outputFormat: "JPG",
          deliveryMethod: "sync",
        },
      ]),
    });

    if (!response.ok) {
      throw new Error(`Runware API error: ${await response.text()}`);
    }

    const data = (await response.json()) as RunwareResponse;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const message = data.errors[0]?.message || "unknown error";
      throw new Error(`Runware API error: ${message}`);
    }

    if (!Array.isArray(data.data) || data.data.length === 0) {
      throw new Error("Runware API error: empty image response");
    }

    const outputs = data.data
      .filter((item) => item.taskType === "imageInference")
      .map((item) => {
        if (item.imageURL) {
          return { url: item.imageURL } as ProviderOutput;
        }

        if (item.imageBase64Data) {
          return {
            b64_json: item.imageBase64Data,
            mime_type: "image/jpeg",
          } as ProviderOutput;
        }

        if (item.imageDataURI) {
          const base64 = item.imageDataURI.split(",")[1];
          if (base64) {
            return {
              b64_json: base64,
              mime_type: "image/jpeg",
            } as ProviderOutput;
          }
        }

        return null;
      })
      .filter((item): item is ProviderOutput => item !== null);

    if (outputs.length === 0) {
      throw new Error("Runware API error: image data missing in response");
    }

    return outputs;
  }
}
