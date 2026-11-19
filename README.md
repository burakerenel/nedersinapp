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
| `npm run cleanup:test-data` | Seed kullanıcılarını (yorum/beğeni/favorileri CASCADE ile), `@example.com` test hesaplarını ve `-- --review-ids a,b` ile verilen deneme yorumlarını siler. Varsayılan kuru çalışma; `-- --apply` ile uygular. `DB_NAME` "prod" içeriyorsa durur. |

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
`FileTooLarge`, `UnsupportedFileType`, `ContentNotAllowed`, `CannotReportOwnReview`,
`ReportAlreadyExists`, `CannotBlockSelf`, `UserNotFound`, `Forbidden`, `Conflict`...). `data.errors` sadece alan
doğrulama hatalarında gelir. Servis katmanında `ApiException` kullanılır
(`src/common/exceptions/api.exception.ts`).

## Endpoint'ler

Swagger `/api/docs` güncel listedir. Özet:

- **Auth**: `POST /auth/register`, `POST /auth/login` (ikisi de `{ accessToken, user }`),
  `POST /auth/google` `{ idToken }`, `POST /auth/apple` `{ identityToken, firstName?, lastName?, authorizationCode? }`,
  `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/me`
- **Kullanıcı**: `PATCH /users/me`, `PATCH /users/me/password`, `DELETE /users/me` `{ password? }`
  (favoriler + beğeniler silinir, yorumlar "Silinmiş Kullanıcı" olarak kalır, eski token 401 olur,
  e-posta yeniden kayıt için serbest kalır). Parola kuralı: en az 6 karakter (kayıt, sıfırlama, değiştirme).
- **Engelleme**: `POST /users/{userId}/block` (201, idempotent; kendini engelleme `400 CannotBlockSelf`),
  `DELETE /users/{userId}/block` (200, idempotent), `GET /users/me/blocks`. Token'lı isteklerde engellenen
  kullanıcının yorumları `/reviews/sub-model`, `/reviews/model` ve `/reviews/recent` listelerinden çıkar.
  Yorum cevabındaki `user.id` engelleme için kullanılır; silinmiş hesapta `null`.
- **Araç**: `GET /cars/brands`, `GET /cars/brands/popular?limit=8`, `GET /cars/brands/{id}` (modeller
  `reviewCount`, `averageRating`, `issueCount` ile),
  `GET /cars/models/{id}` (modelin tüm alt modelleri üzerinden toplu `reviewCount`, `averageRating`,
  `issueCount`, `hasChronicIssue`, `categoryAverages`, `recommendPercent`, `topicCounts`,
  `likedTopicCounts`, `dislikedTopicCounts`, `ratingCounts`, `subModelCount` + tekil istatistikli `subModels`),
  `GET /cars/models/{id}/issues`,
  `GET /cars/models/search?q=&brandId=&bodyType=&fuelType=&sort=reviewCount|rating&page=&limit=`
  (model başına tek kart; kuşak düzeyi arama için),
  `GET /cars/sub-models/{id}`, `GET /cars/sub-models/{id}/issues`,
  `GET /cars/popular?limit=`, `GET /cars/search?q=&yearFrom=&yearTo=&bodyType=&fuelType=&sort=reviewCount|rating&page=&limit=`
- **Yorum**: `POST /reviews`, `PATCH /reviews/{id}`, `DELETE /reviews/{id}`, `POST /reviews/{id}/like`,
  `GET /reviews/recent`, `GET /reviews/me` (gizli yorumlar da döner, `status` ile),
  `GET /reviews/sub-model/{id}?sort=newest|highest|lowest|mostLiked&q=&topic=&ratings=1,2&page=&limit=`
  (public; token gelirse `isMine`, `isLikedByMe` dolar),
  `GET /reviews/model/{modelId}?...` (aynı filtreler; modelin tüm alt modelleri, her kayıtta `carSubModel`).
  - Konular: `likedTopics` ve `dislikedTopics` (ikisi de `topics` değerlerinden, kesişemez →
    `400 ValidationError`). Cevapta ikisi de + birleşim olan `topics` döner. Sadece eski `topics`
    gönderilirse puana göre dağıtılır: 1-2 → `dislikedTopics`, 4-5 → `likedTopics`, 3 → yalnızca `topics`.
    `topic` filtresi birleşimde arar. Eski kayıtlar ilk açılışta aynı kuralla bir kez dolduruldu.
  - Cevapta `imageIds` (`images` ile aynı sırada), `status` (`visible` | `hidden`), `hiddenReason`
    (`auto_reports` | `manual`, sadece gizliyken).
  - İçerik filtresi: küfür/hakaret listesine takılan başlık ya da metin `400 ContentNotAllowed`
    (`src/common/content-filter.ts`, kelime sınırlı desenler + leet sadeleştirme).
