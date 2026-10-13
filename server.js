const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
const { analyze, validDate } = require("./finance-core");
const { categorizeFromDictionary } = require("./category-dictionary");
const XLSX = require("xlsx");

const ENV_PATH = path.join(__dirname, ".env");
if (fs.existsSync(ENV_PATH) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(ENV_PATH);
}

const {
  MODEL: OPENAI_MODEL,
  generateFinancialPlan,
  isOpenAIConfigured,
} = require("./ai-service");

const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || "127.0.0.1");
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.FINTRACK_DATA_DIR || path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const CERT_PATH = path.join(ROOT, "certs", "localhost-cert.pem");
const KEY_PATH = path.join(ROOT, "certs", "localhost-key.pem");
const sessions = new Map();
const loginAttempts = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const CONSENT_VERSION = "1.1";
const BACKUP_RETENTION_DAYS = 7;
const BACKUP_REFRESH_MS = 60 * 60 * 1000;
const OPENAI_DAILY_LIMIT = Math.max(1, Number(process.env.OPENAI_DAILY_LIMIT || 10));
const formatBRL = value => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  "Transferência própria",
];

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA secure_delete = ON");
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
    installment_number INTEGER,
    installment_total INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS planned_installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_transaction_id INTEGER NOT NULL,
    linked_transaction_id INTEGER,
    installment_number INTEGER NOT NULL,
    installment_total INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'prevista',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
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
    priority INTEGER NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0,
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
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (goal_id) REFERENCES financial_goals(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS goal_change_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    goal_id INTEGER,
    action TEXT NOT NULL,
    previous_json TEXT,
    next_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (goal_id) REFERENCES financial_goals(id) ON DELETE SET NULL
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

  CREATE TABLE IF NOT EXISTS ai_analysis_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    source TEXT NOT NULL,
    model TEXT,
    summary TEXT,
    request_json TEXT,
    response_json TEXT,
    is_official INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

function backupLocalDatabase() {
  const backupDir = path.join(DATA_DIR, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const expiration = Date.now() - BACKUP_RETENTION_DAYS * 86400000;
  for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^app-\d{4}-\d{2}-\d{2}\.db$/.test(entry.name)) continue;
    const backupPath = path.join(backupDir, entry.name);
    if (fs.statSync(backupPath).mtimeMs < expiration) fs.rmSync(backupPath, { force: true });
  }
  if (!fs.existsSync(DB_PATH)) return;
  const stats = fs.statSync(DB_PATH);
  if (!stats.size) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupDir, `app-${stamp}.db`);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const temporaryPath = `${backupPath}.tmp`;
  fs.copyFileSync(DB_PATH, temporaryPath);
  fs.rmSync(backupPath, { force: true });
  fs.renameSync(temporaryPath, backupPath);
}

function clearLocalBackups() {
  const backupDir = path.join(DATA_DIR, "backups");
  if (!fs.existsSync(backupDir)) return;
  for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
    if (entry.isFile() && /^app-\d{4}-\d{2}-\d{2}\.db$/.test(entry.name)) {
      fs.rmSync(path.join(backupDir, entry.name), { force: true });
    }
  }
}

function refreshLocalBackupsAfterErasure() {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  clearLocalBackups();
  backupLocalDatabase();
}

