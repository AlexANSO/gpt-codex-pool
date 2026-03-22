# Example: Logging In and Managing Accounts

## Scenario 1: Single Account Setup

```bash
# 1. Set your encryption key
export CODEX_POOL_MASTER_KEY="my-super-secret-master-key-32-chars-long"

# 2. Login in the browser
codex-pool auth login
# (Browser window opens, login manually)

# Output includes the created/updated account ID, e.g. abc123xyz

# 3. Check quota
codex-pool quota check abc123xyz

# 4. View account details
codex-pool account show abc123xyz
```

## Scenario 2: Multiple Accounts for Load Balancing

```bash
# Login once per account in the browser
codex-pool auth login   # account1@company.com
codex-pool auth login   # account2@company.com
codex-pool auth login   # personal@gmail.com

# Set different priorities (higher = preferred)
# (Edit accounts.json or use API)

# Review the created accounts
codex-pool account list

# Use rotation to distribute load
codex-pool pool rotate
```

## Scenario 3: Monitoring and Alerting

```bash
# Create a monitoring script
#!/bin/bash
# monitor.sh

codex-pool quota monitor -i 60 &
MONITOR_PID=$!

# In another terminal, check for critical accounts
codex-pool account list | while read line; do
  status=$(echo $line | awk '{print $4}')
  if [ "$status" = "critical" ]; then
    echo "ALERT: Account critical - $line" | mail -s "Codex Pool Alert" admin@example.com
  fi
done

trap "kill $MONITOR_PID" EXIT
```

## Scenario 4: Automated Usage in Scripts

```typescript
// example-script.ts
import { PoolManager } from '@codex-pool/cli';

async function processWithCodex(prompt: string) {
  const manager = new PoolManager();
  await manager.initialize();
  
  const pool = manager.getPool();
  const account = pool.selectAccountForRequest();
  
  if (!account) {
    throw new Error('No available accounts');
  }
  
  const lease = pool.acquireLease(account.id, 'my-script', 'processing');
  
  try {
    // Use the account for Codex API call
    const credentials = await manager.getCredentials(account.id);
    // ... make API call ...
    
    return result;
  } finally {
    pool.releaseLease(lease.id);
  }
}
```

## Scenario 5: Health Check Automation

```bash
#!/bin/bash
# health-check.sh - Run via cron every 10 minutes

for id in $(codex-pool account list -s active | awk '{print $1}'); do
  result=$(codex-pool auth validate $id 2>&1)
  
  if echo "$result" | grep -q "Session is invalid"; then
    echo "$(date): Account $id needs re-auth" >> /var/log/codex-pool.log
    codex-pool account show $id | mail -s "Re-auth needed" admin@example.com
  fi
done
```
