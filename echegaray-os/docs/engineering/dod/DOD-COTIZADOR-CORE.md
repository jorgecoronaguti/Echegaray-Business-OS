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
