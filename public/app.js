const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const message = document.querySelector("#message");
const transactionForm = document.querySelector("#transactionForm");
const starterPanel = document.querySelector("#starterPanel");
const goalForm = document.querySelector("#goalForm");
const goalContributionForm = document.querySelector("#goalContributionForm");
const categoryForm = document.querySelector("#categoryForm");
const transactionsBody = document.querySelector("#transactionsBody");
const transactionAiHelper = document.querySelector("#transactionAiHelper");
const transactionSearch = document.querySelector("#transactionSearch");
const transactionTypeFilter = document.querySelector("#transactionTypeFilter");
const transactionCategoryFilter = document.querySelector("#transactionCategoryFilter");
const transactionMonthFilter = document.querySelector("#transactionMonthFilter");
const prevTransactionsPage = document.querySelector("#prevTransactionsPage");
const nextTransactionsPage = document.querySelector("#nextTransactionsPage");
const transactionsPageInfo = document.querySelector("#transactionsPageInfo");
const auditList = document.querySelector("#auditList");
const aiResult = document.querySelector("#aiResult");
const aiProvider = document.querySelector("#aiProvider");
const statementImportForm = document.querySelector("#statementImportForm");
const importMappingCard = document.querySelector("#importMappingCard");
const importMappingFields = document.querySelector("#importMappingFields");
const buildImportPreviewBtn = document.querySelector("#buildImportPreviewBtn");
const importStats = document.querySelector("#importStats");
const importPreviewCard = document.querySelector("#importPreviewCard");
const importPreviewBody = document.querySelector("#importPreviewBody");
const importNotice = document.querySelector("#importNotice");
const confirmImportBtn = document.querySelector("#confirmImportBtn");
const exportReportCsvBtn = document.querySelector("#exportReportCsvBtn");
const categorySuggestion = document.querySelector("#categorySuggestion");
const goalLivePreview = document.querySelector("#goalLivePreview");
const goalsList = document.querySelector("#goalsList");
const goalContributionSelect = document.querySelector("#goalContributionSelect");
const acceptConsentBtn = document.querySelector("#acceptConsentBtn");
const revokeConsentBtn = document.querySelector("#revokeConsentBtn");
const passwordInput = document.querySelector("#passwordInput");
const confirmPasswordInput = document.querySelector("#confirmPasswordInput");
const passwordBar = document.querySelector("#passwordBar");
const registerButton = document.querySelector("#registerButton");
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactCurrency = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const themeColors = {
  ink: "#0E1F1B",
  paper: "#F7F5F0",
  emerald: "#1F8A5F",
  ai: "#6C63FF",
  attention: "#E08A3C",
  critical: "#C0392B",
  muted: "#D8D6CF",
};
const categoryPalette = ["#1F8A5F", "#E08A3C", "#B66A55", "#5F7486", "#2F5D50"];

let transactions = [];
let categories = [];
let goals = [];
let analysis = null;
let importCandidates = [];
let importRows = [];
let importMapping = {};
let importSource = "importado";
let userConsentAccepted = true;
let categoryManuallyChanged = false;
let suggestionTimer = null;
let transactionPage = 1;
let editingGoalId = null;
const transactionPageSize = 8;
const charts = {};
const chartFontFamily = "Inter, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

const premiumCenterTextPlugin = {
  id: "premiumCenterText",
  afterDraw(chart, _args, options) {
    if (!options || !options.value) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = options.labelColor || "#6F766F";
    ctx.font = `700 12px ${chartFontFamily}`;
    ctx.fillText(options.label || "Total", x, y - 12);
    ctx.fillStyle = options.valueColor || "#111A17";
    ctx.font = `800 ${options.valueSize || 17}px ${chartFontFamily}`;
    ctx.fillText(options.value, x, y + 12);
    ctx.restore();
  },
};

function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  element.classList.toggle("hidden", hidden);
}

function toast(text) {
  message.textContent = text;
  message.classList.add("show");
  setTimeout(() => message.classList.remove("show"), 3400);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erro na solicitação.");
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    setHidden(document.querySelector("#registerForm"), button.dataset.tab !== "register");
    setHidden(document.querySelector("#loginForm"), button.dataset.tab !== "login");
  });
});

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(`.tab[data-tab="${button.dataset.authTab}"]`);
    target?.click();
    document.querySelector(".auth-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

function passwordStatus() {
  const password = passwordInput.value;
  return {
    length: password.length >= 8,
    number: /\d/.test(password),
    letter: /[A-Za-z]/.test(password),
    match: password.length > 0 && password === confirmPasswordInput.value,
  };
}

function updatePasswordUi() {
  const status = passwordStatus();
  const validCount = Object.values(status).filter(Boolean).length;
  document.querySelectorAll("#passwordRules li").forEach((rule) => {
    rule.classList.toggle("valid", Boolean(status[rule.dataset.rule]));
  });
  passwordBar.style.width = `${validCount * 25}%`;
  passwordBar.style.background = validCount < 2 ? "#c2463f" : validCount < 4 ? "#b8892d" : "#146b59";
  registerButton.disabled = false;
}

passwordInput.addEventListener("input", updatePasswordUi);
confirmPasswordInput.addEventListener("input", updatePasswordUi);
updatePasswordUi();

document.querySelector("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  data.name = String(data.name || "").trim();
  data.email = String(data.email || "").trim().toLowerCase();
  data.consentAccepted = event.currentTarget.elements.consentAccepted.checked;
  if (!Object.values(passwordStatus()).every(Boolean)) return toast("Confira as regras e a confirmação da senha.");
  try {
    await api("/api/register", { method: "POST", body: JSON.stringify(data) });
    await boot({ keepLoginOnError: true });
    toast("Conta criada com sucesso.");
  } catch (error) {
    toast(error.message);
  }
});

const loginForm = document.querySelector("#loginForm");
const loginButton = loginForm.querySelector("button[type='submit']");
let loginInProgress = false;

async function handleLogin(event) {
  if (event) event.preventDefault();
  if (loginInProgress) return;
  loginInProgress = true;
  loginButton.disabled = true;
  const original = loginButton.textContent;
  loginButton.textContent = "Entrando...";
  try {
    const data = formData(loginForm);
    data.email = String(data.email || "").trim().toLowerCase();
    loginForm.elements.email.value = data.email;
    await api("/api/login", { method: "POST", body: JSON.stringify(data) });
    await boot({ keepLoginOnError: true });
    toast("Conta aberta.");
  } catch (error) {
    toast(error.message);
  } finally {
    loginInProgress = false;
    loginButton.disabled = false;
    loginButton.textContent = original;
  }
}

loginForm.addEventListener("submit", handleLogin);

document.querySelector("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  document.body.classList.remove("dashboard-active", "consent-inactive");
  setHidden(appPanel, true);
  setHidden(authPanel, false);
});

const viewTitles = {
  dashboard: "Dashboard",
  gastos: "Lançamentos",
  categorias: "Categorias",
  metas: "Metas",
  relatorios: "Relatórios",
  ia: "Análise com IA",
  configuracoes: "Configurações",
};

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.addEventListener("click", (event) => {
  const shortcut = event.target.closest("[data-go-view]");
  if (shortcut) showView(shortcut.dataset.goView);
});

