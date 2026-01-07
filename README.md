# APIgraveyard 🪦

```
    ___    ____  ____                                                __
   /   |  / __ \/  _/___ __________ __   _____  __  ______ __________/ /
  / /| | / /_/ // // __ `/ ___/ __ `/ | / / _ \/ / / / __ `/ ___/ __  / 
 / ___ |/ ____// // /_/ / /  / /_/ /| |/ /  __/ /_/ / /_/ / /  / /_/ /  
/_/  |_/_/   /___/\__, /_/   \__,_/ |___/\___/\__, /\__,_/_/   \__,_/   
                 /____/                      /____/                     
                                                          🪦 RIP APIs 🪦
```

<p align="center">
  <strong>Never lose track of your scattered API keys</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/apigraveyard"><img src="https://img.shields.io/npm/v/apigraveyard.svg?style=flat-square" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://github.com/yourusername/apigraveyard/actions"><img src="https://img.shields.io/github/actions/workflow/status/yourusername/apigraveyard/ci.yml?style=flat-square" alt="Build Status"></a>
  <a href="https://github.com/yourusername/apigraveyard"><img src="https://img.shields.io/github/stars/yourusername/apigraveyard?style=flat-square" alt="GitHub Stars"></a>
</p>

---

## 😱 The Problem

We've all been there:

- 🔑 You have API keys scattered across **10+ different projects**
- ❓ Some are **expired**, some have **maxed quotas** — but which ones?
- 🤷 You have **no idea** which key is in which project
- 😰 You've accidentally **committed keys to GitHub** (or almost did)
- 📝 Your `.env.example` says `OPENAI_API_KEY=your-key-here` but you can't remember where the actual key is

**APIgraveyard** solves all of this. It's like a cemetery for your API keys — but in a good way. 🪦

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔍 **Deep Scanning** | Scans entire projects for exposed API keys using regex patterns |
| ✅ **Key Validation** | Tests if your keys are still valid by calling the actual APIs |
| 📊 **Quota Tracking** | Shows remaining quota, rate limits, and usage info |
| 🚫 **Git Protection** | Pre-commit hook blocks commits containing API keys |
| 💾 **Central Database** | Stores all found keys in one local database (`~/.apigraveyard.json`) |
| 🎨 **Beautiful UI** | Color-coded tables, spinners, and formatted output |
| 🔒 **Privacy First** | Everything stays local — no cloud, no telemetry |

---

## 🔐 Supported Services

APIgraveyard can detect and validate keys from these services:

| Service | Pattern | Validation |
|---------|---------|------------|
| **OpenAI** | `sk-...` (48 chars) | ✅ Full validation + models list |
| **Anthropic** | `sk-ant-...` (95 chars) | ✅ Full validation |
| **Groq** | `gsk_...` (52 chars) | ✅ Full validation + models list |
| **GitHub** | `ghp_` / `ghs_...` (36 chars) | ✅ Full validation + rate limits |
| **Stripe** | `sk_live_` / `sk_test_...` | ✅ Full validation + balance |
| **Google/Firebase** | `AIza...` (35 chars) | ✅ Token info validation |
| **AWS** | `AKIA...` (16 chars) | ⚠️ Format validation only |
| **Hugging Face** | `hf_...` (34 chars) | ✅ Full validation + user info |

---

## 📦 Installation

### Global Installation (Recommended)

```bash
npm install -g apigraveyard
```

### Local Installation

```bash
npm install apigraveyard --save-dev
```

### Verify Installation

```bash
apigraveyard --version
```

---

## 🚀 Quick Start

### 1. Scan a Project

```bash
# Scan your project for API keys
apigraveyard scan ~/projects/my-app

# Scan and test keys immediately
apigraveyard scan ~/projects/my-app --test
```

### 2. Test Your Keys

```bash
# Test all keys from all projects
apigraveyard test

# Test keys from a specific project
apigraveyard test ~/projects/my-app
```

### 3. List All Projects

```bash
# See all scanned projects
apigraveyard list

# With database statistics
apigraveyard list --stats
```

---

## 📸 Usage Examples

### Scanning a Project

```bash
$ apigraveyard scan ./my-project --test
```

**Output:**
```
🪦 APIgraveyard

