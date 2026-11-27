import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,evaluate} from '../docs/engine.js';
import {forwardDifference,backwardDifference,centralDifference,differentiate,errorSeries,tableDifferences,validateTablePoints,DIFFERENCE_METHODS} from '../docs/differentiation.js';
const close=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<=e,`${a} ≠ ${b}`);
const fromExpression=source=>{const ast=parse(source);return x=>evaluate(ast,x);};

test('ln(x) at a = 1.8 with h = 0.1 matches the hand-worked lecture example',()=>{
  const f=fromExpression('ln(x)'),a=1.8,h=0.1;
  close(forwardDifference(f,a,h),(Math.log(1.9)-Math.log(1.8))/0.1);
  close(backwardDifference(f,a,h),(Math.log(1.8)-Math.log(1.7))/0.1);
  close(centralDifference(f,a,h),(Math.log(1.9)-Math.log(1.7))/0.2);
  const r=differentiate({expression:'ln(x)',a,h});
  close(r.exact,1/1.8);close(r.fa,Math.log(1.8));close(r.fPlus,Math.log(1.9));close(r.fMinus,Math.log(1.7));
  close(r.methods.forward.value,(Math.log(1.9)-Math.log(1.8))/0.1);
  close(r.methods.backward.value,(Math.log(1.8)-Math.log(1.7))/0.1);
  close(r.methods.central.value,(Math.log(1.9)-Math.log(1.7))/0.2);
  close(r.methods.central.absError,Math.abs((Math.log(1.9)-Math.log(1.7))/0.2-1/1.8));
});

test('central difference is the most accurate of the three for ln(x) at the same h',()=>{
  const r=differentiate({expression:'ln(x)',a:1.8,h:0.1});
  assert.ok(r.methods.central.absError<r.methods.forward.absError);
  assert.ok(r.methods.central.absError<r.methods.backward.absError);
});

test('central difference never evaluates f at a itself',()=>{
  const calls=[];const counting=x=>{calls.push(x);return Math.log(x);};
  const value=centralDifference(counting,1.8,0.1);
  close(value,(Math.log(1.9)-Math.log(1.7))/0.2);
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x!==1.8));
  close(Math.min(...calls),1.7);close(Math.max(...calls),1.9);
});

test('halving h roughly halves the forward error and quarters the central error',()=>{
  const f=x=>Math.exp(x),exact=Math.exp(1);
  const forwardRatio=Math.abs(forwardDifference(f,1,0.2)-exact)/Math.abs(forwardDifference(f,1,0.1)-exact);
  assert.ok(forwardRatio>=1.5&&forwardRatio<=2.5,`forward ratio ${forwardRatio}`);
  const centralRatio=Math.abs(centralDifference(f,1,0.2)-exact)/Math.abs(centralDifference(f,1,0.1)-exact);
  assert.ok(centralRatio>=3&&centralRatio<=5,`central ratio ${centralRatio}`);
  const backwardRatio=Math.abs(backwardDifference(f,1,0.2)-exact)/Math.abs(backwardDifference(f,1,0.1)-exact);
  assert.ok(backwardRatio>=1.5&&backwardRatio<=2.5,`backward ratio ${backwardRatio}`);
});

test('preset functions agree with their analytic derivatives',()=>{
  close(differentiate({expression:'x^2',a:3,h:0.01}).methods.central.value,6,1e-3);
  close(differentiate({expression:'x^3',a:2,h:0.01}).methods.central.value,12,1e-2);
  close(differentiate({expression:'sin(x)',a:0.8,h:0.01}).methods.central.value,Math.cos(0.8),1e-4);
  close(differentiate({expression:'cos(x)',a:0.8,h:0.01}).methods.central.value,-Math.sin(0.8),1e-4);
  close(differentiate({expression:'exp(x)',a:1,h:0.01}).methods.central.value,Math.E,1e-4);
  close(differentiate({expression:'sqrt(x)',a:2,h:0.01}).methods.central.value,1/(2*Math.sqrt(2)),1e-4);
  close(differentiate({expression:'x^2',a:3,h:0.1}).exact,6);
});

test('domain failures are reported as errors, never as NaN or Infinity',()=>{
  assert.throws(()=>forwardDifference(fromExpression('ln(x)'),-1,0.1));
  assert.throws(()=>centralDifference(x=>Math.log(x),-1,0.1));
  assert.throws(()=>forwardDifference(x=>Math.sqrt(x),-0.5,0.1));
  const r=differentiate({expression:'ln(x)',a:-1,h:0.1});
  assert.equal(r.exact,null);assert.equal(typeof r.exactError,'string');
  for(const m of ['forward','backward','central']){
    assert.equal(typeof r.methods[m].error,'string');
    assert.ok(!('value' in r.methods[m])||Number.isFinite(r.methods[m].value));
  }
  assert.equal(r.fa,null);assert.equal(typeof r.pointErrors.at,'string');
  const root=differentiate({expression:'sqrt(x)',a:0.05,h:0.1});
  assert.equal(typeof root.methods.backward.error,'string');
  assert.equal(typeof root.methods.central.error,'string');
  assert.ok(Number.isFinite(root.methods.forward.value));
});

