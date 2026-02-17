![Astreus](assets/intro.webp)

Interactive terminal interface for Astreus AI agents - a powerful CLI tool for building and interacting with AI agents.

[![npm version](https://badge.fury.io/js/@astreus-ai%2Fastreus-cli.svg)](https://badge.fury.io/js/@astreus-ai%2Fastreus-cli)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install -g @astreus-ai/astreus-cli
```

## Usage

```bash
# Start the interactive CLI
astreus

# Start with a specific model
astreus --model gpt-4o

# Start with a specific provider
astreus --provider claude
```

## Features

- **Interactive Chat**: Real-time conversation with AI agents in your terminal
- **Multi-Provider Support**: Switch between OpenAI, Claude, Gemini, and Ollama
- **File System Tools**: Built-in tools for file operations (read, write, edit, search)
- **Streaming Responses**: Real-time streaming of AI responses
- **Tool Execution**: Visual feedback for tool calls and their results
- **Context Management**: Automatic context handling for long conversations

## Commands

| Command | Description |
|---------|-------------|
| `/model <name>` | Switch to a different model |
| `/provider <name>` | Switch to a different provider |
| `/clear` | Clear conversation history |
| `/help` | Show available commands |
| `/exit` | Exit the CLI |

## Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
GOOGLE_API_KEY=...

# Ollama (local)
OLLAMA_HOST=http://localhost:11434
```

## Requirements

- Node.js >= 22.0.0
- One of the supported LLM provider API keys

## Related Packages

- [@astreus-ai/astreus](https://github.com/astreus-ai/astreus) - Core AI agent framework
- [create-astreus-agent](https://github.com/astreus-ai/create-astreus-agent) - Project scaffolding tool

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Astreus Team - [https://astreus.org](https://astreus.org)

Project Link: [https://github.com/astreus-ai/astreus-cli](https://github.com/astreus-ai/astreus-cli)
