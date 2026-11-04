/**
 * arabam.com ikinci el ağaçları (tree_*.json) → brands / car_models / car_sub_models
 *
 * Varsayılan kaynak: import_data/arabam/tree_otomobil.json,
 * tree_minivan-panelvan.json, tree_arazi-suv-pick-up.json (motosiklet ağacı
 * 2 seviyeli ve araç değil; dahil edilmez). Aynı marka/seri birden fazla
 * ağaçta geçerse tek kayda birleştirilir.
 *
 * Kaynak 4 seviye, DB 3 seviye:
 *   marka   (level marka)   → brands.name              ("Mercedes - Benz" → "Mercedes-Benz")
 *   seri    (level seri)    → car_models.name          ("Egea", "Doblo", "3 Serisi")
 *   model   (level model)   → alt modelin motor/gövde kısmı   ("1.3 Multijet", "A4 Avant", "320i")
 *   donanım (level donanim) → alt modelin donanım kısmı       ("Easy", "Comfortline")
 *
 *   car_sub_models.name = "<model> <donanım>"   → "1.3 Multijet Easy"
 *                         "<model>"             → donanım yoksa ya da donanım == model
 *                         "<seri>"              → seri altında hiç model yoksa (Twizy, Serçe)
 *
 * Kaynakta yıl / beygir / nesil bilgisi yok: year = 0, horse_power / year_from /
 * year_to / generation = NULL. engine_cc litre ifadesinden ("1.3" → 1300), yoksa 0
 * ("520d", "C 200" gibi sayılar model kodudur, hacim sayılmaz).
 * trim_name = name; fuel_type / transmission / body_type src/cars/sub-model-parser
 * sezgileriyle, body_type çıkarılamazsa ağacın kategorisinden (arazi → suv,
 * minivan → mpv) doldurulur. Backfill çalıştırmak gerekmez.
 *
 * TRUNCATE brands CASCADE → car_models, car_sub_models, reviews, favorites,
 * review_likes dahil hepsi silinir ve sıfırdan yüklenir.
 *
 *   npm run import:arabam -- --dry          # DB'ye dokunmaz, istatistik + örnek basar
 *   npm run import:arabam                   # onay ister
 *   npm run import:arabam -- --yes          # onay sormaz
 *   npm run import:arabam -- a.json b.json  # sadece verilen ağaçlar
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

const DATA_DIR = path.resolve(__dirname, '..', 'import_data', 'arabam');
const DEFAULT_TREES = [
  'tree_otomobil.json',
  'tree_minivan-panelvan.json',
  'tree_arazi-suv-pick-up.json',
].map((f) => path.join(DATA_DIR, f));

/** Ağacın kök kategorisi → ad üzerinden çıkarılamayan kasa tipi. */
const CATEGORY_BODY: Record<string, BodyType | null> = {
  otomobil: null,
  'minivan-panelvan': 'mpv',
  'arazi-suv-pick-up': 'suv',
};

// "1.3", "2.0T", "0.9 TCe" → litre
const LITRE_RE = /(?<![\d.])(\d{1,2}\.\d)(?![\d.])/;
const KWH_RE = /\d+\s*kWh/i;

const BRAND_RENAMES: Record<string, string> = {
  'mercedes - benz': 'Mercedes-Benz',
  'iveco - otoyol': 'Iveco',
};

interface TreeNode {
  name: string;
  path: string;
  depth: number;
  category: string;
  level: string;
  note?: string;
  children?: TreeNode[];
}

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
interface Stats {
  nodes: number;
  dupSub: number;
  seriOnly: number;
  modelOnly: number;
  trim: number;
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

function makeSub(
  modelName: string,
  name: string,
  isSeriOnly: boolean,
  categoryBody: BodyType | null,
): Sub {
  return {
    name,
    engineCC: isSeriOnly ? 0 : parseEngineCC(name),
    trimName: isSeriOnly ? null : name,
    fuelType: inferFuelType(name),
    transmission: inferTransmission(name),
    bodyType: inferBodyType(`${modelName} ${name}`) ?? categoryBody,
  };
}

class TreeBuilder {
  readonly brands = new Map<string, Brand>();
  readonly stats: Stats = {
    nodes: 0,
    dupSub: 0,
    seriOnly: 0,
    modelOnly: 0,
    trim: 0,
  };

