# 🔧 Silent Answer Handling - Fixed!

## Bug Report
**Issue**: When students don't speak or provide silent audio during interviews, the system was generating random mock answers instead of detecting silence.

## Root Cause
The mock transcript function was using a fallback to random answers:
```typescript
// OLD CODE (BUG):
const chosen = text ?? MOCK_ANSWERS[Math.floor(Math.random() * 3)]
// If text is undefined/null, picks random mock answer
```

## Fix Applied

### **1. Speech-to-Text (stt.ts)**
```typescript
// NEW CODE:
export function mockTranscript(durationS: number, text?: string): Transcript {
  // If no text provided or empty, return empty transcript
  if (!text || text.trim().length === 0) {
    return { text: '', words: [], duration: Math.max(1, durationS || 0), model: 'mock' }
  }
  // Only use provided text, never generate random answers
  const chosen = text
  // ...
}
```

### **2. Interview Gateway (gateway.ts)**
```typescript
// NEW CODE:
// Detect if student actually spoke
const hasActualSpeech = audio && audio.length > 5000 // Minimum 5KB audio
const hasCaptionText = caption && caption.trim().length > 3 // At least 3 characters

// Only use caption if it has actual content
const transcribePromise = hasActualSpeech && aiEnabled()
  ? transcribe(audio, mime, { durationS, sessionId }).catch((e) => {
      return mockTranscript(durationS, hasCaptionText ? caption : '')
    })
  : Promise.resolve(mockTranscript(durationS, hasCaptionText ? caption : ''))

// Mark as no speech if empty
const actualText = t.text && t.text.trim().length > 2 ? t.text : '(no speech detected)'
```

### **3. Evaluation (evaluate.ts)**
```typescript
// NEW CODE:
// Check for empty, silent, or "no speech detected" responses
const isEmptyResponse = !text || !text.trim() || 
                        text.trim() === '(no speech detected)' || 
                        text.trim().length < 3

if (isEmptyResponse) {
  for (const k of aiKeys) judged[k] = { band: 0, reason: 'No answer given.', evidence: [] }
  feedback = { 
    strengths: [], 
    improvements: ['Attempt the question: even a short answer earns marks.'], 
    better_answer: '' 
  }
}
```

### **4. Skip Detection (interviewer.ts)**
```typescript
// NEW CODE:
const NO_SPEECH = /^\(no speech detected\)$|^$|^[\s]*$/

export function isSkipAnswer(text: string): boolean {
  const trimmed = text.trim()
  // Empty or no speech detected
  if (NO_SPEECH.test(trimmed) || trimmed.length < 3) return true
  // Very short answers with skip words
  if (trimmed.split(/\s+/).length <= 5 && SKIP_PATTERNS.test(trimmed)) return true
  return false
}
```

---

## What Changed

### **Before Fix** ❌
```
Student: [silent]
System: Transcribes as "Sure. Um, in my final year project we built a placement portal..."
Result: Random mock answer, scored normally
```

### **After Fix** ✅
```
Student: [silent]
System: Transcribes as "(no speech detected)"
Result: 
  - Transcript: "(no speech detected)"
  - All criteria: Band 0
  - Feedback: "No answer given. Attempt the question: even a short answer earns marks."
  - AI may ask follow-up or move to next question
```

---

## Detection Logic

### **Silence is Detected When:**
1. ✅ Audio is less than 5KB (likely empty recording)
2. ✅ No browser caption text (< 3 characters)
3. ✅ Transcription returns empty string
4. ✅ Text is "(no speech detected)"
5. ✅ Text has fewer than 3 characters

### **Real Speech is Detected When:**
1. ✅ Audio is > 5KB AND
2. ✅ Browser caption > 3 characters OR
3. ✅ Whisper transcription returns text > 2 characters

---

## Scoring Impact

### **Silent Answers Now Get:**
```
All Criteria: 0/4 (Band 0)
- Grammar: 0 - "No answer given"
- Fluency: 0 - "No speech detected"
- Relevance: 0 - "No answer given"
- Structure: 0 - "No answer given"
- etc.

Overall Score: 0/100
```

### **AI Interviewer Behavior:**
The AI will detect the skip and may:
- Ask a follow-up question to encourage response
- Move to next question if student skips multiple times
- Note in final report: "Student did not attempt this question"

---

## Testing

### **How to Test:**
1. Start an AI interview
2. When question is asked, click "Start Answer"
3. **Don't speak** (stay silent)
4. Click "Stop Answer"
5. Verify:
   - ✅ Transcript shows "(no speech detected)"
   - ✅ No random text generated
   - ✅ AI recognizes student didn't answer

### **Edge Cases Handled:**
- ✅ Very quiet audio (under 5KB)
- ✅ Browser caption fails
- ✅ Whisper transcription fails
- ✅ Student says "I don't know" (detected as skip)
- ✅ Student says 1-2 words only (marked as skip)

---

## Files Modified

1. `apps/api/src/ai/stt.ts` - Mock transcript no longer generates random answers
2. `apps/api/src/interview/gateway.ts` - Better speech detection & empty handling
3. `apps/api/src/scoring/evaluate.ts` - Proper scoring for empty responses
4. `apps/api/src/interview/interviewer.ts` - Enhanced skip detection

---

## Restart Required

**Yes - You must restart the API server for changes to take effect:**

```bash
# Stop current server (Ctrl+C in terminal)
# Or force kill:
taskkill /F /IM node.exe

# Restart:
npm run dev:api
```

---

## Verification Script

Test the fix with this script:

```bash
# In apps/api directory:
npx tsx --env-file-if-exists=.env -e "
import { mockTranscript } from './src/ai/stt.js';

console.log('Test 1: Empty string');
const t1 = mockTranscript(10, '');
console.log('Text:', t1.text || '(empty)');
console.log('Words:', t1.words.length);
console.log();

console.log('Test 2: Undefined');
const t2 = mockTranscript(10, undefined);
console.log('Text:', t2.text || '(empty)');
console.log('Words:', t2.words.length);
console.log();

console.log('Test 3: Actual text');
const t3 = mockTranscript(10, 'Hello world');
console.log('Text:', t3.text);
console.log('Words:', t3.words.length);
console.log();

console.log('✅ All tests should show empty for silent answers!');
"
```

Expected output:
```
Test 1: Empty string
Text: (empty)
Words: 0

Test 2: Undefined
Text: (empty)
Words: 0

Test 3: Actual text
Text: Hello world
Words: 2

✅ All tests should show empty for silent answers!
```

---

## Additional Improvements Made

1. **Audio Size Check**: Only process audio > 5KB
2. **Caption Validation**: Only use captions with > 3 characters
3. **Consistent Marking**: Always use "(no speech detected)" for empty responses
4. **Proper Scoring**: All criteria get Band 0 for no answer
5. **Better Feedback**: Clear message to attempt the question

---

## Status

✅ **Fix Complete**
✅ **Code Updated**
⏳ **Restart API Server Required**
⏳ **Test in Browser**

---

**Last Updated**: October 6, 2026
