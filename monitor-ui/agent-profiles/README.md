# LONKO agent system

This directory records the intended runtime contract for the personal agent system shown by Monitor UI. The live source of truth is OpenClaw's validated configuration and the isolated workspaces under `~/.openclaw/workspace-agents/`.

The dashboard reads live agents through `/api/multiagent/agents`. Tasks submitted with `agentId: "auto"` use deterministic domain routing in `server.mjs`; the selected OpenClaw profile then performs the task with the local Ollama model.

Operational constraints:

- two concurrent agent runs;
- one loaded heavy model;
- local Qwen 3.5 4B with a 16K OpenClaw context;
- no channel bindings for specialist profiles;
- external actions require explicit human approval.

The larger context is required for OpenClaw's system prompt and tool schemas. Ollama still keeps only one model loaded.

## Daily cycle

`scripts/lonko-daily.mjs` runs sequentially at 20:00 America/Santiago through the macOS LaunchAgent in `scripts/com.devjaime.lonko-daily.plist`:

1. select one specialist using a weekday rotation;
2. execute that isolated OpenClaw profile with Ollama;
3. ask WEICHAFE to audit the returned evidence;
4. ask LONKO to consolidate the reviewed result;
5. atomically write Inbox, Audits and Daily Markdown notes to the Obsidian vault;
6. send one final reviewed summary to the authorized Telegram chat.

Scheduling, file writes and Telegram delivery are deterministic Node operations. They do not depend on local-model tool calling.
