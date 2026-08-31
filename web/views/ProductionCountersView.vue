<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue'
import {Play,RefreshCw,Search,Trash2} from 'lucide-vue-next'
import {ElMessage,ElMessageBox} from 'element-plus'
import {api,json} from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'

interface Counter{pid:string;remark:string;count:number;targetCount:number;note:string;active:boolean;startedAt:string|null;stoppedAt:string|null;updatedAt:string}
interface PidOption{pid:string;remark:string}
const items=ref<Counter[]>([]),options=ref<PidOption[]>([]),search=ref(''),loading=ref(false),acting=ref(''),startDialog=ref(false)
const startForm=ref({pid:'',targetCount:1,note:''})
const filtered=computed(()=>{const key=search.value.trim().toLocaleLowerCase();return key?items.value.filter(item=>item.pid.toLocaleLowerCase().includes(key)||item.remark.toLocaleLowerCase().includes(key)):items.value})
let timer:number|undefined
async function load(silent=false){if(loading.value)return;if(!silent)loading.value=true;try{const data=await api<{items:Counter[]}>('/api/admin/production-counters');items.value=data.items}finally{loading.value=false}}
function openStart(){startForm.value={pid:'',targetCount:1,note:''};startDialog.value=true}
async function start(){const form=startForm.value;if(!form.pid||!Number.isInteger(form.targetCount)||form.targetCount<=0||!form.note.trim())return;acting.value='start';try{await api('/api/admin/production-counters/start',json('POST',form));ElMessage.success('生产计数已启动');startDialog.value=false;await load()}catch(error){ElMessage.error((error as Error).message)}finally{acting.value=''}}
async function cancel(row:Counter){try{await ElMessageBox.confirm(`将永久删除 ${row.pid} 的计数任务及当前进度，此操作无法恢复。`,'取消生产计数',{type:'warning',confirmButtonText:'确认取消并删除',cancelButtonText:'返回'})}catch{return}acting.value=`cancel:${row.pid}`;try{await api(`/api/admin/production-counters/${encodeURIComponent(row.pid)}`,{method:'DELETE'});ElMessage.success('计数任务及进度已删除');await load()}catch(error){ElMessage.error((error as Error).message)}finally{acting.value=''}}
const percentage=(row:Counter)=>Math.min(100,Math.round(row.count/row.targetCount*100))
function format(value:string|null){return value?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'medium',hour12:false}).format(new Date(value.replace(' ','T')+'Z')):'—'}
async function initialize(){const [pidData]=await Promise.all([api<PidOption[]>('/api/admin/pids/options'),load()]);options.value=pidData;timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load(true)},2000)}
function visible(){if(document.visibilityState==='visible')void load(true)}
onMounted(()=>{void initialize();document.addEventListener('visibilitychange',visible)})
onBeforeUnmount(()=>{if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',visible)})
</script>
<template>
  <PageHeader title="生产计数" description="按 PID 独立统计本轮首次成功分发的授权码数量，运行状态和计数在软件重启后继续保留">
    <el-button :icon="RefreshCw" :loading="loading" @click="load()">刷新</el-button>
  </PageHeader>
  <ContentCard title="启动生产计数" description="填写 PID、目标数量和生产备注后开始实时计数">
    <div class="start-row">
      <el-button type="primary" :icon="Play" @click="openStart()">启动计数</el-button>
    </div>
  </ContentCard>
  <ContentCard title="计数状态" description="页面每 2 秒自动更新一次，只统计新分配；设备重复申请原授权码不会重复计数">
    <div class="toolbar"><el-input v-model="search" clearable :prefix-icon="Search" placeholder="搜索 PID 或产品备注"/></div>
    <el-table v-loading="loading" :data="filtered" empty-text="尚未启动过生产计数">
      <el-table-column label="序号" width="70" align="center"><template #default="{$index}">{{$index+1}}</template></el-table-column>
      <el-table-column prop="pid" label="PID" min-width="160"/>
      <el-table-column prop="remark" label="产品备注" min-width="180"><template #default="{row}">{{row.remark||'—'}}</template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.active?'success':'info'" effect="light">{{row.active?'计数中':'已关闭'}}</el-tag></template></el-table-column>
      <el-table-column label="本轮已分发" min-width="145" align="center"><template #default="{row}"><strong class="counter-value">{{row.count}}</strong></template></el-table-column>
      <el-table-column label="目标与进度" min-width="250"><template #default="{row}"><div class="progress-cell"><div><span>{{row.count}} / {{row.targetCount}}</span><span v-if="row.count>row.targetCount" class="over-target">超出 {{row.count-row.targetCount}}</span></div><el-progress :percentage="percentage(row)" :status="row.count>=row.targetCount?'success':undefined"/></div></template></el-table-column>
      <el-table-column prop="note" label="生产备注" min-width="180" show-overflow-tooltip/>
      <el-table-column label="本次启动时间" min-width="180"><template #default="{row}">{{format(row.startedAt)}}</template></el-table-column>
      <el-table-column label="操作" width="135" fixed="right"><template #default="{row}"><div class="table-actions">
        <el-button size="small" type="danger" :icon="Trash2" :loading="acting===`cancel:${row.pid}`" @click="cancel(row)">取消计数</el-button>
      </div></template></el-table-column>
    </el-table>
  </ContentCard>
  <el-dialog v-model="startDialog" title="启动生产计数" width="520">
    <el-form label-position="top" @submit.prevent="start">
      <el-form-item label="PID" required><el-select v-model="startForm.pid" filterable placeholder="选择 PID"><el-option v-for="option in options" :key="option.pid" :label="option.remark?`${option.pid} · ${option.remark}`:option.pid" :value="option.pid" :disabled="items.some(item=>item.pid===option.pid)"/></el-select></el-form-item>
      <el-form-item label="目标数量" required><el-input-number v-model="startForm.targetCount" :min="1" :max="10000000" :step="1" controls-position="right"/></el-form-item>
      <el-form-item label="生产备注" required><el-input v-model="startForm.note" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="例如：2026-08-31 白班生产任务"/></el-form-item>
    </el-form>
    <template #footer><el-button @click="startDialog=false">取消</el-button><el-button type="primary" :icon="Play" :loading="acting==='start'" :disabled="!startForm.pid||startForm.targetCount<=0||!startForm.note.trim()" @click="start">确认启动</el-button></template>
  </el-dialog>
</template>
<style scoped>
.start-row{display:flex;gap:10px}.counter-value{font-size:24px;color:#16324a;font-variant-numeric:tabular-nums}.table-actions{display:flex;gap:8px}.progress-cell>div{display:flex;justify-content:space-between;margin-bottom:6px;color:#526b7b;font-size:12px}.over-target{color:#5b938d;font-weight:600}.el-dialog .el-select,.el-dialog .el-input-number{width:100%}
@media(max-width:760px){.start-row{flex-direction:column}}
</style>
