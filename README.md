# 🤖 Dragman Agent - Base App AI Assistant

A comprehensive AI agent for Base App with advanced crypto features, real-time data, and Base ecosystem expertise.

## ✨ Features

### 💰 Price Tracking
- Real-time cryptocurrency prices for 1000+ tokens
- CoinMarketCap and DexScreener integration
- 1h, 24h, 7d, 30d price changes with emoji indicators
- Market cap, volume, and sentiment analysis
- Official links to CoinMarketCap and DexScreener

### ⛽ Gas Price Monitoring
- Real-time gas prices for all EVM and non-EVM chains
- Ethereum, Base, Polygon, BSC, Arbitrum, Optimism
- Solana, Sui, Aptos, NEAR, Avalanche
- Source attribution and timestamp

### 🏦 DeFi & Yield Expert
- Comprehensive DeFi protocol knowledge
- Yield farming strategies and opportunities
- Bridge protocols (Jumper Exchange, LayerZero, Wormhole)
- Security analysis and risk assessment
- Project safety evaluation

### 🎮 Gaming Specialist
- All gaming platforms (Mobile, PC, Console)
- Traditional games and GameFi projects
- Gaming hardware and communities
- Esports and gaming news
- Safe download and interaction links

### 🟦 Base Ecosystem Specialist
- Base App features and functionality
- Base.org services and tools
- Base Chain technical details
- Base ecosystem project recommendations
- Basenames (Base Name Service)

## 🚀 Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/Dragboyz/Baseapp-Dragman.git
cd Baseapp-Dragman
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your API keys
```

4. **Run the agent**
```bash
npm start
```

## 🔧 Configuration

### Required Environment Variables
XMTP_WALLET_KEY=your_wallet_private_key
XMTP_DB_ENCRYPTION_KEY=your_db_encryption_key
XMTP_ENV=production
XMTP_PERSIST_INSTALLATION=true
XMTP_INSTALLATION_PATH=/var/www/Baseapp-Dragman/.xmtp-installation
OPENAI_API_KEY=your_openai_api_key
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key

## 📖 Usage

### Quick Actions Menu
- **1️⃣ Check Price** - "price ETH" or "check price BTC"
- **2️⃣ Gas Prices** - "gas base" or "gas ethereum"
- **3️⃣ DeFi & Yield** - "defi uniswap" or "yield farming"
- **4️⃣ Gaming** - "game axie" or "gamefi"
- **5️⃣ Base** - "base app" or "base ecosystem"

### Examples
- "price ETH" - Get Ethereum price
- "gas base" - Get Base gas prices
- "defi aave" - Get Aave information
- "game axie" - Get Axie Infinity info
- "base names" - Get Basenames information

## 🏗️ Architecture

- **Base App Integration**: Full XMTP messaging support
- **AI-Powered**: OpenAI GPT-4 integration
- **Real-time Data**: Multiple API integrations
- **Cross-Chain**: Support for 15+ networks
- **PM2 Deployment**: Production-ready with PM2

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE.md file for details.

## 🙏 Acknowledgments

- Base App team for the amazing platform
- XMTP for decentralized messaging
- OpenAI for AI capabilities
- Coinbase for Base ecosystem
