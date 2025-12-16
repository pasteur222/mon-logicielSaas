# WhatsApp Media Delivery - Testing & Monitoring Guide

## Quick Reference
- **Status:** Fixed and Ready for Testing
- **Fix Date:** December 15, 2024
- **Critical Bug:** Media not being passed to API (FIXED)
- **Testing Priority:** HIGH

---

## What Was Fixed

### 1. Media Parameter Now Passed (CRITICAL FIX)
**Before:**
```typescript
// ❌ Media was ignored
messagesToSend = numbers.map(phoneNumber => ({
  phoneNumber,
  message
}));
```

**After:**
```typescript
// ✅ Media is now included
const mediaToSend = mediaFile ? {
  type: mediaFile.type,
  url: mediaFile.url
} : undefined;

messagesToSend = numbers.map(phoneNumber => ({
  phoneNumber,
  message,
  media: mediaToSend
}));
```

### 2. Form Reset After Send
- Media is now cleared after successful send
- Prevents accidentally resending same media

### 3. Enhanced Logging
- Message logs now track media metadata
- Database stores: `has_media`, `media_type`, `media_url`
- Console logs show media information at each step

### 4. Media Validation
- Validates media URL exists before sending
- Checks URL accessibility
- Shows appropriate error messages

---

## Testing Checklist

### Phase 1: Basic Functionality Tests

#### Test 1.1: Text-Only Message (Baseline)
**Purpose:** Ensure text messages still work
```
Steps:
1. Login to WhatsApp module
2. Enter message: "Test text only"
3. Enter phone number: +221XXXXXXXXX
4. Click Send
5. Verify success message appears

Expected Result: ✅ Message delivered successfully

Console Check:
- Look for: "📤 [WHATSAPP-UI] Sending messages with media: { hasMedia: false }"
```

#### Test 1.2: Image + Text Message
**Purpose:** Test image delivery
```
Steps:
1. Click "Télécharger un média"
2. Select a JPG/PNG image (< 5MB)
3. Wait for upload confirmation
4. Enter message: "Test avec image"
5. Enter phone number: +221XXXXXXXXX
6. Click Send

Expected Result:
✅ Success message shows "avec image"
✅ Recipient receives image with caption
✅ Media clears from form after send

Console Check:
- Look for: "📤 [WHATSAPP-UI] Sending messages with media: { hasMedia: true, mediaType: 'image' }"
- Look for: "🖼️ [WHATSAPP-SEND] Adding media to message"
- Look for: "✅ [WHATSAPP-SEND] Media URL validated"
- Look for: "✅ [WHATSAPP-SEND] Message logged to database"
```

#### Test 1.3: Video + Text Message
**Purpose:** Test video delivery
```
Steps:
1. Click "Télécharger un média"
2. Select a MP4 video (< 16MB)
3. Wait for upload confirmation
4. Enter message: "Test avec vidéo"
5. Enter phone number: +221XXXXXXXXX
6. Click Send

Expected Result:
✅ Success message shows "avec video"
✅ Recipient receives video with caption
✅ Media clears from form after send

Console Check:
- Look for media type: "video" in logs
```

#### Test 1.4: PDF + Text Message
**Purpose:** Test document delivery
```
Steps:
1. Click "Télécharger un média"
2. Select a PDF document (< 100MB)
3. Wait for upload confirmation
4. Enter message: "Test avec PDF"
5. Enter phone number: +221XXXXXXXXX
6. Click Send

Expected Result:
✅ Success message shows "avec document"
✅ Recipient receives PDF with caption
✅ Media clears from form after send

Console Check:
- Look for media type: "document" in logs
```

#### Test 1.5: Image Without Text
**Purpose:** Test media-only message
```
Steps:
1. Upload an image
2. Leave message field EMPTY
3. Enter phone number: +221XXXXXXXXX
4. Click Send

Expected Result:
✅ Message sends successfully
✅ Recipient receives image only (no caption)
```

### Phase 2: Error Handling Tests

#### Test 2.1: Invalid File Type
**Purpose:** Verify file type validation
```
Steps:
1. Try to upload an .exe or .zip file
2. Check if file selector blocks it

Expected Result:
❌ File selector should not accept invalid types
```

#### Test 2.2: Oversized File
**Purpose:** Test file size limits
```
Steps:
1. Upload a very large image (> 10MB)
2. Wait for upload

Expected Result:
- May succeed or fail depending on Supabase limits
- Should show appropriate error if fails
```

