/**
 * arabam.com ikinci el ağacı (nodes.csv) → brands / car_models / car_sub_models
 *
 * Kaynak 4 seviye, DB 3 seviye:
 *   marka   (depth 1) → brands.name              ("Mercedes - Benz" → "Mercedes-Benz")
 *   seri    (depth 2) → car_models.name          ("Egea", "Clio", "3 Serisi")
 *   model   (depth 3) → alt modelin motor/gövde kısmı   ("1.3 Multijet", "A4 Avant", "320i")
 *   donanım (depth 4) → alt modelin donanım kısmı       ("Easy", "Comfortline")
 *
 *   car_sub_models.name = "<model> <donanım>"   → "1.3 Multijet Easy"
 *                         "<model>"             → donanım yoksa ya da donanım == model
 *                         "<seri>"              → seri altında hiç model yoksa (Twizy, Serçe)
 *
 * Kaynakta yıl / beygir / nesil bilgisi yok: year = 0, horse_power / year_from /
 * year_to / generation = NULL. engine_cc litre ifadesinden ("1.3" → 1300), yoksa 0
 * ("520d", "C 200" gibi sayılar model kodudur, hacim sayılmaz).
 * trim_name = name; fuel_type / transmission / body_type src/cars/sub-model-parser
 * sezgileriyle doldurulur (backfill çalıştırmak gerekmez).
 *
 * TRUNCATE brands CASCADE → car_models, car_sub_models, reviews, favorites,
 * review_likes dahil hepsi silinir ve sıfırdan yüklenir.
 *
 *   npm run import:arabam -- --dry          # DB'ye dokunmaz, istatistik + örnek basar
 *   npm run import:arabam                   # onay ister
 *   npm run import:arabam -- --yes          # onay sormaz
 *   npm run import:arabam -- path/to/nodes.csv
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { randomUUID } from 'crypto';
import { createClient } from './db';
import {
  inferBodyType,
  inferFuelType,
  inferTransmission,
} from '../src/cars/sub-model-parser';
import type {
  BodyType,
  FuelType,
  Transmission,
} from '../src/cars/entities/car-sub-model.entity';

const DEFAULT_CSV = path.resolve(
  __dirname,
  '..',
  'import_data',
  'arabam-nodes.csv',
);

// "1.3", "2.0T", "0.9 TCe" → litre
const LITRE_RE = /(?<![\d.])(\d{1,2}\.\d)(?![\d.])/;
const KWH_RE = /\d+\s*kWh/i;

const BRAND_RENAMES: Record<string, string> = {
  'mercedes - benz': 'Mercedes-Benz',
};

interface Sub {
  name: string;
  engineCC: number;
  trimName: string | null;
  fuelType: FuelType | null;
  transmission: Transmission | null;
  bodyType: BodyType | null;
}
interface Model {
  name: string;
  subs: Map<string, Sub>; // lower(name) → sub
}
interface Brand {
  name: string;
  models: Map<string, Model>; // lower(name) → model
}

// ---------- CSV ----------

function parseCsv(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      lines.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    lines.push(row);
  }
  const header = lines.shift()!.map((h) => h.replace(/^\uFEFF/, '').trim());
  return lines
    .filter((l) => l.length > 1)
    .map((l) => Object.fromEntries(header.map((h, i) => [h, l[i] ?? ''])));
}

// ---------- eşleme ----------

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function brandName(raw: string): string {
  const n = norm(raw);
  return BRAND_RENAMES[n.toLowerCase()] ?? n;
}

function parseEngineCC(name: string): number {
  if (KWH_RE.test(name)) return 0;
  // Sadece litre ifadesi: "520d", "C 200", "2105" gibi sayılar model kodu, hacim değil.
  const l = name.match(LITRE_RE);
  return l ? Math.round(parseFloat(l[1]) * 1000) : 0;
}

function makeSub(modelName: string, name: string, isSeriOnly: boolean): Sub {
  return {
    name,
    engineCC: isSeriOnly ? 0 : parseEngineCC(name),
    trimName: isSeriOnly ? null : name,
    fuelType: inferFuelType(name),
    transmission: inferTransmission(name),
    bodyType: inferBodyType(`${modelName} ${name}`),
  };
}

function addSub(model: Model, sub: Sub, stats: Stats): void {
  const key = sub.name.toLowerCase();
  if (model.subs.has(key)) {
    stats.dupSub++;
    return;
  }
  model.subs.set(key, sub);
}

interface Stats {
  rows: number;
  dupSub: number;
  seriOnly: number;
  modelOnly: number;
  trim: number;
}

function buildTree(rows: Record<string, string>[]): {
  brands: Map<string, Brand>;
  stats: Stats;
} {
  const stats: Stats = {
    rows: 0,
    dupSub: 0,
    seriOnly: 0,
    modelOnly: 0,
    trim: 0,
  };
  const brands = new Map<string, Brand>();
  const childCount = new Map<string, number>();
  for (const r of rows)
    childCount.set(r.parent_path, (childCount.get(r.parent_path) ?? 0) + 1);

  const getBrand = (raw: string): Brand => {
    const name = brandName(raw);
    const key = name.toLowerCase();
    let b = brands.get(key);
    if (!b) brands.set(key, (b = { name, models: new Map() }));
    return b;
  };
  const getModel = (b: Brand, raw: string): Model => {
    const name = norm(raw);
    const key = name.toLowerCase();
    let m = b.models.get(key);
    if (!m) b.models.set(key, (m = { name, subs: new Map() }));
    return m;
  };

  for (const r of rows) {
    stats.rows++;
    const depth = parseInt(r.depth, 10);
    if (depth < 1 || !r.seviye_1) continue;
    const brand = getBrand(r.seviye_1);
    if (depth === 1) continue;

    const model = getModel(brand, r.seviye_2);
    const hasChildren = (childCount.get(r.path) ?? 0) > 0;

    if (depth === 2) {
      if (!hasChildren) {
        stats.seriOnly++;
        addSub(model, makeSub(model.name, model.name, true), stats);
      }
      continue;
    }

    const motor = norm(r.seviye_3);
    if (depth === 3) {
      if (!hasChildren) {
        stats.modelOnly++;
        addSub(model, makeSub(model.name, motor, false), stats);
      }
      continue;
    }

    if (depth === 4) {
      const trim = norm(r.name);
      // "1.6 TDi" + "1.6 TDi" ya da "2.0 CDTI" + "CDTi" → tekrar etme
      const name = motor.toLowerCase().endsWith(trim.toLowerCase())
        ? motor
        : `${motor} ${trim}`;
      stats.trim++;
      addSub(model, makeSub(model.name, name, false), stats);
    }
  }
  return { brands, stats };
}

// ---------- DB ----------

async function importTree(brands: Map<string, Brand>) {
  const client = createClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE brands CASCADE');

    const brandRows: unknown[][] = [];
    const modelRows: unknown[][] = [];
    const subRows: unknown[][] = [];
    for (const b of brands.values()) {
      const bid = randomUUID();
      brandRows.push([bid, b.name]);
      for (const m of b.models.values()) {
        const mid = randomUUID();
        modelRows.push([mid, m.name, bid]);
        for (const s of m.subs.values()) {
          subRows.push([
            randomUUID(),
            s.name,
            s.engineCC,
            0,
            mid,
            s.trimName,
            s.fuelType,
            s.transmission,
            s.bodyType,
          ]);
        }
      }
    }

    await bulkInsert(client, 'INSERT INTO brands (id, name) VALUES', brandRows);
    await bulkInsert(
      client,
      'INSERT INTO car_models (id, name, brand_id) VALUES',
      modelRows,
    );
    await bulkInsert(
      client,
      `INSERT INTO car_sub_models
         (id, name, engine_cc, year, model_id, trim_name, fuel_type, transmission, body_type) VALUES`,
      subRows,
    );
    await client.query('COMMIT');
    return {
      brands: brandRows.length,
      models: modelRows.length,
      subModels: subRows.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

async function bulkInsert(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  prefix: string,
  rows: unknown[][],
  chunk = 1000,
) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const width = part[0].length;
    const values: unknown[] = [];
    const tuples = part.map((r, j) => {
      values.push(...r);
      const ph = r.map((_, k) => `$${j * width + k + 1}`);
      return `(${ph.join(',')})`;
    });
    await client.query(`${prefix} ${tuples.join(',')}`, values);
  }
}

// ---------- main ----------

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise<string>((res) => rl.question(question, res));
  rl.close();
  return ['y', 'yes', 'e', 'evet'].includes(answer.trim().toLowerCase());
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry') || args.includes('--dry-run');
  const yes = args.includes('--yes') || args.includes('-y');
  const csvPath = args.find((a) => !a.startsWith('-')) ?? DEFAULT_CSV;

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV bulunamadı: ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const { brands, stats } = buildTree(rows);

  const models = [...brands.values()].flatMap((b) => [...b.models.values()]);
  const subs = models.flatMap((m) => [...m.subs.values()]);
  const count = (f: (s: Sub) => unknown) => subs.filter((s) => f(s)).length;

  console.log(
    `CSV: ${stats.rows} satır → ${brands.size} marka, ${models.length} model, ${subs.length} alt model`,
  );
  console.log(
    `     donanım: ${stats.trim}, sadece motor: ${stats.modelOnly}, sadece seri: ${stats.seriOnly}, tekrar (atlandı): ${stats.dupSub}`,
  );
  console.log(
    `     engine_cc=0: ${count((s) => s.engineCC === 0)}, fuel: ${count((s) => s.fuelType)}, ` +
      `transmission: ${count((s) => s.transmission)}, body: ${count((s) => s.bodyType)}`,
  );
  console.log(
    `     modelsiz marka: ${
      [...brands.values()]
        .filter((b) => b.models.size === 0)
        .map((b) => b.name)
        .join(', ') || '-'
    }`,
  );

  if (dry) {
    console.log('Örnek:');
    const step = Math.max(1, Math.floor(subs.length / 30));
    let i = 0;
    for (const b of brands.values())
      for (const m of b.models.values())
        for (const s of m.subs.values()) {
          if (i++ % step === 0)
            console.log(
              `  ${b.name} / ${m.name} / ${s.name}  cc=${s.engineCC} fuel=${s.fuelType} tr=${s.transmission} body=${s.bodyType}`,
            );
        }
    return;
  }

  if (!yes) {
    const ok = await confirm(
      `${process.env.DB_NAME}@${process.env.DB_HOST}: brands/car_models/car_sub_models ` +
        '+ reviews/favorites/review_likes SİLİNECEK. Devam? [y/N] ',
    );
    if (!ok) {
      console.log('İptal.');
      return;
    }
  }

  const result = await importTree(brands);
  console.log('Eklendi:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
