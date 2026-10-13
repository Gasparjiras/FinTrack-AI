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

function askHidden(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return ask(question);
  rl.pause();
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = buffer => {
      for (const character of buffer.toString('utf8')) {
        if (character === '\u0003') {
          finish();
          reject(new Error('Operação cancelada.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

async function main() {
  const email = String(await ask('E-mail da conta: ')).trim().toLowerCase();
  const password = String(await askHidden('Nova senha (a digitação ficará oculta): '));
  const confirmation = String(await askHidden('Confirme a nova senha: '));
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
