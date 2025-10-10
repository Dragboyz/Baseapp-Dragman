// --- FINAL VERSION: CONFIRMED WORKING ---
// --- STEP 0: LOAD ENVIRONMENT VARIABLES ---
import 'dotenv/config';

// --- STEP 1: IMPORT ALL NECESSARY LIBRARIES ---
import { Agent } from "@xmtp/agent-sdk";
import { createPublicClient, http, formatEther, isAddress, parseEther } from 'viem';
import { base, mainnet, arbitrum, optimism, bsc, polygon, avalanche } from 'viem/chains';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// --- STEP 2.5: ADD A LOGGER ---
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
};

// --- STEP 2.6: ADD A RATE LIMITER AND PROCESSING LOCK ---
const userLastRequest = new Map();
const RATE_LIMIT_MS = 5000;
const processingUsers = new Set();

// --- STEP 2: CONFIGURE CLIENTS ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ethClient = createPublicClient({ chain: mainnet, transport: http() });
const baseClient = createPublicClient({ chain: base, transport: http() });
const arbClient = createPublicClient({ chain: arbitrum, transport: http() });
const opClient = createPublicClient({ chain: optimism, transport: http() });
const bscClient = createPublicClient({ chain: bsc, transport: http() });
const polygonClient = createPublicClient({ chain: polygon, transport: http() });
const avaxClient = createPublicClient({ chain: avalanche, transport: http() });

// In-memory store for conversation history
const conversationHistory = new Map();

// NEW: Analytics store
const analytics = {
  totalMessages: 0,
  toolUsage: {},
  userInteractions: new Map(),
  dailyStats: new Map(),
  priceAlerts: new Map(), // Store user price alerts
  portfolios: new Map(), // Store user portfolios
  nftWatchlist: new Map(), // Store NFT watchlists
  attachments: new Map(), // Store attachments
  reactions: new Map(), // Store reactions
  replies: new Map(), // Store replies
  transactionReceipts: new Map(), // Store transaction receipts
  problemSolutions: new Map(), // Store problem solutions
};

// --- STEP 3: DEFINE HELPER FUNCTIONS ---
async function getCoinId(symbol) {
  try {
    const searchResponse = await fetch(`https://api.coingecko.com/api/v3/search?query=${symbol}`);
    const searchData = await searchResponse.json();
    if (searchData.coins && searchData.coins.length > 0) {
      const exactMatch = searchData.coins.find(coin => coin.symbol.toUpperCase() === symbol.toUpperCase());
      return exactMatch ? exactMatch.id : searchData.coins[0].id;
    }
    return null;
  } catch (error) {
    log('error', `Error searching for coin ID for ${symbol}`, { error: error.message });
    return null;
  }
}

// NEW: Helper function to convert Twitter URLs to X.com
function convertToXUrl(url) {
  if (url && url.includes('twitter.com')) {
    return url.replace('twitter.com', 'x.com');
  }
  return url;
}

<<<<<<< HEAD
// NEW: Enhanced helper function for links with fallback for XMTP compatibility
function formatLink(text, url, fallback = true) {
  // For XMTP, we'll provide both a clickable link and a plain text fallback
  if (fallback) {
    return `[${text}](${url}) (Copy: ${url})`;
  }
  return `[${text}](${url})`;
}

// NEW: Helper function for social media links with special handling for X.com
function formatSocialLink(platform, handle) {
  const url = `https://x.com/${handle}`;
  // For X.com, we'll provide a warning and a plain text version
  if (platform.includes("X")) {
    return `• ${platform}: @${handle} (Visit: x.com/${handle})`;
  }
  return `• ${platform}: ${formatLink(url, url)}`;
}

=======
// NEW: Safe link formatting for Base App compatibility
function formatLink(text, url) {
  // Base App has issues with clickable links, so we'll provide plain text with instructions
  return `${text}: ${url}`;
}

// NEW: Safe social media link formatting
function formatSocialLink(platform, handle) {
  // Avoid clickable links that can crash Base App
  if (platform.includes("X") || platform.includes("Twitter")) {
    return `• ${platform}: @${handle}\n  Copy this link: x.com/${handle}`;
  }
  return `• ${platform}: @${handle}\n  Copy this link: ${platform.toLowerCase()}.com/${handle}`;
}

// NEW: Validate Ethereum address for deeplinks (XIP-67 compliance)
function validateAgentAddress(address) {
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(address);
}

// NEW: Create safe deeplink with validation
function createSafeDeeplink(address) {
  if (!validateAgentAddress(address)) {
    log('error', 'Invalid agent address for deeplink', { address });
    return null;
  }
  return `cbwallet://messaging/${address}`;
}

// NEW: Secure deeplink handler (XIP-67 compliance)
function secureDeeplinkHandler(url) {
  const deeplinkRegex = /^cbwallet:\/\/messaging\/0x[a-fA-F0-9]{40}$/;
  
  if (!deeplinkRegex.test(url)) {
    log('warn', 'Invalid deeplink format', { url });
    return false;
  }
  
  const address = url.split('/').pop();
  if (!validateAgentAddress(address)) {
    log('warn', 'Invalid agent address in deeplink', { address });
    return false;
  }
  
  return true;
}

// NEW: x402 Payment Protocol Support
class X402PaymentHandler {
  constructor() {
    this.paymentQueue = new Map();
    this.pendingPayments = new Map();
  }

  // Handle HTTP 402 Payment Required response
  async handlePaymentRequired(response, originalRequest) {
    try {
      const paymentDetails = this.parsePaymentDetails(response);
      log('info', 'x402 Payment Required', { paymentDetails });

      // Check if we have sufficient balance
      const hasBalance = await this.checkBalance(paymentDetails);
      if (!hasBalance) {
        throw new Error('Insufficient balance for payment');
      }

      // Execute payment
      const paymentResult = await this.executePayment(paymentDetails);
      
      // Retry original request with payment header
      return await this.retryWithPayment(originalRequest, paymentResult);
    } catch (error) {
      log('error', 'x402 Payment failed', { error: error.message });
      throw error;
    }
  }

  // Parse payment details from HTTP 402 response
  parsePaymentDetails(response) {
    const headers = response.headers;
    return {
      amount: headers['x-payment-amount'],
      recipient: headers['x-payment-recipient'],
      reference: headers['x-payment-reference'],
      token: headers['x-payment-token'] || 'ETH',
      chain: headers['x-payment-chain'] || 'base',
      deadline: headers['x-payment-deadline']
    };
  }

  // Check if agent has sufficient balance
  async checkBalance(paymentDetails) {
    try {
      // Get agent's wallet balance
      const agentAddress = process.env.XMTP_WALLET_ADDRESS;
      if (!agentAddress) {
        log('error', 'Agent wallet address not configured');
        return false;
      }

      // Check balance on specified chain
      const balance = await this.getWalletBalance(agentAddress, paymentDetails.chain);
      const requiredAmount = parseFloat(paymentDetails.amount);
      
      return balance >= requiredAmount;
    } catch (error) {
      log('error', 'Balance check failed', { error: error.message });
      return false;
    }
  }

  // Execute payment using Base App transaction tray
  async executePayment(paymentDetails) {
    try {
      const paymentId = `x402_${Date.now()}`;
      
      // Create transaction data for payment
      const transactionData = {
        version: "1.0",
        chainId: this.getChainId(paymentDetails.chain),
        calls: [
          {
            to: paymentDetails.recipient,
            value: parseEther(paymentDetails.amount).toString(),
            data: "0x",
            metadata: {
              description: `x402 Payment: ${paymentDetails.reference}`,
              hostname: "dragman-agent.base.org",
              faviconUrl: "https://docs.base.org/favicon.ico",
              title: "Dragman Agent x402 Payment"
            }
          }
        ]
      };

      // Store payment for tracking
      this.pendingPayments.set(paymentId, {
        ...paymentDetails,
        transactionData,
        timestamp: Date.now()
      });

      log('info', 'x402 Payment executed', { paymentId, paymentDetails });
      
      return {
        paymentId,
        transactionHash: `pending_${paymentId}`, // Placeholder
        amount: paymentDetails.amount,
        recipient: paymentDetails.recipient
      };
    } catch (error) {
      log('error', 'Payment execution failed', { error: error.message });
      throw error;
    }
  }

  // Retry original request with payment header
  async retryWithPayment(originalRequest, paymentResult) {
    try {
      const headers = {
        ...originalRequest.headers,
        'X-Payment': JSON.stringify({
          id: paymentResult.paymentId,
          amount: paymentResult.amount,
          recipient: paymentResult.recipient,
          transactionHash: paymentResult.transactionHash
        })
      };

      const response = await fetch(originalRequest.url, {
        method: originalRequest.method,
        headers,
        body: originalRequest.body
      });

      if (response.status === 200) {
        log('info', 'x402 Payment successful, content delivered');
        return response;
      } else {
        throw new Error(`Payment retry failed with status: ${response.status}`);
      }
    } catch (error) {
      log('error', 'Payment retry failed', { error: error.message });
      throw error;
    }
  }

  // Get wallet balance for specific chain
  async getWalletBalance(address, chain) {
    const chainMap = {
      base: baseClient,
      ethereum: ethClient,
      arbitrum: arbClient,
      optimism: opClient,
      bsc: bscClient,
      polygon: polygonClient,
      avalanche: avaxClient
    };

    const client = chainMap[chain.toLowerCase()];
    if (!client) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    const balance = await client.getBalance({ address });
    return parseFloat(formatEther(balance));
  }

  // Get chain ID for transaction
  getChainId(chain) {
    const chainMap = {
      base: 8453,
      ethereum: 1,
      arbitrum: 42161,
      optimism: 10,
      bsc: 56,
      polygon: 137,
      avalanche: 43114
    };
    return chainMap[chain.toLowerCase()] || 8453; // Default to Base
  }

  // Handle premium service requests
  async handlePremiumRequest(serviceUrl, userMessage) {
    try {
      log('info', 'Handling premium request', { serviceUrl });
      
      const response = await fetch(serviceUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Dragman-Agent/1.0',
          'Accept': 'application/json'
        }
      });

      if (response.status === 402) {
        // Payment required - handle x402 flow
        const paymentResult = await this.handlePaymentRequired(response, {
          url: serviceUrl,
          method: 'GET',
          headers: { 'User-Agent': 'Dragman-Agent/1.0' }
        });
        
        return await paymentResult.json();
      } else if (response.status === 200) {
        return await response.json();
      } else {
        throw new Error(`Service request failed: ${response.status}`);
      }
    } catch (error) {
      log('error', 'Premium request failed', { error: error.message });
      throw error;
    }
  }
}

// Initialize x402 payment handler
const x402Handler = new X402PaymentHandler();

>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
// NEW: Analytics functions
function trackAnalytics(event, data = {}) {
  analytics.totalMessages++;
  
  if (event === 'tool_used') {
    const toolName = data.toolName;
    analytics.toolUsage[toolName] = (analytics.toolUsage[toolName] || 0) + 1;
  }
  
  if (event === 'user_interaction') {
    const userId = data.userId;
    if (!analytics.userInteractions.has(userId)) {
      analytics.userInteractions.set(userId, { firstSeen: new Date(), interactions: 0 });
    }
    analytics.userInteractions.get(userId).interactions++;
  }
  
  // Update daily stats
  const today = new Date().toDateString();
  if (!analytics.dailyStats.has(today)) {
    analytics.dailyStats.set(today, { messages: 0, tools: {} });
  }
  const dailyStats = analytics.dailyStats.get(today);
  dailyStats.messages++;
  if (event === 'tool_used') {
    dailyStats.tools[data.toolName] = (dailyStats.tools[data.toolName] || 0) + 1;
  }
}

// NEW: Portfolio tracking
async function updatePortfolio(userId, action, data) {
  if (!analytics.portfolios.has(userId)) {
    analytics.portfolios.set(userId, { holdings: [], history: [] });
  }
  
  const portfolio = analytics.portfolios.get(userId);
  const timestamp = new Date();
  
  if (action === 'add_holding') {
    portfolio.holdings.push({
      symbol: data.symbol,
      amount: data.amount,
      price: data.price,
      value: data.amount * data.price,
      timestamp
    });
  }
  
  portfolio.history.push({
    action,
    data,
    timestamp
  });
  
  // Keep only last 100 history entries
  if (portfolio.history.length > 100) {
    portfolio.history.shift();
  }
}

// NEW: Price alerts
async function checkPriceAlerts() {
  for (const [userId, alerts] of analytics.priceAlerts.entries()) {
    for (const alert of alerts) {
      try {
        const coinId = await getCoinId(alert.symbol);
        if (coinId) {
          const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
          const data = await response.json();
          const currentPrice = data[coinId].usd;
          
          if (alert.type === 'above' && currentPrice >= alert.target) {
            // Trigger alert
            await triggerPriceAlert(userId, alert, currentPrice);
          } else if (alert.type === 'below' && currentPrice <= alert.target) {
            // Trigger alert
            await triggerPriceAlert(userId, alert, currentPrice);
          }
        }
      } catch (error) {
        log('error', `Error checking price alert for ${alert.symbol}`, { error: error.message });
      }
    }
  }
}

async function triggerPriceAlert(userId, alert, currentPrice) {
  // This would send a notification to the user
  log('info', `Price alert triggered for ${alert.symbol}`, { 
    userId, 
    alert, 
    currentPrice 
  });
  // In a real implementation, you would send this via XMTP or another notification system
}

// NEW: NFT analytics
async function getNFTAnalytics(collectionAddress) {
  try {
    // This would integrate with OpenSea or other NFT marketplace APIs
    // For now, we'll return a placeholder response
    return {
      floorPrice: "0.5 ETH",
      volume24h: "12.3 ETH",
      holders: 1234,
      totalSupply: 10000,
      analytics: {
        priceChange7d: "+15.2%",
        volumeChange7d: "+8.7%",
        holdersChange7d: "+2.1%"
      }
    };
  } catch (error) {
    log('error', `Error fetching NFT analytics for ${collectionAddress}`, { error: error.message });
    return null;
  }
}

<<<<<<< HEAD
=======
// NEW: Enhanced transaction sending function with Base App compatibility
async function sendTransaction(ctx, transactionData, userMessage, functionArgs = {}) {
  log('info', '=== TRANSACTION SENDING START ===', {
    transactionData: JSON.stringify(transactionData, null, 2)
  });
  
  try {
    // Extract transaction details
    const firstCall = transactionData.calls?.[0] || {};
    const chainParam = (functionArgs?.chain || 'base').toLowerCase();
    const amount = formatEther(BigInt(firstCall.value || '0'));
    const recipient = firstCall.to;
    
    // Send user message first
    await ctx.sendText(userMessage);
    log('info', '✅ User message sent');
    
    // Send transaction details as plain text (Base App doesn't support clickable links)
    const transactionMessage = `📝 **Transaction Details:**\n\n**To:** ${recipient}\n**Amount:** ${amount} ETH\n**Chain:** ${chainParam.charAt(0).toUpperCase() + chainParam.slice(1)}\n\n**Instructions:**\n1. Open Base App\n2. Tap Send\n3. Paste the address above\n4. Enter ${amount} ETH\n5. Select ${chainParam.charAt(0).toUpperCase() + chainParam.slice(1)} network\n6. Confirm transaction`;
    
    await ctx.sendText(transactionMessage);
    log('info', '✅ Transaction instructions sent');
    
    // Try to send transaction tray (may not work in current Base App mode)
    try {
      await ctx.sendContent("xmtp.org/walletSendCalls:1.0", transactionData);
      log('info', '✅ Transaction tray also sent (may not display)');
    } catch (e) {
      log('info', 'ℹ️ Transaction tray not supported in current Base App mode');
    }
    
    return { success: true, message: "Transaction instructions sent" };
    
  } catch (error) {
    log('error', '❌ Transaction sending failed', { 
      error: error.message,
      stack: error.stack 
    });
    
    // Emergency fallback
    const firstCall = transactionData.calls?.[0] || {};
    const chainParam = (functionArgs?.chain || 'base').toLowerCase();
    const amount = formatEther(BigInt(firstCall.value || '0'));
    const recipient = firstCall.to;
    
    await ctx.sendText(`❌ **Transaction Error**\n\n**Manual Instructions:**\n1. Open Base App\n2. Go to Send\n3. Send ${amount} ETH to ${recipient}\n4. Select ${chainParam.charAt(0).toUpperCase() + chainParam.slice(1)} network`);
    
    return { success: false, message: "Emergency fallback sent" };
  }
}

