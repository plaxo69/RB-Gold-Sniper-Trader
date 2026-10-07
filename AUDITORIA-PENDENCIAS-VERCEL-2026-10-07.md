# RB TRADER PRO — Auditoria / correções pendentes Vercel

Data: 2026-10-07

## Regras definitivas
- Resultado final do histórico: WIN ou LOSS apenas.
- BE não é resultado e não fecha a trade.
- BE é apenas um alerta manual "COLOCAR BE".
- O alerta BE só pode ser emitido a partir de 50% do objetivo (TP).
- Uma trade permanece aberta até TP ou SL.
- Uma trade aberta continua a bloquear novas trades; depois de TP/SL o bloqueio é libertado.
- Regras iguais para sinais SNIPER e oportunidades IA.
- Uma trade por vez.
- M1 + M5 + M15 alinhados é a regra normal dos filtros.
- A IA pode detetar uma oportunidade independente quando os filtros não a detetam; a IA não deve ficar limitada a esperar por um sinal dos filtros.
- ADX e Volume/SMA20 são dados de análise, não bloqueadores por si só; se indisponíveis devem aparecer como N/D, não substituir o valor por um bloqueio.
- A IA deve continuar a mostrar opinião, score e probabilidade quando houver dados suficientes.

## Pendências deixadas prontas
- Resolver trades localmente por TP/SL quando a API/Vercel não estiver disponível.
- Normalizar resultados BE/EXPIRADA antigos para WIN/LOSS.
- Remover BE das estatísticas e apresentação do histórico.
- Manter o alerta de BE sem alteração automática da trade.
- Garantir que o motor não mantém uma trade bloqueada depois de TP/SL.
- Preservar a exceção IA e as regras de alinhamento M1/M5/M15.

## Vercel
Estas alterações estão no main e ficam prontas para entrar na próxima publicação. A publicação deve ser validada antes de substituir a versão de produção.
