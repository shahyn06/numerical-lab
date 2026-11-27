import {differentiate,errorSeries,forwardDifference,backwardDifference,centralDifference,tableDifferences,validateTablePoints,DIFFERENCE_METHODS} from './differentiation.js';
import {safeValue} from './engine.js';
import {escapeHTML as esc,format as fmt,math,mn,expressionMath} from './ui-math.js';
import {bindGraphDrag,dragHandle} from './graph-drag.js';

const $=s=>document.querySelector(s);
const H_MIN=0.001,H_MAX=2;
const PRESETS={lecture:{f:'ln(x)',a:1.8,h:0.1},quadratic:{f:'x^2',a:1,h:0.1},cubic:{f:'x^3',a:1,h:0.1},sine:{f:'sin(x)',a:0.8,h:0.1},cosine:{f:'cos(x)',a:0.8,h:0.1},exponential:{f:'exp(x)',a:1,h:0.1},root:{f:'sqrt(x)',a:2,h:0.1}};
const METHOD_NAMES={forward:'Forward Difference',backward:'Backward Difference',central:'Central Difference'};
const METHOD_SHORT={forward:'Forward',backward:'Backward',central:'Central'};
const METHOD_COLORS={forward:'var(--blue)',backward:'var(--lime)',central:'var(--red)'};
const TIPS={
  forward:['Look ahead one step.','Forward Difference reads the slope from a to the next point on the right. It is simple, but it cannot see the curve bending behind a.'],
  backward:['Look back one step.','Backward Difference reads the slope from the previous point up to a. It is the natural choice at the right end of a data table.'],
  central:['Straddle the point.','Central Difference balances one point on each side of a. The symmetry cancels the largest error term, giving O(h²) accuracy.'],
  compare:['Three estimates, one tangent.','Compare all three secants against the exact tangent. Watch which line hugs the tangent as h changes.']
};
const INTUITION={
  forward:'Forward Difference uses a and the point immediately to its right. The secant slopes forward, so the estimate leans on how the function behaves after a.',
  backward:'Backward Difference uses the point immediately to the left of a and a itself. The secant slopes into a from behind, which suits the last point of a table.',
  central:'Central Difference uses one point on each side of a and never evaluates f at a. The two-sided balance cancels the leading error term, which is why its error is O(h²) instead of O(h).',
  compare:'Each method draws its own secant through a different pair of points, but all three aim at the same tangent slope. Comparing them at one h shows how much the choice of points matters.'
};
let method='forward',result=null,inputError=null,lessonIndex=0,taylorStep=0,quiz=null;
let mode='function',tableResult=null,tableError=null,tableTargetX=null,tableSeeded=false;
const TABLE_DEFAULT=[{x:'1',y:'1.002'},{x:'1.5',y:'1.0004'},{x:'2',y:'1.0005'},{x:'2.5',y:'1.00006'}];
let showTangent=true,showSecant=true,showLabels=true;
let graphGeometry=null,viewportLock=null,seriesCache={key:'',data:null};
let animTimer=null,animStartH=null;
const sliderToH=v=>Math.pow(10,Math.log10(H_MIN)+(v/1000)*(Math.log10(H_MAX)-Math.log10(H_MIN)));
const hToSlider=h=>Math.max(0,Math.min(1000,Math.round(1000*(Math.log10(h)-Math.log10(H_MIN))/(Math.log10(H_MAX)-Math.log10(H_MIN)))));
function message(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(message.timer);message.timer=setTimeout(()=>$('#toast').hidden=true,2600);}
function bestMethod(){if(!result)return null;let best=null;for(const m of DIFFERENCE_METHODS){const e=result.methods[m].absError;if(e!=null&&(best==null||e<result.methods[best].absError))best=m;}return best;}

function compute(){
  if(mode==='table'){computeTable();return;}
  inputError=null;
  try{result=differentiate({expression:$('#diff-function').value,a:$('#diff-a').value,h:$('#diff-h').value});}
  catch(e){result=null;inputError=e.message;}
  const box=$('#diff-error');box.hidden=!inputError;if(inputError)box.textContent=inputError;
  seriesCache={key:'',data:null};
  render();
}
function render(){
  if(mode==='table'){renderTableSummary();renderTableFormula();renderTableExplanation();renderTableCompare();}
  else{renderSummary();renderFormula();renderExplanation();renderCompare();}
  drawDifferentiation();
}

function renderSummary(){
  const el=$('#diff-summary');
  if(!result){el.innerHTML=`<div class="metric"><p class="metric-label">Approximate derivative</p><div class="metric-value">—</div><div class="metric-sub">Check the inputs above</div></div><div class="metric"><p class="metric-label">Exact derivative</p><div class="metric-value">—</div><div class="metric-sub">Automatic differentiation</div></div><div class="metric"><p class="metric-label">Absolute error</p><div class="metric-value">—</div><div class="metric-sub">Check the inputs above</div></div>`;return;}
  const best=bestMethod(),entry=method==='compare'?null:result.methods[method];
  const shown=method==='compare'?(best?result.methods[best]:null):entry;
  el.innerHTML=`
    <div class="metric"><p class="metric-label">${method==='compare'?'Most accurate method':'Approximate derivative'}</p><div class="metric-value">${method==='compare'?(best?esc(METHOD_SHORT[best]):'—'):(entry&&entry.value!=null?esc(fmt(entry.value,10)):'—')}</div><div class="metric-sub">${method==='compare'?(best?`Absolute error · ${esc(fmt(result.methods[best].absError))}`:'No method is available here'):`f′(${esc(fmt(result.a,6))}) · ${esc(METHOD_NAMES[method])}`}</div></div>
    <div class="metric"><p class="metric-label">Exact derivative</p><div class="metric-value">${result.exact!=null?esc(fmt(result.exact,10)):'—'}</div><div class="metric-sub">${result.exact!=null?'Automatic differentiation':'Not available at this point'}</div></div>
    <div class="metric"><p class="metric-label">Absolute error</p><div class="metric-value">${shown&&shown.absError!=null?esc(fmt(shown.absError,4)):'—'}</div><div class="metric-sub">${shown&&shown.relError!=null?`Relative error · ${esc(fmt(shown.relError*100,4))}%`:'Relative error unavailable'}</div></div>`;
}

function formulaMath(m){
  const r=result,F=v=>`<mrow><mi>f</mi><mo>(</mo>${mn(v)}<mo>)</mo></mrow>`,D=`<mrow><mi>f</mi><mo>′</mo><mo>(</mo>${mn(r.a)}<mo>)</mo></mrow>`;
  const symbolic={
    forward:`<mfrac><mrow>${F(r.a+r.h)}<mo>−</mo>${F(r.a)}</mrow><mrow>${mn(r.h)}</mrow></mfrac>`,
    backward:`<mfrac><mrow>${F(r.a)}<mo>−</mo>${F(r.a-r.h)}</mrow><mrow>${mn(r.h)}</mrow></mfrac>`,
    central:`<mfrac><mrow>${F(r.a+r.h)}<mo>−</mo>${F(r.a-r.h)}</mrow><mrow>${mn(2*r.h)}</mrow></mfrac>`}[m];
  const entry=r.methods[m];
  if(entry.error)return `${D}<mo>≈</mo>${symbolic}`;
  const values={
    forward:`<mfrac><mrow>${mn(r.fPlus)}<mo>−</mo>${mn(r.fa)}</mrow><mrow>${mn(r.h)}</mrow></mfrac>`,
    backward:`<mfrac><mrow>${mn(r.fa)}<mo>−</mo>${mn(r.fMinus)}</mrow><mrow>${mn(r.h)}</mrow></mfrac>`,
    central:`<mfrac><mrow>${mn(r.fPlus)}<mo>−</mo>${mn(r.fMinus)}</mrow><mrow>${mn(2*r.h)}</mrow></mfrac>`}[m];
  return `${D}<mo>≈</mo>${symbolic}<mo>=</mo>${values}<mo>=</mo>${mn(entry.value)}`;
}
function formulaSteps(m){
  const r=result,e=r.methods[m];
  if(e.error)return [e.error];
  if(m==='forward')return [
    `Start at a = ${fmt(r.a)} and step forward to a + h = ${fmt(r.a+r.h)}.`,
    `Evaluate f(a) = ${fmt(r.fa)} and f(a + h) = ${fmt(r.fPlus)}.`,
    `Divide the change in f by the distance ${fmt(r.h)}: the quotient is ${fmt(e.value)}.`];
  if(m==='backward')return [
    `Start at a = ${fmt(r.a)} and step back to a − h = ${fmt(r.a-r.h)}.`,
    `Evaluate f(a − h) = ${fmt(r.fMinus)} and f(a) = ${fmt(r.fa)}.`,
    `Divide the change in f by the distance ${fmt(r.h)}: the quotient is ${fmt(e.value)}.`];
  return [
    `Use the two points around a: a − h = ${fmt(r.a-r.h)} and a + h = ${fmt(r.a+r.h)}. The value at a itself is not used.`,
    `Evaluate f(a − h) = ${fmt(r.fMinus)} and f(a + h) = ${fmt(r.fPlus)}.`,
    `Divide the change in f by the total distance 2h = ${fmt(2*r.h)}: the quotient is ${fmt(e.value)}.`];
}
function renderFormula(){
  const title=$('#diff-formula-title'),box=$('#diff-formula'),steps=$('#diff-steps'),values=$('#diff-values');
  if(!result){title.textContent=method==='compare'?'Compare All':METHOD_NAMES[method];box.innerHTML='';steps.innerHTML='';values.innerHTML='';return;}
  title.textContent=method==='compare'?'Compare All':METHOD_NAMES[method];
  const head=math(`<mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo><mo>=</mo>${expressionMath(result.ast)}</mrow>`);
  box.innerHTML=head+(method==='compare'
    ?DIFFERENCE_METHODS.map(m=>`<p class="diff-formula-name">${esc(METHOD_NAMES[m])}</p>${math(formulaMath(m))}`).join('')
    :math(formulaMath(method)));
  values.innerHTML=[['f(a − h)',result.fMinus],['f(a)',result.fa],['f(a + h)',result.fPlus]]
    .map(([label,v])=>`<span>${label} = <b>${v==null?'undefined':esc(fmt(v))}</b></span>`).join('');
  steps.innerHTML=(method==='compare'
    ?DIFFERENCE_METHODS.flatMap(m=>[`<li><strong>${esc(METHOD_SHORT[m])}</strong> · ${esc(formulaSteps(m).at(-1))}</li>`])
    :formulaSteps(method).map(s=>`<li>${esc(s)}</li>`)).join('');
}

