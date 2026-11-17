# BeforeSign

Review proposed Safe transactions before signing, using Claude Code or Codex. Skills only; no signing, simulation, or web application.

## Setup

Requires Node.js 22+ and npm. Clone this repository and run `npm ci`. Copy or symlink `skills/beforesign` into `~/.claude/skills/beforesign` for Claude Code or `~/.agents/skills/beforesign` for Codex. Keep this repository available and tell the agent its absolute path so it can run the helper there.

Ask: “Use beforesign to review this Safe proposal. I expect to transfer 100 USDC to this address: …” Supply a proposal link, complete transaction JSON, typed-data JSON, or calldata. Missing signing context will be requested.

For the helper directly: `npm run analyze -- /absolute/path/transaction.json`. JSON requires `chainId`, `safe`, and every Safe signed field listed in the workflow reference. Use decimal strings for large integers.

Optional environment settings: `RPC_URL_1`, `RPC_URL_8453`, `RPC_URL_42161`, `RPC_URL_10`, `RPC_URL_137`, `RPC_URL_100`. Explorer credentials such as `ETHERSCAN_API_KEY` are used by the agent's retrieval tools, not the helper. Keep credentials out of tracked files.

## Current coverage

The helper computes standard Safe 1.3/1.4 transaction hashes, reads Safe state at a recorded block, compares the on-chain hash, and decodes common transfer/approval calls. Source retrieval, proposal-link resolution, proxy investigation, and nested batch analysis are agent workflows, not automated adapters. Partial results must be disclosed. Public RPC availability is not guaranteed. Hardware wallet displays depend on signing method; the helper does not yet emit domain/struct hashes.

`npm test` runs offline invariant tests; `npm run check` checks TypeScript. Live network and actual Claude Code/Codex behavior require separate verification. This is review assistance, not a guarantee of safety.
