/**
 * Clawra Selfie - Image Generation with Provider Abstraction
 *
 * Usage: npx ts-node clawra-selfie.ts "<prompt>" <platform> <target> [caption]
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

import { getProvider } from "./providers/index";

const execFileAsync = promisify(execFile);

interface ClawraArgs {
  prompt: string;
  platform: string;
  target: string;
  caption?: string;
}

async function handleOutput(
  output: { url?: string; b64_json?: string; mime_type?: string }
): Promise<{ media: string; needsCleanup: boolean }> {
  if (output.url) {
    return { media: output.url, needsCleanup: false };
  }

  if (output.b64_json) {
    const mimeType = output.mime_type || "image/png";
    const ext = mimeType.split("/")[1] || "png";
    const tmpPath = `/tmp/clawra-${Date.now()}.${ext}`;
    fs.writeFileSync(tmpPath, Buffer.from(output.b64_json, "base64"));
    return { media: tmpPath, needsCleanup: true };
  }

  throw new Error("Provider returned neither url nor b64_json");
}

async function sendViaOpenClaw(
  platform: string,
  target: string,
  message: string,
  media: string
): Promise<void> {
  await execFileAsync("openclaw", [
    "message",
    "send",
    "--channel",
    platform,
    "--target",
    target,
    "--message",
    message,
    "--media",
    media,
  ]);
}

function parseArgs(args: string[]): ClawraArgs {
  if (args.length < 3) {
    console.log(`
Usage: npx ts-node clawra-selfie.ts "<prompt>" <platform> <target> [caption]

Args:
  prompt   - Image description (required)
  platform - telegram, discord, etc. (required)
  target   - Target ID (required)
  caption  - Message caption (default: "Generated with CLAWRA")

Env:
  CLAWRA_IMAGE_PROVIDER - "openai", "runware", or "fal" (default: "openai")
  CLAWRA_IMAGE_MODEL   - Model name (default: "gpt-image-1")
  OPENAI_API_KEY       - Required for openai provider
  RUNWARE_API_KEY      - Required for runware provider
  FAL_KEY              - Required for fal provider

Target format examples:
  Telegram: @username, -1001234567890, 123456789
  Discord:  #general, 123456789012345678
  Slack:    #general, C01234567
`);
    process.exit(1);
  }

  return {
    prompt: args[0],
    platform: args[1],
    target: args[2],
    caption: args[3],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = getProvider();

  if (!provider.isConfigured()) {
    const requirements = provider.getConfigRequirements();
    throw new Error(
      `${provider.name} provider not configured. Missing: ${requirements.join(", ")}`
    );
  }

  console.log(`[INFO] Using provider: ${provider.name}`);
  console.log("[INFO] Generating image...");

  const outputs = await provider.generate({ prompt: args.prompt });
  if (!Array.isArray(outputs) || outputs.length === 0) {
    throw new Error("Provider returned empty outputs");
  }

  const firstOutput = outputs[0];
  const { media, needsCleanup } = await handleOutput(firstOutput);

  console.log(`[INFO] Image ready: ${firstOutput.url ? "url" : "b64_json"}`);

  const caption = args.caption || "Generated with CLAWRA";
  try {
    await sendViaOpenClaw(args.platform, args.target, caption, media);
    console.log(`[INFO] Sent to ${args.platform}/${args.target}`);
  } finally {
    if (needsCleanup && fs.existsSync(media)) {
      fs.unlinkSync(media);
      console.log("[INFO] Cleaned up temp file");
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  });
}

export { main as run, parseArgs, handleOutput };
