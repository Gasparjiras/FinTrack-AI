const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fintrack-parser-"));
process.env.FINTRACK_DATA_DIR = testDirectory;

const { __test } = require("../server");
const { CATEGORY_DICTIONARY, categorizeFromDictionary } = require("../category-dictionary");

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

const nubank = __test.importTransactionsFromCSV(fs.readFileSync(path.join(__dirname, "fixtures", "extrato-nubank.csv")));
const nubankMapping = __test.suggestImportMapping(nubank.columns, nubank.rows);
const nubankCandidates = nubank.rows.map((row) => __test.rowToImportCandidate(row, nubankMapping, []));
assert.equal(nubankMapping.type, "Tipo");
assert.equal(nubankCandidates.filter((item) => item.value > 0).length, 2, "credito Nubank deve virar entrada");
assert.equal(nubankCandidates.filter((item) => item.value < 0).length, 2, "debito Nubank deve virar saida mesmo com valor positivo");
assert.ok(nubankCandidates.find((item) => item.description === "Uber Viagem").category === "Transporte");

const inter = __test.importTransactionsFromCSV(fs.readFileSync(path.join(__dirname, "fixtures", "extrato-inter.csv")));
const interMapping = __test.suggestImportMapping(inter.columns, inter.rows);
const interCandidates = inter.rows.map((row) => __test.rowToImportCandidate(row, interMapping, []));
assert.equal(interMapping.debitValue, "Debito");
assert.equal(interMapping.creditValue, "Credito");
assert.equal(interCandidates.filter((item) => item.value > 0).length, 2, "coluna Credito deve virar entrada");
assert.equal(interCandidates.filter((item) => item.value < 0).length, 2, "coluna Debito deve virar saida");
assert.ok(interCandidates.find((item) => item.description === "Supermercado Atacadao").category === "Mercado");

const manualMapping = { date: "Data", description: "Descricao", value: "Valor" };
const manualRows = [
  { Data: "15/07/2026", Descricao: "Faculdade", Valor: "614,42" },
  { Data: "15/07/2026", Descricao: "Seguro da Moto", Valor: "145,22" },
  { Data: "15/07/2026", Descricao: "Internet Celular", Valor: "48,99" },
  { Data: "15/07/2026", Descricao: "Pix recebido salario", Valor: "3723,15" },
].map((row) => __test.rowToImportCandidate(row, manualMapping, []));
assert.equal(manualRows.find((item) => item.description === "Faculdade").category, "Educação");
assert.ok(manualRows.find((item) => item.description === "Faculdade").value < 0);
assert.equal(manualRows.find((item) => item.description === "Seguro da Moto").category, "Transporte");
assert.ok(manualRows.find((item) => item.description === "Seguro da Moto").value < 0);
assert.equal(manualRows.find((item) => item.description === "Internet Celular").category, "Contas fixas");
assert.ok(manualRows.find((item) => item.description === "Internet Celular").value < 0);
assert.equal(manualRows.find((item) => item.description === "Pix recebido salario").category, "Receita");
assert.ok(manualRows.find((item) => item.description === "Pix recebido salario").value > 0);

console.log("Import parser fixture OK");
assert.equal(__test.categorize("Pix Maria").category, "Categoria pendente");
assert.equal(__test.categorize("Pix recebido João").category, "Categoria pendente");
assert.equal(__test.categorize("Pix Restaurante Central").category, "Alimentação");
assert.equal(__test.categorize("Compra de remédio").category, "Saúde");
assert.equal(__test.categorize("Compra de medicamento").category, "Saúde");
assert.equal(__test.categorize("Pagamento Droga").category, "Saúde");
assert.equal(__test.categorize("Posto de saúde municipal").category, "Saúde");
assert.equal(__test.categorize("Posto Shell").category, "Transporte");
assert.equal(__test.categorize("Consulta jurídica").category, "Categoria pendente");
assert.equal(__test.categorize("Clínica veterinária").category, "Categoria pendente");
assert.equal(__test.categorize("Mercado Livre").category, "Compras");
assert.equal(__test.categorize("Mercado do bairro").category, "Mercado");
assert.equal(__test.categorize("ARCOS DOURADOS COMERCIO DE ALIMENTOS").category, "Alimentação");
assert.equal(__test.categorize("Pagamento no ARCOS DOURADOS ontem").category, "Alimentação");
assert.equal(__test.categorize("Compra Arcos-Dourados loja 12").category, "Alimentação");
assert.equal(__test.categorize("Marcos Dourados").category, "Categoria pendente");
const arcosDescription = "Transferência enviada pelo Pix - ARCOS DOURADOS COMERCIO DE ALIMENTOS SA - 42.591.651/0001-43 - BCO SANTANDER (BRASIL) S";
assert.equal(__test.categorize(arcosDescription).category, "Alimentação");
assert.equal(__test.rowToImportCandidate({ Data: '2026-09-15', Descricao: arcosDescription, Valor: '-25,00' }, manualMapping, []).category, 'Alimentação');
assert.equal(__test.rowToImportCandidate({ Data: '2026-09-15', Descricao: arcosDescription, Valor: '-25,00', Categoria: 'Categoria pendente' }, { ...manualMapping, category: 'Categoria' }, []).category, 'Alimentação');
assert.equal(__test.categorize("Petshop Amigo", [{ merchant_pattern: "petshop amigo", category: "Pets" }]).category, "Pets");
assert.equal(__test.categorize("Pix Maria", [{ merchant_pattern: "pix maria", category: "Compras" }]).category, "Categoria pendente");
assert.ok(CATEGORY_DICTIONARY.every(entry => entry.origin.length && entry.falsePositiveNotes.length), "Toda categoria padrão deve documentar origem e risco de falso positivo");
assert.equal(categorizeFromDictionary("REMÉDIO FARMÁCIA").category, "Saúde");
assert.equal(__test.rowToImportCandidate({ Data: '2026-09-01', Descricao: 'Uber reembolso', Valor: 50, Tipo: 'entrada' }, { ...manualMapping, type: 'Tipo' }).value, 50);
assert.ok(__test.validateTransaction({ description: 'Teste', value: -5, date: '2026-02-30', category: 'Outros' }));
__test.closeDatabase();
if (path.dirname(path.resolve(testDirectory)) !== path.resolve(os.tmpdir()) || !path.basename(testDirectory).startsWith('fintrack-parser-')) throw new Error('Diretório de teste inesperado');
fs.rmSync(testDirectory, { recursive: true });
