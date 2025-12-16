# Deployment Guide: Quiz Chatbot Architectural Fix

## Overview

This guide provides step-by-step instructions to deploy the architectural fix for the quiz chatbot system.

**Problem Solved:** Users receiving quiz invitations but getting "I did not understand" responses instead of quiz questions.

**Root Cause:** Two separate Edge Functions (`whatsapp-chatbot` and `webhook-handler`) with conflicting implementations. The `whatsapp-chatbot` was using AI to simulate a quiz instead of using actual quiz logic.

**Solution:** Both Edge Functions now use the same shared quiz processor with real quiz logic from the database.

---

## What Was Changed

### 1. Shared Quiz Processor (NEW)
**File:** `supabase/functions/_shared/quiz-processor.ts`

**Purpose:** Unified quiz logic used by both Edge Functions

**Features:**
- Quiz start trigger detection (game, quiz, jeu, etc.)
- Automatic state reset for returning users
- Real database queries for quiz questions
- Quiz session and user management
- Answer processing and scoring
- Progress tracking

### 2. webhook-handler (UPDATED)
**File:** `supabase/functions/webhook-handler/index.ts`

**Changes:**
- Imports shared quiz processor
- Routes quiz messages to `processQuizMessageEdge()`
- Smart routing with keyword and session detection
- Proper WhatsApp webhook handling

### 3. whatsapp-chatbot (UPDATED)
**File:** `supabase/functions/whatsapp-chatbot/index.ts`

**Changes:**
- Imports shared quiz processor
- Added `checkIfQuizMessage()` function for smart routing
- Routes quiz messages to `processQuizMessageEdge()` instead of AI
- Keeps AI for customer service messages
- No longer uses "quiz master" system prompt

### 4. Frontend
**Status:** No changes needed - already working correctly

---

## Deployment Steps

### Step 1: Deploy Edge Functions

```bash
# Deploy webhook-handler
supabase functions deploy webhook-handler

# Deploy whatsapp-chatbot
supabase functions deploy whatsapp-chatbot
```

**Expected Output:**
```
Deploying function webhook-handler...
✓ Function webhook-handler deployed successfully

Deploying function whatsapp-chatbot...
✓ Function whatsapp-chatbot deployed successfully
```

### Step 2: Verify Edge Functions Are Running

```bash
# Check webhook-handler
curl https://[YOUR_PROJECT_ID].supabase.co/functions/v1/webhook-handler

# Check whatsapp-chatbot
curl https://[YOUR_PROJECT_ID].supabase.co/functions/v1/whatsapp-chatbot
```

### Step 3: Verify WhatsApp Webhook Configuration

**Option A: Check via WhatsApp Business Dashboard**
1. Go to WhatsApp Business Dashboard
2. Navigate to Configuration → Webhooks
3. Verify Callback URL

**Recommended URL:**
```
https://[YOUR_PROJECT_ID].supabase.co/functions/v1/webhook-handler
```

**Alternative URL (if using whatsapp-chatbot):**
```
https://[YOUR_PROJECT_ID].supabase.co/functions/v1/whatsapp-chatbot
```

**Note:** Both endpoints now work correctly, but `webhook-handler` is recommended as it's designed specifically for WhatsApp webhooks.

### Step 4: Verify Quiz Questions Exist

```sql
-- Check if quiz questions are available
SELECT
  id,
  text,
  type,
  order_index,
  correct_answer,
  points
FROM quiz_questions
ORDER BY order_index ASC;

-- Should return multiple questions
-- If no questions, create some in the Quiz Manager UI
```

### Step 5: Verify Database Tables

```sql
-- Check quiz_users table
SELECT COUNT(*) as quiz_users_count FROM quiz_users;

-- Check quiz_sessions table
SELECT COUNT(*) as quiz_sessions_count FROM quiz_sessions;

-- Check quiz_questions table
SELECT COUNT(*) as quiz_questions_count FROM quiz_questions;

-- All should execute without errors
```

### Step 6: Test Quiz Flow

#### Test 1: Send Campaign Invitation
1. Go to Quiz Marketing Manager in the app
2. Enter a test phone number
3. Click "Send Quiz Invitation"
4. Verify WhatsApp message sent successfully

#### Test 2: Start Quiz with "Game"
1. From the test phone number, reply: `Game`
2. Wait a few seconds
3. **Expected Response:**
   ```
   🎮 **Bienvenue au Quiz Interactif !**

   Préparez-vous à répondre à 10 questions.

   C'est parti ! 🚀

   📋 Question 1/10

   [First Question Text]

   💡 Répondez par "Vrai" ou "Faux"
   🏆 Points possibles: 10
   ```

#### Test 3: Answer Questions
1. Reply with an answer (e.g., `Vrai`)
2. **Expected Response:** Next question
3. Continue through all questions
4. **Expected Final Response:**
   ```
   🎉 Félicitations ! Vous avez terminé le quiz avec un score de X points.

   Votre profil marketing: ACTIVE

   Merci pour votre participation !
   ```

