# Documentacao do FinTrack AI

## 1. Visao Geral

O FinTrack AI e um aplicativo web local de educacao financeira e gestao de gastos. Ele foi desenvolvido para apresentacao academica/TCC e demonstra cadastro de transacoes, importacao de extratos, categorizacao, metas, dashboard, graficos, auditoria, LGPD e analise com IA.

A versao atual nao usa dados ficticios para preencher telas. O sistema inicia limpo e so exibe informacoes financeiras depois que o usuario cadastra ou importa seus proprios dados.

## 2. Fluxo Principal

1. O usuario cria uma conta.
2. O usuario aceita o termo LGPD.
3. O usuario cadastra transacoes manualmente ou importa CSV, Excel ou PDF.
4. O sistema mostra uma previa da importacao.
5. O usuario confirma quais transacoes serao salvas.
6. O dashboard calcula KPIs, graficos, categorias e alertas.
7. O usuario cria uma meta financeira.
8. O usuario registra aportes mensais na meta e acompanha o historico.
9. A aba de IA gera uma analise local ou chama a OpenAI, quando configurada.
10. O usuario exporta relatorios em CSV, JSON ou formato pronto para salvar como PDF.

## 3. Telas

### Home

- Logo FinTrack AI.
- Titulo principal.
- Subtitulo curto.
- Botoes Criar conta e Entrar.
- Card de login/cadastro.
- Beneficios resumidos: painel claro, analise com IA e privacidade.

### Dashboard

Mostra os 4 KPIs principais:

- Saldo disponivel.
- Gastos do mes.
- Guardado para metas.
- Progresso da meta principal.

Se nao houver dados, exibe estado vazio com chamada para importar extrato, cadastrar transacao ou criar meta.

### Lancamentos

- Cadastro manual de transacoes.
- Importacao de CSV, XLSX, XLS e PDF.
- Mapeamento manual de colunas.
- Inferencia de entrada/saida com base em sinal, coluna de tipo, descricao e categoria.
- Previa antes de salvar.
- Deteccao de duplicadas.
- Tabela de transacoes salvas.

### Categorias

- Categorias financeiras.
- Limite mensal definido pelo usuario.
- Gasto atual.
- Status dentro do limite, atencao ou acima.
- Alerta visual com icone quando o limite e ultrapassado.

### Metas

Cada meta possui:

- nome;
- objetivo;
- valor total;
- valor ja guardado;
- valor restante;
- prazo;
- guardar por mes;
- aporte ideal atualizado conforme os meses restantes;
- valor esperado hoje;
- diferenca entre guardado real e plano;
- modo leve, equilibrado ou agressivo;
- historico de aportes agrupado por mes;
- exclusao de aporte especifico;
- previsao de conclusao;
- status e mensagem motivacional.

### Relatorios

- Graficos de categorias, fluxo, evolucao mensal, meta, recomendacoes e ranking.
- Exportacao CSV dos lancamentos.
- Relatorio PDF por impressao do navegador, com KPIs, analise, meta principal, categorias e ultimos lancamentos.

### Analise com IA

A analise considera:

- renda;
- gastos reais;
- categorias;
- limites;
- meta;
- prazo;
- alertas;
- oportunidades de economia.

Sem `OPENAI_API_KEY` e `OPENAI_MODEL`, o app usa analise local. Com OpenAI configurada, a chamada e feita somente ao clicar em "Analisar gastos".

### Configuracoes

- Direitos do titular.
- Baixar dados em JSON.
- Minha atividade com logs de auditoria.
- Revogar consentimento e limpar dados financeiros.
- Excluir conta.

## 4. Importacao de Arquivos

Formatos aceitos:

- `.csv`;
- `.xlsx`;
- `.xls`;
- `.pdf` como alternativa secundaria.

Colunas reconhecidas:

- Data;
- Descricao;
- Valor;
- Categoria;
- Tipo;
- Forma de pagamento;
- Banco ou origem.

Quando os nomes das colunas nao sao reconhecidos, o usuario escolhe manualmente o mapeamento antes de gerar a previa.

## 5. Categorizacao

O sistema tenta categorizar automaticamente pela descricao:

- Spotify, Netflix, Disney, HBO Max: Assinaturas.
- Uber, 99, combustivel, onibus: Transporte.
- iFood, restaurante, padaria: Alimentacao.
- Mercado, Atacadao, Carrefour, Assai: Mercado.
- Farmacia, drogaria: Saude.
- Pix recebido, salario, transferencia recebida: Receita.
- Luz, agua, internet, celular: Contas fixas.

Quando a confianca e baixa, a categoria fica como "Categoria pendente" e o usuario corrige apenas esses casos.

Quando o usuario corrige uma categoria, a regra fica salva para futuras transacoes semelhantes.

