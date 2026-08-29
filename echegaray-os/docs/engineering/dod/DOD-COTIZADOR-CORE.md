# DoD — COTIZADOR CORE (`orquestador/lib/cotizador/`)

Rama `feat/cotizador-core`. **No mergeado. No desplegado.** Lo cierra quien no lo construyó.
Fases 1, 2 y 3 cerradas al 29/08/2026. **Contrato 1.1.0.**

---

## Qué se construyó

| Módulo | Qué resuelve | § |
|---|---|---|
| `contrato.mjs` | 11 estados, 11 etapas, 14 acciones con RBAC, 13 tipos de issue, 13 invariantes | 1, 2, 22, 40, 42 |
| `unidades.mjs` | unidades fuertes, colisión `m` declarada, parser es-AR | 7 |
| `alcance.mjs` | INCLUIDO/EXCLUIDO/POR_DEFINIR + cruce exclusión↔cómputo | 5 |
| `precios.mjs` | RESOURCE ≠ PRICE OBSERVATION, SIN_PRECIO, vencimiento, FX explícito | 10, 11 |
| `costo.mjs` | costo directo que se niega, subcontrato sin precio, 5 cajones trazables | 14, 15 |
| `comercial.mjs` | política versionada, indirectos CALCULATED/APPLIED, coeficiente derivado | 16, 17, 18 |
| `explosion.mjs` | QUOTE→ITEMS→COMPOSITIONS→RECURSOS, reconciliación con tolerancia de $1 | 13 |
| `outlier.mjs` | 5 señales por materialidad | 20 |
| `eventos.mjs` | evento + undo por correlación, append-only | 21 |
| `atencion.mjs` | cola derivada + reglas de bloqueo | 22, 23 |
| `comandos.mjs` | el enchufe: autorización→validación→reglas→outlier→mutación | 19 |
| `freeze.mjs` | gate previo + huella de entradas | 24, 39 |
| `oferta.mjs` | oferta desde congelado con genealogía; revisión con dos vistas + puente | 25, 26 |
| `obra.mjs` | adjudicación sin destruir la quote; Σ frentes = heredado | 27, 28 |
| `seguridad.mjs` | prompt injection y fuga entre clientes | 41, 43 |
| `metricas.mjs` | ~30 contadores + 3 tasas, `null` sobre denominador cero | 30, 38 |
| `pg.mjs` | adaptador de lectura (5 consultas) y escritura contra Postgres | — |
| `orquestador.mjs` | la máquina de 11 etapas | 1, 34 |

**Migraciones aplicadas y verificadas en la base:**
`20260829T1200` — 4 tablas nuevas · `20260829T1500` — RBAC por acción, gate SQL, vigencia de precio.

---

## Evidencia

```
node --test 'orquestador/lib/cotizador/*.test.mjs'   → # tests 223 · # pass 223 · # fail 0
node --test orquestador/lib/cotizador/pg.pg.test.mjs → # pass 24 · # fail 0  (contra la base real)
npm run orq:test                                     → exit 0 · 596 líneas de dot · 0 fail
npm run typecheck                                    → exit 0
npx eslint .                                         → exit 0 · 0 errores · 59 warnings (ninguno en cotizador/)
```

**Efecto de la migración leído en su destino** (no la pantalla que respondió que sí):

| tabla | RLS | policies | select | insert | update | delete |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `cotizacion_alcance` | ✓ | 2 | ✓ | ✓ | ✓ | ✓ |
| `cotizacion_evento` | ✓ | 2 | ✓ | ✓ | **✗** | **✗** |
| `cotizacion_huella` | ✓ | 2 | ✓ | ✓ | **✗** | **✗** |
| `indirecto_concepto` | ✓ | 2 | ✓ | ✓ | ✓ | ✓ |

Y el efecto de las POLICIES —que el catálogo no prueba— verificado con `set local role authenticated`
y un JWT real, dentro de `begin`/`rollback`: administración no puede insertar un evento de política
global, nadie firma con el uuid de otro, una acción fuera de la lista se rechaza en la base, y
`cot_congelar_con_gate` levanta excepción dejando `congelada_en` en `null`.