ensureColumn("user_goals", "saved_amount", "REAL NOT NULL DEFAULT 0");
ensureColumn("user_goals", "goal_name", "TEXT NOT NULL DEFAULT 'Meta financeira'");
ensureColumn("user_goals", "planned_monthly_savings", "REAL NOT NULL DEFAULT 0");
ensureColumn("financial_goals", "initial_saved_amount", "REAL NOT NULL DEFAULT 0");
ensureColumn("financial_goals", "deadline", "TEXT");
ensureColumn("financial_goals", "target_category", "TEXT");
ensureColumn("financial_goals", "priority", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("financial_goals", "is_primary", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("goal_contributions", "updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
ensureColumn("user_consents", "revoked_at", "TEXT");
ensureColumn("users", "is_demo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "demo_scenario", "TEXT");
ensureColumn("transactions", "type", "TEXT NOT NULL DEFAULT 'saida'");
ensureColumn("transactions", "classification_confidence", "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("transactions", "classification_source", "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("transactions", "payment_method", "TEXT NOT NULL DEFAULT 'Manual'");
ensureColumn("transactions", "transaction_status", "TEXT NOT NULL DEFAULT 'Concluida'");
ensureColumn("transactions", "source", "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("transactions", "external_id", "TEXT");
ensureColumn("transactions", "note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("transactions", "installment_number", "INTEGER");
ensureColumn("transactions", "installment_total", "INTEGER");
ensureColumn("ai_analysis_history", "fingerprint", "TEXT");

const legacyGoals = db.prepare("SELECT * FROM user_goals").all();
for (const goal of legacyGoals) {
  const exists = db.prepare("SELECT id FROM financial_goals WHERE user_id = ?").get(goal.user_id);
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

const term = db.prepare("SELECT id FROM consent_terms WHERE version = ?").get(CONSENT_VERSION);
if (!term) {
  db.prepare(`
    INSERT INTO consent_terms (version, collected_data, purpose, storage, retention)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    CONSENT_VERSION,
    "Nome, e-mail e hash da senha; descrição, observação, valor, data, categoria, forma de pagamento, status e parcelamento dos lançamentos; categorias personalizadas, regras aprendidas e dados da meta; endereço IP, datas, horários e ações registradas para segurança e auditoria.",
    "Identificar a conta, organizar os registros financeiros, processar extratos enviados pelo usuário, classificar lançamentos e gerar análises e recomendações educativas.",
    "Banco SQLite no computador em que esta instalação local é executada; arquivos processados em memória e classificados por regras locais. A IA opcional usa a API da OpenAI e envia totais, categorias, dados da meta e indicadores agregados, sem descrições individuais, arquivo bruto ou senha.",
    "Dados financeiros permanecem até a revogação ou exclusão da conta. Revogar mantém nome, e-mail, hash da senha, histórico de consentimento e registros técnicos necessários à conta local. Excluir a conta remove os dados do banco ativo e as cópias locais do banco. Dados enviados opcionalmente à OpenAI seguem os prazos do provedor."
  );
}

try {
  fs.chmodSync(DB_PATH, 0o600);
} catch {
  // Windows may ignore POSIX file modes; authentication and path isolation still apply.
}

backupLocalDatabase();

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
  pruneSessions();
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function pruneSessions() {
  const expiration = Date.now() - SESSION_TTL_MS;
  for (const [token, session] of sessions) {
    if (session.createdAt < expiration) sessions.delete(token);
  }
}

function getUser(req) {
  const token = parseCookies(req).session;
  const session = token && sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt >= SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return db.prepare("SELECT id, name, email, is_demo, demo_scenario, created_at FROM users WHERE id = ?").get(session.userId) || null;
}

function requireUser(req, res) {
  const user = getUser(req);
  if (!user) send(res, 401, { error: "Autenticação obrigatória." });
  return user;
}

async function readJson(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Requisição acima do limite permitido.");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function loginAttemptKey(req, email) {
  return `${req.socket.remoteAddress || "local"}:${email}`;
}

function loginBlocked(key) {
  const expiration = Date.now() - LOGIN_WINDOW_MS;
  for (const [storedKey, attempt] of loginAttempts) {
    if (attempt.startedAt < expiration) loginAttempts.delete(storedKey);
  }
  const current = loginAttempts.get(key);
  if (!current || Date.now() - current.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return current.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(key) {
  const current = loginAttempts.get(key);
  if (!current || Date.now() - current.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, startedAt: Date.now() });
    return;
  }
  current.count += 1;
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
    if (content.length > 8 * 1024 * 1024) throw new Error("Arquivo acima do limite de 8 MB.");
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
  if (ALLOWED_CATEGORIES.includes(value)) return value;
  const match = categorizeFromDictionary(`${value} ${description}`);
  if (match) return match.category;
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
  const classification = rawCategory && rawCategory !== "Categoria pendente" ? { category: rawCategory, confidence: "manual" } : categorize(description, learnedRules);
  if (value !== null && value > 0 && !rawType && !mapping.creditValue && !mapping.debitValue) {
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
  const existing = db.prepare("SELECT date, description, value, external_id FROM transactions WHERE user_id = ?").all(userId);
  const existingSet = new Set(existing.map((item) => importSourceKey(item)));
  const existingSplitSources = new Set(existing.map((item) => /^split:([a-f0-9]{64}):\d+$/.exec(item.external_id || "")?.[1]).filter(Boolean));
  const localSet = new Set();
  const localSplitSources = new Set(candidates.filter((item) => item.splitOriginal).map((item) => importSourceId(item.splitOriginal)));
  return candidates.map((candidate) => {
    const original = candidate.splitOriginal || candidate;
    const key = importSourceKey(original);
    const sourceId = importSourceId(original);
    const savedMatch = existingSet.has(key) || existingSplitSources.has(sourceId);
    const fileMatch = !candidate.splitOriginal && (localSet.has(key) || localSplitSources.has(sourceId));
    const duplicate = savedMatch || fileMatch;
    if (!candidate.splitOriginal) localSet.add(key);
    return { ...candidate, duplicate, duplicateReason: savedMatch ? "já salvo" : fileMatch ? "outra linha do arquivo" : null };
  });
}

function importSourceKey(item) {
  return `${item.date}|${normalizeDescription(item.description)}|${Number(item.value).toFixed(2)}`;
}

function importSourceId(item) {
  return crypto.createHash("sha256").update(importSourceKey(item)).digest("hex");
}

function addMonthsToDate(date, months) {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function validateInstallmentPlan(item) {
  if (!item.installmentPlan) return null;
  const plan = item.installmentPlan;
  const current = Number(plan.currentNumber), total = Number(plan.total), amount = Number(plan.monthlyAmount);
  if (Number(item.value) >= 0 || ["Transferência própria", "Metas"].includes(item.category)) return "Parcelamentos só podem partir de uma despesa.";
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < 2 || total > 36 || current > total) return "Informe uma parcela atual e um total válido (até 36 parcelas).";
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100)) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return "Informe um valor mensal positivo, com até duas casas decimais.";
  return null;
}

function createFutureInstallments(userId, transactionId, item) {
  const plan = item.installmentPlan;
  if (!plan) return;
  const current = Number(plan.currentNumber), total = Number(plan.total);
  const realized = new Set(db.prepare("SELECT installment_number FROM planned_installments WHERE user_id = ? AND source_transaction_id = ? AND status = 'realizada'")
    .all(userId, transactionId).map(row => row.installment_number));
  const insert = db.prepare("INSERT INTO planned_installments (user_id, source_transaction_id, installment_number, installment_total, due_date, amount, category) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (let number = current + 1; number <= total; number++) {
    if (realized.has(number)) continue;
    const plannedId = insert.run(userId, transactionId, number, total, addMonthsToDate(item.date, number - current), Number(plan.monthlyAmount), item.category.trim()).lastInsertRowid;
    autoReconcilePlan(userId, plannedId);
  }
}

function matchingSavedTransactionsForPlan(userId, plan) {
  const key = normalizeDescription(plan.source_description);
  if (key.length < 3) return [];
  return db.prepare(`SELECT t.id, t.date, t.value, t.description FROM transactions t
    WHERE t.user_id = ? AND t.installment_number = ? AND t.installment_total = ? AND t.value < 0
      AND NOT EXISTS (SELECT 1 FROM planned_installments linked WHERE linked.linked_transaction_id = t.id AND linked.status = 'realizada')`)
    .all(userId, plan.installment_number, plan.installment_total)
    .filter(transaction => Math.abs(Date.parse(`${transaction.date}T00:00:00Z`) - Date.parse(`${plan.due_date}T00:00:00Z`)) <= 7 * 86400000 &&
      Math.abs(Math.round(transaction.value * 100) + Math.round(plan.amount * 100)) <= 100 &&
      normalizeDescription(transaction.description) === key);
}

function autoReconcilePlan(userId, planId) {
  const plan = db.prepare(`SELECT p.*, source.description AS source_description FROM planned_installments p
    JOIN transactions source ON source.id = p.source_transaction_id
    WHERE p.id = ? AND p.user_id = ? AND p.status = 'prevista'`).get(planId, userId);
  if (!plan) return false;
  const matches = matchingSavedTransactionsForPlan(userId, plan);
  if (matches.length !== 1) return false;
  const competingPlans = db.prepare(`SELECT p.id, p.due_date, p.amount, source.description AS source_description
    FROM planned_installments p JOIN transactions source ON source.id = p.source_transaction_id
    WHERE p.user_id = ? AND p.status = 'prevista' AND p.installment_number = ? AND p.installment_total = ? AND p.id <> ?`)
    .all(userId, plan.installment_number, plan.installment_total, plan.id)
    .filter(other => normalizeDescription(other.source_description) === normalizeDescription(plan.source_description) &&
      Math.abs(Date.parse(`${other.due_date}T00:00:00Z`) - Date.parse(`${matches[0].date}T00:00:00Z`)) <= 7 * 86400000 &&
      Math.abs(Math.round(matches[0].value * 100) + Math.round(other.amount * 100)) <= 100);
  if (competingPlans.length) return false;
  db.prepare("UPDATE planned_installments SET status = 'realizada', linked_transaction_id = ? WHERE id = ? AND user_id = ? AND status = 'prevista'")
    .run(matches[0].id, planId, userId);
  return true;
}

function autoReconcileTransaction(userId, transactionId) {
  const transaction = db.prepare("SELECT installment_number, installment_total, description, date, value FROM transactions WHERE id = ? AND user_id = ?").get(transactionId, userId);
  if (!transaction?.installment_number) return 0;
  const key = normalizeDescription(transaction.description);
  if (key.length < 3) return 0;
  const plans = db.prepare(`SELECT p.id, p.due_date, p.amount, source.description AS source_description
    FROM planned_installments p JOIN transactions source ON source.id = p.source_transaction_id
    WHERE p.user_id = ? AND p.installment_number = ? AND p.installment_total = ? AND p.status = 'prevista'`)
    .all(userId, transaction.installment_number, transaction.installment_total)
    .filter(plan => normalizeDescription(plan.source_description) === key &&
      Math.abs(Date.parse(`${plan.due_date}T00:00:00Z`) - Date.parse(`${transaction.date}T00:00:00Z`)) <= 7 * 86400000 &&
      Math.abs(Math.round(transaction.value * 100) + Math.round(plan.amount * 100)) <= 100);
  return plans.reduce((count, plan) => count + Number(autoReconcilePlan(userId, plan.id)), 0);
}

function upcomingInstallments(userId) {
  const now = new Date();
  const firstMonth = addMonthsToDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, 1).slice(0, 7);
  const months = Array.from({ length: 3 }, (_, index) => addMonthsToDate(`${firstMonth}-01`, index).slice(0, 7));
  const rows = db.prepare(`SELECT p.id, p.source_transaction_id, p.due_date, p.amount, p.category,
    p.installment_number, p.installment_total, source.description
    FROM planned_installments p LEFT JOIN transactions source ON source.id = p.source_transaction_id AND source.user_id = p.user_id
    WHERE p.user_id = ? AND p.status = 'prevista' ORDER BY p.due_date, p.id`).all(userId);
  return { months: months.map(month => {
    const items = rows.filter(row => row.due_date.startsWith(month));
    const categories = new Map();
    for (const item of items) categories.set(item.category, (categories.get(item.category) || 0) + Math.round(item.amount * 100));
    return { month, total: items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100, count: items.length,
      categories: [...categories].map(([category, cents]) => ({ category, total: cents / 100 })) };
  }), items: rows.filter(row => months.some(month => row.due_date.startsWith(month))),
    unreconciled: rows.filter(row => row.due_date.slice(0, 7) <= `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`) };
}

function validateSplitGroups(items) {
  const groups = new Map();
  for (const item of items) {
    if (!item.splitOriginal) continue;
    const original = item.splitOriginal;
    if (!validDate(original.date) || !String(original.description || "").trim() ||
        !Number.isFinite(Number(original.value)) || Number(original.value) === 0) {
      return "A origem de um lançamento dividido é inválida. Atualize a prévia.";
    }
    const key = importSourceId(original);
    const group = groups.get(key) || { original, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  for (const { original, items: parts } of groups.values()) {
    if (parts.length < 2 || parts.some((item) =>
      item.date !== original.date || Math.sign(Number(item.value)) !== Math.sign(Number(original.value)) ||
      Math.round(Number(item.value) * 100) === 0)) {
      return `As partes de “${original.description}” precisam manter a data e o sentido de entrada ou saída, com valores diferentes de zero.`;
    }
  }
  return null;
}

function buildImportCandidateList(userId, rows, mapping) {
  const learnedRules = loadCategoryRules(userId);
  const errors = [];
  const candidates = [];
  rows.slice(0, 500).forEach((row, index) => {
    const candidate = rowToImportCandidate(row, mapping, learnedRules);
    if (!candidate.description || !validDate(candidate.date) || !Number.isFinite(candidate.value) || candidate.value === 0) {
      errors.push({ row: index + 1, message: "Linha sem data, descrição ou valor válido." });
      return;
    }
    if (!categoryExists(userId, candidate.category)) {
      const suggestion = categorize(candidate.description, learnedRules);
      candidate.category = categoryExists(userId, suggestion.category) ? suggestion.category : "Categoria pendente";
      candidate.confidence = candidate.category === "Categoria pendente" ? "baixa" : suggestion.confidence;
    }
    candidate.sourceOriginal = { date: candidate.date, description: candidate.description, value: candidate.value };
    candidates.push(candidate);
  });
  if (rows.length > 500) errors.push({ row: 501, message: "O limite é de 500 linhas. Divida o arquivo para importar as linhas restantes." });
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

async function buildSmartImportPreview(userId, rows, mapping) {
  const { candidates, errors } = buildImportCandidateList(userId, rows, mapping);
  return finishImportPreview(userId, candidates, errors, { source: "local" });
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
  insert.run(userId, "Transferência própria", 0, "#64748b");
  insert.run(userId, "Categoria pendente", 0, "#b45309");
}

const DEMO_SCENARIOS = [
  {
    id: "economizar",
    name: "Demonstração — Economizar por mês",
    email: "demo.economizar@fintrack.local",
    goal: { name: "Economizar por mês", objective: "economizar", targetValue: 500, savedAmount: 0, targetMonths: 1, targetCategory: null, deadlineOffset: null },
  },
  {
    id: "reduzir",
    name: "Demonstração — Reduzir alimentação",
    email: "demo.reduzir@fintrack.local",
    goal: { name: "Reduzir gastos com alimentação", objective: "reduzir", targetValue: 350, savedAmount: 0, targetMonths: 1, targetCategory: "Alimentação", deadlineOffset: null },
  },
  {
    id: "juntar",
    name: "Demonstração — Juntar um valor",
    email: "demo.juntar@fintrack.local",
    goal: { name: "Juntar R$ 3.000", objective: "juntar", targetValue: 3000, savedAmount: 600, targetMonths: 6, targetCategory: null, deadlineOffset: 5 },
  },
];

db.prepare("DELETE FROM users WHERE is_demo = 1 AND lower(email) = 'tcc@fintrack.ai'").run();

function demoMonthValue(offset = 0) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function demoDate(monthValue, day) {
  const [year, month] = String(monthValue).split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function demoScenario(value) {
  return DEMO_SCENARIOS.find((item) => item.id === String(value || "")) || null;
}

function ensureDemoAccount(scenarioId, req) {
  const scenario = demoScenario(scenarioId);
  if (!scenario) return null;
  const email = scenario.email.toLowerCase();
  let user = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email);
  if (!user) {
    const passwordHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);
    const result = db.prepare("INSERT INTO users (name, email, password_hash, is_demo, demo_scenario) VALUES (?, ?, ?, 1, ?)")
      .run(scenario.name, email, passwordHash, scenario.id);
    user = { id: result.lastInsertRowid };
  } else {
    db.prepare("UPDATE users SET name = ?, is_demo = 1, demo_scenario = ? WHERE id = ?").run(scenario.name, scenario.id, user.id);
  }
  seedDemoAccount(user.id, scenario, req);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
}

function clearDemoAccountData(userId) {
  db.prepare("DELETE FROM goal_contributions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM transactions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM financial_goals WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM user_goals WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM goal_change_history WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM category_rules WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM ai_analysis_history WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM ai_daily_usage WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM monthly_closings WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM audit_logs WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM categories WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM user_consents WHERE user_id = ?").run(userId);
}

function insertDemoTransaction(insert, userId, month, day, description, value, category, paymentMethod, status = "Concluida") {
  const type = value > 0 ? "entrada" : "saida";
  return insert.run(
    userId,
    description,
    value,
    demoDate(month, day),
    category,
    type,
    "alta",
    "demo tcc",
    paymentMethod,
    status,
    "demo tcc",
    `tcc-${month}-${day}-${normalizeDescription(description).slice(0, 28)}`,
  ).lastInsertRowid;
}

function seedDemoAccount(userId, scenario, req) {
  const months = Array.from({ length: 6 }, (_, index) => demoMonthValue(index - 6));
  const latestCompleteMonth = months.at(-1);
  const currentMonth = demoMonthValue(0);
  db.exec("BEGIN");
  try {
    clearDemoAccountData(userId);
    ensureDefaultCategories(userId);
    const latestTerm = db.prepare("SELECT id FROM consent_terms WHERE version = ?").get(CONSENT_VERSION);
    db.prepare("INSERT INTO user_consents (user_id, term_id) VALUES (?, ?)").run(userId, latestTerm.id);

    const insertTransaction = db.prepare(`
      INSERT INTO transactions (
        user_id, description, value, date, category, type,
        classification_confidence, classification_source, payment_method,
        transaction_status, source, external_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const demoTransactions = months.flatMap((month, index) => {
      const factor = index + 1;
      return [
        [month, 3, "Salário Tech Ltda", 4800, "Receita", "Transferência bancária"],
        ...(index % 2 ? [[month, 6, "Freelance Ajustes Site", 350 + factor * 30, "Receita", "PIX recebido"]] : []),
        [month, 4, "Aluguel Residencial", -1350, "Contas fixas", "Débito automático"],
        [month, 5, "Internet Fibra 500MB", -119.9, "Contas fixas", "Cartão de crédito"],
        [month, 7, "Energia Elétrica", -(158 + factor * 6.4), "Contas fixas", "Boleto"],
        [month, 8, "Supermercado Atacadão", -(430 + factor * 18.5), "Mercado", "Cartão de débito"],
        [month, 9, "iFood Restaurante", -(58 + factor * 8.5), "Alimentação", "Cartão de crédito"],
        [month, 12, "Restaurante Centro", -(64 + factor * 9.2), "Alimentação", "Cartão de crédito"],
        [month, 16, "Padaria Café", -(28 + factor * 4.1), "Alimentação", "Cartão de débito"],
        ...(index >= 4 ? [[month, 20, "Restaurante Faculdade", -(92 + factor * 5), "Alimentação", "Cartão de crédito"]] : []),
        [month, 10, "Uber Viagem", -(36 + factor * 4.2), "Transporte", "Cartão de crédito"],
        [month, 14, "Posto Ipiranga Combustível", -(150 + factor * 7), "Transporte", "Cartão de crédito"],
        [month, 11, "Spotify Premium", -21.9, "Assinaturas", "Cartão de crédito"],
        [month, 11, "Netflix", -39.9, "Assinaturas", "Cartão de crédito"],
        [month, 18, "Cinema Shopping Center", -(62 + factor * 6), "Lazer", "Cartão de crédito"],
        [month, 19, "Farmácia Drogasil", -(48 + factor * 3.5), "Saúde", "Cartão de débito"],
        [month, 13, "Faculdade Mensalidade", -614.42, "Educação", "Boleto"],
        [month, 22, "Compra Mercado Livre", -(145 + factor * 22), "Compras", "Cartão de crédito"],
      ];
    });
    demoTransactions.push([latestCompleteMonth, 24, "Notebook parcela 1/6", -300, "Compras", "Cartão de crédito"]);
    for (const item of demoTransactions) insertDemoTransaction(insertTransaction, userId, ...item);

    const goal = scenario.goal;
    const deadline = goal.deadlineOffset == null ? null : demoDate(demoMonthValue(goal.deadlineOffset), 28);
    db.prepare("INSERT INTO financial_goals (user_id, goal_name, objective, target_value, saved_amount, target_months, intensity, target_category, deadline, is_primary) VALUES (?, ?, ?, ?, ?, ?, 'equilibrado', ?, ?, 1)")
      .run(userId, goal.name, goal.objective, goal.targetValue, goal.savedAmount, goal.targetMonths, goal.targetCategory, deadline);

    const source = db.prepare("SELECT id FROM transactions WHERE user_id = ? AND description = 'Notebook parcela 1/6' ORDER BY id DESC LIMIT 1").get(userId);
    const insertInstallment = db.prepare("INSERT INTO planned_installments (user_id, source_transaction_id, installment_number, installment_total, due_date, amount, category) VALUES (?, ?, ?, 6, ?, 300, 'Compras')");
    for (let number = 2; number <= 6; number++) {
      insertInstallment.run(userId, source.id, number, demoDate(demoMonthValue(number - 2), 24));
    }

    const insertRule = db.prepare("INSERT INTO category_rules (user_id, merchant_pattern, category) VALUES (?, ?, ?)");
    [
      ["spotify premium", "Assinaturas"],
      ["netflix", "Assinaturas"],
      ["disney plus", "Assinaturas"],
      ["ifood", "Alimentação"],
      ["uber", "Transporte"],
      ["mercado livre", "Compras"],
      ["faculdade mensalidade", "Educação"],
      ["atacadao", "Mercado"],
    ].forEach(([pattern, category]) => insertRule.run(userId, pattern, category));

    const rows = db.prepare("SELECT id, description, value, date, category, type, note, installment_number, installment_total, updated_at FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC").all(userId);
    const savedGoal = db.prepare("SELECT * FROM financial_goals WHERE user_id = ? AND is_primary = 1").get(userId);
    const localAnalysis = buildFinancialAnalysis(rows, savedGoal, [], { month: latestCompleteMonth });
    localAnalysis.periodStatus = "previous";
    localAnalysis.upcomingInstallments = upcomingInstallments(userId);
    const analysisResponse = {
      ...localAnalysis,
      ai: null,
      openAIRequestSummary: summarizeOpenAIRequest(localAnalysis),
      aiStatus: { source: "local", model: null, cached: false, warning: null },
    };
    const fingerprint = generateFinancialAnalysisHash(userId, rows, localAnalysis.categoryBudgets, localAnalysis.goals || savedGoal, latestCompleteMonth, localAnalysis.upcomingInstallments);
    saveAnalysisHistory(userId, latestCompleteMonth, fingerprint, analysisResponse, analysisResponse.openAIRequestSummary);

    audit(userId, "DEMO_ACCOUNT_READY", { message: "Cenário de demonstração recriado com seis meses de dados fictícios.", scenario: scenario.id, months }, req);
    audit(userId, "CONSENT_ACCEPTED", { termVersion: CONSENT_VERSION, demo: true }, req);
    audit(userId, "IMPORT_CONFIRMED", { source: `Demonstração TCC — ${scenario.id}`, transactions: demoTransactions.length, currentMonth }, req);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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

function matchesCategoryPattern(description, pattern) {
  return normalizeDescription(description).includes(pattern) || merchantPattern(description).includes(pattern);
}

function loadCategoryRules(userId) {
  return db.prepare("SELECT id, merchant_pattern, category, created_at, updated_at FROM category_rules WHERE user_id = ? ORDER BY LENGTH(merchant_pattern) DESC").all(userId);
}

function learnCategoryRule(userId, description, category) {
  if (!category || ["Categoria pendente", "Receita"].includes(category) || !categoryExists(userId, category)) return;
  const pattern = merchantPattern(description);
  if (pattern.length < 3 || /\b(pix|transferencia)\b/.test(normalizeDescription(description))) return;
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
    if (matchesCategoryPattern(item.description, pattern)) update.run(category, item.id, userId);
  }
}

function saveCategoryRule(userId, merchantPattern, category) {
  const pattern = normalizeDescription(merchantPattern).slice(0, 80);
  if (pattern.length < 3) return { error: "Informe um padrão com pelo menos 3 caracteres." };
  if (!category || ["Categoria pendente", "Receita"].includes(category)) {
    return { error: "Escolha uma categoria de gasto válida para a regra." };
  }
  if (!categoryExists(userId, category)) return { error: "Categoria não encontrada." };
  const result = db.prepare(`
    INSERT INTO category_rules (user_id, merchant_pattern, category)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, merchant_pattern) DO UPDATE SET
      category = excluded.category,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, pattern, category);
  const candidates = db.prepare("SELECT id, description FROM transactions WHERE user_id = ? AND value < 0 AND category IN ('Categoria pendente', 'Outros')").all(userId);
  const update = db.prepare(`
    UPDATE transactions
    SET category = ?, classification_confidence = 'aprendida', classification_source = 'regra aprendida', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `);
  for (const item of candidates) {
    if (matchesCategoryPattern(item.description, pattern)) update.run(category, item.id, userId);
  }
  db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(userId);
  return {
    id: result.lastInsertRowid,
    merchant_pattern: pattern,
    category,
  };
}

function categorize(description, learnedRules = []) {
  const text = normalizeDescription(description);
  for (const rule of learnedRules) {
    if (/\b(pix|transferencia)\b/.test(text)) continue;
    if (rule.merchant_pattern && matchesCategoryPattern(description, rule.merchant_pattern)) {
      return { category: rule.category, confidence: "aprendida", merchant: rule.merchant_pattern };
    }
  }
  const dictionaryMatch = categorizeFromDictionary(description);
  if (dictionaryMatch) return { category: dictionaryMatch.category, confidence: "alta", merchant: merchantPattern(description) };
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
  if (item.categoryManuallyEdited) {
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

function cleanTransactionNote(value) {
  return String(value || "").trim().slice(0, 160);
}

function normalizeMonthParam(value) {
  const month = String(value || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
}

function filterTransactionsForMonth(transactions, month) {
  const normalizedMonth = normalizeMonthParam(month);
  if (!normalizedMonth) return transactions || [];
  return (transactions || []).filter((item) => String(item.date || "").startsWith(normalizedMonth));
}

function getUserGoals(userId) {
  return db.prepare("SELECT * FROM financial_goals WHERE user_id = ? ORDER BY is_primary DESC, priority ASC, id DESC").all(userId);
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

function getGoalChangeHistory(userId, limit = 80) {
  return db.prepare(`
    SELECT gch.id, gch.goal_id, gch.action, gch.previous_json, gch.next_json, gch.created_at, fg.goal_name
    FROM goal_change_history gch
    LEFT JOIN financial_goals fg ON fg.id = gch.goal_id AND fg.user_id = gch.user_id
    WHERE gch.user_id = ?
    ORDER BY gch.id DESC
    LIMIT ?
  `).all(userId, limit).map((row) => ({
    ...row,
    previous: safeJson(row.previous_json),
    next: safeJson(row.next_json),
    previous_json: undefined,
    next_json: undefined,
  }));
}

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function buildFinancialAnalysis(transactions, goal, categoryBudgets = [], options = {}) {
  return analyze(transactions, goal, normalizeMonthParam(options.month) || new Date().toISOString().slice(0, 7));
}

async function getPersonalizedAIPlan(userId, transactions, goal, localAnalysis, options = {}) {
  if (!isOpenAIConfigured() || (localAnalysis.totalIncome === 0 && localAnalysis.totalExpenses === 0)) {
    return { plan: null, source: "local", model: null, cached: false, warning: null };
  }
  const context = buildAIAnalysisContext(localAnalysis);

  const fingerprint = generateFinancialAnalysisHash(userId, transactions, localAnalysis.categoryBudgets, localAnalysis.goals || goal, localAnalysis.selectedMonth, localAnalysis.upcomingInstallments);
  if (!options.forceRefresh) {
    const cached = db.prepare("SELECT response_json FROM ai_analysis_cache WHERE user_id = ? AND fingerprint = ?").get(userId, fingerprint);
    if (cached) {
      return { plan: JSON.parse(cached.response_json), source: "openai", model: OPENAI_MODEL, cached: true, warning: null };
    }
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

function buildAIAnalysisContext(analysis) {
  const goal = analysis.goal;
  const recurringByCategory = new Map();
  for (const item of analysis.recurring) {
    const current = recurringByCategory.get(item.category) || { category: item.category, groups: 0, occurrences: 0, total: 0 };
    current.groups += 1;
    current.occurrences += item.count;
    current.total = Math.round((current.total + item.total) * 100) / 100;
    recurringByCategory.set(item.category, current);
  }
  const alertCounts = {};
  for (const item of analysis.anomalies) alertCounts[item.type] = (alertCounts[item.type] || 0) + 1;
  return {
    period: analysis.selectedMonth,
    summary: { totalIncome: analysis.totalIncome, totalExpenses: analysis.totalExpenses, balance: analysis.balance },
    goal: goal ? {
      objective: goal.objective, targetCategory: goal.target_category || null,
      targetValue: goal.target_value, savedAmount: goal.saved_amount,
      remainingAmount: goal.remainingAmount, monthlyTarget: goal.monthlyTarget,
      monthsRemaining: goal.monthsRemaining, status: goal.status,
    } : null,
    categories: analysis.categories,
    patterns: [...recurringByCategory.values()],
    comparison: analysis.monthlyComparison ? {
      previousExpenses: analysis.monthlyComparison.previousExpenses,
      currentExpenses: analysis.monthlyComparison.currentExpenses,
      difference: analysis.monthlyComparison.difference,
    } : null,
    alerts: alertCounts,
    upcomingInstallments: analysis.upcomingInstallments?.months || [],
    limitations: analysis.insights,
  };
}

function summarizeOpenAIRequest(analysis) {
  return buildAIAnalysisContext(analysis);
}

function generateFinancialAnalysisHash(userId, transactions, categoryBudgets, goal, analysisMonth, upcoming) {
  const periodTransactions = filterTransactionsForMonth(transactions, analysisMonth).map((item) => ({
    id: item.id,
    description: item.description,
    value: item.value,
    date: item.date,
    category: item.category,
    type: item.type,
    note: item.note,
    installment_number: item.installment_number,
    installment_total: item.installment_total,
    updated_at: item.updated_at,
  }));
  return crypto.createHash("sha256").update(JSON.stringify({
    version: 7,
    userId,
    model: OPENAI_MODEL,
    transactions: periodTransactions,
    categoryBudgets,
    goal,
    analysisMonth,
    upcoming,
  })).digest("hex");
}

function latestSavedAnalysis(userId, month, currentFingerprint) {
  const row = db.prepare(`
    SELECT month, source, model, summary, response_json, fingerprint, created_at
    FROM ai_analysis_history
    WHERE user_id = ? AND month = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(userId, month);
  if (!row) return null;
  const result = safeJson(row.response_json);
  if (!result) return null;
  return {
    month: row.month,
    source: row.source,
    model: row.model,
    summary: row.summary,
    createdAt: row.created_at,
    stale: !row.fingerprint || row.fingerprint !== currentFingerprint,
    result,
  };
}

function saveAnalysisHistory(userId, month, fingerprint, analysis, requestSummary) {
  const source = analysis.ai ? "openai" : "local";
  const model = analysis.ai ? analysis.aiStatus?.model || OPENAI_MODEL : null;
  const summary = analysis.ai?.executiveSummary || `Entradas ${formatBRL(analysis.totalIncome)}, despesas ${formatBRL(analysis.totalExpenses)} e resultado ${formatBRL(analysis.balance)}.`;
  const existing = db.prepare("SELECT id FROM ai_analysis_history WHERE user_id = ? AND month = ? AND fingerprint = ? ORDER BY id DESC LIMIT 1")
    .get(userId, month, fingerprint);
  if (existing) {
    db.prepare("UPDATE ai_analysis_history SET source = ?, model = ?, summary = ?, request_json = ?, response_json = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(source, model, summary, JSON.stringify(requestSummary || {}), JSON.stringify(analysis), existing.id);
  } else db.prepare(`
    INSERT INTO ai_analysis_history (user_id, month, source, model, summary, request_json, response_json, is_official, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(userId, month, source, model, summary, JSON.stringify(requestSummary || {}), JSON.stringify(analysis), fingerprint);
  db.prepare(`DELETE FROM ai_analysis_history WHERE user_id = ? AND month = ? AND id NOT IN (
    SELECT id FROM ai_analysis_history WHERE user_id = ? AND month = ? ORDER BY id DESC LIMIT 24
  )`).run(userId, month, userId, month);
}

function validateTransaction(input) {
  const description = String(input.description || "").trim();
  const value = Number(input.value);
  const date = String(input.date || "").trim();
  const category = String(input.category || "").trim();
  const note = String(input.note || "").trim();
  if (!description || description.length > 120) return "Descrição obrigatória com até 120 caracteres.";
  if (!Number.isFinite(value) || value === 0) return "Valor deve ser numérico e diferente de zero.";
  if (!validDate(date)) return "Informe uma data válida no formato AAAA-MM-DD.";
  if (!category || category.length > 40) return "Categoria obrigatória com até 40 caracteres.";
  if (note.length > 160) return "Observação deve ter até 160 caracteres.";
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

function duplicateCategory(userId, name, exceptId = 0) {
  return db.prepare("SELECT id, name FROM categories WHERE user_id = ?").all(userId)
    .some(item => item.id !== exceptId && normalizeColumnName(item.name) === normalizeColumnName(name));
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
  `).get(userId, CONSENT_VERSION));
}

function revokeConsentAndClearData(userId, req) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM transactions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_goals WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM goal_contributions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM financial_goals WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM category_rules WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM categories WHERE user_id = ? AND is_system = 0").run(userId);
    db.prepare("UPDATE categories SET monthly_limit = 0 WHERE user_id = ? AND is_system = 1").run(userId);
    db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM ai_analysis_history WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM ai_daily_usage WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM monthly_closings WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM goal_change_history WHERE user_id = ?").run(userId);
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
  refreshLocalBackupsAfterErasure();
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return send(res, 403, "Acesso negado.");
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
      const latestTerm = db.prepare("SELECT id FROM consent_terms WHERE version = ?").get(CONSENT_VERSION);
      db.prepare("INSERT INTO user_consents (user_id, term_id) VALUES (?, ?)").run(result.lastInsertRowid, latestTerm.id);
      ensureDefaultCategories(result.lastInsertRowid);
      audit(result.lastInsertRowid, "USER_REGISTERED", { termVersion: CONSENT_VERSION }, req);
      audit(result.lastInsertRowid, "CONSENT_ACCEPTED", { termVersion: CONSENT_VERSION }, req);
      const token = createSession(result.lastInsertRowid);
      return send(res, 201, { ok: true }, { "Set-Cookie": cookieHeader(token, req) });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const attemptKey = loginAttemptKey(req, email);
      if (loginBlocked(attemptKey)) {
        return send(res, 429, { error: "Muitas tentativas de entrada. Aguarde 15 minutos e tente novamente." });
      }
      const user = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email);
      if (!user || !(await bcrypt.compare(String(body.password || ""), user.password_hash))) {
        recordFailedLogin(attemptKey);
        return send(res, 401, { error: "E-mail ou senha inválidos. Confira os dados ou crie uma nova conta." });
      }
      loginAttempts.delete(attemptKey);
      if (user.is_demo) {
        const scenario = demoScenario(user.demo_scenario) || DEMO_SCENARIOS.find((item) => item.email === user.email);
        if (!scenario) return send(res, 400, { error: "Cenário de demonstração inválido." });
        seedDemoAccount(user.id, scenario, req);
      }
      ensureDefaultCategories(user.id);
      audit(user.id, "USER_LOGIN", null, req);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader(createSession(user.id), req) });
    }

    if (req.method === "POST" && url.pathname === "/api/demo/login") {
      const body = await readJson(req);
      const scenario = demoScenario(body.scenario);
      if (!scenario) return send(res, 400, { error: "Escolha um cenário de demonstração válido." });
      const user = ensureDemoAccount(scenario.id, req);
      audit(user.id, "DEMO_LOGIN", { message: "Acesso iniciado em um cenário de demonstração TCC.", scenario: scenario.id }, req);
      return send(res, 200, {
        ok: true,
        demo: true,
        scenario: scenario.id,
      }, { "Set-Cookie": cookieHeader(createSession(user.id), req) });
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

    if (req.method === "PUT" && url.pathname === "/api/account/profile") {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.is_demo) return send(res, 403, { error: "A conta demonstrativa é restaurada automaticamente e não pode ser alterada." });
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      if (name.length < 3 || name.length > 80) return send(res, 400, { error: "Informe um nome com 3 a 80 caracteres." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: "Informe um e-mail válido." });
      const duplicate = db.prepare("SELECT id FROM users WHERE lower(email) = ? AND id <> ?").get(email, user.id);
      if (duplicate) return send(res, 409, { error: "Este e-mail já está cadastrado." });
      const emailChanged = email !== user.email.toLowerCase();
      if (emailChanged) {
        const stored = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
        if (!stored || !(await bcrypt.compare(String(body.password || ""), stored.password_hash))) {
          return send(res, 401, { error: "Informe sua senha atual para alterar o e-mail." });
        }
      }
      db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?").run(name, email, user.id);
      const changedFields = [];
      if (name !== user.name) changedFields.push("name");
      if (emailChanged) changedFields.push("email");
      if (changedFields.length) audit(user.id, "ACCOUNT_PROFILE_UPDATED", { fields: changedFields }, req);
      const updatedUser = db.prepare("SELECT id, name, email, is_demo, demo_scenario, created_at FROM users WHERE id = ?").get(user.id);
      return send(res, 200, { user: updatedUser });
    }

    if (req.method === "GET" && url.pathname === "/api/term") {
      const latest = db.prepare("SELECT * FROM consent_terms WHERE version = ?").get(CONSENT_VERSION);
      return send(res, 200, latest);
    }

    if (req.method === "POST" && url.pathname === "/api/consent/accept") {
      const user = requireUser(req, res);
      if (!user) return;
      const latestTerm = db.prepare("SELECT id, version FROM consent_terms WHERE version = ?").get(CONSENT_VERSION);
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
        if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de criar categorias." });
        const body = await readJson(req);
        const validation = validateCategoryInput(body);
        if (validation) return send(res, 400, { error: validation });
        if (duplicateCategory(user.id, body.name)) return send(res, 409, { error: "Já existe uma categoria com esse nome." });
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
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de alterar categorias." });
      if (category.is_system) return send(res, 400, { error: "As categorias padrão são fixas. Crie uma categoria personalizada." });
      if (req.method === "PUT") {
        const body = await readJson(req);
        const validation = validateCategoryInput(body);
        if (validation) return send(res, 400, { error: validation });
        if (duplicateCategory(user.id, body.name, category.id)) return send(res, 409, { error: "Já existe uma categoria com esse nome." });
        db.exec("BEGIN");
        try {
          db.prepare("UPDATE categories SET name = ?, monthly_limit = ?, color = ? WHERE id = ? AND user_id = ?")
            .run(body.name.trim(), 0, body.color, category.id, user.id);
          if (category.name !== body.name.trim()) {
            db.prepare("UPDATE transactions SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category = ?")
              .run(body.name.trim(), user.id, category.name);
            db.prepare("UPDATE planned_installments SET category = ? WHERE user_id = ? AND category = ?")
              .run(body.name.trim(), user.id, category.name);
          }
          db.prepare("UPDATE category_rules SET category = ? WHERE user_id = ? AND category = ?").run(body.name.trim(), user.id, category.name);
          db.prepare("UPDATE financial_goals SET target_category = ? WHERE user_id = ? AND target_category = ?").run(body.name.trim(), user.id, category.name);
          db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
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
      if (db.prepare("SELECT id FROM financial_goals WHERE user_id = ? AND target_category = ? AND is_primary = 1").get(user.id, category.name)) return send(res, 400, { error: "Altere a categoria da meta antes de excluir esta categoria." });
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM category_rules WHERE user_id = ? AND category = ?").run(user.id, category.name);
        db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
        db.prepare("UPDATE transactions SET category = 'Outros' , updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category = ?")
          .run(user.id, category.name);
        db.prepare("UPDATE planned_installments SET category = 'Outros' WHERE user_id = ? AND category = ?")
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
        const rows = db.prepare("SELECT id, description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, external_id, note, installment_number, installment_total, created_at, updated_at FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC").all(user.id);
        return send(res, 200, rows);
      }

      if (req.method === "POST" && url.pathname === "/api/transactions") {
        const body = normalizeManualTransaction(await readJson(req));
        const validation = validateTransaction(body);
        if (validation) return send(res, 400, { error: validation });
        if (!categoryExists(user.id, body.category.trim())) return send(res, 400, { error: "Categoria não encontrada." });
        const planError = validateInstallmentPlan(body);
        if (planError) return send(res, 400, { error: planError });
        const meta = classificationMetadata(user.id, body.description.trim(), Number(body.value), body.category.trim());
        let transactionId;
        db.exec("BEGIN");
        try {
          transactionId = db.prepare("INSERT INTO transactions (user_id, description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, note, installment_number, installment_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(user.id, body.description.trim(), Number(body.value), body.date, body.category.trim(), meta.type, meta.classification_confidence, meta.classification_source, cleanPaymentMethod(body.paymentMethod || body.payment_method), cleanTransactionStatus(body.status || body.transaction_status), "manual", cleanTransactionNote(body.note), body.installmentPlan ? Number(body.installmentPlan.currentNumber) : null, body.installmentPlan ? Number(body.installmentPlan.total) : null).lastInsertRowid;
          if (body.installmentPlan && !(Number(body.installmentPlan.currentNumber) > 1 && autoReconcileTransaction(user.id, transactionId))) createFutureInstallments(user.id, transactionId, body);
          learnCategoryRule(user.id, body.description.trim(), body.category.trim());
          db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
        audit(user.id, "TRANSACTION_CREATED", { transactionId }, req);
        return send(res, 201, { id: transactionId });
      }

      if (req.method === "POST" && url.pathname === "/api/transactions/bulk") {
        const body = await readJson(req);
        const rawIds = Array.isArray(body.ids) ? body.ids : [];
        const ids = [...new Set(rawIds.map(Number))];
        if (!ids.length) return send(res, 400, { error: "Selecione ao menos um lançamento." });
        if (ids.length > 250) return send(res, 400, { error: "Selecione no máximo 250 lançamentos por vez." });
        if (ids.some(id => !Number.isInteger(id) || id <= 0)) return send(res, 400, { error: "A seleção contém um lançamento inválido." });
        const placeholders = ids.map(() => "?").join(",");
        if (body.action === "delete") {
          db.prepare(`UPDATE planned_installments SET status = 'prevista', linked_transaction_id = NULL WHERE user_id = ? AND linked_transaction_id IN (${placeholders})`).run(user.id, ...ids);
          const result = db.prepare(`DELETE FROM transactions WHERE user_id = ? AND id IN (${placeholders})`).run(user.id, ...ids);
          db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
          audit(user.id, "TRANSACTIONS_BULK_DELETED", { deleted: result.changes }, req);
          return send(res, 200, { deleted: result.changes });
        }
        if (body.action === "category") {
          const category = String(body.category || "").trim();
          if (!categoryExists(user.id, category) || ["Receita", "Metas", "Categoria pendente"].includes(category)) {
            return send(res, 400, { error: "Escolha uma categoria de gasto válida." });
          }
          const result = db.prepare(`
            UPDATE transactions
            SET category = ?, classification_confidence = 'corrigida', classification_source = 'manual', updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND id IN (${placeholders})
          `).run(category, user.id, ...ids);
          if (category === "Transferência própria") {
            db.prepare(`UPDATE planned_installments SET status = 'prevista', linked_transaction_id = NULL WHERE user_id = ? AND linked_transaction_id IN (${placeholders})`).run(user.id, ...ids);
            db.prepare(`DELETE FROM planned_installments WHERE user_id = ? AND source_transaction_id IN (${placeholders})`).run(user.id, ...ids);
            db.prepare(`UPDATE transactions SET installment_number = NULL, installment_total = NULL WHERE user_id = ? AND id IN (${placeholders})`).run(user.id, ...ids);
          }
          db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
          audit(user.id, "TRANSACTIONS_BULK_CATEGORY_UPDATED", { updated: result.changes, category }, req);
          return send(res, 200, { updated: result.changes });
        }
        return send(res, 400, { error: "Ação em massa inválida." });
      }

      const match = url.pathname.match(/^\/api\/transactions\/(\d+)$/);
      if (match && req.method === "PUT") {
        const body = normalizeManualTransaction(await readJson(req));
        const validation = validateTransaction(body);
        if (validation) return send(res, 400, { error: validation });
        if (!categoryExists(user.id, body.category.trim())) return send(res, 400, { error: "Categoria não encontrada." });
        const planError = validateInstallmentPlan(body);
        if (planError) return send(res, 400, { error: planError });
        const transactionId = Number(match[1]);
        const existing = db.prepare("SELECT description, category, source, date, installment_number, installment_total FROM transactions WHERE id = ? AND user_id = ?").get(transactionId, user.id);
        if (!existing) return send(res, 404, { error: "Transação não encontrada." });
        const linked = db.prepare("SELECT id, installment_number, installment_total FROM planned_installments WHERE user_id = ? AND linked_transaction_id = ? AND status = 'realizada'").get(user.id, transactionId);
        const realizedFromSource = db.prepare("SELECT id FROM planned_installments WHERE user_id = ? AND source_transaction_id = ? AND status = 'realizada'").all(user.id, transactionId);
        const hadSourcePlans = Boolean(db.prepare("SELECT id FROM planned_installments WHERE user_id = ? AND source_transaction_id = ? LIMIT 1").get(user.id, transactionId));
        if (linked && body.installmentPlan && (Number(body.installmentPlan.currentNumber) !== linked.installment_number || Number(body.installmentPlan.total) !== linked.installment_total))
          return send(res, 400, { error: "Esta parcela já está vinculada a outra compra. Mantenha a numeração ou remova a marcação de parcela." });
        if (realizedFromSource.length && (!body.installmentPlan || Number(body.installmentPlan.currentNumber) !== existing.installment_number || Number(body.installmentPlan.total) !== existing.installment_total || body.date !== existing.date))
          return send(res, 400, { error: "Há parcelas já vinculadas a esta compra. A numeração, a data e a marcação de parcela não podem ser alteradas." });
        const meta = classificationMetadata(user.id, body.description.trim(), Number(body.value), body.category.trim());
        db.exec("BEGIN");
        try {
          db.prepare(`
            UPDATE transactions
            SET description = ?, value = ?, date = ?, category = ?, type = ?, classification_confidence = ?, classification_source = ?, payment_method = ?, transaction_status = ?, source = ?, note = ?, installment_number = ?, installment_total = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
          `).run(body.description.trim(), Number(body.value), body.date, body.category.trim(), meta.type, meta.classification_confidence, meta.classification_source, cleanPaymentMethod(body.paymentMethod || body.payment_method), cleanTransactionStatus(body.status || body.transaction_status), existing.source || "manual", cleanTransactionNote(body.note), body.installmentPlan ? Number(body.installmentPlan.currentNumber) : null, body.installmentPlan ? Number(body.installmentPlan.total) : null, transactionId, user.id);
          if (linked && !body.installmentPlan) db.prepare("UPDATE planned_installments SET status = 'prevista', linked_transaction_id = NULL WHERE id = ? AND user_id = ?").run(linked.id, user.id);
          db.prepare("DELETE FROM planned_installments WHERE user_id = ? AND source_transaction_id = ? AND status = 'prevista'").run(user.id, transactionId);
          if (body.installmentPlan && !linked) {
            const matchedExisting = hadSourcePlans || Number(body.installmentPlan.currentNumber) === 1 ? 0 : autoReconcileTransaction(user.id, transactionId);
            if (!matchedExisting) createFutureInstallments(user.id, transactionId, body);
          }
          if (existing.category !== body.category.trim()) learnCategoryRule(user.id, body.description.trim(), body.category.trim());
          db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
        audit(user.id, "TRANSACTION_UPDATED", { transactionId }, req);
        return send(res, 200, { ok: true });
      }

      if (match && req.method === "DELETE") {
        db.prepare("UPDATE planned_installments SET status = 'prevista', linked_transaction_id = NULL WHERE user_id = ? AND linked_transaction_id = ?").run(user.id, Number(match[1]));
        const result = db.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").run(Number(match[1]), user.id);
        if (result.changes === 0) return send(res, 404, { error: "Transação não encontrada." });
        db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
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

    if (url.pathname === "/api/goal") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de usar metas." });
      const existing = getUserGoals(user.id)[0] || null;
      if (req.method === "GET") return send(res, 200, { goal: existing });
      if (req.method === "PUT") {
        const body = await readJson(req);
        const objective = String(body.objective || "");
        const target = Number(body.targetValue);
        const saved = objective === "juntar" ? Number(body.savedAmount || 0) : 0;
        const category = objective === "reduzir" ? String(body.targetCategory || "").trim() : null;
        const deadline = objective === "juntar" ? String(body.deadline || "") : null;
        if (!["reduzir", "economizar", "juntar"].includes(objective)) return send(res, 400, { error: "Escolha uma das metas disponíveis." });
        if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(saved) || saved < 0 || saved > target) return send(res, 400, { error: "Informe valores válidos; o valor guardado deve estar entre zero e o total da meta." });
        if (objective === "reduzir" && (!categoryExists(user.id, category) || ["Receita", "Metas", "Transferência própria", "Categoria pendente"].includes(category))) return send(res, 400, { error: "Escolha uma categoria de despesa." });
        if (objective === "juntar" && (!validDate(deadline) || deadline < new Date().toISOString().slice(0, 10))) return send(res, 400, { error: "Informe um prazo válido a partir de hoje." });
        const name = { reduzir: "Reduzir gastos em uma categoria", economizar: "Economizar por mês", juntar: "Juntar dinheiro para um objetivo" }[objective];
        db.exec("BEGIN");
        let id;
        try {
          db.prepare("UPDATE financial_goals SET is_primary = 0 WHERE user_id = ?").run(user.id);
          if (existing) {
            id = existing.id;
            db.prepare("UPDATE financial_goals SET goal_name = ?, objective = ?, target_value = ?, saved_amount = ?, target_category = ?, deadline = ?, intensity = 'equilibrado', is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").run(name, objective, target, saved, category, deadline, id, user.id);
          } else {
            id = db.prepare("INSERT INTO financial_goals (user_id, goal_name, objective, target_value, saved_amount, target_category, deadline, target_months, intensity, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'equilibrado', 1)").run(user.id, name, objective, target, saved, category, deadline).lastInsertRowid;
          }
          db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
          audit(user.id, "FINANCIAL_GOAL_UPDATED", { goalId: id, objective }, req);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
        return send(res, 200, { ok: true, id });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/ai/analysis") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo para liberar a análise financeira." });
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const selectedMonth = normalizeMonthParam(url.searchParams.get("month")) || currentMonth;
      const previousCalendarMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthKey = `${previousCalendarMonth.getFullYear()}-${String(previousCalendarMonth.getMonth() + 1).padStart(2, "0")}`;
      const periodStatus = selectedMonth === currentMonth ? "current" : selectedMonth === previousMonthKey ? "previous" : "historical";
      const rows = db.prepare("SELECT id, description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, note, installment_number, installment_total, created_at, updated_at FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC").all(user.id);
      const goals = getUserGoals(user.id);
      const goal = goals[0] || null;

      const selectedRows = filterTransactionsForMonth(rows, selectedMonth);
      const budgets = getCategoryBudgets(user.id, selectedMonth);
      const localAnalysis = buildFinancialAnalysis(rows, periodStatus === "historical" ? null : goal, budgets, { month: selectedMonth });
      localAnalysis.periodStatus = periodStatus;
      localAnalysis.upcomingInstallments = upcomingInstallments(user.id);
      const nextMonth = localAnalysis.upcomingInstallments.months[0];
      if (periodStatus !== "historical" && nextMonth.total > 0) localAnalysis.recommendations.push({ title: "Parcelas do próximo mês", message: `${formatBRL(nextMonth.total)} em ${nextMonth.count} parcela(s) previstas para ${nextMonth.month}. Planeje esse compromisso; previsão não é gasto realizado.` });

      const useOpenAI = url.searchParams.get("useAI") === "1";
      const shouldSave = url.searchParams.has("useAI") && periodStatus !== "historical" && Boolean(goal) && !localAnalysis.pendingCount && localAnalysis.transactionCount > 0;
      const forceRefresh = url.searchParams.get("refreshAI") === "1";

      const requestSummary = periodStatus === "historical" ? null : summarizeOpenAIRequest(localAnalysis);
      const aiResult = periodStatus !== "historical" && useOpenAI && goal && !localAnalysis.pendingCount
        ? await getPersonalizedAIPlan(user.id, rows, goal, localAnalysis, { forceRefresh })
        : { plan: null, source: "local", model: null, cached: false, warning: null };

      const analysisResponse = {
        ...localAnalysis,
        ai: aiResult.plan,
        openAIRequestSummary: requestSummary,
        aiStatus: {
          source: aiResult.source,
          model: aiResult.model,
          cached: aiResult.cached,
          warning: aiResult.warning,
        },
      };
      const fingerprint = generateFinancialAnalysisHash(user.id, rows, localAnalysis.categoryBudgets, localAnalysis.goals || goal, selectedMonth, localAnalysis.upcomingInstallments);
      if (shouldSave) {
        saveAnalysisHistory(user.id, selectedMonth, fingerprint, analysisResponse, requestSummary);
        audit(user.id, "ANALYSIS_GENERATED", { month: selectedMonth, source: analysisResponse.ai ? "openai" : "local", transactions: selectedRows.length }, req);
      }
      analysisResponse.savedAnalysis = latestSavedAnalysis(user.id, selectedMonth, fingerprint);
      return send(res, 200, analysisResponse);
    }

    if (req.method === "POST" && url.pathname === "/api/import/file") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de importar extratos." });
      const uploaded = await readUploadedStatement(req);
      const extension = path.extname(uploaded.filename).toLowerCase();

      let parsed;
      if (extension === ".csv") parsed = importTransactionsFromCSV(uploaded.buffer);
      else if ([".xlsx", ".xls"].includes(extension)) parsed = importTransactionsFromExcel(uploaded.buffer);
      else return send(res, 400, { error: "Formato não suportado. Envie CSV, XLSX ou XLS." });
      const mapping = suggestImportMapping(parsed.columns, parsed.rows);
      const preset = detectImportPreset(uploaded.filename, parsed.columns, parsed.layout);
      const hasValueMapping = mapping.value || mapping.debitValue || mapping.creditValue;
      const preview = mapping.date && mapping.description && hasValueMapping
        ? await buildSmartImportPreview(user.id, parsed.rows, mapping)
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
          ? "Arquivo lido. As regras locais sugeriram tipo e categoria; revise a prévia antes de confirmar."
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
      const preview = await buildSmartImportPreview(user.id, rows, mapping);
      return send(res, 200, preview);
    }

    if (req.method === "POST" && url.pathname === "/api/import/transactions") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de importar extratos." });
      const body = await readJson(req);
      const learnedRules = loadCategoryRules(user.id);
      const items = Array.isArray(body.transactions) ? body.transactions.map(item => {
        if (!item.descriptionEdited || item.categoryManuallyEdited) return item;
        const suggestion = categorize(item.description, learnedRules);
        return { ...item, category: suggestion.category, confidence: suggestion.confidence };
      }) : [];
      if (items.length === 0) return send(res, 400, { error: "Nenhuma transação para importar." });
      if (items.length > 500) return send(res, 400, { error: "O limite é de 500 lançamentos por importação, incluindo partes divididas." });
      for (const item of items) {
        const validation = validateTransaction(item);
        if (validation) return send(res, 400, { error: validation });
        if (!categoryExists(user.id, item.category.trim())) return send(res, 400, { error: "Categoria não encontrada. Atualize a prévia." });
        const planError = validateInstallmentPlan(item);
        if (planError) return send(res, 400, { error: planError });
        if (item.installmentPlan && item.plannedInstallmentId) return send(res, 400, { error: "Escolha entre criar parcelas futuras e vincular uma previsão existente." });
        if (item.plannedInstallmentId && Number(item.value) >= 0) return send(res, 400, { error: "Vincule parcelas previstas apenas a despesas." });
      }
      const linkedIds = items.map(item => item.plannedInstallmentId).filter(Boolean).map(Number);
      if (linkedIds.some(id => !Number.isInteger(id) || id <= 0) || new Set(linkedIds).size !== linkedIds.length) return send(res, 400, { error: "Cada parcela prevista pode ser vinculada a apenas um lançamento." });
      for (const id of linkedIds) {
        if (!db.prepare("SELECT id FROM planned_installments WHERE id = ? AND user_id = ? AND status = 'prevista'").get(id, user.id)) return send(res, 400, { error: "Parcela prevista não encontrada ou já realizada." });
      }
      const splitError = validateSplitGroups(items);
      if (splitError) return send(res, 400, { error: splitError });
      const insert = db.prepare("INSERT INTO transactions (user_id, description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, external_id, installment_number, installment_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const insertPlanned = db.prepare("INSERT INTO planned_installments (user_id, source_transaction_id, installment_number, installment_total, due_date, amount, category) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const linkPlanned = db.prepare("UPDATE planned_installments SET linked_transaction_id = ?, status = 'realizada' WHERE id = ? AND user_id = ? AND status = 'prevista'");
      const deduped = detectDuplicateTransactions(user.id, items).filter((item) => !item.duplicate || item.includeDuplicate === true);
      let imported = 0;
      let reconciledInstallments = 0;
      const splitPartNumbers = new Map();
      db.exec("BEGIN");
      try {
        for (const item of deduped) {
          const meta = importedClassificationMetadata(item);
          const sourceId = item.splitOriginal ? importSourceId(item.splitOriginal) : null;
          const partNumber = sourceId ? (splitPartNumbers.get(sourceId) || 0) + 1 : null;
          if (sourceId) splitPartNumbers.set(sourceId, partNumber);
          const linkedPlan = item.plannedInstallmentId ? db.prepare("SELECT installment_number, installment_total FROM planned_installments WHERE id = ? AND user_id = ?").get(Number(item.plannedInstallmentId), user.id) : null;
          const installmentNumber = item.installmentPlan ? Number(item.installmentPlan.currentNumber) : linkedPlan?.installment_number || null;
          const installmentTotal = item.installmentPlan ? Number(item.installmentPlan.total) : linkedPlan?.installment_total || null;
          const transactionId = insert.run(user.id, item.description.trim(), Number(item.value), item.date, item.category.trim(), meta.type, meta.classification_confidence, meta.classification_source, cleanPaymentMethod(item.paymentMethod || "Arquivo importado"), "Concluida", ["csv", "excel"].includes(body.source) ? body.source : "importado", sourceId ? `split:${sourceId}:${partNumber}` : null, installmentNumber, installmentTotal).lastInsertRowid;
          if (item.installmentPlan) {
            const plan = item.installmentPlan;
            for (let number = Number(plan.currentNumber) + 1; number <= Number(plan.total); number++) {
              const plannedId = insertPlanned.run(user.id, transactionId, number, Number(plan.total), addMonthsToDate(item.date, number - Number(plan.currentNumber)), Number(plan.monthlyAmount), item.category.trim()).lastInsertRowid;
              if (autoReconcilePlan(user.id, plannedId)) reconciledInstallments++;
            }
          }
          if (item.plannedInstallmentId) {
            if (linkPlanned.run(transactionId, Number(item.plannedInstallmentId), user.id).changes !== 1) throw new Error("A parcela prevista já foi vinculada. Atualize a prévia.");
            reconciledInstallments++;
          } else if (installmentNumber) {
            reconciledInstallments += autoReconcileTransaction(user.id, transactionId);
          }
          if (item.categoryManuallyEdited && !item.splitOriginal) learnCategoryRule(user.id, item.description.trim(), item.category.trim());
          imported++;
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      if (imported > 0) db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
      audit(user.id, "TRANSACTIONS_IMPORTED", { imported, reconciledInstallments, skippedDuplicates: items.length - deduped.length, source: body.source || "importado" }, req);
      return send(res, 201, { imported, reconciledInstallments, skippedDuplicates: items.length - deduped.length });
    }

    if (req.method === "GET" && url.pathname === "/api/installments") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de consultar parcelas." });
      return send(res, 200, db.prepare("SELECT id, source_transaction_id, due_date, amount, category, installment_number, installment_total FROM planned_installments WHERE user_id = ? AND status = 'prevista' ORDER BY due_date, id").all(user.id));
    }

    const installmentMatch = url.pathname.match(/^\/api\/installments\/(\d+)$/);
    const installmentLinkMatch = url.pathname.match(/^\/api\/installments\/(\d+)\/link$/);
    if (installmentLinkMatch && req.method === "POST") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de alterar parcelas." });
      const transactionId = Number((await readJson(req)).transactionId);
      if (!Number.isInteger(transactionId) || transactionId <= 0) return send(res, 400, { error: "Escolha um lançamento válido." });
      const plan = db.prepare("SELECT id, source_transaction_id, installment_number, installment_total FROM planned_installments WHERE id = ? AND user_id = ? AND status = 'prevista'").get(Number(installmentLinkMatch[1]), user.id);
      if (!plan) return send(res, 404, { error: "Parcela prevista não encontrada." });
      const transaction = db.prepare("SELECT id, value, installment_number, installment_total FROM transactions WHERE id = ? AND user_id = ?").get(transactionId, user.id);
      if (!transaction || transaction.value >= 0 || transaction.id === plan.source_transaction_id) return send(res, 400, { error: "Escolha uma despesa realizada diferente da parcela original." });
      if (transaction.installment_number && (transaction.installment_number !== plan.installment_number || transaction.installment_total !== plan.installment_total)) return send(res, 400, { error: "Este lançamento já está marcado como outra parcela." });
      if (db.prepare("SELECT id FROM planned_installments WHERE linked_transaction_id = ? AND status = 'realizada'").get(transactionId)) return send(res, 400, { error: "Este lançamento já está vinculado a outra parcela." });
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE transactions SET installment_number = ?, installment_total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
          .run(plan.installment_number, plan.installment_total, transactionId, user.id);
        db.prepare("UPDATE planned_installments SET linked_transaction_id = ?, status = 'realizada' WHERE id = ? AND user_id = ? AND status = 'prevista'")
          .run(transactionId, plan.id, user.id);
        db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      audit(user.id, "INSTALLMENT_LINKED", { installmentId: plan.id, transactionId }, req);
      return send(res, 200, { ok: true });
    }
    if (installmentMatch && req.method === "DELETE") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de alterar parcelas." });
      const result = db.prepare("UPDATE planned_installments SET status = 'cancelada' WHERE id = ? AND user_id = ? AND status = 'prevista'").run(Number(installmentMatch[1]), user.id);
      if (!result.changes) return send(res, 404, { error: "Parcela prevista não encontrada." });
      db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
      audit(user.id, "INSTALLMENT_CANCELLED", { installmentId: Number(installmentMatch[1]) }, req);
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/category-rules") {
      const user = requireUser(req, res);
      if (!user) return;
      return send(res, 200, loadCategoryRules(user.id));
    }

    if (req.method === "POST" && url.pathname === "/api/category-rules") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de criar regras de categoria." });
      const body = await readJson(req);
      const saved = saveCategoryRule(user.id, body.merchantPattern || body.merchant_pattern || "", String(body.category || "").trim());
      if (saved.error) return send(res, 400, { error: saved.error });
      audit(user.id, "CATEGORY_RULE_SAVED", { merchantPattern: saved.merchant_pattern, category: saved.category }, req);
      return send(res, 201, saved);
    }

    const categoryRuleMatch = url.pathname.match(/^\/api\/category-rules\/(\d+)$/);
    if (categoryRuleMatch && req.method === "PUT") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de alterar regras de categoria." });
      const id = Number(categoryRuleMatch[1]);
      const existing = db.prepare("SELECT id FROM category_rules WHERE id = ? AND user_id = ?").get(id, user.id);
      if (!existing) return send(res, 404, { error: "Regra não encontrada." });
      const body = await readJson(req);
      const pattern = normalizeDescription(body.merchantPattern || body.merchant_pattern || "");
      const category = String(body.category || "").trim();
      if (pattern.length < 3) return send(res, 400, { error: "Informe um padrão com pelo menos 3 caracteres." });
      if (!category || ["Categoria pendente", "Receita"].includes(category) || !categoryExists(user.id, category)) {
        return send(res, 400, { error: "Escolha uma categoria de gasto válida." });
      }
      if (db.prepare("SELECT id FROM category_rules WHERE user_id = ? AND merchant_pattern = ? AND id <> ?").get(user.id, pattern.slice(0, 80), id)) {
        return send(res, 409, { error: "Já existe uma regra com esse trecho de descrição." });
      }
      db.prepare("UPDATE category_rules SET merchant_pattern = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .run(pattern.slice(0, 80), category, id, user.id);
      db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
      audit(user.id, "CATEGORY_RULE_UPDATED", { ruleId: id, merchantPattern: pattern, category }, req);
      return send(res, 200, { ok: true });
    }

    if (categoryRuleMatch && req.method === "DELETE") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!hasConsent(user.id)) return send(res, 403, { error: "Aceite o termo antes de excluir regras de categoria." });
      const id = Number(categoryRuleMatch[1]);
      const existing = db.prepare("SELECT merchant_pattern, category FROM category_rules WHERE id = ? AND user_id = ?").get(id, user.id);
      if (!existing) return send(res, 404, { error: "Regra não encontrada." });
      db.prepare("DELETE FROM category_rules WHERE id = ? AND user_id = ?").run(id, user.id);
      db.prepare("DELETE FROM ai_analysis_cache WHERE user_id = ?").run(user.id);
      audit(user.id, "CATEGORY_RULE_DELETED", { ruleId: id, merchantPattern: existing.merchant_pattern, category: existing.category }, req);
      return send(res, 200, { ok: true });
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
      const transactions = db.prepare("SELECT description, value, date, category, type, classification_confidence, classification_source, payment_method, transaction_status, source, external_id, note, installment_number, installment_total, created_at, updated_at FROM transactions WHERE user_id = ? ORDER BY date DESC").all(user.id);
      const plannedInstallments = db.prepare(`SELECT p.installment_number, p.installment_total, p.due_date, p.amount, p.category, p.status,
        source.description AS source_description, linked.description AS linked_description
        FROM planned_installments p JOIN transactions source ON source.id = p.source_transaction_id
        LEFT JOIN transactions linked ON linked.id = p.linked_transaction_id
        WHERE p.user_id = ? ORDER BY p.due_date, p.id`).all(user.id);
      const consents = db.prepare(`
        SELECT ct.version, ct.collected_data, ct.purpose, ct.storage, ct.retention, uc.accepted_at, uc.revoked_at
        FROM user_consents uc JOIN consent_terms ct ON ct.id = uc.term_id
        WHERE uc.user_id = ?
      `).all(user.id);
      const goals = getUserGoals(user.id);
      const goal = goals[0] || null;
      const goalContributions = getGoalContributions(user.id, 1000);
      const goalHistory = getGoalChangeHistory(user.id, 1000);
      const categories = db.prepare("SELECT name, monthly_limit, color, is_system, created_at FROM categories WHERE user_id = ? ORDER BY is_system DESC, name").all(user.id);
      const categoryRules = loadCategoryRules(user.id);
      const aiHistory = db.prepare("SELECT month, source, model, summary, request_json, response_json, is_official, created_at FROM ai_analysis_history WHERE user_id = ? ORDER BY id DESC").all(user.id)
        .map((row) => ({ ...row, request: safeJson(row.request_json), response: safeJson(row.response_json), request_json: undefined, response_json: undefined }));
      const auditHistory = db.prepare("SELECT action, details, ip, created_at FROM audit_logs WHERE user_id = ? ORDER BY id DESC").all(user.id)
        .map((row) => ({ ...row, details: safeJson(row.details) }));
      const monthlyClosings = db.prepare("SELECT month, snapshot_json, closed_at FROM monthly_closings WHERE user_id = ? ORDER BY month DESC").all(user.id)
        .map((row) => ({ ...row, snapshot: JSON.parse(row.snapshot_json || "{}"), snapshot_json: undefined }));
      return send(res, 200, { user, consents, goal, goals, goalContributions, goalHistory, monthlyClosings, categories, categoryRules, aiHistory, auditHistory, transactions, plannedInstallments }, {
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
      refreshLocalBackupsAfterErasure();
      if (token) sessions.delete(token);
      return send(res, 200, { ok: true }, { "Set-Cookie": "session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/" });
    }

    return send(res, 404, { error: "Rota não encontrada." });
  } catch (error) {
    const message = String(error.message || "");
    if (message.includes("Requisição acima do limite")) return send(res, 413, { error: message });
    if (error instanceof SyntaxError) return send(res, 400, { error: "O conteúdo enviado não é um JSON válido." });
    if (/Arquivo acima|Envie o arquivo|Arquivo não encontrado/.test(message)) return send(res, 400, { error: message });
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
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  return serveStatic(req, res);
};

function startServer() {
  let server;
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    server = https.createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, serverHandler)
      .listen(PORT, HOST, () => console.log(`Servidor HTTPS em https://${HOST}:${PORT}`));
  } else {
    server = http.createServer(serverHandler)
      .listen(PORT, HOST, () => console.log(`Servidor HTTP de desenvolvimento em http://${HOST}:${PORT}`));
  }
  const backupTimer = setInterval(() => {
    try {
      backupLocalDatabase();
    } catch (error) {
      console.error("Não foi possível atualizar a cópia local:", error.message);
    }
  }, BACKUP_REFRESH_MS);
  backupTimer.unref();
  server.once("close", () => clearInterval(backupTimer));
  return server;
}

function closeApplication() {
  try {
    backupLocalDatabase();
  } finally {
    db.close();
  }
}

if (require.main === module) {
  startServer();
  const shutdown = () => {
    closeApplication();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

module.exports = {
  startServer,
  __test: {
    importTransactionsFromCSV,
    detectImportPreset,
    suggestImportMapping,
    rowToImportCandidate,
    categorize,
    validateTransaction,
    closeDatabase: () => db.close(),
  },
};
