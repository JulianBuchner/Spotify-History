import { createApp } from 'vue'
import App from './App.vue'

import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          background: '#0b141b',
          surface:    '#121a21',
          primary:    '#00BBFF'
          // primary:    '#27e38b'
        }
      }
    }
  }
})

createApp(App).use(vuetify).mount('#app')