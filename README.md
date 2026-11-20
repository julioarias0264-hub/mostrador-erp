# Mostrador · Tarea libre 2

**Alumno:** Julio César Arias Gaytán
**Materia:** Programación para Internet

Mostrador es un ERP escolar para una tienda pequeña. Reúne punto de venta, inventario, clientes, ventas a crédito, abonos e historial.

## Ejecutar

Necesitas Node.js 24 o posterior. Desde la carpeta del proyecto ejecuta `npm start` y abre [http://127.0.0.1:3000](http://127.0.0.1:3000). No hay paquetes externos. SQLite se inicializa en `data/mostrador.sqlite` y carga seis productos de ejemplo. Puedes configurar `HOST`, `PORT` y `DB_PATH`.

## Decisiones de diseño y desarrollo

La caja muestra catálogo y cobro en una misma vista para que el operador compruebe existencia e importe antes de registrar la venta. El inventario muestra los movimientos, y el historial conserva el precio y el nombre que tenía cada producto al venderse.

El reto fue mantener consistentes el stock, las ventas y los saldos. El servidor valida los importes en centavos, comprueba existencias y registra los cambios en una transacción SQLite. El saldo de un cliente se calcula como créditos otorgados menos abonos. Se rechazan abonos mayores al saldo y ventas con stock insuficiente.

## Demostración

1. En **Clientes y abonos**, crea un cliente.
2. En **Punto de venta**, agrega un café de olla. Selecciona el cliente, **Crédito** y un pago inicial de $10. Registra la venta.
3. En **Inventario**, comprueba que salió una unidad. En **Historial de ventas**, verás $35 de total, $10 de cobro inicial y $25 de crédito.
4. Registra un abono de $15 para el cliente. El saldo debe quedar en $10. Recarga la página para comprobar que se conserva.

Proyecto de demostración local para una sola tienda. No incluye cuentas de usuario, facturación fiscal ni procesamiento de pagos.

## Tickets de venta

Al terminar una venta aparece un comprobante con folio, fecha, cliente, productos, total y forma de pago desglosada entre cobro inicial y crédito. Desde **Historial de ventas → Ver ticket** puedes abrir un comprobante anterior. **Imprimir ticket** abre el diálogo del navegador para imprimir o guardar como PDF.

## Publicación en Vercel y Supabase

1. Crea un proyecto de Supabase. En **Connect**, copia la cadena PostgreSQL de **Transaction pooler** (puerto 6543).
2. En Vercel importa este repositorio como proyecto **Other**. La configuración ya está en `vercel.json`.
3. Configura `DATABASE_URL` con la cadena del pooler y `APP_PASSWORD` con una contraseña propia para el ERP. Ambas son variables privadas del servidor. Si la contraseña de Postgres incluye caracteres reservados de URL, codifícalos en la cadena.
4. Despliega y abre la URL de Vercel. Ingresa la contraseña de Mostrador para acceder a la caja.

El servidor crea el esquema privado `mostrador` y carga productos de demostración cuando la base está vacía. Las ventas, movimientos y abonos se ejecutan en transacciones PostgreSQL. Los datos de la SQLite local se conservan en tu equipo y no se importan al publicar.