## 6. IA e Cache

O cache da IA usa um hash mensal com:

- ID do usuario;
- mes/ano;
- quantidade de transacoes;
- soma de entradas;
- soma de saidas;
- ultima data de transacao;
- ultima alteracao;
- principais categorias e valores;
- dados da meta;
- modelo OpenAI configurado.

Se qualquer dado relevante mudar, o hash muda e uma nova analise pode ser gerada. Se nada mudar, o app reutiliza o cache para reduzir custo e melhorar desempenho.

## 7. LGPD

O app implementa:

- consentimento antes do cadastro;
- minimizacao de dados;
- visualizacao e correcao de dados;
- exportacao JSON;
- exclusao de conta;
- revogacao de consentimento sem excluir a conta;
- logs de auditoria visiveis ao usuario.

Ao revogar o consentimento, o sistema remove:

- transacoes;
- metas;
- regras aprendidas;
- aportes de metas;
- cache de IA;
- historico de uso diario da IA.

A conta permanece cadastrada, mas o painel financeiro fica bloqueado ate novo aceite.

## 8. Seguranca

- Senhas com bcrypt.
- Cookie de sessao `HttpOnly` e `SameSite=Strict`.
- Banco SQLite local.
- Chave da OpenAI somente em variavel de ambiente.
- Frontend nunca recebe `OPENAI_API_KEY`.
- Arquivos importados sao processados em memoria e descartados.

## 9. Como Rodar

No Windows, a forma mais simples e abrir:

```text
Ligar FinTrack AI.bat
```

Ou pelo terminal:

```bash
npm install
npm start
```

Acesse:

```text
http://localhost:3000
```

## 10. Variaveis de Ambiente

```text
OPENAI_API_KEY=sua_chave_aqui
OPENAI_MODEL=coloque_aqui_um_modelo_real_disponivel_na_sua_conta
OPENAI_DAILY_LIMIT=10
```

Se `OPENAI_MODEL` nao estiver configurado, o backend avisa no terminal.

## 11. Apresentacao Sugerida

1. Mostrar home e cadastro LGPD.
2. Entrar no app com painel vazio.
3. Importar um CSV/Excel preparado para a apresentacao.
4. Confirmar a previa.
5. Mostrar dashboard, categorias e graficos.
6. Criar uma meta.
7. Registrar um aporte mensal e mostrar o historico da meta.
8. Executar analise com IA/local.
9. Gerar relatorio CSV ou PDF.
10. Mostrar logs em Minha atividade.
11. Demonstrar revogacao de consentimento.

## 12. Atualizacoes desta versao

### Importacao guiada

- Tela passo a passo: arquivo, mapeamento, previa, correcao e confirmacao.
- Links para arquivos de exemplo em `public/examples/extrato-exemplo.csv` e `public/examples/extrato-exemplo.xlsx`.
- Testes com fixtures de planilha generica, Nubank e Inter.
- A previa separa entradas, saidas, duplicadas, erros e categorias pendentes antes de salvar.
- A importacao considera tipo, debito, credito, sinal do valor e descricao para evitar que gastos positivos virem entrada.

### Lancamentos

- Campo de observacao por lancamento.
- Busca tambem considera a observacao.
- Selecao multipla para excluir lancamentos ou aplicar categoria em massa.
- Toda alteracao invalida o cache da IA para manter a analise atualizada.

### Dashboard

- KPIs clicaveis para abrir Lancamentos ou Metas.
- Gasto medio por dia.
- Previsao de fechamento do mes.
- Card de maior risco do mes.
- Card de melhor evolucao em comparacao com o mes anterior.

### Metas

- Varias metas ativas.
- Meta principal selecionavel.
- Aportes podem ser criados, editados e excluidos.
- Cada aporte atualiza tambem o lancamento automatico de categoria `Metas`.
- Historico de mudancas registra criacao, edicao, exclusao, meta principal e aportes.

### IA e transparencia

- Seletor entre analise local e OpenAI antes de analisar.
- Botao para reanalisar lancamentos pendentes.
- Indicador visual de uso diario da OpenAI.
- Resumo dos dados enviados para a IA, sem arquivo bruto e sem dados desnecessarios.
- Historico de analises geradas.
- Uma analise pode ser marcada como oficial do mes.

### Relatorios

- PDF por impressao com capa, KPIs e graficos em HTML baseados nos dados reais.
- Comparacao mensal visual lado a lado.
- Fechamento mensal com guia de etapas.

### LGPD e auditoria

- Exportacao JSON inclui historico de metas e historico de analises.
- Revogacao de consentimento limpa transacoes, metas, regras, historico de IA e fechamentos mensais.
- Minha atividade mostra novas acoes como edicao em massa, aporte editado, meta principal e analise oficial.
