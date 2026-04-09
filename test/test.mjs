#!/usr/bin/env node
/**
 * Integration test for gdoc-suggestions library.
 *
 * Runs operations and verifies they don't crash.
 * Content verification should be done externally via Google Docs API
 * (get_doc_content with SUGGESTIONS_INLINE).
 *
 * Usage:
 *   node test.mjs              # Run tests + auto-cleanup
 *   node test.mjs --no-cleanup # Run tests, leave suggestions for manual inspection
 */

import { GDocSuggestions } from '../lib/index.mjs';

const TEST_DOC_ID = process.env.GDOC_TEST_DOC_ID;
if (!TEST_DOC_ID) {
  console.error('Set GDOC_TEST_DOC_ID environment variable to a Google Doc ID you own.');
  console.error('The doc should contain test content (see README for setup).');
  process.exit(1);
}

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
    assert(true, 'Operation completed');
  } catch (e) {
    assert(false, `Error: ${e.message}`);
  }
}

async function test() {
  console.log('=== gdoc-suggestions integration test ===\n');

  console.log('Opening doc (headless, live text reading)...');
  const doc = await GDocSuggestions.open(TEST_DOC_ID);
  console.log('Doc text length:', doc.docText.length);
  console.log('Preview:', doc.docText.slice(0, 80), '...\n');

  // Store initial text for index lookups
  let text = doc.docText;

  // --- Test 1: suggestFindReplace ---
  await runTest('Test 1: suggestFindReplace "lazy dog" → "sleepy cat"', async () => {
    assert(text.includes('lazy dog'), 'Target "lazy dog" found in doc');
    await doc.suggestFindReplace({ findText: 'lazy dog', replaceText: 'sleepy cat' });
  });

  // --- Test 2: suggestDeleteText ---
  text = doc.docText; // refresh for index calc
  await runTest('Test 2: suggestDeleteText "Churn rate..." line', async () => {
    const target = 'Churn rate: 2.3% (down from 3.1%)';
    const idx = text.indexOf(target);
    assert(idx >= 0, `Target found at index ${idx}`);
    await doc.suggestDeleteText({ startIndex: idx, endIndex: idx + target.length });
  });

  // --- Test 3: suggestFindReplace on repeated text ---
  await runTest('Test 3: suggestFindReplace "Gamma team" → "Gamma squad"', async () => {
    await doc.suggestFindReplace({ findText: 'Gamma team', replaceText: 'Gamma squad' });
  });

  // --- Test 4: suggestFormatText (bold) ---
  text = doc.docText;
  await runTest('Test 4: suggestFormatText bold "should be bolded"', async () => {
    const target = 'should be bolded';
    const idx = text.indexOf(target);
    assert(idx >= 0, `Target found at index ${idx}`);
    await doc.suggestFormatText({ startIndex: idx, endIndex: idx + target.length, bold: true });
  });

  // --- Test 5: suggestInsertText ---
  text = doc.docText;
  await runTest('Test 5: suggestInsertText after "diacritics."', async () => {
    const anchor = 'diacritics.';
    const idx = text.indexOf(anchor);
    assert(idx >= 0, `Anchor found at index ${idx}`);
    await doc.suggestInsertText({ index: idx + anchor.length, text: ' (INSERTED HERE)' });
  });

  // --- Summary ---
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (!process.argv.includes('--no-cleanup')) {
    console.log('\nCleaning up — rejecting all suggestions...');
    const rejected = await doc.rejectAllSuggestions();
    console.log(`Rejected ${rejected} suggestions.`);
  } else {
    console.log('\nSkipping cleanup. Verify via API:');
    console.log(`  get_doc_content(doc_id="${TEST_DOC_ID}", suggestions_view_mode="SUGGESTIONS_INLINE")`);
  }

  console.log(failed === 0 ? '\nAll tests passed!' : `\n${failed} test(s) failed.`);
  await doc.close();
  process.exit(failed > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
