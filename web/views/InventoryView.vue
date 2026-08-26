<script setup lang="ts">
import {computed,onMounted,reactive,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {Pencil,Plus,RefreshCw,RotateCcw,Save,Search,Unlink,X} from 'lucide-vue-next'
import {useRoute,useRouter} from 'vue-router'
import type{AuthCodeRecord,PageResult}from '../../shared/contracts'
import{api,json}from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
const loading=ref(false),items=ref<AuthCodeRecord[]>([]),total=ref(0),selected=ref<AuthCodeRecord[]>([])
const route=useRoute(),router=useRouter()
const pageValue=(value:unknown,fallback:number)=>{const parsed=Number(value);return Number.isInteger(parsed)&&parsed>0?parsed:fallback}
const statusValue=String(route.query.status??'all')
const query=reactive({page:pageValue(route.query.page,1),pageSize:pageValue(route.query.pageSize,20),search:String(route.query.search??''),status:['available','assigned'].includes(statusValue)?statusValue:'all',pid:String(route.query.pid??'')})
const dialog=ref(false),editing=ref<number|null>(null),editPassword=ref(''),deleteDialog=ref(false),deletePassword=ref(''),deleting=ref(false),pendingDeleteIds=ref<number[]>([]),unbindDialog=ref(false),unbindTarget=ref<AuthCodeRecord|null>(null),unbindPassword=ref('')
interface CodeForm{pid:string;did:string;license:string;sourceBatch:string;payloadText:string}
const form=reactive<CodeForm>({pid:'',did:'',license:'',sourceBatch:'',payloadText:'{}'}),originalForm=ref<CodeForm|null>(null)
const deleteIds=computed(()=>selected.value.map(x=>x.id))
const hasChanges=computed(()=>!!editing.value&&!!originalForm.value&&Object.keys(form).some(key=>form[key as keyof CodeForm]!==originalForm.value![key as keyof CodeForm]))
async function load(){loading.value=true;try{const p=new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)]));const data=await api<PageResult<AuthCodeRecord>>('/api/admin/codes?'+p);items.value=data.items;total.value=data.total}finally{loading.value=false}}
async function syncRoute(){await router.replace({path:'/inventory',query:{page:String(query.page),pageSize:String(query.pageSize),status:query.status,...(query.pid?{pid:query.pid}:{}),...(query.search?{search:query.search}:{})}})}
async function refreshWithState(){await syncRoute();await load()}
async function applyFilters(){query.page=1;await refreshWithState()}
function openEdit(row?:AuthCodeRecord){editing.value=row?.id??null;editPassword.value='';const next:CodeForm=row?{pid:row.pid,did:row.did,license:row.license,sourceBatch:row.sourceBatch??'',payloadText:JSON.stringify(row.payload,null,2)}:{pid:'',did:'',license:'',sourceBatch:'',payloadText:'{}'};Object.assign(form,next);originalForm.value=row?{...next}:null;dialog.value=true}
function fieldChanged(key:keyof CodeForm){return !!editing.value&&form[key]!==originalForm.value?.[key]}
function resetForm(){if(!originalForm.value)return;Object.assign(form,originalForm.value);editPassword.value=''}
async function save(){try{const body={...form,payload:JSON.parse(form.payloadText),...(editing.value?{password:editPassword.value}:{})};await api(editing.value?`/api/admin/codes/${editing.value}`:'/api/admin/codes',json(editing.value?'PUT':'POST',body));ElMessage.success('保存成功');dialog.value=false;editPassword.value='';await refreshWithState()}catch(e){ElMessage.error((e as Error).message)}}
function confirmUnbind(row:AuthCodeRecord){unbindTarget.value=row;unbindPassword.value='';unbindDialog.value=true}
async function unbind(){if(!unbindTarget.value)return;try{await api(`/api/admin/codes/${unbindTarget.value.id}/unbind`,json('POST',{password:unbindPassword.value}));ElMessage.success('已解除绑定');unbindDialog.value=false;unbindTarget.value=null;unbindPassword.value='';await refreshWithState()}catch(e){ElMessage.error((e as Error).message)}}
function openDeleteDialog(){pendingDeleteIds.value=[...deleteIds.value];if(!pendingDeleteIds.value.length)return;deletePassword.value='';deleteDialog.value=true}
async function remove(){if(deleting.value||!deletePassword.value||!pendingDeleteIds.value.length)return;deleting.value=true;try{const result=await api<{deleted:number}>('/api/admin/codes/delete',json('POST',{ids:pendingDeleteIds.value,password:deletePassword.value}));if(!result.deleted)throw new Error('未删除任何授权码，请刷新页面后重试');ElMessage.success(`已删除 ${result.deleted} 条授权码`);deleteDialog.value=false;deletePassword.value='';pendingDeleteIds.value=[];selected.value=[];await load();const maxPage=Math.max(1,Math.ceil(total.value/query.pageSize));if(query.page>maxPage)query.page=maxPage;await refreshWithState()}catch(e){ElMessage.error((e as Error).message)}finally{deleting.value=false}}
async function clearPidFilter(){query.pid='';query.page=1;await refreshWithState()}
onMounted(load)
</script>
<template>
  <PageHeader title="授权码管理" description="维护库存、已分配关系及完整授权载荷。">
    <el-button :icon="RefreshCw" @click="load">刷新</el-button><el-button type="primary" :icon="Plus" @click="openEdit()">新增授权码</el-button>
  </PageHeader>
  <ContentCard>
    <div v-if="query.pid" class="active-filter"><span>当前仅展示 PID：</span><strong>{{query.pid}}</strong><el-button link type="primary" @click="clearPidFilter">清除筛选</el-button></div>
    <div class="toolbar"><el-input v-model="query.search" clearable placeholder="搜索 DID / MAC / 载荷" :prefix-icon="Search" @keyup.enter="applyFilters"/><el-select v-model="query.status" @change="applyFilters"><el-option label="全部状态" value="all"/><el-option label="可分配" value="available"/><el-option label="已分配" value="assigned"/></el-select><el-button @click="applyFilters">查询</el-button><el-button type="danger" plain :disabled="!deleteIds.length" @click="openDeleteDialog">删除所选</el-button></div>
    <el-table v-loading="loading" :data="items" row-key="id" @selection-change="selected=$event"><el-table-column label="序号" width="70" align="center"><template #default="{$index}">{{(query.page-1)*query.pageSize+$index+1}}</template></el-table-column><el-table-column type="selection" width="44"/><el-table-column label="PID" min-width="160"><template #default="{row}"><div class="pid-cell"><strong>{{row.pid}}</strong><span v-if="row.pidRemark">{{row.pidRemark}}</span></div></template></el-table-column><el-table-column prop="did" label="DID" min-width="170"/><el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='assigned'?'success':'info'">{{row.status==='assigned'?'已分配':'可分配'}}</el-tag></template></el-table-column><el-table-column prop="assignedMac" label="绑定 MAC" min-width="160"><template #default="{row}">{{row.assignedMac||'-'}}</template></el-table-column><el-table-column prop="sourceBatch" label="批次" min-width="120"/><el-table-column prop="assignedAt" label="分配时间" min-width="160"/><el-table-column label="操作" width="210" fixed="right"><template #default="{row}"><div class="table-actions"><el-button size="small" type="primary" plain :icon="Pencil" @click="openEdit(row)">编辑</el-button><el-button v-if="row.status==='assigned'" size="small" type="danger" plain :icon="Unlink" @click="confirmUnbind(row)">解除绑定</el-button></div></template></el-table-column></el-table>
    <div class="pagination"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[20,50,100]" @change="refreshWithState"/></div>
  </ContentCard>
  <el-dialog v-model="dialog" :title="editing?'编辑授权码':'新增授权码'" width="620"><el-form label-position="top"><div class="form-grid"><el-form-item label="PID"><el-input v-model="form.pid" :class="{fieldChanged:fieldChanged('pid')}"/></el-form-item><el-form-item label="DID"><el-input v-model="form.did" :class="{fieldChanged:fieldChanged('did')}"/></el-form-item><el-form-item label="License"><el-input v-model="form.license" :class="{fieldChanged:fieldChanged('license')}"/></el-form-item><el-form-item label="来源批次"><el-input v-model="form.sourceBatch" :class="{fieldChanged:fieldChanged('sourceBatch')}"/></el-form-item></div><el-form-item label="完整载荷 JSON"><el-input v-model="form.payloadText" :class="{fieldChanged:fieldChanged('payloadText')}" type="textarea" :rows="8"/></el-form-item><el-alert v-if="hasChanges" class="change-hint" title="高亮字段已修改，可点击重置按钮恢复原始数据" type="warning" :closable="false" show-icon/><el-form-item v-if="editing" label="请输入管理员密码进行二次确认"><el-input v-model="editPassword" type="password" show-password @keyup.enter="save"/></el-form-item></el-form><template #footer><el-button :icon="X" @click="dialog=false">取消</el-button><el-button v-if="editing" :icon="RotateCcw" :disabled="!hasChanges" @click="resetForm">重置</el-button><el-button type="primary" :icon="Save" :disabled="!!editing&&(!editPassword||!hasChanges)" @click="save">保存</el-button></template></el-dialog>
  <el-dialog v-model="unbindDialog" title="确认解除设备绑定" width="460"><p class="dialog-warning">解除后，该授权码会恢复为可分配状态，原设备再次请求时可能获得其它授权码。</p><el-form label-position="top"><el-form-item label="请输入管理员密码进行二次确认"><el-input v-model="unbindPassword" type="password" show-password @keyup.enter="unbind"/></el-form-item></el-form><template #footer><el-button @click="unbindDialog=false">取消</el-button><el-button type="primary" :disabled="!unbindPassword" @click="unbind">确认解除绑定</el-button></template></el-dialog>
  <el-dialog v-model="deleteDialog" title="确认删除授权码" width="460"><p class="dialog-warning">将删除 {{pendingDeleteIds.length}} 条记录，包括其中的已分配关系。此操作会写入审计日志。</p><el-form label-position="top" @submit.prevent="remove"><el-form-item label="请输入管理员密码进行二次确认"><el-input v-model="deletePassword" type="password" show-password @keydown.enter.prevent.stop="remove"/></el-form-item></el-form><template #footer><el-button @click="deleteDialog=false">取消</el-button><el-button type="danger" :loading="deleting" :disabled="!deletePassword||!pendingDeleteIds.length" @click="remove">确认删除</el-button></template></el-dialog>
</template>
<style scoped>
.active-filter{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;border-radius:9px;background:#edf4f4;color:#58707d;font-size:13px}
.active-filter strong{color:#24516a}
.pid-cell{display:grid;gap:3px}.pid-cell strong{color:#29485c}.pid-cell span{color:#8798a3;font-size:12px;font-weight:400}
.table-actions{display:flex;gap:8px}
.change-hint{margin-bottom:18px}.fieldChanged:deep(.el-input__wrapper){background:#fff9ed;box-shadow:0 0 0 1px #c59652 inset}.fieldChanged:deep(.el-textarea__inner){background:#fff9ed;box-shadow:0 0 0 1px #c59652 inset}
</style>
