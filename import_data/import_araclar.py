#!/usr/bin/env python3
"""
araclar_secenekli.csv → brands / car_models / car_sub_models  (tek seferlik yükleme)

Eşleme (CSV 4 seviye, DB 3 seviye):
  marka    → brands.name
  model    → car_models.name
  altmodel → car_sub_models.name'in ön eki ("500C · 1.4 T-Jet (135 bg) 2008 - 2014")
  secenek  → car_sub_models.name
             year      = secenek'teki başlangıç yılı ("2008 - 2014" → 2008)
             engine_cc = secenek'teki hacim ("1.4" → 1400, "1750" → 1750, kWh → 0)

Marka adı model/altmodel adının başındaysa kırpılır ("Abarth 500C" → "500C").
"Audi"/"AUDI" gibi büyük-küçük harf farkıyla mükerrer markalar birleştirilir.
Boş secenek'li altmodeller (konsept/prototip) atlanır.

TRUNCATE brands CASCADE → car_models, car_sub_models, reviews, favorites, review_likes
dahil hepsi silinir ve sıfırdan yüklenir.

Kullanım:
  python3 import_data/import_araclar.py --dry-run   # DB'ye dokunmaz, istatistik basar
  python3 import_data/import_araclar.py             # onay ister
  python3 import_data/import_araclar.py --yes       # onay sormaz
"""
import argparse
import csv
import os
import re
import sys
import uuid
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV = os.path.join(ROOT, 'araclar_secenekli.csv')

# "... 2008 - 2014" / "... 2008–2014" / "... 2024"  (sondaki parantez toleranslı)
YEAR_RANGE_RE = re.compile(r'((?:18|19|20)\d{2})\s*[-–]\s*((?:18|19|20)\d{2})\s*(?:\([^)]*\))?\s*$')
YEAR_SINGLE_RE = re.compile(r'((?:18|19|20)\d{2})\s*(?:\([^)]*\))?\s*$')
YEAR_ANY_RE = re.compile(r'(?<!\d)((?:18|19|20)\d{2})(?!\d)')
YEAR_RANGE_HEAD_RE = re.compile(r'(?<!\d)(?:18|19|20)\d{2}\s*[-–]\s*(?:18|19|20)\d{2}(?!\d)')
# "1.4", "2.0T", "3.0 i V6"
LITRE_RE = re.compile(r'(?<![\d.])(\d{1,2}\.\d)(?![\d.])')
# "1750 (113 bg)", "1300 Super" → "(" öncesi 3-4 haneli sayı
CC_RE = re.compile(r'(?<![\d.])(\d{3,4})(?![\d.])')
KWH_RE = re.compile(r'\d+\s*kWh', re.I)


def load_env(path):
    """Minimal .env okuyucu (python-dotenv bağımlılığı yok)."""
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
                v = v[1:-1]
            env[k.strip()] = v
    return env


def parse_year(secenek):
    m = YEAR_RANGE_RE.search(secenek) or YEAR_SINGLE_RE.search(secenek) or YEAR_ANY_RE.search(secenek)
    return int(m.group(1)) if m else 0


def parse_engine_cc(secenek):
    if KWH_RE.search(secenek):
        return 0
    m = LITRE_RE.search(secenek)
    if m:
        return int(round(float(m.group(1)) * 1000))
    head = secenek.split('(', 1)[0]  # "(135 bg)" ve yıl kısmını dışarıda bırak
    head = YEAR_RANGE_HEAD_RE.sub(' ', head)  # "1970–1981 ..." yıl aralığı hacim değil
    m = CC_RE.search(head)
    if m and 500 <= int(m.group(1)) <= 9999:
        return int(m.group(1))
    return 0


def strip_brand(name, brand):
    """'Abarth 500C' → '500C'."""
    n, b = name.strip(), brand.strip()
    if n.lower().startswith(b.lower() + ' ') and n[len(b):].strip():
        return n[len(b):].strip()
    return n


