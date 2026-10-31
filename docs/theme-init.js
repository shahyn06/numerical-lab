/* Apply the saved palette before first paint, then connect the visible switch. */
(()=>{
  const key='numerical-lab-theme',root=document.documentElement,system=window.matchMedia('(prefers-color-scheme: dark)');
  let choice=null;try{const saved=localStorage.getItem(key);if(saved==='light'||saved==='dark')choice=saved;}catch{}
  function apply(mode){
    root.dataset.theme=mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',mode==='dark'?'#101713':'#f6f7f2');
    const button=document.getElementById('theme-toggle');if(!button)return;
    const next=mode==='dark'?'light':'dark';button.setAttribute('aria-label',`Switch to ${next} mode`);button.title=`Switch to ${next} mode`;
    button.querySelector('.theme-icon').textContent=mode==='dark'?'☀':'☾';button.querySelector('.theme-label').textContent=mode==='dark'?'Light':'Dark';
  }
  apply(choice||(system.matches?'dark':'light'));
  document.addEventListener('DOMContentLoaded',()=>{
    apply(root.dataset.theme);document.getElementById('theme-toggle')?.addEventListener('click',()=>{choice=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,choice);}catch{}apply(choice);});
  });
  system.addEventListener('change',event=>{if(!choice)apply(event.matches?'dark':'light');});
  window.addEventListener('storage',event=>{if(event.key!==key)return;choice=event.newValue==='dark'||event.newValue==='light'?event.newValue:null;apply(choice||(system.matches?'dark':'light'));});
})();
