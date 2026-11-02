# LAWSTIN course setup

This connects the five existing school course memories. Work is excluded. Course notes stay in their current Google Drive folders. The public LAWSTIN repository contains tools, not the notes.

## Install on the Mac

1. Fully quit Claude Desktop, Claude Code, and Codex before changing their settings. Let Google Drive finish syncing. In Finder, make the five `AI & CLOUD` folders available offline so the tools can always read them.
2. Unzip `LAWSTIN-Course-Setup.zip`. Open `Install LAWSTIN AI.command` inside `LAWSTIN Course Setup`. If macOS blocks opening it, use System Settings → Privacy & Security to review and allow this downloaded installer.
3. The installer looks for `UHLC 2L FALL` in Google Drive. If it cannot identify one matching folder, it opens a folder chooser. Select the actual semester folder inside Google Drive, not a Desktop alias. It requires all five expected course folders before making changes.
4. Fully quit and reopen Claude Desktop, Claude Code, and Codex. Accept their normal MCP trust prompt if shown.
5. Install the private **LAWSTIN Course Context** plugin in ChatGPT Desktop using the plugin link provided with this setup. If your app offers local plugin import instead, use the included `lawstin-course-context-plugin.zip`. Local execution must be available for this connection; an account upload alone does not start the server on the Mac.

Node.js 20 or newer and Git are required. If Node is missing, the installer opens the official download page. If macOS asks for Apple's command line tools for Git, finish that installation and run the installer again. No API keys, paid server, or separate memory database are needed.

## Check each connection

In each of the four apps, ask:

> Use LAWSTIN Course Context to list my courses, then read the latest International Law handoff. Report the revision and private Git checkpoint.

You should see International Law, Asylum Law, Professional Responsibility, Civil Clinic, and Civil Procedure Tutoring. A real tool response with the current memory, revision, and checkpoint verifies that app's connection. Settings files alone do not prove it works.

If ChatGPT Desktop cannot run the local plugin, use its connected Google Drive app to read and update the same `AI & CLOUD/AI-MEMORY.md`. The next MCP read/checkpoint captures those synced edits in private Git history. A remote MCP deployment is a separate option; this installer does not expose your Mac to the internet.

## Daily use

Start with “Read the latest [course] handoff.” Before switching apps, ask the AI to save a concise handoff. No copy/paste between AIs is needed when the connections work. Both coding tools read the course's `AGENTS.md`; `CLAUDE.md` imports the same instructions for compatibility.

`AI-MEMORY.md` remains the one shared memory, and its existing `Current work` section is the current handoff. Durable facts remain in the existing sections and Log. The setup does not migrate old tasks, rewrite your memories, or change source documents. Old entries may still need review for current relevance.

Only use one AI to edit a given course file at a time. MCP handoff writes reject revisions that have changed locally. Direct editor writes and Drive updates from another computer cannot participate in the MCP lock. Wait for Drive to finish syncing before switching computers.

## Private history and settings

The runtime, local configuration, and separate per-course Git histories are in:

`~/Library/Application Support/LAWSTIN/course-context/`

The histories contain copies of the four allowlisted context Markdown files only. They are private to this Mac, have no Git remotes, and are not an off-device backup. They must never be copied into the public LAWSTIN repository. Course source documents and student submissions are not indexed or copied by this server.

Before replacing existing app settings, the installer saves their old contents privately in `settings-before-setup/`. It preserves unrelated settings and other MCP servers. It merges a labeled block into course instructions and preserves existing custom instructions. Rerunning setup updates those managed blocks without duplicating them.

The installer configures:

- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Code: the user-level `mcpServers` entry in `~/.claude.json`
- Codex: a labeled `mcp_servers.lawstin-courses` table in `~/.codex/config.toml`

To inspect history, ask the AI to call `checkpoint_course_context`. To read an old memory without replacing the current one, ask it to call `read_course_memory_version` with a commit returned by history. Restoring an old handoff requires reviewing and saving it as a new handoff.

## Remove the connections

Remove only the `lawstin-courses` server from each app's settings, and uninstall the ChatGPT plugin. Fully restart the apps. Keep the local history folder if you want earlier versions; deleting it removes that history. The shared Drive memories are independent of the server and remain usable.
