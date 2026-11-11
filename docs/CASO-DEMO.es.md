# Caso de demostración: Altura Coffee

Historia única que usamos en la app, en el video y en la descripción de Devpost. Todo es ficticio: los datos de demo se generan solos (botón **Reset demo** los restaura) y los mismos casos se pueden reproducir con cuentas sandbox de PayPal.

## El negocio

**Altura Coffee** es una marca de café de especialidad con tres líneas de negocio. Una sola dueña las maneja todas desde PayPal y no tiene analista financiero.

| Negocio en la app | Qué vende | Cómo cobra con PayPal |
|---|---|---|
| **Altura Coffee Supply** (principal) | Equipo de café y granos en línea; **Coffee Club** por suscripción; venta al por mayor a cafeterías y hoteles | Checkout de PayPal, **Subscriptions**, **Invoicing** |
| **Altura Coffee Shop** | La cafetería física: espresso, capuchino, desayunos, granos para llevar | Pagos con tarjeta y PayPal en tienda, **membresía** mensual de café |
| **Altura Barista Academy** | Cursos de barista en línea y un bootcamp de negocio | Pagos únicos y **membresías** mensual y anual |

**Clientes mayoristas:** Café Lumbre, Northside Roasters, Bean & Leaf Bistro, Hotel Central Plaza y Campus Coffee Co-op.

**Planes del Coffee Club:**

- **Monthly 1kg:** 29 USD al mes.
- **Bi-weekly 500g:** 17 USD cada 2 semanas.
- **Office Coffee Plan:** 149 USD al mes.

## Los 8 casos que se simulan

| # | Qué pasó | Dónde se ve en la app | Qué hace la IA | Cómo reproducirlo en sandbox |
|---|---|---|---|---|
| 1 | **Lote dañado:** se dispara el reembolso del *Ceramic Pour-Over Kit* en los últimos 10 días | Overview → *Refunds by product*; **Disputes & refunds** → *Refunds per week by product* | Explica la causa, agrega la gráfica que lo prueba y propone reembolsos para aprobar | `npm run seed:sandbox -- --payments 40 --refunds 10` |
| 2 | **Problema con la paquetería:** disputas de "no recibido" concentradas en México y Colombia | **Disputes & refunds** → por país, por motivo y el medidor del caso más urgente | Prioriza por fecha límite, arma el paquete de evidencia en PDF y lo envía tras tu aprobación | `npm run sandbox:buyer-order` + abrir la disputa como comprador (guía, sección 2) |
| 3 | **Mayoristas atrasados:** Northside Roasters y Bean & Leaf Bistro deben facturas de 6 a 34 días | **Collections** → antigüedad, días de atraso, quién debe y qué productos | Prepara recordatorios y ofrece **planes de pago** en cuotas | `npm run seed:sandbox -- --payments 0 --invoices 20` |
| 4 | **El Coffee Club pierde suscriptores:** las cancelaciones del plan *Bi-weekly* se dispararon este mes | **Subscriptions** → widget de ingresos recurrentes, cancelaciones por semana | Explica qué plan pierde clientes y propone una oferta de recuperación | `npm run sandbox:subscription -- --plan biweekly --cancel` |
| 5 | **Renovaciones fallidas:** suscripciones suspendidas por pagos rechazados (ingreso mensual en riesgo) | **Subscriptions** → *MRR at risk* y tabla ordenada por pagos fallidos | Escribe el mensaje para actualizar el método de pago y calcula cuánto se recupera | `npm run sandbox:subscription -- --plan monthly --suspend` |
| 6 | **La cafetería vende menos** que el mes anterior | **Portfolio** → calificación de salud y comparación de los 3 negocios | Escribe el resumen para la dueña: qué negocio atender primero y por qué | (datos de demo) |
| 7 | **Un comprador nuevo de otro país** paga por primera vez y otro **cancela en el checkout** | **Sales & customers** → *New vs returning* y país; aviso 🔔 en tiempo real | Aviso inmediato por webhook firmado | `npm run sandbox:buyer-order -- --item grinder` (y cancelar en otro intento) |
| 8 | **Fallos y casos límite:** pago rechazado, reembolso mayor al cobrado, doble reembolso, webhook falso | Terminal y 🔔 (no debe pasar nada malo) | Bloquea la acción con un mensaje claro; nada se cobra dos veces | Guía de pruebas, sección 9, punto 05 |

## Recorrido para el video (menos de 3 minutos)

1. **Problema (20 s):** la dueña vive en PayPal pero no ve *por qué* se mueve su dinero.
2. **Overview (25 s):** dinero en riesgo, ingresos recurrentes y pronóstico. Pregunta *"Why are refunds up?"* → la IA encuentra el lote dañado (caso 1) y agrega la gráfica.
3. **Aprobar (30 s):** *"Chase overdue invoices"* → aparece la tarjeta en el chat → **Approve** → se ejecuta en PayPal y queda en la auditoría (caso 3).
4. **Recorrer las páginas (40 s):**
   - **Sales & customers:** treemap, sunburst y pivote.
   - **Disputes & refunds:** el medidor marca 0 días para responder (caso 2).
   - **Collections:** antigüedad de las facturas.
   - **Subscriptions:** el plan Bi-weekly pierde suscriptores (casos 4 y 5).
5. **Varios negocios (20 s):** Portfolio → la cafetería aparece con ventas a la baja (caso 6).
6. **En tiempo real (20 s):** un pago en sandbox → aviso 🔔 con el botón *Ask AI* (caso 7).
7. **Cierre (15 s):** arquitectura y confianza: la IA propone y la dueña decide; widgets propios de AG Studio, Agent Toolkit de PayPal, webhooks firmados.
