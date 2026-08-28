<script setup lang="ts">
import{computed,onMounted,onUnmounted,reactive,ref,watch}from'vue'
import{ElMessage,ElMessageBox}from'element-plus'
import{Cable,Power,RefreshCw,Send}from'lucide-vue-next'
import{api,json}from'../api/client'
import PageHeader from'../components/PageHeader.vue'
import ContentCard from'../components/ContentCard.vue'

interface Device{serial:string;state:string;model:string;product:string;transportId:string;ready:boolean}
interface DeviceState{installed:boolean;devices:Device[];error:string}
interface PidOption{pid:string;remark:string}
const storageKey='auth-platform:adb-writer-settings'
const defaults={pid:'',serial:'',networkInterface:'wlan0',targetPath:'/sdcard/license.txt',template:'pid={{pid}}\ndid={{did}}\nlicense={{license}}'}
const form=reactive({...defaults}),devices=ref<Device[]>([]),pids=ref<PidOption[]>([]),adbInstalled=ref(true),deviceError=ref(''),checking=ref(false),writing=ref(false),rebooting=ref(false),statusText=ref('等待操作...')
const commonInterfaces=['wlan0','eth0','usb0','rndis0','en0']
let timer:ReturnType<typeof setInterval>|undefined
const selectedDevice=computed(()=>devices.value.find(item=>item.serial===form.serial))
const canWrite=computed(()=>!!form.pid&&!!selectedDevice.value?.ready&&!!form.networkInterface.trim()&&!!form.targetPath.trim()&&!!form.template.trim())
function appendStatus(message:string){const time=new Date().toLocaleTimeString();statusText.value=statusText.value==='等待操作...'?`[${time}] ${message}`:`${statusText.value}\n[${time}] ${message}`}
function restore(){try{const saved=JSON.parse(localStorage.getItem(storageKey)??'null');if(saved&&typeof saved==='object')Object.assign(form,defaults,saved)}catch{}}
async function loadPids(){pids.value=await api<PidOption[]>('/api/admin/pids/options');if(!form.pid&&pids.value.length)form.pid=pids.value[0]!.pid}
async function checkDevices(manual=false){if(checking.value)return;checking.value=true;try{const state=await api<DeviceState>('/api/admin/adb/devices');adbInstalled.value=state.installed;devices.value=state.devices;deviceError.value=state.error;if(form.serial&&!devices.value.some(item=>item.serial===form.serial))form.serial='';if(!form.serial){const ready=devices.value.find(item=>item.ready);if(ready)form.serial=ready.serial}if(manual)appendStatus(state.error||`检测到 ${state.devices.length} 台 ADB 设备`)}catch(error){deviceError.value=(error as Error).message;if(manual)appendStatus(`设备检测失败：${deviceError.value}`)}finally{checking.value=false}}
async function writeAuthorization(){if(!canWrite.value)return;writing.value=true;appendStatus(`开始读取设备 ${form.serial} 的 ${form.networkInterface} 网卡 MAC`);try{const result=await api<Record<string,string>>('/api/admin/adb/write',json('POST',form));appendStatus(`授权分配完成：PID=${result.pid}，MAC=${result.mac}，DID=${result.did}`);appendStatus(`已写入 ${result.targetPath}${result.output?`；ADB：${result.output}`:''}`);ElMessage.success('授权文件写入成功')}catch(error){appendStatus(`写入失败：${(error as Error).message}`);ElMessage.error((error as Error).message)}finally{writing.value=false}}
async function rebootDevice(){if(!selectedDevice.value?.ready)return;try{await ElMessageBox.confirm(`确认重启 ADB 设备 ${form.serial}？设备会暂时断开连接。`,'确认重启设备',{confirmButtonText:'确认重启',cancelButtonText:'取消',type:'warning'});}catch{return}rebooting.value=true;try{await api('/api/admin/adb/reboot',json('POST',{serial:form.serial}));appendStatus(`已向设备 ${form.serial} 发送重启命令`);ElMessage.success('设备正在重启')}catch(error){appendStatus(`设备重启失败：${(error as Error).message}`);ElMessage.error((error as Error).message)}finally{rebooting.value=false}}
watch(form,value=>localStorage.setItem(storageKey,JSON.stringify(value)),{deep:true})
onMounted(async()=>{restore();await Promise.all([loadPids(),checkDevices()]);timer=setInterval(()=>checkDevices(),3000)})
onUnmounted(()=>{if(timer)clearInterval(timer)})
</script>

