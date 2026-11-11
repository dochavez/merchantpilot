# Guía de pruebas de MerchantPilot (paso a paso)

Orden recomendado. Cada prueba dice **qué hacer**, **qué debes ver** y **qué hacer si falla**.
Todas se hacen contra la app en Render: `https://merchantpilot.onrender.com` (si el servicio estaba dormido, la primera carga tarda unos 50 segundos).

| # | Prueba | Tiempo |
|---|--------|--------|
| 1 | Webhook de PayPal (alertas en tiempo real) | 10 min |
| 2 | Disputa real en sandbox | 10 min |
| 3 | Servidor MCP (Inspector, PowerShell y Claude Desktop) | 15 min |
| 4 | Power BI Desktop | 15 min |
| 5 | Varios negocios y vista de portafolio | 10 min |
| 6 | Detalle al hacer clic (facturas, clientes, disputas, transacciones) | 5 min |
| 7 | PDF y Excel simple | 3 min |
| 8 | Resumen por correo (Resend) | 10 min |

---

## 1. Crear el webhook en PayPal (alertas en tiempo real)

Un webhook es un aviso que PayPal envía a MerchantPilot cada vez que pasa algo (un pago, un reembolso o una disputa). Con él aparece la campana 🔔 con el botón **Ask AI what to do** sin tener que recargar.

### 1.1 Crear el webhook

1. Entra a **https://developer.paypal.com** e inicia sesión con tu cuenta de PayPal.
2. Arriba a la derecha, verifica que el interruptor diga **Sandbox** (no *Live*).
3. Menú superior: **Apps & Credentials**.
4. En la lista **REST API apps**, haz clic en el **nombre de tu app** (la misma cuyo Client ID usas en Render).
5. Baja hasta la sección **Sandbox Webhooks** y pulsa **Add Webhook**.
6. En **Webhook URL** escribe exactamente:
   ```
   https://merchantpilot.onrender.com/api/webhooks/paypal
   ```
7. En **Event types**, marca estos 12 eventos (usa el buscador de la lista):
   - `Customer dispute created`  (CUSTOMER.DISPUTE.CREATED)
   - `Customer dispute updated`  (CUSTOMER.DISPUTE.UPDATED)
   - `Customer dispute resolved` (CUSTOMER.DISPUTE.RESOLVED)
   - `Payment capture completed` (PAYMENT.CAPTURE.COMPLETED)
   - `Payment capture refunded`  (PAYMENT.CAPTURE.REFUNDED)
   - `Payment capture reversed`  (PAYMENT.CAPTURE.REVERSED)
   - `Invoicing invoice paid`    (INVOICING.INVOICE.PAID)
   - `Billing subscription activated`      (BILLING.SUBSCRIPTION.ACTIVATED)
   - `Billing subscription cancelled`      (BILLING.SUBSCRIPTION.CANCELLED)
   - `Billing subscription suspended`      (BILLING.SUBSCRIPTION.SUSPENDED)
   - `Billing subscription payment failed` (BILLING.SUBSCRIPTION.PAYMENT.FAILED)
   - `Payment sale completed`              (PAYMENT.SALE.COMPLETED – cobros de suscripciones)

   ¿Ya habías creado el webhook? Ábrelo en **Sandbox Webhooks** → **Edit** y agrega los 5 eventos de suscripciones; el Webhook ID no cambia.
8. Pulsa **Save**. El webhook aparece en la lista con un **Webhook ID** (unos 17 caracteres, por ejemplo `8PT59734XY123456A`). Cópialo.

### 1.2 Decirle a Render cuál es el webhook

1. Entra a **https://dashboard.render.com** → servicio **merchantpilot** → **Environment** (menú izquierdo).
2. Baja hasta el final de la lista y pulsa **+ Add variable**. En **Key** escribe `PAYPAL_WEBHOOK_ID` y en **Value** pega el ID. (No aparece en la lista porque Render solo crea las variables opcionales si se llenaron al crear el servicio; lo mismo pasa con `RESEND_API_KEY`, `BRIEF_EMAIL_TO` y `EXPORT_API_KEY`.)
3. Pulsa **Save, rebuild, and deploy**.
4. Espera a que el deploy diga **Live** (unos 3 a 5 minutos).

> ¿Por qué hace falta el ID? MerchantPilot le pregunta a PayPal "¿esta firma es tuya?" antes de crear un aviso. Sin el ID no puede verificarlo y no crea alertas (así nadie puede enviar avisos falsos).

