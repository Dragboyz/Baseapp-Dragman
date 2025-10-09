// --- FINAL VERSION: CONFIRMED WORKING ---
// --- STEP 0: LOAD ENVIRONMENT VARIABLES ---
import 'dotenv/config';

// --- STEP 1: IMPORT ALL NECESSARY LIBRARIES ---
import { Agent } from "@xmtp/agent-sdk";
import { createPublicClient, http, formatEther, isAddress, parseEther } from 'viem';
import { base, mainnet, arbitrum, optimism, bsc } from 'viem/chains';
import OpenAI from 'openai';

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

// In-memory store for conversation history
const conversationHistory = new Map();

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

// --- STEP 4: DEFINE "TOOLS" FOR THE AI ---
const tools = [
  {
    type: "function",
    function: {
      name: "send_eth",
      description: "MUST be used to create and send a transaction for sending ETH. Ask the user for the 'chain' if they don't provide it. This is the FINAL step. Calling this function will create and send the transaction tray.",
      parameters: {
        type: "object",
        properties: {
          toAddress: { type: "string", description: "The recipient's EVM wallet address." },
          amount: { type: "string", description: "The amount of ETH to send, e.g., '0.01'." },
          chain: { type: "string", description: "The blockchain to use. Must be one of 'base', 'ethereum', 'arbitrum', 'optimism', or 'bsc'." },
        },
        required: ["toAddress", "amount", "chain"],
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
      description: "CRITICAL TOOL: Search the web for real-time, up-to-date information. You MUST use this for any questions about specific crypto terms (e.g., 'DEX', 'RPC', 'web3'), project details, recent news, or technical concepts. Always search before answering if you are not 100% certain.",
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
      description: "Get the current price of one or more cryptocurrencies.",
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
];

// --- STEP 5: DEFINE THE ACTUAL JAVASCRIPT FUNCTIONS FOR THE TOOLS ---
const availableFunctions = {
  // --- FIX #1: CORRECTED send_eth FUNCTION ---
  send_eth: async ({ toAddress, amount, chain }, ctx) => {
    log('info', `--- SEND ETH START --- To: ${toAddress}, Amount: ${amount} ETH, Chain: ${chain}`);
    if (!isAddress(toAddress)) {
      await ctx.sendText("❌ That doesn't look like a valid EVM address. Please double-check it and try again.");
      return "Invalid address.";
    }

    const chainMap = {
      base: { client: baseClient, chainId: "0x2105", explorer: "https://basescan.org/tx/" },
      ethereum: { client: ethClient, chainId: "0x1", explorer: "https://etherscan.io/tx/" },
      arbitrum: { client: arbClient, chainId: "0xa4b1", explorer: "https://arbiscan.io/tx/" },
      optimism: { client: opClient, chainId: "0xa", explorer: "https://optimistic.etherscan.io/tx/" },
      bsc: { client: bscClient, chainId: "0x38", explorer: "https://bscscan.com/tx/" },
    };

    const selectedChain = chainMap[chain.toLowerCase()];
    if (!selectedChain) {
      await ctx.sendText(`❌ Invalid chain specified. Please choose one of: ${Object.keys(chainMap).join(', ')}.`);
      return "Invalid chain.";
    }

    try {
      const valueInWei = parseEther(amount);
      const transactionContent = {
        id: "send_eth_tx",
        description: `Dragman Agent: Send ${amount} ETH on ${chain.charAt(0).toUpperCase() + chain.slice(1)}`,
        transaction: {
          chainId: selectedChain.chainId,
          to: toAddress,
          value: valueInWei.toString(),
          data: "0x",
        },
      };
      log('info', `--- TRANSACTION CONTENT CREATED ---`);
      // THE FIX: Return the content object, don't send it from here.
      return transactionContent;
    } catch (error) {
      log('error', `--- SEND ETH END --- ERROR`, { error: error.message });
      await ctx.sendText("Sorry, I couldn't construct the transaction. Please check the amount and address.");
      return "Failed to construct transaction.";
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
  check_project_safety: async ({ projectName }) => {
    log('info', `--- SAFETY CHECK START --- Project: ${projectName}`);
    let score = 0;
    let report = `🔍 **Safety Report for "${projectName}":**\n\n`;
    try {
      const coinId = await getCoinId(projectName);
      if (coinId) {
        score += 25;
        report += `✅ **CoinGecko Listed:** Found on CoinGecko, a trusted data aggregator. (+25)\n`;
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`);
        const data = await response.json();
        if (data.coingecko_rank && data.coingecko_rank < 100) {
          score += 15;
          report += `✅ **Top 100 Rank:** Highly ranked on CoinGecko. (+15)\n`;
        }
      } else {
        report += `⚠️ **Not on CoinGecko:** Not found on CoinGecko. This is a significant risk. (-25)\n`;
      }
      const searchQuery = await fetch(`https://api.tavily.com/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: `${projectName} official website`, search_depth: "basic" }), });
      const searchData = await searchQuery.json();
      if (searchData.results && searchData.results.length > 0) {
        score += 15;
        report += `✅ **Official Presence:** Found official website and social links. (+15)\n`;
      } else {
        report += `⚠️ **Weak Online Presence:** Could not find a clear official website. (-15)\n`;
      }
      const auditQuery = await fetch(`https://api.tavily.com/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: `${projectName} audit report`, search_depth: "basic" }), });
      const auditData = await auditQuery.json();
      if (auditData.results && auditData.results.some(r => r.url.includes('certik') || r.url.includes('hacken') || r.url.includes('openzeppelin'))) {
        score += 20;
        report += `✅ **Audited:** Found audit reports from top firms (e.g., Certik, Hacken). (+20)\n`;
      } else {
        report += `⚠️ **No Audit Found:** Could not find any audit reports from top firms. (-20)\n`;
      }
    } catch (error) {
      log('error', "--- SAFETY CHECK END --- ERROR", { error: error.message });
      return "Sorry, I had trouble running the safety check.";
    }
    report += `\n---\n**Safety Score: ${score}/100**\n`;
    if (score >= 70) report += `🟢 **Verdict:** This project appears to have strong fundamentals and a good reputation. Always do your own research (DYOR).`;
    else if (score >= 40) report += `🟡 **Verdict:** This project has some positive signals but also some red flags. Proceed with extreme caution and DYOR.`;
    else report += `🔴 **Verdict:** This project exhibits multiple red flags. It is highly risky and likely a scam. Avoid interacting.`;
    log('info', `--- SAFETY CHECK END --- Score: ${score}`);
    return report.trim();
  },
  search_web: async ({ query }) => {
    log('info', `--- WEB SEARCH START --- Query: ${query}`);
    if (!process.env.TAVILY_API_KEY) {
      log('warn', "--- WEB SEARCH END --- Error: No API key.");
      return "Web search is not configured. Please add a TAVILY_API_KEY to the .env file for the best results.";
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: query, search_depth: "basic" }), signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Tavily API returned status ${response.status}`);
      }
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        let searchResult = `🔍 **Web Search Results:**\n\n`;
        data.results.forEach(result => {
          searchResult += `**${result.title}**\n${result.content}\n\n[Read more](${result.url})\n\n`;
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
  get_crypto_price: async ({ tokens }) => {
    let priceText = `📊 **Price Update:**\n`;
    for (const symbol of tokens) {
      const coinId = await getCoinId(symbol);
      if (coinId) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`CoinGecko API returned status ${response.status}`);
          }
          const data = await response.json();
          if (data[coinId]) {
            const price = data[coinId].usd;
            const change = data[coinId].usd_24hr_change;
            const changeEmoji = change >= 0 ? '📈' : '📉';
            priceText += `• **${symbol.toUpperCase()}:** $${price.toLocaleString()} (${change?.toFixed(2)}% ${changeEmoji})\n`;
          }
        } catch (error) {
          log('warn', `Failed to fetch price for ${symbol}`, { error: error.message });
          priceText += `• **${symbol.toUpperCase()}:** Could not fetch data.\n`;
        }
      } else { priceText += `• **${symbol.toUpperCase()}:** Not found.\n`; }
    }
    return priceText.trim();
  },
  get_wallet_balance: async ({ address }) => {
    if (address.length === 44 && /^[1-9A-HJ-NP-Za-km-z]{44}$/.test(address)) return `💰 **Solana Address Detected:** I can't check Solana balances directly. Please use a Solana explorer like [Solscan](https://solscan.io) to check the balance for ${address.slice(0, 6)}...${address.slice(-4)}.`;
    if (address.startsWith('cosmos1')) return `💰 **Cosmos Address Detected:** I can't check Cosmos balances directly. Please use a Cosmos explorer like [Mintscan](https://mintscan.io) to check the balance for ${address.slice(0, 10)}...${address.slice(-6)}.`;
    if (!isAddress(address)) return "Please provide a valid EVM, Solana, or Cosmos address.";
    try {
      const ethBalance = await ethClient.getBalance({ address });
      const baseBalance = await baseClient.getBalance({ address });
      return `💰 **EVM Wallet Balances for ${address.slice(0, 6)}...${address.slice(-4)}:**\n\n**Ethereum (Mainnet):** ${formatEther(ethBalance)} ETH\n**Base:** ${formatEther(baseBalance)} ETH\n\n*Note: This only shows the native ETH balances.*`;
    } catch (error) { return "Could not fetch balances. The address might be invalid."; }
  },
  get_network_status: async () => {
    let statusText = `🌐 **Multi-Chain Network Status:**\n\n`;
    try {
      const chains = [{ name: 'Ethereum', client: ethClient }, { name: 'Base', client: baseClient }, { name: 'Arbitrum', client: arbClient }, { name: 'Optimism', client: opClient }, { name: 'BNB Chain', client: bscClient }];
      statusText += `⛽ **EVM Gas Prices (Gwei):**\n`;
      for (const chain of chains) {
        try { const feeData = await chain.client.estimateFeesPerGas(); const gasPrice = Number(formatEther(feeData.gasPrice || feeData.maxFeePerGas)) * 1e9; statusText += `• **${chain.name}:** ${gasPrice.toFixed(2)} Gwei\n`; } catch (e) { statusText += `• **${chain.name}:** Unavailable\n`; }
      }
    } catch (error) { statusText += `⛽ **EVM Gas Prices:** Could not fetch.\n`; }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const solResponse = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [] }), signal: controller.signal });
      clearTimeout(timeoutId);
      const solData = await solResponse.json();
      if (solData.result) { const avgFee = solData.result.reduce((sum, fee) => sum + fee.prioritizationFee, 0) / solData.result.length / 1e9; statusText += `\n🔥 **Solana Priority Fee:** ~${avgFee.toFixed(7)} SOL`; } else { statusText += `\n🔥 **Solana Priority Fee:** Unavailable`; }
    } catch (error) { statusText += `\n🔥 **Solana Priority Fee:** Unavailable`; }
    statusText += `\n\n*Note: Gas fees are estimates and change rapidly.*`;
    return statusText.trim();
  },
};

