/* Numerical Lab — expression parser, automatic differentiation and root solvers.
   No eval, network dependencies, or arbitrary JavaScript execution. */
const FUNCTIONS = new Set(['sin','cos','tan','exp','ln','log','sqrt','abs','cbrt']);
export class MathError extends Error {}
export function parse(source) {
  if (typeof source !== 'string' || !source.trim()) throw new MathError('Enter a mathematical expression.');
  if (source.length > 400) throw new MathError('Keep expressions under 400 characters.');
  const text = source.replaceAll('π','pi').replaceAll('−','-').replaceAll('×','*').replaceAll('÷','/').replaceAll('**','^');
  const tokens = []; let i=0;
  while(i<text.length){
    if (/\s/.test(text[i])) {i++;continue;}
    const rest=text.slice(i), num=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if(num){tokens.push({t:'num',v:Number(num[0])});i+=num[0].length;continue;}
    const name=rest.match(/^[a-zA-Z]+/);
    if(name){tokens.push({t:'name',v:name[0].toLowerCase()});i+=name[0].length;continue;}
    if('+-*/^()'.includes(text[i])){tokens.push({t:text[i],v:text[i++]});continue;}
    throw new MathError(`Unexpected character “${text[i]}”. Use x, numbers, and supported math operators.`);
  }
  tokens.push({t:'end'});let pos=0,nodes=0;
  const peek=()=>tokens[pos], take=()=>tokens[pos++];
  const node=(op,...args)=>{if(++nodes>250)throw new MathError('Expression is too complex.');return {op,args};};
  function primary(){
    const t=take();
    if(t.t==='num'){if(!Number.isFinite(t.v))throw new MathError('A number in the expression is too large.');return node('num',t.v);}
    if(t.t==='name'){
      if(t.v==='x')return node('x');
      if(t.v==='pi'||t.v==='e')return node('num',t.v==='pi'?Math.PI:Math.E);
      if(!FUNCTIONS.has(t.v))throw new MathError(`Unknown name “${t.v}”. The variable is x.`);
      if(take().t!=='(')throw new MathError(`Use parentheses: ${t.v}(x).`);
      const arg=add();if(take().t!==')')throw new MathError('A closing parenthesis is missing.');return node(t.v,arg);
    }
    if(t.t==='('){const a=add();if(take().t!==')')throw new MathError('A closing parenthesis is missing.');return a;}
    throw new MathError('Expected a number, x, or an opening parenthesis.');
  }
  function power(){let a=primary();if(peek().t==='^'){take();a=node('^',a,unary());}return a;}
  function unary(){if(peek().t==='+'){take();return unary();}if(peek().t==='-'){take();return node('neg',unary());}return power();}
  function mul(){let a=unary();while(true){const t=peek().t;if(t==='*'||t==='/'){take();a=node(t,a,unary());}else if(['num','name','('].includes(t)){a=node('*',a,unary());}else break;}return a;}
  function add(){let a=mul();while(peek().t==='+'||peek().t==='-'){const op=take().t;a=node(op,a,mul());}return a;}
  const ast=add();if(peek().t!=='end')throw new MathError('Check the parentheses and operators.');return ast;
}
export function evaluate(ast,x,derivative=false){
  function walk(n){
    const op=n.op;if(op==='num')return [n.args[0],0];if(op==='x')return [x,1];
    const [a,da]=walk(n.args[0]);let b,db;if(n.args[1]) [b,db]=walk(n.args[1]);let v,d;
    switch(op){
      case 'neg':v=-a;d=-da;break;
      case '+':v=a+b;d=da+db;break;case '-':v=a-b;d=da-db;break;
      case '*':v=a*b;d=da*b+a*db;break;
      case '/':if(b===0)throw new MathError('Division by zero.');v=a/b;d=(da*b-a*db)/(b*b);break;
      case '^':v=Math.pow(a,b);if(db===0){d=b===0?0:da===0?0:b*Math.pow(a,b-1)*da;}else{d=v*(db*Math.log(a)+b*da/a);}break;
      case 'sin':v=Math.sin(a);d=Math.cos(a)*da;break;
      case 'cos':v=Math.cos(a);d=-Math.sin(a)*da;break;
      case 'tan':if(Math.abs(Math.cos(a))<1e-15)throw new MathError('tan(x) is undefined at this point.');v=Math.tan(a);d=da/(Math.cos(a)**2);break;
      case 'exp':v=Math.exp(a);d=v*da;break;
      case 'ln':case 'log':if(a<=0)throw new MathError('ln/log needs a positive argument.');v=Math.log(a);d=da/a;break;
      case 'sqrt':if(a<0)throw new MathError('sqrt needs a nonnegative argument.');v=Math.sqrt(a);d=da/(2*v);break;
      case 'cbrt':v=Math.cbrt(a);d=da/(3*v*v);break;
      case 'abs':v=Math.abs(a);d=a===0?NaN:Math.sign(a)*da;break;
    }
    if(!Number.isFinite(v))throw new MathError('The expression is outside its real domain or overflowed.');
    return [v,d];
  }
  const [value,d]=walk(ast);if(derivative&&!Number.isFinite(d))throw new MathError('The derivative is undefined or non-finite at this point.');return derivative?d:value;
}

