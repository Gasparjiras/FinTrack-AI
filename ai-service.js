const OpenAI = require("openai");

const MODEL = String(process.env.OPENAI_MODEL || "").trim();
const CATEGORIES = [
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

let client;
let warnedMissingModel = false;

function isOpenAIConfigured() {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  if (hasKey && !MODEL && !warnedMissingModel) {
    console.error("OPENAI_MODEL não configurado no .env.");
    warnedMissingModel = true;
  }
  return hasKey && Boolean(MODEL);
}

function getClient() {
  if (!isOpenAIConfigured()) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      timeout: 30000,
      maxRetries: 1,
    });
  }
  return client;
}

async function structuredResponse(name, schema, instructions, input, maxOutputTokens = 2500) {
  const openai = getClient();
  if (!openai) return null;
  const response = await openai.responses.create({
    model: MODEL,
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: maxOutputTokens,
    instructions,
    input,
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema,
      },
    },
  });
  return JSON.parse(response.output_text);
}

async function classifyTransactions(candidates, learnedRules) {
  if (!isOpenAIConfigured() || candidates.length === 0) return null;
  const payload = candidates.slice(0, 80).map((item, index) => ({
    index,
    description: item.description,
    value: item.value,
    date: item.date,
    heuristicCategory: item.category,
    heuristicConfidence: item.confidence,
  }));
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["transactions"],
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "direction", "category", "confidence", "reason"],
          properties: {
            index: { type: "integer" },
            direction: { type: "string", enum: ["entrada", "saida"] },
            category: { type: "string", enum: CATEGORIES },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" },
          },
        },
      },
    },
  };
  const instructions = [
    "Você classifica transações financeiras brasileiras.",
    "Use somente as categorias permitidas pelo schema.",
    "Respeite regras aprendidas do usuário quando o comerciante combinar.",
    "Pix recebido, salário e transferência recebida são entrada/Receita.",
    "Compras, pagamentos, tarifas e Pix enviado são saída.",
    "Use Categoria pendente apenas quando a descrição realmente não permitir uma classificação segura.",
    "Não invente transações e preserve o índice original.",
  ].join(" ");
  return structuredResponse(
    "transaction_classification",
    schema,
    instructions,
    JSON.stringify({ learnedRules, transactions: payload }),
    3000
  );
}

async function generateFinancialPlan(context) {
  if (!isOpenAIConfigured()) return null;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["executiveSummary", "diagnosis", "mainExpenses", "alerts", "recommendations", "monthlyPlan", "nextActions", "pendingQuestions"],
    properties: {
      executiveSummary: { type: "string" },
      diagnosis: {
        type: "array",
        items: { type: "string" },
      },
      mainExpenses: {
        type: "array",
        items: { type: "string" },
      },
      alerts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["severity", "title", "message"],
          properties: {
            severity: { type: "string", enum: ["info", "atencao", "critico"] },
            title: { type: "string" },
            message: { type: "string" },
          },
        },
      },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "title", "message", "monthlySavings"],
          properties: {
            category: { type: "string" },
            title: { type: "string" },
            message: { type: "string" },
            monthlySavings: { type: "number", minimum: 0 },
          },
        },
      },
      monthlyPlan: {
        type: "object",
        additionalProperties: false,
        required: ["targetPerMonth", "currentCapacity", "monthlyGap", "action"],
        properties: {
          targetPerMonth: { type: "number" },
          currentCapacity: { type: "number" },
          monthlyGap: { type: "number" },
          action: { type: "string" },
        },
      },
      nextActions: {
        type: "array",
        items: { type: "string" },
      },
      pendingQuestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "question"],
          properties: {
            description: { type: "string" },
            question: { type: "string" },
          },
        },
      },
    },
  };
  const instructions = [
    "Você é um planejador financeiro educativo brasileiro.",
    "Você recebe apenas um resumo financeiro agregado; não solicite CPF, banco, número de conta ou extrato completo.",
    "Analise somente os dados fornecidos e não invente renda, gastos ou economia.",
    "Divida a resposta nos blocos: diagnóstico financeiro, principais gastos, alertas, oportunidades, plano da meta e próximas ações.",
    "Gere recomendações práticas, específicas e quantificadas em reais por mês.",
    "Relacione o plano com a meta, valor já guardado, prazo, modo de economia, saldo médio e categorias de maior gasto.",
    "Use anomalias e limites por categoria quando estiverem no contexto.",
    "Pergunte somente sobre transações marcadas como Categoria pendente.",
    "Não prometa retorno de investimento e não ofereça aconselhamento financeiro regulado.",
    "Se o extrato não tiver renda, deixe claro que a capacidade mensal é uma estimativa incompleta.",
  ].join(" ");
  return structuredResponse(
    "personalized_financial_plan",
    schema,
    instructions,
    JSON.stringify(context),
    3500
  );
}

module.exports = {
  MODEL,
  classifyTransactions,
  generateFinancialPlan,
  isOpenAIConfigured,
};
