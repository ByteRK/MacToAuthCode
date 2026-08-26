<script setup lang="ts">
import {computed,onMounted,reactive,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {Plus,RefreshCw,Search} from 'lucide-vue-next'
import {useRoute,useRouter} from 'vue-router'
import type{AuthCodeRecord,PageResult}from '../../shared/contracts'
import{api,json}from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
const loading=ref(false),items=ref<AuthCodeRecord[]>([]),total=ref(0),selected=ref<AuthCodeRecord[]>([])
const route=useRoute(),router=useRouter()
const query=reactive({page:1,pageSize:20,search:'',status:'all',pid:String(route.query.pid??'')})
const dialog=ref(false),editing=ref<number|null>(null),deleteDialog=ref(false),deletePassword=ref('')
const form=reactive({pid:'',did:'',license:'',sourceBatch:'',payloadText:'{}'})
const deleteIds=computed(()=>selected.value.map(x=>x.id))
async function load(){loading.value=true;try{const p=new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)]));const data=await api<PageResult<AuthCodeRecord>>('/api/admin/codes?'+p);items.value=data.items;total.value=data.total}finally{loading.value=false}}
function openEdit(row?:AuthCodeRecord){editing.value=row?.id??null;Object.assign(form,row?{pid:row.pid,did:row.did,license:row.license,sourceBatch:row.sourceBatch??'',payloadText:JSON.stringify(row.payload,null,2)}:{pid:'',did:'',license:'',sourceBatch:'',payloadText:'{}'});dialog.value=true}
async function save(){try{const body={...form,payload:JSON.parse(form.payloadText)};await api(editing.value?`/api/admin/codes/${editing.value}`:'/api/admin/codes',json(editing.value?'PUT':'POST',body));ElMessage.success('保存成功');dialog.value=false;load()}catch(e){ElMessage.error((e as Error).message)}}
async function unbind(row:AuthCodeRecord){await api(`/api/admin/codes/${row.id}/unbind`,{method:'POST'});ElMessage.success('已解除绑定');load()}
async function remove(){try{await api('/api/admin/codes/delete',json('POST',{ids:deleteIds.value,password:deletePassword.value}));ElMessage.success('删除成功');deleteDialog.value=false;deletePassword.value='';load()}catch(e){ElMessage.error((e as Error).message)}}
function clearPidFilter(){query.pid='';query.page=1;router.replace({path:'/inventory'});load()}
onMounted(load)
</script>
<template>
  <PageHeader title="授权码管理" description="维护库存、已分配关系及完整授权载荷。">
    <el-button :icon="RefreshCw" @click="load">刷新</el-button><el-button type="primary" :icon="Plus" @click="openEdit()">新增授权码</el-button>
  </PageHeader>
  <ContentCard>
    <div v-if="query.pid" class="active-filter"><span>当前仅展示 PID：</span><strong>{{query.pid}}</strong><el-button link type="primary" @click="clearPidFilter">清除筛选</el-button></div>
    <div class="toolbar"><el-input v-model="query.search" clearable placeholder="搜索 DID / MAC / 载荷" :prefix-icon="Search" @keyup.enter="query.page=1;load()"/><el-select v-model="query.status" @change="query.page=1;load()"><el-option label="全部状态" value="all"/><el-option label="可分配" value="available"/><el-option label="已分配" value="assigned"/></el-select><el-button @click="query.page=1;load()">查询</el-button><el-button type="danger" plain :disabled="!deleteIds.length" @click="deleteDialog=true">删除所选</el-button></div>
    <el-table v-loading="loading" :data="items" row-key="id" @selection-change="selected=$event"><el-table-column type="selection" width="44"/><el-table-column label="PID" min-width="160"><template #default="{row}"><div class="pid-cell"><strong>{{row.pid}}</strong><span v-if="row.pidRemark">{{row.pidRemark}}</span></div></template></el-table-column><el-table-column prop="did" label="DID" min-width="170"/><el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='assigned'?'success':'info'">{{row.status==='assigned'?'已分配':'可分配'}}</el-tag></template></el-table-column><el-table-column prop="assignedMac" label="绑定 MAC" min-width="160"><template #default="{row}">{{row.assignedMac||'-'}}</template></el-table-column><el-table-column prop="sourceBatch" label="批次" min-width="120"/><el-table-column prop="assignedAt" label="分配时间" min-width="160"/><el-table-column label="操作" width="180" fixed="right"><template #default="{row}"><el-button link type="primary" @click="openEdit(row)">编辑</el-button><el-button v-if="row.status==='assigned'" link @click="unbind(row)">解除绑定</el-button></template></el-table-column></el-table>
    <div class="pagination"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[20,50,100]" @change="load"/></div>
  </ContentCard>
  <el-dialog v-model="dialog" :title="editing?'编辑授权码':'新增授权码'" width="620"><el-form label-position="top"><div class="form-grid"><el-form-item label="PID"><el-input v-model="form.pid"/></el-form-item><el-form-item label="DID"><el-input v-model="form.did"/></el-form-item><el-form-item label="License"><el-input v-model="form.license"/></el-form-item><el-form-item label="来源批次"><el-input v-model="form.sourceBatch"/></el-form-item></div><el-form-item label="完整载荷 JSON"><el-input v-model="form.payloadText" type="textarea" :rows="8"/></el-form-item></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
  <el-dialog v-model="deleteDialog" title="确认删除授权码" width="460"><p class="dialog-warning">将删除 {{deleteIds.length}} 条记录，包括其中的已分配关系。此操作会写入审计日志。</p><el-form label-position="top"><el-form-item label="请输入管理员密码进行二次确认"><el-input v-model="deletePassword" type="password" show-password @keyup.enter="remove"/></el-form-item></el-form><template #footer><el-button @click="deleteDialog=false">取消</el-button><el-button type="danger" :disabled="!deletePassword" @click="remove">确认删除</el-button></template></el-dialog>
</template>
<style scoped>
.active-filter{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;border-radius:9px;background:#edf4f4;color:#58707d;font-size:13px}
.active-filter strong{color:#24516a}
.pid-cell{display:grid;gap:3px}.pid-cell strong{color:#29485c}.pid-cell span{color:#8798a3;font-size:12px;font-weight:400}
</style>
