/**
 * Provider Factory
 */

import { OpenAIProvider } from "./openai";
import { FalProvider } from "./fal";
import { RunwareProvider } from "./runware";
import { ImageProvider } from "./base";

export function getProvider(): ImageProvider {
  const providerType = process.env.CLAWRA_IMAGE_PROVIDER;
  const openai = new OpenAIProvider();
  const runware = new RunwareProvider();
  const fal = new FalProvider();

  // Explicit override always wins.
  if (providerType) {
    switch (providerType) {
      case "openai":
        return openai;
      case "runware":
        return runware;
      case "fal":
        return fal;
      default:
        throw new Error(`Unknown provider: ${providerType}`);
    }
  }

  // Default behavior:
  // 1) prefer OpenAI when configured
  // 2) fallback to Runware when OpenAI key is missing
  // 3) fallback to Fal when Runware key is missing
  // 4) otherwise return OpenAI so error message points to OPENAI_API_KEY
  if (openai.isConfigured()) return openai;
  if (runware.isConfigured()) return runware;
  if (fal.isConfigured()) return fal;
  return openai;
}

export { OpenAIProvider, RunwareProvider, FalProvider };
