# ?? TESTING GUIDE - Dragman Agent

## ?? Prerequisites

1. **Restart the agent** (IMPORTANT!)
   ```bash
   pm2 restart baseapp
   # OR
   node index.js
   ```

2. **Check logs** to confirm database migrations ran:
   ```bash
   pm2 logs baseapp
   # Should see:
   # [INFO]: Database migration: Added answer tracking columns
   # [INFO]: Database initialized
   ```

---

## ? TEST 1: Guided Onboarding (New Groups)

### **Scenario:** First-time group chat interaction

**Steps:**

1. **Create a new group chat** or use a group with NO existing notes

2. **First mention** (triggers onboarding):
   ```
   @dragman hello
   ```

3. **Expected Response:**
   ```
   ?? Welcome! Let's set up your team's knowledge base.

   I work best when I have some initial information.
   Let's save a few key things to get started!

   1?? First, what's your main smart contract address?

   Just reply: save [your contract address]
   Or type /skip to do this later.
   ```

4. **Save first note** (progresses onboarding):
   ```
   @dragman save Contract: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
   ```

5. **Expected Response** (save confirmation + next step):
   ```
   ? Note saved successfully!
   
   ?? Category: Contract
   ?? Contract: 0x742d35Cc...
   ?? This note is private to you.
   ...

   Great! ?

   2?? Where can team members find your documentation?

   Reply: save [docs link or info]
   Or type /skip
   ```

6. **Save second note**:
   ```
   @dragman save Docs: https://docs.example.com
   ```

7. **Save third note**:
   ```
   @dragman save We use Foundry for testing
   ```

8. **Expected Final Message:**
   ```
   ?? Perfect! Your knowledge base is ready!

   Now anyone can ask me questions:
   "@dragman what's our contract address?"
   "@dragman where are the docs?"

   The more you save, the smarter I get! ??
   ```

### **Test Skip Functionality:**

1. At any onboarding step, type:
   ```
   @dragman /skip
   ```

2. **Expected:**
   ```
   ? Onboarding skipped! You can start saving notes anytime.

   ?? Try: save [important info]
   ```

### **What to Check:**
- ? Onboarding starts automatically for new groups
- ? Each save progresses to next step
- ? Completes after 3 saves
- ? /skip ends onboarding immediately
- ? Onboarding doesn't repeat for same group

---

## ? TEST 2: Answer Feedback System

### **Scenario:** Ask question, get answer, provide feedback

**Steps:**

1. **First, save some notes** (if not done in Test 1):
   ```
   @dragman save Deployment address: 0xABC123...
   @dragman save API endpoint: https://api.base.org
   ```

2. **Ask a question**:
   ```
   @dragman what's our deployment address?
   ```

3. **Expected Response:**
   ```
   ?? Found this in your team's notes!

   ?? ?? Addresses
   Deployment address: 0xABC123...

   ????????????????
   ?? Saved by: 0x60c0...e6b6
   ?? 2m ago
   ?? 1 views • ?? Answered 1 time

   ?? Want to save this too? Just say "save [content]"

   ? Was this helpful? Reply with "helpful" or "not helpful"
   ```

4. **Provide positive feedback**:
   ```
   @dragman helpful
   ```

5. **Expected:**
   ```
   ? Thanks for the feedback! This helps me learn which answers are most useful. ??
   ```

6. **Ask the SAME question again** (to see helpfulness score):
   ```
   @dragman what's our deployment address?
   ```

7. **Expected** (now shows helpfulness %):
   ```
   ?? Found this in your team's notes!

   ?? ?? Addresses
   Deployment address: 0xABC123...

   ????????????????
   ?? Saved by: 0x60c0...e6b6
   ?? 5m ago
   ?? 2 views • ?? Answered 2 times • 100% helpful  ? NEW!
   ```

### **Test Negative Feedback:**

1. Ask another question:
   ```
   @dragman where's the API?
   ```

2. Provide negative feedback:
   ```
   @dragman not helpful
   ```

3. **Expected:**
   ```
   ?? Got it! I'll try to improve. You can help by saving a better answer:
   save [better answer/info]
   ```

### **What to Check:**
- ? Feedback options appear after answers
- ? "helpful", "yes", "thanks" mark as helpful
- ? "not helpful", "no", "nope" mark as not helpful
- ? Helpfulness % shows after multiple feedbacks
- ? Answer count increments each time

---

## ? TEST 3: Answer Quality Tracking

### **Scenario:** Verify answer metrics are tracked

**Steps:**

1. **Save a note:**
   ```
   @dragman save Best practice: Always verify contracts on Basescan
   ```

2. **Ask related questions multiple times:**
   ```
   @dragman how do we verify contracts?
   @dragman helpful
   
   @dragman what's the best practice for contracts?
   @dragman yes
   
   @dragman contract verification?
   @dragman thanks
   ```

3. **Check the note's metrics:**
   ```
   @dragman search contracts
   ```

