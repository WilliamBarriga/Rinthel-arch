import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scan } from 'scanner';

import { json, makeRepo } from './repos';

const PRISMA_SCHEMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// A customer account.
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now()) @map("created_at")

  @@map("users")
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String @db.Text
  user   User   @relation(fields: [userId], references: [id])
  userId String @unique @map("user_id")
}

model Post {
  id         Int       @id @default(autoincrement())
  title      String    @db.VarChar(200)
  tags       String[]
  author     User?     @relation(fields: [authorId], references: [id], onDelete: SetNull)
  authorId   String?   @map("author_id")
}

enum Role {
  USER
  ADMIN
}
`;

describe('scan: Prisma tables', () => {
  it('reads models into tables with database names, columns (pk, fk, uk, optional) and relations with cardinality', async () => {
    const draft = await scan(makeRepo({ 'package.json': json({ name: 'app' }), 'prisma/schema.prisma': PRISMA_SCHEMA }));

    expect(draft.tables).toEqual([
      {
        id: 'Post',
        name: 'Post',
        origin: 'prisma',
        unit: '.',
        columns: [
          { name: 'id', type: 'Int', pk: true },
          { name: 'title', type: 'String' },
          { name: 'tags', type: 'String[]' },
          { name: 'author_id', type: 'String', fk: true, optional: true },
        ],
        relations: [
          { from: 'Post#author_id', to: 'users#id', cardinality: ['0..*', '0..1'], source: { file: 'prisma/schema.prisma', line: 30 }, confidence: 'extracted' },
        ],
        source: { file: 'prisma/schema.prisma', line: 26 },
        confidence: 'extracted',
      },
      {
        id: 'Profile',
        name: 'Profile',
        origin: 'prisma',
        unit: '.',
        columns: [
          { name: 'id', type: 'Int', pk: true },
          { name: 'bio', type: 'String' },
          { name: 'user_id', type: 'String', fk: true, uk: true },
        ],
        relations: [
          { from: 'Profile#user_id', to: 'users#id', cardinality: ['0..1', '1'], source: { file: 'prisma/schema.prisma', line: 22 }, confidence: 'extracted' },
        ],
        source: { file: 'prisma/schema.prisma', line: 19 },
        confidence: 'extracted',
      },
      {
        id: 'users',
        name: 'users',
        origin: 'prisma',
        unit: '.',
        columns: [
          { name: 'id', type: 'String', pk: true },
          { name: 'email', type: 'String', uk: true },
          { name: 'name', type: 'String', optional: true },
          { name: 'role', type: 'Role' },
          { name: 'created_at', type: 'DateTime' },
        ],
        relations: [],
        source: { file: 'prisma/schema.prisma', line: 7 },
        confidence: 'extracted',
      },
    ]);
  });
});

const SCHEMA_SQL = `-- Initial schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public."customers" (
  "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        varchar(255) NOT NULL UNIQUE,
  nickname     text,
  created_at   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now(); -- CREATE TABLE fake (id int);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/* orders hold one customer; a customer has many orders */
CREATE TABLE orders (
  id          bigserial,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  coupon      text NULL,
  note        text DEFAULT 'a; b',
  CONSTRAINT orders_pk PRIMARY KEY (id),
  CHECK (coupon <> '')
);

CREATE TABLE \`order_items\` (
  \`order_id\` bigint NOT NULL,
  \`sku\` varchar(32) NOT NULL,
  \`qty\` int unsigned NOT NULL DEFAULT 1,
  PRIMARY KEY (\`order_id\`, \`sku\`),
  KEY \`by_sku\` (\`sku\`),
  FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`)
) ENGINE=InnoDB;

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER UNIQUE REFERENCES orders,
  total numeric(10, 2)
);

