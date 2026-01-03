# My Kly App

An AI-powered kly application with natural language support.

## Getting Started

Install dependencies:

```bash
bun install
```

Set up your API keys (required for natural language mode):

```bash
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...
```

Configure your preferred model:

```bash
kly models
```

Run locally:

```bash
bun run start
```

## Usage

### Structured Mode

Use traditional CLI arguments:

```bash
bun run start advise --city "Tokyo" --days 7 --budget 2000
```

### Natural Language Mode

Use natural language to describe what you want:

```bash
bun run start "What should I pack for a week in Tokyo?"
bun run start "I have $2000 for a 5-day trip to Paris"
bun run start "Plan a cheap weekend in Barcelona"
```

The AI will extract parameters like city, days, and budget from your natural language input!

### Remote Execution

After pushing to GitHub, others can run your app:

```bash
kly run github.com/yourusername/your-repo "cheap trip to Bali"
```

## Features

- **Natural Language Processing**: Understands human language and extracts structured parameters
- **AI Integration**: Uses OpenAI or Anthropic models for intelligent responses
- **Permission System**: Explicitly requests API key access with user consent
- **Multi-mode**: Works in CLI, MCP, and remote execution modes

## Project Structure

```
.
├── src/
│   └── index.ts           # Main app with AI-powered tool
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

1. **Permissions**: The app declares `apiKeys: true` to request access to AI models
2. **Instructions**: The `instructions` field guides the AI on how to extract parameters
3. **Schema**: Zod schemas with `.describe()` help the AI understand what each parameter means
4. **Natural Language**: When you pass free-form text, kly uses AI to match it to your tool's schema

## Learn More

- [Kly Documentation](https://github.com/xinyao27/kly)
- [Natural Language Examples](https://github.com/xinyao27/kly/tree/main/examples)
- [AI SDK Documentation](https://sdk.vercel.ai/docs)
