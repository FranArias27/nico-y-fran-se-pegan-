import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './store.mjs';
import { DatabaseSync } from 'node:sqlite';

test('migra productos existentes y permite modificar, dar de baja y reactivar conservando ventas',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mostrador-abml-')),path=join(dir,'test.sqlite');
 const old=new DatabaseSync(path);
 old.exec("CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL); INSERT INTO products VALUES('original','Alfajor',150000,10); PRAGMA user_version=1;");old.close();
 const store=openStore(path);
 try{
  assert.equal(store.products()[0].active,1);
  const sale={id:'venta-original',lines:[{productId:'original',quantity:1}]};
  store.sell(sale);
  store.updateProduct({id:'original',name:'Alfajor triple',price:200000,stock:8});
  assert.equal(store.products()[0].name,'Alfajor triple');
  assert.throws(()=>store.updateProduct({id:'original',name:'',price:200000,stock:8}));
  assert.equal(store.products()[0].price,200000);
  store.setProductActive({id:'original',active:false});
  assert.equal(store.products()[0].active,0);
  assert.throws(()=>store.sell({id:'venta-baja',lines:sale.lines}));
  assert.equal(store.products()[0].stock,8);
  assert.equal(store.sell(sale).total,150000);
  const inspect=new DatabaseSync(path);const item=inspect.prepare('SELECT * FROM items WHERE sale_id=?').get(sale.id);inspect.close();
  assert.equal(item.name,'Alfajor');assert.equal(item.price,150000);
  store.setProductActive({id:'original',active:true});
  assert.equal(store.sell({id:'venta-reactivada',lines:sale.lines}).total,200000);
  assert.equal(store.products()[0].stock,7);
  assert.throws(()=>store.setProductActive({id:'no-existe',active:false}));
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

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
