import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router/index'
import { initDataSource } from './services/datasource'
import VueUeditorWrap from 'vue-ueditor-wrap'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
})

const appVue = createApp(App)

//import uviewPlus from 'uview-plus'
//globalThis.uni = appVue
//appVue.use(uviewPlus)
// #ifdef VUE3
console.log('VUE3')
// #endif

appVue.use(VueUeditorWrap)
appVue.use(router)
appVue.use(vuetify)
appVue.use(ElementPlus)
appVue.mount('#app')

initDataSource()

