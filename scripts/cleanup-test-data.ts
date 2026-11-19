/**
 * Örnek / test verisini test ortamından siler (iş listesi #35 ve #30).
 *
 * Silinenler:
 *  - seed kullanıcıları (seed+N@nedersin.test) ve CASCADE ile yorumları,
 *    beğenileri, favorileri, fotoğraf kayıtları, şikayetleri, engelleri
 *  - `@example.com` adresli test hesapları (claude-sil-…, claude-test-…, qa.test.…)
 *  - `--review-ids id1,id2` ile verilen deneme yorumları ("tuna test" vb.)
 *
 * Ortalamalar ve sayaçlar canlı hesaplandığı için yeniden hesaplama gerekmez.
 * Varsayılan KURU ÇALIŞMA: sadece sayıları basar. Gerçekten silmek için `--apply`.
 *
 *   npx ts-node --transpile-only scripts/cleanup-test-data.ts            # dry
 *   npx ts-node --transpile-only scripts/cleanup-test-data.ts -- --apply
 *   npx ts-node --transpile-only scripts/cleanup-test-data.ts -- --apply --review-ids <uuid>,<uuid>
 *
 * Canlı veritabanına karşı çalıştırmayın: DB_NAME 'prod' içeriyorsa durur.
 */
import { createClient } from './db';

const SEED_EMAIL = 'seed+%@nedersin.test';
const TEST_EMAIL = '%@example.com';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const idsArg = args.find((a, i) => args[i - 1] === '--review-ids');
  const reviewIds = idsArg
    ? idsArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (/prod/i.test(process.env.DB_NAME ?? '')) {
    throw new Error(`DB_NAME "${process.env.DB_NAME}" canlı görünüyor; durduruldu.`);
  }

  const client = createClient();
  await client.connect();
  const count = async (sql: string, params: unknown[] = []) =>
    Number((await client.query<{ c: string }>(sql, params)).rows[0]?.c ?? 0);

  console.log(`${apply ? 'UYGULANIYOR' : 'KURU ÇALIŞMA'} — ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  const seedUsers = await count(`SELECT count(*) c FROM users WHERE email LIKE $1`, [SEED_EMAIL]);
  const seedReviews = await count(
    `SELECT count(*) c FROM reviews r JOIN users u ON u.id = r.user_id WHERE u.email LIKE $1`,
    [SEED_EMAIL],
  );
  const seedLikes = await count(
    `SELECT count(*) c FROM review_likes l JOIN users u ON u.id = l.user_id WHERE u.email LIKE $1`,
    [SEED_EMAIL],
  );
  const testUsers = await client.query<{ email: string; c: string }>(
    `SELECT u.email, (SELECT count(*) FROM reviews r WHERE r.user_id = u.id) c
       FROM users u WHERE u.email LIKE $1 ORDER BY u.email`,
    [TEST_EMAIL],
  );
  const extra = reviewIds.length
    ? await client.query<{ id: string; title: string | null; content: string }>(
        `SELECT id, title, left(content, 60) content FROM reviews WHERE id = ANY($1::uuid[])`,
        [reviewIds],
      )
    : { rows: [] };

  console.log(`- seed kullanıcı: ${seedUsers}, yorumları: ${seedReviews}, beğenileri: ${seedLikes}`);
  console.log(`- test hesabı (@example.com): ${testUsers.rowCount}`);
  for (const u of testUsers.rows) console.log(`    ${u.email} (${u.c} yorum)`);
  console.log(`- elle verilen deneme yorumu: ${extra.rows.length}/${reviewIds.length}`);
  for (const r of extra.rows) console.log(`    ${r.id} ${r.title ?? ''} ${r.content}`);

  if (!apply) {
    console.log('\nSilmek için: -- --apply');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    if (reviewIds.length) {
      const res = await client.query(`DELETE FROM reviews WHERE id = ANY($1::uuid[])`, [reviewIds]);
      console.log(`deneme yorumu silindi: ${res.rowCount}`);
    }
    // users CASCADE: reviews, review_likes, favorites, review_images, review_reports, user_blocks
    const seedRes = await client.query(`DELETE FROM users WHERE email LIKE $1`, [SEED_EMAIL]);
    console.log(`seed kullanıcı silindi: ${seedRes.rowCount} (yorum/beğeni/favori CASCADE)`);
    const testRes = await client.query(`DELETE FROM users WHERE email LIKE $1`, [TEST_EMAIL]);
    console.log(`test hesabı silindi: ${testRes.rowCount}`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  console.log(`kalan yorum: ${await count('SELECT count(*) c FROM reviews')}, kalan kullanıcı: ${await count('SELECT count(*) c FROM users')}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
