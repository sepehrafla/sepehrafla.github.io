import {defineConfig} from 'vite';
export default defineConfig({base:'/centaur/',build:{outDir:'../centaur',emptyOutDir:true,target:'es2022',chunkSizeWarningLimit:3000}});