function renderExplanation(){
  const el=$('#diff-explanation');
  if(!result){el.innerHTML=`<div class="explanation-icon bad">!</div><div><h3>Check setup</h3><p>${esc(inputError||'Enter a valid function, target point, and step size.')}</p></div>`;return;}
  const best=bestMethod(),entry=method==='compare'?null:result.methods[method];
  const parts=[`<p>${esc(INTUITION[method])}</p>`];
  if(result.exact!=null&&best)parts.push(`<p>${esc(METHOD_NAMES[best])} is the most accurate of the three at this h.</p><p>Absolute errors at this h — Forward: ${esc(fmt(result.methods.forward.absError))} · Backward: ${esc(fmt(result.methods.backward.absError))} · Central: ${esc(fmt(result.methods.central.absError))}.</p>`);
  if(entry&&entry.error)parts.push(`<p>${esc(entry.error)}</p>`);
  if(result.exact==null&&result.exactError)parts.push(`<p>The exact derivative is unavailable here: ${esc(result.exactError)}</p>`);
  if(result.h<1e-5)parts.push('<p>h is now extremely small. Floating-point round-off in subtracting nearly equal values can grow larger than the truncation error you are removing.</p>');
  el.innerHTML=`<div class="explanation-icon ${best?'':'warn'}">${best?'✓':'!'}</div><div><h3>${method==='compare'?'Comparing the three methods':esc(METHOD_NAMES[method])}</h3>${parts.join('')}</div>`;
}

function renderCompare(){
  const body=$('#diff-table tbody');
  if(!result){body.innerHTML=`<tr><td class="empty-cell" colspan="4">No results yet. Check the setup, then read the comparison here.</td></tr>`;$('#diff-table-footnote').textContent='';return;}
  const best=bestMethod();
  body.innerHTML=DIFFERENCE_METHODS.map(m=>{const e=result.methods[m];return `<tr class="${method===m||(method==='compare'&&m===best)?'selected':''}"><td>${esc(METHOD_NAMES[m])}</td><td class="root-cell">${e.value!=null?esc(fmt(e.value)):'—'}</td><td>${result.exact!=null?esc(fmt(result.exact)):'—'}</td><td>${e.absError!=null?esc(fmt(e.absError)):'—'}</td></tr>`;}).join('');
  $('#diff-table-footnote').textContent='Errors compare each secant slope with the exact derivative from automatic differentiation.';
}

