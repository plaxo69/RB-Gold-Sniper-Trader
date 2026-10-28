# Auditoria comparativa — estratégia de 01/10/2026 vs motor atual

Data da auditoria: 2026-10-28  
Repositório: `plaxo69/RB-Gold-Sniper-Trader`  
Referência de 01/10: commit `ad822d4bdd3a6e7dd6dd8512014873176ba1a205`  
Branch de trabalho isolada: `TESTE-ESTRATEGIA-01-10-2026`

## Resumo executivo

O histórico guardado no GitHub foi encontrado em `main/historico-trades.json`: 260 trades, exportados em 14/10/2026 às 16:17 UTC. O histórico não está atualizado até 28/10, pelo que os números abaixo descrevem apenas os dados exportados até 14/10.

O sinal mais preocupante é a queda dos resultados após 1 de outubro. A 01/10, o histórico tem 32 WIN e 10 LOSS. De 02/10 a 14/10, tem 39 WIN, 101 LOSS e 33 BE. Excluindo BE, a taxa de WIN nesse período é 27,9% (39 em 140 resultados decididos). Isto confirma deterioração nos resultados registados, mas não prova que a causa seja apenas a estratégia: também podem existir diferenças de fonte, condições de mercado, execução e resolução de TP/SL.

## 1. Resultados do histórico encontrado

| Período | Trades registados | WIN | LOSS | BE | WIN entre resultados decididos |
|---|---:|---:|---:|---:|---:|
| Histórico completo (29/09–14/10) | 260 | 97 | 130 | 33 | 42,7% |
| 01/10 | 42 | 32 | 10 | 0 | 76,2% |
| 02/10–14/10 | 173 | 39 | 101 | 33 | 27,9% |
| Desde 01/10, inclusive | 215 | 71 | 111 | 33 | 39,0% |

A taxa de WIN exclui BE do denominador, para não tratar um break-even como vitória nem derrota.

### Resultados por fonte, desde 01/10

| Fonte gravada no histórico | Total | WIN | LOSS | BE | WIN entre resultados decididos |
|---|---:|---:|---:|---:|---:|
| IA | 81 | 21 | 38 | 22 | 35,6% |
| Candles reais fechados | 134 | 50 | 73 | 11 | 40,7% |

De 02/10 a 14/10, os 92 trades de “candles reais fechados” tiveram 18 WIN, 63 LOSS e 11 BE (22,2% de WIN nos resultados decididos). Os 81 trades da fonte IA tiveram 21 WIN, 38 LOSS e 22 BE (35,6%). A etiqueta de origem é a registada no JSON; não é, por si só, prova de que o motor que criou cada trade foi corretamente identificado.

### Dias com pior resultado registado

| Data | Trades | WIN | LOSS | BE | WIN entre resultados decididos |
|---|---:|---:|---:|---:|---:|
| 05/10 | 21 | 2 | 19 | 0 | 9,5% |
| 06/10 | 23 | 3 | 20 | 0 | 13,0% |
| 08/10 | 36 | 2 | 12 | 22 | 14,3% |
| 09/10 | 17 | 0 | 6 | 11 | 0,0% |
| 14/10 | 6 | 1 | 5 | 0 | 16,7% |

## 2. Diferenças confirmadas no código

| Regra | Motor de 01/10 | Motor mais recente antes da tentativa de reposição |
|---|---|---|
| Alinhamento de timeframes | Exige tendência alinhada em M5, M15 e H1 (3/3) | Exige alinhamento M1, M5 e M15; H1 é opcional |
| Médias móveis | Preço acima/abaixo da EMA200 | EMA200 mais alinhamento EMA9/EMA21 |
| RSI BUY | RSI > 60 e < 75 | RSI > 60 e < 75 |
| RSI SELL | RSI < 40 | RSI > 35 e < 40 |
| ADX | ADX disponível e > 22; caso contrário, bloqueia | Dados ADX ausentes podem passar |
| Volume | Volume e SMA20 têm de estar disponíveis e volume > SMA20 | Dados de volume ausentes podem passar |
| Corpo mínimo da vela | 0,18 × ATR | 0,10 × ATR |
| Posição de fecho da vela | Pelo menos 0,62 para BUY (regra equivalente para SELL) | 0,55 |
| Score de entrada | BUY ≥ 60; SELL ≤ 40 | BUY ≥ 55; SELL ≤ 45 |
| Risco em ATR | Sem os limites min/max explícitos da versão mais recente | Limites de risco 0,45 a 1,50 × ATR |
| Proteções de breakout/reteste | Não tinha as proteções atuais | Inclui limites para extensão de breakout e reteste |

