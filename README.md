# BeforeSign

Understand proposed Safe multisig transactions before signing, with one shared skill for Claude Code and Codex. This branch contains the skill and reusable TypeScript engine; no web app, signing, or simulation.

## Install

Requires Node.js 22+ and npm. Clone this repository and run `npm ci`. Symlink the absolute `skills/beforesign` directory into `~/.claude/skills/beforesign` for Claude Code or `~/.agents/skills/beforesign` for Codex. Keep the repository available: the skill uses its installed helper dependencies. No AI provider key is required beyond your coding agent's own configuration.

Ask: “Use beforesign to review this Safe proposal. I expect to transfer 100 USDC to this address: …” Provide an official Safe proposal link, complete Safe transaction JSON, Safe EIP-712 JSON, or calldata. The skill asks for intent and missing signing context, and explains effects, findings, evidence gaps, and signing hashes in chat.

## Helper

Run from the repository root:

```sh
npm run analyze -- /absolute/path/transaction.json
npm run analyze -- 'https://app.safe.global/transactions/tx?safe=eth:SAFE_ADDRESS&id=multisig_SAFE_ADDRESS_SAFE_TX_HASH'
npm run analyze -- 0xdeadbeef
npm run analyze -- /absolute/path/transaction.json --offline
```

Complete JSON requires `chainId`, `safe`, `to`, `value`, `data`, `operation`, `safeTxGas`, `baseGas`, `gasPrice`, `gasToken`, `refundReceiver`, and `nonce`. Use decimal strings for integers. Typed data uses `domain`, `types`, `primaryType: "SafeTx"`, and `message`. Missing signed fields are never defaulted. Standalone calldata receives partial decoding without a hash. Proposal-service `data: null` represents empty calldata and is normalized to `0x`.

Optional environment variables:

- `RPC_URL_1`, `RPC_URL_8453`, `RPC_URL_42161`, `RPC_URL_10`, `RPC_URL_137`, `RPC_URL_100` override public RPCs for Ethereum, Base, Arbitrum One, Optimism, Polygon PoS, and Gnosis.
- `SAFE_API_KEY` authenticates official Safe Transaction Service requests. When unavailable, provide complete JSON instead.
- `ETHERSCAN_API_KEY` enables Etherscan V2 source retrieval; Sourcify is the keyless fallback.

Keep credentials out of tracked files. The helper contacts the configured RPC, Safe for proposal links, and source providers for investigated contract addresses. It does not send requests to an AI provider. Redirects from evidence services are rejected.

## Evidence and limitations

The helper computes standard Safe 1.3.x/1.4.x transaction hashes, domain separators and struct hashes. It cross-checks against the Safe contract at a recorded block, captures owners/threshold/nonce/modules/guard/fallback handler, resolves Safe singletons, EIP-1967 implementations and beacons, and standard minimal proxies. It retrieves verified source and ABI, decodes nested MultiSend batches and common token/NFT/authority operations, and observes relevant token balances/approvals. All findings include their call path; heuristic selector decoding is labeled.

The skill performs source reasoning and intent comparison. Verification by an explorer is provider evidence, not local recompilation against historical bytecode. Unrecognized proxy patterns, dynamic calls, unknown selectors, inaccessible sources and request limits remain explicit gaps. A contract can imitate Safe methods; hash agreement alone does not authenticate its implementation. Offline and unsupported-version hashes are provisional. State can change before execution. Token state reads assume the Safe as owner and are not simulated effects, especially in nested call contexts.

Hardware-wallet comparison depends on the actual signing method and device labels. A matching hash identifies the analyzed payload; it does not prove that the transaction is harmless. Generic message signing, module-originated execution, Squads and simulation are outside this release.

## Validation

`npm test` runs offline tests, and `npm run check` checks TypeScript. `npm run smoke` makes read-only live checks of chain identity and local/on-chain hash agreement against a standard Safe singleton on all six networks, plus a Sourcify source lookup. It never signs or broadcasts.

Live RPC hashing and Sourcify retrieval have passed. Authenticated Etherscan/Safe service access and behavior inside actual Claude Code/Codex sessions still require validation with available credentials and runtimes. Mocked service tests cover identifier mismatches, response limits and unavailable services.
