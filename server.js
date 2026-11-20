import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import handler from './application.js';

const files={'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&Object.hasOwn(files,path)){
    const [file,type]=files[path];
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff'});
    return res.end(readFileSync('public/'+file));
  }
  return handler(req,res);
}).listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Mostrador listo'));