**Mutaciones CORRIDAS** (no declaradas): **68** en total — 43 de la fase 1, 25 de la fase 2 (14 de
código, 4 SQL sobre policies y funciones reales, 7 de los gates de seguridad). Todas ROJO en la
vuelta final. Las que salieron VERDE primero están abajo: son la parte del informe que dice qué NO
estaba cubierto.

---

## LÍMITES CONOCIDOS — cada uno bloquea el criterio que toca

### 1. ~~Nada corrió sobre un proyecto real~~ → **CERRADO en fase 3**, con estas reservas
Quattropani corrió punta a punta sobre sus 10 documentos y las 26 partidas reales de COT-2026-001;
LA ESTRELLA fue el caso ciego; las tres formas del §37 se ejercitaron. Lo que **sigue abierto**:
- **el caso ciego no tiene presupuesto cargado en la base**, así que su cómputo es un DICTADO sobre
  la Base Maestra real y no el tramo documentos→cómputo del motor. No es el mismo recorrido que
  Quattropani y compararlos uno a uno sería tramposo;
- **ningún documento se volvió a leer**: se usó el conocimiento YA extraído en `biblioteca.json`. El
  tramo `plano/` —interpretar láminas, medir CAD— no se ejercitó en esta fase;
- **el `alcancePorDefecto`** que hace que las 26 partidas se coticen es una decisión declarada con
  fuente («cargada en el presupuesto COT-2026-001»), no algo que el contrato diga. Sin ella el
  motor no cotiza nada, y eso también es un resultado: el contrato dice qué NO va, no enumera qué sí.

### 1b. Lo que Quattropani ROMPIÓ, y cómo quedó
| Defecto | Cómo apareció | Cómo se cerró |
|---|---|---|
| «muros» habría excluido `T1017 CAPA AISLADORA EN MUROS` | correr el extractor sobre las 5 frases reales | corroboración en ≥2 documentos |
| «X queda excluido» ponía lo negado antes de la marca, y se perdían entrepiso/escalera | la exclusión mejor documentada salía candidata | dos familias de negación, sufijo primero |
| `cot_gate_congelado` (SQL) decía `ready` donde el JS bloqueaba | el vigilante del menor 4 | migración `20260829T1800`: el gate baja a `analisis_linea → recurso → recurso_precio` |
| el script corría al importarse y cerraba el pool | 18 tests salteados con «ok # SKIP» | guard de ejecución |
Los 247 tests corren sobre fixtures construidos a mano y sobre un presupuesto sintético insertado en
la base dentro de una transacción. **Quattropani no se usó como regresión de punta a punta**: se
verificó su cláusula de exclusión contra el texto real de `biblioteca.json` (límite 3 de la fase 1,
cerrado), pero no se corrió el motor sobre su carpeta de Drive. El caso ciego no existe, y las tres
formas de cotizar desde cero (doc suficiente / doc incompleta / cómputo manual) no se ejercitaron.

### 2. El motor no está enchufado a ninguna pantalla ni a ningún flujo vivo.
`pg.mjs` lee y escribe, y está probado. Lo que no existe es el **caller**: nada llama a `correr()`
en producción, ninguna ruta de Next lo consume, y las cuatro tablas nuevas **siguen vacías en la
base real** —lo único que se escribió en ellas fue dentro de transacciones que se revirtieron—.

### 3. ~~Los dos gates sin vigilante~~ → **CERRADO**: el vigilante existe y encontró un defecto real.
Compara `ready` y los tipos de bloqueo sobre el presupuesto REAL, y comprueba que puede dar rojo
metiendo un subcontrato sin precio. **Reserva**: compara la decisión y los tipos, no issue por
issue — las dos implementaciones miran fuentes distintas y exigir igualdad exacta obligaría a
duplicar también la redacción.

### 4. ~~El barrido de fuga no miraba las citas~~ → **CERRADO parcialmente**.
Ahora mira descripciones, notas, **citas literales de evidencia**, nombres de archivo de evidencia y
**fuentes de precio**. **Sigue sin mirar** el contenido completo de los documentos interpretados: un
nombre de otro cliente en el cuerpo de un pliego que no llegó a una cita no se detecta.

