import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0), stock INTEGER NOT NULL CHECK(stock>=0));
    CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY, created TEXT NOT NULL, total INTEGER NOT NULL, request TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items(sale_id TEXT REFERENCES sales(id), product_id TEXT REFERENCES products(id), name TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL);
    `);
  if (!db.prepare('PRAGMA table_info(products)').all().some(column => column.name === 'active')) {
    db.exec('ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))');
  }
  db.exec('PRAGMA user_version=2');
  function validateProduct({ name, price, stock }) {
    if (typeof name !== 'string' || !name.trim() || name.length > 120 || !Number.isSafeInteger(price) || price <= 0 || price > 100000000000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000000) throw Error('Revisá nombre, precio y stock.');
  }
  return {
    close: () => db.close(),
    products: () => db.prepare('SELECT * FROM products ORDER BY name').all(),
    sales: () => db.prepare('SELECT id,created,total FROM sales ORDER BY created DESC LIMIT 50').all(),
    addProduct({ name, price, stock }) {
      validateProduct({ name, price, stock });
      db.prepare('INSERT INTO products(id,name,price,stock) VALUES(?,?,?,?)').run(randomUUID(), name.trim(), price, stock);
    },
    updateProduct({ id, name, price, stock }) {
      validateProduct({ name, price, stock });
      if (typeof id !== 'string') throw Error('Producto inválido.');
      const result = db.prepare('UPDATE products SET name=?,price=?,stock=? WHERE id=?').run(name.trim(),price,stock,id);
      if (!result.changes) throw Error('El producto no existe.');
    },
    setProductActive({ id, active }) {
      if (typeof id !== 'string' || typeof active !== 'boolean') throw Error('Producto inválido.');
      const result = db.prepare('UPDATE products SET active=? WHERE id=?').run(Number(active),id);
      if (!result.changes) throw Error('El producto no existe.');
    },
    sell({ id, lines }) {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || !Array.isArray(lines) || !lines.length || lines.length > 500) throw Error('Venta inválida.');
      const seen = new Set();
      for (const line of lines) {
        if (typeof line.productId !== 'string' || seen.has(line.productId) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw Error('Detalle inválido.');
        seen.add(line.productId);
      }
      const request = JSON.stringify([...lines].sort((a,b)=>a.productId.localeCompare(b.productId)).map(x=>[x.productId,x.quantity]));
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous = db.prepare('SELECT * FROM sales WHERE id=?').get(id);
        if (previous) {
          if (previous.request !== request) throw Error('El identificador corresponde a otra venta.');
          db.exec('COMMIT');
          return { id, total: previous.total };
        }
        let total = 0;
        const items = lines.map(line => {
          const p = db.prepare('SELECT * FROM products WHERE id=?').get(line.productId);
          if (p && !p.active) throw Error('La venta contiene un producto dado de baja. Quitalo del carrito.');
          if (!p || p.stock < line.quantity) throw Error('Stock insuficiente. Actualizá los productos.');
          total += p.price * line.quantity;
          if (!Number.isSafeInteger(total)) throw Error('Importe fuera de rango.');
          return { ...p, quantity: line.quantity };
        });
        db.prepare('INSERT INTO sales VALUES(?,?,?,?)').run(id, new Date().toISOString(), total, request);
        for (const p of items) {
          db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(p.quantity,p.id);
          db.prepare('INSERT INTO items VALUES(?,?,?,?,?)').run(id,p.id,p.name,p.price,p.quantity);
        }
        db.exec('COMMIT');
        return { id, total };
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}
