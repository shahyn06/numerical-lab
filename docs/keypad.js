import {parse} from './engine.js';
import {math,expressionMath} from './ui-math.js';

// Pure editing operation, used by both mouse and keyboard-accessible keypad keys.
export function editExpression(value,start,end,action){
  start=Math.max(0,Math.min(value.length,start??value.length));end=Math.max(start,Math.min(value.length,end??start));
  const selected=value.slice(start,end);let insert='',offset;
  if(action.type==='text'&&action.value===')'&&start===end&&value[start]===')')return {value,start:start+1,end:start+1};
  if(action.type==='clear')return {value:'',start:0,end:0};
  if(action.type==='left'||action.type==='right'){const p=start!==end?(action.type==='left'?start:end):Math.max(0,Math.min(value.length,start+(action.type==='left'?-1:1)));return {value,start:p,end:p};}
  if(action.type==='backspace'){if(start===end&&start>0)start--;return {value:value.slice(0,start)+value.slice(end),start,end:start};}
  if(action.type==='function'){insert=`${action.value}(${selected})`;offset=selected?insert.length:action.value.length+1;}
  else if(action.type==='power'){insert=selected?`(${selected})^()`:'^()';offset=insert.length-1;}
  else if(action.type==='square'){insert=selected?`(${selected})^2`:'^2';offset=insert.length;}
  else if(action.type==='exponential'){insert=`e^(${selected})`;offset=selected?insert.length:3;}
  else if(action.type==='fraction'){insert=`(${selected})/()`;offset=selected?insert.length-1:1;}
  else{insert=action.value;offset=insert.length;}
  const text=value.slice(0,start)+insert+value.slice(end),p=start+offset;return {value:text,start:p,end:p};
}

export function initKeypad(){
  const $=s=>document.querySelector(s),dialog=$('#keypad-dialog'),input=$('#keypad-input');let target=null;
  const keys=[
    ['sin','function','sin'],['cos','function','cos'],['tan','function','tan'],['ln','function','ln'],['√','function','sqrt'],
    ['x','text','x'],['π','text','pi'],['e','text','e'],['(','text','('],[')','text',')'],
    ['7','text','7'],['8','text','8'],['9','text','9'],['÷','text','/'],['⌫','backspace'],
    ['4','text','4'],['5','text','5'],['6','text','6'],['×','text','*'],['xʸ','power'],
    ['1','text','1'],['2','text','2'],['3','text','3'],['−','text','-'],['x²','square'],
    ['0','text','0'],['.','text','.'],['a/b','fraction'],['+','text','+'],['eˣ','exponential'],
    ['∛','function','cbrt'],['|x|','function','abs'],['exp','function','exp'],['log','function','log'],['Clear','clear']
  ];
  $('#math-keypad').innerHTML=keys.map(([label,type,value],i)=>`<button type="button" data-math-key="${i}" class="${type==='text'&&/^[0-9.]$/.test(value)?'number-key':type==='clear'?'clear-key':''}" aria-label="${({backspace:'Backspace',power:'Insert power',square:'Square',exponential:'e to a power',fraction:'Insert fraction',clear:'Clear expression'})[type]||label}">${label}</button>`).join('');
  function preview(){try{const ast=parse(input.value);$('#keypad-preview').innerHTML=math(expressionMath(ast));$('#keypad-feedback').textContent='Ready. Powers use parentheses: e^(2*x) means e to the power 2x.';$('#keypad-feedback').classList.remove('invalid');$('#keypad-use').disabled=false;}catch(e){$('#keypad-preview').textContent=input.value?'Keep building your expression…':'Your equation will appear here.';$('#keypad-feedback').textContent=input.value?e.message:'Start with x, a number, or a function key.';$('#keypad-feedback').classList.add('invalid');$('#keypad-use').disabled=true;}}
  function apply(action){const r=editExpression(input.value,input.selectionStart,input.selectionEnd,action);input.value=r.value;input.focus();input.setSelectionRange(r.start,r.end);preview();}
  document.querySelectorAll('[data-keypad-target]').forEach(b=>b.addEventListener('click',()=>{target=document.getElementById(b.dataset.keypadTarget);input.value=target.value;$('#keypad-target-label').textContent=target.id==='function'?'Function f(x)':target.id==='g-function'?'Rearrangement g(x)':'Derivative f′(x)';dialog.showModal();input.focus();input.setSelectionRange(input.value.length,input.value.length);preview();}));
  $('#math-keypad').addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
  $('#math-keypad').addEventListener('click',e=>{const b=e.target.closest('[data-math-key]');if(!b)return;const [,type,value]=keys[Number(b.dataset.mathKey)];apply({type,value});});
  dialog.querySelectorAll('[data-edit]').forEach(b=>{b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>apply({type:b.dataset.edit}));});
  input.addEventListener('input',preview);input.addEventListener('keydown',e=>{if(e.key===')'&&input.selectionStart===input.selectionEnd&&input.value[input.selectionStart]===')'){e.preventDefault();apply({type:'right'});}if(e.key==='Enter'&&!$('#keypad-use').disabled){e.preventDefault();$('#keypad-use').click();}});
  $('#keypad-close').addEventListener('click',()=>dialog.close());$('#keypad-use').addEventListener('click',()=>{try{parse(input.value);target.value=input.value;target.dispatchEvent(new Event('input',{bubbles:true}));dialog.close();target.focus();target.setSelectionRange(target.value.length,target.value.length);}catch(e){$('#keypad-feedback').textContent=e.message;}});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
}
