# MO · MA · SUB por obra — auditoría del 15/09/2026

**Pedido del dueño:** «revisión de MO, MA, SUB en cada obra que aparece en app.ecsas.com.ar, al
detalle; no puede fallar nunca eso».

**Cómo se produjo este informe.** `node orquestador/scripts/auditar-costo-por-obra.mjs` — sólo
lectura, en una transacción `repeatable read`, con la sesión de un perfil de **Dirección** (sin ella
`costo_mo_quincena` devuelve cero filas y toda la mano de obra da `null`). Corte del motor:
`current_date` = **2026-09-16** (el servidor está en UTC; en San Juan todavía es el 15). 26 obras
canónicas no fusionadas —las dos `ZZ-*` de prueba quedan afuera— más los tres cajones «Sin obra –
CLIENTE». 969 filas de la pestaña Compras.

**Nada se corrigió.** Cada hallazgo trae la corrección que correspondería y la firma el dueño.

---

## 0 · Lo primero, porque cambia cómo se lee todo lo demás

**La app publica DOS costos distintos para la misma obra, y ninguna pantalla dice cuál es cuál.**

| Pantalla | De dónde saca el costo | Ejemplo |
|---|---|---|
| Ficha del **cliente** | `costo_de_obras_a_la_fecha()` → `compra_obra_asignada` (la columna **L** de Compras) | LE - GALPÓN 7: **$18.289.159** |
| Pantalla de la **obra** (`TitularObra`, `TabEconomia`) | `obra_panel.costo_real` → vista `obra_costo_real`, que empareja por el **texto** de la columna J contra `obra_alias` | LE - GALPÓN 7: **$0** |

Medido hoy: **18 obras de 26 discrepan**, y en **14 de ellas la pantalla de la obra muestra $0**
teniendo costo real. En sentido contrario, «LE - OBRA GENERAL» muestra **$156.396.267** que la
definición viva imputa a las sub-obras.

- **HECHO** · `obra_panel` selecciona `ocr.costo_real` de `obra_costo_real` (verificado en
  `pg_views`); `src/features/obras/components/TitularObra.tsx:176` lo pinta.
- **CAUSA RAÍZ** · `obra_costo_real` es anterior a la columna «Obra» (L). Empareja
  `norm_obra(costos_obra.obra_texto)` contra `obra_alias`: eso resuelve el nombre del **cliente**,
  no el de la obra, así que toda la plata del cliente cae en la obra paraguas y ninguna en las
  sub-obras.
- **CORRECCIÓN PROPUESTA (no aplicada)** · reescribir `obra_costo_real` sobre
  `compra_obra_asignada` —una sola definición del costo— y que `obra_panel` la consuma. Mientras
  tanto, la pantalla de la obra no debería mostrar un costo.

---

## 1 · Tabla por obra

«MA Sheet» y «SUB Sheet» salen de la pestaña **viva**, agrupada por la columna L y con la misma
regla «a la fecha» que aplica el motor, calculada en JS. «MA app» y «SUB app» salen de
`costo_de_obras_a_la_fecha`. La diferencia entre las dos columnas, cuando existe, está explicada
fila por fila más abajo.

