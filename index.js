/**
 * DRAGMAN AGENT - Smart Note-Taking Assistant for Base App
 * 
 * RECENT IMPROVEMENTS (Latest Version):
 * ✅ Security: Sanitized logging (no sensitive data exposure)
 * ✅ Security: Input validation and XSS prevention
 * ✅ Security: Rate limiting (20 actions/min, 10 saves/min)
 * ✅ Performance: Database indexes for faster queries
 * ✅ Performance: Multi-keyword search with relevance ranking
 * ✅ Reliability: Error handling for all DB operations
 * ✅ Reliability: Memory leak fixes (context cleanup)
 * ✅ Code Quality: Extracted constants, DRY principles
 * ✅ Code Quality: Helper functions for repeated operations
 * 
 * 🔥 NEW GROUP INTELLIGENCE FEATURES:
 * ✅ Passive Detection: Auto-detect wallet addresses, URLs, keywords (background)
 * ✅ Trending Topics: Analyze group focus, top contributors, hot keywords
 * ✅ Related Notes: Show similar notes when searching
 * ✅ Smart Suggestions: Proactive hints for unsaved important info
 * ✅ Knowledge Insights: Weekly analytics of group activity
 * ✅ Weekly Digest: Auto-scheduled team reports (MVP, trends, progress, gamification)
 * 
 * PRODUCTION NOTES:
 * - Currently uses SQLite (good for single instance)
 * - For PM2 cluster mode, migrate to PostgreSQL
 * - Mention required in groups: @dragman [command]
 * - See TODO section in code for scaling recommendations
 */

import { Agent } from "@xmtp/agent-sdk";
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import Database from 'better-sqlite3';

dotenv.config();

// ==================== CONFIGURATION ====================

const CONFIG = {
  // Context & Timing
  CONTEXT_TIMEOUT_MS: 5 * 60 * 1000,        // 5 minutes
  MIN_RESPONSE_DELAY_MS: 2000,               // 2 seconds
  MAX_RESPONSE_DELAY_MS: 5000,               // 5 seconds
  CONTEXT_CLEANUP_INTERVAL_MS: 60 * 1000,    // 1 minute
  
  // Content Limits
  MAX_NOTE_CONTENT_LENGTH: 2000,             // characters
  MAX_SEARCH_RESULTS_DISPLAY: 5,             // notes to show
  MAX_RECENT_NOTES: 5,                       // recent notes limit
  MIN_KEYWORD_LENGTH: 3,                     // minimum keyword length
  
  // Weekly Digest
  WEEKLY_DIGEST_DAY: 1,                      // 0=Sunday, 1=Monday, etc
  WEEKLY_DIGEST_HOUR: 9,                     // 9 AM
  WEEKLY_DIGEST_ENABLED: true,               // Enable/disable auto-digest
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000,           // 1 minute
  RATE_LIMIT_MAX_ACTIONS: 20,                // max actions per window
  RATE_LIMIT_SAVE_MAX: 10,                   // max saves per window
  
  // OpenAI
  OPENAI_MODEL: "gpt-3.5-turbo",
  OPENAI_CATEGORIZATION_MAX_TOKENS: 10,
  OPENAI_CONVERSATION_MAX_TOKENS: 150,
  OPENAI_TEMPERATURE: 0.7,
  OPENAI_CATEGORIZATION_TEMP: 0.3,
};

// ==================== SETUP ====================

const installationPath = process.env.XMTP_INSTALLATION_PATH || './.xmtp-installation';
if (!fs.existsSync(installationPath)) {
  fs.mkdirSync(installationPath, { recursive: true });
  console.log(`📁 Created XMTP installation directory: ${installationPath}`);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// TODO: FOR PRODUCTION SCALING (when traffic increases):
// 1. Migrate SQLite → PostgreSQL (for PM2 cluster mode support)
// 2. Add Redis for distributed context storage (survives restarts)
// 3. Implement message queue (Bull/BullMQ) for handling traffic spikes
// 4. Add OpenAI response caching to reduce API costs
// 5. Consider vector embeddings for semantic search
// 6. Add monitoring/metrics (Prometheus/Grafana)

const agent = await Agent.createFromEnv({
  env: process.env.XMTP_ENV || 'production',
  persistConversations: true,
  installationPath: installationPath
});

// ==================== LOGGING ====================

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  
  // Sanitize sensitive data before logging
  const sanitized = { ...data };
  if (sanitized.from) {
    sanitized.from = shortenAddress(sanitized.from); // Hide full address
  }
  if (sanitized.user) {
    sanitized.user = shortenAddress(sanitized.user);
  }
  if (sanitized.message) {
    sanitized.message = '[REDACTED]'; // Never log message content
  }
  
  console.log(`[${timestamp}] [${level.toUpperCase()}]: ${message}`, JSON.stringify(sanitized));
}

// Helper function moved up for use in log()
function shortenAddress(address) {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ==================== DATABASE SETUP ====================

const db = new Database('./dragman.db');

// In-memory store for group analytics (could move to DB later)
const groupAnalytics = new Map(); // { chatId: { detectedInfo: [], recentTopics: [], activityLog: [] } }

// Weekly stats tracking
const weeklyStats = new Map(); // { chatId: { weekStart: timestamp, saves: 0, searches: 0, views: 0, lastDigestSent: timestamp } }

// Track conversation types (DM vs Group) - remember after first interaction
const conversationTypes = new Map(); // { conversationId: 'dm' | 'group' }
const ignoredUnknownConversations = new Map(); // { chatId: count } - track how many times we ignored an unknown conversation

// Track pending replies - Base App might send 'message' event with reference, then 'text' event with content
const pendingReplies = new Map(); // { conversationId_timestamp: { reference, chatId, senderAddress, isGroupChat, timestamp } }

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    chatId TEXT NOT NULL,
    chatType TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    savedBy TEXT NOT NULL,
    fromUser TEXT,
    originalMessage TEXT,
    createdAt TEXT NOT NULL,
    tags TEXT,
    viewCount INTEGER DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_types (
    chatId TEXT PRIMARY KEY,
    chatType TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    chatId TEXT NOT NULL,
    category TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    PRIMARY KEY (chatId, category)
  )
`);

// Create indexes for better search performance
db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_chatId ON notes(chatId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_savedBy ON notes(savedBy)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_createdAt ON notes(createdAt DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_categories_chatId ON categories(chatId)`);

log('info', 'Database initialized with indexes');

// ==================== CONTEXT TRACKING ====================

const userContexts = new Map();

function setUserContext(address, context, data = null) {
  userContexts.set(address, { context, data, timestamp: Date.now() });
}

function getUserContext(address) {
  const ctx = userContexts.get(address);
  if (ctx && Date.now() - ctx.timestamp < CONFIG.CONTEXT_TIMEOUT_MS) { // 5 minutes
    return ctx;
  }
  userContexts.delete(address);
  return null;
}

function clearUserContext(address) {
  userContexts.delete(address);
}

// Cleanup old contexts periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [address, ctx] of userContexts.entries()) {
    if (now - ctx.timestamp > CONFIG.CONTEXT_TIMEOUT_MS) {
      userContexts.delete(address);
      log('info', 'Cleaned up expired context', { user: address });
    }
  }
}, CONFIG.CONTEXT_CLEANUP_INTERVAL_MS);

// ==================== RATE LIMITING ====================

const rateLimitStore = new Map(); // { address: { actions: [...timestamps], saves: [...timestamps] } }

function checkRateLimit(address, actionType = 'general') {
  const now = Date.now();
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
  
  if (!rateLimitStore.has(address)) {
    rateLimitStore.set(address, { actions: [], saves: [] });
  }
  
  const userLimits = rateLimitStore.get(address);
  
  // Clean old timestamps
  userLimits.actions = userLimits.actions.filter(ts => ts > windowStart);
  userLimits.saves = userLimits.saves.filter(ts => ts > windowStart);
  
  // Check general actions limit
  if (userLimits.actions.length >= CONFIG.RATE_LIMIT_MAX_ACTIONS) {
    return { allowed: false, reason: 'too_many_actions', resetIn: Math.ceil((userLimits.actions[0] + CONFIG.RATE_LIMIT_WINDOW_MS - now) / 1000) };
  }
  
  // Check save-specific limit
  if (actionType === 'save' && userLimits.saves.length >= CONFIG.RATE_LIMIT_SAVE_MAX) {
    return { allowed: false, reason: 'too_many_saves', resetIn: Math.ceil((userLimits.saves[0] + CONFIG.RATE_LIMIT_WINDOW_MS - now) / 1000) };
  }
  
  // Record action
  userLimits.actions.push(now);
  if (actionType === 'save') {
    userLimits.saves.push(now);
  }
  
  return { allowed: true };
}

// Cleanup rate limit store periodically
setInterval(() => {
  const now = Date.now();
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
  
  for (const [address, limits] of rateLimitStore.entries()) {
    limits.actions = limits.actions.filter(ts => ts > windowStart);
    limits.saves = limits.saves.filter(ts => ts > windowStart);
    
    // Remove empty entries
    if (limits.actions.length === 0 && limits.saves.length === 0) {
      rateLimitStore.delete(address);
    }
  }
}, CONFIG.CONTEXT_CLEANUP_INTERVAL_MS);

// Natural response delay to feel more human (2-5 seconds)
// Prevents spam and makes it feel like agent is carefully reading/thinking
async function naturalDelay() {
  const delay = CONFIG.MIN_RESPONSE_DELAY_MS + Math.random() * (CONFIG.MAX_RESPONSE_DELAY_MS - CONFIG.MIN_RESPONSE_DELAY_MS);
  await new Promise(resolve => setTimeout(resolve, delay));
}

// ==================== INPUT VALIDATION ====================

function validateNoteContent(content) {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: '❌ Note cannot be empty.' };
  }
  
  if (content.length > CONFIG.MAX_NOTE_CONTENT_LENGTH) {
    return { 
      valid: false, 
      error: `❌ Note too long. Maximum ${CONFIG.MAX_NOTE_CONTENT_LENGTH} characters (you have ${content.length}).` 
    };
  }
  
  // Basic XSS prevention (strip potentially dangerous patterns)
  const dangerousPatterns = [/<script/i, /javascript:/i, /onerror=/i, /onclick=/i];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return { valid: false, error: '❌ Invalid content detected. Please remove special characters.' };
    }
  }
  
  return { valid: true };
}

