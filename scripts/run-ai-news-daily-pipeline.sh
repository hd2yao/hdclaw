#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${OPENCLAW_ENV_FILE:-$ROOT_DIR/.env.local}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${AI_NEWS_OBSIDIAN_DIR:=$HOME/obsidian/news/daily}"
: "${AI_NEWS_TZ:=Asia/Shanghai}"
: "${AI_NEWS_TOP_N:=10}"
: "${AI_NEWS_PICK_N:=3}"

if [[ -z "${AI_NEWS_TELEGRAM_TARGET:-}" ]]; then
  echo "[run-ai-news-pipeline] missing AI_NEWS_TELEGRAM_TARGET" >&2
  exit 1
fi

mkdir -p "$AI_NEWS_OBSIDIAN_DIR"

DATE_STR="$(TZ="$AI_NEWS_TZ" date +%F)"
NOW_ISO="$(TZ="$AI_NEWS_TZ" date +%FT%T%z)"
OUT_FILE="$AI_NEWS_OBSIDIAN_DIR/$DATE_STR-ai-hotspots.md"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

QUERIES=(
  "latest AI news last 24 hours OpenAI Google Anthropic Meta Microsoft NVIDIA"
  "latest enterprise AI product updates OpenAI Anthropic Google Meta Microsoft NVIDIA"
  "latest AI policy and regulation updates this week"
  "latest open source AI releases and model launches last 48 hours"
  "latest AI developer tools releases this week"
)

echo "[run-ai-news-pipeline] collecting candidates..."
for idx in "${!QUERIES[@]}"; do
  q="${QUERIES[$idx]}"
  out_json="$TMP_DIR/q$((idx + 1)).json"
  if ! node "$ROOT_DIR/skills/custom/search-router/scripts/search-router.mjs" --query "$q" --max 12 >"$out_json" 2>"$TMP_DIR/q$((idx + 1)).err"; then
    echo "[run-ai-news-pipeline] search query $((idx + 1)) failed; continuing" >&2
  fi
done

BRIEF_FILE="$TMP_DIR/telegram-brief.txt"
META_FILE="$TMP_DIR/meta.json"

python3 - <<'PY' "$TMP_DIR" "$OUT_FILE" "$BRIEF_FILE" "$META_FILE" "$AI_NEWS_TOP_N" "$AI_NEWS_PICK_N" "$DATE_STR" "$NOW_ISO"
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

tmp_dir, out_file, brief_file, meta_file, top_n_s, pick_n_s, date_str, now_iso = sys.argv[1:9]
top_n = int(top_n_s)
pick_n = int(pick_n_s)
reference_now = datetime.strptime(now_iso, "%Y-%m-%dT%H:%M:%S%z")

authority_weights = {
    "openai.com": 20,
    "anthropic.com": 20,
    "blog.google": 20,
    "deepmind.google": 20,
    "ai.meta.com": 20,
    "blogs.microsoft.com": 20,
    "nvidianews.nvidia.com": 20,
    "reuters.com": 20,
    "bloomberg.com": 19,
    "ft.com": 19,
    "cnbc.com": 18,
    "techcrunch.com": 18,
    "theverge.com": 18,
    "venturebeat.com": 17,
    "businessinsider.com": 16,
    "fastcompany.com": 16,
    "huggingface.co": 16,
    "arxiv.org": 16,
}

company_map = {
    "openai": "OpenAI",
    "microsoft": "微软",
    "google": "谷歌",
    "deepmind": "DeepMind",
    "anthropic": "Anthropic",
    "meta": "Meta",
    "nvidia": "英伟达",
    "amazon": "亚马逊",
    "aws": "AWS",
    "xai": "xAI",
    "mistral": "Mistral",
}

domain_name_map = {
    "openai.com": "OpenAI",
    "blogs.microsoft.com": "微软",
    "blog.google": "谷歌",
    "deepmind.google": "DeepMind",
    "anthropic.com": "Anthropic",
    "ai.meta.com": "Meta",
    "nvidianews.nvidia.com": "英伟达",
    "reuters.com": "路透",
    "techcrunch.com": "TechCrunch",
    "theverge.com": "The Verge",
    "venturebeat.com": "VentureBeat",
    "bloomberg.com": "彭博",
    "businessinsider.com": "Business Insider",
}

