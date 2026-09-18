const readline = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const dataDir = process.env.FINTRACK_DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'app.db');

if (!fs.existsSync(dbPath)) {
  console.error('Banco local não encontrado. Abra o FinTrack pelo menos uma vez antes de redefinir a senha.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = question => new Promise(resolve => rl.question(question, resolve));

async function main() {
  const email = String(await ask('E-mail da conta: ')).trim().toLowerCase();
  const password = String(await ask('Nova senha: '));
  const confirmation = String(await ask('Confirme a nova senha: '));
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('A senha precisa ter no mínimo 8 caracteres, com pelo menos uma letra e um número.');
  }
  if (password !== confirmation) throw new Error('A confirmação não confere.');
  const db = new DatabaseSync(dbPath);
  try {
    const user = db.prepare('SELECT id, name FROM users WHERE lower(email) = ?').get(email);
    if (!user) throw new Error('Nenhuma conta foi encontrada com esse e-mail.');
    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    console.log(`Senha redefinida para ${user.name}. Você já pode entrar no sistema.`);
  } finally {
    db.close();
  }
}

main().catch(error => { console.error(`Não foi possível redefinir: ${error.message}`); process.exitCode = 1; }).finally(() => rl.close());
