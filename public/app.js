const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const message = document.querySelector("#message");
const transactionForm = document.querySelector("#transactionForm");
const starterPanel = document.querySelector("#starterPanel");
const goalForm = document.querySelector("#goalForm");
const goalContributionForm = document.querySelector("#goalContributionForm");
const categoryForm = document.querySelector("#categoryForm");
const transactionsBody = document.querySelector("#transactionsBody");
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
const acceptConsentBtn = document.querySelector("#acceptConsentBtn");
const revokeConsentBtn = document.querySelector("#revokeConsentBtn");
const passwordInput = document.querySelector("#passwordInput");
const confirmPasswordInput = document.querySelector("#confirmPasswordInput");
const passwordBar = document.querySelector("#passwordBar");
const registerButton = document.querySelector("#registerButton");
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

let transactions = [];
let categories = [];
let analysis = null;
let importCandidates = [];
let importRows = [];
let importMapping = {};
let importSource = "importado";
let userConsentAccepted = true;
let categoryManuallyChanged = false;
let suggestionTimer = null;
let transactionPage = 1;
const transactionPageSize = 8;
const charts = {};

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
      <span class="recent-dot" style="background:${categoryColor(item.category)}"></span>
      <div><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(item.category)} - ${formatDate(item.date)}</small></div>
      <b class="${item.value < 0 ? "value-negative" : "value-positive"}">${currency.format(item.value)}</b>
    </div>
  `).join("");
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
    const width = Math.min(item.percentage, 100);
    const statusLabels = { dentro: "Dentro do limite", atencao: "Atenção", acima: "Acima do limite" };
    const hasLimit = Number(item.monthly_limit || 0) > 0;
    const status = !hasLimit
      ? "Sem limite definido"
      : item.status === "acima"
        ? `Acima em ${currency.format(Math.abs(item.remaining))}`
        : `${currency.format(Math.max(item.remaining || 0, 0))} disponível`;
    return `
      <article class="category-card status-${item.status}">
        <div class="category-card-head"><span class="category-color" style="background:${item.color}"></span><div><h3>${escapeHtml(item.name)}</h3><p>${status}</p></div><span class="category-status">${statusLabels[item.status] || "Dentro do limite"}</span><div class="row-actions"><button class="icon-button secondary" data-category-edit="${item.id}" type="button" title="Editar"><i data-lucide="pencil"></i></button>${!["Outros", "Receita", "Metas"].includes(item.name) ? `<button class="icon-button delete-button" data-category-delete="${item.id}" type="button" title="Excluir"><i data-lucide="trash-2"></i></button>` : ""}</div></div>
        <div class="category-numbers"><strong>${currency.format(item.spent)}</strong><span>${hasLimit ? `de ${currency.format(item.monthly_limit)}` : "limite não definido"}</span></div>
        <div class="progress-track"><span style="width:${width}%;background:${statusColor(item, item.color)}"></span></div>
        <small>${hasLimit ? `${item.percentage}% do limite` : "Defina um limite para ativar alertas"}</small>
      </article>
    `;
  }).join("");
  refreshIcons();
}

document.querySelector("#categoriesGrid").addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.categoryEdit) {
    const item = categories.find((entry) => String(entry.id) === String(button.dataset.categoryEdit));
    categoryForm.elements.id.value = item.id;
    categoryForm.elements.name.value = item.name;
    categoryForm.elements.monthlyLimit.value = item.monthly_limit;
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
  const items = categories
    .filter((item) => item.name !== "Receita" && item.monthly_limit > 0)
    .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
    .slice(0, 5);
  container.innerHTML = items.map((item) => {
    const percentage = Math.max(Number(item.percentage || 0), 0);
    const overAmount = Math.max((item.spent || 0) - (item.monthly_limit || 0), 0);
    const detail = item.status === "acima"
      ? `${currency.format(overAmount)} acima do limite de ${currency.format(item.monthly_limit)}`
      : `${currency.format(Math.max((item.monthly_limit || 0) - (item.spent || 0), 0))} ainda disponível`;
    const fill = Math.min(percentage, 100);
    const overrun = item.status === "acima" ? Math.min(Math.max(percentage - 100, 8), 34) : 0;
    const alert = item.status === "acima"
      ? `<span class="budget-alert"><i data-lucide="triangle-alert"></i>${percentage}% do orçamento utilizado</span>`
      : "";
    return `
      <div class="budget-row status-${item.status}">
        <div class="budget-label"><strong>${escapeHtml(item.name)}</strong>${alert}<b class="${item.status === "acima" ? "value-negative" : item.status === "atencao" ? "value-warning" : ""}">${percentage}%</b></div>
        <div class="progress-track budget-track" style="--budget-width:${fill}%;--budget-overrun:${overrun}%;--budget-color:${statusColor(item, item.color)}"><span></span>${overrun ? "<i></i>" : ""}</div>
        <small>${escapeHtml(detail)}</small>
    </div>
    `;
  }).join("") || `<div class="empty-compact">Cadastre limites para acompanhar seu orçamento.</div>`;
  refreshIcons();
}

function updateBudgetStatus() {
  const statusElement = document.querySelector("#budgetStatus");
  const detailElement = document.querySelector("#budgetStatusDetail");
  if (!statusElement || !detailElement) return;
  const tracked = categories.filter((item) => item.name !== "Receita" && item.monthly_limit > 0);
  const over = tracked.filter((item) => item.status === "acima");
  const attention = tracked.filter((item) => item.status === "atencao");
  statusElement.textContent = over.length ? `${over.length} acima` : attention.length ? `${attention.length} em atenção` : `${tracked.length} dentro`;
  detailElement.textContent = over.length
    ? over.map((item) => item.name).join(", ")
    : attention.length ? attention.map((item) => item.name).join(", ") : "Nenhum alerta";
}

function statusColor(item, fallback) {
  if (item.status === "acima") return "#c2463f";
  if (item.status === "atencao") return "#d4a017";
  return fallback;
}

goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/goal", { method: "PUT", body: JSON.stringify(formData(goalForm)) });
    toast("Meta salva.");
    await loadGoal();
    await loadAnalysis(false);
  } catch (error) {
    toast(error.message);
  }
});

goalForm.addEventListener("input", updateGoalLivePreview);

goalContributionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/goal/contribution", {
      method: "POST",
      body: JSON.stringify(formData(goalContributionForm)),
    });
    goalContributionForm.reset();
    goalContributionForm.elements.date.value = new Date().toISOString().slice(0, 10);
    toast("Valor guardado adicionado à meta e aos lançamentos.");
    await refreshFinancialData();
    await loadGoal();
    showView("metas");
  } catch (error) {
    toast(error.message);
  }
});

async function loadGoal() {
  const result = await api("/api/goal");
  if (goalContributionForm?.elements.date && !goalContributionForm.elements.date.value) {
    goalContributionForm.elements.date.value = new Date().toISOString().slice(0, 10);
  }
  if (!result.goal) {
    updateGoalLivePreview();
    return;
  }
  goalForm.elements.goalName.value = result.goal.goal_name || "";
  goalForm.elements.objective.value = result.goal.objective;
  goalForm.elements.targetValue.value = result.goal.target_value;
  goalForm.elements.savedAmount.value = result.goal.saved_amount || 0;
  goalForm.elements.plannedMonthlySavings.value = result.goal.planned_monthly_savings || "";
  goalForm.elements.targetMonths.value = result.goal.target_months;
  goalForm.elements.intensity.value = result.goal.intensity;
  updateGoalLivePreview();
}

function updateGoalLivePreview() {
  const goalName = goalForm.elements.goalName.value.trim() || "Meta principal";
  const target = Number(goalForm.elements.targetValue.value || 0);
  const saved = Number(goalForm.elements.savedAmount.value || 0);
  const months = Number(goalForm.elements.targetMonths.value || 0);
  const planned = Number(goalForm.elements.plannedMonthlySavings.value || 0);
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
  const plannedMonths = planned > 0 && remaining > 0 ? Math.ceil(remaining / planned) : null;
  const motivational = remaining === 0
    ? "Meta concluída. Excelente para apresentar o progresso!"
    : planned > 0 && planned >= monthly
      ? "Você está no ritmo para cumprir o prazo."
      : planned > 0
        ? `Com esse ritmo, a previsão fica em ${plannedMonths} meses.`
        : "Informe quanto pretende guardar por mês para comparar com o prazo.";
  goalLivePreview.innerHTML = `<span>${escapeHtml(goalName)}</span><span>Faltam <strong>${currency.format(remaining)}</strong></span><span>Necessário por mês <strong>${currency.format(monthly)}</strong></span><span>Planejado <strong>${currency.format(planned || 0)}</strong></span><span>${escapeHtml(motivational)}</span>`;
  document.querySelector("#economyModes").innerHTML = ["leve", "equilibrado", "intenso"].map((mode) => {
    const amount = remaining > 0 ? Math.max(monthly * multipliers[mode], 1) : 0;
    const finish = amount > 0 ? Math.ceil(remaining / amount) : 0;
    const selected = mode === intensity ? " active" : "";
    return `<article class="economy-mode${selected}"><span>${labels[mode]}</span><strong>${currency.format(amount)}/mês</strong><small>Conclusão estimada em ${finish} mês(es)</small></article>`;
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
  document.querySelector("#income").textContent = currency.format(analysis.totalIncome);
  document.querySelector("#expenses").textContent = currency.format(analysis.totalExpenses);
  document.querySelector("#balance").textContent = currency.format(analysis.balance);
  document.querySelector("#savedGoalKpi").textContent = currency.format(analysis.goal?.saved_amount || 0);
  document.querySelector("#savedGoalDetail").textContent = analysis.goal ? `${currency.format(analysis.goal.remainingAmount)} faltando` : "Sem meta ativa";
  document.querySelector("#goalProgressKpi").textContent = `${analysis.goal?.progressPercentage || 0}%`;
  document.querySelector("#goalProgressDetail").textContent = analysis.goal?.status || "Cadastre uma meta";
  document.querySelector("#suggestedSavingsKpi").textContent = currency.format(analysis.potentialMonthlySavings || 0);
  document.querySelector("#aiIncome").textContent = currency.format(analysis.totalIncome);
  document.querySelector("#aiExpenses").textContent = currency.format(analysis.totalExpenses);
  document.querySelector("#aiBalance").textContent = currency.format(analysis.balance);
  document.querySelector("#aiTopCategory").textContent = analysis.categories[0]?.category || "Sem dados";
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
    <div class="goal-progress-ring" style="--progress:${goal.progressPercentage * 3.6}deg"><strong>${goal.progressPercentage}%</strong><span>alcancado</span></div>
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
      title: `${item.category} acima do limite`,
      message: `O gasto ultrapassou o planejado em ${currency.format(item.exceededBy)}.`,
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

function renderGoalPlanBlock(ai) {
  const goal = analysis.goal;
  const action = ai?.monthlyPlan?.action;
  return `
    <div class="ai-section">
      <h3>Plano para atingir a meta</h3>
      <div class="goal-plan">
        <div><span>Guardar por mês</span><strong>${currency.format(goal?.monthlyTarget || 0)}</strong></div>
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
    <div class="goal-progress-ring large" style="--progress:${goal.progressPercentage * 3.6}deg"><strong>${goal.progressPercentage}%</strong><span>da meta</span></div>
    <div><span>Meta</span><strong>${escapeHtml(goal.goal_name || objectiveLabel(goal.objective))}</strong></div>
    <div><span>Objetivo</span><strong>${escapeHtml(objectiveLabel(goal.objective))}</strong></div>
    <div><span>Valor total</span><strong>${currency.format(goal.target_value)}</strong></div>
    <div><span>Já guardado</span><strong>${currency.format(goal.saved_amount)}</strong></div>
    <div><span>Falta</span><strong>${currency.format(goal.remainingAmount)}</strong></div>
    <div><span>Prazo</span><strong>${goal.target_months} meses</strong></div>
    <div><span>Modo</span><strong>${escapeHtml(goal.modeLabel)}</strong></div>
    <div><span>Necessário por mês</span><strong>${currency.format(goal.monthlyTarget)}</strong></div>
    <div><span>Planejado por mês</span><strong>${currency.format(goal.planned_monthly_savings || 0)}</strong></div>
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