### 1.3 Probarlo con un pago real

1. En VS Code, abre una terminal en la carpeta del proyecto y ejecuta:
   ```
   npm run sandbox:buyer-order
   ```
2. Abre el enlace que aparece, entra con tu cuenta **Personal** del sandbox (Developer Dashboard → **Testing Tools → Sandbox Accounts** → la cuenta *Personal* → **View/edit account** para ver el correo y la contraseña) y pulsa **Pagar**.
3. Llegarás a una página de example.com (es normal). La terminal dirá **Captured**.
4. Abre `https://merchantpilot.onrender.com/dashboard` con el **negocio principal** seleccionado (los avisos de PayPal llegan a ese negocio). En unos 10 a 30 segundos la 🔔 muestra un número rojo; ábrela y verás **New sale $79.00 USD**.

**Comprobación técnica:** abre `https://merchantpilot.onrender.com/api/webhooks/paypal` en el navegador. Verás los últimos eventos recibidos; deben decir `"verified": true`.

**Si no llega nada:**

- En el Developer Dashboard → tu app → **Sandbox Webhooks** → **Webhook events** (o *Event logs*), revisa si el evento salió y qué código respondió Render.
- **401** = el `PAYPAL_WEBHOOK_ID` está mal copiado o es de otra app.
- **No aparece el evento** = el webhook está en otra app, o el Client ID de Render es de otra app.
- El botón **Webhooks simulator** de PayPal envía eventos sin firma válida, así que no crean avisos. Prueba con un pago real.

---

## 2. Crear una disputa real en sandbox

PayPal no deja que el vendedor cree disputas; hay que abrirlas como comprador.

1. Haz un pago con `npm run sandbox:buyer-order` (paso 1.3). Para variar el producto: `npm run sandbox:buyer-order -- --grinder`.
2. Entra a **https://www.sandbox.paypal.com** con la cuenta **Personal**.
3. **Actividad** → elige el pago → **Informar de un problema** → **No recibí el artículo** → completa el formulario y envía.
4. Con el webhook del paso 1: en menos de un minuto aparece en la 🔔 **New dispute PP-D-…** → **Ask AI what to do**.
5. Prueba en el dashboard: haz clic en el número de disputa (tabla *Disputes*) → **📄 Preview evidence pack (PDF)** → pide a la IA "prepara la evidencia" → **Approve**.

> Las disputas del sandbox pueden tardar de 1 a 10 minutos en aparecer en la API de PayPal.

---

## 3. Probar el servidor MCP

MCP permite que otras apps de IA (Claude Desktop, Cursor, el MCP Inspector) usen las herramientas de MerchantPilot.

### 3.1 Conseguir la clave

Render → **merchantpilot** → **Environment** → `MCP_API_KEY` → pulsa el ojo 👁 para verla y cópiala. (Render la generó sola. Con datos *live* es obligatoria; en modo demo no se pide.)

### 3.2 Prueba rápida con PowerShell (2 minutos)

Abre **PowerShell** y pega este bloque, cambiando `PEGA_TU_CLAVE`:

```powershell
$key = "PEGA_TU_CLAVE"
$url = "https://merchantpilot.onrender.com/api/mcp"
$h = @{ Authorization = "Bearer $key"; Accept = "application/json, text/event-stream" }

# 1) Conectar
Invoke-RestMethod -Method Post -Uri $url -Headers $h -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"prueba","version":"1"}}}' | ConvertTo-Json -Depth 5

# 2) Ver las herramientas (deben ser 18)
(Invoke-RestMethod -Method Post -Uri $url -Headers $h -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":2,"method":"tools/list"}').result.tools | Select-Object name

# 3) Ejecutar una herramienta: KPIs de los últimos 30 días
(Invoke-RestMethod -Method Post -Uri $url -Headers $h -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"paypal_overview","arguments":{"periodDays":30}}}').result.content[0].text
```

Debes ver: `serverInfo.name = merchantpilot`, la lista de 18 herramientas y un JSON con ventas, reembolsos y disputas. Si sale **401**, la clave está mal copiada.

### 3.3 MCP Inspector (la herramienta oficial, visual)

