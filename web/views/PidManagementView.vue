<script setup lang="ts">
import {onMounted,reactive,ref} from 'vue'
import {RefreshCw,Search} from 'lucide-vue-next'
import {ElMessage} from 'element-plus'
import {useRouter} from 'vue-router'
import type{PageResult}from '../../shared/contracts'
import{api,json}from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
interface PidItem{pid:string;remark:string;totalCodes:number;availableCodes:number;assignedCodes:number;lastDataAt:string;remarkUpdatedAt:string|null}
const items=ref<PidItem[]>([]),total=ref(0),loading=ref(false),query=reactive({page:1,pageSize:20,search:''})
const router=useRouter(),editingPid=ref(''),remarkDraft=ref('')
async function load(){loading.value=true;try{const p=new URLSearchParams({page:String(query.page),pageSize:String(query.pageSize),search:query.search});const data=await api<PageResult<PidItem>>('/api/admin/pids?'+p);items.value=data.items;total.value=data.total}finally{loading.value=false}}
function startRemarkEdit(row:PidItem){editingPid.value=row.pid;remarkDraft.value=row.remark}
function cancelRemarkEdit(){editingPid.value=''}
async function saveRemark(row:PidItem){if(editingPid.value!==row.pid)return;editingPid.value='';const next=remarkDraft.value.trim();if(next===row.remark)return;try{await api(`/api/admin/pids/${encodeURIComponent(row.pid)}/remark`,json('PUT',{remark:next}));row.remark=next;ElMessage.success('产品备注已保存')}catch(error){editingPid.value=row.pid;ElMessage.error((error as Error).message)}}
function showDetails(row:PidItem){router.push({path:'/inventory',query:{pid:row.pid}})}
onMounted(load)
</script>
<template>
  <PageHeader title="PID 清单" description="集中查看系统中的产品 PID、库存分布和产品备注。点击备注即可直接编辑。"><el-button :icon="RefreshCw" @click="load">刷新</el-button></PageHeader>
  <ContentCard><div class="toolbar"><el-input v-model="query.search" clearable :prefix-icon="Search" placeholder="搜索 PID 或产品备注" @keyup.enter="query.page=1;load()"/><el-button @click="query.page=1;load()">查询</el-button></div>
    <el-table v-loading="loading" :data="items"><el-table-column label="序号" width="70" align="center"><template #default="{$index}">{{(query.page-1)*query.pageSize+$index+1}}</template></el-table-column><el-table-column prop="pid" label="PID" min-width="150"/><el-table-column label="产品备注" min-width="240"><template #default="{row}"><el-input v-if="editingPid===row.pid" v-model="remarkDraft" maxlength="200" autofocus placeholder="填写所属产品" @keyup.enter="saveRemark(row)" @keyup.esc="cancelRemarkEdit" @blur="saveRemark(row)"/><button v-else type="button" class="remark-editor" :class="{empty:!row.remark}" @click="startRemarkEdit(row)">{{row.remark||'点击添加产品备注'}}</button></template></el-table-column><el-table-column prop="totalCodes" label="数据总数" width="105"/><el-table-column prop="availableCodes" label="可分配" width="95"/><el-table-column prop="assignedCodes" label="已分配" width="95"/><el-table-column prop="lastDataAt" label="数据更新时间" min-width="165"/><el-table-column label="操作" width="100" fixed="right"><template #default="{row}"><el-button link type="primary" @click="showDetails(row)">查看数据</el-button></template></el-table-column></el-table>
    <div class="pagination"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[20,50,100]" @change="load"/></div>
  </ContentCard>
</template>
<style scoped>
.remark-editor{width:100%;min-height:32px;padding:5px 8px;border:1px solid transparent;border-radius:7px;background:transparent;color:#385064;text-align:left;cursor:text}
.remark-editor:hover{border-color:#b8c8d1;background:#f7fafb}.remark-editor.empty{color:#97a5ae;font-style:italic}
</style>
