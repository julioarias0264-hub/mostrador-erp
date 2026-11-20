import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, readFileSync} from 'node:fs';

mkdirSync('data',{recursive:true});
const db = new DatabaseSync(process.env.DB_PATH || 'data/mostrador.sqlite');
db.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, sku TEXT UNIQUE, name TEXT, price INTEGER CHECK(price>0), stock INTEGER CHECK(stock>=0));
  CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY, name TEXT, phone TEXT);
  CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY, client INTEGER REFERENCES clients(id), total INTEGER, credit INTEGER, date TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS lines(sale INTEGER REFERENCES sales(id), product INTEGER REFERENCES products(id), name TEXT, qty INTEGER, price INTEGER);
  CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, client INTEGER REFERENCES clients(id), amount INTEGER, date TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY, product INTEGER REFERENCES products(id), delta INTEGER, reason TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP);
`);
function transaction(fn){
  db.exec('BEGIN IMMEDIATE');
  try{const value=fn();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
const run=(sql,...args)=>db.prepare(sql).run(...args);
const get=(sql,...args)=>db.prepare(sql).get(...args);
const all=(sql,...args)=>db.prepare(sql).all(...args);
if (!get('SELECT id FROM products LIMIT 1')) transaction(()=>{
  for(const [sku,name,price,stock] of [['CAF-01','Café de olla',3500,24],['PAN-01','Concha de vainilla',1800,18],['BEB-01','Agua mineral',2400,30],['CAF-02','Chocolate caliente',4500,12],['PAN-02','Galleta de avena',2200,4],['BEB-02','Té de jamaica',2800,15]]){
    const id=run('INSERT INTO products(sku,name,price,stock) VALUES(?,?,?,?)',sku,name,price,stock).lastInsertRowid;
    run('INSERT INTO movements(product,delta,reason) VALUES(?,?,?)',id,stock,'Existencia inicial');
  }
});
function check(condition,message){if(!condition)throw new Error(message);}
const integer=(v,min,max=100000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function name(value,max=100){check(typeof value==='string'&&value.trim().length>0&&value.trim().length<=max,'Revisa los campos de texto.');return value.trim();}
function balance(id){
  return get(`SELECT COALESCE((SELECT SUM(credit) FROM sales WHERE client=?),0)
    - COALESCE((SELECT SUM(amount) FROM payments WHERE client=?),0) balance`,id,id).balance;
}
function state(){
  return {
    products:all('SELECT * FROM products ORDER BY id'),
    clients:all('SELECT * FROM clients ORDER BY name').map(c=>({...c,balance:balance(c.id)})),
    sales:all('SELECT sales.*,clients.name clientName FROM sales LEFT JOIN clients ON clients.id=sales.client ORDER BY sales.id DESC').map(s=>({...s,items:all('SELECT * FROM lines WHERE sale=?',s.id)})),
    payments:all('SELECT payments.*,clients.name FROM payments JOIN clients ON clients.id=payments.client ORDER BY payments.id DESC'),
    movements:all('SELECT movements.*,products.name FROM movements JOIN products ON products.id=movements.product ORDER BY movements.id DESC LIMIT 30')
  };
}
const actions={
  '/api/products'(b){
    const sku=name(b.sku,30).toUpperCase(), label=name(b.name);
    check(integer(b.price,1)&&integer(b.stock,0,100000),'Revisa precio y existencia.');
    const product=b.id?get('SELECT * FROM products WHERE id=?',b.id):null;
    check(!b.id||product,'Producto no encontrado.');
    const duplicate=get('SELECT id FROM products WHERE sku=?',sku);
    check(!duplicate||duplicate.id===product?.id,'El código de producto ya existe.');
    const id=product?.id??run('INSERT INTO products(sku,name,price,stock) VALUES(?,?,?,?)',sku,label,b.price,b.stock).lastInsertRowid;
    if(product)run('UPDATE products SET sku=?,name=?,price=?,stock=? WHERE id=?',sku,label,b.price,b.stock,id);
    const delta=b.stock-(product?.stock??0);
    if(delta)run('INSERT INTO movements(product,delta,reason) VALUES(?,?,?)',id,delta,product?'Ajuste de inventario':'Existencia inicial');
    return {id};
  },
  '/api/clients'(b){
    const label=name(b.name), phone=typeof b.phone==='string'?b.phone.trim().slice(0,30):'';
    if(b.id){
      check(get('SELECT id FROM clients WHERE id=?',b.id),'Cliente no encontrado.');
      run('UPDATE clients SET name=?,phone=? WHERE id=?',label,phone,b.id);
      return {id:b.id};
    }
    return {id:run('INSERT INTO clients(name,phone) VALUES(?,?)',label,phone).lastInsertRowid};
  },
  '/api/sales'(b){
    check(Array.isArray(b.items)&&b.items.length>0&&b.items.length<=100,'Agrega productos a la venta.');
    const client=b.client??null;
    if(client!==null)check(integer(client,1)&&get('SELECT id FROM clients WHERE id=?',client),'Selecciona un cliente válido.');
    const ids=new Set();
    const items=b.items.map(({id,qty})=>{
      check(integer(id,1)&&integer(qty,1,100000)&&!ids.has(id),'Revisa las cantidades.');
      ids.add(id);
      const product=get('SELECT * FROM products WHERE id=?',id);
      check(product&&product.stock>=qty,'Existencia insuficiente para completar la venta.');
      return {...product,qty};
    });
    const total=items.reduce((sum,i)=>sum+i.price*i.qty,0);
    const paid=b.paid??total;
    check(integer(paid,0,total),'El pago inicial no puede exceder el total.');
    check(paid===total||client!==null,'Selecciona un cliente para vender a crédito.');
    const id=run('INSERT INTO sales(client,total,credit) VALUES(?,?,?)',client,total,total-paid).lastInsertRowid;
    for(const i of items){
      run('UPDATE products SET stock=stock-? WHERE id=?',i.qty,i.id);
      run('INSERT INTO lines VALUES(?,?,?,?,?)',id,i.id,i.name,i.qty,i.price);
      run('INSERT INTO movements(product,delta,reason) VALUES(?,?,?)',i.id,-i.qty,'Venta #'+id);
    }
    return {id};
  },
  '/api/payments'(b){
    check(integer(b.client,1)&&get('SELECT id FROM clients WHERE id=?',b.client),'Cliente no encontrado.');
    check(integer(b.amount,1,balance(b.client)),'El abono debe ser mayor a cero y no exceder el saldo.');
    return {id:run('INSERT INTO payments(client,amount) VALUES(?,?)',b.client,b.amount).lastInsertRowid};
  }
};
const files={'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  try {
    if(req.method==='GET'&&path==='/api/state')return json(res,200,state());
    if(req.method==='GET'&&Object.hasOwn(files,path)){
      const [file,type]=files[path];const content=readFileSync('public/'+file);
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff'});
      return res.end(content);
    }
    if(req.method==='POST'&&Object.hasOwn(actions,path)){
      if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Se requiere JSON.'});
      let body='';
      for await(const chunk of req){body+=chunk;if(body.length>65536)return json(res,413,{error:'Solicitud demasiado grande.'});}
      const data=JSON.parse(body);
      check(data&&typeof data==='object'&&!Array.isArray(data),'Revisa el contenido de la solicitud.');
      return json(res,201,transaction(()=>actions[path](data)));
    }
    return json(res,404,{error:'Ruta no encontrada.'});
  }catch(error){
    if(error.code?.startsWith('ERR_SQLITE')){console.error(error);return json(res,500,{error:'No se pudo guardar el movimiento.'});}
    json(res,400,{error:error instanceof SyntaxError?'JSON inválido.':error.message});
  }
}).listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Mostrador listo'));
