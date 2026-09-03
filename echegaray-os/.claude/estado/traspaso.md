# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-03 · cierre de la maratón 02-03/09_

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones. Integra
aplicación web (Next.js + Supabase), datos, automatizaciones, motores determinísticos e IA para que
Dirección y la empresa operen desde una única plataforma. XSAS es la capa de inteligencia operativa
del OS: el usuario trabaja desde la app con lenguaje natural, interfaces y archivos, sin conocer
tablas, skills ni código.

Claude Code NO es la interfaz operativa del negocio: se usa únicamente para desarrollar, corregir,
probar y evolucionar el OS y XSAS. Prueba definitiva: Jorge puede cerrar Claude Code, entrar a
/xsas y hacer su trabajo diario.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje central · una fuente de verdad por concepto (Postgres cuando lo consumen varias caras)
- Plan vs Real vs Forecast · P&L devengado · Cash Flow percibido
- Datos y evidencia antes que inferencia · no inventar · FALTA_DATO cuando falta evidencia · CONFLICTO cuando las fuentes se contradicen
- Preservar genealogía/provenance · edición manual del dueño = verdad definitiva
- Acciones sensibles: autorización + RBAC + auditoría + verificación (Nivel E = firma humana)
- Deterministic first · skills/capabilities/tools first · Reasoner/LLM sólo cuando aporte valor real
- Reutilizar motores/datos/capacidades existentes antes de crear otros
- Minimizar llamadas, tokens, costo y complejidad — el límite semanal de Claude Code es recurso escaso
- UX simple, compacta, operativa · less is more
- Conocimiento y experiencia real ECSAS priman sobre generalizaciones externas
- Nadie cierra su propio trabajo · evidencia del EFECTO, no del intento

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza (medido: ~94% de pedidos sin modelo).

Piezas: gateway XSAS (`servidor-entrante.mjs`, user unit `echegaray-xsas-gateway`, sirve
app.ecsas.com.ar/xsas) · orquestador (`orquestador/lib|scripts|comunicacion`) · Sheet «Flujo de
Caja - Cash Flow» regenerado por pipeline (timer cada 2h) · Supabase como fuente única · web por
Vercel (push a GitHub) · bot @os en Mattermost. Deploy backend = push a origin main + `git pull
--ff-only` en `~/echegaray-os/produccion/echegaray-os` (+ restart del gateway sólo si toca /xsas).
Antes de buscar nada: `.claude/MAPA.md`.

## 4. ESTADO ACTUAL

_actualizado 03/09/2026 10:25, sesión en curso_

- **Producción == main == `edb944cb`** (gateway reiniciado 10:24). Suite completa `orq:test` verde en las dos integraciones de hoy.
- Desplegado hoy: (1) cotizador con adjuntos NO toca Drive, clasifica plano por nombre+texto, persiste `razonamiento.procedencia`; (2) CAJA garantiza 68 filas en el mismo lote que los gráficos y relee (rojo si no); (3) `/presupuestos/[id]` reconstruida como entorno xsas v5 (conversación 648 px + presupuesto vivo, Oferta/Costos, cajón `?insp=`, modo determinístico, congelada acepta preguntas). Re-auditoría de (3) corriendo.
- **Timer `echegaray-flujo-caja.timer` DETENIDO por el OS a las 09:04** (el dueño vio valores pisados). Se reactiva sólo cuando la guarda por celda (`sheet/propiedad-por-celda`, worktree `.claude/worktrees/sheet-propiedad`) firme: el auditor la rechazó (updateSheetValues descartaba el recorte; ~470 celdas calculadas se congelarían en la 1ª corrida; siembra inútil). Segunda ronda en curso.
- Orden del dueño 03/09: «el Sheet es un documento vivo automático; mis ediciones (escribir, borrar, modificar, agregar, sacar, diseño, mover, copiar/pegar) mandan siempre». Firma por pestaña sigue APAGADA (ORQ_AUTOCANDADO) a propósito.
- Hoy a mano (efecto leído): extracto Santander al 03/09 importado (+4 mov, `_BANCO_RAW` 543), USD 507,53 en CAJA B10/D10, echeq 369 DEBITADO (--forzar-candado con extracto), `_MOVIMIENTOS` reconstruido (1.183 mov) tras 3 timeouts de 45 s → drop-in `ORQ_GOOGLE_FETCH_TIMEOUT_MS=180000` en el service.
- Sin evidencia de celdas del dueño revertidas por las corridas de hoy (diff triple de snapshots): pedirle pestaña+celda si insiste.

## 5. TRABAJO DE LA SESIÓN 03/09 (todo mergeado y desplegado)

**Cotizador — las 8 mejoras del informe, hechas y verificadas en producción.**
- Línea de base MEDIDA, no estimada: reconstruida de los timestamps del caché de láminas (125
  entradas, 7 corridas, 118 intervalos). Mediana **32,5 s por lectura**; la corrida más larga son
  **54 lecturas en 43,5 minutos**, todas en fila india. Es el número que hay que batir.
- Paralelismo (`990b2c65`): láminas y vistas con concurrencia acotada (4). El resultado se coloca en
  el índice de su unidad y las métricas se anotan en una pasada posterior — en orden de llegada, dos
  corridas idénticas darían los mismos números en distinto orden y la `huella()` se vuelve ruido.
- Caché de lecturas a Postgres (`orq.plano_lectura_cache`), promoción perezosa desde disco: los 135
  archivos se mudan solos, sin script. Migración aplicada; ya tiene 13 filas.
- `topeUsd` degrada en vez de gastar. Apareció de paso que validarlo con `Number.isFinite(Number(null))`
  daba 0: **toda corrida sin tope salía degradada entera**.
