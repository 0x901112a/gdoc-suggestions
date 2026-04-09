#!/usr/bin/env node
/**
 * Structural edge case tests: tables, bullet lists, multi-line text.
 *
 * Usage: node test-structural.mjs [--no-cleanup]
 */

import { GDocSuggestions } from '../lib/index.mjs';

const TEST_DOC_ID = '1EoJPXsk319JiWupQrlAZGqj0kpDzinUumLm7gLl1E3g';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ FAILED: ${message}`);
    failed++;
  }
}

async function runTest(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (e) {
    assert(false, `Error: ${e.message}`);
  }
}

async function test() {
  console.log('=== Structural edge case tests ===\n');

  const doc = await GDocSuggestions.open(TEST_DOC_ID);
  console.log('Doc text length:', doc.docText.length);

  // --- Test 1: Replace text inside a table cell ---
  await runTest('Test 1: Replace text in table cell ("Bob Smith" → "Robert Smith")', async () => {
    // Table cells appear in the exported text
    const hasTable = doc.docText.includes('Bob Smith');
    if (!hasTable) {
      assert(false, 'Table text "Bob Smith" not found in doc export — table content may not be exported as plain text');
      return;
    }
    await doc.suggestFindReplace({ findText: 'Bob Smith', replaceText: 'Robert Smith' });
    assert(true, 'Replaced table cell text');
  });

  // --- Test 2: Replace text in a bullet list item ---
  await runTest('Test 2: Replace bullet list item text', async () => {
    await doc.suggestFindReplace({ findText: 'Second bullet item', replaceText: 'Updated second bullet item' });
    assert(true, 'Replaced bullet list item');
  });

  // --- Test 3: Delete a bullet list item ---
  await runTest('Test 3: Delete bullet list item "First bullet item"', async () => {
    await doc.suggestFindReplace({ findText: 'First bullet item', replaceText: '' });
    assert(true, 'Deleted bullet list item via empty replace');
  });

  // --- Test 4: Replace text in a long, wrapping paragraph ---
  await runTest('Test 4: Replace in multi-line paragraph (text that wraps)', async () => {
    await doc.suggestFindReplace({
      findText: 'The purpose is to test whether Find and Replace works correctly when the target text crosses visual line boundaries in the rendered document.',
      replaceText: 'This tests cross-line Find and Replace.',
    });
    assert(true, 'Replaced long text in multi-line paragraph');
  });

  // --- Test 5: Insert text near a table ---
  await runTest('Test 5: Insert text after "7. Table Section" heading', async () => {
    const text = doc.docText;
    const anchor = '7. Table Section';
    const idx = text.indexOf(anchor);
    if (idx < 0) {
      assert(false, 'Anchor "7. Table Section" not found');
      return;
    }
    await doc.suggestInsertText({
      index: idx + anchor.length,
      text: ' (contains employee data)',
    });
    assert(true, 'Inserted text near table');
  });

  // --- Test 6: Replace in table cell "Active" (appears twice if table works) ---
  await runTest('Test 6: Replace "On Leave" in table (unique text)', async () => {
    const hasText = doc.docText.includes('On Leave');
    if (!hasText) {
      assert(false, '"On Leave" not found — table content not in text export');
      return;
    }
    await doc.suggestFindReplace({ findText: 'On Leave', replaceText: 'Returned' });
    assert(true, 'Replaced table cell "On Leave" → "Returned"');
  });

  // --- Test 7: Replace text with newlines (multi-line target) ---
  await runTest('Test 7: Replace "Bullet List Section" heading text', async () => {
    await doc.suggestFindReplace({
      findText: '8. Bullet List Section',
      replaceText: '8. Task List Section',
    });
    assert(true, 'Replaced section heading');
  });

  // --- Summary ---
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (!process.argv.includes('--no-cleanup')) {
    console.log('\nCleaning up...');
    const rejected = await doc.rejectAllSuggestions();
    console.log(`Rejected ${rejected} suggestions.`);
  } else {
    console.log('\nSkipping cleanup. Verify via API.');
  }

  console.log(failed === 0 ? '\nAll tests passed!' : `\n${failed} test(s) failed.`);
  await doc.close();
  process.exit(failed > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
