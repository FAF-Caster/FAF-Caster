import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
 plugins:[react()],
 server:{
  host:'127.0.0.1',
  port:5173,
  proxy:{
   '/local-api':{
    target:'http://127.0.0.1:5077',
    rewrite:path=>path.replace(/^\/local-api/,'/api')
   },
   '/local-ws':{
    target:'ws://127.0.0.1:5077',
    ws:true,
    rewrite:path=>path.replace(/^\/local-ws/,'/ws')
   }
  }
 },
 build:{outDir:'dist'}
});
