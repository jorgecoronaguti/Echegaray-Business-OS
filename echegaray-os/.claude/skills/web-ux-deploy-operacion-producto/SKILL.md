---
name: web-ux-deploy-operacion-producto
description: "Diseño de interfaz web, UX por rol (Dirección/Administración/Obras/Campo), autenticación/autorización desde la experiencia de usuario, y estrategia de deploy/operación del Business OS. Activar ante cualquier decisión de pantalla nueva, navegación, permisos visibles, o pregunta sobre cómo/dónde correr el sistema (local/staging/producción)."
allowed-tools: Read, Bash, Grep, Glob
metadata:
  author: echegaray-os
  type: technical
  jurisdiccion-principal: "San Juan, Argentina"
---

# Web, UX, Deploy y Operación del Producto

## Propósito

Esta skill decide **cómo se usa** el Business OS (interfaz, navegación, permisos visibles, confianza/frescura de datos en pantalla) y **cómo se opera** (dónde corre, cómo se despliega, cómo se mantiene). No decide *qué* dato es correcto ni *qué* proceso de negocio existe — eso lo sigue decidiendo la skill de dominio dueña del dato o el `CLAUDE.md` raíz.

## Cuándo activarla

- Antes de agregar una pantalla, sección de navegación o control nuevo.
- Ante cualquier pregunta sobre "¿cómo entro?", "¿qué URL uso?", "¿qué rol necesito?".
- Ante cualquier decisión de deploy, hosting, variables de entorno o dominio.
- Al diseñar qué ve/hace cada rol (Dirección, Administración, Gestión de Obras, Jefe de Obra, Campo).

## Las 12 preguntas obligatorias antes de construir o cambiar una pantalla

1. ¿Quién usa esta pantalla (qué rol real de la organización)?
2. ¿Qué trabajo intenta hacer, no qué módulo técnico representa?
3. ¿Qué decisión necesita tomar con esto?
4. ¿Qué dato necesita ver — y con qué nivel de confianza/frescura (`NaturalezaDato`, `fuentes_datos.estado`)?
5. ¿Qué acción puede tomar desde acá (no solo mirar)?
6. ¿Qué no debe ver (dato sensible, otro rol, otra obra)?
7. ¿Qué puede romper si se equivoca acá?
8. ¿Qué permisos de Postgres/RLS respaldan lo que la pantalla promete (no asumir, verificar policy + GRANT)?
9. ¿Cómo se prueba (Playwright real, no solo compilar)?
10. ¿Cómo se despliega esto (local hoy, qué cambia si migra a hosting)?
11. ¿Cómo se mantiene (quién la actualiza cuando cambie el dato de origen)?
12. ¿Qué pasa si el dato está atrasado/en conflicto — la pantalla lo declara o lo esconde?

## Diseño de experiencia por rol (hipótesis de trabajo, validar contra uso real)

No diseñar pantallas por módulo técnico (una por tabla). Diseñar por trabajo real:

- **Dirección** (2 personas): HOY → DECISIONES → RIESGOS → OPORTUNIDADES → OBRAS → CAJA → ACCIONES → EMPRESA.
- **Gestión/Operación de Obras** (2 personas): HOY → OBRAS → RESTRICCIONES → RECURSOS → PERSONAS → MATERIALES → EQUIPOS → ACCIONES.
- **Campo** (~15 trabajadores): TRABAJO ASIGNADO → QUÉ INFORMAR → INCIDENCIA → RECURSO NECESARIO → FINALIZACIÓN. No asumir que necesitan un dashboard — diseñar la interacción mínima útil según evidencia real de cómo trabajan hoy (papel/WhatsApp/nada), no antes.

Principio: la menor carga manual posible. Nunca pedirle a una persona un dato que el OS ya puede obtener de una fuente confiable (ver `fuentes_datos`).

## Confianza y frescura en pantalla

