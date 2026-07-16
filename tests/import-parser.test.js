const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { __test } = require("../server");

const fixturePath = path.join(__dirname, "fixtures", "extrato-generico.csv");
const parsed = __test.importTransactionsFromCSV(fs.readFileSync(fixturePath));
const mapping = __test.suggestImportMapping(parsed.columns, parsed.rows);
const candidates = parsed.rows.map((row) => __test.rowToImportCandidate(row, mapping, []));

assert.equal(parsed.rows.length, 5);
assert.equal(mapping.date, "Data");
assert.equal(mapping.description, "Descricao");
assert.equal(mapping.value, "Valor");

const income = candidates.filter((item) => item.value > 0);
const expenses = candidates.filter((item) => item.value < 0);

assert.equal(income.length, 2, "deve reconhecer salario e reembolso como entradas");
assert.equal(expenses.length, 3, "deve reconhecer compras/gastos positivos na planilha como saidas pelo campo Tipo");
assert.ok(candidates.find((item) => item.description === "Supermercado Extra").value < 0);
assert.ok(candidates.find((item) => item.description === "Spotify Premium").category === "Assinaturas");

console.log("Import parser fixture OK");
