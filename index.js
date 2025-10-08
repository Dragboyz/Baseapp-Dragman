// --- STEP 0: LOAD ENVIRONMENT VARIABLES ---
import 'dotenv/config';

// --- STEP 1: IMPORT ALL NECESSARY LIBRARIES ---
import { Agent } from "@xmtp/agent-sdk";
import { createPublicClient, http, formatEther, isAddress } from 'viem';
import { base, mainnet, arbitrum, optimism, bsc } from 'viem/chains';
import OpenAI from 'openai';

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
console.error(`Error searching for coin ID for ${symbol}:`, error);
return null;
}
}

// --- STEP 4: DEFINE "TOOLS" FOR THE AI ---
const tools = [
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
description: "Search the web for real-time, up-to-date information. Use this for news, specific project details, or anything that requires current data.",
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
check_project_safety: async ({ projectName }) => {
console.log(`--- SAFETY CHECK START --- Project: ${projectName}`);
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
console.error("--- SAFETY CHECK END --- ERROR:", error);
return "Sorry, I had trouble running the safety check.";
}
report += `\n---\n**Safety Score: ${score}/100**\n`;
if (score >= 70) report += `🟢 **Verdict:** This project appears to have strong fundamentals and a good reputation. Always do your own research (DYOR).`;
else if (score >= 40) report += `🟡 **Verdict:** This project has some positive signals but also some red flags. Proceed with extreme caution and DYOR.`;
else report += `🔴 **Verdict:** This project exhibits multiple red flags. It is highly risky and likely a scam. Avoid interacting.`;
console.log(`--- SAFETY CHECK END --- Score: ${score}`);
return report.trim();
},
search_web: async ({ query }) => {
console.log(`--- WEB SEARCH START --- Query: ${query}`);
if (!process.env.TAVILY_API_KEY) {
console.log("--- WEB SEARCH END --- Error: No API key.");
return "Web search is not configured. Please add a TAVILY_API_KEY to the .env file for the best results.";
}
try {
const response = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: query, search_depth: "basic" }), });
const data = await response.json();
if (data.results && data.results.length > 0) {
let searchResult = `🔍 **Web Search Results:**\n\n`;
data.results.forEach(result => {
searchResult += `**${result.title}**\n${result.content}\n\n[Read more](${result.url})\n\n`;
});
console.log("--- WEB SEARCH END --- Success.");
return searchResult.trim();
}
console.log("--- WEB SEARCH END --- No results found.");
return `I searched for "${query}" but couldn't find any clear results.`;
} catch (error) {
console.error("--- WEB SEARCH END --- ERROR:", error);
return "Sorry, I had trouble searching the web right now.";
}
},
get_crypto_price: async ({ tokens }) => {
let priceText = `📊 **Price Update:**\n`;
for (const symbol of tokens) {
const coinId = await getCoinId(symbol);
if (coinId) {
try {
const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`);
const data = await response.json();
if (data[coinId]) {
const price = data[coinId].usd;
const change = data[coinId].usd_24hr_change;
const changeEmoji = change >= 0 ? '📈' : '📉';
priceText += `• **${symbol.toUpperCase()}:** $${price.toLocaleString()} (${change?.toFixed(2)}% ${changeEmoji})\n`;
}
} catch (error) { priceText += `• **${symbol.toUpperCase()}:** Could not fetch data.\n`; }
} else { priceText += `• **${symbol.toUpperCase()}:** Not found.\n`; }
}
return priceText.trim();
},
get_wallet_balance: async ({ address }) => {
if (address.length === 44 && /^[1-9]/.test(address)) return `💰 **Solana Address Detected:** I can't check Solana balances directly. Please use a Solana explorer like [Solscan](https://solscan.io) to check the balance for ${address.slice(0, 6)}...${address.slice(-4)}.`;
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
const solResponse = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [] }), });
const solData = await solResponse.json();
if (solData.result) { const avgFee = solData.result.averagePriorityFee / 1e9; statusText += `\n🔥 **Solana Priority Fee:** ~${avgFee.toFixed(7)} SOL`; } else { statusText += `\n🔥 **Solana Priority Fee:** Unavailable`; }
} catch (error) { statusText += `\n🔥 **Solana Priority Fee:** Unavailable`; }
statusText += `\n\n*Note: Gas fees are estimates and change rapidly.*`;
return statusText.trim();
},
};

