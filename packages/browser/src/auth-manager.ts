import {
  generatePKCE,
  generateState,
  createAuthorizationUrl,
  startLocalServer,
  openBrowser,
  exchangeCodeForTokens,
  type OAuthServer
} from './oauth-server';
import type { AuthSession } from './auth-browser';
import readline from 'node:readline';

export interface LoginResult {
  success: boolean;
  session?: AuthSession;
  error?: string;
}

export class AuthManager {
  private server: OAuthServer | null = null;

  async startInteractiveLogin(): Promise<LoginResult> {
    const pkce = generatePKCE();
    const state = generateState();
    const authUrl = createAuthorizationUrl(pkce, state);

    console.log('\\n=== ChatGPT OAuth Login ===\\n');

    this.server = await startLocalServer(state);
    
    if (this.server.ready) {
      console.log('Local server started on http://localhost:1455');
      
      const opened = openBrowser(authUrl);
      if (opened) {
        console.log('Browser opened automatically');
      } else {
        console.log('Please open this URL manually:');
      }
      
      console.log(`\\n${authUrl}\\n`);
      console.log('Waiting for login (timeout: 60s)...\\n');

      const result = await this.server.waitForCode();
      this.server.close();

      if (!result) {
        return {
          success: false,
          error: 'Login timeout - did not receive authorization code within 60 seconds'
        };
      }

      console.log('Authorization code received');
      console.log('Exchanging for tokens...');

      const session = await exchangeCodeForTokens(result.code, pkce.verifier);
      
      if (!session) {
        return {
          success: false,
          error: 'Failed to exchange authorization code for tokens'
        };
      }

      console.log('Login successful!');
      return { success: true, session };
    } else {
      console.log('Could not start local server. Using manual mode.\\n');
      console.log('Please open this URL in your browser:');
      console.log(`\\n${authUrl}\\n`);
      console.log('After login, copy the code from the callback URL.\\n');

      const code = await this.promptForCode();
      
      if (!code) {
        return {
          success: false,
          error: 'No authorization code provided'
        };
      }

      const session = await exchangeCodeForTokens(code, pkce.verifier);
      
      if (!session) {
        return {
          success: false,
          error: 'Failed to exchange authorization code for tokens'
        };
      }

      return { success: true, session };
    }
  }

  private promptForCode(): Promise<string | null> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('Paste authorization code: ', (code) => {
        rl.close();
        resolve(code.trim() || null);
      });
    });
  }

  async validateSession(session: AuthSession): Promise<{ valid: boolean; error?: string }> {
    if (!session.accessToken) {
      return { valid: false, error: 'No access token in session' };
    }

    if (session.expiresAt) {
      const now = new Date();
      if (session.expiresAt < now) {
        return { valid: false, error: 'Session has expired' };
      }
    }

    return { valid: true };
  }

  async close(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

export * from './auth-browser';
export * from './oauth-server';