/* ---- Table mode: differences of tabulated (x, F(x)) data ---- */
function readTableRows(){return [...$('#diff-table-rows').children].map(row=>({x:row.querySelector('[data-coordinate="x"]').value,y:row.querySelector('[data-coordinate="y"]').value}));}
function renderTableRows(rows){
  $('#diff-table-rows').innerHTML=rows.map((p,i)=>`<div class="point-entry${tableTargetX!=null&&Number(p.x)===tableTargetX?' selected':''}" data-diff-row="${i}"><span>${i}</span><label class="sr-only" for="diff-point-x-${i}">x at point ${i}</label><input id="diff-point-x-${i}" type="number" step="any" data-coordinate="x" value="${esc(p.x)}"><label class="sr-only" for="diff-point-y-${i}">F(x) at point ${i}</label><input id="diff-point-y-${i}" type="number" step="any" data-coordinate="y" value="${esc(p.y)}"><button type="button" data-remove-diff-point="${i}" aria-label="Remove point ${i}" ${rows.length<=3?'disabled':''}>×</button></div>`).join('');
  $('#diff-table-add').disabled=rows.length>=12;
}
function renderTableTargetOptions(){
  const sel=$('#diff-table-target');
  if(!tableResult){sel.innerHTML='';return;}
  sel.innerHTML=tableResult.points.map(p=>`<option value="${esc(p.x)}" ${p.x===tableResult.a?'selected':''}>${esc(fmt(p.x,6))}</option>`).join('');
}
function computeTable({sortRows=false}={}){
  tableError=null;
  const rows=readTableRows();
  try{
    const sorted=validateTablePoints(rows);
    let idx=tableTargetX==null?-1:sorted.findIndex(p=>p.x===tableTargetX);
    if(idx<0)idx=Math.min(1,sorted.length-1);
    tableResult=tableDifferences(rows,idx);
    tableTargetX=tableResult.a;
    if(sortRows)renderTableRows(tableResult.points.map(p=>({x:String(p.x),y:String(p.y)})));
  }catch(e){tableResult=null;tableError=e.message;}
  const box=$('#diff-table-error');box.hidden=!tableError;if(tableError)box.textContent=tableError;
  [...$('#diff-table-rows').children].forEach(row=>{
    const x=Number(row.querySelector('[data-coordinate="x"]').value);
    row.classList.toggle('selected',tableResult!=null&&x===tableResult.a);
  });
  renderTableTargetOptions();
  render();
}
function renderTableSummary(){
  const el=$('#diff-summary');
  if(!tableResult){el.innerHTML=`<div class="metric"><p class="metric-label">Approximate derivative</p><div class="metric-value">—</div><div class="metric-sub">Check the table above</div></div><div class="metric"><p class="metric-label">Exact derivative</p><div class="metric-value">—</div><div class="metric-sub">Unknown for tabulated data</div></div><div class="metric"><p class="metric-label">Absolute error</p><div class="metric-value">—</div><div class="metric-sub">Needs the exact derivative</div></div>`;return;}
  const entry=method==='compare'?null:tableResult.methods[method];
  el.innerHTML=`
    <div class="metric"><p class="metric-label">Approximate derivative</p><div class="metric-value">${method==='compare'?'—':(entry&&entry.value!=null?esc(fmt(entry.value,10)):'—')}</div><div class="metric-sub">${method==='compare'?'See the comparison table below':(entry&&entry.error?'Not available at this point':`F′(${esc(fmt(tableResult.a,6))}) · ${esc(METHOD_NAMES[method])}`)}</div></div>
    <div class="metric"><p class="metric-label">Exact derivative</p><div class="metric-value">—</div><div class="metric-sub">Unknown for tabulated data</div></div>
    <div class="metric"><p class="metric-label">Absolute error</p><div class="metric-value">—</div><div class="metric-sub">Needs the exact derivative</div></div>`;
}
function tableFormulaMath(m){
  const r=tableResult,F=v=>`<mrow><mi>F</mi><mo>(</mo>${mn(v)}<mo>)</mo></mrow>`,D=`<mrow><mi>F</mi><mo>′</mo><mo>(</mo>${mn(r.a)}<mo>)</mo></mrow>`;
  const entry=r.methods[m];
  if(entry.error){
    const FA=`<mrow><mi>F</mi><mo>(</mo><mi>a</mi><mo>)</mo></mrow>`,FPH=`<mrow><mi>F</mi><mo>(</mo><mi>a</mi><mo>+</mo><mi>h</mi><mo>)</mo></mrow>`,FMH=`<mrow><mi>F</mi><mo>(</mo><mi>a</mi><mo>−</mo><mi>h</mi><mo>)</mo></mrow>`;
    const generic={
      forward:`<mfrac><mrow>${FPH}<mo>−</mo>${FA}</mrow><mrow><mi>h</mi></mrow></mfrac>`,
      backward:`<mfrac><mrow>${FA}<mo>−</mo>${FMH}</mrow><mrow><mi>h</mi></mrow></mfrac>`,
      central:`<mfrac><mrow>${FPH}<mo>−</mo>${FMH}</mrow><mrow><mn>2</mn><mi>h</mi></mrow></mfrac>`}[m];
    return `${D}<mo>≈</mo>${generic}`;
  }
  const symbolic={
    forward:`<mfrac><mrow>${F(r.next.x)}<mo>−</mo>${F(r.a)}</mrow><mrow>${mn(r.hNext)}</mrow></mfrac>`,
    backward:`<mfrac><mrow>${F(r.a)}<mo>−</mo>${F(r.prev.x)}</mrow><mrow>${mn(r.hPrev)}</mrow></mfrac>`,
    central:`<mfrac><mrow>${F(r.next.x)}<mo>−</mo>${F(r.prev.x)}</mrow><mrow>${mn(r.next.x-r.prev.x)}</mrow></mfrac>`}[m];
  const values={
    forward:`<mfrac><mrow>${mn(r.next.y)}<mo>−</mo>${mn(r.fa)}</mrow><mrow>${mn(r.hNext)}</mrow></mfrac>`,
    backward:`<mfrac><mrow>${mn(r.fa)}<mo>−</mo>${mn(r.prev.y)}</mrow><mrow>${mn(r.hPrev)}</mrow></mfrac>`,
    central:`<mfrac><mrow>${mn(r.next.y)}<mo>−</mo>${mn(r.prev.y)}</mrow><mrow>${mn(r.next.x-r.prev.x)}</mrow></mfrac>`}[m];
  return `${D}<mo>≈</mo>${symbolic}<mo>=</mo>${values}<mo>=</mo>${mn(entry.value)}`;
}
function tableFormulaSteps(m){
  const r=tableResult,e=r.methods[m];
  if(e.error)return [e.error];
  if(m==='forward')return [
    `Start at a = ${fmt(r.a)} and use the next table point x = ${fmt(r.next.x)}.`,
    `Read F(${fmt(r.a,6)}) = ${fmt(r.fa)} and F(${fmt(r.next.x,6)}) = ${fmt(r.next.y)} from the table.`,
    `Divide the change in F by the spacing ${fmt(r.hNext)}: the quotient is ${fmt(e.value)}.`];
  if(m==='backward')return [
    `Start at a = ${fmt(r.a)} and use the previous table point x = ${fmt(r.prev.x)}.`,
    `Read F(${fmt(r.prev.x,6)}) = ${fmt(r.prev.y)} and F(${fmt(r.a,6)}) = ${fmt(r.fa)} from the table.`,
    `Divide the change in F by the spacing ${fmt(r.hPrev)}: the quotient is ${fmt(e.value)}.`];
  return [
    `Use the two table points around a: ${fmt(r.prev.x)} and ${fmt(r.next.x)}. The value at a itself is not used.`,
    `Read F(${fmt(r.prev.x,6)}) = ${fmt(r.prev.y)} and F(${fmt(r.next.x,6)}) = ${fmt(r.next.y)} from the table.`,
    `Divide the change in F by the total distance ${fmt(r.next.x-r.prev.x)}: the quotient is ${fmt(e.value)}.`];
}
function renderTableFormula(){
  const title=$('#diff-formula-title'),box=$('#diff-formula'),steps=$('#diff-steps'),values=$('#diff-values');
  title.textContent=method==='compare'?'Compare All':METHOD_NAMES[method];
  if(!tableResult){box.innerHTML='';steps.innerHTML='';values.innerHTML='';return;}
  box.innerHTML=method==='compare'
    ?DIFFERENCE_METHODS.map(m=>`<p class="diff-formula-name">${esc(METHOD_NAMES[m])}</p>${math(tableFormulaMath(m))}`).join('')
    :math(tableFormulaMath(method));
  const chips=[];
  if(tableResult.prev)chips.push([tableResult.prev,'R']);
  chips.push([{x:tableResult.a,y:tableResult.fa},'P']);
  if(tableResult.next)chips.push([tableResult.next,'Q']);
  values.innerHTML=chips.map(([p])=>`<span>F(${esc(fmt(p.x,6))}) = <b>${esc(fmt(p.y))}</b></span>`).join('');
  steps.innerHTML=(method==='compare'
    ?DIFFERENCE_METHODS.flatMap(m=>[`<li><strong>${esc(METHOD_SHORT[m])}</strong> · ${esc(tableFormulaSteps(m).at(-1))}</li>`])
    :tableFormulaSteps(method).map(s=>`<li>${esc(s)}</li>`)).join('');
}
function renderTableExplanation(){
  const el=$('#diff-explanation');
  if(!tableResult){el.innerHTML=`<div class="explanation-icon bad">!</div><div><h3>Check setup</h3><p>${esc(tableError||'Enter at least three table points with distinct x values.')}</p></div>`;return;}
  const entry=method==='compare'?null:tableResult.methods[method];
  const parts=[`<p>${esc(INTUITION[method])}</p>`,`<p>The exact derivative is unknown because the table does not reveal the underlying function, so no error can be computed.</p>`];
  if(entry&&entry.error)parts.push(`<p>${esc(entry.error)}</p>`);
  if(method==='compare'){
    const avail=DIFFERENCE_METHODS.filter(m=>!tableResult.methods[m].error).map(m=>METHOD_SHORT[m]);
    parts.push(`<p>${avail.length?`Available at this point: ${avail.join(' · ')}.`:'No method is available at this point.'}</p>`);
  }
  el.innerHTML=`<div class="explanation-icon warn">!</div><div><h3>${method==='compare'?'Comparing the three methods':esc(METHOD_NAMES[method])}</h3>${parts.join('')}</div>`;
}
function renderTableCompare(){
  const body=$('#diff-table tbody');
  if(!tableResult){body.innerHTML=`<tr><td class="empty-cell" colspan="4">No results yet. Check the setup, then read the comparison here.</td></tr>`;$('#diff-table-footnote').textContent='';return;}
  body.innerHTML=DIFFERENCE_METHODS.map(m=>{const e=tableResult.methods[m];return `<tr class="${method===m?'selected':''}"><td>${esc(METHOD_NAMES[m])}</td><td class="root-cell">${e.value!=null?esc(fmt(e.value)):'—'}</td><td>—</td><td>—</td></tr>`;}).join('');
  $('#diff-table-footnote').textContent='With tabulated data the underlying function is unknown, so there is no exact derivative to compare errors against.';
}
function setMode(next){
  if(mode===next)return;
  mode=next;stopAnimation();
  document.querySelectorAll('[data-diff-mode]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.diffMode===mode)));
  $('#diff-function-mode').hidden=mode!=='function';
  $('#diff-table-mode').hidden=mode!=='table';
  if(mode==='table'&&!tableSeeded){tableSeeded=true;tableTargetX=1.5;renderTableRows(TABLE_DEFAULT);computeTable();}
  else compute();
}

export function drawDifferentiation(){drawGraph();drawBars();drawErrorChart();}
function drawGraph(){
  const svg=$('#diff-chart');
  if(mode==='table'){drawTableGraph();return;}
  if(!result||$('#differentiation-lab').hidden)return;
  const r=result,W=Math.max(300,svg.getBoundingClientRect().width),H=W<430?260:300,L=55,R=22,T=20,B=40,iw=W-L-R,ih=H-T-B;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const half=Math.max(1.25,4.5*r.h);
  let xmin=r.a-half,xmax=r.a+half;
  const samples=[];for(let j=0;j<=360;j++){const x=xmin+(xmax-xmin)*j/360;samples.push([x,safeValue(r.ast,x)]);}
  const ys=samples.map(s=>s[1]).filter(y=>y!=null&&Math.abs(y)<1e15);
  for(const v of [r.fMinus,r.fa,r.fPlus])if(v!=null&&Math.abs(v)<1e15)ys.push(v);
  ys.sort((p,q)=>p-q);
  let ymin,ymax;
  if(ys.length){ymin=Math.min(0,ys[Math.floor(ys.length*.02)]);ymax=Math.max(0,ys[Math.min(ys.length-1,Math.floor(ys.length*.98))]);}
  else{ymin=-1;ymax=1;}
  if(ymin===ymax){ymin-=1;ymax+=1;}
  const padY=(ymax-ymin)*.12;ymin-=padY;ymax+=padY;
  if(viewportLock)({xmin,xmax,ymin,ymax}=viewportLock);
  graphGeometry={left:L,right:W-R,top:T,bottom:H-B,xmin,xmax,ymin,ymax};
  const X=x=>L+(x-xmin)/(xmax-xmin)*iw,Y=y=>T+(ymax-y)/(ymax-ymin)*ih;
  const line=(x1,y1,x2,y2,color='var(--graph-grid)',dash='',width=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
  const text=(x,y,s,anchor='middle',cl='')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cl}">${esc(s)}</text>`;
  let content=`<defs><clipPath id="diff-clip"><rect x="${L}" y="${T}" width="${iw}" height="${ih}"/></clipPath></defs>`;
  for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4,y=ymin+(ymax-ymin)*i/4;content+=line(X(x),T,X(x),H-B)+text(X(x),H-B+20,fmt(x,4));content+=line(L,Y(y),W-R,Y(y))+text(L-9,Y(y)+3,fmt(y,4),'end');}
  content+=text(W-R,H-3,'x','end','axis-label')+text(L,T-7,'f(x)','start','axis-label');
  let plot='';
  if(xmin<=0&&xmax>=0)plot+=line(X(0),T,X(0),H-B,'var(--graph-axis)');
  if(ymin<=0&&ymax>=0)plot+=line(L,Y(0),W-R,Y(0),'var(--graph-axis)');
  let d='',active=false;
  for(const [x,y] of samples){if(y==null){active=false;continue;}const yy=Y(y);if(!Number.isFinite(yy)||Math.abs(yy)>1e5){active=false;continue;}d+=(active?'L':'M')+X(x).toFixed(2)+' '+yy.toFixed(2);active=true;}
  plot+=`<path d="${d}" fill="none" stroke="var(--graph-curve)" stroke-width="2.3"/>`;
  const secant=(x1,y1,x2,y2,color,dash='')=>{if(y1==null||y2==null)return '';const dx=x2-x1,dy=y2-y1;return line(X(x1-dx*.45),Y(y1-dy*.45),X(x2+dx*.45),Y(y2+dy*.45),color,dash,1.8);};
  if(showTangent&&r.exact!=null&&r.fa!=null){const ext=(xmax-xmin)*.32;plot+=line(X(r.a-ext),Y(r.fa-r.exact*ext),X(r.a+ext),Y(r.fa+r.exact*ext),'var(--graph-muted)','6 4',1.6);}
  const activeMethods=method==='compare'?DIFFERENCE_METHODS:[method];
  if(showSecant)for(const m of activeMethods){
    if(m==='forward')plot+=secant(r.a,r.fa,r.a+r.h,r.fPlus,METHOD_COLORS.forward);
    if(m==='backward')plot+=secant(r.a-r.h,r.fMinus,r.a,r.fa,METHOD_COLORS.backward);
    if(m==='central')plot+=secant(r.a-r.h,r.fMinus,r.a+r.h,r.fPlus,METHOD_COLORS.central);
  }
  const point=(x,y,color,title)=>y==null?'':`<circle cx="${X(x)}" cy="${Y(y)}" r="4.5" fill="${color}" stroke="var(--graph-dot-border)" stroke-width="2"><title>${esc(title)}: (${fmt(x)}, ${fmt(y)})</title></circle>`;
  const showR=method!=='forward',showQ=method!=='backward';
  if(showR)plot+=point(r.a-r.h,r.fMinus,'var(--lime)','Backward point R');
  if(showQ)plot+=point(r.a+r.h,r.fPlus,'var(--blue)','Forward point Q');
  if(showLabels){
    const label=(x,y,s)=>y==null?'':text(X(x),Y(y)-11,s,'middle','point-label');
    plot+=(showR?label(r.a-r.h,r.fMinus,'R'):'')+label(r.a,r.fa,'P')+(showQ?label(r.a+r.h,r.fPlus,'Q'):'');
    const by=H-B-16,bracket=(x1,x2,s,yOff=0)=>line(X(x1),by+yOff,X(x2),by+yOff,'var(--graph-axis)')+line(X(x1),by+yOff-4,X(x1),by+yOff+4,'var(--graph-axis)')+line(X(x2),by+yOff-4,X(x2),by+yOff+4,'var(--graph-axis)')+text((X(x1)+X(x2))/2,by+yOff-5,s);
    if(method==='forward')plot+=bracket(r.a,r.a+r.h,'h');
    if(method==='backward')plot+=bracket(r.a-r.h,r.a,'h');
    if(method==='central'||method==='compare'){plot+=bracket(r.a-r.h,r.a,'h')+bracket(r.a,r.a+r.h,'h');if(method==='central')plot+=bracket(r.a-r.h,r.a+r.h,'2h',15);}
  }
  if(r.fa!=null){
    plot+=point(r.a,r.fa,'var(--graph-orange)','Target point P');
    const cy=Math.max(ymin,Math.min(ymax,r.fa));
    plot+=dragHandle({cx:X(r.a),cy:Y(cy),label:'Target point a',value:r.a,min:xmin,max:xmax,description:`a = ${fmt(r.a)}, f(a) = ${fmt(r.fa)}`});
  }
  content+=`<g clip-path="url(#diff-clip)">${plot}</g>`;
  svg.innerHTML=content;
  const legend=[`<span><i class="legend-line"></i> f(x)</span>`,`<span><i class="legend-dot" style="background:var(--graph-orange)"></i> Target point P</span>`];
  if(showSecant)for(const m of activeMethods)legend.push(`<span><i class="legend-line" style="background:${METHOD_COLORS[m]}"></i> ${esc(METHOD_NAMES[m])} secant</span>`);
  if(showTangent&&r.exact!=null)legend.push('<span><i class="legend-line dashed"></i> Tangent line</span>');
  $('#diff-legend').innerHTML=legend.join('');
  const entry=method==='compare'?null:result.methods[method],best=bestMethod();
  let caption;
  if(method==='compare')caption=best?`${METHOD_NAMES[best]} is closest to the tangent at this h.`:'Three secants, one tangent. No method is available at this point.';
  else if(entry&&entry.error)caption=entry.error;
  else if(entry&&result.exact!=null)caption=`The secant through ${method==='forward'?'P and Q':method==='backward'?'R and P':'R and Q'} has slope ${fmt(entry.value)}; the tangent has slope ${fmt(result.exact)}.`;
  else caption=`The secant through ${method==='forward'?'P and Q':method==='backward'?'R and P':'R and Q'} has slope ${entry?fmt(entry.value):'—'}.`;
  $('#diff-chart-caption').textContent=caption;
  svg.setAttribute('aria-label',caption);
  const approx=method==='compare'?(best?result.methods[best].value:null):(entry?entry.value:null);
  $('#diff-probe-value').textContent=r.fa==null?`a = ${fmt(r.a,7)} · f(a) is undefined here`:`a = ${fmt(r.a,7)} · f(a) = ${fmt(r.fa,7)} · f′(a) ≈ ${approx!=null?fmt(approx,7):'—'}`;
}

