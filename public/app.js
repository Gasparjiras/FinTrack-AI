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
const bulkCategorySelect = document.querySelector("#bulkCategorySelect");
const bulkApplyCategoryBtn = document.querySelector("#bulkApplyCategoryBtn");
const bulkDeleteBtn = document.querySelector("#bulkDeleteBtn");
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
const importStepper = document.querySelector("#importStepper");
const importStats = document.querySelector("#importStats");
const importPreviewCard = document.querySelector("#importPreviewCard");
const importPreviewBody = document.querySelector("#importPreviewBody");
const importNotice = document.querySelector("#importNotice");
const importAssistant = document.querySelector("#importAssistant");
const confirmImportBtn = document.querySelector("#confirmImportBtn");
const printReportBtn = document.querySelector("#printReportBtn");
const exportReportCsvBtn = document.querySelector("#exportReportCsvBtn");
const closeMonthBtn = document.querySelector("#closeMonthBtn");
const monthlyClosingList = document.querySelector("#monthlyClosingList");
const dashboardHealthScore = document.querySelector("#dashboardHealthScore");
const reportHealthScore = document.querySelector("#reportHealthScore");
const dashboardRecurringList = document.querySelector("#dashboardRecurringList");
const reportRecurringList = document.querySelector("#reportRecurringList");
const goalTimelineList = document.querySelector("#goalTimelineList");
const openAiStatusPanel = document.querySelector("#openAiStatusPanel");
const settingsAiStatusPanel = document.querySelector("#settingsAiStatusPanel");
const openAiPayloadSummary = document.querySelector("#openAiPayloadSummary");
const aiHistoryList = document.querySelector("#aiHistoryList");
const aiModeSelect = document.querySelector("#aiModeSelect");
const reanalyzePendingBtn = document.querySelector("#reanalyzePendingBtn");
const refreshAiBtn = document.querySelector("#refreshAiBtn");
const categoryRuleForm = document.querySelector("#categoryRuleForm");
const categoryRulesList = document.querySelector("#categoryRulesList");
const currentMonthLabel = document.querySelector("#currentMonth");
const analysisMonthInput = document.querySelector("#analysisMonth");
const prevMonthBtn = document.querySelector("#prevMonthBtn");
const nextMonthBtn = document.querySelector("#nextMonthBtn");
const categorySuggestion = document.querySelector("#categorySuggestion");
const goalLivePreview = document.querySelector("#goalLivePreview");
const goalsList = document.querySelector("#goalsList");
const goalContributionSelect = document.querySelector("#goalContributionSelect");
const goalContributionsList = document.querySelector("#goalContributionsList");
const goalChangeHistoryList = document.querySelector("#goalChangeHistoryList");
const cancelContributionEditBtn = document.querySelector("#cancelContributionEditBtn");
const monthlyClosingGuide = document.querySelector("#monthlyClosingGuide");
const monthlyComparisonVisual = document.querySelector("#monthlyComparisonVisual");
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
let goalContributions = [];
let goalContributionSummary = [];
let goalTimelines = {};
let goalChangeHistory = [];
let analysis = null;
let importCandidates = [];
let importRows = [];
let importMapping = {};
let importSource = "importado";
let importPreset = null;
let importPreviewSummary = {};
let importPreviewErrors = [];
let monthlyClosings = [];
let aiStatusSnapshot = null;
let categoryRules = [];
let aiHistory = [];
let userConsentAccepted = true;
let categoryManuallyChanged = false;
let suggestionTimer = null;
let transactionPage = 1;
let editingGoalId = null;
let editingContributionId = null;
let selectedAnalysisMonth = currentMonthValue();
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
  if (view === "ia") loadAIHistory();
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
  transactionForm.elements.date.value = selectedMonthDefaultDate();
  if (transactionForm.elements.type) transactionForm.elements.type.value = "saida";
  if (transactionForm.elements.paymentMethod) transactionForm.elements.paymentMethod.value = "Manual";
  if (transactionForm.elements.status) transactionForm.elements.status.value = "Concluida";
  if (transactionForm.elements.note) transactionForm.elements.note.value = "";
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
    const haystack = normalizeText(`${item.description} ${item.category} ${item.payment_method || ""} ${item.transaction_status || ""} ${item.note || ""}`);
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
      <td><input class="transaction-check" type="checkbox" value="${item.id}" aria-label="Selecionar lançamento"></td>
      <td>${formatDate(item.date)}</td>
      <td><strong>${escapeHtml(item.description)}</strong>${item.note ? `<small class="transaction-note">${escapeHtml(item.note)}</small>` : ""}</td>
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
  transactionsBody.innerHTML = rows || `<tr><td colspan="10"><div class="empty-compact">${emptyMessage}</div></td></tr>`;
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
  if (bulkCategorySelect) {
    const bulkCurrent = bulkCategorySelect.value;
    const available = categories.map((item) => item.name).filter((name) => !["Receita", "Metas", "Categoria pendente"].includes(name));
    bulkCategorySelect.innerHTML = `<option value="">Alterar categoria</option>${available.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    if (available.includes(bulkCurrent)) bulkCategorySelect.value = bulkCurrent;
  }
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
analysisMonthInput?.addEventListener("change", async () => {
  try {
    await changeAnalysisMonth(analysisMonthInput.value);
  } catch (error) {
    toast(error.message);
  }
});
prevMonthBtn?.addEventListener("click", async () => {
  try {
    await changeAnalysisMonth(shiftMonthValue(selectedAnalysisMonth, -1));
  } catch (error) {
    toast(error.message);
  }
});
nextMonthBtn?.addEventListener("click", async () => {
  try {
    await changeAnalysisMonth(shiftMonthValue(selectedAnalysisMonth, 1));
  } catch (error) {
    toast(error.message);
  }
});
prevTransactionsPage?.addEventListener("click", () => {
  transactionPage -= 1;
  renderTransactionsTable();
});
nextTransactionsPage?.addEventListener("click", () => {
  transactionPage += 1;
  renderTransactionsTable();
});

function selectedTransactionIds() {
  return [...transactionsBody.querySelectorAll(".transaction-check:checked")]
    .map((input) => Number(input.value))
    .filter(Boolean);
}

bulkApplyCategoryBtn?.addEventListener("click", async () => {
  const ids = selectedTransactionIds();
  const category = bulkCategorySelect?.value;
  if (!ids.length) return toast("Selecione ao menos um lançamento.");
  if (!category) return toast("Escolha a categoria que será aplicada.");
  try {
    const result = await api("/api/transactions/bulk", {
      method: "POST",
      body: JSON.stringify({ action: "category", ids, category }),
    });
    toast(`${result.updated || 0} lançamento(s) atualizados.`);
    await refreshFinancialData();
  } catch (error) {
    toast(error.message);
  }
});

bulkDeleteBtn?.addEventListener("click", async () => {
  const ids = selectedTransactionIds();
  if (!ids.length) return toast("Selecione ao menos um lançamento.");
  if (!confirm(`Excluir ${ids.length} lançamento(s) selecionado(s)?`)) return;
  try {
    const result = await api("/api/transactions/bulk", {
      method: "POST",
      body: JSON.stringify({ action: "delete", ids }),
    });
    toast(`${result.deleted || 0} lançamento(s) excluído(s).`);
    await refreshFinancialData();
  } catch (error) {
    toast(error.message);
  }
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
    if (transactionForm.elements.note) transactionForm.elements.note.value = item.note || "";
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
  renderTransactionFilters();
  renderCategoryCards();
  renderDashboardBudgets();
  updateBudgetStatus();
}

async function loadCategoryRules() {
  if (!categoryRulesList) return;
  try {
    categoryRules = await api("/api/category-rules");
  } catch {
    categoryRules = [];
  }
  renderCategoryRules();
}

function renderCategoryOptions() {
  const select = transactionForm.elements.category;
  const current = select.value;
  select.innerHTML = `<option value="">Selecione</option>${categories.map((item) => (
    `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`
  )).join("")}`;
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  const ruleSelect = categoryRuleForm?.elements.category;
  if (ruleSelect) {
    const ruleCurrent = ruleSelect.value;
    ruleSelect.innerHTML = `<option value="">Categoria</option>${categories
      .map((item) => item.name)
      .filter((name) => !["Receita", "Metas", "Categoria pendente"].includes(name))
      .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
      .join("")}`;
    if ([...ruleSelect.options].some((option) => option.value === ruleCurrent)) ruleSelect.value = ruleCurrent;
  }
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
    const statusLabels = { dentro: "Dentro do ideal", atencao: "Atenção", critico: "Crítico", neutro: "Sem gasto" };
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
        <div class="category-numbers"><strong>${currency.format(spent)}</strong><span>${recommended > 0 ? `Recomendado ${currency.format(recommended)}/mês` : "Aguardando dados"}</span></div>
        <div class="progress-track"><span style="width:${width}%;background:${statusKey === "neutro" ? item.color : budgetStatusColor(statusKey)}"></span></div>
        <div class="category-card-foot"><span class="category-status">${statusLabels[statusKey]}</span><small>${recommended > 0 ? `${percentage}% do valor recomendado` : "Cadastre lançamentos para receber uma recomendação"}</small></div>
      </article>
    `;
  }).join("");
  refreshIcons();
}

function renderCategoryRules() {
  if (!categoryRulesList) return;
  if (!categoryRules.length) {
    categoryRulesList.innerHTML = `<div class="empty-compact">Nenhuma regra aprendida ainda. Corrija categorias na importação ou salve uma regra manualmente.</div>`;
    return;
  }
  categoryRulesList.innerHTML = categoryRules.map((rule) => `
    <article class="rule-row">
      <span class="rule-icon"><i data-lucide="${categoryIcon(rule.category)}"></i></span>
      <div><strong>${escapeHtml(rule.merchant_pattern)}</strong><small>${escapeHtml(rule.category)}</small></div>
      <button type="button" class="icon-button secondary" data-rule-use="${rule.id}" title="Editar regra"><i data-lucide="pencil"></i></button>
      <button type="button" class="icon-button delete-button" data-rule-delete="${rule.id}" title="Excluir regra"><i data-lucide="trash-2"></i></button>
    </article>
  `).join("");
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

categoryRuleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(categoryRuleForm);
  if (!data.merchantPattern || !data.category) return toast("Informe o padrão e a categoria da regra.");
  try {
    await api("/api/category-rules", { method: "POST", body: JSON.stringify(data) });
    toast("Regra aprendida salva.");
    categoryRuleForm.reset();
    await loadCategoryRules();
    await refreshFinancialData();
  } catch (error) {
    toast(error.message);
  }
});

