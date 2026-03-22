[English](./README.md)

# gpt-codex-pool

GPT Plus/Pro 账号池管理工具 - 管理多个 ChatGPT 账号的 Codex 额度。

我自己也是因为有多个账号需要来回切换，而且懒得反复查看每个账号到底还剩多少 Codex 额度，所以开发了这个工具。

它可以方便地在 OpenCode 中切换和管理账号，并实时查看各账号的 Codex 额度使用情况。

基于 [opencode-openai-codex-auth](https://github.com/numman-ali/opencode-openai-codex-auth) 的设计理念构建。

## 功能特性

- **多账号管理**：支持添加、删除、启用/禁用多个 ChatGPT Plus/Pro 账号
- **浏览器登录**：通过 Playwright 自动化浏览器登录，安全获取 Session
- **额度监控**：实时监控每个账号的 Codex 短/长期额度使用情况
- **健康检查**：自动检测账号状态，标记需要重新认证的账号
- **账号轮换**：支持加权、轮询、最少使用等轮换策略
- **租约管理**：支持账号租约获取和释放，防止冲突使用
- **加密存储**：所有凭证使用 AES-256-GCM 加密存储

## 效果预览

### 账号列表

```bash
$ codex-pool account list

Accounts:
============================================================================================
ID                        Email                          Status       Tier     Health   Tags
--------------------------------------------------------------------------------------------
acc_1234567890abcdef      personal@example.com           active       plus     100      primary
acc_abcdef1234567890      work@example.com               active       pro      95       work
============================================================================================
Total: 2 accounts
```

### 切换账号后查看当前账号

```bash
$ codex-pool pool current

当前 OpenCode 账号
============================================================
ID:           acc_abcdef1234567890
标签:        Work GPT Pro
邮箱:        work@example.com
套餐:         pro
状态:       活跃
健康度:       95%

Token Expires: 2026年3月26日 14:03
  ✓ 有效期还有 161 小时

额度:
  5小时剩余: 89%
  周剩余: 99%
  Code Review 剩余: 100%

上次切换: 2026年3月19日 19:29
  (1小时 ago)
使用次数:    5
============================================================
```

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/gpt-codex-pool.git
cd gpt-codex-pool

# 安装依赖
npm install

# 构建项目
npm run build

# 链接 CLI（可选）
cd packages/cli
npm link
```

### 配置环境变量

```bash
# 设置加密密钥（必需）
export CODEX_POOL_MASTER_KEY="your-secure-master-key-min-32-chars"

# 添加到 ~/.bashrc 或 ~/.zshrc
```

详细环境配置请参考 [docs/environment.md](docs/environment.md)。

### 基本使用

```bash
# 1. 浏览器登录并自动创建账号
codex-pool auth login

# 2. 查看账号列表
codex-pool account list

# 3. 检查额度
codex-pool quota check <account-id>

# 4. 监控所有账号额度
codex-pool quota monitor

# 5. 选择账号使用
codex-pool pool rotate

# 6. 查看当前使用的账号
codex-pool pool current

# 7. 查看池状态
codex-pool pool status
```

更多使用示例请参考 [docs/examples.md](docs/examples.md)。

### 推荐使用流程

```bash
# 1. 浏览器登录
codex-pool auth login

# 2. 查看刚创建或更新的账号 ID
codex-pool account list

# 3. 验证这个账号的 Session 是否有效
codex-pool auth validate <account-id>

# 4. 看一下额度是否正常
codex-pool quota check <account-id>

# 5. 切换给 OpenCode 使用
codex-pool pool use <account-id>

# 6. 确认当前正在使用的账号
codex-pool pool current
```

## CLI 命令参考

### 账号管理

```bash
# 列出账号
codex-pool account list
codex-pool account list -s active

# 查看详情
codex-pool account show <account-id>

# 删除账号
codex-pool account remove <account-id>
codex-pool account remove <account-id> --force

# 启用/禁用
codex-pool account enable <account-id>
codex-pool account disable <account-id>
```

### 认证管理

```bash
# 浏览器登录（会打开浏览器窗口，并自动创建或更新账号）
codex-pool auth login

# 验证 Session 有效性
codex-pool auth validate <account-id>

# 删除凭证
codex-pool auth logout <account-id>
```

### 额度管理

```bash
# 检查单个账号额度
codex-pool quota check <account-id>

# 监控所有账号（实时刷新）
codex-pool quota monitor
codex-pool quota monitor -i 30  # 30秒刷新一次
```

### 池管理

```bash
# 查看池状态
codex-pool pool status

# 查看当前 OpenCode 使用的账号
codex-pool pool current

# 选择账号（获取租约）
codex-pool pool rotate
codex-pool pool use <account-id>

# 查看租约列表
codex-pool pool lease list

# 释放租约
codex-pool pool lease release <lease-id>
```

## 架构设计

### 项目结构

```
gpt-codex-pool/
├── packages/
│   ├── core/           # 核心逻辑（账号池、加密、额度解析）
│   ├── browser/        # 浏览器自动化
│   └── cli/            # 命令行界面
├── docs/               # 文档
├── AGENTS.md           # 项目知识库（AI 辅助开发指南）
├── packages/core/AGENTS.md      # Core 包知识库
├── packages/cli/AGENTS.md       # CLI 包知识库
├── packages/browser/AGENTS.md   # Browser 包知识库
└── README.md
```

### 核心组件

1. **AccountPool**: 管理账号集合，支持健康检查、冷却、轮换策略
2. **CredentialStorage**: 加密存储和检索账号凭证
3. **ChatGPTAuthBrowser**: Playwright 浏览器自动化
4. **CodexQuotaParser**: 解析 Codex 额度信息
5. **EncryptionService**: AES-256-GCM 加密服务

### 依赖关系

```
CLI (@codex-pool/cli)
├── @codex-pool/core      # 账号池、加密、额度解析
├── @codex-pool/browser   # 浏览器自动化
└── commander, chalk, ora # CLI 工具

Browser (@codex-pool/browser)
├── @codex-pool/core      # 类型定义
└── playwright            # 浏览器自动化

Core (@codex-pool/core)
├── zod                   # 运行时验证
└── nanoid                # ID 生成
```

### 安全特性

- 所有凭证使用 AES-256-GCM 加密
- Master Key 通过环境变量提供，不存储在代码中
- 支持 PBKDF2 密钥派生
- Session 文件权限严格限制

## 开发指南

### 开发环境

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build

# TypeScript 类型检查
npm run typecheck

# 代码检查
npm run lint
```

### 项目约定

本项目遵循以下开发约定：

- **命名**: Classes 使用 PascalCase，methods 使用 camelCase，private 成员使用 `_` 前缀
- **导入**: 相对路径使用 `.js` 扩展名（ESM 兼容），Node.js 内置模块使用 `node:` 前缀
- **类型**: 所有公共 API 使用显式返回类型，`null` 表示"无结果"，`undefined` 表示可选

详细约定请参考 [AGENTS.md](AGENTS.md) 及各子包的 AGENTS.md 文件。

### 开发状态

**当前版本**: v1.0.0

**已知限制**:
- 测试覆盖率：待添加（基础设施准备中）
- 日志系统：使用 `console`（结构化日志准备中）
- 配置验证：使用 TypeScript 类型（Zod schema 准备中）

### 相关文档

- [AGENTS.md](AGENTS.md) - 项目知识库（架构、约定、代码地图）
- [docs/environment.md](docs/environment.md) - 环境变量配置指南
- [docs/examples.md](docs/examples.md) - 使用示例和场景

## 注意事项

1. **个人使用**：本工具仅适用于个人管理自己的 ChatGPT Plus/Pro 账号
2. **遵守 ToS**：使用本工具时请遵守 OpenAI 的服务条款
3. **安全存储**：请妥善保管 `CODEX_POOL_MASTER_KEY`，丢失后无法解密凭证
4. **Session 有效期**：ChatGPT Session 通常有有效期，需要定期重新登录

## 故障排除

### Session 失效

```bash
# 验证 Session
codex-pool auth validate <account-id>

# 如果失效，重新登录
codex-pool auth login
```

### 额度耗尽

账号会进入 `cooldown` 状态，系统会自动轮换到其他可用账号。

### 浏览器登录失败

- 确保网络可以访问 ChatGPT
- 检查是否有验证码需要人工完成
- 尝试非 headless 模式（默认）

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

## 免责声明

本项目是独立开源项目，与 OpenAI 无关。ChatGPT、GPT-5、Codex 是 OpenAI 的商标。
