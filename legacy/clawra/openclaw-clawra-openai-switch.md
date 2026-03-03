# Clawra Fal.ai → OpenAI 切换方案（本地优先 + 手动同步）

## 核心设计原则

1. **本地优先**：以本机 `~/.openclaw/skills/clawra-selfie` 为准
2. **模型可配置**：默认 `gpt-image-1`，支持环境变量切换
3. **手动同步上游**：你触发"检查上游"，我再执行检查并给出同步步骤
4. **最小侵入**：Provider 抽象层，不改 Clawra 触发体验

---

## 公开接口与配置约定

### CLI 调用格式（保持现有入口不变）

```bash
npx ts-node clawra-selfie.ts "<prompt>" <platform> <target> [caption]
```

### 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAWRA_IMAGE_PROVIDER` | `openai` | `openai` 或 `fal` |
| `CLAWRA_IMAGE_MODEL` | `gpt-image-1` | 模型名称 |
| `OPENAI_API_KEY` | - | OpenAI provider 必需 |
| `FAL_KEY` | - | Fal provider 回退可选 |

### 平台 Target 格式

| 平台 | Target 格式示例 |
|------|----------------|
| Telegram | `@username`, `-1001234567890`, `123456789` (chat ID) |
| Discord | `#general`, `123456789012345678` (channel ID) |
| Slack | `#general`, `C01234567` (channel ID) |

---

## 代码结构

```
~/.openclaw/skills/clawra-selfie/scripts/
├── providers/
│   ├── index.ts          # Provider 工厂
│   ├── base.ts           # 抽象基类
│   ├── openai.ts         # OpenAI 实现（b64_json 兼容）
│   └── fal.ts            # Fal 实现（保留兼容）
└── clawra-selfie.ts      # 主脚本改造
```

---

## 完整脚本示例

```bash
# 1. 创建 providers 目录
mkdir -p ~/.openclaw/skills/clawra-selfie/scripts/providers

# 2. 创建 Provider 抽象基类
cat > ~/.openclaw/skills/clawra-selfie/scripts/providers/base.ts << 'EOF'
/**
 * Provider Base Abstraction for Clawra Image Generation
 */

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
}

export interface ImageProvider {
  name: string;
  isConfigured(): boolean;
  generate(input: ProviderInput): Promise<ProviderOutput[]>;
  getConfigRequirements(): string[];
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
    return process.env[envVar];
  }
}
EOF

# 3. 创建 OpenAI Provider（含 b64_json 兼容）
cat > ~/.openclaw/skills/clawra-selfie/scripts/providers/openai.ts << 'EOF'
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
    
    // 获取模型名称（默认 gpt-image-1）
    const model = this.getModel("gpt-image-1");
    const effectiveModel = model || input.model || "gpt-image-1";
    
    // 构建请求体
    const requestBody: any = {
      model: effectiveModel,
      prompt: input.prompt,
      n: input.num_images || 1,
    };
    
    // response_format 规则统一：
    // - gpt-image-*：不传 response_format（默认 b64_json）
    // - dall-e-2：传 response_format: "url"
    // - dall-e-3：按默认返回（deprecated，仅兼容说明）
    if (effectiveModel === "dall-e-2") {
      requestBody.response_format = "url";
    }
    
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    // gpt-image-1 返回 b64_json，dall-e 返回 url
    return data.data.map((item: any) => ({
      url: item.url,
      b64_json: item.b64_json,
      mime_type: item.mime_type || "image/png",
      revised_prompt: item.revised_prompt,
    }));
  }
}
EOF

# 4. 创建 Fal Provider（保留兼容）
cat > ~/.openclaw/skills/clawra-selfie/scripts/providers/fal.ts << 'EOF'
/**
 * Fal.ai Provider for Clawra Image Generation
 * Legacy support for xai/grok-imagine-image
 * Fal uses "Key" authentication header, not "Bearer"
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
        // Fal.ai 使用 Key 认证
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: input.prompt,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Fal.ai API error: ${await response.text()}`);
    }
    
    const data = await response.json();
    return [{ url: data.images?.[0]?.url || data.url }];
  }
}
EOF

# 5. 创建 Provider 工厂
cat > ~/.openclaw/skills/clawra-selfie/scripts/providers/index.ts << 'EOF'
/**
 * Provider Factory
 */

import { OpenAIProvider } from "./openai";
import { FalProvider } from "./fal";
import { ImageProvider } from "./base";

export function getProvider(): ImageProvider {
  const providerType = process.env.CLAWRA_IMAGE_PROVIDER || "openai";
  
  switch (providerType) {
    case "openai":
      return new OpenAIProvider();
    case "fal":
      return new FalProvider();
    default:
      throw new Error(`Unknown provider: ${providerType}`);
  }
}

export { OpenAIProvider, FalProvider };
EOF

# 6. 创建主脚本
cat > ~/.openclaw/skills/clawra-selfie/scripts/clawra-selfie.ts << 'EOF'
/**
 * Clawra Selfie - Image Generation with Provider Abstraction
 * 
 * Usage: npx ts-node clawra-selfie.ts "<prompt>" <platform> <target> [caption]
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const execFileAsync = promisify(execFile);
import { getProvider } from "./providers/index";

interface ClawraArgs {
  prompt: string;
  platform: string;
  target: string;
  caption?: string;
}

/**
 * 处理 Provider 输出：优先 url，否则解码 b64_json
 */
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

