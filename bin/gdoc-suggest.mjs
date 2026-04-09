#!/usr/bin/env node
/**
 * gdoc-suggest CLI — Programmatic Google Docs suggestions.
 *
 * Usage:
 *   gdoc-suggest login                     # One-time Google login (opens browser)
 *   gdoc-suggest replace <docId> <find> <replace> [--match N]
 *   gdoc-suggest insert <docId> <afterText> <text>
 *   gdoc-suggest delete <docId> <text> [--match N]
 *   gdoc-suggest format <docId> <text> [--bold] [--italic] [--underline]
 *   gdoc-suggest reject-all <docId>        # Reject all pending suggestions
 *   gdoc-suggest read <docId>              # Print document text
 */

import { GDocSuggestions, login } from '../lib/index.mjs';

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`gdoc-suggest — Programmatic Google Docs suggestions

Commands:
  login                                       One-time Google login (opens browser)
  replace <docId> <find> <replace> [--match N] Replace text (suggestion)
  insert  <docId> <afterText> <text>          Insert text after anchor (suggestion)
  delete  <docId> <text> [--match N]          Delete text (suggestion)
  format  <docId> <text> [--bold] [--italic] [--underline] [--match N]
  reject-all <docId>                          Reject all pending suggestions
  read    <docId>                             Print document plain text

Options:
  --match N    Target the Nth occurrence (1-based) when text repeats
  --json       Output result as JSON`);
  process.exit(1);
}

function getFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || true;
}

function hasFlag(flag) {
  return args.includes(flag);
}

async function main() {
  if (!command || command === '--help' || command === '-h') usage();

  if (command === 'login') {
    await login();
    return;
  }

  const docId = args[1];
  if (!docId) {
    console.error('Error: docId is required');
    usage();
  }

  const matchNum = getFlag('--match') ? parseInt(getFlag('--match')) : undefined;
  const json = hasFlag('--json');

  const doc = await GDocSuggestions.open(docId);

  try {
    let result;

    switch (command) {
      case 'replace': {
        const findText = args[2];
        const replaceText = args[3];
        if (!findText || replaceText === undefined) {
          console.error('Error: replace requires <find> and <replace> arguments');
          usage();
        }
        await doc.suggestFindReplace({ findText, replaceText, matchNum });
        result = { op: 'replace', findText, replaceText, matchNum };
        break;
      }

      case 'insert': {
        const afterText = args[2];
        const text = args[3];
        if (!afterText || !text) {
          console.error('Error: insert requires <afterText> and <text> arguments');
          usage();
        }
        const docText = doc.docText;
        const idx = docText.indexOf(afterText);
        if (idx === -1) {
          console.error(`Error: anchor text not found: "${afterText}"`);
          process.exit(1);
        }
        await doc.suggestInsertText({ index: idx + afterText.length, text });
        result = { op: 'insert', afterText, text };
        break;
      }

      case 'delete': {
        const text = args[2];
        if (!text) {
          console.error('Error: delete requires <text> argument');
          usage();
        }
        await doc.suggestFindReplace({ findText: text, replaceText: '', matchNum });
        result = { op: 'delete', text, matchNum };
        break;
      }

      case 'format': {
        const text = args[2];
        if (!text) {
          console.error('Error: format requires <text> argument');
          usage();
        }
        const docText = doc.docText;
        const idx = docText.indexOf(text);
        if (idx === -1) {
          console.error(`Error: text not found: "${text}"`);
          process.exit(1);
        }
        await doc.suggestFormatText({
          startIndex: idx,
          endIndex: idx + text.length,
          bold: hasFlag('--bold'),
          italic: hasFlag('--italic'),
          underline: hasFlag('--underline'),
        });
        result = { op: 'format', text, bold: hasFlag('--bold'), italic: hasFlag('--italic'), underline: hasFlag('--underline') };
        break;
      }

      case 'reject-all': {
        const count = await doc.rejectAllSuggestions();
        result = { op: 'reject-all', rejected: count };
        break;
      }

      case 'read': {
        const text = doc.docText;
        if (json) {
          result = { op: 'read', text, length: text.length };
        } else {
          console.log(text);
          await doc.close();
          return;
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        usage();
    }

    if (json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`✓ ${result.op} completed`);
    }
  } finally {
    await doc.close();
  }
}

main().catch(err => {
  if (err.message && (err.message.includes('auth expired') || err.message.includes('re-authenticate'))) {
    console.error(`\n  ${err.message}\n`);
  } else if (err.message && err.message.includes('profile is locked')) {
    console.error(`\n  ${err.message}\n`);
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
});
