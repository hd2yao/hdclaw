你现在执行“每日 AI 热点自动化任务”。请严格完成以下步骤并一次性产出：

运行参数：
- 输出目录：${AI_NEWS_OBSIDIAN_DIR}
- Telegram 目标：${AI_NEWS_TELEGRAM_TARGET}
- 主 agent：${AI_NEWS_AGENT_ID}
- 时区：${AI_NEWS_TZ}
- 基础回溯时窗：${AI_NEWS_LOOKBACK_HOURS}h
- 回补时窗：${AI_NEWS_FALLBACK_HOURS}h
- 热点数量：${AI_NEWS_TOP_N}
- 入选数量：${AI_NEWS_PICK_N}

必须执行：
1. 使用 web_search + web_fetch 从英文优先来源收集 AI 新闻（官方源 + 主流媒体 + 社区）。
2. 先收集近 ${AI_NEWS_LOOKBACK_HOURS} 小时；若有效热点不足 ${AI_NEWS_TOP_N} 条，回溯到 ${AI_NEWS_FALLBACK_HOURS} 小时补齐。
3. 去重后按以下热度规则评分（总分 100）：
   - 来源权威性 35
   - 时效性 25
   - 跨源共现度 25
   - 受众可写性 15
4. 输出 10 条热点（中文摘要 + 来源链接）。
5. 从 10 条中选择 3 个可写话题，给出入选原因，并给出其余 7 条未入选原因。
6. 基于 3 个话题写 3 篇中文公众号短文，每篇 800-1200 字，风格：资讯解读型。
7. 输出必须遵循以下固定结构标题：
   - `## 1. 每日热点新闻（10条）`
   - `## 2. 话题选择（3 入选 + 7 未入选）`
   - `## 3. 三篇话题推文（公众号短文）`
   并使用 `### 热点 01...10`、`### 入选 01...03`、`### 未入选 01...07`、`### 文章 01...03`。
8. 写入 Obsidian 文件：
   - `${AI_NEWS_OBSIDIAN_DIR}/YYYY-MM-DD-ai-hotspots.md`
9. 向 Telegram `${AI_NEWS_TELEGRAM_TARGET}` 发送简报，内容包括：
   - 10 热点标题 + 链接
   - 三篇标题 + 摘要
10. 若任一步失败，请明确写出失败阶段与原因。

最后返回：
- 文件绝对路径
- 本次热点统计（条数、来源覆盖）
- 推送状态