test('invalid step sizes and points are rejected',()=>{
  const f=x=>x*x;
  for(const h of [0,-0.1,'',NaN])assert.throws(()=>forwardDifference(f,1,h));
  assert.throws(()=>centralDifference(f,'',0.1));
  assert.throws(()=>differentiate({expression:'x^2',a:1,h:0}));
  assert.throws(()=>differentiate({expression:'x +',a:1,h:0.1}));
});

test('error series is log-spaced, finite where defined, and shrinks before round-off',()=>{
  const s=errorSeries({expression:'exp(x)',a:1});
  close(s.exact,Math.E);assert.equal(s.points.length,25);
  assert.ok(s.points.every((p,i)=>i===0||p.h<s.points[i-1].h));
  close(s.points[0].h,2);assert.ok(s.points.at(-1).h<=1e-8);
  const mid=s.points.find(p=>p.h<0.05&&p.h>0.005);
  assert.ok(mid.central<mid.forward);assert.ok(mid.central<s.points[0].central);
  const noExact=errorSeries({expression:'ln(x)',a:-1});
  assert.equal(noExact.exact,null);assert.deepEqual(noExact.points,[]);
});

test('table differences reproduce the lecture table at a = 1.5',()=>{
  const table=[{x:1,y:1.002},{x:1.5,y:1.0004},{x:2,y:1.0005},{x:2.5,y:1.00006}];
  const r=tableDifferences(table,1);
  assert.equal(r.a,1.5);close(r.fa,1.0004);
  close(r.methods.forward.value,(1.0005-1.0004)/0.5);close(r.methods.forward.value,0.0002);
  close(r.methods.backward.value,(1.0004-1.002)/0.5);close(r.methods.backward.value,-0.0032);
  close(r.methods.central.value,(1.0005-1.002)/1.0);close(r.methods.central.value,-0.0015);
  close(r.methods.forward.h,0.5);close(r.methods.backward.h,0.5);
  close(r.methods.central.span,1.0);close(r.methods.central.h,0.5);
  assert.equal(r.exact,null);assert.equal(typeof r.exactError,'string');
});

test('table differences report unavailable methods at the table edges, never NaN',()=>{
  const table=[{x:1,y:1.002},{x:1.5,y:1.0004},{x:2,y:1.0005},{x:2.5,y:1.00006}];
  const first=tableDifferences(table,0);
  assert.equal(typeof first.methods.backward.error,'string');
  assert.equal(typeof first.methods.central.error,'string');
  close(first.methods.forward.value,(1.0004-1.002)/0.5);
  const last=tableDifferences(table,3);
  assert.equal(typeof last.methods.forward.error,'string');
  assert.equal(typeof last.methods.central.error,'string');
  close(last.methods.backward.value,(1.00006-1.0005)/0.5);
  for(const r of [first,last])for(const m of DIFFERENCE_METHODS)
    assert.ok(!('value' in r.methods[m])||Number.isFinite(r.methods[m].value));
});

test('table validation sorts rows and rejects duplicate x values',()=>{
  const r=tableDifferences([{x:2,y:1.0005},{x:1,y:1.002},{x:1.5,y:1.0004}],1);
  assert.deepEqual(r.points.map(p=>p.x),[1,1.5,2]);
  assert.equal(r.a,1.5);
  assert.throws(()=>tableDifferences([{x:1,y:1},{x:1.5,y:2},{x:1.5,y:3}],0),/must be different/);
  assert.throws(()=>validateTablePoints([{x:1,y:1}]),/at least 2/);
  assert.throws(()=>tableDifferences([{x:1,y:1},{x:2,y:''},{x:3,y:3}],0),/finite number/);
  assert.throws(()=>tableDifferences([{x:1,y:1},{x:2,y:2},{x:3,y:3}],3),/one of the table points/);
});

test('table differences use the actual distances when spacing is unequal',()=>{
  const r=tableDifferences([{x:0,y:0},{x:0.5,y:0.25},{x:2,y:4}],1);
  close(r.methods.forward.value,(4-0.25)/(2-0.5));
  close(r.methods.backward.value,(0.25-0)/(0.5-0));
  close(r.methods.central.value,(4-0)/(2-0));
  close(r.methods.central.span,2);close(r.methods.central.h,1);
  close(r.hNext,1.5);close(r.hPrev,0.5);
});
