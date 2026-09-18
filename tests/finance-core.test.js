const assert = require('node:assert/strict');
const { analyze, validDate, possiblePassThroughs } = require('../finance-core');
const row = (date, value, category = 'Transporte', description = 'Uber') => ({ date, value, category, description });
const history = [row('2026-08-01', -50), row('2026-08-08', -50), row('2026-08-20', -50)];
const data = [...history, row('2026-09-03', -200), row('2026-09-01', 1000, 'Receita', 'Salário'), row('2026-09-01', -400, 'Transferência própria'), row('2026-09-01', 400, 'Transferência própria'), row('2026-09-02', -100, 'Metas'), row('2026-10-01', -99999)];
let result = analyze(data, null, '2026-09');
assert.equal(result.totalIncome, 1000);
assert.equal(result.totalExpenses, 200);
assert.equal(result.balance, 800);
assert.equal(result.excludedTransfers, 3);
assert.ok(result.anomalies.find(item => item.type === 'valor_alto').message.includes('50,00'));
assert.ok(!result.monthlyEvolution.some(item => item.month === '2026-10'));
assert.equal(analyze([row('2026-09-01', -500)], null, '2026-09').anomalies.length, 0);
assert.equal(analyze([], null, '2026-09').totalExpenses, 0);
assert.equal(analyze([row('2026-08-01', -1350, 'Contas fixas', 'Aluguel'), row('2026-08-02', -100, 'Contas fixas', 'Internet'), row('2026-08-03', -150, 'Contas fixas', 'Energia'), row('2026-09-01', -1350, 'Contas fixas', 'Aluguel')], null, '2026-09').anomalies.filter(item => item.type === 'valor_alto').length, 0, 'Aluguel habitual não deve ser comparado com contas menores');
assert.equal(validDate('2026-02-30'), false);
assert.equal(validDate('2024-02-29'), true);
const possible = possiblePassThroughs([
  { id: 1, date: '2026-09-01', value: 177, category: 'Receita' },
  { id: 2, date: '2026-09-02', value: -177.20, category: 'Contas fixas' },
  { id: 3, date: '2026-09-03', value: -177.50, category: 'Contas fixas' },
  { id: 4, date: '2026-09-01', value: 50, category: 'Receita' },
  { id: 5, date: '2026-09-02', value: -51.01, category: 'Compras' },
  { id: 6, date: '2026-09-02', value: 80, category: 'Receita' },
  { id: 7, date: '2026-09-01', value: -80, category: 'Compras' },
]);
assert.equal(possible.get(1).partnerId, 2);
assert.equal(possible.get(2).difference, 0.2);
assert.equal(possible.get(2).daysAfter, 1);
assert.equal(possible.has(3), false, 'Uma entrada não deve combinar com duas saídas');
assert.equal(possible.has(5), false, 'Diferença acima de R$ 1 não combina');
assert.equal(possible.has(6), false, 'A saída precisa acontecer depois da entrada');
result = analyze(data, { objective: 'reduzir', target_category: 'Transporte', target_value: 150 }, '2026-09');
assert.equal(result.goal.status, 'Acima do limite');
assert.equal(result.goal.current, 200);
result = analyze(data, { objective: 'economizar', target_value: 500 }, '2026-09');
assert.equal(result.goal.status, 'Resultado compatível com a meta');
result = analyze(history, { objective: 'economizar', target_value: 500 }, '2026-08');
assert.equal(result.goal.status, 'Informe as entradas');
result = analyze(data, { objective: 'juntar', target_value: 1200, saved_amount: 300, deadline: '2026-11-30' }, '2026-09');
assert.equal(result.goal.monthlyTarget, 300);
assert.equal(result.goal.remainingAmount, 900);
assert.equal(result.goal.progressPercentage, 25);
assert.equal(result.totalExpenses, 200);
assert.equal(analyze(data, { objective: 'juntar', target_value: 1200, saved_amount: 300, deadline: '2026-08-30' }, '2026-09').goal.status, 'Prazo encerrado');
assert.equal(analyze([row('2026-09-01', -5, 'Categoria pendente')], null, '2026-09').pendingCount, 1);
// Pequena avaliação controlada: três cenários de valor alto com referência conhecida.
const cases = [[60, false], [90, false], [200, true]];
let hits = 0;
for (const [value, expected] of cases) {
  const detected = analyze([...history, row('2026-09-01', -value)], null, '2026-09').anomalies.some(item => item.type === 'valor_alto');
  if (detected === expected) hits++;
  assert.equal(detected, expected);
}
console.log(`Cálculos e metas OK; cenários controlados de anomalia: ${hits}/${cases.length}. Não é uma estimativa de desempenho em dados reais.`);
