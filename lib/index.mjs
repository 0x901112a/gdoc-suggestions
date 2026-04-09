/**
 * gdoc-suggestions — Programmatic Google Docs suggestions via Playwright.
 *
 * Mirrors the Google Docs API conventions so migration is minimal
 * if Google ever adds native suggestion support.
 */

import { launchHeadless, login } from './auth.mjs';
import { resolveInsert, resolveRange, resolveText } from './anchor-resolver.mjs';
import {
  navigateToDoc,
  switchToSuggestingMode,
  findAndSelect,
  findAndReplace,
  positionCursor,
  extendSelection,
  insertTextSuggestion,
  replaceSelectedSuggestion,
  deleteSelectedSuggestion,
  formatSelectedSuggestion,
  rejectAllSuggestions,
  readDocTextFromPage,
} from './browser-executor.mjs';

export class GDocSuggestions {
  #docId;
  #docUrl;
  #page;
  #context;
  #docText;
  #getDocContent; // function to read doc via API

  constructor(docId, page, context, getDocContent) {
    this.#docId = docId;
    this.#docUrl = `https://docs.google.com/document/d/${docId}/edit`;
    this.#page = page;
    this.#context = context;
    this.#getDocContent = getDocContent;
    this.#docText = null;
  }

  /**
   * Open a Google Doc and prepare for suggestion operations.
   *
   * @param {string} docId - Google Doc ID
   * @param {object} [opts]
   * @param {function} [opts.getDocContent] - async function(docId) that returns the doc plain text.
   *   If not provided, reads text from the browser's accessibility tree.
   * @returns {GDocSuggestions}
   */
  static async open(docId, opts = {}) {
    const { context } = await launchHeadless();
    const page = context.pages()[0] || await context.newPage();

    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
    await navigateToDoc(page, docUrl);
    await switchToSuggestingMode(page);

    const instance = new GDocSuggestions(docId, page, context, opts.getDocContent || null);
    await instance.#refreshDocText();

    return instance;
  }