| Obra | Nombre | MA Sheet | MA app | SUB Sheet | SUB app | MO app | Por vencer | HH | |
|---|---|---:|---:|---:|---:|---:|---:|---:|:-:|
| OB-0001 | AR - MANTENIMIENTO | 9.809.137 | 9.820.117 | 0 | — | 2.081.264 | 0 | 282 | ✖ |
| OB-0002 | Galpones | — | — | — | — | — | 0 | — | ✔ |
| OB-0003 | LE - OBRA GENERAL | — | — | — | — | 22.963.937 | 0 | 3.382 | ✖ |
| OB-0004 | ME - OBRA GENERAL | — | — | — | — | 6.385.765 | 0 | 869 | ✖ |
| OB-0005 | SF - GALPONES, MAMPOSTERÍA Y CANCHA DE PÁDEL | 40.000 | 40.000 | 4.200.000 | 4.200.000 | 82.847.287 | 0 | 12.117 | ✖ |
| OB-0006 | LE - OFICINA Y FÁBRICA DE PALITOS | 44.849.760 | 44.612.967 | 0 | — | 18.887.484 | 395.606 | 2.447 | ✖ |
| OB-0007 | LE - GALPÓN 9 | 27.735.472 | 28.421.542 | 1.068.500 | 1.068.500 | 8.659.471 | 2.355.725 | 1.055 | ✖ |
| OB-0008 | QP - SALÓN COMERCIAL | 37.188.800 | 37.188.800 | 2.080.000 | 2.080.000 | 4.415.882 | 3.366.907 | 565 | ✖ |
| OB-0009 | ME - LIMPIEZA DE ESCOMBROS | — | — | — | — | 2.532.782 | 0 | 0 | ✖ |
| OB-0010 | SF - ENTREPISO Y ESCALERA | 181.500 | 181.500 | 0 | — | 1.447.514 | 172.501 | 197 | ✖ |
| OB-0011 | SF - PISOS INDUSTRIALES | 2.782.723 | 2.782.723 | 1.967.273 | 1.967.273 | 1.515.447 | 12.729.713 | 204 | ✖ |
| OB-0012 | SF - INSTALACIÓN ELÉCTRICA | 90.500 | 90.500 | 0 | — | 682.059 | 0 | 90 | ✖ |
| OB-0014 | ME - BSA ADICIONAL | — | — | — | — | — | 0 | — | ✔ |
| OB-0016 | ME - RELEVAMIENTO TOPOGRÁFICO | — | — | — | — | — | 0 | — | ✔ |
| OB-0017 | ME - PILÓN | — | — | — | — | — | 0 | — | ✔ |
| OB-0018 | ME - ADICIONAL TERCER MURO | — | — | — | — | — | 0 | — | ✔ |
| OB-0019 | ME - BSA | 6.025.452 | 6.025.452 | 5.600.000 | 5.600.000 | — | 0 | — | ✖ |
| OB-0020 | ME - PISOS 120 M² Y RAMPA | 1.839.200 | 1.839.200 | 540.000 | 540.000 | 3.013.066 | 0 | 368 | ✖ |
| OB-0021 | ME - PLAYÓN DE AZUFRE | — | — | — | — | — | 0 | — | ✔ |
| OB-0022 | ME - PLAYÓN DILUCIÓN DE ÁCIDO | 346.012 | 346.012 | 0 | — | 833.640 | 500.000 | 119 | ✖ |
| OB-0023 | SF - MAMPOSTERÍA | 90.000 | 90.000 | 0 | — | 5.519.691 | 0 | 701 | ✖ |
| OB-0024 | ME - BASES TANQUE SO2 | 2.196.386 | 2.196.386 | 3.000.000 | 3.000.000 | — | 0 | — | ✖ |
| OB-0068 | LE - GALPÓN 7 | 18.289.159 | 18.289.159 | 0 | — | — | 0 | — | ✖ |
| OB-0069 | LE - GALPÓN 8 | 4.966.852 | 4.966.852 | 0 | — | 7.056.375 | 0 | 996 | ✖ |
| OB-0070 | LE - CIERRE PERIMETRAL | 6.512.169 | 6.512.169 | 0 | — | — | 0 | — | ✖ |
| OB-0071 | LE - MAMPOSTERÍA | 13.616.888 | 13.616.888 | 0 | — | 27.216.827 | 0 | 3.668 | ✖ |
| — | **Sin obra – SAN FRANCISCO** | 23.796.825 | 23.796.825 | 10.465.000 | 10.465.000 | — | 0 | — | ✖ |
| — | **Sin obra – LA ESTRELLA** | 33.531.954 | 33.531.954 | 2.270.000 | 2.270.000 | — | 4.903 | — | ✖ |
| — | **Sin obra – MESSINA** | 4.191.978 | 4.191.978 | 709.000 | 709.000 | — | 0 | — | ✖ |

**Totales que publica la app:** materiales **$177.020.269**, subcontratos **$18.455.773**, mano de
obra **$196.058.490**.

