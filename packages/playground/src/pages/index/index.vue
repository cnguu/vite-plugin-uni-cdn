<script setup lang="ts">
import { withCdn } from 'virtual:vite-plugin-uni-cdn'
import { onMounted, ref } from 'vue'

const src = ref('')

onMounted(() => {
  setTimeout(() => {
    src.value = withCdn('/static/cdn/7.png')
  }, 1000)
})
</script>

<template>
  <view>
    <view>首页</view>
    <view class="demo">
      <view>1</view>
      <image src="/static/cdn/1.png" style="width: 200rpx; height: 200rpx" />
    </view>
    <view class="demo">
      <view>2</view>
      <view class="bg-image" />
    </view>
    <view class="demo">
      <view>3</view>
      <view class="bg-image-2" />
    </view>
    <view class="demo">
      <view>4</view>
      <view class="bg-global" />
    </view>
    <view class="demo">
      <view>5</view>
      <view class="bg-global-var" />
    </view>
    <view class="demo">
      <view>6</view>
      <view
        :style="{
          width: '200rpx',
          height: '200rpx',
          backgroundImage: `url('/static/cdn/6.png')`,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }"
      />
    </view>
    <view class="demo">
      <view>7</view>
      <image :src="src" style="width: 200rpx; height: 200rpx" />
    </view>
  </view>
</template>

<style>
.demo {
  display: flex;
  align-items: center;
}

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
