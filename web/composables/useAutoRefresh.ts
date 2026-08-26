import {onMounted,onUnmounted,ref,watch} from 'vue'

/** Shared polling lifecycle: pause in background and never overlap requests. */
export function useAutoRefresh(refresh:()=>Promise<void>,intervalMs=5_000){
  const enabled=ref(true)
  let timer:number|undefined,running=false,mounted=false
  async function tick(){if(running||document.hidden||!enabled.value)return;running=true;try{await refresh()}catch(error){console.error('[auto-refresh] refresh failed',error)}finally{running=false}}
  function stop(){if(timer!==undefined){window.clearInterval(timer);timer=undefined}}
  function start(){stop();if(mounted&&enabled.value&&!document.hidden)timer=window.setInterval(tick,intervalMs)}
  function visibilityChanged(){if(document.hidden)stop();else{void tick();start()}}
  watch(enabled,value=>{if(value){void tick();start()}else stop()})
  onMounted(()=>{mounted=true;document.addEventListener('visibilitychange',visibilityChanged);start()})
  onUnmounted(()=>{mounted=false;stop();document.removeEventListener('visibilitychange',visibilityChanged)})
  return {autoRefresh:enabled}
}
