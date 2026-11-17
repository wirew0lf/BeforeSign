import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createPublicClient, http, parseAbi } from 'viem';
import type { Address, Hex, Abi } from 'viem';
import { hashes, fields, address, hex } from './transaction.ts';
import { callTree } from './decode.ts';
import { networks, Fetcher, resolveProposal } from './network.ts';
import { source } from './source.ts';
import { proxyPath } from './proxy.ts';
export { hashes, normalize } from './transaction.ts';
export { decode } from './decode.ts';
export async function analyze(input:any, offline=false) {
 const chainId=Number(input.chainId??input.domain?.chainId);const safe=address(input.safe??input.domain?.verifyingContract);
 if(!networks[chainId])throw Error('Unsupported network');
 if(input.chainId!==undefined&&input.domain&&Number(input.chainId)!==Number(input.domain.chainId))throw Error('Conflicting chain IDs');
 const local=hashes(input,chainId,safe);const gaps:string[]=[];const evidence:any={};const sources:any[]=[];
 const fetcher=new Fetcher();let requests=0;
 const rpc=process.env[`RPC_URL_${chainId}`]??networks[chainId].rpc;
 const client=createPublicClient({transport:http(rpc,{timeout:15000,retryCount:0,onFetchRequest(){if(++requests>100)throw Error('RPC request budget exhausted');}})});
 let block:bigint|undefined;let verified=false;
 if(!offline)try{
  if(await client.getChainId()!==chainId)throw Error('RPC chain mismatch');
  block=await client.getBlockNumber();evidence.block=block;const b=await client.getBlock({blockNumber:block});evidence.blockHash=b.hash;
  const contract={address:safe,blockNumber:block} as const;
  const version=await client.readContract({...contract,abi:parseAbi(['function VERSION() view returns (string)']),functionName:'VERSION'});evidence.version=version;
  if(!/^1\.(3|4)\.\d+$/.test(version))throw Error('Unsupported Safe version');
  verified=true;
  evidence.onchainHash=await client.readContract({...contract,abi:parseAbi(['function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)']),functionName:'getTransactionHash',args:fields.map(f=>local.message[f.name]) as any});
  evidence.matches=evidence.onchainHash.toLowerCase()===local.hash.toLowerCase();
  for(const [name,type] of [['nonce','uint256'],['getThreshold','uint256'],['getOwners','address[]']])try{evidence[name]=await client.readContract({...contract,abi:parseAbi([`function ${name}() view returns (${type})`]),functionName:name});}catch{gaps.push(`Unable to read Safe ${name}`);}
 }catch(e){gaps.push(`Safe chain verification incomplete: ${e instanceof Error?e.name:'error'}`);}
 else gaps.push('Offline: chain state and source verification not performed');
 const cache=new Map<string,Abi|undefined>();
 async function lookup(to:Address):Promise<Abi|undefined>{
  const key=to.toLowerCase();if(cache.has(key))return cache.get(key);cache.set(key,undefined);
  if(block===undefined)return;
  try{
   const resolved=await proxyPath(client,to,block,key===safe.toLowerCase());
   if(resolved.noCode){gaps.push(`${to}: no deployed code at snapshot; check recipient intent`);return;}
   let abi:Abi|undefined;
   for(const target of resolved.path){try{const item=await source(chainId,target,fetcher);sources.push({...item,block,proxyPath:resolved.path});abi=item.abi;}catch(e){gaps.push(String(e));abi=undefined;}}
   cache.set(key,abi);return abi;
  }catch{gaps.push(`${to}: proxy/source resolution incomplete`);}
 }
 await lookup(safe);
 const tree=await callTree({to:address(local.message.to),value:local.message.value as bigint,operation:local.message.operation as bigint,data:hex(local.message.data)},lookup,gaps);
 if(evidence.matches===false)tree.findings.push({severity:'critical',code:'hash-mismatch',detail:'Local and on-chain signing hashes disagree.',path:'0'});
 const proposalHash=input.proposalHash??input.safeTxHash;
 if(proposalHash&&(!/^0x[0-9a-fA-F]{64}$/.test(proposalHash)||proposalHash.toLowerCase()!==local.hash.toLowerCase()))tree.findings.push({severity:'critical',code:'proposal-hash-mismatch',detail:'Supplied proposal hash disagrees with locally computed hash.',path:'0'});
 if(evidence.nonce!==undefined&&evidence.nonce!==local.message.nonce)tree.findings.push({severity:'warning',code:'nonce-difference',detail:'Proposal nonce differs from current Safe nonce; queued or stale transaction.',path:'0'});
 if(local.message.gasPrice!==0n)tree.findings.push({severity:'warning',code:'gas-refund',detail:'Transaction authorizes a gas refund; review gas fields, gas token and refund receiver.',path:'0'});
 if(block!==undefined)try{const end=await client.getBlock({blockNumber:block});if(end.hash!==evidence.blockHash)gaps.push('Snapshot block changed during analysis; rerun required');}catch{gaps.push('Snapshot stability check failed');}
 return {chainId,safe,transaction:local.message,signing:{safeTransactionHash:local.hash,domainSeparator:local.domainSeparator,structHash:local.structHash,versionSupported:verified,crossChecked:evidence.matches===true,status:verified&&evidence.matches===true?'cross-checked':'provisional'},evidence,...tree,sources,gaps,warning:'No simulation or safety guarantee. Source verification is provider evidence. Unrecognized proxy patterns and dynamic calls require manual review. Device display depends on signing method.'};
}
async function main(){
 const args=process.argv.slice(2);const offline=args.includes('--offline');const value=args.find(a=>a!=='--offline');
 if(!value)throw Error('Usage: npm run analyze -- <transaction.json|Safe URL|0xcalldata> [--offline]');
 let input:any;
 if(value.startsWith('https://')){if(offline)throw Error('Proposal links require network access');input=await resolveProposal(value,new Fetcher());}
 else if(value.startsWith('0x')){const {decode}=await import('./decode.ts');console.log(JSON.stringify({partial:true,decoded:decode(hex(value)),missing:'Provide destination, network, Safe address and every signed field to compute signing hashes.'},replacer,2));return;}
 else {const raw=readFileSync(value);if(raw.length>2_000_000)throw Error('Input size limit');input=JSON.parse(raw.toString());}
 console.log(JSON.stringify(await analyze(input,offline),replacer,2));
}
function replacer(_key:string,value:unknown){return typeof value==='bigint'?value.toString():value;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e instanceof Error?e.message:'Analysis failed');process.exitCode=1;});