categoryRulesList?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.ruleUse || button.dataset.ruleDelete;
  const rule = categoryRules.find((item) => String(item.id) === String(id));
  if (!rule) return;
  if (button.dataset.ruleUse) {
    categoryRuleForm.elements.merchantPattern.value = rule.merchant_pattern;
    categoryRuleForm.elements.category.value = rule.category;
    categoryRuleForm.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (button.dataset.ruleDelete && confirm("Excluir esta regra aprendida?")) {
    try {
      await api(`/api/category-rules/${id}`, { method: "DELETE" });
      toast("Regra excluída.");
      await loadCategoryRules();
      await loadAnalysis(false);
    } catch (error) {
      toast(error.message);
    }
  }
});

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
      ? `Dentro do valor recomendado de ${currency.format(item.suggestedMonthly)}`
      : `${currency.format(overAmount)} acima do valor recomendado de ${currency.format(item.suggestedMonthly)}`;
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
    : tracked.length ? "Dentro do ideal" : "Cadastre lançamentos";
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
  const deleteButton = event.target.closest("[data-goal-delete]");
  const primaryButton = event.target.closest("[data-goal-primary]");
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
  if (primaryButton) {
    setPrimaryGoal(primaryButton.dataset.goalPrimary);
  }
  if (deleteButton) {
    const goal = goals.find((item) => String(item.id) === String(deleteButton.dataset.goalDelete));
    if (!goal) return;
    const ok = confirm(`Excluir a meta "${goal.goal_name}"? Os lançamentos já registrados continuam no extrato.`);
    if (!ok) return;
    deleteGoal(goal.id);
  }
});

async function setPrimaryGoal(goalId) {
  try {
    await api(`/api/goal/${goalId}/primary`, { method: "POST" });
    toast("Meta principal atualizada.");
    await refreshFinancialData();
    await loadGoal(goalId);
  } catch (error) {
    toast(error.message);
  }
}

goalContributionsList?.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-contribution-edit]");
  const deleteButton = event.target.closest("[data-contribution-delete]");
  const id = editButton?.dataset.contributionEdit || deleteButton?.dataset.contributionDelete;
  const item = goalContributions.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  if (editButton) {
    fillContributionForm(item);
    goalContributionForm.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const ok = confirm(`Excluir o aporte de ${currency.format(item.amount || 0)} em "${item.goal_name}"? O lançamento criado por esse aporte também será removido.`);
  if (!ok) return;
  deleteGoalContribution(item.id);
});

async function deleteGoal(goalId) {
  try {
    await api(`/api/goal/${goalId}`, { method: "DELETE" });
    if (String(editingGoalId) === String(goalId)) resetGoalForm();
    toast("Meta excluída.");
    await loadGoal();
    await loadAnalysis(false);
    showView("metas");
  } catch (error) {
    toast(error.message);
  }
}

async function deleteGoalContribution(contributionId) {
  try {
    await api(`/api/goal/contributions/${contributionId}`, { method: "DELETE" });
    toast("Aporte removido da meta.");
    await refreshFinancialData();
    await loadGoal(editingGoalId);
    await loadAnalysis(false);
    showView("metas");
  } catch (error) {
    toast(error.message);
  }
}

function fillContributionForm(item) {
  editingContributionId = item.id;
  if (goalContributionForm.elements.contributionId) goalContributionForm.elements.contributionId.value = item.id;
  if (goalContributionSelect) goalContributionSelect.value = item.goal_id;
  goalContributionForm.elements.amount.value = Number(item.amount || 0);
  goalContributionForm.elements.date.value = item.contribution_date || new Date().toISOString().slice(0, 10);
  goalContributionForm.elements.note.value = item.note || "";
  const title = goalContributionForm.querySelector(".panel-head h3");
  const submitText = goalContributionForm.querySelector("button[type='submit'] span");
  if (title) title.textContent = "Editar aporte";
  if (submitText) submitText.textContent = "Salvar aporte";
  setHidden(cancelContributionEditBtn, false);
}

function resetContributionForm() {
  editingContributionId = null;
  goalContributionForm?.reset();
  if (goalContributionForm?.elements.contributionId) goalContributionForm.elements.contributionId.value = "";
  if (goalContributionForm?.elements.date) goalContributionForm.elements.date.value = new Date().toISOString().slice(0, 10);
  if (goalContributionSelect && goals[0]) goalContributionSelect.value = goals[0].id;
  const title = goalContributionForm?.querySelector(".panel-head h3");
  const submitText = goalContributionForm?.querySelector("button[type='submit'] span");
  if (title) title.textContent = "Guardar este mês";
  if (submitText) submitText.textContent = "Adicionar na meta";
  setHidden(cancelContributionEditBtn, true);
}

goalContributionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formData(goalContributionForm);
    if (goalContributionSelect) data.goalId = goalContributionSelect.value;
    const contributionId = editingContributionId || data.contributionId;
    delete data.contributionId;
    await api(contributionId ? `/api/goal/contributions/${contributionId}` : "/api/goal/contribution", {
      method: contributionId ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    toast(contributionId ? "Aporte atualizado." : "Valor guardado adicionado à meta e aos lançamentos.");
    resetContributionForm();
    await refreshFinancialData();
    await loadGoal(goalContributionSelect?.value || editingGoalId);
    showView("metas");
  } catch (error) {
    toast(error.message);
  }
});

goalContributionSelect?.addEventListener("change", renderGoalTimeline);
cancelContributionEditBtn?.addEventListener("click", resetContributionForm);

async function loadGoal(selectedGoalId) {
  const result = await api("/api/goal");
  goals = result.goals || (result.goal ? [result.goal] : []);
  goalContributions = result.contributions || [];
  goalContributionSummary = result.contributionSummary || [];
  goalTimelines = result.goalTimelines || {};
  goalChangeHistory = result.history || [];
  renderGoalsList();
  renderGoalContributionOptions();
  renderGoalContributions();
  renderGoalChangeHistory();
  renderGoalTimeline();
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

function renderGoalTimeline() {
  if (!goalTimelineList) return;
  const selectedId = goalContributionSelect?.value || editingGoalId || goals[0]?.id;
  const timeline = goalTimelines[selectedId] || analysis?.goal?.timeline || [];
  if (!timeline.length) {
    goalTimelineList.innerHTML = `<div class="empty-compact">Crie uma meta e registre aportes mensais para acompanhar a evolução.</div>`;
    return;
  }
  goalTimelineList.innerHTML = timeline.slice(0, 12).map((item) => `
    <article class="timeline-row ${escapeHtml(item.status || "")}">
      <span>${escapeHtml(monthLabel(item.month))}</span>
      <div><b>${currency.format(item.contributed || 0)}</b><small>guardado no mês</small></div>
      <div><b>${currency.format(item.accumulated || 0)}</b><small>acumulado</small></div>
      <div><b>${currency.format(item.expected || 0)}</b><small>esperado</small></div>
    </article>
  `).join("");
}

function renderGoalContributions() {
  if (!goalContributionsList) return;
  if (!goalContributions.length) {
    goalContributionsList.innerHTML = `<div class="empty-compact">Nenhum aporte registrado ainda. Quando você guardar dinheiro em uma meta, ele aparecerá aqui.</div>`;
    return;
  }
  const byMonth = goalContributions.reduce((map, item) => {
    const month = String(item.contribution_date || "").slice(0, 7) || "Sem mês";
    if (!map.has(month)) map.set(month, []);
    map.get(month).push(item);
    return map;
  }, new Map());
  goalContributionsList.innerHTML = [...byMonth.entries()].slice(0, 6).map(([month, items]) => {
    const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return `
      <section class="goal-contribution-month">
        <div class="goal-contribution-month-head"><strong>${escapeHtml(monthLabel(month))}</strong><span>${currency.format(total)}</span></div>
        ${items.map((item) => `
          <article class="goal-contribution-row">
            <span class="goal-item-icon"><i data-lucide="piggy-bank"></i></span>
            <div><strong>${escapeHtml(item.goal_name || "Meta")}</strong><small>${formatDate(item.contribution_date)}${item.note ? ` - ${escapeHtml(item.note)}` : ""}</small></div>
            <b>${currency.format(item.amount || 0)}</b>
            <div class="row-actions"><button type="button" class="icon-button secondary" data-contribution-edit="${item.id}" title="Editar aporte"><i data-lucide="pencil"></i></button><button type="button" class="icon-button danger-icon-button" data-contribution-delete="${item.id}" title="Excluir aporte"><i data-lucide="trash-2"></i></button></div>
          </article>
        `).join("")}
      </section>
    `;
  }).join("");
  refreshIcons();
}

function renderGoalChangeHistory() {
  if (!goalChangeHistoryList) return;
  if (!goalChangeHistory.length) {
    goalChangeHistoryList.innerHTML = `<div class="empty-compact">As mudanças em metas aparecerão aqui.</div>`;
    return;
  }
  goalChangeHistoryList.innerHTML = goalChangeHistory.slice(0, 8).map((item) => {
    const label = goalHistoryLabel(item);
    const amount = Number(item.next?.amount ?? item.previous?.amount ?? 0);
    return `
      <article class="goal-change-row">
        <span class="goal-item-icon"><i data-lucide="${goalHistoryIcon(item.action)}"></i></span>
        <div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(item.goal_name || item.next?.goal_name || item.previous?.goal_name || "Meta")} - ${escapeHtml(formatDateTime(item.created_at))}</small></div>
        ${amount > 0 ? `<b>${currency.format(amount)}</b>` : ""}
      </article>
    `;
  }).join("");
  refreshIcons();
}

function goalHistoryLabel(item) {
  const labels = {
    GOAL_CREATED: "Meta criada",
    GOAL_UPDATED: "Meta editada",
    GOAL_DELETED: "Meta excluída",
    GOAL_SET_PRIMARY: "Definida como meta principal",
    GOAL_CONTRIBUTION_CREATED: "Aporte registrado",
    GOAL_CONTRIBUTION_UPDATED: "Aporte editado",
    GOAL_CONTRIBUTION_DELETED: "Aporte excluído",
  };
  return labels[item.action] || "Mudança registrada";
}

function goalHistoryIcon(action) {
  if (String(action).includes("CONTRIBUTION")) return "piggy-bank";
  if (String(action).includes("PRIMARY")) return "star";
  if (String(action).includes("DELETED")) return "trash-2";
  return "target";
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
          <span class="goal-item-icon"><i data-lucide="${goalIcon(goal.objective)}"></i></span><div><span>${escapeHtml(objectiveLabel(goal.objective))}</span><strong>${escapeHtml(goal.goal_name)}</strong>${goal.is_primary ? `<small class="goal-main-badge"><i data-lucide="star"></i> Meta principal</small>` : ""}</div>
          <span class="goal-item-percent">${goal.progressPercentage || 0}%</span>
          ${goal.is_primary ? "" : `<button type="button" class="icon-button secondary" data-goal-primary="${goal.id}" title="Tornar principal"><i data-lucide="star"></i></button>`}
          <button type="button" class="icon-button secondary" data-goal-edit="${goal.id}" title="Editar meta"><i data-lucide="pencil"></i></button>
          <button type="button" class="icon-button danger-icon-button" data-goal-delete="${goal.id}" title="Excluir meta"><i data-lucide="trash-2"></i></button>
        </div>
        <div class="goal-mini-progress"><span style="width:${Math.min(goal.progressPercentage || 0, 100)}%"></span></div>
        <div class="goal-item-grid">
          <div><span>Guardado</span><strong>${currency.format(goal.saved_amount || 0)}</strong></div>
          <div><span>Falta</span><strong>${currency.format(goal.remainingAmount || 0)}</strong></div>
          <div><span>Aporte ideal</span><strong>${currency.format(goal.monthlyTarget || 0)}</strong></div>
          <div><span>Meses restantes</span><strong>${Number(goal.monthsRemaining || 0)}</strong></div>
        </div>
        <small class="goal-item-status">${escapeHtml(goal.status || "Em andamento")} - ${escapeHtml(goal.statusDetail || "Acompanhe o ritmo mensal da meta.")}</small>
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
  const monthStatus = modeMonths <= months ? "dentro do prazo" : `${modeMonths - months} mês(es) além do prazo`;
  const motivational = remaining === 0
    ? "Meta concluída. Excelente progresso registrado."
    : modeMonthly >= monthly
      ? `Com o modo ${labels[intensity]}, a previsão fica em ${modeMonths} mês(es).`
      : `Modo ${labels[intensity]} alivia o mês, mas pode levar ${modeMonths} mês(es).`;
  goalLivePreview.innerHTML = `<span>${escapeHtml(goalName)}</span><span>Faltam <strong>${currency.format(remaining)}</strong></span><span>Aporte ideal <strong>${currency.format(monthly)}</strong></span><span>Ritmo escolhido <strong>${currency.format(modeMonthly)}</strong></span><span>Previsão <strong>${escapeHtml(monthStatus)}</strong></span><span>${escapeHtml(motivational)}</span>`;
  document.querySelector("#economyModes").innerHTML = ["leve", "equilibrado", "intenso"].map((mode) => {
    const amount = remaining > 0 ? Math.max(monthly * multipliers[mode], 1) : 0;
    const finish = amount > 0 ? Math.ceil(remaining / amount) : 0;
    const selected = mode === intensity ? " active" : "";
    const status = finish <= months ? "no prazo" : `+${finish - months} mês(es)`;
    return `<article class="economy-mode${selected}"><span>${labels[mode]}</span><strong>${currency.format(amount)}</strong><small>por mês - ${status}</small></article>`;
  }).join("");
}

document.querySelector("#analyzeBtn").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="button-spinner"></span><span>Analisando...</span>`;
  try {
    await loadAnalysis(aiModeSelect?.value === "openai", { record: true });
    await loadAIHistory();
    await loadAIStatus();
    toast("Análise concluída.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
    refreshIcons();
  }
});

refreshAiBtn?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="button-spinner"></span><span>Gerando...</span>`;
  try {
    await loadAnalysis(aiModeSelect?.value === "openai", { refreshAI: aiModeSelect?.value === "openai", record: true });
    await loadAIHistory();
    await loadAIStatus();
    toast("Nova análise gerada.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
    refreshIcons();
  }
});

