/**
 * Browser Executor — Playwright automation for Google Docs suggesting mode.
 */

const DELAY = {
  short: 200,
  medium: 400,
  long: 1000,
  afterEdit: 1500,
};

/**
 * Navigate to a Google Doc and wait for it to load.
 */
export async function navigateToDoc(page, docUrl) {
  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(DELAY.long * 3);

  const title = await page.title();
  if (title.includes('Sign-in') || title.includes('Accounts')) {
    throw new Error('Not authenticated. Run login() first.');
  }

  // Click to focus the document body
  await page.mouse.click(400, 300);
  await page.waitForTimeout(DELAY.medium);

  return title;
}

/**
 * Switch to Suggesting mode by clicking the mode switcher button.
 */
export async function switchToSuggestingMode(page) {
  // Check current mode
  const modeBtn = page.locator('#docs-toolbar-mode-switcher');
  const modeText = await modeBtn.textContent();

  if (modeText.includes('Suggesting')) return; // already in suggesting mode

  // Click the mode switcher to open dropdown
  await modeBtn.click();
  await page.waitForTimeout(DELAY.medium);

  // Click the Suggesting option
  await page.getByRole('menuitemradio', { name: /Suggesting/ }).click();
  await page.waitForTimeout(DELAY.long);
}

/**
 * Use Find dialog to locate and select text.
 *
 * @param {Page} page - Playwright page
 * @param {string} query - Text to search for
 * @param {number} matchNum - Which occurrence to select (1-based)
 * @returns {void}
 */
export async function findAndSelect(page, query, matchNum = 1) {
  // Open Find
  await page.keyboard.press('Meta+f');
  await page.waitForTimeout(DELAY.medium);

  // Type the search query
  await page.keyboard.type(query, { delay: 10 });
  await page.waitForTimeout(DELAY.medium);

  // Cycle to the Nth match
  for (let i = 1; i < matchNum; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(DELAY.short);
  }

  // Close Find — found text stays selected
  await page.keyboard.press('Escape');
  await page.waitForTimeout(DELAY.short);
}

/**
 * Use Find & Replace dialog to replace text directly.
 * No character limit on the Find/Replace fields.
 * Works in suggesting mode — creates a Replace suggestion.
 *
 * @param {Page} page
 * @param {string} findText - Text to find
 * @param {string} replaceText - Replacement text
 * @param {number} matchNum - Which occurrence (1-based). Use 0 for "Replace All".
 */
export async function findAndReplace(page, findText, replaceText, matchNum = 1) {
  // Open Find & Replace
  await page.keyboard.press('Meta+Shift+h');
  await page.waitForTimeout(DELAY.long);

  // Fill the Find and Replace fields using getByRole
  const findInput = page.getByRole('textbox', { name: 'Find' });
  const replaceInput = page.getByRole('textbox', { name: 'Replace with' });

  await findInput.click();
  await findInput.fill(findText);
  await page.waitForTimeout(DELAY.medium);

  await replaceInput.click();
  await replaceInput.fill(replaceText);
  await page.waitForTimeout(DELAY.medium);

  // Wait for the buttons to become enabled (they're disabled until a match is found)
  await page.waitForTimeout(DELAY.medium);

  if (matchNum === 0) {
    // Replace All
    await page.getByRole('button', { name: 'Replace all' }).click();
  } else {
    // Click "Next" to cycle to the Nth match
    for (let i = 1; i < matchNum; i++) {
      await page.getByRole('button', { name: 'Next' }).click();
      await page.waitForTimeout(DELAY.short);
    }
    // Click Replace (single) — exact: true to avoid matching "Replace all"
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
  }
  await page.waitForTimeout(DELAY.afterEdit);

  // Close the dialog
  await page.keyboard.press('Escape');
  await page.waitForTimeout(DELAY.short);
}

/**
 * Execute cursor positioning operations after Find.
 *
 * @param {Page} page
 * @param {string[]} ops - Array of key names to press in sequence
 */
