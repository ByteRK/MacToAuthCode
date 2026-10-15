<script setup lang="ts">
import{computed,onMounted,onUnmounted,reactive,ref,watch}from'vue'
import{ElMessage,ElMessageBox}from'element-plus'
import{Cable,Power,RefreshCw,Send}from'lucide-vue-next'
import{api,json}from'../api/client'
import PageHeader from'../components/PageHeader.vue'
import ContentCard from'../components/ContentCard.vue'
import{formatTimeOfDay}from'../utils/time'

interface PidOption{pid:string;remark:string}
const storageKey='auth-platform:telnet-writer-settings'
const defaults={host:'',port:23,username:'root',password:'',networkInterface:'eth0',pid:'',targetPath:'/etc/license.txt',template:'pid={{pid}}\ndid={{did}}\nlicense={{license}}'}
const form=reactive({...defaults}),pids=ref<PidOption[]>([]),checking=ref(false),writing=ref(false),rebooting=ref(false),connected=ref(false),connectionError=ref('尚未检测连接'),statusText=ref('等待操作...')
const commonInterfaces=['eth0','wlan0','usb0','br0','en0']
const canCheck=computed(()=>!!form.host.trim()&&!!form.username.trim())
const canWrite=computed(()=>canCheck.value&&connected.value&&!!form.pid&&!!form.networkInterface.trim()&&!!form.targetPath.trim()&&!!form.template.trim())
function appendStatus(message:string){const time=formatTimeOfDay();statusText.value=statusText.value==='等待操作...'?`[${time}] ${message}`:`${statusText.value}\n[${time}] ${message}`}
function restore(){try{const saved=JSON.parse(localStorage.getItem(storageKey)??'null');if(saved&&typeof saved==='object')Object.assign(form,defaults,saved)}catch{}}
async function loadPids(){pids.value=await api<PidOption[]>('/api/admin/pids/options');if(!form.pid&&pids.value.length)form.pid=pids.value[0]!.pid}
async function checkConnection(){if(!canCheck.value)return;checking.value=true;connected.value=false;connectionError.value='正在连接...';appendStatus(`正在连接 ${form.host}:${form.port}`);try{await api('/api/admin/telnet/check',json('POST',{host:form.host,port:form.port,username:form.username,password:form.password}));connected.value=true;connectionError.value=`${form.host}:${form.port} 连接正常`;appendStatus('Telnet 登录成功');ElMessage.success('Telnet 连接成功')}catch(error){connectionError.value=(error as Error).message;appendStatus(`连接失败：${connectionError.value}`);ElMessage.error(connectionError.value)}finally{checking.value=false}}
async function writeAuthorization(){if(!canWrite.value)return;writing.value=true;appendStatus(`开始读取 ${form.host} 的 ${form.networkInterface} 网卡 MAC`);try{const result=await api<Record<string,string>>('/api/admin/telnet/write',json('POST',form));appendStatus(`授权分配完成：PID=${result.pid}，MAC=${result.mac}，DID=${result.did}`);appendStatus(`已写入 ${result.targetPath}`);ElMessage.success('授权文件写入成功')}catch(error){appendStatus(`写入失败：${(error as Error).message}`);ElMessage.error((error as Error).message)}finally{writing.value=false}}
async function rebootDevice(){if(!connected.value)return;try{await ElMessageBox.confirm(`确认重启 Telnet 设备 ${form.host}？设备会暂时断开连接。`,'确认重启设备',{confirmButtonText:'确认重启',cancelButtonText:'取消',type:'warning'})}catch{return}rebooting.value=true;try{await api('/api/admin/telnet/reboot',json('POST',form));appendStatus(`已向设备 ${form.host} 发送重启命令`);connected.value=false;connectionError.value='设备正在重启';ElMessage.success('设备正在重启')}catch(error){appendStatus(`重启失败：${(error as Error).message}`);ElMessage.error((error as Error).message)}finally{rebooting.value=false}}
watch(form,value=>localStorage.setItem(storageKey,JSON.stringify(value)),{deep:true})
watch(()=>[form.host,form.port,form.username,form.password],()=>{connected.value=false;connectionError.value='连接参数已变化，请重新检测'})
onMounted(async()=>{restore();await loadPids()})
</script>

