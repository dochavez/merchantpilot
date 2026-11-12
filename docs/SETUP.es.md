# Guía de configuración (español)

Esta guía explica qué cuentas crear, qué descargar y cómo dejar el proyecto corriendo en tu computadora y en Render. Calcula unos 45 minutos la primera vez.

> **Guía de pruebas paso a paso** (webhook, disputas, MCP, Power BI, varios negocios): [GUIA-PRUEBAS.es.md](GUIA-PRUEBAS.es.md)

## 0. Requisitos en tu computadora

| Herramienta | Versión | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org) | 22 LTS (mínimo 20.9) | Correr la app |
| [Git](https://git-scm.com) | cualquiera | Subir a GitHub |
| VS Code o Cursor | — | Editor (opcional) |

Verifica en una terminal: `node -v` y `git --version`.

## 1. Correr el proyecto sin ninguna llave (5 minutos)

```bash
cd merchantpilot
npm install
npm run dev
```

Abre http://localhost:3000. Verás datos demo de "Altura Coffee Supply", el dashboard de AG Studio y el Action Center. Sin llave de IA, el chat te muestra un aviso de configuración.

Para probar todo el ciclo del agente sin llaves, usa el modelo simulado:

```bash
LLM_PROVIDER=mock npm run dev      # en Windows PowerShell: $env:LLM_PROVIDER="mock"; npm run dev
```

Luego haz clic en "Chase overdue invoices" en el panel de IA. Verás la propuesta en el Action Center; aprueba y queda ejecutada.

## 2. PayPal Developer (sandbox) – obligatorio para el hackathon

1. Entra a https://developer.paypal.com con tu cuenta PayPal (puedes crear una gratis).
2. Ve a **Apps & Credentials**, confirma que estás en **Sandbox** y haz clic en **Create App**.
   - Nombre: `MerchantPilot`. Tipo: **Merchant**.
3. Copia el **Client ID** y el **Secret**.
4. En la configuración de la app, en **Features**, activa:
   - ✅ **Transaction search**. Sin esto, la búsqueda de transacciones devuelve error 403. Después de activarlo, espera de 5 a 10 minutos.
   - ✅ **Invoicing**
   - ✅ **Advanced Credit and Debit Card Payments**, si aparece. Lo usa el script que llena el sandbox.
5. En **Sandbox → Accounts** ya tienes una cuenta *Business* (tu comercio) y una *Personal* (comprador de prueba). Anota el correo y la contraseña del comprador; los vas a necesitar para las disputas.
6. Crea el archivo `.env.local` a partir del ejemplo:

```bash
cp .env.example .env.local
```

   Pon `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET`.

7. Verifica la conexión:

```bash
npm run check:env
```

8. Llena tu sandbox con actividad de ejemplo (pagos, reembolsos y facturas vencidas):

```bash
npm run seed:sandbox
```

   Por defecto crea 100 pagos, 21 reembolsos y 3 facturas. Puedes cambiar las cantidades:

```bash
npm run seed:sandbox -- --payments 15 --refunds 3 --no-invoices
```

   PayPal registra cada pago con la fecha de **hoy** (no se puede cambiar). Para que las gráficas de tendencia se vean bien, corre lotes pequeños en varios días distintos. Usa `--no-invoices` si ya creaste las facturas, para no duplicarlas.

   Si los pagos con tarjeta fallan, genera una tarjeta de prueba en **Testing tools → Credit card generator** y ponla en `SANDBOX_CARD_NUMBER`.

> ⚠️ Las transacciones nuevas pueden tardar **hasta 3 horas** en aparecer en Transaction Search. Las facturas aparecen al instante.

### Crear disputas (manual, unos 10 minutos)

PayPal no permite que el vendedor cree disputas por API. Hay que hacerlo como comprador:

1. Con tu app corriendo, crea una orden y págala con la cuenta *Personal* del sandbox. También sirve iniciar sesión en https://www.sandbox.paypal.com con el comprador y enviar un pago a tu cuenta *Business*.
2. Como comprador, ve a **Resolution Center → Report a problem**, elige el pago y abre un caso de tipo "No recibí el artículo".
3. Repite 2 o 3 veces. Las disputas aparecerán en el dashboard en modo *live*.

### ¿Demo o live para los jueces?

- **Live (sandbox):** demuestra integración real. Úsalo en el video para mostrar una aprobación ejecutándose en PayPal.
- **Con llaves de PayPal (por defecto):** la URL abre primero **Altura Coffee Supply (demo)** y tu sandbox aparece como negocio *Live* en el menú. `DEFAULT_BUSINESS=primary` abre primero el sandbox.
- **Demo (`FORCE_DEMO=1`):** la historia siempre es clara y se puede reiniciar con "Reset demo". Recomendado para la URL pública, a menos que tu sandbox tenga suficiente actividad.

## 3. Llave del modelo de IA (elige una)

| Proveedor | Dónde | Variable | Modelo por defecto |
|---|---|---|---|
| OpenAI | https://platform.openai.com/api-keys | `OPENAI_API_KEY` | `gpt-5-mini` |
| Anthropic | https://console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |

- Configura un **límite de gasto mensual** en el panel del proveedor (por ejemplo, $20). La app trae además límites por IP (`LLM_TURNS_PER_10_MIN`) y un tope diario (`LLM_DAILY_TURN_CAP`).
- Si el modelo por defecto no existe en tu cuenta, cámbialo con `LLM_MODEL`.
- Verifica con `npm run check:env`.

## 4. Licencia de prueba de AG Studio (quita la marca de agua)

1. Solicítala en https://www.ag-grid.com/studio/license-pricing/ (prueba de 45 días).
2. Ponla en `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY`.
3. ⚠️ **Cuándo pedirla:** la prueba dura 45 días y la evaluación es del **1 al 15 de diciembre**, con ganadores alrededor del 21. Si la pides hoy, vence a mediados de noviembre. **Pídela alrededor del 1 de noviembre** para que cubra la evaluación. Mientras tanto, todo funciona igual, solo con marca de agua.

## 5. GitHub (repositorio público)

```bash
git init && git add -A && git commit -m "MerchantPilot: initial version"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/merchantpilot.git
git push -u origin main
```

- El repo debe ser **público** y tener el archivo `LICENSE` (ya incluido, MIT).
- **Nunca subas `.env.local`.** Ya está en `.gitignore`.

## 6. Deploy en Render (la URL que probarán los jueces)

1. Crea una cuenta en https://render.com con tu GitHub.
2. Reclama los **$50 en créditos** desde la página de Render del hackathon (https://paypalaihackathon.devpost.com/details/render).
3. Ve a **New → Blueprint**, elige tu repo y Render detecta el archivo `render.yaml`.
4. Llena las variables secretas: llaves de PayPal y de IA y la licencia de AG Studio.
5. El plan es `starter`, que no se duerme y evita que los jueces esperen. Mientras desarrollas puedes cambiarlo a `free`.
6. Cuando termine el deploy, verifica:

```bash
npm run smoke -- https://merchantpilot.onrender.com
```

7. Opcional, para webhooks:
   - En tu app de PayPal, ve a **Webhooks → Add webhook**.
   - URL: `https://<tu-app>.onrender.com/api/webhooks/paypal`.
   - Eventos: `PAYMENT.CAPTURE.*`, `CUSTOMER.DISPUTE.*` e `INVOICING.INVOICE.*`.
   - Copia el **Webhook ID** a `PAYPAL_WEBHOOK_ID`.

> Las acciones aprobadas se guardan en memoria del servidor y se borran en cada redeploy. Para la demo es suficiente; ver el plan para guardarlas en una base de datos.

## 7. Plugin de APIMatic (premio extra, poco esfuerzo)

- Registra tu uso en el formulario de la página https://paypalaihackathon.devpost.com/details/apimatic.
- Instala el **Context Plugin de PayPal** en tu asistente de código (Claude Code, Cursor o VS Code).
- Úsalo mientras programas y menciónalo en el README y en la entrega.

## 8. Checklist de entrega en Devpost (12 de noviembre, 12:00 PM PT)

- [ ] URL pública funcionando (smoke test en verde)
- [ ] Repo público con LICENSE y README en inglés
- [ ] Video de menos de 3 minutos en YouTube, público, sin música con copyright
- [ ] Descripción: problema, usuario, cómo se usa PayPal, cómo se usa la IA, patrocinadores usados
- [ ] Elegir premios: Best Use of AG Grid, Best Use of PayPal + AI, Most Impactful
- [ ] Credenciales de prueba para los jueces, si hacen falta (en modo demo no se necesitan)

## Exportar a Excel, PDF y conectar Power BI

- En el dashboard, botón **Export**: reporte ejecutivo en PDF (con resumen escrito por la IA, en inglés o español), libro de Excel con todas las tablas, CSV por tabla y **Connect Power BI / Excel**.
- También se puede pedir en el chat: *"Hazme el reporte PDF de este mes"* y aparece una tarjeta con el botón de descarga.
- **Power BI Desktop:** descarga el archivo `.pbids` desde el diálogo y ábrelo con doble clic; Power BI se conecta solo. O bien: *Obtener datos → Fuente OData* → pega `https://TU-APP.onrender.com/api/odata` → elige las tablas → *Cargar*.
- **Excel (Microsoft 365):** *Datos → Obtener datos → Desde otras fuentes → Desde fuente OData* → pega la misma URL. Con *Actualizar todo* se vuelven a leer los datos de PayPal.
- **Seguridad:** si defines `EXPORT_API_KEY` en Render, Power BI y Excel deben usar autenticación **Básica**: cualquier usuario y la clave como contraseña.

## Base de datos en Render (historial y reglas que no se pierden)

`render.yaml` ahora crea una base **Postgres** (`merchantpilot-db`, plan *basic-256mb*, unos 6 USD al mes) y conecta `DATABASE_URL` sola. El plan gratis de Postgres se borra a los 30 días, antes de que termine la evaluación, por eso no lo usamos.

1. En Render abre **Blueprints → merchantpilot → Manual sync** (o *Sync* si aparece el aviso de cambios). Render crea la base y reinicia el servicio.
2. Si creaste el servicio a mano y no como Blueprint: **New → Postgres** (nombre `merchantpilot-db`, región Oregon, plan Basic 256MB) y luego, en el servicio web, **Environment → Add → `DATABASE_URL`** con la *Internal Database URL* de la base.
3. Comprueba en `https://TU-APP.onrender.com/api/health` que diga `"storage":"postgres"`.

Las tablas se crean solas la primera vez. Sin `DATABASE_URL` todo sigue funcionando, pero en memoria.

## Reglas de aprobación

En el Action Center, botón **⚖ Rules**:

- **Auto-aprobar reembolsos pequeños** (máximo 100) y **enviar recordatorios automáticamente**.
- **Doble aprobación** arriba de cierto monto: hacen falta dos personas distintas. Para probarlo, cambia el nombre en *Approving as* (por ejemplo "Ana (CFO)") y aprueba otra vez.
- **Límite diario** de dinero que sale (reembolsos y disputas aceptadas).

Cada decisión queda en el historial con quién la tomó y qué regla se aplicó, y sale también en el PDF, el Excel y Power BI.

## Tanda 2: pronóstico, disputas, planes de pago y resumen matutino

- **Pronóstico de flujo de caja** (widget "Cash-flow forecast & what-if" en el dashboard): activa o desactiva *Fix refund spike*, *Chase late invoices*, *Fight disputes* y mueve *Sales*. "Extra cash" muestra cuánto dinero ganas actuando; "Total cash" muestra la proyección completa. El chat responde con el mismo modelo ("¿cuánto vale arreglar los reembolsos?").
- **Paquete de evidencia para disputas**: pide en el chat "Disputes that need me". La tarjeta trae el enlace *Preview the evidence pack (PDF)*; al aprobar, se envía a PayPal (Disputes API, `provide-evidence`). Si PayPal no acepta evidencia en ese estado de la disputa, se manda el texto como mensaje de la disputa.
- **Plan de pagos**: pide "Offer the oldest overdue invoice in 3 installments". Al aprobar se activan los pagos parciales en la factura de PayPal y se envía un recordatorio con el enlace de pago.
- **Resumen matutino**: botón **☀ Brief** arriba. Se puede compartir por WhatsApp o enviar por correo.
  - Para el correo: crea una cuenta gratis en resend.com, copia la API key y en Render → merchantpilot → Environment agrega `RESEND_API_KEY` y `BRIEF_EMAIL_TO` (tu correo). Con el remitente de prueba de Resend solo puedes enviarte a ti mismo.
  - Para que llegue solo cada mañana: descomenta el bloque `merchantpilot-morning-brief` en `render.yaml` y pon en ese cron el mismo `CRON_SECRET` que tiene el servicio web.
  - Los enlaces *Approve* del resumen abren una página de confirmación y caducan en 48 horas.

## Guía paso a paso: enviar el resumen por correo (Resend)

Resend es un servicio que envía correos desde una aplicación. Tiene un plan gratis (100 correos al día), suficiente para el resumen diario.

1. Entra a **https://resend.com** → **Sign up** (puedes usar tu cuenta de Google o GitHub).
2. En el menú de la izquierda abre **API Keys** → **Create API Key**. Nombre: `merchantpilot`, permiso: **Sending access** → **Add**. Copia la clave (empieza con `re_`); solo se muestra una vez.
3. En **Render** abre el servicio **merchantpilot** → **Environment** (menú izquierdo, sección MANAGE).
4. Busca `RESEND_API_KEY` (si no aparece, botón **+ Add Environment Variable**) y pega la clave. Haz lo mismo con `BRIEF_EMAIL_TO` y escribe **el mismo correo con el que te registraste en Resend** (con el remitente de prueba de Resend solo se puede enviar a ese correo).
5. Pulsa **Save, rebuild, and deploy** y espera a que el deploy diga *Live*.
6. En la app: botón **☀ Brief** → **Send test email**. Revisa tu bandeja (y la carpeta de spam la primera vez).

## Guía: crear una disputa real en sandbox

Los pagos del `seed:sandbox` son con tarjeta y no tienen cuenta de comprador, así que no se pueden disputar. Este comando crea un pago que sí:

1. En el PayPal Developer Dashboard → **Testing Tools → Sandbox Accounts**, abre la cuenta **Personal** y copia su correo y contraseña (botón *View/edit account*).
2. En VS Code: `npm run sandbox:buyer-order`. Abre el enlace que aparece, entra con la cuenta Personal y pulsa **Pagar**. Terminarás en example.com (es normal); la terminal dirá *Captured*.
3. Entra a **https://www.sandbox.paypal.com** con esa misma cuenta Personal → **Actividad** → el pago → **Informar de un problema** → *No recibí el artículo*.
4. En unos minutos la disputa aparece en MerchantPilot. Prueba "Disputes that need me" → **Preview the evidence pack** → **Approve**.

## Guía: alertas en tiempo real (webhooks de PayPal)

1. PayPal Developer Dashboard → **Apps & Credentials** → tu app → sección **Webhooks** → **Add Webhook**.
2. URL: `https://merchantpilot.onrender.com/api/webhooks/paypal`. Eventos: *Customer dispute created/updated/resolved*, *Payment capture completed/refunded/reversed* e *Invoicing invoice paid* → **Save**.
3. Copia el **Webhook ID** y en Render → Environment ponlo en `PAYPAL_WEBHOOK_ID` → *Save, rebuild, and deploy*.
4. Cuando el comprador abra la disputa del paso anterior, aparecerá un aviso 🔔 con el botón **Ask AI what to do**. Los eventos de prueba del "Webhooks simulator" de PayPal no traen firma válida, por eso no generan aviso: usa un evento real. En modo demo hay un botón **Simulate new dispute** dentro de la 🔔.

## Guía: usar MerchantPilot desde Claude Desktop (MCP)

1. En Render → Environment copia el valor de `MCP_API_KEY` (Render lo genera solo).
2. En la app: **Export → Use from Claude, Cursor & other AI apps** → **Copy config**.
3. Claude Desktop → **Settings → Developer → Edit Config**, pega la configuración, reemplaza `<your MCP_API_KEY>` por la clave y reinicia Claude Desktop. Necesitas Node.js instalado (ya lo tienes).
4. Pregunta en Claude Desktop: *"Usa merchantpilot: ¿qué facturas están vencidas? Prepárame recordatorios."* Las propuestas llegan al Action Center y Claude te da un enlace para aprobarlas.

## Voz

El botón 🎤 (arriba) funciona en **Chrome, Edge o Safari** (Firefox todavía no soporta reconocimiento de voz). **ES/EN** cambia el idioma y 🔊 hace que la respuesta se lea en voz alta.

## Nota: "7 Issues" en `npm run dev`

El botón rojo abajo a la izquierda solo aparece en desarrollo. Son los avisos de la licencia de prueba de AG Studio en la consola; desaparecen con la clave de licencia y no se ven en Render.
