<template>
  <transition name="fade">
    <div v-if="visible" class="toast-wrapper">
      <div class="toast-content">
        {{ message }}
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
const message = ref('')

const show = (msg: string, duration = 2000) => {
  message.value = msg
  visible.value = true
  setTimeout(() => {
    visible.value = false
  }, duration)
}

defineExpose({
  show
})
</script>

<style scoped>
.toast-wrapper {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
}

.toast-content {
  padding: 12px 24px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  border-radius: 4px;
  font-size: 14px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style> 