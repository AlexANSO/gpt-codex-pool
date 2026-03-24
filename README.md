[简体中文](./README-cn.md)

# gpt-codex-pool

GPT Plus/Pro account pool manager for tracking and rotating ChatGPT accounts for Codex usage.

I built this because I also have multiple accounts to switch between, and I did not want to keep checking each one manually just to see how much Codex quota was left.

This tool makes it easier to switch and manage accounts in OpenCode while monitoring Codex quota usage in real time.

Built around the design ideas from [opencode-openai-codex-auth](https://github.com/numman-ali/opencode-openai-codex-auth).

## Features

- **Multi-account management**: add, remove, enable, and disable multiple ChatGPT Plus/Pro accounts
- **Browser login**: use Playwright-based browser automation to securely obtain sessions
- **Quota monitoring**: monitor short-term and long-term Codex quota usage for each account
- **Health checks**: detect account status automatically and flag accounts that need re-authentication
- **Account rotation**: support weighted, round-robin, and least-used rotation strategies
- **Lease management**: acquire and release account leases to avoid conflicts
- **Encrypted storage**: store all credentials with AES-256-GCM encryption

## Preview

### Account List

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

### Current Account After Switching

```bash
$ codex-pool pool current --lang en

Current OpenCode Account
============================================================
ID:           acc_abcdef1234567890
Label:        Work GPT Pro
Email:        work@example.com
Tier:         pro
Status:       Active
Health:       95%

Token Expires: Mar 26, 2026, 14:03
  ✓ Valid for another 161 hours

Quota:
  5h Remaining: 89%
  Weekly Remaining: 99%
  Code Review Remaining: 100%

Last Switched: Mar 19, 2026, 19:29
  (1h ago)
Times Used:    5
============================================================
```

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/AlexANSO/gpt-codex-pool.git
cd gpt-codex-pool

# Install dependencies
npm install

# Build the project
npm run build

# Link the CLI (optional)
cd packages/cli
npm link
```

### Environment Variables

```bash
# Set the encryption key (required)
export CODEX_POOL_MASTER_KEY="your-secure-master-key-min-32-chars"

# Add it to ~/.bashrc or ~/.zshrc
```

For full environment setup, see [docs/environment.md](docs/environment.md).

### Basic Usage

```bash
# 1. Log in with the browser and auto-create the account
codex-pool auth login

# 2. List accounts
codex-pool account list

# 3. Check quota
codex-pool quota check <account-id>

# 4. Monitor quota for all accounts
codex-pool quota monitor

# 5. Select an account for use
codex-pool pool rotate

# 6. Show the current active account
codex-pool pool current

# 7. Show pool status
codex-pool pool status
```

For more examples, see [docs/examples.md](docs/examples.md).

### Recommended Flow

```bash
# 1. Log in with the browser
codex-pool auth login

# 2. Find the newly created or updated account ID
codex-pool account list

# 3. Validate that the session is usable
codex-pool auth validate <account-id>

# 4. Check whether the quota looks healthy
codex-pool quota check <account-id>

# 5. Switch OpenCode to that account
codex-pool pool use <account-id>

# 6. Confirm which account is currently active
codex-pool pool current
```

## CLI Reference

### Account Management

```bash
# List accounts
codex-pool account list
codex-pool account list -s active

# Show details
codex-pool account show <account-id>

# Remove an account
codex-pool account remove <account-id>
codex-pool account remove <account-id> --force

# Enable or disable an account
codex-pool account enable <account-id>
codex-pool account disable <account-id>
```

### Authentication

```bash
# Browser login (opens a browser window and creates or updates the account)
codex-pool auth login

# Validate a stored session
codex-pool auth validate <account-id>

# Remove stored credentials
codex-pool auth logout <account-id>
```

### Quota Management

```bash
# Check quota for a single account
codex-pool quota check <account-id>

# Monitor all accounts in real time
codex-pool quota monitor
codex-pool quota monitor -i 30  # refresh every 30 seconds
```

### Pool Management

```bash
# Show pool status
codex-pool pool status

# Show the current OpenCode account
codex-pool pool current

# Select an account (acquire a lease)
codex-pool pool rotate
codex-pool pool use <account-id>

# List leases
codex-pool pool lease list

# Release a lease
codex-pool pool lease release <lease-id>
```

## Architecture

### Project Structure

```
gpt-codex-pool/
├── packages/
│   ├── core/           # Core logic (account pool, encryption, quota parsing)
│   ├── browser/        # Browser automation
│   └── cli/            # Command-line interface
├── docs/               # Documentation
├── AGENTS.md           # Project knowledge base (AI-assisted development guide)
├── packages/core/AGENTS.md      # Core package knowledge base
├── packages/cli/AGENTS.md       # CLI package knowledge base
├── packages/browser/AGENTS.md   # Browser package knowledge base
└── README.md
```

### Core Components

1. **AccountPool**: manages account sets, health checks, cooldowns, and rotation strategy
2. **CredentialStorage**: securely stores and retrieves account credentials
3. **ChatGPTAuthBrowser**: Playwright browser automation for login
4. **CodexQuotaParser**: parses Codex quota information
5. **EncryptionService**: AES-256-GCM encryption service

### Dependencies

```
CLI (@codex-pool/cli)
├── @codex-pool/core      # Account pool, encryption, quota parsing
├── @codex-pool/browser   # Browser automation
└── commander, chalk, ora # CLI utilities

Browser (@codex-pool/browser)
├── @codex-pool/core      # Type definitions
└── playwright            # Browser automation

Core (@codex-pool/core)
├── zod                   # Runtime validation
└── nanoid                # ID generation
```

### Security Features

- All credentials are encrypted with AES-256-GCM
- The master key is provided through an environment variable and is not stored in code
- PBKDF2 key derivation is supported
- Session file permissions are kept restrictive

## Development Guide

### Development Environment

```bash
# Install dependencies
npm install

# Development mode (watch files)
npm run dev

# Build
npm run build

# TypeScript typecheck
npm run typecheck

# Lint
npm run lint
```

### Project Conventions

This project follows these conventions:

- **Naming**: classes use PascalCase, methods use camelCase, and private members use the `_` prefix
- **Imports**: relative paths use the `.js` extension for ESM compatibility, and Node.js built-ins use the `node:` prefix
- **Types**: all public APIs use explicit return types, `null` means "no result", and `undefined` means optional

See [AGENTS.md](AGENTS.md) and the AGENTS files under each package for more details.

### Development Status

**Current version**: v1.0.0

**Known limitations**:
- Test coverage: not added yet (infrastructure is still being prepared)
- Logging: still using `console` (structured logging is planned)
- Config validation: still using TypeScript types (Zod schema work is planned)

### Related Documentation

- [AGENTS.md](AGENTS.md) - project knowledge base (architecture, conventions, code map)
- [docs/environment.md](docs/environment.md) - environment variable setup guide
- [docs/examples.md](docs/examples.md) - usage examples and scenarios

## Notes

1. **Personal use**: this tool is intended for managing your own ChatGPT Plus/Pro accounts
2. **Follow the ToS**: please use this tool in accordance with OpenAI's terms of service
3. **Secure storage**: keep `CODEX_POOL_MASTER_KEY` safe, because losing it means your credentials cannot be decrypted
4. **Session lifetime**: ChatGPT sessions usually expire and need periodic re-login

## Troubleshooting

### Session Expired

```bash
# Validate the session
codex-pool auth validate <account-id>

# Log in again if needed
codex-pool auth login
```

### Quota Exhausted

The account will enter `cooldown`, and the system will rotate to other available accounts automatically.

### Browser Login Failed

- Make sure your network can access ChatGPT
- Check whether a captcha or manual verification is required
- Try the default non-headless flow

## License

MIT License - see [LICENSE](LICENSE) for details.

## Disclaimer

This project is an independent open source project and is not affiliated with OpenAI. ChatGPT, GPT-5, and Codex are trademarks of OpenAI.
