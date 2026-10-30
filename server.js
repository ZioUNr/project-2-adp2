const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const { rateLimit } = require("express-rate-limit");
const db = require("./db");

const app = express();
const publicDirectory = path.join(__dirname, "public");
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || path.join(publicDirectory, "uploads"));
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const dummyPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || "ainazik-images";
const useSupabaseStorage = Boolean(supabaseUrl && supabaseServiceRoleKey);

if (Boolean(supabaseUrl) !== Boolean(supabaseServiceRoleKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.");
}
if (process.env.RENDER_SERVICE_ID && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must point to a persistent database before starting on Render.");
}
if (process.env.DATABASE_URL && !useSupabaseStorage) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DATABASE_URL is configured.");
}
if (!/^[A-Za-z0-9_-]+$/.test(supabaseBucket)) {
    throw new Error("SUPABASE_STORAGE_BUCKET must contain only letters, numbers, underscores, and hyphens.");
}
if (!useSupabaseStorage) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
}

if (process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"]
        }
    }
}));
app.use(express.json({ limit: "64kb" }));

class DatabaseSessionStore extends session.Store {
    async get(sid, callback) {
        try {
            const row = await db.prepare("SELECT sess, expires FROM sessions WHERE sid = ?").get(sid);
            if (!row) {
                callback(null, null);
                return;
            }
            if (Number(row.expires) <= Date.now()) {
                await db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
                callback(null, null);
                return;
            }
            callback(null, JSON.parse(row.sess));
        } catch (error) {
            callback(error);
        }
    }

    async set(sid, value, callback = () => {}) {
        try {
            const expires = value.cookie?.expires
                ? new Date(value.cookie.expires).getTime()
                : Date.now() + 8 * 60 * 60 * 1000;
            await db.prepare(`
                INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
                ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
            `).run(sid, JSON.stringify(value), expires);
            await db.prepare("DELETE FROM sessions WHERE expires <= ?").run(Date.now());
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    async touch(sid, value, callback = () => {}) {
        try {
            const expires = value.cookie?.expires
                ? new Date(value.cookie.expires).getTime()
                : Date.now() + 8 * 60 * 60 * 1000;
            await db.prepare("UPDATE sessions SET expires = ? WHERE sid = ?").run(expires, sid);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    async destroy(sid, callback = () => {}) {
        try {
            await db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }
}

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");
if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production.");
}
if (!isProduction && !process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET is not set; admin sessions will expire when the server restarts.");
}

app.use(session({
    name: "ainazik.sid",
    secret: sessionSecret,
    store: new DatabaseSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000
    }
}));

const uploadExtensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (request, file, callback) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.mimetype)) {
            callback(new Error("Разрешены только изображения JPG, PNG и WebP."));
            return;
        }
        callback(null, true);
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Слишком много попыток входа. Попробуйте позже." }
});

const categoryNames = new Set(["bridal", "modest", "evening", "accessories"]);
const pageKeys = new Set(["home", "catalog", "about", "news", "contacts"]);
const settingsDefaults = {
    city: "",
    address: "",
    phone: "",
    whatsapp: "",
    instagram: "",
    hours: ""
};

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function imageUrl(value) {
    const image = text(value, 2048);
    if (/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(image)) {
        return image;
    }
    try {
        const parsed = new URL(image);
        return parsed.protocol === "https:" ? parsed.toString() : "";
    } catch {
        return "";
    }
}

