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

  const verifyPage = context.pages()[0] || await context.newPage();
  await verifyPage.goto('https://docs.google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const finalUrl = verifyPage.url();
  const finalTitle = await verifyPage.title();
  if (finalUrl.includes('accounts.google.com') || finalTitle.includes('Sign-in') || finalTitle.includes('Sign in')) {
    await context.close();
    throw new Error('Login failed — Google sign-in was not completed within the time limit.');
  }

  await context.close();
  console.log('Auth state saved to:', userDataDir);
  return userDataDir;
}

export async function launchHeadless(userDataDir = DEFAULT_USER_DATA_DIR) {
  if (!existsSync(userDataDir)) {
    throw new Error(`No auth state found at ${userDataDir}. Run login() first.`);
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  } catch (err) {
    if (err.message && (err.message.includes('lock') || err.message.includes('already in use') || err.message.includes('SingletonLock'))) {
      throw new Error(
        `Browser profile is locked (another instance may be running).\n` +
        `Close other gdoc-suggest processes, or delete the lock file:\n` +
        `  rm "${userDataDir}/SingletonLock"`
      );
    }
    throw err;
  }

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://docs.google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const url = page.url();
  const title = await page.title();
  if (url.includes('accounts.google.com') || title.includes('Sign-in') || title.includes('Sign in')) {
    await context.close();
    throw new Error('Google auth expired. Run `gdoc-suggest login` to re-authenticate.');
  }

  return { context };
}
