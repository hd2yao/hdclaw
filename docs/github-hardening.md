# GitHub Hardening (hdclaw)

Repository: `https://github.com/hd2yao/hdclaw`

## 1) Branch protection (main)
在 GitHub 页面操作：
1. Settings -> Branches -> Add branch protection rule。
2. Branch name pattern 填 `main`。
3. 打开：
   - Require a pull request before merging
   - Require approvals (>=1)
   - Dismiss stale pull request approvals when new commits are pushed
   - Require status checks to pass before merging（勾选 `ci / checks`）
   - Require conversation resolution before merging
   - Do not allow bypassing the above settings
   - Restrict deletions
   - Block force pushes

## 2) Security features
1. Settings -> Security & analysis。
2. 打开：
   - Dependency graph
   - Dependabot alerts
   - Dependabot security updates
   - Secret scanning
   - Push protection

## 3) Recommended repo settings
1. Settings -> General -> Pull Requests
2. 打开：
   - Automatically delete head branches
   - Allow squash merging（可选只保留一种 merge 策略）

## 4) Verification checklist
- `main` 直接 push 被阻止（除管理员外）。
- PR 合并前必须通过 `ci / checks`。
- 推送包含疑似密钥时触发 push protection。