#### Test 2.3: Network Failure During Upload
**Purpose:** Test error handling
```
Steps:
1. Start uploading a file
2. Disconnect internet briefly
3. Observe error message

Expected Result:
❌ Shows upload error
✅ Does not allow sending incomplete media
```

#### Test 2.4: Send Without Media After Upload Failure
**Purpose:** Verify system recovers from errors
```
Steps:
1. Try to upload file (let it fail)
2. Remove the failed media
3. Enter text message only
4. Send

Expected Result:
✅ Text message sends successfully
✅ No remnants of failed media
```

### Phase 3: Bulk Send Tests

#### Test 3.1: Image to Multiple Recipients
**Purpose:** Test media delivery at scale
```
Steps:
1. Upload an image
2. Enter message: "Broadcast test"
3. Enter 3 phone numbers (one per line)
4. Click Send

Expected Result:
✅ All 3 recipients receive the image
✅ Success message shows "3 message(s) envoyé(s) avec succès avec image"

Database Check:
- Query: SELECT * FROM message_logs WHERE message_preview LIKE '[IMAGE]%' ORDER BY created_at DESC LIMIT 3
- Verify 3 entries with same media_url in metadata
```

#### Test 3.2: CSV Import with Media
**Purpose:** Test bulk upload + media
```
Steps:
1. Upload an image
2. Click "Import en masse"
3. Upload CSV with multiple contacts
4. Send

Expected Result:
✅ All contacts receive the same media
✅ Media is not duplicated in storage
```

### Phase 4: Database Verification

#### Test 4.1: Check Message Logs
**SQL Query:**
```sql
-- View recent media messages
SELECT
  phone_number,
  message_preview,
  status,
  metadata->>'media_type' as media_type,
  metadata->>'has_media' as has_media,
  created_at
FROM message_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected Result:**
- Messages with media show `[IMAGE]`, `[VIDEO]`, or `[DOCUMENT]` prefix
- `has_media` is `true` for media messages
- `media_type` is populated
- `media_url` exists in metadata

#### Test 4.2: Use Media Statistics Function
**SQL Query:**
```sql
-- Get media statistics for last 24 hours
SELECT * FROM get_media_message_stats(
  NOW() - INTERVAL '24 hours',
  NOW()
);
```

**Expected Result:**
- Shows accurate counts of media messages
- Breaks down by type (image, video, document)
- Shows success rate

#### Test 4.3: Query Media Messages
**SQL Query:**
```sql
-- Find all image messages
SELECT * FROM message_logs_with_media
WHERE has_media = true
  AND media_type = 'image'
  AND created_at > NOW() - INTERVAL '1 day';
```

**Expected Result:**
- Returns only image messages
- View provides clean access to media info

---

## Monitoring & Debugging

### Console Log Patterns

#### Successful Media Send Flow:
```
📤 [WHATSAPP-UI] Sending messages with media: { messageCount: 1, hasMedia: true, mediaType: 'image' }
📨 [WHATSAPP-SEND] Sending message 1/1: { to: '+221...', messageLength: 10, hasMedia: true }
🖼️ [WHATSAPP-SEND] Adding media to message: { type: 'image', url: 'https://...' }
✅ [WHATSAPP-SEND] Media URL validated: { url: 'https://...', contentType: 'image/jpeg', status: 200 }
🚀 [WHATSAPP-SEND] Calling WhatsApp API for message 1
✅ [WHATSAPP-SEND] Message 1 sent successfully: { messageId: 'wamid...', to: '+221...' }
✅ [WHATSAPP-SEND] Message logged to database: { messageId: 'wamid...', hasMedia: true, mediaType: 'image' }
```

#### Failed Media Send (URL Issue):
```
📤 [WHATSAPP-UI] Sending messages with media: { messageCount: 1, hasMedia: true, mediaType: 'image' }
📨 [WHATSAPP-SEND] Sending message 1/1: { to: '+221...', messageLength: 10, hasMedia: true }
🖼️ [WHATSAPP-SEND] Adding media to message: { type: 'image', url: 'https://...' }
❌ [WHATSAPP-SEND] Invalid media URL: { url: 'https://...', error: 'Media URL not accessible: 404' }
❌ [WHATSAPP-SEND] Error sending to +221...: { error: 'Invalid media URL: ...' }
```

### Debug Queries

#### 1. Check Recent Media Messages
```sql
SELECT
  id,
  status,
  phone_number,
  message_preview,
  metadata->'media_type' as media_type,
  metadata->'media_url' as media_url,
  created_at