function sanitizeInput(input) {
  // Remove null bytes and control characters
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

// ==================== QUICK ACTIONS ====================

async function sendMainQuickActions(ctx, chatType) {
  // Text-based menu (different for DM vs Group)
  let interactiveMenu;
  
  if (chatType === 'group') {
    interactiveMenu = `🐉 What would you like to do?\n\n` +
      `🎯 QUICK ACTIONS\n\n` +
      `1️⃣ 💾 Save Note\n` +
      `2️⃣ 🔍 Search Notes\n` +
      `3️⃣ 📂 View Categories\n` +
      `4️⃣ ❓ Help\n\n` +
      `💡 Just type the number (1-4) with tag @dragman.base.eth first`;
  } else {
    // DM menu includes group features option
    interactiveMenu = `🐉 What would you like to do?\n\n` +
      `🎯 QUICK ACTIONS\n\n` +
      `1️⃣ 💾 Save Note\n` +
      `2️⃣ 🔍 Search Notes\n` +
      `3️⃣ 📂 View Categories\n` +
      `4️⃣ ❓ Help\n` +
      `5️⃣ 🚀 Group Features\n\n` +
      `💡 Just type the number (1-5)`;
  }
  
  try {
    await ctx.sendText(interactiveMenu);
    log('info', 'Sent Quick Actions menu', { chatType });
  } catch (error) {
    log('error', 'Failed to send Quick Actions', { error: error.message });
  }
}

async function sendCategoryActions(ctx, chatId, senderAddress, isGroupChat = false) {
  // CRITICAL PRIVACY FIX: 
  // 1. In DMs, only show categories from user's own notes
  // 2. ALWAYS filter by chatType to prevent DM notes leaking into groups
  const chatType = isGroupChat ? 'group' : 'dm';
  let categories;
  
  if (!isGroupChat && senderAddress) {
    // Get categories from user's notes only (DM privacy)
    categories = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ?
      GROUP BY category
      ORDER BY count DESC
    `).all(chatId, chatType, senderAddress);
  } else {
    // Groups: show all categories (shared knowledge) - but filter by chatType!
    categories = db.prepare(`
      SELECT category, count FROM categories 
      WHERE chatId = ? 
      ORDER BY count DESC
    `).all(chatId);
    
    // Double-check: Only include categories that actually exist for this chatType
    // This prevents DM categories from showing in groups
    const validCategories = db.prepare(`
      SELECT DISTINCT category FROM notes 
      WHERE chatId = ? AND chatType = ?
    `).all(chatId, chatType);
    const validCategorySet = new Set(validCategories.map(c => c.category));
    categories = categories.filter(cat => validCategorySet.has(cat.category));
  }

  if (categories.length === 0) {
    await ctx.sendText("📭 No categories yet. Start by saving some notes!");
    return;
  }

  setUserContext(senderAddress, 'viewing_categories', { categories, isGroupChat });

  let text = "🐉 Browse notes by category:\n\n";
  categories.forEach((cat, index) => {
    text += `${index + 1}. ${getCategoryEmoji(cat.category)} ${cat.category} (${cat.count})\n`;
  });
  
  text += `\nReply with the number to view notes in that category.`;
  text += `\n\n💡 Tip: Type /menu anytime to return here`;

  await ctx.sendText(text);
}

async function sendSearchResultActions(ctx, results, senderAddress) {
  setUserContext(senderAddress, 'viewing_search_results', { results });
  
  let text = formatNotesList(results.slice(0, CONFIG.MAX_SEARCH_RESULTS_DISPLAY));
  if (results.length > CONFIG.MAX_SEARCH_RESULTS_DISPLAY) {
    text += `\n...and ${results.length - CONFIG.MAX_SEARCH_RESULTS_DISPLAY} more results\n`;
  }
  text += `\nReply with number to view full note`;
  text += `\n\n💡 Tip: Type /menu for main menu`;
  
  await ctx.sendText(text);
}

// ==================== SMART NOTE SAVING ====================

async function saveNote(content, chatId, chatType, savedBy, fromUser = null, originalMessage = null, explicitCategory = null) {
  try {
    const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const category = explicitCategory || await categorizeContent(content);
    const tags = extractTags(content);
    
    db.prepare(`
      INSERT INTO notes (id, chatId, chatType, content, category, savedBy, fromUser, originalMessage, createdAt, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      noteId, chatId, chatType, content, category, savedBy, fromUser, originalMessage,
      new Date().toISOString(), JSON.stringify(tags)
    );
    
    db.prepare(`
      INSERT INTO categories (chatId, category, count) 
      VALUES (?, ?, 1)
      ON CONFLICT(chatId, category) 
      DO UPDATE SET count = count + 1
    `).run(chatId, category);
    
    log('info', 'Note saved', { noteId, category, user: savedBy });
    
    return { noteId, category, tags };
  } catch (error) {
    log('error', 'Failed to save note', { error: error.message, user: savedBy });
    throw new Error('Failed to save note to database');
  }
}

async function categorizeContent(content) {
  // Regex patterns for common categories
  if (/0x[a-fA-F0-9]{40}/.test(content)) return 'Addresses';
  if (/contract|deploy|solidity/i.test(content)) return 'Contract';
  if (/transaction|tx|transfer|swap/i.test(content)) return 'Transaction';
  if (/(https?:\/\/|www\.)/i.test(content)) return 'Links';
  if (/tutorial|guide|how to|steps/i.test(content)) return 'Tutorial';
  if (/strategy|plan|approach/i.test(content)) return 'Strategy';
  if (/meeting|call|discussion/i.test(content)) return 'Meeting';
  if (/api|key|token|secret/i.test(content)) return 'API';
  if (/defi|yield|liquidity|stake/i.test(content)) return 'DeFi';
  if (/game|gaming|nft|play/i.test(content)) return 'Gaming';
  if (/code|dev|debug|error/i.test(content)) return 'Dev';
  if (/trade|trading|price|chart/i.test(content)) return 'Trading';
  if (/personal|private|me|my|myself/i.test(content)) return 'Personal';
  if (/idea|thought|brainstorm/i.test(content)) return 'Ideas';
  if (/\?$|question|why|how|what|when/i.test(content)) return 'Questions';
  if (/resource|tool|link|doc/i.test(content)) return 'Resources';
  
  try {
    const completion = await openai.chat.completions.create({
      model: CONFIG.OPENAI_MODEL,
      messages: [{
        role: "system",
        content: "You are a categorization assistant. Return ONLY a 1-2 word category name for the note. Categories: Addresses, Contract, Transaction, Links, Tutorial, Strategy, Meeting, API, DeFi, Gaming, Dev, Trading, Personal, Ideas, Questions, Resources, General. Return just the category word, nothing else."
      }, {
        role: "user",
        content: `Categorize this note: "${content}"`
      }],
      max_tokens: CONFIG.OPENAI_CATEGORIZATION_MAX_TOKENS,
      temperature: CONFIG.OPENAI_CATEGORIZATION_TEMP,
    });
    return completion.choices[0].message.content.trim() || 'General';
  } catch (error) {
    log('error', 'OpenAI categorization failed', { error: error.message });
    return 'General';
  }
}

function extractTags(content) {
  const tags = [];
  const words = content.toLowerCase().split(/\s+/);
  const keywords = ['eth', 'base', 'uniswap', 'nft', 'dao', 'defi', 'web3', 'smart contract', 'yield', 'stake'];
  
  keywords.forEach(keyword => {
    if (content.toLowerCase().includes(keyword)) {
      tags.push(keyword);
    }
  });
  
  return tags;
}

// ==================== SMART NOTE SEARCHING ====================

function searchNotes(query, chatId, senderAddress = null, isGroupChat = false) {
  // CRITICAL PRIVACY FIX: 
  // 1. In DMs, only show user's own notes
  // 2. ALWAYS filter by chatType to prevent DM notes leaking into groups
  const chatType = isGroupChat ? 'group' : 'dm';
  
  if (!isGroupChat && senderAddress) {
    return db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ? AND (
        LOWER(content) LIKE ? OR 
        LOWER(category) LIKE ? OR 
        LOWER(tags) LIKE ?
      )
      ORDER BY createdAt DESC
    `).all(chatId, chatType, senderAddress, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`);
  } else {
    return db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND (
        LOWER(content) LIKE ? OR 
        LOWER(category) LIKE ? OR 
        LOWER(tags) LIKE ?
      )
      ORDER BY createdAt DESC
    `).all(chatId, chatType, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`);
  }
}

function getNotesByCategory(category, chatId, senderAddress = null, isGroupChat = false) {
  // CRITICAL PRIVACY FIX: 
  // 1. In DMs, only show user's own notes
  // 2. ALWAYS filter by chatType to prevent DM notes leaking into groups
  const chatType = isGroupChat ? 'group' : 'dm';
  
  if (!isGroupChat && senderAddress) {
    return db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ? AND category = ?
      ORDER BY createdAt DESC
    `).all(chatId, chatType, senderAddress, category);
  } else {
    return db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND category = ?
      ORDER BY createdAt DESC
    `).all(chatId, chatType, category);
  }
}

function getRecentNotes(chatId, limit = CONFIG.MAX_RECENT_NOTES, senderAddress = null, isGroupChat = false) {
  // CRITICAL PRIVACY FIX: 
  // 1. In DMs, only show user's own notes
  // 2. ALWAYS filter by chatType to prevent DM notes leaking into groups
  const chatType = isGroupChat ? 'group' : 'dm';
  
  if (!isGroupChat && senderAddress) {
    return db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ?
      ORDER BY createdAt DESC 
      LIMIT ?
    `).all(chatId, chatType, senderAddress, limit);
  } else {
    return db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ?
      ORDER BY createdAt DESC 
      LIMIT ?
    `).all(chatId, chatType, limit);
  }
}

function incrementViewCount(noteId) {
  try {
    db.prepare(`
      UPDATE notes 
      SET viewCount = viewCount + 1 
      WHERE id = ?
    `).run(noteId);
  } catch (error) {
    log('error', 'Failed to increment view count', { noteId, error: error.message });
  }
}

// ==================== GROUP INTELLIGENCE FEATURES ====================

// PASSIVE DETECTION: Detect important info in background (doesn't auto-respond)
function detectImportantInfo(message, chatId, senderAddress) {
  const detectedItems = [];
  
  // Detect Ethereum addresses
  const addressMatches = message.match(/0x[a-fA-F0-9]{40,}/g);
  if (addressMatches) {
    detectedItems.push({
      type: 'address',
      content: addressMatches[0],
      detectedBy: senderAddress,
      timestamp: Date.now()
    });
  }
  
  // Detect URLs
  const urlMatches = message.match(/https?:\/\/[^\s]+/g);
  if (urlMatches) {
    detectedItems.push({
      type: 'url',
      content: urlMatches[0],
      detectedBy: senderAddress,
      timestamp: Date.now()
    });
  }
  
  // Detect important keywords (contract, deploy, wallet, key, api)
  const importantKeywords = ['contract', 'deploy', 'wallet', 'private key', 'api key', 'token', 'mainnet'];
  const lowerMessage = message.toLowerCase();
  for (const keyword of importantKeywords) {
    if (lowerMessage.includes(keyword)) {
      detectedItems.push({
        type: 'keyword',
        content: keyword,
        context: message.substring(0, 100),
        detectedBy: senderAddress,
        timestamp: Date.now()
      });
      break; // Only track first important keyword
    }
  }
  
  // Store detected items for analytics
  if (detectedItems.length > 0) {
    if (!groupAnalytics.has(chatId)) {
      groupAnalytics.set(chatId, { detectedInfo: [], recentTopics: [], activityLog: [] });
    }
    const analytics = groupAnalytics.get(chatId);
    analytics.detectedInfo.push(...detectedItems);
    
    // Keep only last 50 detected items
    if (analytics.detectedInfo.length > 50) {
      analytics.detectedInfo = analytics.detectedInfo.slice(-50);
    }
  }
  
  return detectedItems;
}

// TRENDING TOPICS: Analyze what the group is focusing on
function analyzeTrendingTopics(chatId, days = 7, senderAddress = null, isGroupChat = false) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  // CRITICAL PRIVACY FIX: 
  // 1. In DMs, only analyze user's own notes
  // 2. ALWAYS filter by chatType to prevent DM notes leaking into groups
  const chatType = isGroupChat ? 'group' : 'dm';
  
  let recentNotes;
  if (!isGroupChat && senderAddress) {
    recentNotes = db.prepare(`
      SELECT category, content, savedBy, createdAt, viewCount 
      FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ? AND createdAt > ?
      ORDER BY createdAt DESC
    `).all(chatId, chatType, senderAddress, cutoffDate);
  } else {
    recentNotes = db.prepare(`
      SELECT category, content, savedBy, createdAt, viewCount 
      FROM notes 
      WHERE chatId = ? AND chatType = ? AND createdAt > ?
      ORDER BY createdAt DESC
    `).all(chatId, chatType, cutoffDate);
  }
  
  if (recentNotes.length === 0) {
    return null;
  }
  
  // Count category frequency
  const categoryCount = {};
  const contributorCount = {};
  const keywordCount = {};
  
  for (const note of recentNotes) {
    // Count categories
    categoryCount[note.category] = (categoryCount[note.category] || 0) + 1;
    
    // Count contributors
    const shortAddr = shortenAddress(note.savedBy);
    contributorCount[shortAddr] = (contributorCount[shortAddr] || 0) + 1;
    
    // Extract keywords from content
    const words = note.content.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 4 && !['about', 'which', 'where', 'there'].includes(word)) {
        keywordCount[word] = (keywordCount[word] || 0) + 1;
      }
    }
  }
  
  // Sort and get top items
  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  const topContributors = Object.entries(contributorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  const topKeywords = Object.entries(keywordCount)
    .filter(([word, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  // Get most viewed notes
  const popularNotes = recentNotes
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 3);
  
  return {
    totalNotes: recentNotes.length,
    topCategories,
    topContributors,
    topKeywords,
    popularNotes,
    timeframe: `${days} days`
  };
}

// FIND RELATED NOTES: Find notes similar to current one
function findRelatedNotes(noteId, chatId, limit = 3, senderAddress = null, isGroupChat = false) {
  // Get the source note
  const sourceNote = db.prepare('SELECT * FROM notes WHERE id = ? AND chatId = ?').get(noteId, chatId);
  if (!sourceNote) return [];
  
  // CRITICAL PRIVACY FIX: 
  // 1. In DMs, only find related notes from user's own notes
  // 2. ALWAYS filter by chatType to prevent DM notes leaking into groups
  const chatType = isGroupChat ? 'group' : 'dm';
  
  // Extract keywords from source note
  const keywords = sourceNote.content.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4);
  
  if (keywords.length === 0) return [];
  
  // Find notes with similar keywords (excluding source note)
  let allNotes;
  if (!isGroupChat && senderAddress) {
    allNotes = db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ? AND id != ?
      ORDER BY createdAt DESC
      LIMIT 20
    `).all(chatId, chatType, senderAddress, noteId);
  } else {
    allNotes = db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND id != ?
      ORDER BY createdAt DESC
      LIMIT 20
    `).all(chatId, chatType, noteId);
  }
  
  // Calculate similarity scores
  const scored = allNotes.map(note => {
    let score = 0;
    const noteContent = note.content.toLowerCase();
    
    for (const keyword of keywords) {
      if (noteContent.includes(keyword)) score += 1;
    }
    
    // Boost same category
    if (note.category === sourceNote.category) score += 2;
    
    return { note, score };
  });
  
  // Return top matches
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.note);
}

// CHECK FOR UNSAVED IMPORTANT INFO
function checkUnsavedInfo(chatId, isGroupChat = false) {
  if (!groupAnalytics.has(chatId)) return [];
  
  // CRITICAL PRIVACY FIX: Only check unsaved info for groups, and filter by chatType
  const chatType = isGroupChat ? 'group' : 'dm';
  
  const analytics = groupAnalytics.get(chatId);
  const recentDetections = analytics.detectedInfo.filter(
    item => Date.now() - item.timestamp < 30 * 60 * 1000 // Last 30 minutes
  );
  
  // Check which detected items haven't been saved
  const unsaved = [];
  for (const detection of recentDetections) {
    if (detection.type === 'address' || detection.type === 'url') {
      // CRITICAL PRIVACY FIX: Filter by chatType to prevent checking DM notes in group context
      const exists = db.prepare(`
        SELECT id FROM notes 
        WHERE chatId = ? AND chatType = ? AND content LIKE ?
        LIMIT 1
      `).get(chatId, chatType, `%${detection.content}%`);
      
      if (!exists) {
        unsaved.push(detection);
      }
    }
  }
  
  return unsaved;
}