function drawTableGraph(){
  const svg=$('#diff-chart');
  if($('#differentiation-lab').hidden)return;
  const W=Math.max(300,svg.getBoundingClientRect().width),H=W<430?260:300,L=55,R=22,T=20,B=40,iw=W-L-R,ih=H-T-B;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const line=(x1,y1,x2,y2,color='var(--graph-grid)',dash='',width=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
  const text=(x,y,s,anchor='middle',cl='')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cl}">${esc(s)}</text>`;
  if(!tableResult){svg.innerHTML='';$('#diff-legend').innerHTML='';$('#diff-chart-caption').textContent=tableError||'';svg.setAttribute('aria-label',tableError||'');$('#diff-probe-value').textContent='';return;}
  const r=tableResult,pts=r.points;
  let xmin=Math.min(...pts.map(p=>p.x)),xmax=Math.max(...pts.map(p=>p.x));
  let ymin=Math.min(0,...pts.map(p=>p.y)),ymax=Math.max(0,...pts.map(p=>p.y));
  const padX=(xmax-xmin||1)*.18;xmin-=padX;xmax+=padX;
  if(ymin===ymax){ymin-=1;ymax+=1;}
  const padY=(ymax-ymin)*.15;ymin-=padY;ymax+=padY;
  graphGeometry={left:L,right:W-R,top:T,bottom:H-B,xmin,xmax,ymin,ymax};
  const X=x=>L+(x-xmin)/(xmax-xmin)*iw,Y=y=>T+(ymax-y)/(ymax-ymin)*ih;
  let content=`<defs><clipPath id="diff-clip"><rect x="${L}" y="${T}" width="${iw}" height="${ih}"/></clipPath></defs>`;
  for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4,y=ymin+(ymax-ymin)*i/4;content+=line(X(x),T,X(x),H-B)+text(X(x),H-B+20,fmt(x,4));content+=line(L,Y(y),W-R,Y(y))+text(L-9,Y(y)+3,fmt(y,4),'end');}
  content+=text(W-R,H-3,'x','end','axis-label')+text(L,T-7,'F(x)','start','axis-label');
  let plot='';
  if(xmin<=0&&xmax>=0)plot+=line(X(0),T,X(0),H-B,'var(--graph-axis)');
  if(ymin<=0&&ymax>=0)plot+=line(L,Y(0),W-R,Y(0),'var(--graph-axis)');
  plot+=`<path d="${pts.map((p,i)=>(i?'L':'M')+X(p.x).toFixed(2)+' '+Y(p.y).toFixed(2)).join('')}" fill="none" stroke="var(--graph-muted)" stroke-width="1.2" stroke-dasharray="3 4" opacity=".55"/>`;
  const secant=(p1,p2,color)=>{const dx=p2.x-p1.x,dy=p2.y-p1.y;return line(X(p1.x-dx*.45),Y(p1.y-dy*.45),X(p2.x+dx*.45),Y(p2.y+dy*.45),color,'',1.8);};
  const activeMethods=method==='compare'?DIFFERENCE_METHODS:[method];
  if(showSecant)for(const m of activeMethods){
    if(m==='forward'&&r.next)plot+=secant({x:r.a,y:r.fa},r.next,METHOD_COLORS.forward);
    if(m==='backward'&&r.prev)plot+=secant(r.prev,{x:r.a,y:r.fa},METHOD_COLORS.backward);
    if(m==='central'&&r.prev&&r.next)plot+=secant(r.prev,r.next,METHOD_COLORS.central);
  }
  const showR=method!=='forward',showQ=method!=='backward';
  const dot=p=>`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3.2" fill="var(--graph-muted)" stroke="var(--graph-dot-border)" stroke-width="1.4"><title>(${fmt(p.x)}, ${fmt(p.y)})</title></circle>`;
  for(const p of pts){if(p===r.prev||p===r.next||p.x===r.a)continue;plot+=dot(p);}
  const point=(p,color,title)=>`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="4.5" fill="${color}" stroke="var(--graph-dot-border)" stroke-width="2"><title>${esc(title)}: (${fmt(p.x)}, ${fmt(p.y)})</title></circle>`;
  if(showR&&r.prev)plot+=point(r.prev,'var(--lime)','Backward point R');
  if(showQ&&r.next)plot+=point(r.next,'var(--blue)','Forward point Q');
  if(showLabels){
    const label=(p,s)=>text(X(p.x),Y(p.y)-11,s,'middle','point-label');
    if(showR&&r.prev)plot+=label(r.prev,'R');
    plot+=label({x:r.a,y:r.fa},'P');
    if(showQ&&r.next)plot+=label(r.next,'Q');
    const by=H-B-16,bracket=(x1,x2,s,yOff=0)=>line(X(x1),by+yOff,X(x2),by+yOff,'var(--graph-axis)')+line(X(x1),by+yOff-4,X(x1),by+yOff+4,'var(--graph-axis)')+line(X(x2),by+yOff-4,X(x2),by+yOff+4,'var(--graph-axis)')+text((X(x1)+X(x2))/2,by+yOff-5,s);
    if(method!=='forward'&&r.prev)plot+=bracket(r.prev.x,r.a,fmt(r.hPrev,4));
    if(method!=='backward'&&r.next)plot+=bracket(r.a,r.next.x,fmt(r.hNext,4));
    if(method==='central'&&r.prev&&r.next)plot+=bracket(r.prev.x,r.next.x,fmt(r.next.x-r.prev.x,4),15);
  }
  plot+=point({x:r.a,y:r.fa},'var(--graph-orange)','Target point P');
  content+=`<g clip-path="url(#diff-clip)">${plot}</g>`;
  svg.innerHTML=content;
  const legend=[`<span><i class="legend-dot" style="background:var(--graph-muted)"></i> Data points</span>`,`<span><i class="legend-dot" style="background:var(--graph-orange)"></i> Target point P</span>`];
  if(showSecant)for(const m of activeMethods){if(tableResult.methods[m].error)continue;legend.push(`<span><i class="legend-line" style="background:${METHOD_COLORS[m]}"></i> ${esc(METHOD_NAMES[m])} secant</span>`);}
  $('#diff-legend').innerHTML=legend.join('');
  const entry=method==='compare'?null:tableResult.methods[method];
  let caption;
  if(method==='compare')caption='Three secants from the table points. No tangent is available without the underlying function.';
  else if(entry&&entry.error)caption=entry.error;
  else caption=`The secant through ${method==='forward'?'P and Q':method==='backward'?'R and P':'R and Q'} has slope ${fmt(entry.value)}.`;
  $('#diff-chart-caption').textContent=caption;
  svg.setAttribute('aria-label',caption);
  const approx=method==='compare'||!entry||entry.value==null?null:entry.value;
  $('#diff-probe-value').textContent=`a = ${fmt(r.a,7)} · F(a) = ${fmt(r.fa,7)} · F′(a) ≈ ${approx!=null?fmt(approx,7):'—'}`;
}

