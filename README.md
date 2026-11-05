# RB Gold Sniper Trader

Aplicação web para análise de XAU/USD. As entradas são sinais para execução manual no MT5; não envia ordens automaticamente.

## Alojamento

A configuração ativa do projeto é Cloudflare Workers (`wrangler.jsonc`), não Vercel. A branch de deploy é `migration-cloudflare-2026-10-11`; os pushes nessa branch executam validação e, se esta passar, `wrangler deploy`.

O endereço público deve ser copiado do painel Cloudflare, em **Workers & Pages → rb-gold-sniper-trader → Settings/Triggers → Domains & Routes**. Não uses `https://github.com/` como endereço da aplicação. O antigo endereço `workers.dev` registado anteriormente respondeu HTTP 404, por isso não é anunciado aqui como endereço funcional.

## Verificação do deploy

Depois de confirmar/ativar o domínio `workers.dev` no painel Cloudflare, testa:

- `GET /api/health` — estado do Worker e do feed XAUUSD.
- `GET /api/market?timeframe=1m` — candles e estado do feed.

O healthcheck não gera sinais nem monitoriza trades; a estratégia é executada pela aplicação no browser e usa candles reais. Não há garantia de sinais em todas as sessões: só são emitidos quando os filtros técnicos passam.

## Deploy

1. Confirmar no GitHub os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
2. Confirmar no Cloudflare que `workers.dev` está ativado para a conta.
3. Fazer push da versão validada para `migration-cloudflare-2026-10-11`.
4. Confirmar o workflow de validação/deploy e abrir o endereço apresentado pelo Cloudflare.

Vercel não é necessário para este fluxo. O workflow legado em `main` está desativado; não publicar a versão antiga de `main` por cima do Worker.
