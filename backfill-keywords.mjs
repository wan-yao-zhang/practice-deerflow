import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPrimaryKeyword } from './src/lib/primary-keyword.ts';

const run = args => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'githubbox-sitemap', '--remote', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const dir = mkdtempSync(join(tmpdir(), 'keyword-backfill-'));
let cursor = 0, updated = 0;
try {
  while (true) {
    const result = JSON.parse(run(['--command', `SELECT id,url,title,h1 FROM discoveries WHERE id > ${cursor} AND primary_keyword IS NULL ORDER BY id LIMIT 200`, '--json']));
    const rows = result.flatMap(r => r.results || []);
    if (!rows.length) break;
    const statements = rows.flatMap(row => {
      const keyword = extractPrimaryKeyword(row.url, row.title, row.h1);
      return keyword ? [`UPDATE discoveries SET primary_keyword=${quote(keyword)} WHERE id=${Number(row.id)} AND primary_keyword IS NULL;`] : [];
    });
    if (statements.length) {
      const file = join(dir, 'batch.sql');
      writeFileSync(file, statements.join('\n'));
      run(['--file', file, '--json']);
      updated += statements.length;
    }
    cursor = rows.at(-1).id;
    console.log(`Processed through id ${cursor}; confirmed ${updated}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`Backfill complete: ${updated} confirmed keywords`);