#### Test 4: Test Alternative Keywords
Test each of these keywords (should all start quiz):
- `quiz`
- `jeu`
- `play`
- `test`
- `game`
- `Game` (case insensitive)

#### Test 5: Test Customer Service (Non-Quiz Message)
1. Send a message: `I have a billing question`
2. **Expected Response:** AI customer service response (NOT quiz)

### Step 7: Monitor Edge Function Logs

**In Supabase Dashboard:**
1. Go to Edge Functions
2. Select `webhook-handler` OR `whatsapp-chatbot` (whichever is configured)
3. View Logs

**Look for these log messages:**

**✅ Successful Quiz Routing:**
```
[WHATSAPP-CHATBOT] Quiz routing check: {
  hasQuizKeyword: true,
  hasActiveSession: false,
  hasActiveUser: false,
  shouldRoute: true
}
[WHATSAPP-CHATBOT] Route decision: QUIZ
[WHATSAPP-CHATBOT] Routing to shared quiz processor
[QUIZ-PROCESSOR] Processing quiz message
[QUIZ-PROCESSOR] Message analysis: { isStartTrigger: true }
[QUIZ-PROCESSOR] Creating new quiz user
[QUIZ-PROCESSOR] Quiz start triggered, sending first question
```

**✅ Successful Customer Service Routing:**
```
[WHATSAPP-CHATBOT] Quiz routing check: {
  hasQuizKeyword: false,
  hasActiveSession: false,
  hasActiveUser: false,
  shouldRoute: false
}
[WHATSAPP-CHATBOT] Route decision: AI Customer Service
[WHATSAPP-CHATBOT] Routing to AI customer service
[WHATSAPP-CHATBOT] Generated AI response using model gemma2-9b-it
```

**❌ Errors to Watch For:**
```
[WHATSAPP-CHATBOT] Quiz processing error: [error details]
[QUIZ-PROCESSOR] Error processing quiz message: [error details]
[WHATSAPP-CHATBOT] Error checking quiz sessions: [error details]
```

### Step 8: Verify Database Updates

After a user completes a quiz, verify data was saved:

```sql
-- Get latest quiz session
SELECT * FROM quiz_sessions
ORDER BY created_at DESC
LIMIT 1;

-- Get latest quiz user
SELECT * FROM quiz_users
ORDER BY created_at DESC
LIMIT 1;

-- Get latest quiz answers
SELECT
  qa.*,
  qq.text as question_text
FROM quiz_answers qa
JOIN quiz_questions qq ON qa.question_id = qq.id
ORDER BY qa.created_at DESC
LIMIT 10;

-- Check conversation log
SELECT * FROM customer_conversations
WHERE intent = 'quiz'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Troubleshooting

### Issue: User Gets "I did not understand" Response

**Possible Causes:**
1. Edge Function not deployed
2. Wrong endpoint configured in WhatsApp
3. Quiz questions don't exist in database

**Solution:**
```bash
# 1. Redeploy Edge Functions
supabase functions deploy webhook-handler
supabase functions deploy whatsapp-chatbot

# 2. Check Edge Function logs for errors
# (via Supabase Dashboard → Edge Functions → Logs)

# 3. Verify quiz questions exist
# (run SQL query from Step 4 above)
```

### Issue: User Gets No Response

**Possible Causes:**
1. WhatsApp webhook not configured
2. WhatsApp access token expired
3. Phone number ID incorrect

**Solution:**
```sql
-- Check WhatsApp configuration
SELECT * FROM user_whatsapp_config
WHERE is_active = true;

-- Verify:
-- - access_token is not empty
-- - phone_number_id is correct
-- - is_active = true
```

### Issue: Quiz Starts But Doesn't Progress

**Possible Causes:**
1. Quiz questions missing
2. Answer validation failing
3. State not updating

**Solution:**
```sql
-- Check if quiz session is active
SELECT * FROM quiz_sessions
WHERE phone_number = '+242061234567'
AND completion_status = 'active'
ORDER BY created_at DESC;

-- Check if answers are being saved
SELECT * FROM quiz_answers
WHERE user_id IN (
  SELECT id FROM quiz_users
  WHERE phone_number = '+242061234567'
)
ORDER BY created_at DESC;

-- If no answers, check Edge Function logs for errors
```

### Issue: Customer Service Messages Go to Quiz

**Possible Causes:**
1. Active quiz session still open
2. Quiz keywords in message

**Solution:**
```sql
-- Close any active quiz sessions
UPDATE quiz_sessions
SET completion_status = 'ended',
    end_time = NOW()
WHERE phone_number = '+242061234567'
AND completion_status = 'active';