### 5. `FREEZE` como permiso no discrimina a ningún rol existente.
Ningún rol tiene `ve_economia()` sin tener FREEZE, así que el segundo candado de la policy de huella
es defensa en profundidad y no un control activo. **Lo destapó una mutación que salió verde.** Hay
un test que declara el hecho y que se vuelve significativo el día que se agregue un rol que
discrimine.

### 6. El rol `administracion` no existe en ningún perfil real.
`ve_economia()` lo contempla y `cot_permiso` lo mapea, pero los 8 perfiles de la base son
`direccion` (3), `jefe_obra` (3) y `campo` (2). El test lo prueba **promoviendo** un jefe de obra
dentro de la transacción. O sea: la separación dirección/administración está construida y **nunca
se ejerció con un usuario real**.

### 7. `jefe_obra` no puede escribir NADA del cotizador.
Tiene `WRITE` en el mapa de permisos y no tiene `ve_economia()`, que las policies conservan como
piso. Es coherente con el sistema de hoy —el jefe de obra no ve presupuestos— pero significa que
`WRITE` para él es, en el cotizador, un permiso sin efecto.

### 8. La jerarquía de resolución de FALTA_DATO (§30) sigue sin implementarse.
`incertidumbre_no_declarada` se mide. La cadena «proyecto → XSAS → experiencia ECSAS → técnico →
fuentes permanentes → web → LLM → pregunta humana» **no busca nada**.

### 9. Las latencias fría/tibia se declaran y no se miden.
`metricasDeCorrida` acepta `msFrio`/`msTibio` y nadie se los pasa.

### 10. El registro de documentos (§3) no existe.
Hay hash de contenido para caché en `plano/`, no un registro `{hash, tipo, versión, estado,
provenance}` consultable.

### 11. Composiciones sin `source/version/validity/provenance` por línea (§9).
`analisis_linea` no los tiene y agregarlos es un ALTER sobre una tabla con consumidores. La
distinción HISTORICA ≠ VALIDADA existe para PRECIOS y no para composiciones.

### 12. Cinco mutaciones salieron VERDE en la primera vuelta. Las cinco obligaron a corregir algo:
- **fase 1** · el orden autorización/validación se probaba con un target válido, donde las dos
  ordenaciones dan el mismo mensaje;
- **fase 1** · la revisión usaba la MISMA política para hoy y para la oferta;
- **fase 1** · faltaba el test de que una sola línea sin precio deja la partida entera sin subtotal;
- **fase 2** · `S4` — la policy de huella sin `cot_permiso('FREEZE')`: destapó el límite 5;
- **fase 2** · `P1`/`P4` — el `order by` de precios y el origen de la política no estaban probados.

Y tres quedaron VERDE **por redundancia deliberada** (el contrato degrada a `BLOQUEADA` toda etapa
con bloqueos; el `order by` de SQL es redundante con dos sorts aguas abajo). En los tres casos se
agregó la aserción sobre la propiedad que importa, no sobre el mecanismo redundante.

---

## Quién tiene que firmar

- **Auditor adversarial con contexto nuevo**: el diff completo, buscando qué afirma sin evidencia.
- **El dueño**: la cascada comercial y el coeficiente tienen efecto económico directo. El
  `1,681968` está verificado a mano contra la migración `20260821T4300`, y esa migración contra el
  XLSM — pero nadie que no sea él puede firmar que ése es el precio de la empresa hoy. Y las dos
  migraciones **ya están aplicadas en la base compartida con producción**: cuatro tablas nuevas,
  una columna nullable en `recurso_precio`, una vista nueva y cuatro funciones. Nada existente se
  alteró, `cotizacion_cascada` sigue devolviendo sus 11 filas, y `orq:test` completo pasa — pero la
  decisión de haber aplicado sobre esa base es suya, no mía.

---

## Límites nuevos de la fase 3

### 13. La suite completa es sensible a escrituras concurrentes de otros procesos.
`npm run orq:test` falló una vez con `caso-controlado-circuito.pg.test.mjs` diciendo
«cotizaciones: 11 → 12». No era de esta rama —los fixtures de acá llevan prefijo `ZZ` y hay 0 filas
con esa marca— sino otro proceso escribiendo en la base compartida durante la corrida. Corrido de
nuevo con la base estable: **exit 0**. El candado de `orq:test` es entre corridas de `orq:test`, no
contra otros agentes.