function drawBars(){
  const svg=$('#diff-bars');
  if(mode==='table'){
    if($('#differentiation-lab').hidden)return;
    svg.setAttribute('viewBox','0 0 900 190');
    svg.innerHTML=`<text x="15" y="40">${esc(tableResult?'No exact derivative, so errors cannot be compared.':'No errors to compare yet.')}</text>`;
    return;
  }
  if(!result||$('#differentiation-lab').hidden)return;
  const W=Math.max(300,svg.getBoundingClientRect().width),H=190,L=30,R=16,T=26,B=34,iw=W-L-R,ih=H-T-B;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const text=(x,y,s,anchor='middle')=>`<text x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;
  const entries=DIFFERENCE_METHODS.map(m=>({m,e:result.methods[m].absError})).filter(x=>x.e!=null);
  if(!entries.length){svg.innerHTML=text(15,40,'No errors to compare yet.','start');return;}
  const logs=entries.map(x=>x.e===0?-16:Math.log10(x.e));
  let hi=Math.max(...logs),lo=Math.min(...logs);if(hi-lo<1)lo=hi-1;hi+=0.3;
  let content='';
  DIFFERENCE_METHODS.forEach((m,i)=>{
    const e=result.methods[m].absError,cx=L+iw*(2*i+1)/6,bw=Math.min(64,iw/9);
    if(e==null){content+=text(cx,T+ih/2,'—');}
    else{const frac=e===0?0.04:0.06+0.94*(Math.log10(e)-lo)/(hi-lo),bh=Math.max(3,frac*ih);content+=`<rect x="${cx-bw/2}" y="${T+ih-bh}" width="${bw}" height="${bh}" fill="${METHOD_COLORS[m]}" rx="3"/>`+text(cx,T+ih-bh-7,fmt(e,3));}
    content+=text(cx,H-10,METHOD_SHORT[m]);
  });
  svg.innerHTML=content;
}

function drawErrorChart(){
  const svg=$('#diff-error-chart');
  if(mode==='table'){
    if($('#differentiation-lab').hidden)return;
    svg.setAttribute('viewBox','0 0 900 240');
    svg.innerHTML=`<text x="15" y="40">${esc('The exact derivative is unavailable, so errors cannot be measured.')}</text>`;
    $('#diff-error-legend').innerHTML='';
    return;
  }
  if(!result||$('#differentiation-lab').hidden)return;
  const key=result.expression+'|'+result.a;
  if(seriesCache.key!==key)seriesCache={key,data:errorSeries({expression:result.expression,a:result.a})};
  const data=seriesCache.data,W=Math.max(300,svg.getBoundingClientRect().width),H=240,L=55,R=16,T=16,B=36,iw=W-L-R,ih=H-T-B;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const text=(x,y,s,anchor='middle',cl='')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cl}">${esc(s)}</text>`;
  const line=(x1,y1,x2,y2,color='var(--graph-grid)',dash='',width=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
  if(!data||data.exact==null){svg.innerHTML=text(15,40,'The exact derivative is unavailable, so errors cannot be measured.','start');$('#diff-error-legend').innerHTML='';return;}
  const logs=[];for(const p of data.points)for(const m of DIFFERENCE_METHODS)if(p[m]!=null&&p[m]>0)logs.push(Math.log10(p[m]));
  if(!logs.length){svg.innerHTML=text(15,40,'No errors to compare yet.','start');return;}
  let ymin=Math.floor(Math.min(...logs)),ymax=Math.ceil(Math.max(...logs));if(ymax-ymin<3)ymax=ymin+3;
  const xmin=Math.log10(2),xmax=-8;
  const X=x=>L+(x-xmin)/(xmax-xmin)*iw,Y=y=>T+(ymax-y)/(ymax-ymin)*ih;
  let content='';
  for(const e of [0,-2,-4,-6,-8]){content+=line(X(e),T,X(e),H-B)+text(X(e),H-B+20,e===0?'1':'1e'+e);}
  for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4;content+=line(L,Y(y),W-R,Y(y))+text(L-9,Y(y)+3,fmt(Math.pow(10,y),2),'end');}
  content+=text(W-R,H-3,'h','end','axis-label')+text(L,T-7,'log₁₀ absolute error','start','axis-label');
  let plot='';
  for(const m of DIFFERENCE_METHODS){
    let d='',active=false;
    for(const p of data.points){if(p[m]==null||p[m]<=0){active=false;continue;}d+=(active?'L':'M')+X(Math.log10(p.h)).toFixed(2)+' '+Y(Math.log10(p[m])).toFixed(2);active=true;}
    if(d)plot+=`<path d="${d}" fill="none" stroke="${METHOD_COLORS[m]}" stroke-width="1.8"/>`;
  }
  content+=`<g clip-path="url(#diff-error-clip)">${plot}</g><defs><clipPath id="diff-error-clip"><rect x="${L}" y="${T}" width="${iw}" height="${ih}"/></clipPath></defs>`;
  svg.innerHTML=content;
  $('#diff-error-legend').innerHTML=DIFFERENCE_METHODS.map(m=>`<span><i class="legend-line" style="background:${METHOD_COLORS[m]}"></i> ${esc(METHOD_NAMES[m])}</span>`).join('');
}

