import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * İş listesi #22-24, #31: yorum durumu, sevilen/sevilmeyen konular,
 * şikayet ve engelleme tabloları.
 *
 * Idempotent (IF NOT EXISTS): synchronize ile şeması zaten oluşmuş test
 * DB'sinde de, sıfır üretim DB'sinde de güvenle çalışır. İsimler TypeORM'un
 * synchronize ile ürettikleriyle aynıdır, böylece synchronize açık
 * ortamlarda fark çıkmaz. Uygulama açılışında otomatik çalışır
 * (`migrationsRun: true`).
 */
export class ModerationAndTopics1795560000000 implements MigrationInterface {
  name = 'ModerationAndTopics1795560000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await q.query(`
      ALTER TABLE reviews
        ADD COLUMN IF NOT EXISTS liked_topics text,
        ADD COLUMN IF NOT EXISTS disliked_topics text,
        ADD COLUMN IF NOT EXISTS status varchar(10) NOT NULL DEFAULT 'visible',
        ADD COLUMN IF NOT EXISTS hidden_reason varchar(20),
        ADD COLUMN IF NOT EXISTS hidden_at timestamp`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_7b06c23cf52ca8aea0dcaf0ee2" ON reviews (status)`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS review_reports (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        review_id uuid NOT NULL,
        reporter_id uuid NOT NULL,
        reason varchar(20) NOT NULL,
        note varchar(500),
        status varchar(10) NOT NULL DEFAULT 'open',
        resolved_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_173974ee185c21487767bdb54dc" PRIMARY KEY (id),
        CONSTRAINT "UQ_4880badd5431b200883787eea58" UNIQUE (review_id, reporter_id),
        CONSTRAINT "FK_207877d200ea358e05ab4d70338" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        CONSTRAINT "FK_a1d13fbf76eac29f56905097655" FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_207877d200ea358e05ab4d7033" ON review_reports (review_id)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_6a512316cea80cb9df7ee19598" ON review_reports (status)`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS user_blocks (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        blocker_id uuid NOT NULL,
        blocked_id uuid NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_0bae5f5cab7574a84889462187c" PRIMARY KEY (id),
        CONSTRAINT "UQ_48667515438e7d0f0fed998b193" UNIQUE (blocker_id, blocked_id),
        CONSTRAINT "FK_dfcd8a81016d1de587fbd2d70bf" FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT "FK_7a0806a54f0ad9ced3e247cacd1" FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_dfcd8a81016d1de587fbd2d70b" ON user_blocks (blocker_id)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_blocks`);
    await q.query(`DROP TABLE IF EXISTS review_reports`);
    await q.query(`DROP INDEX IF EXISTS "IDX_7b06c23cf52ca8aea0dcaf0ee2"`);
    await q.query(`
      ALTER TABLE reviews
        DROP COLUMN IF EXISTS hidden_at,
        DROP COLUMN IF EXISTS hidden_reason,
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS disliked_topics,
        DROP COLUMN IF EXISTS liked_topics`);
  }
}