function showView(view) {
  if (!userConsentAccepted && view !== "configuracoes") {
    view = "configuracoes";
    toast("Aceite novamente o termo para liberar o painel financeiro.");
  }
  document.querySelectorAll(".app-view").forEach((section) => {
    const active = section.dataset.page === view;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelector("#pageTitle").textContent = viewTitles[view] || "EduFin";
  requestAnimationFrame(() => renderVisibleCharts(view));
  if (view === "configuracoes") loadAudit();
  refreshIcons();
}

document.querySelector("#quickExpenseBtn").addEventListener("click", () => {
  resetTransactionForm();
  showView("gastos");
  transactionForm.elements.description.focus();
});

transactionForm.elements.category.addEventListener("change", () => {
  categoryManuallyChanged = true;
});

transactionForm.elements.description.addEventListener("input", () => {
  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(suggestCategoryFromDescription, 260);
});

async function suggestCategoryFromDescription() {
  const description = transactionForm.elements.description.value.trim();
  if (description.length < 3) {
    setHidden(categorySuggestion, true);
    return;
  }
  try {
    const suggestion = await api(`/api/category-suggest?description=${encodeURIComponent(description)}`);
    const allowed = categories.some((item) => item.name === suggestion.category);
    if (!allowed || suggestion.category === "Categoria pendente") {
      categorySuggestion.querySelector("span").textContent = "Categoria ainda não identificada. Escolha uma opção.";
      setHidden(categorySuggestion, false);
      refreshIcons();
      return;
    }
    if (!categoryManuallyChanged || !transactionForm.elements.category.value) {
      transactionForm.elements.category.value = suggestion.category;
    }
    if (transactionForm.elements.type && !transactionForm.elements.id.value) {
      transactionForm.elements.type.value = suggestion.category === "Receita" ? "entrada" : "saida";
    }
    categorySuggestion.querySelector("span").textContent = `Sugestão automática: ${suggestion.category} (${suggestion.confidence}).`;
    setHidden(categorySuggestion, false);
    refreshIcons();
  } catch {
    setHidden(categorySuggestion, true);
  }
}

transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(transactionForm);
  const id = data.id;
  delete data.id;
  try {
    await api(id ? `/api/transactions/${id}` : "/api/transactions", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    toast(id ? "Lançamento atualizado." : "Lançamento salvo.");
    resetTransactionForm();
    await refreshFinancialData();
    showView("dashboard");
  } catch (error) {
    toast(error.message);
  }
});

document.querySelector("#cancelEditBtn").addEventListener("click", resetTransactionForm);

function resetTransactionForm() {
  transactionForm.reset();
  transactionForm.elements.id.value = "";
  transactionForm.elements.date.value = new Date().toISOString().slice(0, 10);
  if (transactionForm.elements.type) transactionForm.elements.type.value = "saida";
  if (transactionForm.elements.paymentMethod) transactionForm.elements.paymentMethod.value = "Manual";
  if (transactionForm.elements.status) transactionForm.elements.status.value = "Concluida";
  categoryManuallyChanged = false;
  setHidden(categorySuggestion, true);
  document.querySelector("#formTitle").textContent = "Lançamento manual";
  setHidden(document.querySelector("#cancelEditBtn"), true);
}

async function loadTransactions() {
  transactions = await api("/api/transactions");
  renderTransactionFilters();
  transactionPage = 1;
  renderTransactionsTable();
  renderRecentTransactions();
  updateTransactionStats();
  renderTransactionAiHelper();
  renderStarterState();
  refreshIcons();
}

function filteredTransactions() {
  const search = normalizeText(transactionSearch?.value || "");
  const type = transactionTypeFilter?.value || "";
  const category = transactionCategoryFilter?.value || "";
  const month = transactionMonthFilter?.value || "";
  return transactions.filter((item) => {
    const haystack = normalizeText(`${item.description} ${item.category} ${item.payment_method || ""} ${item.transaction_status || ""}`);
    const itemType = item.type || (item.value >= 0 ? "entrada" : "saida");
    return (!search || haystack.includes(search))
      && (!type || itemType === type)
      && (!category || item.category === category)
      && (!month || String(item.date || "").startsWith(month));
  });
}

function renderTransactionsTable() {
  const items = filteredTransactions();
  const totalPages = Math.max(1, Math.ceil(items.length / transactionPageSize));
  transactionPage = Math.min(Math.max(transactionPage, 1), totalPages);
  const pageItems = items.slice((transactionPage - 1) * transactionPageSize, transactionPage * transactionPageSize);
  const rows = pageItems.map((item) => `
    <tr>
      <td>${formatDate(item.date)}</td>
      <td><strong>${escapeHtml(item.description)}</strong></td>
      <td><span class="category-badge">${escapeHtml(item.category)}</span></td>
      <td><span class="type-badge ${escapeHtml(item.type || (item.value >= 0 ? "entrada" : "saida"))}">${escapeHtml(typeLabel(item.type || (item.value >= 0 ? "entrada" : "saida")))}</span></td>
      <td>${escapeHtml(item.payment_method || "Manual")}</td>
      <td><span class="status-badge">${escapeHtml(statusLabel(item.transaction_status || "Concluida"))}</span></td>
      <td><span class="source-badge">${escapeHtml(sourceLabel(item.source || item.classification_source || "manual"))}</span></td>
      <td class="${item.value < 0 ? "value-negative" : "value-positive"}">${currency.format(item.value)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-button secondary" data-edit="${item.id}" type="button" title="Editar"><i data-lucide="pencil"></i></button>
          <button class="icon-button delete-button" data-delete="${item.id}" type="button" title="Excluir"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
  const emptyMessage = transactions.length === 0
    ? "Nenhuma transação importada ainda. Importe um extrato ou cadastre uma transação para começar."
    : "Nenhuma transação encontrada para os filtros selecionados.";
  transactionsBody.innerHTML = rows || `<tr><td colspan="9"><div class="empty-compact">${emptyMessage}</div></td></tr>`;
  if (transactionsPageInfo) transactionsPageInfo.textContent = `Página ${transactionPage} de ${totalPages} - ${items.length} registro(s)`;
  if (prevTransactionsPage) prevTransactionsPage.disabled = transactionPage <= 1;
  if (nextTransactionsPage) nextTransactionsPage.disabled = transactionPage >= totalPages;
  refreshIcons();
}

function renderTransactionFilters() {
  if (!transactionCategoryFilter) return;
  const current = transactionCategoryFilter.value;
  const names = [...new Set(transactions.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  transactionCategoryFilter.innerHTML = `<option value="">Todas</option>${names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  if (names.includes(current)) transactionCategoryFilter.value = current;
}

function renderTransactionAiHelper() {
  if (!transactionAiHelper) return;
  const pending = transactions.filter((item) => item.category === "Categoria pendente").length;
  const learned = transactions.filter((item) => item.classification_source === "regra aprendida").length;
  const automatic = transactions.filter((item) => ["regra local", "regra aprendida", "openai"].includes(String(item.classification_source || "").toLowerCase())).length;
  const helperText = transactions.length === 0
    ? "A IA aparece aqui para sugerir categorias enquanto você digita ou importa um extrato. Ela só pergunta quando não tiver confiança."
    : pending > 0
      ? `${pending} lançamento(s) precisam de revisão. Corrija só esses casos para o sistema aprender nas próximas importações.`
      : "Os lançamentos estão categorizados. Ao corrigir uma categoria, o FinTrack aprende a regra para as próximas análises.";
  transactionAiHelper.innerHTML = `
    <div class="panel-head"><div><h3>IA nos lançamentos</h3><p>Ajuda automática para separar gastos, entradas e categorias.</p></div><i data-lucide="sparkles"></i></div>
    <p>${escapeHtml(helperText)}</p>
    <div class="automation-grid compact">
      <div><span>Automáticos</span><strong>${automatic}</strong></div>
      <div><span>Aprendidos</span><strong>${learned}</strong></div>
      <div><span>Pendentes</span><strong>${pending}</strong></div>
    </div>
    <button type="button" class="secondary" data-go-view="ia"><i data-lucide="message-circle"></i><span>Ver análise da IA</span></button>
  `;
}

function resetTransactionPagination() {
  transactionPage = 1;
  renderTransactionsTable();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

transactionSearch?.addEventListener("input", resetTransactionPagination);
transactionTypeFilter?.addEventListener("change", resetTransactionPagination);
transactionCategoryFilter?.addEventListener("change", resetTransactionPagination);
transactionMonthFilter?.addEventListener("change", resetTransactionPagination);
prevTransactionsPage?.addEventListener("click", () => {
  transactionPage -= 1;
  renderTransactionsTable();
});
nextTransactionsPage?.addEventListener("click", () => {
  transactionPage += 1;
  renderTransactionsTable();
});

transactionsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.edit) {
    const item = transactions.find((entry) => String(entry.id) === String(button.dataset.edit));
    transactionForm.elements.id.value = item.id;
    transactionForm.elements.description.value = item.description;
    transactionForm.elements.value.value = Math.abs(Number(item.value || 0));
    transactionForm.elements.date.value = item.date;
    transactionForm.elements.category.value = item.category;
    if (transactionForm.elements.type) transactionForm.elements.type.value = item.type || (item.value >= 0 ? "entrada" : "saida");
    if (transactionForm.elements.paymentMethod) transactionForm.elements.paymentMethod.value = item.payment_method || "Manual";
    if (transactionForm.elements.status) transactionForm.elements.status.value = item.transaction_status || "Concluida";
    categoryManuallyChanged = true;
    setHidden(categorySuggestion, true);
    document.querySelector("#formTitle").textContent = "Editar lançamento";
    setHidden(document.querySelector("#cancelEditBtn"), false);
    showView("gastos");
    transactionForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (button.dataset.delete && confirm("Excluir este lançamento?")) {
    await api(`/api/transactions/${button.dataset.delete}`, { method: "DELETE" });
    toast("Lançamento excluído.");
    await refreshFinancialData();
  }
});

function renderRecentTransactions() {
  const container = document.querySelector("#recentTransactions");
  if (transactions.length === 0) {
    container.innerHTML = `<div class="empty-compact">Nenhum lançamento cadastrado.</div>`;
    return;
  }
  container.innerHTML = transactions.slice(0, 5).map((item) => `
    <div class="recent-item">
      <span class="recent-icon" style="--item-color:${categoryColor(item.category)}"><i data-lucide="${categoryIcon(item.category, item.value)}"></i></span>
      <div><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(item.category)} - ${formatDate(item.date)}</small></div>
      <b class="${item.value < 0 ? "value-negative" : "value-positive"}">${currency.format(item.value)}</b>
    </div>
  `).join("");
  refreshIcons();
}

function renderStarterState() {
  const dashboard = document.querySelector('[data-page="dashboard"]');
  const isEmpty = transactions.length === 0;
  setHidden(starterPanel, !isEmpty);
  dashboard?.classList.toggle("empty-dashboard", isEmpty);
}

function updateTransactionStats() {
  const expenses = transactions.filter((item) => item.value < 0);
  const largest = expenses.sort((a, b) => a.value - b.value)[0];
  const totals = new Map();
  expenses.forEach((item) => totals.set(item.category, (totals.get(item.category) || 0) + Math.abs(item.value)));
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  document.querySelector("#largestExpense").textContent = currency.format(largest ? Math.abs(largest.value) : 0);
  document.querySelector("#topCategory").textContent = top?.[0] || "Sem dados";
  document.querySelector("#transactionCount").textContent = String(transactions.length);
}

async function loadCategories() {
  categories = await api("/api/categories");
  renderCategoryOptions();
  renderCategoryCards();
  renderDashboardBudgets();
  updateBudgetStatus();
}

function renderCategoryOptions() {
  const select = transactionForm.elements.category;
  const current = select.value;
  select.innerHTML = `<option value="">Selecione</option>${categories.map((item) => (
    `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`
  )).join("")}`;
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function renderCategoryCards() {
  const grid = document.querySelector("#categoriesGrid");
  grid.innerHTML = categories.filter((item) => item.name !== "Receita").map((item) => {
    const suggestion = categorySuggestionBudget(item.name);
    const recommended = suggestion?.suggestedMonthly || 0;
    const spent = Number(item.spent || 0);
    const percentage = recommended > 0 ? Math.round((spent / recommended) * 100) : 0;
    const width = Math.min(percentage, 100);
    const statusKey = suggestion ? budgetStatus(percentage) : spent > 0 ? "dentro" : "neutro";
    const statusLabels = { dentro: "Dentro da sugestão", atencao: "Atenção", critico: "Crítico", neutro: "Sem gasto" };
    const status = suggestion
      ? suggestion.reason
      : "A IA sugerirá um valor quando houver gastos nesta categoria.";
    return `
      <article class="category-card status-${statusKey}">
        <div class="category-card-head">
          <span class="category-card-icon" style="--category-color:${item.color}"><i data-lucide="${categoryIcon(item.name)}"></i></span>
          <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(status)}</p></div>
          <div class="row-actions"><button class="icon-button secondary" data-category-edit="${item.id}" type="button" title="Editar"><i data-lucide="pencil"></i></button>${!["Outros", "Receita", "Metas"].includes(item.name) ? `<button class="icon-button delete-button" data-category-delete="${item.id}" type="button" title="Excluir"><i data-lucide="trash-2"></i></button>` : ""}</div>
        </div>
        <div class="category-numbers"><strong>${currency.format(spent)}</strong><span>${recommended > 0 ? `Sugestão ${currency.format(recommended)}/mês` : "Aguardando dados"}</span></div>
        <div class="progress-track"><span style="width:${width}%;background:${statusKey === "neutro" ? item.color : budgetStatusColor(statusKey)}"></span></div>
        <div class="category-card-foot"><span class="category-status">${statusLabels[statusKey]}</span><small>${recommended > 0 ? `${percentage}% da sugestão mensal` : "Cadastre lançamentos para receber uma sugestão"}</small></div>
      </article>
    `;
  }).join("");
  refreshIcons();
}

function categorySuggestionBudget(categoryName) {
  return (analysis?.categoryBudgetSuggestions || []).find((item) => item.category === categoryName) || null;
}

document.querySelector("#categoriesGrid").addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.categoryEdit) {
    const item = categories.find((entry) => String(entry.id) === String(button.dataset.categoryEdit));
    categoryForm.elements.id.value = item.id;
    categoryForm.elements.name.value = item.name;
    categoryForm.elements.color.value = item.color;
    document.querySelector("#categoryFormTitle").textContent = "Editar categoria";
    setHidden(document.querySelector("#cancelCategoryBtn"), false);
    categoryForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (button.dataset.categoryDelete && confirm("Excluir a categoria? Lançamentos existentes irão para Outros.")) {
    try {
      await api(`/api/categories/${button.dataset.categoryDelete}`, { method: "DELETE" });
      toast("Categoria excluída.");
      await refreshFinancialData();
    } catch (error) {
      toast(error.message);
    }
  }
});

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(categoryForm);
  const id = data.id;
  delete data.id;
  try {
    await api(id ? `/api/categories/${id}` : "/api/categories", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    toast(id ? "Categoria atualizada." : "Categoria criada.");
    resetCategoryForm();
    await refreshFinancialData();
  } catch (error) {
    toast(error.message);
  }
});

