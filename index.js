// index.js
import { Agent } from "@xmtp/agent-sdk";
import { createPublicClient, http, formatEther } from 'viem';
import { base, mainnet } from 'viem/chains';

// --- CONFIGURATION & CLIENTS ---
// Note: OpenAI is not imported because we don't have the key
const baseClient = createPublicClient({ chain: base, transport: http() });
const ethClient = createPublicClient({ chain: mainnet, transport: http() });

// --- HELPER FUNCTIONS ---

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
    console.error(`Error searching for coin ID for ${symbol}:`, error);
    return null;
  }
}

// --- COMMAND HANDLERS ---

const commands = {
  help: async (ctx) => {
    // Dynamically build the help text based on available API keys
    let helpText = `
🔮 **Crypto Oracle Agent - Commands!**

💰 **Market & Wallet:**
* **/price <tokens>** - Get prices with interactive buttons.
* **/token <symbol>** - Get detailed info on a token.
* **/balance <address>** - Check ETH and Base balance of a wallet.
* **/trending** - See top 7 trending coins.
* **/market** - Get a total market overview.
* **/gas** - Get current gas price on Base.

📰 **Information:**
* **/airdrops** - Info on airdrops and safety tips.
`;

    // Add AI commands only if the OpenAI key is present
    if (process.env.OPENAI_API_KEY) {
      helpText += `
🤖 **AI Superpowers:**
* **/image <prompt>** - Generate an AI image with DALL-E 3.
* **/sentiment <text>** - Analyze the emotional tone of text.
* **/chat** - Ask me anything about crypto!
`;
    }

    // Add news command only if the News API key is present
    if (process.env.NEWS_API_KEY) {
      helpText += `* **/news** - Latest crypto news.\n`;
    }

    helpText += `\nType /help to see this message again.`;
    await ctx.sendText(helpText.trim());
  },

  price: async (ctx, args) => {
    if (args.length === 0) { await ctx.sendText("Please provide at least one token. E.g., /price bitcoin ethereum"); return; }
    await ctx.sendText(`Fetching prices for ${args.join(', ')}... ⏳`);
    let priceText = `📊 **Price Update:**\n`;
    for (const symbol of args) {
      const coinId = await getCoinId(symbol);
      if (coinId) {
        try {
          const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`);
          const data = await response.json();
          if (data[coinId]) {
            const price = data[coinId].usd;
            const change = data[coinId].usd_24h_change;
            const changeEmoji = change >= 0 ? '📈' : '📉';
            priceText += `• **${symbol.toUpperCase()}:** $${price.toLocaleString()} (${change?.toFixed(2)}% ${changeEmoji})\n`;
          }
        } catch (error) { priceText += `• **${symbol.toUpperCase()}:** Could not fetch data.\n`; }
      } else { priceText += `• **${symbol.toUpperCase()}:** Not found.\n`; }
    }
    await ctx.sendText(priceText.trim(), {
      actions: [
        { type: "button", text: "🔄 Refresh", action: "/price " + args.join(' ') },
        { type: "button", text: "🔥 Trending", action: "/trending" },
      ],
    });
  },

  token: async (ctx, args) => {
    if (args.length === 0) { await ctx.sendText("Please provide a token symbol. E.g., /token bitcoin"); return; }
    const symbol = args[0]; await ctx.sendText(`Searching for details on ${symbol.toUpperCase()}... 🔍`);
    const coinId = await getCoinId(symbol);
    if (!coinId) { await ctx.sendText(`Sorry, I couldn't find a token with the symbol ${symbol.toUpperCase()}.`); return; }
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`);
      const data = await response.json(); const marketData = data.market_data;
      const infoText = `🪙 **${data.name} (${data.symbol.toUpperCase()})**\n\n💰 **Price:** $${marketData.current_price.usd.toLocaleString()}\n📈 **24h Change:** ${marketData.price_change_percentage_24h.toFixed(2)}%\n📊 **Market Cap:** $${marketData.market_cap.usd.toLocaleString()}\n💧 **24h Volume:** $${marketData.total_volume.usd.toLocaleString()}\n🏅 **Market Cap Rank:** #${data.market_cap_rank}\n\n📖 **Description:** ${data.description.en.split('. ')[0]}.\n\n[More Info](${data.links.homepage[0] || data.links.blockchain_site[0]})`;
      await ctx.sendText(infoText.trim());
    } catch (error) { await ctx.sendText("Failed to fetch detailed information for that token."); }
  },

  balance: async (ctx, args) => {
    if (args.length === 0 || !args[0].startsWith('0x')) { await ctx.sendText("Please provide a valid Ethereum address. E.g., /balance 0x..."); return; }
    const address = args[0]; await ctx.sendText(`Checking balances for ${address.slice(0, 6)}...${address.slice(-4)}... 💰`);
    try {
      const ethBalance = await ethClient.getBalance({ address });
      const baseBalance = await baseClient.getBalance({ address });
      const balanceText = `💰 **Wallet Balances for ${address.slice(0, 6)}...${address.slice(-4)}:**\n\n**Ethereum (Mainnet):** ${formatEther(ethBalance)} ETH\n**Base:** ${formatEther(baseBalance)} ETH\n\n*Note: This only shows the native ETH balances.*`;
      await ctx.sendText(balanceText.trim());
    } catch (error) { await ctx.sendText("Could not fetch balances. The address might be invalid."); }
  },

  trending: async (ctx) => { /* ... (same as previous) ... */
    await ctx.sendText("Fetching trending coins... 🔥");
    try { const response = await fetch('https://api.coingecko.com/api/v3/search/trending'); const data = await response.json(); let trendingText = `🔥 **Top 7 Trending Coins:**\n`; data.coins.forEach((item, index) => { const coin = item.item; trendingText += `${index + 1}. **${coin.name} (${coin.symbol.toUpperCase()})** - Price: $${coin.price_btc}\n`; }); await ctx.sendText(trendingText.trim()); }
    catch (error) { await ctx.sendText("Couldn't fetch trending data."); }
  },

  market: async (ctx) => { /* ... (same as previous) ... */
    await ctx.sendText("Fetching global market data... 🌍");
    try { const response = await fetch('https://api.coingecko.com/api/v3/global'); const data = await response.json(); const marketData = data.data; const marketText = `🌍 **Global Crypto Market Overview**\n\n💰 **Total Market Cap:** $${(marketData.total_market_cap.usd / 1e12).toFixed(2)}T\n📈 **24h Volume:** $${(marketData.total_volume.usd / 1e9).toFixed(2)}B\n🏆 **BTC Dominance:** ${marketData.market_cap_percentage.btc.toFixed(2)}%\n🥈 **ETH Dominance:** ${marketData.market_cap_percentage.eth.toFixed(2)}%\n📊 **Market Cap Change (24h):** ${marketData.market_cap_change_percentage_24h_usd.toFixed(2)}%`; await ctx.sendText(marketText.trim()); }
    catch (error) { await ctx.sendText("Couldn't fetch global market data."); }
  },

  gas: async (ctx) => { /* ... (same as previous) ... */
    try { const feeData = await baseClient.estimateFeesPerGas(); const gasPriceGwei = Number(formatEther(feeData.gasPrice || feeData.maxFeePerGas)) * 1e9; await ctx.sendText(`⛽ **Base Gas Price:** ${gasPriceGwei.toFixed(2)} Gwei`); }
    catch (error) { await ctx.sendText("Couldn't fetch gas price."); }
  },

  airdrops: async (ctx) => { /* ... (same as previous) ... */
    const airdropText = `🪂 **Airdrop Information & Safety:**\n**What are Airdrops?** Free tokens distributed by projects to early users.\n**How to find potential Airdrops?** Engage with new protocols, use platforms like Layer3/Galxe/Zealy.\n**⚠️ CRITICAL SAFETY:** NEVER share your private key. NEVER pay a fee to receive an airdrop. Use a burner wallet.`;
    await ctx.sendText(airdropText.trim());
  },

  // --- Handlers for features that require API keys ---
  news: async (ctx) => {
    await ctx.sendText("The /news command is not configured because the News API key is missing.");
  },
  image: async (ctx) => {
    await ctx.sendText("The /image command is not configured because the OpenAI API key is missing.");
  },
  sentiment: async (ctx) => {
    await ctx.sendText("The /sentiment command is not configured because the OpenAI API key is missing.");
  }
};

// --- MAIN AGENT LOGIC ---

agent.on("text", async (ctx) => {
  const message = ctx.message.content.trim();
  const senderInboxId = ctx.inboxId;
  console.log(`[${new Date().toISOString()}] Msg from ${senderInboxId}: "${message}"`);

  if (message.startsWith('/')) {
    const parts = message.toLowerCase().split(' ');
    const command = parts[0].substring(1);
    const args = parts.slice(1);
    const handler = commands[command];
    if (handler) { await handler(ctx, args); } else { await ctx.sendText(`Unknown command: /${command}. Type /help.`); }
    return;
  }

  // --- DEFAULT BEHAVIOR: No AI Chat ---
  // Since there's no OpenAI key, we can't have a chatbot.
  // Instead, we provide a friendly default response.
  await ctx.sendText(`Hello! 👋 I'm a crypto data agent. I can't chat, but I can get you market data, token info, and wallet balances. Type /help to see all my commands!`);
});

agent.on("start", () => { console.log(`🚀 Crypto Oracle Agent (Lite Version) is online!`); });

await agent.start();