1. En una terminal (VS Code o PowerShell):
   ```
   npx @modelcontextprotocol/inspector
   ```
   Si pregunta `Ok to proceed? (y)`, escribe **y**. Se abre el navegador en `http://localhost:6274` (si no se abre, copia de la terminal el enlace que incluye `MCP_PROXY_AUTH_TOKEN=` y ábrelo).
2. En el panel izquierdo:
   - **Transport Type**: `Streamable HTTP`
   - **URL**: `https://merchantpilot.onrender.com/api/mcp`
   - **Authentication** (despliégalo): **Header Name** `Authorization`, **Bearer Token**: tu `MCP_API_KEY` (sin escribir "Bearer").
3. Pulsa **Connect**. Debe decir **Connected** en verde.
4. Pestaña **Tools** → **List Tools** → aparecen las 18.
5. Prueba estas, una por una (clic en la herramienta → llenar campos → **Run Tool**):
   - `paypal_overview` → periodDays `30`
   - `paypal_detect_anomalies`
   - `portfolio_overview` → compara todos tus negocios
   - `paypal_list_invoices` → overdueOnly `true`
   - `propose_invoice_reminder` con un invoiceId de la lista anterior → la respuesta trae un **approveUrl**. Ábrelo en el navegador: verás la página de confirmación (Aprobar / Rechazar). Nada se ejecuta sin tu clic.

### 3.4 Claude Desktop

1. En MerchantPilot: **Export → Use from Claude, Cursor & other AI apps → Copy config**.
2. Claude Desktop → **Settings → Developer → Edit Config**. Se abre `claude_desktop_config.json`. Pega la configuración (si ya tienes otros servidores, agrega solo el bloque `"merchantpilot"` dentro de `mcpServers`).
3. Reemplaza `<your MCP_API_KEY>` por tu clave (deja la palabra `Bearer ` delante). Guarda.
4. Cierra Claude Desktop por completo (también desde la bandeja del sistema, junto al reloj) y ábrelo de nuevo.
5. En un chat nuevo, el icono de herramientas debe mostrar **merchantpilot**. Pregunta: *"Usa merchantpilot: ¿qué facturas están vencidas? Prepárame recordatorios."*
6. Las propuestas aparecen en el **Action Center** de la app y Claude te da el enlace para aprobar.

**Para otro negocio:** agrega `"--header", "X-Business:cafe"` a `args` (usa el id que aparece en el selector de negocios).

---

## 4. Ver los datos en Power BI Desktop

MerchantPilot publica un **feed OData**: Power BI lo lee como si fuera una base de datos y con **Actualizar** trae los datos nuevos de PayPal.

Hay dos direcciones:

| Feed | URL | Úsalo para |
|------|-----|-----------|
| Todos los negocios (recomendado) | `https://merchantpilot.onrender.com/api/odata/all` | Comparar negocios. Todas las tablas traen `BusinessId` y `BusinessName`, más la tabla **Businesses** con la salud de cada uno |
| Solo el negocio principal | `https://merchantpilot.onrender.com/api/odata` | Un solo negocio |

### 4.1 Conectar (opción fácil: archivo .pbids)

1. En MerchantPilot: **Export → Connect Power BI / Excel (live)** → deja **All my businesses** → **Download .pbids (1-click)**.
2. Haz doble clic en `MerchantPilot-portfolio.pbids`. Se abre Power BI Desktop ya conectado. Sigue en el paso 4 de 4.2.

### 4.2 Conectar (opción manual)

1. Abre **Power BI Desktop** → **Informe en blanco**.
2. Pestaña **Inicio** → **Obtener datos** → **Más…** → busca **Fuente OData** (*OData feed*) → **Conectar**.
3. Elige **Básico**, pega `https://merchantpilot.onrender.com/api/odata/all` → **Aceptar**.
4. Si pide credenciales: **Anónimo** → **Conectar**. (Solo si configuraste `EXPORT_API_KEY` en Render: elige **Básico**, usuario cualquiera, contraseña = la clave.)
5. En el **Navegador**, marca estas tablas:
   - **Businesses** (salud, grado A–D, ventas, dinero en riesgo por negocio)
   - **Transactions**
   - **Invoices**
   - **Disputes**
   - **Products**
   - **WeeklyTrend**
   - **Forecast**
6. Pulsa **Cargar** (no *Transformar*). Espera a que termine (unas 12 000 filas en total).

### 4.3 Relacionar las tablas (una sola vez)