  /** Re-read document text. Uses API if provided, otherwise reads from page. */
  async #refreshDocText() {
    if (this.#getDocContent) {
      this.#docText = await this.#getDocContent(this.#docId);
    } else {
      this.#docText = await readDocTextFromPage(this.#page);
    }
  }

  /** Get current document text (for external inspection). */
  get docText() {
    return this.#docText;
  }

  // ─── Index-based operations (mirrors Google Docs API) ───

  /**
   * Suggest inserting text at a specific index.
   * Mirrors: InsertTextRequest
   *
   * @param {object} opts
   * @param {number} opts.index - Character index for insertion
   * @param {string} opts.text - Text to insert
   * @param {object} [opts.style] - Optional style (e.g., { color: 'light gray 1' })
   */
  async suggestInsertText({ index, text, style }) {
    const { findQuery, matchNum, cursorOps } = resolveInsert(this.#docText, index);

    await findAndSelect(this.#page, findQuery, matchNum);
    await positionCursor(this.#page, cursorOps);
    await insertTextSuggestion(this.#page, text, style);

    await this.#refreshDocText();
  }

  /**
   * Suggest deleting a range of text.
   * Mirrors: DeleteContentRangeRequest
   *
   * @param {object} opts
   * @param {number} opts.startIndex
   * @param {number} opts.endIndex
   */
  async suggestDeleteText({ startIndex, endIndex }) {
    const targetText = this.#docText.slice(startIndex, endIndex);
    const { findQuery, matchNum, extendRight } = resolveRange(this.#docText, startIndex, endIndex);

    if (extendRight > 0 && !targetText.includes('\n')) {
      // Long text — use Find & Replace with empty string (creates delete suggestion)
      const resolvedMatch = resolveText(this.#docText, targetText, matchNum);
      await findAndReplace(this.#page, targetText, '', resolvedMatch.matchNum);
    } else {
      // Short text — use Find + Escape + Backspace
      await findAndSelect(this.#page, findQuery, matchNum);
      await deleteSelectedSuggestion(this.#page);
    }

    await this.#refreshDocText();
  }

  /**
   * Suggest replacing a range of text.
   * Mirrors: ReplaceAllTextRequest (index-based variant)
   *
   * @param {object} opts
   * @param {number} opts.startIndex
   * @param {number} opts.endIndex
   * @param {string} opts.text - Replacement text
   * @param {object} [opts.style] - Optional style for the replacement text
   */
  async suggestReplaceText({ startIndex, endIndex, text, style }) {
    const { findQuery, matchNum, extendRight } = resolveRange(this.#docText, startIndex, endIndex);

    await findAndSelect(this.#page, findQuery, matchNum);
    if (extendRight > 0) await extendSelection(this.#page, extendRight);
    await replaceSelectedSuggestion(this.#page, text, style);

    await this.#refreshDocText();
  }

  /**
   * Suggest formatting a range of text.
   * Mirrors: UpdateTextStyleRequest
   *
   * @param {object} opts
   * @param {number} opts.startIndex
   * @param {number} opts.endIndex
   * @param {boolean} [opts.bold]
   * @param {boolean} [opts.italic]
   * @param {boolean} [opts.underline]
   * @param {string} [opts.color] - Text color name
   */
  async suggestFormatText({ startIndex, endIndex, bold, italic, underline, color }) {
    const { findQuery, matchNum, extendRight } = resolveRange(this.#docText, startIndex, endIndex);

    await findAndSelect(this.#page, findQuery, matchNum);
    if (extendRight > 0) await extendSelection(this.#page, extendRight);
    await formatSelectedSuggestion(this.#page, { bold, italic, underline, color });

    await this.#refreshDocText();
  }

  // ─── Text-based operations (ergonomic for LLMs) ───

  /**
   * Suggest find-and-replace.
   * Mirrors: ReplaceAllTextRequest
   *
   * @param {object} opts
   * @param {string} opts.findText - Text to find
   * @param {string} opts.replaceText - Replacement text
   * @param {number} [opts.matchNum] - Which occurrence to target (1-based).
   *   Required if findText appears multiple times. Omit for unique text.
   * @param {object} [opts.style] - Optional style for the replacement text
   */
  async suggestFindReplace({ findText, replaceText, matchNum: requestedMatch, style }) {
    const { matchNum } = resolveText(this.#docText, findText, requestedMatch);

    // Use Find & Replace dialog — no character limit, handles long text
    await findAndReplace(this.#page, findText, replaceText, matchNum);

    await this.#refreshDocText();
  }

  // ─── Batch operations ───

  /**
   * Execute multiple suggestion operations in sequence.
   * Re-reads the document after each operation to keep indices accurate.
   *
   * @param {object[]} operations - Array of operation objects, each with a `type` field.
   */
  async suggestBatchUpdate(operations) {
    for (const op of operations) {
      switch (op.type) {
        case 'suggest_insert_text':
          await this.suggestInsertText(op);
          break;
        case 'suggest_delete_text':
          await this.suggestDeleteText(op);
          break;
        case 'suggest_replace_text':
          await this.suggestReplaceText(op);
          break;
        case 'suggest_format_text':
          await this.suggestFormatText(op);
          break;
        case 'suggest_find_replace':
          await this.suggestFindReplace(op);
          break;
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }
    }
  }

  /**
   * Reject all pending suggestions in the document.
   * Useful for test cleanup.
   *
   * @returns {number} Number of suggestions rejected
   */
  async rejectAllSuggestions() {
    const count = await rejectAllSuggestions(this.#page);
    if (count > 0) {
      try { await this.#refreshDocText(); } catch { /* text read may fail after bulk reject */ }
    }
    return count;
  }

  /**
   * Close the browser session.
   */
  async close() {
    await this.#context.close();
  }
}

export { login } from './auth.mjs';
