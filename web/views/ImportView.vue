<script setup lang="ts">
import{ref}from'vue'
import{ElMessage}from'element-plus'
import{Download,Upload}from'lucide-vue-next'
import{api}from'../api/client'
import PageHeader from'../components/PageHeader.vue'
import ContentCard from'../components/ContentCard.vue'
import FileDropzone from'../components/FileDropzone.vue'

interface DuplicateRow{row:number;pid:string;did:string;duplicateWith:'available'|'assigned'|'file';duplicateLabel:string}
interface ImportPreview{totalRows:number;validCount:number;duplicateCount:number;sourceBatch:string;duplicates:DuplicateRow[]}
interface ImportResult{ok:boolean;totalRows:number;inserted:number;skipped:number;sourceBatch:string;duplicates:DuplicateRow[]}

const file=ref<File|null>(null),defaultPid=ref(''),sourceBatch=ref(''),loading=ref(false),result=ref<ImportResult|null>(null),errors=ref<string[]>([])
const preview=ref<ImportPreview|null>(null),duplicateDialog=ref(false)

function formData(){const data=new FormData();data.append('file',file.value!);data.append('defaultPid',defaultPid.value);data.append('sourceBatch',sourceBatch.value);return data}
async function inspect(){
  if(!file.value)return ElMessage.warning('请选择 Excel 文件')
  loading.value=true;errors.value=[];result.value=null
  try{
    const inspected=await api<ImportPreview>('/api/admin/import/preview',{method:'POST',body:formData()})
    preview.value=inspected;sourceBatch.value=inspected.sourceBatch
    if(inspected.duplicateCount){duplicateDialog.value=true;return}
    await confirmImport()
  }catch(e){errors.value=(e as Error&{details?:string[]}).details??[];ElMessage.error((e as Error).message)}finally{loading.value=false}
}
async function confirmImport(){
  if(!file.value)return
  loading.value=true
  try{const imported=await api<ImportResult>('/api/admin/import',{method:'POST',body:formData()});result.value=imported;duplicateDialog.value=false;ElMessage.success(`成功导入 ${imported.inserted} 条授权码`)}
  catch(e){errors.value=(e as Error&{details?:string[]}).details??[];ElMessage.error((e as Error).message)}finally{loading.value=false}
}
</script>

<template>
  <PageHeader title="批量导入导出" description="通过标准 Excel 模板批量维护授权库存，并导出分配记录。"><el-button :icon="Download" tag="a" href="/api/admin/export/template">下载模板</el-button><el-button type="primary" :icon="Download" tag="a" href="/api/admin/export/assigned">导出已分配记录</el-button></PageHeader>
  <ContentCard title="导入授权库存" description="模板仅要求 pid、did、license；其余列会原样保存到自定义载荷。">
    <div class="import-layout"><div><FileDropzone accept=".xlsx" hint="仅支持 .xlsx 文件，最大 50 MB" @change="file=$event"/><el-form label-position="top"><div class="form-grid"><el-form-item label="默认 PID"><el-input v-model="defaultPid" placeholder="仅在文件没有 pid 列时使用"/></el-form-item><el-form-item label="导入批次"><el-input v-model="sourceBatch" placeholder="留空则自动生成，如 20260826_1243"/></el-form-item></div><el-button type="primary" :icon="Upload" :loading="loading" :disabled="!file" @click="inspect">检查并导入</el-button></el-form></div>
      <div class="result-panel"><template v-if="result?.ok"><span>导入结果</span><strong>{{result.inserted}}</strong><p>批次：{{result.sourceBatch}}<br>共 {{result.totalRows}} 行，跳过 {{result.skipped}} 条重复数据。</p></template><template v-else-if="errors.length"><span>校验未通过</span><ul><li v-for="error in errors" :key="error">{{error}}</li></ul></template><template v-else><span>等待导入</span><p>系统会先检查文件；若存在重复项，将由你确认是否只导入剩余数据。</p></template></div></div>
  </ContentCard>

  <el-dialog v-model="duplicateDialog" title="发现重复授权码" width="760" :close-on-click-modal="false">
    <el-alert type="warning" show-icon :closable="false" :title="`共 ${preview?.totalRows??0} 条：合法 ${preview?.validCount??0} 条，重复 ${preview?.duplicateCount??0} 条`" description="重复项不会覆盖系统中的现有数据。请确认是否导入剩余未重复项。"/>
    <el-table class="duplicate-table" :data="preview?.duplicates??[]" max-height="360"><el-table-column prop="row" label="Excel 行" width="90"/><el-table-column prop="pid" label="PID" min-width="160"/><el-table-column prop="did" label="DID" min-width="190"/><el-table-column label="重复类型" width="130"><template #default="{row}"><el-tag :type="row.duplicateWith==='assigned'?'danger':'warning'">{{row.duplicateLabel}}</el-tag></template></el-table-column></el-table>
    <template #footer><el-button @click="duplicateDialog=false">取消当次导入</el-button><el-button type="primary" :loading="loading" :disabled="!preview?.validCount" @click="confirmImport">导入剩余 {{preview?.validCount??0}} 条</el-button></template>
  </el-dialog>
</template>

<style scoped>.duplicate-table{margin-top:18px}</style>
