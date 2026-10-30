const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const root = path.join(__dirname, "..");
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ainazik-test-"));
const dataDirectory = path.join(tempDirectory, "data");
const uploadDirectory = path.join(tempDirectory, "uploads");
const adminEmail = "salon@example.com";
const adminPassword = "test-password-long-enough";
let server;
let baseUrl;
let cookie;
let csrfToken;

const fetchJson = async (url, options = {}) => {
    const response = await fetch(`${baseUrl}${url}`, {
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.headers || {})
        }
    });
    const body = await response.json();
    return { response, body };
};

before(async () => {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const portServer = net.createServer();
    await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
    const port = portServer.address().port;
    await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));

    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [path.join(root, "server.js")], {
        cwd: root,
        env: {
            ...process.env,
            NODE_ENV: "development",
            SESSION_SECRET: crypto.randomBytes(48).toString("hex"),
            DATA_DIR: dataDirectory,
            UPLOAD_DIR: uploadDirectory,
            BOOTSTRAP_ADMIN_EMAIL: adminEmail,
            BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
            PORT: String(port)
        },
        stdio: "ignore"
    });

    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (server.exitCode !== null) {
            throw new Error(`Test server exited with code ${server.exitCode}.`);
        }
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) {
                return;
            }
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    throw new Error("Test server did not start in time.");
});

after(async () => {
    if (server && server.exitCode === null) {
        await new Promise((resolve) => {
            server.once("exit", resolve);
            server.kill();
        });
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test("admin login, CSRF, product/news management, uploads and settings", async () => {
    let result = await fetchJson("/api/admin/products");
    assert.equal(result.response.status, 401);

    result = await fetchJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: "incorrect-password" })
    });
    assert.equal(result.response.status, 401);

    const login = await fetchJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword })
    });
    assert.equal(login.response.status, 200);
    cookie = login.response.headers.get("set-cookie").split(";")[0];
    csrfToken = login.body.csrfToken;
    assert.equal(login.body.authenticated, true);

    const csrfFailure = await fetchJson("/api/admin/products", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({})
    });
    assert.equal(csrfFailure.response.status, 403);

    const formData = new FormData();
    formData.append("image", new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], { type: "image/png" }), "dress.png");
    const uploadResult = await fetchJson("/api/admin/upload", {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
        body: formData
    });
    assert.equal(uploadResult.response.status, 201);
    assert.match(uploadResult.body.url, /^\/uploads\/[a-f0-9-]+\.png$/);

    const invalidUploadData = new FormData();
    invalidUploadData.append("image", new Blob(["not an image"], { type: "image/png" }), "bad.png");
    const invalidUpload = await fetchJson("/api/admin/upload", {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
        body: invalidUploadData
    });
    assert.equal(invalidUpload.response.status, 400);

    const mutationHeaders = { Cookie: cookie, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" };
    const createdProduct = await fetchJson("/api/admin/products", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
            name: "Платье из теста",
            category: "modest",
            description: "Длинный рукав, закрытая линия горловины.",
            price: 25000,
            sizes: "42–48",
            fabric: "Атлас",
            image: uploadResult.body.url,
            isNew: true,
            published: true
        })
    });
    assert.equal(createdProduct.response.status, 201);
    const productId = createdProduct.body.id;
    assert.equal(createdProduct.body.is_new, 1);
    result = await fetchJson("/api/products?category=modest");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].id, productId);

    const updatedProduct = await fetchJson(`/api/admin/products/${productId}`, {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify({ ...createdProduct.body, name: "Обновлённое платье", published: false })
    });
    assert.equal(updatedProduct.response.status, 200);
    assert.equal(updatedProduct.body.name, "Обновлённое платье");
    assert.equal((await fetchJson(`/api/products/${productId}`)).response.status, 404);
    assert.equal((await fetchJson(`/api/admin/products/${productId}`, { headers: { Cookie: cookie } })).response.status, 404);

    const createdNews = await fetchJson("/api/admin/news", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
            title: "Заметка о выборе образа",
            excerpt: "Короткий анонс публикации.",
            body: "Основной текст публикации.\nВторая строка.",
            image: "",
            published: true
        })
    });
    assert.equal(createdNews.response.status, 201);
    const newsId = createdNews.body.id;
    assert.equal((await fetchJson("/api/news")).body[0].id, newsId);

    const updatedNews = await fetchJson(`/api/admin/news/${newsId}`, {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify({ ...createdNews.body, published: false })
    });
    assert.equal(updatedNews.response.status, 200);
    assert.equal((await fetchJson(`/api/news/${newsId}`)).response.status, 404);

    const invalidPageSection = await fetchJson("/api/admin/page-content", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({ pageKey: "unknown", title: "", body: "Текст", sortOrder: 0, published: true })
    });
    assert.equal(invalidPageSection.response.status, 400);

    const firstSection = await fetchJson("/api/admin/page-content", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
            pageKey: "about",
            title: "Наш подход",
            body: "Индивидуальный подбор свадебного образа.",
            sortOrder: 20,
            published: true
        })
    });
    assert.equal(firstSection.response.status, 201);
    const firstSectionId = firstSection.body.id;
    const secondSection = await fetchJson("/api/admin/page-content", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
            pageKey: "about",
            title: "Примерка",
            body: "Подбор без спешки.",
            sortOrder: 10,
            published: true
        })
    });
    assert.equal(secondSection.response.status, 201);
    const aboutSections = await fetchJson("/api/page-content/about");
    assert.deepEqual(aboutSections.body.map((section) => section.title), ["Примерка", "Наш подход"]);
    assert.equal((await fetchJson("/api/page-content/unknown")).response.status, 400);

    const updatedSection = await fetchJson(`/api/admin/page-content/${firstSectionId}`, {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify({
            pageKey: "home",
            title: "Добро пожаловать",
            body: "Новый текст главной страницы.",
            sortOrder: 0,
            published: false
        })
    });
    assert.equal(updatedSection.response.status, 200);
    assert.equal((await fetchJson("/api/page-content/home")).body.length, 0);
    assert.equal((await fetchJson("/api/admin/page-content?page=home", { headers: { Cookie: cookie } })).body[0].id, firstSectionId);

    result = await fetchJson(`/api/admin/page-content/${firstSectionId}`, {
        method: "DELETE",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken }
    });
    assert.equal(result.response.status, 200);
    result = await fetchJson(`/api/admin/page-content/${secondSection.body.id}`, {
        method: "DELETE",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken }
    });
    assert.equal(result.response.status, 200);

    const settings = { city: "Бишкек", address: "Тестовый адрес", phone: "+996 555 123 456", whatsapp: "+996 555 123 456", instagram: "https://instagram.com/ainazik", hours: "10:00–19:00" };
    result = await fetchJson("/api/admin/settings", {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify(settings)
    });
    assert.equal(result.response.status, 200);
    assert.deepEqual(await (await fetch(`${baseUrl}/api/settings`)).json(), settings);

    result = await fetchJson(`/api/admin/news/${newsId}`, {
        method: "DELETE",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken }
    });
    assert.equal(result.response.status, 200);
    result = await fetchJson("/api/admin/logout", {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken }
    });
    assert.equal(result.response.status, 200);
    assert.equal((await fetchJson("/api/admin/products")).response.status, 401);
});
