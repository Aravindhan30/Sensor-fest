const fs = require('fs');
const path = require('path');

// Read the raw JSON fetched from GAS
const contentMdPath = 'C:\\Users\\MADHAN R\\.gemini\\antigravity-ide\\brain\\89fa42bd-7681-44b2-a273-53dfa6312804\\.system_generated\\steps\\116\\content.md';
const fileText = fs.readFileSync(contentMdPath, 'utf8');

// The JSON starts after the markdown headers
const jsonStart = fileText.indexOf('{"individual":');
if (jsonStart === -1) {
  console.error('JSON not found in content.md');
  process.exit(1);
}

const rawJson = fileText.slice(jsonStart).trim();
const data = JSON.parse(rawJson);

console.log('Individual rows total:', data.individual.length);
console.log('Team rows total:', data.team.length);
console.log('Custom rows total:', data.custom.length);
console.log('2nd Year team rows total:', data.secondYearTeams.length);

let y3 = 0, y4 = 0, yEmpty = 0, yOther = 0;
data.individual.forEach((r, idx) => {
  const yr = (r[6] || '').trim();
  if (yr === '3rd Year') y3++;
  else if (yr === '4th Year') y4++;
  else if (!yr) yEmpty++;
  else yOther++;
});

console.log(`Individual Breakdown: 3rd Year: ${y3}, 4th Year: ${y4}, Unmentioned/Empty: ${yEmpty}, Other: ${yOther}`);
console.log(`With user rule (unmentioned -> 4th Year): 3rd Year = ${y3}, 4th Year = ${y4 + yEmpty + yOther}`);
