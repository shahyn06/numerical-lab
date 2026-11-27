import {MathError,parse,evaluate} from './engine.js';

/* Numerical differentiation by finite differences. The three quotients are
   pure functions of f, a and h so tests can pass any callable, including a
   counting wrapper. Central difference evaluates f only at a − h and a + h:
   the value at a itself is never used. Domain failures surface as MathError,
   never as NaN or Infinity. */
export const DIFFERENCE_METHODS=['forward','backward','central'];
const finite=v=>Number.isFinite(v);
const number=(value,name)=>{if(value==null||String(value).trim()===''||!finite(Number(value)))throw new MathError(`${name} must be a finite number.`);return Number(value);};
const checkPoint=a=>number(a,'Target point a');
const checkStep=h=>{h=number(h,'Step size h');if(h<=0)throw new MathError('Step size h must be greater than 0.');return h;};
function valueAt(f,x){const v=f(x);if(!finite(v))throw new MathError('The function value is not finite at this point.');return v;}
function quotient(v){if(!finite(v))throw new MathError('The difference quotient is not finite at these inputs.');return v;}

export function forwardDifference(f,a,h){
  a=checkPoint(a);h=checkStep(h);
  return quotient((valueAt(f,a+h)-valueAt(f,a))/h);
}
export function backwardDifference(f,a,h){
  a=checkPoint(a);h=checkStep(h);
  return quotient((valueAt(f,a)-valueAt(f,a-h))/h);
}
export function centralDifference(f,a,h){
  a=checkPoint(a);h=checkStep(h);
  return quotient((valueAt(f,a+h)-valueAt(f,a-h))/(2*h));
}
export function exactDerivative(expression,a){
  const ast=typeof expression==='string'?parse(expression):expression;
  return evaluate(ast,checkPoint(a),true);
}

/* Full snapshot for the UI: the three point values, the exact derivative from
   automatic differentiation, and one result per method. A point or method that
   leaves the domain reports an error string instead of a number, so one bad
   point never hides the methods that still work. */
export function differentiate(input){
  const ast=parse(input?.expression),a=checkPoint(input.a),h=checkStep(input.h);
  const F=x=>evaluate(ast,x);
  const grab=x=>{try{return {value:valueAt(F,x)};}catch(e){return {error:e.message};}};
  const atMinus=grab(a-h),atA=grab(a),atPlus=grab(a+h);
  let exact=null,exactError=null;
  try{exact=evaluate(ast,a,true);}catch(e){exactError=e.message;}
  const finish=value=>{
    if(!finite(value))return {error:'The difference quotient is not finite at these inputs.'};
    const absError=exact==null?null:Math.abs(value-exact);
    return {value,absError,relError:absError==null||exact===0?null:absError/Math.abs(exact)};
  };
  const attempt=compute=>{try{return finish(compute());}catch(e){return {error:e.message};}};
  const methods={
    forward:attempt(()=>forwardDifference(F,a,h)),
    backward:attempt(()=>backwardDifference(F,a,h)),
    central:attempt(()=>centralDifference(F,a,h))
  };
  return {ast,expression:input.expression,a,h,
    fMinus:atMinus.value??null,fa:atA.value??null,fPlus:atPlus.value??null,
    pointErrors:{minus:atMinus.error??null,at:atA.error??null,plus:atPlus.error??null},
    exact,exactError,methods};
}

/* Absolute error of each method over log-spaced step sizes from 2 down to
   1e-8. Small h eventually shows floating-point round-off growing again,
   which is exactly what the error chart is meant to reveal. */
export function errorSeries(input,{steps=25}={}){
  const ast=parse(input?.expression),a=checkPoint(input.a);
  let exact=null;
  try{exact=evaluate(ast,a,true);}catch{return {exact:null,points:[]};}
  const F=x=>evaluate(ast,x),compute={forward:forwardDifference,backward:backwardDifference,central:centralDifference};
  const points=[],hMax=2,hMin=1e-8;
  for(let i=0;i<steps;i++){
    const h=hMax*Math.pow(hMin/hMax,steps===1?0:i/(steps-1)),row={h};
    for(const m of DIFFERENCE_METHODS){try{row[m]=Math.abs(compute[m](F,a,h)-exact);}catch{row[m]=null;}}
    points.push(row);
  }
  return {exact,points};
}
