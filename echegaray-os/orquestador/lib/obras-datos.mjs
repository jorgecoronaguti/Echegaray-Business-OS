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

import { ALERTA } from './glifos.mjs'

/** Los clientes canónicos del desplegable de Compras col J que usan estas obras. */
export const CLIENTES_CANONICOS = ['San Francisco', 'MESSINA', 'Quattropani - Melisa García SAS']

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
    inicio: '2026-08-24',
    fin: '2026-09-25',
    plantelFullTime: 4,
    plantelTemporales: 0,
    pctEjecutado: 0,
    horas: { oficialEspecializado: 40, oficial: 1676.6, ayudante: 1725.2 },
    moCargasPesos: 37_042_907,
    egresos: [
      { concepto: 'Materiales', proveedor: 'FEMENIA', familia: 'Materiales', monto: 7_372_050, fechaEstimada: '2026-08-24' },
      { concepto: 'Materiales', proveedor: 'Bedini', familia: 'Materiales', monto: 1_524_200, fechaEstimada: '2026-08-24' },
      { concepto: 'Aditivos', proveedor: 'Sika', familia: 'Químicos y aditivos', monto: 482_040, fechaEstimada: '2026-08-24' },
      { concepto: 'Materiales', proveedor: 'Alumetal', familia: 'Materiales', monto: 113_025, fechaEstimada: '2026-08-24' },
      {
        concepto: 'Gasoil', proveedor: 'ACA', familia: 'Combustible', monto: 565_493,
        cuotas: [
          { fecha: '2026-08-24', monto: 282_746.5 },
          { fecha: '2026-09-10', monto: 282_746.5 },
        ],
        nota: 'mitad el 24/08, mitad el 10/09',
      },
      { concepto: 'Nafta', proveedor: 'VILLA DEL PINO', familia: 'Combustible', monto: 186_244, fechaEstimada: '2026-08-24' },
      { concepto: 'Pintura', proveedor: 'Pintureria Cordoba', familia: 'Pintura', monto: 47_775, fechaEstimada: '2026-08-24' },
      { concepto: 'Ferretería', proveedor: 'Ferretec', familia: 'Ferretería', monto: 95_550, fechaEstimada: '2026-08-24' },
      { concepto: 'Alambrón', proveedor: 'Mercado Libre', familia: 'Hierro y malla', monto: 129_523, fechaEstimada: '2026-08-24' },
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