document.querySelector("#cancelCategoryBtn").addEventListener("click", resetCategoryForm);

function resetCategoryForm() {
  categoryForm.reset();
  categoryForm.elements.id.value = "";
  categoryForm.elements.color.value = "#285e8e";
  document.querySelector("#categoryFormTitle").textContent = "Nova categoria";
  setHidden(document.querySelector("#cancelCategoryBtn"), true);
}

function renderDashboardBudgets() {
  const container = document.querySelector("#dashboardBudgets");
  const items = (analysis?.categoryBudgetSuggestions || [])
    .filter((item) => item.suggestedMonthly > 0)
    .sort((a, b) => (b.currentMonthly || 0) - (a.currentMonthly || 0))
    .slice(0, 5);
  container.innerHTML = items.map((item) => {
    const percentage = item.suggestedMonthly > 0 ? Math.round((item.currentMonthly / item.suggestedMonthly) * 100) : 0;
    const overAmount = Math.max((item.currentMonthly || 0) - (item.suggestedMonthly || 0), 0);
    const status = budgetStatus(percentage);
    const detail = status === "dentro"
      ? `Dentro da sugestão mensal de ${currency.format(item.suggestedMonthly)}`
      : `${currency.format(overAmount)} acima da sugestão mensal de ${currency.format(item.suggestedMonthly)}`;
    const fill = Math.min(Math.max(percentage / 2, 2), 100);
    const statusText = status === "dentro" ? "dentro do previsto" : status === "atencao" ? "atenção" : "crítico";
    const alert = status === "critico"
      ? `<span class="budget-alert"><i data-lucide="triangle-alert"></i>Crítico</span>`
      : status === "atencao"
        ? `<span class="budget-alert"><i data-lucide="circle-alert"></i>Atenção</span>`
        : "";
    return `
      <div class="budget-row status-${status}">
        <div class="budget-label"><strong>${escapeHtml(item.category)}</strong>${alert}<b>${percentage}%</b></div>
        <div class="budget-track-dual" style="--suggested-width:50%;--actual-width:${fill}%;--status-color:${budgetStatusColor(status)}"><span class="suggested-bar"></span><span class="actual-bar"></span></div>
        <small><b>${statusText}</b> - ${escapeHtml(detail)}</small>
    </div>
    `;
  }).join("") || `<div class="empty-compact empty-action">Importe lançamentos para a IA sugerir quanto gastar em cada categoria.</div>`;
  refreshIcons();
}

function budgetStatus(percentage) {
  if (percentage > 120) return "critico";
  if (percentage > 100) return "atencao";
  return "dentro";
}

function budgetStatusColor(status) {
  if (status === "critico") return themeColors.critical;
  if (status === "atencao") return themeColors.attention;
  return themeColors.emerald;
}

function budgetStatusFromSuggestion(item) {
  const percentage = Number(item.suggestedMonthly || 0) > 0
    ? Math.round((Number(item.currentMonthly || 0) / Number(item.suggestedMonthly || 1)) * 100)
    : 0;
  return budgetStatus(percentage);
}

function updateBudgetStatus() {
  const statusElement = document.querySelector("#budgetStatus");
  const detailElement = document.querySelector("#budgetStatusDetail");
  if (!statusElement || !detailElement) return;
  const tracked = analysis?.categoryBudgetSuggestions || [];
  const attention = tracked.filter((item) => budgetStatusFromSuggestion(item) !== "dentro");
  statusElement.textContent = attention.length ? `${attention.length} para revisar` : tracked.length ? `${tracked.length} analisadas` : "Aguardando dados";
  detailElement.textContent = attention.length
    ? attention.map((item) => item.category).join(", ")
    : tracked.length ? "Dentro da sugestão" : "Cadastre lançamentos";
}

function statusColor(item, fallback) {
  if (item.status === "acima") return "#c2463f";
  if (item.status === "atencao") return "#d4a017";
  return fallback;
}

goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formData(goalForm);
    if (editingGoalId) data.id = editingGoalId;
    const result = await api("/api/goal", { method: "PUT", body: JSON.stringify(data) });
    editingGoalId = result.id || editingGoalId;
    toast("Meta salva.");
    await loadGoal(editingGoalId);
    await loadAnalysis(false);
  } catch (error) {
    toast(error.message);
  }
});

goalForm.addEventListener("input", updateGoalLivePreview);

goalsList?.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-goal-edit]");
  const newButton = event.target.closest("[data-goal-new]");
  if (newButton) {
    resetGoalForm();
    goalForm.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (editButton) {
    const goal = goals.find((item) => String(item.id) === String(editButton.dataset.goalEdit));
    if (goal) {
      fillGoalForm(goal);
      goalForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
});

goalContributionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formData(goalContributionForm);
    if (goalContributionSelect) data.goalId = goalContributionSelect.value;
    await api("/api/goal/contribution", {
      method: "POST",
      body: JSON.stringify(data),
    });
    goalContributionForm.reset();
    goalContributionForm.elements.date.value = new Date().toISOString().slice(0, 10);
    toast("Valor guardado adicionado à meta e aos lançamentos.");
    await refreshFinancialData();
    await loadGoal();
    if (goalContributionSelect && goals[0]) goalContributionSelect.value = goals[0].id;
    showView("metas");
  } catch (error) {
    toast(error.message);
  }
});

async function loadGoal(selectedGoalId) {
  const result = await api("/api/goal");
  goals = result.goals || (result.goal ? [result.goal] : []);
  renderGoalsList();
  renderGoalContributionOptions();
  if (goalContributionForm?.elements.date && !goalContributionForm.elements.date.value) {
    goalContributionForm.elements.date.value = new Date().toISOString().slice(0, 10);
  }
  if (!goals.length) {
    resetGoalForm();
    updateGoalLivePreview();
    return;
  }
  const selected = goals.find((item) => String(item.id) === String(selectedGoalId || editingGoalId)) || goals[0];
  fillGoalForm(selected);
  if (goalContributionSelect && !goalContributionSelect.value) goalContributionSelect.value = selected.id;
  refreshIcons();
}

function fillGoalForm(goal) {
  editingGoalId = goal?.id || null;
  goalForm.elements.goalName.value = goal?.goal_name || "";
  goalForm.elements.objective.value = goal?.objective || "";
  goalForm.elements.targetValue.value = goal?.target_value || "";
  goalForm.elements.savedAmount.value = goal?.saved_amount || 0;
  goalForm.elements.plannedMonthlySavings.value = "";
  goalForm.elements.targetMonths.value = goal?.target_months || "";
  goalForm.elements.intensity.value = goal?.intensity || "equilibrado";
  const title = goalForm.querySelector(".panel-head h3");
  if (title) title.textContent = editingGoalId ? "Editar meta" : "Nova meta";
  updateGoalLivePreview();
}

