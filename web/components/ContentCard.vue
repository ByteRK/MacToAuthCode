<script setup lang="ts">defineProps<{title?:string;description?:string}>()</script>
<template><section class="content-card"><header v-if="title" class="card-header"><div><h2>{{title}}</h2><p v-if="description">{{description}}</p></div><slot name="actions"/></header><slot/></section></template>
