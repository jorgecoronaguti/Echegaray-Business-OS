// LAS OBRAS EN CURSO Y FUTURAS, CON SU PROYECCIÓN DE COSTOS — INSUMO DECLARADO DEL DUEÑO.
//
// QUÉ ES ESTE ARCHIVO (07/08/2026). La transcripción de las explosiones de gastos que el dueño armó
// en PDF, obra por obra. Es un módulo de DATOS, no de cálculo: los montos NO se corrigen, NO se
// escalan y NO se completan acá — vienen ya escalados por el % pendiente de ejecución donde
// corresponde (BSA al 60% restante). La regla de oro 1 manda: nunca fabricar datos.
//
// QUIÉN LO CONSUME. `obras-grilla.mjs` arma con esto la Sección 2 de la pestaña OBRAS: los montos de
// este archivo son los ÚNICOS números tipeados de esa pestaña (con su origen declarado en prosa);
// todo lo demás es fórmula viva sobre Cobranzas / Compras / Materiales.
//
// CONVENCIONES:
// · `cliente` es el nombre CANÓNICO del desplegable de Compras col J — el mismo texto, letra por
//   letra, porque las fórmulas de "real acumulado" filtran por él.
// · `proveedor` es el canónico de Compras col E cuando ya existe en el desplegable (verificado
//   07/08 contra el archivo real: 'Gruas San Blas', 'VILLA DEL PINO', 'Pintureria Cordoba',
//   'FEMENIA', 'Alumetal', 'Ferretec', 'Hormiserv'). ACA, Bedini, Sika, Mercado Libre todavía no
//   tienen filas en Compras: quedan con el nombre del dueño y el real da $0 hasta la primera factura.
// · `horas` y `moCargasPesos` vienen YA ESCALADAS por lo NO ejecutado.
// · `cuotas`: cuando el dueño repartió un egreso en el tiempo. La suma de cuotas = `monto` (se
//   verifica en el test). Donde el dueño dijo sólo el MES, el día es convención declarada (el 10).
// · `familia` es descriptiva (INFERENCIA del concepto, no dato del dueño): sirve para agrupar, no
//   para cruzar contra la columna "Familia de material" de Compras.
// · `noCaja.maquinaPesos` NUNCA entra al flujo: es uso de equipo propio, no plata que sale.
// · `ventaTexto`: el texto con el que la obra aparece en el Concepto de Cobranzas — la grilla lo usa
//   para la fórmula viva de venta.
// · `comprasObra`: ver el bloque de abajo. Es el ÚNICO camino por el que una compra llega a una obra.

import { ALERTA } from './glifos.mjs'

/** Los clientes canónicos del desplegable de Compras col J que usan estas obras. */
export const CLIENTES_CANONICOS = ['San Francisco', 'MESSINA', 'Quattropani - Melisa García SAS']

