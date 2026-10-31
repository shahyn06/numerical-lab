import test from 'node:test';
import assert from 'node:assert/strict';
import {editExpression} from '../docs/keypad.js';
import {parse,evaluate} from '../docs/engine.js';
test('equation keypad constructs the requested exponential example with a grouped exponent',()=>{
  let r=editExpression('x^2-',4,4,{type:'exponential'});assert.equal(r.value,'x^2-e^()');assert.equal(r.start,7);
  r=editExpression(r.value,r.start,r.end,{type:'text',value:'2*x'});r=editExpression(r.value,r.start,r.end,{type:'right'});r=editExpression(r.value,r.start,r.end,{type:'text',value:'-1'});
  assert.equal(r.value,'x^2-e^(2*x)-1');assert.ok(Math.abs(evaluate(parse(r.value),-1)+Math.exp(-2))<1e-12);
});
test('keypad wraps selections, inserts within a function, and supports deletion and navigation',()=>{
  assert.deepEqual(editExpression('x+1',0,3,{type:'square'}),{value:'(x+1)^2',start:7,end:7});
  assert.equal(editExpression('x+1',0,3,{type:'function',value:'sin'}).value,'sin(x+1)');
  assert.deepEqual(editExpression('',0,0,{type:'function',value:'sqrt'}),{value:'sqrt()',start:5,end:5});
  assert.deepEqual(editExpression('123',1,3,{type:'backspace'}),{value:'1',start:1,end:1});
  assert.deepEqual(editExpression('123',2,2,{type:'backspace'}),{value:'13',start:1,end:1});
  assert.equal(editExpression('x',0,1,{type:'clear'}).value,'');
  assert.equal(editExpression('x+1',0,3,{type:'left'}).start,0);
  assert.deepEqual(editExpression('sin(x)',5,5,{type:'text',value:')'}),{value:'sin(x)',start:6,end:6});
});