/**
 * 发送消息到 OpenClaw（execFile 避免注入）
 */
async function sendViaOpenClaw(
  platform: string,
  target: string,
  message: string,
  media: string
): Promise<void> {
  await execFileAsync("openclaw", [
    "message", "send",
    "--channel", platform,
    "--target", target,
    "--message", message,
    "--media", media,
  ]);
}

/**
 * 解析命令行参数
 */
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
  CLAWRA_IMAGE_PROVIDER - "openai" or "fal" (default: "openai")
  CLAWRA_IMAGE_MODEL   - Model name (default: "gpt-image-1")
  OPENAI_API_KEY       - Required for openai provider
  FAL_KEY              - Required for fal provider

Example:
  CLAWRA_IMAGE_PROVIDER=openai npx ts-node clawra-selfie.ts "A cyberpunk city" telegram "@mybot_test"
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

/**
 * 主函数
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = getProvider();
  
  if (!provider.isConfigured()) {
    const requirements = provider.getConfigRequirements();
    throw new Error(`${provider.name} provider not configured. Missing: ${requirements.join(", ")}`);
  }
  
  console.log(`[INFO] Using provider: ${provider.name}`);
  console.log(`[INFO] Generating image...`);
  
  const outputs = await provider.generate({ prompt: args.prompt });
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
      console.log(`[INFO] Cleaned up temp file`);
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
EOF
```

---

## 上游同步流程（手动触发）

### 触发方式

你发送：**"检查上游 clawra 更新"**

### 执行流程

```
1. 我执行只读检查
   - 拉取 upstream 最新 commit
   - 对比上次同步点
   - 列出变更文件和风险

2. 我给你"最小同步清单"
   - 必同步文件（功能/安全修复）
   - 可延后文件（文档/非关键）
   - 冲突点（与 OpenAI 改造重叠处）

3. 你确认后，我执行本地同步（按最小 diff）

4. 冒烟验证（两条路径）
   - OpenAI 主路径
   - Fal 回退路径

5. 记录"同步日期/commit"
```

### 同步原则

- **高风险变更**：我会先给评审结论，不直接改本地
- **最小 diff**：只同步必要文件，避免覆盖改造
- **两条冒烟**：OpenAI 主路径 + Fal 回退必须都通

---

## 已知限制（本轮保留）

- 当前方案是基于 prompt 的图片生成，不包含参考图 edit 链路。
- 与原始 Clawra 的“参考图一致性”相比，外观稳定性可能弱化，这是预期行为差异。
- 若后续要提升一致性，再单独规划：
  - OpenAI：`images/edits` 参考图编辑链路
  - Fal：对应的编辑接口链路

---

## Provider 快速切换（运行配置）

### 切换到 Fal.ai

```bash
openclaw config set 'skills.entries.clawra-selfie.env.CLAWRA_IMAGE_PROVIDER' 'fal'
openclaw gateway restart
```

### 切换回 OpenAI

```bash
openclaw config set 'skills.entries.clawra-selfie.env.CLAWRA_IMAGE_PROVIDER' 'openai'
openclaw gateway restart
```

### 查看当前 Provider

```bash
jq -r '.skills.entries["clawra-selfie"].env.CLAWRA_IMAGE_PROVIDER' ~/.openclaw/openclaw.json
```

> 说明：切换后需重启 gateway 才会生效。

---

## 冒烟测试与验收

### OpenAI 主路径

```bash
export CLAWRA_IMAGE_PROVIDER=openai
export OPENAI_API_KEY="sk-..."
npx ts-node clawra-selfie.ts "A cute robot" telegram "@mybot_test"
# 预期：成功收到图片
```

### Fal 回退路径

```bash
export CLAWRA_IMAGE_PROVIDER=fal
export FAL_KEY="..."
npx ts-node clawra-selfie.ts "A cute robot" telegram "@mybot_test"
# 预期：成功回退到 fal.ai
```

### 默认值验证

```bash
# 不显式设置模型时，默认走 gpt-image-1
# 预期：日志显示 Using provider: openai
```

### 故障验证

```bash
# 缺失 OPENAI_API_KEY
unset OPENAI_API_KEY
npx ts-node clawra-selfie.ts "test" telegram "@mybot_test"
# 预期：报错 "openai provider not configured. Missing: OPENAI_API_KEY"
```

---

## 成本参考

```
参考：OpenAI 官方定价 https://platform.openai.com/docs/pricing

本方案不在文档中固定写入价格数字，避免随官方调价而过期。
实际费用请始终以官方定价页面为准。
```

---

## 假设与默认值

| 项目 | 默认值 |
|------|--------|
| 同步节奏 | 手动触发（你发起，我执行） |
| 默认 provider | openai |
| 默认 model | gpt-image-1 |
| 变更策略 | 高风险上游变更先评审，不直接改本地 |

---

## 变更边界

- ✅ 维护本地运行代码与必要文档
- ✅ 手动触发上游检查与同步
- ❌ 不做自动定时任务
- ❌ 不做复杂长期分支治理
- ❌ Fork 仅作为备份，不作为日常运行依赖
