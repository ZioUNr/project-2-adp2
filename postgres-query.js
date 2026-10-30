function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compilePostgresQuery(sql, args) {
    const parameters = args.length === 1 && isRecord(args[0]) ? args[0] : null;
    const values = [];
    const namedParameters = new Map();
    let query;

    if (parameters) {
        query = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
            if (!Object.hasOwn(parameters, name)) {
                throw new Error(`Missing SQL parameter: ${name}`);
            }
            if (!namedParameters.has(name)) {
                namedParameters.set(name, values.push(parameters[name]));
            }
            return `$${namedParameters.get(name)}`;
        });
    } else {
        let index = 0;
        query = sql.replace(/\?/g, () => {
            if (index >= args.length) {
                throw new Error("Missing SQL positional parameter.");
            }
            index += 1;
            values.push(args[index - 1]);
            return `$${index}`;
        });
        if (index !== args.length) {
            throw new Error("Unexpected SQL positional parameter.");
        }
    }

    return { query, values };
}

module.exports = compilePostgresQuery;
