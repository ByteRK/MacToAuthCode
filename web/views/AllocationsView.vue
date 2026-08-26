<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Eye, RefreshCw, Search } from 'lucide-vue-next'
import type { AuthCodeRecord, PageResult } from '../../shared/contracts'
import { api } from '../api/client'
import { useAutoRefresh } from '../composables/useAutoRefresh'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
const items = ref<AuthCodeRecord[]>([]), total = ref(0), loading = ref(false), payloadDialog = ref(false), payloadTitle = ref(''), payloadText = ref('')
const query = reactive({ page: 1, pageSize: 20, search: '' })
async function load() { loading.value = true; try { const p = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), search: query.search }); const data = await api<PageResult<AuthCodeRecord>>('/api/admin/allocations?' + p); items.value = data.items; total.value = data.total } finally { loading.value = false } }
const { autoRefresh } = useAutoRefresh(load)
function licensePreview(value: string) { const characters = Array.from(value); return characters.length > 25 ? characters.slice(0, 25).join('') + '…' : value }
function showPayload(row: AuthCodeRecord) { payloadTitle.value = `${row.pid} / ${row.did} 完整载荷`; payloadText.value = JSON.stringify(row.payload, null, 2); payloadDialog.value = true }
onMounted(load)
</script>
<template>
  <PageHeader title="分配记录" description="查看所有成功分配的授权数据，按分配时间排序">
    <label class="auto-refresh">
      <span>自动刷新</span>
      <el-switch v-model="autoRefresh" />
    </label>
    <el-button :icon="RefreshCw" @click="load">刷新</el-button>
  </PageHeader>
  <ContentCard>
    <div class="toolbar">
      <el-input v-model="query.search" clearable :prefix-icon="Search" placeholder="搜索 PID / DID / MAC / 载荷"
        @keyup.enter="query.page = 1; load()" />
      <el-button @click="query.page = 1; load()">查询</el-button>
    </div>
    <el-table v-loading="loading" :data="items">
      <el-table-column label="序号" width="70" align="center">
        <template #default="{ $index }">{{ (query.page - 1) * query.pageSize + $index + 1 }}</template>
      </el-table-column>
      <el-table-column label="PID" min-width="160">
        <template #default="{ row }">
          <div class="pid-cell">
            <strong>{{ row.pid }}</strong>
            <span v-if="row.pidRemark">{{ row.pidRemark }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="did" label="DID" min-width="160" />
      <el-table-column prop="assignedMac" label="MAC" min-width="165" />
      <el-table-column label="License" min-width="210">
        <template #default="{ row }">
          <el-tooltip :content="row.license" placement="top" :disabled="Array.from(row.license).length <= 25">
            <span class="license-preview">{{ licensePreview(row.license) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="sourceBatch" label="批次" min-width="120">
        <template #default="{ row }">{{ row.sourceBatch || '-' }}</template>
      </el-table-column>
      <el-table-column prop="assignedAt" label="分配时间" min-width="165" sortable />
      <el-table-column label="操作" width="132" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain :icon="Eye" @click="showPayload(row)">查看载荷</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination">
      <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
        layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[20, 50, 100]" @change="load" />
    </div>
  </ContentCard>
  <el-dialog v-model="payloadDialog" :title="payloadTitle" width="620">
    <pre class="payload-viewer">{{ payloadText }}</pre>
  </el-dialog>
</template>
<style scoped>
.auto-refresh {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #718594;
  font-size: 13px
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
  font-size: 12px
}

.license-preview {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap
}

.payload-viewer {
  max-height: 520px;
  margin: 0;
  padding: 18px;
  overflow: auto;
  border-radius: 10px;
  background: #f5f8f9;
  color: #304c5f;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all
}
</style>
