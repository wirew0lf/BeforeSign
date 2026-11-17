/** Opt-in, read-only checks: chain identity and Safe hash agreement on each supported network. */
import { createPublicClient, http, parseAbi } from 'viem';
import { networks, Fetcher } from './network.ts';
import { hashes, fields } from './transaction.ts';
import { source } from './source.ts';
const singleton = '0x41675C099F32341bf84BFc5382aF534df5C7461a';
const zero = '0x0000000000000000000000000000000000000000';
const transaction = { to: zero, value: '0', data: '0x', operation: 0, safeTxGas: 0, baseGas: 0, gasPrice: 0, gasToken: zero, refundReceiver: zero, nonce: 0 };
await Promise.all(Object.keys(networks).map(async (key) => {
    const chainId = Number(key);
    try {
        const client = createPublicClient({ transport: http(process.env[`RPC_URL_${chainId}`] ?? networks[chainId].rpc, { timeout: 10000, retryCount: 0 }) });
        if (await client.getChainId() !== chainId)
            throw Error('Chain mismatch');
        const blockNumber = await client.getBlockNumber();
        const local = hashes(transaction, chainId, singleton);
        const remote = await client.readContract({ address: singleton, blockNumber, abi: parseAbi(['function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)']), functionName: 'getTransactionHash', args: fields.map(f => local.message[f.name]) as any });
        if (remote !== local.hash)
            throw Error('Hash mismatch');
        console.log(JSON.stringify({ chainId, block: String(blockNumber), hashMatches: true }));
    }
    catch (e) {
        console.error(JSON.stringify({ chainId, status: 'failed', reason: e instanceof Error ? e.name : 'error' }));
        process.exitCode = 1;
    }
}));
try {
    const result = await source(1, singleton, new Fetcher());
    console.log(JSON.stringify({ sourceProvider: result.provider, sourceFiles: Object.keys(result.sources).length }));
}
catch {
    console.error('Source retrieval failed');
    process.exitCode = 1;
}
