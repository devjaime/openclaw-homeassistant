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
