<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Download, Eye, RefreshCw, Search, Send, Upload } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import type { PageResult } from '../../shared/contracts'
import { api, json } from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
interface PidItem { pid: string; remark: string; totalCodes: number; availableCodes: number; assignedCodes: number; lastDataAt: string; remarkUpdatedAt: string | null }
const items = ref<PidItem[]>([]), total = ref(0), loading = ref(false), query = reactive({ page: 1, pageSize: 20, search: '' })
const router = useRouter(), editingPid = ref(''), remarkDraft = ref(''), applyDialog = ref(false), applyLoading = ref(false), applyPid = ref(''), applyMac = ref(''), applyResult = ref<Record<string, any> | null>(null)
const remarkFileInput=ref<HTMLInputElement|null>(null),importingRemarks=ref(false)
async function load() { loading.value = true; try { const p = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), search: query.search }); const data = await api<PageResult<PidItem>>('/api/admin/pids?' + p); items.value = data.items; total.value = data.total } finally { loading.value = false } }
function startRemarkEdit(row: PidItem) { editingPid.value = row.pid; remarkDraft.value = row.remark }
function cancelRemarkEdit() { editingPid.value = '' }
async function saveRemark(row: PidItem) { if (editingPid.value !== row.pid) return; editingPid.value = ''; const next = remarkDraft.value.trim(); if (next === row.remark) return; try { await api(`/api/admin/pids/${encodeURIComponent(row.pid)}/remark`, json('PUT', { remark: next })); row.remark = next; ElMessage.success('产品备注已保存') } catch (error) { editingPid.value = row.pid; ElMessage.error((error as Error).message) } }
function showDetails(row: PidItem) { router.push({ path: '/inventory', query: { pid: row.pid } }) }
function inventoryStatus(count: number) { return count === 0 ? { type: 'danger', label: '无可用库存' } : count <= 10 ? { type: 'warning', label: '库存偏低' } : { type: 'success', label: '库存充足' } }
function openApply(row: PidItem) { applyPid.value = row.pid; applyMac.value = ''; applyResult.value = null; applyDialog.value = true }
async function applyCode() { applyLoading.value = true; try { applyResult.value = await api('/api/device/authorize', json('POST', { pid: applyPid.value, mac: applyMac.value })); ElMessage.success('授权码申请成功'); load() } catch (error) { ElMessage.error((error as Error).message) } finally { applyLoading.value = false } }
async function importRemarks(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;importingRemarks.value=true;try{const body=new FormData();body.append('file',file);const result=await api<{total:number;created:number;updated:number;unchanged:number}>('/api/admin/pids/remarks/import',{method:'POST',body});ElMessage.success(`导入完成：新增 ${result.created}，更新 ${result.updated}，未变化 ${result.unchanged}`);query.page=1;await load()}catch(error){const typed=error as Error&{details?:string[]};ElMessage.error(typed.details?.[0]??typed.message)}finally{input.value='';importingRemarks.value=false}}
onMounted(load)
</script>
<template>
  <PageHeader title="PID 清单" description="查看系统中的产品 PID、库存分布和产品备注。点击备注即可直接编辑">
    <input ref="remarkFileInput" class="hidden-file" type="file" accept="application/json,.json" @change="importRemarks">
    <el-button :icon="Upload" :loading="importingRemarks" @click="remarkFileInput?.click()">导入产品备注</el-button>
    <el-button :icon="Download" tag="a" href="/api/admin/pids/remarks/export">导出产品备注</el-button>
    <el-button :icon="RefreshCw" @click="load">刷新</el-button>
  </PageHeader>
  <ContentCard>
    <div class="toolbar">
      <el-input v-model="query.search" clearable :prefix-icon="Search" placeholder="搜索 PID 或产品备注"
        @keyup.enter="query.page = 1; load()" />
      <el-button @click="query.page = 1; load()">查询</el-button>
    </div>
    <el-table v-loading="loading" :data="items">
      <el-table-column label="序号" width="70" align="center">
        <template #default="{ $index }">{{ (query.page - 1) * query.pageSize + $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="pid" label="PID" min-width="150" />
      <el-table-column label="产品备注" min-width="220">
        <template #default="{ row }">
          <el-input v-if="editingPid === row.pid" v-model="remarkDraft" maxlength="200" autofocus placeholder="填写所属产品"
            @keyup.enter="saveRemark(row)" @keyup.esc="cancelRemarkEdit" @blur="saveRemark(row)" />
          <button v-else type="button" class="remark-editor" :class="{ empty: !row.remark }"
            @click="startRemarkEdit(row)">{{ row.remark || '点击添加产品备注' }}</button>
        </template>
      </el-table-column>
      <el-table-column prop="totalCodes" label="数据总数" width="105" />
      <el-table-column prop="availableCodes" label="可分配" width="95" />
      <el-table-column label="库存状态" width="120">
        <template #default="{ row }">
          <el-tag :type="inventoryStatus(row.availableCodes).type" effect="light">{{
            inventoryStatus(row.availableCodes).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="assignedCodes" label="已分配" width="95" />
      <el-table-column prop="lastDataAt" label="数据更新时间" min-width="165" />
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <div class="table-actions">
            <el-button size="small" type="primary" plain :icon="Send" :disabled="row.availableCodes === 0"
              @click="openApply(row)">申请授权码</el-button>
            <el-button size="small" :icon="Eye" @click="showDetails(row)">查看数据</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination">
      <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
        layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[20, 50, 100]" @change="load" />
    </div>
  </ContentCard>
  <el-dialog v-model="applyDialog" :title="`申请授权码 · ${applyPid}`" width="520">
    <template v-if="!applyResult">
      <el-form label-position="top">
        <el-form-item label="设备 MAC 地址">
          <el-input v-model="applyMac" placeholder="例如 AA:BB:CC:11:22:33" clearable @keyup.enter="applyCode" />
        </el-form-item>
      </el-form>
      <el-alert title="申请后将从该 PID 的可用库存中分配授权码，并绑定此 MAC。" type="info" :closable="false" show-icon />
    </template>
    <div v-else class="apply-result">
      <el-result icon="success" title="申请成功" :sub-title="`DID：${applyResult.display_code}`" />
      <pre>{{ JSON.stringify(applyResult.payload, null, 2) }}</pre>
    </div>
    <template #footer>
      <el-button @click="applyDialog = false">关闭</el-button>
      <el-button v-if="!applyResult" type="primary" :loading="applyLoading" :disabled="!applyMac.trim()"
        @click="applyCode">确认申请</el-button>
    </template>
  </el-dialog>
</template>
<style scoped>
.remark-editor {
  width: 100%;
  min-height: 32px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #385064;
  text-align: left;
  cursor: text
}

.hidden-file {
  display: none
}

.remark-editor:hover {
  border-color: #b8c8d1;
  background: #f7fafb
}

.remark-editor.empty {
  color: #97a5ae;
  font-style: italic
}

.table-actions {
  display: flex;
  gap: 8px
}

.apply-result pre {
  max-height: 260px;
  margin: 0;
  padding: 16px;
  overflow: auto;
  border-radius: 9px;
  background: #f5f8f9;
  color: #304c5f;
  white-space: pre-wrap;
  word-break: break-all
}
</style>
