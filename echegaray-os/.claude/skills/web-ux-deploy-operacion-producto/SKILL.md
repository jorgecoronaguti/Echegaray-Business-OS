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

## Estrategia de deploy — no ejecutar sin autorización explícita

Mientras no exista hosting productivo definido: el sistema corre en `localhost:3000` vía `npm run dev`, conectado al proyecto Supabase real (no local/Docker). Nunca ejecutar un deploy productivo (Vercel u otro) sin aprobación explícita de Jorge — es una decisión de infraestructura/costo/seguridad, no solo de código.

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
