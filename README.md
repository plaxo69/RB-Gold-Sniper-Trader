# RB Gold Sniper — OANDA

- Dados da corretora: OANDA `XAU_USD`, configurada através de `OANDA_API_TOKEN`.
- Timeframes: M1, M3 (agregado), M5, M15 e H1.
- Sem `Math.random()` para preço, indicadores ou resultados.
- Sem IA/API de IA.
- Sem ligação a plataformas de execução nem execução de ordens.
- Sinais são calculados a partir de candles da OANDA.
- TP/SL usam estrutura + ATR e RR dinâmico.
- Histórico de alertas é guardado no navegador via localStorage.

## Vercel

Não é necessário manter um processo Node permanentemente ativo. A página consulta `/api/market` a cada 60 segundos e apresenta o gráfico `OANDA:XAUUSD` através do TradingView.

Para usar OANDA, adicionar em Vercel:
`OANDA_API_TOKEN`
`OANDA_INSTRUMENT=XAU_USD`

Sem token, a API informa que a credencial da OANDA é necessária. Não existe fallback para outro ativo, para evitar apresentar ouro futuro como se fosse XAU/USD spot.

## Importante

A versão antiga simulava preços e fechamentos. Esta versão remove essas simulações e usa exclusivamente a OANDA para os dados da análise.
