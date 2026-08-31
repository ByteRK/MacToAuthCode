<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Boxes, PackageCheck, PackageOpen, RadioTower, RefreshCw } from 'lucide-vue-next'
import { api } from '../api/client'
import PageHeader from '../components/PageHeader.vue'
import ContentCard from '../components/ContentCard.vue'
const summary = ref<Record<string, number>>({}), loading = ref(false)
const cards = [['PID 数量', 'pidCount', Boxes], ['授权记录总数', 'totalCodes', PackageCheck], ['可分配库存', 'availableCodes', PackageOpen], ['已分配数量', 'assignedCodes', RadioTower], ['累计授权请求', 'distributionRequests', RefreshCw]] as const
const appVersion = __APP_VERSION__
const buildTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium', hour12: false }).format(new Date(__BUILD_TIME__))
async function load() { loading.value = true; try { summary.value = (await api<{ summary: Record<string, number> }>('/api/admin/overview')).summary } finally { loading.value = false } }
onMounted(load)
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
</style>