function resetGoalForm() {
  editingGoalId = null;
  goalForm.reset();
  goalForm.elements.savedAmount.value = 0;
  goalForm.elements.intensity.value = "equilibrado";
  const title = goalForm.querySelector(".panel-head h3");
  if (title) title.textContent = "Nova meta";
  updateGoalLivePreview();
}

function renderGoalsList() {
  if (!goalsList) return;
  if (!goals.length) {
    goalsList.innerHTML = `<div class="empty-compact">Você ainda não criou nenhuma meta. Preencha o formulário para começar.</div>`;
    return;
  }
  goalsList.innerHTML = `
    ${goals.map((goal) => `
      <article class="goal-item-card">
        <div class="goal-item-head">
          <span class="goal-item-icon"><i data-lucide="${goalIcon(goal.objective)}"></i></span><div><span>${escapeHtml(objectiveLabel(goal.objective))}</span><strong>${escapeHtml(goal.goal_name)}</strong></div>
          <span class="goal-item-percent">${goal.progressPercentage || 0}%</span>
          <button type="button" class="icon-button secondary" data-goal-edit="${goal.id}" title="Editar meta"><i data-lucide="pencil"></i></button>
        </div>
        <div class="goal-mini-progress"><span style="width:${Math.min(goal.progressPercentage || 0, 100)}%"></span></div>
        <div class="goal-item-grid">
          <div><span>Guardado</span><strong>${currency.format(goal.saved_amount || 0)}</strong></div>
          <div><span>Falta</span><strong>${currency.format(goal.remainingAmount || 0)}</strong></div>
          <div><span>Necessário/mês</span><strong>${currency.format(goal.monthlyTarget || 0)}</strong></div>
          <div><span>Previsão</span><strong>${escapeHtml(goal.forecastConclusion || "-")}</strong></div>
        </div>
        <small class="goal-item-status">${escapeHtml(goal.status || "Em andamento")} - ${currency.format(goal.saved_amount || 0)} guardados</small>
      </article>
    `).join("")}
    <button type="button" class="secondary" data-goal-new><i data-lucide="plus"></i><span>Criar outra meta</span></button>
  `;
}

function renderGoalContributionOptions() {
  if (!goalContributionSelect) return;
  const current = goalContributionSelect.value;
  goalContributionSelect.innerHTML = `<option value="">Selecione uma meta</option>${goals.map((goal) => `<option value="${goal.id}">${escapeHtml(goal.goal_name)} - falta ${currency.format(goal.remainingAmount || 0)}</option>`).join("")}`;
  if (goals.some((goal) => String(goal.id) === String(current))) goalContributionSelect.value = current;
  else if (goals[0]) goalContributionSelect.value = goals[0].id;
}

function updateGoalLivePreview() {
  const goalName = goalForm.elements.goalName.value.trim() || "Nova meta";
  const target = Number(goalForm.elements.targetValue.value || 0);
  const saved = Number(goalForm.elements.savedAmount.value || 0);
  const months = Number(goalForm.elements.targetMonths.value || 0);
  const intensity = goalForm.elements.intensity.value || "equilibrado";
  if (!target || !months) {
    goalLivePreview.textContent = "Preencha a meta para calcular quanto falta.";
    document.querySelector("#economyModes").innerHTML = "";
    return;
  }
  const remaining = Math.max(target - Math.max(saved, 0), 0);
  const monthly = remaining / Math.max(months, 1);
  const multipliers = { leve: 0.75, equilibrado: 1, intenso: 1.35 };
  const labels = { leve: "Leve", equilibrado: "Equilibrado", intenso: "Agressivo" };
  const modeMonthly = remaining > 0 ? Math.max(monthly * (multipliers[intensity] || 1), 1) : 0;
  const modeMonths = modeMonthly > 0 && remaining > 0 ? Math.ceil(remaining / modeMonthly) : 0;
  const motivational = remaining === 0
    ? "Meta concluída. Excelente para apresentar o progresso!"
    : modeMonthly >= monthly
      ? `Com o modo ${labels[intensity]}, a previsão fica em ${modeMonths} mês(es).`
      : `Modo ${labels[intensity]} reduz o impacto mensal, mas pode passar para ${modeMonths} mês(es).`;
  goalLivePreview.innerHTML = `<span>${escapeHtml(goalName)}</span><span>Faltam <strong>${currency.format(remaining)}</strong></span><span>Necessário no prazo <strong>${currency.format(monthly)}</strong></span><span>Ritmo escolhido <strong>${currency.format(modeMonthly)}</strong></span><span>${escapeHtml(motivational)}</span>`;
  document.querySelector("#economyModes").innerHTML = ["leve", "equilibrado", "intenso"].map((mode) => {
    const amount = remaining > 0 ? Math.max(monthly * multipliers[mode], 1) : 0;
    const finish = amount > 0 ? Math.ceil(remaining / amount) : 0;
    const selected = mode === intensity ? " active" : "";
    return `<article class="economy-mode${selected}"><span>${labels[mode]}</span><strong>${currency.format(amount)}</strong><small>por mês - conclusão estimada em ${finish} mês(es)</small></article>`;
  }).join("");
}

