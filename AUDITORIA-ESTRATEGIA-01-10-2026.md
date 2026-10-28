# Auditoria comparativa — estratégia de 01-10-2026 vs motor atual

Data da auditoria: 2026-10-28  
Repositório: `plaxo69/RB-Gold-Sniper-Trader`  
Referência de 01/10: commit `ad822d4bdd3a6e7dd6dd8512014873176ba1a205`  
Branch de trabalho isolada: `TESTE-ESTRATEGIA-01-10-2026`

## Resumo executivo

A versão de 01/10 não é apenas uma versão com menos filtros: usa regras diferentes para alinhamento temporal e validação dos dados. Não deve ser colocada em produção sem testes de regressão e comparação com o histórico real de trades.

## Diferenças confirmadas no código

| Regra | Motor de 01/10 | Motor mais recente antes da tentativa de reposição |
|---|---|---|
| Alinhamento de timeframes | Exige tendência alinhada em M5, M15 e H1 (3/3) | Exige alinhamento M1, M5 e M15; H1 é opcional |
| Médias móveis | Preço acima/abaixo da EMA200 | EMA200 mais alinhamento EMA9/EMA21 |
| RSI BUY | RSI > 60 e < 75 | RSI > 60 e < 75 |
| RSI SELL | RSI < 40 | RSI > 35 e < 40 |
| ADX | ADX disponível e > 22; caso contrário, bloqueia | ADX ausente pode passar; se disponível, tem de ser > 22 |
| Volume | Volume e SMA20 têm de estar disponíveis e volume > SMA20 | Dados ausentes podem passar; quando disponíveis, volume tem de ser > SMA20 |
| Corpo mínimo da vela | 0,18 × ATR | 0,10 × ATR |
| Posição de fecho da vela | Pelo menos 0,62 para BUY (regra equivalente para SELL) | 0,55 |
| Score de entrada | BUY ≥ 60; SELL ≤ 40 | BUY ≥ 55; SELL ≤ 45 |
| Risco em ATR | Não tinha os limites min/max explícitos da versão mais recente | Limites de risco 0,45 a 1,50 × ATR |
| Estrutura | Setup tático mais confirmação estrutural | Mantém estrutura, mas adiciona proteções de extensão de breakout/reteste e risco |

## Hipótese técnica principal

Uma diferença importante é que o motor mais recente pode aceitar um sinal quando ADX ou volume não estão disponíveis, enquanto o motor de 01/10 bloqueia o sinal nesses casos. Em simultâneo, o motor de 01/10 exige H1 alinhado; o motor mais recente usa M1/M5/M15. Portanto, a alteração pode tanto aumentar como reduzir a frequência de sinais. O código, por si só, não demonstra que a versão antiga tenha maior taxa de WIN.

## Estado dos testes

- A compilação do projeto passou na execução de CI iniciada em 28/10.
- A suite de testes falhou porque existem testes que exigem explicitamente as proteções adicionadas depois de 01/10, como `maxBreakAtr`, `maxRetestExtensionAtr` e critérios de setup mais recentes.
- A tentativa de reposição foi revertida na branch configurada para Cloudflare enquanto a versão antiga permanece isolada para análise.
- Não foi possível obter o histórico real de trades do endpoint público durante esta auditoria. Por isso, este documento **não inventa** número de WIN/LOSS nem afirma que a estratégia antiga ganha mais.

## Próximos passos para uma conclusão válida

1. Exportar do histórico real os trades resolvidos desde 01/10, com direção, hora, fonte, RSI, ADX, volume/SMA20, alinhamento, entrada, SL, TP e resultado.
2. Executar replay/backtest cronológico com velas históricas, usando apenas dados disponíveis no momento de cada sinal.
3. Comparar taxa de WIN, número de sinais, expectativa por trade, drawdown e resultados por fonte (IA vs Sniper), sessão e direção.
4. Não promover a versão antiga à produção até passar os testes adaptados e o replay histórico.

## Limitações

Este é um relatório de comparação estática do código e do estado dos testes. Não é um backtest nem uma promessa de desempenho futuro. O resultado real depende dos dados históricos, do spread/custos e da forma como SL/TP são resolvidos.
