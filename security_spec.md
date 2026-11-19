# LearnPro AI — Security Specification & Threat Model

## 1. Data Invariants
1. **Identity Ownership & Classroom Sharing**: Every top-level learning resource (`textbooks`, `visualLessons`, `tutorSessions`, `assessments`, `mistakes`, `revisions`, `assignedPlans`) must have `ownerId == request.auth.uid` on creation and `ownerId` is strictly immutable on update. Only verified Teacher (`isAdmin()`, `salmanazeer51@gmail.com`) may publish `sharedWithClassroom: true` on `textbooks`, `chapters`, `chunks`, `visualLessons`, and `assignedPlans` so authenticated students can read teacher-uploaded curriculum without write access.
2. **Teacher Role Privilege Lock**: Non-admin users may ONLY create or update `users/{userId}` with `viewMode in ['student', 'parent']`. Assigning `viewMode: 'teacher'` strictly requires `isAdmin()`.
3. **PII Isolation**: User email and personal display name live exclusively in `/users/{userId}/private/info` and are readable/writable only by `userId == request.auth.uid` or verified admin.
4. **Master Gate Relational Sync**: Subcollections `/textbooks/{textbookId}/chapters/{chapterId}`, `/textbooks/{textbookId}/chunks/{chunkId}`, and `/tutorSessions/{sessionId}/messages/{messageId}` must verify parent existence (`exists(...)`) and parent authorization via `get(...)`.
5. **Immutable Audit Fields & Server Timestamps**: `createdAt` is immutable after creation and must equal `request.time` on creation; `updatedAt` must equal `request.time` on both creation and update.
6. **Verified Auth Only**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
7. **Path Hardening & Volumetric Bounds**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), strings enforce strict `.size()` limits, and arrays enforce bounded `.size()` limits.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read**: Anonymous client attempts `get(/textbooks/tb-1)` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: User with `email: "salmanazeer51@gmail.com"` and `email_verified: false` attempts admin read -> `PERMISSION_DENIED`.
3. **Cross-Tenant Query Scrape (`list`)**: Authenticated user lists `/assessments` without `where('ownerId', '==', uid)` -> `PERMISSION_DENIED`.
4. **PII Leak**: User A attempts `get(/users/userB/private/info)` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: User A creates `/textbooks/tb-evil` with `ownerId: "userB"` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection / Teacher Privilege Escalation**: Student updates `/users/userA` injecting `{ viewMode: "teacher" }` or `{ isAdmin: true }` -> `PERMISSION_DENIED`.
7. **Orphaned Subcollection Write**: User A creates `/textbooks/nonexistent/chapters/ch1` -> `PERMISSION_DENIED` (Master Gate `exists` fails).
8. **Cross-Tenant Subcollection Hijack**: User A creates `/tutorSessions/userB_session/messages/m1` -> `PERMISSION_DENIED` (Master Gate `get` fails).
9. **ID Poisoning**: User A writes to `/mistakes/${'a'.repeat(500)}` -> `PERMISSION_DENIED` (`isValidId` fails).
10. **Client Timestamp Forgery**: User A creates `/assessments/a1` with a backdated `createdAt` timestamp -> `PERMISSION_DENIED` (`createdAt == request.time` fails).
11. **Type/Value Poisoning on Update**: User A updates `/revisions/r1` setting `stageIndex: "ninety"` or `retentionScore: 9999` -> `PERMISSION_DENIED` (`isValidRevisionItem` fails).
12. **Unauthorized Classroom Broadcast**: Non-teacher student creates `/textbooks/tb-spam` with `sharedWithClassroom: true` -> `PERMISSION_DENIED`.
