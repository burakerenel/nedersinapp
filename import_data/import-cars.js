// car-brands.csv → brands / car_models / car_sub_models
// generation → car_sub_models.name, year_from → year, engine_cc = 0 (CSV'de yok).
// Tekrar çalıştırılabilir: var olan kayıtlar atlanır.
// Kullanım: node import_data/import-cars.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function main() {
  const csv = fs.readFileSync(path.join(__dirname, 'car-brands.csv'), 'utf8');
  const [, ...lines] = csv.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map(parseCsvLine);

  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  const brandIds = new Map();
  const modelIds = new Map();
  const stats = { brands: 0, models: 0, subModels: 0, skipped: 0 };

  try {
    await client.query('BEGIN');

    for (const [brand, model, generation, yearFrom] of rows) {
      if (!brand || !model) {
        stats.skipped++;
        continue;
      }

      let brandId = brandIds.get(brand);
      if (!brandId) {
        const found = await client.query('SELECT id FROM brands WHERE name = $1', [brand]);
        if (found.rows.length) brandId = found.rows[0].id;
        else {
          const ins = await client.query('INSERT INTO brands (name) VALUES ($1) RETURNING id', [brand]);
          brandId = ins.rows[0].id;
          stats.brands++;
        }
        brandIds.set(brand, brandId);
      }

      const modelKey = `${brandId}|${model}`;
      let modelId = modelIds.get(modelKey);
      if (!modelId) {
        const found = await client.query(
          'SELECT id FROM car_models WHERE brand_id = $1 AND name = $2',
          [brandId, model],
        );
        if (found.rows.length) modelId = found.rows[0].id;
        else {
          const ins = await client.query(
            'INSERT INTO car_models (name, brand_id) VALUES ($1, $2) RETURNING id',
            [model, brandId],
          );
          modelId = ins.rows[0].id;
          stats.models++;
        }
        modelIds.set(modelKey, modelId);
      }

      const year = parseInt(yearFrom, 10);
      if (!generation || Number.isNaN(year)) {
        stats.skipped++;
        continue;
      }

      const found = await client.query(
        'SELECT 1 FROM car_sub_models WHERE model_id = $1 AND name = $2 AND year = $3',
        [modelId, generation, year],
      );
      if (!found.rows.length) {
        await client.query(
          'INSERT INTO car_sub_models (name, engine_cc, year, model_id) VALUES ($1, 0, $2, $3)',
          [generation, year, modelId],
        );
        stats.subModels++;
      }
    }

    await client.query('COMMIT');
    console.log('Eklendi:', stats);
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
