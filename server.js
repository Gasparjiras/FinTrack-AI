const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
const { PDFParse } = require("pdf-parse");
const XLSX = require("xlsx");

const ENV_PATH = path.join(__dirname, ".env");
if (fs.existsSync(ENV_PATH) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(ENV_PATH);
}

const {
  MODEL: OPENAI_MODEL,
  classifyTransactions: classifyTransactionsWithOpenAI,
  generateFinancialPlan,
  isOpenAIConfigured,
} = require("./ai-service");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const CERT_PATH = path.join(ROOT, "certs", "localhost-cert.pem");
const KEY_PATH = path.join(ROOT, "certs", "localhost-key.pem");
const sessions = new Map();
const OPENAI_DAILY_LIMIT = Math.max(1, Number(process.env.OPENAI_DAILY_LIMIT || 10));
const ALLOWED_CATEGORIES = [
  "Alimentação",
  "Transporte",
  "Assinaturas",
  "Lazer",
  "Mercado",
  "Contas fixas",
  "Compras",
  "Saúde",
  "Educação",
  "Metas",
  "Outros",
  "Receita",
  "Categoria pendente",
];

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS consent_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    collected_data TEXT NOT NULL,
    purpose TEXT NOT NULL,
    storage TEXT NOT NULL,
    retention TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    term_id INTEGER NOT NULL,
    accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (term_id) REFERENCES consent_terms(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    value REAL NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'saida',
    classification_confidence TEXT NOT NULL DEFAULT 'manual',
    classification_source TEXT NOT NULL DEFAULT 'manual',
    payment_method TEXT NOT NULL DEFAULT 'Manual',
    transaction_status TEXT NOT NULL DEFAULT 'Concluida',
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_goals (
    user_id INTEGER PRIMARY KEY,
    goal_name TEXT NOT NULL DEFAULT 'Meta financeira',
    objective TEXT NOT NULL,
    target_value REAL NOT NULL,
    saved_amount REAL NOT NULL DEFAULT 0,
    planned_monthly_savings REAL NOT NULL DEFAULT 0,
    target_months INTEGER NOT NULL,
    intensity TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS financial_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    goal_name TEXT NOT NULL DEFAULT 'Meta financeira',
    objective TEXT NOT NULL,
    target_value REAL NOT NULL,
    initial_saved_amount REAL NOT NULL DEFAULT 0,
    saved_amount REAL NOT NULL DEFAULT 0,
    planned_monthly_savings REAL NOT NULL DEFAULT 0,
    target_months INTEGER NOT NULL,
    intensity TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS goal_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    goal_id INTEGER NOT NULL,
    transaction_id INTEGER,
    amount REAL NOT NULL,
    contribution_date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (goal_id) REFERENCES financial_goals(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    monthly_limit REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#285e8e',
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    merchant_pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, merchant_pattern),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_analysis_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fingerprint TEXT NOT NULL,
    model TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, fingerprint),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_daily_usage (
    user_id INTEGER NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, usage_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS monthly_closings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, month),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("user_goals", "saved_amount", "REAL NOT NULL DEFAULT 0");
ensureColumn("user_goals", "goal_name", "TEXT NOT NULL DEFAULT 'Meta financeira'");
ensureColumn("user_goals", "planned_monthly_savings", "REAL NOT NULL DEFAULT 0");
ensureColumn("financial_goals", "initial_saved_amount", "REAL NOT NULL DEFAULT 0");
ensureColumn("user_consents", "revoked_at", "TEXT");
ensureColumn("transactions", "type", "TEXT NOT NULL DEFAULT 'saida'");
ensureColumn("transactions", "classification_confidence", "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("transactions", "classification_source", "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("transactions", "payment_method", "TEXT NOT NULL DEFAULT 'Manual'");
ensureColumn("transactions", "transaction_status", "TEXT NOT NULL DEFAULT 'Concluida'");
ensureColumn("transactions", "source", "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("transactions", "external_id", "TEXT");

const legacyGoals = db.prepare("SELECT * FROM user_goals").all();
for (const goal of legacyGoals) {
  const exists = db.prepare("SELECT id FROM financial_goals WHERE user_id = ? AND goal_name = ?").get(goal.user_id, goal.goal_name);
  if (!exists) {
    db.prepare(`
      INSERT INTO financial_goals (user_id, goal_name, objective, target_value, initial_saved_amount, saved_amount, planned_monthly_savings, target_months, intensity, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(
      goal.user_id,
      goal.goal_name || "Meta financeira",
      goal.objective,
      Number(goal.target_value || 0),
      Number(goal.saved_amount || 0),
      Number(goal.saved_amount || 0),
      Number(goal.planned_monthly_savings || 0),
      Number(goal.target_months || 1),
      goal.intensity || "equilibrado",
      goal.updated_at || null
    );
  }
}

const term = db.prepare("SELECT id FROM consent_terms WHERE version = ?").get("1.0");
if (!term) {
  db.prepare(`
    INSERT INTO consent_terms (version, collected_data, purpose, storage, retention)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    "1.0",
    "Descrição, valor, data, categoria, forma de pagamento e status das transações; nome, e-mail, preferências da meta e regras de categorização aprendidas.",
    "Organizar finanças, processar extratos enviados pelo usuário, classificar transações e gerar um plano educativo personalizado.",
    "Banco SQLite local protegido; PDF bruto descartado. Quando configurada, a API OpenAI recebe apenas resumos financeiros para análise.",
    "Enquanto a conta existir ou até o usuário solicitar exclusão completa."
  );
}
db.prepare(`
  UPDATE consent_terms
  SET collected_data = ?, purpose = ?, storage = ?, retention = ?
  WHERE version = ?
`).run(
  "Descrição, valor, data, categoria, forma de pagamento e status das transações; nome, e-mail, preferências da meta e regras de categorização aprendidas.",
  "Organizar finanças, processar extratos enviados pelo usuário, classificar transações e gerar um plano educativo personalizado.",
  "Banco SQLite local protegido; arquivos importados são processados em memória e descartados. Quando configurada, a API OpenAI recebe apenas resumos financeiros para análise.",
  "Enquanto a conta existir, até a revogação do consentimento ou até a exclusão completa solicitada pelo titular.",
  "1.0"
);

try {
  fs.chmodSync(DB_PATH, 0o600);
} catch {
  // Windows may ignore POSIX file modes; authentication and path isolation still apply.
}

function send(res, status, payload, headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": typeof payload === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function getUser(req) {
  const token = parseCookies(req).session;
  const session = token && sessions.get(token);
  if (!session) return null;
  return db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(session.userId) || null;
}

function requireUser(req, res) {
  const user = getUser(req);
  if (!user) send(res, 401, { error: "Autenticação obrigatória." });
  return user;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readBuffer(req, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Arquivo acima do limite de 8 MB.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(delimiter, start);
  while (index !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }
  parts.push(buffer.subarray(start));
  return parts;
}

async function readPdfUpload(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Envie o arquivo como multipart/form-data.");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readBuffer(req);
  const parts = splitBuffer(body, boundary);

  for (const rawPart of parts) {
    let part = rawPart;
    if (part.subarray(0, 2).equals(Buffer.from("\r\n"))) part = part.subarray(2);
    if (part.subarray(part.length - 2).equals(Buffer.from("\r\n"))) part = part.subarray(0, part.length - 2);
    if (part.equals(Buffer.from("--")) || part.length === 0) continue;
    const separator = part.indexOf(Buffer.from("\r\n\r\n"));
    if (separator === -1) continue;
    const headers = part.subarray(0, separator).toString("utf8");
    const content = part.subarray(separator + 4);
    if (!/name="statement"/i.test(headers)) continue;
    if (!/filename="[^"]+\.pdf"/i.test(headers) && !/application\/pdf/i.test(headers)) {
      throw new Error("Envie um arquivo PDF válido.");
    }
    return content;
  }
  throw new Error("Arquivo PDF não encontrado no envio.");
}

async function readUploadedStatement(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Envie o arquivo como multipart/form-data.");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readBuffer(req, 10 * 1024 * 1024);
  const parts = splitBuffer(body, boundary);
  for (const rawPart of parts) {
    let part = rawPart;
    if (part.subarray(0, 2).equals(Buffer.from("\r\n"))) part = part.subarray(2);
    if (part.subarray(part.length - 2).equals(Buffer.from("\r\n"))) part = part.subarray(0, part.length - 2);
    if (part.equals(Buffer.from("--")) || part.length === 0) continue;
    const separator = part.indexOf(Buffer.from("\r\n\r\n"));
    if (separator === -1) continue;
    const headers = part.subarray(0, separator).toString("utf8");
    const content = part.subarray(separator + 4);
    const nameMatch = headers.match(/name="([^"]+)"/i);
    const fileMatch = headers.match(/filename="([^"]+)"/i);
    if (!fileMatch || !["statement", "file", "spreadsheet"].includes(nameMatch?.[1])) continue;
    return {
      filename: path.basename(fileMatch[1]),
      contentType: (headers.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || "application/octet-stream",
      buffer: content,
    };
  }
  throw new Error("Arquivo não encontrado no envio.");
}

function repairText(value) {
  let text = String(value || "");
  if (/[ÃÂ]/.test(text)) {
    try {
      const repaired = Buffer.from(text, "latin1").toString("utf8");
      if (!repaired.includes("�")) text = repaired;
    } catch {
      // Keep the original text when decoding is not possible.
    }
  }
  return text;
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(repairText(current.trim()));
      current = "";
    } else {
      current += char;
    }
  }
  values.push(repairText(current.trim()));
  return values;
}

function importTransactionsFromCSV(buffer) {
  let text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (text.includes("�")) text = buffer.toString("latin1").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { columns: [], rows: [] };
  const delimiterCounts = [
    [";", (lines[0].match(/;/g) || []).length],
    [",", (lines[0].match(/,/g) || []).length],
    ["\t", (lines[0].match(/\t/g) || []).length],
  ].sort((a, b) => b[1] - a[1]);
  const delimiter = delimiterCounts[0][1] > 0 ? delimiterCounts[0][0] : ",";
  const matrix = lines.slice(0, 501).map((line) => parseCsvLine(line, delimiter));
  const plannerRows = extractPlannerCsvTransactions(matrix);
  if (plannerRows.length > 0) {
    return {
      columns: ["Data", "Descrição", "Valor", "Categoria", "Tipo", "Forma de pagamento", "Status", "Origem"],
      rows: plannerRows,
      layout: "planner",
    };
  }
  const columns = matrix[0].map((column, index) => String(column || `Coluna ${index + 1}`).trim());
  const rows = matrix.slice(1, 501).map((values) => {
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
  });
  return { columns, rows };
}

function detectPlannerMonth(matrix) {
  const months = {
    janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };
  for (const row of matrix.slice(0, 8)) {
    for (const cell of row) {
      const text = normalizeColumnName(cell);
      const year = (text.match(/\b(20\d{2})\b/) || [])[1];
      const monthName = Object.keys(months).find((name) => text.includes(normalizeColumnName(name)));
      if (year && monthName) return { year, month: months[monthName] };
    }
  }
  const now = new Date();
  return { year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, "0") };
}

function spreadsheetCategoryToAllowed(value, description = "") {
  const category = normalizeColumnName(value);
  const text = normalizeColumnName(`${value} ${description}`);
  if (/locomocao|transporte|gasolina|moto|corrida/.test(text)) return "Transporte";
  if (/comida|lanche|ifood|restaurante|sorvete|doce|mercado|chocolate|cafe|pao|padaria/.test(text)) return /mercado/.test(text) ? "Mercado" : "Alimentação";
  if (/conta|internet|celular|agua|energia|fixo/.test(text)) return "Contas fixas";
  if (/estudo|faculdade|curso|api tgi|educacao/.test(text)) return "Educação";
  if (/saude|dentista|farmacia|consulta/.test(text)) return "Saúde";
  if (/assinatura|spotify|crunchyroll|netflix|disney|hbo/.test(text)) return "Assinaturas";
  if (/lazer|cinema|festa|show/.test(text)) return "Lazer";
  if (/eletronico|roupa|presente|beleza|tenis|monitor|celular|brinquedo/.test(text)) return "Compras";
  if (/receita|salario|vr|vt|freelance|restante/.test(text)) return "Receita";
  if (ALLOWED_CATEGORIES.includes(value)) return value;
  return category ? "Outros" : "";
}

function extractPlannerCsvTransactions(matrix) {
  const { year, month } = detectPlannerMonth(matrix);
  const fallbackDate = `${year}-${month}-01`;
  const rows = [];
  const add = ({ description, value, date, category, type, paymentMethod, status, origin }) => {
    const cleanDescription = repairText(description).trim();
    const parsedValue = parseMoney(value);
    if (!cleanDescription || cleanDescription.toLowerCase().startsWith("total") || parsedValue === null || parsedValue === 0) return;
    const signedValue = type === "entrada" ? Math.abs(parsedValue) : -Math.abs(parsedValue);
    rows.push({
      Data: toIsoDate(date, Number(year)) || fallbackDate,
      "Descrição": cleanDescription.slice(0, 120),
      Valor: signedValue,
      Categoria: type === "entrada" ? "Receita" : spreadsheetCategoryToAllowed(category, cleanDescription),
      Tipo: type,
      "Forma de pagamento": repairText(paymentMethod || origin || "Planilha").trim(),
      Status: status || "Concluida",
      Origem: origin || "Planilha financeira",
    });
  };

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    for (let col = 0; col < row.length; col += 1) {
      const title = normalizeColumnName(row[col]);
      if (!["fixos", "gastos do mes", "parcelamentos"].includes(title)) continue;
      const headerRow = matrix[rowIndex + 1] || [];
      const header = {};
      for (let offset = 0; offset <= 7; offset += 1) {
        const key = normalizeColumnName(headerRow[col + offset]);
        if (key) header[key] = col + offset;
      }
      const nameCol = header.nome;
      const valueCol = header.valor;
      if (nameCol === undefined || valueCol === undefined) continue;
      for (let r = rowIndex + 2; r < matrix.length; r += 1) {
        const current = matrix[r] || [];
        const name = current[nameCol];
        const value = current[valueCol];
        const rowMarker = normalizeColumnName(current[col]);
        if (rowMarker === "nome" || rowMarker === "parcelamentos" || rowMarker.startsWith("total de")) break;
        if (!name && !value) continue;
        add({
          description: name,
          value,
          date: current[header.data],
          category: current[header.categoria],
          type: "saida",
          paymentMethod: current[header.tipo],
          status: String(current[header.pago] || "").toLowerCase() === "false" ? "Pendente" : "Concluida",
          origin: repairText(row[col]),
        });
      }
    }
  }

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    for (let col = 0; col < row.length; col += 1) {
      if (normalizeColumnName(row[col]) !== "entradas") continue;
      for (let r = rowIndex + 1; r < matrix.length; r += 1) {
        const name = matrix[r]?.[col];
        const value = matrix[r]?.[col + 1];
        const marker = normalizeColumnName(name);
        if (!name && !value) continue;
        if (marker === "total" || marker === "saidas" || marker === "investimentos") break;
        add({
          description: name,
          value,
          date: fallbackDate,
          category: "Receita",
          type: "entrada",
          paymentMethod: "Entrada da planilha",
          status: "Concluida",
          origin: "Entradas",
        });
      }
    }
  }

  return rows;
}

function importTransactionsFromExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }).slice(0, 500);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return { columns, rows };
}

