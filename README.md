# FinTrack AI - Educacao Financeira com IA

Aplicativo web local para TCC/TGI com foco em organizacao financeira, importacao de extratos, categorizacao de gastos, metas, graficos, LGPD, auditoria e analise assistida por IA.

## Principio da Versao Atual

O sistema nao mostra dados ficticios para preencher a tela. O painel inicia limpo e so exibe valores quando o usuario:

- cadastra uma transacao manualmente;
- importa um arquivo CSV, Excel ou PDF;
- cria uma meta financeira;
- gera uma analise com base nos dados inseridos.

Quando nao ha dados, o app exibe estados vazios profissionais, como "Nenhuma transacao importada ainda" e "Crie sua primeira meta para acompanhar seu progresso".

## Funcionalidades

- Home com identidade FinTrack AI, login/cadastro e consentimento LGPD.
- Dashboard com 4 KPIs principais: saldo disponivel, gastos do mes, guardado para metas e progresso da meta.
- Cadastro manual de renda e gastos.
- Sugestao automatica de categoria com regras locais e regras aprendidas.
- Importacao de CSV, XLSX, XLS e PDF, com previa antes de salvar.
- Mapeamento manual de colunas quando o arquivo usa nomes diferentes.
- Deteccao de transacoes duplicadas antes da importacao.
- Categorias com limites, status e alerta visual quando o orcamento e ultrapassado.
- Graficos com Chart.js e estados vazios quando nao ha dados suficientes.
- Donut de gastos por categoria com tooltip exibindo categoria, valor e percentual.
- Metas financeiras com valor total, valor guardado, valor restante, percentual, previsao e modos leve, equilibrado e agressivo.
- Analise com IA/local com diagnostico, principais gastos, alertas, oportunidades de economia, plano da meta e proximas acoes.
- Cache de analise da IA por hash mensal, reduzindo chamadas repetidas quando os dados nao mudam.
- Minha atividade em Configuracoes, mostrando logs de auditoria do usuario.
- Revogacao de consentimento LGPD com limpeza dos dados financeiros sem excluir a conta.
- Exportacao dos dados do titular em JSON.
- Exclusao completa da conta mediante senha.

## Open Finance no TCC

O Open Finance real exige autorizacao e supervisao do Banco Central para integracao direta. Por isso, esta versao academica nao acessa bancos reais. A validacao do sistema e feita por cadastro manual e importacao de extratos fornecidos pelo proprio usuario.

Essa decisao permite demonstrar as funcionalidades principais sem coletar dados bancarios reais automaticamente: categorizacao, dashboard, metas, graficos, auditoria, consentimento e recomendacoes personalizadas.

## LGPD e Seguranca

- Consentimento obrigatorio antes do cadastro e antes de usar dados financeiros.
- Minimizacao de dados: nao solicita CPF, RG ou endereco.
- Dados financeiros salvos: descricao, valor, data, categoria, tipo, forma de pagamento, status e origem.
- Senhas com bcrypt (`bcryptjs`, custo 12).
- Sessao com cookie `HttpOnly` e `SameSite=Strict`.
- Banco SQLite local em `data/app.db`.
- Logs de auditoria visiveis na aba Configuracoes.
- Revogacao de consentimento limpa transacoes, metas, regras aprendidas e cache de IA.
- Suporte a HTTPS local quando houver certificado em `certs/localhost-cert.pem` e `certs/localhost-key.pem`.

## Variaveis de Ambiente

Crie `.env` a partir de `.env.example`:

```text
OPENAI_API_KEY=sua_chave_aqui
OPENAI_MODEL=gpt-5-nano
OPENAI_DAILY_LIMIT=10
```

Para usar a analise com IA, configure sua chave da OpenAI e um modelo disponivel na sua conta. `gpt-5-nano` e uma opcao leve para classificacao e analises curtas; voce pode trocar por outro modelo depois. A chave fica apenas no backend e nunca e enviada ao frontend.

Se `OPENAI_API_KEY` existir mas `OPENAI_MODEL` estiver vazio, o backend mostra no terminal:

```text
OPENAI_MODEL nao configurado no .env.
```

Sem chave/modelo, o app continua funcionando com analise local.

## Como Rodar

```bash
npm install
npm start
```

Acesse:

```text
http://localhost:3000
```

## Como Testar

1. Cadastre uma conta e aceite o termo LGPD.
2. Cadastre uma renda manualmente ou importe um CSV/Excel.
3. Confirme a previa da importacao antes de salvar.
4. Cadastre uma meta financeira.
5. Abra o Dashboard para ver KPIs e graficos.
6. Abra Analise com IA e clique em "Analisar gastos".
7. Abra Configuracoes para ver "Minha atividade".
8. Teste a revogacao de consentimento para demonstrar limpeza dos dados financeiros.

## Formato Recomendado para CSV/Excel

O arquivo pode ter colunas com estes significados:

- Data
- Descricao
- Valor
- Categoria
- Tipo: entrada ou saida
- Forma de pagamento
- Banco ou origem

Se os nomes forem diferentes, o app permite mapear as colunas manualmente antes de gerar a previa.

## Scripts

```bash
npm start
npm test
```

`npm test` valida os principais arquivos do projeto.

## Observacao de Producao

Este projeto e uma base educacional/local. Para producao, use HTTPS real, proxy reverso, backups, monitoramento, controle de acesso ao host do banco, politica de retencao de dados, revisao juridica da LGPD e testes de seguranca.