- **Şikayet**: `POST /reviews/{id}/report` `{ reason: spam|abuse|false_info|personal_data|other, note? ≤500 }`
  → 201; tekrar `409 ReportAlreadyExists`, kendi yorumu `403 CannotReportOwnReview`. 3 ayrı açık şikayet
  alan yorum inceleme için otomatik gizlenir (`hiddenReason: auto_reports`).
- **Yönetim** (`x-internal-token` başlığı = `INTERNAL_API_TOKEN`; Swagger'da `admin` etiketi):
  `GET /admin/reports?status=open|resolved|all&page=&limit=`,
  `GET /admin/reviews?status=hidden|visible|reported|all&page=&limit=`,
  `PATCH /admin/reviews/{id}/status` `{ status: visible|hidden }` (yorumun açık şikayetleri çözüldü
  olur), `DELETE /admin/reviews/{id}`. Gizli yorum herkese açık listelerde, ortalamalarda, kronik
  sorunlarda ve marka/model sayaçlarında yer almaz; beğenilemez ve şikayet edilemez (`404`).
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

`/issues`: görünür yorumlarda `dislikedTopics` olarak işaretlenen ve en az 2 yorumda tekrar eden
konular (puan koşulu yok; eski kayıtlarda 1-2 puanlı yorumun konuları sevilmeyen sayıldı). Model
düzeyinde (`/cars/models/{id}/issues`) aynı kural modelin tüm alt modellerine uygulanır. `severity`:
`high` = en az 3 bildirim ve tüm yorumların ≥ %20'si, `medium` = en az 2 bildirim ve ≥ %10, aksi `low`.
`hasChronicIssue` = en az bir `high`.

### Arama (`q`)

Yorum kaydedilirken başlık + metin + konular küçük harfe çevrilip Türkçe karakterleri sadeleştirilerek
`search_text` kolonuna yazılır (`pg_trgm` GIN indeksi); `q` aynı şekilde normalize edilip `LIKE` ile aranır.

## Sosyal giriş notları

- Google: `GOOGLE_CLIENT_IDS` boşsa koddaki NeDersin client ID'leri kullanılır.
- Apple: `identityToken` Apple JWKS ile doğrulanır, `aud` = `APPLE_CLIENT_IDS`. Hesap silmede Apple
  token iptali için uygulamanın `authorizationCode` göndermesi ve `APPLE_TEAM_ID / APPLE_KEY_ID /
  APPLE_PRIVATE_KEY` tanımlı olması gerekir; yoksa iptal adımı atlanır (log'a yazılır).
- Eşleştirme: providerId → aynı e-posta (hesaba bağlanır) → yeni kullanıcı (`termsAccepted: true`, şifresiz).

## Dağıtım notları

- Fotoğraflar DigitalOcean Spaces'e yazılır: `SPACES_BUCKET`, `SPACES_KEY`, `SPACES_SECRET`,
  `SPACES_REGION` (fra1), `SPACES_PUBLIC_URL` (CDN). Bucket'ta dosya erişimi "public" ya da nesne
  bazlı `public-read` ACL açık olmalı (kod nesneleri `public-read` ile yükler). `SPACES_*` boşsa
  yerel diske düşer; bu sadece geliştirme için uygundur.
- Üretim imajı `NODE_ENV=production` ile `synchronize` kapalıdır. Şema değişiklikleri
  `src/migrations` altındadır ve uygulama açılışında otomatik çalışır (`migrationsRun`); deploy'da
  elle iş yoktur. Migration'lar idempotent yazılır (`IF NOT EXISTS`).
- CI (`.github/workflows/ci-cd.yml`): her push/PR'da lint + tip denetimi + test + build; `main`'e
  push'ta testler geçerse imaj DigitalOcean registry'ye gönderilir.
- Google client ID'leri (Web/iOS/Android) kodda varsayılan olarak tanımlı; `GOOGLE_CLIENT_IDS` env'i
  verilirse onu kullanır. Apple için `APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY` hâlâ sunucu
  env'inde girilmeli (özel anahtar).
