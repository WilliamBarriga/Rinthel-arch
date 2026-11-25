import { describe, expect, it } from 'vitest';

import { scan } from 'scanner';

import { json, makeRepo } from './repos';

/** A file that would fail at import time: the scan must never run it. */
const BROKEN = "import { missing } from 'does-not-exist';\nthrow new Error('must not run');\n";

const DRIZZLE = `import { integer, pgTable, primaryKey, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { missing } from 'does-not-exist';

throw new Error('must not run');

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: text('display_name'),
});

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    authorId: integer('author_id').references(() => users.id),
    editorId: integer().notNull().references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id] })],
);

export const members = pgTable('members', {
  userId: integer('user_id').notNull().references(() => users.id),
  teamId: integer('team_id').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.teamId] }) }));

export const dynamic = pgTable(prefix + 'things', { id: serial('id') });
`;

const DJANGO_BLOG = `from django.db import models
from nowhere import missing

raise RuntimeError("must not run")

class Author(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    bio = models.TextField(null=True)

    class Meta:
        db_table = "blog_writers"

class Entry(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE)
    editor = models.ForeignKey("Author", null=True, on_delete=models.SET_NULL, related_name="edited")
    slug = models.SlugField(primary_key=True)
    tags = models.ManyToManyField("Tag")
    cover = models.OneToOneField("media.Image", on_delete=models.CASCADE)

class Tag(models.Model):
    label = models.CharField(max_length=20)

class Timestamped(models.Model):
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True

class Comment(Timestamped):
    entry = models.ForeignKey(Entry, db_column="entry_slug", on_delete=models.CASCADE)
`;

const DJANGO_MEDIA = `from django.db import models

class Image(models.Model):
    path = models.CharField(max_length=200)
`;

const SQLALCHEMY = `from typing import Optional
from sqlalchemy import Column, ForeignKey, Integer, String, Table
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
import not_installed

raise RuntimeError("must not run")

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True)
    nickname: Mapped[Optional[str]] = mapped_column(String(40))

class Address(Base):
    __tablename__ = "addresses"
    id = Column(Integer, primary_key=True)
    user_id = Column("owner_id", Integer, ForeignKey("users.id"), nullable=False)
    backup_id: Mapped[int | None] = mapped_column(ForeignKey(User.id), unique=True)
    city = Column(String)

class Plain:
    value = Column(Integer)

audit = Table(
    "audit",
    Base.metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id")),
)
`;

