/** Fails (code 1, with file:line) if a versioned `.md` contains a unicode pictograph. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const findings: string[] = [];
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (PICTOGRAPH.test(line)) findings.push(`${file}:${i + 1}`);
    });
}

if (findings.length > 0) {
  console.error(`Unicode emojis in docs (AGENTS.md forbids them):\n${findings.join('\n')}`);
  process.exit(1);
}
