/**
 * Browser Executor — Playwright automation for Google Docs suggesting mode.
 *
 * Uses event-based waits (waitForSelector, waitForFunction) where possible,
 * with fixed timeouts only for operations where no DOM event is available
 * (e.g., post-keystroke pauses, waiting for canvas rendering).
 */

const DELAY = {
  short: 200,    // post-keystroke pauses (no DOM event available)
  afterEdit: 1500, // waiting for Google Docs to process a suggestion
};

const WAIT_TIMEOUT = 10000; // max wait for UI elements to appear

/**
 * Navigate to a Google Doc and wait for it to load.
 */
export async function navigateToDoc(page, docUrl) {
  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.locator('#docs-toolbar-mode-switcher').waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });

  const title = await page.title();
  if (title.includes('Sign-in') || title.includes('Accounts')) {
    throw new Error('Not authenticated. Run login() first.');
  }

  await page.mouse.click(400, 300);
  await page.waitForTimeout(DELAY.short);

  return title;
}

/**
 * Switch to Suggesting mode by clicking the mode switcher button.
 */
export async function switchToSuggestingMode(page) {
  const modeBtn = page.locator('#docs-toolbar-mode-switcher');
  const modeText = await modeBtn.textContent();

  if (modeText.includes('Suggesting')) return;

  await modeBtn.click();

  const suggestingOption = page.getByRole('menuitemradio', { name: /Suggesting/ });
  await suggestingOption.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await suggestingOption.click();

  await page.waitForFunction(
    () => document.querySelector('#docs-toolbar-mode-switcher')?.textContent?.includes('Suggesting'),
    { timeout: WAIT_TIMEOUT }
  );
}

/**
 * Use Find dialog to locate and select text.
 */
export async function findAndSelect(page, query, matchNum = 1) {
  await page.keyboard.press('Meta+f');

  await page.locator('[aria-label="Find in document…"], [aria-label="Find in document"], input[name="Find"]').first()
    .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT })
    .catch(() => page.waitForTimeout(500));

  await page.keyboard.type(query, { delay: 10 });
  await page.waitForTimeout(DELAY.short);

  for (let i = 1; i < matchNum; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(DELAY.short);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(DELAY.short);
}

/**
 * Use Find & Replace dialog to replace text directly.
 */
export async function findAndReplace(page, findText, replaceText, matchNum = 1) {
  await page.keyboard.press('Meta+Shift+h');

  const findInput = page.getByRole('textbox', { name: 'Find' });
  await findInput.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });

  const replaceInput = page.getByRole('textbox', { name: 'Replace with' });

  await findInput.click();
  await findInput.fill(findText);

  await replaceInput.click();
  await replaceInput.fill(replaceText);

  const replaceBtn = page.getByRole('button', { name: 'Replace', exact: true });
  await replaceBtn.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await page.waitForFunction(
    (btnName) => {
      const btns = [...document.querySelectorAll('button')];
      const btn = btns.find(b => b.textContent?.trim() === btnName && !b.textContent?.includes('all'));
      return btn && !btn.disabled;
    },
    'Replace',
    { timeout: WAIT_TIMEOUT }
  ).catch(() => page.waitForTimeout(500));

  if (matchNum === 0) {
    await page.getByRole('button', { name: 'Replace all' }).click();
  } else {
    for (let i = 1; i < matchNum; i++) {
      await page.getByRole('button', { name: 'Next' }).click();
      await page.waitForTimeout(DELAY.short);
    }
    await replaceBtn.click();
  }
  await page.waitForTimeout(DELAY.afterEdit);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(DELAY.short);
}

/**
 * Execute cursor positioning operations after Find.
 */
export async function positionCursor(page, ops) {
  for (const op of ops) {
    await page.keyboard.press(op);
  }
  await page.waitForTimeout(100);
}

/**
 * Extend the current selection to cover additional characters.
 */
