<script setup lang="ts">
</script>

<template>
  <router-view>

  </router-view>
  <!-- <div>
   
  <Login msg="Vite + Vue" /> -->
</template>

<style scoped>
	page {
	    --safe-area-inset-top: 0px;  
	    --safe-area-inset-right: 0px;  
	    --safe-area-inset-bottom: 0px;  
	    --safe-area-inset-left: 0px;  
	
	}  
	
	@supports (top: constant(safe-area-inset-top)) {  
	    page {  
	        --safe-area-inset-top: constant(safe-area-inset-top);  
	        --safe-area-inset-right: constant(safe-area-inset-right);  
	        --safe-area-inset-bottom: constant(safe-area-inset-bottom);  
	        --safe-area-inset-left: constant(safe-area-inset-left);  
	    }  
	
	}  
	
	@supports (top: env(safe-area-inset-top)) {  
	    page {  
	        --safe-area-inset-top: env(safe-area-inset-top);  
	        --safe-area-inset-right: env(safe-area-inset-right);  
	        --safe-area-inset-bottom: env(safe-area-inset-bottom);  
	        --safe-area-inset-left: env(safe-area-inset-left);  
	    }  
	}
</style>