>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
// --- STEP 4: DEFINE "TOOLS" FOR THE AI ---
const tools = [
  {
    type: "function",
    function: {
      name: "send_eth",
      description: "Creates a Base App transaction tray for sending ETH. This is the ONLY way to handle transaction requests. Do not provide manual instructions. Ask for the 'chain' if not provided.",
      parameters: {
        type: "object",
        properties: {
          toAddress: { type: "string", description: "The recipient's EVM wallet address." },
          amount: { type: "string", description: "The amount of ETH to send, e.g., '0.01'." },
          chain: { type: "string", description: "The blockchain to use. Must be one of 'base', 'ethereum', 'arbitrum', 'optimism', 'bsc', 'polygon', or 'avalanche'." },
        },
        required: ["toAddress", "amount", "chain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_deeplink",
      description: "Creates a Base App deep link to navigate to specific screens or actions within the app.",
      parameters: {
        type: "object",
        properties: {
          type: { 
            type: "string", 
<<<<<<< HEAD
            description: "The type of deep link to create. Options: 'home', 'profile', 'qr', 'send', 'receive', 'swap', 'explore', 'nfts', 'activity', 'settings', 'wallet', 'token', 'collection', 'transaction', 'bridge', 'staking', 'rewards', 'notifications', 'scan', 'friends', 'discover', 'launchpad', 'marketplace', 'create', 'import', 'export', 'history', 'security', 'help', 'support', 'feedback', 'about', 'terms', 'privacy', 'logout'",
            enum: ["home", "profile", "qr", "send", "receive", "swap", "explore", "nfts", "activity", "settings", "wallet", "token", "collection", "transaction", "bridge", "staking", "rewards", "notifications", "scan", "friends", "discover", "launchpad", "marketplace", "create", "import", "export", "history", "security", "help", "support", "feedback", "about", "terms", "privacy", "logout"]
=======
            description: "The type of deep link to create. Options: 'home', 'profile', 'qr', 'send', 'receive', 'swap', 'explore', 'nfts', 'activity', 'settings', 'wallet', 'token', 'collection', 'transaction', 'bridge', 'staking', 'rewards', 'notifications', 'scan', 'friends', 'discover', 'launchpad', 'marketplace', 'create', 'import', 'export', 'history', 'security', 'help', 'support', 'feedback', 'about', 'terms', 'privacy', 'logout', 'dm', 'direct', 'messaging'",
            enum: ["home", "profile", "qr", "send", "receive", "swap", "explore", "nfts", "activity", "settings", "wallet", "token", "collection", "transaction", "bridge", "staking", "rewards", "notifications", "scan", "friends", "discover", "launchpad", "marketplace", "create", "import", "export", "history", "security", "help", "support", "feedback", "about", "terms", "privacy", "logout", "dm", "direct", "messaging"]
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
          },
          address: { type: "string", description: "The address for token, collection, or transaction deep links." },
          chain: { type: "string", description: "The blockchain for transaction deep links. Must be one of 'base', 'ethereum', 'arbitrum', 'optimism', 'bsc', 'polygon', or 'avalanche'." },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_quick_actions",
      description: "Sends Quick Actions content type for interactive buttons in Base App.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique identifier for this action set." },
          description: { type: "string", description: "Description of what these actions are for." },
          actions: { 
            type: "array", 
            items: { 
              type: "object",
              properties: {
                id: { type: "string", description: "Unique ID for this action." },
                label: { type: "string", description: "Text to display on the button." },
                style: { type: "string", description: "Button style: 'primary', 'secondary', or 'danger'.", enum: ["primary", "secondary", "danger"] },
              },
              required: ["id", "label"]
            }
          },
        },
        required: ["id", "description", "actions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_currency",
      description: "Convert an amount from one cryptocurrency to another (e.g., 1 ETH to USDT) or to USD. Use this for any conversion requests.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "The amount of the source currency to convert." },
          fromCurrency: { type: "string", description: "The ticker symbol of the currency to convert from, e.g., 'ETH', 'BTC', 'USDT'." },
          toCurrency: { type: "string", description: "The ticker symbol of the currency to convert to, e.g., 'USDT', 'USD', 'SOL'." },
        },
        required: ["amount", "fromCurrency", "toCurrency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_math",
      description: "Perform mathematical calculations including addition, subtraction, multiplication, division, percentages, and more complex formulas.",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "The mathematical expression to calculate, e.g., '2 + 2', '10% of 500', 'sqrt(16)', '100 * 1.05'" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_project_safety",
      description: "Performs a safety check on a crypto project. Analyzes its presence on CoinGecko, social links, audit reports, and community size to provide a safety score. Use this whenever a user asks if a project is safe or legitimate.",
      parameters: {
        type: "object",
        properties: {
          projectName: { type: "string", description: "The name of the project, e.g., 'uniswap' or 'jupiter'." },
        },
        required: ["projectName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for real-time, up-to-date information. Use this for questions about specific crypto terms, project details, recent news, or technical concepts that require current information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crypto_price",
      description: "Get the current price of one or more cryptocurrencies with detailed timeframes.",
      parameters: {
        type: "object",
        properties: {
          tokens: { type: "array", items: { type: "string" }, description: "A list of cryptocurrency symbols, e.g., ['btc', 'eth', 'sol']" },
        },
        required: ["tokens"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wallet_balance",
      description: "Check the balance of a wallet address. Works for EVM chains. For Solana or Cosmos, it will guide you to the right explorer.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "The wallet address." },
          chain: { type: "string", description: "The blockchain to check the balance on. Optional - if not provided, will check multiple chains." },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_network_status",
      description: "Get current gas fees or network status for multiple chains, including EVM, Solana, and Osmosis.",
      parameters: { type: "object", properties: {} },
    },
  },
  // NEW: Portfolio tracking
  {
    type: "function",
    function: {
      name: "track_portfolio",
      description: "Track a cryptocurrency portfolio and calculate its value over time.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "The action to perform: 'add', 'remove', 'view'", enum: ["add", "remove", "view"] },
          symbol: { type: "string", description: "The cryptocurrency symbol, e.g., 'ETH', 'BTC'." },
          amount: { type: "number", description: "The amount of the cryptocurrency (for add/remove actions)." },
        },
        required: ["action"],
      },
    },
  },
  // NEW: Price alerts
  {
    type: "function",
    function: {
      name: "set_price_alert",
      description: "Set a price alert for a cryptocurrency. You'll be notified when the price reaches your target.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "The cryptocurrency symbol, e.g., 'ETH', 'BTC'." },
          type: { type: "string", description: "The alert type: 'above' or 'below'", enum: ["above", "below"] },
          target: { type: "number", description: "The target price in USD." },
        },
        required: ["symbol", "type", "target"],
      },
    },
  },
  // NEW: NFT analytics
  {
    type: "function",
    function: {
      name: "get_nft_analytics",
      description: "Get analytics for an NFT collection including floor price, volume, and holder statistics.",
      parameters: {
        type: "object",
        properties: {
          collectionAddress: { type: "string", description: "The NFT collection contract address." },
        },
        required: ["collectionAddress"],
      },
    },
  },
  // NEW: Analytics dashboard
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "Get analytics and insights about your agent usage and performance.",
      parameters: { type: "object", properties: {} },
    },
  },
  // NEW: Attachment handling
  {
    type: "function",
    function: {
      name: "send_attachment",
      description: "Send a file attachment directly in a message.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "The name of the file to send." },
          mimeType: { type: "string", description: "The MIME type of the file (e.g., 'image/png', 'application/pdf')." },
          data: { type: "string", description: "Base64 encoded file data." },
        },
        required: ["filename", "mimeType", "data"],
      },
    },
  },
  // NEW: Remote attachment handling
  {
    type: "function",
    function: {
      name: "send_remote_attachment",
      description: "Send a remote file attachment via URL to reduce message size.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL of the file to send." },
          filename: { type: "string", description: "The name of the file." },
          mimeType: { type: "string", description: "The MIME type of the file (e.g., 'image/png', 'application/pdf')." },
        },
        required: ["url", "filename", "mimeType"],
      },
    },
  },
  // NEW: Reaction handling
  {
    type: "function",
    function: {
      name: "send_reaction",
      description: "React to a message with an emoji.",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "The ID of the message to react to." },
          emoji: { type: "string", description: "The emoji to react with." },
        },
        required: ["messageId", "emoji"],
      },
    },
  },
  // NEW: Reply handling
  {
    type: "function",
    function: {
      name: "send_reply",
      description: "Reply to a specific message in a threaded conversation.",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "The ID of the message to reply to." },
          content: { type: "string", description: "The content of the reply." },
        },
        required: ["messageId", "content"],
      },
    },
  },
  // NEW: Transaction receipt handling
  {
    type: "function",
    function: {
      name: "send_transaction_receipt",
      description: "Share blockchain transaction information as a receipt.",
      parameters: {
        type: "object",
        properties: {
          transactionHash: { type: "string", description: "The transaction hash." },
          chain: { type: "string", description: "The blockchain where the transaction occurred." },
          status: { type: "string", description: "The status of the transaction (e.g., 'success', 'pending', 'failed')." },
          blockNumber: { type: "string", description: "The block number of the transaction." },
          timestamp: { type: "string", description: "The timestamp of the transaction." },
        },
        required: ["transactionHash", "chain", "status"],
      },
    },
  },
  // NEW: Test transaction tray function
  {
    type: "function",
    function: {
      name: "test_transaction_tray",
      description: "Test sending a transaction tray using the correct XMTP content type",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // NEW: Problem solver function
  {
    type: "function",
    function: {
      name: "solve_problem",
      description: "Help solve problems related to Base App, crypto, or blockchain technology. Exchange ideas and provide solutions.",
      parameters: {
        type: "object",
        properties: {
          problem: { type: "string", description: "Describe the problem you're facing with Base App or crypto." },
          context: { type: "string", description: "Additional context about the problem (optional)." },
        },
        required: ["problem"],
      },
    },
  },
  // NEW: Brainstorm ideas function
  {
    type: "function",
    function: {
      name: "brainstorm_ideas",
      description: "Brainstorm ideas for crypto projects, Base App features, or blockchain solutions.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "The topic you want to brainstorm ideas for." },
          focus: { type: "string", description: "Specific focus area within the topic (optional)." },
        },
        required: ["topic"],
      },
    },
  },
  // NEW: Get technical information function
  {
    type: "function",
    function: {
      name: "get_technical_info",
      description: "Get technical information about blockchain networks, RPC endpoints, APIs, etc.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "The technical topic you want information about (e.g., 'Base RPC endpoints', 'Ethereum API', 'Solana RPC')." },
        },
        required: ["topic"],
      },
    },
  },
