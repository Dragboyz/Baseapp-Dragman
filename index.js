import { Agent } from "@xmtp/agent-sdk";
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Ensure installation directory exists
const installationPath = process.env.XMTP_INSTALLATION_PATH || './.xmtp-installation';
if (!fs.existsSync(installationPath)) {
  fs.mkdirSync(installationPath, { recursive: true });
  console.log(`📁 Created XMTP installation directory: ${installationPath}`);
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize XMTP Agent SDK with proper installation handling
const agent = await Agent.createFromEnv({
  env: process.env.XMTP_ENV || 'production',
  persistConversations: true,
  installationPath: installationPath
});

// --- Register Base App custom content type codecs (Quick Actions & Intent) ---
const ContentTypeActions = { authorityId: 'coinbase.com', typeId: 'actions', version: '1.0' };
const ContentTypeIntent = { authorityId: 'coinbase.com', typeId: 'intent', version: '1.0' };

class JsonCodec {
  constructor(contentType) {
    this._contentType = contentType;
    this.id = `${contentType.authorityId}/${contentType.typeId}:${contentType.version}`;
  }
  get contentType() {
    return this._contentType;
  }
  encode(content) {
    const json = JSON.stringify(content);
    return new TextEncoder().encode(json);
  }
  decode(bytes) {
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  }
}

// Alternative simpler codec implementation
class SimpleCodec {
  constructor(contentType) {
    this.contentType = contentType;
  }
  encode(content) {
    return new TextEncoder().encode(JSON.stringify(content));
  }
  decode(bytes) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
}

// Simplified Quick Actions - no complex codec registration needed
log('info', 'Using simplified Quick Actions approach');

// Debug: Check what content types are available
try {
  if (agent && agent.client && agent.client.codecRegistry) {
    log('info', 'Codec registry available, checking supported content types');
    // Try to see what's in the codec registry
    if (agent.client.codecRegistry.codecs) {
      log('info', 'Available codecs:', Object.keys(agent.client.codecRegistry.codecs));
    }
  }
} catch (e) {
  log('warn', 'Could not inspect codec registry', { error: e?.message });
}


// Simple logging function
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}]: ${message}`, data);
}

log('info', '🐉 Dragman Agent started successfully!');
log('info', '📱 Ready to chat with users on Base App');
log('info', '🚀 Quick Actions enabled with simplified approach');

// ==================== QUICK ACTIONS FUNCTIONS ====================

// Send Quick Actions for main features - USING XMTP SDK BUILT-IN SUPPORT
async function sendMainQuickActions(ctx) {
  const mainActions = {
    id: `main_features_${Date.now()}`,
    description: "What would you like to do?",
    actions: [
      { id: "check_price", label: "💰 Check Price", style: "primary" },
      { id: "gas_price", label: "⛽ Gas Prices", style: "primary" },
      { id: "defi_yield", label: "🏦 DeFi & Yield", style: "primary" },
      { id: "gaming", label: "🎮 Gaming", style: "primary" },
      { id: "base", label: "🟦 Base", style: "primary" }
    ],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  try {
    // Try using XMTP SDK's built-in Quick Actions support
    log('info', 'Attempting to send Quick Actions using XMTP SDK built-in support');
    
    // Method 1: Try with the exact content type object
    await ctx.conversation.send(mainActions, ContentTypeActions);
    log('info', '✅ Quick Actions sent successfully with ContentTypeActions!');
    return;
    
  } catch (error) {
    log('warn', 'ContentTypeActions failed, trying alternative approaches', { error: error.message });
    
    try {
      // Method 2: Try with string format
      await ctx.conversation.send(mainActions, 'coinbase.com/actions:1.0');
      log('info', '✅ Quick Actions sent successfully with string format!');
      return;
      
    } catch (error2) {
      log('warn', 'String format failed, trying XMTP format', { error: error2.message });
      
      try {
        // Method 3: Try with XMTP format
        await ctx.conversation.send(mainActions, 'xmtp.org/actions:1.0');
        log('info', '✅ Quick Actions sent successfully with XMTP format!');
        return;
        
      } catch (error3) {
        log('warn', 'All Quick Actions methods failed, using enhanced fallback', { error: error3.message });
        
        // Interactive text-based "buttons" that work like Quick Actions
        const interactiveMenu = `${mainActions.description}\n\n` +
          `🎯 QUICK ACTIONS 🎯\n\n` +
          `1️⃣ 💰 Check Price\n` +
          `2️⃣ ⛽ Gas Prices\n` +
          `3️⃣ 🏦 DeFi & Yield\n` +
          `4️⃣ 🎮 Gaming\n` +
          `5️⃣ 🟦 Base\n\n` +
          `💡 Just type the number (1-5) or the command directly!\n` +
          `🚀 Examples: "1", "price ETH", "gas base", "defi aave"`;
        await ctx.sendText(interactiveMenu);
        log('warn', 'Sent interactive text-based Quick Actions');
      }
    }
  }
}

// Send Quick Actions for price tracking
async function sendPriceQuickActions(ctx) {
  const priceActions = {
    id: `price_options_${Date.now()}`,
    description: "Choose a token to check price:",
    actions: [
      { id: "price_eth", label: "Ethereum (ETH)", style: "primary" },
      { id: "price_btc", label: "Bitcoin (BTC)", style: "primary" },
      { id: "price_sol", label: "Solana (SOL)", style: "primary" },
      { id: "price_custom", label: "Custom Token", style: "secondary" }
    ],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  try {
    if (actionsCodecAvailable) {
      const contentTypeString = `${ContentTypeActions.authorityId}/${ContentTypeActions.typeId}:${ContentTypeActions.version}`;
      await ctx.conversation.send(priceActions, contentTypeString);
    } else {
      const textMenu = `${priceActions.description}\n\n` +
        priceActions.actions.map((action, index) => `[${index + 1}] ${action.label}`).join('\n') +
        '\n\nReply with the number to select';
      await ctx.sendText(textMenu);
    }
  } catch (error) {
    log('error', 'Failed to send price Quick Actions', { error: error.message });
  }
}

// Send Quick Actions for gas prices
async function sendGasQuickActions(ctx) {
  const gasActions = {
    id: `gas_options_${Date.now()}`,
    description: "Choose a network for gas prices:",
    actions: [
      { id: "gas_ethereum", label: "Ethereum", style: "primary" },
      { id: "gas_base", label: "Base", style: "primary" },
      { id: "gas_polygon", label: "Polygon", style: "primary" },
      { id: "gas_all", label: "All Networks", style: "secondary" }
    ],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  try {
    if (actionsCodecAvailable) {
      const contentTypeString = `${ContentTypeActions.authorityId}/${ContentTypeActions.typeId}:${ContentTypeActions.version}`;
      await ctx.conversation.send(gasActions, contentTypeString);
    } else {
      const textMenu = `${gasActions.description}\n\n` +
        gasActions.actions.map((action, index) => `[${index + 1}] ${action.label}`).join('\n') +
        '\n\nReply with the number to select';
      await ctx.sendText(textMenu);
    }
  } catch (error) {
    log('error', 'Failed to send gas Quick Actions', { error: error.message });
  }
}

// Send Quick Actions for DeFi & Yield
async function sendDeFiQuickActions(ctx) {
  const defiActions = {
    id: `defi_options_${Date.now()}`,
    description: "Choose DeFi & Yield option:",
    actions: [
      { id: "defi_top", label: "Top DeFi Protocols", style: "primary" },
      { id: "defi_uniswap", label: "Uniswap", style: "primary" },
      { id: "defi_aave", label: "Aave", style: "primary" },
      { id: "defi_yield", label: "Yield Farming", style: "secondary" }
    ],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  try {
    if (actionsCodecAvailable) {
      const contentTypeString = `${ContentTypeActions.authorityId}/${ContentTypeActions.typeId}:${ContentTypeActions.version}`;
      await ctx.conversation.send(defiActions, contentTypeString);
    } else {
      const textMenu = `${defiActions.description}\n\n` +
        defiActions.actions.map((action, index) => `[${index + 1}] ${action.label}`).join('\n') +
        '\n\nReply with the number to select';
      await ctx.sendText(textMenu);
    }
  } catch (error) {
    log('error', 'Failed to send DeFi Quick Actions', { error: error.message });
  }
}

// Send Quick Actions for Gaming
async function sendGamingQuickActions(ctx) {
  const gamingActions = {
    id: `gaming_options_${Date.now()}`,
    description: "Choose Gaming option:",
    actions: [
      { id: "gaming_top", label: "Top Games", style: "primary" },
      { id: "gaming_axie", label: "Axie Infinity", style: "primary" },
      { id: "gaming_sandbox", label: "The Sandbox", style: "primary" },
      { id: "gaming_gamefi", label: "GameFi Projects", style: "secondary" }
    ],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  try {
    if (actionsCodecAvailable) {
      const contentTypeString = `${ContentTypeActions.authorityId}/${ContentTypeActions.typeId}:${ContentTypeActions.version}`;
      await ctx.conversation.send(gamingActions, contentTypeString);
    } else {
      const textMenu = `${gamingActions.description}\n\n` +
        gamingActions.actions.map((action, index) => `[${index + 1}] ${action.label}`).join('\n') +
        '\n\nReply with the number to select';
      await ctx.sendText(textMenu);
    }
  } catch (error) {
    log('error', 'Failed to send gaming Quick Actions', { error: error.message });
  }
}

// ==================== PRICE TRACKING FUNCTIONS ====================

async function getTokenPrice(tokenQuery) {
  try {
    // For top 1000+ tokens, prioritize CoinMarketCap
    if (process.env.COINMARKETCAP_API_KEY) {
      const cmcData = await getCoinMarketCapPrice(tokenQuery);
      if (cmcData) return cmcData;
    }

    // Fallback to DexScreener for smaller tokens
    const dexScreenerData = await getDexScreenerPrice(tokenQuery);
    if (dexScreenerData) return dexScreenerData;

    return null;
  } catch (error) {
    log('error', 'Price tracking error', { error: error.message });
    return null;
  }
}

async function getDexScreenerPrice(tokenQuery) {
  try {
    // Search for token
    const searchResponse = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(tokenQuery)}`);
    const searchData = await searchResponse.json();
    
    if (searchData.pairs && searchData.pairs.length > 0) {
      const pair = searchData.pairs[0]; // Get best match
      
      return {
        name: pair.baseToken?.name || tokenQuery,
        symbol: pair.baseToken?.symbol || tokenQuery.toUpperCase(),
        price: parseFloat(pair.priceUsd),
        change24h: pair.priceChange?.h24 || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        dex: pair.dexId,
        chain: pair.chainId,
        source: 'DexScreener',
        url: `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`,
        timestamp: new Date().toISOString()
      };
    }
    return null;
  } catch (error) {
    log('error', 'DexScreener API error', { error: error.message });
    return null;
  }
}