Toda pantalla que muestre un dato con `NaturalezaDato` distinto de `confirmado` (`observado`, `calculado`, `estimado`, `inferido`, `conflictivo`, `sin_dato`) o que dependa de una fuente en `fuentes_datos.estado != 'actualizado'` debe declararlo visualmente — no presentar todo con la misma autoridad. Ya existe el patrón (`AlertaCard`, banner de frescura en `/motor-decisiones`); reutilizarlo, no reinventarlo.

## Roles y permisos — arquitectura mínima extensible

Roles reales de la organización (no todos implementados hoy, la arquitectura debe poder extenderse sin rehacer el sistema): Dirección / Admin General, Dirección, Administración, Gestión de Obras, Jefe de Obra, Campo/Obrero, Consulta externa (futuro), Soporte técnico/Developer (futuro).

Hoy implementado en `perfiles.rol` + `current_rol()`: `direccion`, `administracion`, `jefe_obra`. Principio: mínimo privilegio, auditoría, trazabilidad, no compartir usuarios, no depender permanentemente de una cuenta personal (ver identidad institucional en `CLAUDE.md` raíz, sección Bloque 12).

## Estrategia de deploy — autorización obtenida, redeploy ya es autónomo

**2026-07-09: Jorge autorizó explícitamente ("autorizo deploy de todo") el paso a producción en Vercel.** A partir de esta autorización: redesplegar el mismo proyecto ya aprobado (nuevos commits, variables de entorno ya definidas) es autónomo, no requiere pedir permiso cada vez. Lo que sigue requiriendo aprobación explícita: dar de alta un servicio nuevo, comprar un dominio, subir de plan pago, o cualquier decisión de infraestructura que implique un costo o proveedor nuevo.

Bloqueo real encontrado al ejecutar el primer deploy: `vercel login` requiere autenticación interactiva (OAuth por navegador, con GitHub/Google/email) — es un paso que estructuralmente solo Jorge puede completar, ningún agente puede iniciar sesión en su nombre. El código ya se empujó a GitHub (`origin/main` actualizado); falta que Jorge complete el login de Vercel una vez (importar el repo desde vercel.com o `vercel login` en su propia terminal) para que el primer deploy quede activo. Una vez logueado el proyecto, los redeploys futuros sí son autónomos.

Cuando se decida desplegar, evaluar (documentar antes de ejecutar, no antes de que exista la decisión):
- Vercel (encaja naturalmente con Next.js App Router) vs. alternativas.
- Variables de entorno / secretos (nunca en código — ya se respeta en `.env.local`, no versionado).
- Dominio, HTTPS, entornos dev/staging/prod.
- Continuidad de backups/logs/monitoreo/rollback (ver verificación de backup/PITR ya hecha en `programa-ejecucion-continua`).
- Autenticación/roles ya construidos migran sin cambios — Supabase Auth no depende de dónde corre el frontend.

## Qué NO hacer

- No convertir el OS en una colección de pantallas lindas sin decisión asociada (regla ya vigente del `CLAUDE.md` raíz para dashboards).
- No construir una pantalla nueva por cada tabla nueva — agrupar por trabajo real del rol.
- No declarar una pantalla "completa" si no está conectada a datos reales o si depende de una fuente sin verificar — marcarla explícitamente como pendiente/parcial/no confiable.

## Checklist de buenas prácticas (aplicar en cada pantalla, no solo al crearla)

Heurísticas de usabilidad ya adaptadas a este proyecto — no una lista genérica copiada, cada punto tiene el criterio concreto de este OS:

