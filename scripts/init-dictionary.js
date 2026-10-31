const fs = require('fs');
const path = require('path');

const scrabblePath = path.join(process.cwd(), 'public', 'dictionary.txt');
const googleWordsPath = path.join(process.cwd(), 'public', 'google-10000-english-no-swears.txt');
const outputPath = path.join(process.cwd(), 'public', 'custom-dictionary.json');

function initDictionary() {
  if (!fs.existsSync(scrabblePath)) {
    console.error(`Error: Scrabble dictionary missing at ${scrabblePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(googleWordsPath)) {
    console.error(`Error: Google wordlist missing at ${googleWordsPath}`);
    process.exit(1);
  }

  console.log('Reading word files...');
  const scrabbleRaw = fs.readFileSync(scrabblePath, 'utf-8');
  const googleRaw = fs.readFileSync(googleWordsPath, 'utf-8');

  // Load all 4-6 letter Scrabble words into a set
  const scrabbleSet = new Set(
    scrabbleRaw
      .split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter((w) => /^[A-Z]{4,6}$/.test(w))
  );

  // Manual inclusions / eponym overrides
  scrabbleSet.add('GOUDA');
  scrabbleSet.add('EERIE');

  const crossSection = new Set();

  googleRaw.split(/\r?\n/).forEach((line) => {
    const word = line.trim().toUpperCase();
    if (word.length >= 4 && word.length <= 6 && /^[A-Z]+$/.test(word)) {
      if (scrabbleSet.has(word)) {
        crossSection.add(word);
      }
    }
  });

  // Guarantee inclusion of specific words
  crossSection.add('GOUDA');
  crossSection.add('EERIE');

  const sortedWords = Array.from(crossSection).sort();

  fs.writeFileSync(outputPath, JSON.stringify(sortedWords, null, 2), 'utf-8');
  console.log(`Success: Initialized custom dictionary with ${sortedWords.length} words at:`);
  console.log(outputPath);
}

initDictionary();