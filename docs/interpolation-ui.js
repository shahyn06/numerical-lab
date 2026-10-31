import {interpolate,evaluateInterpolant,polynomialText} from './interpolation.js';
import {escapeHTML as esc,format as fmt,math,mn,polynomialMath,basisMath} from './ui-math.js';
import {bindGraphDrag,dragHandle} from './graph-drag.js';

const $=s=>document.querySelector(s);
const PRESETS={lecture:{points:[{x:2,y:.5},{x:2.5,y:.4},{x:4,y:.25}],target:3},quadratic:{points:[{x:0,y:1},{x:1,y:3},{x:2,y:7}],target:1.5},cubic:{points:[{x:-1,y:2},{x:0,y:1},{x:1,y:0},{x:2,y:5}],target:.5}};
let result=null,method='lagrange',selected=0,graphView='polynomial';
let graphGeometry=null,viewportLock=null;
function message(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(message.timer);message.timer=setTimeout(()=>$('#toast').hidden=true,2600);}
function readPoints(){return [...$('#point-rows').children].map(row=>({x:row.querySelector('[data-coordinate="x"]').value,y:row.querySelector('[data-coordinate="y"]').value}));}
function pointRows(points){$('#point-rows').innerHTML=points.map((p,i)=>`<div class="point-entry"><span>${i}</span><label class="sr-only" for="point-x-${i}">x at point ${i}</label><input id="point-x-${i}" type="number" step="any" data-coordinate="x" value="${esc(p.x)}"><label class="sr-only" for="point-y-${i}">y at point ${i}</label><input id="point-y-${i}" type="number" step="any" data-coordinate="y" value="${esc(p.y)}"><button type="button" data-remove-point="${i}" aria-label="Remove point ${i}" ${points.length<=2?'disabled':''}>×</button></div>`).join('');$('#add-point').disabled=points.length>=12;}
function stale(){$('#interp-stale').hidden=!result;}
function build(){$('#interp-error').hidden=true;try{result=interpolate(readPoints(),$('#interp-target').value);selected=0;viewportLock=null;$('#interp-stale').hidden=true;render();}catch(e){$('#interp-error').textContent=e.message;$('#interp-error').hidden=false;stale();}}
function loadPreset(key){const p=PRESETS[key];pointRows(p.points);$('#interp-target').value=p.target;build();}
function construction(){const m=result.model,n=m.points.length-1;
  if(method==='lagrange')return `<p class="construction-text">Multiply each basis by its data value, then add the terms:</p>${math(`<msub><mi>P</mi><mn>${n}</mn></msub><mo>(</mo><mi>x</mi><mo>)</mo><mo>=</mo>`+m.points.map((p,i)=>`${i?'<mo>+</mo>':''}<mo>(</mo>${mn(p.y)}<mo>)</mo><msub><mi>L</mi><mn>${i}</mn></msub><mo>(</mo><mi>x</mi><mo>)</mo>`).join(''))}${m.points.map((p,i)=>`<div class="basis-construction"><button type="button" data-inspect-basis="${i}">Inspect L${i} ↗</button>${math(basisMath(m.points,i))}</div>`).join('')}`;
  const useT=!m.differences[0].every(Number.isFinite),coeffs=useT?m.normalizedNewtonCoefficients:m.differences[0],variable=useT?'t':'x',nodes=useT?m.points.map(p=>(p.x-m.center)/m.scale):m.points.map(p=>p.x);
  return `<p class="construction-text">Read the first entry from each divided-difference column. Each term adds one more factor.</p>${math(`<msub><mi>P</mi><mn>${n}</mn></msub><mo>(</mo><mi>x</mi><mo>)</mo><mo>=</mo>`+coeffs.map((c,i)=>`${i?'<mo>+</mo>':''}<mo>(</mo>${mn(c)}<mo>)</mo>`+nodes.slice(0,i).map(x=>`<mo>(</mo><mi>${variable}</mi><mo>−</mo><mo>(</mo>${mn(x)}<mo>)</mo><mo>)</mo>`).join('')).join(''))}${useT?'<p class="construction-text">Raw differences overflowed; this construction uses the scaled variable t shown above.</p>':''}`;
}
function render({targetOnly=false}={}){if(!result)return;const m=result.model,n=m.points.length-1,passed=result.crossCheckPassed&&m.nodeCheckPassed;
  $('#interp-summary').innerHTML=`<div class="metric"><p class="metric-label">Estimated value · P(${esc(fmt(result.target,6))})</p><div class="metric-value">${esc(fmt(result.value,10))}</div><div class="metric-sub">${result.extrapolation?'Outside the data interval':'Inside the data interval'}</div></div><div class="metric"><p class="metric-label">Polynomial degree</p><div class="metric-value">≤ ${n}</div><div class="metric-sub">${m.points.length} distinct data points</div></div><div class="metric"><p class="metric-label">Node check · max |P(xᵢ) − yᵢ|</p><div class="metric-value">${esc(fmt(m.nodeError,3))}</div><div class="metric-sub">${passed?'Node & evaluation checks passed':'Inspect numerical warnings'}</div></div>`;
  if(!targetOnly){
  $('#polynomial-heading').textContent=method==='lagrange'?'Lagrange Polynomial':'Newton Interpolating Polynomial';
  const variable=m.expandedReliable?'x':'t',coeffs=m.expandedReliable?m.coefficients:m.normalizedPolynomial;
  $('#polynomial-expression').innerHTML=math(`<msub><mi>P</mi><mn>${n}</mn></msub><mo>(</mo><mi>x</mi><mo>)</mo><mo>≈</mo>${polynomialMath(coeffs,variable)}`)+(variable==='t'?`<p class="scaled-variable">where t = (x − (${esc(fmt(m.center,12))})) / ${esc(fmt(m.scale,12))}</p>`:'');
  $('#polynomial-construction').innerHTML=construction();
  }
  $('#interp-explanation').innerHTML=`<div class="explanation-icon ${result.warnings.length?'warn':''}">${result.warnings.length?'!':'✓'}</div><div><h3>${result.extrapolation?'This is extrapolation':passed?'One polynomial, two matching constructions':'Check the numerical conditioning'}</h3><p>${method==='lagrange'?`At x = ${esc(fmt(result.target))}, add yᵢLᵢ(x) across all ${m.points.length} points to obtain ${esc(fmt(result.value))}.`:'The first entry in each divided-difference column is a Newton coefficient. Nested multiplication evaluates the same polynomial as the Lagrange construction.'}</p><p>The independent Newton evaluation differs by ${esc(fmt(result.crossError,3))}. The node check measures arithmetic consistency; it is not a bound on error against the unknown original function.</p>${result.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`;
  renderTable();drawInterpolation();
}
function renderTable(){const m=result.model,n=m.points.length;
  if(method==='lagrange'){
    $('#interp-table-title').textContent='Lagrange basis notebook';$('#interp-table-hint').textContent='Select a row to see its basis Lᵢ(x). Each basis is 1 at its own node and 0 at every other node.';
    $('#interp-table thead').innerHTML='<tr><th scope="col">i</th><th scope="col">xᵢ</th><th scope="col">yᵢ</th><th scope="col">Lᵢ('+esc(fmt(result.target,5))+')</th><th scope="col">yᵢ · Lᵢ</th></tr>';
    $('#interp-table tbody').innerHTML=m.points.map((p,i)=>`<tr data-interp-row="${i}" tabindex="0" aria-label="Inspect Lagrange basis ${i}" class="${i===selected?'selected':''}"><td>${i}</td><td>${esc(fmt(p.x))}</td><td>${esc(fmt(p.y))}</td><td>${esc(fmt(result.basis[i]))}</td><td class="root-cell">${esc(fmt(result.contributions[i]))}</td></tr>`).join('');
    $('#interp-table-footnote').textContent=`Σ Lᵢ(${fmt(result.target)}) ≈ ${fmt(result.basis.reduce((a,b)=>a+b,0))} · Σ yᵢLᵢ(${fmt(result.target)}) = ${fmt(result.value)}. No iteration limit or tolerance is needed for polynomial interpolation.`;
  }else{
    $('#interp-table-title').textContent='Divided-difference table';$('#interp-table-hint').textContent='The top entry of each difference column is a coefficient in the Newton form. Select a row to highlight its data point.';
    $('#interp-table thead').innerHTML='<tr><th scope="col">i</th><th scope="col">xᵢ</th><th scope="col">f[xᵢ]</th>'+Array.from({length:n-1},(_,j)=>`<th scope="col">Order ${j+1}</th>`).join('')+'</tr>';
    $('#interp-table tbody').innerHTML=m.points.map((p,i)=>`<tr data-interp-row="${i}" tabindex="0" aria-label="Inspect data point ${i}" class="${i===selected?'selected':''}"><td>${i}</td><td>${esc(fmt(p.x))}</td>${Array.from({length:n},(_,order)=>`<td class="${i===0?'root-cell':''}">${m.differences[i][order]==null?'—':Number.isFinite(m.differences[i][order])?esc(fmt(m.differences[i][order])):'overflow'}</td>`).join('')}</tr>`).join('');
    $('#interp-table-footnote').textContent='f[xᵢ,…,xᵢ₊ⱼ] = (f[xᵢ₊₁,…,xᵢ₊ⱼ] − f[xᵢ,…,xᵢ₊ⱼ₋₁]) / (xᵢ₊ⱼ − xᵢ). Unequal node spacing is allowed.';
  }
}
function chooseBasis(i){selected=i;graphView='basis';renderTable();setGraphView();}
function setGraphView(){$('#polynomial-view').classList.toggle('active',graphView==='polynomial');$('#basis-view').classList.toggle('active',graphView==='basis');$('#polynomial-view').setAttribute('aria-pressed',String(graphView==='polynomial'));$('#basis-view').setAttribute('aria-pressed',String(graphView==='basis'));drawInterpolation();}
export function drawInterpolation(){if(!result||$('#interpolation-lab').hidden)return;
  const m=result.model,svg=$('#interp-chart'),W=Math.max(300,svg.getBoundingClientRect().width),H=W<430?260:300,L=55,R=22,T=20,B=40;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  let min=Math.min(m.min,result.target),max=Math.max(m.max,result.target);const span=max-min;min-=span*.12;max+=span*.12;
  if(viewportLock)({xmin:min,xmax:max}=viewportLock);
  if(!Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(max-min)){svg.innerHTML='<text x="15" y="40">Range too large to plot. Rescale your data.</text>';return;}
  const basis=graphView==='basis',sample=x=>{try{const v=basis?m.basis(x)[selected]:m.newtonValue(x);return Number.isFinite(v)?v:null;}catch{return null;}},samples=Array.from({length:361},(_,i)=>{const x=min+(max-min)*i/360;return [x,sample(x)];});
  const known=basis?m.points.map((p,i)=>({x:p.x,y:i===selected?1:0})):m.points;
  const targetY=basis?result.basis[selected]:result.value,ys=[0,...known.map(p=>p.y),targetY,...samples.map(s=>s[1]).filter(y=>y!=null)];
  let low=Math.min(...ys),high=Math.max(...ys);if(!Number.isFinite(low)||!Number.isFinite(high)||!Number.isFinite(high-low)){svg.innerHTML='<text x="15" y="40">Values are too large to plot. Rescale your data.</text>';return;}
  if(low===high){low-=1;high+=1;}const pad=(high-low)*.12;low-=pad;high+=pad;
  if(viewportLock)({ymin:low,ymax:high}=viewportLock);
  graphGeometry={left:L,right:W-R,top:T,bottom:H-B,xmin:min,xmax:max,ymin:low,ymax:high};
  const X=x=>L+(x-min)/(max-min)*(W-L-R),Y=y=>T+(high-y)/(high-low)*(H-T-B);
  const line=(x1,y1,x2,y2,color='var(--graph-grid)',dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
  const text=(x,y,s,anchor='middle',cl='')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cl}">${esc(s)}</text>`;
  let content=`<defs><clipPath id="interp-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>`;
  for(let i=0;i<=4;i++){const x=min+(max-min)*i/4,y=low+(high-low)*i/4;content+=line(X(x),T,X(x),H-B)+text(X(x),H-B+20,fmt(x,4));content+=line(L,Y(y),W-R,Y(y))+text(L-9,Y(y)+3,fmt(y,4),'end');}
  content+=text(W-R,H-3,'x','end')+text(L,T-7,basis?`L${selected}(x)`:'P(x)','start');
  let plot='';if(min<=0&&max>=0)plot+=line(X(0),T,X(0),H-B,'var(--graph-axis)');if(low<=0&&high>=0)plot+=line(L,Y(0),W-R,Y(0),'var(--graph-axis)');
  let d='',active=false;for(const [x,y]of samples){if(y==null){active=false;continue;}d+=(active?'L':'M')+X(x).toFixed(2)+' '+Y(y).toFixed(2);active=true;}
  plot+=`<path d="${d}" fill="none" stroke="var(--graph-curve)" stroke-width="2.3"/>`;
  plot+=line(X(result.target),Y(0),X(result.target),Y(targetY),'var(--graph-orange)','4 4');
  known.forEach((p,i)=>{plot+=`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${i===selected?5.5:4}" fill="${i===selected?'var(--blue)':'var(--graph-curve)'}" stroke="var(--graph-dot-border)" stroke-width="2"><title>Point ${i}: (${fmt(p.x)}, ${fmt(p.y)})</title></circle>`;});
  plot+=dragHandle({cx:X(result.target),cy:Y(targetY),label:'Interpolation evaluation x',value:result.target,min,max,description:`x = ${fmt(result.target)}, ${basis?'L'+selected+'(x)':'P(x)'} = ${fmt(targetY)}`});
  content+=`<g clip-path="url(#interp-clip)">${plot}</g>`;svg.innerHTML=content;
  $('#interp-legend').innerHTML=`<span><i class="legend-line"></i> ${basis?'Basis L'+selected:'Interpolating polynomial'}</span><span><i class="legend-dot"></i> ${basis?'Basis values at nodes':'Data points'}</span><span><i class="legend-line orange"></i> x = ${esc(fmt(result.target,6))}</span>`;
  $('#interp-chart-caption').textContent=basis?`L${selected} is 1 at x = ${fmt(m.points[selected].x)} and 0 at the other nodes. L${selected}(${fmt(result.target)}) = ${fmt(targetY)}.`:`P(${fmt(result.target)}) ≈ ${fmt(result.value)}. ${result.extrapolation?'The requested x lies outside the supplied data; this is extrapolation.':'The polynomial passes through the supplied points; the orange point is your estimate.'}`;
  svg.setAttribute('aria-label',$('#interp-chart-caption').textContent);
  $('#interp-probe-value').textContent=`x = ${fmt(result.target,7)} · P(x) = ${fmt(result.value,7)}${basis?' · L'+selected+' = '+fmt(targetY,5):''}`;
}
export function openInterpolationGuide(){
  $('#guide-content').innerHTML=`<h2>Interpolation: from known points to a polynomial</h2><p>Start with data (x₀,y₀), …, (xₙ,yₙ), where all x values are distinct. There is exactly one polynomial of degree at most n passing through all n + 1 points. You do not need the original function, equally spaced nodes, a starting guess, or a convergence tolerance.</p><h3>Lagrange Polynomial</h3><div class="guide-formula">Pₙ(x) = Σ yᵢ Lᵢ(x)<br>Lᵢ(x) = ∏ (x − xⱼ)/(xᵢ − xⱼ), j ≠ i</div><p>Each Lᵢ is 1 at its own node xᵢ and 0 at every other node. Multiplying by yᵢ makes that term contribute the right data value. Summing all terms fits the entire table. The basis notebook shows each Lᵢ and yᵢLᵢ at the requested x; select a row to visualize its basis.</p><h3>Newton Divided Differences</h3><div class="guide-formula">Pₙ(x) = f[x₀] + f[x₀,x₁](x−x₀)<br>+ f[x₀,x₁,x₂](x−x₀)(x−x₁) + …</div><p>The divided-difference table is formed from adjacent previous-column values. Divide their difference by the difference between the last and first x values for that entry. Read the top value of every column to form the coefficients. Lagrange and Newton produce the same mathematical polynomial for the same data.</p><h3>Try the lecture example</h3><p>x = 2, 2.5, 4 and y = 0.5, 0.4, 0.25 give P₂(x) = 0.05x² − 0.425x + 1.15. At x = 3, P₂(3) = 0.325. This is an interpolation estimate for the underlying function, not necessarily its exact value.</p><h3>Accuracy and limits</h3><p>Inside the data interval the calculation is interpolation; outside it, extrapolation. A polynomial can fit the nodes perfectly and still approximate the unknown function poorly between them. High degree, close nodes, noisy data, and extrapolation can amplify errors. The node and Newton checks test the arithmetic, not the approximation error against an unknown function.</p><p>The lab supports 2–12 points and uses normalized coordinates and barycentric evaluation to reduce rounding error. Expanded coefficients are rounded for display; use the original data for calculations. If expanding powers of x is unstable, a scaled variable t is shown instead.</p>`;
  if(!$('#guide-dialog').open)$('#guide-dialog').showModal();$('#guide-dialog').scrollTop=0;
}
function exportCSV(){if(!result)return;const m=result.model;
  const rows=[['Method',method==='lagrange'?'Lagrange':'Newton Divided Differences'],['Evaluation x',result.target],['P(x)',result.value],['Extrapolation',result.extrapolation],['Node check max error',m.nodeError],['Newton cross-check difference',result.crossError],[]];
  if(method==='lagrange'){rows.push(['i','x_i','y_i','L_i(target)','y_i*L_i(target)']);m.points.forEach((p,i)=>rows.push([i,p.x,p.y,result.basis[i],result.contributions[i]]));}
  else{rows.push(['i','x_i','f[x_i]',...Array.from({length:m.points.length-1},(_,i)=>'Order '+(i+1))]);m.points.forEach((p,i)=>rows.push([i,p.x,...Array.from({length:m.points.length},(_,j)=>m.differences[i][j]??'')]));}
  const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`numerical-lab-interpolation-${method}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Interpolation notebook exported.');
}
export function initInterpolation(){
  function moveTarget(x){try{const next=Number(x.toPrecision(10));result=evaluateInterpolant(result.model,next);$('#interp-target').value=next;$('#interp-error').hidden=true;render({targetOnly:true});}catch(e){$('#interp-error').textContent=e.message;$('#interp-error').hidden=false;}}
  function ready(){if(!$('#interp-stale').hidden){message('Build the polynomial after changing the data before moving the point.');return false;}return true;}
  bindGraphDrag($('#interp-chart'),{
    geometry:()=>graphGeometry,
    onStart:g=>{if(!ready())return false;viewportLock={...g};},
    onMove:moveTarget,
    onEnd:()=>{viewportLock=null;drawInterpolation();$('#interp-chart [data-draggable]')?.focus({preventScroll:true});},
    onKey:(key,fast)=>{if(!ready())return;const g=graphGeometry,step=(g.xmax-g.xmin)/(fast?20:100),direction=['ArrowLeft','ArrowDown'].includes(key)?-1:1,x=key==='Home'?g.xmin:key==='End'?g.xmax:result.target+direction*step;moveTarget(Math.max(g.xmin,Math.min(g.xmax,x)));$('#interp-chart [data-draggable]')?.focus({preventScroll:true});}
  });
  $('#interp-form').addEventListener('submit',e=>{e.preventDefault();build();});$('#interp-form').addEventListener('input',stale);$('#interp-preset').addEventListener('change',e=>loadPreset(e.target.value));
  $('#add-point').addEventListener('click',()=>{const p=readPoints();if(p.length>=12)return;p.push({x:'',y:''});pointRows(p);stale();$(`#point-x-${p.length-1}`).focus();});
  $('#point-rows').addEventListener('click',e=>{const b=e.target.closest('[data-remove-point]');if(!b)return;const p=readPoints();if(p.length<=2)return;p.splice(Number(b.dataset.removePoint),1);pointRows(p);stale();});
  document.querySelectorAll('[data-interp-method]').forEach(b=>b.addEventListener('click',()=>{method=b.dataset.interpMethod;document.querySelectorAll('[data-interp-method]').forEach(el=>{el.setAttribute('aria-selected',String(el===b));el.tabIndex=el===b?0:-1;});render();}));
  $('.interp-method-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'lagrange':e.key==='End'?'newton':method==='lagrange'?'newton':'lagrange';const b=$(`[data-interp-method="${next}"]`);b.click();b.focus();});
  $('#polynomial-view').addEventListener('click',()=>{graphView='polynomial';setGraphView();});$('#basis-view').addEventListener('click',()=>{graphView='basis';setGraphView();});
  function inspect(e){const row=e.target.closest('[data-interp-row]');if(!row)return;selected=Number(row.dataset.interpRow);if(method==='lagrange')graphView='basis';renderTable();setGraphView();}
  $('#interp-table').addEventListener('click',inspect);$('#interp-table').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(e);}});
  $('#polynomial-construction').addEventListener('click',e=>{const b=e.target.closest('[data-inspect-basis]');if(b)chooseBasis(Number(b.dataset.inspectBasis));});
  $('#interp-guide-open').addEventListener('click',openInterpolationGuide);$('#interp-export').addEventListener('click',exportCSV);
  $('#copy-polynomial').addEventListener('click',async()=>{if(!result)return;const m=result.model,text=m.expandedReliable?polynomialText(m.coefficients,'x',17):polynomialText(m.normalizedPolynomial,`((x-(${m.center}))/${m.scale})`,17);try{await navigator.clipboard.writeText(text);message('Polynomial expression copied.');}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();message(ok?'Polynomial expression copied.':'Select the displayed polynomial to copy it.');}});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(drawInterpolation,130);});
  loadPreset('lecture');
}
