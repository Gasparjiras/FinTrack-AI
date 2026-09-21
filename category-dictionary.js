// Vocabulário inicial para descrições de extratos brasileiros.
// As fontes orientam a taxonomia; os termos foram adaptados e testados no FinTrack AI.
// Referências: Visa Merchant Data Standards (MCC), Open Finance Brasil e casos simulados do TGI.
const DICTIONARY_REFERENCES = Object.freeze({
  visaMcc: {
    title: "Visa Merchant Data Standards Manual",
    url: "https://bd.visa.com/content/dam/VCOM/download/merchants/visa-merchant-data-standards-manual.pdf",
    use: "Referência para grupos de atividade comercial; não fornece as palavras de extratos usadas abaixo.",
  },
  openFinanceBrasil: {
    title: "API Accounts do Open Finance Brasil",
    url: "https://github.com/OpenBanking-Brasil/all-services-repo/blob/main/api_accounts_-_open_finance_brasil/2.5.0.yaml",
    use: "Referência para tipos de movimentação; não fornece categorias pessoais de consumo.",
  },
  finTrackTests: {
    title: "Casos simulados e regras revisadas do FinTrack AI",
    path: "tests/import-parser.test.js",
    use: "Validação local do vocabulário adaptado a descrições brasileiras.",
  },
});
const CATEGORY_DICTIONARY = [
  {
    category: "Assinaturas",
    terms: ["spotify", "netflix", "hbo max", "hbomax", "disney plus", "disney", "prime video", "amazon prime", "globoplay", "deezer", "youtube premium", "apple music", "paramount", "crunchyroll", "assinatura", "mensalidade app"],
    origin: ["Visa MCC: serviços digitais", "Casos simulados do TGI"],
    falsePositiveNotes: ["Mensalidade também pode representar escola, faculdade ou plano de saúde; por isso somente 'mensalidade app' é genérica aqui."],
  },
  {
    category: "Saúde",
    terms: ["saude", "farmacia", "drogaria", "drogasil", "droga raia", "droga", "remedio", "medicamento", "pague menos", "hospital", "clinica", "laboratorio", "consulta", "medico", "dentista", "odontologia", "plano de saude", "posto de saude", "ubs", "upa", "pronto socorro", "exame", "fisioterapia", "psicologo", "terapia", "vacinacao", "unimed", "amil", "hapvida", "intermedica"],
    exclude: ["clinica veterinaria", "hospital veterinario", "consulta juridica", "consulta de credito"],
    origin: ["Visa MCC: Health Care e Drug Store", "Vocabulário brasileiro revisado para o TGI"],
    falsePositiveNotes: ["'Consulta' pode ser jurídica ou de crédito.", "'Clínica' e 'hospital' podem ser veterinários.", "'Droga' só corresponde como palavra completa."],
  },
  {
    category: "Transporte",
    terms: ["uber", "99app", "99", "taxi", "corrida", "locomocao", "moto", "combustivel", "gasolina", "posto", "shell", "ipiranga", "petrobras", "metro", "onibus", "estacionamento", "sem parar", "pedagio", "ipva", "licenciamento", "seguro da moto", "seguro moto", "seguro auto", "oficina", "mecanica", "borracharia"],
    exclude: ["posto de saude"],
    origin: ["Visa MCC: transporte, combustível e serviços automotivos", "Casos simulados do TGI"],
    falsePositiveNotes: ["'Posto' pode significar posto de saúde; essa expressão é tratada antes como Saúde."],
  },
  {
    category: "Alimentação",
    terms: ["ifood", "rappi", "restaurante", "lanchonete", "mcdonald", "arcos dourados", "burger king", "padaria", "cafeteria", "delivery", "pizzaria", "churrascaria", "lanche", "pastelaria", "sorveteria", "sorvete", "acai", "comida", "doce", "chocolate", "cafe", "pao"],
    origin: ["Visa MCC: Dining e Coffee Stores", "Estabelecimentos comuns em descrições brasileiras"],
    falsePositiveNotes: ["Nomes comerciais podem conter termos de alimentos sem representar uma refeição; a revisão manual continua disponível."],
  },
  {
    category: "Compras",
    terms: ["mercado livre", "shopee", "magazine luiza", "magalu", "casas bahia", "renner", "riachuelo", "centauro", "lojas americanas", "amazon marketplace", "amazon", "shein", "temu", "aliexpress", "shopping", "shopp", "loja", "eletronico", "roupa", "presente", "beleza", "tenis", "monitor", "brinquedo"],
    origin: ["Visa MCC: General Retail e Electronic Stores", "Varejistas frequentes no Brasil"],
    falsePositiveNotes: ["'Mercado Livre' precisa ter prioridade sobre a palavra genérica 'mercado'.", "'Loja' é ampla e pode exigir correção do usuário."],
  },
  {
    category: "Mercado",
    terms: ["supermercado", "mercado", "pao de acucar", "atacadao", "carrefour", "assai", "extra", "hortifruti", "sams club", "dia brasil", "mercearia", "sacolao", "atacado", "mini mercado"],
    exclude: ["mercado livre"],
    origin: ["Visa MCC: Supermarket", "Redes e termos brasileiros"],
    falsePositiveNotes: ["'Mercado Livre' representa compras gerais e é excluído desta categoria."],
  },
  {
    category: "Lazer",
    terms: ["cinema", "cinemark", "ingresso", "steam", "playstation", "xbox", "parque", "teatro", "show", "bar", "boliche", "festa", "evento", "hotel", "viagem"],
    origin: ["Visa MCC: Entertainment e Travel", "Casos simulados do TGI"],
    falsePositiveNotes: ["'Bar', 'show' e 'evento' podem fazer parte de nomes comerciais de outro ramo."],
  },
  {
    category: "Contas fixas",
    terms: ["aluguel", "condominio", "energia", "enel", "cemig", "light", "sabesp", "saneamento", "conta de agua", "agua", "internet", "vivo fibra", "claro net", "claro", "tim", "oi", "telefone", "celular", "plano celular"],
    exclude: ["compra celular", "loja celular"],
    origin: ["Open Finance Brasil: pagamentos e boletos", "Prestadores brasileiros de serviços recorrentes"],
    falsePositiveNotes: ["'Celular' pode indicar tanto a conta telefônica quanto a compra do aparelho."],
  },
  {
    category: "Educação",
    terms: ["curso", "udemy", "alura", "escola", "faculdade", "universidade", "livraria", "livro", "mensalidade escolar", "ead", "anhanguera", "unopar", "cruzeiro do sul", "estacio", "educacao", "estudo", "api tgi"],
    origin: ["Visa MCC: educação", "Instituições e termos brasileiros"],
    falsePositiveNotes: ["Livros e cursos podem também ser comprados para lazer ou trabalho."],
  },
  {
    category: "Receita",
    terms: ["salario", "credito recebido", "estorno", "reembolso", "rendimento", "provento", "freelance", "vr", "vt"],
    origin: ["Open Finance Brasil: folha de pagamento, créditos e rendimentos"],
    falsePositiveNotes: ["Estorno e reembolso são entradas, mas não representam renda nova."],
  },
  {
    category: "Outros",
    terms: ["tarifa", "juros", "multa", "imposto", "iof"],
    origin: ["Open Finance Brasil: tarifas e encargos"],
    falsePositiveNotes: ["Alguns impostos ou juros podem ser associados a uma compra específica, que não aparece na descrição."],
  },
];

function normalizeCategoryText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(text, term) {
  const normalizedTerm = normalizeCategoryText(term);
  return (` ${text} `).includes(` ${normalizedTerm} `);
}

function categorizeFromDictionary(description) {
  const text = normalizeCategoryText(description);
  for (const entry of CATEGORY_DICTIONARY) {
    if ((entry.exclude || []).some(term => containsTerm(text, term))) continue;
    const matchedTerm = entry.terms.find(term => containsTerm(text, term));
    if (matchedTerm) return { category: entry.category, matchedTerm, origin: entry.origin };
  }
  return null;
}

module.exports = { CATEGORY_DICTIONARY, DICTIONARY_REFERENCES, categorizeFromDictionary, normalizeCategoryText };