1. Clic en el icono **Vista de modelo** (tercer icono de la barra izquierda).
2. Si Power BI no creó las líneas solo, arrastra **Businesses → BusinessId** sobre **Transactions → BusinessId**. Repite hacia Invoices, Disputes, Products, WeeklyTrend y Forecast.
3. Cada relación debe ser **1 a varios (1:*)**, con *Businesses* del lado "1".

### 4.4 Primer tablero en 5 minutos

Vuelve a **Vista de informe** (primer icono) y crea:

1. **Segmentación** (*Slicer*): campo `Businesses[BusinessName]`. Con esto filtras todo el tablero por negocio.
2. **Tarjetas** (*Card*): `Businesses[Sales30d]`, `Businesses[MoneyAtStake]` y `Businesses[HealthScore]` (en el campo, cambia *Suma* por *Promedio*).
3. **Gráfico de columnas agrupadas**: eje X `Businesses[BusinessName]`; valores `Sales30d`, `NetRevenue30d` y `MoneyAtStake`.
4. **Gráfico de líneas**: eje X `WeeklyTrend[WeekStart]`; valores `WeeklyTrend[Sales]`; leyenda `WeeklyTrend[BusinessName]` (una línea por negocio).
5. **Tabla**: `Invoices[BusinessName]`, `InvoiceNumber`, `CustomerName`, `Amount` y `DaysOverdue`. Filtro: `DaysOverdue` mayor que 0. Ordénala por DaysOverdue.
6. **Gráfico de barras**: `Products[Product]` con `RefundRatePct` (detecta productos con muchos reembolsos).
7. **Gráfico de líneas**: `Forecast[Date]` con `DoNothing` y `WithActions` (pronóstico de 90 días).

Medidas opcionales (Inicio → **Nueva medida**):

```
Ventas = CALCULATE(SUM(Transactions[Gross]), Transactions[Type] = "Payment")
Reembolsos = -CALCULATE(SUM(Transactions[Gross]), Transactions[Type] = "Refund")
Tasa de reembolso % = DIVIDE([Reembolsos], [Ventas]) * 100
Por cobrar vencido = CALCULATE(SUM(Invoices[Amount]), Invoices[DaysOverdue] > 0)
```

### 4.5 Actualizar y guardar

- **Inicio → Actualizar** vuelve a leer PayPal en ese momento.
- **Archivo → Guardar como** → `MerchantPilot.pbix`.
- Para publicar en Power BI Service hace falta una cuenta de trabajo o escuela; para el hackathon basta una captura o un video de Power BI Desktop.

**Excel (Microsoft 365)** usa la misma URL: **Datos → Obtener datos → De otras fuentes → Desde fuente OData**.

---

## 5. Varios negocios y vista de portafolio

### 5.1 Ver la función con los negocios de demostración

1. En el dashboard, haz clic en el **nombre del negocio** (arriba a la izquierda, con ▾).
2. Verás tu negocio principal y dos negocios de demostración: **Altura Coffee Shop** (cafetería, ventas bajando) y **Altura Barista Academy** (cursos en línea, con un pico de reembolsos).
3. Elige **Altura Coffee Shop**: todo el dashboard (tablas, KPIs, IA, exportaciones) cambia a ese negocio.
4. Abre de nuevo el menú → **Portfolio overview – compare all businesses**. Ahí verás:
   - totales consolidados (ventas, ingreso neto, dinero en riesgo, salud promedio);
   - el **Owner briefing** escrito por la IA (botón **Español** para traducirlo);
   - una tarjeta por negocio con su **salud 0–100 y grado A–D**, la razón de cada punto restado, el principal problema y cuánto dinero puedes recuperar en 30 días;
   - una tabla comparativa ordenable y una gráfica;
   - **PDF report**: un PDF consolidado con una página por negocio.
5. En el chat de IA prueba: *"Compara mis negocios y dime cuál necesita atención primero"* (usa la herramienta `portfolio_overview`).

### 5.2 Agregar un segundo negocio real (otra cuenta de PayPal sandbox)

