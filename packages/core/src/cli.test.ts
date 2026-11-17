import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashes,normalize,decode} from './cli.ts';
const zero='0x0000000000000000000000000000000000000000';
const tx={to:zero,value:'0',data:'0x',operation:0,safeTxGas:0,baseGas:0,gasPrice:0,gasToken:zero,refundReceiver:zero,nonce:0};
test('hash binds chain, Safe and every signed field',()=>{const original=hashes(tx,1,zero).hash;assert.notEqual(original,hashes(tx,8453,zero).hash);for(const key of ['value','safeTxGas','baseGas','gasPrice','nonce','operation'])assert.notEqual(original,hashes({...tx,[key]:1},1,zero).hash);assert.notEqual(original,hashes({...tx,data:'0x00'},1,zero).hash);});
test('missing fields and unsafe integers rejected',()=>{assert.throws(()=>normalize({}));assert.throws(()=>normalize({...tx,value:Number.MAX_SAFE_INTEGER+1}));assert.throws(()=>normalize({...tx,operation:2}));});
test('unknown data remains explicitly unknown',()=>{assert.equal((decode('0xdeadbeef') as any).unknown,true);});
