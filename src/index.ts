import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineApp, tool, select, confirm, spinner, output, error } from "kly";
import type { ModelConfig } from "kly";

const execAsync = promisify(exec);

// ============ Schema Definition ============
const generateCommitSchema = z.object({
  format: z
    .enum(["conventional", "gitmoji"])
    .default("conventional")
    .describe("Commit message format: 'conventional' or 'gitmoji'"),
  count: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe("Number of commit message candidates to generate"),
  language: z
    .enum(["en", "zh"])
    .default("en")
    .describe("Language for commit message"),
});

// ============ Helper Functions ============
async function execCommand(
  cmd: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(cmd);
    return { success: true, output: stdout, error: stderr };
  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string };
    return { success: false, output: error.stdout || "", error: error.message };
  }
}

function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"').replace(/`/g, "\\`");
}

function buildPrompt(
  diff: string,
  format: "conventional" | "gitmoji",
  count: number,
  language: string,
): string {
  const languageInstruction =
    language === "zh"
      ? "Write the description in Chinese (中文)"
      : "Write the description in English";

  if (format === "conventional") {
    return `You are a git commit message generator. Analyze the following git diff and generate ${count} commit message candidates.

## Format: Conventional Commits
Each message MUST follow this format:
<type>(<scope>): <description>

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation only
- style: Code style (formatting, semicolons, etc.)
- refactor: Code refactoring (no feature change, no bug fix)
- perf: Performance improvement
- test: Adding or modifying tests
- build: Build system or dependencies
- ci: CI/CD configuration
- chore: Other changes (maintenance)

## Rules:
1. Scope is optional but recommended when applicable
2. Description should be concise (50 chars max)
3. Use imperative mood ("add" not "added")
4. No period at the end
5. ${languageInstruction}

## Git Diff:
\`\`\`diff
${diff}
\`\`\`

## Output Format:
Return exactly ${count} commit messages, one per line, numbered like:
1. feat(auth): add user login functionality
2. fix(api): resolve null pointer exception
...

Generate ${count} diverse commit message options:`;
  }

  return `You are a git commit message generator. Analyze the following git diff and generate ${count} commit message candidates.

## Format: Gitmoji
Each message MUST start with a relevant emoji:

Common Gitmojis:
- ✨ New feature
- 🐛 Bug fix
- 📝 Documentation
- 💄 UI/style updates
- ♻️ Refactor
- ⚡️ Performance
- ✅ Tests
- 🔧 Configuration
- 🏗️ Architecture
- 🔥 Remove code/files
- 🚀 Deploy
- 🎨 Code structure/format
- 🔒 Security
- ⬆️ Upgrade dependencies
- ⬇️ Downgrade dependencies
- 🚚 Move/rename files

## Rules:
1. Start with emoji (actual emoji character)
2. Follow with concise description
3. Use imperative mood
4. ${languageInstruction}

## Git Diff:
\`\`\`diff
${diff}
\`\`\`

## Output Format:
Return exactly ${count} commit messages, one per line, numbered like:
1. ✨ add user login functionality
2. 🐛 fix null pointer exception
...

Generate ${count} diverse commit message options:`;
}

function parseCommitCandidates(text: string): string[] {
  const lines = text.split("\n");
  const candidates: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\d+\.\s*(.+)$/);
    if (match?.[1]) {
      candidates.push(match[1].trim());
    }
  }

  return candidates;
}

function createProviderFromConfig(config: ModelConfig) {
  switch (config.provider) {
    case "openai":
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })(config.model || "gpt-4o-mini");

    case "anthropic":
      return createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })(config.model || "claude-3-5-haiku-20241022");

    case "google":
      return createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })(config.model || "gemini-2.0-flash-exp");

    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

// ============ Main Tool ============
const generateCommitTool = tool({
  name: "generate",
  description: "Generate AI-powered git commit messages based on staged changes",
  inputSchema: generateCommitSchema,
  execute: async ({ format, count, language }, context) => {
    // Step 1: Check git repository
    const gitCheck = await execCommand("git rev-parse --is-inside-work-tree");
    if (!gitCheck.success) {
      error("Not a git repository", [
        "Navigate to a git repository",
        "Or run 'git init' to initialize one",
      ]);
      return { success: false, error: "Not a git repository" };
    }

    // Step 2: Get staged changes
    const stagedCheck = await execCommand("git diff --cached --stat");
    if (!stagedCheck.output.trim()) {
      error("No staged changes", [
        "Use 'git add <file>' to stage changes",
        "Use 'git add .' to stage all changes",
      ]);
      return { success: false, error: "No staged changes" };
    }

    output("Staged changes:");
    output(stagedCheck.output);

    // Step 3: Get full diff
    const diffResult = await execCommand("git diff --cached");
    const diff = diffResult.output;

    // Step 4: Get model config
    const config = await context.models.getConfigAsync();
    if (!config) {
      error("No LLM model configured", ["Run 'kly models' to configure a model"]);
      return { success: false, error: "No model configured" };
    }

    // Step 5: Generate candidates
    const spin = spinner("Generating commit messages...");

    try {
      const provider = createProviderFromConfig(config);
      const { text } = await generateText({
        model: provider,
        prompt: buildPrompt(diff, format, count, language),
      });

      spin.succeed("Generated commit messages");

      const candidates = parseCommitCandidates(text);

      if (candidates.length === 0) {
        error("Failed to parse commit messages from AI response");
        return { success: false, error: "Parse error" };
      }

      // Step 6: Let user select
      const selected = await select({
        prompt: "Select a commit message:",
        options: [
          ...candidates.map((msg) => ({
            name: msg,
            value: msg,
          })),
          { name: "Cancel", value: "__cancel__" },
        ],
      });

      if (selected === "__cancel__") {
        output("Cancelled");
        return { success: false, cancelled: true };
      }

      // Step 7: Confirm and commit
      const shouldCommit = await confirm("Commit with this message?", true);

      if (shouldCommit) {
        const commitResult = await execCommand(
          `git commit -m "${escapeQuotes(selected as string)}"`,
        );
        if (commitResult.success) {
          output("Committed successfully!");
          return { success: true, message: selected };
        }
        error("Commit failed", [commitResult.error || "Unknown error"]);
        return { success: false, error: commitResult.error };
      }

      output("Commit cancelled. You can commit manually with:");
      output(`git commit -m "${selected}"`);
      return { success: false, cancelled: true, suggestedMessage: selected };
    } catch (err: unknown) {
      spin.fail("Failed to generate");
      const e = err as Error;
      error(`Generation failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  },
});

// ============ App Definition ============
export default defineApp({
  name: "gc",
  version: "0.1.0",
  description: "AI-powered git commit message generator",
  permissions: {
    apiKeys: true,
  },
  tools: [generateCommitTool],
  instructions:
    "Generate commit messages for staged git changes. Extract format preference (conventional or gitmoji) and language from user input.",
});
