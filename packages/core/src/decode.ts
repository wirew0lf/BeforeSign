import { decodeFunctionData, parseAbi } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import { address, hex } from './transaction.ts';
export const commonAbi = parseAbi([
    'function transfer(address to,uint256 amount)', 'function approve(address spender,uint256 amount)',
    'function transferFrom(address from,address to,uint256 amount)', 'function safeTransferFrom(address from,address to,uint256 tokenId)',
    'function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)',
    'function setApprovalForAll(address operator,bool approved)', 'function multiSend(bytes transactions)',
    'function addOwnerWithThreshold(address owner,uint256 threshold)', 'function removeOwner(address prevOwner,address owner,uint256 threshold)',
    'function swapOwner(address prevOwner,address oldOwner,address newOwner)', 'function changeThreshold(uint256 threshold)',
    'function enableModule(address module)', 'function disableModule(address prevModule,address module)',
    'function setGuard(address guard)', 'function setFallbackHandler(address handler)',
    'function upgradeTo(address implementation)', 'function upgradeToAndCall(address implementation,bytes data)',
]);
export interface Call {
    to: Address;
    value: bigint;
    operation: bigint;
    data: Hex;
}
export interface Finding {
    severity: 'critical' | 'warning' | 'info';
    code: string;
    detail: string;
    path: string;
}
export interface CallNode extends Call {
    path: string;
    decoded: unknown;
    abiSource: string;
    children: CallNode[];
}
export function decode(data: Hex, abi: Abi = commonAbi) {
    try {
        return decodeFunctionData({ abi, data });
    }
    catch {
        return { unknown: true, data };
    }
}
export function unpackMultiSend(data: Hex): Call[] {
    hex(data);
    const bytes = data.slice(2);
    const calls: Call[] = [];
    let offset = 0;
    while (offset < bytes.length) {
        if (calls.length >= 100)
            throw Error('MultiSend call limit reached');
        if (bytes.length - offset < 170)
            throw Error('Truncated MultiSend header');
        const op = BigInt('0x' + bytes.slice(offset, offset + 2));
        if (op > 1n)
            throw Error('Invalid MultiSend operation');
        const to = address('0x' + bytes.slice(offset + 2, offset + 42));
        const value = BigInt('0x' + bytes.slice(offset + 42, offset + 106));
        const length = BigInt('0x' + bytes.slice(offset + 106, offset + 170));
        offset += 170;
        if (length > BigInt((bytes.length - offset) / 2))
            throw Error('Truncated MultiSend payload');
        const end = offset + Number(length) * 2;
        calls.push({ to, value, operation: op, data: hex('0x' + bytes.slice(offset, end)) });
        offset = end;
    }
    return calls;
}
export async function callTree(root: Call, lookup: (to: Address) => Promise<Abi | undefined>, gaps: string[]) {
    const findings: Finding[] = [];
    let count = 0;
    async function walk(call: Call, path: string, depth: number): Promise<CallNode | undefined> {
        if (depth > 8 || count >= 100) {
            gaps.push(`${path}: call/depth limit reached`);
            return;
        }
        count++;
        const abi = await lookup(call.to);
        const decoded = decode(call.data, abi ?? commonAbi);
        const node: CallNode = { ...call, path, decoded, abiSource: abi ? 'verified ABI' : 'selector heuristic (unverified)', children: [] };
        const add = (severity: Finding['severity'], code: string, detail: string) => findings.push({ severity, code, detail, path });
        if (call.operation === 1n)
            add('critical', 'delegatecall', 'Code executes in the Safe storage context; implementation review required.');
        if (call.value > 0n)
            add('info', 'native-value', `Authorizes ${call.value} native base units to ${call.to}.`);
        if ('unknown' in decoded) {
            if (call.data !== '0x') {
                gaps.push(`${path}: unknown calldata`);
                add('warning', 'unknown-call', 'Unable to decode this call.');
            }
            return node;
        }
        const { functionName, args } = decoded;
        if (/Owner|Threshold|Module|Guard|FallbackHandler|upgradeTo/.test(functionName))
            add('warning', 'authority-change', `${functionName} changes authority or execution behavior.`);
        if (functionName === 'approve')
            add('warning', 'approval', `${args?.[0]} may spend up to ${args?.[1]} token base units; token behavior must be checked.`);
        if (functionName === 'setApprovalForAll' && args?.[1])
            add('warning', 'operator-approval', `${args[0]} receives control over all applicable assets.`);
        if (functionName === 'multiSend') {
            // A selector alone is not proof this destination implements Safe MultiSend.
            if (!abi)
                gaps.push(`${path}: MultiSend interpretation is a selector heuristic; verify destination source`);
            try {
                const children = unpackMultiSend(args![0] as Hex);
                for (let i = 0; i < children.length; i++) {
                    const child = await walk(children[i], `${path}.${i}`, depth + 1);
                    if (child)
                        node.children.push(child);
                }
            }
            catch (e) {
                gaps.push(`${path}: ${String(e)}`);
            }
        }
        return node;
    }
    return { root: await walk(root, '0', 0), findings };
}
