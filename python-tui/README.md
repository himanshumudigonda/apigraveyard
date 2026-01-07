# APIgraveyard TUI 🪦

A beautiful terminal UI for finding dead APIs haunting your codebase.

Built with [Textual](https://textual.textualize.io/) and powered by [Groq](https://groq.com/) AI.

## Features

- 🔍 **Deep Scanning** - Scans projects for exposed API keys
- ✅ **Key Validation** - Tests if your keys are still valid
- 💬 **AI Assistant** - Chat with AI about API security (Groq-powered)
- 🎨 **Beautiful UI** - BrainKernel-inspired dark theme
- 💾 **Local Database** - All data stays on your machine

## Installation

```bash
pip install apigraveyard-tui
```

Or for development:

```bash
pip install -e .
```

## Usage

```bash
apigraveyard-tui
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `s` | Scan project |
| `t` | Test keys |
| `l` | List projects |
| `c` | Toggle AI chat |
| `Ctrl+s` | Settings |
| `q` | Quit |

## AI Chat

The AI assistant uses Groq's fast inference with automatic fallback between models:

1. llama-3.3-70b-versatile
2. llama-3.1-70b-versatile
3. llama-3.1-8b-instant
4. mixtral-8x7b-32768
5. gemma2-9b-it

Get your Groq API key at [console.groq.com](https://console.groq.com)

## License

MIT