1. Developer Dashboard → **Testing Tools → Sandbox Accounts → Create account** → tipo **Business**, país Estados Unidos → **Create**.
2. **Apps & Credentials → Create App**: nombre `merchantpilot-tienda2`, tipo **Merchant**. En **Sandbox Account** elige la cuenta Business del paso 1 → **Create App**.
3. Copia el **Client ID** y el **Secret**.
4. (Opcional, para tener datos) En PowerShell, dentro de la carpeta del proyecto:
   ```powershell
   $env:PAYPAL_CLIENT_ID = "CLIENT_ID_TIENDA_2"
   $env:PAYPAL_CLIENT_SECRET = "SECRET_TIENDA_2"
   npm run seed:sandbox
   Remove-Item Env:PAYPAL_CLIENT_ID; Remove-Item Env:PAYPAL_CLIENT_SECRET
   ```
   (Las variables solo duran en esa ventana; tu `.env.local` no cambia.)
5. En MerchantPilot: menú del negocio → **+ Add another PayPal business** → nombre, Client ID y Secret → **Add**. La app valida las llaves con PayPal antes de guardarlas y guarda el secreto **cifrado** (AES-256). Nunca se vuelve a mostrar.
6. El nuevo negocio aparece en el menú, en el portafolio, en el PDF consolidado y en el feed de Power BI `/api/odata/all`.

Para ocultar los negocios de demostración cuando presentes solo datos reales: en Render agrega `HIDE_DEMO_BUSINESSES` = `true`.

---

## 6. Ver más detalle al hacer clic

En las tablas del dashboard, los valores en azul subrayado se pueden abrir:

| Haz clic en | Verás |
|-------------|-------|
| **Número de factura** (`ALT-1042`) | monto, días de atraso, línea de tiempo, otras facturas del cliente, acciones de IA y los botones **Prepare a reminder** y **Offer a payment plan** |
| **Cliente** o **correo** | segmento (VIP, recurrente, mayorista), valor total gastado, reembolsos, productos favoritos, actividad reciente, sus disputas y facturas |
| **ID de disputa** | motivo, plazo, transacción original, historial del cliente, paquete de evidencia en PDF y botones de IA |
| **ID de transacción** | detalle, comisión, reembolsos relacionados, disputa (si tiene) y resumen del cliente |

Dentro del panel también puedes hacer clic en otros enlaces (por ejemplo, del detalle de la factura al cliente) y volver con **← Back**. Cierra el panel con **✕**, con **Esc** o haciendo clic fuera.

---

## 7. PDF y Excel

- **Export → PDF Executive report**: el informe recomendado (KPIs, gráficas, prioridades, resumen de IA, auditoría). Elige **ES** en *Report language* para tenerlo en español.
- **Export → Excel (simple)**: ahora trae solo **4 hojas**: *Summary* (KPIs, lo que necesita atención y los productos principales), *Transactions*, *Disputes* e *Invoices*.
- **Export → Excel (full workbook)**: las 10 hojas, para tablas dinámicas.
- **Portafolio → PDF report**: el PDF consolidado de todos los negocios.

---

## 8. Resumen diario por correo (Resend)

Resend es un servicio gratuito (100 correos al día) que permite que la app envíe correos.

1. **https://resend.com** → **Sign up** (con Google o GitHub).
2. **API Keys → Create API Key** → nombre `merchantpilot`, permiso **Sending access** → **Add**. Copia la clave (`re_…`); solo se muestra una vez.
3. Render → **merchantpilot** → **Environment**:
   - `RESEND_API_KEY` = la clave.
   - `BRIEF_EMAIL_TO` = **el mismo correo con el que te registraste en Resend** (el remitente de prueba solo puede enviar a ese correo).
4. **Save, rebuild, and deploy** y espera a que diga **Live**.
5. En la app: **☀ Brief → Send test email**. Revisa la bandeja de entrada (y spam la primera vez).

---

## 9. Los 5 escenarios de PayPal ("Test the unhappy paths too")

Haz cada escenario con el dashboard abierto en el **negocio principal** y anota el resultado. Cuenta Personal = comprador; cuenta Business = la tienda.

### 01 · Pago exitoso (happy path)

1. `npm run sandbox:buyer-order` → abre el enlace → entra con la cuenta **Personal** → **Pagar**.
2. Se abre una página verde **Payment approved** (localhost) y la terminal dice **✔ Captured …**. Copia ese ID de captura.
3. **Esperado en MerchantPilot:** en 10–30 s, 🔔 **New sale 79.00 USD**. En `/api/webhooks/paypal`: `PAYMENT.CAPTURE.COMPLETED`, `verified: true`.

### 02 · Checkout cancelado (el comprador se va)