> **✔ / ✖ no es «el número está mal»**: ✖ significa que esa obra tiene al menos un hallazgo abierto,
> incluido «la pantalla de la obra muestra otro costo» y «MO y MA no están al mismo nivel». Las seis
> ✔ son obras sin movimiento: no tienen nada que cuadrar.

---

## 2 · La cañería, medida capa por capa — lo que SÍ está bien

Esto importa tanto como los hallazgos, porque acota dónde puede estar el error.

| Control | Resultado |
|---|---|
| Pestaña viva vs `compra_sheet` (espejo), obra por obra | **0 diferencias** |
| `costo_de_obras_a_la_fecha` vs recuento independiente sobre `compra_sheet` | **0 diferencias** |
| «Por vencer» en SQL sobre `costos_obra` vs en JS sobre la pestaña | **0 diferencias** |
| Cada peso de la columna L, explicado (entra al costo o tiene un motivo con nombre) | **0 residuo** en las 26 obras y los 3 cajones |
| `compra_obra_asignada` dice la misma obra que la columna L | **0 diferencias** en 969 filas |

**CÁLCULO.** El recuento independiente no lee `costos_obra` (la tabla que la RPC consume) sino
`compra_sheet`, y la regla «a la fecha» está escrita dos veces a propósito: en SQL sobre el espejo y
en JS sobre la pestaña. Que los tres caminos den el mismo peso es lo que permite afirmar que **el
motor de suma no está fallando**. Lo que falla es la IMPUTACIÓN y la DEFINICIÓN.

---

## 3 · Hallazgos por tipo

| Tipo | N | Importe en duda |
|---|---:|---:|
| `vista_vieja_discrepa` — la pantalla de la obra muestra otro costo | 18 | 379.237.162 |
| `costo_sin_obra_asignada` — plata en el cajón «Sin obra – CLIENTE» | 3 | 74.964.757 |
| `unidad_contradice_destino` — la unidad de negocio y la columna L no coinciden | 85 | 59.318.160 |
| `materiales_sin_mo` — obra con materiales y cero horas | 4 | 41.623.167 |
| `mo_sin_materiales` — obra con horas y cero materiales | 5 | 38.849.690 |
| `subcontratista_sin_obra` — subcontrato imputado al cajón del cliente | 15 | 13.444.000 |
| `subcontrato_facturado_en_otra_obra` | 1 | 12.380.000 |
| `duplicado_probable` | 19 | 5.135.691 |
| `otra_obra_nombrada` — el texto de la fila nombra otra obra que la columna L | 1 | 4.200.000 |
| `app_no_suma_lo_que_el_dueno_ve` — notas de crédito que la app no resta | 5 | 1.491.504 |
| `pagado_total_no_coincide` | 63 | 678.326 |
| `fila_sin_destino` — columna L vacía | 2 | 346.800 |
| `hh_de_jefe_en_obra` | 4 | — |
| `hh_despues_del_cierre` | 2 | — |
| `hh_sin_obra` | 1 | — |
| `mo_falta_dato` | 1 | — |
| **Total** | **229** | |

---

## 4 · Los 10 de mayor importe

| # | Importe | Hallazgo | Dónde |
|---:|---:|---|---|
| 1 | 156.396.267 | `vista_vieja_discrepa` | OB-0003 — la pantalla de la obra dice $156.396.267, la ficha del cliente $0 |
| 2 | 52.316.035 | `vista_vieja_discrepa` | OB-0005 — $56.556.035 contra $4.240.000 |
| 3 | 44.612.967 | `vista_vieja_discrepa` | OB-0006 — la pantalla de la obra dice **$0** con $44.612.967 imputados |
| 4 | 35.801.954 | `costo_sin_obra_asignada` | Sin obra – LA ESTRELLA: $33.531.954 de materiales + $2.270.000 de subcontratos, 55 comprobantes |
| 5 | 34.261.825 | `costo_sin_obra_asignada` | Sin obra – SAN FRANCISCO: $23.796.825 de materiales + $10.465.000 de subcontratos, 139 comprobantes |
| 6 | 29.490.042 | `vista_vieja_discrepa` | OB-0007 — la pantalla de la obra dice **$0** |
| 7 | 25.010.829 | `vista_vieja_discrepa` | OB-0004 |
| 8 | 22.963.937 | `mo_sin_materiales` | OB-0003 — 3.381,5 h y $0 de materiales |
| 9 | 18.289.159 | `vista_vieja_discrepa` | OB-0068 — la pantalla de la obra dice **$0** |
| 10 | 18.289.159 | `materiales_sin_mo` | OB-0068 — $18.289.159 sin una sola hora |

