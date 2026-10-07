# RB TRADER PRO — Auditoria final 2026-10-07

## Regras definitivas
- WIN = TP atingido.
- LOSS = SL atingido.
- BE = resultado terminal quando a operação atinge pelo menos 50% da distância até TP.
- Ao atingir BE, a trade fecha como BE e deixa de bloquear novas entradas.
- BE não move automaticamente o SL.
- SNIPER e IA têm a mesma gestão.
- Uma trade aberta bloqueia novas entradas até WIN, LOSS ou BE.
- M1 + M5 + M15 alinhados é a regra normal dos filtros.
- A IA pode emitir oportunidades independentes.
- ADX e Volume/SMA20 são dados, não bloqueadores.
- Dados indisponíveis = N/D.
- Histórico local/remoto preserva resultados terminais.
- O monitor servidor verifica TP/SL e BE pelas velas M1.
- Push é enviado para WIN, LOSS, BE e novas trades.

## Correções desta auditoria
1. BE terminal no monitor servidor.
2. BE terminal no histórico/local.
3. Ecrã mostra BE explicitamente.
4. Estatísticas contam BE.
5. BE local fecha a trade mesmo sem áudio/alertas ativos.
6. Monitor servidor deteta BE mesmo se o preço já recuou.
7. Backup criado: BACKUP-FINAL-AUDITORIA-BE-2026-10-07.

## Vercel
O projeto está no Hobby. O limite documentado é 100 deployments por 24h e 32 builds por hora. O bloqueio atual foi `api-deployments-free-per-day`. Não fazer novas tentativas enquanto o limite estiver ativo.

Quando libertar:
- publicar o main uma única vez;
- confirmar READY;
- confirmar domínio de produção;
- testar histórico e BE;
- testar /api/monitor;
- testar Push config;
- confirmar workflow GitHub.

A produção só fica concluída depois destes testes.
