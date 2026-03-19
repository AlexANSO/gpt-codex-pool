import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { join } from 'node:path';
import { mkdir, readFile, rmdir, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

export interface AuthSession {
  storageState: string;
  cookies: Record<string, string>;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface LoginOptions {
  headless?: boolean;
  timeout?: number;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  userDataDir?: string;
}

export class ChatGPTAuthBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private options: LoginOptions = {}) {}

  async initialize(): Promise<void> {
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.options.headless ?? false,
      timeout: this.options.timeout || 60000,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-accelerated-jpeg-decoding',
        '--disable-accelerated-mjpeg-decode',
        '--disable-accelerated-video-decode',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--no-first-run',
        '--password-store=basic',
        '--use-mock-keychain',
        '--window-size=1920,1080',
        '--start-maximized'
      ]
    };

    if (this.options.proxy) {
      launchOptions.proxy = this.options.proxy;
    }

    this.browser = await chromium.launch(launchOptions);
  }

  async startLoginSession(): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const contextOptions: Parameters<typeof this.browser.newContext>[0] = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: [],
      bypassCSP: true,
      javaScriptEnabled: true
    };

    this.context = await this.browser.newContext(contextOptions);
    
    // Inject stealth scripts to hide automation
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
      
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' 
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters)
      );

      // Hide Playwright-specific properties
      delete (window as any).__playwright;
      delete (window as any).__pw_manual;
      delete (window as any).__pw_script;
    });

    this.page = await this.context.newPage();

    // Try to navigate with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        await this.page.goto('https://chat.openai.com/auth/login', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Wait a bit for Cloudflare challenge to complete
    await new Promise(r => setTimeout(r, 3000));
  }

  async waitForLoginComplete(timeout: number = 300000): Promise<boolean> {
    if (!this.page) {
      throw new Error('Login session not started. Call startLoginSession() first.');
    }

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const url = this.page.url();
        
        // Check if we're on the chat page
        if (url.includes('/c/') || url === 'https://chat.openai.com/' || url.includes('/gpts')) {
          // Wait a bit more to ensure everything is loaded
          await new Promise(r => setTimeout(r, 2000));
          return true;
        }

        // Check for chat input (logged in indicator)
        const chatElement = await this.page.$('textarea[placeholder*="Message"], textarea[placeholder*="Ask"], [data-testid*="conversation"]').catch(() => null);
        if (chatElement) {
          await new Promise(r => setTimeout(r, 2000));
          return true;
        }

        // Check for "New chat" button (another logged in indicator)
        const newChatBtn = await this.page.$('text=New chat, button, a').catch(() => null);
        if (newChatBtn) {
          await new Promise(r => setTimeout(r, 2000));
          return true;
        }

        // Wait before checking again
        await new Promise(r => setTimeout(r, 1000));
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return false;
  }

  async captureSession(): Promise<AuthSession> {
    if (!this.context) {
      throw new Error('No active context to capture session from.');
    }

    const storageDir = await mkdtemp(join(tmpdir(), 'codex-pool-session-'));
    const storageStatePath = join(storageDir, 'storage-state.json');

    try {
      await this.context.storageState({ path: storageStatePath });
      const storageState = await readFile(storageStatePath, 'utf8');

      const cookies: Record<string, string> = {};
      const cookiesList = await this.context.cookies();

      for (const cookie of cookiesList) {
        if (cookie.domain.includes('openai.com') || cookie.domain.includes('chatgpt.com')) {
          cookies[cookie.name] = cookie.value;
        }
      }

      let accessToken: string | undefined;
      try {
        if (this.page) {
          accessToken = await this.page.evaluate((): string | undefined => {
            return (window as any).localStorage.getItem('accessToken') ||
                   (window as any).localStorage.getItem('oai::accessToken') ||
                   (window as any).sessionStorage.getItem('accessToken') ||
                   (window as any).localStorage.getItem('session') ||
                   undefined;
          });
        }
      } catch (error) {
        console.debug('Failed to access localStorage for accessToken:', error);
      }

      return {
        storageState,
        cookies,
        accessToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };
    } finally {
      try {
        await rmdir(storageDir, { recursive: true });
      } catch {}
    }
  }

  async checkSessionValidity(): Promise<{
    valid: boolean;
    quota?: {
      shortUsed: number;
      shortRemaining: number;
      longUsed: number;
      longRemaining: number;
    };
  }> {
    if (!this.page) {
      return { valid: false };
    }

    try {
      await this.page.goto('https://chat.openai.com/', { 
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for Cloudflare
      await new Promise(r => setTimeout(r, 3000));

      const isLoggedIn = await this.page.evaluate((): boolean => {
        return !!(window as any).document.querySelector('textarea[placeholder*="Message"], textarea[placeholder*="Ask"], [data-testid*="conversation"]');
      });

      if (!isLoggedIn) {
        return { valid: false };
      }

      const quota = await this.extractQuotaFromPage();

      return {
        valid: true,
        quota
      };
    } catch {
      return { valid: false };
    }
  }

  private async extractQuotaFromPage(): Promise<{
    shortUsed: number;
    shortRemaining: number;
    longUsed: number;
    longRemaining: number;
  } | undefined> {
    try {
      // Try to get quota from network response or page data
      const quotaData = await this.page!.evaluate((): any => {
        // Check window.__remixContext (Remix app data)
        const remixContext = (window as any).__remixContext;
        if (remixContext?.state?.loaderData) {
          for (const key in remixContext.state.loaderData) {
            const data = remixContext.state.loaderData[key];
            if (data?.rate_limits || data?.user?.rate_limits) {
              return data.rate_limits || data.user.rate_limits;
            }
          }
        }

        // Check for user object in window
        const user = (window as any).user;
        if (user?.rate_limits) {
          return user.rate_limits;
        }

        return null;
      });

      if (quotaData) {
        return {
          shortUsed: quotaData.primary_used || 0,
          shortRemaining: quotaData.primary_remaining || 0,
          longUsed: quotaData.secondary_used || 0,
          longRemaining: quotaData.secondary_remaining || 0
        };
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.page = null;
  }

  getPage(): Page | null {
    return this.page;
  }
}