export async function positionCursor(page, ops) {
  for (const op of ops) {
    await page.keyboard.press(op);
  }
  await page.waitForTimeout(100);
}

/**
 * Extend the current selection to cover additional characters.
 * Used when Find selects only a partial match (text longer than 40 chars).
 *
 * @param {Page} page
 * @param {number} charsToRight - Number of characters to extend rightward
 * @param {number} charsToLeft - Number of characters to extend leftward
 */
export async function extendSelection(page, charsToRight = 0, charsToLeft = 0) {
  // Small batches with delays to ensure Google Docs processes each keystroke
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
 *
 * @param {Page} page
 * @param {string} colorName - e.g., 'light gray 1', 'black', 'red'
 */
export async function setTextColor(page, colorName) {
  const btn = page.locator('#textColorButton');
  const box = await btn.boundingBox();
  if (!box) throw new Error('Text color button not found');

  // Click the dropdown arrow (right edge of button)
  await page.mouse.click(box.x + box.width - 3, box.y + box.height / 2);
  await page.waitForTimeout(DELAY.medium);

  await page.getByRole('gridcell', { name: colorName }).click();
  await page.waitForTimeout(DELAY.short);
}

/**
 * Insert text at the current cursor position as a suggestion.
 * Optionally applies text styling before insertion (Approach A).
 *
 * @param {Page} page
 * @param {string} text - Text to insert
 * @param {object} [style] - Optional style to apply before inserting
 * @param {string} [style.color] - Text color name (e.g., 'light gray 1')
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
 *
 * Uses keyboard.type() for the first character (which replaces the selection
 * and creates the suggestion), then insertText() for the rest (instant).
 *
 * @param {Page} page
 * @param {string} text - Replacement text
 * @param {object} [style] - Optional style for the replacement text
 */
export async function replaceSelectedSuggestion(page, text, style) {
  if (!text || text.length === 0) {
    // Empty replacement = delete
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(DELAY.afterEdit);
    return;
  }

  if (style?.color) {
    await setTextColor(page, style.color);
  }

  // Type the first character — this replaces the selection and creates the suggestion
  await page.keyboard.type(text[0]);
  await page.waitForTimeout(DELAY.short);

  // Insert the rest instantly via insertText
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
 *
 * @param {Page} page
 * @param {object} format
 * @param {boolean} [format.bold]
 * @param {boolean} [format.italic]
 * @param {boolean} [format.underline]
 * @param {string} [format.color] - Text color name
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
 * Scrolls through the doc to find all suggestion reject buttons.
 */
export async function rejectAllSuggestions(page) {
  let totalRejected = 0;

  // Keep rejecting until no more reject buttons are found
  while (true) {
    const rejectBtn = page.getByRole('button', { name: 'Reject suggestion' }).first();
    const isVisible = await rejectBtn.isVisible().catch(() => false);

    if (!isVisible) break;

    await rejectBtn.click();
    await page.waitForTimeout(DELAY.long);
    totalRejected++;
  }

  return totalRejected;
}

/**
 * Read the full document text by exporting it as plain text.
 *
 * Uses the browser's authenticated session to fetch the doc export URL.
 * This returns the complete text without truncation.
 *
 * @param {Page} page
 * @returns {string} The document plain text
 */
export async function readDocTextFromPage(page) {
  // Extract doc ID from the current URL
  const url = page.url();
  const docIdMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (!docIdMatch) {
    throw new Error('Cannot determine doc ID from URL: ' + url);
  }
  const docId = docIdMatch[1];

  // Fetch the plain text export using the browser's authenticated session
  const result = await page.evaluate(async (id) => {
    const resp = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`);
    if (!resp.ok) throw new Error(`Export failed: ${resp.status} ${resp.statusText}`);
    return await resp.text();
  }, docId);

  if (!result || result.length < 1) {
    throw new Error('Document export returned empty text.');
  }

  // The export may have extra whitespace/BOM — clean it up
  return result.replace(/^\uFEFF/, '').trim();
}