bucket_map = {
    "产品/模型": "产品/模型",
    "产业/商业": "产业/商业",
    "政策/治理": "政策/治理",
    "开发者/生态": "产品/模型",
}

blocked_domains = {
    "aol.com",
    "msn.com",
    "news.google.com",
    "news.yahoo.com",
    "yahoo.com",
}

blocked_url_terms = {
    "/press-release/",
    "press-release",
    "sponsored",
}

ai_relevance_terms = [
    "ai",
    "ai agent",
    "ai coding",
    "ai model",
    "anthropic",
    "artificial intelligence",
    "claude",
    "codex",
    "copilot",
    "deepmind",
    "fine tuning",
    "foundation model",
    "gemini",
    "generative ai",
    "gpt",
    "huggingface",
    "inference",
    "large language model",
    "llm",
    "llama",
    "machine learning",
    "mistral",
    "multimodal",
    "neural network",
    "open weights",
    "openai",
    "reasoning model",
    "stability ai",
    "training",
    "xai",
]

generic_subject_map = {
    "产品/模型": "一项 AI 产品更新",
    "产业/商业": "一项 AI 商业动态",
    "政策/治理": "一项 AI 治理动态",
    "开发者/生态": "一项 AI 开发生态动态",
}


def load_any(path: str):
    txt = open(path, "r", encoding="utf-8", errors="ignore").read().strip()
    if not txt:
        return []
    try:
        obj = json.loads(txt)
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            if isinstance(obj.get("results"), list):
                return obj["results"]
            if isinstance(obj.get("items"), list):
                return obj["items"]
            return [obj]
    except Exception:
        pass

    rows = []
    for line in txt.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            continue
    return rows


def normalize_domain(url: str) -> str:
    try:
        domain = urlparse(url).netloc.lower()
    except Exception:
        return ""
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def parse_published_at(raw: str):
    if not raw:
        return None
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=reference_now.tzinfo)
        return dt
    except Exception:
        return None


