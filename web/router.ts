import { createRouter,createWebHistory } from 'vue-router'
import LoginView from './views/LoginView.vue'
import AppLayout from './layouts/AppLayout.vue'
export const router=createRouter({history:createWebHistory(),routes:[{path:'/login',component:LoginView},{path:'/',component:AppLayout,children:[
  {path:'',component:()=>import('./views/OverviewView.vue')},
  {path:'pids',component:()=>import('./views/PidManagementView.vue')},
  {path:'production-counters',component:()=>import('./views/ProductionCountersView.vue')},
  {path:'inventory',component:()=>import('./views/InventoryView.vue')},
  {path:'import',component:()=>import('./views/ImportView.vue')},
  {path:'ciot-import',component:()=>import('./views/CiotImportView.vue')},
  {path:'adb-writer',component:()=>import('./views/AdbWriterView.vue')},
  {path:'allocations',component:()=>import('./views/AllocationsView.vue')},
  {path:'logs',component:()=>import('./views/LogsView.vue')},
  {path:'migration',component:()=>import('./views/MigrationView.vue')},
]}]})
