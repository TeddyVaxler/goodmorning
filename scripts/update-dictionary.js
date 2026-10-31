const fs = require('fs');
const path = require('path');

const newWordsFileArg = process.argv[2];

if (!newWordsFileArg) {
  console.error('Usage: node scripts/update-dictionary.js <path-to-words.txt>');
  process.exit(1);
}

const inputFilePath = path.resolve(process.cwd(), newWordsFileArg);
const scrabblePath = path.join(process.cwd(), 'public', 'dictionary.txt');
const targetDictPath = path.join(process.cwd(), 'public', 'custom-dictionary.json');

function updateDictionary() {
  if (!fs.existsSync(inputFilePath)) {
    console.error(`Error: File to import not found at ${inputFilePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(scrabblePath)) {
    console.error(`Error: Scrabble reference file missing at ${scrabblePath}`);
    process.exit(1);
  }

  console.log('Loading Scrabble reference dictionary...');
  const scrabbleRaw = fs.readFileSync(scrabblePath, 'utf-8');
  const scrabbleSet = new Set(
    scrabbleRaw
      .split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter((w) => /^[A-Z]{4,6}$/.test(w))
  );

  scrabbleSet.add('GOUDA');
  scrabbleSet.add('EERIE');

  // Load existing dictionary or start fresh if not present
  let existingWords = [];
  if (fs.existsSync(targetDictPath)) {
    existingWords = JSON.parse(fs.readFileSync(targetDictPath, 'utf-8'));
  }
  const mergedSet = new Set(existingWords);

  console.log(`Processing updates from ${newWordsFileArg}...`);
  const inputRaw = fs.readFileSync(inputFilePath, 'utf-8');
  let addedCount = 0;
  let rejectedCount = 0;

  inputRaw.split(/\r?\n/).forEach((line) => {
    const word = line.trim().toUpperCase();
    if (word.length >= 4 && word.length <= 6 && /^[A-Z]+$/.test(word)) {
      if (scrabbleSet.has(word)) {
        if (!mergedSet.has(word)) {
          mergedSet.add(word);
          addedCount++;
        }
      } else {
        rejectedCount++;
      }
    }
  });

  const finalSortedList = Array.from(mergedSet).sort();
  fs.writeFileSync(targetDictPath, JSON.stringify(finalSortedList, null, 2), 'utf-8');

  console.log(`Update complete:`);
  console.log(`- Added ${addedCount} new verified words.`);
  console.log(`- Rejected ${rejectedCount} invalid/non-Scrabble words.`);
  console.log(`- Total dictionary size: ${finalSortedList.length} words.`);
}

updateDictionary();