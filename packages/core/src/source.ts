import type { Abi, Address } from 'viem';
import { getAddress } from 'viem';
import { Fetcher } from './network.ts';
export interface SourceEvidence { address:Address; provider:string; url:string; abi:Abi; sources:Record<string,string>; contractName?:string; warnings:string[] }
export async function source(chainId:number,address:Address,fetcher:Fetcher):Promise<SourceEvidence> {
 const errors:string[]=[];const key=process.env.ETHERSCAN_API_KEY;
 if(key)try {
  const url=new URL('https://api.etherscan.io/v2/api');
  for(const [k,v] of Object.entries({chainid:String(chainId),module:'contract',action:'getsourcecode',address,apikey:key}))url.searchParams.set(k,v);
  const response=await fetcher.json(url.toString());const item=response.result?.[0];
  if(response.status!=='1'||!item?.SourceCode)throw Error('Explorer source unavailable');
  const abi=JSON.parse(item.ABI);if(!Array.isArray(abi))throw Error('Invalid explorer ABI');
  let raw=item.SourceCode;let sources:Record<string,string>={};
  if(raw.startsWith('{{'))raw=raw.slice(1,-1);
  try{const parsed=JSON.parse(raw);for(const [name,value] of Object.entries(parsed.sources??parsed))if(typeof (value as any)?.content==='string')sources[name]=(value as any).content;}catch{sources={'contract.sol':item.SourceCode};}
  if(!Object.keys(sources).length)throw Error('Explorer returned no source content');
  return {address,provider:'Etherscan',url:`https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}`,abi,sources,contractName:item.ContractName,warnings:['Powered by Etherscan.io APIs','Explorer verification is provider evidence, not local recompilation.']};
 }catch(e){errors.push(`Etherscan unavailable: ${e instanceof Error?e.message:'request failed'}`);}
 else errors.push('ETHERSCAN_API_KEY not configured');
 const url=`https://sourcify.dev/server/v2/contract/${chainId}/${getAddress(address)}?fields=abi,sources,match`;
 try {
  const data=await fetcher.json(url);if(!Array.isArray(data.abi))throw Error('Sourcify ABI unavailable');
  const sources:Record<string,string>={};for(const [name,value] of Object.entries(data.sources??{}))if(typeof (value as any)?.content==='string')sources[name]=(value as any).content;
  if(!Object.keys(sources).length)throw Error('Sourcify sources unavailable');
  return {address,provider:'Sourcify',url,abi:data.abi,sources,warnings:[...errors,'Provider verification; source is not locally recompiled against historical bytecode.']};
 }catch{throw Error(`Verified source unavailable for ${address}; ${errors.join('; ')}; Sourcify unavailable`);}
}
