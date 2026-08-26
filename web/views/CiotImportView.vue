<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CloudDownload } from 'lucide-vue-next'
import { api } from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
import FileDropzone from '../components/FileDropzone.vue'

interface DuplicateRow { row: number; pid: string; did: string; duplicateWith: 'available' | 'assigned' | 'file'; duplicateLabel: string }
interface InvalidStatus { row: number; did: string; status: string }
interface Preview { statusValid: boolean; totalRows: number; validCount: number; duplicateCount: number; sourceBatch: string; duplicates: DuplicateRow[]; invalidStatuses: InvalidStatus[] }
interface Result { ok: boolean; totalRows: number; inserted: number; skipped: number; sourceBatch: string; duplicates: DuplicateRow[] }

const file = ref<File | null>(null), pid = ref(''), sourceBatch = ref(''), loading = ref(false), result = ref<Result | null>(null), errors = ref<string[]>([])
const preview = ref<Preview | null>(null), duplicateDialog = ref(false), statusDialog = ref(false)
function formData() { const data = new FormData(); data.append('file', file.value!); data.append('pid', pid.value.trim()); data.append('sourceBatch', sourceBatch.value); return data }
async function inspect() {
  if (!file.value) return ElMessage.warning('请选择 CIOT Excel 文件')
  if (!pid.value.trim()) return ElMessage.warning('PID 为必填项')
  loading.value = true; errors.value = []; result.value = null
  try { const inspected = await api<Preview>('/api/admin/ciot-import/preview', { method: 'POST', body: formData() }); preview.value = inspected; sourceBatch.value = inspected.sourceBatch; if (!inspected.statusValid) { statusDialog.value = true; return } if (inspected.duplicateCount) { duplicateDialog.value = true; return } await confirmImport() }
  catch (error) { errors.value = (error as Error & { details?: string[] }).details ?? []; ElMessage.error((error as Error).message) } finally { loading.value = false }
}
async function confirmImport() { if (!file.value || !pid.value.trim()) return; loading.value = true; try { const imported = await api<Result>('/api/admin/ciot-import', { method: 'POST', body: formData() }); result.value = imported; duplicateDialog.value = false; ElMessage.success(`成功导入 ${imported.inserted} 条 CIOT 授权码`) } catch (error) { errors.value = (error as Error & { details?: string[] }).details ?? []; ElMessage.error((error as Error).message) } finally { loading.value = false } }
</script>

<template>
  <PageHeader title="CIOT 源导入" description="导入 CIOT 平台导出的授权码清单" />
  <ContentCard title="导入 CIOT 授权码" description="文件必须包含申请表流水号、sn码、许可证、状态；所有记录必须处于“未激活”状态">
    <div class="import-layout">
      <div>
        <FileDropzone accept=".xlsx" hint="请选择 CIOT 导出的 .xlsx 文件，最大 50 MB" @change="file = $event" />
        <el-form label-position="top">
          <div class="form-grid">
            <el-form-item label="PID（必填）" required>
              <el-input v-model="pid" placeholder="请输入这些授权码所属的产品 PID" />
            </el-form-item>
            <el-form-item label="导入批次">
              <el-input v-model="sourceBatch" placeholder="留空则自动生成，如 20260826_1243" />
            </el-form-item>
          </div>
          <el-button type="primary" :icon="CloudDownload" :loading="loading" :disabled="!file || !pid.trim()"
            @click="inspect">检查并导入</el-button>
        </el-form>
      </div>
      <div class="result-panel">
        <template v-if="result?.ok">
          <span>导入结果</span>
          <strong>{{ result.inserted }}</strong>
          <p>PID：{{ pid }}<br>批次：{{ result.sourceBatch }}<br>共 {{ result.totalRows }} 行，跳过 {{ result.skipped }} 条重复数据
          </p>
        </template>
        <template v-else-if="errors.length">
          <span>校验未通过</span>
          <ul>
            <li v-for="error in errors" :key="error">{{ error }}</li>
          </ul>
        </template>
        <template v-else>
          <span>等待导入</span>
        </template>
      </div>
    </div>
  </ContentCard>

  <el-dialog v-model="statusDialog" title="CIOT 源状态异常" width="700" :close-on-click-modal="false">
    <el-alert type="error" show-icon :closable="false"
      :title="`发现 ${preview?.invalidStatuses.length ?? 0} 条非“未激活”记录，已拒绝整次导入`"
      description="请返回 CIOT 源检查数据状态，修正并重新导出后再导入。" />
    <el-table class="check-table" :data="preview?.invalidStatuses ?? []" max-height="360">
      <el-table-column label="序号" width="70" align="center">
        <template #default="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="row" label="Excel 行" width="100" />
      <el-table-column prop="did" label="sn码" min-width="220" />
      <el-table-column prop="status" label="源状态" min-width="140">
        <template #default="{ row }">
          <el-tag type="danger">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button type="primary" @click="statusDialog = false">我知道了</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="duplicateDialog" title="发现重复授权码" width="760" :close-on-click-modal="false">
    <el-alert type="warning" show-icon :closable="false"
      :title="`共 ${preview?.totalRows ?? 0} 条：合法 ${preview?.validCount ?? 0} 条，重复 ${preview?.duplicateCount ?? 0} 条`"
      description="重复项不会覆盖系统中的现有数据。请确认是否导入剩余未重复项。" />
    <el-table class="check-table" :data="preview?.duplicates ?? []" max-height="360">
      <el-table-column label="序号" width="70" align="center">
        <template #default="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="row" label="Excel 行" width="90" />
      <el-table-column prop="pid" label="PID" min-width="160" />
      <el-table-column prop="did" label="sn码" min-width="190" />
      <el-table-column label="重复类型" width="130">
        <template #default="{ row }">
          <el-tag :type="row.duplicateWith === 'assigned' ? 'danger' : 'warning'">{{ row.duplicateLabel }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="duplicateDialog = false">取消当次导入</el-button>
      <el-button type="primary" :loading="loading" :disabled="!preview?.validCount" @click="confirmImport">导入剩余 {{
        preview?.validCount ?? 0 }}
        条</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.check-table {
  margin-top: 18px
}
</style>