<template>
  <PageHeader title="Telnet 授权写入" description="连接远程设备，读取指定网卡 MAC，领取授权码并写入设备文件。">
    <el-button type="danger" plain :icon="Power" :loading="rebooting" :disabled="!connected" @click="rebootDevice">重启设备</el-button>
    <el-button :icon="RefreshCw" :loading="checking" :disabled="!canCheck" @click="checkConnection">检测连接</el-button>
  </PageHeader>
  <div class="telnet-grid">
    <ContentCard title="连接与写入设置" description=" ">
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="设备 IP 地址" required><el-input v-model="form.host" placeholder="例如 192.168.1.20"/></el-form-item>
          <el-form-item label="Telnet 端口" required><el-input-number v-model="form.port" :min="1" :max="65535" controls-position="right"/></el-form-item>
          <el-form-item label="用户名" required><el-input v-model="form.username" autocomplete="username"/></el-form-item>
          <el-form-item label="密码（可留空）"><el-input v-model="form.password" type="password" show-password autocomplete="current-password"/></el-form-item>
          <el-form-item label="PID" required><el-select v-model="form.pid" filterable placeholder="选择 PID"><el-option v-for="item in pids" :key="item.pid" :value="item.pid" :label="item.remark?`${item.pid} · ${item.remark}`:item.pid"/></el-select></el-form-item>
          <el-form-item label="网卡名称" required><el-select v-model="form.networkInterface" filterable allow-create default-first-option placeholder="选择或输入网卡名称"><el-option v-for="item in commonInterfaces" :key="item" :value="item" :label="item"/></el-select></el-form-item>
          <el-form-item label="设备端文件路径" required><el-input v-model="form.targetPath" placeholder="例如 /etc/license.txt"/></el-form-item>
        </div>
        <el-form-item label="文本格式模板" required><el-input v-model="form.template" type="textarea" :rows="8"/><div class="slot-help">必须包含 <code v-pre>{{pid}}</code>、<code v-pre>{{did}}</code>、<code v-pre>{{license}}</code></div></el-form-item>
        <el-button type="primary" :icon="Send" :loading="writing" :disabled="!canWrite" @click="writeAuthorization">写入授权文件</el-button>
      </el-form>
    </ContentCard>
    <div>
      <ContentCard title="Telnet 连接状态" description="每次写入前会重新连接并读取网卡 MAC。">
        <div class="connection-summary"><el-icon :class="connected?'connected':'disconnected'"><Cable/></el-icon><div><strong>{{connected?'设备已连接':checking?'正在检测':'未连接'}}</strong><span>{{connectionError}}</span></div></div>
        <el-button plain :loading="checking" :disabled="!canCheck" @click="checkConnection">测试连接</el-button>
      </ContentCard>
      <ContentCard title="状态记录" description="显示本页面最近的连接与写入结果。"><el-input v-model="statusText" type="textarea" :rows="13" readonly resize="none"/></ContentCard>
    </div>
  </div>
</template>

<style scoped>
.telnet-grid{display:grid;grid-template-columns:minmax(480px,1.2fr) minmax(390px,1fr);gap:20px}.telnet-grid .content-card{height:auto}.telnet-grid .el-select,.telnet-grid .el-input-number{width:100%}.slot-help{margin-top:8px;color:#7b8d99;font-size:12px}.slot-help code{padding:2px 6px;border-radius:5px;background:#edf2f4;color:#31566b}.connection-summary{display:flex;align-items:center;gap:13px;margin-bottom:18px;padding:14px;border-radius:10px;background:#f6f8f8}.connection-summary .el-icon{width:38px;height:38px;border-radius:10px;font-size:21px}.connection-summary .connected{background:#e4f1ee;color:#4e8982}.connection-summary .disconnected{background:#f4eaea;color:#a66568}.connection-summary strong,.connection-summary span{display:block}.connection-summary strong{color:#29485c}.connection-summary span{margin-top:4px;color:#7d8f9b;font-size:12px;word-break:break-all}@media(max-width:1100px){.telnet-grid{grid-template-columns:1fr}}
</style>
