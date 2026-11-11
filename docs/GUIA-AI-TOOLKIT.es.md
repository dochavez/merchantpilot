# Guía: PayPal AI-Toolkit + MCP de MerchantPilot en Claude Code (Windows)

Resultado final: Claude Code con **dos servidores MCP conectados al mismo tiempo**:

- **paypal-sandbox** (del AI-Toolkit): operaciones directas de PayPal (órdenes, facturas, reembolsos, disputas).
- **merchantpilot** (tu app en Render): análisis, pronóstico y propuestas que necesitan tu aprobación.

Tiempo: unos 30 minutos.

---

## Parte 1. Instalar Claude Code

1. (Recomendado) Instala **Git para Windows** si no lo tienes: https://git-scm.com/downloads/win (todo con las opciones por defecto). Es opcional, pero también lo usarás para clonar el AI-Toolkit.
2. Abre **PowerShell** (no hace falta que sea como administrador) y ejecuta:
   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```
   Alternativas: `winget install Anthropic.ClaudeCode`, o con Node.js 22+: `npm install -g @anthropic-ai/claude-code`
3. Cierra PowerShell, ábrelo de nuevo y comprueba:
   ```powershell
   claude --version
   ```
4. Entra a tu carpeta y abre Claude Code:
   ```powershell
   cd C:\Users\rudolf\Documents\PayPalMerchant\merchantpilot
   claude
   ```
   La primera vez se abre el navegador para iniciar sesión: usa tu cuenta de Claude (el plan Pro sirve).

---

## Parte 2. Instalar el plugin de PayPal

Dentro de Claude Code (donde dice `>`), escribe:

```
/plugin install paypal@claude-plugins-official
```

y después:

```
/reload-plugins
```

Si el comando no encuentra el plugin, usa la instalación local: sal con `/exit` y en PowerShell:

```powershell
cd C:\Users\rudolf\Documents\PayPalMerchant
git clone https://github.com/paypal/AI-Toolkit.git
cd merchantpilot
claude --plugin-dir ..\AI-Toolkit
```

(Con esta opción tendrás que abrir Claude Code siempre con `--plugin-dir ..\AI-Toolkit`.)

---

## Parte 3. Token del sandbox para el MCP de PayPal

### 3.1 Generar el token (PowerShell)

Usa el **Client ID** y **Secret** de tu app sandbox (los mismos que tienes en `.env.local`):

```powershell
$id = "TU_SANDBOX_CLIENT_ID"
$secret = "TU_SANDBOX_CLIENT_SECRET"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${id}:${secret}"))
$r = Invoke-RestMethod -Method Post -Uri "https://api-m.sandbox.paypal.com/v1/oauth2/token" -Headers @{ Authorization = "Basic $basic" } -Body "grant_type=client_credentials" -ContentType "application/x-www-form-urlencoded"
$r.access_token
```

Copia el texto largo que empieza con `A21AA…`.

### 3.2 Guardarlo en la configuración de Claude Code

1. Abre el archivo de configuración:
   ```powershell
   notepad $env:USERPROFILE\.claude\settings.json
   ```
   Si Notepad pregunta si quieres crearlo, di **Sí**.
2. Si el archivo está vacío, pega esto (con tu token):
   ```json
   {
     "env": {
       "PAYPAL_SANDBOX_ACCESS_TOKEN": "A21AA...tu token..."
     }
   }
   ```
   Si ya tiene contenido, agrega solo la parte `"env": { ... }` dentro de las llaves principales, separada con una coma.
3. Guarda y cierra Claude Code por completo (`/exit`), luego ábrelo otra vez con `claude`.
4. Comprueba:
   ```
   /paypal:setup
   ```
   Debe decir que el token funciona.

> El token **vence en unas 8 horas**. Cuando veas un error 401, ejecuta `/paypal:setup refresh` o repite el paso 3.1 y reemplaza el valor.

> **Nunca** pongas este token en el proyecto ni lo subas a GitHub. Vive solo en `settings.json` de tu usuario.

---

## Parte 4. Conectar también el MCP de MerchantPilot

En PowerShell (fuera de Claude Code), dentro de la carpeta del proyecto, reemplaza `TU_MCP_API_KEY` por el valor de `MCP_API_KEY` en Render → Environment:

```powershell
cd C:\Users\rudolf\Documents\PayPalMerchant\merchantpilot
claude mcp add --transport http merchantpilot https://merchantpilot.onrender.com/api/mcp --header "Authorization: Bearer TU_MCP_API_KEY"
```

Comprueba los dos:

```powershell
claude mcp list
```

Debes ver `paypal-sandbox` y `merchantpilot` como **connected**. Dentro de Claude Code, `/mcp` muestra lo mismo con sus herramientas.

> Abre antes `https://merchantpilot.onrender.com` en el navegador para despertar el servidor de Render; si estaba dormido, la primera conexión puede fallar por tiempo.

---

## Parte 5. Probar cada herramienta

En Claude Code:

| Prueba | Escribe |
|--------|---------|
| Revisión del código | `/paypal:doctor` |
| Explicar un error | `/paypal:explain-error INVALID_PARAMETER_SYNTAX` |
| Cuentas y tarjetas de prueba | `/paypal:test-accounts` |
| MCP de PayPal | `Usa paypal-sandbox: lista mis últimas 5 transacciones` |
| MCP de MerchantPilot | `Usa merchantpilot: dame los KPIs de los últimos 30 días y las anomalías` |

Guarda el resultado de `/paypal:doctor`; si encuentra algo, compártelo para corregirlo.

---

## Parte 6. La demo para los jueces (los dos MCP + alerta en vivo)

Prepara: dashboard de MerchantPilot abierto en el navegador con el **negocio principal**, y Claude Code al lado. Graba la pantalla.

1. **PayPal MCP ejecuta sin preguntar**
   > *Usa paypal-sandbox: reembolsa 79 USD de la captura 5UY00730991452152.*

   (Usa el ID de una captura tuya; `npm run sandbox:buyer-order` imprime uno nuevo.)
2. **El webhook avisa a MerchantPilot**: en 10 a 30 segundos aparece en la 🔔 **Refund issued 79.00 USD** con el botón *Ask AI*.
3. **MerchantPilot MCP analiza y propone, pero no ejecuta**
   > *Usa merchantpilot: ¿están subiendo los reembolsos? ¿En qué producto? Prepárame las acciones y dame los enlaces para aprobarlas.*

   Claude responde con datos y un **enlace firmado de aprobación**. Ábrelo y aprueba frente a la cámara.
4. **Cierre** (frase para el video):
   > "El MCP de PayPal da las operaciones. MerchantPilot agrega inteligencia, reglas y aprobación humana: la IA propone, el dueño decide."

Variante sin reembolso: *"Usa paypal-sandbox: crea una factura de 250 USD para Hotel Central Plaza y envíala"* → *"Usa merchantpilot: ¿qué facturas tengo pendientes? Prepara recordatorios."*

---

## Problemas comunes

| Síntoma | Solución |
|---------|----------|
| `claude` no se reconoce | Cierra y abre PowerShell; si sigue, reinstala con el comando de la Parte 1 |
| `paypal-sandbox` en rojo / 401 | Token vencido o mal pegado: `/paypal:setup refresh` |
| `merchantpilot` falla | Render dormido (abre la web primero) o `MCP_API_KEY` incorrecta: `claude mcp remove merchantpilot` y repite la Parte 4 |
| Las herramientas no aparecen | Sal con `/exit` y abre `claude` otra vez |