function renderCategoryChart(key, canvasId, compact) {
  const dark = isDarkDashboardChart(canvasId);
  const items = analysis.categories || [];
  if (!items.length || !items.some((item) => Number(item.total) > 0)) {
    setChartEmpty(key, canvasId, "Sem dados suficientes para gerar o grafico.");
    return;
  }
  setChartEmpty(key, canvasId, "");
  createChart(key, canvasId, {
    type: "doughnut",
    data: {
      labels: items.map((item) => item.category),
      datasets: [{
        data: items.map((item) => item.total),
        backgroundColor: items.map((item) => categoryColor(item.category)),
        borderColor: dark ? "#292928" : "#ffffff",
        borderWidth: dark ? 3 : 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: compact ? "68%" : "60%",
      plugins: {
        legend: { display: !dark, position: "bottom", labels: { color: dark ? "#d8d7d2" : "#17201d", usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            title: (context) => context[0]?.label || "",
            label: (context) => {
              const value = Number(context.raw || 0);
              const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
              const percent = total > 0 ? Math.round((value / total) * 100) : 0;
              return [`${currency.format(value)}`, `${percent}% dos gastos do mês`];
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
    data: { labels: ["Entradas", "Saídas", "Saldo"], datasets: [{ data: [analysis.totalIncome, analysis.totalExpenses, Math.max(analysis.balance, 0)], backgroundColor: ["#146b59", "#d95d39", "#285e8e"], borderRadius: 7 }] },
    options: chartOptions(),
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
        { label: "Entradas", data: items.map((item) => item.income), borderColor: "#3b82f6", backgroundColor: dark ? "rgba(59,130,246,.08)" : "rgba(59,130,246,.12)", fill: true, tension: .32 },
        { label: "Saídas", data: items.map((item) => item.expenses), borderColor: "#ef4444", backgroundColor: dark ? "rgba(239,68,68,.06)" : "rgba(239,68,68,.08)", fill: true, tension: .32 },
      ],
    },
    options: { ...chartOptions(dark ? "dark" : "light"), plugins: { legend: { position: "top", align: "start", labels: { color: dark ? "#d8d7d2" : "#17201d", usePointStyle: true, boxWidth: 8 } } } },
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
      labels: ["Concluido", "Falta"],
      datasets: [{ data: [progress, Math.max(100 - progress, 0)], backgroundColor: ["#146b59", "#dfe8e4"], borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { position: "bottom" } } },
  });
}

function renderBudgetChart() {
  const items = categories.filter((item) => item.name !== "Receita" && item.monthly_limit > 0).slice(0, 8);
  if (!items.length) {
    setChartEmpty("budget", "budgetChart", "Defina limites por categoria para gerar o gráfico.");
    return;
  }
  setChartEmpty("budget", "budgetChart", "");
  createChart("budget", "budgetChart", {
    type: "bar",
    data: { labels: items.map((item) => item.name), datasets: [{ label: "Limite", data: items.map((item) => item.monthly_limit), backgroundColor: "#c8d4df", borderRadius: 5 }, { label: "Gasto", data: items.map((item) => item.spent), backgroundColor: items.map((item) => statusColor(item, item.color)), borderRadius: 5 }] },
    options: { ...chartOptions(), indexAxis: "y", plugins: { legend: { position: "top" } } },
  });
}

function renderBudgetComparisonChart() {
  const items = categories.filter((item) => item.name !== "Receita" && item.monthly_limit > 0).slice(0, 8);
  if (!items.length) {
    setChartEmpty("budgetComparison", "budgetComparisonChart", "Defina limites por categoria para comparar planejado e realizado.");
    return;
  }
  setChartEmpty("budgetComparison", "budgetComparisonChart", "");
  createChart("budgetComparison", "budgetComparisonChart", {
    type: "bar",
    data: {
      labels: items.map((item) => item.name),
      datasets: [
        { label: "Limite", data: items.map((item) => item.monthly_limit), backgroundColor: "#d8e2dd", borderRadius: 6 },
        { label: "Gasto real", data: items.map((item) => item.spent), backgroundColor: items.map((item) => statusColor(item, item.color)), borderRadius: 6 },
      ],
    },
    options: { ...chartOptions(), plugins: { legend: { display: true, position: "top" } } },
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
      datasets: [{ label: "Economia mensal", data: items.map((item) => item.potentialMonthlySavings), backgroundColor: "#146b59", borderRadius: 6 }],
    },
    options: chartOptions(),
  });
}

function chartOptions(theme = "light") {
  const dark = theme === "dark";
  const tickColor = dark ? "#aaa9a4" : "#64716c";
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: dark ? "rgba(255,255,255,.22)" : "rgba(100,113,108,.12)" }, ticks: { color: tickColor } },
      x: { grid: { display: false }, ticks: { color: tickColor } },
    },
  };
}

