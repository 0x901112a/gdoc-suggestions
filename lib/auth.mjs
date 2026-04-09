import { chromium } from 'playwright';
import { resolve } from 'path';
import { existsSync } from 'fs';

const DEFAULT_USER_DATA_DIR = resolve(process.env.HOME, '.google-docs-automation');

export async function login(userDataDir = DEFAULT_USER_DATA_DIR) {
  console.log('Launching headed browser for Google login...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://accounts.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('Waiting for Google login (up to 5 minutes)...');
  // Poll until we detect a logged-in state
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(1000);
    const title = await page.title();
    const url = page.url();
    if (url.includes('myaccount.google.com') || title.includes('Google Account') ||
        (!title.includes('Sign in') && !title.includes('Sign-in') && !title.includes('Accounts') && i > 5)) {
      console.log('Login detected!');
      break;
    }
  }

  await context.close();
  console.log('Auth state saved to:', userDataDir);
  return userDataDir;
}

export async function launchHeadless(userDataDir = DEFAULT_USER_DATA_DIR) {
  if (!existsSync(userDataDir)) {
    throw new Error(`No auth state found at ${userDataDir}. Run login() first.`);
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  return { context, chromium };
}

export { DEFAULT_USER_DATA_DIR };
