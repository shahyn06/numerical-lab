import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,evaluate} from '../docs/engine.js';
import {forwardDifference,backwardDifference,centralDifference,differentiate,errorSeries} from '../docs/differentiation.js';
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