1. `npm run sandbox:buyer-order` → abre el enlace → entra con la cuenta Personal → **Cancel and return to Altura Coffee Supply** (abajo).
2. Se abre una página naranja **Checkout cancelled** y la terminal dice **✖ Checkout cancelled by the buyer. Nothing was charged.**
3. **Esperado en MerchantPilot:** nada nuevo (ni venta, ni aviso, ni cambio en KPIs). Eso es lo correcto: no hubo dinero.

### 03 · Usuarios diferentes (comprador nuevo, otro país)

1. Developer Dashboard → **Testing Tools → Sandbox Accounts → Create account** → **Personal**, país **Mexico** (o Canada) → **Create**. Anota correo y contraseña (⋯ → View/Edit account).
2. En una **ventana privada**: `npm run sandbox:buyer-order -- --item grinder` y paga con esa cuenta nueva.
3. Repite con un producto digital y otro monto: `npm run sandbox:buyer-order -- --item course` (sin envío).
4. **Esperado:** aviso 🔔 de cada venta. Cuando PayPal la incluya en la búsqueda de transacciones (puede tardar hasta 3 h), el cliente aparece en el dashboard con su país; haz clic en su nombre para ver el panel **Customer** (cliente nuevo, 1 pedido).

### 04 · Reembolso (desde el lado del vendedor)

Tres formas; prueba al menos A y B:

- **A. Con aprobación en MerchantPilot (la principal):** en el chat escribe *"Reembolsa la captura XXXXXXXX"* (el ID del escenario 01). Aparece la tarjeta de propuesta → **Approve**. Esperado: estado **Executed**, aviso 🔔 **Refund issued 79.00 USD**, y la acción queda en el Action Center / auditoría.
- **B. Reembolso parcial:** *"Reembolsa 20 USD de la captura XXXXXXXX"* → Approve. Esperado: **Refund issued 20.00 USD**.
- **C. Directo en PayPal:** entra a `https://www.sandbox.paypal.com` con la cuenta **Business** → Actividad → el pago → **Reembolsar**. Esperado: aviso 🔔 por webhook aunque no se hizo desde MerchantPilot.
- **Ver los dos lados:** en dos ventanas privadas, cuenta Business (ve el +79 y el reembolso) y cuenta Personal (ve el −79 y la devolución). Toma captura para Devpost.

### 05 · Fallos y casos límite (¿qué se rompe?)

| # | Prueba | Cómo | Esperado |
|---|--------|------|----------|
| a | Pago rechazado | `npm run sandbox:buyer-order -- --decline` y paga | Terminal: **✖ Capture declined: … INSTRUMENT_DECLINED**. MerchantPilot: sin venta ni aviso |
| b | Reembolsar de más | En el chat: *"Reembolsa 500 USD de la captura XXXXXXXX"* (de 79) | La IA no puede crear la propuesta: *refundable balance is …* |
| c | Doble reembolso | Pide otra vez el reembolso total de una captura ya reembolsada (escenario 04 A) y aprueba si llega a proponerse | Bloqueado al proponer (*already fully refunded*) o la acción queda **Failed** con el mensaje de PayPal; nunca se cobra dos veces |
| d | Enlace de aprobación usado dos veces | Abre de nuevo un enlace de aprobación ya usado (MCP o resumen matutino) | La página dice *This action is already executed*; no se repite |
| e | Webhook falso | En PowerShell: `Invoke-RestMethod -Method Post -Uri https://merchantpilot.onrender.com/api/webhooks/paypal -ContentType application/json -Body '{"event_type":"CUSTOMER.DISPUTE.CREATED","resource":{"dispute_id":"FAKE"}}'` | Error **401** (firma inválida) y **ningún** aviso en la 🔔 |
| f | MCP sin clave | `Invoke-RestMethod -Method Post -Uri https://merchantpilot.onrender.com/api/mcp -ContentType application/json -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` | Error **401** |
| g | Regla de límite diario | ⚖ Rules → *Daily money-out limit* = 50 → pide un reembolso de 79 y pulsa Approve | No se ejecuta: *Daily money-out limit of 50.00 would be exceeded…*. Después regresa el límite a su valor (2000) |
| h | Monto mínimo | `npm run sandbox:buyer-order -- --amount 0.01` y paga | Venta de 0.01 USD con su aviso; los KPIs no se rompen |

