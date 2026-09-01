fecha: 2026-09-01 (madrugada)

## OBJETIVO

Dos frentes en paralelo. **(1)** El workstream P0 que pidió el dueño: que TODO lo de Drive, archivos
y creación/edición de documentos sea capacidad propia de XSAS y **no de Claude** — «si Claude
desaparece mañana, XSAS sigue manejando Drive y los archivos de ECSAS». **(2)** Bajar del mail los
recibos de la 1ra quincena de agosto y colgarlos de cada legajo.

**El freno de Sheets SIGUE PUESTO** (`~/.config/echegaray-orq/SHEETS-CONGELADOS`, mtime 31/08 18:03)
y `echegaray-flujo-caja.timer` sigue parado y deshabilitado. Nadie lo tocó en toda la sesión. Se
levanta SÓLO por comando (`ORQ_SHEETS_DESCONGELAR="motivo"`), nunca borrando la marca.

## HECHO Y VERIFICADO

- **main: 14 commits empujados** (`38bbb553 → 29ff5516`). `orq:test` **exit 0 · 13.037 tests · 0
  fallas**, typecheck 0, lint 0 errores (63 warnings preexistentes). Corrido DESPUÉS del push, a
  pedido del dueño; está verde.
- **Cuatro controles que no podían dar rojo, arreglados en main.** Es el hilo de la sesión:
  1. `congelador-sheets.mjs` — **el freno de mano se levantaba con basura**. `motivoValido({})` daba
     `true` porque `String({})` es `"[object Object]"` (15 caracteres, ninguna palabra trivial). Un
     `{actor, motivo}` mal desestructurado abría el freno; un array de 9 números también. El actor
     se registraba como `"[object Object]"`. Ahora exige `typeof === 'string'` en los dos.
  2. `xsas-sin-llm.mjs` — **la garantía estructural del DoD de XSAS era ciega al import dinámico**.
     Filtraba `/^\s*import\s/`, así que un `await import('../ia/cliente.mjs')` pasaba entero: medido,
     informaba «48 archivos · con cliente de IA: 0» y salía exit 0. Ahora mira también `import(`,
     neutraliza `ORQ_ANTHROPIC_ENV_FILE` y mide la llave VIVA al terminar (presencia, nunca valor).
  3. `google.mjs::getMeta` — no pedía `trashed`, así que `uocra-ddjj::porQueNoSirve` preguntaba
     `meta.trashed` y recibía `undefined` SIEMPRE. El control de «la carpeta está en la papelera»
     —creado justo después de que eso pasara y costara 2 meses de Fondo de Cese— nunca pudo dar rojo.
     Ahora `METADATA_MINIMA` trae `trashed` y `parents`, y el test prueba EL CABLEADO, no la función.
  4. `tarjeta-banda.test.mjs` — buscaba la fecha del reloj en UTC dentro de la pestaña: `orq:test`
     terminaba en rojo TODAS las noches entre las 21 y las 24 hora argentina, por un defecto
     inexistente, y encima chocaba con el vencimiento real de la tarjeta (01/09/2026).
- **Recibos 1ra quincena 08/2026: 17 colgados**, verificados uno por uno bajando el PDF de Drive y
  leyéndole el CUIL adentro (17/17). Estaban en el mail de `fr.ec.asesores@gmail.com` como
  `1RA. QUINCENA 082026 (4).PDF`, 20 páginas.
- **Banco confirmado**: 506 movimientos del 28/05 al 31/08, `_BANCO_RAW` replicado con los 506,
  saldo 31/08 **$10.795.507,40**. La cadena cierra; los 25 días con diferencia se cancelan de a pares
  (fecha valor). Único hueco: **$45.080 anteriores al 28/05**.
- **CORRECCIÓN al informe de agosto**: el hallazgo «LA ESTRELLA $10 M sin respaldo bancario» **es
  falso**. El 16/07/2026 hay un *Depósito e-cheq int misma plaza* por exactamente $10.000.000. Los
  otros cuatro hallazgos siguen en pie.

## LO QUE ESPERA UNA DECISIÓN DEL DUEÑO — no avanzar sin ella

1. **CASTRO JUAN MARCELO (lg85), MORENO JULIO MIGUEL (lg86), QUIROZ FACUNDO MIGUEL (lg87)** no
   existen en `public.personas`. El estudio los liquida en LAS DOS quincenas de agosto: Q1
   $212.504,64 c/u **sin fecha de pago**, Q2 $192.887,48 c/u. **No hay una sola transferencia a su
   nombre en los 506 movimientos del extracto.** Al no estar en `personas` no entraron a la Nómina
   con la que se pagó, ni a jornales, ni a HH, ni a costo por obra. Darlos de alta es afirmar que son
   empleados: lo decide el dueño. Con el alta, `recibos-a-legajos.mjs` cuelga sus 3 recibos solo.