function csrfMatches(request) {
    const expected = request.session.csrfToken;
    const actual = request.get("x-csrf-token");
    if (!expected || !actual) {
        return false;
    }
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function requireAdmin(request, response, next) {
    if (!request.session.adminId) {
        response.status(401).json({ error: "Войдите в панель администратора." });
        return;
    }
    next();
}

function requireCsrf(request, response, next) {
    if (!csrfMatches(request)) {
        response.status(403).json({ error: "Проверка безопасности не пройдена. Обновите страницу и попробуйте снова." });
        return;
    }
    next();
}

function normalizeProduct(input) {
    if (!isRecord(input)) {
        return null;
    }
    const name = text(input.name, 120);
    const category = text(input.category, 30);
    const description = text(input.description, 4000);
    const sizes = text(input.sizes, 120);
    const fabric = text(input.fabric, 160);
    const image = imageUrl(input.image);
    const priceValue = input.price === "" || input.price === null || input.price === undefined
        ? null
        : Number(input.price);
    if (!name || !categoryNames.has(category) || !image) {
        return null;
    }
    if (priceValue !== null && (!Number.isFinite(priceValue) || priceValue < 0 || priceValue > 1000000000)) {
        return null;
    }
    return {
        name,
        category,
        description,
        price: priceValue,
        sizes,
        fabric,
        image,
        isNew: input.isNew === true,
        published: input.published !== false
    };
}

function normalizeNews(input) {
    if (!isRecord(input)) {
        return null;
    }
    const title = text(input.title, 160);
    const excerpt = text(input.excerpt, 320);
    const body = text(input.body, 8000);
    const image = input.image ? imageUrl(input.image) : "";
    if (!title || !excerpt || !body || (input.image && !image)) {
        return null;
    }
    return { title, excerpt, body, image, published: input.published !== false };
}

function normalizePageSection(input) {
    if (!isRecord(input)) {
        return null;
    }
    const pageKey = text(input.pageKey, 30);
    const title = text(input.title, 160);
    const body = text(input.body, 8000);
    const sortOrder = input.sortOrder === "" || input.sortOrder === null || input.sortOrder === undefined
        ? 0
        : Number(input.sortOrder);
    if (!pageKeys.has(pageKey) || !body || !Number.isInteger(sortOrder) || Math.abs(sortOrder) > 10000) {
        return null;
    }
    return {
        pageKey,
        title,
        body,
        sortOrder,
        published: input.published !== false
    };
}

async function publicSettings() {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'site'").get();
    return { ...settingsDefaults, ...(row ? JSON.parse(row.value) : {}) };
}

app.get("/api/health", (request, response) => {
    response.json({ status: "ok" });
});

app.get("/api/products", async (request, response) => {
    const category = text(request.query.category, 30);
    if (category && !categoryNames.has(category)) {
        response.status(400).json({ error: "Неизвестная категория." });
        return;
    }
    const rows = category
        ? await db.prepare("SELECT * FROM products WHERE published = 1 AND category = ? ORDER BY is_new DESC, created_at DESC LIMIT 100").all(category)
        : await db.prepare("SELECT * FROM products WHERE published = 1 ORDER BY is_new DESC, created_at DESC LIMIT 100").all();
    response.json(rows);
});

app.get("/api/products/:id", async (request, response) => {
    const product = await db.prepare("SELECT * FROM products WHERE id = ? AND published = 1").get(request.params.id);
    if (!product) {
        response.status(404).json({ error: "Это платье не найдено." });
        return;
    }
    response.json(product);
});

app.get("/api/news", async (request, response) => {
    const articles = await db.prepare("SELECT * FROM news WHERE published = 1 ORDER BY created_at DESC LIMIT 50").all();
    response.json(articles);
});

app.get("/api/news/:id", async (request, response) => {
    const article = await db.prepare("SELECT * FROM news WHERE id = ? AND published = 1").get(request.params.id);
    if (!article) {
        response.status(404).json({ error: "Новость не найдена." });
        return;
    }
    response.json(article);
});

app.get("/api/settings", async (request, response) => {
    response.json(await publicSettings());
});

app.get("/api/page-content/:page", async (request, response) => {
    const page = text(request.params.page, 30);
    if (!pageKeys.has(page)) {
        response.status(400).json({ error: "Неизвестная страница." });
        return;
    }
    response.json(await db.prepare(`
        SELECT id, page_key, title, body, sort_order, created_at, updated_at
        FROM page_sections
        WHERE page_key = ? AND published = 1
        ORDER BY sort_order ASC, created_at ASC, id ASC
    `).all(page));
});

app.get("/api/admin/session", (request, response) => {
    if (!request.session.adminId) {
        response.json({ authenticated: false });
        return;
    }
    if (!request.session.csrfToken) {
        request.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }
    response.json({
        authenticated: true,
        email: request.session.adminEmail,
        csrfToken: request.session.csrfToken
    });
});

app.post("/api/admin/login", loginLimiter, async (request, response, next) => {
    try {
        if (!isRecord(request.body)) {
            response.status(400).json({ error: "Введите почту и пароль." });
            return;
        }
        const email = text(request.body.email, 254).toLowerCase();
        const password = typeof request.body.password === "string" ? request.body.password : "";
        if (!email || password.length > 200) {
            response.status(400).json({ error: "Введите почту и пароль." });
            return;
        }
        const admin = await db.prepare("SELECT id, email, password_hash FROM admins WHERE email = ?").get(email);
        const valid = await bcrypt.compare(password, admin?.password_hash || dummyPasswordHash);
        if (!admin || !valid) {
            response.status(401).json({ error: "Неверная почта или пароль." });
            return;
        }
        await new Promise((resolve, reject) => {
            request.session.regenerate((error) => error ? reject(error) : resolve());
        });
        request.session.adminId = admin.id;
        request.session.adminEmail = admin.email;
        request.session.csrfToken = crypto.randomBytes(32).toString("hex");
        response.json({ authenticated: true, email: admin.email, csrfToken: request.session.csrfToken });
    } catch (error) {
        next(error);
    }
});

app.post("/api/admin/logout", requireAdmin, requireCsrf, (request, response, next) => {
    request.session.destroy((error) => {
        if (error) {
            next(error);
            return;
        }
        response.clearCookie("ainazik.sid", { httpOnly: true, sameSite: "strict", secure: isProduction });
        response.json({ ok: true });
    });
});

app.get("/api/admin/products", requireAdmin, async (request, response) => {
    response.json(await db.prepare("SELECT * FROM products ORDER BY updated_at DESC LIMIT 200").all());
});

app.post("/api/admin/products", requireAdmin, requireCsrf, async (request, response) => {
    const product = normalizeProduct(request.body);
    if (!product) {
        response.status(400).json({ error: "Проверьте название, категорию, фотографию и цену." });
        return;
    }
    const id = crypto.randomUUID();
    await db.prepare(`
        INSERT INTO products (id, name, category, description, price, sizes, fabric, image, is_new, published)
        VALUES (@id, @name, @category, @description, @price, @sizes, @fabric, @image, @isNew, @published)
    `).run({
        id,
        ...product,
        isNew: Number(product.isNew),
        published: Number(product.published)
    });
    response.status(201).json(await db.prepare("SELECT * FROM products WHERE id = ?").get(id));
});

app.put("/api/admin/products/:id", requireAdmin, requireCsrf, async (request, response) => {
    const product = normalizeProduct(request.body);
    if (!product) {
        response.status(400).json({ error: "Проверьте название, категорию, фотографию и цену." });
        return;
    }
    const result = await db.prepare(`
        UPDATE products
        SET name = @name, category = @category, description = @description, price = @price,
            sizes = @sizes, fabric = @fabric, image = @image, is_new = @isNew,
            published = @published, updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
    `).run({
        id: request.params.id,
        ...product,
        isNew: Number(product.isNew),
        published: Number(product.published)
    });
    if (!result.changes) {
        response.status(404).json({ error: "Платье не найдено." });
        return;
    }
    response.json(await db.prepare("SELECT * FROM products WHERE id = ?").get(request.params.id));
});

app.delete("/api/admin/products/:id", requireAdmin, requireCsrf, async (request, response) => {
    const result = await db.prepare("DELETE FROM products WHERE id = ?").run(request.params.id);
    if (!result.changes) {
        response.status(404).json({ error: "Платье не найдено." });
        return;
    }
    response.json({ ok: true });
});

app.get("/api/admin/news", requireAdmin, async (request, response) => {
    response.json(await db.prepare("SELECT * FROM news ORDER BY updated_at DESC LIMIT 200").all());
});

app.get("/api/admin/page-content", requireAdmin, async (request, response) => {
    const page = text(request.query.page, 30);
    if (page && !pageKeys.has(page)) {
        response.status(400).json({ error: "Неизвестная страница." });
        return;
    }
    const sections = page
        ? await db.prepare("SELECT * FROM page_sections WHERE page_key = ? ORDER BY sort_order ASC, created_at ASC, id ASC LIMIT 200").all(page)
        : await db.prepare("SELECT * FROM page_sections ORDER BY page_key ASC, sort_order ASC, created_at ASC, id ASC LIMIT 500").all();
    response.json(sections);
});

app.post("/api/admin/page-content", requireAdmin, requireCsrf, async (request, response) => {
    const section = normalizePageSection(request.body);
    if (!section) {
        response.status(400).json({ error: "Выберите страницу, укажите текст блока и проверьте его порядок." });
        return;
    }
    const id = crypto.randomUUID();
    await db.prepare(`
        INSERT INTO page_sections (id, page_key, title, body, sort_order, published)
        VALUES (@id, @pageKey, @title, @body, @sortOrder, @published)
    `).run({ id, ...section, published: Number(section.published) });
    response.status(201).json(await db.prepare("SELECT * FROM page_sections WHERE id = ?").get(id));
});

app.put("/api/admin/page-content/:id", requireAdmin, requireCsrf, async (request, response) => {
    const section = normalizePageSection(request.body);
    if (!section) {
        response.status(400).json({ error: "Выберите страницу, укажите текст блока и проверьте его порядок." });
        return;
    }
    const result = await db.prepare(`
        UPDATE page_sections
        SET page_key = @pageKey, title = @title, body = @body, sort_order = @sortOrder,
            published = @published, updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
    `).run({ id: request.params.id, ...section, published: Number(section.published) });
    if (!result.changes) {
        response.status(404).json({ error: "Текстовый блок не найден." });
        return;
    }
    response.json(await db.prepare("SELECT * FROM page_sections WHERE id = ?").get(request.params.id));
});

app.delete("/api/admin/page-content/:id", requireAdmin, requireCsrf, async (request, response) => {
    const result = await db.prepare("DELETE FROM page_sections WHERE id = ?").run(request.params.id);
    if (!result.changes) {
        response.status(404).json({ error: "Текстовый блок не найден." });
        return;
    }
    response.json({ ok: true });
});

app.post("/api/admin/news", requireAdmin, requireCsrf, async (request, response) => {
    const article = normalizeNews(request.body);
    if (!article) {
        response.status(400).json({ error: "Заполните заголовок, анонс и текст новости." });
        return;
    }
    const id = crypto.randomUUID();
    await db.prepare(`
        INSERT INTO news (id, title, excerpt, body, image, published)
        VALUES (@id, @title, @excerpt, @body, @image, @published)
    `).run({ id, ...article, published: Number(article.published) });
    response.status(201).json(await db.prepare("SELECT * FROM news WHERE id = ?").get(id));
});

app.put("/api/admin/news/:id", requireAdmin, requireCsrf, async (request, response) => {
    const article = normalizeNews(request.body);
    if (!article) {
        response.status(400).json({ error: "Заполните заголовок, анонс и текст новости." });
        return;
    }
    const result = await db.prepare(`
        UPDATE news
        SET title = @title, excerpt = @excerpt, body = @body, image = @image,
            published = @published, updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
    `).run({ id: request.params.id, ...article, published: Number(article.published) });
    if (!result.changes) {
        response.status(404).json({ error: "Новость не найдена." });
        return;
    }
    response.json(await db.prepare("SELECT * FROM news WHERE id = ?").get(request.params.id));
});

app.delete("/api/admin/news/:id", requireAdmin, requireCsrf, async (request, response) => {
    const result = await db.prepare("DELETE FROM news WHERE id = ?").run(request.params.id);
    if (!result.changes) {
        response.status(404).json({ error: "Новость не найдена." });
        return;
    }
    response.json({ ok: true });
});

app.put("/api/admin/settings", requireAdmin, requireCsrf, async (request, response) => {
    if (!isRecord(request.body)) {
        response.status(400).json({ error: "Проверьте контактные данные." });
        return;
    }
    const settings = {
        city: text(request.body.city, 100),
        address: text(request.body.address, 200),
        phone: text(request.body.phone, 40),
        whatsapp: text(request.body.whatsapp, 80),
        instagram: text(request.body.instagram, 2048),
        hours: text(request.body.hours, 160)
    };
    if (settings.instagram && !imageUrl(settings.instagram)) {
        try {
            if (new URL(settings.instagram).protocol !== "https:") {
                throw new Error("invalid URL scheme");
            }
        } catch {
            response.status(400).json({ error: "Укажите полную ссылку Instagram, начинающуюся с https://." });
            return;
        }
    }
    await db.prepare("INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(JSON.stringify(settings));
    response.json(settings);
});

app.post("/api/admin/upload", requireAdmin, requireCsrf, upload.single("image"), async (request, response) => {
    if (!request.file) {
        response.status(400).json({ error: "Выберите изображение JPG, PNG или WebP." });
        return;
    }
    const file = request.file.buffer;
    const validJpeg = file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
    const validPng = file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const validWebp = file.toString("ascii", 0, 4) === "RIFF" && file.toString("ascii", 8, 12) === "WEBP";
    if (!validJpeg && !validPng && !validWebp) {
        response.status(400).json({ error: "Файл не является корректным изображением." });
        return;
    }
    const filename = `${crypto.randomUUID()}${uploadExtensions[request.file.mimetype]}`;
    if (useSupabaseStorage) {
        const objectUrl = `${supabaseUrl}/storage/v1/object/${supabaseBucket}/${filename}`;
        const uploaded = await fetch(objectUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
                apikey: supabaseServiceRoleKey,
                "Content-Type": request.file.mimetype,
                "Cache-Control": "public, max-age=31536000",
                "x-upsert": "false"
            },
            body: file
        });
        if (!uploaded.ok) {
            console.error(`Supabase Storage upload failed with status ${uploaded.status}.`);
            response.status(502).json({ error: "Не удалось сохранить фотографию в облачном хранилище." });
            return;
        }
        response.status(201).json({
            url: `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${filename}`
        });
        return;
    }

    await fs.promises.writeFile(path.join(uploadDirectory, filename), file, { flag: "wx" });
    response.status(201).json({ url: `/uploads/${filename}` });
});

