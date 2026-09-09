# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-09 15:10 · main `eab80d78` = origin = producción · Vercel al día_

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones. Integra
aplicación web (Next.js + Supabase), datos, automatizaciones, motores determinísticos e IA para que
Dirección y la empresa operen desde una única plataforma. XSAS es la capa de inteligencia operativa
del OS: el usuario trabaja desde la app con lenguaje natural, interfaces y archivos, sin conocer
tablas, skills ni código.

Claude Code NO es la interfaz operativa del negocio: se usa únicamente para desarrollar, corregir,
probar y evolucionar el OS y XSAS.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje central · una fuente de verdad por concepto (Postgres cuando lo consumen varias caras)
- Plan vs Real vs Forecast · P&L devengado · Cash Flow percibido · nunca mezclar ventanas de tiempo
- Datos y evidencia antes que inferencia · no inventar · FALTA_DATO cuando falta evidencia · CONFLICTO cuando las fuentes se contradicen
- Preservar genealogía/provenance · edición manual del dueño = verdad definitiva
- Acciones sensibles: autorización + RBAC + auditoría + verificación (Nivel E = firma humana)
- Deterministic first · skills/capabilities/tools first · Reasoner/LLM sólo cuando aporte valor real
- Reutilizar motores/datos/capacidades existentes antes de crear otros
- Minimizar llamadas, tokens, costo y complejidad — el límite semanal de Claude Code es recurso escaso
- UX simple, compacta, operativa · less is more · minimalismo extremo en el Sheet (sin aclaraciones)
- Conocimiento y experiencia real ECSAS priman sobre generalizaciones externas
- Nadie cierra su propio trabajo · evidencia del EFECTO, no del intento
- Asistencia: **presencia es un estado, nunca se deduce de horas**; horas es una cantidad aparte.
  Ausencia/licencia son de la PERSONA (sin obra). Ausencia sin motivo = 0 h; con motivo que paga =
  jornada (`jornadaPorDefecto`: 9 h L–J, 8 h V). Un día nunca suma dos veces.

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: web por Vercel desde `main` (app.ecsas.com.ar) · Supabase fuente única (RLS; toda columna
nueva necesita GRANT) · orquestador (`orquestador/lib|scripts|comunicacion`) con timers de usuario
(flujo-caja 2 h, compras-sync 10 min, asistencia-obra 6 h, espejo-legajos, cobranzas-sync) · Sheet
«Flujo de Caja - Cash Flow» regenerado por pipeline · bot @os en Mattermost (worker + ws) · gateway XSAS.

