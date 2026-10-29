import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './store.mjs';

test('venta persistente, reintento idempotente y stock sin cambios ante error',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mostrador-'));let store=openStore(join(dir,'test.sqlite'));
 try {
  store.addProduct({name:'Alfajor',price:150050,stock:3});
  store.addProduct({name:'Agua',price:100000,stock:0});
  const products=store.products(),p=products.find(p=>p.name==='Alfajor'),empty=products.find(p=>p.name==='Agua');
  const sale={id:'venta-1',lines:[{productId:p.id,quantity:2}]};
  assert.equal(store.sell(sale).total,300100);store.sell(sale);
  assert.equal(store.products().find(x=>x.id===p.id).stock,1);assert.equal(store.sales().length,1);
  assert.throws(()=>store.sell({...sale,lines:[{productId:p.id,quantity:1}]}));
  assert.throws(()=>store.sell({id:'venta-2',lines:[{productId:p.id,quantity:1},{productId:empty.id,quantity:1}]}));
  assert.equal(store.products().find(x=>x.id===p.id).stock,1);assert.equal(store.sales().length,1);
  store.close();store=openStore(join(dir,'test.sqlite'));assert.equal(store.sales()[0].total,300100);assert.equal(store.products().find(x=>x.id===p.id).stock,1);
 } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
