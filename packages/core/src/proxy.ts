import { keccak256, toHex, parseAbi } from 'viem';
import type { Address, Hex } from 'viem';
import { address } from './transaction.ts';
export const slot = (name: string) => toHex(BigInt(keccak256(toHex(name))) - 1n, { size: 32 });
export const implementationSlot = slot('eip1967.proxy.implementation');
export const beaconSlot = slot('eip1967.proxy.beacon');
export interface Reader {
    getStorageAt(args: {
        address: Address;
        slot: Hex;
        blockNumber: bigint;
    }): Promise<Hex | undefined>;
    getCode(args: {
        address: Address;
        blockNumber: bigint;
    }): Promise<Hex | undefined>;
    readContract(args: any): Promise<unknown>;
}
function stored(value: Hex | undefined) { return value && BigInt(value) !== 0n ? address('0x' + value.slice(-40)) : undefined; }
export async function proxyPath(client: Reader, start: Address, block: bigint, safe = false) {
    const path: Address[] = [start];
    const seen = new Set([start.toLowerCase()]);
    let current = start;
    for (let depth = 0; depth < 8; depth++) {
        const code = await client.getCode({ address: current, blockNumber: block });
        if (!code || code === '0x')
            return { path, noCode: true };
        let next: Address | undefined;
        if (safe && depth === 0)
            next = stored(await client.getStorageAt({ address: current, slot: toHex(0, { size: 32 }), blockNumber: block }));
        if (!next)
            next = stored(await client.getStorageAt({ address: current, slot: implementationSlot, blockNumber: block }));
        if (!next) {
            const beacon = stored(await client.getStorageAt({ address: current, slot: beaconSlot, blockNumber: block }));
            if (beacon)
                next = address(await client.readContract({ address: beacon, blockNumber: block, abi: parseAbi(['function implementation() view returns (address)']), functionName: 'implementation' }));
        }
        const minimal = /^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3/.exec(code);
        if (!next && minimal)
            next = address('0x' + minimal[1]);
        if (!next)
            return { path, noCode: false };
        if (seen.has(next.toLowerCase()))
            throw Error('Proxy implementation cycle');
        seen.add(next.toLowerCase());
        path.push(next);
        current = next;
    }
    throw Error('Proxy depth limit');
}
