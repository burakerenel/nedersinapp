# Nedersinapp

NeDersin araç yorumları API'si — NestJS 11 + TypeORM + PostgreSQL.

## Çalıştırma

```bash
cp .env.example .env     # değerleri doldur
npm install
npm run start:dev        # http://localhost:3000, Swagger: /api/docs
```

Docker ile geliştirme: `docker compose -f docker/dev/docker-compose.yml up`.

## Veri yükleme

| Komut | Ne yapar |
| --- | --- |
| `npm run import:arabam` | `import_data/arabam/tree_{otomobil,minivan-panelvan,arazi-suv-pick-up}.json` (arabam.com ağaçları: marka → seri → motor → donanım; aynı marka/seri birleştirilir) → brands / car_models / car_sub_models (tabloları sıfırlar; `-- --dry` ile sadece istatistik). Alt model adı `"<motor> <donanım>"`, yıl/beygir yok. fuel/transmission/body import sırasında dolar (body çıkarılamazsa kategoriden: arazi → suv, minivan → mpv), backfill gerekmez. Motosiklet ağacı dahil edilmez. |
| `python3 import_data/import_araclar.py` | (eski kaynak) `araclar_secenekli.csv` → aynı tablolar |
| `npm run backfill:sub-models` | Alt model adını ayrıştırır: `trimName`, `generation`, `horsePower`, `yearFrom`, `yearTo`, `fuelType`, `transmission`, `bodyType`. Import sonrası bir kez çalıştır; idempotent. `-- --dry` ile sadece istatistik basar. |
| `npm run seed:test-data` | Test ortamı için 5 araca (Egea, Clio, Corolla, i20, Passat) 12-15'er yorum, kronik sorun ve beğeni ekler. Seed kullanıcıları `seed+1..20@nedersin.test`, şifre `Seed1234`. Idempotent. |

Şema: `NODE_ENV` production değilse TypeORM `synchronize` açıktır (bkz. `DB_SYNC`). Yeni kolonlar
uygulama bir kez çalıştırılınca eklenir; `backfill` bunu bekler.

## Cevap formatı

Başarılı: `{ "status": "success", "message": null, "data": ... }` — sayfalı uçlarda ek olarak
`"meta": { "page", "limit", "total", "hasMore" }`.

Hata (4xx `fail`, 5xx `error`):

```json
{
  "status": "fail",
  "message": "Puan 1 ile 5 arasında olmalı",
  "data": { "code": "ValidationError", "errors": { "rating": "1 ile 5 arasında olmalı" } }
}
```

`message` Türkçe ve doğrudan gösterilebilir; `data.code` sabit kod (`ValidationError`, `Unauthorized`,
`InvalidCredentials`, `NotFound`, `CarNotFound`, `ReviewNotFound`, `ReviewAlreadyExists`,
`CannotLikeOwnReview`, `InvalidResetCode`, `InvalidSocialToken`, `EmailAlreadyInUse`,
`FileTooLarge`, `UnsupportedFileType`, `Forbidden`, `Conflict`...). `data.errors` sadece alan
doğrulama hatalarında gelir. Servis katmanında `ApiException` kullanılır
(`src/common/exceptions/api.exception.ts`).

## Endpoint'ler

Swagger `/api/docs` güncel listedir. Özet:

- **Auth**: `POST /auth/register`, `POST /auth/login` (ikisi de `{ accessToken, user }`),
  `POST /auth/google` `{ idToken }`, `POST /auth/apple` `{ identityToken, firstName?, lastName?, authorizationCode? }`,
  `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/me`
- **Kullanıcı**: `PATCH /users/me`, `PATCH /users/me/password`, `DELETE /users/me` `{ password? }`
  (favoriler + beğeniler silinir, yorumlar "Silinmiş Kullanıcı" olarak kalır, eski token 401 olur,
  e-posta yeniden kayıt için serbest kalır)
- **Araç**: `GET /cars/brands`, `GET /cars/brands/popular?limit=8`, `GET /cars/brands/{id}`,
  `GET /cars/models/{id}`, `GET /cars/sub-models/{id}`, `GET /cars/sub-models/{id}/issues`,
  `GET /cars/popular?limit=`, `GET /cars/search?q=&yearFrom=&yearTo=&bodyType=&fuelType=&sort=reviewCount|rating&page=&limit=`
