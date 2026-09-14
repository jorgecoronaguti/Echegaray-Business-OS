# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-14 (−03) · main = producción_

## 1. OBJETIVO GENERAL

Echegaray Business OS: app web (Next.js + Supabase), datos, motores determinísticos e IA para operar
Echegaray Construcciones. XSAS es la capa de inteligencia operativa. Claude Code sólo desarrolla.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · P&L devengado · Cash Flow percibido
- Evidencia antes que inferencia · FALTA_DATO / CONFLICTO explícitos · edición manual del dueño = verdad
- Nivel E = firma del dueño · nunca debilitar RLS · padrón: nunca alta/baja de personas
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- Nadie cierra su propio trabajo (auditor-de-cierre / qa-visual) · responder al dueño por el bot

## 3. ARQUITECTURA (lo que se usa seguido)

- Web: Vercel desde `main`. Backend: push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`.
- Migraciones desde main: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) y `--aplicar`.
- Consultas a la base: script en scratchpad que importa `orquestador/lib/db.mjs` (`query`).
- Avisos: `node orquestador/scripts/avisar-al-dueno.mjs < archivo.md`. Mapa: `.claude/MAPA.md`.

## 4. CERRADO HOY (14/09) — EN PRODUCCIÓN

- **Liquidación v1 (69a4f148, desplegado y firmado):** un cuadro (Quincena) + menú «Más»; filtro «Cobra:
  Por quincena / Mensuales / Liq. finales»; buscador; «estimado» en todo costo con multiplicador 1,6713.
- **Importador JORNALES → registros_hh:** lo corregido a mano en Liquidación/Asistencia gana sobre la
  planilla; jefe/tramo de ausencia/borrados siguen cediendo (alcance firmado, memoria
  `web-gana-alcance-liquidacion`). Deploy en VM hecho; FALTA leer el journal de la corrida horaria:
  esperado GANA LA WEB 0 · A PISAR 0; fila 62b019cd sigue 13 h `web:asistencia-obra`.
- **Datos:** `convenio_escala` cargada desde `uocra_escala` zona A (184 filas, autorizado); padrón
  Petina → oficial (recibo), Castillo → ayudante (alta ARCA, elegido por el dueño). Respaldos en
  `orquestador/datos/respaldos/`. Regla nueva: categoría = recibo/IERIC/alta (memoria actualizada).

## 5. ABIERTO — EN RAMAS SIN MERGEAR

- `feat/liquidacion-brecha-uocra` (worktree `.claude/worktrees/liquidacion-un-cuadro`, commits 80042f0a +
  f13f9e1b): marca «−N% bajo el básico UOCRA» junto al $/h. QA visual OK (tooltip corregido después).
  Mergear y desplegar si el rediseño de abajo no la reemplaza.
- `fix/hh-obra-gente-de-la-app` (worktree `.claude/worktrees/hh-obra`): vacío. Borrar si no se usa.

## 6. PENDIENTES (ordenados)

**P0 · REHACER LIQUIDACIÓN (dueño 14/09, textual):** «demasiado resumido, no puedo modificar el valor
hora, no tengo referencias de valores hs históricos de cada uno, deja afuera detalles relevantes,
rehacer toda la sección». Antes de diseñar: preguntarle qué columnas del bloque JORNALES necesita ver
(alta, categoría, días/horas, $/h, banco, adelantos, efectivo, total) y mostrar mockup. Hechos: $/h vive
en `persona_tarifa` (versionado por `desde`, sin UI de edición en el cuadro); historial de $/h =
filas de `persona_tarifa` por persona.

**P1 · HH de obra 2026 (dueño: «no tomás bien a la gente»; sólo 2026).** Medido: celdas diarias
base = planilla. Diferencias: (a) horas escritas en columnas SIN fecha en el encabezado (R/S/T de
«Obreros 26», ej. Tello bloque 04/05 +16 h, Quiroga S 16/02 +8 h) — el total de la planilla las
suma, la base no (no hay fecha); (b) celda 11/06 = 70 h (Alaniz/Agüero/Rosales, FALTA_DATO del dueño);
(c) extras ponderadas: planilla suma 8,5 (4 + 3×1,5), base 7 h físicas (correcto); (d) Agüero bloque
18/05: total planilla 80 vs celdas 88. La vista `hh_que_cuentan_en_obra` NO debe volver a contar
obreros de la app (dueño 13/09). Decidir con el dueño (a) y (d).

**P1 · COBRANZAS «vencido» mal (dueño 14/09).** Causa medida: la lista de la ficha (`cliente_cobranza`,
migr. 20260911T0920:60-62) y la cartera (`obra_cuenta`, 20260910T2356:114-116) usan emisión + 30 días;
el Sheet (col U) y el portal usan Q (fecha cobro). Con Q hoy hay 0 vencidas de 35 abiertas; con
emisión + 30, muchas. Hay ~5 definiciones (mapa completo en la sesión: cuenta corriente, esquema,
portal `estadoDePago`, cash-briefing, tabla vieja `public.cobranza`). Objetivo del dueño: UNA definición
en Postgres = la del Sheet (O=Pendiente y Q<hoy) consumida por ficha, cartera y portal.

**P1 · CRM documentos faltantes (dueño 14/09).** Causas medidas: 31 carpetas de cliente en Drive vs 5
clientes en el CRM; tope 300 archivos por carpeta de cliente (ARCOR 542); `obras-carpetas-drive.mjs`
sin timer (226 de 1.252 archivos atados a obra); cotizaciones de Drive no llegan a Presupuestos
(sólo `cotizacion_cascada`). Dar de alta clientes = decisión del dueño.

**P2 · Messina (respondido por bot 14/09):** A-227 figura pendiente en Cobranzas pero la paga la O/P 5146.
Portal: accesos en la ficha → costado «Portal del cliente» (`?portal=1`); en la cara Cobranzas no hay
enlace (sumarlo al arreglar Cobranzas).

**Del dueño (FALTA_DATO):** horas jefes 08/08–31/08 en «Oficina 26» · repartir 70 h del 11/06 ·
Mis Facilidades ARCA (multiplicador) · datos Santander Ochoa/Castillo.

## 7. ESTADO GIT

- main = origin/main = producción VM: 69a4f148 (+ este traspaso) · árbol principal limpio
- ramas abiertas: `feat/liquidacion-brecha-uocra`, `fix/hh-obra-gente-de-la-app` (ver §5)

## 8. PRÓXIMO PASO

Sesión nueva: P0 Liquidación (preguntar detalle + mockup antes de construir). Cobranzas y CRM
documentos, cada uno en su sesión.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