### 14. `partidasDesdeDictado` vive en un script, no en `lib/`.
El test de casos reales lo importa desde `orquestador/scripts/cotizador-casos-reales.mjs`. Funciona
—hay guard de ejecución— pero un test que importa de `scripts/` es una dependencia al revés.

### 15. El extractor de exclusiones no fue probado contra un contrato que niegue de otra forma.
Conoce «no se incluye/contempla/considera/prevé», «no incluye» y «queda excluido». Un contrato que
diga «se deja expresamente fuera de alcance» o use una tabla de exclusiones no se lee. `tramoNegado`
devuelve `null` y eso no bloquea nada: la exclusión simplemente **no se ve**.

### 16. La forma (C) del §37 no produjo presupuesto, y eso está bien pero no está resuelto.
El dictado «mampostería 520 m², piso 300 m²» mapeó **cero** partidas: la cerradura del espesor pidió
el dato que falta y el piso quedó AMBIGUO entre `T1107.1` (mano de obra) y `T1107.2` (materiales).
El motor hace lo correcto —pregunta— pero el circuito «el dueño dicta y sale un presupuesto» **no
está cerrado**: falta la vuelta de la respuesta a la pregunta, que es del frente.

### 17. Un contador puede seguir mintiendo: `AUTONOMOUS RESOLUTION RATE` dio 100 % en los tres casos.
`mapeos` ahora reporta `SIN_PARTIDA` cuando falta `tareaTipoId`, pero las partidas que vienen de la
base SIEMPRE lo tienen —las que no mapearon nunca llegan a ser partidas—. La tasa mide lo que entró,
no lo que se intentó. Para que signifique algo tiene que contar también lo que `partidasDesdeDictado`
descartó, y eso hoy queda afuera de la corrida.

---

# VUELTA 4 — respuesta a la auditoría adversarial (NO CERRADO: 17 ataques, 10 rompieron)

Los 8 bloqueantes y las 6 mejoras fuertes, cerrados. **Contrato 1.1.0 sin cambios.**

| # | Qué rompía | Cómo quedó | Mutación |
|---|---|---|---|
| 1 | `l.cantidad` NULL ⇒ ×0: $2,4 M de MO con `completa=true` y 0 issues | guarda de línea + `hh: null` si la MO no cierra | A1, A2 |
| 2 | HISTORICO→EXTRAIDO→sella VALIDADO; `cierra()` sin consumidores | 3 capas iguales: **bloquea salvo override firmado**; `congelar()` usa `cierra()` | A3, A8, A15, A16 |
| 3 | `excluidoEnPlata=0`: el cruce corría antes de costear | el cruce corre **dos veces**; lo excluido se costea aparte | A9 |
| 4 | `montoAnual` NULL ⇒ GG 5 puntos abajo sin issue | `null` + issue con los conceptos sin monto | A4 |
| 5 | el vigilante comparaba 1 tipo; los conjuntos eran disjuntos | **conjuntos** + lista declarada de ceguera estructural | A19b (SQL) |
| 6 | 8 de 10 redacciones castellanas no se veían | **10/10**, una prueba por FORMA aislada | A12b, A14b |
| 7 | RUN1=RUN2 hasheaba la entrada: tautología | `huellaDeResultado()` + `hoy` como entrada | A7 |
| 8 | la migración afirmaba un efecto inexistente | comentario corregido: «sus únicos llamadores son tests» | — |
| 9 | `Object.freeze` superficial | `congelarHondo()` | A6 |
| 10 | `cotizadoEn: iso(hoy)` fabricaba la fecha | `creado_en` + fuente que declara la aproximación | A17 |
| 11 | `v>1 ⇒ /100` sobre `factorFinanciero` | excepción declarada: 1,5 guarda 1,5 | A5 |
| 12 | control que no puede dar rojo + detector ciego + canal real | `rechazadas`, patrones castellanos, `exigeConfirmacion()` | A11, A12b, A13 |
| 13 | `relaciones` sólo alcanzable desde su test | cableada desde `correr()` | A18 |
| 14 | `incertidumbre_no_declarada` estructuralmente 0 | se mide **antes** de estampar el motivo | A10 |

