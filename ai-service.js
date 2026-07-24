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
    "Exemplos: Spotify/Netflix/Disney/HBO/Amazon Prime = Assinaturas; Uber/99/combustível/seguro da moto = Transporte; iFood/restaurante/padaria = Alimentação; supermercado/atacado/mercado = Mercado; faculdade/curso = Educação; celular/internet/energia/aluguel = Contas fixas.",
    "Quando houver valor positivo, mas a descrição indicar compra, cartão, pagamento ou categoria de despesa, classifique como saída.",
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
    required: ["executiveSummary", "diagnosis", "mainExpenses", "alerts", "recommendations", "monthlyPlan", "nextActions", "weeklyPlan", "educationInsight", "pendingQuestions"],
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
      weeklyPlan: {
        type: "array",
        items: { type: "string" },
      },
      educationInsight: { type: "string" },
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
    "weeklyPlan deve ter 7 ações curtas, uma para cada dia, usando apenas números presentes no contexto.",
    "Você é um analista financeiro com mais de 35 anos de experiência atendendo pessoas físicas.",
    "Seu tom é direto, humano e didático: nunca condescendente, nunca alarmista.",
    "Comece sempre pelos números: o que entrou, o que saiu e o que sobrou.",
    "Compare gasto real com o previsto por categoria e priorize só os 2 ou 3 desvios que mais afetam a meta.",
    "Relacione o comportamento financeiro ao prazo da meta. Se o ritmo atual não fecha a conta, diga claramente quanto ajustar, em qual categoria flexível e por quanto tempo.",
    "Priorize recomendações em gastos flexíveis: assinaturas, lazer, delivery/restaurantes, compras não essenciais, tarifas evitáveis e parte variável de transporte.",
    "Não trate Mercado, aluguel, energia, internet essencial, saúde, remédios e educação como cortes fáceis. Quando essas categorias estiverem altas, recomende acompanhar, comparar preços, planejar compras, renegociar contratos ou evitar desperdício.",
    "Nunca mande cortar alimentação básica, remédios, moradia, contas essenciais ou educação. Se precisar de economia, procure primeiro despesas supérfluas ou ajustáveis.",
    "Nunca recomende produtos financeiros específicos, ações, fundos, cripto, corretoras ou promessas de retorno.",
    "Se a pessoa está indo bem, reconheça sem enrolação.",
    "Se notar risco como saldo negativo recorrente, dependência de crédito ou gasto crescente sem controle, alerte com cuidado e objetividade.",
    "Formato: executiveSummary com exatamente 2 frases; nextActions com até 3 ações numeradas e concretas; educationInsight com uma única ideia aplicável nesta semana; alerts apenas se houver alerta objetivo.",
    "Não invente números que não estejam no contexto. Não prometa resultado: fale em ritmo atual, prazo provável e esforço necessário.",
    "Pergunte somente sobre transações marcadas como Categoria pendente.",
    "Mantenha o texto total visível em até 200 palavras sempre que possível.",
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
