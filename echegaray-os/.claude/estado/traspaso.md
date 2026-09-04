# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-04 · Flujo de Caja + capa ML enchufada a Compras × Cheques_

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
- Plan vs Real vs Forecast · P&L devengado · Cash Flow percibido · nunca mezclar ventanas de tiempo
- Datos y evidencia antes que inferencia · no inventar · FALTA_DATO cuando falta evidencia · CONFLICTO cuando las fuentes se contradicen
- Preservar genealogía/provenance · edición manual del dueño = verdad definitiva
- Acciones sensibles: autorización + RBAC + auditoría + verificación (Nivel E = firma humana)
- Deterministic first · skills/capabilities/tools first · Reasoner/LLM sólo cuando aporte valor real
- Reutilizar motores/datos/capacidades existentes antes de crear otros
- Minimizar llamadas, tokens, costo y complejidad — el límite semanal de Claude Code es recurso escaso
- UX simple, compacta, operativa · less is more · cada pestaña del Sheet minimalista y de clase mundial
- Conocimiento y experiencia real ECSAS priman sobre generalizaciones externas
- Nadie cierra su propio trabajo · evidencia del EFECTO, no del intento
- **Un control que impide corregir un defecto lo vuelve eterno** (lección cara de esta jornada)

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza (medido: ~94% de pedidos sin modelo).

Piezas: gateway XSAS (`servidor-entrante.mjs`, unit `echegaray-xsas-gateway`, sirve
app.ecsas.com.ar/xsas) · orquestador (`orquestador/lib|scripts|comunicacion`) · Sheet «Flujo de
Caja - Cash Flow» regenerado por pipeline (`flujo-caja-rehacer-todo.mjs`, timer cada 2 h) ·
Supabase como fuente única · web por Vercel · bot @os en Mattermost. Deploy backend = push a origin
main + `git pull --ff-only` en `~/echegaray-os/produccion/echegaray-os`.
**Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL

- **main == `9aace250`, pusheado.** Working tree limpio. Producción: no verificada en este cierre.
- **El rediseño de «Impuestos y Financieros» ya es CÓDIGO** (merge `e865772b`). Ésa era la causa de
  que el dueño lo viera romperse una y otra vez: vivía en una rama y en el Sheet, y cada corrida del
  timer lo deshacía. 7 bloques, 68 filas, numerados 1..7.
- **Guarda de escritura del Sheet — familia de defectos ya corregida** (fórmula truncada a 300
  chars · el ancla leyendo su propia proyección · huella de formato por coordenada · el generador
  envenenando su «primera pasada» · la estructura dada por borrada · la cola fósil). Queda el patrón:
  cuando cambia el layout, las huellas de formato viejas bloquean el formato PARA SIEMPRE. El remedio
  (`lib/huella-formato-layout.mjs`) está cableado sólo en **Impuestos y CAJA**; las otras 12 pestañas
  no lo tienen.
- Cuentas de CAJA: Santander ARS y la cartera salen del extracto (al día). **Santander USD, Balanz
  ARS y Balanz USD son constantes en `lib/banco-santander.mjs`**: se actualizan editando código.
  El dueño decidió el 04/09 **dejar Balanz como está — no volver a pedirle la posición.**
- Firma por pestaña (ORQ_AUTOCANDADO) sigue APAGADA a propósito. Timer activo — verificarlo, no asumirlo.

## 5. TRABAJO DE ESTA SESIÓN (04/09)

Cinco reportes del dueño sobre el Flujo de Caja, todos resueltos y verificados por PDF/relectura:

1. **Extracto Santander al 04/09 importado** (10 nuevos, 553 en `_BANCO_RAW`, cadena cerrada).
2. **Gráficos de CAJA**: la hoja tenía 55 filas y el layout necesita 68 → regenerada, los 4 en su ancla.
3. **Tarjetas de CAJA cortadas** («CAJA INVERTI… $45.138.»): la guarda de formato bloqueaba el ancho
   de las columnas E–J y era permanente. Se invalidaron sus 18 huellas y se cableó
   `elLayoutCambio`/`invalidarHuellasDeFormato` en `caja-pestana.mjs` (+ test).
4. **Saldo en dólares con 29 días**: U$S 981,39 → **507,53 al 03/09**. Verificado por dos fuentes
   independientes (captura del homebanking + las bases del 25.413 del extracto en pesos). Nace
   `lib/banco-cuenta-usd.mjs` (+6 tests): la cuenta USD se puede DERIVAR del extracto en pesos.
5. **IVA/IIBB — el defecto de fondo**: la pestaña usaba DOS definiciones de «ventas del mes». El
   crédito de nov/dic se proyectaba y el débito no, fabricando un saldo a favor de $1.312.377; y el
   IIBB gravaba COBRANZAS (base de sep $183,7M contra $71,1M facturados). Ahora hay una sola
   definición (`planDeVentas`) con la frontera calculada; los meses sin factura quedan VACÍOS y
   declarados (`▲ SIN VENTAS CARGADAS`), no en cero. 198 tests del área en verde.

Operativo, además: los 4 pagos pendientes a **PEDRO TELLO** ($9,9M) movidos una semana en Compras
(sólo columna Q; R es `=Q<fila>` y AD es ARRAYFORMULA — nunca se escribe).

Commits: `e865772b` (rediseño) · `cae191a8` (CAJA) · `9aace250` (IVA base única).

### 5.b · LA CAPA ML DEJÓ DE SER UNA BIBLIOTECA (fases 1-3 integradas)

Estaba construida, probada y sin llamadores: `orq.ml_traza` tenía **cero filas**. Dos defectos
reales encontrados y cerrados:

- `registrarTraza()` dispara sin esperar y los scripts del OS salen enseguida → el INSERT nunca
  llegaba. Ahora existe `drenarTrazas()` y los scripts la llaman antes de `process.exit`.