- Circuito operable (`62697dc8`): columna `medicion`, progreso fino («lámina 2 de 5»), vencimiento a
  los 10 min con latido cada 60 s, y cancelar por RLS con GRANT sobre la sola columna `estado`.
- **A1 cumplido**: primera corrida real de punta a punta, encolada por la misma RPC que usa la web.
  `LISTO` en 7 s, presupuesto `7abc7061` creado, 7 pasos, `progreso {vistas 11/11}`, caché 0→13.
  Ojo: fue rápida porque el plano YA estaba cacheado — **no demuestra la aceleración**.
- Jitter en el backoff (`d59d6eb6`): cuatro láminas que reciben 429 juntas dormían lo mismo y volvían
  a chocar en bloque, reproduciendo el pico. El backoff exponencial ya existía; el jitter no.

**Gráficos de CAJA — tercer reporte del dueño, causa raíz distinta a las dos anteriores.**
- Los cuatro anclaban BIEN (filas 22, 37, 52). El defecto era **el alto de la hoja**: 55 filas donde
  el layout necesita 68. El editor vivo no dibuja un gráfico fuera de la hoja: lo sube hasta que
  entre. Hacen falta **284 px POR DEBAJO** del ancla, no que la fila exista.
- Se repetía porque **la guarda de formato estrenada ese día frenaba el arreglo**: clasificaba
  cualquier `updateSheetProperties` como diseño. `echegaray-flujo-caja.service` venía fallando con
  `status=1` en cada corrida por esto. Corregido en `29abd22d` mirando `fields`, no el tipo.
- Hoja llevada a 68 filas y verificado por PDF+PyMuPDF: los 4 gráficos separados.

**La auditoría independiente RECHAZÓ ese cierre, y tenía razón.** Mi afirmación «no abre la puerta a
achicar» era falsa: `clasificarRequest` clasifica, no frena; quien frena es `frenaRequest` y sólo
sobre pestañas **candadas a mano** — y la firma está apagada desde el 05/08, o sea que casi ninguna
lo está. Antes el achique lo frenaba de rebote la guarda de formato; al eximir los requests de
tamaño quedó sin nadie que lo mire. Medido: `ACHICAR 68→10` pasaba y borraba 58 filas. Corregido en
`b95456f8`: la clasificación marca `borraContenido` y el portón lo frena **sin ponderar candados**.
Latente, no activo: los 20 emisores usan `Math.max`. Re-verificación del auditor: en curso.

## 6. PENDIENTES REALES

P0 — esperan al DUEÑO, no arrancan solos:
- **Cotizar un plano NUEVO desde el navegador.** Es lo único del cotizador sin probar: mi corrida
  entró por la RPC del servidor, no por la pantalla. Falta ver el progreso en vivo, el botón de
  cancelar, y el número real de cuánto tarda un plano no cacheado ya paralelizado (contra 43,5 min).
- **¿Se borra el presupuesto `7abc7061`?** Es la sonda A1, quedó como presupuesto real.
- **La Estrella**: que Rodrigo confirme si los pagos en efectivo de `CONTROL DE GASTOS`
  («Pagos en EFECTIVO (2)», 05/09→04/12/25) ya están facturados en `102025`/`Compas E8`. Es lo único
  que traba decidir si esos **$25.141.687** suman o duplican.
- Banco 179-091383/6: $45.080 sin explicar — hace falta el extracto real del Santander.
- Messina: falta el PDF real de la OC 00002-00002266 para archivarla en Drive, y los datos de
  explosión de costos si se quiere proyectar la obra (hoy sólo está el ingreso en Cobranzas).

P1 — técnicos, con cabeza fresca:
- `concurrencia: 4` del cotizador **no está medida** contra el límite de tasa real del proveedor.
  El jitter reduce el riesgo, no lo cierra. La primera corrida grande lo va a mostrar.
- Deuda declarada por la auditoría, ANTERIOR a esta sesión: `huellaDeRango(PESTANA)` hashea sólo
  filas/columnas congeladas, así que la decisión sobre un `hideGridlines` o un `tabColor` se toma
  mirando otra cosa. Se clasifica, no se protege.
- `clasificar-request.mjs:58`: la máscara ancha no reconoce `gridProperties.*` (ningún generador la
  emite; queda declarado).
- Cruce coherencia «lo que se les TRANSFIERE» (Nómina hecho vs Jornales plan 50/50): rojo falso.
- Hitos 2-4 entorno presupuestos v5 · GATE 3: exponer `lib/cotizador/` y el PDF como tools.

## 7. ESTADO GIT Y PRODUCCIÓN

- Rama `main`. Producción (`~/echegaray-os/produccion/echegaray-os`) se actualiza con
  `git pull --ff-only origin main` + `systemctl --user restart echegaray-orq-worker.service`.
- **El timer `echegaray-flujo-caja.timer` está ACTIVO** (cada 2 h), no frenado como decía el
  traspaso anterior. Verificarlo, no asumirlo.
- Migraciones aplicadas a producción en esta sesión: `orq.plano_lectura_cache` (con su GRANT, que
  la migración original no traía) y la de `cotizacion_lectura` (medicion + CANCELADO + vencer()).

## 8. PRÓXIMO PASO

Esperar la re-verificación del auditor sobre `b95456f8` y correr `npm run orq:test` completo cuando
termine la corrida del Flujo de Caja (no en paralelo). Después, el dueño cotiza un plano nuevo desde
el navegador: esa corrida entrega a la vez la prueba de la pantalla y el número que cierra B1/B2.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
