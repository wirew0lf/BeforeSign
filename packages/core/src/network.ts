export const networks: Record<number, {
    prefix: string;
    rpc: string;
    service: string;
}> = {
    1: { prefix: 'eth', rpc: 'https://ethereum-rpc.publicnode.com', service: 'https://safe-transaction-mainnet.safe.global' },
    8453: { prefix: 'base', rpc: 'https://base-rpc.publicnode.com', service: 'https://safe-transaction-base.safe.global' },
    42161: { prefix: 'arb1', rpc: 'https://arbitrum-one-rpc.publicnode.com', service: 'https://safe-transaction-arbitrum.safe.global' },
    10: { prefix: 'oeth', rpc: 'https://optimism-rpc.publicnode.com', service: 'https://safe-transaction-optimism.safe.global' },
    137: { prefix: 'matic', rpc: 'https://polygon-bor-rpc.publicnode.com', service: 'https://safe-transaction-polygon.safe.global' },
    100: { prefix: 'gno', rpc: 'https://gnosis-rpc.publicnode.com', service: 'https://safe-transaction-gnosis-chain.safe.global' },
};
export class Fetcher {
    count = 0;
    blocked = new Set<string>();
    constructor(private fetcher: typeof fetch = fetch) { }
    async json(url: string, headers: Record<string, string> = {}) {
        const host = new URL(url).hostname;
        if (this.blocked.has(host))
            throw Error(`Provider temporarily blocked after rate/server error: ${host}`);
        if (++this.count > 30)
            throw Error('Network request budget exhausted');
        const response = await this.fetcher(url, { headers: { 'User-Agent': 'BeforeSign/0.1 (+https://github.com/wirew0lf/BeforeSign)', ...headers }, signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (response.status === 429 || response.status >= 500)
            this.blocked.add(host);
        if (!response.ok)
            throw Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
        if (Number(response.headers.get('content-length')) > 2000000)
            throw Error('Response size limit');
        if (!response.body)
            throw Error('Empty response');
        const reader = response.body.getReader();
        let size = 0;
        const parts: Uint8Array[] = [];
        try {
            while (true) {
                const r = await reader.read();
                if (r.done)
                    break;
                size += r.value.length;
                if (size > 2000000)
                    throw Error('Response size limit');
                parts.push(r.value);
            }
        }
        finally {
            await reader.cancel();
        }
        return JSON.parse(Buffer.concat(parts).toString('utf8'));
    }
}
export function proposalLocation(link: string) {
    const url = new URL(link);
    if (url.origin !== 'https://app.safe.global')
        throw Error('Only official Safe app proposal links are accepted');
    const id = url.searchParams.get('id');
    const safeRef = url.searchParams.get('safe');
    if (!id || !safeRef)
        throw Error('Safe link requires safe and proposal id');
    const [prefix, safe] = safeRef.split(':');
    const chainId = Number(Object.keys(networks).find(k => networks[Number(k)].prefix === prefix));
    const match = /^multisig_(0x[0-9a-fA-F]{40})_(0x[0-9a-fA-F]{64})$/.exec(id);
    if (!chainId || !match || match[1].toLowerCase() !== safe.toLowerCase())
        throw Error('Invalid or conflicting proposal identifiers');
    return { chainId, safe, hash: match[2] };
}
export async function resolveProposal(link: string, fetcher: Fetcher) {
    const p = proposalLocation(link);
    const key = process.env.SAFE_API_KEY;
    const data = await fetcher.json(`https://api.safe.global/tx-service/${networks[p.chainId].prefix}/api/v1/multisig-transactions/${p.hash}/`, key ? { Authorization: `Bearer ${key}` } : {});
    if (data.safe?.toLowerCase() !== p.safe.toLowerCase() || data.safeTxHash?.toLowerCase() !== p.hash.toLowerCase())
        throw Error('Proposal service identifiers disagree with link');
    return { ...data, data: data.data === null ? '0x' : data.data, chainId: p.chainId, safe: p.safe, proposalHash: p.hash };
}
