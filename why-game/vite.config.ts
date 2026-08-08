import {defineConfig} from 'vite';
export default defineConfig({base:'/why/',build:{outDir:'../why',emptyOutDir:true,target:'es2022',chunkSizeWarningLimit:3000}});
