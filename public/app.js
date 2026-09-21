const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const editIcon = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13 7 4 4"/></svg>';
const deleteIcon = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14M10 10v7M14 10v7"/></svg>';
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const monthLabel = month => { const [year, number] = month.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, number - 1, 1)); };
const shiftMonth = (month, offset) => { const [year, number] = month.split('-').map(Number); return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7); };
const formData = form => Object.fromEntries(new FormData(form));
const titles = { dashboard: 'Visão geral', gastos: 'Lançamentos', categorias: 'Categorias', metas: 'Minha meta', ia: 'Análise e recomendações', configuracoes: 'Configurações' };
const viewHashes = { dashboard: 'visao-geral', gastos: 'lancamentos', categorias: 'categorias', metas: 'minha-meta', ia: 'analise', configuracoes: 'configuracoes' };
const hashViews = Object.fromEntries(Object.entries(viewHashes).map(([view, hash]) => [hash, view]));
const viewFromHash = () => hashViews[location.hash.slice(1)] || 'dashboard';
let state = { transactions: [], categories: [], categoryRules: [], plannedInstallments: [], goal: null, analysis: null, consent: true, month: today().slice(0, 7), view: 'dashboard', page: 1, rulePage: 1, aiConfigured: false };
let imported = { rows: [], candidates: [], source: 'importado' };
const selectedTransactionIds = new Set();
let chart, toastTimer, suggestionTimer, previewSuggestionTimer, manualCategory = false, analysisVersion = 0, generated = false, periodChosen = false;
$('#analysisMonth').value = state.month;

function toast(text, error = false) {
  clearTimeout(toastTimer); $('#message').textContent = text; $('#message').hidden = false;
  $('#message').classList.toggle('error-message', error);
  toastTimer = setTimeout(() => { $('#message').hidden = true; }, 6500);
}
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options, headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}
function on(selector, event, handler) {
  $(selector).addEventListener(event, async e => {
    if (event === 'submit') e.preventDefault();
    const button = event === 'submit' ? e.currentTarget.querySelector('button:not([type="button"])') : e.target.closest('button');
    if (button) button.disabled = true;
    try { await handler(e); } catch (error) {
      toast(error.message, true);
      if (selector === '#analyzeBtn') $('#analysisFreshness').textContent = 'Não foi possível atualizar a análise. Tente novamente.';
    }
    finally { if (button) button.disabled = false; updateGate(); }
  });
}
function showView(view, updateUrl = true) {
  if (!titles[view]) view = 'dashboard';
  if (!state.consent && view !== 'configuracoes') view = 'configuracoes';
  state.view = view;
  $$('[data-page]').forEach(section => { section.hidden = section.dataset.page !== view; });
  $('#overviewMonthNav').hidden = view !== 'dashboard';
  $$('.sidebar [data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#pageTitle').textContent = titles[view];
  if (view === 'dashboard') renderChart();
  if (updateUrl && location.hash !== `#${viewHashes[view]}`) location.hash = viewHashes[view];
}
function setMobileMenu(open) {
  $('#appSidebar').classList.toggle('open', open);
  $('#sidebarBackdrop').classList.toggle('visible', open);
  $('#mobileMenuButton').setAttribute('aria-expanded', String(open));
  $('#mobileMenuButton').setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  document.body.classList.toggle('mobile-menu-open', open);
  if (open) $('#sidebarCloseButton').focus();
}
$('#mobileMenuButton').addEventListener('click', () => setMobileMenu(!$('#appSidebar').classList.contains('open')));
$('#sidebarCloseButton').addEventListener('click', () => setMobileMenu(false));
$('#sidebarBackdrop').addEventListener('click', () => setMobileMenu(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#appSidebar').classList.contains('open')) {
    setMobileMenu(false);
    $('#mobileMenuButton').focus();
  }
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) {
    showView(button.dataset.view);
    if (matchMedia('(max-width: 700px)').matches) setMobileMenu(false);
  }
});
window.addEventListener('resize', () => {
  if (!matchMedia('(max-width: 700px)').matches && $('#appSidebar').classList.contains('open')) setMobileMenu(false);
});
window.addEventListener('hashchange', () => {
  if (!$('#appPanel').hidden && state.view !== viewFromHash()) showView(viewFromHash(), false);
});
$$('[data-auth]').forEach(button => button.addEventListener('click', () => {
  $('#loginForm').hidden = button.dataset.auth !== 'login'; $('#registerForm').hidden = button.dataset.auth !== 'register';
  $$('[data-auth]').forEach(item => item.classList.toggle('active', item === button));
}));
on('#loginForm', 'submit', async event => { await api('/api/login', { method: 'POST', body: JSON.stringify(formData(event.target)) }); await boot(); });
on('#registerForm', 'submit', async event => {
  const data = formData(event.target);
  if (data.password !== data.confirmPassword) throw new Error('A confirmação da senha não confere.');
  await api('/api/register', { method: 'POST', body: JSON.stringify({ ...data, consentAccepted: Boolean(data.consentAccepted) }) }); await boot();
});
on('#demoLoginBtn', 'click', async () => { await api('/api/demo/login', { method: 'POST', body: '{}' }); await boot(); });
on('#logoutBtn', 'click', async () => {
  if (!confirm('Deseja realmente sair da sua conta?')) return;
  await api('/api/logout', { method: 'POST', body: '{}' });
  location.reload();
});