/**
 * ═══ `comprasObra`: CÓMO UNA COMPRA LLEGA A UNA OBRA — Y POR QUÉ NO ES POR PROVEEDOR (14/08/2026) ═══
 *
 * EL DEFECTO. El cuadro 4 de la pestaña OBRAS publicó `Pagado (real) = $0` en las siete obras. El
 * dueño, textual: *"el cuadro 4 en obras costo esta mal, hay gastos en pestaña compras q si se han
 * hecho para las obras señaladas"*. Tenía razón: Compras tiene $74.774.766 imputados a los tres
 * clientes de estas obras (San Francisco $27.355.552 · MESSINA $20.060.254 · Quattropani
 * $27.358.960, medidos sobre "Importe" el 14/08). Ni un peso llegaba al cuadro.
 *
 * POR QUÉ DABA CERO. El camino anterior era `proveedor + cliente + fecha ≥ inicio de obra`, y los
 * tres filtros fallan a la vez:
 *   · PROVEEDOR — cuatro de los diez de la explosión no existen en Compras (ACA, Bedini, Sika,
 *     Mercado Libre: 0 filas). Y los que existen facturan a OTRO cliente: VILLA DEL PINO tiene 19
 *     filas, casi todas "Administracion"; Gruas San Blas, 2, las dos "Taller".
 *   · FECHA — el corte `≥ inicio` es directamente incorrecto en construcción: se compra ANTES de
 *     arrancar. Los $27.358.960 de Quattropani se facturaron el 29/07 y la obra empieza el 18/08;
 *     Playón empieza el 24/08, o sea que el filtro pedía facturas de un futuro que no existe.
 *   · Y AUNQUE LOS DOS ANDUVIERAN, el techo del universo medible eran los egresos declarados
 *     ($18,9M de $145,9M): el otro 87% del costo proyectado es MANO DE OBRA, que no está en Compras
 *     ni puede estarlo — va por Jornales. Ese límite no lo arregla ningún emparejamiento.
 *
 * EL CAMINO QUE SÍ EXISTE es la columna K de Compras, "Detalles / Obra": el texto que el dueño
 * escribe a mano cuando carga el comprobante. Verificado contra el archivo vivo el 14/08:
 *
 *   | obra                        | patrón en K          | filas | importe neto  |
 *   |-----------------------------|----------------------|-------|---------------|
 *   | sf-pisos-industriales       | "Pisos Industriales" |     1 |  $ 4.200.000  |
 *   | messina-bsa                 | "BSA"                |     8 |  $ 7.955.772  |
 *   | quattropani-salon-comercial | "Salones Comerciales"|     3 | $27.358.960   |
 *
 * LAS OTRAS CUATRO OBRAS DECLARAN `null`, Y ESO NO ES UN OLVIDO. Ninguna fila de Compras las nombra:
 * "mamposteria", "entrepiso", "escalera", "playon" y "azufre" dan CERO coincidencias en K. Las dos
 * de MESSINA que no empezaron todavía es lo esperable; las de San Francisco quieren decir que el
 * gasto está cargado sin decir a qué obra va.
 *
 * ═══ POR QUÉ UN TEXTO DECLARADO A MANO Y NO UN PARECIDO AUTOMÁTICO ═══
 *
 * Porque un emparejamiento por similitud que acierta el 60% es PEOR que un cero honesto: mete el
 * gasto de una obra en otra y nadie se entera. Este repo ya pagó esa factura (corregir sobre una
 * coincidencia PROBABLE duplicó $2,1M). Y la similitud tampoco alcanzaría acá: la obra se llama
 * "SALÓN COMERCIAL" y Compras dice "Salones Comerciales" — plural y sin tilde—, así que cualquier
 * normalizador que las una une también cosas que no van juntas.
 *
 * LA DIRECCIÓN DEL ERROR ES LA QUE IMPORTA. Si el dueño escribe mañana un texto nuevo en K, ese
 * dinero NO cae en la obra equivocada: cae en la fila "SIN IMPUTAR" del cuadro 4, que es visible y
 * hoy vale $35.260.034. Un patrón que falta se ve; un patrón que sobra-empareja, no.
 *
 * CÓMO SE AGREGA UNO. Se mira qué dice Compras col K para ese cliente, se copia el texto LITERAL
 * (un tramo que aparezca en todas las filas de esa obra y en ninguna otra) y se anota acá con las
 * filas y el importe que empareja el día que se declaró. No se inventa un texto que "debería" estar.
 */

/**
 * ═══ POR QUÉ `null` YA NO DEVUELVE `null` (17/08/2026) ═══
 *
 * El dueño, sobre el cuadro 4: *"hay mas gastos en compras de algunas de las obras nuevas q no estan
 * siendo considerados"*. Tenía razón otra vez, y el motivo no era el criterio —que es bueno— sino
 * dónde vivía: las cuatro obras nuevas declaraban `null`, `null` se traducía a `'=0'`, y la celda
 * quedaba MUERTA. No "en cero": muerta. Aunque mañana alguien escribiera "Entrepiso" en la columna K
 * de Compras, el cuadro habría seguido publicando $0 hasta que una persona editara este archivo.
 *
 * Eso es la misma falla que ya corregimos con las quincenas confirmadas: **el vínculo entre un dato y
 * su obra vivía en el código y no en la fuente**. Una obra nueva no puede nacer sin forma de
 * emparejar y esperar a que un programador la habilite.
 *
 * LO QUE NO CAMBIA, Y ES EL CORAZÓN DEL DISEÑO: sigue sin haber parecido automático. El patrón por
 * defecto es el NOMBRE DE LA OBRA, literal — el texto que cualquiera escribiría en «Detalles / Obra»
 * para decir a qué obra va ese gasto. Si nadie lo escribe, el SUMIFS da cero y la plata se ve entera
 * en la fila SIN IMPUTAR, igual que antes. La dirección del error no se movió: lo dudoso nunca cae
 * en una obra.
 *
 * LO QUE SÍ CAMBIA: `comprasObra` pasa de ser el ÚNICO camino a ser un OVERRIDE, para los casos en
 * que la fuente no usa el nombre de la obra — "Salones Comerciales" por SALÓN COMERCIAL, "BSA" por
 * la planta. Ésos siguen declarados a mano, con sus filas y su importe, porque son excepciones
 * verificadas y no suposiciones.
 */

