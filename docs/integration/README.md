# Getting SpeakReady data into another project

Everything about a student (scores, marks per criterion, whether they cheated, the admin's decision,
the interview transcript and malpractice photos) is available by **register number** in one call.

## What you need
1. The base URL and an API key (ask the SpeakReady admin; keys can be revoked at any time).
2. Put them in your `.env`:
   ```
   SPEAKREADY_URL=https://api.speakready.example
   SPEAKREADY_KEY=sk_live_...
   ```
   Keep the key on your server. Never put it in browser code.

## Option A: copy one file (JavaScript / Node 18+)
Copy `speakready-client.js` into your project, then:
```js
import { getStudent, getUpdatedSince } from './speakready-client.js'

const s = await getStudent('21CS045')          // null if the register number is unknown
s.readiness.score                                // 65.2
s.malpractice_confirmed                          // true / false
s.interviews[0].criteria.grammar                 // 7.5
s.interviews[0].transcript_url                   // link to transcript.json (valid 1 hour)
s.interviews[0].evidence[0].photo_url            // link to the malpractice photo (valid 1 hour)

const changed = await getUpdatedSince('2026-10-01T00:00:00Z')   // for nightly sync
```

## Option B: any language
```
curl -H "x-api-key: $SPEAKREADY_KEY" "$SPEAKREADY_URL/api/v1/external/students/21CS045"
```
Python:
```python
import os, requests
r = requests.get(f"{os.environ['SPEAKREADY_URL']}/api/v1/external/students/21CS045",
                 headers={"x-api-key": os.environ["SPEAKREADY_KEY"]}, timeout=15)
student = r.json() if r.status_code == 200 else None
```
`openapi.yaml` describes every field; tools like openapi-generator can make a typed client from it.

## Endpoints
| Call | Returns |
|---|---|
| `GET /api/v1/external/students/{register_no}` | One student report |
| `GET /api/v1/external/students?updated_since=ISO_TIME&page=N` | `{ students: [...], next_page }`, 100 per page |

Errors: `401` bad key, `404` unknown register number, `429` over 600 requests/min.

## Things to know
- `overall_score` is `null` while an interview is flagged, under review, or confirmed as cheating.
  Per-criterion marks and the full cheating record are still included.
- Photo and transcript links expire after 1 hour. Download the file if you need to keep it.
- The format is versioned (`v1`). Fields may be added but are never renamed or removed.
- Optional push: give the SpeakReady admin a webhook URL and you'll receive the same JSON
  whenever an interview is scored or a cheating review is decided.
- If you prefer SQL and have a read-only database login:
  `select * from export.student_report where register_no = '21CS045';`
  (returns file paths instead of links).