FROM message_logs
WHERE (metadata->>'has_media')::boolean = true
ORDER BY created_at DESC
LIMIT 20;
```

#### 2. Find Failed Media Sends
```sql
SELECT
  id,
  phone_number,
  message_preview,
  error,
  metadata->'media_url' as attempted_media_url,
  created_at
FROM message_logs
WHERE status = 'error'
  AND (metadata->>'has_media')::boolean = true
ORDER BY created_at DESC;
```

#### 3. Media Delivery Success Rate
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'sent') as successful_media,
  COUNT(*) FILTER (WHERE status = 'error') as failed_media,
  COUNT(*) as total_media,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'sent')::numeric / COUNT(*)) * 100,
    2
  ) as success_rate_percent
FROM message_logs
WHERE (metadata->>'has_media')::boolean = true
  AND created_at > NOW() - INTERVAL '7 days';
```

#### 4. Media Type Distribution
```sql
SELECT
  metadata->>'media_type' as media_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'sent') as successful,
  COUNT(*) FILTER (WHERE status = 'error') as failed
FROM message_logs
WHERE (metadata->>'has_media')::boolean = true
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY metadata->>'media_type';
```

---

## Performance Monitoring

### Key Metrics to Track

1. **Media Upload Success Rate**
   - Target: > 95%
   - Alert if: < 90%

2. **Media Delivery Success Rate**
   - Target: > 98%
   - Alert if: < 95%

3. **Average Upload Time**
   - Target: < 5 seconds
   - Alert if: > 10 seconds

4. **Media URL Accessibility**
   - Target: 100%
   - Alert if: < 99%

### Monitoring Dashboard (Recommended)

Create a simple monitoring view showing:
- Total messages sent (last 24h)
- Media messages sent (last 24h)
- Media type breakdown
- Success rate (text vs media)
- Recent failures

---

## Troubleshooting Guide

### Issue: "Media not received by recipient"

**Check:**
1. Console logs - Did media validation pass?
2. Database - Is `has_media` true in message_logs?
3. WhatsApp API response - Any errors?
4. Media URL - Is it publicly accessible?

**Solutions:**
- Verify Supabase Storage bucket is public
- Check WhatsApp Business API permissions
- Verify file size within WhatsApp limits
- Check internet connectivity

### Issue: "Upload button not working"

**Check:**
1. Browser console for errors
2. Supabase connection
3. File size and type

**Solutions:**
- Clear browser cache
- Check Supabase credentials
- Try different file

### Issue: "Media shows in preview but not sent"

**Check:**
1. Console logs for media parameter
2. Network tab for API call payload

**This was the original bug - should now be fixed!**

### Issue: "Form doesn't clear after send"

**Check:**
1. `setMediaFile(null)` is called in success handler
2. No errors during send

**This was also fixed!**

---

## Rollback Plan

If critical issues are discovered:

1. **Immediate:** Disable media upload button in UI
```typescript
// In WhatsApp.tsx, temporarily hide media upload section
{false && (
  <div>
    <label>Média...</label>
    // ... media upload UI
  </div>
)}
```

2. **Revert Changes:**
```bash
git revert <commit-hash>
```

3. **Database:** Migration can stay (it's additive, not destructive)

---

## Success Criteria

All tests pass when:
- ✅ Text messages work
- ✅ Images deliver with caption
- ✅ Videos deliver with caption
- ✅ PDFs deliver with caption
- ✅ Media-only messages work
- ✅ Form clears after send
- ✅ Database logs media correctly
- ✅ Console logs show proper flow
- ✅ Bulk sends work with media
- ✅ Error messages are clear
- ✅ No silent failures

---

## Next Steps After Testing

1. **Monitor production logs for 48 hours**
2. **Check database for media message patterns**
3. **Gather user feedback**
4. **Update documentation with learnings**
5. **Consider adding:**
   - Image preview in sent messages
   - Media gallery view
   - Analytics dashboard for media usage
   - Media compression options

---

## Contact for Issues

- Check console logs first
- Review database message_logs table
- Use the debug queries above
- Document exact steps to reproduce

**Remember:** The core bug was media not being passed to the API. This is now fixed, but comprehensive testing will ensure no edge cases remain.