app.use("/uploads", express.static(uploadDirectory, {
    dotfiles: "deny",
    fallthrough: false,
    maxAge: isProduction ? "7d" : 0,
    immutable: isProduction
}));
app.use(express.static(publicDirectory, { dotfiles: "deny", index: "index.html" }));

app.use("/api", (request, response) => {
    response.status(404).json({ error: "Страница API не найдена." });
});

app.use((error, request, response, next) => {
    if (response.headersSent) {
        next(error);
        return;
    }
    if (error instanceof multer.MulterError) {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        response.status(status).json({
            error: error.code === "LIMIT_FILE_SIZE"
                ? "Изображение должно быть меньше 8 МБ."
                : "Не удалось загрузить изображение."
        });
        return;
    }
    if (error.message === "Разрешены только изображения JPG, PNG и WebP.") {
        response.status(400).json({ error: error.message });
        return;
    }
    console.error(error);
    response.status(500).json({ error: "На сервере произошла ошибка. Попробуйте позже." });
});

async function start() {
    await db.ready;
    await db.prepare("INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO NOTHING")
        .run(JSON.stringify(settingsDefaults));
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (Boolean(bootstrapEmail) !== Boolean(bootstrapPassword)) {
        throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be configured together.");
    }
    if (bootstrapEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail) || bootstrapPassword.length < 12 || bootstrapPassword.length > 200) {
            throw new Error("The bootstrap administrator requires a valid email and a password between 12 and 200 characters.");
        }
        const existingAdmin = await db.prepare("SELECT id FROM admins LIMIT 1").get();
        if (!existingAdmin) {
            const passwordHash = await bcrypt.hash(bootstrapPassword, 12);
            await db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)").run(bootstrapEmail, passwordHash);
            console.log("The initial administrator account has been created.");
        }
    }
    app.listen(port, () => {
        console.log(`AINAZIK website is running on http://localhost:${port} (${db.kind}).`);
    });
}

if (require.main === module) {
    start().catch((error) => {
        console.error("Failed to start AINAZIK website:", error);
        process.exitCode = 1;
    });
}