// Outward-rounded interval arithmetic. Bounds can be conservative (dependency effect).
const buf=new ArrayBuffer(8), fv=new Float64Array(buf), uv=new BigUint64Array(buf);
function next(x,up){if(!Number.isFinite(x))return x;if(x===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;fv[0]=x;uv[0]+=((x>0)===up)?1n:-1n;return fv[0];}
const I=(lo,hi=lo)=>[lo,hi], out=(lo,hi)=>[next(lo,false),next(hi,true)];
function finite(z){if(!z.every(Number.isFinite))throw new MathError('An interval bound is non-finite.');return z;}
const zero=a=>a[0]===0&&a[1]===0;
const plus=(a,b)=>zero(a)&&zero(b)?I(0):finite(out(a[0]+b[0],a[1]+b[1]));
const minus=(a,b)=>zero(a)&&zero(b)?I(0):finite(out(a[0]-b[1],a[1]-b[0]));
const neg=a=>[-a[1],-a[0]];
function times(a,b){if((a[0]===0&&a[1]===0)||(b[0]===0&&b[1]===0))return I(0);const q=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return finite(out(Math.min(...q),Math.max(...q)));}
function divide(a,b){if(b[0]<=0&&b[1]>=0)throw new MathError('A denominator may be zero inside the interval.');return times(a,out(1/b[1],1/b[0]));}
function pow(a,b){
  if(b[0]!==b[1]){if(a[0]<=0)throw new MathError('Variable powers need a positive base for interval checks.');return expI(times(b,logI(a)));}
  const n=b[0];if(n===0)return I(1);if(n<0)return divide(I(1),pow(a,I(-n)));
  if(!Number.isInteger(n)&&a[0]<0)throw new MathError('A fractional power has a negative base. Use cbrt(x) for real cube roots.');
  let lo=Math.pow(a[0],n),hi=Math.pow(a[1],n);
  if(Number.isInteger(n)&&n%2===0){[lo,hi]=[a[0]<=0&&a[1]>=0?0:Math.min(lo,hi),Math.max(lo,hi)];}
  return finite(out(lo,hi));
}
function sinI(a){if(a[1]-a[0]>=2*Math.PI||Math.max(Math.abs(a[0]),Math.abs(a[1]))>1e12)return I(-1,1);let lo=Math.min(Math.sin(a[0]),Math.sin(a[1])),hi=Math.max(Math.sin(a[0]),Math.sin(a[1]));if(Math.ceil((a[0]-Math.PI/2)/(2*Math.PI))<=Math.floor((a[1]-Math.PI/2)/(2*Math.PI)))hi=1;if(Math.ceil((a[0]+Math.PI/2)/(2*Math.PI))<=Math.floor((a[1]+Math.PI/2)/(2*Math.PI)))lo=-1;const z=out(lo,hi);return [Math.max(-1,z[0]),Math.min(1,z[1])];}
const cosI=a=>sinI(plus(a,I(Math.PI/2)));
const expI=a=>finite(out(Math.exp(a[0]),Math.exp(a[1])));
function logI(a){if(a[0]<=0)throw new MathError('The logarithm may leave its domain inside the interval.');return finite(out(Math.log(a[0]),Math.log(a[1])));}
function interval(ast,a,b,derivative=false){
  function walk(n){const op=n.op;if(op==='num')return {v:I(n.args[0]),d:I(0)};if(op==='x')return {v:I(a,b),d:I(1)};
    const A=walk(n.args[0]),B=n.args[1]?walk(n.args[1]):null;let v,d=I(0);
    switch(op){
      case 'neg':v=neg(A.v);if(derivative)d=neg(A.d);break;
      case '+':case '-':v=(op==='+'?plus:minus)(A.v,B.v);if(derivative)d=(op==='+'?plus:minus)(A.d,B.d);break;
      case '*':v=times(A.v,B.v);if(derivative)d=plus(times(A.d,B.v),times(A.v,B.d));break;
      case '/':v=divide(A.v,B.v);if(derivative)d=divide(minus(times(A.d,B.v),times(A.v,B.d)),pow(B.v,I(2)));break;
      case '^':v=pow(A.v,B.v);if(derivative){if(zero(B.d)){d=zero(B.v)?I(0):times(times(B.v,pow(A.v,B.v[0]===B.v[1]?I(B.v[0]-1):minus(B.v,I(1)))),A.d);}else d=times(v,plus(times(B.d,logI(A.v)),divide(times(B.v,A.d),A.v)));}break;
      case 'sin':v=sinI(A.v);if(derivative)d=times(cosI(A.v),A.d);break;
      case 'cos':v=cosI(A.v);if(derivative)d=neg(times(sinI(A.v),A.d));break;
      case 'tan':{const c=cosI(A.v);if(c[0]<=0&&c[1]>=0)throw new MathError('tan has a possible pole inside the interval.');v=divide(sinI(A.v),c);if(derivative)d=divide(A.d,pow(c,I(2)));break;}
      case 'exp':v=expI(A.v);if(derivative)d=times(v,A.d);break;
      case 'ln':case 'log':v=logI(A.v);if(derivative)d=divide(A.d,A.v);break;
      case 'sqrt':if(A.v[0]<0)throw new MathError('sqrt may leave its domain inside the interval.');v=out(Math.sqrt(A.v[0]),Math.sqrt(A.v[1]));if(derivative)d=divide(A.d,times(I(2),v));break;
      case 'cbrt':v=out(Math.cbrt(A.v[0]),Math.cbrt(A.v[1]));if(derivative)d=divide(A.d,times(I(3),pow(v,I(2))));break;
      case 'abs':v=I(A.v[0]<=0&&A.v[1]>=0?0:Math.min(Math.abs(A.v[0]),Math.abs(A.v[1])),Math.max(Math.abs(A.v[0]),Math.abs(A.v[1])));if(derivative){if(A.v[0]<=0&&A.v[1]>=0)throw new MathError('abs may not be differentiable inside the interval.');d=times(I(A.v[0]>0?1:-1),A.d);}break;
    }return {v:finite(v),d:finite(d)};
  }const r=walk(ast);return derivative?r.d:r.v;
}
export function intervalBounds(ast,a,b,derivative=false){let lo=Infinity,hi=-Infinity;for(let j=0;j<128;j++){const left=a+(b-a)*j/128,right=j===127?b:a+(b-a)*(j+1)/128;const q=interval(ast,left,right,derivative);lo=Math.min(lo,q[0]);hi=Math.max(hi,q[1]);}return [lo,hi];}
export function fixedConditions(g,a,b){
  const r={continuous:false,maps:false,contraction:false,verified:false,range:null,derivative:null,k:null,notes:[]};
  try{r.range=intervalBounds(g,a,b);r.continuous=true;r.maps=r.range[0]>=a&&r.range[1]<=b;}catch(e){r.notes.push(e.message);}
  try{r.derivative=intervalBounds(g,a,b,true);r.k=Math.max(Math.abs(r.derivative[0]),Math.abs(r.derivative[1]));r.contraction=r.k<1;}catch(e){r.notes.push(e.message);}
  r.verified=r.continuous&&r.maps&&r.contraction;return r;
}
const opposite=(a,b)=>(a<0&&b>0)||(a>0&&b<0);
export function solve(input){
  const c={...input},method=c.method;
  if(!['bisection','fixed','newton','secant'].includes(method))throw new MathError('Choose one of the four methods.');
  const f=parse(c.f),g=method==='fixed'?parse(c.g):null,df=method==='newton'&&c.df?.trim()?parse(c.df):null;
  for(const key of ['tol','max',...(method==='bisection'||method==='fixed'?['a','b']:[]),...(method==='fixed'||method==='newton'||method==='secant'?['x0']:[]),...(method==='secant'?['x1']:[])]){
    if(c[key]===''||c[key]===null||c[key]===undefined)throw new MathError(`Enter a value for ${key}.`);c[key]=Number(c[key]);if(!Number.isFinite(c[key]))throw new MathError(`${key} must be a finite number.`);
  }
  if(c.tol<=0||c.tol>1)throw new MathError('Tolerance must be greater than 0 and at most 1.');
  if(!Number.isInteger(c.max)||c.max<1||c.max>500)throw new MathError('Iteration limit must be an integer from 1 to 500.');
  if((method==='bisection'||method==='fixed')&&(!(c.a<c.b)||!Number.isFinite(c.b-c.a)))throw new MathError('Use a finite interval with a < b.');
  if(method==='fixed'&&(c.x0<c.a||c.x0>c.b))throw new MathError('Start x₀ inside the interval [a, b] used for the Fixed Point checks.');
  const F=x=>evaluate(f,x),G=x=>evaluate(g,x),D=x=>df?evaluate(df,x):evaluate(f,x,true);
  const result={method,config:c,f,g,df,rows:[],status:'limit',title:'Iteration limit reached',message:'The stopping rule was not met. Try a better start, a different rearrangement, or a higher iteration limit.',warnings:[],conditions:null};
  const done=(status,title,message)=>Object.assign(result,{status,title,message});
  const row=(x,extra)=>{const fx=F(x);const r={n:result.rows.length+1,x,fx,residual:Math.abs(fx),...extra};result.rows.push(r);return r;};
  if(method==='fixed'){
    result.conditions=fixedConditions(g,c.a,c.b);
    if(!result.conditions.verified)result.warnings.push('The sufficient Fixed Point conditions are not established. Iteration may still converge; this is an exploratory run.');
    result.warnings.push('Check algebraically that f(x) = 0 ⇔ g(x) = x on the chosen interval. The lab checks the original residual but cannot prove that equivalence.');
  }
  try{
    if(method==='bisection'){
      let a=c.a,b=c.b,fa=F(a),fb=F(b);
      if(fa===0||fb===0){row(fa===0?a:b,{a,b,fa,fb,bound:0,step:null});return done('converged','Endpoint root found','An endpoint evaluates to zero in floating-point arithmetic. No bisection steps are needed.');}
      if(!opposite(fa,fb))return done('invalid','No sign-changing bracket',`f(a) and f(b) have the same sign. Bisection needs opposite signs (or an endpoint root). This does not prove there is no root.`);
      try{intervalBounds(f,a,b);}catch(e){return done('invalid','Continuity not established',`${e.message} A sign change across a discontinuity does not guarantee a root. Use an interval where the function is continuous; conservative interval checks can also be inconclusive.`);}
      for(let n=0;n<c.max;n++){
        const x=a+(b-a)/2,bound=(b-a)/2,r=row(x,{a,b,fa,fb,bound,step:n?Math.abs(x-result.rows.at(-1).x):null});
        if(r.fx===0)return done('converged','Root found','The midpoint evaluates to zero in floating-point arithmetic.');
        if(bound<=c.tol)return done('converged','Root bracket converged','The midpoint’s absolute error is at most the half-width of the sign-changing bracket, assuming continuity. The residual is shown separately.');
        if(x===a||x===b)return done('stalled','Floating-point limit','The midpoint cannot be distinguished from an endpoint. This tolerance is below the available precision.');
        if(opposite(fa,r.fx)){b=x;fb=r.fx;}else{a=x;fa=r.fx;}
      }
    }else{
      let x=c.x0,fx=F(x),prev=c.x1,fprev=method==='secant'?F(prev):null;
      result.start={x,fx,...(method==='secant'?{x1:prev,fx1:fprev}:{})};
      if(fx===0){if(method==='fixed'&&Math.abs(G(x)-x)>c.tol)return done('mismatch','Root is not a fixed point','The starting value solves f(x)=0, but g(x) does not return that value. Check your rearrangement.');row(x,{step:0,previous:x});return done('converged','Starting value is a root','The starting value already evaluates to zero.');}
      if(method==='secant'&&fprev===0){row(prev,{step:0,previous:prev});return done('converged','Starting value is a root','The second starting value already evaluates to zero.');}
      if(method==='secant'&&x===prev)return done('invalid','Distinct starts required','Secant needs two different starting values.');
      for(let n=0;n<c.max;n++){
        let nextX,denom=null,slope=null;
        if(method==='fixed')nextX=G(x);
        if(method==='newton'){
          slope=D(x);
          if(df){const auto=evaluate(f,x,true);if(Math.abs(slope-auto)>1e-6*Math.max(1,Math.abs(auto)))return done('invalid','Derivative does not match',`The supplied f′(x) disagrees with automatic differentiation at x = ${x}. Correct it or leave the derivative field blank.`);}
          if(slope===0)return done('breakdown','Zero derivative','Newton cannot divide by f′(x)=0. Choose another start or try a bracketed method.');
          nextX=x-fx/slope;
        }
        if(method==='secant'){
          denom=fx-fprev;if(denom===0)return done('breakdown','Zero secant denominator','The two function values are equal, so the secant line is horizontal. Choose starts with different function values.');
          // At iteration 1, use x₁ as the current iterate and x₀ as the previous one.
          nextX=prev-fprev*(prev-x)/(fprev-fx);
        }
        if(!Number.isFinite(nextX)||Math.abs(nextX)>1e100)return done('diverged','Iteration escaped','An iterate became non-finite or exceeded 10¹⁰⁰. Try a different start, bracket, or Fixed Point rearrangement.');
        const previous=method==='secant'?prev:x,step=Math.abs(nextX-previous);
        const r=row(nextX,{previous,step,slope,denom,...(method==='secant'?{xPrev:x,fPrev:fx,xCurrent:prev,fCurrent:fprev}:{}),...(method==='fixed'?{defect:Math.abs(G(nextX)-nextX),bound:result.conditions.verified?result.conditions.k/(1-result.conditions.k)*step:null}:{})});
        if(method==='fixed'&&(nextX<c.a||nextX>c.b)&&!result.warnings.includes('An iterate left [a, b]. Interval conditions no longer apply to the trajectory.'))result.warnings.push('An iterate left [a, b]. Interval conditions no longer apply to the trajectory.');
        if(method==='fixed'&&r.defect===0&&r.residual>c.tol)return done('mismatch','Fixed point, residual still too large','g(x) equals x in floating-point arithmetic, but |f(x)| still exceeds tolerance. Check the algebraic rearrangement and numerical conditioning; a fixed point alone is not a verified root of f.');
        if(r.fx===0&&(method!=='fixed'||r.defect<=c.tol))return done('converged','Root found','The iterate evaluates to zero in the original function.');
        if(step<=c.tol&&r.residual<=c.tol&&(method!=='fixed'||r.defect<=c.tol))return done('converged','Stopping rule satisfied','Both the absolute step and the original residual are within tolerance.'+(method==='fixed'?' The fixed-point defect |g(x)−x| is also within tolerance.':''));
        if(nextX===previous)return done('stalled','Iteration stalled','Floating-point rounding produced no change, but the residual still fails the stopping rule. A tiny step alone is not evidence of a root.');
        if(method!=='secant'&&(nextX===result.start.x||result.rows.slice(0,-1).some(q=>q.x===nextX)))return done('cycle','Iteration is cycling','An iterate has returned to a previous value without satisfying the stopping rule. This deterministic update will repeat the same cycle. Choose a different start or a different Fixed Point rearrangement.');
        if(method==='secant'){x=prev;fx=fprev;prev=nextX;fprev=r.fx;}else{x=nextX;fx=r.fx;}
      }
    }
  }catch(e){return done('breakdown','Calculation stopped',e.message+' Try a start or interval inside the real domain.');}
  if(method==='fixed'&&result.rows.at(-1)?.defect<=c.tol&&result.rows.at(-1).residual>c.tol)return done('mismatch','Fixed-point defect small, residual too large','The limit was reached with |g(x)−x| within tolerance, but |f(x)| still fails. Check the rearrangement, conditioning, or iteration limit. This does not by itself prove the rearrangement is wrong.');
  return result;
}
export function safeValue(ast,x){try{return evaluate(ast,x);}catch{return null;}}