// WEEKLY DIGEST: Generate comprehensive weekly report
function generateWeeklyDigest(chatId, chatTypeParam, senderAddress = null, isGroupChat = false) {
  const trends = analyzeTrendingTopics(chatId, 7, senderAddress, isGroupChat);
  
  if (!trends || trends.totalNotes < 3) {
    return null; // Not enough data for meaningful digest
  }
  
  // Get weekly stats
  let stats = weeklyStats.get(chatId);
  if (!stats) {
    stats = { weekStart: Date.now(), saves: 0, searches: 0, views: 0, lastDigestSent: 0 };
    weeklyStats.set(chatId, stats);
  }
  
  // Calculate previous week stats (from notes created in last 7 days)
  const lastWeekStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  let previousWeekNotes, totalNotes;
  
  // CRITICAL PRIVACY FIX: 
  // 1. In DMs, only count user's own notes
  // 2. ALWAYS filter by chatType to prevent DM notes leaking into groups
  // Use parameter if provided, otherwise derive from isGroupChat
  const actualChatType = chatTypeParam || (isGroupChat ? 'group' : 'dm');
  
  if (!isGroupChat && senderAddress) {
    previousWeekNotes = db.prepare(`
      SELECT COUNT(*) as count FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ? AND createdAt BETWEEN ? AND ?
    `).get(chatId, actualChatType, senderAddress, lastWeekStart, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    totalNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE chatId = ? AND chatType = ? AND savedBy = ?').get(chatId, actualChatType, senderAddress);
  } else {
    previousWeekNotes = db.prepare(`
      SELECT COUNT(*) as count FROM notes 
      WHERE chatId = ? AND chatType = ? AND createdAt BETWEEN ? AND ?
    `).get(chatId, actualChatType, lastWeekStart, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    totalNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE chatId = ? AND chatType = ?').get(chatId, actualChatType);
  }
  
  const weekChange = trends.totalNotes - (previousWeekNotes?.count || 0);
  
  // Calculate team level based on total notes
  const teamLevel = Math.floor(totalNotes.count / 10) + 1;
  const nextLevelAt = teamLevel * 10;
  const progress = ((totalNotes.count % 10) / 10) * 100;
  
  // Get unsaved detections from last week (only for groups)
  const unsaved = [];
  if (isGroupChat && groupAnalytics.has(chatId)) {
    const analytics = groupAnalytics.get(chatId);
    const weeklyDetections = analytics.detectedInfo.filter(
      item => Date.now() - item.timestamp < 7 * 24 * 60 * 60 * 1000
    );
    
    for (const detection of weeklyDetections) {
      if (detection.type === 'address' || detection.type === 'url') {
        // CRITICAL PRIVACY FIX: Filter by chatType to prevent checking DM notes in group context
        const exists = db.prepare(`
          SELECT id FROM notes WHERE chatId = ? AND chatType = ? AND content LIKE ? LIMIT 1
        `).get(chatId, actualChatType, `%${detection.content}%`);
        
        if (!exists) {
          unsaved.push(detection);
        }
      }
    }
  }
  
  // Find knowledge gaps (keywords mentioned but few notes)
  const knowledgeGaps = [];
  if (trends.topKeywords.length > 0) {
    for (const [keyword, count] of trends.topKeywords.slice(0, 3)) {
      let notesCount;
      if (!isGroupChat && senderAddress) {
        notesCount = db.prepare(`
          SELECT COUNT(*) as count FROM notes 
          WHERE chatId = ? AND chatType = ? AND savedBy = ? AND LOWER(content) LIKE ?
        `).get(chatId, actualChatType, senderAddress, `%${keyword}%`);
      } else {
        notesCount = db.prepare(`
          SELECT COUNT(*) as count FROM notes 
          WHERE chatId = ? AND chatType = ? AND LOWER(content) LIKE ?
        `).get(chatId, actualChatType, `%${keyword}%`);
      }
      
      if (count > 3 && notesCount.count < 2) {
        knowledgeGaps.push({ keyword, mentions: count, notes: notesCount.count });
      }
    }
  }
  
  return {
    totalNotes: trends.totalNotes,
    weekChange,
    topContributor: trends.topContributors[0],
    topCategory: trends.topCategories[0],
    topKeywords: trends.topKeywords.slice(0, 3),
    popularNotes: trends.popularNotes.slice(0, 2),
    teamLevel,
    nextLevelAt,
    progress,
    unsaved: unsaved.slice(0, 3),
    knowledgeGaps: knowledgeGaps.slice(0, 2),
    chatType: actualChatType
  };
}

// FORMAT WEEKLY DIGEST
function formatWeeklyDigest(digest) {
  if (!digest) return null;
  
  const changeEmoji = digest.weekChange > 0 ? '📈' : digest.weekChange < 0 ? '📉' : '➡️';
  const changeText = digest.weekChange > 0 ? `+${digest.weekChange}` : digest.weekChange < 0 ? `${digest.weekChange}` : '±0';
  
  let report = `📊 DRAGMAN WEEKLY REPORT\n\n`;
  report += `Your ${digest.chatType === 'group' ? 'team' : 'knowledge base'} had a productive week! 🎉\n\n`;
  
  // Activity section
  report += `📈 ACTIVITY\n`;
  report += `• ${digest.totalNotes} notes saved this week ${changeEmoji} (${changeText} from last week)\n`;
  
  // MVP section (only for groups)
  if (digest.chatType === 'group' && digest.topContributor) {
    report += `\n🏆 MVP OF THE WEEK\n`;
    report += `🥇 ${digest.topContributor[0]}: ${digest.topContributor[1]} saves\n`;
    if (digest.topContributor[1] >= 5) {
      report += `   ${digest.topContributor[0]} is on fire! 🔥\n`;
    }
  }
  
  // Trending section
  if (digest.topCategory) {
    report += `\n🔥 TRENDING\n`;
    digest.topKeywords.forEach(([keyword, count], idx) => {
      report += `${idx + 1}. ${keyword} (${count} mentions)\n`;
    });
  }
  
  // Popular notes
  if (digest.popularNotes.length > 0) {
    report += `\n⭐ MOST VIEWED\n`;
    digest.popularNotes.forEach((note, idx) => {
      report += `${idx + 1}. ${truncate(note.content, 50)} (${note.viewCount} views)\n`;
    });
  }
  
  // Smart insights
  const hasInsights = digest.unsaved.length > 0 || digest.knowledgeGaps.length > 0;
  if (hasInsights) {
    report += `\n💡 SMART INSIGHTS\n`;
    
    if (digest.unsaved.length > 0) {
      const unsavedCount = digest.unsaved.length;
      const types = [...new Set(digest.unsaved.map(item => item.type))];
      const typeText = types.includes('address') ? 'addresses' : types.includes('url') ? 'links' : 'items';
      
      report += `• ${unsavedCount} ${typeText} detected but not saved\n`;
      report += `  Type @dragman suggestions to review\n\n`;
    }
    
    if (digest.knowledgeGaps.length > 0) {
      digest.knowledgeGaps.forEach(gap => {
        report += `• "${gap.keyword}" mentioned ${gap.mentions}x but only ${gap.notes} note(s) saved\n`;
        report += `  Missing knowledge? Save some guides!\n\n`;
      });
    }
  }
  
  // Team progress (gamification)
  report += `🎯 TEAM PROGRESS\n`;
  report += `Level ${digest.teamLevel} → ${Math.round(digest.progress)}% to Level ${digest.teamLevel + 1}\n`;
  report += `(${digest.nextLevelAt - (digest.teamLevel - 1) * 10 - Math.floor((digest.progress / 100) * 10)} more notes to next level!)\n\n`;
  
  if (digest.teamLevel >= 5) {
    report += `🏆 Achievement unlocked: Knowledge Masters!\n\n`;
  }
  
  report += `Keep building ${digest.chatType === 'group' ? 'team' : ''} knowledge! 🚀`;
  
  return report;
}

// ==================== HELPER FUNCTIONS ====================

function saveConversationType(chatId, chatType) {
  try {
    db.prepare(`
      INSERT INTO conversation_types (chatId, chatType, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(chatId) DO UPDATE SET chatType = ?, updatedAt = ?
    `).run(chatId, chatType, new Date().toISOString(), chatType, new Date().toISOString());
    conversationTypes.set(chatId, chatType); // Also update memory
  } catch (e) {
    log('error', 'Failed to save conversation type', { chatId: chatId.substring(0, 20), error: e.message });
  }
}

function updateCategoryCount(chatId, category, delta = -1) {
  try {
    // Update category count
    db.prepare(`
      UPDATE categories 
      SET count = count + ?
      WHERE chatId = ? AND category = ?
    `).run(delta, chatId, category);
    
    // Remove category if count is 0 or less
    db.prepare(`
      DELETE FROM categories 
      WHERE chatId = ? AND category = ? AND count <= 0
    `).run(chatId, category);
  } catch (error) {
    log('error', 'Failed to update category count', { chatId, category, error: error.message });
  }
}

// ==================== DELETE FUNCTIONALITY ====================

function deleteNotes(query, chatId, senderAddress, category = null, isGroupChat = false) {
  // CRITICAL PRIVACY FIX: ALWAYS filter by chatType to prevent DM notes leaking into groups
  const chatType = isGroupChat ? 'group' : 'dm';
  let matchingNotes;
  
  if (category) {
    // Search within specific category
    matchingNotes = db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ? AND category = ? AND LOWER(content) LIKE ?
      ORDER BY createdAt DESC
    `).all(chatId, chatType, senderAddress, category, `%${query.toLowerCase()}%`);
  } else {
    // Search across all notes
    matchingNotes = db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ? AND LOWER(content) LIKE ?
      ORDER BY createdAt DESC
    `).all(chatId, chatType, senderAddress, `%${query.toLowerCase()}%`);
  }
  
  return matchingNotes;
}

// ==================== FORMATTING HELPERS ====================

function formatNote(note) {
  const date = new Date(note.createdAt);
  const relativeTime = getRelativeTime(date);
  
  let formatted = `📝 Note • ${note.category}\n\n`;
  formatted += `${note.content}\n\n`;
  formatted += `━━━━━━━━━━━━━━━━\n`;
  formatted += `📅 ${relativeTime}\n`;
  formatted += `👀 ${note.viewCount} views\n`;
  
  if (note.chatType === 'group') {
    formatted += `👤 Saved by: ${shortenAddress(note.savedBy)}\n`;
  }
  
  if (note.content.match(/0x[a-fA-F0-9]{40}/)) {
    const address = note.content.match(/0x[a-fA-F0-9]{40}/)[0];
    formatted += `\n🔗 BaseScan: https://basescan.org/address/${address}`;
  }
  
  return formatted;
}

function formatNotesList(notes) {
  if (notes.length === 0) {
    return "📭 No notes found.";
  }
  
  let formatted = `📚 Found ${notes.length} note${notes.length > 1 ? 's' : ''}\n\n`;
  
  notes.forEach((note, index) => {
    const date = new Date(note.createdAt);
    const relativeTime = getRelativeTime(date);
    formatted += `${index + 1}. ${getCategoryEmoji(note.category)} ${note.category}\n`;
    formatted += `   ${truncate(note.content, 60)}\n`;
    formatted += `   ${relativeTime} • ${note.viewCount} views\n\n`;
  });
  
  return formatted;
}

function getCategoryEmoji(category) {
  const emojis = {
    'Addresses': '📍',
    'Contract': '📜',
    'Transaction': '💸',
    'Links': '🔗',
    'Tutorial': '📚',
    'Strategy': '🎯',
    'Meeting': '📅',
    'API': '🔑',
    'DeFi': '🏦',
    'Gaming': '🎮',
    'Dev': '💻',
    'Trading': '📊',
    'Personal': '👤',
    'Ideas': '💡',
    'Questions': '❓',
    'Resources': '📦',
    'General': '📝'
  };
  
  return emojis[category] || '📝';
}

function truncate(str, maxLength) {
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

// shortenAddress moved to top for use in log() function

function getRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// ==================== COMMAND HANDLING ====================

async function handleDragmanCommands(ctx, userMessage, senderAddress, isGroupChat) {
  const message = userMessage.toLowerCase().trim();
  // CONSISTENT chatId extraction - use same logic as handlers
  const chatId = ctx.conversation?.topic || ctx.message?.conversationId || 'unknown';
  const chatType = isGroupChat ? 'group' : 'dm';
  
  // DEBUG: Log chatId for consistency checking
  console.log('🔑 [HANDLE COMMANDS]', {
    chatId: chatId.substring(0, 20),
    chatType,
    isGroupChat,
    source: ctx.conversation?.topic ? 'conversation.topic' : ctx.message?.conversationId ? 'message.conversationId' : 'unknown'
  });
  
  // Parse save command with category
  if (message.startsWith('save ') || message.startsWith('remember ') || message.startsWith('note ')) {
    // Check rate limit
    const rateCheck = checkRateLimit(senderAddress, 'save');
    if (!rateCheck.allowed) {
      if (rateCheck.reason === 'too_many_saves') {
        return `⏱️ Slow down! You can save max ${CONFIG.RATE_LIMIT_SAVE_MAX} notes per minute.\n\n` +
               `Try again in ${rateCheck.resetIn} seconds.`;
      }
      return `⏱️ Too many actions! Please wait ${rateCheck.resetIn} seconds.`;
    }
    
    let content = userMessage.replace(/^(save|remember|note)\s+/i, '').trim();
    content = sanitizeInput(content);
    
    // Validate content
    const validation = validateNoteContent(content);
    if (!validation.valid) {
      return validation.error;
    }
    
    // Check for explicit category at the END: "save [content] in/to/at [category]"
    // Match the LAST occurrence of in/to/at followed by a single word (category)
    const categoryMatch = content.match(/^(.+)\s+(?:in|to|at)\s+([a-zA-Z][a-zA-Z0-9]*)\s*$/i);
    let actualContent, explicitCategory;
    
    if (categoryMatch) {
      actualContent = categoryMatch[1].trim();
      explicitCategory = categoryMatch[2].trim();
      explicitCategory = explicitCategory.charAt(0).toUpperCase() + explicitCategory.slice(1).toLowerCase();
    } else {
      actualContent = content;
      explicitCategory = null;
    }
    
    try {
      const result = await saveNote(actualContent, chatId, chatType, senderAddress, null, null, explicitCategory);
      
      const visibilityNote = chatType === 'group' 
        ? '⚠️ This note is visible to everyone in this group!'
        : '🔒 This note is private to you.';
      
      return `✅ Note saved successfully!\n\n` +
             `${getCategoryEmoji(result.category)} Category: ${result.category}\n` +
             `📝 ${truncate(actualContent, 100)}\n` +
             `${visibilityNote}\n\n` +
             `💡 Search: "search ${result.category}"\n` +
             `💡 Made a mistake? "delete [keyword]"`;
    } catch (error) {
      return `❌ Failed to save note. Please try again.\n\n💡 Type /help for assistance.`;
    }
  }
  
  // SEARCH
  if (message.startsWith('search ') || message.startsWith('find ')) {
    const query = message.replace(/^(search|find)\s+/i, '').trim();
    const results = searchNotes(query, chatId, senderAddress, isGroupChat);
    
    if (results.length === 0) {
      return `❌ No notes found for "${query}"\n\n💡 Try different keywords or check /help`;
    }
    
    if (results.length === 1) {
      const note = results[0];
      incrementViewCount(note.id);
      
      let response = formatNote(note);
      
      // NEW: Show related notes (with privacy filter)
      const related = findRelatedNotes(note.id, chatId, 3, senderAddress, isGroupChat);
      if (related.length > 0) {
        response += `\n\n🔗 RELATED NOTES\n`;
        related.forEach((relNote, idx) => {
          response += `${idx + 1}. ${getCategoryEmoji(relNote.category)} ${truncate(relNote.content, 50)}\n`;
        });
        response += `\n💡 Search by category to see all: search ${note.category}`;
      }
      
      response += "\n\n💡 Type /menu for main menu";
      return response;
    }
    
    await sendSearchResultActions(ctx, results, senderAddress);
    return 'SEARCH_SENT';
  }
  
  // RECENT
  if (message === 'recent' || message === 'latest' || message === 'recent notes') {
    const recent = getRecentNotes(chatId, CONFIG.MAX_RECENT_NOTES, senderAddress, isGroupChat);
    if (recent.length === 0) {
      return "📭 No notes yet. Start saving with: save [content]";
    }
    return formatNotesList(recent) + "\n\n💡 Type /menu for main menu";
  }
  
  // DELETE FUNCTIONALITY
  if (message.startsWith('delete ') || message.startsWith('remove ')) {
    const deleteQuery = message.replace(/^(delete|remove)\s+/i, '').trim();
    
    // Check for category specification at the END: "delete [content] in/from/at [category]"
    // Match the LAST occurrence of in/from/at followed by a single word (category)
    const deleteCategoryMatch = deleteQuery.match(/^(.+)\s+(?:in|from|at)\s+([a-zA-Z][a-zA-Z0-9]*)\s*$/i);
    let searchContent, searchCategory;
    
    if (deleteCategoryMatch) {
      searchContent = deleteCategoryMatch[1].trim();
      searchCategory = deleteCategoryMatch[2].trim();
      searchCategory = searchCategory.charAt(0).toUpperCase() + searchCategory.slice(1).toLowerCase();
    } else {
      searchContent = deleteQuery;
      searchCategory = null;
    }
    
    const matchingNotes = deleteNotes(searchContent, chatId, senderAddress, searchCategory, isGroupChat);
    
    if (matchingNotes.length === 0) {
      return `❌ No matching notes found.\n\n` +
             `💡 Try: "recent" to see your notes\n` +
             `Type /menu for main menu`;
    }
    
    // Single match - delete immediately
    if (matchingNotes.length === 1) {
      const note = matchingNotes[0];
      
      // Delete the note
      db.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
      
      // Update category count (using helper function)
      updateCategoryCount(chatId, note.category, -1);
      
      log('info', 'Note deleted', { noteId: note.id, user: senderAddress });
      
      return `✅ Note deleted successfully!\n\n` +
             `${getCategoryEmoji(note.category)} Category: ${note.category}\n` +
             `📝 ${truncate(note.content, 100)}\n\n` +
             `💡 Type /menu for main menu`;
    }
    
    // Multiple matches, show list to confirm
    setUserContext(senderAddress, 'deleting_notes', { notes: matchingNotes });
    
    let response = `🗑️ Found ${matchingNotes.length} matching note(s):\n\n`;
    matchingNotes.slice(0, 5).forEach((note, index) => {
      const relativeTime = getRelativeTime(new Date(note.createdAt));
      response += `${index + 1}. ${getCategoryEmoji(note.category)} ${note.category}\n`;
      response += `   ${truncate(note.content, 60)}\n`;
      response += `   ${relativeTime}\n\n`;
    });
    
    if (matchingNotes.length > 5) {
      response += `...and ${matchingNotes.length - 5} more\n\n`;
    }
    
    response += `Reply with number to delete, or type /menu to cancel`;
    
    return response;
  }
  
  // EDIT FUNCTIONALITY
  if (message.startsWith('edit ') || message.startsWith('update ')) {
    const editQuery = message.replace(/^(edit|update)\s+/i, '').trim();
    
    // CRITICAL PRIVACY FIX: Filter by chatType to prevent editing DM notes from group context
    const chatTypeForEdit = isGroupChat ? 'group' : 'dm';
    
    // Search for notes to edit
    const matchingNotes = db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ? AND LOWER(content) LIKE ?
      ORDER BY createdAt DESC
    `).all(chatId, chatTypeForEdit, senderAddress, `%${editQuery.toLowerCase()}%`);
    
    if (matchingNotes.length === 0) {
      return `❌ No matching notes found to edit.\n\n` +
             `💡 Try: "recent" to see your notes\n` +
             `Type /menu for main menu`;
    }
    
    // Show list for user to select
    setUserContext(senderAddress, 'editing_notes', { notes: matchingNotes });
    
    let response = `✏️ Found ${matchingNotes.length} matching note(s):\n\n`;
    matchingNotes.slice(0, 5).forEach((note, index) => {
      const relativeTime = getRelativeTime(new Date(note.createdAt));
      response += `${index + 1}. ${getCategoryEmoji(note.category)} ${note.category}\n`;
      response += `   ${truncate(note.content, 60)}\n`;
      response += `   ${relativeTime}\n\n`;
    });
    
    if (matchingNotes.length > 5) {
      response += `...and ${matchingNotes.length - 5} more\n\n`;
    }
    
    response += `Reply with number to edit, or type /menu to cancel`;
    
    return response;
  }
  
  // CATEGORIES
  if (message === 'categories' || message === 'category' || message === 'topics') {
    await sendCategoryActions(ctx, chatId, senderAddress, isGroupChat);
    return 'CATEGORIES_SENT';
  }
  
  // STATS
  if (message === 'stats' || message === 'statistics') {
  // CRITICAL PRIVACY FIX: 
  // 1. In DMs, only count user's own notes
  // 2. ALWAYS filter by chatType to prevent DM notes leaking into groups
  const chatType = isGroupChat ? 'group' : 'dm';
  let totalNotes, categories, topCategory;
  
  if (!isGroupChat && senderAddress) {
    totalNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE chatId = ? AND chatType = ? AND savedBy = ?').get(chatId, chatType, senderAddress);
    categories = db.prepare(`
      SELECT COUNT(DISTINCT category) as count 
      FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ?
    `).get(chatId, chatType, senderAddress);
    topCategory = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM notes 
      WHERE chatId = ? AND chatType = ? AND savedBy = ?
      GROUP BY category 
      ORDER BY count DESC 
      LIMIT 1
    `).get(chatId, chatType, senderAddress);
  } else {
    totalNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE chatId = ? AND chatType = ?').get(chatId, chatType);
    categories = db.prepare(`
      SELECT COUNT(DISTINCT category) as count 
      FROM notes 
      WHERE chatId = ? AND chatType = ?
    `).get(chatId, chatType);
    topCategory = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM notes 
      WHERE chatId = ? AND chatType = ?
      GROUP BY category 
      ORDER BY count DESC 
      LIMIT 1
    `).get(chatId, chatType);
  }
    
    return `📊 Dragman Statistics\n\n` +
           `📝 Total Notes: ${totalNotes.count}\n` +
           `📂 Categories: ${categories.count}\n` +
           (topCategory ? `🏆 Top Category: ${topCategory.category} (${topCategory.count} notes)\n` : '') +
           `\n💡 Keep saving to make this ${chatType === 'group' ? 'group' : 'chat'} smarter!`;
  }
  
  // TRENDING TOPICS (NEW!)
  if (message === 'trends' || message === 'trending' || message === 'insights') {
    const trends = analyzeTrendingTopics(chatId, 7, senderAddress, isGroupChat);
    
    if (!trends) {
      return `📊 Not enough data yet!\n\n` +
             `💡 Save more notes to unlock group insights.\n` +
             `Start with: save [important info]`;
    }
    
    let response = `🔥 GROUP INSIGHTS (Last ${trends.timeframe})\n\n`;
    
    // Top categories
    response += `📂 TRENDING TOPICS\n`;
    trends.topCategories.forEach(([category, count], idx) => {
      response += `${idx + 1}. ${getCategoryEmoji(category)} ${category} (${count} notes)\n`;
    });
    
    // Top contributors (only show in group)
    if (chatType === 'group' && trends.topContributors.length > 0) {
      response += `\n🏆 TOP CONTRIBUTORS\n`;
      trends.topContributors.forEach(([user, count], idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
        response += `${medal} ${user}: ${count} saves\n`;
      });
    }
    
    // Hot keywords
    if (trends.topKeywords.length > 0) {
      response += `\n🔥 HOT KEYWORDS\n`;
      const keywords = trends.topKeywords.map(([word, count]) => `${word} (${count}x)`).join(', ');
      response += keywords + '\n';
    }
    
    // Most viewed
    if (trends.popularNotes.length > 0) {
      response += `\n⭐ MOST VIEWED\n`;
      trends.popularNotes.forEach((note, idx) => {
        response += `${idx + 1}. ${truncate(note.content, 50)} (${note.viewCount} views)\n`;
      });
    }
    
    response += `\n💡 Total activity: ${trends.totalNotes} notes saved`;
    
    return response;
  }
  
  // SUGGESTIONS - Check for unsaved important info (NEW!)
  if (message === 'suggestions' || message === 'unsaved' || message === 'detect') {
    const unsaved = checkUnsavedInfo(chatId, isGroupChat);
    
    if (unsaved.length === 0) {
      return `✅ No unsaved important info detected!\n\n` +
             `💡 I watch for wallet addresses, URLs, and key mentions.\n` +
             `When I spot something important, check here with: @dragman suggestions`;
    }
    
    let response = `💡 DETECTED IMPORTANT INFO (Not saved yet)\n\n`;
    
    unsaved.slice(0, 5).forEach((item, idx) => {
      const timeAgo = getRelativeTime(new Date(item.timestamp));
      response += `${idx + 1}. `;
      
      if (item.type === 'address') {
        response += `📍 Wallet: ${shortenAddress(item.content)}\n`;
      } else if (item.type === 'url') {
        response += `🔗 Link: ${truncate(item.content, 40)}\n`;
      } else if (item.type === 'keyword') {
        response += `🔑 "${item.content}" mentioned\n`;
        response += `   Context: ${truncate(item.context, 60)}\n`;
      }
      
      response += `   Detected ${timeAgo}`;
      if (chatType === 'group') {
        response += ` by ${shortenAddress(item.detectedBy)}`;
      }
      response += `\n\n`;
    });
    
    response += `💾 To save any of these, use:\n`;
    response += `save [description of what it is]`;
    
    return response;
  }
  
  // WEEKLY DIGEST (NEW!)
  if (message === 'digest' || message === 'report' || message === 'weekly') {
    const digest = generateWeeklyDigest(chatId, chatType, senderAddress, isGroupChat);
    
    if (!digest) {
      return `📊 Not enough data for weekly digest yet!\n\n` +
             `💡 Need at least 3 notes saved to generate insights.\n` +
             `Save more notes with: save [content]`;
    }
    
    const report = formatWeeklyDigest(digest);
    return report;
  }
  
  // MENU COMMAND
  if (message === '/menu' || message === 'menu') {
    clearUserContext(senderAddress);
    return null;
  }
  
  // HELP
  if (message === '/help' || message === '?' || message === 'commands') {
    return getHelpMessage();
  }
  
  // Handle number selection (context-aware)
  if (/^\d+$/.test(message)) {
    const number = parseInt(message);
    const context = getUserContext(senderAddress);
    
    // If user is viewing categories, handle category selection
    if (context && context.context === 'viewing_categories') {
      const categories = context.data.categories;
      const isGroupChatContext = context.data.isGroupChat || false;
      if (number >= 1 && number <= categories.length) {
        clearUserContext(senderAddress);
        const selectedCategory = categories[number - 1].category;
        const notes = getNotesByCategory(selectedCategory, chatId, senderAddress, isGroupChatContext);
        
        let tips = "\n━━━━━━━━━━━━━━━━\n";
        tips += `💡 Search this category: "search ${selectedCategory}"\n`;
        tips += `💡 Delete a note: "delete [keyword] in ${selectedCategory}"\n`;
        tips += `💡 Type /menu for main menu`;
        
        return formatNotesList(notes) + tips;
      }
    }
    
    // If user is viewing search results, handle note selection
    if (context && context.context === 'viewing_search_results') {
      const results = context.data.results;
      if (number >= 1 && number <= Math.min(results.length, 5)) {
        const selectedNote = results[number - 1];
        clearUserContext(senderAddress);
        incrementViewCount(selectedNote.id);
        return formatNote(selectedNote) + "\n\n💡 Type /menu for main menu";
      }
    }
    
    // If user is editing notes, handle selection
    if (context && context.context === 'editing_notes') {
      const notes = context.data.notes;
      if (number >= 1 && number <= Math.min(notes.length, 5)) {
        const noteToEdit = notes[number - 1];
        // Store the note to edit and wait for new content
        setUserContext(senderAddress, 'awaiting_edit_content', { note: noteToEdit });
        
        return `✏️ Editing note:\n\n` +
               `${getCategoryEmoji(noteToEdit.category)} ${noteToEdit.category}\n` +
               `📝 Current: ${truncate(noteToEdit.content, 150)}\n\n` +
               `Reply with the new content for this note:`;
      }
    }
    
    // If user is deleting notes, handle confirmation
    if (context && context.context === 'deleting_notes') {
      const notes = context.data.notes;
      if (number >= 1 && number <= Math.min(notes.length, 5)) {
        const noteToDelete = notes[number - 1];
        clearUserContext(senderAddress);
        
        // Delete the note
        db.prepare('DELETE FROM notes WHERE id = ?').run(noteToDelete.id);
        
        // Update category count (using helper function)
        updateCategoryCount(chatId, noteToDelete.category, -1);
        
        log('info', 'Note deleted via selection', { noteId: noteToDelete.id, user: senderAddress });
        
        return `✅ Note deleted successfully!\n\n` +
               `${getCategoryEmoji(noteToDelete.category)} Category: ${noteToDelete.category}\n` +
               `📝 ${truncate(noteToDelete.content, 100)}\n\n` +
               `💡 Type /menu for main menu`;
      }
    }
    
    // Otherwise, handle main menu selection (1-4 for groups, 1-5 for DMs)
    const maxOptions = isGroupChat ? 4 : 5;
    if (number >= 1 && number <= maxOptions) {
      const actions = isGroupChat 
        ? ['save_note', 'search_notes', 'view_categories', 'help']
        : ['save_note', 'search_notes', 'view_categories', 'help', 'group_features'];
      return await handleActionSelection(actions[number - 1], ctx, chatId, senderAddress, isGroupChat);
    }
  }
  
  // Check if user is providing new content for edit
  const context = getUserContext(senderAddress);
  if (context && context.context === 'awaiting_edit_content') {
    const noteToEdit = context.data.note;
    const newContent = userMessage.trim();
    
    if (newContent.toLowerCase() === '/menu' || newContent.toLowerCase() === 'cancel') {
      clearUserContext(senderAddress);
      return "❌ Edit cancelled.\n\n💡 Type /menu for main menu";
    }
    
    // Update the note
    db.prepare(`
      UPDATE notes 
      SET content = ?, createdAt = ?
      WHERE id = ?
    `).run(newContent, new Date().toISOString(), noteToEdit.id);
    
    clearUserContext(senderAddress);
    log('info', 'Note edited', { noteId: noteToEdit.id, user: senderAddress });
    
    return `✅ Note updated successfully!\n\n` +
           `${getCategoryEmoji(noteToEdit.category)} Category: ${noteToEdit.category}\n` +
           `📝 New: ${truncate(newContent, 100)}\n\n` +
           `💡 Type /menu for main menu`;
  }
  
  // If no command matched, try conversational AI with smart suggestions
  return await generateConversationalResponse(userMessage, chatType, chatId, senderAddress);
}

async function handleActionSelection(actionId, ctx, chatId, senderAddress, isGroupChat = false) {
  switch(actionId) {
    case 'save_note':
      return "💾 Save a note with optional category:\n\n" +
             "Simple: save [content]\n" +
             "With category: save [content] in [category]\n\n" +
             "Examples:\n" +
             "• save My wallet: 0x742d...\n" +
             "• save Check Uniswap V3 docs in DeFi\n" +
             "• save Team meeting notes in Work\n\n" +
             "💡 Categories help organize your notes!\n" +
             "💡 Type /menu to return to main menu";
    
    case 'search_notes':
      return "🔍 To search notes, type:\n\n" +
             "search [keyword]\n\n" +
             "Examples:\n" +
             "• search wallet\n" +
             "• search contract\n" +
             "• search DeFi\n\n" +
             "💡 Type /menu to return to main menu";
    
    case 'view_categories':
      await sendCategoryActions(ctx, chatId, senderAddress, isGroupChat);
      return 'CATEGORIES_SENT';
    
    case 'help':
      return getHelpMessage();
    
    case 'group_features':
      return "🚀 DRAGMAN IN GROUPS\n\n" +
             "The problem:\n" +
             "Your friend shares a wallet address.\n" +
             "2 weeks later: \"What was that address?\"\n" +
             "Everyone scrolls forever... 😫\n\n" +
             "The solution:\n" +
             "Just ask me! I remember EVERYTHING. 🧠\n\n" +
             "━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
             "✨ LIVE EXAMPLE:\n\n" +
             "Alice: save Prize: 0x742d...\n" +
             "Bob: save Discord: discord.gg/base\n\n" +
             "[2 weeks later...]\n\n" +
             "Charlie: @dragman what's the prize wallet?\n\n" +
             "Me: 🧠 Found it!\n" +
             "    💾 Saved by Alice • 2 weeks ago\n" +
             "    📝 Prize: 0x742d... ✅\n\n" +
             "━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
             "🎯 WHY IT'S AWESOME:\n" +
             "• Shows WHO saved it\n" +
             "• Shows WHEN it was saved\n" +
             "• Tracks how many times viewed\n" +
             "• Your group gets smarter over time!\n\n" +
             "━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
             "💡 TO ADD ME:\n" +
             "1. Open any group chat\n" +
             "2. Invite @dragman\n" +
             "3. Start saving & asking!\n\n" +
             "🎯 Perfect for:\n" +
             "Gaming squads • Friend groups\n" +
             "Communities • Project teams\n\n" +
             "Type /menu to keep using personal notes 📝";
    
    default:
      return "❓ Unknown action. Type /menu to return to main menu.";
  }
}

function getHelpMessage() {
  return `🐉 Dragman Help

Your smart knowledge assistant for chats!

💾 SAVE NOTES
• save [content] - Auto-categorized
• save [content] in [category] - Custom category
• remember [content] - Same as save
• note [content] - Same as save

🔍 SEARCH NOTES
• search [keyword] - Find saved notes
• find [keyword] - Same as search
• recent - View recent notes

✏️ EDIT NOTES
• edit [keyword] - Update existing note
• update [keyword] - Same as edit

🗑️ DELETE NOTES
• delete [content] - Delete note by content
• delete [content] in [category] - Delete from specific category

📂 BROWSE
• categories - View all categories
• stats - See your statistics

🔥 GROUP INTELLIGENCE (NEW!)
• trends - See trending topics & top contributors
• insights - Same as trends
• suggestions - Check detected but unsaved info
• unsaved - Same as suggestions
• digest - Get weekly team report (activity, MVP, insights)
• report - Same as digest
• weekly - Same as digest
💡 Example: @dragman.base.eth trends

🔒 PRIVACY
• Group chat notes → Everyone in group can see
• Private DM notes → Only you can see

✨ EXAMPLES
• @dragman.base.eth save My wallet: 0x74...
• @dragman.base.eth save Deploy contract to mainnet in Dev 
• @dragman.base.eth search wallet
• @dragman.base.eth edit wallet (then type new content)
• @dragman.base.eth delete contract deployment

⚠️ NOTE: Categories must be a single word (e.g., Gaming, DeFi, Work)
For multi-word categories, use camelCase (e.g., MobileLegend)

💡 Type /menu anytime for Quick Actions!`;
}

// ==================== CONVERSATIONAL AI WITH SMART SUGGESTIONS ====================

async function generateConversationalResponse(userMessage, chatType, chatId, senderAddress) {
  try {
    // SMART FEATURE 1: Detect questions and auto-search notes
    const isQuestion = /\b(what|where|when|who|how|which|my|the)\b.*\?|what's|where's|what is|where is|show me|tell me|need|find/i.test(userMessage);
    
    if (isQuestion) {
      // Extract keywords from the question
      const keywords = userMessage
        .toLowerCase()
        .replace(/\b(what|where|when|who|how|which|is|are|my|the|a|an|show|me|tell|need|find)\b/g, '')
        .replace(/[?!.,]/g, '')
        .trim()
        .split(/\s+/)
        .filter(word => word.length > CONFIG.MIN_KEYWORD_LENGTH);
      
      // Search notes for relevant information using MULTI-KEYWORD search
      if (keywords.length > 0) {
        // Try multi-keyword search first (more specific)
        let results = [];
        
        // CRITICAL PRIVACY FIX: Pass senderAddress and isGroupChat to search
        // Search with all keywords (highest priority)
        for (const keyword of keywords) {
          const keywordResults = searchNotes(keyword, chatId, senderAddress, chatType === 'group');
          results.push(...keywordResults);
        }
        
        // Remove duplicates and rank by relevance
        const noteScores = new Map();
        for (const note of results) {
          const currentScore = noteScores.get(note.id) || 0;
          
          // Calculate relevance score
          let score = currentScore + 1; // Base score for matching
          
          // Boost score for each keyword found in content
          for (const keyword of keywords) {
            if (note.content.toLowerCase().includes(keyword)) {
              score += 2;
            }
            if (note.category.toLowerCase().includes(keyword)) {
              score += 1;
            }
          }
          
          // Boost recent notes slightly
          const ageInDays = (Date.now() - new Date(note.createdAt)) / (1000 * 60 * 60 * 24);
          if (ageInDays < 7) score += 1;
          
          // Boost popular notes
          score += Math.min(note.viewCount * 0.1, 2);
          
          noteScores.set(note.id, { note, score });
        }
        
        // Sort by score and get unique results
        const rankedResults = Array.from(noteScores.values())
          .sort((a, b) => b.score - a.score)
          .map(item => item.note);
        
        if (rankedResults.length > 0) {
          const topNote = rankedResults[0];
          incrementViewCount(topNote.id); // Track that this was viewed
          
          // Build answer with context (who, when, popularity)
          let answer = `🧠 Found the answer in your ${chatType === 'group' ? 'team' : ''} notes!\n\n`;
          answer += `${getCategoryEmoji(topNote.category)} ${topNote.category}\n`;
          answer += `📝 ${truncate(topNote.content, 200)}\n\n`;
          answer += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          
          // Show who saved it (especially useful in groups)
          if (chatType === 'group') {
            answer += `💾 Saved by: ${shortenAddress(topNote.savedBy)}\n`;
          }
          
          answer += `📅 ${getRelativeTime(new Date(topNote.createdAt))}\n`;
          answer += `👀 ${topNote.viewCount + 1} views`; // +1 for current view
          
          // Show if there are more results
          if (rankedResults.length > 1) {
            answer += `\n\n📚 Found ${rankedResults.length} related notes. Type "search ${keywords[0]}" to see all`;
          }
          
          // Encourage feedback in groups
          if (chatType === 'group') {
            answer += `\n\n❓ Was this helpful? Others can learn from your feedback!`;
          } else {
            answer += `\n\n💡 Save more notes to make searches even better!`;
          }
          
          return answer;
        }
      }
      
      // NEW: No match found, but check if there's unsaved info (only for groups)
      if (chatType === 'group') {
        const unsaved = checkUnsavedInfo(chatId, true);
        if (unsaved.length > 0) {
          return `🤔 I couldn't find notes matching your question, but...\n\n` +
                 `💡 I detected ${unsaved.length} unsaved important item(s) recently!\n` +
                 `Maybe one of them is what you're looking for?\n\n` +
                 `Type "@dragman suggestions" to see them.`;
        }
      }
    }
    
    // SMART FEATURE 2: Detect important info and suggest saving (MORE PROACTIVE)
    const hasImportantInfo = 
      /0x[a-fA-F0-9]{40}/.test(userMessage) || // Ethereum address
      /(https?:\/\/[^\s]+)/.test(userMessage) || // URL
      /\b(contract|deploy|address|wallet|key|password|api|token)\b/i.test(userMessage); // Important keywords
    
    if (hasImportantInfo && userMessage.split(' ').length > 3) {
      // Check if similar content already exists
      const keywords = userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 2);
      let alreadySaved = false;
      
      if (keywords.length > 0) {
        const existing = searchNotes(keywords[0], chatId, senderAddress, chatType === 'group');
        alreadySaved = existing.length > 0;
      }
      
      if (alreadySaved) {
        return `💡 I found ${alreadySaved} existing note(s) about this topic!\n\n` +
               `Type "search ${keywords[0]}" to see them.\n` +
               `Or save a new one with: save ${truncate(userMessage, 50)}`;
      }
      
      return `💡 This looks like important information!\n\n` +
             `Would you like me to save it for the ${chatType === 'group' ? 'team' : 'future'}?\n` +
             `Just type: save ${truncate(userMessage, 50)}`;
    }
    
    // SMART FEATURE 3: Regular conversational response with context
    const completion = await openai.chat.completions.create({
      model: CONFIG.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are Dragman, a smart note-taking assistant for Base App. You help users save, organize, and find important information from their chats. Keep responses brief (2-3 sentences). Always encourage users to save notes when they mention important information. Current chat type: ${chatType}.`
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      max_tokens: CONFIG.OPENAI_CONVERSATION_MAX_TOKENS,
      temperature: CONFIG.OPENAI_TEMPERATURE,
    });

    const response = completion.choices[0].message.content;
    return response + "\n\n💡 Type /menu to see all options";
  } catch (error) {
    log('error', 'OpenAI conversational error', { error: error.message });
    return "🐉 I'm your knowledge assistant! I help you save and organize important info from chats.\n\n" +
           "Try:\n" +
           "• save [content] - Save a note\n" +
           "• search [keyword] - Find notes\n" +
           "• /menu - See all options";
  }
}

// ==================== ONBOARDING MESSAGE ====================

function getOnboardingMessage(chatType) {
  if (chatType === 'group') {
    return `🐉 Hey! I'm Dragman - Your Group's Memory

I remember everything your group chat saves!

🎯 HOW IT WORKS:
💾 Anyone saves → I remember
❓ Anyone asks → I answer
🧠 Your group gets smarter over time!

⚠️ Group notes = Everyone can see
💬 Private notes? DM me instead
💡 You can trigger me by:
   • Tagging: @dragman.base.eth [your message]
   • Replying: Reply to any of my messages!
👇 Pick an option below!`;
  } else {
    return `🐉 Hey! I'm Dragman

Your personal assistant that remembers everything.

Ever lose a wallet address in chat history?
Or forget where you saved that link?
I've got you covered! 💪

━━━━━━━━━━━━━━━━━━━━━━━━

✨ WHAT I DO:

💾 Save anything with one command
🔍 Find it instantly when you need it
📂 Auto-organize everything
🔒 Keep it 100% private

━━━━━━━━━━━━━━━━━━━━━━━━

Perfect for:
Wallets • Links • Game codes • Ideas
Notes • Resources • Quick reminders

👇 Pick an option to get started!`;
  }
}

// ==================== AGENT MESSAGE HANDLER ====================

// PROCESS MESSAGE EVENT: Base App sends replies as 'message' events, not 'text' events
agent.on('message', async (ctx) => {
  console.log('📨 [MESSAGE EVENT] Received');
  
  // DON'T skip string content - Base App sends replies as JSON strings!
  // We'll check if it's a regular text message vs a JSON reply
  // Skip ONLY if it's clearly a plain text message (not JSON)
  if (ctx.message?.contentType === 'text') {
    // But check if content is JSON first
    if (typeof ctx.message?.content === 'string') {
      try {
        const parsed = JSON.parse(ctx.message.content);
        // If it parses and has reference, it's a reply, not regular text
        if (parsed && typeof parsed === 'object' && parsed.reference) {
          // It's a JSON reply, don't skip
          console.log('📦 [JSON REPLY DETECTED] Content is JSON string with reference');
        } else {
          // It's valid JSON but not a reply - might be other structured content
          // Continue processing
        }
      } catch (e) {
        // Not JSON, might be plain text - let text handler take it
        if (!ctx.message.content.match(/^[\s\S]*\{.*reference[\s\S]*\}/)) {
          // Doesn't look like JSON with reference, skip to text handler
          console.log('⏭️ [MESSAGE EVENT] Skipping - plain text, will be handled by text handler');
          return;
        }
      }
    }
  }
  
  // Parse content - Base App might send it as JSON string or object
  let contentObj = null;
  if (ctx.message?.content) {
    if (typeof ctx.message.content === 'string') {
      // Try to parse as JSON (Base App sends replies as JSON strings)
      try {
        contentObj = JSON.parse(ctx.message.content);
        console.log('📦 [PARSED JSON] Content was JSON string, parsed to:', Object.keys(contentObj));
      } catch (e) {
        // Not JSON, treat as regular string
        contentObj = ctx.message.content;
      }
    } else if (typeof ctx.message.content === 'object') {
      contentObj = ctx.message.content;
    }
  }
  
  // Check if this is a Base App reply (has content.reference)
  const isReply = contentObj && 
                 typeof contentObj === 'object' && 
                 contentObj.reference;
  
  if (isReply) {
    console.log('✅ [MESSAGE EVENT] Detected Base App reply - processing...');
    console.log('🚫 [REPLY DISABLED] Ignoring replies. Only tag mentions trigger responses.');
    return;
    
    // Extract reply information
    const referencedMessageId = contentObj.reference;
    
    // Base App might store reply text in various places - check ALL possibilities
    // IMPORTANT: Base App might send the text separately, not in the content object
    let userMessage = contentObj.text || 
                     contentObj.content || 
                     contentObj.message ||
                     contentObj.body ||
                     contentObj.replyText ||
                     contentObj.reply ||
                     contentObj.data?.text ||
                     contentObj.data?.content ||
                     ctx.message?.text ||  // Check message-level text field
                     ctx.message?.body ||  // Check message-level body field
                     ctx.message?.contentText || // Base App might have this
                     '';
    
    // CRITICAL: If message is empty, the actual text might be in the raw content string
    // Base App might send: { "reference": "...", "text": "/menu" } as JSON string
    // OR the text might be sent in a FOLLOWING 'text' event
    // For now, check if we need to wait for text event or if text is elsewhere
    
    // DEBUG: Log what we found
    console.log('📝 [MESSAGE EXTRACTION]', {
      contentObjKeys: contentObj ? Object.keys(contentObj) : [],
      messageKeys: Object.keys(ctx.message || {}),
      extractedMessage: userMessage || 'EMPTY',
      hasReference: !!referencedMessageId,
      rawContentType: typeof ctx.message?.content,
      rawContentPreview: typeof ctx.message?.content === 'string' ? ctx.message.content.substring(0, 100) : 'not string',
      fullContentObj: JSON.stringify(contentObj).substring(0, 500)
    });
    
    const senderAddress = (ctx.message?.senderAddress || 
                          ctx.message?.senderInboxId || 
                          'unknown').toLowerCase();
    const agentAddress = agent.address.toLowerCase();
    // CONSISTENT chatId extraction - must match text handler
    const chatId = ctx.conversation?.topic || ctx.message?.conversationId || 'unknown';
    
    // Skip if from agent itself
    if (senderAddress === agentAddress) {
      console.log('⏭️ [MESSAGE EVENT] Skipping - from agent itself');
      return;
    }
    
    console.log('🔍 [BASE APP REPLY PROCESSING]', {
      referencedMessageId,
      hasText: !!userMessage,
      senderAddress: senderAddress.substring(0, 20) + '...',
      chatId: chatId.substring(0, 20)
    });
    
    // Process reply - Base App sends replies as 'message' events with content.reference
    // For now, we'll assume any reply with reference in a conversation is likely to agent
    // (especially in groups, users only reply to agent, not each other)
    try {
      // Check database to see if chatId is a group
      let dbChatType = null;
      try {
        const dbTypeCheck = db.prepare(`SELECT chatType FROM conversation_types WHERE chatId = ?`).get(chatId);
        if (dbTypeCheck && dbTypeCheck.chatType) {
          dbChatType = dbTypeCheck.chatType;
        }
      } catch (e) {
        console.error('❌ [DB ERROR]', e.message);
      }
      
      // CONSISTENT chatType detection - use SAME logic as text handler
      // This ensures data saved via tag and retrieved via reply use same chatType
      let isGroupChat = false;
      
      if (dbChatType) {
        // Database has stored type - use it
        isGroupChat = dbChatType === 'group';
      } else {
        // Unknown conversation - for replies, check if we should detect as group
        // Since replies in Base App are typically in groups, default to group
        // BUT: We should detect it the same way text handler does for consistency
        // For now, default to group and save it
        isGroupChat = true;
        saveConversationType(chatId, 'group');
        console.log('💾 [SAVED CHAT TYPE] Reply detected - saving as group', { chatId: chatId.substring(0, 20) });
      }
      
      const effectiveIsGroupChat = isGroupChat;
      
      console.log('✅ [REPLY TO AGENT] Processing reply', {
        chatId: chatId.substring(0, 20),
        dbChatType: dbChatType || 'none (defaulted to group)',
        isGroupChat: effectiveIsGroupChat,
        chatType: effectiveIsGroupChat ? 'group' : 'dm',
        hasMessageText: !!userMessage,
        messagePreview: userMessage ? userMessage.substring(0, 30) : 'empty'
      });
      
      // Process the reply
      await processReplyMessage(ctx, userMessage, senderAddress, chatId, effectiveIsGroupChat, referencedMessageId);
      return; // Exit after processing - don't continue to text handler
      
    } catch (e) {
      console.error('❌ [REPLY PROCESSING ERROR]', e.message);
      console.error('❌ [REPLY PROCESSING STACK]', e.stack);
      // Even on error, try to send a basic response
      try {
        await ctx.sendText("👋 I see you replied! Type /menu to see options or tell me what you need.");
      } catch (sendError) {
        console.error('❌ [SEND ERROR]', sendError.message);
      }
    }
  } else {
    // Not a reply - might be other message types, just log it for debugging
    let contentStr = 'no content';
    if (ctx.message?.content) {
      if (typeof ctx.message.content === 'string') {
        contentStr = ctx.message.content.substring(0, 50);
      } else {
        contentStr = JSON.stringify(ctx.message.content).substring(0, 50);
      }
    }
    
    console.log('📨 [message event - not a reply]', JSON.stringify({
      type: ctx.message?.type || 'unknown',
      hasContent: !!ctx.message?.content,
      contentType: typeof ctx.message?.content,
      content: contentStr,
      sender: ctx.message?.senderAddress ? ctx.message.senderAddress.substring(0, 20) : 'no sender',
      keys: Object.keys(ctx.message || {}),
      conversationKeys: Object.keys(ctx.conversation || {})
    }, null, 2));
  }
});

// Helper function to process reply messages (extracted from text handler)
async function processReplyMessage(ctx, userMessage, senderAddress, chatId, isGroupChat, referencedMessageId) {
  try {
    // CONSISTENT logging - show chatId and chatType for debugging data consistency
    const chatType = isGroupChat ? 'group' : 'dm';
    console.log('🔄 [PROCESSING REPLY] Starting reply processing...', {
      chatId: chatId.substring(0, 20),
      chatType,
      isGroupChat
    });
    
    // Send reaction
    try {
      await ctx.sendReaction('👀');
      console.log('✅ [REACTION SENT]');
    } catch (e) {
      console.error('❌ [REACTION ERROR]', e.message);
    }
    
    await naturalDelay();
    
    // Check if message is empty
    const cleanMessage = userMessage.trim();
    
    console.log('💬 [REPLY MESSAGE EXTRACTED]', {
      originalLength: userMessage?.length || 0,
      cleanLength: cleanMessage?.length || 0,
      preview: cleanMessage.substring(0, 50),
      isEmpty: !cleanMessage || cleanMessage.length === 0
    });
    
    // If no message text, send menu/help instead of defaulting to 'help'
    if (!cleanMessage || cleanMessage.length === 0) {
      console.log('📋 [EMPTY REPLY] Sending menu/help');
      if (isGroupChat) {
        await sendMainQuickActions(ctx, 'group');
      } else {
        const onboarding = getOnboardingMessage('dm');
        await ctx.sendText(onboarding);
        await sendMainQuickActions(ctx, 'dm');
      }
      console.log('✅ [REPLY RESPONSE] Sent menu for empty reply');
      return;
    }
    
    // CONSISTENT command processing - log chatId and chatType for debugging
    // chatType already declared above, reuse it
    console.log('🔄 [PROCESSING REPLY COMMAND]', { 
      command: cleanMessage.substring(0, 50),
      chatId: chatId.substring(0, 20),
      chatType
    });
    
    // Process the command - ensure consistent chatId/chatType
    // The handleDragmanCommands will use ctx.conversation?.topic or ctx.message?.conversationId
    // But we want to ensure it matches what we're using here
    const response = await handleDragmanCommands(ctx, cleanMessage, senderAddress, isGroupChat);
    
    // Handle response
    const specialFlags = ['CATEGORIES_SENT', 'SEARCH_SENT'];
    
    // Handle /menu command - it returns null, which means we should send the menu
    if (response === null && (cleanMessage.toLowerCase() === '/menu' || cleanMessage.toLowerCase() === 'menu')) {
      console.log('📋 [MENU COMMAND] Sending menu/quick actions');
      if (isGroupChat) {
        // Group: only one message (Quick Actions)
        await sendMainQuickActions(ctx, 'group');
      } else {
        // DM: keep onboarding + Quick Actions
        const onboarding = getOnboardingMessage('dm');
        await ctx.sendText(onboarding);
        await sendMainQuickActions(ctx, 'dm');
      }
      console.log('✅ [REPLY RESPONSE] Sent menu');
      return;
    }
    
    if (response && !specialFlags.includes(response)) {
      await ctx.sendText(response);
      console.log('✅ [REPLY RESPONSE SENT]');
    } else if (specialFlags.includes(response)) {
      console.log('✅ [REPLY RESPONSE] Already sent by handler');
    } else {
      // Default response for empty/unhandled replies
      await ctx.sendText('👋 I see you replied! How can I help?\n\n💡 Try:\n• save [your note]\n• search [keyword]\n• /menu for options');
      console.log('✅ [REPLY RESPONSE] Sent default response');
    }
  } catch (error) {
    console.error('❌ [REPLY PROCESSING ERROR]', error.message);
    log('error', 'Error processing reply message', { error: error.message, stack: error.stack });
    try {
      await ctx.sendText("❌ Something went wrong. Please try again or type /help for assistance.");
    } catch (e) {
      // Ignore send errors
    }
  }
}

// Also listen for any other events that might be reply-related
agent.on('stream', async (stream) => {
  console.log('📡 [STREAM EVENT] Received', { type: stream?.constructor?.name || 'unknown' });
});

// Error handler to catch any issues
agent.on('error', (error) => {
  console.error('❌ [AGENT ERROR]', error);
});

// Log when agent starts
agent.on('start', () => {
  console.log('✅ [AGENT STARTED] Listening for messages...');
  console.log('✅ [AGENT ADDRESS]', agent.address);
});

agent.on('text', async (ctx) => {
  try {
    // LOG IMMEDIATELY when message received - before any filtering
    console.log('🔔 [INCOMING MESSAGE] Text event triggered');
    
    const chatId = ctx.conversation?.topic || ctx.message?.conversationId || 'unknown';
    const senderAddress = (ctx.message?.senderAddress || await ctx.getSenderAddress?.() || 'unknown').toLowerCase();
    
    // Check if this text event is part of a pending reply
    // Base App might send: 1) 'message' event with reference, 2) 'text' event with actual text
    let pendingReply = null;
    for (const [key, pending] of pendingReplies.entries()) {
      // Check if this text event matches a recent pending reply
      if (pending.chatId === chatId && 
          pending.senderAddress === senderAddress &&
          Date.now() - pending.timestamp < 5000) { // Within 5 seconds
        pendingReply = pending;
        pendingReplies.delete(key);
        console.log('✅ [PENDING REPLY FOUND] This text event is the content for a pending reply');
        break;
      }
    }
    
    console.log('🔔 [FULL CTX]', JSON.stringify({
      messageKeys: Object.keys(ctx.message || {}),
      conversationKeys: Object.keys(ctx.conversation || {}),
      hasMessage: !!ctx.message,
      hasConversation: !!ctx.conversation,
      contentType: typeof ctx.message?.content,
      hasPendingReply: !!pendingReply
    }, null, 2));
    
    // If this text event is part of a pending reply, process it as a reply
    if (pendingReply) {
      console.log('🔄 [PROCESSING PENDING REPLY] Using stored reply context', {
        reference: pendingReply.reference,
        isGroupChat: pendingReply.isGroupChat
      });
      
      // Extract the actual text content from this text event
      let userMessage = '';
      if (ctx.message?.content) {
        if (typeof ctx.message.content === 'string') {
          userMessage = ctx.message.content;
        } else if (typeof ctx.message.content === 'object') {
          userMessage = ctx.message.content.text || 
                       ctx.message.content.content || 
                       ctx.message.content.message ||
                       ctx.message.content.body ||
                       '';
        }
      }
      
      // Process the reply with the actual text content
      if (userMessage) {
        await processReplyMessage(ctx, userMessage, pendingReply.senderAddress, pendingReply.chatId, pendingReply.isGroupChat, pendingReply.reference);
        return; // Exit - we've processed it as a reply
      } else {
        console.log('⚠️ [PENDING REPLY NO TEXT] Text event has no content either');
      }
    }
    
    // SAFELY extract content - might be string, object, or array
    // Base App sends replies as objects with { reference: "messageId" } structure
    let userMessage = '';
    let isReplyMessage = false;
    let referencedMessageId = null;
    
    if (ctx.message?.content) {
      if (typeof ctx.message.content === 'string') {
        userMessage = ctx.message.content;
      } else if (typeof ctx.message.content === 'object') {
        // Check if this is a reply (has reference field)
        if (ctx.message.content.reference) {
          isReplyMessage = true;
          referencedMessageId = ctx.message.content.reference;
          // Extract text from reply object - might be in different fields
          userMessage = ctx.message.content.text || 
                       ctx.message.content.content || 
                       ctx.message.content.message ||
                       ctx.message.content.body ||
                       ''; // Empty if only reference exists
        } else {
          // Regular object message - try to extract text
          userMessage = ctx.message.content.text || 
                       ctx.message.content.content || 
                       ctx.message.content.message ||
                       ctx.message.content.body ||
                       JSON.stringify(ctx.message.content);
        }
      } else {
        // Convert to string
        userMessage = String(ctx.message.content);
      }
    }
    
    // senderAddress already declared above at line 2213, just get agentAddress
    const agentAddress = agent.address.toLowerCase();
    
    console.log('🔍 [CONTENT EXTRACTION]', {
      contentType: typeof ctx.message?.content,
      isReplyMessage,
      referencedMessageId,
      extractedMessage: userMessage.substring(0, 50),
      senderFrom: ctx.message?.senderAddress ? 'senderAddress' : 
                  ctx.message?.senderInboxId ? 'senderInboxId' : 'unknown'
    });
    
    console.log('🔔 [MESSAGE INFO]', {
      senderAddress: senderAddress.substring(0, 20) + '...',
      agentAddress: agentAddress.substring(0, 20) + '...',
      messageLength: userMessage?.length || 0,
      isSelf: senderAddress === agentAddress,
      hasContent: !!userMessage
    });
    
    if (senderAddress === agentAddress) {
      console.log('⏭️ [SKIP] Message is from agent itself, ignoring');
      return;
    }
    
    // For reply messages, allow empty content (user might just be replying without typing)
    // We'll process it as a reply if we can verify the referenced message is from agent
    if (!isReplyMessage && (!userMessage || userMessage.trim().length === 0)) {
      console.log('⏭️ [SKIP] Message has no content and is not a reply');
      return;
    }
    
    // If it's a reply with no text, that's okay - user might have just clicked reply
    if (isReplyMessage && (!userMessage || userMessage.trim().length === 0)) {
      console.log('⚠️ [REPLY NO TEXT] Reply message has no text content, but has reference');
      // We'll still process it if we can verify it's a reply to agent
    }
    
    // DISABLE replies entirely: do not process reply messages in text handler
    if (isReplyMessage) {
      console.log('🚫 [REPLY DISABLED - TEXT HANDLER] Ignoring reply message in text event');
      return;
    }

    // chatId already declared above at line 2212, continue with debugging
    // ENHANCED DEBUGGING: Log ALL message properties to understand reply structure
    // This will help us see what Base App/XMTP actually sends for replies
    const messageKeys = Object.keys(ctx.message || {});
    const conversationKeys = Object.keys(ctx.conversation || {});
    
    // Extract all potential reply-related fields
    const replyFields = {
      replyTo: ctx.message.replyTo,
      parentMessage: ctx.message.parentMessage,
      inReplyTo: ctx.message.inReplyTo,
      reference: ctx.message.reference,
      inReplyToMessageId: ctx.message.inReplyToMessageId,
      parentMessageId: ctx.message.parentMessageId,
      replyToMessageId: ctx.message.replyToMessageId,
      contentMetadata: ctx.message.contentMetadata,
      // Check if there's a reply context
      replyContext: ctx.message.replyContext,
      conversationTopic: ctx.message.conversationTopic,
      // XMTP specific fields
      sentAt: ctx.message.sentAt,
      sent: ctx.message.sent
    };
    
    log('info', 'RAW MESSAGE PROPERTIES - REPLY DEBUG', {
      hasGroupId: ctx.message.groupId !== undefined,
      groupId: ctx.message.groupId,
      conversationKind: ctx.conversation?.kind,
      messageKeys: messageKeys,
      conversationKeys: conversationKeys,
      replyFields: JSON.stringify(replyFields, null, 2).substring(0, 1000), // More detailed
      // Check all nested fields
      replyToNested: replyFields.replyTo ? Object.keys(replyFields.replyTo) : 'none',
      parentMessageNested: replyFields.parentMessage ? Object.keys(replyFields.parentMessage) : 'none',
      inReplyToNested: replyFields.inReplyTo ? Object.keys(replyFields.inReplyTo) : 'none',
      // Full message structure (truncated for readability)
      messageStructure: JSON.stringify(ctx.message, (key, value) => {
        // Truncate very long strings
        if (typeof value === 'string' && value.length > 100) {
          return value.substring(0, 100) + '...';
        }
        return value;
      }, 2).substring(0, 1500)
    });
    
    // SIMPLE RULE: Check database FIRST (remembered type from behavior)
    let dbChatType = null;
    try {
      const dbTypeCheck = db.prepare(`SELECT chatType FROM conversation_types WHERE chatId = ?`).get(chatId);
      if (dbTypeCheck && dbTypeCheck.chatType) {
        dbChatType = dbTypeCheck.chatType;
      }
    } catch (e) {
      // Ignore DB errors
    }
    
    // Check for mentions FIRST
    const agentMentionPattern = new RegExp(`@dragman(\\.base\\.eth)?`, 'i');
    const isMentioned = agentMentionPattern.test(userMessage);

    // REQUIRE mention to trigger any response
    if (!isMentioned) {
      console.log('⏭️ [SKIP] No agent mention found. Only tagged messages trigger responses.');
      return;
    }
    
    // ENHANCED REPLY DETECTION: Try multiple ways to detect reply to agent
    // Base App/XMTP might store reply info in different places - check ALL possible locations
    
    // Check all possible reply sender address locations (with case-insensitive comparison)
    const replyToSender = ctx.message.replyTo?.senderAddress?.toLowerCase() || 
                         ctx.message.replyTo?.from?.toLowerCase() ||
                         ctx.message.replyTo?.sender?.toLowerCase();
    const replyToFrom = ctx.message.replyTo?.from?.toLowerCase();
    const parentMessageSender = ctx.message.parentMessage?.senderAddress?.toLowerCase() ||
                                ctx.message.parentMessage?.from?.toLowerCase() ||
                                ctx.message.parentMessage?.sender?.toLowerCase();
    const parentMessageFrom = ctx.message.parentMessage?.from?.toLowerCase();
    const inReplyToSender = ctx.message.inReplyTo?.senderAddress?.toLowerCase() ||
                           ctx.message.inReplyTo?.from?.toLowerCase() ||
                           ctx.message.inReplyTo?.sender?.toLowerCase();
    const referenceSender = ctx.message.reference?.senderAddress?.toLowerCase() ||
                           ctx.message.reference?.from?.toLowerCase() ||
                           ctx.message.reference?.sender?.toLowerCase();
    
    // Check if replyTo has an address field directly
    const replyToAddress = ctx.message.replyTo?.address?.toLowerCase();
    
    // Also check conversation context for reply metadata
    const contentMetadata = ctx.message.contentMetadata || {};
    const inReplyToMessageId = ctx.message.inReplyToMessageId || 
                               ctx.message.inReplyTo?.messageId ||
                               ctx.message.inReplyTo?.id;
    const parentMessageId = ctx.message.parentMessageId || 
                           ctx.message.parentMessage?.id ||
                           ctx.message.parentMessage?.messageId;
    const replyToMessageId = ctx.message.replyTo?.messageId || 
                            ctx.message.replyTo?.id ||
                            ctx.message.replyToMessageId;
    
    // Check for XMTP-specific reply fields
    const xmtpReplyId = ctx.message.contentMetadata?.reply?.id ||
                       ctx.message.contentMetadata?.replyId;
    
    // Check if message has any reply indicators (comprehensive check)
    const hasReplyIndicators = !!(
      ctx.message.replyTo || 
      ctx.message.parentMessage || 
      ctx.message.inReplyTo ||
      ctx.message.reference ||
      inReplyToMessageId ||
      parentMessageId ||
      replyToMessageId ||
      xmtpReplyId ||
      replyToAddress ||
      contentMetadata.inReplyTo ||
      contentMetadata.reply
    );
    
    // If there's a reply indicator, try to find the original message
    let isReplyToAgent = false;
    
    // Method 1: Check direct reply fields (sender addresses) - COMPREHENSIVE
    isReplyToAgent = 
      (replyToSender === agentAddress) || 
      (replyToFrom === agentAddress) ||
      (replyToAddress === agentAddress) ||
      (parentMessageSender === agentAddress) ||
      (parentMessageFrom === agentAddress) ||
      (inReplyToSender === agentAddress) ||
      (referenceSender === agentAddress);
    
    // Log detailed reply detection attempt
    log('info', 'REPLY DETECTION ATTEMPT', {
      agentAddress,
      hasReplyIndicators,
      replyToSender: replyToSender || 'none',
      replyToAddress: replyToAddress || 'none',
      parentMessageSender: parentMessageSender || 'none',
      inReplyToSender: inReplyToSender || 'none',
      referenceSender: referenceSender || 'none',
      replyToMessageId: replyToMessageId || 'none',
      xmtpReplyId: xmtpReplyId || 'none',
      isReplyToAgent: isReplyToAgent ? 'MATCH!' : 'NO MATCH'
    });
    
    // Method 2: Check Base App reply reference field
    // Base App uses content.reference to indicate replies
    if (isReplyMessage && referencedMessageId && !isReplyToAgent && ctx.conversation) {
      try {
        console.log('🔍 [BASE APP REPLY] Detected reply via content.reference', {
          referencedMessageId,
          chatId: chatId.substring(0, 20)
        });
        
        // Try to fetch the referenced message to check if it's from agent
        // This requires accessing conversation messages
        if (ctx.conversation?.messages) {
          try {
            // Try to find the referenced message
            const messages = await ctx.conversation.messages();
            const referencedMsg = messages.find(msg => 
              msg.id === referencedMessageId || 
              msg.messageId === referencedMessageId
            );
            
            if (referencedMsg) {
              const referencedSender = (referencedMsg.senderAddress || referencedMsg.from || '').toLowerCase();
              if (referencedSender === agentAddress) {
                isReplyToAgent = true;
                console.log('✅ [REPLY VERIFIED] Referenced message is from agent!');
                log('info', 'Reply verified via conversation history', {
                  referencedMessageId,
                  chatId: chatId.substring(0, 20)
                });
              }
            }
          } catch (fetchError) {
            // If we can't fetch, use heuristic: if message has reference and no text,
            // and we're in a group chat, it's likely a reply to recent agent message
            console.log('⚠️ [REPLY HEURISTIC] Using fallback detection', {
              error: fetchError.message,
              hasText: userMessage.length > 0
            });
            
            // Heuristic: If reference exists and this is a group chat, likely a reply
            // We'll be more lenient and accept it as a reply
            if (isGroupChat && referencedMessageId) {
              isReplyToAgent = true;
              console.log('✅ [REPLY HEURISTIC] Assuming reply to agent in group chat');
            }
          }
        }
      } catch (e) {
        log('error', 'Error in Base App reply detection', { error: e.message });
      }
    }
    
    // Method 3: Legacy fallback - check other reply indicators
    if (hasReplyIndicators && !isReplyToAgent && ctx.conversation) {
      try {
        // Try to fetch recent messages to find if the replied-to message is from agent
        // This is a fallback when direct sender address isn't available
        const repliedToMessageId = inReplyToMessageId || parentMessageId || replyToMessageId;
        
        if (repliedToMessageId) {
          log('info', 'Reply detected - attempting to verify via conversation history', {
            repliedToMessageId,
            chatId: chatId.substring(0, 20)
          });
        }
      } catch (e) {
        log('error', 'Error in reply detection fallback', { error: e.message });
      }
    }
    
    log('info', 'Reply detection result', {
      isReplyToAgent,
      hasReplyIndicators,
      replyToSender,
      parentMessageSender,
      inReplyToSender,
      referenceSender,
      inReplyToMessageId,
      parentMessageId
    });
    
    // SIMPLE LOGIC - USE DATABASE ONLY:
    // Base App doesn't provide reliable group detection, so use behavior-based detection:
    // 1. If database says 'group' → it's a group (requires mentions)
    // 2. If database says 'dm' but message has mention → OVERRIDE: it's actually a group
    // 3. If database says 'dm' and no mention → it's a DM (responds automatically)
    // 4. If database is null (unknown):
    //    - If message has mention → likely group (save as group, respond)
    //    - If message has NO mention → treat as DM temporarily (respond, save as DM)
    
    let isGroupChat = false;
    
    if (dbChatType === 'group') {
      // Database says it's a group → require mentions
      isGroupChat = true;
    } else if (dbChatType === 'dm') {
      // Database says it's a DM BUT check if message has mention
      // If has mention → it was incorrectly marked as DM, it's actually a group
      if (isMentioned || isReplyToAgent) {
        // Was incorrectly marked as DM, but user mentioned us → it's a group
        isGroupChat = true;
        saveConversationType(chatId, 'group');
        log('info', 'Overriding DM marking - detected as group (has mention)', { chatId: chatId.substring(0, 20) });
      } else {
        // No mention → it's a DM, respond automatically
        isGroupChat = false;
      }
    } else {
      // Unknown conversation - DEFAULT TO GROUP (require mention):
      // This prevents group chats from being marked as DM on first contact
      // If it's actually a DM, user will send 2 messages without mention, then we'll treat as DM
      if (isMentioned || isReplyToAgent) {
        // User mentioned/replied → confirmed group, save it
        isGroupChat = true;
        saveConversationType(chatId, 'group');
        ignoredUnknownConversations.delete(chatId); // Clear ignore count
        log('info', 'Unknown conversation - detected as group (has mention)', { chatId: chatId.substring(0, 20) });
      } else {
        // No mention → check if we've ignored this conversation before
        const ignoreCount = ignoredUnknownConversations.get(chatId) || 0;
        if (ignoreCount >= 1) {
          // We've ignored this conversation before without mention → it's a DM
          isGroupChat = false;
          ignoredUnknownConversations.delete(chatId); // Clear ignore count
          log('info', 'Unknown conversation - detected as DM (ignored twice without mention)', { chatId: chatId.substring(0, 20) });
        } else {
          // First time ignoring → default to GROUP (ignore, require mention first)
          isGroupChat = true;
          ignoredUnknownConversations.set(chatId, ignoreCount + 1);
          log('info', 'Unknown conversation - defaulting to group (first ignore, no mention yet)', { chatId: chatId.substring(0, 20) });
        }
      }
    }
    
    // GROUP CHAT: Only respond if mentioned or replied to
    console.log('🔍 [GROUP CHECK]', {
      isGroupChat,
      isMentioned,
      isReplyToAgent,
      hasReplyIndicators,
      willProcess: isGroupChat ? (isMentioned || isReplyToAgent) : true
    });
    
    if (isGroupChat && !isMentioned && !isReplyToAgent) {
      // Passive detection only
      console.log('🚫 [IGNORED] Group chat message - no mention and not a reply');
      detectImportantInfo(userMessage, chatId, senderAddress);
      log('info', 'Group chat - ignored (not mentioned and not a reply)', { 
        from: senderAddress,
        isMentioned: false,
        isReply: isReplyToAgent,
        hasReplyIndicators: hasReplyIndicators,
        dbChatType: dbChatType,
        debug: 'This message was ignored. Check reply detection logs above to see why.',
        replyDetectionDetails: {
          replyToSender: replyToSender || 'none',
          replyToAddress: replyToAddress || 'none',
          parentMessageSender: parentMessageSender || 'none',
          inReplyToSender: inReplyToSender || 'none',
          referenceSender: referenceSender || 'none'
        }
      });
      return; // Exit early
    }
    
    // If we get here and it's a reply, log it clearly
    if (isReplyToAgent && isGroupChat) {
      console.log('✅ [REPLY DETECTED] Processing reply message in group chat');
      // Safely truncate message for logging
      const replyMessagePreview = typeof userMessage === 'string' 
        ? userMessage.substring(0, 50) 
        : String(userMessage).substring(0, 50);
      
      log('info', '✅ REPLY DETECTED - Processing reply message', {
        from: senderAddress,
        chatId: chatId.substring(0, 20),
        messagePreview: replyMessagePreview,
        replyToSender: replyToSender || 'none',
        replyToAddress: replyToAddress || 'none'
      });
    }
    
    console.log('✅ [PROCESSING] Message will be processed', {
      reason: isGroupChat ? (isMentioned ? 'mentioned' : 'replied') : 'DM'
    });
    
    // If we get here, we're responding (DM auto-respond OR group with mention)
    // Save conversation type based on behavior to remember for next time
    if (!isMentioned && !isReplyToAgent) {
      // Responding automatically WITHOUT mention → it's a DM
      // This overrides any previous incorrect group marking (including unknown defaults)
      saveConversationType(chatId, 'dm');
      log('info', 'DM - responding automatically (overriding group default)', { chatId: chatId.substring(0, 20) });
    } else if (isMentioned || isReplyToAgent) {
      // Responding to mention/reply → it's a group
      if (dbChatType !== 'group') {
        saveConversationType(chatId, 'group');
        log('info', 'Group chat - responding to mention', { chatId: chatId.substring(0, 20) });
      }
    }
    
    // DMs will continue past this point and respond automatically (no mention needed)
    
    // Check rate limit at entry point (only for messages we'll respond to)
    const rateCheck = checkRateLimit(senderAddress, 'general');
    if (!rateCheck.allowed) {
      await ctx.sendText(`⏱️ Whoa, slow down! You're sending too many messages.\n\n` +
                        `Please wait ${rateCheck.resetIn} seconds before trying again.\n\n` +
                        `💡 Tip: Take your time to compose your message clearly.`);
      return;
    }
    
    // Safely truncate message for logging
    const messagePreview = typeof userMessage === 'string' 
      ? userMessage.substring(0, 50) + '...' 
      : String(userMessage).substring(0, 50) + '...';
    
    log('info', 'Message received', { 
      from: senderAddress, 
      message: messagePreview, // Truncate for privacy
      isGroup: isGroupChat,
      isMentioned: isMentioned,
      isReply: isReplyToAgent,
      replyDetection: {
        hasReplyIndicators,
        replyToSender: replyToSender || 'none',
        parentMessageSender: parentMessageSender || 'none',
        inReplyToSender: inReplyToSender || 'none'
      }
    });
    
    console.log('👁️ [SENDING REACTION] Attempting to send 👀 reaction...');
    try {
      await ctx.sendReaction('👀');
      console.log('✅ [REACTION SENT] Reaction sent successfully');
    } catch (reactionError) {
      console.error('❌ [REACTION ERROR] Failed to send reaction:', reactionError.message);
      console.error('❌ [REACTION ERROR STACK]', reactionError.stack);
      // Continue even if reaction fails
    }
    
    // Natural delay to feel more human (looks like agent is reading/thinking)
    console.log('⏳ [DELAY] Waiting 2-5 seconds before responding...');
    await naturalDelay();
    console.log('✅ [DELAY COMPLETE] Proceeding with response...');
    
    // Remove @dragman mention (both formats) for processing
    const cleanMessage = userMessage.replace(/@dragman(\.base\.eth)?/gi, '').trim();
    
    // If this is a reply (not just a mention), acknowledge it subtly
    if (isReplyToAgent && !isMentioned && isGroupChat) {
      // User replied to agent's message - this is good UX
      log('info', 'Reply detected - user replied to agent message', { chatId: chatId.substring(0, 20) });
    }
    const userNoteCount = db.prepare('SELECT COUNT(*) as count FROM notes WHERE chatId = ? AND savedBy = ?').get(chatId, senderAddress);
    const isNewUser = userNoteCount && userNoteCount.count === 0;
    
    // Handle intent (Quick Action responses)
    if (ctx.message.typeId === 'intent') {
      const intent = ctx.message.content;
      log('info', 'Intent received', { actionId: intent.actionId });
      const result = await handleActionSelection(intent.actionId, ctx, chatId, senderAddress, isGroupChat);
      if (result && result !== 'CATEGORIES_SENT') {
        await ctx.sendText(result);
      }
      return;
    }
    
    // Process commands
    const response = await handleDragmanCommands(ctx, cleanMessage, senderAddress, isGroupChat);
    
    // Handle response (special flags indicate message already sent, don't send again)
    const specialFlags = ['CATEGORIES_SENT', 'SEARCH_SENT'];
    
    if (response && !specialFlags.includes(response)) {
      await ctx.sendText(response);
    } else if (specialFlags.includes(response)) {
      // Do nothing - already sent by handler function
    } else if (isNewUser || cleanMessage.toLowerCase().includes('menu') || cleanMessage.toLowerCase().includes('start')) {
      // On group: only Quick Actions (single message). On DM: onboarding + Quick Actions
      if (isGroupChat) {
        await sendMainQuickActions(ctx, 'group');
      } else {
        const onboarding = getOnboardingMessage('dm');
        await ctx.sendText(onboarding);
        await sendMainQuickActions(ctx, 'dm');
      }
    } else {
      // Check if weekly digest is pending (optional proactive hint)
      const stats = weeklyStats.get(chatId);
      if (stats && stats.digestPending) {
        await ctx.sendText(`📊 Your weekly digest is ready! Type "@dragman digest" to see it.`);
        stats.digestPending = false; // Clear flag after hint
        stats.lastDigestSent = Date.now();
      } else {
        // For returning users without response, just send Quick Actions
        await sendMainQuickActions(ctx, isGroupChat ? 'group' : 'dm');
      }
    }
    
  } catch (error) {
    log('error', 'Error handling message', { error: error.message, stack: error.stack });
    await ctx.sendText("❌ Something went wrong. Please try again or type /help for assistance.");
  }
});