Los tres primeros y el 6, 7 y 9 son **el mismo defecto de definición** (§0). Sacándolo, la lista
económica real la encabezan el cajón sin obra (§5) y el desnivel MO/MA (§6).

---

## 5 · $74.964.757 de costo de obra que nunca llega a una obra

| Cajón | Materiales | Subcontratos | Comprobantes |
|---|---:|---:|---:|
| Sin obra – LA ESTRELLA | 33.531.954 | 2.270.000 | 55 |
| Sin obra – SAN FRANCISCO | 23.796.825 | 10.465.000 | 139 |
| Sin obra – MESSINA | 4.191.978 | 709.000 | 17 |
| **Total** | **61.520.757** | **13.444.000** | **211** |

- **HECHO** · son filas con el cliente cargado en la columna J y la columna L en «Sin obra – X».
  La app las publica aparte, con su nombre: no se pierden, pero no entran a ninguna obra.
- **INFERENCIA** · mientras estén ahí, **el costo de todas las obras de esos tres clientes está
  subvaluado** y ningún margen por obra cierra. Es el desvío más grande y el más barato de cerrar:
  no hay que tocar código, hay que imputar 211 filas.
- **Dentro de ese total, 15 filas por $13.444.000 son de SUBCONTRATISTAS** (Gerson Castro, Ángel
  Fernández, PEDRO TELLO). Un subcontrato siempre se ejecuta en una obra concreta: éstas son las de
  corrección más urgente porque son pocas y de monto alto.

| Fila | Proveedor | Importe | Cajón |
|---:|---|---:|---|
| 355 | Gerson Castro | 4.000.000 | SAN FRANCISCO |
| 322 | Ángel Fernández | 1.150.000 | SAN FRANCISCO |
| 492 | Gerson Castro | 1.450.000 | LA ESTRELLA |
| 714 | Gerson Castro | 800.000 | SAN FRANCISCO |
| 489 | Gerson Castro | 800.000 | SAN FRANCISCO |
| 356 · 488 · 490 | Gerson Castro | 700.000 c/u | SAN FRANCISCO |
| 485 | Gerson Castro | 680.000 | SAN FRANCISCO |
| 493 | PEDRO TELLO | 570.000 | LA ESTRELLA |
| 340 | Ángel Fernández | 495.000 | SAN FRANCISCO |
| 341 | Ángel Fernández | 440.000 | SAN FRANCISCO |
| 603 | PEDRO TELLO | 384.000 | MESSINA |
| 604 | Ángel Fernández | 325.000 | MESSINA |
| 491 | Gerson Castro | 250.000 | LA ESTRELLA |

- **CORRECCIÓN PROPUESTA (no aplicada)** · imputar cada fila a su obra en la columna L. No se toca
  el Sheet desde esta auditoría.

---

## 6 · MO y MA no viven en el mismo nivel de obra

**El margen por obra hoy no es legible, y no por un error de suma.**