function normalizeColumnName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalCategory(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (ALLOWED_CATEGORIES.includes(text)) return text;
  const aliases = {
    alimentacao: "Alimentação",
    saude: "Saúde",
    educacao: "Educação",
    "contas fixas": "Contas fixas",
    metas: "Metas",
    receita: "Receita",
    outros: "Outros",
    transporte: "Transporte",
    assinaturas: "Assinaturas",
    lazer: "Lazer",
    mercado: "Mercado",
    compras: "Compras",
    "categoria pendente": "Categoria pendente",
  };
  return aliases[normalizeColumnName(text)] || text;
}

function suggestImportMapping(columns, rows = []) {
  const normalized = columns.map((column) => ({ column, normalized: normalizeColumnName(column) }));
  const pick = (patterns) => normalized.find((item) => patterns.some((pattern) => pattern.test(item.normalized)))?.column || "";
  const samples = rows.slice(0, 25);
  const contentScore = (column, predicate) => samples.reduce((score, row) => score + (predicate(row[column]) ? 1 : 0), 0);
  const pickByContent = (predicate, exclude = []) => columns
    .filter((column) => !exclude.includes(column))
    .map((column) => ({ column, score: contentScore(column, predicate) }))
    .sort((a, b) => b.score - a.score)[0];
  const dateByName = pick([/\bdata\b/, /\bdate\b/, /\bdia\b/]);
  const descriptionByName = pick([/descricao/, /descrição/, /historico/, /histórico/, /hist rico/, /lancamento/, /lançamento/, /estabelecimento/, /merchant/, /description/, /detalhe/]);
  const valueByName = pick([/\bvalor\b/, /\bvalue\b/, /\bamount\b/, /\bpreco\b/, /\bpreço\b/, /movimentacao/, /movimentação/]);
  const debitByName = pick([/debito/, /débito/, /d bito/, /\bsaida\b/, /\bsaída\b/, /despesa/, /pagamento/]);
  const creditByName = pick([/credito/, /crédito/, /cr dito/, /\bentrada\b/, /receita/, /deposito/, /depósito/]);
  const dateByContent = pickByContent((value) => Boolean(toIsoDate(value)));
  const valueByContent = pickByContent((value) => parseMoney(value) !== null, [dateByName || dateByContent?.column].filter(Boolean));
  const descriptionByContent = pickByContent((value) => {
    const text = String(value || "").trim();
    return text.length >= 3 && !toIsoDate(text) && parseMoney(text) === null;
  }, [dateByName || dateByContent?.column, valueByName || valueByContent?.column].filter(Boolean));
  return {
    date: dateByName || (dateByContent?.score > 0 ? dateByContent.column : ""),
    description: descriptionByName || (descriptionByContent?.score > 0 ? descriptionByContent.column : ""),
    value: valueByName || (!debitByName && !creditByName && valueByContent?.score > 0 ? valueByContent.column : ""),
    debitValue: debitByName,
    creditValue: creditByName,
    category: pick([/categoria/, /category/]),
    type: pick([/\btipo\b/, /\bdirecao\b/, /entrada saida/, /credito debito/, /cr[eé]dito d[eé]bito/]),
    paymentMethod: pick([/forma/, /pagamento/, /payment/, /metodo/, /m[eé]todo/]),
    source: pick([/banco/, /origem/, /source/, /instituicao/, /instituição/]),
  };
}

function detectImportPreset(filename, columns = [], layout = "") {
  const normalizedFile = normalizeColumnName(filename);
  const normalizedColumns = columns.map(normalizeColumnName).join(" ");
  const haystack = `${normalizedFile} ${normalizedColumns}`;
  if (layout === "planner" || /planilha financeira|gastos do mes|parcelamentos|entradas/.test(haystack)) {
    return { id: "planilha-manual", name: "Planilha manual", confidence: "alta" };
  }
  if (/nubank|nu pagamentos|identificador|descri[cç]ao|valor/.test(haystack)) {
    return { id: "nubank", name: "Extrato Nubank", confidence: "media" };
  }
  if (/\binter\b|banco inter|hist[oó]rico|lan[cç]amento/.test(haystack)) {
    return { id: "inter", name: "Extrato Inter", confidence: "media" };
  }
  return { id: "csv-generico", name: "CSV/Excel genérico", confidence: "baixa" };
}

function valueFromMappedRow(row, mapping, key) {
  const column = mapping?.[key];
  return column ? row[column] : "";
}

function rowToImportCandidate(row, mapping, learnedRules = []) {
  const description = String(valueFromMappedRow(row, mapping, "description") || "").trim();
  const date = toIsoDate(valueFromMappedRow(row, mapping, "date"));
  const rawValue = valueFromMappedRow(row, mapping, "value");
  let value = parseMoney(rawValue);
  const debitValue = parseMoney(valueFromMappedRow(row, mapping, "debitValue"));
  const creditValue = parseMoney(valueFromMappedRow(row, mapping, "creditValue"));
  if ((value === null || value === 0) && (debitValue !== null || creditValue !== null)) {
    const debit = Math.abs(Number(debitValue || 0));
    const credit = Math.abs(Number(creditValue || 0));
    value = credit > 0 && debit === 0 ? credit : debit > 0 && credit === 0 ? -debit : credit - debit;
  }
  const rawType = normalizeColumnName(valueFromMappedRow(row, mapping, "type"));
  if (value !== null) {
    if (/saida|debito|despesa|pagamento|d\b/.test(rawType)) value = -Math.abs(value);
    if (/entrada|credito|receita|c\b/.test(rawType)) value = Math.abs(value);
  }
  const rawCategory = canonicalCategory(valueFromMappedRow(row, mapping, "category"));
  const classification = rawCategory ? { category: rawCategory, confidence: "manual" } : categorize(description, learnedRules);
  if (value !== null && value > 0) {
    const inferredType = inferImportedType(description, rawType, classification.category);
    if (inferredType === "saida") value = -Math.abs(value);
    if (inferredType === "entrada") value = Math.abs(value);
  }
  return {
    description: description.slice(0, 120),
    value,
    date,
    category: classification.category,
    confidence: classification.confidence,
    paymentMethod: String(valueFromMappedRow(row, mapping, "paymentMethod") || valueFromMappedRow(row, mapping, "source") || "Arquivo importado").trim().slice(0, 50),
    status: "Concluida",
  };
}

function detectDuplicateTransactions(userId, candidates) {
  const existing = db.prepare("SELECT date, description, value FROM transactions WHERE user_id = ?").all(userId)
    .map((item) => `${item.date}|${normalizeDescription(item.description)}|${Number(item.value).toFixed(2)}`);
  const existingSet = new Set(existing);
  const localSet = new Set();
  return candidates.map((candidate) => {
    const key = `${candidate.date}|${normalizeDescription(candidate.description)}|${Number(candidate.value).toFixed(2)}`;
    const duplicate = existingSet.has(key) || localSet.has(key);
    localSet.add(key);
    return { ...candidate, duplicate };
  });
}

function buildImportCandidateList(userId, rows, mapping) {
  const learnedRules = loadCategoryRules(userId);
  const errors = [];
  const candidates = [];
  rows.slice(0, 500).forEach((row, index) => {
    const candidate = rowToImportCandidate(row, mapping, learnedRules);
    if (!candidate.description || !candidate.date || !Number.isFinite(candidate.value) || candidate.value === 0) {
      errors.push({ row: index + 1, message: "Linha sem data, descrição ou valor válido." });
      return;
    }
    if (!categoryExists(userId, candidate.category)) {
      candidate.category = "Categoria pendente";
      candidate.confidence = "baixa";
    }
    candidates.push(candidate);
  });
  return { candidates, errors, learnedRules };
}

function finishImportPreview(userId, candidates, errors = [], ai = {}) {
  const withDuplicates = detectDuplicateTransactions(userId, candidates);
  const importable = withDuplicates.filter((item) => !item.duplicate);
  return {
    candidates: withDuplicates,
    ai: {
      source: ai.source || "local",
      model: ai.model || null,
      cached: Boolean(ai.cached),
      warning: ai.warning || null,
    },
    summary: {
      found: withDuplicates.length,
      importable: importable.length,
      income: importable.filter((item) => item.value > 0).reduce((sum, item) => sum + item.value, 0),
      expenses: importable.filter((item) => item.value < 0).reduce((sum, item) => sum + Math.abs(item.value), 0),
      errors: errors.length,
      duplicates: withDuplicates.filter((item) => item.duplicate).length,
    },
    errors: errors.slice(0, 20),
  };
}

function buildImportPreview(userId, rows, mapping) {
  const { candidates, errors } = buildImportCandidateList(userId, rows, mapping);
  return finishImportPreview(userId, candidates, errors);
}

async function buildSmartImportPreview(userId, rows, mapping, options = {}) {
  const { candidates, errors, learnedRules } = buildImportCandidateList(userId, rows, mapping);
  if (!options.useAI || candidates.length === 0) {
    return finishImportPreview(userId, candidates, errors, { source: "local" });
  }
  const aiResult = await enrichCandidatesWithOpenAI(userId, candidates, learnedRules);
  return finishImportPreview(userId, aiResult.candidates, errors, aiResult);
}

function audit(userId, action, details, req) {
  db.prepare("INSERT INTO audit_logs (user_id, action, details, ip) VALUES (?, ?, ?, ?)")
    .run(userId, action, details ? JSON.stringify(details) : null, req.socket.remoteAddress || null);
}

const DEFAULT_CATEGORIES = [
  ["Alimentação", 0, "#d95d39"],
  ["Transporte", 0, "#285e8e"],
  ["Assinaturas", 0, "#754668"],
  ["Lazer", 0, "#d4a017"],
  ["Mercado", 0, "#146b59"],
  ["Contas fixas", 0, "#4e7d9a"],
  ["Compras", 0, "#cf6f3e"],
  ["Saúde", 0, "#5d8f6f"],
  ["Educação", 0, "#6f5aa8"],
  ["Metas", 0, "#1d7f67"],
  ["Outros", 0, "#6b7280"],
  ["Receita", 0, "#1f8a70"],
];

const LEGACY_DEFAULT_LIMITS = [
  ["Alimentação", 700],
  ["Transporte", 500],
  ["Assinaturas", 180],
  ["Lazer", 350],
  ["Mercado", 900],
  ["Contas fixas", 1500],
  ["Compras", 500],
  ["Saúde", 400],
  ["Educação", 500],
  ["Outros", 300],
];
for (const [name, limit] of LEGACY_DEFAULT_LIMITS) {
  db.prepare("UPDATE categories SET monthly_limit = 0 WHERE is_system = 1 AND name = ? AND monthly_limit = ?").run(name, limit);
}

function ensureDefaultCategories(userId) {
  const insert = db.prepare("INSERT OR IGNORE INTO categories (user_id, name, monthly_limit, color, is_system) VALUES (?, ?, ?, ?, 1)");
  for (const [name, limit, color] of DEFAULT_CATEGORIES) insert.run(userId, name, limit, color);
}

function categoryExists(userId, name) {
  ensureDefaultCategories(userId);
  return Boolean(db.prepare("SELECT id FROM categories WHERE user_id = ? AND name = ?").get(userId, name));
}

function getCategoryBudgets(userId, month = new Date().toISOString().slice(0, 7)) {
  ensureDefaultCategories(userId);
  return db.prepare(`
    SELECT
      c.id,
      c.name,
      c.monthly_limit,
      c.color,
      c.is_system,
      COALESCE(SUM(CASE WHEN t.value < 0 THEN ABS(t.value) ELSE 0 END), 0) AS spent
    FROM categories c
    LEFT JOIN transactions t
      ON t.user_id = c.user_id
      AND t.category = c.name
      AND substr(t.date, 1, 7) = ?
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY CASE WHEN c.name = 'Receita' THEN 1 ELSE 0 END, spent DESC, c.name
  `).all(month, userId).map((item) => ({
    ...item,
    remaining: item.monthly_limit > 0 ? item.monthly_limit - item.spent : null,
    percentage: item.monthly_limit > 0 ? Math.round((item.spent / item.monthly_limit) * 100) : 0,
    status: item.monthly_limit > 0 && item.spent > item.monthly_limit
      ? "acima"
      : item.monthly_limit > 0 && item.spent >= item.monthly_limit * 0.7
        ? "atencao"
        : "dentro",
  }));
}

function currentAIUsage(userId) {
  const date = new Date().toISOString().slice(0, 10);
  const row = db.prepare("SELECT request_count FROM ai_daily_usage WHERE user_id = ? AND usage_date = ?").get(userId, date);
  return row?.request_count || 0;
}

function consumeAIRequest(userId) {
  const used = currentAIUsage(userId);
  if (used >= OPENAI_DAILY_LIMIT) return false;
  const date = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO ai_daily_usage (user_id, usage_date, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, usage_date) DO UPDATE SET request_count = request_count + 1
  `).run(userId, date);
  return true;
}

function toIsoDate(value, fallbackYear = new Date().getFullYear()) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const excelSerial = Number(text);
  if (/^\d{5}(?:\.\d+)?$/.test(text) && Number.isFinite(excelSerial)) {
    const date = XLSX.SSF.parse_date_code(excelSerial);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (br) {
    const year = !br[3] ? String(fallbackYear) : br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const isoSlash = text.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
  if (isoSlash) return `${isoSlash[1]}-${isoSlash[2].padStart(2, "0")}-${isoSlash[3].padStart(2, "0")}`;
  const months = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  };
  const named = text.toLowerCase().match(/^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(\d{2,4}))?$/);
  if (named) {
    const year = !named[3] ? String(fallbackYear) : named[3].length === 2 ? `20${named[3]}` : named[3];
    return `${year}-${months[named[2]]}-${named[1].padStart(2, "0")}`;
  }
  return "";
}

function parseMoney(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const compact = raw.replace(/[R$\s]/g, "");
  const debitHint = /(?:^|[^A-Za-z])D$/i.test(compact) || /debito|d[eé]bito|saida|saída|despesa/i.test(raw);
  const creditHint = /(?:^|[^A-Za-z])C$/i.test(compact) || /credito|cr[eé]dito|entrada|receita/i.test(raw);
  const negative = compact.includes("-") || debitHint || (compact.includes("(") && compact.includes(")"));
  const clean = compact.replace(/[()]/g, "").replace("-", "").replace(/[CD]$/i, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative && !creditHint ? -Math.abs(parsed) : parsed;
}

function normalizeDescription(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b\d{1,4}[\/.-]\d{1,4}(?:[\/.-]\d{1,4})?\b/g, " ")
    .replace(/\b(?:pix|compra|pagamento|pag|debito|credito|cartao|visa|mastercard|elo|estabelecimento)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function merchantPattern(description) {
  const normalized = normalizeDescription(description);
  const ignored = new Set(["de", "da", "do", "das", "dos", "em", "para", "ltda", "sa", "brasil"]);
  return normalized.split(" ").filter((word) => word.length > 1 && !ignored.has(word)).slice(0, 4).join(" ");
}

function loadCategoryRules(userId) {
  return db.prepare("SELECT merchant_pattern, category FROM category_rules WHERE user_id = ? ORDER BY LENGTH(merchant_pattern) DESC").all(userId);
}

function learnCategoryRule(userId, description, category) {
  if (!ALLOWED_CATEGORIES.includes(category) || ["Categoria pendente", "Receita"].includes(category)) return;
  const pattern = merchantPattern(description);
  if (pattern.length < 3) return;
  db.prepare(`
    INSERT INTO category_rules (user_id, merchant_pattern, category)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, merchant_pattern) DO UPDATE SET
      category = excluded.category,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, pattern, category);
  const pending = db.prepare("SELECT id, description FROM transactions WHERE user_id = ? AND category = 'Categoria pendente'").all(userId);
  const update = db.prepare("UPDATE transactions SET category = ?, classification_confidence = 'aprendida', classification_source = 'regra aprendida', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?");
  for (const item of pending) {
    if (normalizeDescription(item.description).includes(pattern)) update.run(category, item.id, userId);
  }
}

