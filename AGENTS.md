# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-16  
**Project:** codex-account-pool  
**Type:** TypeScript Monorepo

## OVERVIEW

GPT Plus/Pro 账号池管理工具 - 管理多个 ChatGPT 账号的 Codex 额度。基于 Playwright 浏览器自动化获取 Session，支持多账号轮换、额度监控和租约管理。

**Stack:** TypeScript 5.3, Node.js 18+, Playwright, Commander.js, Zod

## STRUCTURE

```
codex-account-pool/
├── packages/
│   ├── core/           # 核心领域逻辑 (AccountPool, Encryption)
│   ├── browser/        # Playwright 浏览器自动化
│   └── cli/            # 命令行界面 (codex-pool)
├── docs/               # 文档
└── scripts/            # 构建脚本
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 账号池逻辑 | `packages/core/src/services/account-pool.ts` | AccountPool 类，轮换策略 |
| 加密服务 | `packages/core/src/services/encryption.ts` | AES-256-GCM |
| 浏览器认证 | `packages/browser/src/auth-browser.ts` | ChatGPTAuthBrowser |
| CLI 命令 | `packages/cli/src/commands/` | account, auth, quota, pool |
| 类型定义 | `packages/core/src/types/` | Account, Lease, Quota 等 |
| CLI 入口 | `packages/cli/src/cli.ts` | Commander 程序定义 |

## CODE MAP

### Core Services

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| AccountPool | class | core/services/account-pool.ts | 账号池管理、轮换策略 |
| EncryptionService | class | core/services/encryption.ts | AES-256-GCM 加密 |
| CredentialStorage | class | core/services/credential-storage.ts | 凭证加密存储 |
| QuotaParser | class | core/services/quota-parser.ts | Codex 额度解析 |

### Browser Automation

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| ChatGPTAuthBrowser | class | browser/auth-browser.ts | 浏览器登录自动化 |
| AuthManager | class | browser/auth-manager.ts | 认证管理器 |

### CLI Commands

| Command | Handler | Description |
|---------|---------|-------------|
| account | account.ts | 账号增删改查 |
| auth | auth.ts | 浏览器/手动登录 |
| quota | quota.ts | 额度检查监控 |
| pool | pool.ts | 池状态、租约管理 |

## CONVENTIONS

### Naming
- **Classes:** PascalCase (`AccountPool`, `EncryptionService`)
- **Methods:** camelCase (`acquireLease`, `setCooldown`)
- **Private:** underscore prefix (`_accounts`, `_calculateScore`)
- **Types:** PascalCase (`AccountStatus`, `Lease`)
- **Constants:** UPPER_SNAKE (`DEFAULT_POOL_CONFIG`)

### Imports
- 相对路径使用 `.js` 扩展名（ESM 兼容）：`from './account.js'`
- Node.js 内置模块使用 `node:` 前缀：`from 'node:path'`

### Error Handling
- 明确抛出 Error，消息格式：`Account ${id} not found`
- 异步操作使用 try/catch，静默忽略时注释原因

### Type Safety
- 所有公共 API 使用显式返回类型
- 复杂对象使用 Zod schema 验证
- `null` 表示"无结果"，`undefined` 表示可选

### Collaboration & Git
- 默认使用中文回复用户，除非用户明确要求英文
- 默认使用中文处理 Git 相关说明、提交说明和协作沟通
- 所有 `git commit` 提交信息必须使用中文，并使用 `<type>(<scope>): <中文描述>` 格式
- `type` 默认使用 `feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`，`scope` 需要准确指向模块或主题
- 提交信息必须准确说明本次提交改了什么，禁止使用含糊、偷懒、容易误导的提交说明
- 提交时不要添加 AI、agent、Sisyphus、ChatGPT、Claude、Copilot 等署名，也不要添加 `Co-authored-by` 或类似尾注，只保留用户本人的提交身份
- 用户要求 `push`、`推送`、`上传远程` 时，必须先用中文提醒并等待用户明确确认后才能执行远程推送
- 推送前必须提醒用户确认敏感信息已处理，至少检查 `.env`、数据库文件、密钥文件、日志文件、上传文件目录以及其他非 `.env.example` 环境变量文件
- 不要提交敏感信息、日志、数据库、上传文件、临时文件或其他可生成产物；如发现此类文件应优先加入 `.gitignore` 或从提交中移除
- 上述协作与 Git 约定默认长期生效，后续不要再要求用户重复提醒

## ANTI-PATTERNS

- **禁止**直接存储明文凭证 - 必须使用 CredentialStorage
- **禁止**在代码中硬编码密钥 - 使用 `CODEX_POOL_MASTER_KEY` 环境变量
- **禁止**忽略 Playwright 浏览器关闭 - 必须调用 `close()`
- **禁止**在 AccountPool 外直接修改 Account 状态

## COMMANDS

```bash
# 开发
npm run build        # 构建所有包
npm run dev          # 监听模式
npm run typecheck    # TypeScript 检查
npm run lint         # ESLint

# CLI 使用
codex-pool auth login
codex-pool pool rotate
codex-pool quota monitor
```

## NOTES

- Master Key 必须 ≥32 字符，丢失后无法解密凭证
- Session 有效期约 7 天，需定期重新登录
- Playwright 使用 stealth 模式绕过检测
- 租约超时会自动清理（默认 5 分钟）