| Obra | Horas | MO | MA + SUB |
|---|---:|---:|---:|
| OB-0003 LE - OBRA GENERAL | 3.381,5 | 22.963.937 | **0** |
| OB-0005 SF - GALPONES… | 12.117 | 82.847.287 | **4.240.000** |
| OB-0004 ME - OBRA GENERAL | 868,5 | 6.385.765 | **0** |
| OB-0023 SF - MAMPOSTERÍA | 701 | 5.519.691 | 90.000 |
| OB-0009 ME - LIMPIEZA DE ESCOMBROS | **0** | 2.532.782 | 0 |
| OB-0010 SF - ENTREPISO Y ESCALERA | 197 | 1.447.514 | 181.500 |
| OB-0068 LE - GALPÓN 7 | **0** | — | 18.289.159 |
| OB-0019 ME - BSA | **0** | — | 11.625.452 |
| OB-0070 LE - CIERRE PERIMETRAL | **0** | — | 6.512.169 |
| OB-0024 ME - BASES TANQUE SO2 | **0** | — | 5.196.386 |

- **CAUSA RAÍZ** · las horas entran por el alias de **JORNALES**, que nombra al **cliente**
  («SAN FRANCISCO», «LA ESTRELLA»), y caen en la obra paraguas. Los materiales entran por la columna
  **L** de Compras, que nombra la **sub-obra**. Las dos cifras son correctas por separado; la resta
  entre ellas no significa nada.
- **CORRECCIÓN PROPUESTA** · decidir el nivel al que se mide una obra y llevar las dos mitades ahí.
  Si el nivel es la sub-obra, JORNALES necesita la sub-obra; si es el cliente, el margen por obra
  debe dejar de publicarse. **Es una decisión del dueño, no del código.**
- OB-0009 (ME - LIMPIEZA DE ESCOMBROS) publica **$2.532.782 de MO con 0 horas**: la obra es de tipo
  paraguas y recibe costo repartido. Queda como **DESCONOCIDO** hasta revisar el reparto.

---

## 7 · Las notas de crédito que la app no resta — $1.491.504

| Fila | Proveedor | Importe | Obra / cajón |
|---:|---|---:|---|
| 787 | Hormiserv | −686.070 | OB-0007 LE - GALPÓN 9 |
| 487 | DUPEC | −531.000 | Sin obra – SAN FRANCISCO |
| 744 | Corralón Progreso | −149.756 | Sin obra – LA ESTRELLA |
| 900 · 901 · 578 · 833 | Corralón Progreso / Herrajes SJ | −113.207 | OB-0006 |
| 669 | Corralón Progreso | −10.980 | OB-0001 |
| 778 | Ductos San Juan | −491 | Sin obra – SAN FRANCISCO |

- **HECHO** · las nueve filas existen en `compra_sheet` y **ninguna** llega a `costos_obra`.
- **CAUSA RAÍZ** · `orquestador/lib/compras-costo-de-obra.mjs`:

  ```js
  const total = c.total ?? c.importe
  return Number(total) > 0      // ← toda nota de crédito se cae
  ```

  El corte `> 0` se puso para que una fila «ELIMINADO» con importe pegado no entrara al costo —ese
  caso ya lo cubren las dos líneas de arriba (`estado === 'ELIMINADO'` y `anulada`)—. El efecto es
  **unidireccional y siempre en contra: la app cobra de más.**
- **CORRECCIÓN PROPUESTA (no aplicada)** · `Number(total) !== 0`. El motor «a la fecha»
  (`costo_de_obra_filas`) **ya contempla** el caso (`when c.total < 0 then c.total`): la fila nunca
  le llega.

---

## 8 · El resto de los hallazgos

**`otra_obra_nombrada` — fila 806, $4.200.000.** PEDRO TELLO, columna L = `OB-0005 · SF - GALPONES`,
columna K = «Pisos Industriales», columna M = «Galpon 5». **La fila se contradice a sí misma**: es la
que el dueño corrigió el 15/09 mirando M, y K sigue diciendo lo contrario. No es un falso positivo:
alguien tiene que decidir cuál de las dos manda y corregir la otra. Es el único caso que el detector
encuentra en 969 filas — el otro que el dueño reportó (el subcontrato de PEDRO TELLO colgado de
Quattropani) ya está corregido y el registro `799482f9` apunta a `pisos-industriales`.

