<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CloudDownload, Download } from 'lucide-vue-next'
import { api } from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
import FileDropzone from '../components/FileDropzone.vue'

interface DuplicateRow { row: number; pid: string; did: string; duplicateWith: 'available' | 'assigned' | 'file'; duplicateLabel: string }
interface InvalidStatus { row: number; did: string; status: string }
interface Preview { statusValid: boolean; totalRows: number; validCount: number; duplicateCount: number; sourceBatch: string; duplicates: DuplicateRow[]; invalidStatuses: InvalidStatus[] }
interface Result { ok: boolean; totalRows: number; inserted: number; skipped: number; sourceBatch: string; duplicates: DuplicateRow[] }
interface ConversionPreview { totalRows: number; statusValid: boolean; invalidStatuses: InvalidStatus[] }

const file = ref<File | null>(null), pid = ref(''), sourceBatch = ref(''), loading = ref(false), converting = ref(false), result = ref<Result | null>(null), errors = ref<string[]>([])
const preview = ref<Preview | null>(null), conversionPreview = ref<ConversionPreview | null>(null), duplicateDialog = ref(false), statusDialog = ref(false), conversionDialog = ref(false)
function formData() { const data = new FormData(); data.append('file', file.value!); data.append('pid', pid.value.trim()); data.append('sourceBatch', sourceBatch.value); return data }
async function inspect() {
  if (!file.value) return ElMessage.warning('请选择 CIOT Excel 文件')
  if (!pid.value.trim()) return ElMessage.warning('PID 为必填项')
  loading.value = true; errors.value = []; result.value = null
  try { const inspected = await api<Preview>('/api/admin/ciot-import/preview', { method: 'POST', body: formData() }); preview.value = inspected; sourceBatch.value = inspected.sourceBatch; if (!inspected.statusValid) { statusDialog.value = true; return } if (inspected.duplicateCount) { duplicateDialog.value = true; return } await confirmImport() }
  catch (error) { errors.value = (error as Error & { details?: string[] }).details ?? []; ElMessage.error((error as Error).message) } finally { loading.value = false }
}
async function confirmImport() { if (!file.value || !pid.value.trim()) return; loading.value = true; try { const imported = await api<Result>('/api/admin/ciot-import', { method: 'POST', body: formData() }); result.value = imported; duplicateDialog.value = false; ElMessage.success(`成功导入 ${imported.inserted} 条 CIOT 授权码`) } catch (error) { errors.value = (error as Error & { details?: string[] }).details ?? []; ElMessage.error((error as Error).message) } finally { loading.value = false } }
async function inspectConversion(){if(!file.value)return ElMessage.warning('请选择 CIOT Excel 文件');if(!pid.value.trim())return ElMessage.warning('PID 为必填项');converting.value=true;try{const inspected=await api<ConversionPreview>('/api/admin/ciot-import/convert-preview',{method:'POST',body:formData()});conversionPreview.value=inspected;if(!inspected.statusValid){conversionDialog.value=true;return}await downloadConverted()}catch(error){ElMessage.error((error as Error).message)}finally{converting.value=false}}
async function downloadConverted(){if(!file.value||!pid.value.trim())return;converting.value=true;try{const response=await fetch('/api/admin/ciot-import/convert',{method:'POST',body:formData()});if(response.status===401){location.href='/login';throw new Error('登录已失效')}if(!response.ok){const payload=await response.json();throw new Error(payload.message||'转换导出失败')}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ciot-batch-import.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);conversionDialog.value=false;ElMessage.success(`已转换并导出 ${conversionPreview.value?.totalRows??0} 条数据`)}catch(error){ElMessage.error((error as Error).message)}finally{converting.value=false}}
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
          <div class="action-row"><el-button type="primary" :icon="CloudDownload" :loading="loading" :disabled="!file || !pid.trim()"
            @click="inspect">检查并导入</el-button><el-button :icon="Download" :loading="converting" :disabled="!file || !pid.trim()" @click="inspectConversion">转换为批量导入格式</el-button></div>
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

  <el-dialog v-model="conversionDialog" title="转换文件包含状态异常记录" width="700" :close-on-click-modal="false">
    <el-alert type="warning" show-icon :closable="false" :title="`发现 ${conversionPreview?.invalidStatuses.length??0} 条非“未激活”记录`" description="转换操作不会导入数据，也不会修改数据库。继续后仍会转换文件中的全部记录。"/>
    <el-table class="check-table" :data="conversionPreview?.invalidStatuses??[]" max-height="360"><el-table-column label="序号" width="70" align="center"><template #default="{$index}">{{$index+1}}</template></el-table-column><el-table-column prop="row" label="Excel 行" width="100"/><el-table-column prop="did" label="sn码" min-width="220"/><el-table-column prop="status" label="源状态" min-width="140"><template #default="{row}"><el-tag type="warning">{{row.status}}</el-tag></template></el-table-column></el-table>
    <template #footer><el-button @click="conversionDialog=false">取消</el-button><el-button type="primary" :icon="Download" :loading="converting" @click="downloadConverted">仍然转换全部记录</el-button></template>
  </el-dialog>
</template>

<style scoped>
.check-table {
  margin-top: 18px
}
.action-row{display:flex;gap:10px;flex-wrap:wrap}
</style>
