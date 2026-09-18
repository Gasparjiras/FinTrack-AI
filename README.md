# FinTrack AI

Protótipo web de educação financeira para TGI: classificação de lançamentos, identificação de padrões e gastos atípicos, e recomendações relacionadas à meta escolhida pelo usuário.

## Fluxo

1. Criar conta ou entrar na demonstração com dados simulados.
2. Importar CSV, XLSX ou XLS, ou cadastrar lançamentos manualmente.
3. Conferir descrição, data, valor, direção e categoria na prévia.
4. Resolver categorias pendentes na tela Lançamentos. É possível criar categorias personalizadas.
5. Escolher uma meta: reduzir gastos em uma categoria, economizar por mês ou juntar dinheiro para um objetivo.
6. Gerar análise com resumo, padrões, pontos de atenção e até três recomendações.

O menu tem cinco telas principais: **Visão geral**, **Lançamentos**, **Categorias**, **Minha meta** e **Análise e recomendações**. Configurações reúne conta, consentimento e exportação. A seção aberta aparece no endereço; atualizar a página mantém a mesma seção.

## Executar

Requer Node.js com `node:sqlite` (testado com Node 24).

```sh
npm install
npm start
```

Abra [o aplicativo local](http://localhost:3000). O arquivo `Abrir FinTrack AI.bat` também inicia o servidor. Se houver um processo antigo usando a porta 3000, encerre esse servidor antes de iniciar a versão atualizada.

Se esquecer a senha, encerre o servidor local e abra `Redefinir Senha FinTrack.bat`. Informe o e-mail da conta e a nova senha. O utilitário roda localmente e altera somente o hash armazenado em `data/app.db`.

As contas comuns começam vazias. **Abrir demonstração** restaura uma conta separada com transações simuladas de dois meses e uma meta mensal. Alterações feitas na demonstração são restauradas no próximo acesso.

## Importação e categorias

- Formatos: CSV, XLSX e XLS. PDF não é aceito pela interface nem pelo servidor.
- Limite: 8 MB e 500 linhas por importação; divida arquivos maiores. A prévia informa linhas inválidas e linhas além do limite.
- Colunas essenciais: data, descrição e valor. Tipo e categoria são opcionais; débito e crédito podem vir em colunas separadas.
- A prévia permite editar os registros e selecionar quais importar. A classificação de lançamentos é local e não envia o extrato à IA.
- Em uma despesa da prévia ou no cadastro/edição manual, **Parcelas** permite informar a parcela atual, o total (até 36) e o valor mensal. A última parcela também pode ser marcada, como 2/2, sem criar novas previsões. O sistema cria previsões apenas para as parcelas restantes, separadas dos lançamentos realizados.
- Extratos podem ser importados fora da ordem dos meses. Se a parcela prevista encontrar uma única despesa já salva com o mesmo número de parcela, total, descrição, data próxima e valor semelhante, a conciliação é automática. Se não houver correspondência única, a Visão geral mostra a parcela pendente e permite vincular manualmente um lançamento salvo ou cancelar a previsão. A previsão vinculada sai dos compromissos futuros.
- Alterar uma descrição na prévia consulta novamente as regras locais já existentes. Uma categoria escolhida manualmente é mantida; uma nova regra só é aprendida após confirmar a importação.
- Qualquer lançamento da prévia pode ser dividido em duas ou mais partes, cada uma com descrição, valor e categoria próprios. A prévia mostra o valor original, a soma e a diferença; a soma pode ser diferente quando o usuário decide não contabilizar uma parte. Todas as partes devem manter a data e o sentido do original e ter valor diferente de zero. A origem da divisão é registrada para evitar duplicação ao importar o mesmo extrato novamente.
- Possíveis duplicados são detectados por data, descrição normalizada e valor, antes de salvar e novamente na confirmação. Duas operações legítimas idênticas podem exigir diferenciação da descrição.
- Categorias padrão são fixas. Categorias personalizadas podem ser criadas, renomeadas e excluídas.
- Renomear uma categoria atualiza lançamentos, regras salvas e a meta vinculada. Excluir move seus lançamentos para Outros; uma categoria utilizada pela meta ativa precisa ser desvinculada antes.
- Descrições ambíguas, como “Pix Maria”, ficam pendentes. “Pix Restaurante Central” pode ser classificado pelo contexto.
- Correções de descrições identificáveis podem ser reutilizadas por regras. Pix e transferências genéricas não criam regras automáticas.
- Transferências entre contas próprias devem ser revisadas e identificadas como **Transferência própria**. Elas não entram nos totais de entradas e despesas.
- A prévia de importação sinaliza **Possível repasse** quando encontra uma entrada seguida de saída no mesmo dia ou no dia seguinte, com diferença de até R$ 1. O aviso ajuda a conferir o par antes de salvar, mas não altera categorias nem totais automaticamente.
- A tela **Categorias** reúne categorias padrão e personalizadas e as regras aprendidas nesta conta. As regras podem ser pesquisadas, filtradas por categoria, editadas ou excluídas; a lista tem paginação.
- Na lista de lançamentos, é possível selecionar registros individualmente, selecionar a página atual ou selecionar até 250 resultados do período/filtro de uma vez. Se houver mais de 250, somente os primeiros 250 exibidos pela ordenação atual são selecionados, com aviso. A seleção permanece entre páginas, mas é limpa ao mudar busca, filtro ou período; a confirmação informa a quantidade antes da exclusão.

Exemplos em `public/examples/extrato-exemplo.csv` e `public/examples/extrato-exemplo.xlsx`.

## Meta e análise

Há uma meta ativa por usuário. Salvar outra escolha atualiza a meta ativa. O valor guardado é informado pelo usuário e sua atualização não gera lançamento de despesa.

Totais, médias, limites e indicadores são calculados em `finance-core.js`, sem depender da IA. A análise indica limitações de histórico, falta de entradas e períodos incompletos. Resultado positivo não comprova dinheiro guardado nem saldo disponível em conta.

A Visão geral mostra as parcelas previstas para os próximos três meses a partir de hoje, separadas das despesas realizadas. Uma tabela separada, **Pagamentos para confirmar**, mostra previsões vencidas até o mês atual que ainda não foram vinculadas a lançamentos. A análise recente também apresenta as previsões; a IA opcional recebe apenas seus totais mensais agregados, sem descrições dos lançamentos.

O mês de referência aparece na Análise e fica sincronizado com o período de Lançamentos e da Visão geral. Ao entrar, o aplicativo seleciona o mês mais recente com registros. O mês atual e o mês anterior permitem gerar recomendações usando a meta atual como referência; o mês atual pode estar incompleto. Meses anteriores mostram uma consulta histórica com totais, categorias e comparação mensal, sem aplicar a meta atual, incluir previsões futuras no resultado ou chamar a IA.
Na Visão geral, as setas percorrem os meses entre o primeiro com lançamentos e o mês atual; o mês escolhido também atualiza Lançamentos e Análise.

Recomendações são liberadas após escolher uma meta e resolver as categorias pendentes do período. Alterar registros, categorias, meta ou período descarta as recomendações exibidas e exige nova geração.

## IA opcional

Copie `.env.example` para `.env` e configure a chave e o modelo disponível na sua conta:

```text
OPENAI_API_KEY=sua_chave
OPENAI_MODEL=seu_modelo
OPENAI_DAILY_LIMIT=10
```

Sem configuração, o protótipo usa regras locais para a análise. A interface identifica a origem das recomendações. Falhas da API mantêm a alternativa local.

A classificação de lançamentos usa palavras-chave e regras aprendidas com correções do usuário, sem chamada à API. Esse aprendizado reutiliza padrões corrigidos; não treina um modelo de machine learning.

A geração opcional de recomendações recebe totais, categorias, dados da meta, contagens e valores agregados de padrões e contagens de alertas. Descrições individuais, nomes de destinatários de Pix, senhas e arquivos brutos não são enviados. Totais financeiros ainda podem ser dados pessoais associados à conta. A validação automatizada dessa integração usa uma API simulada, sem consumir créditos.

## Dados existentes

O banco padrão permanece em `data/app.db`. A atualização acrescenta campos de categoria-alvo e prazo da meta sem apagar transações. Metas antigas continuam legíveis como objetivos de acumulação; a meta principal é usada no novo fluxo. Outras metas e históricos legados continuam disponíveis na exportação dos dados, sem ocupar a interface principal.

O arquivo `.env`, o diretório `data/` (incluindo contas e lançamentos) e `node_modules/` são locais e ignorados pelo Git. `.env.example` contém apenas campos de exemplo. Não copie chaves, senhas ou extratos reais para arquivos do repositório.

Antigos lançamentos na categoria Metas são preservados, mas excluídos dos totais de consumo. Campos e tabelas antigos são mantidos para compatibilidade; não há uma migração destrutiva.

## Verificar

```sh
npm test
```

Os testes cobrem parsing, cálculos, metas, categorias, importação, duplicatas, rejeição de PDF, IA simulada, cache e consentimento. Usam bancos temporários, sem alterar `data/app.db`.

Os cenários controlados são testes de regressão, não uma comprovação de acurácia em dados reais. O plano de avaliação acadêmica está em [DOCUMENTACAO_FINTRACK_AI.md](DOCUMENTACAO_FINTRACK_AI.md).
