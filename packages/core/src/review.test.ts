import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, encodePacked, keccak256, concat, encodeAbiParameters, parseAbiParameters, toHex } from 'viem';
import { hashes, fields, normalize } from './transaction.ts';
import { commonAbi, unpackMultiSend, callTree } from './decode.ts';
import { Fetcher, proposalLocation, resolveProposal, networks } from './network.ts';
import { proxyPath, implementationSlot, beaconSlot } from './proxy.ts';
import { source } from './source.ts';
import { analyze } from './cli.ts';
const a = '0x0000000000000000000000000000000000000001' as const;
const b = '0x0000000000000000000000000000000000000002' as const;
const tx = { to: a, value: '0', data: '0x', operation: '0', safeTxGas: '0', baseGas: '0', gasPrice: '0', gasToken: a, refundReceiver: a, nonce: '0' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
test('Safe hashes agree with independently assembled EIP-712 preimage', () => {
    const h = hashes(tx, 1, a);
    const domain = keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint256,address'), [keccak256(toHex('EIP712Domain(uint256 chainId,address verifyingContract)')), 1n, a]));
    const struct = keccak256(encodeAbiParameters(parseAbiParameters('bytes32,address,uint256,bytes32,uint8,uint256,uint256,uint256,address,address,uint256'), [keccak256(toHex('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)')), a, 0n, keccak256('0x'), 0, 0n, 0n, 0n, a, a, 0n]));
    assert.equal(h.domainSeparator, domain);
    assert.equal(h.structHash, struct);
    assert.equal(h.hash, keccak256(concat(['0x1901', domain, struct])));
    for (const f of fields) {
        const value = f.type === 'address' ? b : f.type === 'bytes' ? '0x01' : '1';
        assert.notEqual(h.hash, hashes({ ...tx, [f.name]: value }, 1, a).hash);
    }
    assert.notEqual(h.hash, hashes(tx, 1, b).hash);
});
test('strict input rejects malformed, overflowing, ambiguous values and typed data domains', () => {
    for (const value of [null, true, '', -1, 1.5, '1e3', 2n ** 256n])
        assert.throws(() => normalize({ ...tx, value }));
    assert.throws(() => normalize({ ...tx, to: '0x0' }));
    assert.throws(() => normalize({ ...tx, data: '0x1' }));
    assert.throws(() => hashes({ ...tx, domain: { chainId: 1, verifyingContract: a, name: 'Safe' }, message: tx }, 1, a));
    assert.throws(() => hashes({ domain: { chainId: 1, verifyingContract: a }, message: tx, primaryType: 'Other', types: { SafeTx: fields } }, 1, a));
    assert.equal(hashes({ domain: { chainId: 1, verifyingContract: a }, message: tx, primaryType: 'SafeTx', types: { SafeTx: fields } }, 1, a).hash, hashes(tx, 1, a).hash);
});
test('MultiSend preserves packed order, values and operations and rejects truncation', async () => {
    const packed = encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [1, b, 12n, 0n, '0x']);
    assert.deepEqual(unpackMultiSend(packed), [{ operation: 1n, to: b, value: 12n, data: '0x' }]);
    assert.throws(() => unpackMultiSend('0x01'));
    assert.throws(() => unpackMultiSend(encodePacked(['uint8', 'address', 'uint256', 'uint256'], [0, b, 0n, 1n])));
    const data = encodeFunctionData({ abi: commonAbi, functionName: 'multiSend', args: [packed] });
    const gaps: string[] = [];
    const tree = await callTree({ to: a, value: 0n, operation: 1n, data }, async () => undefined, gaps);
    assert.equal(tree.root?.children[0].operation, 1n);
    assert.equal(tree.findings.filter(f => f.code === 'delegatecall').length, 2);
    assert.ok(gaps.some(g => g.includes('heuristic')));
});
test('call tree flags approvals and bounds recursion', async () => {
    const data = encodeFunctionData({ abi: commonAbi, functionName: 'approve', args: [b, 2n ** 256n - 1n] });
    const r = await callTree({ to: a, value: 0n, operation: 0n, data }, async () => commonAbi, []);
    assert.ok(r.findings.some(f => f.code === 'approval'));
    let nested = data;
    for (let i = 0; i < 10; i++)
        nested = encodeFunctionData({ abi: commonAbi, functionName: 'multiSend', args: [encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [0, a, 0n, BigInt((nested.length - 2) / 2), nested])] });
    const gaps: string[] = [];
    await callTree({ to: a, value: 0n, operation: 0n, data: nested }, async () => commonAbi, gaps);
    assert.ok(gaps.some(g => g.includes('limit')));
});
test('proposal links pin official origin, chain and Safe identifiers', async () => {
    const hash = '0x' + 'ab'.repeat(32);
    const link = `https://app.safe.global/transactions/tx?safe=eth:${a}&id=multisig_${a}_${hash}`;
    assert.equal(proposalLocation(link).chainId, 1);
    assert.throws(() => proposalLocation(link.replace('app.safe.global', 'evil.test')));
    assert.throws(() => proposalLocation(link.replace(`safe=eth:${a}`, `safe=eth:${b}`)));
    const fetcher = new Fetcher(async (url) => { assert.ok(String(url).startsWith('https://api.safe.global/tx-service/eth/')); return json({ safe: a, safeTxHash: hash, ...tx }); });
    assert.equal((await resolveProposal(link, fetcher)).proposalHash, hash);
    await assert.rejects(() => resolveProposal(link, new Fetcher(async () => json({ safe: b, safeTxHash: hash }))));
});
test('fetch limits and HTTP failures are explicit', async () => {
    await assert.rejects(() => new Fetcher(async () => json({}, 429)).json('https://example.com'), /429/);
    await assert.rejects(() => new Fetcher(async () => new Response('x'.repeat(2000001))).json('https://example.com'), /size limit/);
    const f = new Fetcher(async () => json({}));
    for (let i = 0; i < 30; i++)
        await f.json('https://example.com');
    await assert.rejects(() => f.json('https://example.com'), /budget/);
});
test('proxy resolution supports implementation, Safe singleton and beacon at fixed block', async () => {
    for (const mode of ['implementation', 'safe', 'beacon']) {
        const reader = { async getCode() { return '0x1234' as const; }, async getStorageAt(args: any) { assert.equal(args.blockNumber, 10n); return args.address === a && ((mode === 'safe' && BigInt(args.slot) === 0n) || (mode === 'implementation' && args.slot === implementationSlot) || (mode === 'beacon' && args.slot === beaconSlot)) ? toHex(BigInt(b), { size: 32 }) : toHex(0, { size: 32 }); }, async readContract() { return b; } };
        assert.deepEqual((await proxyPath(reader, a, 10n, mode === 'safe')).path, [a, b]);
    }
});
test('source retrieval returns content and provenance without credentials', async () => {
    const old = process.env.ETHERSCAN_API_KEY;
    delete process.env.ETHERSCAN_API_KEY;
    try {
        const result = await source(1, a, new Fetcher(async () => json({ runtimeMatch: 'exact_match', abi: [], sources: { 'A.sol': { content: 'contract A {}' } } })));
        assert.equal(result.sources['A.sol'], 'contract A {}');
        assert.equal(result.provider, 'Sourcify');
    }
    finally {
        if (old !== undefined)
            process.env.ETHERSCAN_API_KEY = old;
    }
});
test('all supported networks produce provisional offline evidence and detect supplied hash mismatch', async () => {
    for (const chainId of Object.keys(networks).map(Number)) {
        const r = await analyze({ ...tx, chainId, safe: a, proposalHash: '0x' + '00'.repeat(32) }, true);
        assert.equal(r.signing.status, 'provisional');
        assert.ok(r.gaps.length);
        assert.ok(r.findings.some(f => f.code === 'proposal-hash-mismatch'));
    }
});
test('Etherscan source normalization and provenance never expose its API key', async () => {
    const old = process.env.ETHERSCAN_API_KEY;
    process.env.ETHERSCAN_API_KEY = 'test-secret-not-for-output';
    try {
        const r = await source(1, a, new Fetcher(async () => json({ status: '1', result: [{ SourceCode: '{{"sources":{"A.sol":{"content":"contract A {}"}}}}', ABI: '[]', ContractName: 'A' }] })));
        assert.equal(r.sources['A.sol'], 'contract A {}');
        assert.ok(!JSON.stringify(r).includes('test-secret'));
    }
    finally {
        if (old === undefined)
            delete process.env.ETHERSCAN_API_KEY;
        else
            process.env.ETHERSCAN_API_KEY = old;
    }
});
test('source API requests use valid selectors and require runtime verification', async () => {
    const old = process.env.ETHERSCAN_API_KEY;
    delete process.env.ETHERSCAN_API_KEY;
    try {
        await assert.rejects(() => source(1, a, new Fetcher(async (url) => { assert.equal(new URL(String(url)).searchParams.get('fields'), 'abi,sources,runtimeMatch,creationMatch'); return json({ abi: [], sources: { 'A.sol': { content: 'A' } } }); })), /unavailable/);
    }
    finally {
        if (old !== undefined)
            process.env.ETHERSCAN_API_KEY = old;
    }
});
test('portable skill entrypoint decodes calldata outside the checkout working directory', async () => {
    const { spawnSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('../../../skills/beforesign/scripts/analyze.mjs', import.meta.url));
    const env = {...process.env};
    for (const key of Object.keys(env)) if (key.startsWith('TSX_') || key.startsWith('NODE_TEST') || key === 'NODE_OPTIONS') delete env[key];
    const result = spawnSync(process.execPath, [path, '0xdeadbeef'], { cwd: '/tmp', encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).partial, true);
});