const FP=`<mrow><mi>f</mi><mo>′</mo><mo>(</mo><mi>a</mi><mo>)</mo></mrow>`,FPP=`<mrow><mi>f</mi><mo>″</mo><mo>(</mo><mi>a</mi><mo>)</mo></mrow>`,FPPP=`<mrow><mi>f</mi><mo>‴</mo><mo>(</mo><mi>a</mi><mo>)</mo></mrow>`;
const FA=`<mrow><mi>f</mi><mo>(</mo><mi>a</mi><mo>)</mo></mrow>`,FPH=`<mrow><mi>f</mi><mo>(</mo><mi>a</mi><mo>+</mo><mi>h</mi><mo>)</mo></mrow>`,FMH=`<mrow><mi>f</mi><mo>(</mo><mi>a</mi><mo>−</mo><mi>h</mi><mo>)</mo></mrow>`;
const TAYLOR_STEPS=[
  {title:'Expand f(a + h) around a',
   formula:`<mrow>${FPH}<mo>=</mo>${FA}<mo>+</mo><mi>h</mi>${FP}<mo>+</mo><mfrac><msup><mi>h</mi><mn>2</mn></msup><mrow><mn>2</mn><mo>!</mo></mrow></mfrac>${FPP}<mo>+</mo><mfrac><msup><mi>h</mi><mn>3</mn></msup><mrow><mn>3</mn><mo>!</mo></mrow></mfrac>${FPPP}<mo>+</mo><mo>⋯</mo></mrow>`,
   text:'Taylor expansion writes the neighbouring value as the value at a plus correction terms. Each term carries a higher power of h and a higher derivative at a.'},
  {title:'Solve for f′(a): the Forward Difference',
   formula:`<mrow>${FP}<mo>=</mo><mfrac><mrow>${FPH}<mo>−</mo>${FA}</mrow><mrow><mi>h</mi></mrow></mfrac><mo>−</mo><mfrac><mi>h</mi><mn>2</mn></mfrac>${FPP}<mo>−</mo><mo>⋯</mo></mrow>`,
   text:'Move f(a) to the left and divide by h. The first dropped term is (h/2) f″(a), so the forward error shrinks in proportion to h: it is O(h).'},
  {title:'Expand f(a − h) around a',
   formula:`<mrow>${FMH}<mo>=</mo>${FA}<mo>−</mo><mi>h</mi>${FP}<mo>+</mo><mfrac><msup><mi>h</mi><mn>2</mn></msup><mrow><mn>2</mn><mo>!</mo></mrow></mfrac>${FPP}<mo>−</mo><mfrac><msup><mi>h</mi><mn>3</mn></msup><mrow><mn>3</mn><mo>!</mo></mrow></mfrac>${FPPP}<mo>+</mo><mo>⋯</mo></mrow>`,
   text:'Replacing h by −h flips the sign of every odd power of h. The even terms keep their sign; the odd terms change sign.'},
  {title:'Solve for f′(a): the Backward Difference',
   formula:`<mrow>${FP}<mo>=</mo><mfrac><mrow>${FA}<mo>−</mo>${FMH}</mrow><mrow><mi>h</mi></mrow></mfrac><mo>+</mo><mfrac><mi>h</mi><mn>2</mn></mfrac>${FPP}<mo>−</mo><mo>⋯</mo></mrow>`,
   text:'Move f(a − h) to the left and divide by h. The first dropped term is again proportional to h, so the backward error is also O(h).'},
  {title:'Subtract the two expansions',
   formula:`<mrow>${FPH}<mo>−</mo>${FMH}<mo>=</mo><mn>2</mn><mi>h</mi>${FP}<mo>+</mo><mfrac><mrow><mn>2</mn><msup><mi>h</mi><mn>3</mn></msup></mrow><mrow><mn>3</mn><mo>!</mo></mrow></mfrac>${FPPP}<mo>+</mo><mo>⋯</mo></mrow>`,
   text:'Subtract the two expansions. f(a) cancels, the h² terms cancel, and every even-order term cancels the same way. Only odd terms survive, doubled.'},
  {title:'Divide by 2h: the Central Difference',
   formula:`<mrow>${FP}<mo>≈</mo><mfrac><mrow>${FPH}<mo>−</mo>${FMH}</mrow><mrow><mn>2</mn><mi>h</mi></mrow></mfrac></mrow>`,
   text:'Divide by the full distance between the two points, 2h. That distance is why the denominator is 2h and not h. After division the first surviving error term is proportional to h²: the central error is O(h²).'}
];
function renderTaylor(){
  const step=TAYLOR_STEPS[taylorStep];
  $('#diff-taylor-content').innerHTML=`<h3>${esc(step.title)}</h3>${math(step.formula)}<p>${esc(step.text)}</p>`;
  $('#diff-taylor-step-label').textContent=`Step ${taylorStep+1} / ${TAYLOR_STEPS.length}`;
  $('#diff-taylor-back').disabled=taylorStep<=0;
  $('#diff-taylor-next').disabled=taylorStep>=TAYLOR_STEPS.length-1;
}

const square=x=>x*x;
const LESSONS=[
  {title:'What is Numerical Differentiation?',
   intuition:'Numerical differentiation estimates the derivative of a function at a point using only function values at nearby points. Instead of a symbolic derivative, it measures the slope of a line through two points on the curve.',
   formula:'f′(a) ≈ rise / run = (change in f) / (change in x)',
   example:'If a car passes 100 m at t = 4 s and 112 m at t = 5 s, its average speed on that second is 12 m/s — a secant slope standing in for the instantaneous speed.',
   question:'Does numerical differentiation need a formula for f′(x)?',
   answer:'No. It needs only values of f at chosen points; the derivative is estimated from their slope.'},
  {title:'Why do we need numerical derivatives?',
   intuition:'Sometimes f is known only as measured data, or its formula is too complicated to differentiate by hand. A finite difference turns two evaluations into a usable derivative estimate.',
   formula:'',
   example:'A temperature sensor reports values every minute. The rate of warming right now can only come from differences of those readings.',
   question:'Name one situation where an exact derivative is unavailable.',
   answer:'Any situation where f is known only through a table of measured values, with no formula to differentiate.'},
  {title:'Secant line versus tangent line',
   intuition:'The tangent line touches the curve at one point; its slope is the exact derivative. A secant line cuts through two points; its slope is computable from values alone. Numerical differentiation uses a secant slope as a stand-in for the tangent slope.',
   formula:'tangent slope = f′(a) · secant slope = (f(a + h) − f(a)) / h',
   example:'On the graph, the dashed line is the tangent at P and the coloured line is the secant. Shrink h and watch the secant rotate toward the tangent.',
   question:'Which line needs the derivative, and which needs only two function values?',
   answer:'The tangent needs the derivative; the secant needs only two function values.'},
  {title:'Understanding the step size h',
   intuition:'h is the horizontal distance from a to the neighbouring point or points. Large h averages the slope over a wide stretch; small h zooms in on the behaviour at a itself.',
   formula:'forward point: a + h · backward point: a − h · central span: 2h',
   example:'With a = 1.8 and h = 0.1, the forward point is 1.9 and the backward point is 1.7. Halving h to 0.05 moves them to 1.85 and 1.75.',
   question:'What happens to the points a + h and a − h as h shrinks?',
   answer:'They close in on a from both sides, and the secant slopes approach the tangent slope.'},
  {title:'Forward Difference',
   intuition:'Forward Difference uses a and the next point to the right. It is the simplest estimate, and the first one to reach for at the left end of a data table.',
   formula:'f′(a) ≈ (f(a + h) − f(a)) / h',
   example:()=>`For f(x) = x^2 at a = 3 with h = 0.1, the forward difference gives f′(3) ≈ ${fmt(forwardDifference(square,3,0.1))}, while the exact derivative is 6.`,
   question:'Which points does the Forward Difference use?',
   answer:'It uses a and a + h — the point itself and its right neighbour.'},
  {title:'Backward Difference',
   intuition:'Backward Difference uses the point to the left of a and a itself. It mirrors the forward formula, looking back instead of ahead.',
   formula:'f′(a) ≈ (f(a) − f(a − h)) / h',
   example:()=>`For f(x) = x^2 at a = 3 with h = 0.1, the backward difference gives f′(3) ≈ ${fmt(backwardDifference(square,3,0.1))}, while the exact derivative is 6.`,
   question:'When is the Backward Difference the natural choice?',
   answer:'At the last point of a data table, where no right neighbour exists.'},
  {title:'Central Difference',
   intuition:'Central Difference uses one point on each side of a and ignores the value at a itself. The symmetric placement cancels the largest error term, so it is usually far more accurate at the same h.',
   formula:'f′(a) ≈ (f(a + h) − f(a − h)) / (2h)',
   example:()=>`For f(x) = x^2 at a = 3 with h = 0.1, the central difference gives f′(3) ≈ ${fmt(centralDifference(square,3,0.1))}, matching the exact derivative 6.`,
   question:'Does the Central Difference use f(a)?',
   answer:'No. It uses only f(a − h) and f(a + h); the point a sits unused in the middle.'},
  {title:'Understanding numerical error',
   intuition:'The error is the gap between the secant slope and the exact derivative. Truncation error comes from replacing the curve by a line and shrinks as h shrinks; round-off error comes from subtracting nearly equal floating-point numbers and grows when h is tiny.',
   formula:'absolute error = |exact − approximate| · forward/backward: O(h) · central: O(h²)',
   example:'For ln(x) at a = 1.8 with h = 0.1, the central error is about 26 times smaller than the forward error.',
   question:'Why can making h extremely small make the answer worse?',
   answer:'Because f(a + h) and f(a) become nearly equal, and their difference loses significant digits to floating-point round-off.'},
  {title:'Taylor expansion and derivation',
   intuition:'Taylor expansion expresses f(a + h) and f(a − h) as f(a) plus terms in h. Rearranging the first gives the one-sided formulas; subtracting the pair cancels the even terms and gives the central formula with its 2h denominator.',
   formula:'f(a ± h) = f(a) ± h f′(a) + (h²/2) f″(a) ± (h³/6) f‴(a) + ⋯',
   example:'The Taylor derivation section of this lab steps through all three derivations one line at a time.',
   question:'Which terms cancel when the two Taylor expansions are subtracted?',
   answer:'All even-order terms — f(a), the h² term, the h⁴ term — because they appear with the same sign in both expansions.'}
];
function renderLesson(){
  const lesson=LESSONS[lessonIndex],example=typeof lesson.example==='function'?lesson.example():lesson.example;
  $('#diff-lesson-tabs').innerHTML=LESSONS.map((l,i)=>`<button type="button" class="${i===lessonIndex?'active':''}" data-lesson="${i}">Lesson ${i+1}</button>`).join('');
  $('#diff-lesson-content').innerHTML=`<h3>${esc(lesson.title)}</h3><p>${esc(lesson.intuition)}</p>${lesson.formula?`<div class="guide-formula">${esc(lesson.formula)}</div>`:''}<h4>Example</h4><p>${esc(example)}</p><details class="diff-check"><summary>Check your understanding</summary><p>${esc(lesson.question)}</p><p><strong>Answer</strong> · ${esc(lesson.answer)}</p></details>`;
}

