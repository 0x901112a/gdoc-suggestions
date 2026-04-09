/**
 * Anchor Resolver — computes unique Find queries from document text.
 *
 * Given the full document text and a target location (by index or text),
 * determines the optimal Find query and match number to reliably
 * position the cursor in Google Docs' Find dialog.
 */

const MAX_FIND_LENGTH = 40; // Google Docs Find field practical limit

function countOccurrences(text, substring) {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(substring, pos)) !== -1) {
    count++;
    pos += 1;
  }
  return count;
}

function getMatchNumber(text, substring, targetPos) {
  let matchNum = 0;
  let pos = 0;
  while ((pos = text.indexOf(substring, pos)) !== -1) {
    matchNum++;
    if (pos === targetPos) return matchNum;
    pos += 1;
  }
  return -1; // not found at targetPos
}

function findShortestUniqueAround(docText, centerIndex, maxLen = MAX_FIND_LENGTH) {
  // Start with a small window around centerIndex and expand
  for (let len = 5; len <= maxLen; len++) {
    // Try different offsets to center the window
    for (let offset = 0; offset < len; offset++) {
      const start = Math.max(0, centerIndex - offset);
      const end = Math.min(docText.length, start + len);
      const candidate = docText.slice(start, end);

      // Skip if it contains newlines (Find doesn't handle them well)
      if (candidate.includes('\n')) continue;

      if (countOccurrences(docText, candidate) === 1) {
        return { query: candidate, startPos: start };
      }
    }
  }
  return null;
}

/**
 * Resolve a Find query for inserting text at a specific character index.
 *
 * Strategy: find a unique substring near the target index, then compute
 * cursor operations to position exactly at the insertion point.
 *
 * @param {string} docText - Full document text
 * @param {number} index - Character index where text should be inserted
 * @returns {{ findQuery: string, matchNum: number, cursorOps: string[] }}
 */
export function resolveInsert(docText, index) {
  // Find unique text around the insertion point
  const anchor = findShortestUniqueAround(docText, index);

  if (anchor) {
    // Unique substring found. Compute cursor positioning.
    const queryEnd = anchor.startPos + anchor.query.length;
    const cursorOps = [];

    if (index <= anchor.startPos) {
      // Insert point is before or at the start of the anchor
      // After Find+Escape, cursor selects the anchor text.
      // ArrowLeft moves to start of selection, then we may need more ArrowLefts
      cursorOps.push('ArrowLeft');
      const charsBack = anchor.startPos - index;
      for (let i = 0; i < charsBack; i++) cursorOps.push('ArrowLeft');
    } else if (index >= queryEnd) {
      // Insert point is after the anchor
      cursorOps.push('ArrowRight');
      const charsForward = index - queryEnd;
      for (let i = 0; i < charsForward; i++) cursorOps.push('ArrowRight');
    } else {
      // Insert point is inside the anchor text
      // Move to start, then forward to exact position
      cursorOps.push('ArrowLeft');
      const charsForward = index - anchor.startPos;
      for (let i = 0; i < charsForward; i++) cursorOps.push('ArrowRight');
    }

    return { findQuery: anchor.query, matchNum: 1, cursorOps };
  }

  const windowSize = Math.min(20, MAX_FIND_LENGTH);
  const start = Math.max(0, index - windowSize);
  const query = docText.slice(start, Math.min(docText.length, start + windowSize));
  const cleanQuery = query.split('\n')[0];
  const matchNum = getMatchNumber(docText, cleanQuery, start);

  return {
    findQuery: cleanQuery,
    matchNum: matchNum > 0 ? matchNum : 1,
    cursorOps: ['ArrowRight'],
  };
}

/**
 * Resolve a Find query for selecting a range of text (for replace/delete/format).
 *
 * Ideal case: the target text itself is unique and fits in Find.
 * Fallback: use a unique substring within the range + match number.
 *
 * @param {string} docText - Full document text
 * @param {number} startIndex - Start of range
 * @param {number} endIndex - End of range
 * @returns {{ findQuery: string, matchNum: number }}
 */
export function resolveRange(docText, startIndex, endIndex) {
  const targetText = docText.slice(startIndex, endIndex);

  // If the target text fits in Find and is unique, use it directly
  if (targetText.length <= MAX_FIND_LENGTH && !targetText.includes('\n')) {
    const occurrences = countOccurrences(docText, targetText);
    if (occurrences === 1) {
      return { findQuery: targetText, matchNum: 1 };
    }
    // Multiple occurrences — determine which one
    const matchNum = getMatchNumber(docText, targetText, startIndex);
    if (matchNum > 0) {
      return { findQuery: targetText, matchNum };
    }
  }

  // Target text too long or contains newlines — use start of text as Find query,
  // then extend selection rightward to cover the rest
  if (!targetText.includes('\n') && targetText.length > MAX_FIND_LENGTH) {
    const truncated = targetText.slice(0, MAX_FIND_LENGTH);
    const occurrences = countOccurrences(docText, truncated);
    const extendRight = targetText.length - MAX_FIND_LENGTH;
    if (occurrences === 1) {
      return { findQuery: truncated, matchNum: 1, extendRight };
    }
    const matchNum = getMatchNumber(docText, truncated, startIndex);
    if (matchNum > 0) {
      return { findQuery: truncated, matchNum, extendRight };
    }
  }

  // Target contains newlines — find a unique anchor at the start of the range
  // and extend to cover everything
  const anchor = findShortestUniqueAround(docText, startIndex);
  if (anchor) {
    const anchorEnd = anchor.startPos + anchor.query.length;
    const extendRight = Math.max(0, endIndex - anchorEnd);
    return { findQuery: anchor.query, matchNum: 1, extendRight };
  }

  // Last resort: use target text (first line) with match number
  const query = targetText.slice(0, MAX_FIND_LENGTH).split('\n')[0];
  const matchNum = getMatchNumber(docText, query, startIndex);
  const extendRight = Math.max(0, targetText.length - query.length);
  return {
    findQuery: query,
    matchNum: matchNum > 0 ? matchNum : 1,
    extendRight,
  };
}

/**
 * Resolve a Find query for text-based search (find & replace).
 *
 * @param {string} docText - Full document text
 * @param {string} searchText - Text to find
 * @param {number} [matchNum=1] - Which occurrence to target (1-based). Defaults to 1.
 * @returns {{ findQuery: string, matchNum: number, occurrences: number }}
 * @throws If text not found, or if matchNum > occurrences, or if multiple
 *   occurrences exist and matchNum is not specified.
 */
export function resolveText(docText, searchText, matchNum) {
  const occurrences = countOccurrences(docText, searchText);

  if (occurrences === 0) {
    throw new Error(`Text not found in document: "${searchText.slice(0, 50)}"`);
  }

  if (occurrences > 1 && matchNum === undefined) {
    throw new Error(
      `Text "${searchText.slice(0, 40)}" has ${occurrences} occurrences. ` +
      `Specify matchNum (1-${occurrences}) to target a specific one.`
    );
  }

  const targetMatch = matchNum || 1;
  if (targetMatch > occurrences) {
    throw new Error(
      `matchNum ${targetMatch} exceeds occurrences (${occurrences}) for "${searchText.slice(0, 40)}"`
    );
  }

  const query = searchText.length <= MAX_FIND_LENGTH
    ? searchText
    : searchText.slice(0, MAX_FIND_LENGTH);

  return { findQuery: query, matchNum: targetMatch, occurrences };
}

