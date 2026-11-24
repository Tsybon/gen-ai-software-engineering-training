import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { createApiServer } from '../api/server.mjs';

const waitFor = async (predicate) => {
  const deadline=Date.now()+6000;
  while(!predicate()) { if(Date.now()>deadline) throw new Error('Timed out waiting for UI update'); await new Promise(resolve=>setTimeout(resolve,15)); }
};
const submit = (window, form) => form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
test('UI integrates with real API: validation, create, details, search, filters, balances, demo and recovery',async()=>{
  const api=createApiServer(); await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${api.address().port}`;
  const window=new Window({url:'http://localhost:5101',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  const $=id=>window.document.getElementById(id);
  try {
    const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
    window.document.write(html.replace(/<script[^>]*>.*?<\/script>/gs,''));
    window.APP_CONFIG={apiBaseUrl:url};
    let offline=false;
    window.fetch=(...args)=>offline ? Promise.reject(new Error('offline')) : fetch(...args);
    window.AbortSignal=AbortSignal;
    // DOM simulation has no native modal focus management. Browser tests cover that separately.
    window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    window.eval(await readFile(new URL('../public/app.js',import.meta.url),'utf8'));
    await waitFor(()=>$('connection').textContent==='API connected');
    assert.equal($('total-count').textContent,'0');
    $('create').click(); submit(window,$('transaction-form'));
    await waitFor(()=>$('submit-transaction').disabled===false);
    assert.match(window.document.querySelector('[data-error=amount]').textContent,/positive/);
    $('create-type').value='deposit'; $('create-type').dispatchEvent(new window.Event('change'));
    $('transaction-form').elements.toAccount.value='ACC-TEST1';
    $('transaction-form').elements.amount.value='120.45';
    submit(window,$('transaction-form'));
    await waitFor(()=>$('total-count').textContent==='1');
    assert.equal($('create-dialog').open,false);
    assert.match($('transactions').textContent,/120.45/);
    $('balance-account').value='ACC-TEST1'; submit(window,$('balance-form'));
    await waitFor(()=>$('balance-result').textContent.includes('120.45'));
    $('transactions').querySelector('[data-detail]').click();
    await waitFor(()=>$('details-content').textContent.includes('ACC-TEST1'));
    assert.match($('details-content').textContent,/Applied/);
    $('details-dialog').querySelector('.close-dialog').click();
    $('search').value='NO-MATCH'; $('search').dispatchEvent(new window.Event('input'));
    assert.equal($('transactions').children.length,0);
    assert.match($('empty').textContent,/No matching/);
    $('clear-filters').click(); await waitFor(()=>$('transactions').children.length===1);
    $('demo').click(); await waitFor(()=>$('demo').textContent==='Demo data loaded');
    assert.equal(window.document.querySelectorAll('.demo-label').length,8);
    assert.equal($('failed-count').textContent,'1');
    assert.equal($('pending-count').textContent,'1');
    $('account-filter').value='ACC-10002'; $('type-filter').value='transfer'; submit(window,$('filters'));
    await waitFor(()=>$('transactions').children.length===1);
    assert.match($('transactions').textContent,/2,340.50/);
    $('account-filter').value='invalid'; submit(window,$('filters'));
    await waitFor(()=>!$('filter-error').hidden);
    assert.match($('filter-error').textContent,/ACC-XXXXX/);
    offline=true; $('clear-filters').click();
    await waitFor(()=>!$('api-error').hidden);
    $('create').click(); submit(window,$('transaction-form'));
    await waitFor(()=>!$('create-error').hidden && !$('submit-transaction').disabled);
    assert.match($('create-error').textContent,/unreachable/);
    offline=false; $('retry').click(); await waitFor(()=>$('api-error').hidden);
    assert.equal($('connection').textContent,'API connected');
    $('create-dialog').querySelector('.close-dialog').click();
    // A slow response for a closed detail view must not overwrite a newer view.
    const records=await (await fetch(url+'/transactions')).json();
    let releaseDetails;
    window.fetch=async (...args)=>{
      const response=await fetch(...args);
      if(String(args[0]).endsWith('/'+records[0].id)) await new Promise(resolve=>{releaseDetails=resolve;});
      return response;
    };
    $('transactions').querySelector(`[data-detail="${records[0].id}"]`).click();
    await waitFor(()=>releaseDetails);
    $('details-dialog').querySelector('.close-dialog').click();
    $('transactions').querySelector(`[data-detail="${records[1].id}"]`).click();
    await waitFor(()=>$('details-content').textContent.includes(records[1].id));
    releaseDetails(); await new Promise(resolve=>setTimeout(resolve,30));
    assert.ok($('details-content').textContent.includes(records[1].id));
    $('details-dialog').querySelector('.close-dialog').click();
    // A previous submission cannot close/reset a newly opened form.
    let releaseCreate;
    window.fetch=async (...args)=>{
      const response=await fetch(...args);
      if(args[1]?.method==='POST') await new Promise(resolve=>{releaseCreate=resolve;});
      return response;
    };
    $('create').click(); $('create-type').value='deposit';
    $('create-type').dispatchEvent(new window.Event('change'));
    $('transaction-form').elements.toAccount.value='ACC-TEST2';
    $('transaction-form').elements.amount.value='5';
    submit(window,$('transaction-form')); await waitFor(()=>releaseCreate);
    $('create-dialog').querySelector('.close-dialog').click(); $('create').click();
    $('transaction-form').elements.amount.value='99';
    releaseCreate(); await waitFor(()=>$('total-count').textContent==='10');
    assert.equal($('create-dialog').open,true);
    assert.equal($('transaction-form').elements.amount.value,'99');
    await waitFor(()=>!$('submit-transaction').disabled && !$('refresh').disabled);
  } finally { await window.happyDOM.close(); await new Promise(resolve=>api.close(resolve)); }
});