document.querySelector("#analyzeBtn").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="button-spinner"></span><span>Analisando...</span>`;
  try {
    await loadAnalysis(true);
    toast("Análise concluída.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
    refreshIcons();
  }
});

async function loadAnalysis(useAI) {
  analysis = await api(`/api/ai/analysis${useAI ? "?useAI=1" : ""}`);
  updateSummaryKpis();
  renderGoalSummary();
  renderCategoryCards();
  renderDashboardBudgets();
  if (useAI) renderAIReport();
  renderVisibleCharts(document.querySelector(".app-view.active")?.dataset.page || "dashboard");
}

async function loadAIStatus() {
  const status = await api("/api/ai/status");
  aiProvider.textContent = status.configured
    ? `OpenAI conectada - ${status.remainingToday}/${status.dailyLimit} análises`
    : status.hasApiKey && !status.hasModel
      ? "Chave encontrada - configure OPENAI_MODEL"
      : "Análise local - sem chave OpenAI";
  aiProvider.title = status.message || "";
  aiProvider.className = `provider-badge ${status.configured ? "openai" : "warning"}`;
}

function updateSummaryKpis() {
  if (!analysis) return;
  const goalList = analysis.goals || (analysis.goal ? [analysis.goal] : []);
  const totalSavedGoals = goalList.reduce((sum, goal) => sum + Number(goal.saved_amount || 0), 0);
  const totalRemainingGoals = goalList.reduce((sum, goal) => sum + Number(goal.remainingAmount || 0), 0);
  document.querySelector("#income").textContent = currency.format(analysis.totalIncome);
  document.querySelector("#expenses").textContent = currency.format(analysis.totalExpenses);
  document.querySelector("#balance").textContent = currency.format(analysis.balance);
  document.querySelector("#savedGoalKpi").textContent = currency.format(totalSavedGoals);
  document.querySelector("#savedGoalDetail").textContent = goalList.length ? `${currency.format(totalRemainingGoals)} faltando em ${goalList.length} meta(s)` : "Sem meta ativa";
  document.querySelector("#goalProgressKpi").textContent = `${analysis.goal?.progressPercentage || 0}%`;
  document.querySelector("#goalProgressDetail").textContent = analysis.goal?.status || "Cadastre uma meta";
  document.querySelector("#suggestedSavingsKpi").textContent = currency.format(analysis.potentialMonthlySavings || 0);
  document.querySelector("#aiIncome").textContent = currency.format(analysis.totalIncome);
  document.querySelector("#aiExpenses").textContent = currency.format(analysis.totalExpenses);
  document.querySelector("#aiBalance").textContent = currency.format(analysis.balance);
  document.querySelector("#aiTopCategory").textContent = analysis.categories[0]?.category || "Sem dados";
  document.querySelector(".balance-card")?.classList.toggle("is-critical", Number(analysis.balance || 0) < 0);
  renderDashboardGoalCard();
  renderAssistantHub();
}

function renderAssistantHub() {
  const summary = document.querySelector("#assistantSummary");
  if (!summary || !analysis) return;
  const top = analysis.categories[0];
  const goal = analysis.goal;
  const balanceText = analysis.balance >= 0
    ? `Seu saldo está positivo em ${currency.format(analysis.balance)}.`
    : `Você gastou ${currency.format(Math.abs(analysis.balance))} acima das entradas.`;
  const topText = top
    ? `A maior pressão está em ${top.category}, com ${top.share}% das despesas.`
    : "Ainda não há gastos suficientes para identificar um padrão principal.";
  const goalText = goal
    ? `Para ${goal.goal_name}, guarde ${currency.format(goal.monthlyTarget)} por mês.`
    : "Cadastre uma meta para transformar a análise em um plano mensal.";
  summary.textContent = `${balanceText} ${topText} ${goalText}`;
  const topEl = document.querySelector("#assistantTopCategory");
  const goalEl = document.querySelector("#assistantGoalHint");
  const monthEl = document.querySelector("#assistantMonthlyHint");
  if (topEl) topEl.textContent = top ? `${top.category} (${top.share}%)` : "Sem dados";
  if (goalEl) goalEl.textContent = goal ? `${goal.progressPercentage}% - ${goal.goal_name}` : "Cadastre uma meta";
  if (monthEl) monthEl.textContent = analysis.totalExpenses > 0 ? `${analysis.months} mês(es) analisado(s)` : "Aguardando gastos";
}

function renderDashboardGoalCard() {
  const container = document.querySelector("#dashboardGoalCard");
  if (!analysis?.goal) {
    container.className = "goal-dashboard-empty";
    container.textContent = "Cadastre uma meta para acompanhar o progresso.";
    return;
  }
  const goal = analysis.goal;
  container.className = "goal-dashboard";
  container.innerHTML = `
    <div class="goal-progress-ring" role="img" aria-label="${goal.progressPercentage}% da meta concluída" style="--progress:${goal.progressPercentage * 3.6}deg"><strong>${goal.progressPercentage}%</strong></div>
    <div class="goal-dashboard-info">
      <span class="status-chip ${goal.status.toLowerCase().replace(/\s+/g, "-")}">${escapeHtml(goal.status)}</span>
      <h4>${escapeHtml(goal.goal_name || objectiveLabel(goal.objective))}</h4>
      <p>${currency.format(goal.saved_amount)} guardados de ${currency.format(goal.target_value)}. Faltam ${currency.format(goal.remainingAmount)}.</p>
      <div class="goal-dashboard-grid">
        <div><span>Guardar este mês</span><strong>${currency.format(goal.monthlyTarget)}</strong></div>
        <div><span>Modo ${escapeHtml(goal.modeLabel)}</span><strong>${currency.format(goal.modeMonthlyTarget)}</strong></div>
      </div>
    </div>
  `;
}

function renderAIReport() {
  if (!analysis || (analysis.totalIncome === 0 && analysis.totalExpenses === 0)) {
    aiProvider.textContent = "Aguardando dados";
    aiProvider.className = "provider-badge warning";
    aiResult.innerHTML = `<div class="empty-state"><i data-lucide="sparkles"></i><h3>Análise ainda indisponível</h3><p>A análise com IA será liberada após o cadastro ou importação de transações.</p></div>`;
    refreshIcons();
    return;
  }
  const ai = analysis.ai;
  const recommendations = ai?.recommendations?.length
    ? ai.recommendations.map((item) => ({ ...item, potentialMonthlySavings: item.monthlySavings }))
    : analysis.recommendations;
  const blocks = {
    diagnosis: ai?.diagnosis?.length ? ai.diagnosis : analysis.aiBlocks?.diagnosis || [localSummary()],
    mainExpenses: ai?.mainExpenses?.length ? ai.mainExpenses : analysis.aiBlocks?.mainExpenses || [],
    nextActions: ai?.nextActions?.length ? ai.nextActions : analysis.aiBlocks?.nextActions || [],
  };
  const alerts = [
    ...(ai?.alerts || []),
    ...analysis.budgetAlerts.map((item) => ({
      severity: "atencao",
      title: `${item.category} acima da sugestão`,
      message: `A IA sugere reduzir aproximadamente ${currency.format(item.exceededBy)} por mês nessa categoria.`,
    })),
    ...analysis.anomalies.map((item) => ({
      severity: item.severity,
      title: item.title,
      message: item.message,
    })),
  ];
  const summary = ai?.executiveSummary || localSummary();
  const provider = ai ? `OpenAI ${analysis.aiStatus.model}${analysis.aiStatus.cached ? " - resposta em cache" : ""}` : "Análise local";
  aiProvider.textContent = provider;
  aiProvider.className = `provider-badge ${ai ? "openai" : "warning"}`;
  aiResult.innerHTML = `
    <article class="consultant-card">
      <div class="consultant-avatar"><i data-lucide="sparkles"></i></div>
      <div><span class="consultant-label">${escapeHtml(provider)}</span><h3>Diagnostico financeiro</h3><p>${escapeHtml(summary)}</p></div>
    </article>
    ${renderClassificationSummaryBlock()}
    ${renderTextBlock("Diagnostico financeiro", blocks.diagnosis, "scan-search")}
    ${renderTextBlock("Principais gastos", blocks.mainExpenses, "receipt-text")}
    ${alerts.length ? `<div class="ai-section"><h3>Alertas</h3><div class="ai-alerts">${alerts.map((item) => `<div class="ai-alert ${escapeHtml(item.severity)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div>`).join("")}</div></div>` : renderTextBlock("Alertas", analysis.aiBlocks?.alerts || [], "triangle-alert")}
    <div class="ai-section"><h3>Oportunidades de economia</h3><div class="recommendations">${recommendations.map((item) => `<article class="recommendation-card"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div><b>${currency.format(item.potentialMonthlySavings)}/mês</b></article>`).join("") || `<div class="empty-compact">Cadastre mais gastos para gerar oportunidades de economia.</div>`}</div></div>
    ${renderBudgetSuggestionBlock()}
    ${renderGoalPlanBlock(ai)}
    ${renderTextBlock("Próximas ações recomendadas", blocks.nextActions, "list-checks")}
  `;
  if (analysis.aiStatus.warning) toast(analysis.aiStatus.warning);
  refreshIcons();
}

function renderClassificationSummaryBlock() {
  const summary = analysis.classificationSummary || {};
  const sources = Object.entries(summary.sources || {});
  const confidence = Object.entries(summary.confidence || {});
  if (!sources.length && !confidence.length) return "";
  return `
    <div class="ai-section">
      <h3>Classificacao automatica</h3>
      <div class="automation-grid">
        ${sources.map(([source, count]) => `<div><span>${escapeHtml(sourceLabel(source))}</span><strong>${count}</strong></div>`).join("")}
        ${confidence.map(([item, count]) => `<div><span>${escapeHtml(confidenceLabel(item))}</span><strong>${count}</strong></div>`).join("")}
      </div>
    </div>
  `;
}

function renderTextBlock(title, items, icon) {
  const list = (items || []).filter(Boolean);
  return `<div class="ai-section"><h3>${escapeHtml(title)}</h3>${list.length ? list.map((item) => `<div class="insight-line"><i data-lucide="${icon}"></i><span>${escapeHtml(item)}</span></div>`).join("") : `<div class="empty-compact">Sem dados suficientes para este bloco.</div>`}</div>`;
}

function renderBudgetSuggestionBlock() {
  const items = (analysis?.categoryBudgetSuggestions || []).slice(0, 6);
  if (!items.length) return "";
  return `
    <div class="ai-section">
      <h3>Quanto gastar por categoria</h3>
      <div class="budget-suggestion-grid">
        ${items.map((item) => `
          <article class="budget-suggestion-card ${item.status}">
            <div><strong>${escapeHtml(item.category)}</strong><span>${escapeHtml(item.reason)}</span></div>
            <b>${currency.format(item.suggestedMonthly)}/mês</b>
            <small>Hoje: ${currency.format(item.currentMonthly)}/mês</small>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderGoalPlanBlock(ai) {
  const goal = analysis.goal;
  const action = ai?.monthlyPlan?.action;
  return `
    <div class="ai-section">
      <h3>Plano para atingir a meta</h3>
      <div class="goal-plan">
        <div><span>Recomendado por mês</span><strong>${currency.format(goal?.monthlyTarget || 0)}</strong></div>
        <div><span>Já guardado</span><strong>${currency.format(goal?.saved_amount || 0)}</strong></div>
        <div><span>Falta</span><strong>${currency.format(goal?.remainingAmount || 0)}</strong></div>
        <div><span>Previsão</span><strong>${escapeHtml(goal?.forecastConclusion || "-")}</strong></div>
      </div>
      ${action ? `<p class="ai-action-text">${escapeHtml(action)}</p>` : ""}
    </div>
  `;
}

function localSummary() {
  if (!analysis || analysis.totalExpenses === 0) return "Cadastre renda e gastos para receber um diagnóstico personalizado.";
  const top = analysis.categories[0];
  const balanceText = analysis.balance >= 0 ? `Seu saldo no período é ${currency.format(analysis.balance)}.` : `Você gastou ${currency.format(Math.abs(analysis.balance))} além das entradas.`;
  return `${balanceText} A maior categoria foi ${top?.category || "não identificada"}, com ${currency.format(top?.total || 0)}.`;
}

function renderGoalSummary() {
  const container = document.querySelector("#goalSummary");
  if (!analysis?.goal) {
    container.className = "goal-summary-empty";
    container.textContent = "Cadastre uma meta para ver o planejamento.";
    return;
  }
  container.className = "goal-summary";
  const goal = analysis.goal;
  container.innerHTML = `
    <div class="goal-progress-ring large" role="img" aria-label="${goal.progressPercentage}% da meta concluída" style="--progress:${goal.progressPercentage * 3.6}deg"><strong>${goal.progressPercentage}%</strong></div>
    <div><span>Meta</span><strong>${escapeHtml(goal.goal_name || objectiveLabel(goal.objective))}</strong></div>
    <div><span>Objetivo</span><strong>${escapeHtml(objectiveLabel(goal.objective))}</strong></div>
    <div><span>Valor total</span><strong>${currency.format(goal.target_value)}</strong></div>
    <div><span>Já guardado</span><strong>${currency.format(goal.saved_amount)}</strong></div>
    <div><span>Falta</span><strong>${currency.format(goal.remainingAmount)}</strong></div>
    <div><span>Prazo</span><strong>${goal.target_months} meses</strong></div>
    <div><span>Modo</span><strong>${escapeHtml(goal.modeLabel)}</strong></div>
    <div><span>Necessário por mês</span><strong>${currency.format(goal.monthlyTarget)}</strong></div>
    <div><span>Ritmo sugerido</span><strong>${currency.format(goal.modeMonthlyTarget || goal.monthlyTarget)}</strong></div>
    <div><span>Previsão</span><strong>${escapeHtml(goal.forecastConclusion)}</strong></div>
    <div><span>Status</span><strong class="${goal.feasible ? "value-positive" : "value-negative"}">${escapeHtml(goal.status)}</strong></div>
  `;
}

function renderVisibleCharts(view) {
  if (!analysis || !window.Chart) return;
  if (view === "dashboard") {
    renderCategoryChart("dashboardCategory", "dashboardCategoryChart", true);
    renderMonthlyChart("dashboardMonthly", "dashboardMonthlyChart");
    renderCategoryRanking("dashboardRanking", 3);
  }
  if (view === "categorias") renderBudgetChart();
  if (view === "metas") renderGoalChart("goalProgress", "goalProgressChart");
  if (view === "relatorios") {
    renderCategoryChart("category", "categoryChart", false);
    renderFlowChart("flow", "flowChart");
    renderMonthlyChart("monthly", "monthlyChart");
    renderGoalChart("goal", "goalChart");
    renderBudgetComparisonChart();
    renderSavingsChart();
    renderCategoryRanking("categoryRanking", 8);
  }
}

function compactMoney(value) {
  const number = Number(value || 0);
  const sign = number < 0 ? "-" : "";
  return `${sign}R$ ${compactCurrency.format(Math.abs(number))}`;
}

function chartCenterMoney(value) {
  const number = Number(value || 0);
  return Math.abs(number) >= 10000 ? compactMoney(number) : currency.format(number);
}

function premiumLegend(dark = false) {
  return {
    display: true,
    position: "top",
    align: "start",
    labels: {
      boxWidth: 8,
      boxHeight: 8,
      color: dark ? "#F7F5F0" : themeColors.ink,
      font: { family: chartFontFamily, size: 12, weight: 700 },
      padding: 16,
      usePointStyle: true,
      pointStyle: "circle",
    },
  };
}

function premiumTooltip() {
  return {
    backgroundColor: "#0E1F1B",
    borderColor: "rgba(255,255,255,.12)",
    borderWidth: 1,
    bodyColor: "#F7F5F0",
    displayColors: true,
    padding: 12,
    titleColor: "#E7B86A",
    titleFont: { family: chartFontFamily, size: 12, weight: 800 },
    bodyFont: { family: chartFontFamily, size: 12, weight: 650 },
    cornerRadius: 12,
    callbacks: {
      label: (context) => `${context.dataset.label || "Valor"}: ${currency.format(Number(context.raw || 0))}`,
    },
  };
}

function renderCategoryChart(key, canvasId, compact) {
  const dark = isDarkDashboardChart(canvasId);
  const items = analysis.categories || [];
  if (!items.length || !items.some((item) => Number(item.total) > 0)) {
    setChartEmpty(key, canvasId, "Sem dados suficientes para gerar o grafico.");
    return;
  }
  setChartEmpty(key, canvasId, "");
  const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  createChart(key, canvasId, {
    type: "doughnut",
    data: {
      labels: items.map((item) => item.category),
      datasets: [{
        data: items.map((item) => item.total),
        backgroundColor: items.map((item) => categoryColor(item.category)),
        borderColor: dark ? "#292928" : "#FBFAF6",
        borderWidth: compact ? 4 : 3,
        borderRadius: compact ? 5 : 4,
        spacing: 1,
        hoverOffset: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: compact ? "74%" : "70%",
      layout: { padding: compact ? 8 : 14 },
      plugins: {
        legend: { display: false },
        premiumCenterText: { label: "Total do mês", value: chartCenterMoney(total), valueSize: compact ? 16 : 17 },
        tooltip: {
          ...premiumTooltip(),
          callbacks: {
            title: (context) => context[0]?.label || "",
            label: (context) => {
              const value = Number(context.raw || 0);
              const percent = total > 0 ? Math.round((value / total) * 100) : 0;
              return [`Valor: ${currency.format(value)}`, `${percent}% dos gastos do mês`];
            },
          },
        },
      },
    },
  });
}

function renderFlowChart(key, canvasId) {
  if (!analysis || (analysis.totalIncome === 0 && analysis.totalExpenses === 0)) {
    setChartEmpty(key, canvasId, "Sem dados suficientes para gerar o grafico.");
    return;
  }
  setChartEmpty(key, canvasId, "");
  createChart(key, canvasId, {
    type: "bar",
    data: {
      labels: ["Entradas", "Saídas", "Saldo"],
      datasets: [{
        label: "Valor",
        data: [analysis.totalIncome, analysis.totalExpenses, Math.max(analysis.balance, 0)],
        backgroundColor: [themeColors.emerald, themeColors.critical, themeColors.ai],
        borderRadius: 14,
        borderSkipped: false,
        maxBarThickness: 58,
      }],
    },
    options: chartOptions({ tooltipLabel: "Valor" }),
  });
}

function renderCategoryRanking(containerId, limit = 6) {
  const container = document.querySelector(`#${containerId}`);
  if (!container) return;
  const items = (analysis.categoryRanking || analysis.categories || []).slice(0, limit);
  container.innerHTML = items.map((item) => `
    <div class="ranking-row">
      <span class="ranking-position">${item.position || ""}</span>
      <span class="category-color" style="background:${categoryColor(item.category)}"></span>
      <div><strong>${escapeHtml(item.category)}</strong><small>${item.share}% das despesas</small></div>
      <b>${currency.format(item.total)}</b>
    </div>
  `).join("") || `<div class="empty-compact">Cadastre gastos para ver o ranking.</div>`;
}

function renderMonthlyChart(key, canvasId) {
  const dark = isDarkDashboardChart(canvasId);
  const items = analysis.monthlyEvolution || [];
  if (!items.length || !items.some((item) => item.income > 0 || item.expenses > 0)) {
    setChartEmpty(key, canvasId, "Importe transações para visualizar o fluxo do período.");
    return;
  }
  setChartEmpty(key, canvasId, "");
  createChart(key, canvasId, {
    type: "line",
    data: {
      labels: items.map((item) => item.month),
      datasets: [
        { label: "Entradas", data: items.map((item) => item.income), borderColor: themeColors.emerald, backgroundColor: "rgba(31,138,95,.12)", fill: true, tension: .42, borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: "#FFFFFF", pointBorderWidth: 2 },
        { label: "Saídas", data: items.map((item) => item.expenses), borderColor: themeColors.critical, backgroundColor: "rgba(192,57,43,.08)", fill: true, tension: .42, borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: "#FFFFFF", pointBorderWidth: 2 },
      ],
    },
    options: {
      ...chartOptions({ theme: dark ? "dark" : "light", tooltipLabel: "Valor" }),
      plugins: {
        ...chartOptions({ theme: dark ? "dark" : "light" }).plugins,
        legend: premiumLegend(dark),
      },
    },
  });
}

function renderGoalChart(key, canvasId) {
  const progress = analysis.goal?.progressPercentage || 0;
  if (!analysis.goal) {
    setChartEmpty(key, canvasId, "Crie sua primeira meta para acompanhar seu progresso.");
    return;
  }
  setChartEmpty(key, canvasId, "");
  createChart(key, canvasId, {
    type: "doughnut",
    data: {
      labels: ["Concluído", "Falta"],
      datasets: [{ data: [progress, Math.max(100 - progress, 0)], backgroundColor: [themeColors.emerald, "#E2DED4"], borderColor: "#FBFAF6", borderWidth: 5, borderRadius: 10, spacing: 2, hoverOffset: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "76%",
      layout: { padding: 12 },
      plugins: {
        legend: { display: false },
        premiumCenterText: { label: "Progresso", value: `${progress}%` },
        tooltip: premiumTooltip(),
      },
    },
  });
}

function renderBudgetChart() {
  const items = (analysis?.categoryBudgetSuggestions || []).filter((item) => item.suggestedMonthly > 0).slice(0, 8);
  if (!items.length) {
    setChartEmpty("budget", "budgetChart", "Cadastre ou importe lançamentos para a IA sugerir um valor por categoria.");
    return;
  }
  setChartEmpty("budget", "budgetChart", "");
  createChart("budget", "budgetChart", {
    type: "bar",
    data: {
      labels: items.map((item) => item.category),
      datasets: [
        { label: "Sugestão IA", data: items.map((item) => item.suggestedMonthly), backgroundColor: "#D8D6CF", borderRadius: 999, borderSkipped: false, maxBarThickness: 16 },
        { label: "Gasto atual", data: items.map((item) => item.currentMonthly), backgroundColor: items.map((item) => budgetStatusColor(budgetStatusFromSuggestion(item))), borderRadius: 999, borderSkipped: false, maxBarThickness: 16 },
      ],
    },
    options: { ...chartOptions({ indexAxis: "y", tooltipLabel: "Valor" }), indexAxis: "y", plugins: { ...chartOptions().plugins, legend: premiumLegend(false) } },
  });
}

function renderBudgetComparisonChart() {
  const items = (analysis?.categoryBudgetSuggestions || []).filter((item) => item.suggestedMonthly > 0).slice(0, 8);
  if (!items.length) {
    setChartEmpty("budgetComparison", "budgetComparisonChart", "A IA mostrará sugestão x gasto real após você importar lançamentos.");
    return;
  }
  setChartEmpty("budgetComparison", "budgetComparisonChart", "");
  createChart("budgetComparison", "budgetComparisonChart", {
    type: "bar",
    data: {
      labels: items.map((item) => item.category),
      datasets: [
        { label: "Sugestão IA", data: items.map((item) => item.suggestedMonthly), backgroundColor: "#D8D6CF", borderRadius: 999, borderSkipped: false, maxBarThickness: 18 },
        { label: "Gasto real", data: items.map((item) => item.currentMonthly), backgroundColor: items.map((item) => budgetStatusColor(budgetStatusFromSuggestion(item))), borderRadius: 999, borderSkipped: false, maxBarThickness: 18 },
      ],
    },
    options: { ...chartOptions({ tooltipLabel: "Valor" }), plugins: { ...chartOptions().plugins, legend: premiumLegend(false) } },
  });
}

function renderSavingsChart() {
  const items = (analysis.recommendations || []).slice(0, 6);
  if (!items.length) {
    setChartEmpty("savings", "savingsChart", "A análise com IA será liberada após o cadastro ou importação de transações.");
    return;
  }
  setChartEmpty("savings", "savingsChart", "");
  createChart("savings", "savingsChart", {
    type: "bar",
    data: {
      labels: items.map((item) => item.category),
      datasets: [{ label: "Economia mensal", data: items.map((item) => item.potentialMonthlySavings), backgroundColor: themeColors.emerald, borderRadius: 999, borderSkipped: false, maxBarThickness: 54 }],
    },
    options: chartOptions({ tooltipLabel: "Economia mensal" }),
  });
}

function chartOptions(settings = "light") {
  const theme = typeof settings === "string" ? settings : settings.theme || "light";
  const dark = theme === "dark";
  const tickColor = dark ? "#aaa9a4" : "#64716c";
  const gridColor = dark ? "rgba(255,255,255,.18)" : "rgba(14,31,27,.08)";
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...premiumTooltip(),
        callbacks: {
          label: (context) => `${context.dataset.label || settings.tooltipLabel || "Valor"}: ${currency.format(Number(context.raw || 0))}`,
        },
      },
    },
    scales: {
      y: { beginAtZero: true, border: { display: false }, grid: { color: gridColor, drawTicks: false }, ticks: { color: tickColor, padding: 10, font: { family: chartFontFamily, size: 11, weight: 650 }, callback: (value) => compactMoney(Number(value)) } },
      x: { border: { display: false }, grid: { display: false }, ticks: { color: tickColor, maxRotation: 0, autoSkip: true, font: { family: chartFontFamily, size: 11, weight: 650 } } },
    },
  };
}

function createChart(key, id, config) {
  if (charts[key]) charts[key].destroy();
  const canvas = document.querySelector(`#${id}`);
  if (canvas && !canvas.closest("[hidden]")) {
    charts[key] = new Chart(canvas, {
      ...config,
      plugins: [...(config.plugins || []), premiumCenterTextPlugin],
    });
  }
}

function setChartEmpty(key, canvasId, text) {
  const canvas = document.querySelector(`#${canvasId}`);
  const wrap = canvas?.parentElement;
  if (!canvas || !wrap) return;
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
  let empty = wrap.querySelector(".chart-empty-state");
  if (text) {
    canvas.style.display = "none";
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "chart-empty-state";
      wrap.appendChild(empty);
    }
    empty.textContent = text;
  } else {
    canvas.style.display = "";
    empty?.remove();
  }
}

