import {defineConfig} from 'vite';

export default defineConfig({
  base:'/chaharbagh/',
  build:{
    outDir:'../chaharbagh',
    emptyOutDir:true,
    target:'es2022',
    sourcemap:false
  }
});
