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
7. En **Event types**, marca estos 7 eventos (usa el buscador de la lista):
   - `Customer dispute created`  (CUSTOMER.DISPUTE.CREATED)
   - `Customer dispute updated`  (CUSTOMER.DISPUTE.UPDATED)
   - `Customer dispute resolved` (CUSTOMER.DISPUTE.RESOLVED)
   - `Payment capture completed` (PAYMENT.CAPTURE.COMPLETED)
   - `Payment capture refunded`  (PAYMENT.CAPTURE.REFUNDED)
   - `Payment capture reversed`  (PAYMENT.CAPTURE.REVERSED)
   - `Invoicing invoice paid`    (INVOICING.INVOICE.PAID)
8. Pulsa **Save**. El webhook aparece en la lista con un **Webhook ID** (unos 17 caracteres, por ejemplo `8PT59734XY123456A`). Cópialo.

### 1.2 Decirle a Render cuál es el webhook

1. Entra a **https://dashboard.render.com** → servicio **merchantpilot** → **Environment** (menú izquierdo).
2. Busca `PAYPAL_WEBHOOK_ID` → **Edit** → pega el ID → **Save, rebuild, and deploy**.
3. Espera a que el deploy diga **Live** (unos 3 a 5 minutos).

> ¿Por qué hace falta el ID? MerchantPilot le pregunta a PayPal "¿esta firma es tuya?" antes de crear un aviso. Sin el ID no puede verificarlo y no crea alertas (así nadie puede enviar avisos falsos).

### 1.3 Probarlo con un pago real

1. En VS Code, abre una terminal en la carpeta del proyecto y ejecuta:
   ```
   npm run sandbox:buyer-order
   ```
2. Abre el enlace que aparece, entra con tu cuenta **Personal** del sandbox (Developer Dashboard → **Testing Tools → Sandbox Accounts** → la cuenta *Personal* → **View/edit account** para ver el correo y la contraseña) y pulsa **Pagar**.
3. Llegarás a una página de example.com (es normal). La terminal dirá **Captured**.
4. Abre `https://merchantpilot.onrender.com/dashboard`. En unos 10 a 30 segundos la 🔔 muestra un punto rojo y un aviso **Payment received**.

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

# 2) Ver las herramientas (deben ser 17)
(Invoke-RestMethod -Method Post -Uri $url -Headers $h -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":2,"method":"tools/list"}').result.tools | Select-Object name

# 3) Ejecutar una herramienta: KPIs de los últimos 30 días
(Invoke-RestMethod -Method Post -Uri $url -Headers $h -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"paypal_overview","arguments":{"periodDays":30}}}').result.content[0].text
```

Debes ver: `serverInfo.name = merchantpilot`, la lista de 17 herramientas y un JSON con ventas, reembolsos y disputas. Si sale **401**, la clave está mal copiada.

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
4. Pestaña **Tools** → **List Tools** → aparecen las 17.
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
2. Verás tu negocio principal y dos negocios de demostración: **Altura Café Antigua** (cafetería, ventas bajando) y **Altura Barista Academy** (cursos en línea, con un pico de reembolsos).
3. Elige **Altura Café Antigua**: todo el dashboard (tablas, KPIs, IA, exportaciones) cambia a ese negocio.
4. Abre de nuevo el menú → **Portfolio overview – compare all businesses**. Ahí verás:
   - totales consolidados (ventas, ingreso neto, dinero en riesgo, salud promedio);
   - el **Owner briefing** escrito por la IA (botón **Español** para traducirlo);
   - una tarjeta por negocio con su **salud 0–100 y grado A–D**, la razón de cada punto restado, el principal problema y cuánto dinero puedes recuperar en 30 días;
   - una tabla comparativa ordenable y una gráfica;
   - **PDF report**: un PDF consolidado con una página por negocio.
5. En el chat de IA prueba: *"Compara mis negocios y dime cuál necesita atención primero"* (usa la herramienta `portfolio_overview`).

### 5.2 Agregar un segundo negocio real (otra cuenta de PayPal sandbox)

1. Developer Dashboard → **Testing Tools → Sandbox Accounts → Create account** → tipo **Business**, país Guatemala o Estados Unidos → **Create**.
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

## Lista de verificación final

- [ ] Webhook creado, `PAYPAL_WEBHOOK_ID` en Render y `/api/webhooks/paypal` muestra `verified: true`
- [ ] Al menos 1 disputa real abierta por el comprador sandbox
- [ ] MCP: PowerShell muestra 17 herramientas; el Inspector ejecuta `paypal_overview`
- [ ] Power BI: tablero con segmentación por negocio guardado como `.pbix` (captura para Devpost)
- [ ] Portafolio con 3 o más negocios y PDF consolidado descargado
- [ ] Clic en factura, cliente y disputa abre el panel de detalle
- [ ] Correo del resumen recibido