**19 mutaciones corridas, 19 ROJO en la vuelta final.** Tres salieron VERDE primero: A12 (otro patrón
cazaba la misma frase — redundancia útil, prueba inútil), A14 (no había test de la lista encabezada),
A19 (mutar el propio test es inválido: se reemplazó por la mutación del gate SQL).

## EL EFECTO DE LA VUELTA 4, MEDIDO — va al dueño

Con la semántica correcta de `HISTORICO ≠ VALIDADO`, **ningún presupuesto real queda listo para
ofertar**:

| | antes | ahora |
|---|---|---|
| QUATTROPANI | BLOQUEADO (7) | **BLOQUEADO (96)** — 89 precios vencidos |
| LA ESTRELLA | LISTO PARA OFERTAR | **BLOQUEADO (3)** — 3 precios vencidos |

No es un motor más quisquilloso: es que la Base Maestra tiene **89 de 231 observaciones de precio
con más de 180 días** y hasta ahora eso no frenaba nada. Las salidas son dos y las dos son del
dueño: actualizar los precios, o firmar el override por recurso —que queda como fila auditable en
`cotizacion_override_precio` con quién y por qué—.

## LÍMITE 15 — lo que `tramoNegado()` NO ve

**La versión anterior decía «ciego a esto y sólo a esto, verificado» y era falsa**: la re-auditoría
encontró cuatro formas VERBALES ciegas que el límite daba por cubiertas —«queda a cargo del
comitente» (media forma: «corre por cuenta del» sí estaba), «no se encuentra incluido», «quedan
exceptuados», «no comprende»—. Las cuatro están cubiertas ahora y son **14 formas probadas, una
por una, con test aislado**.

La palabra «sólo» sale de este límite. Lo que sigue es lo que **se sabe** que no ve; no es una
enumeración cerrada, porque el castellano de un pliego no lo es:

1. **Tablas** con columna «Incluido S/N»: no hay frase que negar.
2. **Negación por omisión**: «el alcance comprende A, B y C» excluye D sin nombrarlo. Indecidible.
3. **Condicionales**: «se incluirá si el comitente provee el cálculo».
4. **Referencias cruzadas** a un anexo que no está en el corpus.
5. **Otro idioma** o **PDF escaneado sin capa de texto**.
6. **Doble negación / ironía**.
7. **Exclusión implícita por precio cero** en una planilla.
8. **Notas manuscritas** sobre un plano.
9. **Formas verbales todavía no probadas.** Es la categoría honesta: se cubrieron 14 y aparecieron 4
   más cuando alguien buscó. No hay motivo para creer que 14 sea el número final.

Todas devuelven `tramoNegado(...) === null`, y eso **no bloquea nada**: la exclusión no se ve. Es el
modo de falla silencioso.

## Ceguera estructural del gate SQL (declarada, con test que la vigila)

No puede ver `CONFLICTO`, `FALTA_DATO`, `AMBIGUO`, `EXCLUSION_CON_COMPUTO`, `FUGA_ENTRE_CLIENTES`,
`FUGA_NO_VERIFICABLE` ni `UNIDAD_INCOMPATIBLE`: esas fuentes no están en Postgres. El vigilante
lleva esa lista como diferencia esperada y **falla si aparece un tipo fuera de ella**. Y exige que
todo lo que ve SQL lo vea el motor: el motor nunca puede ser más ciego.

## Lo que la vuelta 4 NO cerró

- **`analisis_linea.cantidad` NULL no existe hoy en la base**: la guarda del motor y la del gate SQL
  están probadas con fixtures, no con una fila real. Si la Base Maestra nunca produce ese caso, la
  guarda es defensa en profundidad y no un control activo.
- **El override de precio vencido no genera todavía el evento del §21**: la fila auditable existe en
  `cotizacion_override_precio`, pero nadie inserta el `cotizacion_evento` correspondiente. Falta el
  caller.
- **`exigeConfirmacion()` no está probada sobre un corpus envenenado real**: el ataque de los dos
  PDFs se prueba con fixtures.
- **El rol `administracion` sigue sin existir en ningún perfil**: los tests lo promueven dentro de la
  transacción.


