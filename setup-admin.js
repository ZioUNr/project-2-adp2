const bcrypt = require("bcryptjs");
const db = require("./db");

async function main() {
    await db.ready;
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Set ADMIN_EMAIL to a valid email address before creating the admin account.");
    }
    if (!password || password.length < 12 || password.length > 200) {
        throw new Error("Set ADMIN_PASSWORD to a password between 12 and 200 characters.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.prepare(`
        INSERT INTO admins (email, password_hash) VALUES (?, ?)
        ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash
    `).run(email, passwordHash);
    console.log(`Administrator account is ready for ${email}.`);
    await db.close();
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