function isDarkDashboardChart(canvasId) {
  return false;
}

function categoryColor(name) {
  const normalized = String(name || "Outros");
  let hash = 0;
  for (const char of normalized) hash = ((hash << 5) - hash) + char.charCodeAt(0);
  return categoryPalette[Math.abs(hash) % categoryPalette.length];
}

function categoryIcon(category, value = -1) {
  if (Number(value) > 0 || category === "Receita") return "arrow-down-left";
  const key = normalizeText(category);
  if (key.includes("mercado")) return "shopping-basket";
  if (key.includes("transporte")) return "car";
  if (key.includes("assinatura")) return "badge-check";
  if (key.includes("alimentacao")) return "utensils";
  if (key.includes("saude")) return "heart-pulse";
  if (key.includes("educacao")) return "book-open";
  if (key.includes("lazer")) return "gamepad-2";
  if (key.includes("compra")) return "shopping-bag";
  if (key.includes("meta")) return "target";
  return "receipt";
}

function goalIcon(objective) {
  const icons = {
    reserva: "shield-check",
    dividas: "badge-dollar-sign",
    viagem: "plane",
    compra: "shopping-bag",
    investimento: "trending-up",
    outro: "target",
  };
  return icons[objective] || "target";
}

function typeLabel(value) {
  return value === "entrada" ? "Entrada" : "Saída";
}