📊 Scan Results
────────────────────────────────────────────────────────────────
┌─────────────────┬─────────────────────────┬──────────────────────────────┬────────┬───────────────┐
│ Service         │ Key                     │ File                         │ Line   │ Status        │
├─────────────────┼─────────────────────────┼──────────────────────────────┼────────┼───────────────┤
│ OpenAI          │ sk-a***...***xyz        │ src/config.js                │ 23     │ ✅ VALID      │
│ GitHub          │ ghp_***...***abc        │ .env.local                   │ 5      │ ✅ VALID      │
│ Stripe          │ sk_t***...***def        │ lib/payment.js               │ 45     │ ❌ INVALID    │
└─────────────────┴─────────────────────────┴──────────────────────────────┴────────┴───────────────┘

📈 Summary
────────────────────────────────────────────────────────────────
Total keys found: 3
Files scanned: 156

By service:
  OpenAI: 1
  GitHub: 1
  Stripe: 1
```

### Testing Keys

```bash
$ apigraveyard test
```

**Output:**
```
🧪 Test Results
──────────────────────────────────────────────────────────────────────────
┌─────────────────┬──────────────────────┬──────────────────┬──────────────────────┬──────────────────────┐
│ Service         │ Key                  │ Status           │ Details              │ Last Tested          │
├─────────────────┼──────────────────────┼──────────────────┼──────────────────────┼──────────────────────┤
│ OpenAI          │ sk-a***...***xyz     │ ✅ VALID         │ 15 models            │ 1/7/2026, 10:30 AM   │
│ GitHub          │ ghp_***...***abc     │ ✅ VALID         │ @username            │ 1/7/2026, 10:30 AM   │
│ Stripe          │ sk_t***...***def     │ ❌ INVALID       │ -                    │ 1/7/2026, 10:30 AM   │
└─────────────────┴──────────────────────┴──────────────────┴──────────────────────┴──────────────────────┘

Summary:
  ✅ VALID: 2
  ❌ INVALID: 1
```

### Project List

```bash
$ apigraveyard list
```

**Output:**
```
📁 Tracked Projects
──────────────────────────────────────────────────────────────────────────

1. my-app (/home/user/projects/my-app)
   🔑 3 keys (2 valid) • Last scanned: 1/7/2026, 10:30 AM

2. blog-backend (/home/user/projects/blog-backend)
   🔑 1 keys (1 valid) • Last scanned: 1/6/2026, 3:45 PM

──────────────────────────────────────────────────────────────────────────
Total: 2 project(s)
```

---

## 📖 Commands Reference

### `apigraveyard scan <directory>`

Scan a directory for exposed API keys.

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --recursive` | Scan subdirectories | `true` |
| `-t, --test` | Test keys after scanning | `false` |
| `-i, --ignore <patterns...>` | Additional patterns to ignore | `[]` |

```bash
# Examples
apigraveyard scan .
apigraveyard scan ~/projects/my-app --test
apigraveyard scan . --ignore "*.test.js" "fixtures"
```

### `apigraveyard test [project-path]`

Test validity of stored API keys.

```bash
# Test all projects
apigraveyard test

# Test specific project
apigraveyard test ~/projects/my-app
```

### `apigraveyard list`

List all scanned projects.

| Option | Description |
|--------|-------------|
| `-s, --stats` | Show database statistics |

```bash
apigraveyard list
apigraveyard list --stats
```

### `apigraveyard show <project-path>`

Show detailed info for a project.

| Option | Description |
|--------|-------------|
| `-k, --key <index>` | Show details for specific key |

```bash
apigraveyard show ~/projects/my-app
apigraveyard show ~/projects/my-app --key 0
```

### `apigraveyard clean`

Remove invalid/expired keys from database.

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |

```bash
apigraveyard clean
apigraveyard clean --force
```

### `apigraveyard export`

