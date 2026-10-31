import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,evaluate,solve,fixedConditions,intervalBounds} from '../docs/engine.js';
const defaults={method:'bisection',f:'x^3-x-2',a:1,b:2,tol:1e-8,max:100};
const run=c=>solve({...defaults,...c});
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);

test('parser: precedence, implicit products, constants and real functions',()=>{
  for(const [s,v]of [['-x^2',-9],['2^3^2',512],['2x + x(x-1)',12],['sin(pi/2)',1],['log(e)',1],['cbrt(-8)',-2],['x^-2',1/9],['2e-3',0.002],['sqrt(x+1)',2]])close(evaluate(parse(s),3),v,1e-12);
  for(const s of ['window.alert(1)','x;1','process.env','sin x','x +','(x+1','Infinity','x=2','1e999'])assert.throws(()=>parse(s));
});
test('automatic derivatives match known analytic derivatives',()=>{
  close(evaluate(parse('x^3-x-2'),-2,true),11);
  close(evaluate(parse('cos(x)-x'),0.7,true),-Math.sin(.7)-1);
  close(evaluate(parse('exp(-x)'),.5,true),-Math.exp(-.5));
  close(evaluate(parse('x^x'),2,true),4*(Math.log(2)+1));
  close(evaluate(parse('cbrt(x)'),-8,true),1/12);
  assert.throws(()=>evaluate(parse('abs(x)'),0,true));
});
test('Bisection respects a sign-changing bracket and root error bound',()=>{
  const r=run({});assert.equal(r.status,'converged');const p=1.5213797068045676;
  for(const row of r.rows){assert.ok(row.fa*row.fb<0);assert.ok(row.x>=row.a&&row.x<=row.b);assert.ok(Math.abs(row.x-p)<=row.bound+1e-15);}
  close(r.rows.at(-1).x,p);assert.ok(r.rows.at(-1).bound<=1e-8);
});
test('Bisection rejects same signs and a sign change across a discontinuity',()=>{
  assert.equal(run({f:'x^2+1',a:-1,b:1}).status,'invalid');
  const pole=run({f:'1/x',a:-1,b:1});assert.equal(pole.status,'invalid');assert.match(pole.title,/Continuity/);
  assert.equal(run({f:'tan(x)',a:1,b:2}).status,'invalid');
  assert.equal(run({f:'x^2-4',a:2,b:4}).status,'converged');
});
test('Fixed Point whole-interval conditions for cosine and cubic',()=>{
  const c=fixedConditions(parse('cos(x)'),0,1);assert.equal(c.verified,true);assert.ok(c.k<.85);assert.ok(c.range[1]<=1);
  const cubic=fixedConditions(parse('cbrt(x+2)'),1,2);assert.equal(cubic.verified,true);
  const r=run({method:'fixed',f:'cos(x)-x',g:'cos(x)',a:0,b:1,x0:.5});assert.equal(r.status,'converged');close(r.rows.at(-1).x,.7390851332151607);
  for(const row of r.rows)assert.ok(Math.abs(row.x-.7390851332151607)<=row.bound+1e-14);
});
test('Fixed Point does not infer invariance from endpoints',()=>{
  const g=parse('4*x*(1-x)');assert.ok(evaluate(g,0)>=0&&evaluate(g,.8)<=.8);const c=fixedConditions(g,0,.8);assert.equal(c.maps,false);assert.ok(c.range[1]>=1);
});
test('Fixed Point flags wrong-equation fixed points and unstable rearrangements',()=>{
  const mismatch=run({method:'fixed',f:'x^2-2',g:'.5*x',a:0,b:2,x0:1});assert.equal(mismatch.status,'mismatch');
  const unstable=run({method:'fixed',f:'x^2-2',g:'x^2+x-2',a:1,b:2,x0:1.5});assert.equal(unstable.conditions.verified,false);assert.notEqual(unstable.status,'converged');
});
test('Fixed Point keeps iterating when equivalent f has a larger scale',()=>{
  const r=run({method:'fixed',f:'1000*(x-1)',g:'.5*x+.5',a:0,b:2,x0:0,tol:1e-6});
  assert.equal(r.status,'converged');assert.ok(r.rows.at(-1).residual<=1e-6);
});
test('Newton converges with auto differentiation and checks supplied derivative',()=>{
  const r=run({method:'newton',x0:1.5});assert.equal(r.status,'converged');close(r.rows.at(-1).x,1.5213797068045676);
  assert.equal(run({method:'newton',x0:1.5,df:'3*x^2-1'}).status,'converged');
  assert.equal(run({method:'newton',x0:1.5,df:'3*x^2'}).status,'invalid');
});
test('Newton handles zero derivatives, cycles, domains and stagnation',()=>{
  assert.equal(run({method:'newton',f:'x^3-1',x0:0}).status,'breakdown');
  assert.equal(run({method:'newton',f:'x^3-2*x+2',x0:0,max:12}).status,'cycle');
  assert.equal(run({method:'fixed',f:'x',g:'-x',a:-1,b:1,x0:.5}).status,'cycle');
  assert.equal(run({method:'newton',f:'ln(x)-1',x0:-1}).status,'breakdown');
  const r=run({method:'newton',f:'100000000000000000000*x - 1',x0:1e-20,tol:1e-30});assert.ok(['converged','stalled'].includes(r.status));
});
test('Secant uses x0 and x1 in the correct order and converges',()=>{
  const r=run({method:'secant',x0:1,x1:2});close(r.rows[0].x,4/3,1e-14);assert.equal(r.rows[0].previous,2);assert.equal(r.status,'converged');close(r.rows.at(-1).x,1.5213797068045676);
  assert.equal(run({method:'secant',f:'x^2-2',x0:-1,x1:1}).status,'breakdown');
  assert.equal(run({method:'secant',x0:1,x1:1}).status,'invalid');
});
test('Inputs, iteration limits, endpoint and initial roots',()=>{
  for(const c of [{a:2,b:1},{a:''},{tol:0},{tol:-1},{max:0},{max:2.5},{max:501},{method:'newton',x0:''}])assert.throws(()=>run(c));
  assert.equal(run({max:1}).status,'limit');
  for(const method of ['newton','secant']){const r=run({method,f:'x^2-4',x0:2,x1:4});assert.equal(r.status,'converged');assert.equal(r.rows[0].x,2);}
  assert.equal(run({method:'fixed',f:'x-1',g:'0',a:0,b:2,x0:1}).status,'mismatch');
});
test('Interval bounds contain dense independent point samples',()=>{
  for(const [source,a,b]of [['x^3-x-2',-2,2],['cos(x)',0,1],['x^2',-2,2],['exp(-x)',-2,2],['1/(x^2+1)',-2,2],['cbrt(x+2)',1,2]]){
    const ast=parse(source);for(const derivative of [false,true]){const [lo,hi]=intervalBounds(ast,a,b,derivative);for(let i=0;i<=1000;i++){const x=a+(b-a)*i/1000,v=evaluate(ast,x,derivative);assert.ok(v>=lo-1e-14&&v<=hi+1e-14,`${source} ${derivative}: ${v} outside [${lo},${hi}]`);}}
  }
});
