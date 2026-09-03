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

- **Producción == main == `2e0990e2`.** Suite completa `orq:test` VERDE (exit=0) al cierre 03/09.
- **Freno de Sheets LEVANTADO por el dueño** (02/09, marca archivada `levantado-20260902-1908`);
  timer `echegaray-flujo-caja.timer` ACTIVO (cada 2h, 06:50–20:50). Verificar con `frenar()`, no asumir.
- Flujo de Fondos → Postgres operativo y auto-actualizado: tablas `flujo_movimiento`,
  `flujo_periodo`, `flujo_corrida` (vigente = ancla), `flujo_asimetria`; sync es paso del pipeline.
  Design va a consumir de ahí.
- Pestaña «Impuestos y Financieros» reconstruida y auditada al centavo (saldo IVA a favor
  $4.046.759); Rodrigo tiene la posición confirmada.
- XSAS: gateway vivo, cotizador arranca por plano adjunto sin frase mágica, memoria conversacional,
  composición por contrato, fusible de gasto Anthropic activo (`ORQ_IA_PERMITIR` obligatorio para
  llamadas pagas; en Claude Code exportar `ORQ_IA_PERMITIR=claude-code-explicito` a propósito).
- Cola `sinFirma`: ~55 capacidades de escritura esperan firma del dueño (`lib/xsas-permisos.mjs`).
- Trampas vigentes: el generador REACOMODA filas (nunca marcar celdas por posición y correr el
  generador después) · archivos con `\x00` silencian grep → `grep -a` · `readSheetGrid.valor` es
  FORMATEADO, la especie se juzga con `.numero` · `git merge` encadenado tras `cd` al worktree es
  no-op: merge en Bash separado desde el árbol principal y deploy verificado POR HASH · el build de
  Next no corre en worktree · Sheet NUNCA desde worktree · UNA corrida de orq:test por VM.

## 5. TRABAJO DE ESTA SESIÓN (maratón 02-03/09, todo desplegado)

- Cotizador por plano: adjunto arranca el flujo, obra deducida del rótulo, 404 de Drive no tumba,
  «Lectura del plano» en /presupuestos (base: `~/presup.zip`, Presupuestos v5).
- Flujo de Fondos → Supabase (commit `83988902`) + sync en pipeline; probado en vivo con el timer.
- «Impuestos y Financieros» reconstruida de fuentes reales (F.2051 + ARCA + Libro), auditor tercero
  firmó; causa raíz del 31/08 corregida (`centinela crudo` en huella-celda, `7de2b069`).
- Auditores curados (especie sobre `numero`, SUBCONTRATISTAS declarada) · pivots «Deuda viva (OS)»
  a rango abierto · recibo 12 Nasser en Drive + bot.
- Último fix: la advertencia de piso se retiró del titular del Cash Flow (no cabía, medido); el
  aviso vive en `asimetria-cash-flow.mjs` (`2e0990e2`). Suite completa re-corrida → exit=0.

## 6. PENDIENTES REALES

P1 (esperan dato/decisión del DUEÑO, no arrancar solos):
- Banco 179-091383/6: $45.080 sin explicar — hace falta el extracto real del Santander.
- Cargas de admin: 19 facturas «Pendiente» ($171.314) sin fecha de pago + $15,18M de ARCA que
  Compras no tiene (afecta crédito IVA sep).
- Cola `sinFirma` (escrituras XSAS) y demás decisiones del dueño listadas en commits.

P2 (técnicos, con cabeza fresca):
- Cruce coherencia «lo que se les TRANSFIERE» (Nómina hecho vs Jornales plan 50/50): rojo falso,
  fix semántico (ver `c7132423`).
- `importe_origen`/`tipo_cambio` NULL en `flujo_movimiento` si las analíticas de design los piden.
- Hitos 2-4 entorno presupuestos v5 (estados de medición, corrida atómica, mesa variante B, diff)
  — back en `lib/plano/` + tablas nuevas · GATE 3 restante: exponer `lib/cotizador/` y el PDF de
  presupuesto como tools; multi-skill.

## 7. ESTADO GIT

- Rama: `main` == `origin/main` · HEAD `2e0990e2` («merge: el titular respeta su ancho…»).
- Working tree: limpio salvo este traspaso (commiteado en este cierre).
- Producción: `~/echegaray-os/produccion/echegaray-os` en `2e0990e2` (verificada 03/09).

## 8. PRÓXIMO PASO

Retomar los hitos 2-4 del entorno presupuestos v5 (estados de medición + corrida atómica en
`lib/plano/`, mockups en `~/renovac-diseno.zip`), partiendo de main `2e0990e2` con suite verde —
salvo que el dueño traiga otra tarea o el extracto del Santander (que destraba los $45.080).

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