2. **El freno de Sheets.** Sin levantarlo, el motor de planillas NO puede probarse contra Google y
   ese criterio queda sin evidencia.
3. **La firma para que XSAS escriba Drive** (`TOOLS_AUTORIZADAS_A_ESCRIBIR` en `lib/xsas-permisos.mjs`).
   Hoy los motores son bibliotecas SIN UN SOLO CONSUMIDOR.
4. **Aplicar la migración `orq.drive_audit`** — escrita y ensayada con rollback, no aplicada.
5. **Cuatro precios del catálogo** están viejos contra la propia planilla del dueño
   (`COTIZACION INTERNA CON PANELES version 2.xlsm`, hoja `Recursos`), y uno es el 66% de lo que
   bloquea a XSAS: **recurso 367, Panel Chapa Trape Blanco Pur 50 mm Foil — $41.680 (07/08/2024) en
   el OS contra $65.207 (12/12/2025) en la planilla**. También 195 ($67.200→$90.000), 194
   ($2.760 de 2020→$59.000) y 341 ($105.000→$45.000). NO se cargaron: cambian el costo de una oferta.
   Ojo: 12/12/2025 son 262 días, así que corrige el número pero no la frescura.
6. **La firma de los recibos** sigue sin autorizar (motor listo, 670 revertidos a pedido del dueño).

## LAS TRES RAMAS DE XSAS — empujadas, SIN mergear, ninguna cerrada

`xsas/drive-capability` · `xsas/motor-planilla` · `xsas/C-documentos`. Limpias contra main y sin
pisarse entre ellas; el único choque textual es `google.mjs` entre drive-capability y C-documentos, y
las dos agregan cosas distintas. **Las tres fueron auditadas por un tercero, las tres dieron NO
CIERRA, las tres corrigieron sus bloqueos, y NINGUNA fue re-auditada después de corregir.**
Estado y límites abiertos, en `docs/engineering/DEFINITION_OF_DONE.md`.

Lo que SÍ está probado y no hay que rediscutir: **la independencia del modelo**, verificada estática
y en ejecución, sin credenciales, con los únicos hosts contactados de Google.

## TRAMPAS NUEVAS, PAGADAS ESTA SESIÓN

- **`lib/config.mjs` revive la llave de Anthropic.** Hidrata `~/.config/echegaray-orq/anthropic.env`
  dentro de `process.env` al importarse, y llega solo por `google.mjs → no-reponer.mjs → db.mjs →
  config.mjs`. Borrar la llave y después importar cualquier cosa la devuelve a la vida: el cero es
  NOMINAL. Hay que neutralizar `ORQ_ANTHROPIC_ENV_FILE` antes de importar nada y medir la llave VIVA
  AL TERMINAR. **`ORQ_ENV_FILE` no se toca: ahí vive `DATABASE_URL`.**
- **Un control que publica el VALOR de un secreto lo filtra el día que salta**, que es el día para el
  que existe. Se publica presencia, nunca valor.
- **«Confianza alta» del buscador de Drive no significaba «no hay ambigüedad»**: significa «quedó un
  candidato después de filtrar». `drive.navigate` abría un recibo de sueldo elegido entre 22 archivos
  con el nombre EXACTO. Ahora se exige alta + cero alternativas + sin homónimos.
- **Un `replace(/\/\/.*$/gm,'')` se come `https://`** y borra justo el dominio que un control busca.
- **`git checkout -- archivo` para revertir una mutación borra el trabajo sin commitear.** Se revierte
  con `cp` de un backup. (Le pasó a un agente; perdió tres correcciones y las tuvo que rehacer.)
- **Los PDF del estudio y de ALUMETAL no tienen capa de texto**: son escaneos por líneas. Se componen
  rasterizando los `paintImageXObject` con su CTM y se miran como imagen.
- **Higiene**: se eliminaron 37 worktrees limpios y ya en main (122 → 85). Ramas intactas.

## SIGUE ABIERTO DE ANTES

`Materiales` sin generador desde el 14/08 por decisión · agosto muestra $0 de jornales en los Cash
Flow · Nómina filas 39-41 viejas · $52,95 M a subcontratistas sin comprobante fiscal · $15,18 M
facturados en ARCA que Compras no tiene · $8,27 M de Compras pagadas que el Cash Flow no ve · 10
pares de comprobantes duplicados (~$979.541) · sólo el **40,6%** del costo de obra está imputado, con
$31,88 M de compras sin obra: **hoy no existe un margen por obra confiable**.
