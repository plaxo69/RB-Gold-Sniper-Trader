# ESTRATÉGIA PRINCIPAL — RB TRADER PRO

> Documento de referência do projeto. Consultar antes de auditar, corrigir ou alterar a app. Atualizar este ficheiro quando uma decisão de estratégia for confirmada. Não inventar regras nem substituir decisões confirmadas por suposições.

## 1. Projeto e publicação

- Projeto prioritário: **RB TRADER PRO — ouro/XAUUSD**.
- Repositório: https://github.com/plaxo69/RB-Gold-Sniper-Trader
- Worker Cloudflare: https://rb-gold-sniper-trader.plaxo69.workers.dev/
- Worker: `rb-gold-sniper-trader`.
- O fluxo de publicação pretendido é GitHub → Cloudflare. **Não usar Vercel** como destino.
- A configuração Cloudflare foi indicada como ligada à branch `migration-cloudflare-2026-10-11`; confirmar a configuração real antes de qualquer alteração de branch.
- Não alterar a produção, trocar a branch de produção, fazer force-push ou apagar branches/backups sem pedido explícito.
- Antes de alterações de código: verificar o estado atual, comparar com o backup principal e fazer alterações pequenas, isoladas e verificáveis. Não voltar a introduzir correções já feitas nem criar sucessivas variantes sem validar a anterior.
- A app de criptomoedas é um projeto separado e fica para depois.

## 2. Objetivo principal

Melhorar a qualidade dos sinais e reduzir perdas com auditoria baseada em dados reais. Não prometer ganhos nem aumentar artificialmente a percentagem de confiança. A IA dá uma opinião complementar e **não deve bloquear sinais por si só**.

## 3. Regras de sinal acordadas

- Ativo prioritário: XAUUSD (ouro).
- Confirmar alinhamento de tendência em M1, M5 e M15.
- Se os períodos não estiverem alinhados, só identificar uma oportunidade sniper através da análise IA; não apresentar o sinal como alinhado pelos três períodos.
- BUY: RSI(14) > 60 e < 75.
- SELL: RSI(14) > 35 e < 40.
- ADX(14) > 22.
- Volume acima da SMA(20) do volume.
- Indicadores de referência: RSI(14), ATR(14), EMA(9), EMA(21), ADX(14) e volume/SMA(20).
- Manter os alertas e a execução manual no MT5. Não gerir automaticamente conta, capital ou ordens.
- Uma trade de cada vez; permitir no máximo duas reentradas no mesmo movimento e apenas depois de uma WIN.
- Cooldown de 5 minutos.
- Resultados principais: WIN e LOSS. BE não deve ser contado como WIN/LOSS; preferencialmente é apenas um alerta. Se o mecanismo de BE estiver ativo, só considerar BE depois de pelo menos metade do alvo em lucro; se o alvo for atingido depois, o resultado final é WIN.
- A opinião da IA deve mostrar percentagem/nível de confiança com prudência. Confianças muito altas (por exemplo, 95%+) que acabam em LOSS devem ser auditadas; não tratar confiança como probabilidade real sem calibração demonstrada.

## 4. Fotografia de indicadores no histórico — requisito crítico

Cada sinal/trade guardado deve preservar uma **fotografia dos indicadores no momento da entrada**, para permitir analisar filtros e explicar WIN/LOSS. Guardar, sempre que disponíveis:

- ativo e direção (BUY/SELL);
- data/hora, preço de entrada, alvo e stop;
- RSI(14), ATR(14), EMA(9), EMA(21), ADX(14);
- volume atual e SMA(20) do volume;
- estado/alinhamento de M1, M5 e M15;
- opinião da IA, percentagem de confiança e explicação/razões;
- versão/regras do motor e resultado final (WIN/LOSS/BE, quando aplicável).

A fotografia tem de ser valores numéricos e estados **capturados na entrada**, não valores recalculados com dados atuais quando o histórico é aberto. A interface deve apresentar os valores legivelmente; não mostrar `[object Object]`, JSON bruto ou campos sem rótulos. A sincronização do histórico não pode apagar nem substituir fotografias existentes por objetos vazios. Validar a persistência local e remota, incluindo o endpoint `/api/trades?limit=5000` e a chave local `rb_gold_sniper_signals_v1`, sem assumir que estes nomes continuam corretos sem verificar o código.

## 5. IA adaptativa e análise estatística

- Motor de referência acordado: `RB-TRADER-PRO-STAT-v4`.
- Evitar data leakage: a decisão só pode usar dados que estavam disponíveis no momento do sinal.
- Só considerar ativar filtros adaptativos depois de pelo menos 40 resultados válidos, incluindo pelo menos 10 resultados na direção em análise, e validação mínima de 55%.
- Antes de cumprir esses critérios, manter o estado **OBSERVAÇÃO**: recolher e analisar dados, sem bloquear sinais com base no filtro adaptativo.
- Separar resultados por direção, condições de mercado e fotografia dos indicadores; avaliar amostras pequenas com prudência.

## 6. Checklist obrigatório antes de concluir uma correção

1. Identificar a causa raiz e o ficheiro/função responsável.
2. Confirmar que o código atual e a branch alvo são os esperados.
3. Fazer a menor alteração necessária; não reformular partes não relacionadas.
4. Verificar sintaxe e referências a ficheiros/scripts.
5. Testar o fluxo afetado e regressões relevantes, em especial guardar/recuperar histórico, sincronização e apresentação das fotografias.
6. Confirmar que os dados existentes são preservados.
7. Rever o diff para detetar alterações acidentais, segredos ou configuração de deploy alterada.
8. Só afirmar que está publicado/funcional depois de existir confirmação observável do deploy e do comportamento.
9. Registar aqui decisões duradouras e testes realmente executados; distinguir claramente o que foi testado do que ficou por verificar.

## 7. Segurança e limites

- Nunca colocar tokens, passwords, chaves API, cookies ou outros segredos neste documento nem no código versionado.
- Não revelar nem imprimir tokens. Se um token tiver sido exposto, revogá-lo e criar outro.
- Não apagar histórico, backups ou branches sem confirmação explícita.
- Este documento é uma referência operacional; o código existente e os testes devem ser inspecionados antes de assumir que uma regra está corretamente implementada.

---
Última atualização documental: 2026-10-16.
