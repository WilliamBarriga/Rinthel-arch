/**
 * `check-emojis`: AGENTS.md prohibe emojis unicode en docs. Falla si un `.md`
 * versionado contiene un pictograma. Sale con codigo 1 y lista archivo:linea.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PICTOGRAMA = /\p{Extended_Pictographic}/u;
const archivos = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const hallazgos: string[] = [];
for (const archivo of archivos) {
  readFileSync(archivo, 'utf8')
    .split('\n')
    .forEach((linea, i) => {
      if (PICTOGRAMA.test(linea)) hallazgos.push(`${archivo}:${i + 1}`);
    });
}

if (hallazgos.length > 0) {
  console.error(`Emojis unicode en docs (AGENTS.md los prohibe):\n${hallazgos.join('\n')}`);
  process.exit(1);
}
