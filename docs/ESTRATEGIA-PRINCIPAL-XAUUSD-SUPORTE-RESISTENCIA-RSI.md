# Estratégia Principal RB TRADER PRO — XAUUSD
## Suporte/Resistência com confirmação do RSI(14) e Price Action

**Estado:** estratégia de referência para o motor XAUUSD.  
**Execução:** sinais e alertas para execução manual no MT5; nunca executar ordens automaticamente.

### Princípios
- Identificar zonas horizontais relevantes de suporte e resistência através de máximos/mínimos anteriores.
- Confirmar a entrada com o fecho de uma vela de rejeição ou de continuação; não antecipar o fecho.
- Usar RSI(14) como confirmação contextual, não como sinal isolado.
- Colocar o Stop Loss para além da zona que invalida a ideia.
- Exigir relação risco/retorno mínima de 1:2; preferir 1:3 ou superior.
- Se a zona, a vela de confirmação ou o risco/retorno não forem válidos, não emitir BUY/SELL.

### Compras
**A — Reversão no suporte**
1. O preço testa uma zona de suporte relevante.
2. RSI(14) entre 30 e 50.
3. Vela de rejeição de alta (por exemplo, martelo, engolfo de alta ou pavio inferior pronunciado).
4. Emitir BUY apenas depois do fecho da vela de confirmação.
5. SL abaixo do fundo/zona de suporte; alvo no topo anterior ou alvo projetado com RR mínimo 1:2.

**B — Breakout com pullback**
1. Fecho decisivo acima da resistência.
2. Reteste da antiga resistência, agora suporte.
3. Rejeição/fecho de alta a confirmar a defesa do nível.
4. Entrada após confirmação; SL abaixo da nova zona de suporte.

**C — Breakout de continuação**
1. Rutura limpa da resistência.
2. Consolidação curta acima da zona.
3. Vela de impulso fecha a romper a consolidação.
4. Entrada após o fecho de confirmação; SL abaixo da consolidação.

### Vendas
**A — Rejeição na resistência**
1. O preço testa uma resistência relevante/topo anterior.
2. RSI(14) próximo de 67–70.
3. Vela de rejeição de baixa (pavio superior pronunciado, engolfo de baixa ou estrela da noite).
4. Emitir SELL apenas depois do fecho da vela de confirmação.
5. SL acima do topo/resistência; alvo no fundo anterior ou alvo projetado com RR mínimo 1:2.

**B — Breakdown com reteste**
1. Fecho decisivo abaixo do suporte.
2. Reteste por baixo, com o suporte antigo a atuar como resistência.
3. Vela de baixa confirma a rejeição.
4. Entrada após confirmação; SL acima da zona do reteste e TP no suporte seguinte/alvo projetado.

### Checklist obrigatório
- [ ] Zona de suporte/resistência relevante identificada.
- [ ] Cenário classificado (reversão, pullback, continuação ou breakdown).
- [ ] RSI adequado ao cenário.
- [ ] Vela de confirmação fechada.
- [ ] SL no lado de invalidação.
- [ ] RR calculado e mínimo 1:2.
- [ ] Fotografia dos indicadores e cenário registados no histórico.

### Interpretação do RSI por cenário
- Compra por reversão no suporte: RSI 30–50.
- Venda por rejeição na resistência: RSI 67–70 (zona próxima de 70).
- Breakout/pullback/continuação: confirmar momentum na direção da rutura; não exigir automaticamente o RSI de reversão.
- RSI nunca deve ser usado isoladamente para abrir uma operação.

### Notas de implementação
Os níveis são estimativas calculadas a partir dos candles disponíveis; a qualidade depende da profundidade dos dados e do feed. A estratégia não garante lucros. Sinais que não tenham RR mínimo de 1:2 devem ser bloqueados, não "forçados" para cumprir a regra.