function statusLabel(value) {
  const labels = {
    Concluida: "Concluída",
    Pendente: "Pendente",
    Agendada: "Agendada",
    Cancelada: "Cancelada",
  };
  return labels[value] || value;
}

function confidenceLabel(value) {
  const text = String(value || "manual");
  const labels = {
    alta: "Alta",
    baixa: "Baixa",
    aprendida: "Aprendida",
    manual: "Manual",
    corrigida: "Corrigida",
  };
  return labels[text] || text.replace(/^OpenAI/i, "IA");
}

function sourceLabel(value) {
  const text = String(value || "manual");
  const labels = {
    "regra local": "Regra local",
    "regra aprendida": "Regra aprendida",
    manual: "Manual",
    importado: "Importado",
    csv: "CSV",
    excel: "Excel",
    pdf: "PDF",
    meta: "Meta",
    IA: "IA",
    "precisa confirmacao": "Pendente",
  };
  return labels[text] || text;
}

function objectiveLabel(value) {
  return {
    reserva: "Reserva de emergência",
    dividas: "Quitar dívidas",
    viagem: "Fazer uma viagem",
    compra: "Realizar uma compra",
    investimento: "Começar a investir",
    outro: "Outro objetivo",
  }[value] || "Meta financeira";
}

async function refreshFinancialData() {
  await loadTransactions();
  await loadCategories();
  await loadAnalysis(false);
}