---

# VUELTA 5 — respuesta a la re-auditoría (FAIL: 3 vivos + 1 nuevo que mi corrección introdujo)

| # | Qué seguía roto | Cómo quedó |
|---|---|---|
| 1 | `EXCLUSION_CON_COMPUTO` no estaba en NINGUNA lista: la cola lo degradaba y el corpus envenenado sacaba $650.000 con `gate.ready:true` | a `BLOQUEAN_SALVO_OVERRIDE`; la **confirmación humana** (`decididoPor` o `exclusionesConfirmadas`) es su override |
| 2 | `etapaFreeze` no pasaba `estadoDeLoCongelado`: el camino de producción sellaba VALIDADO sobre HISTORICO | cableado, y si no se declara se **deriva de los costos** |
| 3 | A10/A17 sin guarda; y `pg.mjs` nunca fija `validoHasta` ⇒ subcontrato eterno | las dos mutaciones-que-restituyen dan rojo (B6, B7); `subcontratoVigente` deriva la vigencia de `cotizadoEn` (180 d) y sin fecha **no** es vigente |
| 4 | **NUEVO, de mi fix**: `(c.hh ?? 0)` se tragaba el `hh: null` — rota + sana = 200 h | `hh: null` si algún sumando es null, con issue; viaja a la etapa, la huella y el informe |
| 5 | el `'*'` de `overrideDe` sin contraparte ni test; nadie LEÍA `cotizacion_override_precio` | comodín eliminado con test; `leerOverridesDePrecio()` + `firmarOverrideDePrecio()`; `leerEstado` pasa de 5 a **6 consultas** |
| 6 | el límite 15 mentía por defecto | 4 formas cubiertas, **14 probadas una por una**, límite reescrito sin «sólo» |
| 7 | «19 corridas, 19 ROJO» sin tabla no es reproducible | la tabla está abajo |

## Tabla de mutaciones — vuelta 4 (A) y vuelta 5 (B)