4. **Expected** (shows accumulated stats):
   ```
   ?? Found 1 note

   1. ?? Dev
      Best practice: Always verify contracts on Basescan
      5m ago • 3 views

   Reply with number to view full note
   ```

5. **View full note** (type `1`):
   ```
   @dragman 1
   ```

6. **Expected:**
   ```
   ?? Note • Dev

   Best practice: Always verify contracts on Basescan

   ????????????????
   ?? 5m ago
   ?? 4 views
   ?? Answered 3 times  ? Tracked!
   100% helpful         ? Calculated!
   ...
   ```

### **What to Check:**
- ? `timesAnswered` increments with each question
- ? `lastAnswered` updates to current time
- ? Helpfulness % accurate (helpful / total * 100)
- ? Stats persist across restarts

---

## ? TEST 4: Knowledge Whisperer (Full Flow)

### **Scenario:** Complete Q&A workflow

**Steps:**

1. **User 1 saves info:**
   ```
   User1: @dragman save NFT contract: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
   ```

2. **User 2 asks question** (different user):
   ```
   User2: @dragman what's our NFT contract address?
   ```

3. **Expected** (finds User1's note):
   ```
   ?? Found this in your team's notes!

   ?? ?? Contract
   NFT contract: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

   ????????????????
   ?? Saved by: 0x60c0...e6b6  ? Shows who saved it
   ?? 2m ago
   ?? 1 views • ?? Answered 1 time

   ?? Want to save this too? Just say "save [content]"

   ? Was this helpful? Reply with "helpful" or "not helpful"
   ```

4. **User 2 provides feedback:**
   ```
   User2: @dragman helpful
   ```

5. **User 3 asks similar question:**
   ```
   User3: @dragman where's the nft contract?
   ```

6. **Expected** (shows updated stats):
   ```
   ... same answer but now shows:
   ?? 2 views • ?? Answered 2 times • 100% helpful
   ```

### **What to Check:**
- ? Questions work across different users
- ? Attribution shows original saver
- ? Stats aggregate from all users
- ? Multiple similar questions find same note

---

## ? TEST 5: Edge Cases

### **Test: No Results Found**
```
@dragman what's the meaning of life?
```
**Expected:**
```
?? I don't have any notes about "meaning life" yet.

?? Be the first to save something! Just say:
save [your answer/info]
```

### **Test: Multiple Results**
```
@dragman save Contract A: 0xAAA...
@dragman save Contract B: 0xBBB...
@dragman save Contract C: 0xCCC...

@dragman what are our contracts?
```
**Expected:**
```
?? Found this in your team's notes!

[Shows best match]

?? Found 3 related notes. Type "search contracts" to see all.
```

### **Test: Feedback Without Prior Answer**
```
@dragman helpful
```
**Expected:** (No response or moves to next command)

---

## ?? Verify Database Tables

**Check tables were created:**
```bash
sqlite3 dragman.db
```

```sql
-- Check answer_feedback table
SELECT * FROM answer_feedback;

-- Check group_status table
SELECT * FROM group_status;

-- Check notes have new columns
PRAGMA table_info(notes);
-- Should show: timesAnswered, lastAnswered
```

---

## ?? Common Issues & Fixes

### **Issue: Onboarding doesn't start**
**Fix:** Delete group_status entry and retry:
```sql
DELETE FROM group_status WHERE chatId = 'your_chat_id';
DELETE FROM notes WHERE chatId = 'your_chat_id';
```

### **Issue: Feedback not working**
**Check logs:**
```bash
pm2 logs baseapp --lines 100
# Look for: "Answer feedback saved"
```

### **Issue: Helpfulness % always null**
**Cause:** No feedback given yet  
**Solution:** Answer a question, then say "helpful" or "not helpful"

---

## ? Success Criteria

All tests pass if:

- [ ] Onboarding starts automatically for new groups
- [ ] Onboarding progresses through 3 steps
- [ ] /skip exits onboarding
- [ ] Questions get answered from team notes
- [ ] Feedback can be given (helpful/not helpful)
- [ ] Helpfulness % shows after 1+ feedback
- [ ] timesAnswered increments correctly
- [ ] Stats persist across restarts
- [ ] Multiple users can interact
- [ ] No crashes or errors in logs

---

## ?? What to Monitor

**Check your logs for:**
```
[INFO]: Question detected
[DEBUG]: Extracted keywords
[INFO]: Answer tracked
[INFO]: Answer feedback saved
[INFO]: Database migration
```

**Database queries to verify:**
```sql
-- Total feedbacks
SELECT COUNT(*) FROM answer_feedback;

-- Top answered notes
SELECT content, timesAnswered 
FROM notes 
ORDER BY timesAnswered DESC 
LIMIT 5;

-- Helpfulness breakdown
SELECT 
  noteId,
  SUM(wasHelpful) as helpful,
  COUNT(*) - SUM(wasHelpful) as not_helpful
FROM answer_feedback
GROUP BY noteId;
```

---

?? **Happy Testing!** If all tests pass, your agent is ready for production!