## 3. Problemas de integridade dos dados encontrados

Dos 260 registos no ficheiro, faltam os seguintes campos em grande parte ou na totalidade:

- ADX(14): ausente em 235/260.
- Volume: ausente em 171/260.
- SMA20 do volume: ausente em 235/260.
- EMA9 e EMA21: ausentes em 260/260.
- Fotografia estruturada dos indicadores (`indicatorSnapshot`): ausente em 260/260.
- Versão da fotografia (`indicatorSnapshotVersion`): ausente em 260/260.
- Objeto `filters`: ausente em 81/260.

Isto impede uma comparação rigorosa trade a trade entre os filtros, especialmente ADX, volume, EMA9/EMA21 e a estratégia de suporte/resistência. O histórico antigo não guarda dados suficientes para reconstruir com fiabilidade todos os filtros no instante de entrada.

## 4. Divergência importante entre GitHub e Cloudflare

O ficheiro com os 260 trades foi encontrado em `main/historico-trades.json`, com exportação datada de 14/10. Porém, o `worker.js` da branch `migration-cloudflare-2026-10-11` lê por omissão a branch `rb-trader-history`. Nessa branch, o ficheiro `historico-trades.json` existe mas está vazio (zero bytes).

Isto é uma divergência concreta de armazenamento: se o Worker estiver a usar o valor predefinido e não tiver `GITHUB_HISTORY_BRANCH=main`, a API pode devolver um histórico vazio mesmo que o ficheiro com trades exista em `main`. O endpoint público não respondeu com o histórico nesta auditoria. **Não alterei os secrets nem a configuração de produção.**

## 5. Interpretação técnica

1. A quebra de resultados após 01/10 é clara nos dados disponíveis: 76,2% de WIN no dia 01/10 contra 27,9% de 02/10 a 14/10, excluindo BE.
2. Os trades de venda tiveram, no histórico completo, 55 WIN e 89 LOSS; as compras tiveram 42 WIN e 41 LOSS. A direção SELL merece investigação prioritária.
3. RSI abaixo de 30 aparece associado a 10 WIN, 41 LOSS e 1 BE (19,6% de WIN nos resultados decididos). É um sinal de alerta, mas não basta para alterar regras sem backtest.
4. Os campos em falta não permitem confirmar se o motor realmente exigiu ADX e volume em cada trade, nem verificar a fotografia completa dos indicadores.
5. A estratégia principal definida — zonas de suporte/resistência com confirmação por Price Action e RSI — não corresponde exatamente aos intervalos de momentum atuais (BUY RSI 60–75; SELL RSI 35–40). A versão de 01/10 também usa esses intervalos de momentum, pelo que repor o motor antigo não implementa por si só a estratégia principal.

## 6. Estado dos testes e alterações

- A compilação do projeto passou na execução de CI anteriormente observada.
- A suite de testes falhou quando a versão do motor de 01/10 foi temporariamente colocada na branch de teste, porque os testes atuais exigem proteções mais recentes, incluindo `maxBreakAtr` e `maxRetestExtensionAtr`.
- O motor mais recente foi restaurado na branch de trabalho configurada para Cloudflare; a versão de 01/10 ficou isolada na branch `TESTE-ESTRATEGIA-01-10-2026`.
- Não foi confirmada uma nova publicação em Cloudflare durante esta auditoria.

## 7. Próximas ações recomendadas

1. Corrigir e verificar a configuração do ramo de histórico antes de qualquer alteração de estratégia: confirmar qual ramo o Worker está a ler e garantir que o histórico ativo não está vazio.
2. Exportar novamente o histórico atual até 28/10; o ficheiro analisado termina em 14/10.
3. Corrigir a gravação de `indicatorSnapshot`, EMA9/EMA21, ADX e volume/SMA20 para cada trade.
4. Fazer replay cronológico com candles históricos e custos/spread, comparando a estratégia atual com a estratégia de suporte/resistência + Price Action + RSI.
5. Separar e auditar trades IA vs Sniper e BUY vs SELL; não assumir que a IA é a origem sem validar os campos `source`, `signalKind` e `setupState`.
6. Não promover a versão antiga à produção até passar os testes e um replay reproduzível.

## Limitações

Este relatório usa o ficheiro do GitHub exportado em 14/10/2026. Não inclui trades posteriores, não é um backtest fora da amostra e não permite atribuir causalidade à mudança de estratégia. Os resultados passados não garantem resultados futuros.
