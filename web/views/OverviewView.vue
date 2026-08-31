<script setup lang="ts">
import { onBeforeUnmount,onMounted, ref } from 'vue'
import { Boxes, PackageCheck, PackageOpen, RadioTower, RefreshCw,Tally5 } from 'lucide-vue-next'
import {useRouter} from 'vue-router'
import { api } from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
const summary = ref<Record<string, number>>({}), loading = ref(false)
interface Counter{pid:string;remark:string;count:number;targetCount:number;note:string;active:boolean}
const activeCounters=ref<Counter[]>([]),router=useRouter();let timer:number|undefined
const cards = [['PID 数量', 'pidCount', Boxes], ['授权记录总数', 'totalCodes', PackageCheck], ['可分配库存', 'availableCodes', PackageOpen], ['已分配数量', 'assignedCodes', RadioTower], ['累计授权请求', 'distributionRequests', RefreshCw]] as const
const appVersion = __APP_VERSION__
const buildTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium', hour12: false }).format(new Date(__BUILD_TIME__))
async function load() { loading.value = true; try { const data=await api<{ summary: Record<string, number>;activeProductionCounters:Counter[] }>('/api/admin/overview');summary.value=data.summary;activeCounters.value=data.activeProductionCounters } finally { loading.value = false } }
onMounted(()=>{void load();timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load()},5000)})
onBeforeUnmount(()=>{if(timer)clearInterval(timer)})
</script>
<template>
    <PageHeader title="运行总览" description="查看授权库存、产品覆盖和设备分发状态">
        <el-button :icon="RefreshCw" :loading="loading" @click="load">刷新数据</el-button>
    </PageHeader>
    <div class="metric-grid">
        <ContentCard v-for="[label, key, Icon] in cards" :key="key">
            <div class="metric">
                <div class="metric-icon">
                    <component :is="Icon" />
                </div>
                <div>
                    <span>{{ label }}</span>
                    <strong>{{ summary[key] ?? 0 }}</strong>
                </div>
            </div>
        </ContentCard>
    </div>
    <ContentCard title="生产计数" description="当前正在运行的产线计数，每 5 秒自动更新">
        <template #actions><el-button :icon="Tally5" @click="router.push('/production-counters')">进入生产计数</el-button></template>
        <el-empty v-if="!activeCounters.length" description="当前没有正在计数的 PID" :image-size="72"/>
        <div v-else class="production-summary">
            <div v-for="item in activeCounters" :key="item.pid" class="production-item"><div><strong>{{item.pid}}</strong><span>{{item.note}} · 目标 {{item.targetCount}}</span></div><div class="production-count"><b>{{item.count}}</b><small>{{Math.round(item.count/item.targetCount*100)}}%</small></div></div>
        </div>
    </ContentCard>
    <ContentCard title="服务说明" description="设备可通过局域网 HTTP 接口领取与 PID 对应的授权数据">
        <div class="endpoint">
            <code>POST /api/device/authorize</code>
            <span>请求字段：mac、pid</span>
        </div>
    </ContentCard>
    <footer class="build-info">授权码平台 v{{ appVersion }} · 编译时间：{{ buildTime }}</footer>
</template>
<style scoped>
.build-info {
    padding: 18px 4px 4px;
    color: #8a9aa5;
    font-size: 12px;
    text-align: center
}
.production-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.production-item{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px;border:1px solid #e5ecef;border-radius:11px;background:#f8fbfb}.production-item>div:first-child{min-width:0}.production-item strong,.production-item span,.production-count b,.production-count small{display:block}.production-item strong{color:#23455b}.production-item span{margin-top:4px;color:#84949e;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.production-count{text-align:right}.production-count b{font-size:28px;color:#39736e;font-variant-numeric:tabular-nums}.production-count small{color:#84949e}
</style>
