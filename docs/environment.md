# Environment Setup Guide

## Required Environment Variables

### CODEX_POOL_MASTER_KEY

**Required**: Yes

**Purpose**: Master encryption key for credential storage

**Requirements**:
- Minimum 32 characters
- Strong random string
- Keep secret and backed up

**Example**:
```bash
export CODEX_POOL_MASTER_KEY="$(openssl rand -base64 48)"
```

**Persistence**:
Add to your shell profile:
```bash
# ~/.bashrc or ~/.zshrc
export CODEX_POOL_MASTER_KEY="your-master-key-here"
```

## Optional Environment Variables

### CODEX_POOL_DATA_DIR

**Default**: `~/.codex-pool`

**Purpose**: Override default data directory

```bash
export CODEX_POOL_DATA_DIR="/path/to/custom/data"
```

### CODEX_POOL_LOG_LEVEL

**Default**: `info`

**Options**: `debug`, `info`, `warn`, `error`

```bash
export CODEX_POOL_LOG_LEVEL=debug
```

## Security Best Practices

1. **Never commit .env files**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use strong master key**
   ```bash
   # Generate strong key
   openssl rand -base64 48
   ```

3. **Limit file permissions**
   ```bash
   chmod 700 ~/.codex-pool
   chmod 600 ~/.codex-pool/credentials/*.enc
   ```

4. **Regular backups**
   ```bash
   # Backup (encrypted data is safe to backup)
   tar czf codex-pool-backup-$(date +%Y%m%d).tar.gz ~/.codex-pool
   
   # Remember to backup your master key separately!
   ```

## Docker Environment

```dockerfile
FROM node:20-alpine

ENV CODEX_POOL_MASTER_KEY=""
ENV NODE_ENV=production

WORKDIR /app
COPY . .
RUN npm ci --only=production

CMD ["node", "packages/cli/dist/cli.js"]
```

```bash
# Run with environment
docker run -e CODEX_POOL_MASTER_KEY="$CODEX_POOL_MASTER_KEY" codex-pool
```
