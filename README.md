# RB Gold Sniper — LIVE corrigido

- Dados reais: OANDA XAU_USD se `OANDA_API_TOKEN` existir; caso contrário Yahoo Finance `GC=F`.
- Timeframes: M1, M3 (agregado), M5, M15 e H1.
- Sem `Math.random()` para preço, indicadores ou resultados.
- Sem IA/API de IA.
- Sem execução automática de ordens.
- Execução das entradas é manual no MT5.
- Sinais são calculados a partir de candles reais.
- TP/SL usam estrutura + ATR e RR dinâmico.
- Histórico de alertas é guardado no navegador via localStorage.

## Vercel

Não é necessário manter um processo Node permanentemente ativo. A página consulta `/api/market` a cada 60 segundos.

Para usar OANDA, adicionar em Vercel:
`OANDA_API_TOKEN`
`OANDA_INSTRUMENT=XAU_USD`

Sem token, o fallback é `GC=F`; isto é ouro futuro, não spot XAU/USD.

## Importante

A versão antiga simulava preços, MT5 e fechamentos. Esta versão remove essas simulações.
