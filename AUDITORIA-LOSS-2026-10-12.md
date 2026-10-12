# Auditoria de perdas — RB TRADER PRO
Data: 2026-10-12
Base: exportação `rb-trader-pro-historico-2026-10-12.json` fornecida pelo utilizador (244 trades, 2026-09-29 a 2026-10-12).

## Resultados observados
- WIN: 91
- LOSS: 120
- BE: 33
- Taxa WIN entre resultados decisivos (WIN + LOSS): 43,1% (91/211). Não inclui BE no denominador.
- BUY: 41 WIN, 40 LOSS, 23 BE; taxa WIN decisiva: 50,6%.
- SELL: 50 WIN, 80 LOSS, 10 BE; taxa WIN decisiva: 38,5%.
- Origem IA: 15 WIN, 28 LOSS, 22 BE; taxa WIN decisiva: 34,9%.
- Candles reais fechados: 76 WIN, 92 LOSS, 11 BE; taxa WIN decisiva: 45,2%.

Estes valores são descritivos do histórico exportado; não provam que uma regra isolada causou as perdas nem garantem que um novo filtro melhore o resultado.

## Problemas a investigar
1. **Classificação e proteção BE:** 33 trades aparecem como BE e 66 LOSS têm uma razão que menciona zona de lucro/proteção BE. O histórico não permite concluir que essas 66 devam ser WIN: é necessário reconstruir a sequência de preços por trade. Foi encontrada uma inconsistência real no código: `app-v4.js` marcava a trade como terminal `BE` quando o preço atingia 50% do TP, enquanto `history-v2.js` já implementava BE como alerta sem fechar a trade.
2. **SELL:** a taxa WIN decisiva de SELL é 12,2 pontos percentuais inferior à de BUY no mesmo export. Manter o intervalo RSI SELL 35–40 definido para a estratégia, mas não apertar nem desativar SELL sem replay de candles e comparação por setup.
3. **Confiança da IA:** a confiança média registada foi superior nas LOSS do que nas WIN (aprox. 85,8 vs. 75,4 nos registos com o campo disponível). O score técnico não deve ser tratado diretamente como probabilidade de ganhar.
4. **Reentradas:** existem perdas com contagens de reentrada elevadas; isto justifica rever o agrupamento de movimentos e o contador. A contagem isolada não prova que todas sejam reentradas no mesmo movimento.
5. **Limitação do ficheiro:** o histórico exportado não contém a sequência completa de candles posteriores a cada entrada. Por isso não é possível validar honestamente alterações a RSI, ADX, volume, SL/TP ou filtros apenas com este ficheiro.

## Alterações preparadas nesta branch
- `public/app-v4.js`: BE aos 50% do TP passa a gerar alerta para mover manualmente o SL para a entrada; não fecha a trade nem altera o estado final. A trade permanece aberta para ser classificada WIN/LOSS pela resolução de TP/SL.
- `public/ai-sniper.js`: a percentagem `pWin` deixa de ser uma mistura direta do score técnico com uma probabilidade. Passa a derivar das taxas históricas suavizadas; as oportunidades independentes da IA usam histórico da direção e taxa base. O score técnico continua separado.
- Não foram alterados os filtros técnicos BUY/SELL, os níveis TP/SL, nem as regras de reentrada nesta fase. Isso evita otimizar a estratégia com base em correlações sem replay.

## Validação necessária antes de produção
1. Testar no preview: uma trade que chega a 50% do TP deve emitir alerta e continuar `ALERTA`.
2. Confirmar que TP posterior termina em WIN e SL posterior em LOSS.
3. Confirmar que a IA continua a mostrar oportunidades sem bloquear os sinais Sniper.
4. Reproduzir candles históricos por trade para comparar BUY/SELL, origem IA/candles e reentradas; só depois escolher alterações de filtros.
5. Não publicar esta branch automaticamente. Rever o preview e manter a versão atual/backup até todos os testes passarem.

**Estado:** alterações isoladas numa branch de auditoria; não aplicadas à branch principal nem publicadas em produção.
