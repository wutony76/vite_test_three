import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: {
      // 多頁面：build 時每個 HTML 都要列出來，否則只會打包 index.html
      // （dev 模式不需要，直接開 /cinema.html 就能用）
      input: {
        main: 'index.html',
        cinema: 'cinema.html',
        product: 'product.html',
        diorama: 'diorama.html',
        house: 'house.html',
        web: 'web.html',
        lights: 'lights.html',
        market: 'market.html',
        drive: 'drive.html',
        world: 'world.html',
      },
    },
  },
})