  private getBrand(raw: string): Brand {
    const name = brandName(raw);
    const key = name.toLowerCase();
    let b = this.brands.get(key);
    if (!b) this.brands.set(key, (b = { name, models: new Map() }));
    return b;
  }

  private getModel(b: Brand, raw: string): Model {
    const name = norm(raw);
    const key = name.toLowerCase();
    let m = b.models.get(key);
    if (!m) b.models.set(key, (m = { name, subs: new Map() }));
    return m;
  }

  private addSub(model: Model, sub: Sub): void {
    const key = sub.name.toLowerCase();
    if (model.subs.has(key)) {
      this.stats.dupSub++;
      return;
    }
    model.subs.set(key, sub);
  }

  addTree(root: TreeNode): void {
    const body = CATEGORY_BODY[root.category] ?? null;
    if (!(root.category in CATEGORY_BODY)) {
      console.warn(
        `  ! bilinmeyen kategori "${root.category}" (${root.name}); kasa tipi varsayılanı yok`,
      );
    }
    for (const marka of root.children ?? []) {
      this.stats.nodes++;
      const brand = this.getBrand(marka.name);
      for (const seri of marka.children ?? []) {
        this.stats.nodes++;
        if (seri.level !== 'seri') {
          console.warn(
            `  ! ${marka.name} / ${seri.name}: beklenen seviye "seri", gelen "${seri.level}"; atlandı`,
          );
          continue;
        }
        const model = this.getModel(brand, seri.name);
        const motors = seri.children ?? [];
        if (motors.length === 0) {
          this.stats.seriOnly++;
          this.addSub(model, makeSub(model.name, model.name, true, body));
          continue;
        }
        for (const motorNode of motors) {
          this.stats.nodes++;
          const motor = norm(motorNode.name);
          const trims = motorNode.children ?? [];
          if (trims.length === 0) {
            this.stats.modelOnly++;
            this.addSub(model, makeSub(model.name, motor, false, body));
            continue;
          }
          for (const trimNode of trims) {
            this.stats.nodes++;
            const trim = norm(trimNode.name);
            // "1.6 TDi" + "1.6 TDi" ya da "2.0 CDTI" + "CDTi" → tekrar etme
            const name = motor.toLowerCase().endsWith(trim.toLowerCase())
              ? motor
              : `${motor} ${trim}`;
            this.stats.trim++;
            this.addSub(model, makeSub(model.name, name, false, body));
          }
        }
      }
    }
  }
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
  const files = args.filter((a) => !a.startsWith('-'));
  const treePaths = files.length
    ? files.map((f) => path.resolve(f))
    : DEFAULT_TREES;

  const builder = new TreeBuilder();
  for (const p of treePaths) {
    if (!fs.existsSync(p)) {
      console.error(`Ağaç dosyası bulunamadı: ${p}`);
      process.exit(1);
    }
    const root = JSON.parse(fs.readFileSync(p, 'utf8')) as TreeNode;
    const before = builder.stats.nodes;
    builder.addTree(root);
    console.log(
      `${path.basename(p)}: ${root.name} (${root.category}) → ${builder.stats.nodes - before} düğüm`,
    );
  }
  const { brands, stats } = builder;

  const models = [...brands.values()].flatMap((b) => [...b.models.values()]);
  const subs = models.flatMap((m) => [...m.subs.values()]);
  const count = (f: (s: Sub) => unknown) => subs.filter((s) => f(s)).length;

  console.log(
    `Toplam: ${stats.nodes} düğüm → ${brands.size} marka, ${models.length} model, ${subs.length} alt model`,
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