- `valor_original` guardaba el texto NORMALIZADO. Un «original» normalizado no es el original, y la
  pantalla que busca «Robles Pinturerías S.R.L.» no lo encontraba. Ahora se guarda crudo y el
  cálculo se memoiza por forma normalizada.

Enchufada en dos lugares reales: el cruce de cheques (`cheques-cobertura-sheet.mjs` resuelve los dos
lados y `mismaEntidad` gana el peldaño de identidad canónica, DEBAJO del CUIT) y la pantalla de
Compras (el panel dice «→ Nombre canónico» o «Proveedor sin identificar»; los sugeridos traen
Confirmar / Elegir otro / Dejar sin resolver, y confirmar crea el alias verificado).

**LO MEDIDO, QUE CONTRADICE LA EXPECTATIVA:** de 143 identidades reales, 45 se vinculan (25 por
CUIT, 20 por nombre exacto) y las 98 que pasaron por fuzzy/embeddings aportaron **CERO
vinculaciones**. Y el efecto sobre el cruce fue **nulo**: mismos contemplados, mismos inferidos,
mismos huecos. El ML acá informa y encola trabajo humano; lo que vincula es el identificador fuerte.
El trabajo que más rinde es cargar los CUIT que faltan, no afinar umbrales.

Commits: `9cf52a81` (integración) · `5bf44c4e` (la normalización sale de embeddings).

## 6. PENDIENTES REALES

**P0 — decisión del dueño, no arranca solo**
- **¿La base del IVA va por «Fecha de Factura» (col P) o «Fecha de Venta» (col C)?** Medido: la base
  declarada de las DDJJ de **marzo ($78.349.586,76) y mayo ($20.000.000) coincide AL CENTAVO con la
  columna C**, no con la P. Hoy se usa P (decisión del 03/09 + el Libro IVA Ventas va por emisión).
  Si la respuesta es C, cambia una sola constante (`VENTA.fecha` en `impuestos-base-libro.mjs`).
- **DDJJ de IVA de agosto SIN PRESENTAR**, vencía el 20/08. Verificado dos veces contra Drive.

**P1 — técnicos**
- La cadena de saldos del banco **no cierra por $455.082,14** (72 cortes, ninguno lo explica solo);
  el tramo sospechoso es anterior al 06/07. `scripts/auditar-saldo-banco.mjs` lo reporta.
- Cablear `huella-formato-layout` en las 12 pestañas restantes, o resolverlo en la guarda misma.
- **5 CUIT del Sheet no están en `proveedores`**: SOSTEN SA, Alvarado Mariel Edith, AGENCIA CALIDAD
  SAN JUAN SEM, Machuca Hector (falta el alta) y **NEUMAGOM SAS, que existe y NO tiene el CUIT
  cargado**. Ese último es el único auto-resuelto con riesgo residual: se vinculó por nombre exacto
  y nada confirma el CUIT. Cargarlo lo pasa a identificador fuerte.
- Conviven **dos almacenes de alias**: `proveedor_alias` (el viejo, con `clasificarNombre`) está
  **vacío y sin llamadores en producción**, y `ml_entidad_alias` es el que usa el resolver. No
  divergen hoy porque uno no se usa; el día que alguien lo use, divergen.
- El `next-server` que corre en :3287 sale de un **worktree viejo** (`.claude/worktrees/desvio`), no
  de producción. La app no está bajo systemd.
- Dos filas «Retenciones sufridas» con números distintos y sin nota al lado: bloque 2 lee `_IIBB_RAW`
  ($3.645.362), bloque 3 lee `Cobranzas!Z` ($888.550). Decisión de dominio, no de diseño.
- Deuda anterior aún abierta: `huellaDeRango(PESTANA)` hashea sólo filas/columnas congeladas ·
  `clasificar-request.mjs:58` no reconoce `gridProperties.*`.

**P2**
- Cotizador: cotizar un plano NUEVO desde el navegador (único circuito sin probar); ¿se borra el
  presupuesto sonda `7abc7061`? · `concurrencia: 4` sin medir contra el límite real.
- La Estrella: que Rodrigo confirme si los pagos en efectivo de `CONTROL DE GASTOS` ya están
  facturados — traba decidir si esos $25.141.687 suman o duplican.

## 7. ESTADO GIT

- Rama: `main` · HEAD: `5bf44c4e` · working tree **limpio** · sincronizado con `origin/main`.
- Producción (`~/echegaray-os/produccion/echegaray-os`) al día en `5bf44c4e`, y el cruce corrido
  desde ahí escribió trazas reales en `orq.ml_traza`.
- `npm run orq:test`: **13.713 tests, 0 fallos** (dos corridas). `typecheck` y `build` en verde.
- Ramas ya integradas hoy (se pueden borrar): `feat/impuestos-clase-mundial`,
  `fix/iva-base-unica-de-ventas`. Worktrees `.claude/worktrees/impuestos-wc` e `iva-base` sin limpiar
  (`node scripts/higiene-worktrees.mjs`).

## 8. PRÓXIMO PASO

Dos, en este orden:

1. Preguntarle al dueño si la base del IVA va por columna P o C (evidencia de marzo y mayo arriba) y
   aplicar la respuesta en `orquestador/lib/impuestos-base-libro.mjs`.
2. Cargar los 5 CUIT que faltan en `proveedores` y volver a correr
   `node orquestador/scripts/identidad-backfill.mjs` (en seco primero). Rinde más que cualquier
   ajuste de umbrales: cada CUIT cargado convierte un cruce por nombre en uno por identificador
   fuerte. La fase 4 (Document Intelligence) sigue **sin arrancar** por indicación del dueño.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
