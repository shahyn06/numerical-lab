export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const format=(x,digits=9)=>x==null?'—':Number(x.toPrecision(digits)).toString();
export const math=body=>`<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${body}</math>`;
export const mn=(v,digits=9)=>{const s=format(v,digits);if(!s.includes('e'))return `<mn>${escapeHTML(s)}</mn>`;const [base,e]=s.split('e');return `<mrow><mn>${base}</mn><mo>×</mo><msup><mn>10</mn><mn>${Number(e)}</mn></msup></mrow>`;};
const bracket=inner=>`<mrow><mo>(</mo>${inner}<mo>)</mo></mrow>`;
export function expressionMath(n,parent=0){
  const op=n.op;if(op==='num')return n.args[0]===Math.PI?'<mi>π</mi>':n.args[0]===Math.E?'<mi>e</mi>':mn(n.args[0],12);if(op==='x')return '<mi>x</mi>';
  const a=expressionMath(n.args[0]),b=n.args[1]?expressionMath(n.args[1]):'';
  if(op==='neg'){const body=`<mrow><mo>−</mo>${expressionMath(n.args[0],25)}</mrow>`;return parent>25?bracket(body):body;}
  if(op==='^'){const base=['num','x','sin','cos','tan','exp','ln','log','sqrt','cbrt','abs'].includes(n.args[0].op)?a:bracket(a);return `<msup><mrow>${base}</mrow><mrow>${b}</mrow></msup>`;}
  if(op==='/')return `<mfrac><mrow>${a}</mrow><mrow>${b}</mrow></mfrac>`;
  if(['+','-','*'].includes(op)){const precedence=op==='*'?20:10,body=`<mrow>${expressionMath(n.args[0],precedence)}<mo>${op==='*'?'·':op==='-'?'−':'+'}</mo>${expressionMath(n.args[1],precedence+(op==='-'?1:0))}</mrow>`;return precedence<parent?bracket(body):body;}
  if(op==='sqrt')return `<msqrt>${a}</msqrt>`;if(op==='cbrt')return `<mroot><mrow>${a}</mrow><mn>3</mn></mroot>`;if(op==='abs')return `<mrow><mo>|</mo>${a}<mo>|</mo></mrow>`;
  if(op==='exp')return `<msup><mi>e</mi><mrow>${a}</mrow></msup>`;
  return `<mrow><mi>${op==='log'?'ln':escapeHTML(op)}</mi>${bracket(a)}</mrow>`;
}
export function polynomialMath(coefficients,variable='x'){
  if(!coefficients)return '<mtext>Expanded form unavailable</mtext>';let parts=[];
  for(let degree=coefficients.length-1;degree>=0;degree--){const c=coefficients[degree];if(c===0)continue;const power=degree===0?'':degree===1?`<mi>${variable}</mi>`:`<msup><mi>${variable}</mi><mn>${degree}</mn></msup>`;parts.push(`<mo>${parts.length?(c<0?'−':'+'):(c<0?'−':'')}</mo>${power?(Math.abs(c)===1?'':mn(Math.abs(c))):mn(Math.abs(c))}${power}`);}
  return `<mrow>${parts.join('')||'<mn>0</mn>'}</mrow>`;
}
export function basisMath(points,i){return `<msub><mi>L</mi><mn>${i}</mn></msub><mo>(</mo><mi>x</mi><mo>)</mo><mo>=</mo>`+points.map((p,j)=>j===i?'':`<mfrac><mrow><mi>x</mi><mo>−</mo><mo>(</mo>${mn(p.x)}<mo>)</mo></mrow><mrow><mo>(</mo>${mn(points[i].x)}<mo>)</mo><mo>−</mo><mo>(</mo>${mn(p.x)}<mo>)</mo></mrow></mfrac>`).join('<mo>·</mo>');}