def is_chinese(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def normalize_search_text(*parts: str) -> str:
    joined = " ".join(part for part in parts if part)
    return re.sub(r"[^a-z0-9]+", " ", joined.lower()).strip()


def normalize_item(item):
    raw_title = re.sub(r"\s+", " ", (item.get("title") or item.get("name") or "").strip())
    url = (item.get("url") or item.get("link") or "").strip()
    raw_snippet = re.sub(r"\s+", " ", (item.get("snippet") or item.get("summary") or item.get("content") or "").strip())
    if not raw_title or not url:
        return None
    return {
        "raw_title": raw_title,
        "url": url,
        "raw_snippet": raw_snippet,
        "domain": normalize_domain(url),
        "published_at": parse_published_at(item.get("publishedAt") or item.get("published_at") or ""),
    }


def is_ai_relevant(item):
    domain = item["domain"]
    if any(domain == blocked or domain.endswith(f".{blocked}") for blocked in blocked_domains):
        return False
    if any(term in item["url"].lower() for term in blocked_url_terms):
        return False
    title_url_searchable = f" {normalize_search_text(item['raw_title'], item['url'], domain)} "
    snippet_searchable = f" {normalize_search_text(item['raw_snippet'])} "
    if any(f" {term} " in title_url_searchable for term in ai_relevance_terms):
        return True
    return any(f" {term} " in snippet_searchable for term in ai_relevance_terms) and any(
        key in domain for key in ("openai.com", "anthropic.com", "deepmind.google", "ai.meta.com", "huggingface.co")
    )


def detect_companies(title: str, snippet: str, domain: str):
    positions = []
    zones = [title.lower(), snippet.lower(), domain.lower()]
    for key, name in company_map.items():
        best_idx = None
        for zone_idx, zone in enumerate(zones):
            idx = zone.find(key)
            if idx >= 0:
                best_idx = zone_idx * 10000 + idx
                break
        if best_idx is not None:
            positions.append((best_idx, name))
    positions.sort(key=lambda pair: pair[0])

    companies = []
    for _, name in positions:
        if name not in companies:
            companies.append(name)
    return companies


def detect_category(text: str):
    text_l = f" {normalize_search_text(text)} "
    if any(keyword in text_l for keyword in [" defense ", " military ", " policy ", " regulation ", " law ", " compliance ", " safety ", " governance ", " sanction ", " regulator "]):
        return "政策/治理"
    if any(keyword in text_l for keyword in [" gpt ", " claude ", " gemini ", " llama ", " codex ", " model ", " release ", " launch ", " upgrade ", " update ", " rollout ", " inference "]):
        return "产品/模型"
    if any(keyword in text_l for keyword in [" partnership ", " deal ", " spend ", " investment ", " funding ", " cloud ", " infrastructure ", " datacenter ", " supply chain ", " enterprise ", " procurement "]):
        return "产业/商业"
    if any(keyword in text_l for keyword in [" developer ", " sdk ", " api ", " open source ", " github ", " huggingface ", " arxiv ", " benchmark "]):
        return "开发者/生态"
    return "产业/商业"


def subject_name(item):
    if item["companies"]:
        return "、".join(item["companies"][:2])
    return generic_subject_map[item["category"]]


def detect_title_phrase(text: str, category: str):
    text_l = text.lower()
    phrase_rules = [
        (r"joint statement.*partnership", "发布联合声明，确认合作继续推进"),
        (r"sovereign cloud", "强化主权云与离线大模型能力"),
        (r"supply chain risk", "被点名为供应链风险"),
        (r"coding wars|codex", "让编码模型竞争继续升温"),
        (r"spend.*ai", "公布新一轮 AI 投入计划"),
        (r"latest news and insights", "相关动态进入持续跟踪阶段"),
        (r"policy|regulation|act|law", "迎来新的监管与治理进展"),
        (r"partnership|deal|investment|funding", "推进合作与资本布局"),
        (r"launch|release|update|upgrade", "发布新一轮产品/模型更新"),
    ]
    for pattern, phrase in phrase_rules:
        if re.search(pattern, text_l):
            return phrase
    fallback = {
        "产品/模型": "发布值得关注的模型或产品动作",
        "产业/商业": "出现影响行业格局的商业动作",
        "政策/治理": "出现需要持续跟踪的治理信号",
        "开发者/生态": "带来值得关注的开发者生态变化",
    }
    return fallback[category]


def to_chinese_title(item):
    subject = subject_name(item)
    phrase = detect_title_phrase(item["raw_title"], item["category"])
    title = f"{subject}{phrase}"
    if item.get("low_conf"):
        title = f"（低置信）{title}"
    return title


def to_chinese_summary(item):
    subject = subject_name(item)
    category = item["category"]
    sentence_1 = {
        "产品/模型": f"{subject}这次的焦点是产品/模型动作，核心信号不是版本号本身，而是能力边界和使用门槛正在变化。",
        "产业/商业": f"{subject}更像产业链动作，重点在合作、投入或基础设施布局，而不是单点功能更新。",
        "政策/治理": f"{subject}相关消息把关注点拉回到治理、安全与边界问题，说明 AI 竞争已经不只是拼能力，也在拼规则。",
        "开发者/生态": f"{subject}这次的变化更偏开发者生态，关键看点是工具链和开放生态会不会因此改变。",
    }[category]
    sentence_2 = {
        "产品/模型": "如果后续有更多二次报道跟进，它会直接影响开发者选型和企业试点节奏。",
        "产业/商业": "它更值得写的地方，是会影响企业采购判断、预算去向和平台绑定关系。",
        "政策/治理": "这类新闻通常更适合做深度稿，因为它能延展到合规、风险控制和组织决策层面。",
        "开发者/生态": "这类消息的价值在于，它往往会改变开发者工作流和中小团队的落地路径。",
    }[category]
    return f"{sentence_1}{sentence_2}"


def format_score_breakdown(item):
    scores = item["scores"]
    return (
        f"时效 {scores['时效性']}/20｜"
        f"信源 {scores['信源可信度']}/20｜"
        f"影响面 {scores['产业影响面']}/20｜"
        f"可写深度 {scores['可写深度']}/15｜"
        f"讨论热度 {scores['讨论热度']}/15｜"
        f"题材补位 {scores['题材补位']}/10｜"
        f"总分 {item['score']}/100"
    )


def compute_scores(item, company_freq):
    credibility = 12
    for key, weight in authority_weights.items():
        if key in item["domain"]:
            credibility = weight
            break

    if item["published_at"] is not None:
        age_hours = max(0.0, (reference_now - item["published_at"].astimezone(reference_now.tzinfo)).total_seconds() / 3600.0)
        if age_hours <= 24:
            timeliness = 20
        elif age_hours <= 48:
            timeliness = 17
        elif age_hours <= 96:
            timeliness = 13
        elif age_hours <= 168:
            timeliness = 9
        else:
            timeliness = 6
    else:
        timeliness = 11

    impact = 12 + min(6, len(item["companies"]) * 2)
    if item["category"] == "政策/治理":
        impact += 2
    impact = min(20, impact)

    depth = 9
    if item["category"] in ("政策/治理", "产业/商业"):
        depth += 3
    if len(item["raw_snippet"]) >= 90:
        depth += 3
    elif len(item["raw_snippet"]) >= 45:
        depth += 2
    depth = min(15, depth)

    heat = 8 + min(4, company_freq[item["primary_company"]])
    if any(key in item["domain"] for key in authority_weights):
        heat += 1
    if re.search(r"latest|new|today|2026|gpt|claude|gemini|risk|partnership", item["raw_title"].lower()):
        heat += 2
    heat = min(15, heat)

    return {
        "时效性": timeliness,
        "信源可信度": credibility,
        "产业影响面": impact,
        "可写深度": depth,
        "讨论热度": heat,
        "题材补位": 0,
    }


def add_diversity_bonus(items, selected_urls):
    bucket_bonus = {"产品/模型": 9, "产业/商业": 8, "政策/治理": 8}
    for item in items:
        bonus = bucket_bonus.get(item["bucket"], 6) if item["url"] in selected_urls else 2
        if item.get("low_conf"):
            bonus = min(bonus, 3)
        item["scores"]["题材补位"] = bonus
        item["score"] = min(100, sum(item["scores"].values()))


def selected_reason_lines(item):
    reasons = []
    if item["scores"]["信源可信度"] >= 18:
        reasons.append("信源：来自官方或一线媒体，事实边界相对清晰，适合直接作为正文核心依据。")
    if item["scores"]["时效性"] >= 17:
        reasons.append("时效：发布时间仍在主观察窗口内，能保证当天内容的新鲜度。")
    if item["scores"]["可写深度"] >= 12:
        reasons.append("可写性：它不只是单点更新，还能扩展到行业格局、组织决策或方法论层面。")
    if item["bucket"] == "政策/治理":
        reasons.append("题材补位：这条题材能补上治理视角，避免三篇稿子都写成产品发布。")
    elif item["bucket"] == "产业/商业":
        reasons.append("题材补位：它更适合拆解商业动作和产业链影响，传播面会比纯参数更新更宽。")
    else:
        reasons.append("题材补位：它自带产品竞争和使用场景，最容易写成读者能直接理解的深度稿。")
    return reasons[:3]


def selected_angle_lines(item):
    if item["bucket"] == "政策/治理":
        return [
            "可以从“AI 公司为什么开始进入安全与治理赛道”切入。",
            "也可以从企业采购与风险控制角度展开，解释为什么这类消息不只是舆论事件。",
        ]
    if item["bucket"] == "产业/商业":
        return [
            "适合写“这笔合作/投入会改变谁的预算分配和平台选择”。",
            "也适合用“企业会不会因此更难迁移生态”作为传播钩子。",
        ]
    return [
        "适合写“这次更新会让哪些团队立刻改变使用习惯”。",
        "也适合从“产品能力升级，为什么会影响企业试点转采购”这个角度展开。",
    ]


def rejected_reason_lines(item, selected_buckets):
    reasons = []
    if item.get("low_conf"):
        reasons.append("信源：这条是补位候选，信源与细节都不够扎实，优先级天然靠后。")
    if item["bucket"] in selected_buckets:
        reasons.append("题材重复：它和已入选题材同属于一条赛道，继续入选会让三篇稿子显得过于同质。")
    if item["scores"]["时效性"] <= 13:
        reasons.append("时效：发布时间偏离主观察窗口，作为当天主稿会削弱“今日必读”的感觉。")
    if item["scores"]["信源可信度"] <= 15:
        reasons.append("信源：当前信源硬度不够，容易写成“观点摘录”而不是“事实驱动”的稿子。")
    if item["scores"]["可写深度"] <= 11:
        reasons.append("可写性：它更像单点更新，信息增量不足，难撑起一篇 800-1200 字的完整分析。")
    fallback = "综合优先级：它有参考价值，但放到今天的 3 篇深写里，优先级仍低于已入选话题。"
    while len(reasons) < 3:
        reasons.append(fallback)
    return reasons[:3]


def rejected_retry_lines(item):
    suggestions = []
    if item["scores"]["信源可信度"] <= 15:
        suggestions.append("补信源：拿到官方公告、财报口径或一线媒体确认后，再重评信源分。")
    if item["scores"]["时效性"] <= 13:
        suggestions.append("补时效：如果 24 小时内出现二次追踪报道，可以重新评估它的时效性。")
    if item["scores"]["可写深度"] <= 11:
        suggestions.append("补信息增量：若后续出现用户反馈、商业数据或政策回应，可显著提升可写空间。")
    if not suggestions:
        suggestions.append("补跟进：只要出现新的事实增量或跨源跟进，它就有机会进入下一轮候选池。")
    while len(suggestions) < 2:
        suggestions.append("补细节：如果后续事件演化出新的冲突点或执行细节，可再做一次重排。")
    return suggestions[:2]


def build_article(item, idx):
    playbook = {
        "产品/模型": {
            "lead": "这类新闻表面上在讲版本和能力，真正值得写的是它会不会改变开发者和企业的实际决策。",
            "audience": "产品经理、AI 应用团队、正在做模型选型的企业负责人",
            "angle": "产品升级背后的竞争节奏",
            "question": "如果你所在团队正在评估模型方案，这条更新会不会改变你下周的试用名单？",
        },
        "产业/商业": {
            "lead": "这类消息看上去像商业新闻，真正重要的是它会重新分配预算、合作关系和平台绑定。",
            "audience": "企业管理者、战略团队、关注平台格局的人",
            "angle": "商业动作如何传导到采购和生态",
            "question": "站在企业预算视角，你会把更多资源押在单一平台，还是保留多家并行的灵活性？",
        },
        "政策/治理": {
            "lead": "这类新闻不是“外围议题”，而是在提醒大家：AI 竞争已经开始进入规则、风险和责任的维度。",
            "audience": "管理层、法务、风控、需要做合规判断的业务团队",
            "angle": "治理信号如何变成组织动作",
            "question": "如果类似的治理争议发生在你所在行业，你们会先讨论效率，还是先讨论责任边界？",
        },
    }[item["bucket"]]

    title = f"{item['zh_title']}：这条新闻真正值得写的，不只是表面信息"
    lead = f"{playbook['lead']}{item['zh_summary']} 更关键的是，它会不会把短期讨论继续推成真实的组织动作。"
    timeline = [
        f"直接事实：{item['zh_title']}，原始标题为“{item['raw_title']}”。",
        f"信源落在 {domain_name_map.get(item['domain'], item['domain'] or '主要媒体')}，说明至少有一手或一线媒体的可追溯起点。",
        "接下来真正要看的，是是否会出现企业动作、监管回应或第二波市场反馈。",
    ]
    why_lines = [
        "它能同时回答“发生了什么”和“为什么现在发生”，不容易写成流水账。",
        f"它和今天其他候选相比，更能代表“{playbook['angle']}”这条主线。",
        f"它最适合触达的读者人群是：{playbook['audience']}。",
    ]
    body_paragraphs = [
        f"先看表面事实。{item['zh_summary']} 但如果只停留在新闻层，你只能得到一条“知道发生了什么”的信息；真正更有价值的，是继续追问这件事会改变谁的判断、谁的预算和谁的工作流。对今天的 AI 行业来说，这一步已经比单纯复述事实更重要。",
        f"再看行业背景。过去一年，AI 竞争已经明显从“能力展示”转向“交付落地”。市场越来越关注模型能不能进入真实流程、能不能被治理、能不能解释 ROI、能不能长期运维。把这个背景放回 {item['zh_title']}，它就不再是一条孤立新闻，而是更大趋势里的一个观察点。",
        f"最后看可执行动作。对内容团队来说，最好的写法不是平铺事实，而是拆成“现象、原因、影响、动作”四段；对企业团队来说，最好的响应也不是看到热闹就跟进，而是先评估信源强度，再评估影响对象，最后决定要不要投入资源。这样处理，热点才会变成判断材料，而不是新的信息噪音。",
    ]
    expansion_tail = "如果后续 24 到 48 小时内出现二次报道、官方补充或用户案例，这条新闻的写作价值还会继续抬升，因为那时你能把“事件”写成“趋势”，把“结论”写成“方法”。"
    takeaway = f"判断这类 AI 新闻值不值得写，关键不是看它热不热，而是看它能不能帮助读者在一周内做出更好的决策。今天这条最适合承接的关键词是：{playbook['angle']}。"

    def assemble_text(paragraphs):
        article_lines = []
        article_lines.append("**开场导语**")
        article_lines.append(lead)
        article_lines.append("")
        article_lines.append("**先看结论**")
        article_lines.append("1. 这不是一条只能看标题的快讯，它背后对应的是更大的行业变化。")
        article_lines.append("2. 它最值得写的地方，不是事实本身，而是会影响谁的下一步动作。")
        article_lines.append("3. 如果要把它写成深度稿，最有效的切口是“为什么现在发生、会传导到哪里”。")
        article_lines.append("")
        article_lines.append("**事件脉络**")
        for line in timeline:
            article_lines.append(f"- {line}")
        article_lines.append("")
        article_lines.append("**为什么值得写**")
        for line in why_lines:
            article_lines.append(f"- {line}")
        article_lines.append("")
        article_lines.append("**正文展开**")
        for paragraph in paragraphs:
            article_lines.append(paragraph)
            article_lines.append("")
        article_lines.append("**可直接复用的观点**")
        article_lines.append(f"> {takeaway}")
        article_lines.append("")
        article_lines.append("**互动问题**")
        article_lines.append(playbook["question"])
        article_text = "\n".join(article_lines).strip()
        return article_text, len(re.sub(r"\s+", "", article_text))

    article_text, compact_len = assemble_text(body_paragraphs)
    if compact_len < 820:
        body_paragraphs.append(expansion_tail)
        article_text, compact_len = assemble_text(body_paragraphs)

    while compact_len > 1180:
        longest_idx = max(range(len(body_paragraphs)), key=lambda i: len(body_paragraphs[i]))
        sentences = [part for part in re.split(r"(?<=。)", body_paragraphs[longest_idx]) if part]
        if len(sentences) > 1:
            body_paragraphs[longest_idx] = "".join(sentences[:-1]).strip()
        else:
            body_paragraphs[longest_idx] = body_paragraphs[longest_idx][: max(80, len(body_paragraphs[longest_idx]) - 60)].rstrip("，、；：")
        article_text, compact_len = assemble_text([paragraph for paragraph in body_paragraphs if paragraph])

    count = compact_len
    return title, article_text, count


raw_candidates = []
for fn in sorted(os.listdir(tmp_dir)):
    if not fn.endswith(".json"):
        continue
    for row in load_any(os.path.join(tmp_dir, fn)):
        item = normalize_item(row if isinstance(row, dict) else {})
        if item and is_ai_relevant(item):
            raw_candidates.append(item)

seen = set()
dedup = []
for item in raw_candidates:
    key = (item["url"].split("?")[0].rstrip("/"), item["raw_title"].lower())
    if key in seen:
        continue
    seen.add(key)
    item["category"] = detect_category(" ".join([item["raw_title"], item["raw_snippet"], item["domain"]]))
    item["bucket"] = bucket_map[item["category"]]
    item["companies"] = detect_companies(item["raw_title"], item["raw_snippet"], item["domain"])
    item["primary_company"] = item["companies"][0] if item["companies"] else domain_name_map.get(item["domain"], "AI 行业")
    dedup.append(item)

company_freq = Counter(item["primary_company"] for item in dedup)
for item in dedup:
    item["scores"] = compute_scores(item, company_freq)
    item["score"] = sum(item["scores"].values())
    item["zh_title"] = to_chinese_title(item)
    item["zh_summary"] = to_chinese_summary(item)

dedup.sort(key=lambda x: x["score"], reverse=True)
top = dedup[:top_n]

fallback_pool = [
    ("路透 AI 动态补位", "https://www.reuters.com/technology/artificial-intelligence/", "产业/商业"),
    ("TechCrunch AI 动态补位", "https://techcrunch.com/category/artificial-intelligence/", "产品/模型"),
    ("The Verge AI 动态补位", "https://www.theverge.com/ai-artificial-intelligence", "产品/模型"),
    ("VentureBeat AI 动态补位", "https://venturebeat.com/ai/", "产业/商业"),
]
fb_idx = 0
while len(top) < top_n:
    title, url, category = fallback_pool[fb_idx % len(fallback_pool)]
    fb_idx += 1
    item = {
        "raw_title": title,
        "url": url,
        "raw_snippet": "高质量实时来源不足，按规则补位并标注低置信，建议后续结合官方或一线媒体继续核验。",
        "domain": normalize_domain(url),
        "published_at": None,
        "category": category,
        "bucket": bucket_map[category],
        "companies": [domain_name_map.get(normalize_domain(url), "AI 行业")],
        "primary_company": domain_name_map.get(normalize_domain(url), "AI 行业"),
        "low_conf": True,
    }
    item["scores"] = compute_scores(item, company_freq)
    item["zh_title"] = to_chinese_title(item)
    item["zh_summary"] = "这条候选用于补足当天榜单数量，适合保留观察，但不建议在没有补充信源前直接作为深写主稿。"
    item["score"] = sum(item["scores"].values())
    top.append(item)

selected = []
selected_urls = set()
for bucket in ("产品/模型", "产业/商业", "政策/治理"):
    bucket_candidates = [item for item in top if item["bucket"] == bucket and item["url"] not in selected_urls]
    if bucket_candidates and len(selected) < pick_n:
        choice = max(bucket_candidates, key=lambda item: item["score"])
        selected.append(choice)
        selected_urls.add(choice["url"])

for item in top:
    if len(selected) >= pick_n:
        break
    if item["url"] not in selected_urls:
        selected.append(item)
        selected_urls.add(item["url"])

add_diversity_bonus(top, selected_urls)
top.sort(key=lambda x: x["score"], reverse=True)
selected = [item for item in top if item["url"] in selected_urls][:pick_n]
unselected = [item for item in top if item["url"] not in selected_urls][: max(0, top_n - pick_n)]
selected_buckets = {item["bucket"] for item in selected}

lines = []
lines.append(f"# 每日 AI 热点（{date_str}）")
lines.append("")
lines.append("## 1. 每日热点新闻（10条）")
for i, item in enumerate(top, 1):
    lines.append(f"\n### 热点 {i:02d}")
    lines.append(f"- 标题：{item['zh_title']}")
    lines.append(f"- 原文标题：{item['raw_title']}")
    lines.append(f"- 归类：{item['category']}")
    lines.append(f"- 中文摘要：{item['zh_summary']}")
    lines.append(f"- 来源：{item['url']}")
    lines.append(f"- 热度评分：{item['score']}/100")

lines.append("\n## 2. 话题选择（3 入选 + 7 未入选）")
for i, item in enumerate(selected, 1):
    lines.append(f"\n### 入选 {i:02d}")
    lines.append(f"- 话题：{item['zh_title']}")
    lines.append(f"- 归类：{item['category']}")
    lines.append(f"- 入选结论：入选，适合作为今天第 {i} 篇深度稿的主话题。")
    lines.append(f"- 评分拆解：{format_score_breakdown(item)}")
    lines.append("- 入选原因：")
    for idx, reason in enumerate(selected_reason_lines(item), 1):
        lines.append(f"  {idx}. {reason}")
    lines.append("- 传播切入角度：")
    for idx, angle in enumerate(selected_angle_lines(item), 1):
        lines.append(f"  {idx}. {angle}")

for i, item in enumerate(unselected, 1):
    lines.append(f"\n### 未入选 {i:02d}")
    lines.append(f"- 话题：{item['zh_title']}")
    lines.append(f"- 当前结论：本轮不入选，保留跟踪。")
    lines.append("- 未入选原因：")
    for idx, reason in enumerate(rejected_reason_lines(item, selected_buckets), 1):
        lines.append(f"  {idx}. {reason}")
    lines.append("- 若补充以下信息可重评：")
    for idx, suggestion in enumerate(rejected_retry_lines(item), 1):
        lines.append(f"  {idx}. {suggestion}")

lines.append("\n## 3. 三篇话题推文（公众号短文）")
for i, item in enumerate(selected, 1):
    article_title, article_text, article_count = build_article(item, i)
    lines.append(f"\n### 文章 {i:02d}")
    lines.append(f"- 对应话题：{item['zh_title']}")
    lines.append(f"- 建议标题：{article_title}")
    lines.append(f"- 字数：{article_count}")
    lines.append("")
    lines.append(article_text)

markdown = "\n".join(lines) + "\n"
with open(out_file, "w", encoding="utf-8") as f:
    f.write(markdown)

brief_lines = []
brief_lines.append("每日 AI 热点简报")
brief_lines.append("")
brief_lines.append("【10 条热点】")
for i, item in enumerate(top, 1):
    brief_lines.append(f"{i:02d}. {item['zh_title']}")
    brief_lines.append(item["url"])
brief_lines.append("")
brief_lines.append("【3 个建议深写话题】")
for i, item in enumerate(selected, 1):
    brief_lines.append(f"{i:02d}. {item['zh_title']}")
    brief_lines.append(f"切口：{selected_angle_lines(item)[0]}")

with open(brief_file, "w", encoding="utf-8") as f:
    f.write("\n".join(brief_lines))

with open(meta_file, "w", encoding="utf-8") as f:
    json.dump(
        {
            "out_file": out_file,
            "top_count": len(top),
            "source_coverage": len({x["domain"] for x in top if x.get("domain")}),
            "selected_count": len(selected),
        },
        f,
        ensure_ascii=False,
    )
PY

echo "=== STAT_EVIDENCE_BEGIN ==="
stat "$OUT_FILE"
echo "=== STAT_EVIDENCE_END ==="

echo "=== TELEGRAM_RECEIPT_BEGIN ==="
if [[ "${AI_NEWS_SKIP_SEND:-0}" == "1" ]]; then
  echo '{"skipped":true,"reason":"AI_NEWS_SKIP_SEND=1"}'
  telegram_status="skipped"
else
  if openclaw message send --channel telegram --target "$AI_NEWS_TELEGRAM_TARGET" --message "$(cat "$BRIEF_FILE")" --json >"$TMP_DIR/telegram.json" 2>"$TMP_DIR/telegram.err"; then
    cat "$TMP_DIR/telegram.json"
    telegram_status="success"
  else
    cat "$TMP_DIR/telegram.err" >&2
    telegram_status="failed"
  fi
fi
echo "=== TELEGRAM_RECEIPT_END ==="

top_count="$(jq -r '.top_count' "$META_FILE")"
coverage_count="$(jq -r '.source_coverage' "$META_FILE")"

echo "文件绝对路径: $OUT_FILE"
echo "本次热点统计: 条数=$top_count 来源覆盖域名=$coverage_count"
echo "推送状态: $telegram_status"
