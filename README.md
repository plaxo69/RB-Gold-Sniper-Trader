# 🎯 RB Gold Sniper Trader

Bot de trading automático para Ouro (XAUUSD) na plataforma Vantage.

## 📋 Características

- ✅ Conexão com MetaTrader 5 (MT5)
- ✅ Análise automática de mercado
- ✅ Trading automático com sinais
- ✅ Dashboard em tempo real
- ✅ Interface web responsiva
- ✅ API RESTful completa

## 🚀 Instalação

### Pré-requisitos

- Node.js 14+ instalado
- npm ou yarn
- MetaTrader 5 instalado (opcional)

### Passos

1. Clone o repositório
```bash
git clone https://github.com/plaxo69/RB-Gold-Sniper-Trader.git
cd RB-Gold-Sniper-Trader
```

2. Instale as dependências
```bash
npm install
```

3. Configure as variáveis de ambiente
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

4. Inicie a aplicação
```bash
npm start
```

A aplicação estará disponível em `http://localhost:3000`

## 📚 Uso

### Endpoints da API

#### Health Check
```bash
GET /api/health
```

#### MT5
```bash
POST /api/mt5/connect        # Conectar ao MT5
GET  /api/mt5/status         # Status da conexão
POST /api/mt5/trade          # Iniciar/parar trading
```

#### Análise
```bash
GET /api/analyze/market      # Análise do mercado
GET /api/analyze/indicators  # Indicadores técnicos
```

## 🛠️ Desenvolvimento

Para modo desenvolvimento com auto-reload:

```bash
npm run dev
```

## 📦 Build para Produção

```bash
npm start
```

Para deploy na Vercel:

```bash
npm i -g vercel
vercel
```

## ⚙️ Configuração

Edite `.env` com suas configurações:

```env
PORT=3000
NODE_ENV=production
MT5_SERVER=seu_servidor
MT5_LOGIN=seu_login
MT5_PASSWORD=sua_senha
```

## 🔒 Segurança

- Nunca comita o arquivo `.env` com dados sensíveis
- Use variáveis de ambiente para credenciais
- Implementar autenticação e autorização
- Usar HTTPS em produção

## 📝 Licença

MIT License - veja LICENSE para detalhes

## 👨‍💼 Autor

plaxo69

## ⚠️ Disclaimer

Este bot é fornecido "como está". Trading de ouro envolve risco financeiro. Use por sua conta e risco. Não somos responsáveis por perdas financeiras.

---

**Última atualização**: 2024