async function getCoinMarketCapPrice(tokenQuery) {
  try {
    const response = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${tokenQuery.toUpperCase()}`, {
      headers: {
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.data && data.data[tokenQuery.toUpperCase()]) {
      const token = data.data[tokenQuery.toUpperCase()];
      
      // Get historical data for 1h, 4h, 1d, 1w, 1m
      const historicalData = await getCoinMarketCapHistorical(token.id);
      
      return {
        name: token.name,
        symbol: token.symbol,
        price: token.quote.USD.price,
        change1h: token.quote.USD.percent_change_1h || null,
        change4h: null, // CoinMarketCap doesn't provide 4h data
        change24h: token.quote.USD.percent_change_24h,
        change7d: token.quote.USD.percent_change_7d || null,
        change30d: token.quote.USD.percent_change_30d || null,
        volume24h: token.quote.USD.volume_24h,
        marketCap: token.quote.USD.market_cap,
        sentiment: getSentimentAnalysis(token.quote.USD.percent_change_24h),
        historical: historicalData,
        source: 'CoinMarketCap',
        url: `https://coinmarketcap.com/currencies/${token.slug}/`,
        timestamp: new Date().toISOString()
      };
    }
    return null;
  } catch (error) {
    log('error', 'CoinMarketCap API error', { error: error.message });
    return null;
  }
}

