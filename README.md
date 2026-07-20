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
- Assistente de importacao com resumo de entradas, saidas, duplicadas e categorias pendentes.
- Correcao em lote na importacao para aplicar categoria apenas nas pendentes ou nas selecionadas.
- Inferencia reforcada de entrada/saida na importacao para evitar gastos positivos quando a planilha vem sem sinal negativo.
- Deteccao de transacoes duplicadas antes da importacao.
- Regras aprendidas visiveis em Configuracoes, com criacao e exclusao de padroes como "spotify -> Assinaturas".
- Categorias com limites, status e alerta visual quando o orcamento e ultrapassado.
- Graficos com Chart.js e estados vazios quando nao ha dados suficientes.
- Donut de gastos por categoria com tooltip exibindo categoria, valor e percentual.
- Metas financeiras com linha do tempo, meses restantes, esperado hoje, diferenca do plano e modos leve, equilibrado e agressivo.
- Historico de aportes por meta, com agrupamento mensal e exclusao de aporte especifico.
- Analise com IA/local com diagnostico, principais gastos, alertas, oportunidades de economia, plano da meta, plano de 7 dias e proximas acoes.
- Comparacao mensal automatica, mostrando evolucao entre o mes atual e o anterior.
- Fechamento mensal, salvando um retrato do periodo sem apagar dados.
- Deteccao de transacoes recorrentes como assinaturas e contas fixas.
- Pontuacao financeira interna de 0 a 100 para acompanhar saude financeira.
- Cache de analise da IA por hash mensal, reduzindo chamadas repetidas quando os dados nao mudam.
- Botao para usar analise salva/cache e botao separado para gerar nova analise OpenAI.
- Status da OpenAI, mostrando se a IA esta ativa, local, em cache e quantas requisicoes restam no dia.
- Minha atividade em Configuracoes, mostrando logs de auditoria do usuario.
- Revogacao de consentimento LGPD com limpeza dos dados financeiros sem excluir a conta.
- Exportacao dos dados do titular em JSON.
- Exportacao de relatorio CSV e relatorio pronto para imprimir/salvar como PDF pelo navegador.
- Modo apresentacao para banca, com dados reais quando existirem ou dados demonstrativos opcionais sem gravar no banco.
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
OPENAI_MODEL=coloque_aqui_um_modelo_disponivel_na_sua_conta
OPENAI_DAILY_LIMIT=10
```

Para usar a analise com IA, configure sua chave da OpenAI e um modelo real disponivel na sua conta. A chave fica apenas no backend e nunca e enviada ao frontend. Sem chave/modelo, o app continua funcionando com analise local.

Se `OPENAI_API_KEY` existir mas `OPENAI_MODEL` estiver vazio, o backend mostra no terminal:

```text
OPENAI_MODEL nao configurado no .env.
```

Use o limite diario (`OPENAI_DAILY_LIMIT`) para proteger custo durante testes e apresentacao do TCC.

## Como Rodar

Opcao simples no Windows:

1. Abra a pasta do projeto.
2. Dê dois cliques em `Ligar FinTrack AI.bat`.
3. Acesse `http://localhost:3000`.

Opcao pelo terminal:

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
4. Se houver pendencias, use a correcao em lote para classificar apenas o que precisa.
5. Cadastre uma meta financeira.
6. Abra o Dashboard para ver KPIs, recorrencias, score e graficos.
7. Abra Analise com IA, escolha "Analise local" ou "OpenAI" e clique em "Analisar".
8. Registre um aporte na meta, edite o aporte e veja o historico mensal na aba Metas.
9. Abra Relatorios, feche o mes, veja a comparacao mensal e gere CSV, PDF ou modo apresentacao.
10. Abra Configuracoes para ver "Minha atividade", regras aprendidas e status da IA.
11. Teste a revogacao de consentimento para demonstrar limpeza dos dados financeiros.

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

Arquivos prontos para teste ficam em:

- `public/examples/extrato-exemplo.csv`
- `public/examples/extrato-exemplo.xlsx`

## Novidades Desta Versao

- Fluxo de importacao em etapas com arquivo, mapeamento, previa, correcao e confirmacao.
- Selecao multipla para excluir lancamentos ou aplicar categoria em massa.
- Campo de observacao por lancamento.
- Dashboard com gasto medio por dia, previsao de fechamento, maior risco e melhor evolucao.
- Meta principal selecionavel e aportes editaveis.
- Historico de mudancas nas metas.
- Seletor entre analise local e OpenAI.
- Historico de analises e opcao de marcar analise oficial do mes.
- Resumo dos dados enviados para a OpenAI.
- Relatorio PDF com capa e graficos baseados nos dados reais.

## Scripts

```bash
npm start
npm test
```

`npm test` valida os principais arquivos do projeto.

## Observacao de Producao

Este projeto e uma base educacional/local. Para producao, use HTTPS real, proxy reverso, backups, monitoramento, controle de acesso ao host do banco, politica de retencao de dados, revisao juridica da LGPD e testes de seguranca.
