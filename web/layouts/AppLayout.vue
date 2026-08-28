<script setup lang="ts">
import {Box,ChartNoAxesCombined,FileClock,FileInput,DatabaseZap,LogOut,Tags,Send,CloudDownload,Usb} from 'lucide-vue-next'
import {useRoute,useRouter} from 'vue-router'
import{ElMessage}from'element-plus'
import {api} from '../api/client'
const route=useRoute(),router=useRouter()
const items=[['/','运行总览',ChartNoAxesCombined],['/pids','PID 清单',Tags],['/inventory','授权码管理',Box],['/import','批量导入导出',FileInput],['/ciot-import','CIOT 源导入',CloudDownload],['/adb-writer','ADB 授权写入',Usb],['/allocations','分配记录',Send],['/logs','操作与请求记录',FileClock],['/migration','旧数据库迁移',DatabaseZap]] as const
async function logout(){try{await api('/api/admin/logout',{method:'POST'});await router.replace('/login')}catch(error){ElMessage.error((error as Error).message)}}
</script>
<template><div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-logo">AC</div><div><strong>授权码平台</strong><span>Control Center</span></div></div><nav><router-link v-for="[path,label,Icon] in items" :key="path" :to="path" :class="{active:route.path===path}"><component :is="Icon"/><span>{{label}}</span></router-link></nav><div class="sidebar-user"><div class="avatar">A</div><div><strong>管理员</strong><span>系统管理账号</span></div><button title="退出登录" @click="logout"><LogOut/></button></div></aside><main class="main-content"><router-view/></main></div></template>
