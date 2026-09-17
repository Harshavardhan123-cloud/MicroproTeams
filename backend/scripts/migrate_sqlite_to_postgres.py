"""Replace the PostgreSQL workspace dataset with the local SQLite dataset.

Run from the repository root:
  backend/venv/bin/python backend/scripts/migrate_sqlite_to_postgres.py

The script uses one transaction: PostgreSQL remains unchanged if a table fails
to copy. Take a database backup before running it.
"""

import asyncio
import json
import os
import sqlite3
import uuid
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path

import asyncpg


ROOT = Path(__file__).resolve().parents[2]
SQLITE_PATH = ROOT / "backend" / "teams_local.db"
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://teams_user:teams_password_secret@localhost:5432/teams_db",
).replace("postgresql+asyncpg://", "postgresql://")
BATCH_SIZE = 100


def quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


LEGACY_DEFAULTS = {
    ("notifications", "priority"): "NORMAL",
    ("notifications", "status"): "UNREAD",
}


def convert(value, column, table: str = "", name: str = ""):
    if value is None:
        return LEGACY_DEFAULTS.get((table, name))
    data_type, udt_name = column
    if udt_name == "uuid":
        return uuid.UUID(str(value))
    if data_type == "boolean":
        return bool(value)
    if data_type.startswith("timestamp") or data_type == "date":
        return datetime.fromisoformat(value) if isinstance(value, str) else value
    if data_type == "ARRAY" and isinstance(value, str):
        return json.loads(value)
    # asyncpg accepts JSON/JSONB as their serialized string representation.
    return value


async def table_metadata(connection):
    columns = await connection.fetch(
        """
        SELECT table_name, column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
        """
    )
    result = defaultdict(dict)
    for row in columns:
        result[row["table_name"]][row["column_name"]] = (
            row["data_type"], row["udt_name"]
        )

    dependencies = await connection.fetch(
        """
        SELECT conrelid::regclass::text AS child,
               confrelid::regclass::text AS parent
        FROM pg_constraint
        WHERE contype = 'f' AND connamespace = 'public'::regnamespace
        """
    )
    self_references = await connection.fetch(
        """
        SELECT child.relname AS table_name, attribute.attname AS column_name
        FROM pg_constraint fk
        JOIN pg_class child ON child.oid = fk.conrelid
        JOIN unnest(fk.conkey) AS key(attnum) ON TRUE
        JOIN pg_attribute attribute
          ON attribute.attrelid = child.oid AND attribute.attnum = key.attnum
        WHERE fk.contype = 'f'
          AND fk.conrelid = fk.confrelid
          AND fk.connamespace = 'public'::regnamespace
        """
    )
    user_references = await connection.fetch(
        """
        SELECT child.relname AS table_name, attribute.attname AS column_name
        FROM pg_constraint fk
        JOIN pg_class child ON child.oid = fk.conrelid
        JOIN unnest(fk.conkey) AS key(attnum) ON TRUE
        JOIN pg_attribute attribute
          ON attribute.attrelid = child.oid AND attribute.attnum = key.attnum
        WHERE fk.contype = 'f'
          AND fk.confrelid = 'users'::regclass
          AND fk.connamespace = 'public'::regnamespace
        """
    )
    return result, dependencies, defaultdict(
        set,
        {table: {r["column_name"] for r in self_references if r["table_name"] == table}
         for table in {r["table_name"] for r in self_references}},
    ), user_references


def ordered_tables(tables, dependencies):
    parents = {table: set() for table in tables}
    children = defaultdict(set)
    for row in dependencies:
        child, parent = row["child"], row["parent"]
        if child != parent and child in parents and parent in parents:
            parents[child].add(parent)
            children[parent].add(child)
    ready = deque(sorted(table for table, deps in parents.items() if not deps))
    order = []
    while ready:
        table = ready.popleft()
        order.append(table)
        for child in sorted(children[table]):
            parents[child].remove(table)
            if not parents[child]:
                ready.append(child)
    unresolved = sorted(set(tables) - set(order))
    if unresolved:
        raise RuntimeError(f"Unresolvable foreign-key dependency cycle: {unresolved}")
    return order


