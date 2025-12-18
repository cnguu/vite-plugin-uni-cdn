<script setup lang="ts">
import { withCdn } from 'virtual:vite-plugin-uni-cdn'
import { onMounted, ref } from 'vue'

const src = ref('')

onMounted(() => {
  setTimeout(() => {
    src.value = withCdn('/static/cdn/5.png')
  }, 1000)
})
</script>

<template>
  <view>
    <view>首页</view>
    <image src="/static/cdn/1.png" style="width: 200rpx; height: 200rpx" />
    <view class="bg-image" />
    <view class="bg-image-2" />
    <view class="bg-global" />
    <view
      :style="{
        width: '200rpx',
        height: '200rpx',
        backgroundImage: `url('/static/cdn/4.png')`,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }"
    />
    <image :src="src" style="width: 200rpx; height: 200rpx" />
  </view>
</template>

<style>
.bg-image {
  width: 200rpx;
  height: 200rpx;
  background-image: url("/static/cdn/2.png");
  background-position: center;
  background-repeat: no-repeat;
}
</style>

<style lang="scss">
@import "index";
</style>
