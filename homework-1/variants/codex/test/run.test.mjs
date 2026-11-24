import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
const freePort = async () => {
  const server=net.createServer(); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const port=server.address().port; await new Promise(resolve=>server.close(resolve)); return port;
};
test('run.sh serves API and UI on configured ports, handles malformed URL, then shuts both down', async()=>{
  const apiPort=await freePort(),uiPort=await freePort();
  const child=spawn('./run.sh',[],{env:{...process.env,API_PORT:String(apiPort),UI_PORT:String(uiPort),API_BASE_URL:`http://127.0.0.1:${apiPort}`},stdio:['ignore','pipe','pipe']});
  let output=''; child.stdout.on('data',chunk=>{output+=chunk;}); child.stderr.on('data',chunk=>{output+=chunk;});
  try {
    const deadline=Date.now()+5000;
    while(!output.includes('UI ready')||!output.includes('API ready')) { if(Date.now()>deadline) throw Error(output); await new Promise(r=>setTimeout(r,20)); }
    const root=`http://127.0.0.1:${uiPort}`;
    assert.match(await (await fetch(root)).text(),/Transaction history/);
    assert.match(await (await fetch(root+'/config.js')).text(),new RegExp(`http://127.0.0.1:${apiPort}`));
    assert.equal((await fetch(root+'/fonts/plex-regular.ttf')).status,200);
    assert.equal((await fetch(root+'/missing')).status,404);
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${apiPort}/transactions`)).json(),[]);
    const raw=await new Promise((resolve,reject)=>{
      let body='';const socket=net.connect(uiPort,'127.0.0.1',()=>socket.end('GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));
      socket.on('data',chunk=>{body+=chunk;});socket.on('end',()=>resolve(body));socket.on('error',reject);
    });
    assert.match(raw,/400 Bad Request/);
    assert.equal((await fetch(root)).status,200);
    assert.equal((await fetch(`http://127.0.0.1:${apiPort}/health`)).status,200);
  } finally {
    child.kill('SIGTERM'); await once(child,'exit');
  }
  await assert.rejects(fetch(`http://127.0.0.1:${apiPort}/health`));
  await assert.rejects(fetch(`http://127.0.0.1:${uiPort}/`));
});
