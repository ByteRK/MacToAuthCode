<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Download, RefreshCw, Search } from 'lucide-vue-next'
import { api } from '../api/client'
import { useAutoRefresh } from '../composables/useAutoRefresh'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
const items = ref<any[]>([]), loading = ref(false), query = reactive({ actions: [] as string[], search: '', limit: 50 })
const labels: Record<string, string> = { assigned: '新分配', reused: '重复返回', exhausted: '库存不足', created: '新增', updated: '编辑', deleted: '删除', unbound: '解除绑定', imported: '导入', migrated: '迁移', adb_write_succeeded: 'ADB 写入成功', adb_write_failed: 'ADB 写入失败' }
async function load() { loading.value = true; try { const p = new URLSearchParams({ action: query.actions.join(','), search: query.search, limit: String(query.limit) }); items.value = (await api<{ items: any[] }>('/api/admin/logs?' + p)).items } finally { loading.value = false } }
const { autoRefresh } = useAutoRefresh(load)
onMounted(load)
</script>
<template>
    <PageHeader title="操作与请求记录" description="统一追踪设备分发和后台数据变更">
        <label class="auto-refresh">
            <span>自动刷新</span>
            <el-switch v-model="autoRefresh" />
        </label>
        <el-button :icon="Download" tag="a" href="/api/admin/export/logs">导出日志</el-button>
        <el-button type="primary" :icon="RefreshCw" @click="load">刷新记录</el-button>
    </PageHeader>
    <ContentCard>
        <div class="toolbar">
            <el-input v-model="query.search" :prefix-icon="Search" clearable placeholder="搜索 PID / MAC / DID"
                @keyup.enter="load" />
            <el-select v-model="query.actions" class="action-filter" multiple clearable collapse-tags
                collapse-tags-tooltip :max-collapse-tags="2" placeholder="全部动作" @change="load">
                <el-option v-for="(label, key) in labels" :key="key" :label="label" :value="key" />
            </el-select>
            <el-select v-model="query.limit" @change="load">
                <el-option :value="20" label="最近 20 条" />
                <el-option :value="50" label="最近 50 条" />
                <el-option :value="100" label="最近 100 条" />
            </el-select>
        </div>
        <el-table v-loading="loading" :data="items">
            <el-table-column label="序号" width="70" align="center">
                <template #default="{ $index }">{{ $index + 1 }}</template>
            </el-table-column>
            <el-table-column prop="createdAt" label="时间" min-width="165" />
            <el-table-column label="动作" width="110">
                <template #default="{ row }">
                    <el-tag effect="plain">{{ labels[row.action] || row.action }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="PID" min-width="150">
                <template #default="{ row }">
                    <div class="pid-cell">
                        <strong>{{ row.pid || '-' }}</strong>
                        <span v-if="row.pidRemark">{{ row.pidRemark }}</span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column prop="mac" label="MAC" min-width="155" />
            <el-table-column prop="did" label="DID" />
            <el-table-column prop="message" label="说明" min-width="220" />
            <el-table-column prop="clientIp" label="来源 IP" />
        </el-table>
    </ContentCard>
</template>
<style scoped>
.auto-refresh {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #718594;
    font-size: 13px
}

.toolbar .action-filter {
    width: 280px
}

.pid-cell {
    display: grid;
    gap: 3px
}

.pid-cell strong {
    color: #29485c
}

.pid-cell span {
    color: #8798a3;
    font-size: 12px;
    font-weight: 400
}
</style>