-- Update quiz user status
UPDATE quiz_users
SET status = 'ended'
WHERE phone_number = '+242061234567'
AND status = 'active';
```

---

## Verification Checklist

Use this checklist to verify the deployment:

### Pre-Deployment
- [ ] Frontend build successful (`npm run build`)
- [ ] No TypeScript errors
- [ ] All files committed to repository

### Deployment
- [ ] `webhook-handler` deployed successfully
- [ ] `whatsapp-chatbot` deployed successfully
- [ ] Both Edge Functions accessible via curl

### Configuration
- [ ] WhatsApp webhook URL verified
- [ ] WhatsApp access token valid
- [ ] Quiz questions exist in database
- [ ] Groq API key configured

### Testing
- [ ] Campaign invitation sends successfully
- [ ] User receives invitation on WhatsApp
- [ ] User replies "Game" → receives welcome + Q1
- [ ] User answers Q1 → receives Q2
- [ ] Quiz progresses through all questions
- [ ] Quiz completion message received
- [ ] Data saved to database correctly
- [ ] Alternative keywords work (quiz, jeu, play)
- [ ] Customer service messages still work
- [ ] Edge Function logs show correct routing

### Monitoring
- [ ] Edge Function logs monitored for errors
- [ ] Database queries show quiz data
- [ ] No "I did not understand" responses
- [ ] User experience is smooth

---

## Success Metrics

### Before Deployment
- ❌ Users get "I did not understand" when replying "Game"
- ❌ No quiz sessions created
- ❌ No quiz data saved
- ❌ 0% quiz completion rate
- ❌ Frustrated users

### After Deployment
- ✅ Users receive welcome + first question
- ✅ Quiz sessions created successfully
- ✅ Quiz answers saved to database
- ✅ Users can complete full quiz
- ✅ Quiz completion rate tracking works
- ✅ Great user experience

---

## Rollback Procedure

If critical issues occur:

### Immediate Rollback

```bash
# Option 1: Deploy previous version from git
git checkout [previous-commit-hash]
supabase functions deploy webhook-handler
supabase functions deploy whatsapp-chatbot

# Option 2: Disable quiz routing temporarily
# (manually edit and deploy a version that always routes to customer service)
```

### Investigation

1. Check Edge Function logs for errors
2. Review database for data corruption
3. Test with specific phone numbers
4. Identify root cause

### Fix and Redeploy

1. Fix identified issues locally
2. Test thoroughly
3. Commit fixes
4. Redeploy:
   ```bash
   supabase functions deploy webhook-handler
   supabase functions deploy whatsapp-chatbot
   ```
5. Monitor closely

---

## Support and Documentation

### Key Documents

1. **ARCHITECTURAL_ANALYSIS_QUIZ_VS_CUSTOMER_SERVICE.md** - Complete architectural analysis
2. **UNIFIED_ARCHITECTURE_SOLUTION.md** - Solution design
3. **QUIZ_CHATBOT_ARCHITECTURE_FIX.md** - First implementation attempt
4. **This file (DEPLOYMENT_GUIDE_QUIZ_FIX.md)** - Deployment instructions

### Database Schema

```sql
-- Quiz tables
quiz_users        -- User information and progress
quiz_sessions     -- Quiz session tracking
quiz_questions    -- Quiz questions and answers
quiz_answers      -- User answers and scores

-- Communication tables
customer_conversations  -- Message history
message_logs           -- WhatsApp message logs

-- Configuration tables
user_whatsapp_config   -- WhatsApp credentials
user_groq_config       -- Groq API configuration
```

### Edge Functions

```
supabase/functions/
├── _shared/
│   └── quiz-processor.ts      -- Shared quiz logic
├── webhook-handler/
│   └── index.ts               -- WhatsApp webhook (recommended)
└── whatsapp-chatbot/
    └── index.ts               -- Alternative endpoint
```

---

## Next Steps After Deployment

### Monitor for 24 Hours

1. Watch Edge Function logs
2. Check database for quiz data
3. Monitor user complaints
4. Track quiz completion rates

### Gather Metrics

```sql
-- Quiz starts today
SELECT COUNT(*) as quiz_starts_today
FROM quiz_sessions
WHERE DATE(created_at) = CURRENT_DATE;

-- Quiz completions today
SELECT COUNT(*) as quiz_completions_today
FROM quiz_sessions
WHERE DATE(end_time) = CURRENT_DATE
AND completion_status = 'completed';

-- Average score today
SELECT AVG(score) as avg_score_today
FROM quiz_users
WHERE DATE(updated_at) = CURRENT_DATE
AND status = 'completed';

-- Completion rate
SELECT
  COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) * 100.0 / COUNT(*) as completion_rate
FROM quiz_sessions
WHERE DATE(created_at) = CURRENT_DATE;
```

### Optimize if Needed

Based on metrics, consider:
- Adjusting quiz questions
- Improving response times
- Adding more quiz content
- Enhancing user experience

---

## Conclusion

This deployment fixes the fundamental architectural issue where quiz messages were being handled by generic AI instead of the actual quiz system.

**Key Changes:**
1. Both Edge Functions now use shared quiz processor
2. Smart routing based on keywords and active sessions
3. Real quiz logic with database queries
4. Proper state management and progress tracking

**Expected Outcome:**
Users will successfully interact with the quiz system, receiving actual quiz questions and being able to complete the full quiz experience.

**Status:** ✅ **READY FOR DEPLOYMENT**

Deploy the Edge Functions and test with real users to verify the fix works correctly!
