# Plan de trabajo hasta la entrega (12 de noviembre de 2026)

## Estado actual (semana 0 – listo)

- ✅ **App base:** Next.js 16 + TypeScript sobre el boilerplate oficial de PayPal + AG Grid.
- ✅ **Datos PayPal:** transacciones, disputas y facturas, en modo *live* (sandbox) y en modo *demo* con una historia integrada.
- ✅ **AG Studio:** dashboard inicial con KPIs, tendencias, reembolsos por producto, tablas y panel de IA.
- ✅ **Agente propio "MerchantPilot":** usa el Agent Framework de AG Studio y delega a los agentes nativos de Studio.
- ✅ **Proxy de IA en el servidor:** OpenAI o Anthropic, con streaming y límites de uso.
- ✅ **Action Center (humano en el ciclo):** las acciones se ejecutan con el PayPal Agent Toolkit.
- ✅ **Pruebas:** unitarias (Vitest), e2e en navegador (Playwright), smoke test post-deploy y verificación de entorno.
- ✅ **Deploy:** `render.yaml` listo.

## Lo que falta validar con llaves reales (prioridad 1, esta semana)

| Riesgo | Cómo validarlo | Si falla |
|---|---|---|
| El modelo real usa bien las herramientas y delega a "lead" para crear gráficas | Probar los 4 *prompt starters* con tu llave | Ajustar `MERCHANTPILOT_INSTRUCTIONS` en `components/studio/paypal-agent.ts` |
| Los esquemas de herramientas de Studio son compatibles con OpenAI/Anthropic | Mirar errores en la terminal de `npm run dev` | Cambiar de proveedor con `LLM_PROVIDER` o simplificar esquemas |
| Ejecución real en sandbox: reembolso, recordatorio y aceptar disputa | Aprobar una acción en modo *live* | Revisar el mensaje de error en el historial del Action Center |
| Transaction Search tarda hasta 3 horas | Correr `seed:sandbox` el primer día | Usar modo demo en la URL pública |

## Semanas

**Semana 1 (3–9 oct): cuentas y validación**

- Crear las cuentas: PayPal Developer, OpenAI o Anthropic, Render y GitHub (ver `SETUP.es.md`).
- `npm run check:env` en verde, `npm run seed:sandbox` y crear 2 o 3 disputas.
- Webinar "Start building with PayPal" (6 oct, 9:00 AM PT).
- Webinar de APIMatic (7 oct).
- Deploy temprano en Render, en plan *free*, para detectar problemas de despliegue desde ya.

**Semana 2 (10–16 oct): calidad del agente**

- Webinar "Build a payments dashboard without building a dashboard" (12 oct): es justo nuestro caso.
- Ajustar los *prompts*, sobre todo en español e inglés.
- Agregar respuestas más visuales (tarjetas de hallazgos).
- Agregar el componente `aiToolDisplay` para que las propuestas muestren **Aprobar/Rechazar dentro del chat de Studio**. Esto puntúa en "custom widgets" para el premio de AG Grid.

**Semana 3 (17–23 oct): diferenciadores para los premios**

- Widget personalizado de AG Studio, por ejemplo "Dinero en riesgo" o un semáforo de disputas: muestra los widgets propios que pide AG Grid.
- Tema visual de AG Studio con los colores de la marca (`createStudioTheme`).
- "Resumen matutino" automático: un job programado (Render Cron o Workflows) que corre el análisis y deja propuestas listas.
- Persistencia de acciones en Postgres de Render, para que sobrevivan a los redeploys.

**Semana 4 (24–30 oct): pulido**

- Vista móvil del Action Center, estados de error y textos.
- Página de inicio con capturas.
- Pruebas con 2 o 3 personas reales, por ejemplo un pequeño comercio de Guatemala, para dar credibilidad a la historia de impacto.

**Semana 5 (31 oct – 6 nov): material de entrega**

- Pedir la **licencia de AG Studio alrededor del 1 de noviembre**, para que cubra la evaluación.
- Guion y grabación del video (menos de 3 minutos): problema (20 s) → pregunta y gráfica (60 s) → aprobar y ejecutar en PayPal (45 s) → arquitectura y seguridad (25 s) → impacto (20 s).
- README final, capturas y descripción para Devpost.

**Semana 6 (7–12 nov): margen**

- **Entregar el 10 de noviembre**, dos días antes del cierre.
- Congelar el código y dejar la URL en plan *starter* hasta el 21 de diciembre.

## Premios a los que apunta

- **Grand Prize** (1.º a 3.º lugar).
- **Best Use of PayPal + AI** o **Most Impactful**: solo se puede ganar uno de los grandes o una mención.
- **Best Use of AG Grid** (5 ganadores): es el premio de patrocinador más probable.
- Alternativa de patrocinador: **APIMatic** (Context Plugin) o **Render**. Solo se puede ganar un premio de patrocinador.
