# Escopo e regras do FinTrack AI

## Relação com a proposta do TGI

O protótipo concentra o desenvolvimento nos componentes do short paper: cadastro de transações, classificação textual, análise de padrões, sinalização de gastos atípicos e recomendações personalizadas por objetivo. As regras locais são heurísticas sobre texto; a integração com modelo de linguagem complementa as explicações da análise, sem receber descrições de lançamentos. Reaproveitar uma correção salva não equivale a treinar um modelo supervisionado.

## Telas

| Tela | Responsabilidade |
| --- | --- |
| Visão geral | Entradas, despesas, resultado do período, gráfico, resumo da meta e pendências |
| Lançamentos | Importação, prévia editável, cadastro manual, edição, exclusão e busca |
| Categorias | Categorias padrão e personalizadas; pesquisa, filtro, edição e exclusão de regras aprendidas na conta |
| Minha meta | Uma escolha ativa com valores personalizados e acompanhamento |
| Análise e recomendações | Resumo, padrões, alertas e até três ações para a meta |
| Configurações | Conta, informações sobre IA, exportação e consentimento |

Foram retirados do fluxo: PDF, múltiplas metas simultâneas, histórico de aportes, modos de intensidade, orçamento independente, pontuação financeira, fechamento mensal, análise oficial e plano obrigatório de sete dias. O banco conserva os dados antigos para compatibilidade e exportação.

A última análise gerada para cada mês é persistida em `ai_analysis_history` e restaurada após um novo login. Cada registro guarda o resultado, período, origem, modelo, data, meta considerada e a impressão digital dos dados usados. Uma mudança em lançamentos, meta, parcelas ou modelo não apaga o resultado anterior: a interface o identifica como desatualizado e solicita nova geração.

## Entrada e qualidade dos dados

Data, descrição, valor e categoria são obrigatórios para persistência; Categoria pendente é aceita para permitir revisão posterior. A análise de indicadores continua disponível, mas as recomendações aguardam a revisão das categorias do período.

A prévia permite corrigir os campos antes de salvar. Depois de importar, o usuário continua podendo editar ou adicionar lançamentos. A categoria Transferência própria exclui a operação dos totais financeiros; isso evita contar movimentações entre contas como renda ou consumo. O sistema não integra contas bancárias nem transfere dinheiro.

Na prévia, o usuário pode dividir qualquer lançamento em duas ou mais partes. Cada parte recebe descrição, valor e categoria próprios; todas mantêm a data e o sentido do original, com valor diferente de zero. A soma pode divergir do original quando o usuário opta por não contabilizar uma parte; a interface mostra a diferença para conferência. O servidor valida o grupo e registra um identificador derivado do lançamento original para reconhecer reimportações sem duplicar a despesa.

Ao alterar a descrição na prévia, o cliente consulta o classificador local com as regras já persistidas e atualiza a categoria sugerida, desde que o usuário não tenha escolhido uma categoria manualmente. A confirmação recalcula essa sugestão no servidor para evitar salvar uma resposta antiga. Somente a categoria escolhida manualmente cria uma regra nova após a confirmação; sugestões automáticas não são reaprendidas.

Na prévia de importação, uma regra local procura pares de entrada e saída com diferença de até R$ 1,00 e intervalo de zero ou um dia, sempre com a saída depois da entrada. Cada entrada participa de no máximo um par. A interface apresenta o resultado como **Possível repasse** para conferência antes de salvar; nenhuma categoria, total ou recomendação é alterada apenas por essa coincidência. Um pagamento compartilhado pode conter uma parte de despesa própria, por isso a revisão humana é necessária.

A lista permite selecionar lançamentos individualmente, por página ou até 250 resultados de todo o período/filtro atual, mesmo quando distribuídos em várias páginas. Se houver mais de 250, seleciona os primeiros pela ordenação exibida e informa que os restantes não foram incluídos. A seleção é preservada ao paginar e limpa quando busca, filtro, período ou dados são atualizados. A API limita a operação a 250 IDs, valida toda a lista antes de excluir e restringe a exclusão aos registros do usuário autenticado.

Categorias personalizadas são usadas na classificação local e aparecem nos totais da análise. As categorias padrão são fixas para preservar o vocabulário das regras. Ao renomear uma categoria personalizada, o servidor atualiza os registros e as referências. Ao excluir, os registros vão para Outros e as regras associadas são removidas.

As regras padrão ficam centralizadas em `category-dictionary.js`. Cada categoria registra termos normalizados, fontes usadas para orientar a taxonomia e ambiguidades que podem provocar falsos positivos. Visa MCC e Open Finance Brasil são referências conceituais; o vocabulário de descrições brasileiras é uma adaptação do projeto validada por testes. Exceções explícitas distinguem, por exemplo, Mercado Livre de mercado, posto de saúde de posto de combustível e consulta jurídica de consulta médica. Termos são comparados como palavras ou expressões completas, ignorando acentos e diferenças entre maiúsculas e minúsculas.

O indicador de confiança da classificação local é um critério operacional de revisão, não uma probabilidade estatisticamente validada. Por isso, a interface não exibe esse número como garantia de acerto.

## Metas

### Reduzir gastos em uma categoria

