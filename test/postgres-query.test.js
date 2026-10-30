const assert = require("node:assert/strict");
const { test } = require("node:test");
const compilePostgresQuery = require("../postgres-query");

test("translates positional SQL parameters", () => {
    assert.deepEqual(
        compilePostgresQuery("SELECT * FROM products WHERE id = ? AND category = ?", ["dress-1", "bridal"]),
        {
            query: "SELECT * FROM products WHERE id = $1 AND category = $2",
            values: ["dress-1", "bridal"]
        }
    );
});

test("translates and reuses named SQL parameters in query order", () => {
    assert.deepEqual(
        compilePostgresQuery(
            "UPDATE products SET category = @category, name = @name WHERE id = @id AND name <> @name",
            [{ id: "dress-1", name: "Новая модель", category: "modest" }]
        ),
        {
            query: "UPDATE products SET category = $1, name = $2 WHERE id = $3 AND name <> $2",
            values: ["modest", "Новая модель", "dress-1"]
        }
    );
});

test("rejects missing and extra positional SQL parameters", () => {
    assert.throws(() => compilePostgresQuery("SELECT ?", []), /Missing SQL positional parameter/);
    assert.throws(() => compilePostgresQuery("SELECT 1", ["unexpected"]), /Unexpected SQL positional parameter/);
    assert.throws(() => compilePostgresQuery("SELECT @missing", [{}]), /Missing SQL parameter: missing/);
});
