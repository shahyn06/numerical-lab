import test from 'node:test';
import assert from 'node:assert/strict';
import {bindGraphDrag} from '../docs/graph-drag.js';

function fixture(){
  const handlers={},classes=new Set(),capture=new Set(),moves=[],ends=[];
  const svg={
    addEventListener:(name,fn)=>handlers[name]=fn,
    getScreenCTM:()=>({inverse:()=>({})}),
    createSVGPoint:()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}}),
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},
    setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id)
  };
  let geometry={left:0,right:200,top:0,bottom:100,xmin:1,xmax:3};
  bindGraphDrag(svg,{geometry:()=>geometry,onMove:x=>moves.push(x),onEnd:()=>ends.push(true)});
  function emit(type,{x=100,y=50,touch=false,handle=false,id=7,...rest}={}){handlers[type]({type,pointerId:id,clientX:x,clientY:y,button:0,isPrimary:true,pointerType:touch?'touch':'mouse',target:{closest:()=>handle?{}:null},preventDefault(){},...rest});}
  return {emit,moves,ends,capture,classes,geometry};
}
test('touch handle drag clamps to the plot and releases pointer capture on completion',()=>{
  const f=fixture();f.emit('pointerdown',{touch:true,handle:true});assert.deepEqual(f.moves,[2]);assert.ok(f.capture.has(7));
  f.emit('pointermove',{x:260,touch:true});assert.equal(f.moves.at(-1),3);
  f.emit('pointermove',{x:-20,touch:true});assert.equal(f.moves.at(-1),1);
  f.emit('pointerup',{touch:true});assert.equal(f.ends.length,1);assert.equal(f.capture.size,0);assert.equal(f.classes.size,0);
});
test('vertical touch scrolling across the chart does not change the evaluation point',()=>{
  const f=fixture();f.emit('pointerdown',{touch:true,x:50,y:20});assert.equal(f.moves.length,0);
  f.emit('pointermove',{touch:true,x:52,y:85});f.emit('pointercancel',{touch:true,x:52,y:85});assert.equal(f.moves.length,0);assert.equal(f.ends.length,1);
  f.emit('pointerdown',{touch:true,x:50});f.emit('pointerup',{touch:true,x:50});assert.deepEqual(f.moves,[1.5]);
});
test('horizontal touch movement keeps its initial coordinate range during redraws',()=>{
  const f=fixture();f.emit('pointerdown',{touch:true,x:50});
  f.emit('pointermove',{touch:true,x:70,y:51});assert.equal(f.moves.at(-1),1.7);
  f.geometry.xmin=100;f.geometry.xmax=200;
  f.emit('pointermove',{touch:true,x:100,y:51});assert.equal(f.moves.at(-1),2);
  f.emit('pointerup',{touch:true,x:100,y:51});assert.equal(f.ends.length,1);
});