/** El tramo de "Detalles / Obra" (Compras col K) que identifica esta obra. Si no hay override
 *  declarado, es el nombre de la obra tal como se lo escribiría en la fuente. El emparejamiento es
 *  SIEMPRE cliente + este texto: nunca por proveedor. */
export const comprasObraDe = (o) => {
  if (o?.comprasObra) return String(o.comprasObra)
  const propio = o?.ventaTexto ?? o?.obra
  return propio ? String(propio) : null
}

/** ¿El texto por el que empareja fue VERIFICADO contra Compras, o es el nombre de la obra a la
 *  espera de que alguien lo escriba en la fuente? La pestaña lo dice en su columna de auditoría: un
 *  patrón supuesto no puede mostrarse igual que uno comprobado. */
export const patronEstaDeclarado = (o) => Boolean(o?.comprasObra)

/** ¿La obra tiene fechas y por lo tanto se puede proyectar al flujo? */
export const esProyectable = (o) => Boolean(o?.inicio && o?.fin)

/** El total de egresos proyectados de caja de una obra (egresos + MO). Suma, no redefine. */
export const totalEgresos = (o) =>
  (o?.egresos ?? []).reduce((s, e) => s + (Number(e.monto) || 0), 0) + (Number(o?.moCargasPesos) || 0)