def read_csv(path):
    """CSV'yi brands → models → sub_models ağacına indirger."""
    brands = OrderedDict()  # lower(marka) → {name, models: OrderedDict}
    stats = {'rows': 0, 'empty_secenek': 0, 'dup_secenek': 0}

    with open(path, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            stats['rows'] += 1
            marka = r['marka'].strip()
            if not marka:
                continue

            brand = brands.setdefault(marka.lower(), {'name': marka, 'models': OrderedDict()})

            model_key = r['model_id'].strip() or r['model_alias'].strip()
            model = brand['models'].get(model_key)
            if model is None:
                model = brand['models'][model_key] = {
                    'name': strip_brand(r['model'], marka),
                    'subs': OrderedDict(),
                }

            secenek = r['secenek'].strip()
            if not secenek:
                stats['empty_secenek'] += 1
                continue

            # altmodel == model ise ön ek gereksiz ("500 · 1.4 ..." yerine "1.4 ...")
            altmodel = strip_brand(r['altmodel'], marka)
            prefix = altmodel if altmodel.lower() != model['name'].lower() else ''
            name = f'{prefix} · {secenek}' if prefix else secenek

            sub_key = (r['altmodel_id'].strip(), name.lower())
            if sub_key in model['subs']:
                stats['dup_secenek'] += 1
                continue
            model['subs'][sub_key] = {
                'name': name,
                'year': parse_year(secenek),
                'engine_cc': parse_engine_cc(secenek),
            }

    return brands, stats


def import_tree(cur, brands):
    from psycopg2.extras import execute_values

    cur.execute('TRUNCATE brands CASCADE')

    brand_rows, model_rows, sub_rows = [], [], []
    for b in brands.values():
        bid = str(uuid.uuid4())
        brand_rows.append((bid, b['name']))
        for m in b['models'].values():
            mid = str(uuid.uuid4())
            model_rows.append((mid, m['name'], bid))
            for s in m['subs'].values():
                sub_rows.append((str(uuid.uuid4()), s['name'], s['engine_cc'], s['year'], mid))

    execute_values(cur, 'INSERT INTO brands (id, name) VALUES %s', brand_rows, page_size=1000)
    execute_values(cur, 'INSERT INTO car_models (id, name, brand_id) VALUES %s', model_rows,
                   page_size=1000)
    execute_values(cur, 'INSERT INTO car_sub_models (id, name, engine_cc, year, model_id) VALUES %s',
                   sub_rows, page_size=2000)
    return {'brands': len(brand_rows), 'models': len(model_rows), 'sub_models': len(sub_rows)}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('csv', nargs='?', default=DEFAULT_CSV)
    ap.add_argument('--dry-run', action='store_true', help="DB'ye bağlanma, sadece parse et")
    ap.add_argument('--yes', '-y', action='store_true', help='truncate onayı sorma')
    args = ap.parse_args()

    if not os.path.exists(args.csv):
        sys.exit(f'CSV bulunamadı: {args.csv}')

    brands, pstats = read_csv(args.csv)
    subs = [s for b in brands.values() for m in b['models'].values() for s in m['subs'].values()]
    n_models = sum(len(b['models']) for b in brands.values())
    print(f"CSV: {pstats['rows']} satır → {len(brands)} marka, {n_models} model, {len(subs)} alt model")
    print(f"     boş secenek (atlandı): {pstats['empty_secenek']}, tekrar eden: {pstats['dup_secenek']}, "
          f"year=0: {sum(s['year'] == 0 for s in subs)}, engine_cc=0: {sum(s['engine_cc'] == 0 for s in subs)}")

    if args.dry_run:
        print('Örnek:')
        for b in list(brands.values())[:2]:
            for m in list(b['models'].values())[:2]:
                for s in list(m['subs'].values())[:3]:
                    print(f"  {b['name']} / {m['name']} / {s['name']}  year={s['year']} cc={s['engine_cc']}")
        return

    env = load_env(os.path.join(ROOT, '.env'))
    env.update({k: v for k, v in os.environ.items() if k.startswith('DB_')})
    import psycopg2
    conn = psycopg2.connect(
        host=env.get('DB_HOST'),
        port=int(env.get('DB_PORT') or 5432),
        user=env.get('DB_USER'),
        password=env.get('DB_PASS'),
        dbname=env.get('DB_NAME'),
        sslmode='require' if env.get('DB_SSL') == 'true' else 'prefer',
    )

    if not args.yes:
        ans = input(f"{env.get('DB_NAME')}@{env.get('DB_HOST')}: brands/car_models/car_sub_models "
                    "+ reviews/favorites/review_likes SİLİNECEK. Devam? [y/N] ")
        if ans.strip().lower() not in ('y', 'yes', 'e', 'evet'):
            sys.exit('İptal.')

    try:
        with conn, conn.cursor() as cur:
            stats = import_tree(cur, brands)
        print('Eklendi:', stats)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