**`subcontrato_facturado_en_otra_obra` — $12.380.000.** El contrato «Gerson Castro – Messina ·
Clasificación de escombros» ($2.300.000) cuelga de `limpieza-de-escombros`, y las compras de Gerson
Castro por $12.380.000 están imputadas a los cajones de SAN FRANCISCO y LA ESTRELLA. O el contrato
está en la obra equivocada, o las compras lo están, o hay varios trabajos del mismo subcontratista
bajo un solo contrato. **DESCONOCIDO** hasta que el dueño lo diga; no se toca ninguno de los dos.

**`unidad_contradice_destino` — 85 filas, $59.318.160.** Son las que `compra_sheet.obra_inconsistencia`
ya marca. **Sólo 5 tocan una obra o un cajón** ($452.800, encabezadas por Leandro Rojas $350.000 con
unidad «Estructura» dentro de OB-0006, que por eso NO entra al costo de esa obra). Las otras 80
($58,9 M) son filas de Impuestos y Financiero en el destino ES-ADM: **no distorsionan ninguna obra**,
pero confirman que Compras sigue recibiendo filas que pertenecen a otras pestañas.

**`duplicado_probable` — 19 grupos, $5.135.691.** Los cuatro de mayor monto:

| Filas | Proveedor | Importe en riesgo | Señal |
|---|---|---:|---|
| 779 · 780 | Sueldos | 3.000.000 | mismo día, mismo monto, en ES-ADM |
| 488 · 490 | Gerson Castro | 700.000 | mismo día, mismo monto, mismo cajón |
| 318 · 319 | FEMENIA | 250.000 | mismo día, mismo monto, **obras distintas** |
| 206 · 207 | Meglioli Facundo Fabián | 130.680 | **mismo N° de comprobante**, obras distintas |

Los siete grupos de Meglioli y MASS CONSULTORA repiten el patrón «mismo comprobante, dos obras
distintas»: parece un **gasto partido a propósito entre dos obras** con el mismo papel. Si es así no
es un duplicado, pero hoy nada en la fila lo declara. **DESCONOCIDO.**

> Se descartaron como duplicados los planes de cuotas: PEDRO TELLO ($6.450.400 en 6 filas iguales) y
> Pedro Fredes ($5.200.000 en 5) tienen la misma fecha de factura y vencimientos semanales
> distintos. La primera versión del detector los marcó por $8,4 M porque el N° de comprobante está
> vacío en todos y «vacío = vacío». Dos alarmas falsas de ese tamaño alcanzan para que nadie vuelva
> a mirar la lista.

**`pagado_total_no_coincide` — 63 filas, $678.326.** Dicen «Pagado / Total» con un `Monto Pagado`
distinto del total. La mayoría son diferencias de retención o de redondeo del banco. No afecta el
costo (que sale de `Total`), sí afecta la caja. Ninguna supera $15.000.

**`fila_sin_destino` — 2 filas, $346.800.** Fila 89 (Ebuyplace, J = «SAINT GOBAIN», $96.800) y fila
357 (SERVICIOS TALLER, J = «Papa», $250.000): columna L vacía. No están en ninguna obra ni en
estructura.

**Mano de obra y horas.**

| Hallazgo | Detalle |
|---|---|
| `hh_sin_obra` | 681 h en 19 filas sin persona y sin obra canónica — no cuestan a ninguna obra |
| `hh_de_jefe_en_obra` | 1.628,5 h (OB-0005) · 1.229 h (OB-0003) · 98 h (OB-0008) · 98 h (OB-0011) de jefes de obra cargadas en la obra. La regla del 14/09 manda su costo entero a Estructura: **la pantalla de HH muestra horas que no cuestan a la obra y no lo dice** |
| `hh_despues_del_cierre` | OB-0023 SF - MAMPOSTERÍA: 156 h entre el 03 y el 14/09 con fin declarado el 02/09. OB-0005: 53 h entre el 31/08 y el 07/09 con fin el 28/08. O la obra no está cerrada, o las horas son de otra |
| `mo_falta_dato` | OB-0071: 8 h de 1 persona sin tarifa. Su costo va como `null` y **la MO de la obra queda subvaluada sin decirlo en pantalla** |
| `hh_en_obra_fusionada` | **0** — las dos obras fusionadas no tienen horas colgando |

