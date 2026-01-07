# APIgraveyard Roadmap Issues

Copy and paste these into GitHub Issues at:
https://github.com/himanshumudigonda/apigraveyard/issues/new

---

## Issue 1: Support for More API Services

**Title:** [FEATURE] Add support for more API services

**Labels:** enhancement, help wanted

**Body:**
```
## 🚀 Feature Description
Add detection and validation support for more API services.

## Services to Add
- [ ] Azure (various keys)
- [ ] DigitalOcean
- [ ] Twilio
- [ ] SendGrid
- [ ] Mailchimp
- [ ] Slack
- [ ] Discord
- [ ] Replicate
- [ ] Cohere
- [ ] Mistral AI
- [ ] Together AI

## Implementation
1. Add regex patterns to `src/scanner.js`
2. Add test functions to `src/tester.js`
3. Update README with new services

## Contribution Welcome!
Feel free to pick a service and submit a PR!
```

---

## Issue 2: Cloud Sync Feature

**Title:** [FEATURE] Optional encrypted cloud sync

**Labels:** enhancement, future

**Body:**
```
## 🚀 Feature Description
Add optional encrypted cloud backup for the database.

## Use Cases
- Sync between multiple machines
- Backup important key inventory
- Disaster recovery

## Requirements
- End-to-end encryption (keys never visible to server)
- Optional - local-only should remain default
- Simple auth (GitHub OAuth?)

## Security Considerations
- Use strong encryption (AES-256)
- Never store unencrypted keys
- Allow users to self-host
```

---

## Issue 3: Team Sharing

**Title:** [FEATURE] Team sharing capabilities

**Labels:** enhancement, future

**Body:**
```
## 🚀 Feature Description
Allow teams to share API key inventories securely.

## Use Cases
- Team leads can see all keys across team projects
- Shared inventory for organization
- Revoke access when team members leave

## Proposed Features
- Team workspaces
- Role-based access (admin, member, viewer)
- Audit logs
- Key rotation reminders
```

---

## Issue 4: VS Code Extension

**Title:** [FEATURE] VS Code Extension for real-time detection

**Labels:** enhancement, good first issue

**Body:**
```
## 🚀 Feature Description
Create a VS Code extension that detects API keys in real-time.

## Features
- Highlight exposed keys in editor
- Quick actions: move to .env, add to .gitignore
- Status bar showing key count
- Integration with main CLI database

## References
- VS Code Extension API
- Similar: GitLens, Error Lens
```

---

## Issue 5: Browser Extension

**Title:** [FEATURE] Browser extension to detect keys on GitHub/GitLab

**Labels:** enhancement, future

**Body:**
```
## 🚀 Feature Description
Browser extension to scan public repositories for exposed keys.

## Use Cases
- Check if your repos have exposed keys
- Alert when viewing code with exposed keys
- Quick link to affected lines

## Platforms
- [ ] Chrome
- [ ] Firefox
- [ ] Edge
```

---

## Issue 6: Key Expiry Alerts

**Title:** [FEATURE] Key expiry notifications

**Labels:** enhancement

**Body:**
```
## 🚀 Feature Description
Get notified before API keys expire.

## Features
- Track expiry dates for keys
- Email/desktop notifications
- Integration with calendar
- Configurable reminder periods (7 days, 30 days)

## Commands
- `apigraveyard remind` - show upcoming expirations
- `apigraveyard set-expiry <key> <date>` - manually set expiry
```

---

Copy each issue above to: https://github.com/himanshumudigonda/apigraveyard/issues/new
