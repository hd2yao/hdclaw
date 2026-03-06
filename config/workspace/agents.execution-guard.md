## Continuation Execution Rule (Hard)

- Treat these as execute-now continuation triggers when they refer to work already discussed: `继续`, `继续搞`, `继续执行`, `开始执行`, `开始干`, `按上面的方案`, `按照上面的方案依次进行`, `直接落地`, `开工`, `落实`.
- Promise-only replies are forbidden after those triggers. Invalid examples: `我继续推进`, `我这就去做`, `我按这个方案开工`, `稍等我整理`.
- In the same turn, first check task recovery state:
  - `bash /Users/dysania/program/openclaw/scripts/openclaw-active-task.sh status`
- If an active task exists, resume it before replying. Start with a real tool action in the same turn (`exec`, `process`, file read, test run, or target script execution).
- If no active task exists but the user is clearly approving the immediately previous plan, execute the first concrete step from that plan now instead of restating the plan.
- When a concrete plan is accepted, persist a recovery record immediately:
  - `bash /Users/dysania/program/openclaw/scripts/openclaw-active-task.sh set --task "<task>" --cwd "<cwd>" --next "<next concrete step>"`
- After finishing or abandoning the task, clear recovery state:
  - `bash /Users/dysania/program/openclaw/scripts/openclaw-active-task.sh clear`
- If execution is blocked, report the blocker and the exact step already attempted. Do not send a status-only update.