export const OBRAS_FUTURAS = [
  {
    clave: 'sf-pisos-industriales',
    cliente: 'San Francisco',
    obra: 'PISOS INDUSTRIALES',
    ventaTexto: 'Pisos Industriales',
    // 14/08: 1 fila en Compras, PEDRO TELLO 08/08, $4.200.000 neto. Es la única de San Francisco que
    // nombra una obra del cuadro; ninguna otra fila del cliente contiene "pisos industriales".
    comprasObra: 'Pisos Industriales',
    inicio: '2026-08-05',
    fin: '2026-09-30',
    plantelFullTime: 3,
    plantelTemporales: 10,
    pctEjecutado: 0,
    horas: { oficialEspecializado: 100, oficial: 3533.4, ayudante: 414 },
    moCargasPesos: 21_904_446,
    egresos: [
      { concepto: 'Gasoil', proveedor: 'ACA', familia: 'Combustible', monto: 377_740, fechaEstimada: '2026-08-10' },
      {
        concepto: 'Nafta', proveedor: 'VILLA DEL PINO', familia: 'Combustible', monto: 977_760,
        cuotas: [
          { fecha: '2026-08-10', monto: 488_880 },
          { fecha: '2026-09-10', monto: 488_880 },
        ],
        nota: 'repartida en 2 cuotas ago/sep por el dueño; el día 10 es convención',
      },
    ],
    noCaja: { maquinaPropia: 8_832_714 },
    notas: null,
  },
  {
    clave: 'sf-instalacion-electrica',
    cliente: 'San Francisco',
    obra: 'INSTALACIÓN ELÉCTRICA',
    ventaTexto: 'Instalaciones Eléctricas',
    // 14/08: NINGUNA fila de San Francisco dice esta obra en K. La más cercana —"Planos de
    // Electricidad Galpones", $62.600 del 13/07— habla del galpón, no del contrato de instalación, y
    // asignarla sería adivinar. Queda en SIN IMPUTAR hasta que Compras lo diga.
    comprasObra: null,
    inicio: '2026-08-10',
    fin: '2026-10-16',
    plantelFullTime: 5,
    plantelTemporales: 0,
    pctEjecutado: 0,
    horas: { oficialEspecializado: 0, oficial: 994.73, ayudante: 1089.43 },
    moCargasPesos: 21_413_403,
    egresos: [
      {
        concepto: 'Alquiler Plataforma Eléctrica 8m', proveedor: 'Gruas San Blas',
        familia: 'Alquiler de equipos', monto: 3_161_070,
        cuotas: [
          { fecha: '2026-08-10', monto: 1_053_690 },
          { fecha: '2026-09-10', monto: 1_053_690 },
          { fecha: '2026-10-10', monto: 1_053_690 },
        ],
        nota: '3 cuotas mensuales iguales (10/08, 10/09, 10/10)',
      },
    ],
    noCaja: { maquinaPropia: 0 },
    notas: null,
  },
  {
    clave: 'sf-entrepiso-escalera',
    cliente: 'San Francisco',
    obra: 'ENTREPISO Y ESCALERA',
    ventaTexto: 'Entrepiso',
    // 14/08: "entrepiso" y "escalera" dan 0 filas en K para San Francisco.
    comprasObra: null,
    inicio: '2026-08-10',
    fin: '2026-08-21',
    plantelFullTime: 4,
    plantelTemporales: 0,
    pctEjecutado: 0,
    horas: { oficialEspecializado: 76.95, oficial: 0, ayudante: 33.25 },
    moCargasPesos: 1_084_583,
    egresos: [
      {
        concepto: 'Materiales', proveedor: 'Alumetal', familia: 'Materiales', monto: 580_365,
        fechaEstimada: '2026-08-10',
        // 13/08 — LA AFIRMACIÓN ANTERIOR ERA FALSA y la desmiente el propio filtro de la pestaña:
        // decía que estos electrodos ya estaban facturados y que el neteo vivo los absorbía, pero
        // Alumetal NO tiene ni una fila con cliente "San Francisco" en Compras (sí 17 con LA ESTRELLA
        // y 2 con MESSINA). O se cargaron bajo otro cliente, o no se cargaron. Hasta que eso se
        // resuelva en Compras, este egreso se proyecta entero, que es lo prudente.
        nota: `${ALERTA} Alumetal no tiene filas con cliente San Francisco en Compras: el neteo no puede verlas`,
      },
      { concepto: 'Pintura', proveedor: 'Pintureria Cordoba', familia: 'Pintura', monto: 71_598, fechaEstimada: '2026-08-14' },
    ],
    noCaja: { maquinaPropia: 0 },
    notas: null,
  },
  {
    // ACTUALIZACIÓN DEL DUEÑO (07/08, en vivo): ya tiene fechas y venta propia declarada.
    // 13/08: LA VENTA YA ESTÁ EN COBRANZAS ($8.758.810, cobro 19/08, una sola fila por decisión del
    // dueño: "Venta propia s/ total 8.758.810 — cobro íntegro", sin anticipo ni certificación). Se
    // saca el aviso de "venta aún no cargada", que a partir de hoy era falso — un aviso que quedó
    // viejo miente con más autoridad que un dato que falta, porque parece verificado.
    // `ventaDeclarada` se conserva como el número que declaró el dueño, para contrastar contra la
    // fila viva; NO se muestra como venta.
    clave: 'sf-mamposteria',
    cliente: 'San Francisco',
    obra: 'MAMPOSTERÍA',
    ventaTexto: 'Mampostería',
    // 14/08: "mamposter" da 0 filas en K para San Francisco. Hay "Revoques" ($284.145) y "revoques"
    // ($136.121), que es OTRO rubro del mismo frente: no es mampostería y no se fuerza.
    comprasObra: null,
    ventaDeclarada: 8_758_810,
    inicio: '2026-08-07',
    fin: '2026-08-19',
    plantelFullTime: null,
    plantelTemporales: null,
    pctEjecutado: 0,
    horas: { oficialEspecializado: 0, oficial: 241.68, ayudante: 202.32 },
    moCargasPesos: 4_618_653,
    egresos: [
      { concepto: 'Materiales sin itemizar', proveedor: null, familia: 'Materiales', monto: 2_847_439, fechaEstimada: '2026-08-08' },
    ],
    noCaja: { maquinaPropia: 0 },
    notas: null,
  },
  {
    clave: 'messina-playon-azufre',
    cliente: 'MESSINA',
    obra: 'PLAYÓN DE AZUFRE',
    ventaTexto: 'Playon Azufre',
    // 14/08: "playon" y "azufre" dan 0 filas en K. Coherente con que la obra arranca el 24/08 — pero
    // el cuadro no lo AFIRMA por la fecha, lo afirma porque Compras no la nombra.
    comprasObra: null,
    // INICIO REAL, dado por el dueño el 28/08/2026. Antes decía 24/08 y era una estimación: ni la
    // OC 00002-00002173, ni las tres cotizaciones, ni el informe de nivelación fijan una fecha. El
    // fin sale del inicio + los 25 días hábiles que declara la cotización de agosto (07/09 → 09/10),
    // que además conserva los 32 días corridos que tenía la ventana anterior.
    inicio: '2026-09-07',
    fin: '2026-10-09',
    plantelFullTime: 4,
    plantelTemporales: 0,
    pctEjecutado: 0,
    horas: { oficialEspecializado: 40, oficial: 1676.6, ayudante: 1725.2 },
    moCargasPesos: 37_042_907,
    egresos: [
      { concepto: 'Materiales', proveedor: 'FEMENIA', familia: 'Materiales', monto: 7_372_050, fechaEstimada: '2026-09-07' },
      { concepto: 'Materiales', proveedor: 'Bedini', familia: 'Materiales', monto: 1_524_200, fechaEstimada: '2026-09-07' },
      { concepto: 'Aditivos', proveedor: 'Sika', familia: 'Químicos y aditivos', monto: 482_040, fechaEstimada: '2026-09-07' },
      { concepto: 'Materiales', proveedor: 'Alumetal', familia: 'Materiales', monto: 113_025, fechaEstimada: '2026-09-07' },
      {
        concepto: 'Gasoil', proveedor: 'ACA', familia: 'Combustible', monto: 565_493,
        cuotas: [
          { fecha: '2026-09-07', monto: 282_746.5 },
          { fecha: '2026-09-24', monto: 282_746.5 },
        ],
        nota: 'mitad al inicio (07/09), mitad a mitad de obra (24/09)',
      },
      { concepto: 'Nafta', proveedor: 'VILLA DEL PINO', familia: 'Combustible', monto: 186_244, fechaEstimada: '2026-09-07' },
      { concepto: 'Pintura', proveedor: 'Pintureria Cordoba', familia: 'Pintura', monto: 47_775, fechaEstimada: '2026-09-07' },
      { concepto: 'Ferretería', proveedor: 'Ferretec', familia: 'Ferretería', monto: 95_550, fechaEstimada: '2026-09-07' },
      { concepto: 'Alambrón', proveedor: 'Mercado Libre', familia: 'Hierro y malla', monto: 129_523, fechaEstimada: '2026-09-07' },
    ],
    noCaja: { maquinaPropia: 2_356_187 },
    notas: null,
  },
  {
    // ACTUALIZACIÓN DEL DUEÑO (07/08, en vivo): TODOS los materiales del 60% restante ya están
    // facturados en Compras — no se proyecta ninguno. Sólo queda la MO del 60%.
    clave: 'messina-bsa',
    cliente: 'MESSINA',
    obra: 'BSA',
    ventaTexto: 'BSA',
    // 14/08: 8 filas de MESSINA, $7.955.772 neto — "Planta de BSA" ×6, "Camion - BSA", "Excavadora -
    // BSA". "BSA" no aparece en ninguna otra fila de la pestaña entera (verificado sobre las 1.136),
    // así que el tramo corto no puede arrastrar plata de otra obra.
    // ESTO CONFIRMA LA NOTA DE ABAJO CON UN NÚMERO: los materiales YA están facturados. Y explica por
    // qué el cuadro va a mostrar comprado > proyectado — la proyección es sólo la MO del 60% restante.
    comprasObra: 'BSA',
    inicio: '2026-07-29',
    fin: '2026-08-21',
    plantelFullTime: 4,
    plantelTemporales: 0,
    pctEjecutado: 0.40,
    horas: { oficialEspecializado: 0, oficial: 140.94, ayudante: 258.42 },
    moCargasPesos: 2_108_281,
    egresos: [],
    noCaja: { maquinaPropia: 220_422 },
    notas: 'materiales ya facturados en Compras al 07/08 — no se proyecta ninguno; sólo queda la MO del 60% restante',
  },
  {
    clave: 'quattropani-salon-comercial',
    cliente: 'Quattropani - Melisa García SAS',
    obra: 'SALÓN COMERCIAL',
    ventaTexto: 'Salón Comercial',
    // 14/08: las 3 filas que tiene el cliente Quattropani en Compras, todas Alumetal del 29/07, por
    // $27.358.960 neto. EL TEXTO NO ES EL DE LA OBRA: la obra se llama "SALÓN COMERCIAL" y Compras
    // dice "Salones Comerciales". Por eso se copia LITERAL de la fuente y no se deriva del nombre.
    comprasObra: 'Salones Comerciales',
    inicio: '2026-08-18',
    fin: '2026-12-30',
    plantelFullTime: 5,
    plantelTemporales: 5,
    pctEjecutado: 0,
    horas: { oficialEspecializado: 1119.08, oficial: 917.11, ayudante: 1896.5 },
    moCargasPesos: 38_802_169,
    egresos: [
      {
        concepto: 'Combustible (gasoil)', proveedor: 'ACA', familia: 'Combustible', monto: 269_584,
        cuotas: [
          { fecha: '2026-09-10', monto: 67_396 },
          { fecha: '2026-10-10', monto: 67_396 },
          { fecha: '2026-11-10', monto: 67_396 },
          { fecha: '2026-12-10', monto: 67_396 },
        ],
        nota: '4 cuotas mensuales desde sep; el día 10 es convención',
      },
      {
        concepto: 'Combustible (nafta)', proveedor: 'VILLA DEL PINO', familia: 'Combustible', monto: 79_380,
        cuotas: [
          { fecha: '2026-09-10', monto: 19_845 },
          { fecha: '2026-10-10', monto: 19_845 },
          { fecha: '2026-11-10', monto: 19_845 },
          { fecha: '2026-12-10', monto: 19_845 },
        ],
        nota: '4 cuotas mensuales desde sep; el día 10 es convención',
      },
    ],
    noCaja: { maquinaPropia: 1_691_659 },
    notas: 'materiales YA comprados y en Compras, se facturan al cliente con margen — no se proyecta ninguno',
  },
]