1. **Visibilidad del estado del sistema** — el usuario siempre sabe dónde está (nav con página activa resaltada), qué está cargando, y qué acción se acaba de ejecutar (confirmación visible, no solo un cambio silencioso de datos).
2. **Coincidencia con el mundo real** — nombrar por lo que la persona reconoce ("Centro de Acción", "Legajos"), no por el nombre de la tabla o el PRP que lo construyó.
3. **Control y libertad** — toda acción reversible debe poder deshacerse o al menos confirmarse antes de ejecutar (ver Bloque 14 del `CLAUDE.md` raíz: nivel de autonomía D+ requiere esto).
4. **Consistencia** — mismo patrón de `page-error`/RLS/loading en todas las páginas (ya vigente); mismo peso tipográfico para el mismo nivel de jerarquía (no aplicar `font-semibold` a unos links sí y a otros no sin razón).
5. **Prevención de errores** — validar en el formulario antes de someter (Zod ya se usa así), deshabilitar botones cuando falta un dato requerido (ya vigente en `/caja`).
6. **Reconocer antes que recordar** — agrupar navegación por categoría con etiqueta visible (Áreas / Sistema) en vez de una lista plana; no obligar a memorizar dónde vive cada cosa.
7. **Flexibilidad y eficiencia de uso** — accesos directos para quien ya sabe lo que busca, sin estorbar a quien recién entra.
8. **Diseño minimalista** — cada pantalla muestra lo que ese rol necesita para decidir, no todo lo que existe en la tabla.
9. **Ayudar a reconocer y recuperarse de errores** — mensajes de error que dicen qué pasó y qué hacer, nunca un stack trace crudo ni "Application error" (ya vigente, no romper este patrón).
10. **Confianza y frescura visibles** — todo dato no `confirmado` o toda fuente no `actualizado` se declara en pantalla (patrón ya construido, ver arriba).
11. **Accesibilidad básica** — `lang` correcto en `<html>`, foco de teclado visible, contraste suficiente, labels reales en inputs (no solo placeholder).
12. **Performance percibida** — evitar que una pantalla se sienta lenta por falta de feedback, no solo por ser objetivamente rápida.

## Mecanismo de mejora continua (no un documento estático)

Esta skill no mejora por releerla — mejora por auditarse contra páginas reales y dejar rastro accionable. Cada vez que se invoca para una decisión de UX (o al cerrar un ciclo de trabajo que tocó pantallas):

1. Recorrer 2-3 páginas reales (no hipotéticas) contra el checklist de arriba.
2. Todo hallazgo real (no cosmético) que no se resuelve en el momento se carga en `backlog_autonomo` (`tipo = 'mejora_potencial'`, `fuente = 'auditoría UX'`) — reutiliza la infraestructura ya construida, no un tracker paralelo.
3. Todo hallazgo simple, reversible y de bajo riesgo (sin decisión de negocio de por medio) se corrige en el momento, con test Playwright que lo verifique — no se documenta "para después" lo que se puede arreglar ahora.
4. Se registra en la sección "Historial de hallazgos" de abajo qué se encontró y qué se hizo — para que la próxima auditoría no repita el mismo hallazgo ni pierda contexto de qué ya se decidió no tocar y por qué.

### Historial de hallazgos (append-only, más reciente arriba)

- **2026-07-09** — Jorge autorizó el deploy productivo explícitamente. Se empujaron ~20 commits locales que nunca habían llegado a `origin/main` (el código vivía solo en esta máquina, ni siquiera en GitHub). Bloqueo real: `vercel login` exige OAuth interactivo, no completable por un agente — pendiente que Jorge lo complete una vez para activar el primer deploy.
- **2026-07-08** — Auditoría inicial de la skill. Encontrado y corregido: (1) `src/app/page.tsx` era un placeholder sin redirección — `localhost:3000` no llevaba a ningún lado real (violaba #1 y #9); ahora redirige a `/login` o `/dashboard` según sesión. (2) Navegación de 14 links planos sin jerarquía ni agrupación (violaba #4 y #6); ahora agrupada en "Áreas" / "Sistema" con etiqueta visible. (3) Ningún link de navegación indicaba la página activa (violaba #1); ahora `NavLink` (`src/shared/components/NavLink.tsx`) resalta la página actual. (4) `<html lang="en">` en una app 100% en español (violaba #11); corregido a `lang="es"`. No se encontraron ni corrigieron temas de contraste/foco de teclado en esta pasada — pendiente para la próxima auditoría.