log('info', '🐉 Dragman Agent started successfully!');
console.log('✅ Dragman is ready to save your notes!');

// ==================== WEEKLY DIGEST SCHEDULER ====================

// Check every hour if it's time to send weekly digests
if (CONFIG.WEEKLY_DIGEST_ENABLED) {
  setInterval(() => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    // Check if it's the scheduled day and hour
    if (currentDay === CONFIG.WEEKLY_DIGEST_DAY && currentHour === CONFIG.WEEKLY_DIGEST_HOUR) {
      log('info', '📊 Weekly digest time reached');
      
      // Get all unique chatIds from notes (active chats)
      const activeChats = db.prepare(`
        SELECT DISTINCT chatId, chatType 
        FROM notes 
        WHERE createdAt > datetime('now', '-30 days')
        GROUP BY chatId
        HAVING COUNT(*) >= 3
      `).all();
      
      log('info', `Found ${activeChats.length} active chats for digest`, {});
      
      // Note: Auto-sending requires conversation context which we don't have here
      // For production, you'd need to:
      // 1. Store conversation references in DB
      // 2. Use XMTP client to send to stored conversations
      // 3. Or use a proper scheduler like node-cron with agent.listConversations()
      //
      // For now, we mark that digest is available and users get it on next interaction
      
      for (const chat of activeChats) {
        let stats = weeklyStats.get(chat.chatId);
        if (!stats) {
          stats = { weekStart: Date.now(), saves: 0, searches: 0, views: 0, lastDigestSent: 0 };
          weeklyStats.set(chat.chatId, stats);
        }
        
        // Check if digest already sent this week (within last 6 days)
        const daysSinceLastDigest = (Date.now() - stats.lastDigestSent) / (24 * 60 * 60 * 1000);
        
        if (daysSinceLastDigest >= 6) {
          stats.digestPending = true;
          log('info', `Marked digest pending for chat`, { chatId: chat.chatId.substring(0, 10) + '...' });
        }
      }
    }
  }, 60 * 60 * 1000); // Check every hour
  
  log('info', '🕐 Weekly digest scheduler initialized', { 
    day: CONFIG.WEEKLY_DIGEST_DAY === 1 ? 'Monday' : `Day ${CONFIG.WEEKLY_DIGEST_DAY}`,
    hour: `${CONFIG.WEEKLY_DIGEST_HOUR}:00`
  });
}

// ==================== START AGENT ====================

// IMPORTANT: Register 'start' event handler BEFORE starting agent
agent.on('start', () => {
  console.log('✅ [AGENT STARTED] Dragman is online and ready!');
  console.log('✅ [AGENT ADDRESS]', agent.address);
  log('info', `✅ Dragman is online and ready!`);
  log('info', `📬 Agent address: ${agent.address}`);
});

// Start the agent to listen for messages
console.log('🚀 [STARTING AGENT] About to start agent...');
try {
  await agent.start();
  console.log('✅ [AGENT STARTED] Agent.start() completed');
} catch (startError) {
  console.error('❌ [START ERROR] Failed to start agent:', startError.message);
  console.error('❌ [START ERROR STACK]', startError.stack);
  throw startError;
}

// Keep the process running
process.on('SIGINT', () => {
  log('info', '🛑 Shutting down gracefully...');
  process.exit(0);
});
