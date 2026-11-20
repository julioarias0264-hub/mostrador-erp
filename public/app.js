const view=document.querySelector('#view');
const dialog=document.querySelector('#modal'), form=document.querySelector('#form');
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n/100);
const cents=x=>Math.round(Number(x)*100);
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moment=s=>new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short'}).format(new Date(s.replace(' ','T')+'Z'));
const labels={
  caja:['Punto de venta','Agrega productos y registra el cobro de la venta.'],
  inventario:['Inventario','Consulta existencias, ajusta cantidades y revisa movimientos.'],
  clientes:['Clientes y abonos','Controla ventas a crédito, saldos y pagos recibidos.'],
  ventas:['Historial de ventas','Consulta folios, productos vendidos e importes.']
};
document.querySelector('#date').textContent=new Intl.DateTimeFormat('es-MX',{dateStyle:'long'}).format(new Date());
let authorization;
let data, route, query='', client='', mode='cash', deposit='', noticeTimer, busy=false;
const cart=new Map();
async function api(path,body){
  const headers=authorization?{Authorization:authorization}:{};
  const options={headers};
  if(body!==undefined){
    headers['Content-Type']='application/json';
    options.method='POST';
    options.body=JSON.stringify(body);
  }
  const response=await fetch('/api/'+path,options);
  const payload=await response.json();
  if(!response.ok){
    const error=new Error(payload.error);
    error.status=response.status;
    throw error;
  }
  return payload;
}
function notify(text){
  const toast=document.querySelector('#toast');
  toast.textContent=text;clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>toast.textContent='',4100);
}
function rows(items,render,empty,cols){
  return items.length?items.map(render).join(''):`<tr><td colspan="${cols}" class="muted">${empty}</td></tr>`;
}
function table(headers,body){
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col" class="${h.startsWith('$')?'number':''}">${h.replace(/^\$/,'')}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function panel(title,body,action=''){
  return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${action}</div>${body}</section>`;
}
const btn=(label,action,id='',cls='',disabled=false)=>`<button type="button" class="${cls}" data-action="${action}" data-id="${id}" ${disabled?'disabled':''}>${label}</button>`;
const stock=p=>`<span class="badge ${p.stock<=5?'low':''}">${p.stock===0?'Agotado':p.stock<=5?`${p.stock} · Bajo`:p.stock}</span>`;
function catalog(){
  const terms=query.trim().toLowerCase();
  const matches=data.products.filter(p=>`${p.name} ${p.sku}`.toLowerCase().includes(terms));
  if (!matches.length) return '<p class="catalog-empty" role="status">No encontramos productos con esa búsqueda.</p>';
  return `<ul class="product-grid">${matches.map(p=>{
    const count=cart.get(p.id)||0;
    const label=p.stock===0?'Agotado':count>=p.stock?'Sin más unidades':'Agregar';
    return `<li class="product-card">
      <div class="product-meta"><span>${e(p.sku)}</span>${stock(p)}</div>
      <h3>${e(p.name)}</h3>
      <strong class="product-price">${money(p.price)}</strong>
      ${count?`<span class="in-cart">${count} en esta venta</span>`:''}
      ${btn(label,'add',p.id,'product-add',busy||count>=p.stock)}
    </li>`;
  }).join('')}</ul>`;
}
function basket(){
  const chosen=data.products.filter(p=>cart.has(p.id));
  const total=chosen.reduce((n,p)=>n+p.price*cart.get(p.id),0);
  const quantity=[...cart.values()].reduce((a,b)=>a+b,0);
  return `<section class="panel basket"><div class="panel-head"><h2>Venta actual</h2><span class="muted">${quantity} ${quantity===1?'artículo':'artículos'}</span></div><div class="panel-body">
  <div>${chosen.map(p=>`<div class="cart-line"><strong>${e(p.name)}</strong><strong>${money(p.price*cart.get(p.id))}</strong><div>${btn('−','minus',p.id,'qty',busy)} ${cart.get(p.id)} ${btn('+','add',p.id,'qty',busy||cart.get(p.id)>=p.stock)}</div><small>${money(p.price)} c/u</small></div>`).join('')||'<p class="empty">Agrega un producto del catálogo.</p>'}</div>
  <label>Cliente<select id="client"><option value="">Público general</option>${data.clients.map(c=>`<option value="${c.id}" ${String(c.id)===client?'selected':''}>${e(c.name)}</option>`).join('')}</select></label>
  <label>Tipo de cobro<select id="mode"><option value="cash">Contado</option><option value="credit" ${mode==='credit'?'selected':''}>Crédito</option></select></label>
  ${mode==='credit'? `<label>Pago inicial (MXN)<input id="deposit" type="number" min="0" max="${total/100}" step=".01" value="${e(deposit)}" placeholder="0.00"></label>` : ''}
  <div class="total" aria-live="polite"><span>Total</span><strong>${money(total)}</strong></div>
  ${btn(busy?'Registrando…':'Registrar venta','checkout','','primary',!chosen.length||busy)}</div></section>`;
}
function inventory(){
  const products=table(['Código','Producto','$Precio','Existencia','Acción'],rows(data.products,p=>`<tr><td>${e(p.sku)}</td><td>${e(p.name)}</td><td class="number">${money(p.price)}</td><td>${stock(p)}</td><td>${btn('Editar','product',p.id)}</td></tr>`,'Sin productos registrados.',5));
  const moves=table(['Fecha','Producto','Movimiento','Motivo'],rows(data.movements,m=>`<tr><td>${moment(m.date)}</td><td>${e(m.name)}</td><td>${m.delta>0?'+':''}${m.delta}</td><td>${e(m.reason)}</td></tr>`,'Sin movimientos.',4));
  return '<div class="summary"><span>Productos<strong>'+data.products.length+'</strong></span><span>Unidades en existencia<strong>'+data.products.reduce((a,p)=>a+p.stock,0)+'</strong></span><span>Productos con stock bajo<strong>'+data.products.filter(p=>p.stock<=5).length+'</strong></span></div>'+panel('Productos',products)+'<div class="section-gap">'+panel('Movimientos recientes',moves)+'</div>';
}
function customers(){
  const clients=table(['Cliente','Teléfono','$Saldo','Acciones'],rows(data.clients,c=>`<tr><td><strong>${e(c.name)}</strong></td><td>${e(c.phone)||'—'}</td><td class="number">${money(c.balance)}</td><td>${btn('Editar','client',c.id)} ${btn('Abonar','payment',c.id,'',!c.balance)}</td></tr>`,'Registra un cliente para llevar su cuenta de crédito.',4));
  const payments=table(['Fecha','Cliente','$Abono'],rows(data.payments,p=>`<tr><td>${moment(p.date)}</td><td>${e(p.name)}</td><td class="number">${money(p.amount)}</td></tr>`,'Todavía no hay abonos registrados.',3));
  return '<div class="summary"><span>Saldo por cobrar<strong>'+money(data.clients.reduce((sum,c)=>sum+c.balance,0))+'</strong></span></div>'+panel('Directorio de clientes',clients)+'<div class="section-gap">'+panel('Historial de abonos',payments)+'</div>';
}
const ticketDialog=document.querySelector('#ticket-dialog');
document.querySelector('#ticket-close').onclick=()=>ticketDialog.close();
document.querySelector('#ticket-print').onclick=()=>window.print();

function openTicket(id){
  const sale=data.sales.find(record=>record.id===id);
  if(!sale){notify('No se encontró el ticket. Actualiza la página.');return;}
  document.querySelector('#ticket').innerHTML=`
    <header class="ticket-header">
      <h2 id="ticket-title">Mostrador</h2>
      <p>Ticket de venta #${sale.id}</p>
      <small>${moment(sale.date)}</small>
    </header>
    <p class="ticket-client">Cliente: ${e(sale.clientName||'Público general')}</p>
    <table><thead><tr><th scope="col">Producto</th><th scope="col" class="number">Importe</th></tr></thead><tbody>
      ${sale.items.map(item=>`<tr><td><strong>${e(item.name)}</strong><small>${item.qty} × ${money(item.price)}</small></td><td class="number">${money(item.qty*item.price)}</td></tr>`).join('')}
    </tbody></table>
    <dl class="ticket-totals">
      <div><dt>Total</dt><dd>${money(sale.total)}</dd></div>
      <div><dt>Cobrado al vender</dt><dd>${money(sale.total-sale.credit)}</dd></div>
      ${sale.credit?`<div><dt>Crédito de esta venta</dt><dd>${money(sale.credit)}</dd></div>`:''}
    </dl>
    <p class="ticket-note">Comprobante de venta sin validez fiscal</p>`;
  if(!ticketDialog.open)ticketDialog.showModal();
}

function history(){
  const sales=table(['Folio y fecha','Cliente','Productos','$Total','$Cobro inicial','$Crédito','Ticket'],rows(data.sales,s=>`<tr><td><strong>#${s.id}</strong><small>${moment(s.date)}</small></td><td>${e(s.clientName||'Público general')}</td><td>${s.items.map(i=>`${i.qty} × ${e(i.name)}`).join('<br>')}</td><td class="number">${money(s.total)}</td><td class="number">${money(s.total-s.credit)}</td><td class="number">${money(s.credit)}</td><td>${btn('Ver ticket','ticket',s.id)}</td></tr>`,'Registra una venta para verla aquí.',7));
  return panel('Ventas registradas',sales);
}
function render(){
  const hash=location.hash.slice(1);
  route=Object.hasOwn(labels,hash)?hash:'caja';
  document.querySelectorAll('nav a').forEach(a=>a.getAttribute('href')==='#'+route?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  const [title,subtitle]=labels[route];
  const action=route==='inventario'?btn('Nuevo producto','product','','primary'):route==='clientes'?btn('Nuevo cliente','client','','primary'):'';
  const contents={caja:()=>`<div class="pos">${panel('Catálogo','<div id="catalog">'+catalog()+'</div>',`<input class="search" id="search" aria-label="Buscar por nombre o código" placeholder="Buscar por nombre o código" value="${e(query)}">`)}<div id="basket">${basket()}</div></div>`,inventario:inventory,clientes:customers,ventas:history};
  view.innerHTML=`<div class="heading"><div><h1>${title}</h1><p class="lead">${subtitle}</p></div>${action}</div>${contents[route]()}`;
  view.setAttribute('aria-busy','false');
}
function refreshBasket(){
  document.querySelector('#catalog').innerHTML=catalog();
  document.querySelector('#basket').innerHTML=basket();
}
function openForm(type,id){
  const p=data.products.find(p=>p.id===id),c=data.clients.find(c=>c.id===id);
  const fields={
    product:`<label>Código<input name="sku" maxlength="30" required value="${e(p?.sku)}"></label><label>Nombre<input name="name" maxlength="100" required value="${e(p?.name)}"></label><label>Precio (MXN)<input name="price" required type="number" min=".01" max="1000000" step=".01" value="${p?p.price/100:''}"></label><label>Existencia<input name="stock" required type="number" min="0" max="100000" value="${p?.stock??0}"></label>`,
    client:`<label>Nombre<input name="name" maxlength="100" required value="${e(c?.name)}"></label><label>Teléfono<input name="phone" type="tel" maxlength="30" value="${e(c?.phone)}"></label>`,
    payment:c?`<p>${e(c.name)} · saldo pendiente <strong>${money(c.balance)}</strong></p><label>Importe (MXN)<input name="amount" required type="number" min=".01" max="${c.balance/100}" step=".01"></label>`:''
  };
  const title=type==='payment'?'Registrar abono':type==='product'?(id?'Editar producto':'Nuevo producto'):(id?'Editar cliente':'Nuevo cliente');
  form.innerHTML=`<h2 id="dialog-title">${title}</h2>${fields[type]}<p class="error" role="alert"></p><div class="actions"><button type="button" id="cancel">Cancelar</button><button class="primary" type="submit">Guardar</button></div>`;
  dialog.setAttribute('aria-labelledby','dialog-title');
  form.querySelector('#cancel').onclick=()=>dialog.close();
  form.onsubmit=async event=>{
    event.preventDefault();
    const save=form.querySelector('[type=submit]');
    const values=Object.fromEntries(new FormData(form));
    if(type==='payment'){values.amount=cents(values.amount);values.client=id;}
    if(type==='product'){values.price=cents(values.price);values.stock=Number(values.stock);}
    if(type!=='payment'&&id)values.id=id;
    save.disabled=true;
    try{await api(({product:'products',client:'clients',payment:'payments'})[type],values);}
    catch(error){form.querySelector('.error').textContent=error.message;save.disabled=false;return;}
    dialog.close();
    await reload('Movimiento guardado.');
  };
  dialog.showModal();
}
async function reload(message){
  try{data=await api('state');render();if(message)notify(message);}
  catch{notify('No se pudo actualizar la vista. Recarga la página.');}
}
view.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='search'){query=el.value;document.querySelector('#catalog').innerHTML=catalog();}
  if(el.id==='deposit')deposit=el.value;
});
view.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='client')client=el.value;
  if(el.id==='mode'){mode=el.value;document.querySelector('#basket').innerHTML=basket();document.querySelector('#mode').focus();}
});
view.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');
  if(!target)return;
  const {action}=target.dataset,id=Number(target.dataset.id);
  if(action==='add'||action==='minus'){
    const p=data.products.find(p=>p.id===id);
    if(busy||!p)return;
    const next=(cart.get(id)||0)+(action==='add'?1:-1);
    if(next>p.stock)return;
    if(next<=0)cart.delete(id);else cart.set(id,next);
    refreshBasket();
    const replacement=[...view.querySelectorAll('[data-action="'+action+'"][data-id="'+id+'"]')].find(b=>!b.disabled);
    (replacement||document.querySelector('#search')).focus({preventScroll:true});
    return;
  }
  if(action==='ticket'){openTicket(id);return;}
  if(action!=='checkout'){openForm(action,id);return;}
  if(busy||!cart.size)return;
  if(mode==='credit'&&!client){notify('Selecciona un cliente para la venta a crédito.');document.querySelector('#client').focus();return;}
  if(mode==='credit'&&!document.querySelector('#deposit').reportValidity())return;
  busy=true;refreshBasket();
  try{
    const sale=await api('sales',{client:client?Number(client):null,items:[...cart].map(([id,qty])=>({id,qty})),paid:mode==='credit'?cents(deposit):undefined});
    cart.clear();client='';mode='cash';deposit='';busy=false;
    await reload('Venta #'+sale.id+' registrada.');
    openTicket(sale.id);
  }catch(error){busy=false;if(route==='caja')refreshBasket();notify(error.message);}
});
window.addEventListener('hashchange',()=>{if(data)render();});
async function start(){
  try{data=await api('state');render();}
  catch(error){
    view.setAttribute('aria-busy','false');
    if(error.status!==401){
      view.innerHTML='<p role="alert">No se pudo conectar con Mostrador. Recarga la página para reintentar.</p>';
      return;
    }
    view.innerHTML='<section class="panel panel-body"><form id="access"><h1>Acceso a Mostrador</h1><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><p role="alert" class="error"></p><button class="primary" type="submit">Entrar</button></form></section>';
    const access=document.querySelector('#access');
    access.onsubmit=async event=>{
      event.preventDefault();
      const password=new FormData(access).get('password');
      const bytes=new TextEncoder().encode('mostrador:'+password);
      authorization='Basic '+btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
      const submit=access.querySelector('button');
      submit.disabled=true;
      try{data=await api('state');render();}
      catch(error){
        authorization=undefined;
        access.querySelector('.error').textContent=error.status===401?'Contraseña incorrecta.':'No se pudo conectar con Mostrador.';
        submit.disabled=false;
      }
    };
  }
}
await start();
