import { hashTypedData, hashDomain, hashStruct } from 'viem';
import type { Address, Hex } from 'viem';
export const fields = [
    { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' }, { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' }, { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' }, { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' }, { name: 'nonce', type: 'uint256' },
];
export type Transaction = Record<string, Address | Hex | bigint>;
export function address(value: unknown): Address {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
        throw Error('Invalid address');
    return value as Address;
}
export function hex(value: unknown): Hex {
    if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value))
        throw Error('Invalid hex bytes');
    return value as Hex;
}
export function normalize(input: any): Transaction {
    const tx = input.message ?? input;
    const result: Transaction = {};
    for (const f of fields) {
        const value = tx[f.name];
        if (value === undefined)
            throw Error(`Missing ${f.name}; do not infer signed fields`);
        if (f.type.startsWith('uint')) {
            if (!['number', 'string', 'bigint'].includes(typeof value) || (typeof value === 'number' && !Number.isSafeInteger(value)) || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(String(value)))
                throw Error(`Invalid integer: ${f.name}`);
            const n = BigInt(value);
            if (n < 0n || n >= 1n << BigInt(f.type.slice(4)))
                throw Error(`Integer out of range: ${f.name}`);
            result[f.name] = n;
        }
        else
            result[f.name] = f.type === 'address' ? address(value) : hex(value);
    }
    if (result.operation !== 0n && result.operation !== 1n)
        throw Error('Invalid operation');
    return result;
}
export function hashes(input: any, chainId: number, safe: Address) {
    if (!Number.isSafeInteger(chainId) || chainId <= 0)
        throw Error('Invalid chain ID');
    address(safe);
    if (input.domain) {
        const d = input.domain;
        if (Number(d.chainId) !== chainId || address(d.verifyingContract).toLowerCase() !== safe.toLowerCase() || Object.keys(d).some(k => !['chainId', 'verifyingContract'].includes(k)))
            throw Error('Unsupported or conflicting EIP-712 domain');
        if (input.primaryType !== 'SafeTx' || !Array.isArray(input.types?.SafeTx) || input.types.SafeTx.length !== fields.length || fields.some((f, i) => input.types.SafeTx[i]?.name !== f.name || input.types.SafeTx[i]?.type !== f.type))
            throw Error('Unsupported SafeTx typed-data schema');
    }
    const message = normalize(input);
    const domain = { chainId, verifyingContract: safe };
    const types = { SafeTx: fields };
    return {
        hash: hashTypedData({ domain, types, primaryType: 'SafeTx', message }),
        domainSeparator: hashDomain({ domain: { ...domain, chainId: BigInt(chainId) }, types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] } }),
        structHash: hashStruct({ data: message, types, primaryType: 'SafeTx' }), message,
    };
}