async function getCoinMarketCapHistorical(tokenId) {
  try {
    const response = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/historical?id=${tokenId}&count=30&interval=1d`, {
      headers: {
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.data && data.data.quotes) {
      const quotes = data.data.quotes;
      return {
        prices: quotes.map(q => ({
          date: q.timestamp,
          price: q.quote.USD.price
        }))
      };
    }
    return null;
  } catch (error) {
    log('error', 'CoinMarketCap historical API error', { error: error.message });
    return null;
  }
}

function getSentimentAnalysis(change24h) {
  if (change24h > 10) return { emoji: '🚀', text: 'Very Bullish', color: '🟢' };
  if (change24h > 5) return { emoji: '📈', text: 'Bullish', color: '🟢' };
  if (change24h > 0) return { emoji: '😊', text: 'Positive', color: '🟢' };
  if (change24h > -5) return { emoji: '😐', text: 'Neutral', color: '🟡' };
  if (change24h > -10) return { emoji: '😟', text: 'Bearish', color: '🔴' };
  return { emoji: '📉', text: 'Very Bearish', color: '🔴' };
}

// ==================== GAS PRICE FUNCTIONS ====================

async function getGasPrice(chain) {
  try {
    const chainLower = chain.toLowerCase();
    
    switch (chainLower) {
      case 'ethereum':
      case 'eth':
        return await getEthereumGasPrice();
      case 'base':
        return await getBaseGasPrice();
      case 'polygon':
      case 'matic':
        return await getPolygonGasPrice();
      case 'bsc':
      case 'binance':
        return await getBSCGasPrice();
      case 'arbitrum':
        return await getArbitrumGasPrice();
      case 'optimism':
        return await getOptimismGasPrice();
      case 'solana':
      case 'sol':
        return await getSolanaGasPrice();
      case 'sui':
        return await getSuiGasPrice();
      case 'aptos':
      case 'apt':
        return await getAptosGasPrice();
      case 'near':
        return await getNearGasPrice();
      case 'avalanche':
      case 'avax':
        return await getAvalancheGasPrice();
      default:
        return await getAllGasPrices();
    }
  } catch (error) {
    log('error', 'Gas price error', { error: error.message });
    return null;
  }
}

async function getEthereumGasPrice() {
  try {
    // Try multiple gas APIs for better reliability
    const apis = [
      'https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=' + (process.env.ETHERSCAN_API_KEY || ''),
      'https://ethgasstation.info/api/ethgasAPI.json',
      'https://api.blocknative.com/gasprice'
    ];
    
    for (const apiUrl of apis) {
      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (apiUrl.includes('etherscan') && data.status === '1') {
          return {
            chain: 'Ethereum',
            slow: parseInt(data.result.SafeGasPrice),
            standard: parseInt(data.result.ProposeGasPrice),
            fast: parseInt(data.result.FastGasPrice),
            instant: parseInt(data.result.FastGasPrice),
            source: 'Etherscan',
            timestamp: new Date().toISOString()
          };
        } else if (apiUrl.includes('ethgasstation') && data.safeLow) {
          return {
            chain: 'Ethereum',
            slow: Math.round(data.safeLow / 10),
            standard: Math.round(data.average / 10),
            fast: Math.round(data.fast / 10),
            instant: Math.round(data.fastest / 10),
            source: 'ETH Gas Station',
            timestamp: new Date().toISOString()
          };
        }
      } catch (apiError) {
        log('warn', `Gas API failed: ${apiUrl}`, { error: apiError.message });
        continue;
      }
    }
    
    // Fallback to estimated values
    return {
      chain: 'Ethereum',
      slow: 20,
      standard: 25,
      fast: 30,
      instant: 35,
      source: 'Estimated',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'Ethereum gas API error', { error: error.message });
    return null;
  }
}

async function getBaseGasPrice() {
  try {
    // Base uses Ethereum gas pricing but much lower
    const ethGas = await getEthereumGasPrice();
    if (ethGas) {
      return {
        chain: 'Base',
        slow: Math.round(ethGas.slow * 0.1),
        standard: Math.round(ethGas.standard * 0.1),
        fast: Math.round(ethGas.fast * 0.1),
        instant: Math.round(ethGas.instant * 0.1),
        source: 'Base Network (estimated)',
        timestamp: new Date().toISOString()
      };
    }
    return null;
  } catch (error) {
    log('error', 'Base gas API error', { error: error.message });
    return null;
  }
}

async function getPolygonGasPrice() {
  try {
    const response = await fetch('https://gasstation-mainnet.matic.network/');
    const data = await response.json();
    
    if (data && data.standard) {
      return {
        chain: 'Polygon',
        slow: Math.round(data.safeLow),
        standard: Math.round(data.standard),
        fast: Math.round(data.fast),
        instant: Math.round(data.fastest),
        source: 'Polygon Gas Station',
        timestamp: new Date().toISOString()
      };
    }
    
    // Fallback to estimated values
    return {
      chain: 'Polygon',
      slow: 30,
      standard: 40,
      fast: 50,
      instant: 60,
      source: 'Estimated',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'Polygon gas API error', { error: error.message });
    return {
      chain: 'Polygon',
      slow: 30,
      standard: 40,
      fast: 50,
      instant: 60,
      source: 'Estimated',
      timestamp: new Date().toISOString()
    };
  }
}

async function getBSCGasPrice() {
  try {
    if (process.env.ETHERSCAN_API_KEY) {
      const response = await fetch(`https://api.bscscan.com/api?module=gastracker&action=gasoracle&apikey=${process.env.ETHERSCAN_API_KEY}`);
      const data = await response.json();
      
      if (data.status === '1' && data.result) {
        return {
          chain: 'BSC',
          slow: parseInt(data.result.SafeGasPrice),
          standard: parseInt(data.result.ProposeGasPrice),
          fast: parseInt(data.result.FastGasPrice),
          instant: parseInt(data.result.FastGasPrice),
          source: 'BSC Scan',
          timestamp: new Date().toISOString()
        };
      }
    }
    
    // Fallback to estimated values
    return {
      chain: 'BSC',
      slow: 3,
      standard: 5,
      fast: 7,
      instant: 10,
      source: 'Estimated',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'BSC gas API error', { error: error.message });
    return {
      chain: 'BSC',
      slow: 3,
      standard: 5,
      fast: 7,
      instant: 10,
      source: 'Estimated',
      timestamp: new Date().toISOString()
    };
  }
}

