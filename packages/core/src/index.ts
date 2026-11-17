/** Shared read-only evidence engine. Importing this module does not start analysis. */
export { analyze } from './cli.ts';
export { hashes, normalize, address, hex, fields } from './transaction.ts';
export type { Transaction } from './transaction.ts';
export { callTree, decode, unpackMultiSend } from './decode.ts';
export type { Call, CallNode, Finding } from './decode.ts';
export { Fetcher, networks, resolveProposal, proposalLocation } from './network.ts';
export { source } from './source.ts';
export type { SourceEvidence } from './source.ts';
export { proxyPath } from './proxy.ts';