const QUIZ_POOL=[{label:'x^2',f:x=>x*x},{label:'x^3',f:x=>x*x*x},{label:'exp(x)',f:Math.exp},{label:'sin(x)',f:Math.sin},{label:'ln(x)',f:Math.log}];
const DIFF_FN={forward:forwardDifference,backward:backwardDifference,central:centralDifference};
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
function shuffled(options,correct){const order=options.map((text,i)=>({text,ok:i===correct})).sort(()=>Math.random()-0.5);return {options:order.map(o=>o.text),correct:order.findIndex(o=>o.ok)};}
function newQuiz(){
  const type=pick(['compute','compute','points','centralPoints','why','compare','predict']);
  if(type==='compute'){
    const fn=pick(QUIZ_POOL),a=pick([0.8,1.2,1.5,2,2.5,3]),h=pick([0.1,0.2,0.25,0.5]),m=pick(DIFFERENCE_METHODS),expected=DIFF_FN[m](fn.f,a,h);
    const explain=m==='forward'?`f′(${fmt(a)}) ≈ (${fmt(fn.f(a+h))} − ${fmt(fn.f(a))}) / ${fmt(h)} = ${fmt(expected)}.`
      :m==='backward'?`f′(${fmt(a)}) ≈ (${fmt(fn.f(a))} − ${fmt(fn.f(a-h))}) / ${fmt(h)} = ${fmt(expected)}.`
      :`f′(${fmt(a)}) ≈ (${fmt(fn.f(a+h))} − ${fmt(fn.f(a-h))}) / (2 × ${fmt(h)}) = ${fmt(expected)}.`;
    quiz={kind:'numeric',expected,explain,
      question:`For f(x) = ${fn.label} at a = ${fmt(a,4)} with h = ${fmt(h,4)}, calculate the ${METHOD_NAMES[m]} approximation of f′(a).`,
      hint:{forward:'Use (f(a + h) − f(a)) / h: evaluate f at a and at a + h, subtract, and divide by h.',backward:'Use (f(a) − f(a − h)) / h: evaluate f at a − h and at a, subtract, and divide by h.',central:'Use (f(a + h) − f(a − h)) / (2h): the two points are a − h and a + h, and the distance between them is 2h.'}[m]};
  }else if(type==='points'){
    const a=pick([1.2,1.5,2,2.5,3]),h=pick([0.1,0.2,0.5]);
    const s=shuffled([`${fmt(a-h)} and ${fmt(a)}`,`${fmt(a)} and ${fmt(a+h)}`,`${fmt(a-h)} and ${fmt(a+h)}`,`${fmt(a)} and ${fmt(a+2*h)}`],0);
    quiz={kind:'choice',...s,question:`The Backward Difference at a = ${fmt(a,4)} with h = ${fmt(h,4)} uses which two points?`,
      hint:'Think about which side of a the second point sits on.',
      explain:'Backward Difference uses the point itself and its left neighbour, a − h.'};
  }else if(type==='centralPoints'){
    const a=pick([1.2,1.5,2,2.5,3]),h=pick([0.1,0.2,0.5]);
    const s=shuffled([`${fmt(a-h)} and ${fmt(a+h)}`,`${fmt(a)} and ${fmt(a+h)}`,`${fmt(a-h)} and ${fmt(a)}`,`${fmt(a-2*h)} and ${fmt(a+2*h)}`],0);
    quiz={kind:'choice',...s,question:`For the Central Difference at a = ${fmt(a,4)} with h = ${fmt(h,4)}, what are the two surrounding points?`,
      hint:'The points are equally spaced around a, one on each side.',
      explain:'The surrounding points are a − h and a + h, one step on each side of a.'};
  }else if(type==='why'){
    const s=shuffled(['The two points it uses are 2h apart, so the horizontal distance is 2h.','Dividing by 2h makes every answer twice as accurate.','Because the formula uses two points, and two points need a 2.','h is only half the step in the central formula.'],0);
    quiz={kind:'choice',...s,question:'Why does the Central Difference divide by 2h and not by h?',
      hint:'Measure the distance between the two points the formula actually uses.',
      explain:'The run between a − h and a + h is (a + h) − (a − h) = 2h, and a slope is rise over run.'};
  }else if(type==='compare'){
    const fn=pick(QUIZ_POOL),a=pick([0.8,1.2,1.5,2]),h=pick([0.1,0.2,0.5]);
    const exact={ 'x^2':x=>2*x,'x^3':x=>3*x*x,'exp(x)':x=>Math.exp(x),'sin(x)':x=>Math.cos(x),'ln(x)':x=>1/x}[fn.label](a);
    const errs=DIFFERENCE_METHODS.map(m=>Math.abs(DIFF_FN[m](fn.f,a,h)-exact));
    const correct=errs.indexOf(Math.min(...errs));
    quiz={kind:'choice',options:DIFFERENCE_METHODS.map(m=>METHOD_NAMES[m]),correct,
      question:`For f(x) = ${fn.label} at a = ${fmt(a,4)} with h = ${fmt(h,4)}, which method has the smallest absolute error?`,
      hint:'Central Difference usually wins: its error is O(h²) while the others are O(h).',
      explain:`The absolute errors are Forward ${fmt(errs[0])} · Backward ${fmt(errs[1])} · Central ${fmt(errs[2])}.`};
  }else{
    const central=Math.random()<0.5;
    const s=shuffled(['Half as large','A quarter as large','Twice as large','The same'],central?1:0);
    quiz={kind:'choice',...s,question:`If h is halved, the truncation error of the ${central?'Central Difference':'Forward Difference'} becomes about…`,
      hint:'Remember the error order of the method: O(h) or O(h²).',
      explain:central?'Central error is O(h²): it is proportional to h², so halving h quarters it.':'Forward error is O(h): it is proportional to h, so halving h halves it.'};
  }
  renderQuiz();
}
function renderQuiz(feedback='',chosen=null){
  const box=$('#diff-quiz-content');
  const body=quiz.kind==='numeric'
    ?`<div class="quiz-answer-row"><label class="sr-only" for="quiz-answer">Your answer</label><input id="quiz-answer" type="number" step="any"><button type="button" class="text-button" id="quiz-check">Check answer</button></div>`
    :`<div class="quiz-options">${quiz.options.map((o,i)=>`<button type="button" data-quiz-option="${i}" ${chosen!=null?'disabled':''} class="${chosen!=null&&i===quiz.correct?'correct':chosen===i?'wrong':''}">${esc(o)}</button>`).join('')}</div>`;
  box.innerHTML=`<p class="quiz-question">${esc(quiz.question)}</p><button type="button" class="text-button" id="quiz-hint-btn">Show hint</button><p class="quiz-hint" id="quiz-hint" hidden>${esc(quiz.hint)}</p>${body}<p class="quiz-feedback" aria-live="polite">${esc(feedback)}</p>`;
}
function answerQuiz(ok,chosen=null){
  renderQuiz(ok?'Correct.':`Not quite. ${quiz.explain}`,chosen);
}

