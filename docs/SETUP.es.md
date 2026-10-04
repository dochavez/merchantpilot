# Guía de configuración (español)

Esta guía explica qué cuentas crear, qué descargar y cómo dejar el proyecto corriendo en tu computadora y en Render. Calcula unos 45 minutos la primera vez.

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

## 8. Checklist de entrega en Devpost (12 de noviembre, 12:00 PM PT = 1:00 PM Guatemala)

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
