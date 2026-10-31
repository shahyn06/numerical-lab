import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInterpolant,interpolate,polynomialText} from '../docs/interpolation.js';
const close=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<=e,`${a} ≠ ${b}`);
test('Lagrange lecture example agrees with exact rational calculation',()=>{
  const r=interpolate([{x:2,y:.5},{x:2.5,y:.4},{x:4,y:.25}],3);
  close(r.value,13/40);close(r.crossCheck,13/40);close(r.model.coefficients[0],23/20);close(r.model.coefficients[1],-17/40);close(r.model.coefficients[2],1/20);
  close(r.basis.reduce((s,v)=>s+v,0),1);assert.ok(r.crossCheckPassed);assert.ok(r.model.nodeCheckPassed);
  close(r.model.differences[0][1],-.2);close(r.model.differences[0][2],.05);
});
test('polynomials are reproduced between and outside nodes',()=>{
  const f=x=>x*x*x-2*x+1,points=[-2,-.7,.25,2].map(x=>({x,y:f(x)})),m=buildInterpolant(points);
  for(let i=0;i<=80;i++){const x=-3+i*.075;close(m.evaluate(x),f(x),1e-8);close(m.newtonValue(x),f(x),1e-8);}
  assert.ok(interpolate(points,3).extrapolation);assert.equal(interpolate(points,0).extrapolation,false);
});
test('basis is Kronecker at nodes and reconstruction matches weighted terms',()=>{
  const p=[{x:2,y:9},{x:-1,y:-3},{x:0,y:2}],m=buildInterpolant(p);
  for(let i=0;i<p.length;i++){assert.deepEqual(m.basis(p[i].x),p.map((_,j)=>i===j?1:0));assert.equal(m.evaluate(p[i].x),p[i].y);}
  const r=interpolate(p,.4);close(r.contributions.reduce((a,b)=>a+b,0),r.value);
});
test('normalized evaluation handles large shifted x without expanding to evaluate',()=>{
  const p=[0,1,2,3].map(t=>({x:1e9+t,y:t*t+2*t+3}));const m=buildInterpolant(p);
  close(m.evaluate(1e9+1.5),8.25,1e-8);close(m.newtonValue(1e9+1.5),8.25,1e-8);
  assert.equal(m.expandedReliable,false);
});
test('invalid, repeated, blank, near-coincident and excessive data are rejected',()=>{
  for(const points of [[],[{x:1,y:2}],[{x:1,y:1},{x:1,y:2}],[{x:'',y:1},{x:1,y:1}],[{x:0,y:NaN},{x:1,y:2}],[{x:0,y:1},{x:1e-16,y:2},{x:1,y:3}],Array.from({length:13},(_,x)=>({x,y:x}))])assert.throws(()=>buildInterpolant(points));
  assert.throws(()=>interpolate([{x:0,y:0},{x:1,y:1}],''));
});
test('constant data, order independence, and two-node linear interpolation',()=>{
  const p=[{x:0,y:2},{x:1,y:2},{x:2,y:2}];close(interpolate(p,.7).value,2);
  close(interpolate([{x:-1,y:-1},{x:3,y:7}],1).value,3);
  close(interpolate(p.slice().reverse(),.7).value,interpolate(p,.7).value);
  assert.equal(polynomialText([1,1,1]),'x^2 + x + 1');
});