async function boot() {
  const me = await api('/api/me');
  state.consent = me.consentAccepted;
  $('#userName').textContent = me.user.name;
  $('#userName').title = me.user.name;
  $('#userEmail').textContent = me.user.email;
  $('#userEmail').title = me.user.email;
  $('#userInitials').textContent = String(me.user.name || me.user.email || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  $('#demoBadge').hidden = !me.user.is_demo;
  $('#authPanel').hidden = true; $('#appPanel').hidden = false;
  $('#consentNotice').hidden = state.consent;
  $('#acceptConsentBtn').hidden = state.consent;
  $('#revokeConsentBtn').hidden = !state.consent;
  const status = await api('/api/ai/status');
  state.aiConfigured = status.configured;
  $('#aiStatus').textContent = status.message;
  $('#useAI').disabled = !status.configured;
  if (!status.configured) $('#useAI').checked = false;
  if (state.consent) await refresh();
  resetTransaction(); showView(state.consent ? viewFromHash() : 'configuracoes', false);
}
async function refresh() {
  const version = ++analysisVersion;
  const transactions = await api('/api/transactions');
  if (version !== analysisVersion) return;
  if (!periodChosen && transactions.length) {
    const months = [...new Set(transactions.map(item => item.date.slice(0, 7)))].sort();
    state.month = months.filter(month => month <= today().slice(0, 7)).at(-1) || today().slice(0, 7);
    periodChosen = true;
  }
  const month = state.month;
  const [categories, categoryRules, plannedInstallments, goals, analysis] = await Promise.all([
    api(`/api/categories?month=${month}`), api('/api/category-rules'), api('/api/installments'), api('/api/goal'), api(`/api/ai/analysis?month=${month}`),
  ]);
  if (version !== analysisVersion) return;
  const wasGenerated = generated;
  Object.assign(state, { transactions, categories, categoryRules, plannedInstallments, goal: goals.goal, analysis });
  selectedTransactionIds.clear();
  generated = Boolean(analysis.savedAnalysis);
  $('#analysisMethod').open = false;
  $('#analysisFreshness').textContent = analysis.periodStatus === 'historical'
    ? 'Consulta histórica atualizada com os lançamentos disponíveis.'
    : analysis.savedAnalysis?.stale
      ? 'A última análise continua disponível, mas existem alterações posteriores. Gere novamente para atualizar as recomendações.'
      : analysis.savedAnalysis
        ? 'A última análise ainda corresponde aos lançamentos, à meta, às parcelas e ao modelo atuais.'
        : wasGenerated ? 'Dados ou período atualizados. Gere novamente as recomendações.' : 'Indicadores atualizados. Gere a análise depois de revisar os registros e escolher uma meta.';
  syncPeriodControls();
  renderCategories(); renderCategoryRules(); renderTransactions(); fillGoal(); renderOverview(); renderAnalysis(); updateGate();
}
function syncPeriodControls() {
  $('#analysisMonth').value = state.month;
  const date = new Date();
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
  const months = [...new Set([today().slice(0, 7), previousMonth, state.month, ...state.transactions.map(item => item.date.slice(0, 7))])].sort().reverse();
  $('#analysisPeriodSelect').innerHTML = months.map(month => `<option value="${month}">${escapeHtml(monthLabel(month))}${state.transactions.some(item => item.date.startsWith(month)) ? '' : ' · sem lançamentos'}</option>`).join('');
  $('#analysisPeriodSelect').value = state.month;
}
async function changeMonth(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) { syncPeriodControls(); return; }
  const previousMonth = state.month, previousChoice = periodChosen;
  state.month = value; periodChosen = true; state.page = 1;
  try { if (state.consent) await refresh(); }
  catch (error) { state.month = previousMonth; periodChosen = previousChoice; syncPeriodControls(); updateOverviewMonthNav(); throw error; }
}
on('#analysisMonth', 'change', async event => changeMonth(event.target.value));
on('#analysisPeriodSelect', 'change', async event => changeMonth(event.target.value));
function updateOverviewMonthNav() {
  const months = state.transactions.map(item => item.date.slice(0, 7)).filter(month => month <= today().slice(0, 7)).sort();
  const earliest = months[0] || today().slice(0, 7);
  const displayed = monthLabel(state.month);
  $('#overviewMonthName').textContent = displayed.charAt(0).toLocaleUpperCase('pt-BR') + displayed.slice(1);
  $('#overviewPrevMonth').disabled = state.month <= earliest;
  $('#overviewNextMonth').disabled = state.month >= today().slice(0, 7);
}
async function moveOverviewMonth(offset) {
  const next = shiftMonth(state.month, offset);
  const months = state.transactions.map(item => item.date.slice(0, 7)).filter(month => month <= today().slice(0, 7)).sort();
  if (next < (months[0] || today().slice(0, 7)) || next > today().slice(0, 7)) return;
  $('#overviewPrevMonth').disabled = true; $('#overviewNextMonth').disabled = true;
  try { await changeMonth(next); }
  catch (error) { toast(error.message, true); updateOverviewMonthNav(); }
}
$('#overviewPrevMonth').addEventListener('click', () => moveOverviewMonth(-1));
$('#overviewNextMonth').addEventListener('click', () => moveOverviewMonth(1));
function categoryOptions(selected, expensesOnly = false) {
  return state.categories.filter(item => item.name !== 'Metas' || selected === 'Metas').filter(item => !expensesOnly || !['Receita', 'Metas', 'Transferência própria', 'Categoria pendente'].includes(item.name))
    .map(item => `<option value="${escapeHtml(item.name)}" ${selected === item.name ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
}
function categoryColor(name) {
  const color = state.categories.find(item => item.name === name)?.color;
  return /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#64748b';
}
function renderCategories() {
  const select = $('#transactionForm').elements.category;
  select.innerHTML = categoryOptions(select.value || 'Categoria pendente');
  const target = $('#goalForm').elements.targetCategory;
  target.innerHTML = categoryOptions(target.value, true);
  $('#categoriesList').innerHTML = state.categories.filter(item => item.name !== 'Metas')
    .sort((a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name, 'pt-BR'))
    .map(item => `<div class="category-chip"><i style="background:${/^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#64748b'}"></i><span>${escapeHtml(item.name)}</span>${item.is_system ? '<small>Padrão</small>' : `<button class="secondary icon-button" data-edit-category="${item.id}" type="button" aria-label="Editar categoria ${escapeHtml(item.name)}" title="Editar categoria">${editIcon}</button><button class="secondary icon-button delete-icon-button" data-delete-category="${item.id}" type="button" aria-label="Excluir categoria ${escapeHtml(item.name)}" title="Excluir categoria">${deleteIcon}</button>`}</div>`).join('');
  if (imported.candidates.length) renderPreview();
}
function renderCategoryRules() {
  const pageSize = 20;
  const categoryFilter = $('#ruleCategoryFilter');
  const categories = [...new Set(state.categoryRules.map(rule => rule.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (!categories.includes(categoryFilter.value)) categoryFilter.value = '';
  const selectedCategory = categoryFilter.value;
  categoryFilter.innerHTML = `<option value="">Todas as categorias</option>${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}`;
  categoryFilter.value = selectedCategory;
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const search = normalize($('#ruleSearch').value.trim());
  const visible = state.categoryRules.filter(rule => (!selectedCategory || rule.category === selectedCategory) &&
    (!search || normalize(`${rule.merchant_pattern} ${rule.category}`).includes(search)));
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  state.rulePage = Math.min(Math.max(1, state.rulePage), pages);
  const start = (state.rulePage - 1) * pageSize;
  const pageRules = visible.slice(start, start + pageSize);
  $('#ruleCount').textContent = visible.length ? `Exibindo ${start + 1}–${start + pageRules.length} de ${visible.length} regra(s) encontrada(s) · ${state.categoryRules.length} no total.` : `0 regras encontradas · ${state.categoryRules.length} no total.`;
  $('#categoryRulesList').innerHTML = pageRules.map(rule => `<div class="rule-row"><div><strong>${escapeHtml(rule.merchant_pattern)}</strong><span>Categoria: ${escapeHtml(rule.category)}</span></div><div class="actions"><button class="secondary icon-button" data-edit-rule="${rule.id}" type="button" aria-label="Editar regra ${escapeHtml(rule.merchant_pattern)}" title="Editar regra">${editIcon}</button><button class="secondary icon-button delete-icon-button" data-delete-rule="${rule.id}" type="button" aria-label="Excluir regra ${escapeHtml(rule.merchant_pattern)}" title="Excluir regra">${deleteIcon}</button></div></div>`).join('') || `<p>${state.categoryRules.length ? 'Nenhuma regra corresponde à pesquisa e ao filtro.' : 'Nenhuma regra aprendida nesta conta.'}</p>`;
  $('#rulePagination').hidden = visible.length <= pageSize;
  $('#rulePageInfo').textContent = `${state.rulePage} / ${pages}`;
  $('#prevRulePage').disabled = state.rulePage <= 1;
  $('#nextRulePage').disabled = state.rulePage >= pages;
}
$('#ruleSearch').addEventListener('input', () => { state.rulePage = 1; renderCategoryRules(); });
$('#ruleCategoryFilter').addEventListener('change', () => { state.rulePage = 1; renderCategoryRules(); });
$('#prevRulePage').addEventListener('click', () => { state.rulePage--; renderCategoryRules(); $('#categoryRulesList').scrollTop = 0; });
$('#nextRulePage').addEventListener('click', () => { state.rulePage++; renderCategoryRules(); $('#categoryRulesList').scrollTop = 0; });
function closeRuleEditor() {
  $('#categoryRuleForm').reset();
  $('#categoryRuleEditCard').hidden = true;
}
on('#categoryRulesList', 'click', async event => {
  const button = event.target.closest('[data-edit-rule], [data-delete-rule]');
  if (!button) return;
  const id = Number(button.dataset.editRule || button.dataset.deleteRule);
  const rule = state.categoryRules.find(item => item.id === id);
  if (!rule) return;
  if (button.dataset.deleteRule) {
    if (!confirm(`Excluir a regra “${rule.merchant_pattern}” desta conta?`)) return;
    await api(`/api/category-rules/${id}`, { method: 'DELETE' });
    if (Number($('#categoryRuleForm').elements.id.value) === id) closeRuleEditor();
    await refresh(); toast('Regra excluída.');
    return;
  }
  const form = $('#categoryRuleForm');
  form.elements.id.value = rule.id;
  form.elements.merchantPattern.value = rule.merchant_pattern;
  form.elements.category.innerHTML = state.categories.filter(item => !['Receita', 'Categoria pendente'].includes(item.name))
    .map(item => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join('');
  form.elements.category.value = rule.category;
  $('#categoryRuleEditCard').hidden = false;
  $('#categoryRuleEditCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
on('#categoryRuleForm', 'submit', async event => {
  const data = formData(event.target);
  await api(`/api/category-rules/${data.id}`, { method: 'PUT', body: JSON.stringify(data) });
  closeRuleEditor(); await refresh(); toast('Regra atualizada.');
});
on('#cancelRuleEditBtn', 'click', closeRuleEditor);
function resetTransaction() {
  const form = $('#transactionForm'); form.reset(); form.elements.id.value = '';
  form.elements.date.value = state.month === today().slice(0, 7) ? today() : `${state.month}-01`;
  form.elements.category.value = 'Categoria pendente'; manualCategory = false;
  syncManualInstallmentFields();
  $('#transactionTitle').textContent = 'Novo lançamento'; $('#cancelEditBtn').hidden = true;
  $('#categorySuggestion').textContent = 'A categoria é sugerida pela descrição e pode ser alterada.';
}
function syncManualInstallmentFields() {
  const form = $('#transactionForm');
  const allowed = form.elements.type.value === 'saida' && !['Transferência própria', 'Metas'].includes(form.elements.category.value);
  const toggle = form.elements.installmentEnabled;
  toggle.closest('label').hidden = !allowed;
  if (!allowed) toggle.checked = false;
  const visible = allowed && toggle.checked;
  $('#manualInstallmentFields').hidden = !visible;
  for (const name of ['installmentCurrent', 'installmentTotal', 'installmentMonthlyAmount']) {
    form.elements[name].disabled = !visible;
    form.elements[name].required = visible;
  }
  if (visible) {
    if (!form.elements.installmentCurrent.value) form.elements.installmentCurrent.value = '1';
    if (!form.elements.installmentTotal.value) form.elements.installmentTotal.value = '2';
    if (!form.elements.installmentMonthlyAmount.value && form.elements.value.value) form.elements.installmentMonthlyAmount.value = form.elements.value.value;
  }
}
on('#cancelEditBtn', 'click', resetTransaction);
$('#transactionForm').elements.category.addEventListener('change', () => { manualCategory = true; syncManualInstallmentFields(); });
$('#transactionForm').elements.type.addEventListener('change', syncManualInstallmentFields);
$('#transactionForm').elements.installmentEnabled.addEventListener('change', syncManualInstallmentFields);
$('#transactionForm').elements.description.addEventListener('input', () => {
  clearTimeout(suggestionTimer);
  const text = $('#transactionForm').elements.description.value;
  if (manualCategory) return;
  suggestionTimer = setTimeout(async () => {
    try {
      const result = await api(`/api/category-suggest?description=${encodeURIComponent(text)}`);
      if (manualCategory || $('#transactionForm').elements.description.value !== text) return;
      $('#transactionForm').elements.category.value = result.category || 'Categoria pendente';
      syncManualInstallmentFields();
      $('#categorySuggestion').textContent = result.confidence === 'baixa' ? 'Descrição insuficiente. Escolha a categoria ou salve para revisar depois.' : `Sugestão por ${result.confidence === 'aprendida' ? 'regra de uma correção anterior' : 'regra local'}: ${result.category}. Você pode alterar.`;
    } catch { $('#categorySuggestion').textContent = 'Escolha a categoria manualmente.'; }
  }, 350);
});
on('#transactionForm', 'submit', async event => {
  const data = formData(event.target);
  if (data.installmentEnabled) data.installmentPlan = { currentNumber: Number(data.installmentCurrent), total: Number(data.installmentTotal), monthlyAmount: Number(data.installmentMonthlyAmount) };
  for (const key of ['installmentEnabled', 'installmentCurrent', 'installmentTotal', 'installmentMonthlyAmount']) delete data[key];
  await api(data.id ? `/api/transactions/${data.id}` : '/api/transactions', { method: data.id ? 'PUT' : 'POST', body: JSON.stringify(data) });
  resetTransaction(); await refresh(); toast('Lançamento salvo.');
});
function filteredTransactions() {
  const search = $('#transactionSearch').value.toLocaleLowerCase('pt-BR');
  const filter = $('#transactionFilter').value;
  return state.transactions.filter(item => item.date.startsWith(state.month) && `${item.description} ${item.category}`.toLocaleLowerCase('pt-BR').includes(search) && (filter === 'all' || filter === 'pending' && item.category === 'Categoria pendente'));
}
function renderTransactions() {
  const rows = filteredTransactions();
  const pages = Math.max(1, Math.ceil(rows.length / 10)); state.page = Math.min(state.page, pages);
  const pageRows = rows.slice((state.page - 1) * 10, state.page * 10);
  $('#transactionCount').textContent = `${rows.length} registro(s) neste período/filtro · ${state.transactions.length} no total${selectedTransactionIds.size ? ` · ${selectedTransactionIds.size} selecionado(s)` : ''}`;
  $('#transactionsBody').innerHTML = pageRows.map(item => `<tr class="${item.category === 'Categoria pendente' ? 'pending' : ''}"><td><input type="checkbox" data-select-transaction="${item.id}" aria-label="Selecionar lançamento ${escapeHtml(item.description)}" ${selectedTransactionIds.has(item.id) ? 'checked' : ''}></td><td>${escapeHtml(item.date.split('-').reverse().join('/'))}</td><td><div class="scrollable-description transaction-description" tabindex="0" aria-label="Descrição do lançamento" title="${escapeHtml(item.description)}"><span>${escapeHtml(item.description)}</span></div>${item.installment_number ? `<small>Parcela ${item.installment_number}/${item.installment_total}</small>` : ''}${item.note ? `<small class="transaction-note">${escapeHtml(item.note)}</small>` : ''}</td><td>${escapeHtml(item.category)}</td><td class="${item.value < 0 ? 'negative' : 'positive'}">${money(item.value)}</td><td>${escapeHtml(item.classification_source || 'manual')}</td><td><button class="secondary" data-edit="${item.id}">Editar</button><button class="secondary" data-delete="${item.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="7">Nenhum lançamento para este período e filtro.</td></tr>';
  const selectedOnPage = pageRows.filter(item => selectedTransactionIds.has(item.id)).length;
  $('#selectTransactionPage').checked = pageRows.length > 0 && selectedOnPage === pageRows.length;
  $('#selectTransactionPage').indeterminate = selectedOnPage > 0 && selectedOnPage < pageRows.length;
  $('#selectTransactionPage').disabled = pageRows.length === 0;
  $('#selectAllTransactionsBtn').disabled = rows.length === 0;
  $('#bulkDeleteTransactionsBtn').textContent = `Excluir selecionados (${selectedTransactionIds.size})`;
  $('#bulkDeleteTransactionsBtn').disabled = selectedTransactionIds.size === 0;
  $('#clearTransactionSelectionBtn').hidden = selectedTransactionIds.size === 0;
  $('#pageInfo').textContent = `${state.page} / ${pages}`; $('#prevPage').disabled = state.page <= 1; $('#nextPage').disabled = state.page >= pages;
}
['#transactionSearch', '#transactionFilter'].forEach(selector => $(selector).addEventListener('input', () => { selectedTransactionIds.clear(); state.page = 1; renderTransactions(); }));
$('#prevPage').addEventListener('click', () => { state.page--; renderTransactions(); });
$('#nextPage').addEventListener('click', () => { state.page++; renderTransactions(); });
$('#selectAllTransactionsBtn').addEventListener('click', () => {
  const rows = filteredTransactions();
  selectedTransactionIds.clear();
  for (const item of rows.slice(0, 250)) selectedTransactionIds.add(item.id);
  renderTransactions();
  if (rows.length > 250) toast(`Selecionados 250 de ${rows.length} lançamentos deste período/filtro. Os demais não serão excluídos nesta operação.`);
});
$('#selectTransactionPage').addEventListener('change', event => {
  const pageRows = filteredTransactions().slice((state.page - 1) * 10, state.page * 10);
  for (const item of pageRows) event.target.checked ? selectedTransactionIds.add(item.id) : selectedTransactionIds.delete(item.id);
  renderTransactions();
});
$('#transactionsBody').addEventListener('change', event => {
  if (!event.target.matches('[data-select-transaction]')) return;
  const id = Number(event.target.dataset.selectTransaction);
  event.target.checked ? selectedTransactionIds.add(id) : selectedTransactionIds.delete(id);
  renderTransactions();
});
$('#clearTransactionSelectionBtn').addEventListener('click', () => { selectedTransactionIds.clear(); renderTransactions(); });
$('#bulkDeleteTransactionsBtn').addEventListener('click', async event => {
  const ids = [...selectedTransactionIds];
  if (!ids.length) return;
  if (ids.length > 250) { toast('Selecione no máximo 250 lançamentos por vez.', true); return; }
  if (!confirm(`Excluir permanentemente ${ids.length} lançamento(s) selecionado(s)?`)) return;
  event.currentTarget.disabled = true;
  try {
    const result = await api('/api/transactions/bulk', { method: 'POST', body: JSON.stringify({ action: 'delete', ids }) });
    await refresh();
    toast(`${result.deleted} lançamento(s) excluído(s).`);
  } catch (error) { toast(error.message, true); }
  finally { renderTransactions(); }
});
on('#transactionsBody', 'click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  const item = state.transactions.find(row => row.id === Number(button.dataset.edit || button.dataset.delete));
  if (!item) return;
  if (button.dataset.delete) {
    if (!confirm(`Excluir o lançamento “${item.description}”?`)) return;
    await api(`/api/transactions/${item.id}`, { method: 'DELETE' }); await refresh(); toast('Lançamento excluído.');
  } else {
    const form = $('#transactionForm');
    form.elements.category.innerHTML = categoryOptions(item.category);
    for (const key of ['id', 'description', 'date', 'category', 'note']) form.elements[key].value = item[key] || '';
    form.elements.value.value = Math.abs(item.value); form.elements.type.value = item.value < 0 ? 'saida' : 'entrada';
    form.elements.installmentEnabled.checked = Boolean(item.installment_number);
    form.elements.installmentCurrent.value = item.installment_number || '';
    form.elements.installmentTotal.value = item.installment_total || '';
    form.elements.installmentMonthlyAmount.value = state.plannedInstallments.find(plan => plan.source_transaction_id === item.id)?.amount || Math.abs(item.value);
    syncManualInstallmentFields();
    manualCategory = true; $('#cancelEditBtn').hidden = false; $('#transactionTitle').textContent = 'Editar lançamento';
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
function resetCategory() { $('#categoryForm').reset(); $('#categoryForm').elements.id.value = ''; $('#cancelCategoryBtn').hidden = true; }
on('#cancelCategoryBtn', 'click', resetCategory);
on('#categoryForm', 'submit', async event => {
  const data = formData(event.target);
  await api(data.id ? `/api/categories/${data.id}` : '/api/categories', { method: data.id ? 'PUT' : 'POST', body: JSON.stringify(data) });
  resetCategory(); await refresh(); toast('Categoria salva.');
});
on('#categoriesList', 'click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  const item = state.categories.find(row => row.id === Number(button.dataset.editCategory || button.dataset.deleteCategory));
  if (button.dataset.deleteCategory) {
    if (!confirm(`Excluir “${item.name}”? Seus lançamentos irão para Outros.`)) return;
    await api(`/api/categories/${item.id}`, { method: 'DELETE' }); await refresh(); toast('Categoria excluída.');
  } else {
    const form = $('#categoryForm'); for (const key of ['id', 'name', 'color']) form.elements[key].value = item[key];
    $('#cancelCategoryBtn').hidden = false; form.elements.name.focus();
  }
});

const mappingKeys = { date: 'Data', description: 'Descrição', value: 'Valor', debitValue: 'Débito (se separado)', creditValue: 'Crédito (se separado)', type: 'Tipo', category: 'Categoria' };
const reviewFields = ['date', 'description', 'value', 'category', 'confidence', 'userCorrected', 'descriptionEdited', 'categoryManuallyEdited', 'installmentPlan', 'plannedInstallmentId'];
function reviewSnapshot(item) { return Object.fromEntries(reviewFields.map(key => [key, item[key]])); }
function reviewChanged(item) { return reviewFields.some(key => item[key] !== item.reviewBaseline?.[key]); }
function prepareImportCandidates(candidates) {
  return candidates.map(candidate => {
    const item = { ...candidate, selected: !candidate.duplicate };
    item.reviewBaseline = reviewSnapshot(item);
    return item;
  });
}
on('#statementImportForm', 'submit', async event => {
  const file = event.target.elements.statement.files[0];
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error('Envie CSV, XLSX ou XLS.');
  if (file.size > 8 * 1024 * 1024) throw new Error('O limite é de 8 MB por arquivo.');
  const [result, planned] = await Promise.all([
    api('/api/import/file', { method: 'POST', body: new FormData(event.target) }), api('/api/installments'),
  ]);
  imported = { ...result, planned, source: result.kind, candidates: prepareImportCandidates(result.candidates) };
  $('#mappingFields').innerHTML = Object.entries(mappingKeys).map(([key, label]) => `<label>${label}<select name="${key}"><option value="">Não usar</option>${result.columns.map(column => `<option value="${escapeHtml(column)}" ${result.mapping[key] === column ? 'selected' : ''}>${escapeHtml(column)}</option>`).join('')}</select></label>`).join('');
  $('#mappingDetails').open = !result.candidates.length; $('#importCard').hidden = false; renderPreview();
  $('#importCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
on('#mappingForm', 'submit', async event => {
  const result = await api('/api/import/preview', { method: 'POST', body: JSON.stringify({ rows: imported.rows, mapping: formData(event.target) }) });
  imported = { ...imported, ...result, candidates: prepareImportCandidates(result.candidates) }; renderPreview();
});
function previewPassThroughs() {
  const day = date => /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) / 86400000 : NaN;
  const eligible = imported.candidates.map((item, index) => ({ ...item, index, day: day(item.date) }))
    .filter(item => item.selected && Number.isFinite(item.day) && Number.isFinite(Number(item.value)) && !['Transferência própria', 'Metas'].includes(item.category));
  const income = eligible.filter(item => Number(item.value) > 0);
  const expenses = eligible.filter(item => Number(item.value) < 0).sort((a, b) => a.day - b.day || a.index - b.index);
  const usedIncome = new Set(), matches = new Map();
  for (const expense of expenses) {
    const candidates = income.filter(entry => !usedIncome.has(entry.index) && expense.day - entry.day >= 0 && expense.day - entry.day <= 1 &&
      Math.abs(Math.round(Number(entry.value) * 100) - Math.round(Math.abs(Number(expense.value)) * 100)) <= 100)
      .sort((a, b) => Math.abs(Math.round(Number(a.value) * 100) - Math.round(Math.abs(Number(expense.value)) * 100)) -
        Math.abs(Math.round(Number(b.value) * 100) - Math.round(Math.abs(Number(expense.value)) * 100)) || b.day - a.day || a.index - b.index);
    const entry = candidates[0];
    if (!entry) continue;
    usedIncome.add(entry.index);
    const difference = Math.abs(Math.round(Number(entry.value) * 100) - Math.round(Math.abs(Number(expense.value)) * 100)) / 100;
    const daysAfter = expense.day - entry.day;
    matches.set(entry.index, { role: 'entrada', partnerIndex: expense.index, difference, daysAfter });
    matches.set(expense.index, { role: 'saída', partnerIndex: entry.index, difference, daysAfter });
  }
  return matches;
}
function refreshPreviewPassThroughs() {
  const matches = previewPassThroughs();
  for (const row of $('#importBody').querySelectorAll('[data-index]')) {
    const index = Number(row.dataset.index);
    const badge = row.querySelector('[data-preview-pass-through]');
    const match = matches.get(index);
    badge.hidden = !match;
    if (!match) continue;
    badge.textContent = `Possível repasse · ${match.role} · conferir`;
    badge.title = `Compare com o registro ${match.partnerIndex + 1} da prévia. Diferença: ${money(match.difference)}; intervalo: ${match.daysAfter} dia(s).`;
  }
}
function matchingPlannedInstallments(item) {
  if (Number(item.value) >= 0) return [];
  const date = Date.parse(`${item.date}T00:00:00Z`);
  if (!Number.isFinite(date)) return [];
  const used = new Set(imported.candidates.filter(candidate => candidate !== item && candidate.selected).map(candidate => Number(candidate.plannedInstallmentId)).filter(Boolean));
  return (imported.planned || []).filter(plan => !used.has(plan.id) &&
    Math.abs(Date.parse(`${plan.due_date}T00:00:00Z`) - date) <= 7 * 86400000 &&
    Math.abs(Math.round(plan.amount * 100) - Math.round(Math.abs(Number(item.value)) * 100)) <= 100);
}
function validPreviewPlan(item) {
  const plan = item.installmentPlan;
  if (!plan) return true;
  const current = Number(plan.currentNumber), total = Number(plan.total), amount = Number(plan.monthlyAmount);
  return Number(item.value) < 0 && !['Transferência própria', 'Metas'].includes(item.category) && Number.isInteger(current) && Number.isInteger(total) &&
    current >= 1 && current <= total && total <= 36 && Number.isFinite(amount) && Number.isSafeInteger(Math.round(amount * 100)) && amount > 0 &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
}
function updateImportConfirmation() {
  const selected = imported.candidates.filter(item => item.selected);
  const reasons = [];
  if (!selected.length) reasons.push('Selecione ao menos um lançamento. Possíveis duplicados começam desmarcados e podem ser incluídos após revisão.');
  if (selected.length > 500) reasons.push(`Há ${selected.length} lançamentos selecionados; o limite por importação é 500, incluindo partes divididas.`);
  const checkedGroups = new Set();
  for (const item of selected.filter(candidate => candidate.splitOriginal)) {
    const key = JSON.stringify(item.splitOriginal);
    if (checkedGroups.has(key)) continue;
    checkedGroups.add(key);
    const parts = imported.candidates.filter(candidate => candidate.splitOriginal && JSON.stringify(candidate.splitOriginal) === key);
    if (parts.length < 2 || parts.some(part => !part.selected || part.date !== item.splitOriginal.date || !Number.isFinite(Number(part.value)) || Math.sign(Number(part.value)) !== Math.sign(Number(item.splitOriginal.value)) || Math.round(Number(part.value) * 100) === 0)) {
      reasons.push(`Revise a divisão de “${item.splitOriginal.description}”: selecione todas as partes, mantenha a mesma data e use valores não nulos no mesmo sentido.`);
    }
  }
  const invalidPlans = selected.map((item, index) => !validPreviewPlan(item) ? imported.candidates.indexOf(item) + 1 : null).filter(Boolean);
  if (invalidPlans.length) reasons.push(`Revise as parcelas do(s) registro(s) ${invalidPlans.join(', ')}: a parcela atual não pode passar do total (até 36), e o valor mensal deve ser positivo, com até duas casas decimais. Use uma despesa que não seja transferência própria ou meta.`);
  const pendingCount = selected.filter(item => item.category === 'Categoria pendente').length;
  const duplicateCount = imported.candidates.filter(item => item.duplicate).length;
  const summary = `${imported.candidates.length} registro(s) na prévia · ${pendingCount} pendente(s) de categoria · ${duplicateCount} possível(is) duplicado(s).`;
  const importErrors = (imported.errors || []).map(item => `Linha ${item.row}: ${item.message}`).join(' ');
  const reasonText = reasons.length ? `Não é possível confirmar: ${reasons.join(' ')}` : `${selected.length} lançamento(s) selecionado(s). Pronto para confirmar.`;
  $('#importNotice').textContent = summary;
  $('#importNotice').classList.toggle('has-warnings', pendingCount > 0 || duplicateCount > 0 || Boolean(importErrors));
  $('#importReviewAlerts').textContent = importErrors;
  $('#importReviewAlerts').hidden = !importErrors;
  $('#importConfirmStatus').textContent = reasonText;
  $('#importConfirmStatus').classList.toggle('blocked', Boolean(reasons.length));
  $('#confirmImportBtn').disabled = Boolean(reasons.length);
}
function renderPreview() {
  const validCategories = state.categories.map(item => item.name);
  imported.candidates.forEach(item => { if (!validCategories.includes(item.category)) item.category = 'Categoria pendente'; });
  const groups = new Map();
  for (const item of imported.candidates.filter(item => item.splitOriginal)) {
    const key = JSON.stringify(item.splitOriginal);
    const parts = groups.get(key) || [];
    parts.push(item); groups.set(key, parts);
  }
  $('#importBody').innerHTML = imported.candidates.map((item, index) => {
    const firstPart = item.splitOriginal && groups.get(JSON.stringify(item.splitOriginal))[0] === item;
    const groupHeader = firstPart ? `<tr class="split-group-summary" data-split-summary="${index}"><td colspan="7"><strong>Divisão de “${escapeHtml(item.splitOriginal.description)}”</strong><span>Valor original: ${money(item.splitOriginal.value)} · <span data-split-totals></span></span></td></tr>` : '';
    const status = item.duplicate ? `Possível duplicado · ${escapeHtml(item.duplicateReason || 'conferir')}` : item.splitOriginal ? 'Parte de lançamento dividido' : escapeHtml(item.confidence || 'Revisar');
    const matches = matchingPlannedInstallments(item);
    const usedPlans = new Set(imported.candidates.filter(candidate => candidate !== item && candidate.selected).map(candidate => Number(candidate.plannedInstallmentId)).filter(Boolean));
    const otherPlans = (imported.planned || []).filter(plan => !usedPlans.has(plan.id) && !matches.some(match => match.id === plan.id));
    const planOption = plan => `<option value="${plan.id}" ${Number(item.plannedInstallmentId) === plan.id ? 'selected' : ''}>${plan.installment_number}/${plan.installment_total} · ${escapeHtml(plan.due_date.split('-').reverse().join('/'))} · ${money(plan.amount)} · ${escapeHtml(plan.category)}</option>`;
    const planSelect = Number(item.value) < 0 && (matches.length || otherPlans.length) ? `<label class="planned-match-label">Parcela prevista<select data-field="plannedInstallmentId" aria-label="Vincular parcela prevista ao registro ${index + 1}"><option value="">Não vincular</option>${matches.length ? `<optgroup label="Possíveis correspondências">${matches.map(planOption).join('')}</optgroup>` : ''}${otherPlans.length ? `<optgroup label="Outras parcelas previstas">${otherPlans.map(planOption).join('')}</optgroup>` : ''}</select></label>` : '';
    const planButton = item.installmentPlan || Number(item.value) < 0 && !['Transferência própria', 'Metas'].includes(item.category) ? `<button type="button" class="secondary" data-plan="${index}">${item.installmentPlan ? 'Remover parcelas' : 'Parcelas'}</button>` : '';
    const plan = item.installmentPlan;
    const planEditor = plan ? `<tr class="installment-editor" data-plan-index="${index}"><td colspan="7"><strong>Parcelamento deste lançamento</strong><div class="installment-fields"><label>Parcela atual<input type="number" min="1" max="36" step="1" data-plan-field="currentNumber" value="${plan.currentNumber}"></label><label>Total de parcelas<input type="number" min="2" max="36" step="1" data-plan-field="total" value="${plan.total}"></label><label>Valor mensal das próximas parcelas (R$)<input type="number" min="0.01" step="0.01" data-plan-field="monthlyAmount" value="${plan.monthlyAmount}"></label></div><small>Se esta for a última parcela, ela será registrada como realizada e nenhuma previsão nova será criada. As demais parcelas serão previstas e poderão ser vinculadas a extratos já salvos ou futuros.</small></td></tr>` : '';
    return `${groupHeader}<tr data-index="${index}" class="${item.category === 'Categoria pendente' ? 'pending' : ''} ${item.splitOriginal ? 'split-part' : ''}"><td><input type="checkbox" data-field="selected" aria-label="Incluir registro ${index + 1}" ${item.selected ? 'checked' : ''}></td><td><input type="date" data-field="date" aria-label="Data do registro ${index + 1}" value="${escapeHtml(item.date)}" required ${item.splitOriginal ? 'disabled' : ''}></td><td><input data-field="description" aria-label="Descrição do registro ${index + 1}" title="${escapeHtml(item.description)}" value="${escapeHtml(item.description)}" maxlength="120" required></td><td><input type="number" step="0.01" data-field="value" aria-label="Valor do registro ${index + 1}" value="${item.value}" required></td><td><select data-field="category" aria-label="Categoria do registro ${index + 1}">${categoryOptions(item.category)}</select></td><td data-preview-status><span data-preview-base-status>${status}</span>${item.duplicate && item.includeDuplicate ? '<small class="review-included">Incluído após revisão</small>' : ''}${plan ? `<small class="review-included">Parcela ${plan.currentNumber}/${plan.total}</small>` : ''}<small class="possible-repasse" data-preview-pass-through hidden></small>${planSelect}</td><td><button type="button" class="secondary" data-split="${index}" ${Math.abs(Math.round(item.value * 100)) < 2 ? 'disabled' : ''}>Dividir</button>${planButton}<button type="button" class="secondary" data-restore="${index}" ${reviewChanged(item) ? '' : 'disabled'}>Desfazer alterações</button>${firstPart ? `<button type="button" class="secondary" data-unsplit="${index}">Desfazer divisão</button>` : ''}</td></tr>${planEditor}`;
  }).join('');
  refreshSplitTotals();
  refreshPreviewPassThroughs();
}
function refreshSplitTotals() {
  for (const summary of $('#importBody').querySelectorAll('[data-split-summary]')) {
    const original = imported.candidates[Number(summary.dataset.splitSummary)]?.splitOriginal;
    if (!original) continue;
    const parts = imported.candidates.filter(item => item.splitOriginal && JSON.stringify(item.splitOriginal) === JSON.stringify(original));
    const hasInvalidValue = parts.some(item => !Number.isFinite(Number(item.value)));
    const sum = parts.reduce((total, item) => total + Math.round(Number(item.value) * 100), 0);
    const difference = Math.round(Number(original.value) * 100) - sum;
    const sameDirection = parts.every(item => Number.isFinite(Number(item.value)) && Math.sign(Number(item.value)) === Math.sign(Number(original.value)) && Math.round(Number(item.value) * 100) !== 0);
    summary.querySelector('[data-split-totals]').textContent = hasInvalidValue ? 'Preencha um valor válido para cada parte.' : `Soma das partes: ${money(sum / 100)} · Diferença: ${money(Math.abs(difference) / 100)}${difference === 0 && sameDirection ? ' (valores conferem)' : difference !== 0 ? ' (confira o valor não contabilizado)' : ' (confira entrada/saída)'}`;
    summary.classList.toggle('split-group-error', hasInvalidValue || !sameDirection || parts.length < 2);
    summary.classList.toggle('split-group-warning', !hasInvalidValue && sameDirection && parts.length >= 2 && difference !== 0);
  }
  updateImportConfirmation();
}
$('#importBody').addEventListener('input', event => {
  if (event.target.dataset.planField) {
    const row = event.target.closest('[data-plan-index]');
    const item = imported.candidates[Number(row.dataset.planIndex)];
    item.installmentPlan[event.target.dataset.planField] = event.target.value === '' ? NaN : Number(event.target.value);
    item.userCorrected = true;
    updateImportConfirmation();
    return;
  }
  if (event.target.dataset.field === 'value') {
    const row = event.target.closest('[data-index]');
    const item = imported.candidates[Number(row.dataset.index)];
    item.value = event.target.value === '' ? NaN : Number(event.target.value);
    item.userCorrected = true;
    row.querySelector('[data-restore]').disabled = !reviewChanged(item);
    refreshSplitTotals();
    refreshPreviewPassThroughs();
    return;
  }
  if (event.target.dataset.field !== 'description') return;
  const row = event.target.closest('[data-index]');
  const item = imported.candidates[Number(row.dataset.index)];
  item.description = event.target.value;
  item.descriptionEdited = true;
  item.userCorrected = true;
  row.querySelector('[data-restore]').disabled = !reviewChanged(item);
  if (item.categoryManuallyEdited) return;
  clearTimeout(previewSuggestionTimer);
  const description = item.description;
  previewSuggestionTimer = setTimeout(async () => {
    try {
      const suggestion = await api(`/api/category-suggest?description=${encodeURIComponent(description)}`);
      if (!imported.candidates.includes(item) || item.description !== description || item.categoryManuallyEdited) return;
      item.category = suggestion.category || 'Categoria pendente';
      item.confidence = suggestion.confidence || 'baixa';
      const currentRow = $('#importBody').querySelector(`tr[data-index="${imported.candidates.indexOf(item)}"]`);
      if (currentRow) {
        currentRow.querySelector('[data-field="category"]').value = item.category;
        currentRow.classList.toggle('pending', item.category === 'Categoria pendente');
        if (!item.duplicate && !item.splitOriginal) currentRow.querySelector('[data-preview-base-status]').textContent = item.confidence;
      }
    } catch { /* A escolha manual continua disponível; a confirmação recalcula a sugestão. */ }
  }, 350);
});
$('#importBody').addEventListener('change', async event => {
  const planRow = event.target.closest('[data-plan-index]');
  if (planRow && event.target.dataset.planField) {
    const item = imported.candidates[Number(planRow.dataset.planIndex)];
    item.installmentPlan[event.target.dataset.planField] = event.target.value === '' ? NaN : Number(event.target.value);
    item.userCorrected = true;
    renderPreview();
    return;
  }
  const row = event.target.closest('[data-index]'); if (!row) return;
  const key = event.target.dataset.field; const item = imported.candidates[Number(row.dataset.index)];
  if (key === 'plannedInstallmentId') {
    item.plannedInstallmentId = event.target.value ? Number(event.target.value) : undefined;
    if (item.plannedInstallmentId) item.installmentPlan = undefined;
    item.userCorrected = true;
    renderPreview();
    return;
  }
  if (key === 'selected' && item.splitOriginal) {
    for (const part of imported.candidates.filter(candidate => candidate.splitOriginal && JSON.stringify(candidate.splitOriginal) === JSON.stringify(item.splitOriginal))) {
      part.selected = event.target.checked;
      if (part.duplicate) part.includeDuplicate = event.target.checked;
    }
    renderPreview(); return;
  }
  item[key] = key === 'selected' ? event.target.checked : key === 'value' ? Number(event.target.value) : event.target.value;
  if (key === 'selected' && item.duplicate) item.includeDuplicate = event.target.checked;
  if (key !== 'selected') item.userCorrected = true;
  if (key === 'category') item.categoryManuallyEdited = true;
  if (key === 'description') {
    clearTimeout(previewSuggestionTimer);
    item.descriptionEdited = true;
    if (!item.categoryManuallyEdited && item.description.trim()) {
      const description = item.description;
      try {
        const suggestion = await api(`/api/category-suggest?description=${encodeURIComponent(description)}`);
        if (imported.candidates.includes(item) && item.description === description && !item.categoryManuallyEdited) {
          item.category = suggestion.category || 'Categoria pendente';
          item.confidence = suggestion.confidence || 'baixa';
        }
      } catch (error) { toast(`Não foi possível atualizar a sugestão: ${error.message}`, true); }
    }
  }
  renderPreview();
});
$('#importBody').addEventListener('click', event => {
  const splitButton = event.target.closest('[data-split]');
  const planButton = event.target.closest('[data-plan]');
  const undoButton = event.target.closest('[data-unsplit]');
  const restoreButton = event.target.closest('[data-restore]');
  if (splitButton) {
    const index = Number(splitButton.dataset.split), item = imported.candidates[index];
    const original = item.splitOriginal || item.sourceOriginal || { date: item.date, description: item.description, value: item.value };
    const cents = Math.round(Number(item.splitOriginal ? item.value : original.value) * 100);
    if (!Number.isFinite(cents) || Math.abs(cents) < 2) return;
    const first = Math.trunc(cents / 2), second = cents - first;
    item.splitUndoState ||= { ...item };
    item.value = first / 100; item.date = original.date; item.splitOriginal = original; item.userCorrected = true;
    item.installmentPlan = undefined; item.plannedInstallmentId = undefined;
    item.reviewBaseline = reviewSnapshot(item);
    const secondPart = { ...item, description: `${item.description.slice(0, 110)} (parte 2)`, value: second / 100, selected: item.selected };
    secondPart.reviewBaseline = reviewSnapshot(secondPart);
    imported.candidates.splice(index + 1, 0, secondPart);
    renderPreview();
  } else if (planButton) {
    const item = imported.candidates[Number(planButton.dataset.plan)];
    if (item.installmentPlan) item.installmentPlan = undefined;
    else {
      const match = String(item.description).match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
      const validMarker = match && Number(match[1]) >= 1 && Number(match[1]) <= Number(match[2]) && Number(match[2]) >= 2 && Number(match[2]) <= 36;
      const current = validMarker ? Number(match[1]) : 1;
      const total = validMarker ? Number(match[2]) : 2;
      item.installmentPlan = { currentNumber: current, total, monthlyAmount: Math.abs(Number(item.value)) };
      item.plannedInstallmentId = undefined;
    }
    item.userCorrected = true;
    renderPreview();
  } else if (undoButton) {
    const item = imported.candidates[Number(undoButton.dataset.unsplit)];
    const key = JSON.stringify(item.splitOriginal), original = item.splitOriginal;
    imported.candidates = imported.candidates.filter(candidate => !candidate.splitOriginal || JSON.stringify(candidate.splitOriginal) !== key);
    imported.candidates.splice(Number(undoButton.dataset.unsplit), 0, item.splitUndoState ? { ...item.splitUndoState } : { ...item, ...original, splitOriginal: undefined, userCorrected: false, descriptionEdited: false, categoryManuallyEdited: false });
    renderPreview();
  } else if (restoreButton) {
    clearTimeout(previewSuggestionTimer);
    const index = Number(restoreButton.dataset.restore), item = imported.candidates[index];
    imported.candidates[index] = { ...item, ...item.reviewBaseline };
    renderPreview();
  }
});
on('#confirmImportBtn', 'click', async () => {
  const selected = imported.candidates.filter(item => item.selected);
  if (!selected.length) throw new Error('Selecione ao menos um registro.');
  if (selected.length > 500) throw new Error('O limite é de 500 lançamentos por importação, incluindo partes divididas.');
  if (selected.some(item => !item.description.trim() || !item.date || !Number.isFinite(item.value) || item.value === 0)) throw new Error('Revise data, descrição e valor dos registros selecionados.');
  const result = await api('/api/import/transactions', { method: 'POST', body: JSON.stringify({ transactions: selected, source: imported.source }) });
  if (result.imported) { state.month = selected[0].date.slice(0, 7); periodChosen = true; }
  $('#analysisMonth').value = state.month; $('#importCard').hidden = true; imported = { rows: [], candidates: [] };
  await refresh(); toast(`${result.imported} registro(s) importados; ${result.reconciledInstallments || 0} parcela(s) conciliada(s); ${result.skippedDuplicates} duplicado(s) ignorados. Pendências podem ser revisadas na lista.`);
});
on('#cancelImportBtn', 'click', () => { imported = { rows: [], candidates: [] }; $('#importCard').hidden = true; });

function syncGoalFields() {
  const form = $('#goalForm'); const type = form.elements.objective.value;
  $('#goalCategoryField').hidden = type !== 'reduzir'; form.elements.targetCategory.required = type === 'reduzir';
  form.elements.targetCategory.disabled = type !== 'reduzir';
  $('#savingFields').hidden = type !== 'juntar';
  form.elements.savedAmount.disabled = type !== 'juntar'; form.elements.deadline.disabled = type !== 'juntar';
  form.elements.deadline.required = type === 'juntar'; form.elements.deadline.min = today();
  $('#goalValueLabel').textContent = { reduzir: 'Limite mensal desejado (R$)', economizar: 'Quanto deseja economizar por mês (R$)', juntar: 'Valor total do objetivo (R$)' }[type];
}
function fillGoal() {
  const goal = state.goal, form = $('#goalForm');
  if (goal) {
    form.elements.objective.value = ['reduzir', 'economizar', 'juntar'].includes(goal.objective) ? goal.objective : 'juntar';
    form.elements.targetValue.value = goal.target_value; form.elements.savedAmount.value = goal.saved_amount;
    form.elements.targetCategory.value = goal.target_category || '';
    form.elements.deadline.value = state.analysis.goal?.deadline || '';
  }
  syncGoalFields();
}
$('#goalForm').elements.objective.addEventListener('change', syncGoalFields);
on('#goalForm', 'submit', async event => {
  await api('/api/goal', { method: 'PUT', body: JSON.stringify(formData(event.target)) }); await refresh(); toast('Meta atualizada. Gere uma nova análise para receber recomendações.');
});
function goalHtml() {
  if (state.analysis?.periodStatus === 'historical') return state.goal
    ? `<strong>${escapeHtml(state.goal.goal_name || 'Minha meta')}</strong><p>Esta é sua meta atual. Ela não é aplicada aos resultados de ${escapeHtml(monthLabel(state.month))}.</p>`
    : '<p>Escolha uma meta para orientar suas próximas análises.</p>';
  const goal = state.analysis?.goal;
  if (!goal) return '<p>Escolha uma meta para orientar suas recomendações.</p>';
  const note = goal.objective === 'economizar' ? 'Resultado positivo indica sobra nos lançamentos do mês, mas não confirma que esse valor foi guardado.'
    : goal.objective === 'juntar' ? goal.message : '';
  const badge = ['Acima do limite', 'Prazo encerrado', 'Informe as entradas'].includes(goal.status)
    ? `<span class="badge">${escapeHtml(goal.status)}</span>` : '';
  return `<div class="goal-heading"><strong>${escapeHtml(goal.goal_name)}</strong>${badge}</div>${goalProgressHtml(goal)}${note ? `<p class="goal-note">${escapeHtml(note)}</p>` : ''}`;
}
function goalProgressHtml(goal) {
  const target = Number(goal.target_value);
  if (!Number.isFinite(target) || target <= 0) return '';
  const current = Number(goal.objective === 'juntar' ? goal.saved_amount : goal.current);
  if (!Number.isFinite(current)) return '';
  const percentage = Math.min(100, Math.max(0, Math.round(current / target * 100)));
  let label, detail, tone;
  if (goal.objective === 'reduzir') {
    label = `Gasto em ${goal.target_category || 'categoria'} / limite`;
    detail = current > target ? `Limite ultrapassado em ${money(current - target)}.` : `Restam ${money(target - current)} até o limite.`;
    tone = current > target ? 'is-over' : current >= target * .8 ? 'is-warning' : '';
  } else if (goal.objective === 'economizar') {
    label = 'Resultado do mês / objetivo';
    detail = current < 0 ? `Resultado negativo. Diferença até o objetivo: ${money(target - current)}.`
      : current < target ? `Faltam ${money(target - current)} de resultado para o objetivo deste mês.`
        : 'Objetivo mensal alcançado pelo resultado registrado.';
    tone = current < 0 ? 'is-over' : current < target ? 'is-warning' : '';
  } else {
    label = 'Valor guardado / objetivo';
    detail = `${percentage}% do valor total informado como guardado.`;
    tone = '';
  }
  const values = `${money(current)} de ${money(target)}`;
  return `<div class="goal-progress ${tone}"><div class="goal-progress-values"><span>${escapeHtml(label)}</span><strong>${money(current)} / ${money(target)}</strong></div><div class="goal-progress-track" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}" aria-valuetext="${escapeHtml(values)}"><span style="width:${percentage}%"></span></div><p class="goal-progress-detail">${escapeHtml(detail)}</p></div>`;
}
function installmentCandidates(item) {
  const due = Date.parse(`${item.due_date}T00:00:00Z`);
  return state.transactions.filter(transaction => transaction.value < 0 && transaction.id !== item.source_transaction_id &&
    Math.abs(Date.parse(`${transaction.date}T00:00:00Z`) - due) <= 62 * 86400000 &&
    (!transaction.installment_number || transaction.installment_number === item.installment_number && transaction.installment_total === item.installment_total))
    .sort((a, b) => Math.abs(Math.round(a.value * 100) + Math.round(item.amount * 100)) - Math.abs(Math.round(b.value * 100) + Math.round(item.amount * 100)) ||
      Math.abs(Date.parse(`${a.date}T00:00:00Z`) - due) - Math.abs(Date.parse(`${b.date}T00:00:00Z`) - due)).slice(0, 100);
}
function forecastItemHtml(item) {
  const cancel = `<button type="button" class="secondary" data-cancel-installment="${item.id}" aria-label="Cancelar previsão da parcela ${item.installment_number} de ${item.installment_total}">Cancelar previsão</button>`;
  return `<div class="forecast-item"><span>${escapeHtml(item.due_date.split('-').reverse().join('/'))} · ${escapeHtml(item.category)} · ${item.installment_number}/${item.installment_total}</span><strong>${money(item.amount)}</strong>${cancel}</div>`;
}
function confirmationRowHtml(item) {
  const candidates = installmentCandidates(item);
  const selection = candidates.length
    ? `<select data-link-target="${item.id}" aria-label="Lançamento realizado para a parcela ${item.installment_number} de ${item.installment_total}"><option value="">Selecione o pagamento salvo</option>${candidates.map(transaction => `<option value="${transaction.id}">${escapeHtml(transaction.date.split('-').reverse().join('/'))} · ${escapeHtml(transaction.description)} · ${money(transaction.value)}</option>`).join('')}</select>`
    : '<small>Nenhum lançamento correspondente salvo.</small>';
  const description = item.description || 'Descrição indisponível';
  return `<tr><td>${escapeHtml(item.due_date.split('-').reverse().join('/'))}</td><td>${item.installment_number}/${item.installment_total}</td><td><div class="scrollable-description confirmation-description" tabindex="0" aria-label="Descrição da compra" title="${escapeHtml(description)}"><span>${escapeHtml(description)}</span></div></td><td>${escapeHtml(item.category)}</td><td class="confirmation-amount">${money(item.amount)}</td><td>${selection}</td><td class="confirmation-actions">${candidates.length ? `<button type="button" class="secondary" data-link-installment="${item.id}">Vincular</button>` : ''}<button type="button" class="secondary" data-cancel-installment="${item.id}" aria-label="Cancelar previsão da parcela ${item.installment_number} de ${item.installment_total}">Cancelar previsão</button></td></tr>`;
}
function renderOverview() {
  const a = state.analysis; if (!a) return;
  updateOverviewMonthNav();
  $('#emptyState').hidden = a.transactionCount > 0;
  $('#overviewKpis').innerHTML = [['Entradas', a.totalIncome], ['Despesas', a.totalExpenses], ['Resultado do período', a.balance]].map(([label, value], index) => {
    const resultClass = index === 2 ? value < 0 ? ' kpi-result-negative' : value > 0 ? ' kpi-result-positive' : '' : '';
    return `<article class="kpi${resultClass}"><span>${label}</span><strong>${money(value)}</strong></article>`;
  }).join('');
  $('#overviewGoal').innerHTML = goalHtml(); $('#goalSummary').innerHTML = goalHtml();
  $('#overviewPending').innerHTML = a.pendingCount ? `<p class="notice">${a.pendingCount} lançamento(s) precisam de revisão em Lançamentos.</p>` : '';
  $('#categoryTotals').innerHTML = a.categories.map(item => `<div class="row"><span class="category-total-label"><span class="category-swatch" style="background:${categoryColor(item.category)}" aria-hidden="true"></span><span>${escapeHtml(item.category)}</span></span><strong>${money(item.total)} <small>(${item.share}%)</small></strong></div>`).join('');
  const future = a.upcomingInstallments || { months: [], items: [], unreconciled: [] };
  $('#upcomingInstallments').innerHTML = `<div class="forecast-months">${future.months.map(item => `<div class="forecast-month"><span>${escapeHtml(item.month.slice(5))}/${escapeHtml(item.month.slice(0, 4))}</span><strong>${money(item.total)}</strong><small>${item.count} parcela(s)</small></div>`).join('')}</div>` +
    (future.items.length ? `<details class="forecast-details"><summary>Ver ${future.items.length} parcela(s) prevista(s)</summary><div class="forecast-items forecast-detail-list">${future.items.map(forecastItemHtml).join('')}</div></details>` : '<p>Nenhuma parcela prevista para os próximos três meses.</p>');
  $('#confirmationTitle').textContent = `Pagamentos para confirmar${future.unreconciled?.length ? ` (${future.unreconciled.length})` : ''}`;
  $('#paymentConfirmations').innerHTML = future.unreconciled?.length
    ? `<div class="confirmation-table-scroll" tabindex="0" role="region" aria-label="Pagamentos para confirmar"><table class="confirmation-table"><thead><tr><th>Vencimento</th><th>Parcela</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Lançamento</th><th>Ações</th></tr></thead><tbody>${future.unreconciled.map(confirmationRowHtml).join('')}</tbody></table></div><div class="confirmation-footer"><span>Pagamento ainda não registrado?</span><button type="button" class="secondary" data-view="gastos">Ir para Lançamentos</button></div>`
    : '<p class="hint">Nenhuma parcela pendente de confirmação.</p>';
  if (state.view === 'dashboard') renderChart();
}
async function handleInstallmentAction(event) {
  const linkButton = event.target.closest('[data-link-installment]');
  if (linkButton) {
    const installmentId = linkButton.dataset.linkInstallment;
    const transactionId = $(`[data-link-target="${installmentId}"]`).value;
    if (!transactionId) throw new Error('Escolha o lançamento realizado para vincular.');
    const installment = state.plannedInstallments.find(item => Number(item.id) === Number(installmentId));
    const installmentLabel = installment ? ` à parcela ${installment.installment_number}/${installment.installment_total}` : ' à parcela prevista';
    if (!confirm(`Vincular o lançamento selecionado${installmentLabel}? Confira se ele corresponde ao pagamento realizado.`)) return;
    await api(`/api/installments/${installmentId}/link`, { method: 'POST', body: JSON.stringify({ transactionId: Number(transactionId) }) });
    await refresh();
    toast('Parcela vinculada ao lançamento realizado.');
    return;
  }
  const button = event.target.closest('[data-cancel-installment]');
  if (!button) return;
  if (!confirm('Cancelar esta parcela prevista? O lançamento original e os gastos realizados serão mantidos.')) return;
  await api(`/api/installments/${button.dataset.cancelInstallment}`, { method: 'DELETE' });
  await refresh();
  toast('Previsão cancelada.');
}
on('#upcomingInstallments', 'click', handleInstallmentAction);
on('#paymentConfirmations', 'click', handleInstallmentAction);
function renderChart() {
  if (chart) { chart.destroy(); chart = null; }
  const items = state.analysis?.categories || [];
  $('#chartEmpty').hidden = Boolean(items.length); $('#chartWrap').hidden = !items.length;
  if (!items.length || !window.Chart) return;
  chart = new Chart($('#categoryChart'), { type: 'doughnut', data: { labels: items.map(item => item.category), datasets: [{ data: items.map(item => item.total), backgroundColor: items.map(item => categoryColor(item.category)), borderWidth: 3, borderColor: '#fff' }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '68%' } });
}
function updateGate() {
  const a = state.analysis;
  const historical = a?.periodStatus === 'historical';
  $('#aiChoice').hidden = historical;
  $('#analyzeBtn').hidden = historical;
  if (historical) {
    $('#analysisGate').textContent = 'Consulta histórica: confira totais, categorias e comparação mensal. Recomendações e IA ficam disponíveis para o mês atual ou anterior.';
    $('#analysisGate').className = 'analysis-gate info';
    $('#analyzeBtn').disabled = true;
    return;
  }
  const reason = !a?.transactionCount ? 'Adicione lançamentos ao período.' : !state.goal ? 'Escolha uma meta para gerar recomendações.' : a.pendingCount ? `Revise ${a.pendingCount} categoria(s) pendente(s) antes de gerar recomendações.` : '';
  $('#analysisGate').textContent = reason || 'Pronto para analisar os dados e a meta.';
  $('#analysisGate').className = `analysis-gate ${reason ? 'warning' : 'ready'}`;
  $('#analyzeBtn').disabled = Boolean(reason);
}
function block(title, items, empty) {
  return `<article class="card analysis-block"><h2>${title}</h2>${items.length ? `<ul>${items.map(item => `<li>${item.title ? `<strong>${escapeHtml(item.title)}</strong>` : ''}${escapeHtml(item.message || item)}</li>`).join('')}</ul>` : `<p>${empty}</p>`}</article>`;
}
function analysisReadingItems(summary) {
  return String(summary || '').split(/;\s+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/u).map(item => item.trim()).filter(Boolean);
}
function analysisSummaryBlock(a, historical) {
  const resultTone = a.balance < 0 ? 'negative' : a.balance > 0 ? 'positive' : 'neutral';
  const resultDetail = a.balance < 0 ? 'As despesas superaram as entradas.' : a.balance > 0 ? 'As entradas superaram as despesas.' : 'Entradas e despesas ficaram equilibradas.';
  const context = (a.insights || []).map(item => `<p><span aria-hidden="true">i</span>${escapeHtml(item)}</p>`).join('');
  const reading = analysisReadingItems(a.ai?.executiveSummary);
  return `<article class="card analysis-block analysis-summary"><h2>${historical ? 'Resumo histórico' : 'Resumo do período'}</h2>
    <div class="analysis-summary-kpis">
      <div><span>Entradas</span><strong>${money(a.totalIncome)}</strong></div>
      <div><span>Despesas</span><strong>${money(a.totalExpenses)}</strong></div>
      <div class="analysis-summary-result ${resultTone}"><span>Resultado</span><strong>${money(a.balance)}</strong><small>${resultDetail}</small></div>
    </div>
    ${reading.length ? `<section class="analysis-reading"><h3>Leitura do período</h3><ul>${reading.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : ''}
    ${context ? `<section class="analysis-context"><h3>Contexto dos dados</h3><div>${context}</div></section>` : ''}
  </article>`;
}
function lastAnalysisHtml(saved, analysis) {
  if (!saved) return '';
  const generatedAt = new Date(`${String(saved.createdAt).replace(' ', 'T')}Z`);
  const generatedLabel = Number.isNaN(generatedAt.getTime()) ? saved.createdAt : generatedAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const source = saved.source === 'openai' ? `IA${saved.model ? ` · ${saved.model}` : ''}` : 'Regras locais';
  const goalName = analysis.goal?.goal_name || 'Meta não informada';
  return `<article class="card last-analysis-card ${saved.stale ? 'is-stale' : 'is-current'}">
    <div class="last-analysis-heading"><div><h2>Última análise gerada</h2><p>${saved.stale ? 'Existem alterações posteriores a este resultado.' : 'Este resultado corresponde aos dados atuais.'}</p></div><span>${saved.stale ? 'Desatualizada' : 'Atualizada'}</span></div>
    <dl><div><dt>Período</dt><dd>${escapeHtml(monthLabel(saved.month))}</dd></div><div><dt>Gerada em</dt><dd>${escapeHtml(generatedLabel)}</dd></div><div><dt>Origem</dt><dd>${escapeHtml(source)}</dd></div><div><dt>Meta considerada</dt><dd>${escapeHtml(goalName)}</dd></div></dl>
    ${saved.stale ? '<p class="last-analysis-warning"><span aria-hidden="true">!</span><span>A análise permanece disponível para consulta. Gere uma nova antes de tomar as recomendações como atuais.</span></p>' : ''}
  </article>`;
}
function renderAnalysis() {
  const current = state.analysis; if (!current) return;
  const saved = current.savedAnalysis;
  const a = saved?.result || current;
  const historical = current.periodStatus === 'historical';
  $('#analysisTitle').textContent = `${historical ? 'Histórico' : 'Análise'} de ${monthLabel(state.month)}`;
  $('#analysisPeriodNote').textContent = historical
    ? 'Mês histórico: consulte os registros e compare com o mês anterior. A meta atual e as parcelas previstas hoje não são aplicadas a esse período.'
    : a.periodStatus === 'current'
      ? 'Mês em andamento: os resultados podem mudar conforme novos lançamentos são registrados. A meta atual é usada como referência.'
      : 'Mês anterior: confira se o extrato está completo. A meta atual é usada como referência para planejar os próximos meses.';
  $('#analysisMethod').hidden = !generated;
  if (generated) {
    $('#analysisMethodText').textContent = a.ai
      ? `Gerada com IA: o sistema calculou os valores, padrões e pontos de atenção; a IA escreveu o resumo e as recomendações.${a.aiStatus?.cached ? ' O texto foi reutilizado porque os dados não mudaram.' : ''}`
      : 'Gerada pelo sistema: os valores, padrões, pontos de atenção e recomendações foram calculados a partir dos lançamentos e da meta escolhida.';
  }
  const patterns = a.categories.slice(0, 3).map(item => ({ title: item.category, message: `${money(item.total)} — ${item.share}% das despesas.` }));
  a.recurring.slice(0, 3).forEach(item => patterns.push({ title: item.description, message: `${item.count} ocorrências, somando ${money(item.total)}. Repetição não significa gasto atípico.` }));
  if (a.monthlyComparison) patterns.push({ title: 'Comparação mensal', message: a.monthlyComparison.summary });
  const recommendations = generated ? a.ai?.recommendations || a.recommendations : [];
  const forecast = (a.upcomingInstallments?.months || []).filter(item => item.count).map(item => ({ title: `${item.month.slice(5)}/${item.month.slice(0, 4)}`, message: `${money(item.total)} em ${item.count} parcela(s) previstas. Não entram nas despesas realizadas.` }));
  $('#analysisResult').innerHTML = lastAnalysisHtml(saved, a) + analysisSummaryBlock(a, historical) + block('Padrões de consumo', patterns, 'Sem despesas suficientes para identificar padrões.') + (historical ? '' : block('Parcelas previstas a partir de hoje', forecast, 'Nenhuma parcela prevista para os próximos três meses.')) + block('Pontos de atenção', a.anomalies, 'Nenhum gasto atípico sinalizado pelas regras com os dados disponíveis.') + (historical ? '' : block('Recomendações para sua meta', recommendations, 'Revise os lançamentos, escolha uma meta e clique em Gerar análise.'));
}
on('#analyzeBtn', 'click', async () => {
  if (state.analysis?.periodStatus === 'historical') return;
  const version = analysisVersion, month = state.month;
  $('#analysisFreshness').textContent = 'Gerando análise…';
  const result = await api(`/api/ai/analysis?month=${month}&useAI=${$('#useAI').checked ? 1 : 0}`);
  if (version !== analysisVersion) return;
  state.analysis = result; generated = true;
  $('#analysisFreshness').textContent = 'Análise gerada para os registros e a meta atuais. Alterações exigem uma nova análise.';
  renderAnalysis();
  if (result.aiStatus?.warning) toast(result.aiStatus.warning);
});
on('#exportBtn', 'click', async () => {
  const data = await api('/api/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'meus-dados-fintrack.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
on('#revokeConsentBtn', 'click', async () => {
  if (!confirm('Revogar o consentimento e apagar os dados financeiros e as cópias locais do banco? Seu nome, e-mail, senha protegida, histórico do consentimento e registros técnicos serão mantidos para preservar a conta.')) return;
  await api('/api/consent/revoke', { method: 'POST', body: '{}' }); location.reload();
});
on('#acceptConsentBtn', 'click', async () => { await api('/api/consent/accept', { method: 'POST', body: '{}' }); await boot(); });
on('#deleteAccountForm', 'submit', async event => {
  if (!confirm('Excluir permanentemente sua conta, seus dados financeiros e as cópias locais do banco? Esta ação não pode ser desfeita.')) return;
  await api('/api/account', { method: 'DELETE', body: JSON.stringify(formData(event.target)) }); location.reload();
});
boot().catch(() => { $('#authPanel').hidden = false; $('#appPanel').hidden = true; });
