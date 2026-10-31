import {MathError} from './engine.js';

const finite=v=>Number.isFinite(v);
function sum(values){let s=0,c=0;for(const v of values){const y=v-c,t=s+y;c=(t-s)-y;s=t;}return s;}
function mulLinear(poly,a,b){const next=Array(poly.length+1).fill(0);for(let i=0;i<poly.length;i++){next[i]+=a*poly[i];next[i+1]+=b*poly[i];}return next;}
function horner(coeffs,x){let v=0;for(let i=coeffs.length-1;i>=0;i--)v=v*x+coeffs[i];return v;}
const number=(value,name)=>{if(value==null||String(value).trim()===''||!finite(Number(value)))throw new MathError(`${name} must be a finite number. Every point needs both x and y.`);return Number(value);};

export function buildInterpolant(input){
  if(!Array.isArray(input)||input.length<2||input.length>12)throw new MathError('Enter between 2 and 12 data points.');
  const points=input.map((p,i)=>({x:number(p.x,`x at row ${i+1}`),y:number(p.y,`y at row ${i+1}`)}));
  if(new Set(points.map(p=>p.x)).size!==points.length)throw new MathError('Each x value must be different. Duplicate x values do not define a unique interpolation polynomial.');
  const xs=points.map(p=>p.x),min=Math.min(...xs),max=Math.max(...xs),center=min/2+max/2,scale=(max-min)/2;
  if(!finite(scale)||scale===0)throw new MathError('The x range is too large or too small for reliable floating-point interpolation. Rescale your x values.');
  const ts=xs.map(x=>(x-center)/scale),n=points.length;
  let gap=Infinity;for(let i=0;i<n;i++)for(let j=0;j<i;j++)gap=Math.min(gap,Math.abs(ts[i]-ts[j]));
  if(gap<=32*Number.EPSILON)throw new MathError('Some x values are too close together relative to the full interval. Use a smaller range or better separated points.');
  let weights=ts.map((t,i)=>1/ts.reduce((p,u,j)=>i===j?p:p*(t-u),1));
  const wmax=Math.max(...weights.map(Math.abs));weights=weights.map(w=>w/wmax);
  const differences=points.map(p=>[p.y]),normalized=points.map(p=>[p.y]);
  for(let order=1;order<n;order++)for(let i=0;i<n-order;i++){
    differences[i][order]=(differences[i+1][order-1]-differences[i][order-1])/(xs[i+order]-xs[i]);
    normalized[i][order]=(normalized[i+1][order-1]-normalized[i][order-1])/(ts[i+order]-ts[i]);
  }
  const coefficients=normalized[0];
  if(!coefficients.every(finite)||!weights.every(finite))throw new MathError('The interpolation arithmetic overflowed. Rescale your data or use fewer points.');
  function newtonValue(x){const t=(x-center)/scale;let p=coefficients[n-1];for(let i=n-2;i>=0;i--)p=coefficients[i]+(t-ts[i])*p;return p;}
  function basis(x){
    x=number(x,'Evaluation x');const exact=points.findIndex(p=>p.x===x);if(exact!==-1)return points.map((_,i)=>i===exact?1:0);
    const t=(x-center)/scale,terms=ts.map((u,i)=>weights[i]/(t-u));
    if(!terms.every(finite))throw new MathError('The requested x is too close to a node for reliable evaluation. Try the exact node value.');
    const largest=Math.max(...terms.map(Math.abs));if(largest===0)throw new MathError('The requested x is too far from the data for reliable interpolation.');
    const scaled=terms.map(v=>v/largest),den=sum(scaled);if(den===0)throw new MathError('Numerical cancellation prevents reliable evaluation here. Try an x nearer to the data or fewer points.');
    const values=scaled.map(v=>v/den);if(!values.every(finite))throw new MathError('The interpolation basis overflowed.');return values;
  }
  function evaluate(x){const values=basis(x),v=sum(values.map((l,i)=>l*points[i].y));if(!finite(v))throw new MathError('The interpolated value overflowed. Rescale the data.');return v;}
  let poly=[coefficients[n-1]];
  for(let i=n-2;i>=0;i--){poly=mulLinear(poly,-ts[i],1);poly[0]+=coefficients[i];}
  const normalizedPolynomial=poly;
  let expanded=[poly.at(-1)];for(let i=poly.length-2;i>=0;i--){expanded=mulLinear(expanded,-center/scale,1/scale);expanded[0]+=poly[i];}
  const nodeErrors=points.map(p=>Math.abs(newtonValue(p.x)-p.y)),nodeError=Math.max(...nodeErrors),dataScale=Math.max(1,...points.map(p=>Math.abs(p.y)));
  if(!finite(nodeError))throw new MathError('The polynomial could not be checked at the supplied nodes. Rescale the data.');
  const expandedReliable=expanded.every(finite)&&points.every(p=>Math.abs(horner(expanded,p.x)-p.y)<=1e-8*dataScale);
  return {points,min,max,center,scale,weights,differences,normalizedNewtonCoefficients:coefficients,coefficients:expanded.every(finite)?expanded:null,expandedReliable,normalizedPolynomial,nodeErrors,nodeError,nodeCheckPassed:nodeError<=1e-9*dataScale,evaluate,basis,newtonValue};
}

export function interpolate(points,target){
  return evaluateInterpolant(buildInterpolant(points),target);
}
export function evaluateInterpolant(model,target){
  target=number(target,'Evaluation x');
  const basis=model.basis(target),contributions=basis.map((l,i)=>l*model.points[i].y),value=model.evaluate(target),crossCheck=model.newtonValue(target),crossError=Math.abs(value-crossCheck),amplification=sum(basis.map(Math.abs));
  const warnings=[],extrapolation=target<model.min||target>model.max;
  if(extrapolation)warnings.push('This x is outside the data interval: this is extrapolation. Agreement at the nodes does not guarantee accuracy outside the interval.');
  if(model.points.length>8)warnings.push('A high-degree polynomial can oscillate between nodes (Runge phenomenon). More points do not always give a better approximation.');
  if(amplification>1e6)warnings.push('The basis has large cancelling contributions here. Small errors in the data can be amplified.');
  const crossCheckPassed=finite(crossCheck)&&crossError<=1e-8*Math.max(1,Math.abs(value),...model.points.map(p=>Math.abs(p.y)));
  if(!crossCheckPassed||!model.nodeCheckPassed)warnings.push('The numerical cross-check is outside the expected tolerance. Treat this result as ill-conditioned; use fewer or better spaced points.');
  if(!model.coefficients)warnings.push('The expanded coefficients overflowed. The normalized Newton form is still available.');
  else if(!model.expandedReliable)warnings.push('Expanded powers of x suffer numerical cancellation for this data. The displayed polynomial uses a scaled variable t instead.');
  return {model,target,value,basis,contributions,extrapolation,crossCheck,crossError,crossCheckPassed,amplification,warnings};
}

export function polynomialText(coefficients,variable='x',digits=9){
  if(!coefficients)return 'Expanded form unavailable';let parts=[];
  for(let i=coefficients.length-1;i>=0;i--){const c=coefficients[i];if(c===0)continue;const mag=Math.abs(c),v=Number(mag.toPrecision(digits)).toString(),power=i===0?'':i===1?variable:`${variable}^${i}`,term=power?(mag===1?'':v+'*')+power:v;parts.push((parts.length?(c<0?' − ':' + '):(c<0?'−':''))+term);}
  return parts.join('')||'0';
}