function categorize(description, learnedRules = []) {
  const text = normalizeDescription(description);
  for (const rule of learnedRules) {
    if (rule.merchant_pattern && text.includes(rule.merchant_pattern)) {
      return { category: rule.category, confidence: "aprendida", merchant: rule.merchant_pattern };
    }
  }
  const mappings = [
    ["Assinaturas", /spotify|netflix|hbo max|hbomax|disney plus|disney|prime video|amazon prime|globoplay|deezer|youtube premium|apple music|paramount|crunchyroll/],
    ["Transporte", /\buber\b|99app|\b99\b|taxi|combustivel|gasolina|\bposto\b|shell|ipiranga|petrobras|metro|onibus|estacionamento|sem parar/],
    ["Alimentação", /ifood|rappi|restaurante|lanchonete|mcdonald|burger king|padaria|cafeteria|delivery|pizzaria|churrascaria/],
    ["Mercado", /supermercado|\bmercado\b|pao de acucar|atacadao|carrefour|assai|\bextra\b|hortifruti|sams club|dia brasil/],
    ["Lazer", /cinema|cinemark|ingresso|steam|playstation|xbox|parque|teatro|\bshow\b|\bbar\b|boliche/],
    ["Contas fixas", /aluguel|condominio|energia|enel|cemig|light|sabesp|saneamento|conta de agua|internet|vivo fibra|claro net|telefone|celular/],
    ["Compras", /mercado livre|shopee|magazine luiza|magalu|casas bahia|renner|riachuelo|centauro|lojas americanas|amazon marketplace/],
    ["Saúde", /farmacia|drogasil|droga raia|pague menos|hospital|clinica|laboratorio|consulta|medico|dentista|plano de saude/],
    ["Educação", /curso|udemy|alura|escola|faculdade|universidade|livraria|\blivro\b|mensalidade escolar/],
    ["Receita", /salario|pix recebido|deposito|credito recebido|estorno|rendimento|transferencia recebida|provento/],
    ["Outros", /tarifa|juros|multa|imposto|iof|saque|transferencia enviada/],
  ];
  for (const [category, pattern] of mappings) {
    if (pattern.test(text)) return { category, confidence: "alta", merchant: merchantPattern(description) };
  }
  return { category: "Categoria pendente", confidence: "baixa", merchant: merchantPattern(description) };
}

function transactionType(value) {
  return Number(value) >= 0 ? "entrada" : "saida";
}

function inferImportedType(description, rawType = "", category = "") {
  const combined = `${normalizeDescription(description)} ${normalizeDescription(rawType)} ${normalizeDescription(category)}`;
  if (/\b(salario|receita|entrada|credito recebido|pix recebido|deposito|estorno|reembolso|provento|rendimento|transferencia recebida)\b/.test(combined)) {
    return "entrada";
  }
  if (/\b(saida|debito|despesa|pagamento|compra|cartao|boleto|pix enviado|transferencia enviada|tarifa|juros|multa|uber|ifood|mercado|supermercado|farmacia|spotify|netflix|aluguel|energia|internet)\b/.test(combined)) {
    return "saida";
  }
  if (category && category !== "Receita" && category !== "Categoria pendente") return "saida";
  return "saida";
}

function classificationMetadata(userId, description, value, category) {
  const selectedCategory = String(category || "").trim();
  const suggestion = categorize(description, loadCategoryRules(userId));
  const source = selectedCategory === suggestion.category && suggestion.confidence === "aprendida"
    ? "regra aprendida"
    : selectedCategory === suggestion.category && suggestion.confidence !== "baixa"
      ? "regra local"
      : selectedCategory === "Categoria pendente"
        ? "precisa confirmacao"
        : "manual";
  const confidence = source === "manual" ? "manual" : source === "precisa confirmacao" ? "baixa" : suggestion.confidence;
  return {
    type: transactionType(value),
    classification_confidence: confidence,
    classification_source: source,
  };
}

function importedClassificationMetadata(item) {
  if (item.userCorrected) {
    return {
      type: transactionType(item.value),
      classification_confidence: "corrigida",
      classification_source: "manual",
    };
  }
  const confidence = String(item.confidence || "baixa");
  const source = confidence.toLowerCase().includes("openai")
    ? "IA"
    : confidence === "aprendida"
      ? "regra aprendida"
      : item.category === "Categoria pendente"
        ? "precisa confirmacao"
        : "regra local";
  return {
    type: transactionType(item.value),
    classification_confidence: confidence,
    classification_source: source,
  };
}

function cleanPaymentMethod(value) {
  const text = String(value || "").trim();
  return text && text.length <= 50 ? text : "Manual";
}

function cleanTransactionStatus(value) {
  const text = String(value || "").trim();
  const allowed = ["Concluida", "Agendada", "Pendente", "Cancelada"];
  return allowed.includes(text) ? text : "Concluida";
}

function parseTransactionsFromText(text, learnedRules = []) {
  const rawText = String(text || "");
  const fallbackYear = Number((rawText.match(/\b(20\d{2})\b/) || [])[1]) || new Date().getFullYear();
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1);
  const results = [];
  const seen = new Set();
  const dateRegex = /(\d{1,2}[\/.-]\d{2}(?:[\/.-]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+\d{2,4})?)/i;
  const moneyRegex = /(\(?-?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\)?|\(?-?\s*(?:R\$\s*)?\d+,\d{2}\)?|\(?-?\s*(?:R\$\s*)?\d+\.\d{2}\)?)(?:\s*[CD])?/gi;
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!dateRegex.test(line)) continue;
    dateRegex.lastIndex = 0;
    moneyRegex.lastIndex = 0;
    if (moneyRegex.test(line)) {
      candidates.push(line);
      continue;
    }
    moneyRegex.lastIndex = 0;
    const block = [line];
    for (let offset = 1; offset <= 3 && index + offset < lines.length; offset += 1) {
      const next = lines[index + offset];
      dateRegex.lastIndex = 0;
      if (dateRegex.test(next)) break;
      block.push(next);
      moneyRegex.lastIndex = 0;
      if (moneyRegex.test(next)) break;
    }
    candidates.push(block.join(" "));
  }

  for (const line of candidates) {
    dateRegex.lastIndex = 0;
    moneyRegex.lastIndex = 0;
    const dateMatch = line.match(dateRegex);
    const moneyMatches = [...line.matchAll(moneyRegex)].map((match) => match[1]);
    if (!dateMatch || moneyMatches.length === 0) continue;
    const valueRaw = moneyMatches[moneyMatches.length - 1];
    const parsedValue = parseMoney(valueRaw);
    if (parsedValue === null || parsedValue === 0) continue;
    let description = line
      .replace(dateMatch[0], "")
      .replace(valueRaw, "")
      .replace(/\b\d{2}:\d{2}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    description = description.replace(/^(compra|pagamento|debito|credito)\s+/i, "").trim();
    if (!description) description = "Transação importada do extrato";
    const positiveHint = /salario|pix recebido|deposito|credito recebido|estorno|rendimento|transferencia recebida|entrada/i.test(line);
    const negativeHint = /compra|pagamento|debito|saque|tarifa|parcela|pix enviado|transferencia enviada/i.test(line);
    const value = parsedValue < 0 || negativeHint ? -Math.abs(parsedValue) : positiveHint ? Math.abs(parsedValue) : -Math.abs(parsedValue);
    const date = toIsoDate(dateMatch[0], fallbackYear);
    const key = `${date}|${description.toLowerCase()}|${value.toFixed(2)}`;
    if (!date || seen.has(key)) continue;
    seen.add(key);
    const classification = positiveHint
      ? { category: "Receita", confidence: "alta" }
      : categorize(description, learnedRules);
    results.push({
      description: description.slice(0, 120),
      value,
      date,
      category: classification.category,
      confidence: classification.confidence,
      merchantPattern: classification.merchant || merchantPattern(description),
    });
    if (results.length >= 80) break;
  }
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

async function enrichCandidatesWithOpenAI(userId, candidates, learnedRules) {
  if (!isOpenAIConfigured() || candidates.length === 0) {
    return { candidates, source: "local", model: null, cached: false, warning: null };
  }
  const fingerprint = crypto.createHash("sha256")
    .update(JSON.stringify({ type: "classification", candidates, learnedRules, model: OPENAI_MODEL }))
    .digest("hex");
  const cached = db.prepare("SELECT response_json FROM ai_analysis_cache WHERE user_id = ? AND fingerprint = ?").get(userId, fingerprint);
  if (cached) {
    return { candidates: JSON.parse(cached.response_json), source: "openai", model: OPENAI_MODEL, cached: true, warning: null };
  }
  try {
    const result = await classifyTransactionsWithOpenAI(candidates, learnedRules);
    const byIndex = new Map((result?.transactions || []).map((item) => [item.index, item]));
    const enriched = candidates.map((candidate, index) => {
      if (candidate.confidence === "aprendida") return candidate;
      const classification = byIndex.get(index);
      if (!classification) return candidate;
      const confidence = Number(classification.confidence);
      const category = confidence >= 0.68 ? classification.category : "Categoria pendente";
      const absoluteValue = Math.abs(candidate.value);
      return {
        ...candidate,
        value: classification.direction === "entrada" ? absoluteValue : -absoluteValue,
        category,
        confidence: confidence >= 0.68 ? `OpenAI ${Math.round(confidence * 100)}%` : `OpenAI baixa ${Math.round(confidence * 100)}%`,
        aiReason: classification.reason,
      };
    });
    db.prepare(`
      INSERT INTO ai_analysis_cache (user_id, fingerprint, model, response_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, fingerprint) DO UPDATE SET response_json = excluded.response_json, created_at = CURRENT_TIMESTAMP
    `).run(userId, fingerprint, OPENAI_MODEL, JSON.stringify(enriched));
    return { candidates: enriched, source: "openai", model: OPENAI_MODEL, cached: false, warning: null };
  } catch (error) {
    console.error("OpenAI classification fallback:", error.status || error.code || error.message);
    return {
      candidates,
      source: "local",
      model: OPENAI_MODEL,
      cached: false,
      warning: "A OpenAI não respondeu. A classificação local foi usada automaticamente.",
    };
  }
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function addMonthsLabel(months) {
  const date = new Date();
  date.setMonth(date.getMonth() + Math.max(Number(months || 0), 0));
  return date.toISOString().slice(0, 7);
}

function parseGoalDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month) return new Date();
  return new Date(year, month - 1, day || 1);
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonthsFromDate(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + Math.max(Number(months || 0), 0), 1);
}

function monthsBetween(startDate, endDate = new Date()) {
  return Math.max((endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()), 0);
}