CREATE TABLE report AS SELECT * FROM orders;
CREATE INDEX orders_by_customer ON orders (customer_id);
INSERT INTO customers (email) VALUES ('a@b.c');
`;

describe('scan: SQL DDL tables', () => {
  it('reads CREATE TABLE across dialects: types, pk, fk, uk, nullability and relations; other statements are skipped', async () => {
    const draft = await scan(makeRepo({ 'db/schema.sql': SCHEMA_SQL }));

    expect(draft.tables).toEqual([
      {
        id: 'customers',
        name: 'customers',
        origin: 'sql',
        unit: '.',
        columns: [
          { name: 'id', type: 'uuid', pk: true },
          { name: 'email', type: 'varchar(255)', uk: true },
          { name: 'nickname', type: 'text', optional: true },
          { name: 'created_at', type: 'timestamp with time zone' },
        ],
        relations: [],
        source: { file: 'db/schema.sql', line: 4 },
        confidence: 'extracted',
      },
      {
        id: 'invoices',
        name: 'invoices',
        origin: 'sql',
        unit: '.',
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'order_id', type: 'INTEGER', fk: true, uk: true, optional: true },
          { name: 'total', type: 'numeric(10, 2)', optional: true },
        ],
        relations: [
          { from: 'invoices#order_id', to: 'orders#id', cardinality: ['0..1', '0..1'], source: { file: 'db/schema.sql', line: 39 }, confidence: 'extracted' },
        ],
        source: { file: 'db/schema.sql', line: 37 },
        confidence: 'extracted',
      },
      {
        id: 'order_items',
        name: 'order_items',
        origin: 'sql',
        unit: '.',
        columns: [
          { name: 'order_id', type: 'bigint', pk: true, fk: true },
          { name: 'sku', type: 'varchar(32)', pk: true },
          { name: 'qty', type: 'int unsigned' },
        ],
        relations: [
          { from: 'order_items#order_id', to: 'orders#id', cardinality: ['0..*', '1'], source: { file: 'db/schema.sql', line: 34 }, confidence: 'extracted' },
        ],
        source: { file: 'db/schema.sql', line: 28 },
        confidence: 'extracted',
      },
      {
        id: 'orders',
        name: 'orders',
        origin: 'sql',
        unit: '.',
        columns: [
          { name: 'id', type: 'bigserial', pk: true },
          { name: 'customer_id', type: 'uuid', fk: true },
          { name: 'coupon', type: 'text', optional: true },
          { name: 'note', type: 'text', optional: true },
        ],
        relations: [
          { from: 'orders#customer_id', to: 'customers#id', cardinality: ['0..*', '1'], source: { file: 'db/schema.sql', line: 21 }, confidence: 'extracted' },
        ],
        source: { file: 'db/schema.sql', line: 19 },
        confidence: 'extracted',
      },
    ]);
  });

  it('folds a migration history in path order: ALTER, RENAME, DROP and unique indexes; down migrations are skipped', async () => {
    const draft = await scan(
      makeRepo({
        'db/migrations/0001_init.up.sql': 'CREATE TABLE users (id int PRIMARY KEY, name text);\nCREATE TABLE posts (id int PRIMARY KEY, user_id int, legacy text);\n',
        'db/migrations/0001_init.down.sql': 'DROP TABLE posts;\nDROP TABLE users;\n',
        'db/migrations/0002_more.up.sql': [
          'ALTER TABLE users ADD COLUMN email text NOT NULL, ADD COLUMN bio text;',
          'ALTER TABLE ONLY users RENAME COLUMN name TO full_name;',
          'ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;',
          'ALTER TABLE posts ADD CONSTRAINT posts_user FOREIGN KEY (user_id) REFERENCES users (id);',
          'CREATE UNIQUE INDEX users_email ON users (email);',
          'CREATE TABLE tmp (id int);',
          '',
        ].join('\n'),
        'db/migrations/0003_cleanup.up.sql': 'DROP TABLE IF EXISTS tmp;\nALTER TABLE posts DROP COLUMN legacy;\nALTER TABLE posts RENAME TO articles;\n',
      }),
    );

    expect(draft.tables.map(({ id, columns, relations, source }) => ({ id, columns, relations, source }))).toEqual([
      {
        id: 'articles',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'user_id', type: 'int', fk: true, optional: true },
        ],
        relations: [
          {
            from: 'articles#user_id',
            to: 'users#id',
            cardinality: ['0..*', '0..1'],
            source: { file: 'db/migrations/0002_more.up.sql', line: 4 },
            confidence: 'extracted',
          },
        ],
        source: { file: 'db/migrations/0001_init.up.sql', line: 2 },
      },
      {
        id: 'users',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'full_name', type: 'text' },
          { name: 'email', type: 'text', uk: true },
          { name: 'bio', type: 'text', optional: true },
        ],
        relations: [],
        source: { file: 'db/migrations/0001_init.up.sql', line: 1 },
      },
    ]);
  });

  it('groups timestamped migration folders, keeps separate folders apart and skips Prisma and drizzle-kit migrations', async () => {
    const draft = await scan(
      makeRepo({
        'api/migrations/20240101_init/up.sql': 'CREATE TABLE accounts (id int PRIMARY KEY);\n',
        'api/migrations/20240202_owner/up.sql': 'ALTER TABLE accounts ADD owner text;\n',
        'legacy/schema.sql': 'CREATE TABLE accounts (code text PRIMARY KEY);\n',
        'prisma/schema.prisma': 'model Account {\n  id Int @id\n}\n',
        'prisma/migrations/migration_lock.toml': 'provider = "postgresql"\n',
        'prisma/migrations/20240101_init/migration.sql': 'CREATE TABLE "Account" ("id" INTEGER NOT NULL);\n',
        'drizzle/0000_init.sql': 'CREATE TABLE `things` (`id` int);\n',
        'drizzle/meta/_journal.json': '{}\n',
      }),
    );

    expect(draft.tables.map(({ id, origin, columns }) => ({ id, origin, columns: columns.map(({ name }) => name) }))).toEqual([
      { id: 'Account', origin: 'prisma', columns: ['id'] },
      { id: 'api/migrations/20240101_init/up.sql:accounts', origin: 'sql', columns: ['id', 'owner'] },
      { id: 'legacy/schema.sql:accounts', origin: 'sql', columns: ['code'] },
    ]);
  });
});

describe('scan: schemas are read, never run', () => {
  it('ignores Prisma and ORM config files next to the schema, which would run code if loaded', async () => {
    const root = makeRepo({});
    const ran = join(root, 'ran');
    const marker = `require('node:fs').writeFileSync(${JSON.stringify(ran)}, 'ran');\n`;
    for (const [path, text] of Object.entries({
      'prisma/schema.prisma': 'model User {\n  id Int @id\n}\n',
      'prisma.config.ts': marker,
      '.prisma-astrc.js': marker,
      'drizzle.config.js': marker,
      'db/seed.sql': "CREATE TABLE seeds (id int);\nCOPY seeds FROM PROGRAM 'touch ran';\n",
    })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }

    const draft = await scan(root);

    expect(draft.tables.map(({ id }) => id)).toEqual(['User', 'seeds']);
    expect(existsSync(ran)).toBe(false);
  });
});

describe('scan: table ids and multi-file schemas', () => {
  it('resolves relations across the files of a multi-file schema, with composite keys', async () => {
    const draft = await scan(
      makeRepo({
        'prisma/schema/user.prisma': 'model User {\n  id Int @id\n}\n',
        'prisma/schema/membership.prisma': [
          'model Membership {',
          '  userId Int',
          '  teamId Int',
          '  slug   String',
          '  user   User @relation(fields: [userId], references: [id])',
          '',
          '  @@id([userId, teamId])',
          '  @@unique([slug])',
          '}',
          '',
        ].join('\n'),
      }),
    );

    expect(draft.tables.map(({ id, columns, relations }) => ({ id, columns, relations }))).toEqual([
      {
        id: 'Membership',
        columns: [
          { name: 'userId', type: 'Int', pk: true, fk: true },
          { name: 'teamId', type: 'Int', pk: true },
          { name: 'slug', type: 'String', uk: true },
        ],
        relations: [
          { from: 'Membership#userId', to: 'User#id', cardinality: ['0..*', '1'], source: { file: 'prisma/schema/membership.prisma', line: 5 }, confidence: 'extracted' },
        ],
      },
      { id: 'User', columns: [{ name: 'id', type: 'Int', pk: true }], relations: [] },
    ]);
  });

  it('qualifies clashing names with their schema file, points each relation at its own schema, and skips what does not parse', async () => {
    const schema = (extra: string) =>
      `model User {\n  id Int @id\n}\n\nmodel Post {\n  id Int @id\n  user User @relation(fields: [userId], references: [id])\n  userId Int\n}\n${extra}`;
    const root = makeRepo({
      'apps/a/package.json': json({ name: 'a' }),
      'apps/a/schema.prisma': schema(''),
      'apps/b/package.json': json({ name: 'b' }),
      'apps/b/schema.prisma': schema('model {{ broken\nmodel Tail {\n  id Int @id @default(\n'),
    });

    const draft = await scan(root);

    expect(draft.tables.map(({ id, unit, relations }) => ({ id, unit, to: relations.map((relation) => relation.to) }))).toEqual([
      { id: 'Tail', unit: 'apps/b', to: [] },
      { id: 'apps/a/schema.prisma:Post', unit: 'apps/a', to: ['apps/a/schema.prisma:User#id'] },
      { id: 'apps/a/schema.prisma:User', unit: 'apps/a', to: [] },
      { id: 'apps/b/schema.prisma:Post', unit: 'apps/b', to: ['apps/b/schema.prisma:User#id'] },
      { id: 'apps/b/schema.prisma:User', unit: 'apps/b', to: [] },
    ]);
    expect((await scan(root)).tables).toEqual(draft.tables);
  });
});