- **Yorum**: `POST /reviews`, `PATCH /reviews/{id}`, `DELETE /reviews/{id}`, `POST /reviews/{id}/like`,
  `GET /reviews/recent`, `GET /reviews/me`,
  `GET /reviews/sub-model/{id}?sort=newest|highest|lowest|mostLiked&q=&topic=&ratings=1,2&page=&limit=`
  (public; token gelirse `isMine`, `isLikedByMe` dolar)
- **Fotoğraf**: `POST /uploads/review-images` (multipart `file`, jpg/png/heic, ≤5 MB) → `{ id, url }`;
  yoruma `imageIds` (≤2) ile bağlanır. 24 saat içinde bağlanmayanlar silinir. Depo: DigitalOcean
  Spaces (`SPACES_*` env, public-read + CDN URL); env yoksa yerel disk (`UPLOADS_DIR`, `/uploads/`).
- **Garajım**: `POST /favorites`, `GET /favorites`, `DELETE /favorites/{id}`
- **Dahili (Swagger'da yok)**: `POST /cars/sub-models` — marka → model → alt model zincirini
  büyük/küçük harf duyarsız bulur ya da oluşturur; `x-internal-token` başlığı `INTERNAL_API_TOKEN`
  env ile eşleşmeli (env boşsa endpoint kapalı). Gövde: `brand`, `model` zorunlu; `name`, `trimName`,
  `generation`, `yearFrom`, `yearTo`, `horsePower`, `engineCC`, `fuelType`, `transmission`, `bodyType`
  isteğe bağlı. Ad verilmezse `"Model (gen) · trim (hp bg) yıl"` biçiminde üretilir; yakıt/şanzıman/kasa
  verilmezse addan tahmin edilir. Yanıt her seviyede `created` bayrağı taşır. Yorum pipeline'ı
  (araba-yorum-pipeline) eşleşmeyen araçlar için bunu kullanır.

### Alt model alanları

Alt model dönen her yerde: `name` (değişmedi), `trimName`, `generation`, `horsePower`, `yearFrom`,
`yearTo` (devam eden üretimde `null`), `fuelType`, `transmission`, `bodyType` (bilinmiyorsa `null`),
`reviewCount`, `averageRating` (yorum yoksa `null`, 1 ondalık), `issueCount`. Detayda ek olarak
`hasChronicIssue`, `categoryAverages`, `recommendPercent`, `topicCounts`, `ratingCounts`.

### Kronik sorunlar

`/issues`: 1-3 puanlı yorumlarda geçen ve en az 2 yorumda tekrar eden konular. `severity`:
`high` = en az 3 bildirim ve tüm yorumların ≥ %20'si, `medium` = en az 2 bildirim ve ≥ %10, aksi `low`.
`hasChronicIssue` = en az bir `high`.

### Arama (`q`)

Yorum kaydedilirken başlık + metin + konular küçük harfe çevrilip Türkçe karakterleri sadeleştirilerek
`search_text` kolonuna yazılır (`pg_trgm` GIN indeksi); `q` aynı şekilde normalize edilip `LIKE` ile aranır.

## Sosyal giriş notları

- Google: `GOOGLE_CLIENT_IDS` boşsa `POST /auth/google` 401 `InvalidSocialToken` döner (kapalı).
- Apple: `identityToken` Apple JWKS ile doğrulanır, `aud` = `APPLE_CLIENT_IDS`. Hesap silmede Apple
  token iptali için uygulamanın `authorizationCode` göndermesi ve `APPLE_TEAM_ID / APPLE_KEY_ID /
  APPLE_PRIVATE_KEY` tanımlı olması gerekir; yoksa iptal adımı atlanır (log'a yazılır).
- Eşleştirme: providerId → aynı e-posta (hesaba bağlanır) → yeni kullanıcı (`termsAccepted: true`, şifresiz).

## Dağıtım notları

- Fotoğraflar DigitalOcean Spaces'e yazılır: `SPACES_BUCKET`, `SPACES_KEY`, `SPACES_SECRET`,
  `SPACES_REGION` (fra1), `SPACES_PUBLIC_URL` (CDN). Bucket'ta dosya erişimi "public" ya da nesne
  bazlı `public-read` ACL açık olmalı (kod nesneleri `public-read` ile yükler). `SPACES_*` boşsa
  yerel diske düşer; bu sadece geliştirme için uygundur.
- Üretim imajı `NODE_ENV=production` ile `synchronize` kapalıdır; yeni kolonlar test DB'ye yerelden
  (`npm run start`) ya da `DB_SYNC=true` ile uygulanır.