reanalyzePendingBtn?.addEventListener("click", async () => {
  const pending = transactions.filter((item) => item.category === "Categoria pendente");
  if (!pending.length) return toast("Não há lançamentos pendentes para reanalisar.");
  await loadAnalysis(aiModeSelect?.value === "openai", { record: true });
  await loadAIHistory();
  await loadAIStatus();
  showView("ia");
  toast(`${pending.length} lançamento(s) pendente(s) revisado(s) na análise.`);
});

async function loadAnalysis(useAI, options = {}) {
  const params = new URLSearchParams({ month: selectedAnalysisMonth });
  if (useAI) params.set("useAI", "1");
  if (options.refreshAI) params.set("refreshAI", "1");
  if (options.record) params.set("record", "1");
  analysis = await api(`/api/ai/analysis?${params.toString()}`);
  if (analysis.selectedMonth) {
    selectedAnalysisMonth = analysis.selectedMonth;
    syncMonthControls();
  }
  updateSummaryKpis();
  renderGoalSummary();
  renderCategoryCards();
  renderDashboardBudgets();
  renderHealthScore();
  renderRecurringTransactions();
  renderGoalTimeline();
  renderAIReport();
  renderOpenAIStatusPanels();
  renderOpenAIPayloadSummary();
  renderMonthlyClosingGuide();
  renderMonthlyComparisonVisual();
  renderVisibleCharts(document.querySelector(".app-view.active")?.dataset.page || "dashboard");
}

async function loadAIStatus() {
  const status = await api("/api/ai/status");
  aiStatusSnapshot = status;
  if (aiModeSelect) {
    aiModeSelect.querySelector('option[value="openai"]').disabled = !status.configured;
    if (!status.configured) aiModeSelect.value = "local";
  }
  aiProvider.textContent = status.configured
    ? `OpenAI conectada - ${status.remainingToday}/${status.dailyLimit} análises`
    : status.hasApiKey && !status.hasModel
      ? "Chave encontrada - configure OPENAI_MODEL"
      : "Análise local - sem chave OpenAI";
  aiProvider.title = status.message || "";
  aiProvider.className = `provider-badge ${status.configured ? "openai" : "warning"}`;
  renderOpenAIStatusPanels();
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
  const remainingSafeSpend = calculateRemainingSafeSpend();
  const remainingSafeSpendEl = document.querySelector("#remainingSafeSpend");
  if (remainingSafeSpendEl) {
    remainingSafeSpendEl.textContent = currency.format(remainingSafeSpend);
    remainingSafeSpendEl.classList.toggle("value-negative", remainingSafeSpend < 0);
    remainingSafeSpendEl.classList.toggle("value-positive", remainingSafeSpend >= 0);
  }
  document.querySelector("#aiIncome").textContent = currency.format(analysis.totalIncome);
  document.querySelector("#aiExpenses").textContent = currency.format(analysis.totalExpenses);
  document.querySelector("#aiBalance").textContent = currency.format(analysis.balance);
  document.querySelector("#aiTopCategory").textContent = analysis.categories[0]?.category || "Sem dados";
  document.querySelector(".balance-card")?.classList.toggle("is-critical", Number(analysis.balance || 0) < 0);
  renderDashboardGoalCard();
  renderDashboardDecisionCards();
  renderAssistantHub();
}

function calculateRemainingSafeSpend() {
  if (!analysis) return 0;
  const suggestions = (analysis.categoryBudgetSuggestions || []).filter((item) => Number(item.suggestedMonthly || 0) > 0);
  if (suggestions.length) {
    const suggestedTotal = suggestions.reduce((sum, item) => sum + Number(item.suggestedMonthly || 0), 0);
    return suggestedTotal - Number(analysis.totalExpenses || 0);
  }
  const goalReserve = Number(analysis.goal?.monthlyTarget || 0);
  const income = Number(analysis.totalIncome || 0);
  return income - goalReserve - Number(analysis.totalExpenses || 0);
}