async def migrate():
    source = sqlite3.connect(SQLITE_PATH)
    source.row_factory = sqlite3.Row
    source_tables = {
        row[0]
        for row in source.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )
    }

    destination = await asyncpg.connect(DATABASE_URL, timeout=20)
    try:
        target_columns, dependencies, self_references, user_references = await table_metadata(destination)
        tables = sorted(source_tables.intersection(target_columns))
        order = ordered_tables(tables, dependencies)
        source_columns = {
            table: [row[1] for row in source.execute(f"PRAGMA table_info({quote(table)})")]
            for table in tables
        }

        async with destination.transaction():
            await destination.execute(
                "TRUNCATE TABLE " + ", ".join(quote(table) for table in tables)
                + " RESTART IDENTITY CASCADE"
            )

            for table in order:
                print(f"Copying {table}...", flush=True)
                columns = [name for name in source_columns[table] if name in target_columns[table]]
                initial_columns = [name for name in columns if name not in self_references[table]]
                if not initial_columns:
                    continue
                count = 0
                # Legacy file rows can contain both a BLOB and its Base64 copy.
                # Transfer those large records one at a time instead of retaining
                # the entire attachment collection in process memory.
                batch_size = 1 if table == "file_records" else BATCH_SIZE
                cursor = source.execute(
                    f"SELECT {', '.join(quote(name) for name in initial_columns)} FROM {quote(table)}"
                )
                while rows := cursor.fetchmany(batch_size):
                    records = [
                        tuple(
                            convert(row[name], target_columns[table][name], table, name)
                            for name in initial_columns
                        )
                        for row in rows
                    ]
                    await destination.copy_records_to_table(
                        table, records=records, columns=initial_columns
                    )
                    count += len(records)
                    if table == "file_records":
                        print(f"  file record {count}", flush=True)
                print(f"Copied {table}: {count}", flush=True)

                if table == "users":
                    # Some old SQLite records retain a reference to a user that
                    # was deleted before foreign keys were enforced. Preserve
                    # those records by creating a non-login placeholder instead
                    # of dropping a meeting/message/file activity.
                    fallback_org = await destination.fetchval("SELECT id FROM organizations LIMIT 1")
                    role_id = await destination.fetchval(
                        "SELECT id FROM roles WHERE name = 'USER' LIMIT 1"
                    )
                    password_hash = await destination.fetchval(
                        "SELECT hashed_password FROM users LIMIT 1"
                    )
                    missing_users = {}
                    for reference in user_references:
                        ref_table, ref_column = reference["table_name"], reference["column_name"]
                        if ref_table not in tables or ref_column not in source_columns[ref_table]:
                            continue
                        fields = [ref_column]
                        if "organization_id" in source_columns[ref_table]:
                            fields.append("organization_id")
                        for row in source.execute(
                            f"SELECT {', '.join(quote(field) for field in fields)} FROM {quote(ref_table)} "
                            f"WHERE {quote(ref_column)} IS NOT NULL"
                        ):
                            missing_users.setdefault(row[ref_column], row["organization_id"] if len(fields) > 1 else fallback_org)
                    for raw_id, raw_org in missing_users.items():
                        user_id = uuid.UUID(str(raw_id))
                        if await destination.fetchval("SELECT 1 FROM users WHERE id = $1", user_id):
                            continue
                        org_id = uuid.UUID(str(raw_org)) if raw_org else fallback_org
                        await destination.execute(
                            """
                            INSERT INTO users (
                                id, organization_id, role_id, email, username,
                                hashed_password, first_name, last_name, display_name,
                                timezone, presence, is_active, is_superuser,
                                last_seen, created_at, updated_at
                            ) VALUES (
                                $1, $2, $3, $4, $5,
                                $6, 'Deleted', 'User', 'Deleted user',
                                'UTC', 'OFFLINE', FALSE, FALSE,
                                NOW(), NOW(), NOW()
                            )
                            """,
                            user_id, org_id, role_id,
                            f"deleted-{user_id.hex}@invalid.local", f"deleted-{user_id.hex[:16]}",
                            password_hash,
                        )
                        print(f"Created placeholder for deleted user {user_id}", flush=True)

            # Insert self-referencing rows with nullable references first, then restore them.
            for table, columns in self_references.items():
                if table not in tables:
                    continue
                for column in columns:
                    rows = source.execute(
                        f"SELECT {quote('id')}, {quote(column)} FROM {quote(table)} "
                        f"WHERE {quote(column)} IS NOT NULL"
                    ).fetchall()
                    for row in rows:
                        await destination.execute(
                            f"UPDATE {quote(table)} SET {quote(column)} = $1 WHERE {quote('id')} = $2",
                            convert(row[column], target_columns[table][column], table, column),
                            convert(row["id"], target_columns[table]["id"], table, "id"),
                        )
        print("Migration completed successfully.")
    finally:
        await destination.close()
        source.close()


if __name__ == "__main__":
    asyncio.run(migrate())
