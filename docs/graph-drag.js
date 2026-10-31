// Keep pointer capture on the SVG itself: its plotted children may be redrawn.
export function bindGraphDrag(svg,{geometry,onStart,onMove,onEnd,onKey}){
  let active=null;
  function local(event){const matrix=svg.getScreenCTM();if(!matrix)return null;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(matrix.inverse());}
  function position(event){const p=local(event),g=active?.geometry;if(!p||!g)return null;const fraction=Math.max(0,Math.min(1,(p.x-g.left)/(g.right-g.left)));return {x:g.xmin+fraction*(g.xmax-g.xmin),fraction};}
  function end(event){if(!active||event.pointerId!==active.id)return;if(event.type==='pointerup'&&active.touch&&!active.handle&&!active.moved){const value=position(event);if(value)onMove(value.x);}const id=active.id;active=null;svg.classList.remove('is-dragging');if(svg.hasPointerCapture?.(id))svg.releasePointerCapture(id);onEnd?.();}
  svg.addEventListener('pointerdown',event=>{
    if(active||event.isPrimary===false||event.button!==0)return;
    const g=geometry(),p=local(event);if(!g||!p)return;
    const handle=event.target.closest?.('[data-draggable]');
    if(!handle&&(p.x<g.left||p.x>g.right||p.y<g.top||p.y>g.bottom))return;
    if(onStart?.(g)===false)return;
    event.preventDefault();active={id:event.pointerId,geometry:{...g},handle:!!handle,touch:event.pointerType==='touch',startX:event.clientX,startY:event.clientY,moved:false};svg.classList.add('is-dragging');svg.setPointerCapture(event.pointerId);if(!active.touch||active.handle){const value=position(event);if(value)onMove(value.x);}
  });
  svg.addEventListener('pointermove',event=>{if(!active||event.pointerId!==active.id)return;if(active.touch&&!active.handle&&!active.moved){const dx=Math.abs(event.clientX-active.startX),dy=Math.abs(event.clientY-active.startY);if(dx<6||dy>dx)return;}active.moved=true;event.preventDefault();const value=position(event);if(value)onMove(value.x);});
  svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
  svg.addEventListener('keydown',event=>{if(!event.target.closest?.('[data-draggable]')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();onKey?.(event.key,event.shiftKey);});
}

export function dragHandle({cx,cy,label,value,min,max,color='var(--graph-orange)',description=''}){
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<g class="graph-handle" data-draggable="true" role="slider" tabindex="0" aria-label="${escape(label)}" aria-orientation="horizontal" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${escape(description)}"><circle class="drag-hit" cx="${cx}" cy="${cy}" r="22" fill="transparent"/><circle class="drag-halo" cx="${cx}" cy="${cy}" r="12" fill="${color}" opacity=".15"/><circle cx="${cx}" cy="${cy}" r="6" fill="${color}" stroke="var(--graph-dot-border)" stroke-width="2"/><title>${escape(label+': '+description+' · drag or use arrow keys')}</title></g>`;
}