function renderDashboardDecisionCards() {
  const avg = document.querySelector("#avgDailyExpense");
  const forecast = document.querySelector("#closingForecast");
  const risk = document.querySelector("#dashboardRiskCard");
  const best = document.querySelector("#dashboardBestCard");
  if (!analysis) return;
  const [year, month] = String(analysis.selectedMonth || selectedAnalysisMonth).split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate() || 30;
  const currentDate = new Date();
  const isCurrentMonth = currentMonthValue(currentDate) === (analysis.selectedMonth || selectedAnalysisMonth);
  const elapsedDays = isCurrentMonth ? Math.max(1, currentDate.getDate()) : daysInMonth;
  const dailyExpense = Number(analysis.totalExpenses || 0) / elapsedDays;
  const projectedExpenses = dailyExpense * daysInMonth;
  if (avg) avg.textContent = currency.format(dailyExpense || 0);
  if (forecast) forecast.textContent = currency.format(Number(analysis.totalIncome || 0) - projectedExpenses);
  if (risk) {
    const topAlert = analysis.budgetAlerts?.[0];
    if (Number(analysis.balance || 0) < 0) {
      risk.innerHTML = `<strong class="value-negative">Saldo negativo</strong><span>Você está ${currency.format(Math.abs(analysis.balance))} acima das entradas no período.</span>`;
    } else if (topAlert) {
      risk.innerHTML = `<strong>${escapeHtml(topAlert.category)}</strong><span>${currency.format(topAlert.exceededBy || 0)} acima do valor sugerido.</span>`;
    } else {
      risk.innerHTML = `<strong>Sem alerta crítico</strong><span>Os dados atuais não mostram estouro relevante.</span>`;
    }
  }
  if (best) {
    const comparison = analysis.monthlyComparison;
    if (!comparison?.hasPrevious) {
      best.innerHTML = `<div class="empty-compact">Aparece após dois meses com dados.</div>`;
    } else {
      const deltas = comparison.deltas || {};
      const options = [
        { label: "Gastos", value: Math.abs(deltas.expenses || 0), good: (deltas.expenses || 0) <= 0, text: `Gastos ${deltas.expenses <= 0 ? "caíram" : "subiram"} ${currency.format(Math.abs(deltas.expenses || 0))}` },
        { label: "Saldo", value: Math.abs(deltas.balance || 0), good: (deltas.balance || 0) >= 0, text: `Saldo ${deltas.balance >= 0 ? "melhorou" : "piorou"} ${currency.format(Math.abs(deltas.balance || 0))}` },
        { label: "Entradas", value: Math.abs(deltas.income || 0), good: (deltas.income || 0) >= 0, text: `Entradas ${deltas.income >= 0 ? "subiram" : "caíram"} ${currency.format(Math.abs(deltas.income || 0))}` },
      ].filter((item) => item.good).sort((a, b) => b.value - a.value);
      const selected = options[0] || { label: "Comparação", text: comparison.summary || "Sem melhora relevante no período." };
      best.innerHTML = `<strong>${escapeHtml(selected.label)}</strong><span>${escapeHtml(selected.text)}</span>`;
    }
  }
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
    ? `Para ${goal.goal_name}, guarde ${currency.format(goal.monthlyTarget)} por mês pelos próximos ${goal.monthsRemaining || goal.target_months} mês(es).`
    : "Cadastre uma meta para transformar a análise em um plano mensal.";
  const comparisonText = analysis.monthlyComparison?.hasPrevious ? `${analysis.monthlyComparison.summary} ` : "";
  summary.textContent = `${comparisonText}${balanceText} ${topText} ${goalText}`;
  const topEl = document.querySelector("#assistantTopCategory");
  const goalEl = document.querySelector("#assistantGoalHint");
  const monthEl = document.querySelector("#assistantMonthlyHint");
  if (topEl) topEl.textContent = top ? `${top.category} (${top.share}%)` : "Sem dados";
  if (goalEl) goalEl.textContent = goal ? `${goal.progressPercentage}% - ${goal.goal_name}` : "Cadastre uma meta";
  if (monthEl) {
    if (analysis.monthlyComparison?.hasPrevious) {
      const delta = Number(analysis.monthlyComparison.deltas?.expenses || 0);
      monthEl.textContent = `${delta > 0 ? "+" : ""}${currency.format(delta)} vs ${monthLabel(analysis.previousMonth)}`;
    } else {
      monthEl.textContent = analysis.totalExpenses > 0 ? `${monthLabel(analysis.selectedMonth || selectedAnalysisMonth)} analisado` : "Aguardando gastos";
    }
  }
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
      <span class="status-chip ${goalStatusClass(goal.status)}">${escapeHtml(goal.status)}</span>
      <h4>${escapeHtml(goal.goal_name || objectiveLabel(goal.objective))}</h4>
      <p>${escapeHtml(goal.statusDetail || `${currency.format(goal.saved_amount)} guardados de ${currency.format(goal.target_value)}.`)}</p>
      <div class="goal-dashboard-grid">
        <div><span>Aporte ideal</span><strong>${currency.format(goal.monthlyTarget)}</strong></div>
        <div><span>Prazo final</span><strong>${escapeHtml(goal.targetConclusion || goal.forecastConclusion || "-")}</strong></div>
      </div>
    </div>
  `;
}

function renderHealthScore() {
  const score = analysis?.financialScore;
  const targets = [dashboardHealthScore, reportHealthScore].filter(Boolean);
  if (!targets.length) return;
  if (!score || !score.score) {
    targets.forEach((container) => {
      container.className = "score-empty";
      container.innerHTML = "Cadastre ou importe dados para calcular a pontuação.";
    });
    return;
  }
  const html = `
    <div class="score-ring" style="--score:${score.score * 3.6}deg"><strong>${score.score}</strong><span>/100</span></div>
    <div class="score-copy"><b>${escapeHtml(score.label)}</b><p>${escapeHtml(score.summary)}</p></div>
    <div class="score-components">
      ${(score.components || []).slice(0, 4).map((item) => `<span class="${item.good ? "good" : "warn"}">${escapeHtml(item.label)} <strong>${item.value}${escapeHtml(item.unit || "")}</strong></span>`).join("")}
    </div>
    <div class="score-reasons">
      ${(score.components || []).slice(0, 4).map((item) => `<small class="${item.good ? "good" : "warn"}">${item.good ? "Subiu" : "Caiu"}: ${escapeHtml(item.label)} ficou em ${item.value}${escapeHtml(item.unit || "")}.</small>`).join("")}
    </div>
  `;
  targets.forEach((container) => {
    container.className = "score-card-body";
    container.innerHTML = html;
  });
}

function renderRecurringTransactions() {
  const items = analysis?.recurring || [];
  const html = items.length
    ? items.slice(0, 5).map((item) => `
      <article class="recurring-row">
        <span class="recurring-icon"><i data-lucide="${item.category === "Assinaturas" ? "badge-play" : "repeat-2"}"></i></span>
        <div><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(item.category || "Categoria")} - ${escapeHtml(confidenceLabel(item.confidence || "media"))}</small></div>
        <b>${currency.format(item.monthlyEstimate || item.total || 0)}/mês</b>
      </article>
    `).join("")
    : `<div class="empty-compact">Nenhuma recorrência detectada ainda. Com mais meses, o sistema identifica assinaturas e contas fixas automaticamente.</div>`;
  [dashboardRecurringList, reportRecurringList].filter(Boolean).forEach((container) => {
    container.innerHTML = html;
  });
  refreshIcons();
}

function renderOpenAIStatusPanels() {
  const status = aiStatusSnapshot || {};
  const last = analysis?.aiStatus || {};
  const used = Number(status.usedToday || 0);
  const limit = Number(status.dailyLimit || 0);
  const usagePercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const html = `
    <div><span>Modo atual</span><strong>${status.configured ? "OpenAI ativa" : "Análise local"}</strong></div>
    <div><span>Modelo</span><strong>${escapeHtml(status.model || "Não configurado")}</strong></div>
    <div><span>Uso diário</span><strong>${used}/${limit}</strong><em class="usage-bar"><i style="width:${usagePercent}%"></i></em></div>
    <div><span>Restantes</span><strong>${Number(status.remainingToday || 0)}</strong></div>
    <div><span>Última análise</span><strong>${last.source === "openai" ? (last.cached ? "OpenAI/cache" : "OpenAI") : "Local"}</strong></div>
  `;
  [openAiStatusPanel, settingsAiStatusPanel].filter(Boolean).forEach((container) => {
    container.innerHTML = html;
  });
}

function renderOpenAIPayloadSummary() {
  if (!openAiPayloadSummary) return;
  const payload = analysis?.openAIRequestSummary;
  if (!payload) {
    openAiPayloadSummary.innerHTML = `<div class="empty-compact">Gere uma análise para ver o resumo enviado à IA.</div>`;
    return;
  }
  const topCategories = payload.principaisCategorias || [];
  openAiPayloadSummary.innerHTML = `
    <div class="payload-grid">
      <div><span>Período</span><strong>${escapeHtml(monthLabel(payload.periodo || selectedAnalysisMonth))}</strong></div>
      <div><span>Entradas</span><strong>${currency.format(payload.totais?.entradas || 0)}</strong></div>
      <div><span>Saídas</span><strong>${currency.format(payload.totais?.saidas || 0)}</strong></div>
      <div><span>Pendentes</span><strong>${Number(payload.totais?.pendentes || 0)}</strong></div>
    </div>
    <div class="payload-list">
      <strong>Principais categorias usadas no contexto</strong>
      ${topCategories.length ? topCategories.map((item) => `<span>${escapeHtml(item.categoria)} - ${currency.format(item.valor || 0)} (${item.percentual || 0}%)</span>`).join("") : `<span>Sem categorias no período.</span>`}
    </div>
    <p>Não enviamos sua senha, CPF, endereço ou arquivo bruto. O contexto contém apenas totais, categorias, meta e indicadores necessários para a análise financeira.</p>
  `;
}

async function loadAIHistory() {
  if (!aiHistoryList) return;
  try {
    aiHistory = await api("/api/ai/history");
  } catch {
    aiHistory = [];
  }
  renderAIHistory();
}

function renderAIHistory() {
  if (!aiHistoryList) return;
  if (!aiHistory.length) {
    aiHistoryList.innerHTML = `<div class="empty-compact">Nenhuma análise salva ainda. Gere uma análise para criar o histórico.</div>`;
    return;
  }
  aiHistoryList.innerHTML = aiHistory.slice(0, 8).map((item) => `
    <article class="ai-history-row ${item.is_official ? "official" : ""}">
      <span class="panel-icon ai-icon"><i data-lucide="${item.source === "openai" ? "bot" : "cpu"}"></i></span>
      <div><strong>${escapeHtml(monthLabel(item.month))} ${item.is_official ? "- oficial" : ""}</strong><small>${escapeHtml(item.source === "openai" ? `OpenAI ${item.model || ""}` : "Análise local")} - ${escapeHtml(formatDateTime(item.created_at))}</small><p>${escapeHtml(item.summary || "")}</p></div>
      <button type="button" class="secondary" data-ai-official="${item.id}"><i data-lucide="badge-check"></i><span>Oficial</span></button>
    </article>
  `).join("");
  refreshIcons();
}

aiHistoryList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-ai-official]");
  if (!button) return;
  try {
    await api(`/api/ai/history/${button.dataset.aiOfficial}/official`, { method: "POST" });
    toast("Análise oficial do mês salva.");
    await loadAIHistory();
    await loadAudit();
  } catch (error) {
    toast(error.message);
  }
});

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
  const alerts = dedupeByTitleAndMessage([
    ...(ai?.alerts || []),
    ...analysis.budgetAlerts.map((item) => ({
      severity: "atencao",
      title: `${item.category} acima do ideal`,
      message: `Reduzir cerca de ${currency.format(item.exceededBy)} por mês ajuda a voltar ao patamar planejado.`,
    })),
    ...analysis.anomalies.map((item) => ({
      severity: item.severity,
      title: item.title,
      message: item.message,
    })),
  ]);
  const visibleAlerts = prioritizeAlerts(alerts).slice(0, 3);
  const visibleRecommendations = prioritizeRecommendations(recommendations).slice(0, 3);
  const summary = ai?.executiveSummary || localSummary();
  const provider = ai ? `OpenAI ${analysis.aiStatus.model}${analysis.aiStatus.cached ? " - resposta em cache" : ""}` : "Análise local";
  aiProvider.textContent = provider;
  aiProvider.className = `provider-badge ${ai ? "openai" : "warning"}`;
  aiResult.innerHTML = `
    <article class="consultant-card">
      <div class="consultant-avatar"><i data-lucide="sparkles"></i></div>
      <div><span class="consultant-label">${escapeHtml(provider)}</span><h3>Diagnóstico financeiro</h3><p>${escapeHtml(summary)}</p></div>
    </article>
    ${renderScoreInsightBlock()}
    ${renderClassificationSummaryBlock()}
    ${renderMonthlyComparisonBlock()}
    ${renderTextBlock("Diagnóstico objetivo", blocks.diagnosis.slice(0, 3), "scan-search")}
    ${renderFocusAlertsBlock(visibleAlerts, alerts)}
    ${renderFocusRecommendationsBlock(visibleRecommendations, recommendations)}
    ${renderBudgetSuggestionBlock()}
    ${renderGoalImpactBlock()}
    ${renderRecurringInsightBlock()}
    ${renderGoalPlanBlock(ai)}
    ${renderWeeklyPlanBlock(ai)}
    ${renderEducationInsightBlock(ai)}
    ${renderTextBlock("Próximas ações recomendadas", blocks.nextActions, "list-checks")}
  `;
  if (analysis.aiStatus.warning) toast(analysis.aiStatus.warning);
  refreshIcons();
}

function dedupeByTitleAndMessage(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = normalizeText(`${item.title || ""}|${item.message || ""}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function prioritizeAlerts(items) {
  const weights = { critico: 4, critical: 4, atencao: 3, warning: 3, info: 1 };
  return [...(items || [])].sort((a, b) => (weights[b.severity] || 2) - (weights[a.severity] || 2));
}

function prioritizeRecommendations(items) {
  return [...(items || [])].sort((a, b) => Number(b.potentialMonthlySavings || 0) - Number(a.potentialMonthlySavings || 0));
}

