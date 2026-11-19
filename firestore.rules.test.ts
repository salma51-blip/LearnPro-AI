// Security Rules Verification Suite (Dirty Dozen Adversarial Tests)
// Run against Firebase Emulator if installed locally.
export const dirtyDozenSecuritySpec = [
  { id: 1, name: 'Unauthenticated Read', path: 'textbooks/tb-1', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified Email Admin Spoof', path: 'textbooks/tb-1', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Unfiltered List Scrape', path: 'assessments', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Cross-Tenant PII Leak', path: 'users/userB/private/info', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Identity Spoofing on Create', path: 'textbooks/tb-evil', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Teacher Privilege Escalation / Shadow Field', path: 'users/userA', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Orphaned Subcollection Write', path: 'textbooks/missing/chapters/c1', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Cross-Tenant Subcollection Hijack', path: 'tutorSessions/sB/messages/m1', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'ID Poisoning (>128 chars)', path: 'mistakes/long_id', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Client Timestamp Forgery', path: 'assessments/a1', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Value Poisoning on Revision Update', path: 'revisions/r1', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Unauthorized Classroom Broadcast by Student', path: 'textbooks/tb-spam', expected: 'PERMISSION_DENIED' },
];