/**
 * EL MISMO ARREGLO CON EL NOMBRE QUE BUSCA JORNALES. No es una copia: es la misma referencia.
 *
 * POR QUÉ EXISTE (13/08). Dos consumidores llegaron a esta fuente por ramas paralelas y cada uno se
 * quedó esperando un nombre distinto: `scripts/libro-movimientos-pestana.mjs` pide `OBRAS_FUTURAS` y
 * `lib/jornales-demanda-fuente.mjs` prueba `obrasVendidas ?? OBRAS_VENDIDAS ?? OBRAS ?? default` —su
 * propio comentario lo dice: *"el contrato del shape de cada obra está acordado; el nombre exacto del
 * export, todavía no"*.
 *
 * Y el desacuerdo NO gritaba. El aviso de esa función vive en el `catch` del import, o sea que sólo
 * suena cuando el módulo NO EXISTE. Con el módulo presente y el nombre distinto, `bruto` queda
 * `undefined`, la función devuelve `[]` sin una línea de log, y Jornales proyecta sólo el piso al
 * convenio: se perderían las horas de las 7 obras —$126.974.442 de MO+cargas— sin un solo error a la
 * vista. Publicar el alias cuesta una línea; descubrir esa resta cuesta una quincena.
 */
export const obrasVendidas = OBRAS_FUTURAS