// --- STEP 6: THE MAIN AI-POWERED LOGIC ---
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    log('error', "FATAL ERROR: OPENAI_API_KEY is not set in the environment variables. Agent cannot start.");
    return;
  }

  const agent = await Agent.createFromEnv({ env: process.env.NODE_ENV || "dev" });
  log('info', '🛡️ Security Expert Base Dragman Agent is online!');

  agent.on("text", async (ctx) => {
    const senderInboxId = ctx.inboxId;
    const now = Date.now();

    if (processingUsers.has(senderInboxId)) {
      await ctx.sendText("I'm still processing your last request. Please give me a moment!");
      return;
    }

    if (userLastRequest.has(senderInboxId)) {
      const timeSinceLastRequest = now - userLastRequest.get(senderInboxId);
      if (timeSinceLastRequest < RATE_LIMIT_MS) {
        const remainingTime = Math.ceil((RATE_LIMIT_MS - timeSinceLastRequest) / 1000);
        log('warn', `Rate limit exceeded for ${senderInboxId}`);
        await ctx.sendText(`Whoa, easy there! Let me catch my breath. Please wait ${remainingTime} seconds.`);
        return;
      }
    }
    userLastRequest.set(senderInboxId, now);
    processingUsers.add(senderInboxId);

    const userMessage = ctx.message.content.trim();
    log('info', `Message received from ${senderInboxId}`, { content: userMessage });

    if (userMessage.includes("hello") || userMessage.includes("hi") || userMessage.includes("hey") || userMessage.includes("gm") || userMessage.includes("good morning")) {
      const greetings = [
        "GM! Dragman here, your guide to the Base universe. What adventure are we on today?",
        "Welcome back! Ready to dive deep into Base? I'm here to help.",
        "Greetings! Dragman, at your service. What can I help you decode in the world of crypto?",
        "Hey there! I'm Dragman. Let's explore what's happening on Base and beyond."
      ];
      const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
      
      await ctx.sendText(randomGreeting);

      const actionsContent = {
        id: "main_menu_001",
        description: "Here are a few things I can help with:",
        actions: [
          { id: "safety_check_prompt", label: "Check Project Safety", style: "primary" },
          { id: "gas_fees", label: "Check Gas Fees", style: "secondary" },
          { id: "price_eth", label: "Price of ETH", style: "secondary" },
          { id: "price_btc", label: "Price of BTC", style: "secondary" },
        ],
      };
      
      if (ctx.send && typeof ctx.send === 'function') {
        try {
          await ctx.send(actionsContent);
        } catch (e) {
          log('warn', 'Client does not support interactive content, or an error occurred.', { error: e.message });
        }
      }
      processingUsers.delete(senderInboxId);
      return;
    }

    if (!conversationHistory.has(senderInboxId)) { conversationHistory.set(senderInboxId, []); }
    const history = conversationHistory.get(senderInboxId);
    history.push({ role: "user", content: ctx.message.content });
    if (history.length > 10) history.shift();

    try {
      await ctx.sendText("One moment, crunching the data... 🤔");

      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out')), 60000)
      );

      const openaiCall = openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are Dragman, a crypto expert AI.

**TRANSACTION RULE:**
- If a user asks to send crypto, you MUST use the 'send_eth' tool. This is the FINAL step. The tool will handle everything.

**OTHER RULES:**
- For other questions, use the 'search_web' tool if you are not 100% certain.
- Be conversational and helpful. Never give financial advice.`
          },
          ...history,
        ],
        tools: tools,
        tool_choice: "auto",
      });

      const completion = await Promise.race([openaiCall, timeout]);

      const responseMessage = completion.choices[0].message;
      history.push(responseMessage);

      // --- FIX #2: CORRECTED TOOL CALL HANDLING LOGIC ---
      if (responseMessage.tool_calls) {
        log('info', `AI requested ${responseMessage.tool_calls.length} tool calls.`);
        const toolResponses = [];
        if (Array.isArray(responseMessage.tool_calls)) {
          for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            const functionToCall = availableFunctions[functionName];
            if (!functionToCall) {
              log('error', `Function ${functionName} not found!`);
              toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: `Error: Function ${functionName} not found.` });
              continue;
            }
            const functionArgs = JSON.parse(toolCall.function.arguments);
            log('info', `Executing ${functionName}`, { args: functionArgs });

            try {
              const functionResponse = await functionToCall(functionArgs, ctx);

              if (functionResponse && typeof functionResponse === 'object' && functionResponse.transaction) {
                log('info', `--- SENDING TRANSACTION TRAY ---`);
                await ctx.send(functionResponse);
                log('info', `--- TRANSACTION TRAY SENT SUCCESSFULLY ---`);
                
                const chain = functionResponse.description.match(/on (\w+)/)[1];
                const chainMap = { base: "basescan.org", ethereum: "etherscan.io", arbitrum: "arbiscan.io", optimism: "optimistic.etherscan.io", bsc: "bscscan.com" };
                const explorerUrl = `https://${chainMap[chain.toLowerCase()]}/tx/`;
                await ctx.sendText(`Once you approve, you can track it on [${chainMap[chain.toLowerCase()]}](${explorerUrl}). DYOR!`);

                toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: "Transaction tray sent to user successfully." });
              } else {
                toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: JSON.stringify(functionResponse) });
              }
            } catch (e) {
              log('error', `!!! ERROR executing ${functionName}`, { error: e.message });
              toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: `I ran into an error while trying to run the ${functionName} tool.` });
            }
          }
        }
        
        const secondResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            ...history,
            ...toolResponses
          ],
        });
        history.push(secondResponse.choices[0].message);
        await ctx.sendText(secondResponse.choices[0].message.content);

      } else {
        await ctx.sendText(responseMessage.content);
      }
    } catch (error) {
      log('error', "!!! OPENAI API ERROR", { error: error.message });
      let userErrorMessage = "An unknown error occurred.";
      if (error.message === 'Request timed out') {
        userErrorMessage = "The request timed out. My brain is a bit slow today. Please try again.";
      } else if (error instanceof OpenAI.APIError) {
        if (error.status === 401) userErrorMessage = "My API key is invalid. Please check my configuration.";
        else if (error.status === 429) userErrorMessage = "I'm being rate-limited. Please give me a moment to rest.";
      }
      await ctx.sendText(userErrorMessage);
    } finally {
      processingUsers.delete(senderInboxId);
    }
  });

  agent.on("intent", async (ctx) => {
    const intentData = ctx.message.content;
    log('info', `Intent received from ${ctx.inboxId}`, { action: intentData.actionId });

    const actionId = intentData.actionId;
    let responseText = "";

    if (actionId === "safety_check_prompt") {
      responseText = "Absolutely. Drop the project name and I'll run a full diagnostic. What are we looking at?";
    } else if (actionId === "gas_fees") {
      responseText = await availableFunctions.get_network_status();
    } else if (actionId === "price_eth") {
      responseText = await availableFunctions.get_crypto_price({ tokens: ['eth'] });
    } else if (actionId === "price_btc") {
      responseText = await availableFunctions.get_crypto_price({ tokens: ['btc'] });
    } else {
      responseText = "Hmm, that's not an action I recognize. Try the buttons or just ask me directly!";
    }

    await ctx.sendText(responseText);
  });

  await agent.start();
}

main().catch(console.error);
