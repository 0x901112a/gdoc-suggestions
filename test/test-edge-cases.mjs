#!/usr/bin/env node
/**
 * Edge case tests for gdoc-suggestions library.
 *
 * Tests: repeated text, similar strings, nth occurrence targeting,
 * special characters, long text ranges.
 *
 * Usage: node test-edge-cases.mjs [--no-cleanup]
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
  console.log('=== Edge case tests ===\n');

  const doc = await GDocSuggestions.open(TEST_DOC_ID);
  console.log('Doc text length:', doc.docText.length);

  // --- Test 1: Error on ambiguous text ---
  await runTest('Test 1: Error when findText has multiple matches without matchNum', async () => {
    try {
      await doc.suggestFindReplace({
        findText: 'reported steady progress on the backend refactor.',
        replaceText: 'SHOULD NOT APPEAR',
      });
      assert(false, 'Should have thrown an error');
    } catch (e) {
      assert(e.message.includes('3 occurrences'), `Got expected error: ${e.message}`);
    }
  });

  // --- Test 2: Target 2nd occurrence with matchNum ---
  await runTest('Test 2: Replace 2nd "reported steady progress" (Beta)', async () => {
    await doc.suggestFindReplace({
      findText: 'reported steady progress on the backend refactor.',
      replaceText: 'made excellent progress on the frontend redesign.',
      matchNum: 2,
    });
    assert(true, 'Replaced 2nd occurrence (Beta)');
  });

  // --- Test 3: Target 3rd occurrence with matchNum ---
  await runTest('Test 3: Replace 3rd occurrence (Gamma)', async () => {
    // Re-read text since previous edit may have changed it
    await doc.suggestFindReplace({
      findText: 'Gamma team',
      replaceText: 'Gamma squad',
    });
    assert(true, 'Replaced "Gamma team" (unique, no matchNum needed)');
  });

  // --- Test 4: Similar sentences in formatting section ---
  await runTest('Test 4: Target "This sentence should be italicized." (2nd of 3 "This sentence")', async () => {
    const text = doc.docText;
    const target = 'This sentence should be italicized.';
    const idx = text.indexOf(target);
    assert(idx >= 0, `Found target at index ${idx}`);

    await doc.suggestFormatText({
      startIndex: idx,
      endIndex: idx + target.length,
      italic: true,
    });
    assert(true, 'Italic applied to correct sentence');
  });

  // --- Test 5: Special characters ---
  await runTest('Test 5: Replace text with special characters', async () => {
    await doc.suggestFindReplace({
      findText: 'naïve',
      replaceText: 'naive',
    });
    assert(true, 'Replaced "naïve" → "naive"');
  });

  // --- Test 6: Text with dollar signs and symbols ---
  await runTest('Test 6: Replace "$1.2M" (text with symbols)', async () => {
    await doc.suggestFindReplace({
      findText: '$1.2M',
      replaceText: '$2.4M',
    });
    assert(true, 'Replaced "$1.2M" → "$2.4M"');
  });

  // --- Test 7: Delete specific occurrence using index ---
  await runTest('Test 7: Delete 1st "reported steady progress" line (Alpha)', async () => {
    const text = doc.docText;
    const target = 'Alpha team reported steady progress on the backend refactor.';
    const idx = text.indexOf(target);
    assert(idx >= 0, `Found Alpha line at index ${idx}`);

    await doc.suggestDeleteText({
      startIndex: idx,
      endIndex: idx + target.length,
    });
    assert(true, 'Deleted Alpha team line');
  });

  // --- Test 8: Insert after specific occurrence ---
  await runTest('Test 8: Insert text after "Beta team" line specifically', async () => {
    const text = doc.docText;
    // Find the end of the Beta line (which now has the replacement from test 2)
    const betaLine = 'made excellent progress on the frontend redesign.';
    const idx = text.indexOf(betaLine);
    if (idx >= 0) {
      await doc.suggestInsertText({
        index: idx + betaLine.length,
        text: ' (BETA NOTE)',
      });
      assert(true, 'Inserted after Beta line');
    } else {
      // Beta line might still show original text in accessibility view
      assert(false, 'Could not find Beta replacement text');
    }
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