describe('scan: ORM tables', () => {
  it('reads Drizzle tables without running the schema file', async () => {
    const draft = await scan(makeRepo({ 'package.json': json({ name: 'app' }), 'src/db/schema.ts': DRIZZLE, 'src/broken.ts': BROKEN }));

    expect(draft.tables.map(({ id }) => id)).toEqual(['members', 'posts', 'users']);
    expect(draft.tables.find(({ id }) => id === 'users')).toEqual({
      id: 'users',
      name: 'users',
      origin: 'drizzle',
      unit: '.',
      columns: [
        { name: 'id', type: 'serial', pk: true },
        { name: 'email', type: 'varchar', uk: true },
        { name: 'display_name', type: 'text', optional: true },
      ],
      relations: [],
      source: { file: 'src/db/schema.ts', line: 6 },
      confidence: 'extracted',
    });
    expect(draft.tables.find(({ id }) => id === 'posts')).toMatchObject({
      columns: [
        { name: 'id', type: 'serial', pk: true },
        { name: 'title', type: 'text' },
        { name: 'author_id', type: 'integer', fk: true, optional: true },
        { name: 'editorId', type: 'integer', fk: true },
        { name: 'created_at', type: 'timestamp', optional: true },
      ],
      relations: [
        { from: 'posts#author_id', to: 'users#id', cardinality: ['0..*', '0..1'], source: { file: 'src/db/schema.ts', line: 17 }, confidence: 'extracted' },
        { from: 'posts#editorId', to: 'users#id', cardinality: ['0..*', '1'], source: { file: 'src/db/schema.ts', line: 18 }, confidence: 'extracted' },
      ],
    });
    expect(draft.tables.find(({ id }) => id === 'members')).toMatchObject({
      columns: [
        { name: 'user_id', type: 'integer', pk: true, fk: true },
        { name: 'team_id', type: 'integer', pk: true },
      ],
      relations: [{ from: 'members#user_id', to: 'users#id', cardinality: ['0..*', '1'], source: { file: 'src/db/schema.ts', line: 25 } }],
    });
  });

  it('reads Django models: db_table, implicit ids, fks, many-to-many, abstract bases, across apps', async () => {
    const draft = await scan(
      makeRepo({
        'pyproject.toml': '[project]\nname = "site"\n',
        'blog/models.py': DJANGO_BLOG,
        'media/models/__init__.py': DJANGO_MEDIA,
        'blog/migrations/0001_initial.py': 'from django.db import models\nclass Migration:\n    pass\n',
      }),
    );

    expect(draft.tables.map(({ id }) => id)).toEqual(['blog_comment', 'blog_entry', 'blog_entry_tags', 'blog_tag', 'blog_writers', 'media_image']);
    expect(draft.tables.find(({ id }) => id === 'blog_writers')).toEqual({
      id: 'blog_writers',
      name: 'blog_writers',
      origin: 'django',
      unit: '.',
      columns: [
        { name: 'id', type: 'AutoField', pk: true },
        { name: 'name', type: 'CharField' },
        { name: 'email', type: 'EmailField', uk: true },
        { name: 'bio', type: 'TextField', optional: true },
      ],
      relations: [],
      source: { file: 'blog/models.py', line: 6 },
      confidence: 'extracted',
    });
    expect(draft.tables.find(({ id }) => id === 'blog_entry')).toMatchObject({
      columns: [
        { name: 'author_id', type: 'AutoField', fk: true },
        { name: 'editor_id', type: 'AutoField', fk: true, optional: true },
        { name: 'slug', type: 'SlugField', pk: true },
        { name: 'cover_id', type: 'AutoField', fk: true, uk: true },
      ],
      relations: [
        { from: 'blog_entry#author_id', to: 'blog_writers#id', cardinality: ['0..*', '1'], source: { file: 'blog/models.py', line: 15 }, confidence: 'extracted' },
        { from: 'blog_entry#editor_id', to: 'blog_writers#id', cardinality: ['0..*', '0..1'], source: { file: 'blog/models.py', line: 16 }, confidence: 'extracted' },
        { from: 'blog_entry#cover_id', to: 'media_image#id', cardinality: ['0..1', '1'], source: { file: 'blog/models.py', line: 19 }, confidence: 'extracted' },
      ],
    });
    expect(draft.tables.find(({ id }) => id === 'blog_entry_tags')).toMatchObject({
      columns: [
        { name: 'id', type: 'AutoField', pk: true },
        { name: 'entry_id', type: 'SlugField', fk: true },
        { name: 'tag_id', type: 'AutoField', fk: true },
      ],
      relations: [
        { from: 'blog_entry_tags#entry_id', to: 'blog_entry#slug', cardinality: ['0..*', '1'], source: { file: 'blog/models.py', line: 18 } },
        { from: 'blog_entry_tags#tag_id', to: 'blog_tag#id', cardinality: ['0..*', '1'], source: { file: 'blog/models.py', line: 18 } },
      ],
    });
    expect(draft.tables.find(({ id }) => id === 'blog_comment')).toMatchObject({
      columns: [
        { name: 'id', type: 'AutoField', pk: true },
        { name: 'created', type: 'DateTimeField' },
        { name: 'entry_slug', type: 'SlugField', fk: true },
      ],
      relations: [{ from: 'blog_comment#entry_slug', to: 'blog_entry#slug', cardinality: ['0..*', '1'], source: { file: 'blog/models.py', line: 31 } }],
    });
  });

  it('reads SQLAlchemy declarative classes (Column and mapped_column) and Table(...)', async () => {
    const draft = await scan(makeRepo({ 'pyproject.toml': '[project]\nname = "svc"\n', 'svc/models.py': SQLALCHEMY }));

    expect(draft.tables.map(({ id }) => id)).toEqual(['addresses', 'audit', 'users']);
    expect(draft.tables.find(({ id }) => id === 'users')).toEqual({
      id: 'users',
      name: 'users',
      origin: 'sqlalchemy',
      unit: '.',
      columns: [
        { name: 'id', type: 'int', pk: true },
        { name: 'email', type: 'String', uk: true },
        { name: 'nickname', type: 'String', optional: true },
      ],
      relations: [],
      source: { file: 'svc/models.py', line: 11 },
      confidence: 'extracted',
    });
    expect(draft.tables.find(({ id }) => id === 'addresses')).toMatchObject({
      columns: [
        { name: 'id', type: 'Integer', pk: true },
        { name: 'owner_id', type: 'Integer', fk: true },
        { name: 'backup_id', type: 'int', fk: true, uk: true, optional: true },
        { name: 'city', type: 'String', optional: true },
      ],
      relations: [
        { from: 'addresses#owner_id', to: 'users#id', cardinality: ['0..*', '1'], source: { file: 'svc/models.py', line: 20 }, confidence: 'extracted' },
        { from: 'addresses#backup_id', to: 'users#id', cardinality: ['0..1', '0..1'], source: { file: 'svc/models.py', line: 21 }, confidence: 'extracted' },
      ],
    });
    expect(draft.tables.find(({ id }) => id === 'audit')).toMatchObject({
      columns: [
        { name: 'id', type: 'Integer', pk: true },
        { name: 'user_id', type: 'Integer', fk: true, optional: true },
      ],
      relations: [{ from: 'audit#user_id', to: 'users#id', cardinality: ['0..*', '0..1'], source: { file: 'svc/models.py', line: 31 } }],
    });
  });

  it('lowers confidence instead of failing on patterns it cannot read', async () => {
    const draft = await scan(
      makeRepo({
        'package.json': json({ name: 'app' }),
        'schema.ts':
          "import { pgTable, serial } from 'drizzle-orm/pg-core';\nconst shared = { id: serial('id') };\nexport const odd = pgTable('odd', { ...shared, extra: buildColumn() });\n",
      }),
    );
    expect(draft.tables).toMatchObject([{ id: 'odd', origin: 'drizzle', confidence: 'inferred', columns: [{ name: 'extra', type: 'unknown' }] }]);
  });
});
