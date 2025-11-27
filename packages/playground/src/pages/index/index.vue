<script setup lang="ts">
</script>

<template>
  <view>
    <view>首页</view>
    <image src="/static/cdn/1.png" style="width: 200rpx; height: 200rpx" />
    <view class="bg-image" />
    <view class="bg-image-2" />
    <view class="bg-global" />
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
