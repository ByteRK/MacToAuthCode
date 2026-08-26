<script setup lang="ts">
import {onMounted,reactive,ref} from 'vue'
import {Download,RefreshCw,Search} from 'lucide-vue-next'
import {api} from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
const items=ref<any[]>([]),loading=ref(false),query=reactive({action:'all',search:'',limit:50})
const labels:Record<string,string>={assigned:'新分配',reused:'重复返回',exhausted:'库存不足',created:'新增',updated:'编辑',deleted:'删除',unbound:'解除绑定',imported:'导入',migrated:'迁移'}
async function load(){loading.value=true;try{const p=new URLSearchParams({action:query.action,search:query.search,limit:String(query.limit)});items.value=(await api<{items:any[]}>('/api/admin/logs?'+p)).items}finally{loading.value=false}}
onMounted(load)
</script>
<template><PageHeader title="操作与请求记录" description="统一追踪设备分发和后台数据变更，重要操作保留数据快照。"><el-button :icon="Download" tag="a" href="/api/admin/export/logs">导出日志</el-button><el-button type="primary" :icon="RefreshCw" @click="load">刷新记录</el-button></PageHeader><ContentCard><div class="toolbar"><el-input v-model="query.search" :prefix-icon="Search" clearable placeholder="搜索 PID / MAC / DID" @keyup.enter="load"/><el-select v-model="query.action" @change="load"><el-option label="全部动作" value="all"/><el-option v-for="(label,key) in labels" :key="key" :label="label" :value="key"/></el-select><el-select v-model="query.limit" @change="load"><el-option :value="20" label="最近 20 条"/><el-option :value="50" label="最近 50 条"/><el-option :value="100" label="最近 100 条"/></el-select></div><el-table v-loading="loading" :data="items"><el-table-column prop="createdAt" label="时间" min-width="165"/><el-table-column label="动作" width="110"><template #default="{row}"><el-tag effect="plain">{{labels[row.action]||row.action}}</el-tag></template></el-table-column><el-table-column prop="pid" label="PID"/><el-table-column prop="mac" label="MAC" min-width="155"/><el-table-column prop="did" label="DID"/><el-table-column prop="message" label="说明" min-width="220"/><el-table-column prop="clientIp" label="来源 IP"/></el-table></ContentCard></template>