O usuário escolhe a categoria e um limite mensal. O sistema compara despesas registradas nessa categoria com o limite. Restante = limite menos gasto. Estar dentro do limite durante um mês parcial não significa que ele será cumprido até o fim do mês.

### Economizar por mês

O usuário informa um objetivo mensal. O sistema compara entradas menos despesas com esse valor. Se não houver entradas, não conclui a capacidade de economia. O resultado registrado não comprova que o dinheiro foi guardado.

### Juntar dinheiro para um objetivo

O usuário informa total desejado, valor guardado e data final. Falta = total menos guardado. A necessidade mensal estimada é a diferença dividida pelos meses de calendário restantes, incluindo o mês analisado e o mês do prazo. Atualizar o total guardado não cria despesas.

O mês atual e o mês anterior permitem gerar recomendações com a meta atual como referência, sem reconstruir o estado histórico dela. Meses mais antigos oferecem consulta histórica dos lançamentos e indicadores, sem aplicar a meta atual ou chamar a IA.

## Regras de análise

- Totais consideram somente o período escolhido e excluem Transferência própria e a categoria legada Metas.
- Um gasto pode ser sinalizado quando seu valor é pelo menos 1,8 vez a média anterior e pelo menos R$ 100. São necessárias três observações anteriores. A referência prioriza a mesma descrição; quando ela não existe, usa a categoria. O registro avaliado não entra na média.
- Aumento mensal: despesa da categoria maior que 130% do mês anterior e diferença mínima de R$ 50. O aviso pede comparação de períodos completos.
- Frequência: pelo menos o dobro da quantidade de registros da categoria no mês anterior, com ao menos três registros na referência.
- Repetições da mesma descrição são apresentadas como padrões, sem serem automaticamente tratadas como anomalias.
- A interface mostra até seis alertas. Ausência de alerta não garante ausência de comportamento atípico.
- Categorias abrangentes e poucos registros podem gerar falsos positivos ou ocultar mudanças. Os limiares são heurísticos e precisam ser avaliados no TGI.

## Recomendações

O sistema calcula os indicadores e fornece recomendações locais. Opcionalmente, a API recebe esses indicadores para produzir um resumo e até três ações educativas, respeitando a meta e as limitações. O modelo não calcula saldo bancário, não executa transações e não deve inventar números ou recomendar produtos financeiros.

## Arquitetura

- `server.js`: servidor HTTP, autenticação, SQLite, importação, categorias e integração das rotas.
- `finance-core.js`: cálculos e regras de análise sem banco ou chamadas externas.
- `category-dictionary.js`: dicionário brasileiro controlado e documentação de ambiguidades da classificação local.
- `ai-service.js`: schemas e solicitações ao provedor de IA.
- `public/index.html`, `public/app.js`, `public/styles.css`: interface e interação.
- `tests/`: regressões de importação, regras financeiras e integração da API.

O banco pode ser isolado por `FINTRACK_DATA_DIR`, usado nos testes. A aplicação padrão mantém `data/app.db`. O limite diário abrange somente análises externas, com cache vinculado a dados e modelo.

O arquivo `.env` com a chave da OpenAI e o diretório `data/` com contas e lançamentos são ignorados pelo Git. Apenas `.env.example`, sem chave real, pertence ao repositório. A navegação guarda a seção aberta no endereço para mantê-la após atualizar a página.

O protótipo é executado localmente. O banco SQLite fica no computador que executa a aplicação e utiliza exclusão segura. Uma cópia diária é mantida em `data/backups` por até sete dias. Cópias vencidas são removidas na inicialização; revogar o consentimento ou excluir uma conta apaga as cópias locais e trunca o log de escrita para evitar que dados removidos continuem nessas estruturas.

O termo de uso dos dados é imutável por versão. A versão `1.1` acrescenta registros técnicos de segurança, localização do armazenamento, retenção das cópias, efeitos distintos de revogação e exclusão e o processamento opcional pela OpenAI. Usuários de versões anteriores precisam aceitar o termo vigente para continuar usando os recursos financeiros. A interface informa que exportações JSON contêm dados pessoais e financeiros.

## Validação acadêmica a realizar

Os testes automatizados implementados verificam comportamento esperado, inclusive integração com um provedor simulado. Isso não substitui a avaliação quantitativa proposta no paper.

Para essa avaliação:

1. Montar uma base simulada rotulada, com descrições claras, abreviadas, variações de comerciantes e descrições ambíguas.
2. Separar exemplos usados para construir regras dos exemplos usados para avaliá-las.
3. Medir acertos sobre todas as transações e sobre as classificadas automaticamente, além da taxa encaminhada à revisão. Pendência deve ser contabilizada, não escondida como acerto.
4. Criar históricos com alterações de valor e frequência previamente marcadas. Medir alertas corretos, falsos positivos e eventos não detectados; calcular precisão e revocação.
5. Medir separadamente a qualidade das recomendações geradas com indicadores agregados, registrando modelo, data e limitações de repetibilidade.
6. Verificar se as recomendações usam os dados corretos, respeitam a meta e reconhecem informações ausentes.

Os três cenários sintéticos de anomalia em `tests/finance-core.test.js` são regressões mínimas. Seu resultado não deve ser apresentado como desempenho geral do protótipo.