export function openDifferentiationGuide(){
  $('#guide-content').innerHTML=`<h2>Numerical Differentiation: slopes from values</h2><p>The derivative f′(a) is the slope of the tangent line at a. When only function values are available, a secant line through two nearby points gives a slope we can compute — and as the points close in, that slope approaches the tangent slope.</p><h3>Forward Difference</h3><div class="guide-formula">f′(a) ≈ (f(a + h) − f(a)) / h · error O(h)</div><p>Uses a and its right neighbour. Simple and natural at the start of a table, but the secant leans forward and its error shrinks only in proportion to h.</p><h3>Backward Difference</h3><div class="guide-formula">f′(a) ≈ (f(a) − f(a − h)) / h · error O(h)</div><p>Uses the left neighbour and a. The mirror image of the forward formula, and the natural choice at the end of a table.</p><h3>Central Difference</h3><div class="guide-formula">f′(a) ≈ (f(a + h) − f(a − h)) / (2h) · error O(h²)</div><p>Uses one point on each side and never evaluates f at a. The two points are 2h apart, which is why the denominator is 2h. Subtracting the Taylor expansions shows the even-order error terms cancel, leaving an error proportional to h².</p><h3>Choosing h</h3><p>Smaller h reduces truncation error, but extremely small h makes f(a + h) − f(a) a subtraction of nearly equal numbers, and floating-point round-off takes over. The error chart in the lab shows both regimes: a falling slope, then a noisy rise.</p>`;
  if(!$('#guide-dialog').open)$('#guide-dialog').showModal();
  $('#guide-dialog').scrollTop=0;
}

function setMethod(next){
  method=next;
  document.querySelectorAll('[data-diff-method]').forEach(el=>{el.setAttribute('aria-selected',String(el.dataset.diffMethod===method));el.tabIndex=el.dataset.diffMethod===method?0:-1;});
  $('#diff-tip-title').textContent=TIPS[method][0];
  $('#diff-tip').textContent=TIPS[method][1];
  render();
}
function setH(h,{fromSlider=false}={}){
  h=Math.max(H_MIN,Math.min(H_MAX,h));
  $('#diff-h').value=Number(h.toPrecision(6));
  if(!fromSlider)$('#diff-h-slider').value=hToSlider(h);
  compute();
}
function stopAnimation(){
  if(animTimer){clearInterval(animTimer);animTimer=null;}
  const b=$('#diff-animate');if(b)b.textContent='Decrease h';
}
function toggleAnimation(){
  const btn=$('#diff-animate');
  if(animTimer){clearInterval(animTimer);animTimer=null;btn.textContent='Resume';return;}
  let h=Number($('#diff-h').value);
  if(!Number.isFinite(h)||h<=H_MIN*1.05){h=1;animStartH=null;}
  if(animStartH==null)animStartH=Number($('#diff-h').value)||h;
  btn.textContent='Pause';
  animTimer=setInterval(()=>{
    h*=0.94;
    if(h<=H_MIN){setH(H_MIN);stopAnimation();return;}
    setH(h);
  },70);
}
export function initDifferentiation(){
  document.querySelectorAll('[data-diff-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.diffMode)));
  $('#diff-table-rows').addEventListener('input',()=>computeTable());
  $('#diff-table-rows').addEventListener('change',()=>computeTable({sortRows:true}));
  $('#diff-table-rows').addEventListener('click',e=>{
    const rm=e.target.closest('[data-remove-diff-point]');
    if(rm){const rows=readTableRows();if(rows.length<=3)return;rows.splice(Number(rm.dataset.removeDiffPoint),1);renderTableRows(rows);computeTable();return;}
    const row=e.target.closest('[data-diff-row]');
    if(row){const x=Number(row.querySelector('[data-coordinate="x"]').value);if(Number.isFinite(x)&&x!==tableTargetX){tableTargetX=x;computeTable();}}
  });
  $('#diff-table-add').addEventListener('click',()=>{const rows=readTableRows();if(rows.length>=12)return;rows.push({x:'',y:''});renderTableRows(rows);computeTable();});
  $('#diff-table-target').addEventListener('change',e=>{tableTargetX=Number(e.target.value);computeTable();});
  document.querySelectorAll('[data-diff-method]').forEach(b=>b.addEventListener('click',()=>setMethod(b.dataset.diffMethod)));
  $('.diff-method-tabs').addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();
    const order=['forward','backward','central','compare'],i=order.indexOf(method);
    const next=e.key==='Home'?0:e.key==='End'?order.length-1:(i+(e.key==='ArrowRight'?1:order.length-1))%order.length;
    setMethod(order[next]);$(`[data-diff-method="${method}"]`).focus();
  });
  $('#diff-preset').addEventListener('change',e=>{
    const p=PRESETS[e.target.value];if(!p)return;
    $('#diff-function').value=p.f;$('#diff-a').value=p.a;stopAnimation();animStartH=null;setH(p.h);
  });
  $('#diff-form').addEventListener('submit',e=>e.preventDefault());
  $('#diff-form').addEventListener('input',e=>{
    stopAnimation();
    if(e.target.id==='diff-function'){
      const match=Object.entries(PRESETS).find(([,p])=>p.f===e.target.value.trim());
      $('#diff-preset').value=match?match[0]:'custom';
    }
    if(e.target.id==='diff-h'){
      const h=Number(e.target.value);
      if(Number.isFinite(h)&&h>0)$('#diff-h-slider').value=hToSlider(Math.max(H_MIN,Math.min(H_MAX,h)));
    }
    compute();
  });
  $('#diff-h-slider').addEventListener('input',e=>{stopAnimation();setH(sliderToH(Number(e.target.value)),{fromSlider:true});});
  document.querySelectorAll('[data-diff-h]').forEach(b=>b.addEventListener('click',()=>{stopAnimation();animStartH=null;setH(Number(b.dataset.diffH));}));
  $('#diff-animate').addEventListener('click',toggleAnimation);
  $('#diff-anim-reset').addEventListener('click',()=>{stopAnimation();if(animStartH!=null)setH(animStartH);animStartH=null;});
  for(const [id,set] of [['diff-show-tangent',v=>showTangent=v],['diff-show-secant',v=>showSecant=v],['diff-show-labels',v=>showLabels=v]])
    $('#'+id).addEventListener('change',e=>{set(e.target.checked);drawGraph();});
  $('#diff-reset-view').addEventListener('click',()=>{viewportLock=null;drawGraph();message('Graph view reset.');});
  $('#diff-taylor-back').addEventListener('click',()=>{if(taylorStep>0){taylorStep--;renderTaylor();}});
  $('#diff-taylor-next').addEventListener('click',()=>{if(taylorStep<TAYLOR_STEPS.length-1){taylorStep++;renderTaylor();}});
  $('#diff-lesson-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-lesson]');if(!b)return;lessonIndex=Number(b.dataset.lesson);renderLesson();});
  $('#diff-quiz-new').addEventListener('click',newQuiz);
  $('#diff-quiz-content').addEventListener('click',e=>{
    if(e.target.id==='quiz-hint-btn'){$('#quiz-hint').hidden=false;e.target.hidden=true;return;}
    if(e.target.id==='quiz-check'){
      const v=Number($('#quiz-answer').value),expected=quiz.expected;
      answerQuiz(Number.isFinite(v)&&Math.abs(v-expected)<=Math.max(0.01,0.01*Math.abs(expected)));
      return;
    }
    const b=e.target.closest('[data-quiz-option]');
    if(b&&!b.disabled){const i=Number(b.dataset.quizOption);answerQuiz(i===quiz.correct,i);}
  });
  $('#diff-guide-open').addEventListener('click',openDifferentiationGuide);
  function moveTarget(x){
    if(mode==='table')return;
    $('#diff-a').value=Number(x.toPrecision(10));
    compute();
  }
  bindGraphDrag($('#diff-chart'),{
    geometry:()=>graphGeometry,
    onStart:g=>{stopAnimation();viewportLock={...g};},
    onMove:moveTarget,
    onEnd:()=>{viewportLock=null;drawDifferentiation();$('#diff-chart [data-draggable]')?.focus({preventScroll:true});},
    onKey:(key,fast)=>{
      if(!result||!graphGeometry)return;
      const g=graphGeometry,step=(g.xmax-g.xmin)/(fast?20:100),direction=['ArrowLeft','ArrowDown'].includes(key)?-1:1;
      const x=key==='Home'?g.xmin:key==='End'?g.xmax:result.a+direction*step;
      moveTarget(Math.max(g.xmin,Math.min(g.xmax,x)));
      $('#diff-chart [data-draggable]')?.focus({preventScroll:true});
    }
  });
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(drawDifferentiation,130);});
  $('#diff-h-slider').value=hToSlider(0.1);
  renderTaylor();renderLesson();newQuiz();compute();
}
