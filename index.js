import { Agent } from "@xmtp/agent-sdk";
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import Database from 'better-sqlite3';

dotenv.config();

// ==================== SETUP ====================

const installationPath = process.env.XMTP_INSTALLATION_PATH || './.xmtp-installation';
if (!fs.existsSync(installationPath)) {
  fs.mkdirSync(installationPath, { recursive: true });
  console.log(`📁 Created XMTP installation directory: ${installationPath}`);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const agent = await Agent.createFromEnv({
  env: process.env.XMTP_ENV || 'production',
  persistConversations: true,
  installationPath: installationPath
});

// ==================== LOGGING ====================

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}]: ${message}`, JSON.stringify(data));
}

// ==================== DATABASE SETUP ====================

const db = new Database('./dragman.db');

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

log('info', 'Database initialized');

// ==================== CONTEXT TRACKING ====================

const userContexts = new Map();

function setUserContext(address, context, data = null) {
  userContexts.set(address, { context, data, timestamp: Date.now() });
}

function getUserContext(address) {
  const ctx = userContexts.get(address);
  if (ctx && Date.now() - ctx.timestamp < 300000) { // 5 minutes
    return ctx;
  }
  userContexts.delete(address);
  return null;
}

function clearUserContext(address) {
  userContexts.delete(address);
}

// ==================== QUICK ACTIONS ====================

async function sendMainQuickActions(ctx, chatType) {
  const mainActions = {
    id: `dragman_main_${Date.now()}`,
    description: "🐉 What would you like to do?",
    actions: [
      { id: "save_note", label: "💾 Save Note", style: "primary" },
      { id: "search_notes", label: "🔍 Search Notes", style: "primary" },
      { id: "view_categories", label: "📂 View Categories", style: "primary" },
      { id: "help", label: "❓ Help", style: "primary" }
    ],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  try {
    // Try using conversation.send with different formats
    try {
      await ctx.conversation.send(mainActions, 'coinbase.com/actions:1.0');
      log('info', '✅ Quick Actions sent successfully!');
      return;
    } catch (error1) {
      log('warn', 'First method failed, trying text fallback', { error: error1.message });
      
      // Fallback to text-based menu
      const interactiveMenu = `🐉 What would you like to do?\n\n` +
        `🎯 QUICK ACTIONS\n\n` +
        `1️⃣ 💾 Save Note\n` +
        `2️⃣ 🔍 Search Notes\n` +
        `3️⃣ 📂 View Categories\n` +
        `4️⃣ ❓ Help\n\n` +
        `💡 Just type the number (1-4) or command directly!\n` +
        `🚀 Examples: "1", "save [note]", "search [keyword]"`;
      await ctx.sendText(interactiveMenu);
      log('info', 'Sent text-based Quick Actions menu');
    }
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
  
  let text = formatNotesList(results.slice(0, 5));
  if (results.length > 5) {
    text += `\n...and ${results.length - 5} more results\n`;
  }
  text += `\nReply with number to view full note`;
  text += `\n\n💡 Tip: Type /menu for main menu`;
  
  await ctx.sendText(text);
}

// ==================== SMART NOTE SAVING ====================

async function saveNote(content, chatId, chatType, savedBy, fromUser = null, originalMessage = null, explicitCategory = null) {
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
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system",
        content: "You are a categorization assistant. Return ONLY a 1-2 word category name for the note. Categories: Addresses, Contract, Transaction, Links, Tutorial, Strategy, Meeting, API, DeFi, Gaming, Dev, Trading, Personal, Ideas, Questions, Resources, General. Return just the category word, nothing else."
      }, {
        role: "user",
        content: `Categorize this note: "${content}"`
      }],
      max_tokens: 10,
      temperature: 0.3,
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

function getRecentNotes(chatId, limit = 5) {
  return db.prepare(`
    SELECT * FROM notes 
    WHERE chatId = ?
    ORDER BY createdAt DESC 
    LIMIT ?
  `).all(chatId, limit);
}

function incrementViewCount(noteId) {
  db.prepare(`
    UPDATE notes 
    SET viewCount = viewCount + 1 
    WHERE id = ?
  `).run(noteId);
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

function shortenAddress(address) {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

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
    const content = userMessage.replace(/^(save|remember|note)\s+/i, '').trim();
    
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
  }
  
  // SEARCH
  if (message.startsWith('search ') || message.startsWith('find ')) {
    const query = message.replace(/^(search|find)\s+/i, '').trim();
    const results = searchNotes(query, chatId);
    
    if (results.length === 0) {
      return `❌ No notes found for "${query}"\n\n💡 Try different keywords or check /help`;
    }
    
    if (results.length === 1) {
      incrementViewCount(results[0].id);
      return formatNote(results[0]) + "\n\n💡 Type /menu for main menu";
    }
    
    await sendSearchResultActions(ctx, results, senderAddress);
    return null;
  }
  
  // RECENT
  if (message === 'recent' || message === 'latest' || message === 'recent notes') {
    const recent = getRecentNotes(chatId, 5);
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
      
      // Update category count
      db.prepare(`
        UPDATE categories 
        SET count = count - 1 
        WHERE chatId = ? AND category = ?
      `).run(chatId, note.category);
      
      // Remove category if count is 0
      db.prepare(`
        DELETE FROM categories 
        WHERE chatId = ? AND category = ? AND count <= 0
      `).run(chatId, note.category);
      
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
    return null;
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
        
        // Update category count
        db.prepare(`
          UPDATE categories 
          SET count = count - 1 
          WHERE chatId = ? AND category = ?
        `).run(chatId, noteToDelete.category);
        
        // Remove category if count is 0
        db.prepare(`
          DELETE FROM categories 
          WHERE chatId = ? AND category = ? AND count <= 0
        `).run(chatId, noteToDelete.category);
        
        log('info', 'Note deleted via selection', { noteId: noteToDelete.id, user: senderAddress });
        
        return `✅ Note deleted successfully!\n\n` +
               `${getCategoryEmoji(noteToDelete.category)} Category: ${noteToDelete.category}\n` +
               `📝 ${truncate(noteToDelete.content, 100)}\n\n` +
               `💡 Type /menu for main menu`;
      }
    }
    
    // Otherwise, handle main menu selection (1-4)
    if (number >= 1 && number <= 4) {
      const actions = ['save_note', 'search_notes', 'view_categories', 'help'];
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
             "• save My wallet: 0x742d35Cc6634...\n" +
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

⚠️ NOTE: Categories must be a single word (e.g., Gaming, DeFi, Work)
For multi-word categories, use camelCase (e.g., MobileLegend)

💡 Type /menu anytime for Quick Actions!`;
}

