import http from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import type { AuthSession } from './auth-browser';

const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const SCOPE = 'openid profile email offline_access';

interface PKCEChallenge {
  verifier: string;
  challenge: string;
}

export interface OAuthServer {
  port: number;
  ready: boolean;
  close: () => void;
  waitForCode: () => Promise<{ code: string } | null>;
}

function generatePKCE(): PKCEChallenge {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function createAuthorizationUrl(pkce: PKCEChallenge, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  url.searchParams.set('originator', 'codex_cli_rs');
  
  return url.toString();
}

export async function startLocalServer(state: string): Promise<OAuthServer> {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '', `http://localhost:1455`);
      
      if (url.pathname !== '/auth/callback') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      if (url.searchParams.get('state') !== state) {
        res.statusCode = 400;
        res.end('State mismatch');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      
      if (error) {
        res.statusCode = 400;
        res.end(`OAuth error: ${error}`);
        return;
      }

      if (!code) {
        res.statusCode = 400;
        res.end('Missing authorization code');
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Login Successful</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #10a37f; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✓ Login Successful</h1>
    <p>You can close this window and return to the terminal.</p>
  </div>
</body>
</html>
      `);

      (server as any)._lastCode = code;
    } catch {
      res.statusCode = 500;
      res.end('Internal error');
    }
  });

  return new Promise((resolve) => {
    server
      .listen(1455, '127.0.0.1', () => {
        resolve({
          port: 1455,
          ready: true,
          close: () => server.close(),
          waitForCode: async () => {
            for (let i = 0; i < 600; i++) {
              const code = (server as any)._lastCode;
              if (code) return { code };
              await new Promise(r => setTimeout(r, 100));
            }
            return null;
          }
        });
      })
      .on('error', (err: any) => {
        console.error(`[OAuth] Failed to bind port 1455 (${err?.code}). Falling back to manual mode.`);
        resolve({
          port: 1455,
          ready: false,
          close: () => { try { server.close(); } catch {} },
          waitForCode: async () => null
        });
      });
  });
}

export function openBrowser(url: string): boolean {
  const platform = process.platform;
  let command: string;
  
  if (platform === 'darwin') command = 'open';
  else if (platform === 'win32') command = 'start';
  else command = 'xdg-open';

  try {
    const child = spawn(command, [url], {
      stdio: 'ignore',
      shell: platform === 'win32',
      detached: true
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function exchangeCodeForTokens(
  code: string, 
  codeVerifier: string
): Promise<AuthSession | null> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Token exchange failed:', error);
      return null;
    }

    const data = await response.json();
    
    return {
      storageState: JSON.stringify(data),
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      cookies: {},
      expiresAt: new Date(Date.now() + data.expires_in * 1000)
    };
  } catch (error) {
    console.error('Failed to exchange code:', error);
    return null;
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthSession | null> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Token refresh failed:', error);
      return null;
    }

    const data = await response.json();
    
    return {
      storageState: JSON.stringify(data),
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      cookies: {},
      expiresAt: new Date(Date.now() + data.expires_in * 1000)
    };
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return null;
  }
}

export { generatePKCE, generateState, REDIRECT_URI };