<template>
  <PageHeader title="ADB 授权写入" description="读取 Android 设备网卡 MAC，按常规分配流程领取授权码并写入指定文件。">
    <el-button type="danger" plain :icon="Power" :loading="rebooting" :disabled="!selectedDevice?.ready" @click="rebootDevice">重启设备</el-button>
    <el-button :icon="RefreshCw" :loading="checking" @click="checkDevices(true)">刷新设备</el-button>
  </PageHeader>
  <el-alert v-if="!adbInstalled" class="adb-alert" type="warning" show-icon :closable="false" title="运行环境未安装 ADB">
    <template #default><div class="install-help">程序不内置 ADB。Windows 请安装 <a href="https://developer.android.com/tools/releases/platform-tools" target="_blank">Android SDK Platform Tools</a> 并将 adb 加入 PATH；Linux 可安装系统软件包 <code>adb</code>；macOS 可执行 <code>brew install android-platform-tools</code>。安装后请重启本服务。</div></template>
  </el-alert>
  <div class="adb-grid">
    <ContentCard title="写入设置" description="网卡名称、推送路径和模板会保存在当前浏览器中。">
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="PID" required><el-select v-model="form.pid" filterable placeholder="选择 PID"><el-option v-for="item in pids" :key="item.pid" :value="item.pid" :label="item.remark?`${item.pid} · ${item.remark}`:item.pid"/></el-select></el-form-item>
          <el-form-item label="ADB 设备" required><el-select v-model="form.serial" placeholder="选择设备"><el-option v-for="item in devices" :key="item.serial" :value="item.serial" :disabled="!item.ready" :label="`${item.model||item.product||'Android 设备'} · ${item.serial} · ${item.ready?'已连接':item.state}`"/></el-select></el-form-item>
          <el-form-item label="网卡名称" required><el-select v-model="form.networkInterface" filterable allow-create default-first-option placeholder="选择或输入网卡名称"><el-option v-for="item in commonInterfaces" :key="item" :value="item" :label="item"/></el-select></el-form-item>
          <el-form-item label="推送路径（完整路径）" required><el-input v-model="form.targetPath" placeholder="例如 /sdcard/license.txt"/></el-form-item>
        </div>
        <el-form-item label="文本格式模板" required><el-input v-model="form.template" type="textarea" :rows="9" placeholder="必须包含 {{pid}}、{{did}}、{{license}}"/><div class="slot-help">可用槽位：<code v-pre>{{pid}}</code>、<code v-pre>{{did}}</code>、<code v-pre>{{license}}</code></div></el-form-item>
        <el-button type="primary" :icon="Send" :loading="writing" :disabled="!canWrite" @click="writeAuthorization">写入授权文件</el-button>
      </el-form>
    </ContentCard>
    <div>
      <ContentCard title="ADB 连接状态" description="每 3 秒自动检测一次。">
        <div class="connection-summary"><el-icon :class="selectedDevice?.ready?'connected':'disconnected'"><Cable/></el-icon><div><strong>{{!adbInstalled?'ADB 未安装':selectedDevice?.ready?'设备已连接':devices.length?'设备未授权或离线':'未连接设备'}}</strong><span>{{deviceError||selectedDevice?.serial||'请连接设备并允许 USB 调试授权'}}</span></div></div>
        <el-table v-if="devices.length" :data="devices" size="small"><el-table-column label="序号" width="60" align="center"><template #default="{$index}">{{$index+1}}</template></el-table-column><el-table-column prop="serial" label="设备序列号" min-width="150"/><el-table-column prop="model" label="型号" min-width="110"/><el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.ready?'success':'warning'">{{row.ready?'已连接':row.state}}</el-tag></template></el-table-column></el-table>
      </ContentCard>
      <ContentCard title="状态记录" description="显示本页面最近的检测与写入结果。"><el-input v-model="statusText" type="textarea" :rows="13" readonly resize="none"/></ContentCard>
    </div>
  </div>
</template>

<style scoped>
.adb-alert{margin-bottom:20px}.install-help{line-height:1.7}.install-help a{color:#275f78}.install-help code,.slot-help code{padding:2px 6px;border-radius:5px;background:#edf2f4;color:#31566b}.adb-grid{display:grid;grid-template-columns:minmax(480px,1.2fr) minmax(390px,1fr);gap:20px}.adb-grid .content-card{height:auto}.adb-grid .el-select{width:100%}.slot-help{margin-top:8px;color:#7b8d99;font-size:12px}.connection-summary{display:flex;align-items:center;gap:13px;margin-bottom:18px;padding:14px;border-radius:10px;background:#f6f8f8}.connection-summary .el-icon{width:38px;height:38px;border-radius:10px;font-size:21px}.connection-summary .connected{background:#e4f1ee;color:#4e8982}.connection-summary .disconnected{background:#f4eaea;color:#a66568}.connection-summary strong,.connection-summary span{display:block}.connection-summary strong{color:#29485c}.connection-summary span{margin-top:4px;color:#7d8f9b;font-size:12px;word-break:break-all}@media(max-width:1100px){.adb-grid{grid-template-columns:1fr}}
</style>