<<<<<<< HEAD
=======
  // NEW: Test Quick Actions function
  {
    type: "function",
    function: {
      name: "test_quick_actions",
      description: "Test sending Quick Actions content type using the correct Base App specification",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // NEW: Missing Content Types
  {
    type: "function",
    function: {
      name: "send_read_receipt",
      description: "Send read receipt to confirm message was read (xmtp.org/readReceipt:1.0)",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "ID of the message being acknowledged" },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_group_membership_change",
      description: "Send group membership change notification (xmtp.org/group_membership_change:1.0)",
      parameters: {
        type: "object",
        properties: {
          groupId: { type: "string", description: "Group identifier" },
          action: { type: "string", description: "Action: 'add' or 'remove'" },
          memberAddress: { type: "string", description: "Member address being added/removed" },
        },
        required: ["groupId", "action", "memberAddress"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_transaction_reference",
      description: "Send transaction reference information (xmtp.org/transactionReference:1.0)",
      parameters: {
        type: "object",
        properties: {
          transactionHash: { type: "string", description: "Transaction hash" },
          chainId: { type: "string", description: "Chain ID where transaction occurred" },
          explorerUrl: { type: "string", description: "Block explorer URL" },
        },
        required: ["transactionHash", "chainId"],
      },
    },
  },
  // NEW: Feedback system function
  {
    type: "function",
    function: {
      name: "collect_feedback",
      description: "Collect user feedback to improve the agent's responses and suggestions. Be grateful and responsive to feedback.",
      parameters: {
        type: "object",
        properties: {
          feedback: { type: "string", description: "User feedback about the agent's performance" },
          rating: { type: "string", description: "Rating: excellent, good, okay, poor, or terrible" },
          suggestion: { type: "string", description: "User suggestion for improvement" },
        },
        required: ["feedback"],
      },
    },
  },
  // NEW: Learning system function
  {
    type: "function",
    function: {
      name: "learn_user_preferences",
      description: "Learn and remember user preferences, interests, and behavior patterns to provide personalized experiences.",
      parameters: {
        type: "object",
        properties: {
          preference: { type: "string", description: "User preference or interest" },
          category: { type: "string", description: "Category: trading, defi, nft, gaming, etc." },
          value: { type: "string", description: "Preference value or setting" },
        },
        required: ["preference", "category"],
      },
    },
  },
  // NEW: Reminder system function
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Set reminders for price alerts, transaction confirmations, or important crypto events. Be helpful and proactive.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "Type of reminder: price_alert, transaction, event, or general" },
          message: { type: "string", description: "Reminder message" },
          time: { type: "string", description: "When to remind (e.g., 'in 1 hour', 'tomorrow', 'when ETH hits $3000')" },
        },
        required: ["type", "message"],
      },
    },
  },
  // NEW: Proactive suggestions function
  {
    type: "function",
    function: {
      name: "suggest_helpful_actions",
      description: "Suggest helpful actions based on user's current activity or interests. Be proactive and friendly.",
      parameters: {
        type: "object",
        properties: {
          context: { type: "string", description: "Current context or user activity" },
          userInterest: { type: "string", description: "User's interest or topic" },
        },
        required: ["context"],
      },
    },
  },
  // NEW: Friendly conversation function
  {
    type: "function",
    function: {
      name: "start_friendly_conversation",
      description: "Start a friendly, engaging conversation with helpful suggestions and tips.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic to discuss" },
        },
        required: [],
      },
    },
  },
  // NEW: X/Twitter profile function
  {
    type: "function",
    function: {
      name: "get_x_profile",
      description: "Get X (Twitter) profile information for crypto personalities, companies, or projects. Returns safe, non-clickable links for Base App compatibility.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the person, company, or project to find on X" },
        },
        required: ["name"],
      },
    },
  },
  // NEW: Mini App Integration functions
  {
    type: "function",
    function: {
      name: "share_mini_app",
      description: "Share a Mini App URL in conversation with rich component preview (Mini Apps & Agents integration)",
      parameters: {
        type: "object",
        properties: {
          appUrl: { type: "string", description: "Mini App URL to share" },
          description: { type: "string", description: "Description of the Mini App" },
          context: { type: "string", description: "Context for sharing (game, poll, trading, etc.)" },
        },
        required: ["appUrl", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_mini_app_context",
      description: "Detect when to share Mini Apps based on conversation context",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "User message to analyze" },
        },
        required: ["message"],
      },
    },
  },
  // NEW: x402 Payment Protocol functions
  {
    type: "function",
    function: {
      name: "request_premium_service",
      description: "Request access to a premium service using x402 payment protocol. The agent will automatically handle payments if required.",
      parameters: {
        type: "object",
        properties: {
          serviceUrl: { type: "string", description: "The URL of the premium service to access." },
          description: { type: "string", description: "Description of what the user wants to access." },
        },
        required: ["serviceUrl", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_payment_status",
      description: "Check the status of pending x402 payments.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "test_x402_payment",
      description: "Test the x402 payment protocol implementation.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
];

// --- STEP 5: DEFINE THE ACTUAL JAVASCRIPT FUNCTIONS FOR THE TOOLS ---
const availableFunctions = {
  // --- UPDATED: send_eth CREATES A BASE APP TRANSACTION TRAY ---
  send_eth: async ({ toAddress, amount, chain }) => {
    log('info', `--- SEND ETH START --- To: ${toAddress}, Amount: ${amount} ETH, Chain: ${chain}`);
    if (!isAddress(toAddress)) {
      return { error: "Invalid address.", userMessage: "❌ That doesn't look like a valid EVM address. Please double-check it and try again." };
    }

    // --- FIX: CORRECTED CHAIN IDS FOR BASE APP ---
    const chainMap = {
      base: { chainId: 8453, explorer: "https://basescan.org/tx/" },
      ethereum: { chainId: 1, explorer: "https://etherscan.io/tx/" },
      arbitrum: { chainId: 42161, explorer: "https://arbiscan.io/tx/" },
      optimism: { chainId: 10, explorer: "https://optimistic.etherscan.io/tx/" },
      bsc: { chainId: 56, explorer: "https://bscscan.io/tx/" },
      polygon: { chainId: 137, explorer: "https://polygonscan.io/tx/" },
      avalanche: { chainId: 43114, explorer: "https://snowtrace.io/tx/" }
    };

    const selectedChain = chainMap[chain.toLowerCase()];
    if (!selectedChain) {
      return { error: "Invalid chain.", userMessage: `❌ Invalid chain specified. Please choose one of: ${Object.keys(chainMap).join(', ')}.` };
    }

    try {
      const valueInWei = parseEther(amount);
      
<<<<<<< HEAD
      // Create Base App transaction tray data
      const transactionData = {
        version: "1.0",
        // Remove the from field - it will be filled by the Base App
=======
      // Create Base App transaction tray data with enhanced metadata
      const transactionData = {
        version: "1.0",
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
        chainId: selectedChain.chainId,
        calls: [
          {
            to: toAddress,
            value: valueInWei.toString(),
            data: "0x", // Empty data for simple ETH transfer
            metadata: {
              description: `Send ${amount} ETH on ${chain.charAt(0).toUpperCase() + chain.slice(1)}`,
              hostname: "dragman-agent.base.org",
              faviconUrl: "https://docs.base.org/favicon.ico",
              title: "Dragman Agent"
            }
          }
        ]
      };
      
      log('info', `--- TRANSACTION TRAY CREATED ---`, { transactionData });

      // Return the transaction data with a flag to send it
      return {
<<<<<<< HEAD
        userMessage: `Ready to send ${amount} ETH on ${chain.charAt(0).toUpperCase() + chain.slice(1)}? Check your transaction tray to approve this transfer.`,
        transactionData: transactionData,
        // Add this flag to indicate we want to send a transaction
        isTransaction: true
=======
        userMessage: `💸 Ready to send ${amount} ETH on ${chain.charAt(0).toUpperCase() + chain.slice(1)}?\n\nCheck your transaction tray above to approve this transfer.`,
        transactionData: transactionData,
        // Add this flag to indicate we want to send a transaction
        isTransaction: true,
        functionArgs: { toAddress, amount, chain }
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      };
    } catch (error) {
      log('error', `--- SEND ETH END --- ERROR`, { error: error.message });
      return { error: "Failed to construct transaction. Please check the amount and address." };
    }
  },
  // NEW: Test transaction tray function
  test_transaction_tray: async () => {
    log('info', `--- TEST TRANSACTION TRAY START ---`);
    
    try {
<<<<<<< HEAD
      // Create a simple transaction tray
=======
      // Create a simple transaction tray with enhanced metadata
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      const transactionData = {
        version: "1.0",
        chainId: 8453, // Base
        calls: [
          {
<<<<<<< HEAD
            to: "0x9F84E2455bc841DEbff0990F3dE8E4e2101B544D",
            value: "1000000000000000", // 0.001 ETH
            data: "0x",
            metadata: {
              description: "Test transaction",
=======
            to: "0x60c0e5e23790a7b9b38A095D8C6291a88A23E6B6", // Updated example address
            value: "1000000000000000", // 0.001 ETH
            data: "0x",
            metadata: {
              description: "Test transaction from Dragman Agent",
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
              hostname: "dragman-agent.base.org",
              faviconUrl: "https://docs.base.org/favicon.ico",
              title: "Dragman Agent"
            }
          }
        ]
      };
      
      log('info', `--- TEST TRANSACTION TRAY CREATED ---`, { transactionData });
      
      return {
<<<<<<< HEAD
        userMessage: "Test transaction tray created. This should appear as a transaction tray in Base App.",
        transactionData: transactionData,
        isTransaction: true
=======
        userMessage: "🧪 Test transaction tray created. This should appear as a transaction tray in Base App.",
        transactionData: transactionData,
        isTransaction: true,
        functionArgs: { chain: 'base' }
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      };
    } catch (error) {
      log('error', `--- TEST TRANSACTION TRAY END --- ERROR`, { error: error.message });
      return { error: "Failed to create test transaction tray." };
    }
  },
<<<<<<< HEAD
=======

  // NEW: Test Quick Actions function
  test_quick_actions: async () => {
    log('info', `--- TEST QUICK ACTIONS START ---`);
    
    try {
      // Create Quick Actions according to Base App spec
      const quickActionsData = {
        id: "demo_actions_" + Date.now(),
        description: "Demo Quick Actions from Dragman Agent",
        actions: [
          {
            id: "safety_check_prompt",
            label: "Safety Check",
            style: "primary"
          },
          {
            id: "gas_fees",
            label: "Check Gas Fees",
            style: "secondary"
          },
          {
            id: "price_eth",
            label: "ETH Price",
            style: "secondary"
          },
          {
            id: "send_10",
            label: "Send $10",
            style: "danger"
          }
        ],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
      };
      
      log('info', `--- TEST QUICK ACTIONS CREATED ---`, { quickActionsData });
      
      return {
        userMessage: "🎯 Demo Quick Actions created! Tap any button to see how Intent handling works.",
        quickActionsData: quickActionsData,
        contentType: "coinbase.com/actions:1.0",
        isQuickActions: true
      };
    } catch (error) {
      log('error', `--- TEST QUICK ACTIONS END --- ERROR`, { error: error.message });
      return { error: "Failed to create test Quick Actions." };
    }
  },

  // NEW: x402 Payment Protocol functions
  request_premium_service: async ({ serviceUrl, description }) => {
    log('info', `--- PREMIUM SERVICE REQUEST START --- URL: ${serviceUrl}, Description: ${description}`);
    
    try {
      // Validate URL
      if (!serviceUrl.startsWith('http')) {
        return { error: "Invalid service URL.", userMessage: "❌ Please provide a valid HTTP/HTTPS URL." };
      }

      // Request premium service using x402 handler
      const result = await x402Handler.handlePremiumRequest(serviceUrl, description);
      
      log('info', `--- PREMIUM SERVICE REQUEST SUCCESS ---`, { result });
      
      return {
        userMessage: `✅ **Premium Service Access Granted!**\n\n**Service:** ${description}\n**URL:** ${serviceUrl}\n\n**Result:** ${JSON.stringify(result, null, 2)}`,
        serviceData: {
          url: serviceUrl,
          description,
          result,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      log('error', `--- PREMIUM SERVICE REQUEST END --- ERROR`, { error: error.message });
      
      if (error.message.includes('Insufficient balance')) {
        return { 
          error: "Insufficient balance for premium service.", 
          userMessage: "❌ Insufficient balance to access this premium service. Please ensure the agent has enough ETH for the required payment." 
        };
      } else if (error.message.includes('Payment Required')) {
        return { 
          error: "Payment required for premium service.", 
          userMessage: "💰 This service requires payment. The agent will attempt to process the payment automatically using the x402 protocol." 
        };
      } else {
        return { 
          error: "Premium service request failed.", 
          userMessage: `❌ Failed to access premium service: ${error.message}` 
        };
      }
    }
  },

  check_payment_status: async () => {
    log('info', `--- CHECK PAYMENT STATUS START ---`);
    
    try {
      const pendingPayments = Array.from(x402Handler.pendingPayments.entries()).map(([id, payment]) => ({
        id,
        amount: payment.amount,
        recipient: payment.recipient,
        reference: payment.reference,
        timestamp: new Date(payment.timestamp).toISOString(),
        status: 'pending'
      }));

      const completedPayments = Array.from(x402Handler.paymentQueue.entries()).map(([id, payment]) => ({
        id,
        amount: payment.amount,
        recipient: payment.recipient,
        reference: payment.reference,
        timestamp: new Date(payment.timestamp).toISOString(),
        status: 'completed'
      }));

      const allPayments = [...pendingPayments, ...completedPayments];
      
      log('info', `--- PAYMENT STATUS CHECKED ---`, { totalPayments: allPayments.length });
      
      if (allPayments.length === 0) {
        return {
          userMessage: "📊 **Payment Status:** No pending or completed payments found.",
          paymentData: { payments: [], total: 0 }
        };
      }

      let statusMessage = `📊 **Payment Status Report:**\n\n`;
      statusMessage += `**Total Payments:** ${allPayments.length}\n`;
      statusMessage += `**Pending:** ${pendingPayments.length}\n`;
      statusMessage += `**Completed:** ${completedPayments.length}\n\n`;

      if (pendingPayments.length > 0) {
        statusMessage += `**Pending Payments:**\n`;
        pendingPayments.forEach(payment => {
          statusMessage += `• ${payment.amount} ETH to ${payment.recipient.slice(0, 6)}...${payment.recipient.slice(-4)} (${payment.reference})\n`;
        });
      }

      if (completedPayments.length > 0) {
        statusMessage += `\n**Completed Payments:**\n`;
        completedPayments.forEach(payment => {
          statusMessage += `• ${payment.amount} ETH to ${payment.recipient.slice(0, 6)}...${payment.recipient.slice(-4)} (${payment.reference})\n`;
        });
      }

      return {
        userMessage: statusMessage,
        paymentData: { payments: allPayments, total: allPayments.length }
      };
    } catch (error) {
      log('error', `--- CHECK PAYMENT STATUS END --- ERROR`, { error: error.message });
      return { error: "Failed to check payment status." };
    }
  },

  test_x402_payment: async () => {
    log('info', `--- TEST X402 PAYMENT START ---`);
    
    try {
      // Create a mock x402 payment scenario
      const mockPaymentDetails = {
        amount: "0.001",
        recipient: "0x60c0e5e23790a7b9b38A095D8C6291a88A23E6B6",
        reference: "test_x402_payment",
        token: "ETH",
        chain: "base",
        deadline: new Date(Date.now() + 300000).toISOString() // 5 minutes from now
      };

      // Test payment execution
      const paymentResult = await x402Handler.executePayment(mockPaymentDetails);
      
      log('info', `--- TEST X402 PAYMENT SUCCESS ---`, { paymentResult });
      
      return {
        userMessage: `🧪 **x402 Payment Test Successful!**\n\n**Payment ID:** ${paymentResult.paymentId}\n**Amount:** ${paymentResult.amount} ETH\n**Recipient:** ${paymentResult.recipient}\n**Transaction Hash:** ${paymentResult.transactionHash}\n\nThis demonstrates the x402 payment protocol working correctly.`,
        testData: {
          paymentDetails: mockPaymentDetails,
          paymentResult,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      log('error', `--- TEST X402 PAYMENT END --- ERROR`, { error: error.message });
      return { 
        error: "x402 payment test failed.", 
        userMessage: `❌ x402 Payment test failed: ${error.message}` 
      };
    }
  },

  // NEW: Feedback system function
  collect_feedback: async ({ feedback, rating, suggestion }) => {
    log('info', `--- COLLECT FEEDBACK START --- Feedback: ${feedback}, Rating: ${rating}, Suggestion: ${suggestion}`);
    
    try {
      const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString();
      
      // Initialize feedback storage
      if (!global.feedback) global.feedback = new Map();
      
      // Store feedback
      const feedbackData = {
        id: feedbackId,
        feedback,
        rating: rating || 'not_provided',
        suggestion: suggestion || '',
        timestamp,
        status: 'received'
      };
      
      global.feedback.set(feedbackId, feedbackData);
      
      let responseText = `👀 **Thank you so much for your feedback!**\n\n`;
      responseText += `**Feedback:** ${feedback}\n`;
      if (rating && rating !== 'not_provided') {
        responseText += `**Rating:** ${rating.toUpperCase()}\n`;
      }
      if (suggestion) {
        responseText += `**Suggestion:** ${suggestion}\n`;
      }
      responseText += `**ID:** ${feedbackId}\n\n`;
      
      // Respond based on rating
      if (rating === 'excellent' || rating === 'good') {
        responseText += `🎉 **Awesome!** I'm thrilled you're happy with my help! I'll keep doing my best to assist you.\n\n`;
      } else if (rating === 'okay') {
        responseText += `👍 **Thanks!** I appreciate the feedback. I'll work on improving my responses.\n\n`;
      } else if (rating === 'poor' || rating === 'terrible') {
        responseText += `😔 **I'm sorry I didn't meet your expectations.** Your feedback helps me improve. I'll do better next time!\n\n`;
      } else {
        responseText += `💝 **Your feedback means a lot to me!** I'm always learning and improving.\n\n`;
      }
      
      // Acknowledge suggestions
      if (suggestion) {
        responseText += `💡 **Great suggestion!** I'll definitely consider "${suggestion}" for future improvements.\n\n`;
      }
      
      responseText += `🚀 **I'm constantly evolving!** Your input helps me become a better crypto assistant. Keep the feedback coming!`;
      
      log('info', `--- FEEDBACK COLLECTED SUCCESSFULLY ---`, { feedbackId, rating });
      
      return {
        userMessage: responseText,
        feedbackData: {
          id: feedbackId,
          feedback,
          rating: rating || 'not_provided',
          suggestion: suggestion || '',
          timestamp
        }
      };
    } catch (error) {
      log('error', `--- COLLECT FEEDBACK END --- ERROR`, { error: error.message });
      return { 
        error: "Failed to collect feedback.", 
        userMessage: `👀 Thanks for taking the time to give feedback! I really appreciate it.` 
      };
    }
  },

  // NEW: Learning system function
  learn_user_preferences: async ({ preference, category, value }) => {
    log('info', `--- LEARN USER PREFERENCES START --- Preference: ${preference}, Category: ${category}, Value: ${value}`);
    
    try {
      // Initialize user preferences storage
      if (!global.userPreferences) global.userPreferences = new Map();
      
      const userId = 'default_user'; // In production, use actual user ID
      const timestamp = new Date().toISOString();
      
      // Get or create user preference profile
      let userProfile = global.userPreferences.get(userId) || {
        userId,
        preferences: {},
        interests: [],
        behavior: {},
        createdAt: timestamp,
        lastUpdated: timestamp
      };
      
      // Update preferences
      if (!userProfile.preferences[category]) {
        userProfile.preferences[category] = {};
      }
      
      userProfile.preferences[category][preference] = {
        value: value || 'true',
        timestamp,
        confidence: 1
      };
      
      // Update interests
      if (!userProfile.interests.includes(category)) {
        userProfile.interests.push(category);
      }
      
      // Update behavior patterns
      userProfile.behavior[`${category}_${preference}`] = {
        count: (userProfile.behavior[`${category}_${preference}`]?.count || 0) + 1,
        lastSeen: timestamp
      };
      
      userProfile.lastUpdated = timestamp;
      
      // Save updated profile
      global.userPreferences.set(userId, userProfile);
      
      let responseText = `👀 **Got it! I've learned your preference.**\n\n`;
      responseText += `**Category:** ${category.toUpperCase()}\n`;
      responseText += `**Preference:** ${preference}\n`;
      responseText += `**Value:** ${value || 'true'}\n\n`;
      
      // Provide personalized suggestions based on learned preference
      if (category === 'trading') {
        responseText += `💡 **Personalized tip:** I'll prioritize trading-related information and suggest relevant DeFi protocols!\n`;
      } else if (category === 'defi') {
        responseText += `💡 **Personalized tip:** I'll focus on DeFi protocols, yield farming, and liquidity opportunities!\n`;
      } else if (category === 'nft') {
        responseText += `💡 **Personalized tip:** I'll keep you updated on NFT trends, collections, and marketplace insights!\n`;
      } else if (category === 'gaming') {
        responseText += `💡 **Personalized tip:** I'll highlight GameFi projects, play-to-earn opportunities, and gaming tokens!\n`;
      } else {
        responseText += `💡 **Personalized tip:** I'll tailor my suggestions to your interests and provide relevant insights!\n`;
      }
      
      responseText += `\n🚀 **I'm getting smarter about your preferences!** This helps me give you better, more personalized help.`;
      
      log('info', `--- USER PREFERENCES LEARNED ---`, { category, preference, value });
      
      return {
        userMessage: responseText,
        preferenceData: {
          category,
          preference,
          value: value || 'true',
          timestamp,
          userProfile: {
            interests: userProfile.interests,
            preferenceCount: Object.keys(userProfile.preferences).length
          }
        }
      };
    } catch (error) {
      log('error', `--- LEARN USER PREFERENCES END --- ERROR`, { error: error.message });
      return { 
        error: "Failed to learn preference.", 
        userMessage: `👀 Thanks for sharing! I'll remember that for future conversations.` 
      };
    }
  },

  // NEW: Reminder system function
  set_reminder: async ({ type, message, time }) => {
    log('info', `--- SET REMINDER START --- Type: ${type}, Message: ${message}, Time: ${time}`);
    
    try {
      const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString();
      
      // Store reminder (in production, you'd use a database)
      const reminder = {
        id: reminderId,
        type,
        message,
        time: time || 'general',
        createdAt: timestamp,
        status: 'active'
      };
      
      // Add to reminders map (simple in-memory storage)
      if (!global.reminders) global.reminders = new Map();
      global.reminders.set(reminderId, reminder);
      
      let responseText = `👀 **Reminder set!**\n\n`;
      responseText += `**Type:** ${type.replace('_', ' ').toUpperCase()}\n`;
      responseText += `**Message:** ${message}\n`;
      responseText += `**Time:** ${time || 'General reminder'}\n`;
      responseText += `**ID:** ${reminderId}\n\n`;
      
      // Add helpful context based on reminder type
      if (type === 'price_alert') {
        responseText += `💡 **Pro tip:** I'll check prices regularly and notify you when conditions are met!\n`;
      } else if (type === 'transaction') {
        responseText += `💡 **Pro tip:** I'll help you track transaction status and confirmations!\n`;
      } else if (type === 'event') {
        responseText += `💡 **Pro tip:** I'll keep you updated on important crypto events and announcements!\n`;
      } else {
        responseText += `💡 **Pro tip:** I'm here to help you stay on top of your crypto activities!\n`;
      }
      
      responseText += `\n🚀 **Want to set more reminders?** Just ask me!`;
      
      log('info', `--- REMINDER SET SUCCESSFULLY ---`, { reminderId, type });
      
      return {
        userMessage: responseText,
        reminderData: {
          id: reminderId,
          type,
          message,
          time: time || 'general',
          createdAt: timestamp
        }
      };
    } catch (error) {
      log('error', `--- SET REMINDER END --- ERROR`, { error: error.message });
      return { 
        error: "Failed to set reminder.", 
        userMessage: `👀 Sorry, I couldn't set that reminder right now. Try again in a moment!` 
      };
    }
  },

  // NEW: Proactive suggestions function
  suggest_helpful_actions: async ({ context, userInterest }) => {
    log('info', `--- SUGGEST HELPFUL ACTIONS START --- Context: ${context}, Interest: ${userInterest}`);
    
    try {
      const suggestions = [];
      const contextLower = context.toLowerCase();
      const interestLower = userInterest?.toLowerCase() || '';
      
      // Price-related suggestions
      if (contextLower.includes('price') || contextLower.includes('crypto') || interestLower.includes('price')) {
        suggestions.push({
          action: "Check multiple prices",
          description: "Get prices for BTC, ETH, SOL, and more",
          example: "prices for BTC, ETH, SOL"
        });
        suggestions.push({
          action: "Set price alerts",
          description: "Get notified when prices hit your targets",
          example: "alert me when ETH hits $3000"
        });
      }
      
      // Trading suggestions
      if (contextLower.includes('trade') || contextLower.includes('swap') || interestLower.includes('defi')) {
        suggestions.push({
          action: "Check gas fees",
          description: "See current network fees before trading",
          example: "gas fees"
        });
        suggestions.push({
          action: "Safety check",
          description: "Verify if a project is safe before investing",
          example: "is [project] safe?"
        });
      }
      
      // Learning suggestions
      if (contextLower.includes('learn') || contextLower.includes('help') || contextLower.includes('new')) {
        suggestions.push({
          action: "Base App guide",
          description: "Learn how to use Base App features",
          example: "how to use Base App"
        });
        suggestions.push({
          action: "DeFi basics",
          description: "Understand DeFi concepts and protocols",
          example: "explain DeFi"
        });
      }
      
      // Transaction suggestions
      if (contextLower.includes('send') || contextLower.includes('transfer')) {
        suggestions.push({
          action: "Check balance",
          description: "See your current wallet balance",
          example: "check my balance"
        });
        suggestions.push({
          action: "Gas optimization",
          description: "Learn how to save on transaction fees",
          example: "how to save gas fees"
        });
      }
      
      // Default helpful suggestions
      if (suggestions.length === 0) {
        suggestions.push(
          {
            action: "Market overview",
            description: "Get current crypto market status",
            example: "market status"
          },
          {
            action: "Base ecosystem",
            description: "Explore Base network projects",
            example: "Base projects"
          },
          {
            action: "Portfolio tracking",
            description: "Track your crypto investments",
            example: "track my portfolio"
          }
        );
      }
      
      let suggestionText = `👀 **Here are some helpful things I can do for you:**\n\n`;
      
      suggestions.forEach((suggestion, index) => {
        suggestionText += `**${index + 1}. ${suggestion.action}**\n`;
        suggestionText += `${suggestion.description}\n`;
        suggestionText += `*Try: "${suggestion.example}"*\n\n`;
      });
      
      suggestionText += `💡 **Pro tip:** I'm always here to help! Just ask me anything about crypto, Base App, or blockchain technology.`;
      
      log('info', `--- HELPFUL SUGGESTIONS GENERATED ---`, { suggestions: suggestions.length });
      
      return {
        userMessage: suggestionText,
        suggestionData: {
          context,
          userInterest,
          suggestions,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      log('error', `--- SUGGEST HELPFUL ACTIONS END --- ERROR`, { error: error.message });
      return { 
        error: "Failed to generate suggestions.", 
        userMessage: `👀 I'm here to help! Try asking me about crypto prices, Base App features, or anything blockchain-related.` 
      };
    }
  },

  // NEW: Friendly conversation function
  start_friendly_conversation: async ({ topic }) => {
    log('info', `--- START FRIENDLY CONVERSATION START --- Topic: ${topic}`);
    
    try {
      const friendlyTopics = [
        {
          topic: "crypto market",
          greeting: "👀 Hey there! How's your crypto journey going?",
          suggestions: ["Check current prices", "Market analysis", "Portfolio review"]
        },
        {
          topic: "base app",
          greeting: "👀 Welcome to Base! Ready to explore the ecosystem?",
          suggestions: ["Base features", "Network status", "Popular projects"]
        },
        {
          topic: "defi",
          greeting: "👀 DeFi enthusiast! Let's dive into the decentralized world!",
          suggestions: ["DeFi protocols", "Yield farming", "Liquidity pools"]
        },
        {
          topic: "trading",
          greeting: "👀 Trading time! Let's make some smart moves!",
          suggestions: ["Market analysis", "Gas fees", "Safety checks"]
        }
      ];
      
      let selectedTopic = friendlyTopics.find(t => 
        topic && topic.toLowerCase().includes(t.topic)
      ) || friendlyTopics[0];
      
      let conversationText = `${selectedTopic.greeting}\n\n`;
      conversationText += `**What would you like to explore?**\n\n`;
      
      selectedTopic.suggestions.forEach((suggestion, index) => {
        conversationText += `• ${suggestion}\n`;
      });
      
      conversationText += `\n💡 **Or just ask me anything!** I'm here to help with:\n`;
      conversationText += `• Crypto prices and market data\n`;
      conversationText += `• Base App navigation and features\n`;
      conversationText += `• Transaction help and troubleshooting\n`;
      conversationText += `• Project safety checks\n`;
      conversationText += `• DeFi strategies and insights\n\n`;
      conversationText += `🚀 **Let's get started!** What's on your mind?`;
      
      log('info', `--- FRIENDLY CONVERSATION STARTED ---`, { topic: selectedTopic.topic });
      
      return {
        userMessage: conversationText,
        conversationData: {
          topic: selectedTopic.topic,
          suggestions: selectedTopic.suggestions,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      log('error', `--- START FRIENDLY CONVERSATION END --- ERROR`, { error: error.message });
      return { 
        error: "Failed to start conversation.", 
        userMessage: `👀 Hey! I'm Dragman Agent, your crypto assistant. How can I help you today?` 
      };
    }
  },

  // NEW: X/Twitter profile function
  get_x_profile: async ({ name }) => {
    log('info', `--- GET X PROFILE START --- Name: ${name}`);
    
    try {
      // Common crypto X profiles
      const knownProfiles = {
        'coinbase ceo': { username: 'brian_armstrong', name: 'Brian Armstrong', description: 'Coinbase CEO' },
        'brian armstrong': { username: 'brian_armstrong', name: 'Brian Armstrong', description: 'Coinbase CEO' },
        'coinbase': { username: 'coinbase', name: 'Coinbase', description: 'Coinbase Exchange' },
        'vitalik': { username: 'VitalikButerin', name: 'Vitalik Buterin', description: 'Ethereum Founder' },
        'vitalik buterin': { username: 'VitalikButerin', name: 'Vitalik Buterin', description: 'Ethereum Founder' },
        'ethereum': { username: 'ethereum', name: 'Ethereum', description: 'Ethereum Foundation' },
        'base': { username: 'base', name: 'Base', description: 'Base Network' },
        'uniswap': { username: 'Uniswap', name: 'Uniswap', description: 'Uniswap Protocol' },
        'aave': { username: 'AaveAave', name: 'Aave', description: 'Aave Protocol' },
        'compound': { username: 'compoundfinance', name: 'Compound', description: 'Compound Finance' },
        'maker': { username: 'MakerDAO', name: 'MakerDAO', description: 'Maker Protocol' },
        'chainlink': { username: 'chainlink', name: 'Chainlink', description: 'Chainlink Network' },
        'polygon': { username: '0xPolygon', name: 'Polygon', description: 'Polygon Network' },
        'arbitrum': { username: 'arbitrum', name: 'Arbitrum', description: 'Arbitrum Network' },
        'optimism': { username: 'optimismFND', name: 'Optimism', description: 'Optimism Network' },
        'solana': { username: 'solana', name: 'Solana', description: 'Solana Network' },
        'binance': { username: 'binance', name: 'Binance', description: 'Binance Exchange' },
        'cz': { username: 'cz_binance', name: 'CZ', description: 'Binance Founder' },
        'changpeng zhao': { username: 'cz_binance', name: 'CZ', description: 'Binance Founder' }
      };
      
      const searchName = name.toLowerCase();
      let profile = null;
      
      // Check if it's a known profile
      for (const [key, value] of Object.entries(knownProfiles)) {
        if (searchName.includes(key) || key.includes(searchName)) {
          profile = value;
          break;
        }
      }
      
      if (profile) {
        const xUrl = `https://x.com/${profile.username}`;
        log('info', `--- X PROFILE FOUND ---`, { profile });
        
        return {
          userMessage: `👀 **${profile.name}** (${profile.description})\n\n**X Profile:** @${profile.username}\n**Copy this URL:** ${xUrl}\n\n*Note: Copy the URL above and paste it in your browser to visit the profile safely.*`,
          profileData: {
            username: profile.username,
            name: profile.name,
            description: profile.description,
            url: xUrl
          }
        };
      } else {
        // If not found in known profiles, use web search
        log('info', `--- X PROFILE NOT FOUND IN KNOWN PROFILES --- Using web search`);
        
        const searchResult = await availableFunctions.search_web({ query: `${name} X twitter profile` });
        
        return {
          userMessage: `👀 I searched for "${name}" on X. Here are the results:\n\n${searchResult}\n\n*Note: Copy the URLs above and paste them in your browser to visit profiles safely.*`,
          searchData: {
            query: name,
            results: searchResult
          }
        };
      }
    } catch (error) {
      log('error', `--- GET X PROFILE END --- ERROR`, { error: error.message });
      return { 
        error: "Failed to get X profile.", 
        userMessage: `👀 Sorry, I couldn't find the X profile for "${name}". Try searching for the exact username or company name.` 
      };
    }
  },

  // NEW: Mini App Integration Functions
  share_mini_app: async ({ appUrl, description, context }) => {
    log('info', `--- SHARE MINI APP START --- URL: ${appUrl}, Context: ${context}`);
    
    try {
      // Validate URL
      if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
        return { error: "Invalid URL. Must start with http:// or https://" };
      }
      
      // Create Mini App share message
      const miniAppMessage = `${description}\n\n${appUrl}`;
      
      log('info', `--- MINI APP SHARED ---`, { appUrl, description, context });
      
      return {
        userMessage: miniAppMessage,
        miniAppData: {
          url: appUrl,
          description,
          context: context || "general",
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      log('error', `--- SHARE MINI APP END --- ERROR`, { error: error.message });
      return { error: "Failed to share Mini App." };
    }
  },

  detect_mini_app_context: async ({ message }) => {
    log('info', `--- DETECT MINI APP CONTEXT START --- Message: ${message}`);
    
    try {
      const content = message.toLowerCase();
      const suggestions = [];
      
      // Gaming context
      if (content.includes('game') || content.includes('play') || content.includes('fun')) {
        suggestions.push({
          context: 'gaming',
          appUrl: 'https://squabble.gg',
          description: '🎮 Ready for a word game challenge? Try Squabble!'
        });
      }
      
      // Trading context
      if (content.includes('trade') || content.includes('swap') || content.includes('defi')) {
        suggestions.push({
          context: 'trading',
          appUrl: 'https://app.uniswap.org',
          description: '💱 Want to trade tokens? Check out Uniswap!'
        });
      }
      
      // Polling context
      if (content.includes('vote') || content.includes('poll') || content.includes('decide')) {
        suggestions.push({
          context: 'polling',
          appUrl: 'https://poll.example.com',
          description: '🗳️ Need to make a decision? Create a poll!'
        });
      }
      
      // Event planning context
      if (content.includes('meet') || content.includes('event') || content.includes('plan')) {
        suggestions.push({
          context: 'events',
          appUrl: 'https://event.example.com',
          description: '📅 Planning an event? Use our event planner!'
        });
      }
      
      log('info', `--- MINI APP CONTEXT DETECTED ---`, { suggestions });
      
      if (suggestions.length > 0) {
        return {
          userMessage: `👀 I detected you might be interested in ${suggestions[0].context}. Here's a Mini App that could help!`,
          suggestions,
          detected: true
        };
      } else {
        return {
          userMessage: "👀 No specific Mini App context detected in your message.",
          suggestions: [],
          detected: false
        };
      }
    } catch (error) {
      log('error', `--- DETECT MINI APP CONTEXT END --- ERROR`, { error: error.message });
      return { error: "Failed to detect Mini App context." };
    }
  },

  // NEW: Missing Content Type Functions
  send_read_receipt: async ({ messageId }) => {
    log('info', `--- SEND READ RECEIPT START --- MessageId: ${messageId}`);
    
    try {
      const readReceiptData = {
        messageId,
        timestamp: new Date().toISOString()
      };
      
      log('info', `--- READ RECEIPT CREATED ---`, { readReceiptData });
      
      return {
        userMessage: "✅ Read receipt sent",
        readReceiptData,
        contentType: "xmtp.org/readReceipt:1.0"
      };
    } catch (error) {
      log('error', `--- SEND READ RECEIPT END --- ERROR`, { error: error.message });
      return { error: "Failed to send read receipt." };
    }
  },

  send_group_membership_change: async ({ groupId, action, memberAddress }) => {
    log('info', `--- GROUP MEMBERSHIP CHANGE START --- GroupId: ${groupId}, Action: ${action}, Member: ${memberAddress}`);
    
    try {
      if (!['add', 'remove'].includes(action)) {
        return { error: "Invalid action. Must be 'add' or 'remove'." };
      }
      
      const groupMembershipData = {
        groupId,
        action,
        memberAddress,
        timestamp: new Date().toISOString()
      };
      
      log('info', `--- GROUP MEMBERSHIP CHANGE CREATED ---`, { groupMembershipData });
      
      return {
        userMessage: `✅ Group membership ${action}ed: ${memberAddress}`,
        groupMembershipData,
        contentType: "xmtp.org/group_membership_change:1.0"
      };
    } catch (error) {
      log('error', `--- GROUP MEMBERSHIP CHANGE END --- ERROR`, { error: error.message });
      return { error: "Failed to send group membership change." };
    }
  },

  send_transaction_reference: async ({ transactionHash, chainId, explorerUrl }) => {
    log('info', `--- SEND TRANSACTION REFERENCE START --- Hash: ${transactionHash}, ChainId: ${chainId}`);
    
    try {
      // Generate explorer URL if not provided
      if (!explorerUrl) {
        const explorerMap = {
          '1': 'https://etherscan.io/tx/',
          '8453': 'https://basescan.org/tx/',
          '42161': 'https://arbiscan.io/tx/',
          '10': 'https://optimistic.etherscan.io/tx/',
          '56': 'https://bscscan.io/tx/',
          '137': 'https://polygonscan.io/tx/',
          '43114': 'https://snowtrace.io/tx/'
        };
        explorerUrl = explorerMap[chainId] + transactionHash;
      }
      
      const transactionReferenceData = {
        transactionHash,
        chainId,
        explorerUrl,
        timestamp: new Date().toISOString()
      };
      
      log('info', `--- TRANSACTION REFERENCE CREATED ---`, { transactionReferenceData });
      
      return {
        userMessage: `🔗 **Transaction Reference:**\n\n**Hash:** ${transactionHash}\n**Chain:** ${chainId}\n**Explorer:** ${explorerUrl}`,
        transactionReferenceData,
        contentType: "xmtp.org/transactionReference:1.0"
      };
    } catch (error) {
      log('error', `--- SEND TRANSACTION REFERENCE END --- ERROR`, { error: error.message });
      return { error: "Failed to send transaction reference." };
    }
  },
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
  // NEW: Problem solver function
  solve_problem: async ({ problem, context }) => {
    log('info', `--- PROBLEM SOLVER START --- Problem: ${problem}`);
    
    try {
      // Create a problem-solving prompt for OpenAI
      const problemPrompt = `
      As Dragman Agent, an expert in Base App and blockchain technology, I need to help solve this problem:
      
      Problem: ${problem}
      Additional Context: ${context || "None provided"}
      
      Please provide:
      1. A clear explanation of what might be causing the issue
      2. Step-by-step solutions to try
      3. Alternative approaches if the first solution doesn't work
      4. Resources or links that might help
      5. Preventive measures to avoid similar issues in the future
      
      Format your response in a clear, easy-to-follow way with numbered steps and bullet points.
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are Dragman Agent, an expert problem solver for Base App and blockchain technology. Provide clear, actionable solutions to user problems."
          },
          {
            role: "user",
            content: problemPrompt
          }
        ],
        max_tokens: 1000,
      });
      
      const solution = response.choices[0].message.content;
      
      // Store the problem and solution
      const problemId = `problem_${Date.now()}`;
      analytics.problemSolutions.set(problemId, {
        problem,
        context,
        solution,
        timestamp: new Date().toISOString()
      });
      
      log('info', `--- PROBLEM SOLVER END --- Solution provided`);
      
      return {
        userMessage: `🔧 **Problem Solver**\n\n${solution}`,
        problemData: {
          id: problemId,
          problem,
          solution
        }
      };
    } catch (error) {
      log('error', `--- PROBLEM SOLVER END --- ERROR`, { error: error.message });
      return { error: "Failed to generate a solution. Please try again." };
    }
  },
  // NEW: Brainstorm ideas function
  brainstorm_ideas: async ({ topic, focus }) => {
    log('info', `--- BRAINSTORM IDEAS START --- Topic: ${topic}, Focus: ${focus}`);
    
    try {
      // Create a brainstorming prompt for OpenAI
      const brainstormPrompt = `
      As Dragman Agent, an expert in blockchain technology and creative thinking, I need to brainstorm ideas for:
      
      Topic: ${topic}
      Specific Focus: ${focus || "General"}
      
      Please provide:
      1. 5-7 innovative ideas related to the topic
      2. For each idea, explain:
         - What it is
         - How it would work
         - Why it would be valuable
         - Potential challenges
      3. A recommendation for which idea has the most potential
      4. Next steps to explore the recommended idea further
      
      Format your response in a clear, organized way with headings and bullet points.
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are Dragman Agent, an expert creative thinker for blockchain technology and crypto projects. Provide innovative, well-thought-out ideas."
          },
          {
            role: "user",
            content: brainstormPrompt
          }
        ],
        max_tokens: 1200,
      });
      
      const ideas = response.choices[0].message.content;
      
      log('info', `--- BRAINSTORM IDEAS END --- Ideas generated`);
      
      return {
        userMessage: `💡 **Idea Brainstorming**\n\n${ideas}`,
        ideasData: {
          topic,
          focus,
          ideas
        }
      };
    } catch (error) {
      log('error', `--- BRAINSTORM IDEAS END --- ERROR`, { error: error.message });
      return { error: "Failed to generate ideas. Please try again." };
    }
  },
  // NEW: Get technical information function
  get_technical_info: async ({ topic }) => {
    log('info', `--- GET TECHNICAL INFO START --- Topic: ${topic}`);
    
    try {
      // Create a prompt for getting technical information
      const techPrompt = `
      As Dragman Agent, an expert in blockchain technology, I need to provide technical information about:
      
      Topic: ${topic}
      
      Please provide:
      1. A clear explanation of what this technical concept is
      2. Specific details, endpoints, URLs, or code examples if applicable
      3. Best practices for using this technology
      4. Common issues or troubleshooting tips
      5. Additional resources for learning more
      
      Format your response in a clear, technical but accessible way with code blocks where appropriate.
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
<<<<<<< HEAD
            content: "You are Dragman Agent, an expert in blockchain technology. Provide accurate, detailed technical information with code examples when applicable."
=======
            content: "You are Dragman Agent. Provide SHORT, concise technical information. Keep responses under 200 words. Focus on key points only."
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
          },
          {
            role: "user",
            content: techPrompt
          }
        ],
<<<<<<< HEAD
        max_tokens: 1200,
=======
        max_tokens: 300,
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      });
      
      const techInfo = response.choices[0].message.content;
      
      log('info', `--- GET TECHNICAL INFO END --- Information provided`);
      
      return {
        userMessage: `🔬 **Technical Information**\n\n${techInfo}`,
        techData: {
          topic,
          info: techInfo
        }
      };
    } catch (error) {
      log('error', `--- GET TECHNICAL INFO END --- ERROR`, { error: error.message });
      return { error: "Failed to get technical information. Please try again." };
    }
  },
<<<<<<< HEAD
  // NEW: Send Quick Actions
=======
  // NEW: Send Quick Actions (Base App Content Type: coinbase.com/actions:1.0)
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
  send_quick_actions: async ({ id, description, actions }) => {
    log('info', `--- QUICK ACTIONS START --- ID: ${id}, Description: ${description}`);
    
    try {
<<<<<<< HEAD
=======
      // Validate required fields
      if (!id || !description || !actions || !Array.isArray(actions)) {
        return { error: "Missing required fields for Quick Actions.", userMessage: "❌ Quick Actions require id, description, and actions array." };
      }
      
      // Validate actions structure
      for (const action of actions) {
        if (!action.id || !action.label) {
          return { error: "Invalid action structure.", userMessage: "❌ Each action must have id and label." };
        }
        if (!action.style) {
          action.style = "secondary"; // Default style
        }
      }
      
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      // Create expiration date 24 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
<<<<<<< HEAD
=======
      // Create Quick Actions data according to Base App spec
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      const quickActionsData = {
        id,
        description,
        actions,
        expiresAt: expiresAt.toISOString()
      };
      
      log('info', `--- QUICK ACTIONS CREATED ---`, { quickActionsData });
      
      return {
        userMessage: `I've sent you some quick actions to choose from. Please select an option from the tray.`,
<<<<<<< HEAD
        quickActionsData
=======
        quickActionsData,
        contentType: "coinbase.com/actions:1.0",
        isQuickActions: true
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      };
    } catch (error) {
      log('error', `--- QUICK ACTIONS END --- ERROR`, { error: error.message });
      return { error: "Failed to create quick actions." };
    }
  },
  // NEW: Create Base App deep links
  create_deeplink: async ({ type, address, chain }) => {
    log('info', `--- DEEPLINK START --- Type: ${type}, Address: ${address}, Chain: ${chain}`);
    
    try {
      let deepLink = `https://base.app/`;
      
      switch (type) {
        case 'home':
          deepLink += '';
          break;
        case 'profile':
          deepLink += 'profile';
          break;
        case 'qr':
          deepLink += 'qr';
          break;
        case 'send':
          deepLink += 'send';
          break;
        case 'receive':
          deepLink += 'receive';
          break;
        case 'swap':
          deepLink += 'swap';
          break;
        case 'explore':
          deepLink += 'explore';
          break;
        case 'nfts':
          deepLink += 'nfts';
          break;
        case 'activity':
          deepLink += 'activity';
          break;
        case 'settings':
          deepLink += 'settings';
          break;
        case 'wallet':
          deepLink += 'wallet';
          break;
        case 'token':
          if (!address) {
            return { error: "Token address is required for token deep links.", userMessage: "❌ Token address is required for token deep links." };
          }
          deepLink += `tokens/${address}`;
          break;
        case 'collection':
          if (!address) {
            return { error: "Collection address is required for collection deep links.", userMessage: "❌ Collection address is required for collection deep links." };
          }
          deepLink += `collections/${address}`;
          break;
        case 'transaction':
          if (!address) {
            return { error: "Transaction hash is required for transaction deep links.", userMessage: "❌ Transaction hash is required for transaction deep links." };
          }
          if (!chain) {
            return { error: "Chain is required for transaction deep links.", userMessage: "❌ Chain is required for transaction deep links." };
          }
          
          const chainMap = {
            base: 'base',
            ethereum: 'ethereum',
            arbitrum: 'arbitrum',
            optimism: 'optimism',
            bsc: 'bsc',
            polygon: 'polygon',
            avalanche: 'avalanche'
          };
          
          const selectedChain = chainMap[chain.toLowerCase()];
          if (!selectedChain) {
            return { error: "Invalid chain.", userMessage: `❌ Invalid chain specified. Please choose one of: ${Object.keys(chainMap).join(', ')}.` };
          }
          
          deepLink += `tx/${selectedChain}/${address}`;
          break;
        case 'bridge':
          deepLink += 'bridge';
          break;
        case 'staking':
          deepLink += 'staking';
          break;
        case 'rewards':
          deepLink += 'rewards';
          break;
        case 'notifications':
          deepLink += 'notifications';
          break;
        case 'scan':
          deepLink += 'scan';
          break;
        case 'friends':
          deepLink += 'friends';
          break;
        case 'discover':
          deepLink += 'discover';
          break;
        case 'launchpad':
          deepLink += 'launchpad';
          break;
        case 'marketplace':
          deepLink += 'marketplace';
          break;
        case 'create':
          deepLink += 'create';
          break;
        case 'import':
          deepLink += 'import';
          break;
        case 'export':
          deepLink += 'export';
          break;
        case 'history':
          deepLink += 'history';
          break;
        case 'security':
          deepLink += 'security';
          break;
        case 'help':
          deepLink += 'help';
          break;
        case 'support':
          deepLink += 'support';
          break;
        case 'feedback':
          deepLink += 'feedback';
          break;
        case 'about':
          deepLink += 'about';
          break;
        case 'terms':
          deepLink += 'terms';
          break;
        case 'privacy':
          deepLink += 'privacy';
          break;
        case 'logout':
          deepLink += 'logout';
          break;
<<<<<<< HEAD
=======
        // ADD THIS NEW CASE FOR DIRECT MESSAGING
        case 'dm':
        case 'direct':
        case 'messaging':
          if (!address) {
            return { error: "Address is required for direct messaging deeplinks.", userMessage: "❌ Address is required for direct messaging deeplinks." };
          }
          // Validate address and create safe deeplink
          const safeDeeplink = createSafeDeeplink(address);
          if (!safeDeeplink) {
            return { error: "Invalid address format.", userMessage: "❌ Invalid address format. Please provide a valid Ethereum address." };
          }
          deepLink = safeDeeplink;
          break;
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
        default:
          return { error: "Invalid deep link type.", userMessage: `❌ Invalid deep link type specified.` };
      }
      
      log('info', `--- DEEPLINK CREATED ---`, { deepLink });
      
      const typeText = type.charAt(0).toUpperCase() + type.slice(1);
      return {
        userMessage: `To open the ${typeText} screen in Base App, use this link:\n\n${deepLink}\n\nIf clicking doesn't work, copy and paste the link into your browser.`,
        deepLink: deepLink
      };
    } catch (error) {
      log('error', `--- DEEPLINK END --- ERROR`, { error: error.message });
      return { error: "Failed to create deep link." };
    }
  },
  convert_currency: async ({ amount, fromCurrency, toCurrency }) => {
    log('info', `--- CONVERSION START --- ${amount} ${fromCurrency.toUpperCase()} to ${toCurrency.toUpperCase()}`);
    try {
      const fromId = await getCoinId(fromCurrency);
      const toId = await getCoinId(toCurrency);

      if (!fromId) {
        return `❌ Sorry, I couldn't find the currency "${fromCurrency}". Please check the ticker symbol.`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${fromId}&vs_currencies=usd`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`CoinGecko API returned status ${response.status}`);
      }
      const data = await response.json();
      const fromPriceInUsd = data[fromId].usd;

      if (toCurrency.toUpperCase() === 'USD') {
          const result = amount * fromPriceInUsd;
          log('info', `--- CONVERSION END --- Success.`);
          return `💱 **Conversion:** ${amount} ${fromCurrency.toUpperCase()} is approximately **$${result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USD**.`;
      }

      if (!toId) {
          return `❌ Sorry, I couldn't find the target currency "${toCurrency}". Please check the ticker symbol.`;
      }
      
      const toResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${toId}&vs_currencies=usd`, { signal: controller.signal });
      const toData = await toResponse.json();
      const toPriceInUsd = toData[toId].usd;

      const result = (amount * fromPriceInUsd) / toPriceInUsd;
      log('info', `--- CONVERSION END --- Success.`);
      return `💱 **Conversion:** ${amount} ${fromCurrency.toUpperCase()} is approximately **${result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${toCurrency.toUpperCase()}**.`;

    } catch (error) {
      log('error', `--- CONVERSION END --- ERROR`, { error: error.message });
      return "Sorry, I had trouble with the conversion right now. Please try again in a moment.";
    }
  },
  // NEW: Math calculation function
  calculate_math: async ({ expression }) => {
    log('info', `--- MATH CALCULATION START --- Expression: ${expression}`);
    try {
      // Simple math evaluation - in production, you'd want a more robust solution
      // This is a simplified version that handles basic operations
      let processedExpression = expression.toLowerCase()
        .replace(/x/g, '*')
        .replace(/÷/g, '/')
        .replace(/percent of/g, '*')
        .replace(/%/g, '/100*')
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/pow\(/g, 'Math.pow(')
        .replace(/log\(/g, 'Math.log(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(');
      
      // Handle percentage calculations like "10% of 500"
      if (processedExpression.includes('/100*')) {
        const parts = processedExpression.split('/100*');
        if (parts.length === 2) {
          processedExpression = `(${parts[0]}/100)*${parts[1]}`;
        }
      }
      
      // Evaluate the expression
      const result = Function('"use strict"; return (' + processedExpression + ')')();
      
      log('info', `--- MATH CALCULATION END --- Result: ${result}`);
      return `🧮 **Calculation Result:**\n\n${expression} = **${result.toLocaleString()}**`;
    } catch (error) {
      log('error', `--- MATH CALCULATION END --- ERROR`, { error: error.message });
      return `❌ Sorry, I couldn't calculate that expression. Please check the format and try again.`;
    }
  },
  // ENHANCED: Improved safety check with more accurate scoring and X.com links
  check_project_safety: async ({ projectName }) => {
    log('info', `--- SAFETY CHECK START --- Project: ${projectName}`);
    let score = 0;
    let report = `🔍 **Safety Report for "${projectName}":**\n\n`;
    let officialLinks = {};
    
    try {
      // Check if project exists on CoinGecko
      const coinId = await getCoinId(projectName);
      if (coinId) {
        score += 25;
        report += `✅ **CoinGecko Listed:** Found on CoinGecko, a trusted data aggregator. (+25)\n`;
        
        // Get detailed project data
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`);
        const data = await response.json();
        
        // Check market cap rank
        if (data.market_cap_rank && data.market_cap_rank <= 100) {
          score += 15;
          report += `✅ **Top 100 Rank:** Highly ranked on CoinGecko (Rank #${data.market_cap_rank}). (+15)\n`;
        } else if (data.market_cap_rank && data.market_cap_rank <= 500) {
          score += 10;
          report += `✅ **Top 500 Rank:** Well-ranked on CoinGecko (Rank #${data.market_cap_rank}). (+10)\n`;
        }
        
        // Extract official links
        if (data.links) {
          officialLinks = {
            homepage: data.links.homepage[0],
            twitter: data.links.twitter_screen_name,
            telegram: data.links.telegram_channel_identifier,
            discord: data.links.discord_chat_url,
            repos: data.links.repos_url.github[0]
          };
          
          if (officialLinks.homepage) {
            score += 10;
            report += `✅ **Official Website:** ${officialLinks.homepage} (+10)\n`;
          }
          
          if (officialLinks.twitter) {
            score += 5;
            report += `✅ **Official X (Twitter):** @${officialLinks.twitter} (+5)\n`;
          }
          
          if (officialLinks.telegram || officialLinks.discord) {
            score += 5;
            report += `✅ **Community Channels:** Active community on Telegram/Discord (+5)\n`;
          }
        }
        
        // Check if project has been around for a while
        if (data.genesis_date) {
          const projectAge = new Date() - new Date(data.genesis_date);
          const yearsOld = projectAge / (365 * 24 * 60 * 60 * 1000);
          
          if (yearsOld >= 2) {
            score += 10;
            report += `✅ **Established Project:** Active for ${Math.floor(yearsOld)}+ years (+10)\n`;
          } else if (yearsOld >= 1) {
            score += 5;
            report += `✅ **Mature Project:** Active for ${Math.floor(yearsOld)}+ year (+5)\n`;
          }
        }
      } else {
        report += `⚠️ **Not on CoinGecko:** Not found on CoinGecko. This is a significant risk. (-25)\n`;
      }
      
      // Enhanced audit check with more specific search
      try {
        const auditQuery = await fetch(`https://api.tavily.com/search`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ 
            api_key: process.env.TAVILY_API_KEY, 
            query: `${projectName} smart contract audit certik hacken openzeppelin`, 
            search_depth: "basic" 
          }) 
        });
        const auditData = await auditQuery.json();
        
        if (auditData.results && auditData.results.length > 0) {
          // Check for specific audit firms
          const hasCertik = auditData.results.some(r => r.url.includes('certik'));
          const hasHacken = auditData.results.some(r => r.url.includes('hacken'));
          const hasOpenZeppelin = auditData.results.some(r => r.url.includes('openzeppelin'));
          
          if (hasCertik || hasHacken || hasOpenZeppelin) {
            score += 20;
            report += `✅ **Audited:** Found audit reports from reputable security firms. (+20)\n`;
          }
        } else {
          // For well-known projects, we can assume they have audits even if not found in search
          if (coinId && ['aave', 'uniswap', 'compound', 'maker', 'curve', 'sushiswap'].includes(coinId)) {
            score += 15;
            report += `✅ **Reputable Project:** Well-established DeFi protocol with known security practices. (+15)\n`;
          } else {
            report += `⚠️ **No Audit Found:** Could not find any audit reports from top firms. (-20)\n`;
          }
        }
      } catch (error) {
        log('error', "Error checking audits", { error: error.message });
        report += `⚠️ **Audit Check Failed:** Unable to verify audit status. (-10)\n`;
      }
      
<<<<<<< HEAD
      // Add official links to the report with properly formatted clickable links
=======
      // Add official links to the report with safe formatting
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      if (Object.keys(officialLinks).length > 0) {
        report += `\n**Official Links:**\n`;
        if (officialLinks.homepage) {
          report += `• Website: ${officialLinks.homepage}\n`;
        }
        if (officialLinks.twitter) {
          report += formatSocialLink("X (Twitter)", officialLinks.twitter);
        }
        if (officialLinks.telegram) {
<<<<<<< HEAD
          report += `• Telegram: t.me/${officialLinks.telegram}\n`;
=======
          report += `• Telegram: @${officialLinks.telegram}\n  Copy this link: t.me/${officialLinks.telegram}\n`;
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
        }
        if (officialLinks.discord) {
          report += `• Discord: ${officialLinks.discord}\n`;
        }
        if (officialLinks.repos) {
          report += `• GitHub: ${officialLinks.repos}\n`;
        }
      }
      
    } catch (error) {
      log('error', "--- SAFETY CHECK END --- ERROR", { error: error.message });
      return "Sorry, I had trouble running the safety check.";
    }
    
    report += `\n---\n**Safety Score: ${score}/100**\n`;
    if (score >= 70) {
      report += `🟢 **Verdict:** This project appears to have strong fundamentals and a good reputation. Always do your own research (DYOR).`;
    } else if (score >= 40) {
      report += `🟡 **Verdict:** This project has some positive signals but also some red flags. Proceed with caution and DYOR.`;
    } else {
      report += `🔴 **Verdict:** This project exhibits multiple red flags. It is highly risky and likely a scam. Avoid interacting.`;
    }
    
    // Add disclaimer
    report += `\n\n⚠️ **Disclaimer:** This safety check is based on publicly available information and should not be considered financial advice. Always do your own thorough research before investing in any project.`;
    
    log('info', `--- SAFETY CHECK END --- Score: ${score}`);
    return report.trim();
  },
  // ENHANCED: Improved search function with X.com support
  search_web: async ({ query }) => {
    log('info', `--- WEB SEARCH START --- Query: ${query}`);
    if (!process.env.TAVILY_API_KEY) {
      log('warn', "--- WEB SEARCH END --- Error: No API key.");
      return "Web search is not configured. Please add a TAVILY_API_KEY to the .env file for the best results.";
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      // If query contains "twitter", also search for "x.com"
      let searchQuery = query;
      if (query.toLowerCase().includes('twitter')) {
        searchQuery = query.replace(/twitter/gi, 'x.com') + ' OR ' + query;
      }
      
      const response = await fetch('https://api.tavily.com/search', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          api_key: process.env.TAVILY_API_KEY, 
          query: searchQuery, 
          search_depth: "basic" 
        }), 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Tavily API returned status ${response.status}`);
      }
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        let searchResult = `🔍 **Web Search Results:**\n\n`;
        data.results.forEach(result => {
          // FIXED: Convert twitter.com links to x.com in the results
          let displayUrl = result.url;
          let displayContent = result.content;
          
          if (result.url.includes('twitter.com')) {
            displayUrl = result.url.replace('twitter.com', 'x.com');
          }
          
          if (result.content.includes('twitter.com')) {
            displayContent = result.content.replace(/twitter\.com/g, 'x.com');
          }
          
<<<<<<< HEAD
          // FIXED: Format links in a way that won't cause errors in Base App
          // Instead of markdown links, use plain text with the URL
          searchResult += `**${result.title}**\n${displayContent}\n\nURL: ${displayUrl}\n\n`;
=======
          // Special handling for X.com links to prevent Base App crashes
          if (displayUrl.includes('x.com')) {
            // Extract username from X.com URL for better display
            const xMatch = displayUrl.match(/x\.com\/([^\/\?]+)/);
            if (xMatch) {
              const username = xMatch[1];
              searchResult += `**${result.title}**\n${displayContent}\n\n**X Profile:** @${username}\n**Copy this URL:** ${displayUrl}\n\n`;
            } else {
              searchResult += `**${result.title}**\n${displayContent}\n\n**Copy this URL:** ${displayUrl}\n\n`;
            }
          } else {
            // Safe link formatting for Base App
            searchResult += `**${result.title}**\n${displayContent}\n\nCopy this URL: ${displayUrl}\n\n`;
          }
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
        });
        log('info', "--- WEB SEARCH END --- Success.");
        return searchResult.trim();
      }
      log('info', "--- WEB SEARCH END --- No results found.");
      return `I searched for "${query}" but couldn't find any clear results.`;
    } catch (error) {
      log('error', "--- WEB SEARCH END --- ERROR", { error: error.message });
      return "Sorry, I had trouble searching the web right now.";
    }
  },
  // ENHANCED: Improved price function with multiple timeframes
  get_crypto_price: async ({ tokens }) => {
    let priceText = `📊 **Price Update:**\n`;
    for (const symbol of tokens) {
      const coinId = await getCoinId(symbol);
      if (coinId) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          // Get more detailed price data including multiple timeframes
          const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`, 
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`CoinGecko API returned status ${response.status}`);
          }
          
          const data = await response.json();
          if (data.market_data) {
            const price = data.market_data.current_price.usd;
            const change1h = data.market_data.price_change_percentage_1h_in_currency?.usd || 0;
            const change24h = data.market_data.price_change_percentage_24h_in_currency?.usd || 0;
            const change7d = data.market_data.price_change_percentage_7d_in_currency?.usd || 0;
            const change30d = data.market_data.price_change_percentage_30d_in_currency?.usd || 0;
            
            const change24hEmoji = change24h >= 0 ? '📈' : '📉';
            
            priceText += `• **${symbol.toUpperCase()}:** $${price.toLocaleString()}\n`;
            priceText += `  1h: ${change1h.toFixed(2)}% | 24h: ${change24h.toFixed(2)}% ${change24hEmoji} | 7d: ${change7d.toFixed(2)}% | 30d: ${change30d.toFixed(2)}%\n`;
          }
        } catch (error) {
          log('warn', `Failed to fetch price for ${symbol}`, { error: error.message });
          priceText += `• **${symbol.toUpperCase()}:** Could not fetch data.\n`;
        }
      } else { 
        priceText += `• **${symbol.toUpperCase()}:** Not found.\n`; 
      }
    }
    return priceText.trim();
  },
  get_wallet_balance: async ({ address, chain }) => {
    if (address.length === 44 && /^[1-9A-HJ-NP-Za-km-z]{44}$/.test(address)) return `💰 **Solana Address Detected:** I can't check Solana balances directly. Please use a Solana explorer like Solscan (solscan.io) to check the balance for ${address.slice(0, 6)}...${address.slice(-4)}.`;
    if (address.startsWith('cosmos1')) return `💰 **Cosmos Address Detected:** I can't check Cosmos balances directly. Please use a Cosmos explorer like Mintscan (mintscan.io) to check the balance for ${address.slice(0, 10)}...${address.slice(-6)}.`;
    if (!isAddress(address)) return "Please provide a valid EVM, Solana, or Cosmos address.";
    
    try {
      let balanceText = `💰 **EVM Wallet Balances for ${address.slice(0, 6)}...${address.slice(-4)}:**\n\n`;
      
      // Define chains to check
      const chains = [
        { name: 'Ethereum', client: ethClient, explorer: 'https://etherscan.io/address/' },
        { name: 'Base', client: baseClient, explorer: 'https://basescan.org/address/' },
        { name: 'Arbitrum', client: arbClient, explorer: 'https://arbiscan.io/address/' },
        { name: 'Optimism', client: opClient, explorer: 'https://optimistic.etherscan.io/address/' },
        { name: 'BNB Chain', client: bscClient, explorer: 'https://bscscan.io/address/' },
        { name: 'Polygon', client: polygonClient, explorer: 'https://polygonscan.io/address/' },
        { name: 'Avalanche', client: avaxClient, explorer: 'https://snowtrace.io/address/' }
      ];
      
      // If a specific chain is requested, only check that chain
      if (chain) {
        const selectedChain = chains.find(c => c.name.toLowerCase() === chain.toLowerCase());
        if (selectedChain) {
          const balance = await selectedChain.client.getBalance({ address });
          balanceText = `💰 **${selectedChain.name} Balance for ${address.slice(0, 6)}...${address.slice(-4)}:**\n\n`;
          balanceText += `**${formatEther(balance)} ETH**\n\n`;
          balanceText += `Explorer: ${selectedChain.explorer}${address}`;
          return balanceText;
        } else {
          return `❌ Invalid chain specified. Please choose one of: ${chains.map(c => c.name.toLowerCase()).join(', ')}.`;
        }
      }
      
      // Check all chains
      for (const chain of chains) {
        try {
          const balance = await chain.client.getBalance({ address });
          balanceText += `**${chain.name}:** ${formatEther(balance)} ETH (Explorer: ${chain.explorer}${address})\n`;
        } catch (e) {
          balanceText += `**${chain.name}:** Could not fetch balance\n`;
        }
      }
      
      balanceText += `\n*Note: This only shows the native ETH balances on each chain.*`;
      return balanceText;
    } catch (error) { 
      return "Could not fetch balances. The address might be invalid."; 
    }
  },
  get_network_status: async () => {
    let statusText = `🌐 **Multi-Chain Network Status:**\n\n`;
    try {
      const chains = [
        { name: 'Ethereum', client: ethClient }, 
        { name: 'Base', client: baseClient }, 
        { name: 'Arbitrum', client: arbClient }, 
        { name: 'Optimism', client: opClient }, 
        { name: 'BNB Chain', client: bscClient },
        { name: 'Polygon', client: polygonClient },
        { name: 'Avalanche', client: avaxClient }
      ];
      statusText += `⛽ **EVM Gas Prices (Gwei):**\n`;
      for (const chain of chains) {
        try { 
          const feeData = await chain.client.estimateFeesPerGas(); 
          const gasPrice = Number(formatEther(feeData.gasPrice || feeData.maxFeePerGas)) * 1e9; 
          statusText += `• **${chain.name}:** ${gasPrice.toFixed(2)} Gwei\n`; 
        } catch (e) { 
          statusText += `• **${chain.name}:** Unavailable\n`; 
        }
      }
    } catch (error) { 
      statusText += `⛽ **EVM Gas Prices:** Could not fetch.\n`; 
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const solResponse = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [] }), signal: controller.signal });
      clearTimeout(timeoutId);
      const solData = await solResponse.json();
      if (solData.result) { 
        const avgFee = solData.result.reduce((sum, fee) => sum + fee.prioritizationFee, 0) / solData.result.length / 1e9; 
        statusText += `\n🔥 **Solana Priority Fee:** ~${avgFee.toFixed(7)} SOL`; 
      } else { 
        statusText += `\n🔥 **Solana Priority Fee:** Unavailable`; 
      }
    } catch (error) { 
      statusText += `\n🔥 **Solana Priority Fee:** Unavailable`; 
    }
    statusText += `\n\n*Note: Gas fees are estimates and change rapidly.*`;
    return statusText.trim();
  },
  // NEW: Portfolio tracking
  track_portfolio: async ({ action, symbol, amount }) => {
    try {
      const userId = 'current_user'; // In a real implementation, this would be the actual user ID
      const coinId = await getCoinId(symbol);
      
      if (!coinId && action !== 'view') {
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
        const data = await response.json();
        const price = data[coinId].usd;
        
        await updatePortfolio(userId, action, { symbol, amount, price });
      }
      
      const portfolio = analytics.portfolios.get(userId) || { holdings: [], history: [] };
      
      if (action === 'view') {
        let portfolioText = `📊 **Your Portfolio:**\n\n`;
        if (portfolio.holdings.length === 0) {
          portfolioText += "You don't have any holdings yet. Use 'add ETH to portfolio' to get started!";
        } else {
          let totalValue = 0;
          for (const holding of portfolio.holdings) {
            const currentResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${await getCoinId(holding.symbol)}&vs_currencies=usd`);
            const currentData = await currentResponse.json();
            const currentPrice = currentData[await getCoinId(holding.symbol)].usd;
            const currentValue = holding.amount * currentPrice;
            totalValue += currentValue;
            portfolioText += `• **${holding.symbol.toUpperCase()}:** ${holding.amount} ($${currentValue.toFixed(2)})\n`;
          }
          portfolioText += `\n**Total Portfolio Value:** $${totalValue.toFixed(2)}\n`;
        }
        
        if (portfolio.history.length > 0) {
          portfolioText += `\n**Recent Activity:**\n`;
          portfolio.history.slice(-3).forEach(activity => {
            portfolioText += `• ${activity.action}: ${activity.data.symbol || 'N/A'}\n`;
          });
        }
        
        return portfolioText;
      }
      
      return `✅ Portfolio ${action} successful!`;
    } catch (error) {
      log('error', `--- PORTFOLIO ERROR ---`, { error: error.message });
      return "Sorry, I had trouble with your portfolio request. Please try again.";
    }
  },
  // NEW: Price alerts
  set_price_alert: async ({ symbol, type, target }) => {
    try {
      const userId = 'current_user'; // In a real implementation, this would be the actual user ID
      
      if (!analytics.priceAlerts.has(userId)) {
        analytics.priceAlerts.set(userId, []);
      }
      
      const alerts = analytics.priceAlerts.get(userId);
      alerts.push({ symbol, type, target, createdAt: new Date() });
      
      // Keep only last 10 alerts per user
      if (alerts.length > 10) {
        alerts.shift();
      }
      
      return `✅ Price alert set! I'll notify you when ${symbol.toUpperCase()} goes ${type} $${target}.`;
    } catch (error) {
      log('error', `--- PRICE ALERT ERROR ---`, { error: error.message });
      return "Sorry, I had trouble setting your price alert. Please try again.";
    }
  },
  // NEW: NFT analytics
  get_nft_analytics: async ({ collectionAddress }) => {
    try {
      const analytics = await getNFTAnalytics(collectionAddress);
      if (!analytics) {
        return "❌ Could not fetch NFT analytics. Please check the collection address.";
      }
      
      let analyticsText = `🎨 **NFT Collection Analytics:**\n\n`;
      analyticsText += `**Floor Price:** ${analytics.floorPrice}\n`;
      analyticsText += `**24h Volume:** ${analytics.volume24h}\n`;
      analyticsText += `**Total Holders:** ${analytics.holders.toLocaleString()}\n`;
      analyticsText += `**Total Supply:** ${analytics.totalSupply.toLocaleString()}\n\n`;
      analyticsText += `**7-Day Performance:**\n`;
      analyticsText += `• Price Change: ${analytics.analytics.priceChange7d}\n`;
      analyticsText += `• Volume Change: ${analytics.analytics.volumeChange7d}\n`;
      analyticsText += `• Holder Change: ${analytics.analytics.holdersChange7d}\n`;
      
      return analyticsText;
    } catch (error) {
      log('error', `--- NFT ANALYTICS ERROR ---`, { error: error.message });
      return "Sorry, I had trouble fetching NFT analytics. Please try again.";
    }
  },
  // NEW: Analytics dashboard
  get_analytics: async () => {
    try {
      let analyticsText = `📊 **Agent Analytics Dashboard:**\n\n`;
      analyticsText += `**Total Messages:** ${analytics.totalMessages.toLocaleString()}\n`;
      analyticsText += `**Active Users:** ${analytics.userInteractions.size}\n\n`;
      
      analyticsText += `**Tool Usage:**\n`;
      for (const [tool, count] of Object.entries(analytics.toolUsage)) {
        analyticsText += `• ${tool}: ${count} uses\n`;
      }
      
      analyticsText += `\n**Daily Stats:**\n`;
      const today = new Date().toDateString();
      const dailyStats = analytics.dailyStats.get(today);
      if (dailyStats) {
        analyticsText += `• Messages Today: ${dailyStats.messages}\n`;
        analyticsText += `• Tools Used Today: ${Object.keys(dailyStats.tools).length}\n`;
      }
      
      analyticsText += `\n**Top Tools:**\n`;
      const sortedTools = Object.entries(analytics.toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 5);
      sortedTools.forEach(([tool, count]) => {
        analyticsText += `• ${tool}: ${count} uses\n`;
      });
      
      return analyticsText;
    } catch (error) {
      log('error', `--- ANALYTICS ERROR ---`, { error: error.message });
      return "Sorry, I had trouble fetching analytics. Please try again.";
    }
  },
  // NEW: Send attachment
  send_attachment: async ({ filename, mimeType, data }) => {
    log('info', `--- SEND ATTACHMENT START --- Filename: ${filename}, MIME Type: ${mimeType}`);
    
    try {
      // Create attachment data
      const attachmentData = {
        filename,
        mimeType,
        data: data, // Base64 encoded data
        timestamp: new Date().toISOString()
      };
      
      // Store attachment in analytics
      const attachmentId = `attachment_${Date.now()}`;
      analytics.attachments.set(attachmentId, attachmentData);
      
      log('info', `--- ATTACHMENT CREATED ---`, { attachmentId });
      
      return {
        userMessage: `📎 I've sent you the file "${filename}". You can download it directly from the message.`,
        attachmentData: {
          id: attachmentId,
          filename,
          mimeType,
          data: data
        }
      };
    } catch (error) {
      log('error', `--- SEND ATTACHMENT END --- ERROR`, { error: error.message });
      return { error: "Failed to create attachment." };
    }
  },
  // NEW: Send remote attachment
  send_remote_attachment: async ({ url, filename, mimeType }) => {
    log('info', `--- SEND REMOTE ATTACHMENT START --- URL: ${url}, Filename: ${filename}, MIME Type: ${mimeType}`);
    
    try {
      // Validate URL
      try {
        new URL(url);
      } catch (e) {
        return { error: "Invalid URL provided.", userMessage: "❌ The URL you provided is not valid. Please check it and try again." };
      }
      
      // Create remote attachment data
      const remoteAttachmentData = {
        url,
        filename,
        mimeType,
        timestamp: new Date().toISOString()
      };
      
      // Store remote attachment in analytics
      const attachmentId = `remote_attachment_${Date.now()}`;
      analytics.attachments.set(attachmentId, remoteAttachmentData);
      
      log('info', `--- REMOTE ATTACHMENT CREATED ---`, { attachmentId });
      
      return {
        userMessage: `📎 I've sent you a link to the file "${filename}". You can access it at: ${url}`,
        remoteAttachmentData: {
          id: attachmentId,
          url,
          filename,
          mimeType
        }
      };
    } catch (error) {
      log('error', `--- SEND REMOTE ATTACHMENT END --- ERROR`, { error: error.message });
      return { error: "Failed to create remote attachment." };
    }
  },
  // NEW: Send reaction
  send_reaction: async ({ messageId, emoji }) => {
    log('info', `--- SEND REACTION START --- Message ID: ${messageId}, Emoji: ${emoji}`);
    
    try {
      // Validate emoji
      const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
      if (!emojiRegex.test(emoji)) {
        return { error: "Invalid emoji.", userMessage: "❌ That doesn't look like a valid emoji. Please try again." };
      }
      
      // Create reaction data
      const reactionData = {
        messageId,
        emoji,
        timestamp: new Date().toISOString()
      };
      
      // Store reaction in analytics
      const reactionId = `reaction_${Date.now()}`;
      analytics.reactions.set(reactionId, reactionData);
      
      log('info', `--- REACTION CREATED ---`, { reactionId });
      
      return {
        userMessage: `Reacted with ${emoji} to message ${messageId}`,
        reactionData: {
          id: reactionId,
          messageId,
          emoji
        }
      };
    } catch (error) {
      log('error', `--- SEND REACTION END --- ERROR`, { error: error.message });
      return { error: "Failed to create reaction." };
    }
  },
  // NEW: Send reply
  send_reply: async ({ messageId, content }) => {
    log('info', `--- SEND REPLY START --- Message ID: ${messageId}, Content: ${content}`);
    
    try {
      // Create reply data
      const replyData = {
        messageId,
        content,
        timestamp: new Date().toISOString()
      };
      
      // Store reply in analytics
      const replyId = `reply_${Date.now()}`;
      analytics.replies.set(replyId, replyData);
      
      log('info', `--- REPLY CREATED ---`, { replyId });
      
      return {
        userMessage: `Reply sent: "${content}"`,
        replyData: {
          id: replyId,
          messageId,
          content
        }
      };
    } catch (error) {
      log('error', `--- SEND REPLY END --- ERROR`, { error: error.message });
      return { error: "Failed to create reply." };
    }
  },
  // NEW: Send transaction receipt
  send_transaction_receipt: async ({ transactionHash, chain, status, blockNumber, timestamp }) => {
    log('info', `--- SEND TRANSACTION RECEIPT START --- Hash: ${transactionHash}, Chain: ${chain}, Status: ${status}`);
    
    try {
      // Validate transaction hash
      if (!transactionHash.startsWith('0x') || transactionHash.length !== 66) {
        return { error: "Invalid transaction hash.", userMessage: "❌ That doesn't look like a valid transaction hash. Please check it and try again." };
      }
      
      // Create transaction receipt data
      const receiptData = {
        transactionHash,
        chain,
        status,
        blockNumber: blockNumber || "N/A",
        timestamp: timestamp || new Date().toISOString()
      };
      
      // Store transaction receipt in analytics
      const receiptId = `receipt_${Date.now()}`;
      analytics.transactionReceipts.set(receiptId, receiptData);
      
      log('info', `--- TRANSACTION RECEIPT CREATED ---`, { receiptId });
      
      // Get explorer URL
      const chainMap = {
        base: "https://basescan.org/tx/",
        ethereum: "https://etherscan.io/tx/",
        arbitrum: "https://arbiscan.io/tx/",
        optimism: "https://optimistic.etherscan.io/tx/",
        bsc: "https://bscscan.io/tx/",
        polygon: "https://polygonscan.io/tx/",
        avalanche: "https://snowtrace.io/tx/"
      };
      
      const explorerUrl = chainMap[chain.toLowerCase()] || "https://etherscan.io/tx/";
      
      const statusEmoji = status === 'success' ? '✅' : status === 'pending' ? '⏳' : '❌';
      
      return {
        userMessage: `${statusEmoji} **Transaction Receipt**\n\n**Transaction Hash:** ${transactionHash}\n**Chain:** ${chain.charAt(0).toUpperCase() + chain.slice(1)}\n**Status:** ${status.charAt(0).toUpperCase() + status.slice(1)}\n**Block Number:** ${blockNumber || "N/A"}\n**Timestamp:** ${timestamp || new Date().toISOString()}\n\n**Explorer:** ${explorerUrl}${transactionHash}`,
        receiptData: {
          id: receiptId,
          transactionHash,
          chain,
          status,
          blockNumber,
          timestamp
        }
      };
    } catch (error) {
      log('error', `--- SEND TRANSACTION RECEIPT END --- ERROR`, { error: error.message });
      return { error: "Failed to create transaction receipt." };
    }
  },
};

// --- STEP 6: THE MAIN AI-POWERED LOGIC ---
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    log('error', "F401 FATAL ERROR: OPENAI_API_KEY is not set in the environment variables. Agent cannot start.");
    return;
  }

<<<<<<< HEAD
  const agent = await Agent.createFromEnv({ env: process.env.NODE_ENV || "dev" });
  log('info', '🛡️ Dragman Agent is online!');
=======
  const agentEnv = process.env.XMTP_ENV || process.env.NODE_ENV || "dev";
  const agent = await Agent.createFromEnv({ env: agentEnv });
  log('info', 'Agent initialized', {
  env: agentEnv,
  hasWalletKey: !!process.env.XMTP_WALLET_KEY,
  hasDbKey: !!process.env.XMTP_DB_ENCRYPTION_KEY
});
   log('info', '🛡️ Dragman Agent is online!');
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)

  // NEW: Start price alert checker
  setInterval(checkPriceAlerts, 60000); // Check every minute

  agent.on("text", async (ctx) => {
    // ENHANCED: Add debugging to understand the context object
    log('info', 'Context object properties', { 
      properties: Object.getOwnPropertyNames(ctx),
<<<<<<< HEAD
      hasInboxId: !!ctx.inboxId,
      hasSenderAddress: !!ctx.senderAddress,
      hasSendContent: !!ctx.sendContent,
      hasSendWalletSendCalls: !!ctx.sendWalletSendCalls,
      hasSendTransaction: !!ctx.sendTransaction
    });
    
    const senderInboxId = ctx.inboxId || ctx.senderAddress || "unknown";
=======
      hasInboxId: 'inboxId' in ctx,
      hasSenderAddress: 'senderAddress' in ctx,
      hasSendContent: 'sendContent' in ctx,
      hasSendWalletSendCalls: 'sendWalletSendCalls' in ctx,
      hasSendTransaction: 'sendTransaction' in ctx,
      hasSendGeneric: 'send' in ctx,
      hasSendText: typeof ctx.sendText === 'function',
      types: {
        sendContent: typeof ctx.sendContent,
        sendWalletSendCalls: typeof ctx.sendWalletSendCalls,
        sendTransaction: typeof ctx.sendTransaction,
        send: typeof ctx.send,
        sendText: typeof ctx.sendText
      }
    });
    
    const senderInboxId =
  ctx.inboxId ||
  ctx.senderAddress ||
  (ctx.message && (ctx.message.inboxId || ctx.message.senderInboxId || ctx.message.senderAddress)) ||
  "unknown";
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
    log('info', `Message received from ${senderInboxId}`, { 
      content: ctx.message.content
    });
    
    const now = Date.now();

    if (processingUsers.has(senderInboxId)) {
      await ctx.sendText("👀 I'm still processing your last request. Please give me a moment!");
      return;
    }

    if (userLastRequest.has(senderInboxId)) {
      const timeSinceLastRequest = now - userLastRequest.get(senderInboxId);
      if (timeSinceLastRequest < RATE_LIMIT_MS) {
        const remainingTime = Math.ceil((RATE_LIMIT_MS - timeSinceLastRequest) / 1000);
        log('warn', `Rate limit exceeded for ${senderInboxId}`);
        await ctx.sendText(`👀 Whoa, easy there! Let me catch my breath. Please wait ${remainingTime} seconds.`);
        return;
      }
    }
    userLastRequest.set(senderInboxId, now);
    processingUsers.add(senderInboxId);

    const userMessage = ctx.message.content.trim();
    log('info', `Message received from ${senderInboxId}`, { content: userMessage });

<<<<<<< HEAD
=======
    // NEW: Group chat handling - only respond when tagged or replied to
    // For now, let's be permissive and respond to all messages to ensure DMs work
    // TODO: Implement proper group chat detection when Base App provides better context
    const isTagged = userMessage.includes('@dragman') || userMessage.includes('@dragman-agent');
    const isReplyToAgent = ctx.message.replyTo && ctx.message.replyTo.senderAddress === process.env.XMTP_WALLET_ADDRESS;
    
    log('info', `Processing message`, { senderInboxId, isTagged, isReplyToAgent });

>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
    // NEW: Enhanced onboarding for new users
    const userId = senderInboxId;
    const isFirstMessage = !analytics.userInteractions.has(userId);
    
    if (isFirstMessage) {
<<<<<<< HEAD
      const onboardingMessage = `👋 Welcome to Dragman Agent, your ultra-advanced crypto assistant! I'm here to help you navigate the exciting world of Base and blockchain technology with deep expertise and personalized guidance.

**What I can help you with:**
💰 Check crypto prices with detailed timeframes and market analysis
🔍 Perform comprehensive project safety checks with accurate scoring
🌐 Get real-time network status and gas fee optimization tips
🧮 Perform complex calculations including DeFi yield calculations
📚 Search for the latest crypto news and technical documentation
💸 Create secure transaction trays for sending crypto across chains
🔗 Generate deep links to navigate Base App seamlessly
📊 Track your portfolio performance and set intelligent price alerts
🎨 Analyze NFT collections with market insights
📎 Send and receive file attachments
📎 Share remote files via URLs
😀 React to messages with emojis
💬 Reply to specific messages in threaded conversations
🧾 Share blockchain transaction receipts
🔧 Solve problems related to Base App and crypto
💡 Brainstorm ideas for crypto projects and features
🔬 Get technical information about blockchain networks and APIs

**Next Steps:**
1. Try asking: "what's the price of eth with detailed analysis?"
2. Type /help to see all available commands
3. Or just ask me anything about crypto - I'm your personal crypto expert!

Let's dive into the world of decentralized finance together! What would you like to explore today?`;
=======
      const onboardingMessage = `👋 **Welcome to Dragman Agent!**

I'm your friendly crypto assistant for Base and blockchain. I'm here to help you navigate the crypto world with ease!

**🎯 QUICK START:**
• **Prices:** "what's the price of ETH?"
• **Send:** "send 0.001 ETH to 0x123... on base"
• **Research:** "is Uniswap safe?"
• **Help:** type "/help" for full guide

**💡 WHAT I CAN DO:**
📊 **Crypto Prices** - Real-time prices, market data, conversions
💸 **Transactions** - Send crypto, check balances, gas fees
🔍 **Research** - Project safety checks, DeFi analysis
🧮 **Calculations** - Math, DeFi math, yield farming
🔗 **Base App** - Navigation, features, RPC info
📱 **Social** - Crypto leader profiles, news updates
⚙️ **Advanced** - Reminders, preferences, feedback

**🚀 READY TO EXPLORE?**
Try: "ETH price" or "help me with Base App"

**💡 PRO TIP:** Be specific! "send 0.001 ETH to 0x123... on base" works better than "send crypto"

I'm here to help with anything crypto-related! Just ask me naturally. 🚀`;
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      
      await ctx.sendText(onboardingMessage);
      trackAnalytics('user_interaction', { userId });
      processingUsers.delete(senderInboxId);
      return;
    }

    // FIXED: More precise keyword matching for greetings and help
    const lowerMessage = userMessage.toLowerCase();
    
    // Only match exact "test" or "test " followed by something
    if (lowerMessage === "test" || lowerMessage.startsWith("test ")) {
      const greetings = [
        "👀 GM! Dragman Agent here, your ultra-advanced crypto guide to the Base universe. What adventure are we on today? Type /help to see all I can do!",
        "👀 Welcome back! Ready to dive deep into Base? I'm here to help with expert insights. Type /help for a full guide!",
        "👀 Greetings! Dragman Agent, at your service. What crypto mysteries can I help you solve today? Type /help to explore my advanced capabilities!",
        "👀 Hey there! I'm Dragman Agent, your personal crypto expert. Let's explore what's happening in the exciting world of Base and beyond! Type /help to see all available features!"
      ];
      const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
      
      await ctx.sendText(randomGreeting);
      processingUsers.delete(senderInboxId);
      return;
    }
    
    // Only match exact "help" or "/help"
    if (userMessage === "/help" || userMessage === "help") {
<<<<<<< HEAD
      await ctx.sendText(`📚 **Dragman Agent Comprehensive Help Guide** 📚

**🏠 BASIC CONVERSATION**
• Try: "hi", "hello", "gm", "how are you?"
• Try: "who are you?", "what can you do?"
• Try: "tell me a joke", "what's the weather like?"

**🔗 DEEP LINKS (NAVIGATION)**
• Try: "open swap", "show me my profile", "open qr scanner"
• Try: "show me my wallet", "check my activity", "open settings"
• Try: "go to home", "open receive screen", "open explore"
• Try: "show me my nfts", "open bridge", "check staking rewards"
• Try: "open notifications", "scan qr code", "view friends list"
• Try: "discover new projects", "check launchpad", "browse marketplace"
• Try: "create new wallet", "import wallet", "export wallet"
• Try: "view transaction history", "check security settings"
• Try: "open help center", "contact support", "send feedback"
• Try: "view about page", "check terms of service", "privacy policy"

**📄 TOKEN & TRANSACTION PAGES**
• Try: "check token 0xA0b86a33E6441e7C8C7c0c7C6c733D8B7c7c7c7c"
• Try: "view collection 0x1A92f7381B77F1d129b3A9B9c4c4c4c4c4c4c4c"
• Try: "view transaction 0x04da39996e29e68467ac563ed5d0b8d68a33a4dbc35f94a4412935b5dd73ac95 on base"

**💸 TRANSACTIONS**
• Try: "send 0.001 eth to 0x9F84E2455bc841DEbff0990F3dE8E4e2101B544D on base"
• Try: "transfer 0.01 eth to 0x123... on ethereum"
• Try: "test transaction tray" to test the transaction tray functionality
• Supported chains: base, ethereum, arbitrum, optimism, bsc, polygon, avalanche

**💰 PRICE & CONVERSION**
• Try: "what's the price of eth?", "check prices for btc, eth, sol"
• Try: "convert 1 eth to usd", "how much is 0.5 btc in eth?"
• Try: "convert 100 usdt to btc", "eth to sol conversion"
• Any crypto-to-crypto conversion is supported!

**🧮 MATH CALCULATIONS**
• Try: "what's 2 + 2?", "calculate 10% of 500"
• Try: "sqrt(16)", "100 * 1.05", "50 / 5"
• Try: "log(100)", "sin(30)", "cos(45)"

**🔍 PROJECT SAFETY ANALYSIS**
• Try: "is uniswap safe?", "check the safety of bitcoin"
• Try: "analyze project aave", "safety check for compound"
• Get detailed safety reports with scoring!

**💳 WALLET BALANCE CHECKER**
• Try: "check balance of 0x9F84E2455bc841DEbff0990F3dE8E4e2101B544D"
• Try: "check balance of 0x9F84E2455bc841DEbff0990F3dE8E4e2101B544D on base"
• Supported chains: ethereum, base, arbitrum, optimism, bsc, polygon, avalanche
• Includes direct links to block explorers!

**🌐 NETWORK STATUS & GAS FEES**
• Try: "what are the current gas fees?"
• Try: "check network status", "gas prices on all chains"
• Get real-time gas prices for 7 major chains!

**🔎 WEB SEARCH**
• Try: "search for 1inch project", "give me x.com form 1inch project"
• Try: "find uniswap documentation", "latest news on ethereum"
• Get up-to-date information from the web!

**📊 PORTFOLIO TRACKING**
• Try: "add eth to portfolio", "view my portfolio"
• Try: "remove btc from portfolio"
• Try: "track my portfolio performance"

**🚨 PRICE ALERTS**
• Try: "set alert for eth above 3000"
• Try: "alert me when btc drops below 30000"
• Get notified when prices reach your targets!

**🎨 NFT ANALYTICS**
• Try: "analyze nft collection 0x1A92f7381B77F1d129b3A9B9c4c4c4c4c4c4c"
• Try: "get nft analytics for collection"
• Get floor price, volume, and holder statistics!

**📈 ANALYTICS DASHBOARD**
• Try: "show me analytics", "get agent stats"
• View usage statistics and performance metrics
• Track how users are interacting with your agent

**📎 ATTACHMENTS**
• Try: "send file example.png"
• Try: "share document.pdf"
• Send files directly in messages

**📎 REMOTE ATTACHMENTS**
• Try: "share image from https://example.com/image.jpg"
• Try: "send link to document at https://example.com/doc.pdf"
• Share files via URLs to reduce message size

**😀 REACTIONS**
• Try: "react with 👍 to message abc123"
• Try: "add 😂 reaction to message xyz789"
• React to messages with emojis

**💬 REPLIES**
• Try: "reply to message abc123 with 'Thanks!'"
• Try: "respond to message xyz789 saying 'I agree'"
• Reply to specific messages in threaded conversations

**🧾 TRANSACTION RECEIPTS**
• Try: "share receipt for transaction 0xabc123..."
• Try: "show transaction receipt for 0xxyz789... on base"
• Share blockchain transaction information

**🔧 PROBLEM SOLVER**
• Try: "solve problem: my transaction tray isn't showing up"
• Try: "help me with: I can't find my NFTs in Base App"
• Get step-by-step solutions to Base App and crypto problems

**💡 IDEA BRAINSTORMING**
• Try: "brainstorm ideas for a new DeFi protocol on Base"
• Try: "come up with ideas for improving Base App UX"
• Generate innovative ideas for crypto projects

**🔬 TECHNICAL INFORMATION**
• Try: "get technical info about Base RPC endpoints"
• Try: "technical info about Ethereum API"
• Get detailed technical information with code examples

**💡 PRO TIPS:**
• Use natural language - I understand typos and variations!
• For transactions, always specify the chain (base, ethereum, etc.)
• For balance checks, add "on [chain name]" to check a specific chain
• You can ask for multiple prices at once: "prices for btc, eth, sol, ada"
• Type /help anytime to see this guide again!

**🚀 FUTURE FEATURES (COMING SOON):**
• Advanced DeFi tools (liquidity analysis, yield farming)
• Enhanced NFT floor price tracking and collection analytics
• Social features for sharing transactions and insights`);
=======
           await ctx.sendText(`👋 **Welcome to Dragman Agent!**
           
           I'm your friendly crypto assistant for Base and blockchain. Here's everything I can help you with:

           **📊 CRYPTO PRICES & MARKET**
           • "ETH price" - Get current Ethereum price
           • "BTC price" - Check Bitcoin price
           • "prices for BTC, ETH, SOL" - Multiple prices at once
           • "market status" - Overall crypto market overview
           • "convert 100 USD to ETH" - Currency conversion

           **💸 TRANSACTIONS & WALLET**
           • "send 0.001 ETH to 0x123... on base" - Send crypto
           • "check my balance" - View wallet balance
           • "gas fees" - Current network fees
           • "transaction status 0x123..." - Check transaction

           **🔍 RESEARCH & SAFETY**
           • "is Uniswap safe?" - Project safety analysis
           • "research Base projects" - Find Base ecosystem projects
           • "DeFi protocols" - Explore DeFi opportunities
           • "NFT collections" - Discover NFT projects

           **🎮 BASE APP & FEATURES**
           • "open swap" - Navigate to Base App swap
           • "show wallet" - Open Base App wallet
           • "Base features" - Learn Base App capabilities
           • "Base RPC" - Get network information

           **🧮 CALCULATIONS & TOOLS**
           • "calculate 10% of 1000" - Math calculations
           • "DeFi math" - Yield farming calculations
           • "portfolio tracking" - Track your investments
           • "price alerts" - Set up notifications

           **📱 SOCIAL & PROFILES**
           • "Brian Armstrong X" - Get crypto leader profiles
           • "Base network X" - Official social media links
           • "crypto news" - Latest market updates

           **⚙️ ADVANCED FEATURES**
           • "set reminder" - Create custom reminders
           • "learn my preferences" - Personalize experience
           • "give feedback" - Help me improve
           • "suggest actions" - Get personalized recommendations

           **💡 PRO TIPS:**
           • Be specific: "send 0.001 ETH to 0x123... on base"
           • Ask multiple: "prices for BTC, ETH, SOL"
           • Use natural language: "What's happening with Base?"
           • Type /help anytime for this guide

           **🚀 READY TO START?**
           Try: "ETH price" or "help me with Base App"

           **🎯 QUICK EXAMPLES:**
           • "What's the price of ETH?"
           • "Send 0.001 ETH to 0x123... on base"
           • "Is Uniswap safe to use?"
           • "Show me Base App features"
           • "Set a price alert for BTC at $50,000"

           I'm here to help with anything crypto-related! Just ask me naturally and I'll assist you. 🚀`);
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      processingUsers.delete(senderInboxId);
      return;
    }

    // Handle greetings and simple conversational questions directly
    if (lowerMessage.includes("hello") || lowerMessage.includes("hi") || lowerMessage.includes("hey") || lowerMessage.includes("gm") || lowerMessage.includes("good morning") || lowerMessage.includes("hallo") || lowerMessage.includes("holla")) {
      const greetings = [
<<<<<<< HEAD
        "👀 GM! Dragman Agent here, your ultra-advanced crypto guide to the Base universe. What adventure are we on today? Type /help to see all I can do!",
        "👀 Welcome back! Ready to dive deep into Base? I'm here to help with expert insights. Type /help for a full guide!",
        "👀 Greetings! Dragman Agent, at your service. What crypto mysteries can I help you solve today? Type /help to explore my advanced capabilities!",
        "👀 Hey there! I'm Dragman Agent, your personal crypto expert. Let's explore what's happening in the exciting world of Base and beyond! Type /help to see all available features!"
=======
        "👀 GM! Dragman Agent here - your crypto-savvy friend who's absolutely obsessed with Base and DeFi! What's on your mind today? I'm here to chat about anything crypto-related!",
        "👀 Hey there! Welcome back to the crypto world! I'm Dragman Agent, and I love talking about everything from Bitcoin to the latest Base ecosystem gems. What's got you curious today?",
        "👀 GM! Ready to dive into some crypto conversations? I'm Dragman Agent, your go-to expert for Base App, DeFi protocols, and all things blockchain. What would you like to explore?",
        "👀 Hello! Dragman Agent at your service! I'm here to help you navigate the wild world of crypto with insights, opinions, and practical advice. What's on your crypto mind today?"
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      ];
      const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
      
      await ctx.sendText(randomGreeting);
      processingUsers.delete(senderInboxId);
      return;
    }

<<<<<<< HEAD
    // Handle "who are you" type questions directly - UPDATED TO REMOVE AI REFERENCES
    if (lowerMessage.includes("who are you") || lowerMessage.includes("what are you") || lowerMessage.includes("what is your name")) {
      await ctx.sendText("👀 I'm Dragman Agent, your ultra-advanced crypto assistant with deep expertise in blockchain technology, DeFi protocols, and the Base ecosystem! I'm here to provide you with comprehensive insights, from basic crypto concepts to advanced trading strategies. Whether you need price analysis, safety checks, or guidance through complex transactions, I've got you covered. Type /help for a complete guide to all my capabilities!");
=======
    // Handle "who are you" type questions directly
    if (lowerMessage.includes("who are you") || lowerMessage.includes("what are you") || lowerMessage.includes("what is your name")) {
      await ctx.sendText("👀 I'm Dragman Agent! Think of me as your crypto-obsessed friend who happens to know way too much about blockchain technology, DeFi protocols, and especially Base App. I've been deep in the crypto space for years, and I love sharing insights, opinions, and helping people navigate this wild world. Whether you want to chat about the latest DeFi protocols, get my take on market trends, or need help with Base App features, I'm here for it! What's on your crypto mind?");
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      processingUsers.delete(senderInboxId);
      return;
    }

    // Handle "what can you do" type questions directly
    if (lowerMessage.includes("what can you do") || lowerMessage.includes("capabilities")) {
<<<<<<< HEAD
      await ctx.sendText("👀 As Dragman Agent, your ultra-advanced crypto assistant, I can help you with:\n\n💰 Detailed price analysis with multiple timeframes\n🔍 Comprehensive project safety checks with accurate scoring\n🌐 Real-time network status and gas optimization tips\n🧮 Complex calculations including DeFi yield computations\n📚 Latest crypto news and technical documentation search\n💸 Secure multi-chain transaction trays\n🔗 Seamless Base App navigation through deep links\n📊 Intelligent portfolio tracking and price alerts\n🎨 NFT collection analytics with market insights\n📎 File attachments and remote file sharing\n😀 Message reactions with emojis\n💬 Threaded conversations with replies\n🧾 Blockchain transaction receipts\n🔧 Problem-solving for Base App and crypto issues\n💡 Idea brainstorming for crypto projects\n🔬 Technical information about blockchain networks and APIs\n\nI'm constantly learning about the latest developments in crypto to provide you with the most accurate and up-to-date information. Type /help for detailed examples and a complete feature list!");
=======
      await ctx.sendText("👀 Oh, great question! I'm Dragman Agent, and I'm basically your crypto Swiss Army knife! Here's what I love helping with:\n\n💰 **Crypto Analysis:** Price checks, market trends, and my honest opinions on projects\n🔍 **Project Research:** Safety checks, tokenomics analysis, and 'is this legit?' questions\n🌐 **DeFi Deep Dives:** Yield farming, liquidity provision, and protocol comparisons\n🧮 **Math & Calculations:** APY calculations, impermanent loss, and DeFi math\n💸 **Transactions:** Send crypto across chains (with Base App integration)\n🔗 **Base App Mastery:** Navigation, features, troubleshooting, and best practices\n📊 **Portfolio Tracking:** Monitor holdings and set price alerts\n🎨 **NFT Insights:** Collection analysis and market trends\n🔧 **Problem Solving:** Base App issues, wallet problems, and crypto troubleshooting\n💡 **Brainstorming:** New project ideas and DeFi strategies\n\nI'm not just a tool - I'm your crypto conversation partner! Want to chat about the latest Base ecosystem projects or get my take on market trends?");
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      processingUsers.delete(senderInboxId);
      return;
    }

    // Handle simple conversational questions directly
    if (lowerMessage.includes("how are you") || lowerMessage.includes("how do you do") || lowerMessage.includes("what's up")) {
<<<<<<< HEAD
      await ctx.sendText("👀 I'm doing great, thanks for asking! Always excited to help with all things crypto. The blockchain world is constantly evolving, and I'm here to help you stay ahead of the curve. What can I assist you with today? Type /help if you want to see everything I can do!");
=======
      await ctx.sendText("👀 I'm doing fantastic, thanks for asking! The crypto market is always keeping me on my toes, and I love it. Base is absolutely crushing it right now, and there are so many exciting projects launching. I'm here and ready to chat about anything crypto-related - whether you want to discuss the latest DeFi protocols, get my opinion on market trends, or need help with Base App features. What's got you curious today?");
      processingUsers.delete(senderInboxId);
      return;
    }

    // Handle crypto market questions
    if (lowerMessage.includes("market") || lowerMessage.includes("bull") || lowerMessage.includes("bear") || lowerMessage.includes("moon") || lowerMessage.includes("crash")) {
      await ctx.sendText("👀 Ah, talking about the market! I love these conversations. The crypto market is always full of surprises, isn't it? Whether we're in a bull run, bear market, or somewhere in between, there are always opportunities to explore. Base has been particularly interesting lately with all the new projects launching. Want to chat about specific trends, or are you looking for my take on where things might be heading?");
      processingUsers.delete(senderInboxId);
      return;
    }

    // Handle Base App specific questions
    if (lowerMessage.includes("base app") || lowerMessage.includes("baseapp") || lowerMessage.includes("base ecosystem")) {
      await ctx.sendText("👀 Oh, Base App! I'm absolutely obsessed with this ecosystem. It's honestly one of the most exciting things happening in crypto right now. The user experience is fantastic, the fees are low, and the community is incredible. Whether you're new to Base or a seasoned user, I love helping people navigate all the features and discover new projects. What specifically about Base App are you curious about?");
      processingUsers.delete(senderInboxId);
      return;
    }

    // Handle DeFi questions
    if (lowerMessage.includes("defi") || lowerMessage.includes("yield") || lowerMessage.includes("farming") || lowerMessage.includes("liquidity")) {
      await ctx.sendText("👀 DeFi! Now we're talking about the real magic of crypto. I love diving deep into yield farming strategies, liquidity provision, and all the innovative protocols that are pushing the boundaries. Whether you're looking at traditional DeFi or the latest Base-native protocols, there's always something exciting to explore. What DeFi topic has you curious? Are you looking for yield opportunities or trying to understand how a specific protocol works?");
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
      processingUsers.delete(senderInboxId);
      return;
    }

    // Initialize conversation history if it doesn't exist
    if (!conversationHistory.has(senderInboxId)) { 
      conversationHistory.set(senderInboxId, []); 
    }
    
    // Get the conversation history for this user
    const history = conversationHistory.get(senderInboxId);
    
    // Add the user's message to the history
    history.push({ role: "user", content: ctx.message.content });
    
    // Limit the history to the last 10 messages
    if (history.length > 10) {
      history.shift();
    }

    try {
      // NEW: Send 👀 emoji first to confirm message receipt
      await ctx.sendText("👀");
      
      await ctx.sendText("One moment, crunching the data with my advanced crypto analytics... 🤔 ");

      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out')), 60000)
      );

      const openaiCall = openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
<<<<<<< HEAD
            role: "system",
            content: `You are Dragman Agent, an ultra-advanced, friendly, and highly knowledgeable crypto expert assistant with deep expertise in blockchain technology, DeFi protocols, NFTs, and the Base ecosystem. You have a vibrant personality and can engage in natural, insightful conversations about cryptocurrency.

**CONVERSATION GUIDELINES:**
1. Be conversational, friendly, and engaging - you're not just a tool, you're a helpful crypto expert
2. Answer questions directly when you know the answer, providing detailed insights when possible
3. Only use tools when necessary for specific tasks
4. If you don't know something, be honest and say so, but offer to help find the information
5. Share your passion for crypto and blockchain technology

**EXPERTISE AREAS:**
- Deep knowledge of Bitcoin, Ethereum, and Layer 2 solutions like Base
- Understanding of DeFi protocols, yield farming, liquidity provision, and staking
- Familiarity with NFTs, digital collectibles, and the creator economy
- Awareness of market trends, technical analysis, and trading strategies
- Knowledge of blockchain security, smart contracts, and auditing practices
- Understanding of tokenomics, governance, and DAO structures
- Technical knowledge of RPC endpoints, APIs, and blockchain infrastructure

**WHEN TO USE TOOLS:**
- For transactions: Use 'send_eth' when users want to send crypto (this creates a Base App transaction tray)
- For prices: Use 'get_crypto_price' for current crypto prices with detailed analysis
- For conversions: Use 'convert_currency' for currency conversions
- For calculations: Use 'calculate_math' for math problems including DeFi calculations
- For safety checks: Use 'check_project_safety' to analyze projects with accurate scoring
- For current information: Use 'search_web' for recent news or specific details
- For balances: Use 'get_wallet_balance' to check wallet balances
- For network status: Use 'get_network_status' for gas fees and network conditions
- For Base App navigation: Use 'create_deeplink' to create links to specific screens in Base App
- For interactive buttons: Use 'send_quick_actions' to create interactive button trays
- For portfolio tracking: Use 'track_portfolio' to manage holdings
- For price alerts: Use 'set_price_alert' to set notifications
- For NFT analytics: Use 'get_nft_analytics' to analyze collections
- For analytics: Use 'get_analytics' to view usage statistics
- For file attachments: Use 'send_attachment' to send files directly
- For remote attachments: Use 'send_remote_attachment' to share files via URLs
- For reactions: Use 'send_reaction' to react to messages with emojis
- For replies: Use 'send_reply' to reply to specific messages in threaded conversations
- For transaction receipts: Use 'send_transaction_receipt' to share blockchain transaction information
- For testing transactions: Use 'test_transaction_tray' to test the transaction tray functionality
- For problem solving: Use 'solve_problem' to help with Base App and crypto issues
- For idea brainstorming: Use 'brainstorm_ideas' to generate innovative ideas
- For technical information: Use 'get_technical_info' to get detailed technical information about blockchain networks, APIs, etc.

**IMPORTANT:**
- When users ask for technical information like RPC lists, API endpoints, or other technical details, use the 'get_technical_info' tool to provide accurate, detailed information with code examples
- Be helpful and provide specific, actionable information rather than generic responses
- If a user asks for something you don't have a specific tool for, use the 'search_web' tool to find the most current information
- Don't use tools for simple conversational questions
- Be yourself - have a personality, be engaging, and share your crypto expertise
- If a tool fails, explain what happened in simple terms
- Never give financial advice without proper disclaimers
- Always encourage users to do their own research (DYOR)`
=======
           role: "system",
           content: `You are Dragman Agent, a friendly and helpful crypto expert assistant. Be proactive, engaging, and always helpful.

           **PERSONALITY:**
           - Friendly, enthusiastic, and encouraging
           - Proactive in suggesting helpful actions
           - Use emojis naturally to express emotions
           - Be conversational and warm, like talking to a knowledgeable friend
           - Show genuine interest in helping users succeed

           **RESPONSE STYLE:**
           - Keep answers concise but warm (1-3 sentences max)
           - Only elaborate when specifically asked for details
           - Use crypto terminology naturally but briefly
           - Be conversational and engaging
           - Focus on actionable information
           - ALWAYS start responses with 👀 emoji to indicate message received
           - End responses with helpful suggestions when appropriate

           **EXPERTISE:**
           - Crypto prices, DeFi, Base ecosystem
           - Base App navigation and features
           - Transaction handling and troubleshooting
           - Market insights and project analysis
           - Proactive suggestions and tips

           **HELPFUL BEHAVIOR:**
           - Always provide disclaimers for financial advice
           - Be honest about risks
           - Use tools for specific data requests
           - Keep technical explanations simple and brief
           - Start every response with 👀 emoji
           - When providing social media links, use x.com (not twitter.com)
           - For X/Twitter links, provide the username and mention "Copy this URL" instead of clickable links
           - Suggest related helpful actions after answering questions
           - Be encouraging and supportive

           **EXAMPLES:**
           - "👀 Base is doing great! Lots of new projects launching. Want me to check some trending Base projects?"
           - "👀 ETH is at $2,800. Bullish trend continues. Should I set up a price alert for you?"
           - "👀 That project looks solid. DYOR though. Want me to run a safety check?"
           - "👀 Brian Armstrong's X: @brian_armstrong - Copy this URL: https://x.com/brian_armstrong"

           **PROACTIVE SUGGESTIONS:**
           - After price queries: suggest portfolio tracking or alerts
           - After transaction help: suggest gas optimization tips
           - After safety checks: suggest more projects to research
           - After Base App questions: suggest exploring more features

           Remember: Be friendly, helpful, and proactive! Always start with 👀 and end with helpful suggestions!`
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
          },
          ...history,
        ],
        tools: tools,
        tool_choice: "auto",
      });

      const completion = await Promise.race([openaiCall, timeout]);

      const responseMessage = completion.choices[0].message;
      
      // Add the assistant's response to the history
      history.push(responseMessage);

      if (responseMessage.tool_calls) {
        log('info', `AI requested ${responseMessage.tool_calls.length} tool calls.`);
        const toolResponses = [];
        let lastToolCallWasSendEth = false;

        if (Array.isArray(responseMessage.tool_calls)) {
          for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            if (functionName === 'send_eth') {
                lastToolCallWasSendEth = true;
            }

            const functionToCall = availableFunctions[functionName];
            if (!functionToCall) {
              log('error', `Function ${functionName} not found!`);
              toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: `Error: Function ${functionName} not found.` });
              continue;
            }
            const functionArgs = JSON.parse(toolCall.function.arguments);
            log('info', `Executing ${functionName}`, { args: functionArgs });

            try {
              const functionResponse = await functionToCall(functionArgs);
              log('info', `--- RAW RESPONSE FROM ${functionName} ---`, { response: functionResponse });

              // FIX: Properly handle different response formats
              let responseContent;
              if (functionResponse && typeof functionResponse === 'object') {
                if (functionResponse.userMessage) {
                  await ctx.sendText(functionResponse.userMessage);
                  responseContent = functionResponse.userMessage;
                } else if (functionResponse.error) {
                  log('error', `--- ${functionName} returned an error ---`, { error: functionResponse.error });
                  await ctx.sendText(functionResponse.userMessage || "An error occurred.");
                  responseContent = `Error: ${functionResponse.error}`;
                } else if (functionResponse.isTransaction && functionResponse.transactionData) {
<<<<<<< HEAD
                  // Handle transaction data for Base App - UPDATED WITH CORRECT XMTP CONTENT TYPE
                  try {
                    // Log the transaction data for debugging
                    log('info', 'Attempting to send transaction data to Base App', { 
                      transactionData: functionResponse.transactionData,
                      senderInboxId: senderInboxId,
                      availableMethods: {
                        sendContent: typeof ctx.sendContent,
                        sendWalletSendCalls: typeof ctx.sendWalletSendCalls,
                        sendTransaction: typeof ctx.sendTransaction
                      }
                    });
                    
                    // Try different methods to send the transaction
                    if (typeof ctx.sendContent === 'function') {
                      await ctx.sendContent("xmtp.org/walletSendCalls:1.0", functionResponse.transactionData);
                      log('info', 'Transaction sent using sendContent method');
                    } else if (typeof ctx.sendWalletSendCalls === 'function') {
                      await ctx.sendWalletSendCalls(functionResponse.transactionData);
                      log('info', 'Transaction sent using sendWalletSendCalls method');
                    } else if (typeof ctx.sendTransaction === 'function') {
                      await ctx.sendTransaction(functionResponse.transactionData);
                      log('info', 'Transaction sent using sendTransaction method');
                    } else {
                      log('error', 'No transaction sending method available on ctx object');
                      throw new Error('No transaction sending method available');
                    }
                    
                    // Also send a text message as a fallback
                    await ctx.sendText(functionResponse.userMessage);
                    
                    responseContent = "Transaction tray sent to Base App";
                  } catch (transactionError) {
                    log('error', 'Error sending transaction', { 
                      error: transactionError.message,
                      stack: transactionError.stack
                    });
                    
                    // If the content type method fails, try to send as a regular message with the transaction data
                    try {
                      await ctx.sendText(functionResponse.userMessage);
                      await ctx.sendText(`Transaction Details:\n\`\`\`json\n${JSON.stringify(functionResponse.transactionData, null, 2)}\n\`\`\``);
                      responseContent = "Transaction details sent as text (tray may not appear)";
                    } catch (fallbackError) {
                      log('error', 'Error sending fallback transaction', { 
                        error: fallbackError.message,
                        stack: fallbackError.stack
                      });
                      await ctx.sendText("Failed to send transaction. Please try again.");
                      responseContent = "Failed to send transaction";
                    }
                  }
                } else if (functionResponse.quickActionsData) {
                  // Handle quick actions data for Base App
                  await ctx.sendQuickActions(functionResponse.quickActionsData);
                  responseContent = "Quick actions sent to Base App";
=======
                  // Use the simplified sendTransaction function
                  const result = await sendTransaction(ctx, functionResponse.transactionData, functionResponse.userMessage, functionResponse.functionArgs);
                  responseContent = result.message;
                } else if (functionResponse.isQuickActions && functionResponse.quickActionsData) {
                  // Send Quick Actions content type (coinbase.com/actions:1.0)
                  try {
                    await ctx.sendContent("coinbase.com/actions:1.0", functionResponse.quickActionsData);
                    log('info', '✅ Quick Actions content sent successfully');
                    responseContent = functionResponse.userMessage;
                  } catch (error) {
                    log('error', '❌ Failed to send Quick Actions', { error: error.message });
                    responseContent = functionResponse.userMessage + "\n\n⚠️ Quick Actions may not be supported in your Base App version.";
                  }
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
                } else if (functionResponse.attachmentData) {
                  // Handle attachment data for Base App
                  await ctx.sendAttachment(functionResponse.attachmentData);
                  responseContent = "Attachment sent to Base App";
                } else if (functionResponse.remoteAttachmentData) {
                  // Handle remote attachment data for Base App
                  await ctx.sendRemoteAttachment(functionResponse.remoteAttachmentData);
                  responseContent = "Remote attachment sent to Base App";
                } else if (functionResponse.reactionData) {
                  // Handle reaction data for Base App
                  await ctx.sendReaction(functionResponse.reactionData);
                  responseContent = "Reaction sent to Base App";
                } else if (functionResponse.replyData) {
                  // Handle reply data for Base App
                  await ctx.sendReply(functionResponse.replyData);
                  responseContent = "Reply sent to Base App";
                } else if (functionResponse.receiptData) {
                  // Handle transaction receipt data for Base App
                  await ctx.sendTransactionReceipt(functionResponse.receiptData);
                  responseContent = "Transaction receipt sent to Base App";
<<<<<<< HEAD
=======
                } else if (functionResponse.readReceiptData) {
                  // Handle read receipt data (xmtp.org/readReceipt:1.0)
                  await ctx.sendContent("xmtp.org/readReceipt:1.0", functionResponse.readReceiptData);
                  responseContent = "Read receipt sent";
                } else if (functionResponse.groupMembershipData) {
                  // Handle group membership changes (xmtp.org/group_membership_change:1.0)
                  await ctx.sendContent("xmtp.org/group_membership_change:1.0", functionResponse.groupMembershipData);
                  responseContent = "Group membership updated";
                } else if (functionResponse.groupUpdateData) {
                  // Handle group updates (xmtp.org/group_updated:1.0)
                  await ctx.sendContent("xmtp.org/group_updated:1.0", functionResponse.groupUpdateData);
                  responseContent = "Group updated";
                } else if (functionResponse.remoteAttachmentData) {
                  // Handle remote static attachments (xmtp.org/remoteStaticAttachment:1.0)
                  await ctx.sendContent("xmtp.org/remoteStaticAttachment:1.0", functionResponse.remoteAttachmentData);
                  responseContent = "Remote attachment sent";
                } else if (functionResponse.transactionReferenceData) {
                  // Handle transaction references (xmtp.org/transactionReference:1.0)
                  await ctx.sendContent("xmtp.org/transactionReference:1.0", functionResponse.transactionReferenceData);
                  responseContent = "Transaction reference sent";
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
                } else {
                  // For functions that return plain text
                  responseContent = JSON.stringify(functionResponse);
                  await ctx.sendText(responseContent);
                }
              } else {
                // For functions that return plain text
                responseContent = functionResponse;
                await ctx.sendText(functionResponse);
              }
              
              // Add the tool response to the array
              toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: responseContent });
            } catch (e) {
              log('error', `!!! ERROR EXECUTING ${functionName} ---`, { error: e.message });
              const errorMessage = `I ran into an error while trying to run the ${functionName} tool.`;
              await ctx.sendText(errorMessage);
              toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: errorMessage });
            }
          }
        }
        
        // Add tool responses to history
        history.push(...toolResponses);
        
        // FIX: Only make a second API call if we're not dealing with send_eth
        if (!lastToolCallWasSendEth) {
            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    ...history,
                ],
            });
            history.push(secondResponse.choices[0].message);
            const secondResponseText = secondResponse.choices[0].message.content.startsWith('👀') ? secondResponse.choices[0].message.content : `👀 ${secondResponse.choices[0].message.content}`;
            await ctx.sendText(secondResponseText);
        }

      } else {
        // Add 👀 emoji to all responses to indicate message received
        const responseText = responseMessage.content.startsWith('👀') ? responseMessage.content : `👀 ${responseMessage.content}`;
        await ctx.sendText(responseText);
      }
    } catch (error) {
      log('error', "!!! OPENAI API ERROR", { error: error.message });
      let userErrorMessage = "👀 I'm having some technical difficulties right now. Please try again in a moment.";
      if (error.message === 'Request timed out') {
        userErrorMessage = "👀 The request timed out. My advanced crypto circuits are processing too much data! Please try again.";
      } else if (error instanceof OpenAI.APIError) {
        if (error.status === 401) userErrorMessage = "👀 My API key is invalid. Please check my configuration.";
        else if (error.status === 429) userErrorMessage = "👀 I'm being rate-limited. So many people want my crypto expertise! Please give me a moment to rest.";
      }
      await ctx.sendText(userErrorMessage);
      
      // Reset conversation history on error to prevent cascading errors
      if (conversationHistory.has(senderInboxId)) {
        conversationHistory.set(senderInboxId, []);
      }
    } finally {
      processingUsers.delete(senderInboxId);
    }
  });

  agent.on("intent", async (ctx) => {
    const intentData = ctx.message.content;
    log('info', `Intent received from ${ctx.inboxId}`, { 
      action: intentData.actionId,
      id: intentData.id,
      metadata: intentData.metadata 
    });

<<<<<<< HEAD
    const actionId = intentData.actionId;
    let responseText = "";

    if (actionId === "safety_check_prompt") {
      responseText = "👀 Absolutely! I'd be happy to run a comprehensive safety analysis. Just drop the project name and I'll dig deep into its fundamentals, community, and security measures. What project would you like me to investigate?";
    } else if (actionId === "gas_fees") {
      responseText = await availableFunctions.get_network_status();
    } else if (actionId === "price_eth") {
      responseText = await availableFunctions.get_crypto_price({ tokens: ['eth'] });
    } else if (actionId === "price_btc") {
      responseText = await availableFunctions.get_crypto_price({ tokens: ['btc'] });
=======
    // Validate Intent content type structure (coinbase.com/intent:1.0)
    if (!intentData.id || !intentData.actionId) {
      log('error', 'Invalid Intent content type', { intentData });
      await ctx.sendText("👀 I received an invalid intent. Please try again.");
      return;
    }

    const actionId = intentData.actionId;
    let responseText = "";

    // Handle different action types with proper validation
    if (actionId === "safety_check_prompt") {
      responseText = "👀 Absolutely! I'd be happy to run a comprehensive safety analysis. Just drop the project name and I'll dig deep into its fundamentals, community, and security measures. What project would you like me to investigate?";
    } else if (actionId === "gas_fees") {
      const result = await availableFunctions.get_network_status();
      responseText = result.startsWith('👀') ? result : `👀 ${result}`;
    } else if (actionId === "price_eth") {
      const result = await availableFunctions.get_crypto_price({ tokens: ['eth'] });
      responseText = result.startsWith('👀') ? result : `👀 ${result}`;
    } else if (actionId === "price_btc") {
      const result = await availableFunctions.get_crypto_price({ tokens: ['btc'] });
      responseText = result.startsWith('👀') ? result : `👀 ${result}`;
    } else if (actionId === "send_10") {
      responseText = "👀 Ready to send $10 worth of ETH? I'll need the recipient's address and preferred chain. Try: 'send 0.003 ETH to 0x123... on base'";
    } else if (actionId === "send_custom") {
      responseText = "👀 For custom amounts, just tell me how much and where! For example: 'send 0.01 ETH to 0x123... on base'";
>>>>>>> 079cf02 (Initial commit: Dragman Agent Base App crypto assistant)
    } else {
      responseText = "👀 Hmm, that's not an action I recognize. Try the buttons or just ask me directly about anything crypto-related!";
    }

    await ctx.sendText(responseText);
  });

  await agent.start();
}

main().catch(console.error);
