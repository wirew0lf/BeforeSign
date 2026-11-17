import {keccak256, toHex, parseAbi} from 'viem';
import type {Address} from 'viem';
import type {CallNode} from './decode.ts';
import type {Reader} from './proxy.ts';
export async function safeState(client:Reader,safe:Address,blockNumber:bigint,gaps:string[]) {
 const result:Record<string,unknown>={};
 for(const [label,key] of [['guard','guard_manager.guard.address'],['fallbackHandler','fallback_manager.handler.address']])try{
  const value=await client.getStorageAt({address:safe,slot:keccak256(toHex(key)),blockNumber});result[label]=value?'0x'+value.slice(-40):null;
 }catch{gaps.push(`Unable to read Safe ${label}`);}
 try{
  const [modules,next]=await client.readContract({address:safe,blockNumber,abi:parseAbi(['function getModulesPaginated(address start,uint256 pageSize) view returns (address[] array,address next)']),functionName:'getModulesPaginated',args:['0x0000000000000000000000000000000000000001',100n]}) as [Address[],Address];
  result.modules=modules;if(BigInt(next)!==1n)gaps.push('Safe module list truncated after 100 entries');
 }catch{gaps.push('Unable to read Safe modules');}
 return result;
}
export async function relevantState(client:Reader,node:CallNode|undefined,safe:Address,blockNumber:bigint,gaps:string[]) {
 const result:Record<string,unknown>[]=[];let reads=0;
 async function walk(call:CallNode){
  const decoded=call.decoded as {functionName?:string;args?:unknown[]};
  if(['transfer','transferFrom','approve','setApprovalForAll','safeTransferFrom'].includes(decoded.functionName??'')){
   const item:Record<string,unknown>={path:call.path,contract:call.to,block:blockNumber,assumedOwner:safe};
   // These reads are observations, not proof of ERC-20/721 semantics.
   const queries:[string,string,unknown[]][]=[['balance','function balanceOf(address) view returns (uint256)',[safe]]];
   if(decoded.functionName==='approve')queries.push(['allowance','function allowance(address,address) view returns (uint256)',[safe,decoded.args?.[0]]]);
   if(decoded.functionName==='setApprovalForAll')queries.push(['operatorApproved','function isApprovedForAll(address,address) view returns (bool)',[safe,decoded.args?.[0]]]);
   for(const [label,signature,args] of queries){if(++reads>20){gaps.push('Relevant token state read budget exhausted');return;}try{item[label]=await client.readContract({address:call.to,blockNumber,abi:parseAbi([signature]),functionName:signature.split('(')[0].split(' ')[1],args});}catch{item[label]='unavailable';}}
   result.push(item);
  }
  for(const child of call.children)await walk(child);
 }
 if(node)await walk(node);return result;
}