Si algún resultado no coincide con el "esperado", toma captura de la terminal y de la 🔔 y lo revisamos.

---

## 10. Suscripciones (ingresos recurrentes) y facturas con productos

### 10.1 Facturas con productos

`npm run seed:sandbox -- --payments 0 --invoices 20` ahora crea cada factura con **productos del catálogo** (por ejemplo *Burr Grinder Pro ×2, Paper Filters x200 ×10*). En MerchantPilot haz clic en un número de factura: el panel muestra la sección **Products on this invoice** (artículo, cantidad, precio y total). La columna **Products** también aparece en el Excel, en Power BI (tabla `InvoiceLines`) y para la IA.

### 10.2 Crear suscripciones en sandbox

PayPal no permite que el vendedor active suscripciones sin la aprobación del comprador, así que cada una necesita un clic con la cuenta **Personal**.

1. Planes (solo la primera vez; crea el producto "Altura Coffee Club" y 4 planes):
   ```
   npm run sandbox:subscription -- --plans-only
   ```
2. Una suscripción:
   ```
   npm run sandbox:subscription -- --plan monthly
   ```
   Abre el enlace → entra con la cuenta Personal → **Agree & Subscribe**. La terminal dice **✔ I-XXXX is ACTIVE** y PayPal cobra el primer mes.
3. Repite con otros planes y compradores (ventana privada):

   | Comando | Qué prueba |
   |---------|-----------|
   | `-- --plan biweekly` | Cobro cada 2 semanas (MRR normalizado a mensual) |
   | `-- --plan office` | Plan de 149 USD (cliente de alto valor) |
   | `-- --plan trial` | 7 días gratis, luego 29 USD |
   | `-- --plan monthly --cancel` | **Cancelación** → aviso 🔔 *Subscription cancelled* y sube el churn |
   | `-- --plan monthly --suspend` | **Suspendida** → aviso 🔔 y cuenta como *MRR at risk* |
   | Cancelar en la página de PayPal | Alta abandonada: no se cobra nada |

4. **Esperado en MerchantPilot** (con los 5 eventos nuevos del webhook): en menos de un minuto aparece el aviso 🔔 y la suscripción en la fuente de datos **PayPal subscriptions**. Si no configuraste esos eventos, pregúntale a la IA: *"Muéstrame la suscripción I-XXXX"*; la lee de PayPal y la sigue desde entonces. Los cobros también aparecen en transacciones (tipo *Subscription*) cuando PayPal los incluye en la búsqueda de transacciones (hasta 3 h).

### 10.3 Qué ver en la app

- Chat: *"¿Cuánto es mi MRR y cuál plan pierde más suscriptores?"* (herramienta `paypal_subscriptions`).
- Clic en un **Subscription ID** (o en *Subscription* dentro de una transacción): plan, valor mensual, antigüedad, próximos cobros, pagos fallidos y botón **Recover this subscriber** / **Win them back**.
- **Portafolio**: columna **MRR** y **Churn 30d** por negocio, y una línea de ingresos recurrentes en el resumen.
- **PDF**: sección *Recurring revenue* con la tabla por plan. **Excel completo**: hoja *Subscriptions*. **Power BI**: tabla `Subscriptions` y columnas `Mrr`, `ActiveSubscribers`, `ChurnRatePct` en `Kpis` y `Businesses`.
- En modo demo los 3 negocios ya traen suscripciones con historia: el plan *Bi-weekly* de Altura Coffee Supply pierde suscriptores y hay suscripciones suspendidas por pagos fallidos.

---

## Lista de verificación final

- [ ] Webhook creado, `PAYPAL_WEBHOOK_ID` en Render y `/api/webhooks/paypal` muestra `verified: true`
- [ ] Al menos 1 disputa real abierta por el comprador sandbox
- [ ] MCP: PowerShell muestra 18 herramientas; el Inspector ejecuta `paypal_overview`
- [ ] Power BI: tablero con segmentación por negocio guardado como `.pbix` (captura para Devpost)
- [ ] Portafolio con 3 o más negocios y PDF consolidado descargado
- [ ] Clic en factura, cliente y disputa abre el panel de detalle
- [ ] Correo del resumen recibido
- [ ] Los 5 escenarios de la sección 9 (pago, cancelado, otro comprador, reembolso, fallos)
- [ ] Al menos 3 suscripciones (una cancelada y una suspendida) y facturas con productos (sección 10)