async function getArbitrumGasPrice() {
  try {
    // Arbitrum gas is very low, estimated
    return {
      chain: 'Arbitrum',
      slow: 0.1,
      standard: 0.2,
      fast: 0.5,
      instant: 1.0,
      source: 'Arbitrum (estimated)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'Arbitrum gas API error', { error: error.message });
    return null;
  }
}

async function getOptimismGasPrice() {
  try {
    // Optimism gas is very low, estimated
    return {
      chain: 'Optimism',
      slow: 0.1,
      standard: 0.2,
      fast: 0.5,
      instant: 1.0,
      source: 'Optimism (estimated)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'Optimism gas API error', { error: error.message });
    return null;
  }
}

// Non-EVM Gas Price Functions
async function getSolanaGasPrice() {
  try {
    // Solana uses different fee structure (lamports)
    return {
      chain: 'Solana',
      slow: 0.000005, // 5000 lamports
      standard: 0.000005, // 5000 lamports
      fast: 0.000005, // 5000 lamports
      instant: 0.000005, // 5000 lamports
      unit: 'SOL',
      source: 'Solana (fixed fee)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'Solana gas API error', { error: error.message });
    return null;
  }
}

async function getSuiGasPrice() {
  try {
    // Sui uses SUI tokens for gas
    return {
      chain: 'Sui',
      slow: 0.001, // 0.001 SUI
      standard: 0.001, // 0.001 SUI
      fast: 0.001, // 0.001 SUI
      instant: 0.001, // 0.001 SUI
      unit: 'SUI',
      source: 'Sui (estimated)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'Sui gas API error', { error: error.message });
    return null;
  }
}

async function getAptosGasPrice() {
  try {
    // Aptos uses APT tokens for gas
    return {
      chain: 'Aptos',
      slow: 0.0001, // 0.0001 APT
      standard: 0.0001, // 0.0001 APT
      fast: 0.0001, // 0.0001 APT
      instant: 0.0001, // 0.0001 APT
      unit: 'APT',
      source: 'Aptos (estimated)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'Aptos gas API error', { error: error.message });
    return null;
  }
}

async function getNearGasPrice() {
  try {
    // NEAR uses NEAR tokens for gas
    return {
      chain: 'NEAR',
      slow: 0.0001, // 0.0001 NEAR
      standard: 0.0001, // 0.0001 NEAR
      fast: 0.0001, // 0.0001 NEAR
      instant: 0.0001, // 0.0001 NEAR
      unit: 'NEAR',
      source: 'NEAR (estimated)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'NEAR gas API error', { error: error.message });
    return null;
  }
}

async function getAvalancheGasPrice() {
  try {
    // Avalanche C-Chain uses AVAX for gas (1 AVAX = 1,000,000,000 nAVAX)
    // Current gas prices are around 0.48 nAVAX based on official data
    return {
      chain: 'Avalanche',
      slow: 0.48, // 0.48 nAVAX
      standard: 0.48, // 0.48 nAVAX
      fast: 0.48, // 0.48 nAVAX
      instant: 0.48, // 0.48 nAVAX
      unit: 'nAVAX',
      source: 'Avalanche (estimated)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'Avalanche gas API error', { error: error.message });
    return null;
  }
}

async function getAllGasPrices() {
  try {
    const [eth, base, polygon, bsc, arbitrum, optimism, solana, sui, aptos, near, avalanche] = await Promise.all([
      getEthereumGasPrice(),
      getBaseGasPrice(),
      getPolygonGasPrice(),
      getBSCGasPrice(),
      getArbitrumGasPrice(),
      getOptimismGasPrice(),
      getSolanaGasPrice(),
      getSuiGasPrice(),
      getAptosGasPrice(),
      getNearGasPrice(),
      getAvalancheGasPrice()
    ]);
    
    return {
      chains: [eth, base, polygon, bsc, arbitrum, optimism, solana, sui, aptos, near, avalanche].filter(Boolean),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log('error', 'All gas prices error', { error: error.message });
    return null;
  }
}

// ==================== DEFI & YIELD FUNCTIONS ====================

async function getDeFiData(protocol) {
  try {
    const response = await fetch('https://api.llama.fi/protocols');
    const data = await response.json();
    
    if (protocol) {
      const foundProtocol = data.find(p => 
        p.name.toLowerCase().includes(protocol.toLowerCase()) ||
        p.slug.toLowerCase().includes(protocol.toLowerCase())
      );
      
      if (foundProtocol) {
        return {
          name: foundProtocol.name,
          tvl: foundProtocol.tvl,
          change24h: foundProtocol.change_1d,
          chains: foundProtocol.chains,
          category: foundProtocol.category,
          url: foundProtocol.url,
          twitter: foundProtocol.twitter,
          description: foundProtocol.description,
          source: 'DeFiLlama'
        };
      }
    }
    
    return data.slice(0, 20); // Return top 20 protocols
  } catch (error) {
    log('error', 'DeFi data error', { error: error.message });
    return null;
  }
}

// ==================== GAMING FUNCTIONS ====================

async function getGamingData(query) {
  try {
    const response = await fetch('https://api.dappradar.com/v2/dapps');
    const data = await response.json();
    
    if (query) {
      const gameQuery = query.toLowerCase();
      const games = data.dapps.filter(dapp => 
        dapp.category === 'games' && (
          dapp.name.toLowerCase().includes(gameQuery) ||
          dapp.description.toLowerCase().includes(gameQuery)
        )
      );
      
      return games.slice(0, 10);
    }
    
    const games = data.dapps.filter(dapp => dapp.category === 'games');
    return games.slice(0, 20);
  } catch (error) {
    log('error', 'Gaming data error', { error: error.message });
    return null;
  }
}

// ==================== MESSAGE HANDLING ====================

agent.on('text', async (ctx) => {
  try {
    const userMessage = ctx.message.content;
    const senderAddress = ctx.message.senderAddress || await ctx.getSenderAddress?.() || 'unknown';
    const isGroupChat = ctx.message.groupId !== undefined;
    const isReplyToAgent = ctx.message.replyTo?.senderAddress === agent.address;
    const isMentioned = userMessage.includes('@dragman') || userMessage.includes('@Dragman');
    
    log('info', 'Message received', { 
      sender: senderAddress, 
      message: userMessage,
      isGroupChat,
      isReplyToAgent,
      isMentioned
    });

    // React to show we received the message
    await ctx.sendReaction('👀');

    // Handle group chat messages - only respond if mentioned or replied to
    if (isGroupChat && !isMentioned && !isReplyToAgent) {
      return; // Don't respond to group messages unless mentioned
    }

    // Check for specific commands
    const response = await handleDragmanCommands(ctx, userMessage, senderAddress);
    
    if (response) {
      await ctx.sendText(response);
    log('info', 'Dragman response sent', { 
      sender: senderAddress,
        response: response.substring(0, 100) + '...'
      });
    } else {
      // No specific command found, show Quick Actions for general messages
      const message = userMessage.toLowerCase().trim();
      if (message.length > 0 && !message.includes('@dragman')) {
        // Check if it's a greeting
        if (message.includes('hello') || message.includes('hi') || message.includes('hey') || 
            message.includes('help') || message.includes('start') || message.includes('menu')) {
          await ctx.sendText('🐉 Welcome to Dragman Agent! I\'m your comprehensive crypto assistant.');
        } else {
          await ctx.sendText('🐉 Dragman Agent - Your crypto assistant');
        }
        await sendMainQuickActions(ctx);
      }
    }

  } catch (error) {
    log('error', 'Error handling message', { error: error.message });
    try {
      await ctx.sendText('❌ Sorry, I encountered an error. Please try again.');
    } catch (sendError) {
      log('error', 'Failed to send error message', { error: sendError.message });
    }
  }
});

// Handle Intent messages (Quick Actions responses)
agent.on('coinbase.com/intent:1.0', async (ctx) => {
  try {
    const intentData = ctx.message.content;
    const { id, actionId, metadata } = intentData;
    
    log('info', 'Intent received', { id, actionId, metadata });
    
    // React to show we received the intent
    await ctx.sendReaction('⌛');
    
    // Handle different actions based on actionId
    switch (actionId) {
      // Main feature actions
      case 'check_price':
        await ctx.sendText('💰 Price Tracking - Choose a token:');
        await sendPriceQuickActions(ctx);
        break;
      case 'gas_price':
        await ctx.sendText('⛽ Gas Prices - Choose a network:');
        await sendGasQuickActions(ctx);
        break;
      case 'defi_yield':
        await ctx.sendText('🏦 DeFi & Yield - Choose an option:');
        await sendDeFiQuickActions(ctx);
        break;
      case 'gaming':
        await ctx.sendText('🎮 Gaming - Choose an option:');
        await sendGamingQuickActions(ctx);
        break;
      case 'bridge':
        const bridgeResponse = handleBridgeQuery('bridge');
        if (bridgeResponse) {
          await ctx.sendText(bridgeResponse);
        }
        break;
      
      // Price actions
      case 'price_eth':
        const ethPrice = await getTokenPrice('ETH');
        if (ethPrice) {
          await ctx.sendText(formatPriceResponse(ethPrice));
        }
        break;
      case 'price_btc':
        const btcPrice = await getTokenPrice('BTC');
        if (btcPrice) {
          await ctx.sendText(formatPriceResponse(btcPrice));
        }
        break;
      case 'price_sol':
        const solPrice = await getTokenPrice('SOL');
        if (solPrice) {
          await ctx.sendText(formatPriceResponse(solPrice));
        }
        break;
      case 'price_custom':
        await ctx.sendText('Type the token symbol you want to check (e.g., "ETH", "BTC", "SOL")');
        break;
      
      // Gas actions
      case 'gas_ethereum':
        const ethGas = await getGasPrice('ethereum');
        if (ethGas) {
          await ctx.sendText(formatGasResponse(ethGas));
        }
        break;
      case 'gas_base':
        const baseGas = await getGasPrice('base');
        if (baseGas) {
          await ctx.sendText(formatGasResponse(baseGas));
        }
        break;
      case 'gas_polygon':
        const polygonGas = await getGasPrice('polygon');
        if (polygonGas) {
          await ctx.sendText(formatGasResponse(polygonGas));
        }
        break;
      case 'gas_all':
        const allGas = await getAllGasPrices();
        if (allGas) {
          await ctx.sendText(formatAllGasResponse(allGas));
        }
        break;
      
      // DeFi actions
      case 'defi_top':
        const topDeFi = await getDeFiData();
        if (topDeFi) {
          await ctx.sendText(formatTopDeFiResponse(topDeFi));
        }
        break;
      case 'defi_uniswap':
        const uniswapData = await getDeFiData('uniswap');
        if (uniswapData) {
          await ctx.sendText(formatDeFiResponse(uniswapData));
        }
        break;
      case 'defi_aave':
        const aaveData = await getDeFiData('aave');
        if (aaveData) {
          await ctx.sendText(formatDeFiResponse(aaveData));
        }
        break;
      case 'defi_yield':
        const yieldData = await getDeFiData();
        if (yieldData) {
          await ctx.sendText(formatTopDeFiResponse(yieldData));
        }
        break;
      
      // Gaming actions
      case 'gaming_top':
        const topGames = await getGamingData();
        if (topGames) {
          await ctx.sendText(formatTopGamingResponse(topGames));
        }
        break;
      case 'gaming_axie':
        const axieData = await getGamingData('axie');
        if (axieData && axieData.length > 0) {
          await ctx.sendText(formatGamingResponse(axieData));
        }
        break;
      case 'gaming_sandbox':
        const sandboxData = await getGamingData('sandbox');
        if (sandboxData && sandboxData.length > 0) {
          await ctx.sendText(formatGamingResponse(sandboxData));
        }
        break;
      case 'gaming_gamefi':
        const gamefiData = await getGamingData();
        if (gamefiData) {
          await ctx.sendText(formatTopGamingResponse(gamefiData));
        }
        break;
      
      default:
        await ctx.sendText('❓ I\'m not sure what you selected. Please try again!');
    }
  } catch (error) {
    log('error', 'Error handling intent', { error: error.message });
    await ctx.sendText('❌ Sorry, I had trouble processing your selection. Please try again.');
  }
});

// ==================== COMMAND HANDLING ====================

async function handleDragmanCommands(ctx, userMessage, senderAddress) {
  const message = userMessage.toLowerCase().trim();
  
  // 0. NUMBER-BASED QUICK ACTIONS (1-5)
  if (message === '1' || message === '1️⃣') {
    return `💰 Check Price

Track real-time cryptocurrency prices with comprehensive market data.

Features:
• Real-time price tracking for 1000+ tokens
• 1h, 24h, 7d, 30d price changes
• Market cap and volume data
• Sentiment analysis
• Official links to CoinMarketCap and DexScreener

Examples:
• "price ETH" - Ethereum price
• "check price BTC" - Bitcoin price
• "price SOL" - Solana price
• "check price MATIC" - Polygon price

Try: "price ETH" to see Ethereum's current price!

💡 Tip: Type "hello" to return to main menu`;
  }
  if (message === '2' || message === '2️⃣') {
    return `⛽ Gas Prices

Monitor real-time gas prices across multiple blockchain networks.

Features:
• EVM chains: Ethereum, Base, Polygon, BSC, Arbitrum, Optimism
• Non-EVM chains: Solana, Sui, Aptos, NEAR, Avalanche
• Slow, Standard, Fast, Instant gas tiers
• Real-time updates with sources

Examples:
• "gas base" - Base network gas prices
• "gas ethereum" - Ethereum gas prices
• "gas" - All network gas prices
• "gas polygon" - Polygon gas prices

Try: "gas base" to see Base network gas prices!

💡 Tip: Type "hello" to return to main menu`;
  }
  if (message === '3' || message === '3️⃣') {
    return `🏦 DeFi & Yield

Your comprehensive DeFi expert for all decentralized finance discussions.

Features:
• Complete DeFi ecosystem knowledge
• Yield farming and liquidity mining strategies
• Protocol analysis and security assessment
• Cross-chain DeFi opportunities
• Bridge protocols and interoperability
• DeFi risk management and best practices
• Token economics and governance
• DeFi trends and market analysis

Discuss anything DeFi:
• Protocol analysis (Uniswap, Aave, Compound, etc.)
• Yield farming strategies and opportunities
• DeFi security and risk assessment
• Cross-chain bridges and Layer 2 solutions
• Bridge protocols (Jumper Exchange, LayerZero, etc.)
• Token launches and governance
• DeFi market trends and analysis
• Project safety evaluation
• DeFi education and tutorials

Ask me anything about DeFi - I'll provide detailed analysis and insights!

💡 Tip: Type "hello" to return to main menu`;
  }
  if (message === '4' || message === '4️⃣') {
    return `🎮 Gaming

Your comprehensive gaming companion for all types of games worldwide.

Features:
• All gaming platforms: Mobile, PC, Console, Steam, Epic Games
• GameFi and Play-to-Earn projects
• Traditional games and indie titles
• Gaming news and updates
• Official game links and downloads
• Gaming communities and forums
• Farcaster/Base App gaming MiniApps

Chat about any game:
• Mobile games (PUBG Mobile, Clash of Clans, etc.)
• PC games (Steam, Epic Games, etc.)
• Console games (PlayStation, Xbox, Nintendo)
• GameFi projects (Axie Infinity, The Sandbox, etc.)
• Indie games and upcoming releases
• Gaming hardware and accessories

Just ask about any game you're interested in!

💡 Tip: Type "hello" to return to main menu`;
  }
  
  if (message === '5' || message === '5️⃣') {
    return `🟦 Base

Your comprehensive Base.org and Base ecosystem specialist.

Base.org Features:
• Base App - Social network, apps, payments, finance
• Base Build - Developer tools and resources
• Base Pay - Payment solutions
• Base Names - Human-readable wallet addresses
• Base Community - Discord, Reddit, X, events
• Base Scan - Blockchain explorer
• Base Gas Credits - Developer gas optimization

Base Ecosystem Categories:
• DeFi - DEXs, lending, yield farming
• AI - AI-powered applications
• Wallet - Wallet solutions
• Consumer - Consumer apps
• Onramp - Fiat onramp solutions
• Infrastructure - Infrastructure tools
• Gaming - Gaming and GameFi projects

Ask me about Base.org features or get recommendations from Base ecosystem!

💡 Tip: Type "hello" to return to main menu`;
  }
  
  // 1. GAS PRICE TRACKING (check this first to avoid confusion with price)
  if (message.includes('gas price') || (message.includes('gas') && !message.includes('price'))) {
    const gasMatch = userMessage.match(/(?:gas price|gas)\s+(.+)/i);
    if (gasMatch) {
      const chain = gasMatch[1].trim();
      const gasData = await getGasPrice(chain);
      
      if (gasData) {
        return formatGasResponse(gasData);
      } else {
        return `❌ Couldn't get gas data for ${chain}. Try: "gas price ethereum" or "gas base"`;
      }
    } else if (message.includes('gas')) {
      // Show all gas prices
      const allGasData = await getAllGasPrices();
      if (allGasData) {
        return formatAllGasResponse(allGasData);
      }
    }
  }
  
  // 2. PRICE TRACKING
  if (message.includes('check price') || (message.includes('price') && !message.includes('gas'))) {
    const tokenMatch = userMessage.match(/(?:check price|price)\s+(.+)/i);
    if (tokenMatch) {
      const token = tokenMatch[1].trim();
      const priceData = await getTokenPrice(token);
      
      if (priceData) {
        return formatPriceResponse(priceData);
      } else {
        return `❌ Couldn't find price data for ${token}. Try: "check price ETH" or "price bitcoin"`;
      }
    }
  }
  
  // 3. DEFI & YIELD
  if (message.includes('defi') || message.includes('yield') || message.includes('protocol') || 
      message.includes('swap') || message.includes('dex') || message.includes('exchange')) {
    // Check for Base-specific DeFi queries
    if (message.includes('base') && (message.includes('swap') || message.includes('dex') || message.includes('exchange'))) {
      return await generateDragmanResponse(`Tell me about swapping and DEX options on Base Chain. Include Uniswap V3, SushiSwap, and other Base DEXs. Focus on Base-specific swapping options.`);
    }
    
    const defiMatch = userMessage.match(/(?:defi|yield|protocol|swap|dex|exchange)\s+(.+)/i);
    if (defiMatch) {
      const protocol = defiMatch[1].trim();
      const defiData = await getDeFiData(protocol);
      
      if (defiData) {
        return formatDeFiResponse(defiData);
      }
    } else {
      const defiData = await getDeFiData();
      if (defiData) {
        return formatTopDeFiResponse(defiData);
      }
    }
  }
  
  // 4. BRIDGE PROTOCOLS (specific commands only)
  if ((message.includes('bridge') && (message.includes('protocol') || message.includes('exchange') || message.includes('cross-chain') || message.includes('transfer'))) ||
      message.includes('jumper exchange') || message.includes('layerzero') || message.includes('stargate') ||
      message.includes('wormhole') || message.includes('synapse') || message.includes('hop protocol')) {
    return handleBridgeQuery(userMessage);
  }
  
  // 4. GAMING
  if (message.includes('game') || message.includes('gamefi') || message.includes('gaming')) {
    const gameMatch = userMessage.match(/(?:game|gamefi|gaming)\s+(.+)/i);
    if (gameMatch) {
      const gameQuery = gameMatch[1].trim();
      const gameData = await getGamingData(gameQuery);
      
      if (gameData && gameData.length > 0) {
        return formatGamingResponse(gameData);
      }
    } else {
      const gameData = await getGamingData();
      if (gameData) {
        return formatTopGamingResponse(gameData);
      }
    }
  }
  
  // 5. BASENAMES (Base Name Service) - Check this first
  if (message.includes('basename') || message.includes('base name') || message.includes('base domain') || 
      (message.includes('name') && message.includes('base')) || message.includes('bns')) {
    return await generateDragmanResponse(`Tell me about Basenames (Base Name Service) on Base chain. Include registration process, pricing, free options, and how to use them.`);
  }
  
  // 6. BASE ECOSYSTEM - Comprehensive Base.org and Base Chain queries
  if ((message.includes('base app') || message.includes('base.org') || message.includes('base chain') || 
       message.includes('base build') || message.includes('base pay') || message.includes('base scan') ||
       message.includes('base community') || message.includes('base names') || message.includes('base gas credits') ||
       message.includes('base engineering') || message.includes('base support') || message.includes('base brand') ||
       message.includes('base events') || message.includes('base vision') || message.includes('base blog') ||
       message.includes('base jobs') || message.includes('base terms') || message.includes('base ecosystem') ||
       message.includes('base defi') || message.includes('base ai') || message.includes('base wallet') ||
       message.includes('base consumer') || message.includes('base onramp') || message.includes('base infra')) && 
      !message.includes('price') && !message.includes('gas')) {
    const baseMatch = userMessage.match(/(?:base app|base\.org|base chain|base build|base pay|base scan|base community|base names|base gas credits|base engineering|base support|base brand|base events|base vision|base blog|base jobs|base terms|base ecosystem|base defi|base ai|base wallet|base consumer|base onramp|base infra)\s+(.+)/i);
    if (baseMatch) {
      const baseQuery = baseMatch[1].trim();
      return await generateDragmanResponse(`Tell me about ${baseQuery} specifically related to Base.org features or Base ecosystem. Focus on Base-specific information only.`);
    } else {
      return await generateDragmanResponse(`Tell me about Base.org features or Base ecosystem. Focus on Base App, Base Build, Base Pay, Base Names, Base Community, Base Scan, and other Base.org services.`);
    }
  }
  
  // Check for greeting messages and show Quick Actions
  if (message.includes('hello') || message.includes('hi') || message.includes('hey') || 
      message.includes('help') || message.includes('start') || message.includes('menu') ||
      message.includes('good morning') || message.includes('good afternoon') || message.includes('good evening') ||
      message.includes('gm') || message.includes('gn') || message.includes('morning') || message.includes('evening') ||
      message.includes('feature') || message.includes('features') || message.includes('show') || message.includes('list')) {
    return null; // Return null to trigger Quick Actions in main handler
  }
  
  // Default AI response for other messages
  return await generateDragmanResponse(userMessage, senderAddress);
}

// ==================== BRIDGE PROTOCOL HANDLING ====================

function handleBridgeQuery(userMessage) {
  const message = userMessage.toLowerCase();
  
  if (message.includes('jumper') || message.includes('stargate')) {
    return `🌉 Jumper Exchange (Stargate) 🌉

Jumper Exchange is a multi-chain bridge powered by LayerZero technology.

Features:
• Cross-chain swaps between 15+ networks
• Native asset bridging
• Unified liquidity pools
• LayerZero security model

Supported Chains:
• Ethereum, Base, Arbitrum, Optimism
• Polygon, BSC, Avalanche
• Fantom, Moonbeam, Metis

Official Links:
• [Jumper Exchange](https://jumper.exchange/)
• [X (Twitter)](https://x.com/JumperExchange)
• [Documentation](https://docs.jumper.exchange/)

Security: Audited by LayerZero team
Status: ✅ Active and secure`;
  }
  
  if (message.includes('layerzero')) {
    return `🔗 LayerZero Protocol 🔗

LayerZero is a cross-chain messaging protocol enabling seamless communication between blockchains.

Key Features:
• Omnichain interoperability
• Cross-chain applications (dApps)
• Unified liquidity
• Secure message passing

Supported Networks:
• Ethereum, Base, Arbitrum, Optimism
• Polygon, BSC, Avalanche, Fantom
• And many more...

Official Links:
• [LayerZero](https://layerzero.network/)
• [X (Twitter)](https://x.com/LayerZero_Labs)
• [Documentation](https://docs.layerzero.network/)

Security: ✅ Audited and battle-tested`;
  }
  
  if (message.includes('bridge')) {
    return `🌉 Cross-Chain Bridge Protocols 🌉

Top Bridge Protocols:

1. **Jumper Exchange (Stargate)**
   - Multi-chain swaps
   - LayerZero powered
   - [jumper.exchange](https://jumper.exchange/)

2. **LayerZero**
   - Cross-chain messaging
   - Omnichain dApps
   - [layerzero.network](https://layerzero.network/)

3. **Wormhole**
   - Cross-chain bridge
   - [wormhole.com](https://wormhole.com/)

4. **Synapse**
   - Cross-chain bridge
   - [synapseprotocol.com](https://synapseprotocol.com/)

5. **Hop Protocol**
   - Layer 2 bridge
   - [hop.exchange](https://hop.exchange/)

⚠️ Always verify official links and never use suspicious bridges!`;
  }
  
  return null;
}

// Helper function to get emoji based on percentage change
function getChangeEmoji(change) {
  if (change === null || change === undefined) return '';
  
  if (change >= 40) return '🚀'; // Moon (very bullish)
  if (change >= 10) return '🐂'; // Bull (bullish)
  if (change >= 1) return '📈'; // Uptrend (positive)
  if (change >= -1) return '➡️'; // Sideways (neutral)
  if (change >= -10) return '📉'; // Downtrend (negative)
  if (change >= -40) return '🐻'; // Bear (bearish)
  return '💀'; // Skull (crash)
}

// ==================== RESPONSE FORMATTING ====================

function formatPriceResponse(data) {
  const changeEmoji = data.change24h >= 0 ? '📈' : '📉';
  const changeColor = data.change24h >= 0 ? '🟢' : '🔴';
  
  let response = `💰 ${data.name} (${data.symbol}) 💰

Price: $${data.price.toFixed(6)}
Market Cap: $${(data.marketCap / 1000000000).toFixed(2)}B
24h Volume: $${(data.volume24h / 1000000).toFixed(2)}M

📊 Price Changes:
• 1h: ${data.change1h ? getChangeEmoji(data.change1h) + ' ' + data.change1h.toFixed(2) + '%' : 'N/A'}
• 24h: ${getChangeEmoji(data.change24h)} ${data.change24h.toFixed(2)}% ${changeColor}
• 7d: ${data.change7d ? getChangeEmoji(data.change7d) + ' ' + data.change7d.toFixed(2) + '%' : 'N/A'}
• 30d: ${data.change30d ? getChangeEmoji(data.change30d) + ' ' + data.change30d.toFixed(2) + '%' : 'N/A'}

🎯 Sentiment: ${data.sentiment?.emoji} ${data.sentiment?.text} ${data.sentiment?.color}

Chain: ${data.chain || 'Multiple'}
Source: ${data.source}

🔗 Links:
• [CoinMarketCap](${data.url})
• [DexScreener](https://dexscreener.com/)

⏰ Updated: ${new Date(data.timestamp).toLocaleTimeString()}`;

  return response;
}

function formatGasResponse(data) {
  const unit = data.unit || 'gwei';
  
  return `⛽ ${data.chain} Gas Prices ⛽

🐌 Slow: ${data.slow} ${unit}
🚗 Standard: ${data.standard} ${unit}
🚀 Fast: ${data.fast} ${unit}
⚡ Instant: ${data.instant} ${unit}

Source: ${data.source}
⏰ Updated: ${new Date(data.timestamp).toLocaleTimeString()}

💡 Pro Tip: Use Base for lowest fees! 🎯`;
}

function formatAllGasResponse(data) {
  let response = `⛽ All Network Gas Prices ⛽\n\n`;
  
  data.chains.forEach(chain => {
    const unit = chain.unit || 'gwei';
    response += `${chain.chain}: ${chain.standard} ${unit} (${chain.source})\n`;
  });
  
  response += `\n💡 Recommendation: Base has the lowest fees!\n⏰ Updated: ${new Date(data.timestamp).toLocaleTimeString()}`;
  
  return response;
}

function formatDeFiResponse(data) {
  const changeEmoji = data.change24h >= 0 ? '📈' : '📉';
  
  return `🏦 ${data.name} 🏦

TVL: $${(data.tvl / 1000000000).toFixed(2)}B
24h Change: ${changeEmoji} ${data.change24h.toFixed(2)}%
Category: ${data.category}
Chains: ${data.chains.join(', ')}

🔗 Links:
• [Official Website](${data.url})
${data.twitter ? `• [X (Twitter)](https://x.com/${data.twitter})` : ''}

📝 Description: ${data.description || 'No description available'}

Source: ${data.source}`;
}

function formatTopDeFiResponse(data) {
  let response = `🏦 Top DeFi Protocols 🏦\n\n`;
  
  data.slice(0, 10).forEach((protocol, index) => {
    response += `${index + 1}. ${protocol.name} - $${(protocol.tvl / 1000000000).toFixed(2)}B TVL\n`;
  });
  
  response += `\n💡 Ask: "defi uniswap" for specific protocol info!`;
  
  return response;
}

function formatGamingResponse(data) {
  let response = `🎮 Gaming Projects 🎮\n\n`;
  
  data.slice(0, 5).forEach((game, index) => {
    response += `${index + 1}. ${game.name}\n`;
    response += `   📊 Users: ${game.users24h || 'N/A'}\n`;
    response += `   🔗 [Play Now](${game.url})\n\n`;
  });
  
  response += `💡 Ask: "game [name]" for specific game info!`;
  
  return response;
}

function formatTopGamingResponse(data) {
  let response = `🎮 Top Gaming Projects 🎮\n\n`;
  
  data.slice(0, 10).forEach((game, index) => {
    response += `${index + 1}. ${game.name} - ${game.users24h || 'N/A'} users\n`;
  });
  
  response += `\n💡 Ask: "game [name]" for specific game info!`;
  
  return response;
}

// ==================== AI RESPONSE GENERATION ====================

async function generateDragmanResponse(userMessage, senderAddress) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are Dragman, a comprehensive crypto expert integrated into Base App. You have extensive knowledge about:

CRYPTOCURRENCY ECOSYSTEM (COMPREHENSIVE):
- All major cryptocurrencies (Bitcoin, Ethereum, Solana, Cardano, Polkadot, etc.)
- Complete DeFi ecosystem knowledge and analysis
- DeFi protocols (Uniswap, Aave, Compound, Curve, Balancer, MakerDAO, etc.)
- Yield farming and liquidity mining strategies
- Staking mechanisms and governance tokens
- NFT marketplaces and projects
- GameFi and Play-to-Earn games
- Cross-chain bridges and interoperability solutions
- DeFi security analysis and risk assessment
- Token economics and governance models
- DeFi market trends and protocol comparisons
- Layer 2 solutions and scaling mechanisms
- DeFi education and best practices

BRIDGE PROTOCOLS (CRITICAL KNOWLEDGE):
- Jumper Exchange (Stargate) - Multi-chain bridge
- LayerZero - Cross-chain messaging protocol
- Wormhole - Cross-chain bridge
- Multichain - Cross-chain router
- Synapse - Cross-chain bridge
- Hop Protocol - Layer 2 bridge
- Across Protocol - Cross-chain bridge
- Celer Network - Cross-chain bridge
- Chainlink CCIP - Cross-chain protocol
- Axelar - Cross-chain communication

LAYER 2 & SCALING:
- Base, Arbitrum, Optimism, Polygon
- zkSync, StarkNet, Scroll
- Lightning Network, Plasma

BASE ECOSYSTEM (COMPREHENSIVE KNOWLEDGE):
- BASE CHAIN: Coinbase's Layer 2 solution built on Optimism's OP Stack
- BASE FEATURES: Low fees, fast transactions, Ethereum compatibility, Coinbase integration
- BASE DEFI PROTOCOLS: Uniswap V3, Aave V3, Compound, Curve, Balancer, SushiSwap
- BASE NFT MARKETPLACES: OpenSea, Blur, LooksRare, Foundation
- BASE GAMING: Base-specific GameFi projects and gaming dApps
- BASE BRIDGES: Official Base Bridge, Jumper Exchange, LayerZero, Wormhole
- BASE DEVELOPMENT: Base SDK, Base documentation, developer tools
- BASE COMMUNITY: Base Discord, Base Twitter, Base events and meetups
- BASE ECOSYSTEM PROJECTS: Friend.tech, Basenames, Base-specific tokens
- BASE GAS OPTIMIZATION: Base gas strategies, transaction optimization
- BASE SECURITY: Base security features, audit reports, safety measures
- BASE INTEGRATION: Coinbase Wallet integration, Base App features
- BASE ROADMAP: Base development timeline, upcoming features
- BASE PARTNERSHIPS: Base ecosystem partnerships and collaborations
- BASE EDUCATION: Base tutorials, guides, and learning resources

BASE.ORG FEATURES (COMPREHENSIVE):
- BASE APP: Social network, apps, payments, and finance in one place
- BASE BUILD: Developer tools and resources for building on Base
- BASE PAY: Payment solutions and financial services
- BASE ECOSYSTEM: Projects, protocols, and applications on Base (https://www.base.org/ecosystem)
- BASE COMMUNITY: Discord, Reddit, X (Twitter), Base App social features
- BASE NAMES: Human-readable names for wallet addresses (https://www.base.org/names)
- BASE SCAN: Blockchain explorer for Base Chain
- BASE GAS CREDITS: Gas optimization and credits for developers
- BASE ENGINEERING BLOG: Technical updates and development insights
- BASE SUPPORT: Help and support resources
- BASE BRAND KIT: Branding resources and guidelines
- BASE EVENTS: Community events and meetups
- BASE VISION: Base's mission and goals
- BASE BLOG: News, updates, and insights
- BASE JOBS: Career opportunities at Base
- BASE TERMS: Terms of service and privacy policy

BASE ECOSYSTEM CATEGORIES (https://www.base.org/ecosystem):
- AI: AI-powered applications and tools on Base
- WALLET: Wallet solutions and services on Base
- DEFI: DeFi protocols, DEXs, lending, yield farming on Base
- CONSUMER: Consumer applications and services on Base
- ONRAMP: Fiat onramp and offramp solutions on Base
- INFRASTRUCTURE: Infrastructure tools and services on Base
- GAMING: Gaming and GameFi projects on Base
- NFT: NFT marketplaces and projects on Base
- SOCIAL: Social applications and platforms on Base
- DEVELOPER TOOLS: Development tools and resources on Base
- BRIDGE: Cross-chain bridge solutions on Base
- ANALYTICS: Analytics and data tools on Base

BASENAMES (BASE NAME SERVICE):
- BASENAMES: Human-readable names for wallet addresses on Base (like ENS for Ethereum)
- REGISTRATION: Visit https://www.base.org/names to register Basenames
- PRICING: 3 chars (0.1 ETH), 4 chars (0.01 ETH), 5-9 chars (0.001 ETH), 10+ chars (0.0001 ETH)
- FREE BASENAMES: Available for Coinbase verified users, Coinbase One, Summer Pass Level 3 NFT holders
- FEATURES: Onchain identity, simplified transactions, profile building, decentralized and open source
- TECHNOLOGY: Built on ENS protocol, fully onchain, composable with Base ecosystem
- USE CASES: Send/receive funds, connect to apps, build onchain identity, collaborate with others
- INTEGRATION: Works with base.org, Onchain Registry, Onchain Summer Pass, and other Base apps

GAMING & GAMEFI (COMPREHENSIVE):
- ALL GAMING PLATFORMS: Mobile (iOS/Android), PC (Steam, Epic Games, GOG), Console (PlayStation, Xbox, Nintendo Switch)
- TRADITIONAL GAMES: AAA titles, indie games, retro games, upcoming releases
- MOBILE GAMING: PUBG Mobile, Clash of Clans, Candy Crush, Among Us, Genshin Impact, etc.
- PC GAMING: Steam library, Epic Games Store, Battle.net, Origin, Uplay
- CONSOLE GAMING: PlayStation exclusives, Xbox Game Pass, Nintendo Switch games
- GAMING GENRES: FPS, RPG, MMO, Battle Royale, Strategy, Simulation, Sports, Racing, etc.
- GAMING HARDWARE: GPUs, CPUs, gaming peripherals, VR headsets, gaming chairs
- GAMING COMMUNITIES: Discord servers, Reddit communities, Twitch streams, YouTube gaming
- GAMING NEWS: Latest releases, updates, esports tournaments, gaming industry news
- GAMEFI & CRYPTO GAMING: Axie Infinity, The Sandbox, Decentraland, Illuvium, STEPN
- PLAY-TO-EARN: Gods Unchained, Splinterlands, Alien Worlds, CryptoBlades
- GAMING PLATFORMS: Gala Games, Enjin, Immutable X, Polygon Gaming
- GAMING TOKENS AND NFTS: In-game assets, collectibles, trading cards
- Farcaster games and MiniApps

EXCHANGES & TRADING:
- Centralized: Binance, Coinbase, Kraken
- DEXs: Uniswap, SushiSwap, PancakeSwap
- Derivatives: dYdX, GMX, Perpetual Protocol

You also have access to real-time data for:
- Price tracking (check price ETH)
- Gas prices (gas price base)
- DeFi protocols (defi uniswap)
- Gaming projects (game axie)

IMPORTANT: For gaming questions, you can discuss ANY type of game:
- Traditional games (mobile, PC, console)
- GameFi and crypto gaming
- Gaming hardware and accessories
- Gaming news and updates
- Gaming communities and platforms
- Esports and tournaments

IMPORTANT: For DeFi questions, you can discuss ANY DeFi topic:
- Protocol analysis and comparison
- Yield farming strategies and opportunities
- DeFi security and risk assessment
- Token economics and governance
- Cross-chain DeFi opportunities
- DeFi market trends and analysis
- Project safety evaluation and due diligence
- DeFi education and tutorials
- Smart contract security and audits
- DeFi risk management strategies

IMPORTANT: For Base questions, focus on ALL Base.org features and Base ecosystem:
- Base App - Social network, apps, payments, and finance in one place
- Base Build - Developer tools and resources for building on Base
- Base Pay - Payment solutions and financial services
- Base Names - Human-readable names for wallet addresses (https://www.base.org/names)
- Base Community - Discord, Reddit, X (Twitter), Base App social features
- Base Scan - Blockchain explorer for Base Chain
- Base Gas Credits - Gas optimization and credits for developers
- Base Engineering Blog - Technical updates and development insights
- Base Support - Help and support resources
- Base Brand Kit - Branding resources and guidelines
- Base Events - Community events and meetups
- Base Vision - Base's mission and goals
- Base Blog - News, updates, and insights
- Base Jobs - Career opportunities at Base
- Base Terms - Terms of service and privacy policy
- Base Ecosystem - Projects categorized by AI, Wallet, DeFi, Consumer, Onramp, Infrastructure (https://www.base.org/ecosystem)
- Base Chain technical details and features
- Base-specific DeFi protocols (Uniswap V3, SushiSwap on Base)
- Base ecosystem projects and partnerships
- Base development resources and tools
- Base security and audit information
- Base integration with Coinbase products
- Base roadmap and upcoming features
- Base-specific tips and best practices

CRITICAL: When users ask for recommendations (swap, DeFi, AI, wallet, etc.), provide 1-3 specific Base ecosystem projects from https://www.base.org/ecosystem with brief descriptions and official links.

CRITICAL: When asked about Basenames, Base Name Service, or BNS:
- Always mention https://www.base.org/names for registration
- Include pricing structure (3 chars: 0.1 ETH, 4 chars: 0.01 ETH, 5-9 chars: 0.001 ETH, 10+ chars: 0.0001 ETH)
- Mention free options for Coinbase verified users, Coinbase One, Summer Pass Level 3 NFT holders
- Explain it's like ENS but for Base chain
- Keep response focused on Basenames, not general Base ecosystem

You provide accurate, up-to-date information and always verify project legitimacy. You never recommend suspicious or potentially unsafe projects. Always prioritize user safety and provide official links only.

RESPONSE STYLE: Keep responses VERY SHORT and concise. Maximum 2-3 sentences. Be direct and informative. NO lengthy explanations. Focus only on key information. Use bullet points when helpful.

Keep responses concise but comprehensive. Be helpful and educational while maintaining security awareness.`
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    log('error', 'OpenAI API error', { error: error.message });
    return "🐉 I'm having trouble connecting to my brain right now. Please try again in a moment!";
  }
}

// ==================== AGENT STARTUP ====================

// Start the agent
await agent.start();

// Log when we're ready
agent.on('start', () => {
  log('info', `✅ Dragman Agent is online and ready!`);
  log('info', `📬 Agent address: ${agent.address}`);
  
  // Log installation info
  try {
    if (agent?.installationId) {
      log('info', `🔧 Installation ID: ${agent.installationId}`);
    }
  } catch (e) {
    // ignore installation logging errors
  }
});

// Keep the process running
process.on('SIGINT', () => {
  log('info', '🛑 Shutting down gracefully...');
  process.exit(0);
});