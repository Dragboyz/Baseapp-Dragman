# 🤖 Dragman Agent - Base App AI Assistant

A powerful AI agent for Base App with advanced crypto features, voice commands, NFT analysis, and gamification.

## ✨ Features

### 🎤 Voice Commands
- 20+ voice commands with NLP processing
- Natural language understanding
- Synonym matching and context awareness

### 🎨 NFT Analysis
- Collection analysis with floor price tracking
- Rarity calculator with trait breakdown
- Market cap and volume analysis

### 📱 Mobile Optimization
- Touch gestures (swipe, long press, double tap)
- Compact response format
- Battery saver mode

### 📊 Portfolio Tracking
- Visual ASCII charts
- Real-time value tracking
- Multiple timeframes (7d, 30d, 90d, 1y)

### 📈 Trading Signals
- Automated buy/sell recommendations
- Technical analysis (RSI, MACD, Bollinger Bands)
- Fundamental analysis with confidence scores

### 👥 Social Features
- Friend management system
- Social graph analysis
- Collaboration tools

### 🎮 Gamification
- Points, levels, and XP system
- 10+ achievements to unlock
- Daily rewards and streaks
- Global leaderboard

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/Dragboyz/Baseapp-Dragman.git
   cd Baseapp-Dragman
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Run the agent**
   ```bash
   npm start
   # or
   yarn start
   ```

## 🔧 Configuration

### Required Environment Variables
```env
XMTP_WALLET_KEY=your_wallet_private_key
XMTP_DB_ENCRYPTION_KEY=your_db_encryption_key
OPENAI_API_KEY=your_openai_api_key
CDP_API_KEY_ID=your_coinbase_api_key_id
CDP_API_KEY_PRIVATE_KEY=your_coinbase_api_private_key
NEYNAR_API_KEY=your_neynar_api_key
```

## 📖 Usage

### Basic Commands
- `/help` - Show all available features
- `/voice` - Voice command features
- `/nft` - NFT analysis features
- `/mobile` - Mobile optimization
- `/portfolio` - Portfolio tracking
- `/signals` - Trading signals
- `/social` - Social features
- `/gamification` - Points and achievements

### Voice Commands
- "price ETH" - Get token price
- "analyze BTC" - Token analysis
- "trending tokens" - Hottest tokens
- "gas fees base" - Gas fee analysis

### NFT Commands
- "analyze nft collection [address]" - Collection analysis
- "calculate nft rarity [tokenId] [collection]" - Rarity analysis

## 🏗️ Architecture

- **Base App Integration**: Full XMTP messaging support
- **AI-Powered**: OpenAI GPT integration
- **Payment Processing**: Coinbase x402 protocol
- **Social Features**: Farcaster integration
- **Cross-Chain**: Support for 15+ networks

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🙏 Acknowledgments

- Base App team for the amazing platform
- XMTP for decentralized messaging
- OpenAI for AI capabilities
- Coinbase for payment processing