function renderFocusAlertsBlock(visibleAlerts, allAlerts) {
  if (!allAlerts.length) return renderTextBlock("Alertas principais", analysis.aiBlocks?.alerts || [], "triangle-alert");
  const hidden = Math.max(allAlerts.length - visibleAlerts.length, 0);
  return `
    <div class="ai-section ai-focus-section">
      <div class="section-title-row"><h3>Alertas principais</h3><span>mostrando ${visibleAlerts.length} de ${allAlerts.length}</span></div>
      <div class="ai-alerts compact-alerts">
        ${visibleAlerts.map((item) => `<div class="ai-alert ${escapeHtml(item.severity || "info")}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div>`).join("")}
      </div>
      ${hidden ? `<details class="ai-details"><summary>Ver mais ${hidden} alerta(s)</summary><div class="ai-alerts compact-alerts">${allAlerts.slice(visibleAlerts.length).map((item) => `<div class="ai-alert ${escapeHtml(item.severity || "info")}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div>`).join("")}</div></details>` : ""}
    </div>
  `;
}

function renderFocusRecommendationsBlock(visibleRecommendations, allRecommendations) {
  return `
    <div class="ai-section ai-focus-section">
      <div class="section-title-row"><h3>Oportunidades de economia</h3><span>priorizadas por impacto</span></div>
      <div class="recommendations compact-recommendations">
        ${visibleRecommendations.map((item) => `<article class="recommendation-card"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div><b>${currency.format(item.potentialMonthlySavings || 0)}/mês</b></article>`).join("") || `<div class="empty-compact">Cadastre mais gastos para gerar oportunidades de economia.</div>`}
      </div>
      ${allRecommendations.length > visibleRecommendations.length ? `<details class="ai-details"><summary>Ver outras ${allRecommendations.length - visibleRecommendations.length} oportunidade(s)</summary><div class="recommendations compact-recommendations">${allRecommendations.slice(visibleRecommendations.length).map((item) => `<article class="recommendation-card"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div><b>${currency.format(item.potentialMonthlySavings || 0)}/mês</b></article>`).join("")}</div></details>` : ""}
    </div>
  `;
}

function renderMonthlyComparisonBlock() {
  const comparison = analysis?.monthlyComparison;
  if (!comparison) return "";
  const currentLabel = monthLabel(comparison.selectedMonth || analysis.selectedMonth || selectedAnalysisMonth);
  const previousLabel = monthLabel(comparison.previousMonth || analysis.previousMonth);
  if (!comparison.hasPrevious) {
    return `
      <div class="ai-section monthly-comparison-block">
        <h3>Evolução mensal</h3>
        <div class="empty-compact">Este é o primeiro mês com lançamentos no período. Quando cadastrar o próximo mês, a IA vai comparar a evolução automaticamente.</div>
      </div>
    `;
  }
  const metrics = [
    { label: "Entradas", current: comparison.current.income, previous: comparison.previous.income, delta: comparison.deltas.income },
    { label: "Gastos", current: comparison.current.expenses, previous: comparison.previous.expenses, delta: comparison.deltas.expenses, expense: true },
    { label: "Saldo", current: comparison.current.balance, previous: comparison.previous.balance, delta: comparison.deltas.balance },
  ];
  return `
    <div class="ai-section monthly-comparison-block">
      <h3>Evolução mensal</h3>
      <p>${escapeHtml(comparison.summary)}</p>
      <div class="month-compare-grid">
        ${metrics.map((item) => {
          const goodDelta = item.expense ? item.delta <= 0 : item.delta >= 0;
          return `
            <article class="${goodDelta ? "is-good" : "is-bad"}">
              <span>${escapeHtml(item.label)}</span>
              <strong>${currency.format(item.current)}</strong>
              <small>${escapeHtml(currentLabel)} vs ${escapeHtml(previousLabel)}: ${item.delta > 0 ? "+" : ""}${currency.format(item.delta)}</small>
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderWeeklyPlanBlock(ai) {
  const items = (ai?.weeklyPlan?.length ? ai.weeklyPlan : analysis?.aiBlocks?.weeklyPlan || []).filter(Boolean).slice(0, 7);
  if (!items.length) return "";
  return `
    <div class="ai-section weekly-plan-block">
      <h3>Plano de 7 dias</h3>
      <div class="weekly-plan-list">
        ${items.map((item, index) => `
          <article>
            <span>${index + 1}</span>
            <p>${escapeHtml(item)}</p>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEducationInsightBlock(ai) {
  const insight = ai?.educationInsight || analysis?.aiBlocks?.educationInsight;
  if (!insight) return "";
  return `
    <div class="ai-section education-insight-block">
      <h3>Educação financeira da semana</h3>
      <div class="insight-line"><i data-lucide="graduation-cap"></i><span>${escapeHtml(insight)}</span></div>
    </div>
  `;
}

function renderClassificationSummaryBlock() {
  const summary = analysis.classificationSummary || {};
  const quality = buildClassificationQuality(summary);
  if (!quality.total) return "";
  return `
    <div class="ai-section classification-quality">
      <div class="section-title-row"><h3>Qualidade da categorização</h3><span>${quality.pending ? "revisar pendências" : "sem pendências"}</span></div>
      <div class="classification-summary-card">
        <div><span>Lançamentos analisados</span><strong>${quality.total}</strong></div>
        <div><span>Categorizados pela IA</span><strong>${quality.auto || quality.highConfidence}</strong></div>
        <div><span>Precisam de revisão</span><strong class="${quality.pending ? "value-negative" : "value-positive"}">${quality.pending}</strong></div>
        <div><span>Aprendeu com você</span><strong>${quality.corrected}</strong></div>
      </div>
      <p>${escapeHtml(quality.message)}</p>
      <details class="ai-details"><summary>Ver detalhes técnicos</summary><div class="automation-grid compact">${quality.detailRows.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div>`).join("")}</div></details>
    </div>
  `;
}

function buildClassificationQuality(summary) {
  const sourceRows = Object.entries(summary.sources || {}).map(([label, count]) => ({ label: sourceLabel(label), count: Number(count || 0) }));
  const confidenceRows = Object.entries(summary.confidence || {}).map(([label, count]) => ({ label: confidenceLabel(label), count: Number(count || 0), raw: label }));
  const total = sourceRows.reduce((sum, item) => sum + item.count, 0) || confidenceRows.reduce((sum, item) => sum + item.count, 0);
  const pending = Number(analysis?.pendingCount || 0);
  const correctedFromSource = sourceRows
    .filter((item) => /aprendida/i.test(item.label))
    .reduce((sum, item) => sum + item.count, 0);
  const correctedFromConfidence = confidenceRows
    .filter((item) => /aprendida|corrigida/i.test(item.label))
    .reduce((sum, item) => sum + item.count, 0);
  const corrected = Math.max(correctedFromSource, correctedFromConfidence);
  const highConfidence = confidenceRows.reduce((sum, item) => {
    const raw = String(item.raw || item.label);
    const numeric = Number((raw.match(/(\d{2,3})/) || [])[1] || 0);
    const high = numeric >= 80 || /alta|aprendida|corrigida/i.test(raw);
    return high ? sum + item.count : sum;
  }, 0);
  const auto = sourceRows
    .filter((item) => /IA|regra local|regra aprendida/i.test(item.label))
    .reduce((sum, item) => sum + item.count, 0);
  const message = pending
    ? `${pending} lançamento(s) ficaram com baixa confiança. Revise apenas esses casos para melhorar as próximas importações.`
    : `${auto || total} lançamento(s) foram categorizados sem pendência. Se alguma categoria estiver errada, corrija uma vez para o sistema aprender.`;
  const detailRows = [
    ...sourceRows.map((item) => ({ label: `Origem: ${item.label}`, count: item.count })),
    ...confidenceRows.map((item) => ({ label: `Confiança: ${item.label}`, count: item.count })),
  ];
  return { total, pending, corrected, highConfidence, auto, message, detailRows };
}

function renderScoreInsightBlock() {
  const score = analysis?.financialScore;
  if (!score || !score.score) return "";
  return `
    <div class="ai-section score-ai-block">
      <h3>Pontuação financeira</h3>
      <div class="score-card-body compact-score">
        <div class="score-ring" style="--score:${score.score * 3.6}deg"><strong>${score.score}</strong><span>/100</span></div>
        <div class="score-copy"><b>${escapeHtml(score.label)}</b><p>${escapeHtml(score.summary)}</p></div>
      </div>
    </div>
  `;
}

function renderRecurringInsightBlock() {
  const items = analysis?.recurring || [];
  if (!items.length) return "";
  const total = items.reduce((sum, item) => sum + Number(item.monthlyEstimate || item.total || 0), 0);
  return `
    <div class="ai-section recurring-ai-block">
      <h3>Transações recorrentes</h3>
      <p>Recorrências detectadas somam aproximadamente ${currency.format(total)} por mês.</p>
      <div class="recurring-list">${items.slice(0, 4).map((item) => `
        <article class="recurring-row">
          <span class="recurring-icon"><i data-lucide="repeat-2"></i></span>
          <div><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(item.category || "Categoria")}</small></div>
          <b>${currency.format(item.monthlyEstimate || item.total || 0)}</b>
        </article>
      `).join("")}</div>
    </div>
  `;
}

function renderTextBlock(title, items, icon) {
  const list = (items || []).filter(Boolean);
  return `<div class="ai-section"><h3>${escapeHtml(title)}</h3>${list.length ? list.map((item) => `<div class="insight-line"><i data-lucide="${icon}"></i><span>${escapeHtml(item)}</span></div>`).join("") : `<div class="empty-compact">Sem dados suficientes para este bloco.</div>`}</div>`;
}

function renderBudgetSuggestionBlock() {
  const items = [...(analysis?.categoryBudgetSuggestions || [])]
    .filter((item) => Number(item.suggestedMonthly || 0) > 0)
    .sort((a, b) => {
      const aNeed = a.status === "reduzir" ? 1 : 0;
      const bNeed = b.status === "reduzir" ? 1 : 0;
      return bNeed - aNeed || Number(b.difference || 0) - Number(a.difference || 0);
    });
  if (!items.length) return "";
  const visible = items.slice(0, 4);
  return `
    <div class="ai-section budget-table-section">
      <div class="section-title-row"><h3>Plano de gastos por categoria</h3><span>prioridade do mês</span></div>
      <div class="budget-suggestion-table">
        <div class="budget-suggestion-head"><span>Categoria</span><span>Hoje</span><span>Sugerido</span><span>Ajuste</span></div>
        ${visible.map((item) => {
          const difference = Number(item.difference || 0);
          return `
            <article class="${item.status}">
              <strong>${escapeHtml(item.category)}</strong>
              <span>${currency.format(item.currentMonthly || 0)}/mês</span>
              <span>${currency.format(item.suggestedMonthly || 0)}/mês</span>
              <b class="${difference > 0 ? "value-negative" : "value-positive"}">${difference > 0 ? `-${currency.format(difference)}` : "ok"}</b>
              <small>${escapeHtml(item.reason)}</small>
            </article>
          `;
        }).join("")}
      </div>
      ${items.length > visible.length ? `<details class="ai-details"><summary>Ver todas as categorias</summary><div class="budget-suggestion-table extra-budget-rows">${items.slice(visible.length).map((item) => `<article class="${item.status}"><strong>${escapeHtml(item.category)}</strong><span>${currency.format(item.currentMonthly || 0)}/mês</span><span>${currency.format(item.suggestedMonthly || 0)}/mês</span><b>${Number(item.difference || 0) > 0 ? `-${currency.format(item.difference)}` : "ok"}</b><small>${escapeHtml(item.reason)}</small></article>`).join("")}</div></details>` : ""}
    </div>
  `;
}

function renderGoalImpactBlock() {
  const goal = analysis?.goal;
  const categories = (analysis?.categories || []).filter((item) => Number(item.total || 0) > 0).slice(0, 4);
  if (!goal || !categories.length) return "";
  const monthlyTarget = Math.max(Number(goal.monthlyTarget || 0), 0);
  const remaining = Math.max(Number(goal.remainingAmount || 0), 0);
  if (!monthlyTarget && !remaining) return "";
  const items = categories.map((item) => {
    const total = Number(item.total || 0);
    const reduction = total * 0.15;
    const targetCoverage = monthlyTarget > 0 ? Math.round((reduction / monthlyTarget) * 100) : 0;
    const quarterSavings = reduction * 3;
    return { ...item, reduction, targetCoverage, quarterSavings };
  }).sort((a, b) => b.reduction - a.reduction).slice(0, 3);
  return `
    <div class="ai-section goal-impact-block">
      <div class="section-title-row"><h3>Impacto dos gastos na meta</h3><span>${escapeHtml(goal.goal_name || "meta")}</span></div>
      <div class="goal-impact-grid">
        ${items.map((item) => `
          <article>
            <span class="goal-impact-icon"><i data-lucide="${categoryIcon(item.category)}"></i></span>
            <div>
              <strong>${escapeHtml(item.category)}</strong>
              <p>Cortar 15% liberaria cerca de ${currency.format(item.reduction)} no mês${monthlyTarget ? `, cobrindo ${item.targetCoverage}% do aporte ideal` : ""}.</p>
              <small>Se mantiver por 3 meses, isso soma aproximadamente ${currency.format(item.quarterSavings)} para reforçar a meta.</small>
            </div>
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
        <div><span>Aporte ideal agora</span><strong>${currency.format(goal?.monthlyTarget || 0)}</strong></div>
        <div><span>Meses restantes</span><strong>${Number(goal?.monthsRemaining || 0)}</strong></div>
        <div><span>Esperado hoje</span><strong>${currency.format(goal?.expectedSavedNow || 0)}</strong></div>
        <div><span>Diferença do plano</span><strong class="${Number(goal?.paceDifference || 0) >= 0 ? "value-positive" : "value-negative"}">${currency.format(goal?.paceDifference || 0)}</strong></div>
      </div>
      <p class="ai-action-text">${escapeHtml(action || goal?.smartRecommendation || "Cadastre uma meta para receber um plano mensal.")}</p>
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
    <div><span>Prazo final</span><strong>${escapeHtml(goal.targetConclusion || "-")}</strong></div>
    <div><span>Meses restantes</span><strong>${Number(goal.monthsRemaining || 0)}</strong></div>
    <div><span>Aporte ideal agora</span><strong>${currency.format(goal.monthlyTarget)}</strong></div>
    <div><span>Esperado hoje</span><strong>${currency.format(goal.expectedSavedNow || 0)}</strong></div>
    <div><span>Diferença do plano</span><strong class="${Number(goal.paceDifference || 0) >= 0 ? "value-positive" : "value-negative"}">${currency.format(goal.paceDifference || 0)}</strong></div>
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

function categoryChartItems(compact = false) {
  const source = (analysis?.categories || [])
    .map((item) => ({ ...item, total: Number(item.total || 0) }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  const maxSlices = compact ? 5 : 7;
  if (source.length <= maxSlices) return source;
  const visible = source.slice(0, maxSlices - 1);
  const grouped = source.slice(maxSlices - 1).reduce((sum, item) => sum + item.total, 0);
  return grouped > 0 ? [...visible, { category: "Outros", total: grouped }] : visible;
}

function singleMonthFlowDataset() {
  const balance = Number(analysis?.balance || 0);
  return {
    labels: ["Entradas", "Saídas", balance < 0 ? "Déficit" : "Saldo"],
    data: [
      Number(analysis?.totalIncome || 0),
      Number(analysis?.totalExpenses || 0),
      Math.abs(balance),
    ],
    colors: [
      themeColors.emerald,
      themeColors.critical,
      balance < 0 ? themeColors.attention : themeColors.ai,
    ],
  };
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
  const items = categoryChartItems(compact);
  if (!items.length || !items.some((item) => Number(item.total) > 0)) {
    setChartEmpty(key, canvasId, "Sem dados suficientes para gerar o gráfico.");
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
        borderWidth: compact ? 5 : 4,
        borderRadius: compact ? 8 : 7,
        spacing: 2,
        hoverOffset: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: compact ? "72%" : "68%",
      radius: compact ? "88%" : "86%",
      layout: { padding: compact ? 4 : 10 },
      plugins: {
        legend: { display: false },
        premiumCenterText: { label: "Total do mês", value: chartCenterMoney(total), valueSize: compact ? 17 : 19 },
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
    setChartEmpty(key, canvasId, "Sem dados suficientes para gerar o gráfico.");
    return;
  }
  const flow = singleMonthFlowDataset();
  setChartEmpty(key, canvasId, "");
  createChart(key, canvasId, {
    type: "bar",
    data: {
      labels: flow.labels,
      datasets: [{
        label: "Valor",
        data: flow.data,
        backgroundColor: flow.colors,
        borderRadius: 18,
        borderSkipped: false,
        maxBarThickness: 66,
        categoryPercentage: .72,
        barPercentage: .7,
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
  const activeItems = items.filter((item) => Number(item.income || 0) > 0 || Number(item.expenses || 0) > 0);
  if (activeItems.length <= 1) {
    const flow = singleMonthFlowDataset();
    createChart(key, canvasId, {
      type: "bar",
      data: {
        labels: flow.labels,
        datasets: [{
          label: monthLabel(activeItems[0]?.month || analysis.selectedMonth || selectedAnalysisMonth),
          data: flow.data,
          backgroundColor: flow.colors,
          borderRadius: 18,
          borderSkipped: false,
          maxBarThickness: canvasId.includes("dashboard") ? 72 : 62,
          categoryPercentage: .74,
          barPercentage: .72,
        }],
      },
      options: {
        ...chartOptions({ theme: dark ? "dark" : "light", tooltipLabel: "Valor" }),
        plugins: {
          ...chartOptions({ theme: dark ? "dark" : "light" }).plugins,
          legend: { display: false },
        },
      },
    });
    return;
  }
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
      datasets: [{
        data: [Math.max(progress, progress > 0 ? 1 : 0), Math.max(100 - progress, 0)],
        backgroundColor: [themeColors.emerald, "#E2DED4"],
        borderColor: "#FBFAF6",
        borderWidth: 6,
        borderRadius: 18,
        spacing: 4,
        hoverOffset: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "74%",
      radius: "82%",
      rotation: -90,
      layout: { padding: 12 },
      plugins: {
        legend: { display: false },
        premiumCenterText: { label: "Concluído", value: `${progress}%`, valueSize: 24 },
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
        { label: "Recomendado", data: items.map((item) => item.suggestedMonthly), backgroundColor: "#D8D6CF", borderRadius: 999, borderSkipped: false, maxBarThickness: 16 },
        { label: "Gasto atual", data: items.map((item) => item.currentMonthly), backgroundColor: items.map((item) => budgetStatusColor(budgetStatusFromSuggestion(item))), borderRadius: 999, borderSkipped: false, maxBarThickness: 16 },
      ],
    },
    options: { ...chartOptions({ indexAxis: "y", tooltipLabel: "Valor" }), indexAxis: "y", plugins: { ...chartOptions().plugins, legend: premiumLegend(false) } },
  });
}

function renderBudgetComparisonChart() {
  const items = (analysis?.categoryBudgetSuggestions || []).filter((item) => item.suggestedMonthly > 0).slice(0, 8);
  if (!items.length) {
    setChartEmpty("budgetComparison", "budgetComparisonChart", "A IA mostrará valor recomendado x gasto real após você importar lançamentos.");
    return;
  }
  setChartEmpty("budgetComparison", "budgetComparisonChart", "");
  createChart("budgetComparison", "budgetComparisonChart", {
    type: "bar",
    data: {
      labels: items.map((item) => item.category),
      datasets: [
        { label: "Recomendado", data: items.map((item) => item.suggestedMonthly), backgroundColor: "#D8D6CF", borderRadius: 999, borderSkipped: false, maxBarThickness: 18 },
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

function goalStatusClass(value) {
  return normalizeText(value || "no prazo").replace(/\s+/g, "-") || "no-prazo";
}

function confidenceLabel(value) {
  const text = String(value || "manual");
  const labels = {
    alta: "Alta",
    media: "Média",
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
  await loadCategoryRules();
  await loadAnalysis(false);
  await loadMonthlyClosings();
}

async function loadMonthlyClosings() {
  if (!monthlyClosingList) return;
  try {
    monthlyClosings = await api("/api/monthly-closings");
    renderMonthlyClosings();
  } catch {
    monthlyClosings = [];
    renderMonthlyClosings();
  }
}

function renderMonthlyClosings() {
  if (!monthlyClosingList) return;
  renderMonthlyClosingGuide();
  renderMonthlyComparisonVisual();
  if (!monthlyClosings.length) {
    monthlyClosingList.innerHTML = `<div class="empty-compact">Nenhum mês fechado ainda. Feche o mês atual para salvar um retrato e comparar depois.</div>`;
    return;
  }
  monthlyClosingList.innerHTML = monthlyClosings.slice(0, 6).map((item) => {
    const snap = item.snapshot || {};
    const score = snap.financialScore?.score ? `${snap.financialScore.score}/100` : "Sem score";
    return `
      <article class="closing-row">
        <span class="closing-month">${escapeHtml(monthLabel(item.month))}</span>
        <div><strong>${currency.format(snap.balance || 0)}</strong><small>saldo fechado</small></div>
        <div><strong>${score}</strong><small>saúde financeira</small></div>
        <small>${escapeHtml(formatDateTime(item.closed_at))}</small>
      </article>
    `;
  }).join("");
}

function renderMonthlyClosingGuide() {
  if (!monthlyClosingGuide) return;
  const hasData = analysis && (analysis.totalIncome > 0 || analysis.totalExpenses > 0);
  const alreadyClosed = monthlyClosings.some((item) => item.month === selectedAnalysisMonth);
  monthlyClosingGuide.innerHTML = `
    <div class="${hasData ? "done" : ""}"><b>1</b><span>Conferir lançamentos de ${escapeHtml(monthLabel(selectedAnalysisMonth))}</span></div>
    <div class="${hasData ? "done" : ""}"><b>2</b><span>Gerar análise e score do mês</span></div>
    <div class="${alreadyClosed ? "done" : ""}"><b>3</b><span>${alreadyClosed ? "Mês fechado" : "Salvar fechamento"}</span></div>
    <div><b>4</b><span>Comparar com o próximo mês</span></div>
  `;
}

function renderMonthlyComparisonVisual() {
  if (!monthlyComparisonVisual) return;
  const comparison = analysis?.monthlyComparison;
  if (!comparison || !comparison.hasPrevious) {
    monthlyComparisonVisual.innerHTML = `<div class="empty-compact">Quando houver dois meses com lançamentos, a comparação aparecerá aqui.</div>`;
    return;
  }
  const rows = [
    { label: "Entradas", current: comparison.current.income, previous: comparison.previous.income, delta: comparison.deltas.income, good: comparison.deltas.income >= 0 },
    { label: "Gastos", current: comparison.current.expenses, previous: comparison.previous.expenses, delta: comparison.deltas.expenses, good: comparison.deltas.expenses <= 0 },
    { label: "Saldo", current: comparison.current.balance, previous: comparison.previous.balance, delta: comparison.deltas.balance, good: comparison.deltas.balance >= 0 },
  ];
  monthlyComparisonVisual.innerHTML = `
    <div class="month-compare-head"><span>${escapeHtml(monthLabel(comparison.previousMonth))}</span><i data-lucide="arrow-right"></i><span>${escapeHtml(monthLabel(comparison.selectedMonth))}</span></div>
    ${rows.map((row) => `
      <article class="${row.good ? "good" : "bad"}">
        <span>${escapeHtml(row.label)}</span>
        <div><small>Antes</small><strong>${currency.format(row.previous || 0)}</strong></div>
        <div><small>Agora</small><strong>${currency.format(row.current || 0)}</strong></div>
        <b>${row.delta > 0 ? "+" : ""}${currency.format(row.delta || 0)}</b>
      </article>
    `).join("")}
    <p>${escapeHtml(comparison.summary || "")}</p>
  `;
  refreshIcons();
}

closeMonthBtn?.addEventListener("click", async () => {
  if (!analysis || (analysis.totalIncome === 0 && analysis.totalExpenses === 0)) return toast("Cadastre lançamentos antes de fechar o mês.");
  const ok = confirm(`Fechar ${monthLabel(selectedAnalysisMonth)}? O sistema salvará um retrato do mês e moverá a análise para o próximo mês.`);
  if (!ok) return;
  try {
    const result = await api("/api/monthly-closings", {
      method: "POST",
      body: JSON.stringify({ month: selectedAnalysisMonth }),
    });
    toast(`Mês fechado. Próxima análise: ${monthLabel(result.nextMonth)}.`);
    await loadMonthlyClosings();
    await changeAnalysisMonth(result.nextMonth);
  } catch (error) {
    toast(error.message);
  }
});

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

function printReportPdf() {
  if (!analysis || (!transactions.length && !goals.length)) return toast("Cadastre dados para gerar o relatório.");
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return toast("Permita pop-ups para gerar o relatório.");
  const topCategories = (analysis.categories || []).slice(0, 6);
  const recentTransactions = transactions.slice(0, 12);
  const goal = analysis.goal;
  const aiText = analysis.ai?.executiveSummary || localSummary();
  const score = analysis.financialScore || {};
  const recurring = analysis.recurring || [];
  const weeklyPlan = (analysis.ai?.weeklyPlan?.length ? analysis.ai.weeklyPlan : analysis.aiBlocks?.weeklyPlan || []).slice(0, 7);
  const maxCategory = Math.max(...topCategories.map((item) => Number(item.total || 0)), 1);
  const monthRows = (analysis.monthlyEvolution || []).filter((item) => Number(item.income || 0) > 0 || Number(item.expenses || 0) > 0).slice(-6);
  const maxMonthValue = Math.max(...monthRows.flatMap((item) => [Number(item.income || 0), Number(item.expenses || 0)]), 1);
  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Relatório FinTrack AI</title>
        <style>
          body { margin: 0; padding: 32px; font-family: Inter, Segoe UI, Arial, sans-serif; color: #111A17; background: #F7F5F0; }
          .page { max-width: 920px; margin: 0 auto; background: #FFFDF8; border: 1px solid #DDD8CE; border-radius: 18px; padding: 30px; }
          h1 { margin: 0; font-size: 28px; }
          h2 { margin: 28px 0 12px; font-size: 17px; }
          p { color: #5f6862; line-height: 1.5; }
          .cover { border-radius: 24px; padding: 30px; margin-bottom: 24px; color: #fff; background: #0E1F1B; }
          .cover span { color: #E7B86A; font-weight: 800; text-transform: uppercase; font-size: 11px; }
          .cover h1 { margin-top: 10px; font-size: 42px; max-width: 640px; }
          .brand { display: flex; justify-content: space-between; gap: 18px; border-bottom: 1px solid #DDD8CE; padding-bottom: 18px; }
          .kpis, .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .card { border: 1px solid #DDD8CE; border-radius: 14px; padding: 14px; background: #FBFAF6; }
          .card span { display: block; color: #6F766F; font-size: 11px; font-weight: 800; text-transform: uppercase; }
          .card strong { display: block; margin-top: 6px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border-bottom: 1px solid #E6E0D6; padding: 10px 8px; text-align: left; font-size: 12px; }
          th { color: #6F766F; text-transform: uppercase; font-size: 10px; }
          .visual-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 14px; margin-top: 18px; }
          .bar-row { display: grid; grid-template-columns: 130px 1fr 96px; gap: 10px; align-items: center; margin: 10px 0; font-size: 12px; }
          .bar-track { height: 10px; border-radius: 999px; background: #E7E2D8; overflow: hidden; }
          .bar-track i { display: block; height: 100%; border-radius: inherit; background: #1F8A5F; }
          .flow-bars { display: grid; grid-template-columns: repeat(${Math.max(monthRows.length, 1)}, 1fr); gap: 10px; align-items: end; min-height: 170px; }
          .flow-month { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; align-items: end; height: 150px; }
          .flow-month i { display: block; border-radius: 8px 8px 0 0; min-height: 4px; }
          .flow-month .income { background: #1F8A5F; }
          .flow-month .expense { background: #C0392B; }
          .flow-label { text-align: center; color: #6F766F; font-size: 10px; margin-top: 6px; }
          .negative { color: #C0392B; }
          .positive { color: #1F8A5F; }
          .weekly { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .weekly div { border: 1px solid #DDD8CE; border-radius: 14px; padding: 12px; background: #FBFAF6; }
          @media print { body { background: #fff; padding: 0; } .page { border: 0; border-radius: 0; } }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="cover"><span>Relatório profissional</span><h1>Resumo financeiro de ${escapeHtml(monthLabel(analysis.selectedMonth || selectedAnalysisMonth))}</h1><p>Gerado com dados cadastrados ou importados pelo usuário no FinTrack AI.</p></section>
          <section class="brand">
            <div><h1>FinTrack AI</h1><p>Relatório financeiro de ${escapeHtml(monthLabel(analysis.selectedMonth || selectedAnalysisMonth))}</p></div>
            <p>Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))}</p>
          </section>
          <section class="kpis">
            <div class="card"><span>Entradas</span><strong>${currency.format(analysis.totalIncome || 0)}</strong></div>
            <div class="card"><span>Saídas</span><strong class="negative">${currency.format(analysis.totalExpenses || 0)}</strong></div>
            <div class="card"><span>Saldo</span><strong class="${analysis.balance >= 0 ? "positive" : "negative"}">${currency.format(analysis.balance || 0)}</strong></div>
            <div class="card"><span>Saúde financeira</span><strong>${score.score ? `${score.score}/100` : "Sem dados"}</strong></div>
          </section>
          <section class="visual-grid">
            <div class="card"><h2>Gráfico de categorias</h2>${topCategories.map((item) => `<div class="bar-row"><span>${escapeHtml(item.category)}</span><span class="bar-track"><i style="width:${Math.round((Number(item.total || 0) / maxCategory) * 100)}%"></i></span><strong>${currency.format(item.total || 0)}</strong></div>`).join("") || `<p>Sem categorias no período.</p>`}</div>
            <div class="card"><h2>Evolução real</h2><div class="flow-bars">${monthRows.map((item) => `<div><div class="flow-month"><i class="income" style="height:${Math.round((Number(item.income || 0) / maxMonthValue) * 100)}%"></i><i class="expense" style="height:${Math.round((Number(item.expenses || 0) / maxMonthValue) * 100)}%"></i></div><div class="flow-label">${escapeHtml(item.month)}</div></div>`).join("") || `<p>Sem meses suficientes.</p>`}</div></div>
          </section>
          <h2>Análise</h2>
          <p>${escapeHtml(aiText)}</p>
          <h2>Plano de 7 dias</h2>
          <div class="weekly">${weeklyPlan.map((item, index) => `<div><strong>Dia ${index + 1}</strong><p>${escapeHtml(item)}</p></div>`).join("") || `<div><p>Gere uma análise para criar o plano semanal.</p></div>`}</div>
          ${goal ? `<h2>Meta principal</h2><div class="grid"><div class="card"><span>Nome</span><strong>${escapeHtml(goal.goal_name)}</strong></div><div class="card"><span>Aporte ideal</span><strong>${currency.format(goal.monthlyTarget || 0)}</strong></div><div class="card"><span>Esperado hoje</span><strong>${currency.format(goal.expectedSavedNow || 0)}</strong></div><div class="card"><span>Status</span><strong>${escapeHtml(goal.status)}</strong></div></div>` : ""}
          <h2>Transações recorrentes</h2>
          <table><thead><tr><th>Descrição</th><th>Categoria</th><th>Estimativa mensal</th><th>Confiança</th></tr></thead><tbody>${recurring.slice(0, 8).map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.category || "-")}</td><td>${currency.format(item.monthlyEstimate || item.total || 0)}</td><td>${escapeHtml(confidenceLabel(item.confidence || "media"))}</td></tr>`).join("") || `<tr><td colspan="4">Sem recorrências detectadas.</td></tr>`}</tbody></table>
          <h2>Principais categorias</h2>
          <table><thead><tr><th>Categoria</th><th>Valor</th><th>Participação</th></tr></thead><tbody>${topCategories.map((item) => `<tr><td>${escapeHtml(item.category)}</td><td>${currency.format(item.total || 0)}</td><td>${item.share || 0}%</td></tr>`).join("") || `<tr><td colspan="3">Sem categorias no período.</td></tr>`}</tbody></table>
          <h2>Últimos lançamentos</h2>
          <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${recentTransactions.map((item) => `<tr><td>${formatDate(item.date)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.category)}</td><td class="${item.value < 0 ? "negative" : "positive"}">${currency.format(item.value)}</td></tr>`).join("") || `<tr><td colspan="4">Nenhum lançamento.</td></tr>`}</tbody></table>
          <h2>LGPD e origem dos dados</h2>
          <p>Este relatório usa apenas dados cadastrados ou importados pelo usuário. Não há conexão bancária automática ativa; os arquivos são processados para gerar análise, metas, recomendações e direitos do titular.</p>
        </main>
        <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
      </body>
    </html>
  `;
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
}

document.querySelector("#exportBtn").addEventListener("click", exportData);
document.querySelector("#settingsExportBtn").addEventListener("click", exportData);
printReportBtn?.addEventListener("click", printReportPdf);
exportReportCsvBtn?.addEventListener("click", exportReportCsv);
document.querySelectorAll("[data-export-json]").forEach((button) => button.addEventListener("click", exportData));
document.querySelectorAll("[data-export-csv]").forEach((button) => button.addEventListener("click", exportReportCsv));
document.querySelectorAll("[data-export-pdf]").forEach((button) => button.addEventListener("click", printReportPdf));

statementImportForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = event.currentTarget.elements.statement;
  const button = event.currentTarget.querySelector("button[type='submit']");
  const originalButton = button?.innerHTML;
  if (!input.files?.length) return toast("Selecione um arquivo CSV, Excel ou PDF.");
  const data = new FormData();
  data.append("statement", input.files[0]);
  try {
    updateImportStepper(1);
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
    importPreset = payload.preset || null;
    renderImportMapping(payload.columns || [], importMapping);
    renderImportPreview(payload.candidates || [], payload.notice, { ...(payload.summary || {}), ai: payload.ai, preset: payload.preset }, payload.errors);
    updateImportStepper((payload.candidates || []).length ? ((payload.candidates || []).some((item) => item.category === "Categoria pendente") ? 4 : 3) : 2);
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

function updateImportStepper(step) {
  if (!importStepper) return;
  [...importStepper.querySelectorAll("span")].forEach((item, index) => {
    const number = index + 1;
    item.classList.toggle("active", number === step);
    item.classList.toggle("done", number < step);
  });
}

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
    updateImportStepper(3);
  } catch (error) {
    toast(error.message);
  }
});

function renderImportPreview(items, notice, summary = {}, errors = []) {
  importCandidates = items || [];
  importPreviewSummary = summary || {};
  importPreviewErrors = errors || [];
  importNotice.textContent = notice || "";
  const ai = summary.ai || {};
  const aiLabel = ai.source === "openai"
    ? `OpenAI${ai.model ? ` (${ai.model})` : ""}`
    : "Análise local";
  const incomeCount = importCandidates.filter((item) => Number(item.value || 0) > 0).length;
  const expenseCount = importCandidates.filter((item) => Number(item.value || 0) < 0).length;
  const pendingCount = importCandidates.filter((item) => item.category === "Categoria pendente").length;
  const duplicateCount = importCandidates.filter((item) => item.duplicate).length;
  const preset = summary.preset || importPreset;
  const summaryHtml = `
    <span><strong>${escapeHtml(preset?.name || "CSV/Excel genérico")}</strong> preset</span>
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
  if (importAssistant) {
    importAssistant.innerHTML = `
      <div class="assistant-avatar"><i data-lucide="scan-search"></i></div>
      <div>
        <strong>Assistente de importação</strong>
        <p>Detectei ${incomeCount} entrada(s), ${expenseCount} saída(s), ${duplicateCount} duplicada(s) e ${pendingCount} categoria(s) pendente(s). Revise só o que estiver pendente ou diferente do esperado antes de confirmar.</p>
        <div class="import-bulk-tools">
          <label>Aplicar categoria
            <select data-import-bulk-category>
              <option value="">Escolha</option>
              ${importBulkCategoryOptions()}
            </select>
          </label>
          <button type="button" class="secondary" data-import-bulk="pending">Aplicar nas pendentes</button>
          <button type="button" class="secondary" data-import-bulk="selected">Aplicar nas selecionadas</button>
        </div>
      </div>
    `;
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
  updateImportStepper(importCandidates.some((item) => item.category === "Categoria pendente") ? 4 : 3);
  refreshIcons();
}

function importBulkCategoryOptions() {
  return categories
    .map((item) => item.name)
    .filter((name) => !["Receita", "Metas", "Categoria pendente"].includes(name))
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
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

importAssistant?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-import-bulk]");
  if (!button) return;
  const category = importAssistant.querySelector("[data-import-bulk-category]")?.value;
  if (!category) return toast("Escolha uma categoria para aplicar em lote.");
  const mode = button.dataset.importBulk;
  const checkedIndexes = new Set([...importPreviewBody.querySelectorAll("tr")]
    .filter((row) => row.querySelector(".preview-check")?.checked)
    .map((row) => Number(row.dataset.index)));
  let changed = 0;
  importCandidates.forEach((item, index) => {
    if (!item || item.duplicate) return;
    const shouldApply = mode === "pending"
      ? item.category === "Categoria pendente"
      : checkedIndexes.has(index);
    if (!shouldApply) return;
    item.category = category;
    item.userCorrected = true;
    item.confidence = "corrigida pelo usuário";
    changed += 1;
  });
  renderImportPreview(importCandidates, importNotice.textContent, importPreviewSummary, importPreviewErrors);
  updateImportStepper(importCandidates.some((item) => item.category === "Categoria pendente") ? 4 : 5);
  toast(`${changed} lançamento(s) atualizado(s) em lote.`);
});

confirmImportBtn.addEventListener("click", async () => {
  const selected = [...importPreviewBody.querySelectorAll("tr")]
    .filter((row) => row.querySelector(".preview-check")?.checked)
    .map((row) => importCandidates[Number(row.dataset.index)]);
  if (!selected.length) return toast("Selecione ao menos uma transação.");
  if (selected.some((item) => item.category === "Categoria pendente")) return toast("Defina somente as categorias pendentes.");
  const result = await api("/api/import/transactions", { method: "POST", body: JSON.stringify({ transactions: selected, source: importSource }) });
  toast(`${result.imported} transações importadas. ${result.skippedDuplicates || 0} duplicadas ignoradas.`);
  updateImportStepper(5);
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
    CATEGORY_RULE_SAVED: `Regra aprendida salva${details.merchantPattern ? `: ${details.merchantPattern}` : ""}`,
    CATEGORY_RULE_UPDATED: `Regra aprendida atualizada${details.merchantPattern ? `: ${details.merchantPattern}` : ""}`,
    CATEGORY_RULE_DELETED: `Regra aprendida excluída${details.merchantPattern ? `: ${details.merchantPattern}` : ""}`,
    TRANSACTION_CREATED: "Transação criada",
    TRANSACTION_UPDATED: "Transação editada",
    TRANSACTION_DELETED: "Transação excluída",
    TRANSACTIONS_BULK_DELETED: `${details.deleted || 0} lançamento(s) excluído(s) em massa`,
    TRANSACTIONS_BULK_CATEGORY_UPDATED: `${details.updated || 0} lançamento(s) categorizado(s) em massa${details.category ? `: ${details.category}` : ""}`,
    TRANSACTIONS_IMPORTED: `${details.imported || 0} transação(ões) importada(s)`,
    PDF_STATEMENT_ANALYZED: "Extrato PDF analisado",
    STATEMENT_FILE_ANALYZED: "Arquivo de extrato analisado",
    FINANCIAL_GOAL_UPDATED: `Meta salva${details.goalName ? `: ${details.goalName}` : ""}`,
    FINANCIAL_GOAL_DELETED: `Meta excluída${details.goalName ? `: ${details.goalName}` : ""}`,
    FINANCIAL_GOAL_PRIMARY_SET: `Meta principal alterada${details.goalName ? `: ${details.goalName}` : ""}`,
    GOAL_CONTRIBUTION_CREATED: `Valor guardado na meta: ${currency.format(details.amount || 0)}`,
    GOAL_CONTRIBUTION_UPDATED: `Aporte editado na meta: ${currency.format(details.amount || 0)}`,
    GOAL_CONTRIBUTION_DELETED: `Aporte removido da meta: ${currency.format(details.amount || 0)}`,
    MONTHLY_CLOSING_CREATED: `Fechamento mensal salvo${details.month ? `: ${monthLabel(details.month)}` : ""}`,
    AI_ANALYSIS_REQUESTED: "Análise financeira solicitada",
    AI_ANALYSIS_OFFICIAL_SAVED: `Análise oficial salva${details.month ? `: ${monthLabel(details.month)}` : ""}`,
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

function currentMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthValue(value, offset) {
  const [year, month] = String(value || currentMonthValue()).split("-").map(Number);
  const date = new Date(year, month - 1 + Number(offset || 0), 1);
  return currentMonthValue(date);
}

function selectedMonthDefaultDate() {
  const today = new Date();
  const current = currentMonthValue(today);
  if (selectedAnalysisMonth === current) {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }
  return `${selectedAnalysisMonth}-01`;
}

function syncMonthControls() {
  if (analysisMonthInput) analysisMonthInput.value = selectedAnalysisMonth;
  if (currentMonthLabel) currentMonthLabel.textContent = monthLabel(selectedAnalysisMonth);
  if (transactionMonthFilter && !transactionMonthFilter.value) transactionMonthFilter.value = selectedAnalysisMonth;
}

async function changeAnalysisMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return;
  selectedAnalysisMonth = month;
  syncMonthControls();
  if (transactionMonthFilter) transactionMonthFilter.value = selectedAnalysisMonth;
  resetTransactionPagination();
  await loadAnalysis(false);
  renderVisibleCharts(document.querySelector(".app-view.active")?.dataset.page || "dashboard");
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
    selectedAnalysisMonth = selectedAnalysisMonth || currentMonthValue();
    syncMonthControls();
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
      await loadCategoryRules();
      await loadAnalysis(false);
      await loadAIStatus();
      await loadMonthlyClosings();
      await loadAIHistory();
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

