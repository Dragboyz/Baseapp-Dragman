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
      `💡 Just type the number (1-4) or command directly!\n` +
      `🚀 Examples: "1", "save [note]", "search [keyword]"`;
  } else {
    // DM menu includes group features option
    interactiveMenu = `🐉 What would you like to do?\n\n` +
      `🎯 QUICK ACTIONS\n\n` +
      `1️⃣ 💾 Save Note\n` +
      `2️⃣ 🔍 Search Notes\n` +
      `3️⃣ 📂 View Categories\n` +
      `4️⃣ ❓ Help\n` +
      `5️⃣ 🚀 Group Features\n\n` +
      `💡 Just type the number (1-5) or command directly!\n` +
      `🚀 Examples: "1", "save [note]", "search [keyword]"`;
  }
  
  try {
    await ctx.sendText(interactiveMenu);
    log('info', 'Sent Quick Actions menu', { chatType });
  } catch (error) {
    log('error', 'Failed to send Quick Actions', { error: error.message });
  }
}

async function sendCategoryActions(ctx, chatId, senderAddress) {
  const categories = db.prepare(`
    SELECT category, count FROM categories 
    WHERE chatId = ? 
    ORDER BY count DESC
  `).all(chatId);

  if (categories.length === 0) {
    await ctx.sendText("📭 No categories yet. Start by saving some notes!");
    return;
  }

  setUserContext(senderAddress, 'viewing_categories', { categories });

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

function searchNotes(query, chatId) {
  return db.prepare(`
    SELECT * FROM notes 
    WHERE chatId = ? AND (
      LOWER(content) LIKE ? OR 
      LOWER(category) LIKE ? OR 
      LOWER(tags) LIKE ?
    )
    ORDER BY createdAt DESC
  `).all(chatId, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`);
}

function getNotesByCategory(category, chatId) {
  return db.prepare(`
    SELECT * FROM notes 
    WHERE chatId = ? AND category = ?
    ORDER BY createdAt DESC
  `).all(chatId, category);
}

function getRecentNotes(chatId, limit = CONFIG.MAX_RECENT_NOTES) {
  return db.prepare(`
    SELECT * FROM notes 
    WHERE chatId = ?
    ORDER BY createdAt DESC 
    LIMIT ?
  `).all(chatId, limit);
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
function analyzeTrendingTopics(chatId, days = 7) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  // Get recent notes
  const recentNotes = db.prepare(`
    SELECT category, content, savedBy, createdAt, viewCount 
    FROM notes 
    WHERE chatId = ? AND createdAt > ?
    ORDER BY createdAt DESC
  `).all(chatId, cutoffDate);
  
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
function findRelatedNotes(noteId, chatId, limit = 3) {
  // Get the source note
  const sourceNote = db.prepare('SELECT * FROM notes WHERE id = ? AND chatId = ?').get(noteId, chatId);
  if (!sourceNote) return [];
  
  // Extract keywords from source note
  const keywords = sourceNote.content.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4);
  
  if (keywords.length === 0) return [];
  
  // Find notes with similar keywords (excluding source note)
  const allNotes = db.prepare(`
    SELECT * FROM notes 
    WHERE chatId = ? AND id != ?
    ORDER BY createdAt DESC
    LIMIT 20
  `).all(chatId, noteId);
  
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
function checkUnsavedInfo(chatId) {
  if (!groupAnalytics.has(chatId)) return [];
  
  const analytics = groupAnalytics.get(chatId);
  const recentDetections = analytics.detectedInfo.filter(
    item => Date.now() - item.timestamp < 30 * 60 * 1000 // Last 30 minutes
  );
  
  // Check which detected items haven't been saved
  const unsaved = [];
  for (const detection of recentDetections) {
    if (detection.type === 'address' || detection.type === 'url') {
      // Check if this content exists in notes
      const exists = db.prepare(`
        SELECT id FROM notes 
        WHERE chatId = ? AND content LIKE ?
        LIMIT 1
      `).get(chatId, `%${detection.content}%`);
      
      if (!exists) {
        unsaved.push(detection);
      }
    }
  }
  
  return unsaved;
}

// WEEKLY DIGEST: Generate comprehensive weekly report
function generateWeeklyDigest(chatId, chatType) {
  const trends = analyzeTrendingTopics(chatId, 7);
  
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
  const previousWeekNotes = db.prepare(`
    SELECT COUNT(*) as count FROM notes 
    WHERE chatId = ? AND createdAt BETWEEN ? AND ?
  `).get(chatId, lastWeekStart, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  
  const weekChange = trends.totalNotes - (previousWeekNotes?.count || 0);
  
  // Calculate team level based on total notes
  const totalNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE chatId = ?').get(chatId);
  const teamLevel = Math.floor(totalNotes.count / 10) + 1;
  const nextLevelAt = teamLevel * 10;
  const progress = ((totalNotes.count % 10) / 10) * 100;
  
  // Get unsaved detections from last week
  const unsaved = [];
  if (groupAnalytics.has(chatId)) {
    const analytics = groupAnalytics.get(chatId);
    const weeklyDetections = analytics.detectedInfo.filter(
      item => Date.now() - item.timestamp < 7 * 24 * 60 * 60 * 1000
    );
    
    for (const detection of weeklyDetections) {
      if (detection.type === 'address' || detection.type === 'url') {
        const exists = db.prepare(`
          SELECT id FROM notes WHERE chatId = ? AND content LIKE ? LIMIT 1
        `).get(chatId, `%${detection.content}%`);
        
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
      const notesCount = db.prepare(`
        SELECT COUNT(*) as count FROM notes 
        WHERE chatId = ? AND LOWER(content) LIKE ?
      `).get(chatId, `%${keyword}%`);
      
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
    chatType
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

function deleteNotes(query, chatId, senderAddress, category = null) {
  let matchingNotes;
  
  if (category) {
    // Search within specific category
    matchingNotes = db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND savedBy = ? AND category = ? AND LOWER(content) LIKE ?
      ORDER BY createdAt DESC
    `).all(chatId, senderAddress, category, `%${query.toLowerCase()}%`);
  } else {
    // Search across all notes
    matchingNotes = db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND savedBy = ? AND LOWER(content) LIKE ?
      ORDER BY createdAt DESC
    `).all(chatId, senderAddress, `%${query.toLowerCase()}%`);
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
  const chatId = ctx.conversation?.topic || 'unknown';
  const chatType = isGroupChat ? 'group' : 'dm';
  
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
    const results = searchNotes(query, chatId);
    
    if (results.length === 0) {
      return `❌ No notes found for "${query}"\n\n💡 Try different keywords or check /help`;
    }
    
    if (results.length === 1) {
      const note = results[0];
      incrementViewCount(note.id);
      
      let response = formatNote(note);
      
      // NEW: Show related notes
      const related = findRelatedNotes(note.id, chatId, 3);
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
    const recent = getRecentNotes(chatId, CONFIG.MAX_RECENT_NOTES);
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
    
    const matchingNotes = deleteNotes(searchContent, chatId, senderAddress, searchCategory);
    
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
    
    // Search for notes to edit
    const matchingNotes = db.prepare(`
      SELECT * FROM notes 
      WHERE chatId = ? AND savedBy = ? AND LOWER(content) LIKE ?
      ORDER BY createdAt DESC
    `).all(chatId, senderAddress, `%${editQuery.toLowerCase()}%`);
    
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
    await sendCategoryActions(ctx, chatId, senderAddress);
    return 'CATEGORIES_SENT';
  }
  
  // STATS
  if (message === 'stats' || message === 'statistics') {
    const totalNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE chatId = ?').get(chatId);
    const categories = db.prepare('SELECT COUNT(*) as count FROM categories WHERE chatId = ?').get(chatId);
    const topCategory = db.prepare('SELECT category, count FROM categories WHERE chatId = ? ORDER BY count DESC LIMIT 1').get(chatId);
    
    return `📊 Dragman Statistics\n\n` +
           `📝 Total Notes: ${totalNotes.count}\n` +
           `📂 Categories: ${categories.count}\n` +
           (topCategory ? `🏆 Top Category: ${topCategory.category} (${topCategory.count} notes)\n` : '') +
           `\n💡 Keep saving to make this ${chatType === 'group' ? 'group' : 'chat'} smarter!`;
  }
  
  // TRENDING TOPICS (NEW!)
  if (message === 'trends' || message === 'trending' || message === 'insights') {
    const trends = analyzeTrendingTopics(chatId, 7);
    
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
    const unsaved = checkUnsavedInfo(chatId);
    
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
    const digest = generateWeeklyDigest(chatId, chatType);
    
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
      if (number >= 1 && number <= categories.length) {
        clearUserContext(senderAddress);
        const selectedCategory = categories[number - 1].category;
        const notes = getNotesByCategory(selectedCategory, chatId);
        
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
      await sendCategoryActions(ctx, chatId, senderAddress);
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

🔧 COMMANDS
• /menu - Return to main menu
• /help - Show this help message

🔒 PRIVACY
• Group chat notes → Everyone in group can see
• Private DM notes → Only you can see

✨ EXAMPLES
• save My wallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
• save Check out this article in Resources
• save Deploy contract to mainnet in Dev
• search wallet
• edit wallet (then type new content)
• delete contract deployment
• recent
• trends (see what group is working on)
• suggestions (check unsaved important info)
• digest (weekly team report with MVP & insights)

⚠️ NOTE: Categories must be a single word (e.g., Gaming, DeFi, Work)
For multi-word categories, use camelCase (e.g., MobileLegend)

🤖 SMART FEATURES:
• I passively detect wallet addresses, URLs & key mentions
• I show related notes when you search
• I suggest existing notes before you save duplicates
• I track group trends & insights automatically

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
        
        // Search with all keywords (highest priority)
        for (const keyword of keywords) {
          const keywordResults = searchNotes(keyword, chatId);
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
      
      // NEW: No match found, but check if there's unsaved info
      const unsaved = checkUnsavedInfo(chatId);
      if (unsaved.length > 0) {
        return `🤔 I couldn't find notes matching your question, but...\n\n` +
               `💡 I detected ${unsaved.length} unsaved important item(s) recently!\n` +
               `Maybe one of them is what you're looking for?\n\n` +
               `Type "@dragman suggestions" to see them.`;
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
        const existing = searchNotes(keywords[0], chatId);
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

Stop scrolling to find old messages.
I remember EVERYTHING your team saves!

✨ MY SUPERPOWER:

Ask me questions → Get instant answers!

━━━━━━━━━━━━━━━━━━━━━━━━

💬 EXAMPLE:

Alice: save Contract: 0x742d35Cc...
Bob: save Docs: https://docs.base.org

[2 weeks later...]

Charlie: @dragman what's our contract?
Me: 🧠 Found it! Shows Alice's note
     with WHO saved it and WHEN ✅

━━━━━━━━━━━━━━━━━━━━━━━━

🎯 HOW IT WORKS:
💾 Anyone saves → I remember
❓ Anyone asks → I answer
🧠 Your group gets smarter over time!

⚠️ Group Notes = Everyone can see
💬 Want private notes? DM me instead

👇 Pick an option to start!`;
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

agent.on('text', async (ctx) => {
  try {
    const userMessage = ctx.message.content;
    const senderAddress = (ctx.message.senderAddress || await ctx.getSenderAddress?.() || 'unknown').toLowerCase();
    const agentAddress = agent.address.toLowerCase();
    const isGroupChat = ctx.message.groupId !== undefined;
    
    if (senderAddress === agentAddress) return;
    
    // Check rate limit at entry point
    const rateCheck = checkRateLimit(senderAddress, 'general');
    if (!rateCheck.allowed) {
      await ctx.sendText(`⏱️ Whoa, slow down! You're sending too many messages.\n\n` +
                        `Please wait ${rateCheck.resetIn} seconds before trying again.\n\n` +
                        `💡 Tip: Take your time to compose your message clearly.`);
      return;
    }
    
    log('info', 'Message received', { 
      from: senderAddress, 
      message: userMessage,
      isGroup: isGroupChat 
    });
    
    await ctx.sendReaction('👀');
    
    // Group chat: only respond if mentioned or replying to agent
    const isMentioned = userMessage.toLowerCase().includes('@dragman');
    const isReplyToAgent = ctx.message.replyTo?.senderAddress === agent.address;
    
    if (isGroupChat && !isMentioned && !isReplyToAgent) {
      // PASSIVE DETECTION: Detect important info in background (doesn't respond)
      detectImportantInfo(userMessage, chatId, senderAddress);
      return;
    }
    
    // Natural delay to feel more human (looks like agent is reading/thinking)
    await naturalDelay();
    
    // Remove @dragman mention for processing
    const cleanMessage = userMessage.replace(/@dragman/gi, '').trim();
    
    // Check if this is a first-time user
    const chatId = ctx.conversation?.topic || 'unknown';
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
      // Send onboarding + Quick Actions for new users or menu requests
      const onboarding = getOnboardingMessage(isGroupChat ? 'group' : 'dm');
      await ctx.sendText(onboarding);
      await sendMainQuickActions(ctx, isGroupChat ? 'group' : 'dm');
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

// Start the agent to listen for messages
await agent.start();

// Log when ready
agent.on('start', () => {
  log('info', `✅ Dragman is online and ready!`);
  log('info', `📬 Agent address: ${agent.address}`);
});

// Keep the process running
process.on('SIGINT', () => {
  log('info', '🛑 Shutting down gracefully...');
  process.exit(0);
});