Export all keys to a file.

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format` | Output format (`json` or `csv`) | `json` |
| `-o, --output` | Output file path | `apigraveyard-export.{format}` |
| `--include-full-keys` | Include unmasked keys (dangerous!) | `false` |

```bash
apigraveyard export
apigraveyard export --format csv --output my-keys.csv
```

### `apigraveyard ban <key>`

Mark an API key as compromised/banned.

| Option | Description |
|--------|-------------|
| `-d, --delete` | Offer to delete from files |

```bash
apigraveyard ban sk-compromised-key-here
```

### `apigraveyard delete <project-path>`

Remove a project from tracking.

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |

```bash
apigraveyard delete ~/projects/old-project
```

### `apigraveyard stats`

Show database statistics.

```bash
apigraveyard stats
```

---

## 🔒 Git Hook Setup

APIgraveyard includes a pre-commit hook that prevents accidentally committing API keys.

### Automatic Installation

The hook is automatically installed when you run `npm install` in a project with APIgraveyard as a dependency.

### Manual Installation

```bash
# If installed globally
npm run install-hooks

# Or copy manually
cp node_modules/apigraveyard/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### What It Does

When you try to commit, the hook:

1. ✅ Scans all staged files for API key patterns
2. ✅ Warns about sensitive files (`.env`, `*.pem`, etc.)
3. ❌ **Blocks the commit** if keys are found
4. 💡 Shows suggestions for fixing the issue

**Example blocked commit:**
```
❌ COMMIT BLOCKED - API Keys Detected!

Found in: src/config.js (line 23)
  OpenAI key: sk-a***...***xyz

Suggested fixes:
  1. Move keys to .env file
  2. Add .env to .gitignore
  3. Unstage the file(s):
     git reset HEAD src/config.js

To bypass (NOT recommended):
  git commit --no-verify
```

### Uninstall Hook

```bash
node node_modules/apigraveyard/scripts/install-hooks.js --uninstall
```

---

## ❓ FAQ

### Where is my data stored?

All data is stored locally in `~/.apigraveyard.json`. Nothing is sent to any server.

### Is it secure?

- ✅ All data stays on your machine
- ✅ No network requests except for key validation
- ✅ Keys are masked in all output
- ✅ Export with full keys requires explicit flag
- ✅ No telemetry or analytics

### How do I uninstall?

```bash
# Remove the package
npm uninstall -g apigraveyard

# Optionally remove the database
rm ~/.apigraveyard.json
rm ~/.apigraveyard.backup.json
rm ~/.apigraveyard.log
```

### Can I use it in CI/CD?

Yes! You can run scans in CI to detect committed keys:

```bash
apigraveyard scan . && echo "No keys found" || exit 1
```

### What files are ignored?

By default, these are ignored:
- `node_modules/`
- `.git/`
- `dist/`, `build/`, `.next/`
- `venv/`
- `package-lock.json`, `yarn.lock`
- `.env.example`, `.env.sample`

---

## 🗺️ Roadmap

We're actively working on making APIgraveyard even better:

- [ ] 🔌 **More Services** — Support for Azure, DigitalOcean, Twilio, SendGrid, etc.
- [ ] ☁️ **Cloud Sync** — Optional encrypted cloud backup
- [ ] 👥 **Team Sharing** — Share key inventories with your team
- [ ] 🌐 **Browser Extension** — Detect keys on GitHub, GitLab, etc.
- [ ] 📱 **VS Code Extension** — Real-time key detection in your editor
- [ ] 🔔 **Expiry Alerts** — Get notified before keys expire
- [ ] 📈 **Usage Analytics** — Track API usage across projects

Have a feature request? [Open an issue](https://github.com/yourusername/apigraveyard/issues)!

---

## 🤝 Contributing

We love contributions! Here's how you can help:

### Reporting Bugs

1. Check if the issue already exists
2. Open a new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, Node version)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests if applicable
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/apigraveyard.git
cd apigraveyard

# Install dependencies
npm install

# Run locally
node bin/apigraveyard.js --help

# Link for global testing
npm link
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Your Name**
- GitHub: [@yourusername](https://github.com/yourusername)
- Twitter: [@yourtwitter](https://twitter.com/yourtwitter)

---

<p align="center">
  Made with ❤️ and a healthy fear of exposed API keys
</p>

<p align="center">
  <strong>🪦 Rest in peace, scattered API keys. 🪦</strong>
</p>
