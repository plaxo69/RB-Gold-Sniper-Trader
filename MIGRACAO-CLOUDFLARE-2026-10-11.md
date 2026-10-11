# Migração RB TRADER PRO para Cloudflare — 2026-10-11

## Estado
- Branch de trabalho: migration-cloudflare-2026-10-11
- Base preservada: main (não alterar durante a migração)
- Nenhuma publicação nem alteração à estratégia foi feita.

## Auditoria técnica inicial
A aplicação atual não é apenas estática: usa Node.js/Express e inclui endpoints para mercado XAUUSD, opinião IA, exportação/histórico, monitorização TP/SL/BE e notificações push.
Cloudflare Workers não executa automaticamente um servidor Express persistente como um host Node tradicional; é necessária uma adaptação para o runtime Workers e validação de compatibilidade das dependências.

## Critérios obrigatórios antes de trocar o endereço no Safari
- [ ] /api/market devolve candles e preço atuais, com validação de dados desatualizados.
- [ ] /api/ai/opinion funciona com segredo configurado no ambiente.
- [ ] /api/monitor verifica operações abertas e os resultados previstos pela versão aprovada.
- [ ] Histórico, exportação e gravação continuam a funcionar; não depender de escrita em ficheiros locais efémeros.
- [ ] Push config/subscribe/send testados.
- [ ] Testar no novo endereço sem desligar o Vercel.
- [ ] Só mudar os atalhos do Mac/iPhone após os testes passarem.

## Limites
Plano gratuito Workers: limite documentado de 100.000 pedidos por dia e 10 ms de CPU por pedido. Não é ilimitado. Confirmar consumo e testar a carga da app antes da migração final.

## Próximos passos
1. Criar a versão compatível com Workers nesta branch.
2. Rever cada endpoint e dependência antes de fazer deploy.
3. Ligar o repositório à conta Cloudflare e configurar os segredos sem os colocar no Git.
4. Testar em URL de pré-visualização.
5. Só então considerar mudar o atalho e descontinuar Vercel.
