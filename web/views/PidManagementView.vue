<script setup lang="ts">
import {onMounted,reactive,ref} from 'vue'
import {Edit3,RefreshCw,Search} from 'lucide-vue-next'
import {ElMessage} from 'element-plus'
import type{AuthCodeRecord,PageResult}from '../../shared/contracts'
import{api,json}from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
interface PidItem{pid:string;remark:string;totalCodes:number;availableCodes:number;assignedCodes:number;lastDataAt:string;remarkUpdatedAt:string|null}
const items=ref<PidItem[]>([]),total=ref(0),loading=ref(false),query=reactive({page:1,pageSize:20,search:''})
const remarkDialog=ref(false),remarkPid=ref(''),remark=ref(''),detailDialog=ref(false),detailLoading=ref(false),detailPid=ref(''),details=ref<AuthCodeRecord[]>([])
async function load(){loading.value=true;try{const p=new URLSearchParams({page:String(query.page),pageSize:String(query.pageSize),search:query.search});const data=await api<PageResult<PidItem>>('/api/admin/pids?'+p);items.value=data.items;total.value=data.total}finally{loading.value=false}}
function editRemark(row:PidItem){remarkPid.value=row.pid;remark.value=row.remark;remarkDialog.value=true}
async function saveRemark(){try{await api(`/api/admin/pids/${encodeURIComponent(remarkPid.value)}/remark`,json('PUT',{remark:remark.value}));ElMessage.success('产品备注已保存');remarkDialog.value=false;load()}catch(error){ElMessage.error((error as Error).message)}}
async function showDetails(row:PidItem){detailPid.value=row.pid;detailDialog.value=true;detailLoading.value=true;try{details.value=(await api<PageResult<AuthCodeRecord>>(`/api/admin/codes?pid=${encodeURIComponent(row.pid)}&page=1&pageSize=100`)).items}finally{detailLoading.value=false}}
onMounted(load)
</script>
<template>
  <PageHeader title="PID 管理" description="集中查看系统中的产品 PID、库存分布和产品备注。"><el-button :icon="RefreshCw" @click="load">刷新</el-button></PageHeader>
  <ContentCard><div class="toolbar"><el-input v-model="query.search" clearable :prefix-icon="Search" placeholder="搜索 PID 或产品备注" @keyup.enter="query.page=1;load()"/><el-button @click="query.page=1;load()">查询</el-button></div>
    <el-table v-loading="loading" :data="items"><el-table-column prop="pid" label="PID" min-width="150"/><el-table-column label="产品备注" min-width="220"><template #default="{row}"><span :style="!row.remark?'color:#97a5ae;font-style:italic':''">{{row.remark||'暂未填写产品备注'}}</span></template></el-table-column><el-table-column prop="totalCodes" label="数据总数" width="105"/><el-table-column prop="availableCodes" label="可分配" width="95"/><el-table-column prop="assignedCodes" label="已分配" width="95"/><el-table-column prop="lastDataAt" label="数据更新时间" min-width="165"/><el-table-column label="操作" width="190" fixed="right"><template #default="{row}"><el-button link type="primary" @click="showDetails(row)">查看数据</el-button><el-button link :icon="Edit3" @click="editRemark(row)">编辑备注</el-button></template></el-table-column></el-table>
    <div class="pagination"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[20,50,100]" @change="load"/></div>
  </ContentCard>
  <el-dialog v-model="remarkDialog" :title="`编辑 ${remarkPid} 的产品备注`" width="520"><el-form label-position="top"><el-form-item label="产品备注"><el-input v-model="remark" maxlength="200" show-word-limit placeholder="例如：智能网关 Pro / 海外版本"/></el-form-item></el-form><template #footer><el-button @click="remarkDialog=false">取消</el-button><el-button type="primary" @click="saveRemark">保存备注</el-button></template></el-dialog>
  <el-dialog v-model="detailDialog" :title="`${detailPid} 授权数据`" width="900"><el-table v-loading="detailLoading" :data="details" max-height="520"><el-table-column prop="did" label="DID" min-width="160"/><el-table-column prop="license" label="License" min-width="220" show-overflow-tooltip/><el-table-column label="状态" width="95"><template #default="{row}"><el-tag :type="row.status==='assigned'?'success':'info'">{{row.status==='assigned'?'已分配':'可分配'}}</el-tag></template></el-table-column><el-table-column prop="assignedMac" label="绑定 MAC" min-width="160"/><el-table-column prop="sourceBatch" label="批次" min-width="120"/></el-table></el-dialog>
</template>