function createChart(key, id, config) {
  if (charts[key]) charts[key].destroy();
  const canvas = document.querySelector(`#${id}`);
  if (canvas && !canvas.closest("[hidden]")) charts[key] = new Chart(canvas, config);
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
  return Boolean(document.querySelector(`#${canvasId}`)?.closest(".finance-board"));
}

function categoryColor(name) {
  return categories.find((item) => item.name === name)?.color || "#6b7280";
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
  if (!input.files?.length) return toast("Selecione um arquivo CSV, Excel ou PDF.");
  const data = new FormData();
  data.append("statement", input.files[0]);
  try {
    toast("Lendo o arquivo...");
    const response = await fetch("/api/import/file", { method: "POST", body: data, credentials: "include" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível ler o arquivo.");
    importRows = payload.rows || [];
    importMapping = payload.mapping || {};
    importSource = payload.kind || "importado";
    renderImportMapping(payload.columns || [], importMapping);
    renderImportPreview(payload.candidates || [], payload.notice, payload.summary, payload.errors);
  } catch (error) {
    toast(error.message);
  }
});

function renderImportMapping(columns, mapping) {
  const hasColumns = columns.length > 0;
  setHidden(importMappingCard, !hasColumns);
  if (!hasColumns) return;
  const fields = [
    ["date", "Data", true],
    ["description", "Descrição", true],
    ["value", "Valor", true],
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
  `).join("");
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
    const preview = await api("/api/import/preview", {
      method: "POST",
      body: JSON.stringify({ rows: importRows, mapping: importMapping }),
    });
    renderImportPreview(preview.candidates, "Confira a prévia antes de confirmar a importação.", preview.summary, preview.errors);
  } catch (error) {
    toast(error.message);
  }
});

function renderImportPreview(items, notice, summary = {}, errors = []) {
  importCandidates = items || [];
  importNotice.textContent = notice || "";
  const summaryHtml = `
    <span><strong>${summary.found || importCandidates.length}</strong> transações encontradas</span>
    <span><strong>${summary.importable || 0}</strong> prontas para importar</span>
    <span><strong>${currency.format(summary.income || 0)}</strong> entradas</span>
    <span><strong>${currency.format(summary.expenses || 0)}</strong> saídas</span>
    <span><strong>${summary.duplicates || 0}</strong> duplicadas</span>
    <span><strong>${summary.errors || 0}</strong> erros</span>
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
        <td><select class="preview-category" ${duplicate ? "disabled" : ""}>${categoryOptions(item.category)}</select></td>
        <td class="${item.value < 0 ? "value-negative" : "value-positive"}">${currency.format(item.value)}</td>
        <td>${escapeHtml(confidenceLabel(item.confidence))}</td>
        <td>${duplicate ? `<span class="status-badge danger">Duplicada</span>` : `<span class="status-badge">${escapeHtml(status)}</span>`}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7"><div class="empty-compact">Nenhuma transação reconhecida. Revise o arquivo ou o mapeamento de colunas.</div></td></tr>`;
  setHidden(importPreviewCard, false);
  setHidden(confirmImportBtn, importCandidates.filter((item) => !item.duplicate).length === 0);
}

function categoryOptions(selected) {
  return [`Categoria pendente`, ...categories.map((item) => item.name)].map((name) => `<option value="${escapeHtml(name)}"${name === selected ? " selected" : ""}>${escapeHtml(name)}</option>`).join("");
}

importPreviewBody.addEventListener("change", (event) => {
  if (!event.target.classList.contains("preview-category")) return;
  const row = event.target.closest("tr");
  const item = importCandidates[Number(row.dataset.index)];
  item.category = event.target.value;
  item.userCorrected = true;
  item.confidence = "corrigida pelo usuário";
  row.classList.toggle("pending-row", item.category === "Categoria pendente");
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

