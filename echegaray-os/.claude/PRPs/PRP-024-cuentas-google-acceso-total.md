# PRP-024: Cuentas Google — acceso total (Drive, Gmail, Calendar, multiusuario)

> **Estado**: PENDIENTE — 2026-07-15
> **Subordinado a**: PRINCIPIO DE AUTONOMÍA (Niveles A–E) y de UTILIDAD del `CLAUDE.md` raíz. Nivel E (mandar mail, crear evento) SIEMPRE requiere aprobación humana.
> **Habilita a**: PRP-021 (caja: leer/enviar reclamos), PRP-022 (login Google), PRP-014 (especialistas operadores), y la lectura/escritura plena en Drive.

---

## Objetivo

Que el OS acceda de forma legítima a la **cuenta Google Workspace completa** de Echegaray — Drive (leer/crear/editar en cualquier unidad), Gmail (leer/borrador/enviar con aprobación) y Calendar (ver/crear con aprobación) — actuando **en nombre de la cuenta que corresponda**, no de un service-account sin buzón.

## Por qué

| Problema | Solución |
|---|---|
| El Service Account **no tiene buzón ni storage propio**: no crea archivos en My Drive, no ve Gmail/Calendar | Domain-wide delegation: el SA **impersona** una cuenta @ecsas real y opera como ella |
| Cobranzas/fiscal viven también en mails y vencimientos en el calendario | Leer Gmail/Calendar habilita reclamos, conciliaciones y alertas de vencimiento reales |
| Multiusuario necesita que cada quien opere sobre su propio Drive/mail | Impersonación por usuario (subject = su cuenta) |

**Valor**: cierra el mayor límite operativo detectado (la SA sin buzón/storage) y habilita autonomía real de Nivel C–D, con Nivel E siempre a aprobación.

## Estado real verificado (NO reconstruir)

- SA `echegaray-os-workspace@echegaray-business-os.iam.gserviceaccount.com`, scope Drive **completo** (`drive`) + `spreadsheets` ya configurado.
- **`makeGoogleClient({ impersonate })` YA soporta domain-wide delegation** (`clientOptions.subject`). El código está listo; falta la **configuración en Google Workspace Admin** (autorizar el client-id del SA para los scopes) — acción del dueño.
- SA hoy: lee Sheets/Excel/PDF, escribe en Unidad Compartida (id `0AGWc_DLIKZMJUk9PVA`). NO Gmail, NO Calendar, NO My Drive nativo.
- Cola de aprobación (`pending_operations`) + policy A–F ya existen para gatear Nivel E.

## Fases

- **F0 — Desbloqueo del dueño (1 vez)**: en Google Workspace Admin, autorizar domain-wide delegation del client-id del SA para los scopes: `drive`, `spreadsheets`, `gmail.readonly` + `gmail.compose`/`gmail.send`, `calendar`. Definir la(s) cuenta(s) a impersonar. **Sin esto, F1–F4 no arrancan.**
- **F1 — Drive pleno por impersonación**: el OS crea/edita en el My Drive de la cuenta impersonada (no solo Unidad Compartida); ABM completo de archivos/carpetas con `supportsAllDrives`. Reusa las tools de Drive ya construidas.
- **F2 — Gmail (lectura + borradores)**: leer hilos relevantes (cobranzas, proveedores, AFIP), buscar por remitente/asunto; generar **borradores** de respuesta/reclamo. Nivel A–C. Nada se envía solo.
- **F3 — Calendar (lectura + propuestas)**: ver vencimientos/reuniones; proponer eventos (vencimientos fiscales, hitos de obra, cobros). Crear evento = Nivel E → aprobación.
- **F4 — Envío con aprobación (Nivel E)**: mandar un mail (reclamo de cobranza, comunicación a proveedor) o confirmar un evento SOLO desde la cola de Pendientes con visto bueno humano explícito; todo queda atribuido (PRP-022) y en el ledger.

## Criterios de éxito
- [ ] El OS crea un archivo en el Drive de la cuenta real (no solo Unidad Compartida) por impersonación.
- [ ] El OS lee un hilo de Gmail y prepara un borrador, sin enviarlo.
- [ ] Un envío/evento externo NO ocurre sin aprobación humana explícita (verificable: queda en Pendientes).
- [ ] Toda acción Google queda atribuida a un usuario y registrada.

## Dependencias y acción del dueño
- **Bloqueante**: F0 (config en Workspace Admin) — solo el dueño/admin del dominio puede hacerlo.
- Se combina con PRP-022 para impersonar la cuenta del usuario que opera.

## Riesgos
- Scopes amplios = superficie sensible: Gmail/Calendar de solo lectura primero; envío estrictamente Nivel E con aprobación. Nunca guardar tokens en git/logs. Registrar cada impersonación (quién, qué cuenta, qué hizo).