function normalizeMonthParam(value) {
  const month = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

function shiftMonthValue(value, offset) {
  const month = normalizeMonthParam(value);
  if (!month) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + Number(offset || 0), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function filterTransactionsForMonth(transactions, month) {
  const normalizedMonth = normalizeMonthParam(month);
  if (!normalizedMonth) return transactions || [];
  return (transactions || []).filter((item) => String(item.date || "").startsWith(normalizedMonth));
}

function summarizeTransactionsForComparison(transactions) {
  const income = transactions.filter((item) => item.value > 0).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const expenses = transactions.filter((item) => item.value < 0).reduce((sum, item) => sum + Math.abs(Number(item.value || 0)), 0);
  return {
    income,
    expenses,
    balance: income - expenses,
    count: transactions.length,
  };
}

function categoryTotalsForComparison(transactions) {
  const totals = new Map();
  for (const item of transactions.filter((entry) => entry.value < 0)) {
    totals.set(item.category, (totals.get(item.category) || 0) + Math.abs(Number(item.value || 0)));
  }
  return totals;
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function buildMonthlyComparison(transactions, selectedMonth) {
  const month = normalizeMonthParam(selectedMonth);
  if (!month) return null;
  const previousMonth = shiftMonthValue(month, -1);
  const currentTransactions = filterTransactionsForMonth(transactions, month);
  const previousTransactions = filterTransactionsForMonth(transactions, previousMonth);
  const current = summarizeTransactionsForComparison(currentTransactions);
  const previous = summarizeTransactionsForComparison(previousTransactions);
  const hasPrevious = previousTransactions.length > 0;
  const currentCategories = categoryTotalsForComparison(currentTransactions);
  const previousCategories = categoryTotalsForComparison(previousTransactions);
  const categoryNames = [...new Set([...currentCategories.keys(), ...previousCategories.keys()])];
  const categoryChanges = categoryNames.map((category) => {
    const currentValue = currentCategories.get(category) || 0;
    const previousValue = previousCategories.get(category) || 0;
    return {
      category,
      current: currentValue,
      previous: previousValue,
      difference: currentValue - previousValue,
      percent: percentChange(currentValue, previousValue),
    };
  }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  const topIncrease = categoryChanges.filter((item) => item.difference > 0).sort((a, b) => b.difference - a.difference)[0] || null;
  const topReduction = categoryChanges.filter((item) => item.difference < 0).sort((a, b) => a.difference - b.difference)[0] || null;
  const expenseDifference = current.expenses - previous.expenses;
  const balanceDifference = current.balance - previous.balance;
  let summary = "Ainda não há mês anterior com lançamentos para comparar a evolução.";
  if (hasPrevious) {
    if (expenseDifference < 0 && balanceDifference >= 0) {
      summary = `Melhorou em relação ao mês anterior: os gastos caíram ${money(Math.abs(expenseDifference))} e o saldo evoluiu ${money(balanceDifference)}.`;
    } else if (expenseDifference < 0) {
      summary = `Os gastos caíram ${money(Math.abs(expenseDifference))} em relação ao mês anterior. Continue acompanhando o saldo para confirmar a melhora.`;
    } else if (expenseDifference > 0) {
      summary = `Os gastos aumentaram ${money(expenseDifference)} em relação ao mês anterior.${topIncrease ? ` O maior aumento foi em ${topIncrease.category}.` : ""}`;
    } else if (balanceDifference > 0) {
      summary = `Os gastos ficaram estáveis, mas o saldo melhorou ${money(balanceDifference)} em relação ao mês anterior.`;
    } else {
      summary = "O mês ficou muito parecido com o anterior. Acompanhe as categorias para buscar pequenos ganhos.";
    }
  }
  return {
    selectedMonth: month,
    previousMonth,
    hasPrevious,
    current,
    previous,
    deltas: {
      income: current.income - previous.income,
      expenses: expenseDifference,
      balance: balanceDifference,
      incomePercent: percentChange(current.income, previous.income),
      expensesPercent: percentChange(current.expenses, previous.expenses),
      balancePercent: percentChange(current.balance, previous.balance),
    },
    topIncrease,
    topReduction,
    categoryChanges: categoryChanges.slice(0, 8),
    summary,
  };
}

function detectRecurringTransactions(transactions, selectedMonth) {
  const recurringPattern = /spotify|netflix|disney|hbo|prime|globoplay|crunchyroll|deezer|youtube premium|apple music|aluguel|condominio|internet|energia|academia|telefone|celular|seguro|faculdade|curso/i;
  const selected = normalizeMonthParam(selectedMonth);
  const expenses = (transactions || []).filter((item) => Number(item.value || 0) < 0);
  const groups = new Map();
  for (const item of expenses) {
    const key = merchantPattern(item.description) || normalizeDescription(item.description) || String(item.description || "").toLowerCase();
    if (!key) continue;
    const current = groups.get(key) || {
      key,
      description: item.description,
      category: item.category,
      months: new Set(),
      count: 0,
      total: 0,
      selectedMonthTotal: 0,
      values: [],
      lastDate: item.date,
      probable: false,
    };
    const amount = Math.abs(Number(item.value || 0));
    current.count += 1;
    current.total += amount;
    current.values.push(amount);
    current.months.add(String(item.date || "").slice(0, 7));
    current.lastDate = String(item.date || "") > String(current.lastDate || "") ? item.date : current.lastDate;
    if (selected && String(item.date || "").startsWith(selected)) current.selectedMonthTotal += amount;
    if (recurringPattern.test(`${item.description} ${item.category}`) || ["Assinaturas", "Contas fixas"].includes(item.category)) current.probable = true;
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((item) => {
      const monthsCount = item.months.size || 1;
      const averageMonthly = item.selectedMonthTotal > 0
        ? item.selectedMonthTotal
        : item.total / monthsCount;
      const stable = item.values.length >= 2
        ? Math.max(...item.values) - Math.min(...item.values) <= Math.max(20, averageMonthly * 0.35)
        : false;
      const confidence = item.months.size >= 2 && stable
        ? "alta"
        : item.months.size >= 2 || item.probable
          ? "media"
          : "baixa";
      return {
        description: item.description,
        category: item.category,
        probable: item.probable,
        count: item.count,
        months: [...item.months].sort(),
        monthlyEstimate: Number(averageMonthly.toFixed(2)),
        total: Number(item.total.toFixed(2)),
        confidence,
        lastDate: item.lastDate,
      };
    })
    .filter((item) => item.probable || (item.months.length >= 3 && item.confidence !== "baixa"))
    .sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
    .slice(0, 10);
}

function calculateFinancialHealthScore(analysis) {
  const income = Number(analysis.totalIncome || 0);
  const expenses = Number(analysis.totalExpenses || 0);
  const balance = Number(analysis.balance || 0);
  const goal = analysis.goal || null;
  const pendingCount = Number(analysis.pendingCount || 0);
  const transactionCount = Number(analysis.transactionCount || 0);
  let score = income > 0 ? 58 : expenses > 0 ? 38 : 0;
  const components = [];

  if (income > 0) {
    const savingsRate = balance / income;
    if (savingsRate >= 0.2) score += 22;
    else if (savingsRate >= 0.1) score += 15;
    else if (savingsRate >= 0) score += 8;
    else score -= Math.min(28, Math.abs(savingsRate) * 80);
    components.push({ label: "Saldo sobre renda", value: Math.round(savingsRate * 100), unit: "%", good: savingsRate >= 0.1 });

    const fixedTotal = (analysis.categories || [])
      .filter((item) => ["Contas fixas", "Assinaturas"].includes(item.category))
      .reduce((sum, item) => sum + Number(item.total || 0), 0);
    const fixedRate = fixedTotal / income;
    if (fixedRate <= 0.35) score += 10;
    else if (fixedRate <= 0.55) score += 3;
    else score -= 12;
    components.push({ label: "Fixos e assinaturas", value: Math.round(fixedRate * 100), unit: "%", good: fixedRate <= 0.45 });
  }

  if (goal) {
    if (goal.progressPercentage >= 75) score += 10;
    else if (goal.feasible) score += 7;
    else score -= 8;
    components.push({ label: "Ritmo da meta", value: goal.progressPercentage || 0, unit: "%", good: Boolean(goal.feasible) });
  } else if (income > 0 || expenses > 0) {
    score -= 5;
    components.push({ label: "Meta ativa", value: 0, unit: "", good: false });
  }

  if (pendingCount === 0 && transactionCount > 0) score += 5;
  else if (pendingCount > 0) score -= Math.min(8, pendingCount * 2);
  components.push({ label: "Dados classificados", value: transactionCount ? Math.round(((transactionCount - pendingCount) / transactionCount) * 100) : 0, unit: "%", good: pendingCount === 0 && transactionCount > 0 });

  if (analysis.recurringMonthlyTotal && income > 0) {
    const recurringRate = Number(analysis.recurringMonthlyTotal || 0) / income;
    if (recurringRate > 0.35) score -= 8;
    components.push({ label: "Recorrências", value: Math.round(recurringRate * 100), unit: "%", good: recurringRate <= 0.25 });
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const label = finalScore >= 80 ? "Forte" : finalScore >= 65 ? "Boa" : finalScore >= 45 ? "Atenção" : finalScore > 0 ? "Crítica" : "Sem dados";
  const summary = finalScore === 0
    ? "Cadastre ou importe dados para calcular sua saúde financeira."
    : finalScore >= 65
      ? "Seu painel mostra uma base financeira controlada. Continue acompanhando metas e categorias de maior peso."
      : "Há pontos claros para ajustar: saldo, gastos recorrentes, meta ou qualidade das categorias.";
  return { score: finalScore, label, summary, components };
}

function buildGoalTimeline(goal, contributionSummary = []) {
  if (!goal) return [];
  const start = parseGoalDate(goal.created_at || goal.updated_at);
  const months = Math.max(Number(goal.target_months || 1), 1);
  const monthlyTarget = Number(goal.originalMonthlyTarget || goal.monthlyTarget || 0);
  const rowsByMonth = new Map(contributionSummary
    .filter((item) => Number(item.goal_id) === Number(goal.id))
    .map((item) => [item.month, item]));
  let accumulated = Number(goal.initial_saved_amount || 0);
  return Array.from({ length: Math.min(months, 24) }, (_, index) => {
    const month = formatMonthKey(addMonthsFromDate(start, index));
    const row = rowsByMonth.get(month);
    const contributed = Number(row?.total || 0);
    accumulated = Math.min(Number(goal.target_value || 0), accumulated + contributed);
    const expected = Math.min(Number(goal.target_value || 0), Number(goal.initial_saved_amount || 0) + monthlyTarget * (index + 1));
    return {
      month,
      label: month,
      contributed,
      accumulated: Number(accumulated.toFixed(2)),
      expected: Number(expected.toFixed(2)),
      status: accumulated + 1 >= expected ? "no-prazo" : "atrasado",
    };
  });
}

function buildGoalTimelines(goals, contributionSummary) {
  return Object.fromEntries((goals || []).map((goal) => [goal.id, buildGoalTimeline(goal, contributionSummary)]));
}

function monthlyClosingSnapshot(analysis) {
  return {
    month: analysis.selectedMonth,
    totalIncome: analysis.totalIncome,
    totalExpenses: analysis.totalExpenses,
    balance: analysis.balance,
    financialScore: analysis.financialScore,
    topCategories: (analysis.categories || []).slice(0, 5),
    recurringMonthlyTotal: analysis.recurringMonthlyTotal || 0,
    goal: analysis.goal ? {
      id: analysis.goal.id,
      goal_name: analysis.goal.goal_name,
      progressPercentage: analysis.goal.progressPercentage,
      saved_amount: analysis.goal.saved_amount,
      remainingAmount: analysis.goal.remainingAmount,
      status: analysis.goal.status,
    } : null,
    comparison: analysis.monthlyComparison,
    insights: (analysis.insights || []).slice(0, 5),
    closedAt: new Date().toISOString(),
  };
}

function buildGoalPlanLegacy(goal, monthlyBalance, potentialMonthlySavings) {
  if (!goal) return null;
  const goalName = String(goal.goal_name || "").trim() || "Meta financeira";
  const targetValue = Number(goal.target_value);
  const savedAmount = Math.min(Math.max(Number(goal.saved_amount || 0), 0), targetValue);
  const remainingAmount = Math.max(targetValue - savedAmount, 0);
  const targetMonths = Math.max(Number(goal.target_months || 1), 1);
  const monthlyTarget = remainingAmount / targetMonths;
  const modeMultipliers = { leve: 0.75, equilibrado: 1, intenso: 1.35 };
  const modeLabels = { leve: "Leve", equilibrado: "Equilibrado", intenso: "Agressivo" };
  const modeMultiplier = modeMultipliers[goal.intensity] || 1;
  const modeMonthlyTarget = remainingAmount > 0 ? Math.max(monthlyTarget * modeMultiplier, 1) : 0;
  const plannedMonthlySavings = modeMonthlyTarget;
  const forecastMonths = remainingAmount === 0 ? 0 : Math.ceil(remainingAmount / modeMonthlyTarget);
  const plannedForecastMonths = plannedMonthlySavings > 0 && remainingAmount > 0 ? Math.ceil(remainingAmount / plannedMonthlySavings) : null;
  const available = Math.max(monthlyBalance, 0);
  const requiredAdjustment = Math.max(monthlyTarget - available, 0);
  const progressPercentage = targetValue > 0 ? Math.min(Math.round((savedAmount / targetValue) * 100), 100) : 0;
  let status = "No prazo";
  if (remainingAmount === 0) status = "Adiantada";
  else if (available >= modeMonthlyTarget && forecastMonths < targetMonths) status = "Adiantada";
  else if (available >= monthlyTarget) status = "Possível";
  else if (available + potentialMonthlySavings >= monthlyTarget) status = "No prazo";
  else if (available > 0) status = "Atrasada";
  else status = "Difícil";
  return {
    ...goal,
    goal_name: goalName,
    target_value: targetValue,
    saved_amount: savedAmount,
    planned_monthly_savings: plannedMonthlySavings,
    remainingAmount,
    progressPercentage,
    target_months: targetMonths,
    monthlyTarget,
    modeMonthlyTarget,
    modeLabel: modeLabels[goal.intensity] || "Equilibrado",
    forecastMonths,
    plannedForecastMonths,
    forecastConclusion: addMonthsLabel(forecastMonths),
    monthlyBalance,
    requiredAdjustment,
    feasible: ["No prazo", "Possível", "Adiantada"].includes(status),
    status,
  };
}

function buildGoalMetrics(goal, today = new Date()) {
  if (!goal) return null;
  const goalName = String(goal.goal_name || "").trim() || "Meta financeira";
  const targetValue = Number(goal.target_value || 0);
  const savedAmount = Math.min(Math.max(Number(goal.saved_amount || 0), 0), targetValue);
  const initialSavedAmount = Math.min(Math.max(Number(goal.initial_saved_amount ?? goal.saved_amount ?? 0), 0), savedAmount, targetValue);
  const remainingAmount = Math.max(targetValue - savedAmount, 0);
  const targetMonths = Math.max(Number(goal.target_months || 1), 1);
  const startDate = parseGoalDate(goal.created_at || goal.updated_at);
  const elapsedMonths = Math.min(monthsBetween(startDate, today), targetMonths);
  const monthsRemaining = remainingAmount === 0 ? 0 : Math.max(targetMonths - elapsedMonths, 1);
  const targetConclusion = formatMonthKey(addMonthsFromDate(startDate, targetMonths));
  const plannedTotal = Math.max(targetValue - initialSavedAmount, 0);
  const originalMonthlyTarget = plannedTotal / targetMonths;
  const monthlyTarget = remainingAmount / Math.max(monthsRemaining, 1);
  const modeMultipliers = { leve: 0.75, equilibrado: 1, intenso: 1.35 };
  const modeLabels = { leve: "Leve", equilibrado: "Equilibrado", intenso: "Agressivo" };
  const modeMultiplier = modeMultipliers[goal.intensity] || 1;
  const modeMonthlyTarget = remainingAmount > 0 ? Math.max(monthlyTarget * modeMultiplier, 1) : 0;
  const plannedMonthlySavings = modeMonthlyTarget;
  const forecastMonths = remainingAmount === 0 ? 0 : Math.ceil(remainingAmount / Math.max(modeMonthlyTarget, 1));
  const plannedForecastMonths = plannedMonthlySavings > 0 && remainingAmount > 0 ? Math.ceil(remainingAmount / plannedMonthlySavings) : null;
  const expectedSavedNow = Math.min(targetValue, initialSavedAmount + (plannedTotal * (elapsedMonths / targetMonths)));
  const paceDifference = Number((savedAmount - expectedSavedNow).toFixed(2));
  const progressPercentage = targetValue > 0 ? Math.min(Math.round((savedAmount / targetValue) * 100), 100) : 0;
  const tolerance = Math.max(originalMonthlyTarget * 0.35, targetValue * 0.02, 1);
  let status = "No prazo";
  if (remainingAmount === 0) status = "Concluída";
  else if (elapsedMonths === 0) status = "Plano iniciado";
  else if (paceDifference >= tolerance) status = "Adiantada";
  else if (paceDifference >= -tolerance) status = "No prazo";
  else if (monthsRemaining <= 2) status = "Crítica";
  else status = "Ajustar ritmo";
  const statusDetail = remainingAmount === 0
    ? "Meta concluída. Você já atingiu o valor planejado."
    : paceDifference >= 0
      ? `Você está ${money(paceDifference)} acima do ritmo esperado para hoje.`
      : `Você está ${money(Math.abs(paceDifference))} abaixo do ritmo esperado para hoje.`;
  const smartRecommendation = remainingAmount === 0
    ? "Não é necessário novo aporte para esta meta."
    : `Para manter o prazo, guarde cerca de ${money(monthlyTarget)} por mês pelos próximos ${monthsRemaining} mês(es).`;
  return {
    ...goal,
    goal_name: goalName,
    target_value: targetValue,
    initial_saved_amount: initialSavedAmount,
    saved_amount: savedAmount,
    planned_monthly_savings: plannedMonthlySavings,
    remainingAmount,
    progressPercentage,
    target_months: targetMonths,
    elapsedMonths,
    monthsRemaining,
    originalMonthlyTarget,
    monthlyTarget,
    modeMonthlyTarget,
    modeLabel: modeLabels[goal.intensity] || "Equilibrado",
    forecastMonths,
    plannedForecastMonths,
    forecastConclusion: addMonthsLabel(forecastMonths),
    targetConclusion,
    expectedSavedNow: Number(expectedSavedNow.toFixed(2)),
    paceDifference,
    statusDetail,
    smartRecommendation,
    feasible: ["Concluída", "Plano iniciado", "No prazo", "Adiantada"].includes(status),
    status,
  };
}

function buildGoalPlan(goal, monthlyBalance, potentialMonthlySavings) {
  const plan = buildGoalMetrics(goal);
  if (!plan) return null;
  const available = Math.max(Number(monthlyBalance || 0), 0);
  const requiredAdjustment = Math.max(plan.monthlyTarget - available, 0);
  const canRecoverWithSavings = available + Number(potentialMonthlySavings || 0) >= plan.monthlyTarget;
  let status = plan.status;
  if (plan.remainingAmount > 0 && ["Ajustar ritmo", "Crítica"].includes(status) && canRecoverWithSavings) status = "Recuperável";
  return {
    ...plan,
    monthlyBalance,
    requiredAdjustment,
    feasible: ["Concluída", "Plano iniciado", "No prazo", "Adiantada", "Recuperável"].includes(status),
    status,
  };
}

function buildCategoryBudgetSuggestions(categories, totalIncome, months, goalPlan) {
  const safeMonths = Math.max(Number(months || 1), 1);
  const monthlyIncome = totalIncome > 0 ? totalIncome / safeMonths : 0;
  const goalReserve = Math.max(Number(goalPlan?.monthlyTarget || 0), 0);
  const generalReserve = monthlyIncome > 0 ? monthlyIncome * 0.12 : 0;
  const availableForExpenses = Math.max(monthlyIncome - Math.max(goalReserve, generalReserve), 0);
  const reductionFactors = {
    "Assinaturas": 0.55,
    "Lazer": 0.75,
    "Alimentação": 0.82,
    "Compras": 0.78,
    "Transporte": 0.92,
    "Mercado": 0.94,
    "Contas fixas": 0.96,
    "Saúde": 1,
    "Educação": 1,
    "Metas": 1,
    "Outros": 0.85,
  };
  const base = categories
    .filter((item) => item.category !== "Receita")
    .map((item) => {
      const currentMonthly = Number(item.total || 0) / safeMonths;
      const factor = reductionFactors[item.category] ?? 0.9;
      const suggestedMonthly = Math.max(currentMonthly * factor, 0);
      return { ...item, currentMonthly, suggestedMonthly };
    });
  const baseTotal = base.reduce((sum, item) => sum + item.suggestedMonthly, 0);
  const scale = availableForExpenses > 0 && baseTotal > availableForExpenses ? availableForExpenses / baseTotal : 1;
  return base.map((item) => {
    const suggestedMonthly = Number((item.suggestedMonthly * scale).toFixed(2));
    const difference = Number((item.currentMonthly - suggestedMonthly).toFixed(2));
    const status = item.currentMonthly > suggestedMonthly * 1.08 ? "reduzir" : "adequado";
    const reason = status === "reduzir"
      ? `Tente manter ${item.category} perto de ${money(suggestedMonthly)} por mês para abrir espaço para metas.`
      : `${item.category} está em um nível compatível com sua renda e meta atual.`;
    return {
      category: item.category,
      currentMonthly: Number(item.currentMonthly.toFixed(2)),
      suggestedMonthly,
      difference,
      share: item.share,
      status,
      reason,
    };
  }).sort((a, b) => b.currentMonthly - a.currentMonthly);
}

function goalPreviewLegacy(goal) {
  if (!goal) return null;
  const targetValue = Number(goal.target_value || 0);
  const savedAmount = Math.min(Math.max(Number(goal.saved_amount || 0), 0), targetValue);
  const remainingAmount = Math.max(targetValue - savedAmount, 0);
  const targetMonths = Math.max(Number(goal.target_months || 1), 1);
  const monthlyTarget = remainingAmount / targetMonths;
  const modeMultipliers = { leve: 0.75, equilibrado: 1, intenso: 1.35 };
  const modeMultiplier = modeMultipliers[goal.intensity] || 1;
  const modeMonthlyTarget = remainingAmount > 0 ? Math.max(monthlyTarget * modeMultiplier, 1) : 0;
  const plannedMonthlySavings = modeMonthlyTarget;
  const progressPercentage = targetValue > 0 ? Math.min(Math.round((savedAmount / targetValue) * 100), 100) : 0;
  const forecastMonths = remainingAmount === 0
    ? 0
    : plannedMonthlySavings > 0
      ? Math.ceil(remainingAmount / plannedMonthlySavings)
      : targetMonths;
  const status = remainingAmount === 0
    ? "Concluída"
    : forecastMonths <= targetMonths
      ? "No prazo"
      : "Prazo estendido";
  return {
    ...goal,
    target_value: targetValue,
    saved_amount: savedAmount,
    planned_monthly_savings: plannedMonthlySavings,
    target_months: targetMonths,
    remainingAmount,
    progressPercentage,
    monthlyTarget,
    modeMonthlyTarget,
    forecastMonths,
    forecastConclusion: addMonthsLabel(forecastMonths),
    status,
  };
}

function goalPreview(goal) {
  return buildGoalMetrics(goal);
}

function getUserGoals(userId) {
  return db.prepare(`
    SELECT id, goal_name, objective, target_value, initial_saved_amount, saved_amount, planned_monthly_savings, target_months, intensity, created_at, updated_at
    FROM financial_goals
    WHERE user_id = ?
    ORDER BY CASE WHEN saved_amount < target_value THEN 0 ELSE 1 END, updated_at DESC, id DESC
  `).all(userId).map(goalPreview);
}

function getGoalContributions(userId, limit = 80) {
  return db.prepare(`
    SELECT gc.id, gc.goal_id, gc.transaction_id, gc.amount, gc.contribution_date, gc.note, gc.created_at, fg.goal_name
    FROM goal_contributions gc
    JOIN financial_goals fg ON fg.id = gc.goal_id AND fg.user_id = gc.user_id
    WHERE gc.user_id = ?
    ORDER BY gc.contribution_date DESC, gc.id DESC
    LIMIT ?
  `).all(userId, limit);
}

function getGoalContributionSummary(userId) {
  return db.prepare(`
    SELECT goal_id, strftime('%Y-%m', contribution_date) AS month, SUM(amount) AS total, COUNT(*) AS count
    FROM goal_contributions
    WHERE user_id = ?
    GROUP BY goal_id, month
    ORDER BY month DESC
  `).all(userId);
}

function getPrimaryGoal(userId) {
  const goals = getUserGoals(userId);
  return goals[0] || null;
}

function detectAnomalies(transactions, categories, categoryBudgets, months) {
  const anomalies = [];
  for (const item of categoryBudgets.filter((entry) => entry.name !== "Receita" && entry.monthly_limit > 0)) {
    if (item.spent > item.monthly_limit) {
      anomalies.push({
        type: "sugestao",
        severity: "critico",
        title: `${item.name} acima do ideal`,
        message: `Você gastou ${money(item.spent - item.monthly_limit)} acima do valor recomendado para esta categoria.`,
      });
    } else if (item.spent >= item.monthly_limit * 0.7) {
      anomalies.push({
        type: "sugestao",
        severity: "atencao",
        title: `${item.name} perto do ideal`,
        message: `Você já usou ${item.percentage}% do valor recomendado para esta categoria.`,
      });
    }
  }

  const expenses = transactions.filter((item) => item.value < 0);
  const byDescription = new Map();
  for (const item of expenses) {
    const key = normalizeDescription(item.description).replace(/\b(parcela|mensalidade)\b/g, "").trim();
    if (!key) continue;
    const current = byDescription.get(key) || { description: item.description, category: item.category, count: 0, total: 0 };
    current.count += 1;
    current.total += Math.abs(item.value);
    byDescription.set(key, current);
  }
  for (const item of [...byDescription.values()].filter((entry) => entry.count >= 2 && entry.category === "Assinaturas").slice(0, 3)) {
    anomalies.push({
      type: "recorrencia",
      severity: "atencao",
      title: "Assinatura recorrente detectada",
      message: `${item.description} apareceu ${item.count} vezes e somou ${money(item.total)}.`,
    });
  }

  const totalsByCategory = new Map(categories.map((item) => [item.category, item.total]));
  const countsByCategory = new Map();
  expenses.forEach((item) => countsByCategory.set(item.category, (countsByCategory.get(item.category) || 0) + 1));
  for (const item of expenses) {
    const average = (totalsByCategory.get(item.category) || 0) / (countsByCategory.get(item.category) || 1);
    const amount = Math.abs(item.value);
    if (average > 0 && amount >= average * 1.8 && amount >= 100) {
      anomalies.push({
        type: "valor_alto",
        severity: "info",
        title: "Gasto acima da média da categoria",
        message: `${item.description} foi ${money(amount)}, acima da média de ${item.category}.`,
      });
      break;
    }
  }

  const smallExpenses = expenses.filter((item) => Math.abs(Number(item.value || 0)) <= 35);
  const smallTotal = smallExpenses.reduce((sum, item) => sum + Math.abs(Number(item.value || 0)), 0);
  if (smallExpenses.length >= 5 && smallTotal >= 80) {
    anomalies.push({
      type: "microgastos",
      severity: "atencao",
      title: "Muitos gastos pequenos acumulados",
      message: `${smallExpenses.length} despesas pequenas somaram ${money(smallTotal)}. Vale revisar compras por impulso e delivery barato recorrente.`,
    });
  }

  const categoryMonths = new Map();
  for (const item of expenses) {
    const key = `${item.category}|${String(item.date).slice(0, 7)}`;
    categoryMonths.set(key, (categoryMonths.get(key) || 0) + Math.abs(item.value));
  }
  const orderedMonths = [...months].sort();
  if (orderedMonths.length >= 2) {
    const previous = orderedMonths[orderedMonths.length - 2];
    const current = orderedMonths[orderedMonths.length - 1];
    for (const item of categories.slice(0, 5)) {
      const before = categoryMonths.get(`${item.category}|${previous}`) || 0;
      const now = categoryMonths.get(`${item.category}|${current}`) || 0;
      if (before > 0 && now > before * 1.3 && now - before >= 50) {
        anomalies.push({
          type: "aumento_mensal",
          severity: "atencao",
          title: `${item.category} subiu no mês`,
          message: `A categoria aumentou de ${money(before)} para ${money(now)} em relação ao mês anterior.`,
        });
        break;
      }
    }
  }
  return anomalies.slice(0, 6);
}

function buildFinancialAnalysis(transactions, goal, categoryBudgets = [], options = {}) {
  const selectedMonth = normalizeMonthParam(options.month);
  const previousMonth = selectedMonth ? shiftMonthValue(selectedMonth, -1) : null;
  const analysisTransactions = selectedMonth ? filterTransactionsForMonth(transactions, selectedMonth) : transactions;
  const totalIncome = analysisTransactions.filter((item) => item.value > 0).reduce((sum, item) => sum + item.value, 0);
  const totalExpenses = analysisTransactions.filter((item) => item.value < 0).reduce((sum, item) => sum + Math.abs(item.value), 0);
  const balance = totalIncome - totalExpenses;
  const monthSet = new Set(analysisTransactions.map((item) => String(item.date).slice(0, 7)).filter(Boolean));
  const months = selectedMonth ? 1 : monthSet.size || 1;
  const monthlyIncome = totalIncome / months;
  const monthlyExpenses = totalExpenses / months;
  const monthlyBalance = balance / months;
  const monthlyMap = new Map();
  for (const item of transactions) {
    const month = String(item.date).slice(0, 7);
    const current = monthlyMap.get(month) || { month, income: 0, expenses: 0, balance: 0 };
    if (item.value > 0) current.income += item.value;
    if (item.value < 0) current.expenses += Math.abs(item.value);
    current.balance += item.value;
    monthlyMap.set(month, current);
  }
  const monthlyEvolution = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  const byCategory = new Map();
  for (const item of analysisTransactions.filter((entry) => entry.value < 0)) {
    byCategory.set(item.category, (byCategory.get(item.category) || 0) + Math.abs(item.value));
  }
  const categories = [...byCategory.entries()]
    .map(([category, total]) => ({ category, total, share: totalExpenses ? Math.round((total / totalExpenses) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
  const categoryRanking = categories.map((item, index) => ({ ...item, position: index + 1 }));
  const largestExpenses = analysisTransactions
    .filter((item) => item.value < 0)
    .sort((a, b) => a.value - b.value)
    .slice(0, 5)
    .map((item) => ({ ...item, value: Math.abs(item.value) }));
  const descriptionCounts = new Map();
  for (const item of analysisTransactions.filter((entry) => entry.value < 0)) {
    const key = item.description.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
    const current = descriptionCounts.get(key) || { description: item.description, count: 0, total: 0 };
    current.count += 1;
    current.total += Math.abs(item.value);
    descriptionCounts.set(key, current);
  }
  const recurring = [...descriptionCounts.values()].filter((item) => item.count >= 2).sort((a, b) => b.total - a.total).slice(0, 5);
  const recurringTransactions = detectRecurringTransactions(transactions, selectedMonth);
  const recurringMonthlyTotal = recurringTransactions.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0);
  const pendingCount = analysisTransactions.filter((item) => item.category === "Categoria pendente").length;
  const classificationSummary = analysisTransactions.reduce((summary, item) => {
    const source = item.classification_source || "manual";
    const confidence = item.classification_confidence || "manual";
    const type = item.type || transactionType(item.value);
    summary.sources[source] = (summary.sources[source] || 0) + 1;
    summary.confidence[confidence] = (summary.confidence[confidence] || 0) + 1;
    summary.types[type] = (summary.types[type] || 0) + 1;
    return summary;
  }, { sources: {}, confidence: {}, types: {} });
  const reductionRates = {
    Assinaturas: 0.5,
    Lazer: 0.25,
    Alimentação: 0.2,
    Compras: 0.15,
    Transporte: 0.1,
    Mercado: 0.1,
  };
  let recommendations = categories
    .filter((item) => reductionRates[item.category] && item.total > 0)
    .map((item) => {
      const monthlyCategory = item.total / months;
      const potentialMonthlySavings = monthlyCategory * reductionRates[item.category];
      const examples = [...new Set(analysisTransactions
        .filter((transaction) => transaction.value < 0 && transaction.category === item.category)
        .sort((a, b) => a.value - b.value)
        .map((transaction) => transaction.description))]
        .slice(0, 3);
      const percent = Math.round(reductionRates[item.category] * 100);
      const formattedSavings = potentialMonthlySavings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      let message = `Reduzir ${percent}% dos gastos de ${item.category.toLowerCase()} pode liberar aproximadamente ${formattedSavings} por mês.`;
      if (item.category === "Assinaturas" && examples.length) {
        message = `Você tem gastos com assinaturas como ${examples.join(", ")}. Revisar ou cancelar serviços pouco usados pode economizar aproximadamente ${formattedSavings} por mês.`;
      } else if (item.category === "Alimentação") {
        message = `Alimentação fora de casa representa ${item.share}% das despesas. Reduzir esse grupo em ${percent}% pode economizar aproximadamente ${formattedSavings} por mês.`;
      }
      return {
        category: item.category,
        title: `Oportunidade em ${item.category}`,
        message,
        examples,
        potentialMonthlySavings,
      };
    })
    .sort((a, b) => b.potentialMonthlySavings - a.potentialMonthlySavings);
  if (recommendations.length === 0 && categories[0]) {
    const topCategory = categories[0];
    const monthlyCategory = topCategory.total / months;
    const potentialMonthlySavings = monthlyCategory * 0.1;
    const examples = largestExpenses
      .filter((transaction) => transaction.category === topCategory.category)
      .map((transaction) => transaction.description)
      .slice(0, 3);
    recommendations = [{
      category: topCategory.category,
      title: `Revise ${topCategory.category}`,
      message: `Seu maior gasto está em ${topCategory.category}, com ${topCategory.share}% das despesas. Reduzir 10% desse grupo liberaria cerca de ${potentialMonthlySavings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por mês.`,
      examples,
      potentialMonthlySavings,
    }];
  }
  const potentialMonthlySavings = recommendations.reduce((sum, item) => sum + item.potentialMonthlySavings, 0);
  let budgetAlerts = [];
  const allMonthSet = new Set(transactions.map((item) => String(item.date).slice(0, 7)).filter(Boolean));
  const anomalies = detectAnomalies(transactions, categories, [], allMonthSet);
  const monthlyComparison = buildMonthlyComparison(transactions, selectedMonth);
  const insights = [];
  if (analysisTransactions.length === 0) {
    insights.push("Cadastre transações ou importe um extrato para receber uma análise personalizada.");
  } else {
    if (totalIncome === 0 && totalExpenses > 0) insights.push("O arquivo parece conter apenas despesas, como uma fatura de cartão. Cadastre a renda mensal para comparar os gastos com sua capacidade real.");
    if (totalIncome > 0 && balance < 0) insights.push("Suas despesas estão maiores que suas receitas no período. Priorize cortar gastos variáveis e renegociar compromissos.");
    if (balance >= 0 && totalIncome > 0) insights.push("Você fechou o período no positivo. Separe uma parte do saldo para reserva de emergência antes de aumentar gastos.");
    if (categories[0]) insights.push(`A maior concentração de despesas está em ${categories[0].category}, com ${categories[0].share}% dos gastos. Revise esse grupo primeiro.`);
    if (totalIncome > 0 && totalExpenses / totalIncome > 0.85) insights.push("Mais de 85% da renda foi consumida por despesas. Uma meta saudável é reservar ao menos 10% a 20% da renda.");
    if (analysisTransactions.some((item) => /tarifa|juros|multa|rotativo/i.test(item.description))) insights.push("Há possíveis tarifas, juros ou multas no extrato. Verifique se podem ser evitados ou renegociados.");
    if (pendingCount > 0) insights.push(`${pendingCount} transação(ões) ainda precisam de categoria. Corrija apenas essas pendências para deixar a análise mais precisa.`);
  }
  if (monthlyComparison?.summary) insights.unshift(monthlyComparison.summary);
  const goalPlan = buildGoalPlan(goal, monthlyBalance, potentialMonthlySavings);
  const categoryBudgetSuggestions = buildCategoryBudgetSuggestions(categories, totalIncome, months, goalPlan);
  budgetAlerts = categoryBudgetSuggestions
    .filter((item) => item.status === "reduzir" && item.difference > 0)
    .map((item) => ({
      category: item.category,
      limit: item.suggestedMonthly,
      spent: item.currentMonthly,
      exceededBy: item.difference,
    }))
    .sort((a, b) => b.exceededBy - a.exceededBy);
  if (budgetAlerts.length) insights.push(`Priorize ajustes em ${budgetAlerts.map((item) => item.category).join(", ")} para liberar espaço no orçamento.`);
  if (goalPlan) {
    const objectiveLabels = {
      reserva: "montar uma reserva de emergência",
      dividas: "quitar dívidas",
      viagem: "fazer uma viagem",
      compra: "realizar uma compra",
      investimento: "começar a investir",
      outro: "atingir seu objetivo",
    };
    if (goalPlan.feasible) {
      insights.unshift(`Para ${goalPlan.goal_name || objectiveLabels[goalPlan.objective] || objectiveLabels.outro}, reserve cerca de ${money(goalPlan.monthlyTarget)} por mês. Seu saldo médio atual comporta essa meta.`);
    } else {
      insights.unshift(`Para cumprir a meta no prazo, faltam cerca de ${money(goalPlan.requiredAdjustment)} por mês. Ajuste o prazo ou reduza gastos nas maiores categorias.`);
    }
    if (goalPlan.requiredAdjustment > 0 && potentialMonthlySavings > 0) {
      const coverage = Math.min(Math.round((potentialMonthlySavings / goalPlan.requiredAdjustment) * 100), 100);
      insights.unshift(`As economias sugeridas somam cerca de ${money(potentialMonthlySavings)} por mês e podem cobrir ${coverage}% do ajuste necessário para sua meta.`);
    }
  }
  const educationInsight = categories[0]
    ? `Nesta semana, acompanhe ${categories[0].category} antes de gastar: quando a maior categoria é medida no momento da decisão, o corte deixa de depender de memória no fim do mês.`
    : "Nesta semana, registre cada gasto no dia em que ele acontecer. Sem registro confiável, qualquer plano vira estimativa.";
  const aiBlocks = {
    diagnosis: [
      monthlyComparison?.summary,
      balance >= 0 ? `Seu saldo do período foi positivo em ${money(balance)}.` : `Seu saldo do período ficou negativo em ${money(Math.abs(balance))}.`,
      categories[0] ? `Sua maior categoria de gasto foi ${categories[0].category}, representando ${categories[0].share}% das despesas.` : "Ainda não há gastos suficientes para identificar padrões.",
    ].filter(Boolean),
    mainExpenses: largestExpenses.map((item) => `${item.description}: ${money(item.value)} em ${item.category}.`),
    alerts: [
      ...budgetAlerts.map((item) => `Ajuste recomendado: reduza ${item.category} em cerca de ${money(item.exceededBy)} por mês para voltar ao patamar planejado.`),
      ...anomalies.map((item) => item.message),
    ].slice(0, 6),
    savingsOpportunities: recommendations.map((item) => item.message),
    educationInsight,
    goalPlan: goalPlan
      ? [
          `Para ${goalPlan.goal_name}, meta de ${money(goalPlan.target_value)}, você já guardou ${money(goalPlan.saved_amount)} e ainda faltam ${money(goalPlan.remainingAmount)}.`,
          `No modo ${goalPlan.modeLabel}, o valor sugerido é ${money(goalPlan.modeMonthlyTarget)} por mês; para cumprir o prazo, guarde pelo menos ${money(goalPlan.monthlyTarget)} por mês.`,
          `Previsão de conclusão: ${goalPlan.forecastConclusion}. Status: ${goalPlan.status}.`,
        ]
      : ["Cadastre uma meta para transformar a análise em plano mensal."],
    nextActions: [
      goalPlan ? `Separe ${money(goalPlan.monthlyTarget)} para a meta assim que a renda entrar.` : "Cadastre uma meta com valor, prazo e valor já guardado.",
      recommendations[0] ? recommendations[0].message : "Cadastre mais gastos para encontrar oportunidades de economia.",
      categoryBudgetSuggestions[0] ? `Use o valor recomendado para ${categoryBudgetSuggestions[0].category}: ${money(categoryBudgetSuggestions[0].suggestedMonthly)} por mês.` : "Acompanhe suas categorias semanalmente.",
    ],
  };
  const financialScore = calculateFinancialHealthScore({
    totalIncome,
    totalExpenses,
    balance,
    categories,
    goal: goalPlan,
    pendingCount,
    transactionCount: analysisTransactions.length,
    recurringMonthlyTotal,
  });
  return {
    selectedMonth,
    previousMonth,
    totalIncome,
    totalExpenses,
    balance,
    monthlyIncome,
    monthlyExpenses,
    monthlyBalance,
    monthlyEvolution,
    monthlyComparison,
    months,
    categories,
    categoryRanking,
    largestExpenses,
    recurring: recurringTransactions.length ? recurringTransactions : recurring,
    recurringMonthlyTotal,
    recommendations: recommendations.slice(0, 5),
    potentialMonthlySavings,
    pendingCount,
    categoryBudgets,
    categoryBudgetSuggestions,
    classificationSummary,
    budgetAlerts,
    anomalies,
    financialScore,
    aiBlocks,
    goal: goalPlan,
    insights: insights.slice(0, 7),
  };
}

async function getPersonalizedAIPlan(userId, transactions, goal, localAnalysis) {
  if (!isOpenAIConfigured() || (localAnalysis.totalIncome === 0 && localAnalysis.totalExpenses === 0)) {
    return { plan: null, source: "local", model: null, cached: false, warning: null };
  }
  const context = {
    goal: localAnalysis.goal || goal,
    summary: {
      monthsAnalyzed: localAnalysis.months,
      totalIncome: localAnalysis.totalIncome,
      totalExpenses: localAnalysis.totalExpenses,
      balance: localAnalysis.balance,
      monthlyIncome: localAnalysis.monthlyIncome,
      monthlyExpenses: localAnalysis.monthlyExpenses,
      monthlyBalance: localAnalysis.monthlyBalance,
      potentialMonthlySavings: localAnalysis.potentialMonthlySavings,
      pendingTransactions: localAnalysis.pendingCount,
      recurringMonthlyTotal: localAnalysis.recurringMonthlyTotal || 0,
    },
    financialScore: localAnalysis.financialScore,
    recurringTransactions: (localAnalysis.recurring || []).slice(0, 8),
    categoryRanking: localAnalysis.categoryRanking.slice(0, 8),
    categoryBudgetSuggestions: (localAnalysis.categoryBudgetSuggestions || []).slice(0, 8),
    monthlyEvolution: localAnalysis.monthlyEvolution,
    calculatedOpportunities: localAnalysis.recommendations.map((item) => ({
      category: item.category,
      title: item.title,
      message: item.message,
      potentialMonthlySavings: item.potentialMonthlySavings,
    })),
    categoryBudgets: localAnalysis.categoryBudgets.map((item) => ({
      name: item.name,
      monthly_limit: item.monthly_limit,
      spent: item.spent,
      remaining: item.remaining,
      percentage: item.percentage,
      status: item.status,
    })),
    budgetAlerts: localAnalysis.budgetAlerts,
    anomalies: localAnalysis.anomalies.map((item) => ({
      type: item.type,
      severity: item.severity,
      title: item.title,
    })),
    period: {
      selectedMonth: localAnalysis.selectedMonth,
      previousMonth: localAnalysis.previousMonth,
      monthlyComparison: localAnalysis.monthlyComparison,
    },
    classificationSummary: localAnalysis.classificationSummary,
    localBlocks: {
      diagnosis: localAnalysis.aiBlocks.diagnosis,
      mainExpenses: localAnalysis.categoryRanking.slice(0, 5).map((item) => `${item.category}: ${money(item.total)} (${item.share}% das despesas).`),
      savingsOpportunities: localAnalysis.aiBlocks.savingsOpportunities,
      goalPlan: localAnalysis.aiBlocks.goalPlan,
      nextActions: localAnalysis.aiBlocks.nextActions,
      educationInsight: localAnalysis.aiBlocks.educationInsight,
    },
  };
  const fingerprint = generateFinancialAnalysisHash(userId, transactions, localAnalysis.categoryBudgets, localAnalysis.goals || goal, localAnalysis.selectedMonth);
  const cached = db.prepare("SELECT response_json FROM ai_analysis_cache WHERE user_id = ? AND fingerprint = ?").get(userId, fingerprint);
  if (cached) {
    return { plan: JSON.parse(cached.response_json), source: "openai", model: OPENAI_MODEL, cached: true, warning: null };
  }
  if (!consumeAIRequest(userId)) {
    return {
      plan: null,
      source: "local",
      model: OPENAI_MODEL,
      cached: false,
      warning: `Limite diário de ${OPENAI_DAILY_LIMIT} análises OpenAI atingido. O plano local foi usado.`,
    };
  }
  try {
    const plan = await generateFinancialPlan(context);
    db.prepare(`
      INSERT INTO ai_analysis_cache (user_id, fingerprint, model, response_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, fingerprint) DO UPDATE SET
        model = excluded.model,
        response_json = excluded.response_json,
        created_at = CURRENT_TIMESTAMP
    `).run(userId, fingerprint, OPENAI_MODEL, JSON.stringify(plan));
    return { plan, source: "openai", model: OPENAI_MODEL, cached: false, warning: null };
  } catch (error) {
    console.error("OpenAI plan fallback:", error.status || error.code || error.message);
    return {
      plan: null,
      source: "local",
      model: OPENAI_MODEL,
      cached: false,
      warning: "A OpenAI não respondeu. O plano local continua disponível.",
    };
  }
}

function generateFinancialAnalysisHash(userId, transactions, categoryBudgets, goal, analysisMonth) {
  const currentMonth = normalizeMonthParam(analysisMonth) || new Date().toISOString().slice(0, 7);
  const monthTransactions = filterTransactionsForMonth(transactions, currentMonth);
  const previousMonth = shiftMonthValue(currentMonth, -1);
  const previousMonthTransactions = filterTransactionsForMonth(transactions, previousMonth);
  const income = monthTransactions.filter((item) => item.value > 0).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const expenses = monthTransactions.filter((item) => item.value < 0).reduce((sum, item) => sum + Math.abs(Number(item.value || 0)), 0);
  const previousIncome = previousMonthTransactions.filter((item) => item.value > 0).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const previousExpenses = previousMonthTransactions.filter((item) => item.value < 0).reduce((sum, item) => sum + Math.abs(Number(item.value || 0)), 0);
  const lastTransactionDate = monthTransactions.map((item) => item.date).filter(Boolean).sort().at(-1) || null;
  const lastAlteration = [...monthTransactions, ...previousMonthTransactions].map((item) => item.updated_at || item.created_at || item.date).filter(Boolean).sort().at(-1) || null;
  const topCategories = {};
  for (const item of monthTransactions) {
    if (item.value >= 0) continue;
    topCategories[item.category] = (topCategories[item.category] || 0) + Math.abs(Number(item.value || 0));
  }
  const categorySnapshot = Object.entries(topCategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, total]) => [category, Number(total.toFixed(2))]);
  const budgetSnapshot = (categoryBudgets || [])
    .filter((item) => item.name !== "Receita")
    .map((item) => ({
      name: item.name,
      limit: Number(item.monthly_limit || 0),
      spent: Number(item.spent || 0),
      updated: item.updated_at || null,
    }));

  const goalSnapshot = (Array.isArray(goal) ? goal : goal ? [goal] : []).map((item) => ({
    id: item.id || null,
    name: item.goal_name,
    target: Number(item.target_value || 0),
    saved: Number(item.saved_amount || 0),
    monthly: Number(item.planned_monthly_savings || 0),
    months: Number(item.target_months || 0),
    intensity: item.intensity,
    updated: item.updated_at || null,
  }));
  return crypto.createHash("sha256").update(JSON.stringify({
    purpose: "monthly-ai-analysis-cache",
    model: OPENAI_MODEL,
    userId,
    month: currentMonth,
    previousMonth,
    transactionCount: monthTransactions.length,
    previousTransactionCount: previousMonthTransactions.length,
    income: Number(income.toFixed(2)),
    expenses: Number(expenses.toFixed(2)),
    previousIncome: Number(previousIncome.toFixed(2)),
    previousExpenses: Number(previousExpenses.toFixed(2)),
    lastTransactionDate,
    lastAlteration,
    categorySnapshot,
    budgetSnapshot,
    goals: goalSnapshot,
  })).digest("hex");
}

function validateTransaction(input) {
  const description = String(input.description || "").trim();
  const value = Number(input.value);
  const date = String(input.date || "").trim();
  const category = String(input.category || "").trim();
  if (!description || description.length > 120) return "Descrição obrigatória com até 120 caracteres.";
  if (!Number.isFinite(value) || value === 0) return "Valor deve ser numérico e diferente de zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Data deve estar no formato AAAA-MM-DD.";
  if (!category || category.length > 40) return "Categoria obrigatória com até 40 caracteres.";
  return null;
}

function normalizeManualTransaction(input) {
  const selectedType = String(input.type || "").trim().toLowerCase();
  const type = ["entrada", "saida"].includes(selectedType)
    ? selectedType
    : Number(input.value) < 0 ? "saida" : "entrada";
  const absoluteValue = Math.abs(Number(input.value));
  return {
    ...input,
    value: type === "saida" ? -absoluteValue : absoluteValue,
    type,
  };
}

function validateCategoryInput(input) {
  const name = String(input.name || "").trim();
  const color = String(input.color || "").trim();
  if (name.length < 2 || name.length > 40) return "Nome da categoria deve ter entre 2 e 40 caracteres.";
  if (!/^#[0-9a-f]{6}$/i.test(color)) return "Selecione uma cor válida.";
  return null;
}

function hasConsent(userId) {
  return Boolean(db.prepare(`
    SELECT uc.id
    FROM user_consents uc
    JOIN consent_terms ct ON ct.id = uc.term_id
    WHERE uc.user_id = ? AND ct.version = ?
      AND uc.revoked_at IS NULL
    ORDER BY uc.accepted_at DESC
    LIMIT 1
  `).get(userId, "1.0"));
}

function revokeConsentAndClearData(userId, req) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM transactions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_goals WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM goal_contributions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM financial_goals WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM category_rules WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM ai_daily_usage WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM monthly_closings WHERE user_id = ?").run(userId);
    db.prepare(`
      UPDATE user_consents
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND revoked_at IS NULL
    `).run(userId);
    audit(userId, "CONSENT_REVOKED", {
      message: "Consentimento revogado e dados financeiros removidos. A conta foi mantida.",
    }, req);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Acesso negado.");
  if (!fs.existsSync(filePath)) return send(res, 404, "Arquivo não encontrado.");
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "POST" && url.pathname === "/api/register") {
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const confirmPassword = String(body.confirmPassword || "");
      if (name.length < 3 || name.length > 80) return send(res, 400, { error: "Informe um nome com 3 a 80 caracteres." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: "Informe um e-mail válido." });
      const existingUser = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email);
      if (existingUser) return send(res, 409, { error: "Este e-mail já está cadastrado." });
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return send(res, 400, { error: "A senha precisa ter no mínimo 8 caracteres, com letras e números." });
      }
      if (confirmPassword && password !== confirmPassword) return send(res, 400, { error: "A confirmação de senha não confere." });
      if (!body.consentAccepted) return send(res, 400, { error: "O termo de consentimento precisa ser aceito antes do cadastro." });

      const passwordHash = await bcrypt.hash(password, 12);
      const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name, email, passwordHash);
      const latestTerm = db.prepare("SELECT id FROM consent_terms WHERE version = ?").get("1.0");
      db.prepare("INSERT INTO user_consents (user_id, term_id) VALUES (?, ?)").run(result.lastInsertRowid, latestTerm.id);
      ensureDefaultCategories(result.lastInsertRowid);
      audit(result.lastInsertRowid, "USER_REGISTERED", { termVersion: "1.0" }, req);
      audit(result.lastInsertRowid, "CONSENT_ACCEPTED", { termVersion: "1.0" }, req);
      const token = createSession(result.lastInsertRowid);
      return send(res, 201, { ok: true }, { "Set-Cookie": cookieHeader(token, req) });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const user = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email);
      if (!user || !(await bcrypt.compare(String(body.password || ""), user.password_hash))) {
        return send(res, 401, { error: "E-mail ou senha inválidos. Confira os dados ou crie uma nova conta." });
      }
      ensureDefaultCategories(user.id);
      audit(user.id, "USER_LOGIN", null, req);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader(createSession(user.id), req) });
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      const token = parseCookies(req).session;
      if (token) sessions.delete(token);
      return send(res, 200, { ok: true }, { "Set-Cookie": "session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/" });
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const user = requireUser(req, res);
      if (!user) return;
      ensureDefaultCategories(user.id);
      return send(res, 200, { user, consentAccepted: hasConsent(user.id) });
    }

    if (req.method === "GET" && url.pathname === "/api/term") {
      const latest = db.prepare("SELECT * FROM consent_terms WHERE version = ?").get("1.0");
      return send(res, 200, latest);
    }

    if (req.method === "POST" && url.pathname === "/api/consent/accept") {
      const user = requireUser(req, res);
      if (!user) return;
      const latestTerm = db.prepare("SELECT id, version FROM consent_terms WHERE version = ?").get("1.0");
      db.prepare("INSERT INTO user_consents (user_id, term_id) VALUES (?, ?)").run(user.id, latestTerm.id);
      audit(user.id, "CONSENT_ACCEPTED", { termVersion: latestTerm.version, reaccepted: true }, req);
      return send(res, 200, { ok: true, consentAccepted: true });
    }

    if (req.method === "POST" && url.pathname === "/api/consent/revoke") {
      const user = requireUser(req, res);
      if (!user) return;
      revokeConsentAndClearData(user.id, req);
      return send(res, 200, { ok: true, consentAccepted: false });
    }

    if (url.pathname === "/api/categories") {
      const user = requireUser(req, res);
      if (!user) return;
      if (req.method === "GET") {
        const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : undefined;
        return send(res, 200, getCategoryBudgets(user.id, month));
      }
      if (req.method === "POST") {
        const body = await readJson(req);
        const validation = validateCategoryInput(body);
        if (validation) return send(res, 400, { error: validation });
        const result = db.prepare("INSERT INTO categories (user_id, name, monthly_limit, color) VALUES (?, ?, ?, ?)")
          .run(user.id, body.name.trim(), 0, body.color);
        audit(user.id, "CATEGORY_CREATED", { categoryId: result.lastInsertRowid, name: body.name.trim() }, req);
        return send(res, 201, { id: result.lastInsertRowid });
      }
    }

    const categoryMatch = url.pathname.match(/^\/api\/categories\/(\d+)$/);
    if (categoryMatch && ["PUT", "DELETE"].includes(req.method)) {
      const user = requireUser(req, res);
      if (!user) return;
      const category = db.prepare("SELECT * FROM categories WHERE id = ? AND user_id = ?").get(Number(categoryMatch[1]), user.id);
      if (!category) return send(res, 404, { error: "Categoria não encontrada." });
      if (req.method === "PUT") {
        const body = await readJson(req);
        const validation = validateCategoryInput(body);
        if (validation) return send(res, 400, { error: validation });
        db.exec("BEGIN");
        try {
          db.prepare("UPDATE categories SET name = ?, monthly_limit = ?, color = ? WHERE id = ? AND user_id = ?")
            .run(body.name.trim(), 0, body.color, category.id, user.id);
          if (category.name !== body.name.trim()) {
            db.prepare("UPDATE transactions SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category = ?")
              .run(body.name.trim(), user.id, category.name);
          }
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        audit(user.id, "CATEGORY_UPDATED", { categoryId: category.id, name: body.name.trim() }, req);
        return send(res, 200, { ok: true });
      }
      if (["Outros", "Receita", "Metas"].includes(category.name)) {
        return send(res, 400, { error: "Esta categoria é necessária para o funcionamento do sistema." });
      }
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE transactions SET category = 'Outros', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category = ?")
          .run(user.id, category.name);
        db.prepare("DELETE FROM categories WHERE id = ? AND user_id = ?").run(category.id, user.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      audit(user.id, "CATEGORY_DELETED", { categoryId: category.id, name: category.name }, req);
      return send(res, 200, { ok: true });
    }

    if (url.pathname.startsWith("/api/transactions")) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de cadastrar transações." });

      if (req.method === "GET" && url.pathname === "/api/transactions") {
        const rows = db.prepare("SELECT id, description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, external_id, created_at, updated_at FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC").all(user.id);
        return send(res, 200, rows);
      }

      if (req.method === "POST" && url.pathname === "/api/transactions") {
        const body = normalizeManualTransaction(await readJson(req));
        const validation = validateTransaction(body);
        if (validation) return send(res, 400, { error: validation });
        if (!categoryExists(user.id, body.category.trim())) return send(res, 400, { error: "Categoria não encontrada." });
        const meta = classificationMetadata(user.id, body.description.trim(), Number(body.value), body.category.trim());
        const result = db.prepare("INSERT INTO transactions (user_id, description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(user.id, body.description.trim(), Number(body.value), body.date, body.category.trim(), meta.type, meta.classification_confidence, meta.classification_source, cleanPaymentMethod(body.paymentMethod || body.payment_method), cleanTransactionStatus(body.status || body.transaction_status), "manual");
        learnCategoryRule(user.id, body.description.trim(), body.category.trim());
        audit(user.id, "TRANSACTION_CREATED", { transactionId: result.lastInsertRowid }, req);
        return send(res, 201, { id: result.lastInsertRowid });
      }

      const match = url.pathname.match(/^\/api\/transactions\/(\d+)$/);
      if (match && req.method === "PUT") {
        const body = normalizeManualTransaction(await readJson(req));
        const validation = validateTransaction(body);
        if (validation) return send(res, 400, { error: validation });
        if (!categoryExists(user.id, body.category.trim())) return send(res, 400, { error: "Categoria não encontrada." });
        const existing = db.prepare("SELECT description, category, source FROM transactions WHERE id = ? AND user_id = ?").get(Number(match[1]), user.id);
        if (!existing) return send(res, 404, { error: "Transação não encontrada." });
        const meta = classificationMetadata(user.id, body.description.trim(), Number(body.value), body.category.trim());
        const result = db.prepare(`
          UPDATE transactions
          SET description = ?, value = ?, date = ?, category = ?, type = ?, classification_confidence = ?, classification_source = ?, payment_method = ?, transaction_status = ?, source = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).run(body.description.trim(), Number(body.value), body.date, body.category.trim(), meta.type, meta.classification_confidence, meta.classification_source, cleanPaymentMethod(body.paymentMethod || body.payment_method), cleanTransactionStatus(body.status || body.transaction_status), existing.source || "manual", Number(match[1]), user.id);
        if (result.changes === 0) return send(res, 404, { error: "Transação não encontrada." });
        if (existing.category !== body.category.trim()) {
          learnCategoryRule(user.id, body.description.trim(), body.category.trim());
        }
        audit(user.id, "TRANSACTION_UPDATED", { transactionId: Number(match[1]) }, req);
        return send(res, 200, { ok: true });
      }

      if (match && req.method === "DELETE") {
        const result = db.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").run(Number(match[1]), user.id);
        if (result.changes === 0) return send(res, 404, { error: "Transação não encontrada." });
        audit(user.id, "TRANSACTION_DELETED", { transactionId: Number(match[1]) }, req);
        return send(res, 200, { ok: true });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/audit") {
      const user = requireUser(req, res);
      if (!user) return;
      const rows = db.prepare("SELECT action, details, ip, created_at FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(user.id);
      return send(res, 200, rows);
    }

    if (req.method === "GET" && url.pathname === "/api/goal") {
      const user = requireUser(req, res);
      if (!user) return;
      const goals = getUserGoals(user.id);
      const contributionSummary = getGoalContributionSummary(user.id);
      return send(res, 200, {
        goal: goals[0] || null,
        goals,
        contributions: getGoalContributions(user.id),
        contributionSummary,
        goalTimelines: buildGoalTimelines(goals, contributionSummary),
      });
    }

    if (req.method === "PUT" && url.pathname === "/api/goal") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de criar metas financeiras." });
      const body = await readJson(req);
      const goalId = Number(body.id || body.goalId || 0);
      const goalName = String(body.goalName || body.goal_name || "").trim();
      const objective = String(body.objective || "").trim();
      const targetValue = Number(body.targetValue);
      const savedAmount = Number(body.savedAmount || 0);
      const targetMonths = Number(body.targetMonths);
      const intensity = String(body.intensity || "").trim();
      if (goalName.length < 3 || goalName.length > 80) return send(res, 400, { error: "Informe um nome de meta com 3 a 80 caracteres." });
      if (!["reserva", "dividas", "viagem", "compra", "investimento", "outro"].includes(objective)) {
        return send(res, 400, { error: "Selecione um objetivo válido." });
      }
      if (!Number.isFinite(targetValue) || targetValue <= 0) return send(res, 400, { error: "Informe um valor de meta maior que zero." });
      if (!Number.isFinite(savedAmount) || savedAmount < 0) return send(res, 400, { error: "Informe quanto ja foi guardado com valor zero ou maior." });
      if (savedAmount > targetValue) return send(res, 400, { error: "O valor já guardado não pode ser maior que a meta." });
      if (!Number.isInteger(targetMonths) || targetMonths < 1 || targetMonths > 120) return send(res, 400, { error: "O prazo deve ter entre 1 e 120 meses." });
      if (!["leve", "equilibrado", "intenso"].includes(intensity)) return send(res, 400, { error: "Selecione um ritmo válido." });
      const modeMultipliers = { leve: 0.75, equilibrado: 1, intenso: 1.35 };
      const remainingForPlan = Math.max(targetValue - savedAmount, 0);
      const baseMonthlyPlan = remainingForPlan / targetMonths;
      const plannedMonthlySavings = remainingForPlan > 0 ? Number(Math.max(baseMonthlyPlan * (modeMultipliers[intensity] || 1), 1).toFixed(2)) : 0;
      let savedGoalId = goalId;
      if (goalId > 0) {
        const existing = db.prepare("SELECT id FROM financial_goals WHERE id = ? AND user_id = ?").get(goalId, user.id);
        if (!existing) return send(res, 404, { error: "Meta não encontrada." });
        db.prepare(`
          UPDATE financial_goals
          SET goal_name = ?, objective = ?, target_value = ?, saved_amount = ?, planned_monthly_savings = ?, target_months = ?, intensity = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).run(goalName, objective, targetValue, savedAmount, plannedMonthlySavings, targetMonths, intensity, goalId, user.id);
      } else {
        const result = db.prepare(`
          INSERT INTO financial_goals (user_id, goal_name, objective, target_value, initial_saved_amount, saved_amount, planned_monthly_savings, target_months, intensity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, goalName, objective, targetValue, savedAmount, savedAmount, plannedMonthlySavings, targetMonths, intensity);
        savedGoalId = result.lastInsertRowid;
      }
      audit(user.id, "FINANCIAL_GOAL_UPDATED", { goalId: savedGoalId, goalName, objective, targetValue, savedAmount, plannedMonthlySavings, targetMonths, intensity }, req);
      return send(res, 200, { ok: true, id: savedGoalId });
    }

    const goalMatch = url.pathname.match(/^\/api\/goal\/(\d+)$/);
    if (goalMatch && req.method === "DELETE") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de excluir metas financeiras." });
      const goalId = Number(goalMatch[1]);
      const goal = db.prepare("SELECT id, goal_name FROM financial_goals WHERE id = ? AND user_id = ?").get(goalId, user.id);
      if (!goal) return send(res, 404, { error: "Meta não encontrada." });
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM goal_contributions WHERE goal_id = ? AND user_id = ?").run(goal.id, user.id);
        db.prepare("DELETE FROM financial_goals WHERE id = ? AND user_id = ?").run(goal.id, user.id);
        db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
        audit(user.id, "FINANCIAL_GOAL_DELETED", { goalId: goal.id, goalName: goal.goal_name }, req);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/goal/contribution") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de atualizar metas financeiras." });
      ensureDefaultCategories(user.id);
      const body = await readJson(req);
      const goalId = Number(body.goalId || body.goal_id || 0);
      const goal = goalId > 0
        ? db.prepare("SELECT id, goal_name, target_value, saved_amount FROM financial_goals WHERE id = ? AND user_id = ?").get(goalId, user.id)
        : getPrimaryGoal(user.id);
      if (!goal) return send(res, 400, { error: "Crie e selecione uma meta antes de registrar quanto guardou." });
      const amount = Math.abs(Number(body.amount));
      const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
      const note = String(body.note || "").trim().slice(0, 80);
      if (!Number.isFinite(amount) || amount <= 0) return send(res, 400, { error: "Informe um valor guardado maior que zero." });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(res, 400, { error: "Data deve estar no formato AAAA-MM-DD." });
      const newSavedAmount = Math.min(Number(goal.target_value || 0), Number(goal.saved_amount || 0) + amount);
      const description = note || `Guardado para meta - ${goal.goal_name}`;
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE financial_goals SET saved_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
          .run(newSavedAmount, goal.id, user.id);
        const result = db.prepare(`
          INSERT INTO transactions (user_id, description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, description, -amount, date, "Metas", "saida", "manual", "manual", "Meta financeira", "Concluida", "meta");
        const contribution = db.prepare(`
          INSERT INTO goal_contributions (user_id, goal_id, transaction_id, amount, contribution_date, note)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(user.id, goal.id, result.lastInsertRowid, amount, date, note || null);
        audit(user.id, "GOAL_CONTRIBUTION_CREATED", { goalId: goal.id, goalName: goal.goal_name, contributionId: contribution.lastInsertRowid, amount, savedAmount: newSavedAmount, transactionId: result.lastInsertRowid }, req);
        db.exec("COMMIT");
        return send(res, 201, { ok: true, goalId: goal.id, contributionId: contribution.lastInsertRowid, savedAmount: newSavedAmount, transactionId: result.lastInsertRowid });
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }

    const contributionMatch = url.pathname.match(/^\/api\/goal\/contributions\/(\d+)$/);
    if (contributionMatch && req.method === "DELETE") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de alterar metas financeiras." });
      const contributionId = Number(contributionMatch[1]);
      const contribution = db.prepare(`
        SELECT gc.id, gc.goal_id, gc.transaction_id, gc.amount, fg.goal_name, fg.saved_amount
        FROM goal_contributions gc
        JOIN financial_goals fg ON fg.id = gc.goal_id AND fg.user_id = gc.user_id
        WHERE gc.id = ? AND gc.user_id = ?
      `).get(contributionId, user.id);
      if (!contribution) return send(res, 404, { error: "Aporte não encontrado." });
      const newSavedAmount = Math.max(Number(contribution.saved_amount || 0) - Number(contribution.amount || 0), 0);
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE financial_goals SET saved_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
          .run(newSavedAmount, contribution.goal_id, user.id);
        db.prepare("DELETE FROM goal_contributions WHERE id = ? AND user_id = ?").run(contribution.id, user.id);
        if (contribution.transaction_id) {
          db.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ? AND source = 'meta'")
            .run(contribution.transaction_id, user.id);
        }
        db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
        audit(user.id, "GOAL_CONTRIBUTION_DELETED", {
          goalId: contribution.goal_id,
          goalName: contribution.goal_name,
          contributionId: contribution.id,
          amount: contribution.amount,
          savedAmount: newSavedAmount,
        }, req);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return send(res, 200, { ok: true, goalId: contribution.goal_id, savedAmount: newSavedAmount });
    }

    if (req.method === "GET" && url.pathname === "/api/ai/analysis") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo para liberar a análise financeira." });
      const selectedMonth = normalizeMonthParam(url.searchParams.get("month")) || new Date().toISOString().slice(0, 7);
      const rows = db.prepare("SELECT description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, created_at, updated_at FROM transactions WHERE user_id = ? ORDER BY date DESC").all(user.id);
      const goals = getUserGoals(user.id);
      const goal = goals[0] || null;
      const contributionSummary = getGoalContributionSummary(user.id);
      const goalTimelines = buildGoalTimelines(goals, contributionSummary);
      const selectedRows = filterTransactionsForMonth(rows, selectedMonth);
      audit(user.id, "AI_ANALYSIS_REQUESTED", { month: selectedMonth, transactions: selectedRows.length }, req);
      const budgets = getCategoryBudgets(user.id, selectedMonth);
      const localAnalysis = buildFinancialAnalysis(rows, goal, budgets, { month: selectedMonth });
      localAnalysis.goals = goals.map((item) => ({ ...item, timeline: goalTimelines[item.id] || [] }));
      if (localAnalysis.goal) localAnalysis.goal.timeline = goalTimelines[localAnalysis.goal.id] || [];
      localAnalysis.goalTimelines = goalTimelines;
      const useOpenAI = url.searchParams.get("useAI") === "1";
      const aiResult = useOpenAI
        ? await getPersonalizedAIPlan(user.id, rows, goal, localAnalysis)
        : { plan: null, source: "local", model: null, cached: false, warning: null };
      return send(res, 200, {
        ...localAnalysis,
        ai: aiResult.plan,
        aiStatus: {
          source: aiResult.source,
          model: aiResult.model,
          cached: aiResult.cached,
          warning: aiResult.warning,
        },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/monthly-closings") {
      const user = requireUser(req, res);
      if (!user) return;
      const rows = db.prepare("SELECT id, month, snapshot_json, closed_at FROM monthly_closings WHERE user_id = ? ORDER BY month DESC LIMIT 18").all(user.id);
      return send(res, 200, rows.map((row) => {
        let snapshot = {};
        try {
          snapshot = JSON.parse(row.snapshot_json || "{}");
        } catch {
          snapshot = {};
        }
        return { id: row.id, month: row.month, closed_at: row.closed_at, snapshot };
      }));
    }

    if (req.method === "POST" && url.pathname === "/api/monthly-closings") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de fechar o mês." });
      const body = await readJson(req);
      const month = normalizeMonthParam(body.month) || new Date().toISOString().slice(0, 7);
      const rows = db.prepare("SELECT description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, created_at, updated_at FROM transactions WHERE user_id = ? ORDER BY date DESC").all(user.id);
      const goals = getUserGoals(user.id);
      const goal = goals[0] || null;
      const budgets = getCategoryBudgets(user.id, month);
      const analysis = buildFinancialAnalysis(rows, goal, budgets, { month });
      analysis.goals = goals;
      const snapshot = monthlyClosingSnapshot(analysis);
      db.prepare(`
        INSERT INTO monthly_closings (user_id, month, snapshot_json)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, month) DO UPDATE SET snapshot_json = excluded.snapshot_json, closed_at = CURRENT_TIMESTAMP
      `).run(user.id, month, JSON.stringify(snapshot));
      audit(user.id, "MONTHLY_CLOSING_CREATED", { month, balance: analysis.balance, score: analysis.financialScore?.score }, req);
      return send(res, 200, { month, nextMonth: shiftMonthValue(month, 1), snapshot });
    }

    if (req.method === "POST" && url.pathname === "/api/import/pdf") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de importar extratos." });
      const pdfBuffer = await readPdfUpload(req);
      const parser = new PDFParse({ data: pdfBuffer });
      const result = await parser.getText();
      await parser.destroy();
      const learnedRules = loadCategoryRules(user.id);
      const candidates = parseTransactionsFromText(result.text, learnedRules);
      audit(user.id, "PDF_STATEMENT_ANALYZED", { candidates: candidates.length }, req);
      const textLength = String(result.text || "").replace(/\s/g, "").length;
      return send(res, 200, {
        candidates,
        textLength,
        extractionStatus: textLength < 50 ? "imagem" : candidates.length === 0 ? "formato_nao_reconhecido" : "ok",
        aiStatus: {
          source: "local",
          model: null,
          cached: false,
          warning: null,
        },
        notice: textLength < 50
          ? "Este PDF parece ser uma imagem digitalizada. Ele precisa de OCR para reconhecer os gastos."
          : candidates.length === 0
            ? "O PDF tem texto, mas o formato das linhas não foi reconhecido. Revise se datas e valores aparecem no documento."
            : "O PDF foi processado em memória e descartado. Revise e confirme as transações sugeridas.",
      });
    }

    if (req.method === "POST" && url.pathname === "/api/import/file") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de importar extratos." });
      const useAI = url.searchParams.get("ai") === "1";
      const uploaded = await readUploadedStatement(req);
      const extension = path.extname(uploaded.filename).toLowerCase();
      if (extension === ".pdf" || /application\/pdf/i.test(uploaded.contentType)) {
        const parser = new PDFParse({ data: uploaded.buffer });
        const result = await parser.getText();
        await parser.destroy();
        const learnedRules = loadCategoryRules(user.id);
        const candidates = parseTransactionsFromText(result.text, learnedRules);
        const aiResult = useAI
          ? await enrichCandidatesWithOpenAI(user.id, candidates, learnedRules)
          : { candidates, source: "local", model: null, cached: false, warning: null };
        const preview = finishImportPreview(user.id, aiResult.candidates, [], aiResult);
        audit(user.id, "PDF_STATEMENT_ANALYZED", { candidates: candidates.length }, req);
        return send(res, 200, {
          kind: "pdf",
          filename: uploaded.filename,
          columns: [],
          rows: [],
          mapping: {},
          ...preview,
          notice: "PDF processado em memoria e descartado. A IA/regras locais revisaram as categorias; confirme antes de importar.",
        });
      }
      let parsed;
      if (extension === ".csv") parsed = importTransactionsFromCSV(uploaded.buffer);
      else if ([".xlsx", ".xls"].includes(extension)) parsed = importTransactionsFromExcel(uploaded.buffer);
      else return send(res, 400, { error: "Formato não suportado. Envie CSV, XLSX, XLS ou PDF." });
      const mapping = suggestImportMapping(parsed.columns, parsed.rows);
      const preset = detectImportPreset(uploaded.filename, parsed.columns, parsed.layout);
      const hasValueMapping = mapping.value || mapping.debitValue || mapping.creditValue;
      const preview = mapping.date && mapping.description && hasValueMapping
        ? await buildSmartImportPreview(user.id, parsed.rows, mapping, { useAI })
        : { candidates: [], ai: { source: "local", model: null, cached: false, warning: null }, summary: { rows: parsed.rows.length, found: 0, importable: 0, income: 0, expenses: 0, errors: 0, duplicates: 0 }, errors: [] };
      audit(user.id, "STATEMENT_FILE_ANALYZED", { filename: uploaded.filename, rows: parsed.rows.length }, req);
      return send(res, 200, {
        kind: extension === ".csv" ? "csv" : "excel",
        layout: parsed.layout || "table",
        filename: uploaded.filename,
        preset,
        columns: parsed.columns,
        rows: parsed.rows,
        mapping,
        ...preview,
        notice: preview.candidates.length
          ? "Arquivo lido. A IA/regras locais sugeriram tipo e categoria; revise a previa antes de confirmar."
          : "Arquivo lido, mas falta confirmar o mapeamento das colunas para gerar os lançamentos.",
      });
    }

    if (req.method === "POST" && url.pathname === "/api/import/preview") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de importar extratos." });
      const body = await readJson(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const mapping = body.mapping || {};
      if (!mapping.date || !mapping.description || !(mapping.value || mapping.debitValue || mapping.creditValue)) {
        return send(res, 400, { error: "Mapeie pelo menos data, descrição e valor. Se a planilha separar Débito e Crédito, mapeie uma dessas colunas de valor." });
      }
      const preview = await buildSmartImportPreview(user.id, rows, mapping, { useAI: url.searchParams.get("ai") === "1" });
      return send(res, 200, preview);
    }

    if (req.method === "POST" && url.pathname === "/api/import/transactions") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de importar extratos." });
      const body = await readJson(req);
      const items = Array.isArray(body.transactions) ? body.transactions.slice(0, 500) : [];
      if (items.length === 0) return send(res, 400, { error: "Nenhuma transação para importar." });
      const insert = db.prepare("INSERT INTO transactions (user_id, description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const deduped = detectDuplicateTransactions(user.id, items).filter((item) => !item.duplicate);
      let imported = 0;
      for (const item of deduped) {
        const validation = validateTransaction(item);
        if (validation) continue;
        if (!categoryExists(user.id, item.category.trim())) continue;
        const meta = importedClassificationMetadata(item);
        insert.run(user.id, item.description.trim(), Number(item.value), item.date, item.category.trim(), meta.type, meta.classification_confidence, meta.classification_source, cleanPaymentMethod(item.paymentMethod || item.payment_method || "Arquivo importado"), cleanTransactionStatus(item.status || item.transaction_status), body.source || "importado");
        if (item.userCorrected) learnCategoryRule(user.id, item.description.trim(), item.category.trim());
        imported += 1;
      }
      audit(user.id, "TRANSACTIONS_IMPORTED", { imported, skippedDuplicates: items.length - deduped.length, source: body.source || "importado" }, req);
      return send(res, 201, { imported, skippedDuplicates: items.length - deduped.length });
    }

    if (req.method === "GET" && url.pathname === "/api/category-rules") {
      const user = requireUser(req, res);
      if (!user) return;
      return send(res, 200, loadCategoryRules(user.id));
    }

    if (req.method === "GET" && url.pathname === "/api/category-suggest") {
      const user = requireUser(req, res);
      if (!user) return;
      const description = String(url.searchParams.get("description") || "").trim();
      if (description.length < 2) return send(res, 200, { category: "", confidence: "baixa", merchant: "" });
      return send(res, 200, categorize(description, loadCategoryRules(user.id)));
    }

    if (req.method === "GET" && url.pathname === "/api/ai/status") {
      const user = requireUser(req, res);
      if (!user) return;
      const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
      const hasModel = Boolean(OPENAI_MODEL);
      return send(res, 200, {
        configured: isOpenAIConfigured(),
        hasApiKey,
        hasModel,
        provider: isOpenAIConfigured() ? "OpenAI" : "Análise local",
        model: isOpenAIConfigured() ? OPENAI_MODEL : null,
        message: isOpenAIConfigured()
          ? `OpenAI conectada com o modelo ${OPENAI_MODEL}.`
          : hasApiKey && !hasModel
            ? "Chave da OpenAI encontrada, mas OPENAI_MODEL não está configurado. A análise atual é local."
            : "Chave da OpenAI não configurada. A análise atual é local.",
        dailyLimit: OPENAI_DAILY_LIMIT,
        usedToday: currentAIUsage(user.id),
        remainingToday: Math.max(OPENAI_DAILY_LIMIT - currentAIUsage(user.id), 0),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/export") {
      const user = requireUser(req, res);
      if (!user) return;
      audit(user.id, "DATA_EXPORTED", null, req);
      const transactions = db.prepare("SELECT description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, external_id, created_at, updated_at FROM transactions WHERE user_id = ? ORDER BY date DESC").all(user.id);
      const consents = db.prepare(`
        SELECT ct.version, ct.collected_data, ct.purpose, ct.storage, ct.retention, uc.accepted_at, uc.revoked_at
        FROM user_consents uc JOIN consent_terms ct ON ct.id = uc.term_id
        WHERE uc.user_id = ?
      `).all(user.id);
      const goals = getUserGoals(user.id);
      const goal = goals[0] || null;
      const goalContributions = getGoalContributions(user.id, 1000);
      const categoryRules = loadCategoryRules(user.id);
      const monthlyClosings = db.prepare("SELECT month, snapshot_json, closed_at FROM monthly_closings WHERE user_id = ? ORDER BY month DESC").all(user.id)
        .map((row) => ({ ...row, snapshot: JSON.parse(row.snapshot_json || "{}"), snapshot_json: undefined }));
      return send(res, 200, { user, consents, goal, goals, goalContributions, monthlyClosings, categoryRules, transactions }, {
        "Content-Disposition": "attachment; filename=\"meus-dados-financeiros.json\"",
      });
    }

    if (req.method === "DELETE" && url.pathname === "/api/account") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readJson(req);
      const stored = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
      if (!stored || !(await bcrypt.compare(String(body.password || ""), stored.password_hash))) {
        return send(res, 401, { error: "Senha inválida." });
      }
      const token = parseCookies(req).session;
      db.prepare("DELETE FROM audit_logs WHERE user_id = ?").run(user.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      if (token) sessions.delete(token);
      return send(res, 200, { ok: true }, { "Set-Cookie": "session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/" });
    }

    return send(res, 404, { error: "Rota não encontrada." });
  } catch (error) {
    const message = String(error.message || "");
    if (message.includes("categories.user_id") || message.includes("category_rules.user_id")) {
      return send(res, 409, { error: "Já existe uma categoria ou regra com esse nome." });
    }
    if (message.includes("users.email")) {
      return send(res, 409, { error: "Este e-mail já está cadastrado." });
    }
    console.error(error);
    return send(res, 500, { error: "Erro interno." });
  }
}

function cookieHeader(token, req) {
  const secure = isHttps(req) ? "; Secure" : "";
  return `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`;
}

function isHttps(req) {
  return req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
}

const serverHandler = (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:");
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  return serveStatic(req, res);
};

function startServer() {
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    return https.createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, serverHandler)
      .listen(PORT, () => console.log(`Servidor HTTPS em https://localhost:${PORT}`));
  }
  return http.createServer(serverHandler)
    .listen(PORT, () => console.log(`Servidor HTTP de desenvolvimento em http://localhost:${PORT}`));
}

if (require.main === module) startServer();

module.exports = {
  startServer,
  __test: {
    importTransactionsFromCSV,
    detectImportPreset,
    suggestImportMapping,
    rowToImportCandidate,
  },
};
