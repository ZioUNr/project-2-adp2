const fs = require("node:fs");
const path = require("node:path");
const compilePostgresQuery = require("./postgres-query");
const sqliteSchema = `
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires);

    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price REAL,
        sizes TEXT NOT NULL DEFAULT '',
        fabric TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        is_new INTEGER NOT NULL DEFAULT 0,
        published INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        body TEXT NOT NULL,
        image TEXT NOT NULL DEFAULT '',
        published INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS page_sections (
        id TEXT PRIMARY KEY,
        page_key TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        published INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS page_sections_page_order_idx
        ON page_sections(page_key, published, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
`;

const postgresSchema = `
    CREATE TABLE IF NOT EXISTS admins (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires);

    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price DOUBLE PRECISION,
        sizes TEXT NOT NULL DEFAULT '',
        fabric TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        is_new SMALLINT NOT NULL DEFAULT 0,
        published SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        body TEXT NOT NULL,
        image TEXT NOT NULL DEFAULT '',
        published SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS page_sections (
        id TEXT PRIMARY KEY,
        page_key TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        published SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS page_sections_page_order_idx
        ON page_sections(page_key, published, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
`;

function createPostgresDatabase() {
    const { Pool } = require("pg");
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true },
        max: Number(process.env.DB_POOL_SIZE || 5),
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 20000,
        application_name: "ainazik"
    });

    const database = {
        kind: "postgres",
        ready: pool.query(postgresSchema).then(() => undefined),
        prepare(sql) {
            return {
                async get(...args) {
                    const { query, values } = compilePostgresQuery(sql, args);
                    const result = await pool.query(query, values);
                    return result.rows[0];
                },
                async all(...args) {
                    const { query, values } = compilePostgresQuery(sql, args);
                    const result = await pool.query(query, values);
                    return result.rows;
                },
                async run(...args) {
                    const { query, values } = compilePostgresQuery(sql, args);
                    const result = await pool.query(query, values);
                    return { changes: result.rowCount };
                }
            };
        },
        async close() {
            await pool.end();
        }
    };

    return database;
}

function createSqliteDatabase() {
    const Database = require("better-sqlite3");
    const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
    fs.mkdirSync(dataDirectory, { recursive: true });

    const connection = new Database(path.join(dataDirectory, "ainazik.sqlite"));
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
    connection.exec(sqliteSchema);

    return {
        kind: "sqlite",
        ready: Promise.resolve(),
        prepare(sql) {
            const statement = connection.prepare(sql);
            return {
                async get(...args) {
                    return statement.get(...args);
                },
                async all(...args) {
                    return statement.all(...args);
                },
                async run(...args) {
                    return statement.run(...args);
                }
            };
        },
        async close() {
            connection.close();
        }
    };
}

const database = process.env.DATABASE_URL
    ? createPostgresDatabase()
    : createSqliteDatabase();

module.exports = database;