**Deploy backend = push a origin main + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only
origin main` + `systemctl --user restart echegaray-comunicacion-worker echegaray-comunicacion-ws` si
cambió el bot.** Producción es OTRO checkout: pushear NO lo actualiza, y los timers corren desde ahí.
Código siempre en worktree con ruta ABSOLUTA desde `~/echegaray-os/app`; **mergear desde el checkout
principal, nunca desde adentro del worktree** (la trampa mordió 3 veces). Sheet real NUNCA desde un
worktree. **Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL

- **Web publicada hoy (09/09)**: botón «Presente» en Plantel (`2c76456f`); Documentos del proveedor en ficha y
  panel lateral con bucket privado `proveedores-documentos` + tabla `proveedor_documento` (`3c6b1143`, `73b82964`);
  módulo **Liquidación** (Administración → Personal, `fbae2a0a`): tablas `persona_tarifa`, `liquidacion_quincena`,
  `liquidacion_linea`, RLS `ve_economia()` (jefe_obra NO ve sueldos), 14 tarifas sembradas desde `_J_OBREROS`.
- **Sheet Flujo de Caja**: **Plantel borrada** (respaldo `~/echegaray-os/respaldos/2026-09-09-Plantel.pdf`).
  **Jornales por Quincena** migrada al layout nuevo (commit `e2e618be`: 105 filas × 13 col, calendario único
  pagadas+proyectadas con oficina 1.1 y dirección 1.2, convenio UOCRA como bloque 2, titular 3 cifras; 17 fechas
  «Pagado el» repuestas por quincena). **Cargas Sociales** migrada (commit `a79c0c8e`: 63 filas × 15 col, 4 bloques,
  titular percibido). Ambas verificadas en el real: REAL_TOTAL 135.539.027 · OFICINA_PAGADO 24.330.363 ·
  DIRECCION_PAGADO 9.000.000 · pagado cargas 71.737.385; auditores de pantalla y censo en 0 para Cargas.
  **Nómina sigue con el layout viejo.**
- **Herramientas nuevas** (en main): `scripts/en-copia.mjs` (un generador sólo corre contra una copia),
  `scripts/sheet-copia-prueba.mjs` (files.copy + siembra `_UOCRA_RAW` porque IMPORTHTML da #REF! en copias),
  `scripts/pestana-migrar-layout.mjs` (respaldo JSON → celdas del dueño por clave → vaciar → generador → reponer),
  `scripts/pestana-retirar.mjs` (se niega si alguien mira la pestaña; PDF antes de borrar).
- **Trampa pagada hoy**: `jornales-pestana.mjs` ESCRIBE sin flag (dry sólo con `--dry`); corrí una etapa a medio
  hacer sobre el real y rompió Oficina; se repuso celda por celda. Memoria `generador-sin-flag-escribe-el-sheet-real`.
- Timer `echegaray-flujo-caja` encendido; producción en `eab80d78` (generadores nuevos de Jornales y Cargas).

## 5. TRABAJO DE ESTA SESIÓN (09/09)

Ver §4. Además: memoria `decisiones-0909-sheet-personal` (Plantel se borra · Nómina migra a la web · UOCRA se
queda en Jornales · Cargas percibido).

## 6. PENDIENTES REALES

**P0 — Sheet, ramas con trabajo verificado en copia pero NO aplicado ni mergeado**
- **Jornales retoques** — rama `worktree-agent-a704c774040e30f2e` @ `2cd6141a`: 8 retoques de formato/texto,
  parámetros a `Parámetros` (`JORNALES_HORAS_MEDIDAS`, `JORNALES_SHARE_ADELANTO`), 5 tests reescritos, y un bug
  grave corregido (fórmulas mudadas a Parámetros citaban sin pestaña → proyección 0 silenciosa). Grilla 102 filas
  (3 menos que el real). Para aplicar: copia nueva → `olvidar-huella-de-formato.mjs "Jornales por Quincena" --todas`
  (si no, la piel no se repone) → `pestana-migrar-layout.mjs --dueno "Pagado el" --clave A,B` → PNG → luego `--real`
  → mergear a main → prod. **NO mergear a main antes de aplicar**: el timer correría el layout de 102 sobre 105.
- **Nómina rediseñada** — rama `worktree-agent-a946a695f6c09abf3` @ `9a7904d4`: once columnas iguales en los tres
  cuadros, titular por fórmula, auditores 0/0 en la copia `1amGWb4-aU_2JWAuyfuvkC7MRcilpkwvovRFdc1dyO8I` (queda en
  Drive como evidencia). **Bloqueado por dos decisiones del dueño**: (1) la columna «EFECTIVO redondeado» del real
  está corrida 3 filas: 12 importes caen junto a una persona y 3 ($120.000, $340.000, $290.000 en I26:I28) sobre
  total/nota/título; ¿van a Aguero/Castillo/Alaniz? (2) Sosa tenía literales pegados ($1.326.283 / $1.327.052 /
  $946.665) que contradicen su fórmula «MITAD BLANCA» ($330.431): confirmar con el recibo real. Estilo: usa
  encabezados oscuros propios, NO el `sub()` gris de Jornales/Cargas → unificar antes de aplicar.
- Explicar la diferencia de `JORNALES_PROY_TOTAL`: 62.423.532 (layout viejo) vs 61.261.890 (nuevo); hipótesis del
  agente: «Días» de la primera quincena partida por `NETWORKDAYS.INTL`. Después del pipeline, leer las 12 líneas
  «Nómina · …» del Cash Flow Mensual y compararlas con: 131.082.858/58.308.813 · 33.330.363/46.820.400 ·
  50.616.496/23.614.127 · 12.068.696/7.090.019 · 7.368.710/8.500.000 · 11.547.069/4.989.751.
- Jornales real: B30:C30 con formato $ sobre fechas (lo corrige `2cd6141a`).

**P1 — decisiones del dueño (módulo Liquidación)**
- ADELANTO en efectivo sin fuente en Postgres (vive en col. Z de JORNALES): ¿importar o cargar en la web?
- Horas cargadas vs proyectadas al día de pago (web $3,6M vs Sheet $9,5M para 01/09–15/09).
- 3 obreros sin tarifa (Zogbe/Zogber, Castillo, Alaniz). Nómina del Sheet se retira recién cuando esto cierre.
- Messina eCHEQ · Quiroga · Dupec 912/913 (arrastrados).

**P2**
- Documentos del proveedor: el jefe de obra ve documentos de cualquier proveedor (sin filtro por obra); baja no
  libera bytes; prosa restante junto a «Archivar» y `NotaBloque` de la cartera.
- `nomina-quincena.test.mjs` rojo en main (lo arregla la rama de Nómina). Vercel: confirmar borrado de deploys.
- ~105 worktrees viejos (`node scripts/higiene-worktrees.mjs`; los de hoy están «locked»: `remove -f -f`).

## 7. ESTADO GIT

- `main` `eab80d78` = origin = producción. Árbol limpio.
- Ramas con trabajo sin mergear: `worktree-agent-a704c774040e30f2e` (`2cd6141a`), `worktree-agent-a946a695f6c09abf3`
  (`9a7904d4`). Respaldos JSON/PDF de las pestañas en `~/echegaray-os/respaldos/`.

## 8. PRÓXIMO PASO

Aplicar `2cd6141a` a Jornales por el procedimiento de §6 y verificar las 12 líneas del Cash Flow. Después, con las
dos respuestas del dueño sobre EFECTIVO redondeado y Sosa, unificar el estilo de Nómina y aplicarla igual.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