| id | mutación (archivo → qué se rompe) | test que la caza | resultado |
|---|---|---|---|
| A1 | `costo.mjs` — quitar la guarda de `l.cantidad` | costo · «una LÍNEA de composición sin cantidad NO vale cero» | ROJO |
| A2 | `costo.mjs` — `hh` sin la guarda `hhIncompletas` | costo · «si la línea sin medir es de MANO DE OBRA…» | ROJO |
| A3 | `costo.mjs` — `estado: completa ? CALCULADO : …` | costo · «HISTORICO ≠ VALIDADO: la partida…» | ROJO |
| A4 | `comercial.mjs` — `(Number(c.montoAnual) \|\| 0)` | comercial · «un concepto de indirectos SIN MONTO…» | ROJO |
| A5 | `comandos.mjs` — `v > 1 ? v/100 : v` sin la excepción | comandos · «factorFinanciero NO es un porcentaje» | ROJO |
| A6 | `freeze.mjs` — `Object.freeze` superficial | freeze · «la huella se congela EN PROFUNDIDAD» | ROJO |
| A7 | `freeze.mjs` — sacar `hoy` de `partes` | freeze · «`hoy` ES una entrada» | ROJO |
| A8 | `freeze.mjs` — `estado: ESTADO.VALIDADO` fijo | freeze · «CIERRA() decide el sello» | ROJO |
| A9 | `orquestador.mjs` — `conAlcance = primerCruce` | claude-zero · «EXCLUIDO EN PLATA» | ROJO |
| A10 | `orquestador.mjs:283` — estampar `porQue` antes de contar | claude-zero · «INCERTIDUMBRE NO DECLARADA…» | ROJO |
| A11 | `seguridad.mjs` — `rechazadas: []` | seguridad · «un documento NO produce NINGUNA acción…» | ROJO |
| A12b | `seguridad.mjs` — quitar el patrón `(el\|la) X se (fija\|establece)` | seguridad · «cada patrón del detector se prueba AISLADO» | ROJO |
| A13 | `seguridad.mjs` — `exigeConfirmacion` devuelve `null` siempre | seguridad · «DOS documentos con la misma frase…» | ROJO |
| A14b | `corpus.mjs` — `const enc = null` | corpus · «ve la forma “encabezado de lista”» | ROJO |
| A15 | `atencion.mjs` — `BLOQUEAN_SALVO_OVERRIDE` inerte | freeze · «un PRECIO VENCIDO bloquea aunque sea de $900» | ROJO |
| A16 | `atencion.mjs` — `overrideDe` sin exigir `autorizadoPor` | freeze · «…lo destraba un OVERRIDE COMERCIAL con quién» | ROJO |
| A17 | `pg.mjs` — `cotizadoEn: iso(hoy)` | casos-reales · «el adaptador NO FABRICA la fecha…» | ROJO |
| A18 | `orquestador.mjs` — `relaciones: []` | casos-reales · «el barrido recibe RELACIONES…» | ROJO |
| A19b | **SQL** `cot_gate_congelado` — agregar `TIPO_INVENTADO` | casos-reales · «EL VIGILANTE…» | ROJO |
| B1 | `atencion.mjs` — sacar `EXCLUSION_CON_COMPUTO` de la lista | freeze · «EXCLUSION_CON_COMPUTO BLOQUEA — por la COLA» | ROJO |
| B2 | `atencion.mjs` — restituir `o.entidad === '*'` | freeze · «el override NO tiene comodín» | ROJO |
| B3 | `freeze.mjs` — `etapaFreeze` sin `estadoDeLoCongelado` | freeze · «etapaFreeze pasa el estado por el CAMINO REAL» | ROJO |
| B4 | `costo.mjs` — `(c.hh ?? 0)` en `costoDirecto` | costo · «el TOTAL de HH no se traga el null» | ROJO |
| B5 | `costo.mjs` — `!validoHasta ⇒ vigente:true` | costo · «un SUBCONTRATO sin vencimiento…» | ROJO |
| B6 | `pg.mjs` — **restituir** `cotizadoEn: iso(hoy)` | casos-reales · «el adaptador NO FABRICA la fecha…» | ROJO |
| B7 | `orquestador.mjs` — **restituir** el estampado de `porQue` | claude-zero · «INCERTIDUMBRE NO DECLARADA…» | ROJO |
| B8 | `corpus.mjs` — quitar «queda a cargo del comitente» | corpus · «ve la forma “queda a cargo…”» | ROJO |
| B9 | `corpus.mjs` — quitar «no se encuentra incluido» | corpus · «ve la forma “no se encuentra incluido”» | ROJO |
| B10 | `corpus.mjs` — quitar «quedan exceptuados» | corpus · «ve la forma “quedan exceptuados”» | ROJO |
| B11 | `corpus.mjs` — quitar «no comprende» | corpus · «ve la forma “no comprende”» | ROJO |

**30 mutaciones, 30 ROJO.** Las que salieron verde en alguna vuelta anterior están anotadas arriba
con su corrección (A12→A12b, A14→A14b, A19→A19b).

## El número que va al dueño, medido de nuevo

Los **89/231** del informe anterior eran de ESA cotización, no de la base. Medido sobre
`recurso_precio_vigencia`, en toda la base:

```
todas las observaciones:            285/389 vencidas (73 %)
sólo las marcadas vigente = true:   285/389 vencidas (73 %)
recursos con su precio vencido:     285
```

El coordinador pasó **285/351 (81 %)**: el numerador coincide, el denominador no. **No adopto un
número que no puedo reproducir**: la consulta está arriba y da 389 observaciones con costo y fecha.
Quien tenga el 351 debería decir con qué filtro lo obtuvo — la diferencia son 38 filas.

## Lo que la vuelta 5 NO cerró

- **Nadie inserta el `cotizacion_evento` del override.** La fila auditable existe y ahora además se
  LEE (`leerOverridesDePrecio`), pero el evento del §21 sigue faltando: falta el caller.
- **`analisis_linea.cantidad` NULL sigue sin existir en la base**: la guarda está probada con
  fixtures, en el motor y en el gate SQL.
- **Los 180 días de vigencia de un subcontrato son una decisión mía, no del dueño.** Se eligió el
  mismo corte que un precio de recurso porque no hay motivo para que uno venza y el otro no, pero
  nadie lo firmó.
- **El rol `administracion` sigue sin existir en ningún perfil.**