// ==================== CONVERSATIONAL AI WITH SMART SUGGESTIONS ====================

async function generateConversationalResponse(userMessage, chatType, chatId, senderAddress) {
  try {
    // SMART FEATURE 1: Detect questions and auto-search notes
    const isQuestion = /\b(what|where|when|who|how|which|my|the)\b.*\?|what's|where's|what is|where is/i.test(userMessage);
    
    if (isQuestion) {
      // Extract keywords from the question
      const keywords = userMessage
        .toLowerCase()
        .replace(/\b(what|where|when|who|how|which|is|are|my|the|a|an)\b/g, '')
        .replace(/[?!.,]/g, '')
        .trim()
        .split(/\s+/)
        .filter(word => word.length > 3);
      
      // Search notes for relevant information
      if (keywords.length > 0) {
        const searchQuery = keywords[0]; // Use first meaningful keyword
        const results = searchNotes(searchQuery, chatId);
        
        if (results.length > 0) {
          const topNote = results[0];
          return `🔍 Found this in your notes:\n\n` +
                 `${getCategoryEmoji(topNote.category)} ${topNote.category}\n` +
                 `📝 ${truncate(topNote.content, 200)}\n\n` +
                 `💡 Type "search ${searchQuery}" to see all ${results.length} result(s)`;
        }
      }
    }
    
    // SMART FEATURE 2: Detect important info and suggest saving
    const hasImportantInfo = 
      /0x[a-fA-F0-9]{40}/.test(userMessage) || // Ethereum address
      /(https?:\/\/[^\s]+)/.test(userMessage) || // URL
      /\b(contract|deploy|address|wallet|key|password|api|token)\b/i.test(userMessage); // Important keywords
    
    if (hasImportantInfo && userMessage.split(' ').length > 3) {
      return `💡 This looks like important information!\n\n` +
             `Would you like me to save it?\n` +
             `Just type: save ${truncate(userMessage, 50)}`;
    }
    
    // SMART FEATURE 3: Regular conversational response with context
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
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
      max_tokens: 150,
      temperature: 0.7,
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
    return `🐉 Welcome to Dragman!

I'm your group's smart knowledge assistant.

What I do for you:
✅ Save important information from conversations
✅ Never lose contract addresses, links, or ideas
✅ Search instantly through all saved notes
✅ Auto-organize everything into categories

⚠️ IMPORTANT
All notes saved here are visible to everyone in this group!
For private notes, message me directly in DM.

💡 TIP
In groups, mention me with @dragman to use commands!
Example: @dragman save my note

━━━━━━━━━━━━━━━━
PERFECT FOR

📜 Team contracts
🔗 Shared resources
💡 Group ideas
📚 Team documentation
📅 Meeting notes

Select an option below to get started! 👇`;
  } else {
    return `🐉 Welcome to Dragman!

I'm your personal knowledge assistant.

What I do for you:
✅ Remember everything important
✅ Never lose wallet addresses or API keys
✅ Search instantly through your notes
✅ Auto-organize with smart categories

━━━━━━━━━━━━━━━━
GREAT FOR

📍 Addresses
🔑 API keys
🔗 Links
💡 Ideas

Select an option below to get started! 👇`;
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
      return;
    }
    
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
    
    if (response) {
      await ctx.sendText(response);
    } else if (isNewUser || cleanMessage.toLowerCase().includes('menu') || cleanMessage.toLowerCase().includes('start')) {
      // Send onboarding + Quick Actions for new users or menu requests
      const onboarding = getOnboardingMessage(isGroupChat ? 'group' : 'dm');
      await ctx.sendText(onboarding);
      await sendMainQuickActions(ctx, isGroupChat ? 'group' : 'dm');
    } else {
      // For returning users without response, just send Quick Actions
      await sendMainQuickActions(ctx, isGroupChat ? 'group' : 'dm');
    }
    
  } catch (error) {
    log('error', 'Error handling message', { error: error.message, stack: error.stack });
    await ctx.sendText("❌ Something went wrong. Please try again or type /help for assistance.");
  }
});

log('info', '🐉 Dragman Agent started successfully!');
console.log('✅ Dragman is ready to save your notes!');

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
