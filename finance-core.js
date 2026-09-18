// Cálculos determinísticos: não dependem da API de IA nem do banco de dados.
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const monthOf = row => String(row.date).slice(0, 7);
const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const isFinancial = row => !['Transferência própria', 'Metas'].includes(row.category);
const expense = row => row.value < 0 && isFinancial(row);
const sum = rows => round(rows.reduce((total, row) => total + Math.abs(row.value), 0));
function previousMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function possiblePassThroughs(transactions) {
  const eligible = transactions.filter(row => row.id != null && validDate(row.date) && Number.isFinite(Number(row.value)) && !['Transferência própria', 'Metas'].includes(row.category));
  const income = eligible.filter(row => Number(row.value) > 0);
  const expenses = eligible.filter(row => Number(row.value) < 0);
  const usedIncome = new Set();
  const matches = new Map();
  const day = date => Date.parse(`${date}T00:00:00Z`) / 86400000;
  for (const expense of expenses.sort((a, b) => a.date.localeCompare(b.date) || Number(a.id) - Number(b.id))) {
    const candidates = income.filter(entry => {
      const daysAfter = day(expense.date) - day(entry.date);
      return !usedIncome.has(entry.id) && daysAfter >= 0 && daysAfter <= 1 &&
        Math.abs(Math.round(Number(entry.value) * 100) - Math.round(Math.abs(Number(expense.value)) * 100)) <= 100;
    }).sort((a, b) =>
      Math.abs(Math.round(Number(a.value) * 100) - Math.round(Math.abs(Number(expense.value)) * 100)) -
      Math.abs(Math.round(Number(b.value) * 100) - Math.round(Math.abs(Number(expense.value)) * 100)) ||
      day(expense.date) - day(a.date) - (day(expense.date) - day(b.date)) || Number(a.id) - Number(b.id));
    const entry = candidates[0];
    if (!entry) continue;
    usedIncome.add(entry.id);
    const difference = Math.abs(Math.round(Number(entry.value) * 100) - Math.round(Math.abs(Number(expense.value)) * 100)) / 100;
    const daysAfter = day(expense.date) - day(entry.date);
    matches.set(entry.id, { role: 'entrada', partnerId: expense.id, difference, daysAfter });
    matches.set(expense.id, { role: 'saida', partnerId: entry.id, difference, daysAfter });
  }
  return matches;
}
function goalMetrics(goal, summary, categories, month) {
  if (!goal) return null;
  const objective = ['reduzir', 'economizar', 'juntar'].includes(goal.objective) ? goal.objective : 'juntar';
  const target = Number(goal.target_value);
  const saved = Number(goal.saved_amount || 0);
  const current = objective === 'reduzir' ? categories.find(item => item.category === goal.target_category)?.total || 0 : summary.balance;
  let deadline = goal.deadline;
  if (!deadline) {
    const start = String(goal.created_at || month).slice(0, 7).split('-').map(Number);
    deadline = new Date(Date.UTC(start[0], start[1] - 1 + Number(goal.target_months || 1), 1)).toISOString().slice(0, 10);
  }
  const [year, number] = month.split('-').map(Number);
  const [endYear, endMonth] = deadline.split('-').map(Number);
  const monthsRemaining = Math.max(0, (endYear - year) * 12 + endMonth - number + 1);
  const remainingAmount = round(Math.max(0, target - saved));
  const monthlyTarget = objective === 'juntar' ? (monthsRemaining ? round(remainingAmount / monthsRemaining) : 0) : target;
  let status, message;
  if (objective === 'reduzir') {
    status = current > target ? 'Acima do limite' : 'Dentro do limite no período';
    message = `${goal.target_category}: ${money(current)} registrados para um limite de ${money(target)}. ${current > target ? `O limite foi ultrapassado em ${money(current - target)}.` : `Restam ${money(target - current)} até o limite.`}`;
  } else if (objective === 'economizar') {
    status = !summary.totalIncome ? 'Informe as entradas' : current >= target ? 'Resultado compatível com a meta' : 'Meta ainda não alcançada';
    message = summary.totalIncome ? `O resultado registrado é ${money(current)} e o objetivo mensal é ${money(target)}. Resultado positivo indica sobra nos lançamentos do mês, mas não confirma que esse valor foi guardado.` : 'Registre as entradas do período para comparar o resultado com a meta de economia.';
  } else {
    status = remainingAmount === 0 ? 'Meta concluída' : !monthsRemaining ? 'Prazo encerrado' : 'Em andamento';
    message = `Faltam ${money(remainingAmount)} para a meta. ` + (remainingAmount === 0 ? 'Valor guardado informado pelo usuário.' : !monthsRemaining ? 'Atualize o prazo para obter uma nova estimativa mensal.' : `Estimativa de ${money(monthlyTarget)} por mês até ${deadline.split('-').reverse().join('/')}. O valor guardado é informado por você.`);
  }
  return { ...goal, objective, deadline, status, message, remainingAmount, monthlyTarget, monthsRemaining, current,
    progressPercentage: objective === 'juntar' ? Math.min(100, round(saved / target * 100)) : null };
}
function analyze(transactions, goal, month) {
  const rows = transactions.filter(row => monthOf(row) === month);
  const financial = rows.filter(isFinancial);
  const expenses = financial.filter(expense);
  const totalIncome = sum(financial.filter(row => row.value > 0));
  const totalExpenses = sum(expenses);
  const balance = round(totalIncome - totalExpenses);
  const totals = new Map();
  for (const row of expenses) totals.set(row.category, round((totals.get(row.category) || 0) + Math.abs(row.value)));
  const categories = [...totals].map(([category, total]) => ({ category, total, share: totalExpenses ? round(total / totalExpenses * 100) : 0 })).sort((a, b) => b.total - a.total);
  const pendingCount = rows.filter(row => row.category === 'Categoria pendente').length;
  const previous = previousMonth(month);
  const prior = transactions.filter(row => monthOf(row) === previous && isFinancial(row));
  const historical = transactions.filter(row => monthOf(row) < month && expense(row));
  const anomalies = [];
  // Compare apenas com observações anteriores; o gasto avaliado não compõe a referência.
  for (const row of expenses.filter(row => row.category !== 'Categoria pendente')) {
    const sameDescription = historical.filter(item => item.category === row.category && normalize(item.description) === normalize(row.description));
    const baseline = sameDescription.length ? sameDescription : historical.filter(item => item.category === row.category);
    if (baseline.length < 3) continue;
    const average = sum(baseline) / baseline.length;
    if (Math.abs(row.value) >= average * 1.8 && Math.abs(row.value) >= 100) anomalies.push({ type: 'valor_alto', severity: 'atencao', title: 'Gasto acima do histórico', message: `${row.description}: ${money(Math.abs(row.value))}, comparado à média anterior de ${money(average)} ${sameDescription.length ? 'para a mesma descrição' : `em ${row.category}`} (${baseline.length} registros).` });
  }
  const priorExpenses = prior.filter(expense);
  for (const item of categories.filter(item => item.category !== 'Categoria pendente')) {
    const baseline = priorExpenses.filter(row => row.category === item.category);
    const before = sum(baseline);
    if (before > 0 && item.total > before * 1.3 && item.total - before >= 50) anomalies.push({ type: 'aumento_mensal', severity: 'atencao', title: `${item.category} aumentou`, message: `${money(item.total)} registrados neste mês contra ${money(before)} no mês anterior. Confira se os dois períodos estão completos.` });
    const count = expenses.filter(row => row.category === item.category).length;
    if (baseline.length >= 3 && count >= baseline.length * 2) anomalies.push({ type: 'frequencia', severity: 'info', title: `Maior frequência em ${item.category}`, message: `${count} lançamentos neste mês contra ${baseline.length} no anterior. A comparação considera apenas os registros disponíveis.` });
  }
  const repeats = new Map();
  for (const row of expenses) {
    const key = `${normalize(row.description)}|${row.category}`;
    const item = repeats.get(key) || { description: row.description, category: row.category, count: 0, total: 0 };
    item.count++; item.total = round(item.total + Math.abs(row.value)); repeats.set(key, item);
  }
  const recurring = [...repeats.values()].filter(item => item.count >= 2).sort((a, b) => b.total - a.total);
  const summary = { totalIncome, totalExpenses, balance };
  const goalPlan = goalMetrics(goal, summary, categories, month);
  const insights = [];
  if (!rows.length) insights.push('Nenhum lançamento neste período. Importe um arquivo ou cadastre os registros.');
  if (!totalIncome && totalExpenses) insights.push('Há apenas despesas registradas. Informe as entradas para avaliar a capacidade de economia.');
  if (pendingCount) insights.push(`${pendingCount} lançamento(s) precisam de categoria. Revise antes de gerar recomendações.`);
  if (historical.length < 3) insights.push('Histórico insuficiente para avaliar gastos atípicos por valor. Importe períodos anteriores.');
  insights.push('Os resultados consideram somente os registros disponíveis; um mês parcial não representa o fechamento mensal.');
  const recommendations = [];
  if (goalPlan) {
    recommendations.push({ title: 'Sua meta', message: goalPlan.message });
    const focus = goalPlan.objective === 'reduzir' ? categories.find(item => item.category === goalPlan.target_category) : categories.find(item => ['Assinaturas', 'Lazer', 'Compras', 'Alimentação'].includes(item.category));
    if (focus) recommendations.push({ title: `Revisar ${focus.category}`, message: `${money(focus.total)} registrados em ${focus.category}. Confira os lançamentos e identifique despesas ajustáveis antes de definir uma redução; preserve os gastos essenciais.` });
    recommendations.push({ title: 'Acompanhar o próximo período', message: 'Atualize os lançamentos e compare novamente com a meta. As recomendações são educativas e dependem da qualidade dos registros.' });
  }
  const monthlyEvolution = [...new Set(transactions.map(monthOf).filter(value => value <= month))].sort().map(value => {
    const items = transactions.filter(row => monthOf(row) === value && isFinancial(row));
    const income = sum(items.filter(row => row.value > 0)), out = sum(items.filter(expense));
    return { month: value, income, expenses: out, balance: round(income - out) };
  });
  return { ...summary, selectedMonth: month, previousMonth: previous, categories, categoryRanking: categories, goal: goalPlan,
    anomalies: anomalies.slice(0, 6), recurring, recommendations, insights, pendingCount, transactionCount: rows.length,
    monthlyEvolution, monthlyComparison: prior.length ? { previousExpenses: sum(priorExpenses), currentExpenses: totalExpenses, difference: round(totalExpenses - sum(priorExpenses)), summary: `Despesas: ${money(totalExpenses)} neste período e ${money(sum(priorExpenses))} no anterior. Compare períodos completos.` } : null,
    excludedTransfers: rows.length - financial.length, months: 1, monthlyIncome: totalIncome, monthlyExpenses: totalExpenses, monthlyBalance: balance,
    potentialMonthlySavings: 0, categoryBudgets: [], categoryBudgetSuggestions: [], budgetAlerts: [],
    aiBlocks: { diagnosis: insights, mainExpenses: [], savingsOpportunities: recommendations.map(item => item.message), goalPlan: goalPlan ? [goalPlan.message] : [], nextActions: recommendations.map(item => item.message), educationInsight: 'Revise os registros para compreender seus hábitos.', weeklyPlan: [] } };
}
module.exports = { analyze, goalMetrics, validDate, previousMonth, possiblePassThroughs };