async function exportData() {
  const response = await fetch("/api/export");
  if (!response.ok) return toast("Não foi possível exportar os dados.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "meus-dados-financeiros.json";
  link.click();
  URL.revokeObjectURL(url);
  toast("Arquivo gerado.");
}

function exportReportCsv() {
  if (!transactions.length) return toast("Não há transações para exportar.");
  const headers = ["Data", "Descrição", "Categoria", "Tipo", "Forma", "Status", "Origem", "Valor"];
  const rows = transactions.map((item) => [
    item.date,
    item.description,
    item.category,
    typeLabel(item.type || (item.value >= 0 ? "entrada" : "saida")),
    item.payment_method || "Manual",
    statusLabel(item.transaction_status || "Concluida"),
    sourceLabel(item.source || item.classification_source || "manual"),
    String(Number(item.value || 0)).replace(".", ","),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "relatorio-fintrack.csv";
  link.click();
  URL.revokeObjectURL(url);
  toast("Relatório CSV gerado.");
}

document.querySelector("#exportBtn").addEventListener("click", exportData);
document.querySelector("#settingsExportBtn").addEventListener("click", exportData);
exportReportCsvBtn?.addEventListener("click", exportReportCsv);

statementImportForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = event.currentTarget.elements.statement;
  const button = event.currentTarget.querySelector("button[type='submit']");
  const originalButton = button?.innerHTML;
  if (!input.files?.length) return toast("Selecione um arquivo CSV, Excel ou PDF.");
  const data = new FormData();
  data.append("statement", input.files[0]);
  try {
    if (button) {
      button.disabled = true;
      button.innerHTML = `<span class="button-spinner"></span><span>Lendo...</span>`;
    }
    toast("Lendo o arquivo...");
    const response = await fetch("/api/import/file?ai=1", { method: "POST", body: data, credentials: "include" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível ler o arquivo.");
    importRows = payload.rows || [];
    importMapping = payload.mapping || {};
    importSource = payload.kind || "importado";
    renderImportMapping(payload.columns || [], importMapping);
    renderImportPreview(payload.candidates || [], payload.notice, { ...(payload.summary || {}), ai: payload.ai }, payload.errors);
    toast((payload.candidates || []).length ? "Arquivo lido. Revise a prévia antes de importar." : "Arquivo lido. Confira o mapeamento das colunas.");
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalButton;
    }
  }
});

function renderImportMapping(columns, mapping) {
  const hasColumns = columns.length > 0;
  setHidden(importMappingCard, !hasColumns);
  if (!hasColumns) return;
  const fields = [
    ["date", "Data", true],
    ["description", "Descrição", true],
    ["value", "Valor único", false],
    ["debitValue", "Valor de gasto/débito", false],
    ["creditValue", "Valor de entrada/crédito", false],
    ["category", "Categoria", false],
    ["type", "Tipo (entrada/saída)", false],
    ["paymentMethod", "Forma de pagamento", false],
    ["source", "Banco ou origem", false],
  ];
  importMappingFields.innerHTML = fields.map(([key, label, required]) => `
    <label>${label}${required ? " *" : ""}
      <select data-map="${key}">
        <option value="">Não mapear</option>
        ${columns.map((column) => `<option value="${escapeHtml(column)}"${mapping[key] === column ? " selected" : ""}>${escapeHtml(column)}</option>`).join("")}
      </select>
    </label>
  `).join("") + `<p class="mapping-hint">Use "Valor único" quando a planilha tiver uma coluna só de valor. Se ela separar entradas e gastos, mapeie "Valor de gasto/débito" e/ou "Valor de entrada/crédito".</p>`;
}

function currentImportMapping() {
  const result = {};
  importMappingFields?.querySelectorAll("[data-map]").forEach((select) => {
    result[select.dataset.map] = select.value;
  });
  return result;
}

buildImportPreviewBtn?.addEventListener("click", async () => {
  if (!importRows.length) return toast("Importe um arquivo primeiro.");
  try {
    importMapping = currentImportMapping();
    const preview = await api("/api/import/preview?ai=1", {
      method: "POST",
      body: JSON.stringify({ rows: importRows, mapping: importMapping }),
    });
    renderImportPreview(preview.candidates, "Confira a prévia antes de confirmar a importação.", { ...(preview.summary || {}), ai: preview.ai }, preview.errors);
  } catch (error) {
    toast(error.message);
  }
});

function renderImportPreview(items, notice, summary = {}, errors = []) {
  importCandidates = items || [];
  importNotice.textContent = notice || "";
  const ai = summary.ai || {};
  const aiLabel = ai.source === "openai"
    ? `OpenAI${ai.model ? ` (${ai.model})` : ""}`
    : "Análise local";
  const summaryHtml = `
    <span><strong>${summary.rows || importRows.length || importCandidates.length}</strong> linhas lidas</span>
    <span><strong>${summary.found || importCandidates.length}</strong> transações encontradas</span>
    <span><strong>${summary.importable || 0}</strong> prontas para importar</span>
    <span><strong>${currency.format(summary.income || 0)}</strong> entradas</span>
    <span><strong>${currency.format(summary.expenses || 0)}</strong> saídas</span>
    <span><strong>${summary.duplicates || 0}</strong> duplicadas</span>
    <span><strong>${summary.errors || 0}</strong> erros</span>
    <span><strong>IA</strong> ${escapeHtml(aiLabel)}</span>
  `;
  if (importStats) {
    importStats.innerHTML = summaryHtml + (errors?.length ? `<p>${escapeHtml(errors[0].message)} ${errors.length > 1 ? `+ ${errors.length - 1} erro(s).` : ""}</p>` : "");
  }
  importPreviewBody.innerHTML = importCandidates.map((item, index) => {
    const duplicate = Boolean(item.duplicate);
    const pending = item.category === "Categoria pendente";
    const status = duplicate ? "Duplicada" : pending ? "Categoria pendente" : "Pronta";
    return `
      <tr data-index="${index}" class="${pending ? "pending-row" : ""} ${duplicate ? "duplicate-row" : ""}">
        <td><input class="preview-check" type="checkbox" ${duplicate ? "disabled" : "checked"}></td>
        <td>${formatDate(item.date)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td><select class="preview-type" ${duplicate ? "disabled" : ""}>${typeOptions(item.value)}</select></td>
        <td><select class="preview-category" ${duplicate ? "disabled" : ""}>${categoryOptions(item.category)}</select></td>
        <td class="preview-value ${item.value < 0 ? "value-negative" : "value-positive"}">${currency.format(item.value)}</td>
        <td>${escapeHtml(confidenceLabel(item.confidence))}${item.aiReason ? `<small class="ai-reason">${escapeHtml(item.aiReason)}</small>` : ""}</td>
        <td>${duplicate ? `<span class="status-badge danger">Duplicada</span>` : `<span class="status-badge">${escapeHtml(status)}</span>`}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="8"><div class="empty-compact">Arquivo lido, mas nenhuma transação foi reconhecida. Revise o mapeamento de data, descrição e valor.</div></td></tr>`;
  setHidden(importPreviewCard, false);
  setHidden(confirmImportBtn, importCandidates.filter((item) => !item.duplicate).length === 0);
}

function typeOptions(value) {
  const type = Number(value) >= 0 ? "entrada" : "saida";
  return `<option value="saida"${type === "saida" ? " selected" : ""}>Gasto</option><option value="entrada"${type === "entrada" ? " selected" : ""}>Entrada</option>`;
}

function categoryOptions(selected) {
  return [`Categoria pendente`, ...categories.map((item) => item.name)].map((name) => `<option value="${escapeHtml(name)}"${name === selected ? " selected" : ""}>${escapeHtml(name)}</option>`).join("");
}

importPreviewBody.addEventListener("change", (event) => {
  const row = event.target.closest("tr");
  const item = importCandidates[Number(row.dataset.index)];
  if (!item) return;
  if (event.target.classList.contains("preview-category")) {
    item.category = event.target.value;
    item.userCorrected = true;
    item.confidence = "corrigida pelo usuário";
    row.classList.toggle("pending-row", item.category === "Categoria pendente");
    return;
  }
  if (event.target.classList.contains("preview-type")) {
    item.value = event.target.value === "entrada" ? Math.abs(Number(item.value || 0)) : -Math.abs(Number(item.value || 0));
    item.userCorrected = true;
    item.confidence = "corrigida pelo usuário";
    const valueCell = row.querySelector(".preview-value");
    valueCell.textContent = currency.format(item.value);
    valueCell.classList.toggle("value-negative", item.value < 0);
    valueCell.classList.toggle("value-positive", item.value >= 0);
  }
});

confirmImportBtn.addEventListener("click", async () => {
  const selected = [...importPreviewBody.querySelectorAll("tr")]
    .filter((row) => row.querySelector(".preview-check")?.checked)
    .map((row) => importCandidates[Number(row.dataset.index)]);
  if (!selected.length) return toast("Selecione ao menos uma transação.");
  if (selected.some((item) => item.category === "Categoria pendente")) return toast("Defina somente as categorias pendentes.");
  const result = await api("/api/import/transactions", { method: "POST", body: JSON.stringify({ transactions: selected, source: importSource }) });
  toast(`${result.imported} transações importadas. ${result.skippedDuplicates || 0} duplicadas ignoradas.`);
  setHidden(importPreviewCard, true);
  setHidden(importMappingCard, true);
  await refreshFinancialData();
  showView("dashboard");
});

async function loadAudit() {
  const rows = await api("/api/audit");
  auditList.innerHTML = rows.map((row) => `<li><strong>${escapeHtml(auditMessage(row))}</strong><span>${escapeHtml(formatDateTime(row.created_at))}</span></li>`).join("")
    || `<li><strong>Nenhuma atividade registrada ainda.</strong><span></span></li>`;
}

function auditMessage(row) {
  const details = parseAuditDetails(row.details);
  const messages = {
    USER_REGISTERED: "Conta criada",
    USER_LOGIN: "Login realizado",
    CONSENT_ACCEPTED: "Termo LGPD aceito",
    CONSENT_REVOKED: "Consentimento revogado e dados financeiros limpos",
    CATEGORY_CREATED: `Categoria criada${details.name ? `: ${details.name}` : ""}`,
    CATEGORY_UPDATED: `Categoria atualizada${details.name ? `: ${details.name}` : ""}`,
    CATEGORY_DELETED: `Categoria excluída${details.name ? `: ${details.name}` : ""}`,
    TRANSACTION_CREATED: "Transação criada",
    TRANSACTION_UPDATED: "Transação editada",
    TRANSACTION_DELETED: "Transação excluída",
    TRANSACTIONS_IMPORTED: `${details.imported || 0} transação(ões) importada(s)`,
    PDF_STATEMENT_ANALYZED: "Extrato PDF analisado",
    STATEMENT_FILE_ANALYZED: "Arquivo de extrato analisado",
    FINANCIAL_GOAL_UPDATED: `Meta salva${details.goalName ? `: ${details.goalName}` : ""}`,
    GOAL_CONTRIBUTION_CREATED: `Valor guardado na meta: ${currency.format(details.amount || 0)}`,
    AI_ANALYSIS_REQUESTED: "Análise financeira solicitada",
    DATA_EXPORTED: "Dados baixados pelo usuário",
  };
  return messages[row.action] || row.action;
}

function parseAuditDetails(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function updateConsentUi() {
  document.body.classList.toggle("consent-inactive", !userConsentAccepted);
  setHidden(acceptConsentBtn, userConsentAccepted);
  setHidden(revokeConsentBtn, !userConsentAccepted);
}

acceptConsentBtn?.addEventListener("click", async () => {
  try {
    await api("/api/consent/accept", { method: "POST" });
    toast("Termo aceito novamente.");
    await boot({ keepLoginOnError: true });
  } catch (error) {
    toast(error.message);
  }
});

revokeConsentBtn?.addEventListener("click", async () => {
  const ok = confirm("Tem certeza que deseja revogar o consentimento? Suas transações, metas, importações e análises de IA serão removidas. Sua conta será mantida, mas ficará inativa até você aceitar novamente os termos.");
  if (!ok) return;
  try {
    await api("/api/consent/revoke", { method: "POST" });
    userConsentAccepted = false;
    transactions = [];
    analysis = null;
    toast("Consentimento revogado. Dados financeiros limpos.");
    await boot({ keepLoginOnError: true });
  } catch (error) {
    toast(error.message);
  }
});

document.querySelector("#deleteAccountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!confirm("Excluir sua conta e todos os registros?")) return;
  try {
    await api("/api/account", { method: "DELETE", body: JSON.stringify(formData(event.currentTarget)) });
    toast("Conta excluída.");
    document.body.classList.remove("dashboard-active", "consent-inactive");
    setHidden(appPanel, true);
    setHidden(authPanel, false);
  } catch (error) {
    toast(error.message);
  }
});

function formatDate(value) {
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function monthLabel(value) {
  const [year, month] = String(value).split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

async function boot(options = {}) {
  try {
    const me = await api("/api/me");
    document.querySelector("#welcome").textContent = `Olá, ${me.user.name}`;
    const firstName = String(me.user.name || "Usuário").trim().split(/\s+/)[0] || "Usuário";
    const initials = String(me.user.name || "U").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    document.querySelector("#sidebarUserName").textContent = firstName;
    document.querySelector("#sidebarUserEmail").textContent = me.user.email || "";
    document.querySelector(".user-avatar").textContent = initials || "U";
    document.querySelector("#currentMonth").textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());
    userConsentAccepted = Boolean(me.consentAccepted);
    updateConsentUi();
    document.body.classList.add("dashboard-active");
    setHidden(authPanel, true);
    setHidden(appPanel, false);
    resetTransactionForm();
    try {
      await loadCategories();
      if (!userConsentAccepted) {
        transactions = [];
        analysis = null;
        renderStarterState();
        await loadAudit();
        showView("configuracoes");
        refreshIcons();
        return;
      }
      await loadTransactions();
      await loadGoal();
      await loadAnalysis(false);
      await loadAIStatus();
    } catch (error) {
      console.error("Erro ao carregar dados do painel:", error);
      toast("Conta aberta. Atualize a página se algum card não carregar.");
    }
    showView("dashboard");
    refreshIcons();
  } catch (error) {
    if (options.keepLoginOnError) {
      throw new Error(error.message || "Não foi possível abrir a conta.");
    } else {
      document.body.classList.remove("dashboard-active", "consent-inactive");
      setHidden(authPanel, false);
      setHidden(appPanel, true);
      refreshIcons();
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

resetTransactionForm();
refreshIcons();
boot();

