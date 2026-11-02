/**
 * car_sub_models.name → trim_name, generation, horse_power, year_from, year_to,
 * fuel_type, transmission, body_type kolonlarını doldurur.
 *
 * Idempotent; her çalıştırmada tüm satırları yeniden ayrıştırır (import
 * sonrası tekrar koşulabilir). Tablo kolonları uygulama bir kez
 * synchronize ile açılmış olmalı (NODE_ENV!=production ya da DB_SYNC=true).
 *
 *   npm run backfill:sub-models            # tümünü yaz
 *   npm run backfill:sub-models -- --dry   # sadece örnek + istatistik
 */
import { createClient } from './db';
import { parseSubModelName } from '../src/cars/sub-model-parser';

async function main() {
  const dry = process.argv.includes('--dry');
  const client = createClient();
  await client.connect();

  const { rows } = await client.query<{
    id: string;
    name: string;
    model: string;
  }>(
    `SELECT s.id, s.name, m.name AS model
       FROM car_sub_models s JOIN car_models m ON m.id = s.model_id
      ORDER BY m.name, s.name`,
  );
  console.log(`${rows.length} alt model okundu`);

  const parsed = rows.map((r) => ({
    id: r.id,
    ...parseSubModelName(r.name, r.model),
  }));
  const stat = (k: keyof (typeof parsed)[number]) =>
    parsed.filter((p) => p[k] !== null && p[k] !== undefined).length;
  console.log(
    `dolu: trimName=${stat('trimName')} generation=${stat('generation')} hp=${stat('horsePower')} ` +
      `yearFrom=${stat('yearFrom')} yearTo=${stat('yearTo')} fuel=${stat('fuelType')} ` +
      `transmission=${stat('transmission')} body=${stat('bodyType')}`,
  );

  if (dry) {
    for (const r of rows.filter(
      (_, i) => i % Math.ceil(rows.length / 25) === 0,
    )) {
      console.log(
        ' ',
        r.model,
        '|',
        r.name,
        '→',
        parseSubModelName(r.name, r.model),
      );
    }
    await client.end();
    return;
  }

  const CHUNK = 1000;
  let done = 0;
  await client.query('BEGIN');
  try {
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = chunk.map((p, j) => {
        const base = j * 9;
        values.push(
          p.id,
          p.trimName,
          p.generation,
          p.horsePower,
          p.yearFrom,
          p.yearTo,
          p.fuelType,
          p.transmission,
          p.bodyType,
        );
        return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}::int, $${base + 5}::int, $${base + 6}::int, $${base + 7}, $${base + 8}, $${base + 9})`;
      });
      await client.query(
        `UPDATE car_sub_models AS s SET
           trim_name = v.trim_name, generation = v.generation, horse_power = v.horse_power,
           year_from = v.year_from, year_to = v.year_to, fuel_type = v.fuel_type,
           transmission = v.transmission, body_type = v.body_type
         FROM (VALUES ${tuples.join(',')}) AS v(id, trim_name, generation, horse_power, year_from, year_to, fuel_type, transmission, body_type)
         WHERE s.id = v.id`,
        values,
      );
      done += chunk.length;
      if (done % 10000 === 0 || done === parsed.length)
        console.log(`  ${done}/${parsed.length}`);
    }
    await client.query('COMMIT');
    console.log('Tamamlandı.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