// --- STEP 6: THE MAIN AI-POWERED LOGIC ---
async function main() {
if (!process.env.OPENAI_API_KEY) {
console.error("FATAL ERROR: OPENAI_API_KEY is not set in the .env file. Agent cannot start.");
return;
}

const agent = await Agent.createFromEnv({ env: "dev" });
console.log(`🛡️ Security Expert Base Dragman Agent is online!`);

agent.on("text", async (ctx) => {
const senderInboxId = ctx.inboxId;
const userMessage = ctx.message.content.trim().toLowerCase();
console.log(`\n[${new Date().toISOString()}] Msg from ${senderInboxId}: "${ctx.message.content}"`);

if (userMessage.includes("hello") || userMessage.includes("hi") || userMessage.includes("hey") || userMessage.includes("gm") || userMessage.includes("good morning")) {
await ctx.sendText(`Hello and welcome to the **Base Dragman Agent**! 👋\n\nI'm your friendly multi-chain crypto expert and security advisor. I can help you navigate Web3, check project safety, and explain complex topics across EVM, Solana, and Cosmos ecosystems.\n\nType /help to see all my commands, or just ask me a question! 😊`);
return;
}

if (!conversationHistory.has(senderInboxId)) { conversationHistory.set(senderInboxId, []); }
const history = conversationHistory.get(senderInboxId);
history.push({ role: "user", content: ctx.message.content });
if (history.length > 10) history.shift();

try {
await ctx.sendText("Thinking... 🤔");

const completion = await openai.chat.completions.create({
model: "gpt-4o",
messages: [
{
role: "system",
content: `You are 'Crypto Oracle', the friendly and helpful AI personality behind the 'Base Dragman Agent'. You are an expert in all things crypto, with deep knowledge spanning multiple blockchain ecosystems.

**Core Expertise:**
- **EVM Chains:** Ethereum, Base, Arbitrum, Optimism, BSC, Polygon, Avalanche, etc.
- **Solana:** High-performance L1 with its own programming model (Rust) and addresses.
- **Cosmos Ecosystem:** A network of interconnected, application-specific blockchains like Osmosis, Juno, and Secret Network, using the IBC protocol.

**Coinbase & Base Specialist:**
- **Coinbase:** You have deep knowledge of Coinbase as a public company (NASDAQ: COIN), its products (Wallet, Exchange, Advanced Trade), its venture arm (Coinbase Ventures), and its mission to create an open financial system. You know about its acquisitions and strategic partnerships.
- **Base Ecosystem:** You are an expert on Base. You know it's a secure, low-cost, builder-friendly Ethereum L2 built by Coinbase. You know its key infrastructure (OP Stack, Bridge), flagship dApps (friend.tech, Farcaster, Parallel, Airstack), developer programs (Base Camp, Onchain Summer), and its overall vision to onboard the next billion users to crypto. You know about prominent figures like Jesse Pollak.

**Security First Mentality:**
- Your #1 priority is user safety. When a user asks about a project's legitimacy, you MUST use the 'check_project_safety' tool first. Do not give an opinion without data.
- Explain the results of the safety check clearly and advise the user to "Do Your Own Research" (DYOR).
- You are an expert at identifying red flags like anonymous teams, unaudited contracts, guaranteed high returns, and aggressive marketing.

**Your Capabilities:**
- Identify address formats (EVM, Solana, Cosmos) and guide users appropriately.
- Understand chain-specific concepts (e.g., gas on EVM vs. priority fees on Solana).
- Use the provided tools to get real-time data.
- For any project-specific question, ALWAYS use the 'search_web' tool first, as your internal knowledge may be outdated.

**CRITICAL SAFETY - LINK WHITELIST:**
You can ONLY provide links that are from the following trusted domains. If a tool returns a link from another domain, DO NOT share it.
**ALLOWED DOMAINS:**
- EVM: base.org, coinbase.com, etherscan.io, basescan.org, arbiscan.io, coingecko.com, defillama.com, uniswap.org, 1inch.com, aave.com, curve.fi, optimism.io, arbitrum.io, layer3.xyz, galxe.com, zealy.io
- Solana: solana.com, explorer.solana.com, solscan.io
- Cosmos: cosmos.network, mintscan.io
- General: blog.chain.link, theblock.co
`
},
...history,
],
tools: tools,
tool_choice: "auto",
});

const responseMessage = completion.choices[0].message;
history.push(responseMessage);

if (responseMessage.tool_calls) {
console.log(`AI requested ${responseMessage.tool_calls.length} tool calls.`);
const toolResponses = [];
if (Array.isArray(responseMessage.tool_calls)) {
for (const toolCall of responseMessage.tool_calls) {
const functionName = toolCall.function.name;
const functionToCall = availableFunctions[functionName];
if (!functionToCall) {
console.error(`Function ${functionName} not found!`);
toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: `Error: Function ${functionName} not found.` });
continue;
}
const functionArgs = JSON.parse(toolCall.function.arguments);
console.log(`-> Executing ${functionName} with args:`, functionArgs);

try {
const functionResponse = await functionToCall(functionArgs);
console.log(`-> ${functionName} SUCCESS.`);
toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: functionResponse });
} catch (e) {
console.error(`!!! ERROR executing ${functionName}:`, e);
toolResponses.push({ tool_call_id: toolCall.id, role: "tool", content: `I ran into an error while trying to run the ${functionName} tool.` });
}
}
} else {
console.error("!!! ERROR: responseMessage.tool_calls was not an array!");
}

console.log(`Generated ${toolResponses.length} tool responses. Sending back to AI...`);
const secondCompletion = await openai.chat.completions.create({
model: "gpt-4o",
messages: [
...history,
...toolResponses,
],
});
const finalResponse = secondCompletion.choices[0].message.content;
await ctx.sendText(finalResponse);
history.push({ role: "assistant", content: finalResponse });

} else {
await ctx.sendText(responseMessage.content);
}
} catch (error) {
console.error("!!! OPENAI API ERROR:", JSON.stringify(error, null, 2));
let userErrorMessage = "I'm having trouble connecting my brain right now. Please try again in a moment.";
if (error instanceof OpenAI.APIError) {
if (error.status === 401) userErrorMessage = "My API key is invalid. Please check my configuration.";
else if (error.status === 429) userErrorMessage = "I'm being rate-limited. Please give me a moment to rest.";
}
await ctx.sendText(userErrorMessage);
}
});

await agent.start();
}

main().catch(console.error);