export async function extendSelection(page, charsToRight = 0) {
  const BATCH_SIZE = 5;
  for (let i = 0; i < charsToRight; i++) {
    await page.keyboard.press('Shift+ArrowRight');
    if ((i + 1) % BATCH_SIZE === 0) {
      await page.waitForTimeout(50);
    }
  }
  await page.waitForTimeout(DELAY.short);
}

/**
 * Set the text color via the toolbar dropdown.
 */
export async function setTextColor(page, colorName) {
  const btn = page.locator('#textColorButton');
  const box = await btn.boundingBox();
  if (!box) throw new Error('Text color button not found');

  await page.mouse.click(box.x + box.width - 3, box.y + box.height / 2);

  const colorCell = page.getByRole('gridcell', { name: colorName });
  await colorCell.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await colorCell.click();
  await page.waitForTimeout(DELAY.short);
}

/**
 * Insert text at the current cursor position as a suggestion.
 */
export async function insertTextSuggestion(page, text, style) {
  if (style?.color) {
    await setTextColor(page, style.color);
  }

  await page.keyboard.insertText(text);
  await page.waitForTimeout(DELAY.afterEdit);

  if (style?.color) {
    await setTextColor(page, 'black');
  }
}

/**
 * Replace the currently selected text with new text as a suggestion.
 */
export async function replaceSelectedSuggestion(page, text, style) {
  if (!text) {
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(DELAY.afterEdit);
    return;
  }

  if (style?.color) {
    await setTextColor(page, style.color);
  }

  await page.keyboard.type(text[0]);
  await page.waitForTimeout(DELAY.short);

  if (text.length > 1) {
    await page.keyboard.insertText(text.slice(1));
  }
  await page.waitForTimeout(DELAY.afterEdit);

  if (style?.color) {
    await setTextColor(page, 'black');
  }
}

/**
 * Delete the currently selected text as a suggestion.
 */
export async function deleteSelectedSuggestion(page) {
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(DELAY.afterEdit);
}

/**
 * Apply formatting to the currently selected text as a suggestion.
 */
export async function formatSelectedSuggestion(page, format) {
  if (format.bold) {
    await page.keyboard.press('Meta+b');
    await page.waitForTimeout(DELAY.short);
  }
  if (format.italic) {
    await page.keyboard.press('Meta+i');
    await page.waitForTimeout(DELAY.short);
  }
  if (format.underline) {
    await page.keyboard.press('Meta+u');
    await page.waitForTimeout(DELAY.short);
  }
  if (format.color) {
    await setTextColor(page, format.color);
  }
  await page.waitForTimeout(DELAY.afterEdit);
}

/**
 * Reject all visible suggestions in the document.
 */
export async function rejectAllSuggestions(page) {
  let totalRejected = 0;

  while (true) {
    const rejectBtn = page.getByRole('button', { name: 'Reject suggestion' }).first();
    const isVisible = await rejectBtn.isVisible().catch(() => false);

    if (!isVisible) break;

    await rejectBtn.click();
    await rejectBtn.waitFor({ state: 'hidden', timeout: WAIT_TIMEOUT }).catch(() => page.waitForTimeout(1000));
    totalRejected++;
  }

  return totalRejected;
}

/**
 * Read the full document text by exporting it as plain text.
 */
export async function readDocTextFromPage(page) {
  const url = page.url();
  const docIdMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (!docIdMatch) {
    throw new Error('Cannot determine doc ID from URL: ' + url);
  }
  const docId = docIdMatch[1];

  const result = await page.evaluate(async (id) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`);
      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      if (!resp.ok) throw new Error(`Export failed: ${resp.status} ${resp.statusText}`);
      return await resp.text();
    }
    throw new Error('Export failed: rate limited after 3 retries');
  }, docId);

  if (!result || result.length < 1) {
    throw new Error('Document export returned empty text.');
  }

  return result.replace(/^\uFEFF/, '').trim();
}
