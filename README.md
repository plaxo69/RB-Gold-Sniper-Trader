# RB Gold Sniper Trader

Aplicação web para análise de XAU/USD. As entradas são sinais para execução manual no MT5; não envia ordens automaticamente.

## Alojamento

A configuração do projeto é Cloudflare Workers (`wrangler.jsonc`), não Vercel. Os pushes nesta branch executam build, testes, Wrangler dry-run e, se as validações passarem, deploy para Cloudflare.

O endereço público deve ser copiado do painel Cloudflare, em **Workers & Pages → rb-gold-sniper-trader → Settings/Triggers → Domains & Routes**. Não uses `https://github.com/` como endereço da aplicação. O endereço `https://rb-gold-sniper-trader.plaxo69.workers.dev` foi verificado e respondeu HTTP 404; até o Cloudflare confirmar/ativar o domínio correto, não é possível afirmar que a app está publicada num endereço funcional.

## Diagnóstico

- `GET /api/health` deve devolver `status: OK` e `marketConnected: true`.
- `GET /api/market?timeframe=1m` deve devolver candles recentes e feed não obsoleto.
- Healthcheck só verifica serviço/feed; não cria sinais nem substitui gestão de operações.
- Os sinais dependem dos filtros técnicos e podem não aparecer se os critérios não forem satisfeitos.

## Deploy

Confirma no GitHub os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`, e no painel Cloudflare que Workers.dev está ativado. Depois, o workflow desta branch valida e publica com `wrangler deploy`.

Vercel não é necessário para este fluxo.