---

## 9 · Qué cambiar en el código para que no vuelva a pasar

| # | Cambio | Archivo | Qué defecto cierra |
|---|---|---|---|
| 1 | `Number(total) > 0` → `Number(total) !== 0` | `orquestador/lib/compras-costo-de-obra.mjs` | las 9 notas de crédito, $1.491.504 |
| 2 | Reescribir `obra_costo_real` sobre `compra_obra_asignada` y retirar el emparejamiento por texto | migración nueva + `obra_panel` | los dos costos distintos por obra, 18 obras |
| 3 | La columna «Obra» (L) obligatoria al cargar un comprobante de un cliente con obras abiertas | `cargar-comprobantes-compras.mjs` / bot / app de Compras | el cajón sin obra no vuelve a crecer |
| 4 | Un proveedor con rubro «Subcontratista» **no puede** quedar en «Sin obra»: la carga lo rechaza | misma capa de carga | las 15 filas por $13.444.000 |
| 5 | Al guardar la columna L, avisar si K/M/J nombran otra obra (la regla de `otraObraNombrada`) | capa de carga | el caso «Galpón 5» |
| 6 | La pantalla de HH tiene que decir que las horas de jefe **no** cuestan a la obra | `src/features/obras/` | 3.053,5 h que parecen costo y no lo son |
| 7 | Cuando `horas_sin_tarifa > 0`, la pantalla debe declarar que la MO está incompleta | `src/features/obras/` | `mo_falta_dato` silencioso |
| 8 | Correr `auditar-costo-por-obra.mjs` con el timer diario y avisar por Mattermost si aparece un hallazgo nuevo | `orquestador/` | todo lo demás |

---

## 10 · Lo que esta auditoría NO pudo hacer

- **No verificó ningún comprobante contra su papel.** Todo lo de acá sale de la pestaña y de la base.
  Si una fila tiene el importe mal cargado, este informe lo repite sin verlo.
- **No decide ninguna imputación.** Cada corrección propuesta la firma el dueño: cambiar de obra una
  fila de Compras tiene efecto económico sobre el margen de dos obras a la vez.
- **El detector `otraObraNombrada` es conservador a propósito.** Sólo dispara con la huella
  distintiva de otra obra (con dígito o dos palabras) y no con nombres genéricos: «LE - MAMPOSTERÍA»
  no tiene huella utilizable, así que una fila de esa obra mal imputada **no se detecta**. De las 26
  obras, **6 no tienen huella utilizable**: AR - MANTENIMIENTO · Galpones · ME - PILÓN · ME - BSA ·
  SF - MAMPOSTERÍA · LE - MAMPOSTERÍA. Una fila mal imputada a cualquiera de esas seis pasa sin que
  el detector diga nada.
- **Los duplicados son candidatos, no conclusiones.** El criterio (misma fecha, mismo proveedor,
  mismo importe, vencimientos no escalonados) no puede distinguir un gasto partido entre dos obras
  de una carga repetida.
- **`hh_despues_del_cierre` depende de `fecha_fin_real`**, que en varias obras está declarada a mano.
  Una fecha mal puesta produce un hallazgo falso y una fecha ausente tapa uno real.
- **La mano de obra se leyó con la sesión de UN perfil de Dirección.** Si otro perfil viera otra
  cosa, este informe no lo detecta.
- **El corte es `current_date` del servidor (UTC).** Entre las 21:00 y las 24:00 de San Juan, el
  motor ya está en el día siguiente. No mueve nada hoy porque la regla «a la fecha» ya no filtra por
  fecha de comprobante, pero sí desplaza un día la frontera de «por vencer».
- **La regla «a la fecha» que se auditó es la que estaba viva a las 21:50 del 15/09.** Otro agente la
  desplegó mientras esta auditoría corría (`costo_de_obra_filas`, con `a_la_fecha` y `por_vencer`) y
  el informe se realineó contra ella. La migración `20260915T0815` del repo **ya no es lo que
  corre**: si alguien la vuelve a aplicar, borra la regla nueva.
