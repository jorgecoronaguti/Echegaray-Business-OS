// EL CONTRATO QUE VA IMPRESO EN EL ESTADO DE CUENTA — TRANSCRIPTO, CON SU PAPEL AL LADO.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE ═══
//
// El estado de cuenta que se le manda a un cliente afirma cosas con efecto contractual: cuánto se
// pactó, en qué moneda, cómo se paga y qué pasa si no paga. Ninguna de esas cuatro cosas está en
// Cobranzas ni en OBRAS: viven en un PDF de Drive. Si el generador las escribiera "de memoria",
// estaría fabricando cláusulas — y una cláusula fabricada en un documento firmado por
// Administración es un problema legal, no un bug.
//
// Por eso cada campo de acá es una TRANSCRIPCIÓN con `fuente` (la ruta del documento en Drive) al
// lado, y el documento impreso muestra esa ruta. Un tercero abre el PDF citado y verifica la frase.
//
// ═══ LO QUE ACÁ NO SE ESCRIBE ═══
//
// EL PRECIO NO ESTÁ EN ESTA TABLA cuando la pestaña OBRAS ya lo publica (columna "Contratado").
// Escribirlo dos veces es garantizar que algún día digan cosas distintas y que el documento salga
// con el número viejo. Lo único que se declara acá del precio es el de MONEDA EXTRANJERA
// (`usdTotal`), porque ninguna pestaña lo guarda en dólares — y con él se calcula la equivalencia
// de cada certificación.
//
// ═══ EL INTERÉS PUNITORIO QUE NO SE INVENTA ═══
//
// `reclamo-cobranza.mjs` ya fijó la regla: no se reclama un punitorio que el contrato no pactó. El
// contrato de Quattropani faculta a SUSPENDER LOS TRABAJOS (cl. 3 y 9) y nada más; San Francisco no
// tiene contrato firmado, así que no hay ninguna consecuencia pactada que citar. `anteAtraso` dice
// exactamente eso y no admite un default genérico: un cliente sin entrada acá imprime "sin cláusula
// declarada", nunca una cláusula prestada de otro cliente.

/** Lo que se imprime cuando el cliente no tiene contrato declarado. Nunca se hereda el de otro. */
export const SIN_CONTRATO_DECLARADO = Object.freeze({
  identidad: null,
  documento: 'Sin contrato ni cotización declarados en el OS',
  fuente: '—',
  fecha: '—',
  moneda: 'ARS',
  alcance: '—',
  formaPago: 'A confirmar por Administración',
  plazo: '—',
  anteAtraso: 'Sin cláusula declarada. No se aplica interés punitorio.',
  valuacion: null,
  usdTotal: null,
  porObra: null,
})

/**
 * LOS CONTRATOS DE REFERENCIA, por nombre CANÓNICO de cliente (`libro-clientes.mjs`).
 *
 * Auditados el 24/08/2026 contra las carpetas de Drive de cada cliente. Cada `fuente` es la ruta
 * completa: si el documento se mueve o se firma una versión nueva, esta tabla queda mintiendo, y la
 * única defensa es que la ruta viaje impresa en el PDF para que se note.
 */
export const CONTRATOS = Object.freeze({
  'Quattropani - Melisa García SAS': Object.freeze({
    // CÓMO SE LLAMA EL CLIENTE EN SU PROPIO DOCUMENTO. El rótulo de Cobranzas ("Quattropani -
    // Melisa García SAS") mezcla a la persona con la razón social que factura: sirve para agrupar
    // filas y no para encabezar una carta. El nombre sale del contrato y el CUIT de la factura.
    identidad: Object.freeze({
      nombre: 'Franco Quattropani',
      razonSocial: 'MELISA GARCIA SAS',
      cuit: '30-71669964-8',
      domicilio: 'Ruben Mariel Oeste 5768 · Rivadavia, San Juan',
      fuente: 'FA 0001-00000219 (29/07/2026) · Contrato de Obra ECSAS + Franco Quattropani',
    }),
    documento: 'Contrato de Obra ECSAS – Franco Quattropani · Salón comercial, Av. Ignacio de la Roza Oeste, Rivadavia',
    fuente: 'Drive · administracion/PRESUPUESTOS - CLIENTES/FRANCO QUATTROPANI/'
      + 'CONTRATO DE OBRA - ECSAS + Franco Quattropani.pdf',
    // EL CONTRATO NO TIENE FECHA NI FIRMAS EN EL TEXTO ("a los ___ días del mes de ______ de 2026").
    // Se declara así, sin completarla: la fecha que sí existe es la de la cotización aprobada.
    fecha: 'Cotización aprobada 27/07/2026 · el contrato no consigna fecha ni firmas',
    moneda: 'USD',
    /** El precio en dólares. NINGUNA pestaña lo guarda en USD: es el único precio que se declara acá. */
    usdTotal: 63000,
    precioDeclarado: 'U$S 63.000 + IVA — precio global, único, definitivo y por ajuste alzado (cl. 4)',
    alcance: 'Sólo mano de obra. Los materiales del Anexo II se administran con fondos entregados '
      + 'por el Cliente; los restantes los provee o financia el Cliente (cl. 2 y 4).',
    formaPago: 'Anticipo 50 %: U$S 20.000 en efectivo y el equivalente en pesos de U$S 11.500 + IVA '
      + 'por transferencia. Saldo: certificaciones quincenales de avance de obra (cl. 4).',
    plazo: 'Ocho (8) meses desde el inicio efectivo (cl. 5). Inicio de obra 17/08/2026 según aviso de obra.',
    anteAtraso: 'La falta de pago de cualquier importe faculta a la Empresa a suspender los trabajos '
      + 'hasta su regularización (cl. 3 y 9). El contrato no pacta interés punitorio.',
    valuacion: 'Los importes en dólares se abonan en pesos al tipo de cambio vigente al momento del '
      + 'pago, tomando como cotización el promedio del dólar Blue de Ámbito Financiero (cl. 4).',
    porObra: null,
  }),
  'San Francisco': Object.freeze({
    // NO HAY CUIT EN NINGUNA FUENTE (24/08/2026): ni en `clientes` de Postgres, ni en los Recibos,
    // ni en las cotizaciones. Se deja en null y el documento imprime "a confirmar por
    // Administración" — un CUIT inventado en un documento con efecto fiscal no es un typo.
    identidad: Object.freeze({
      nombre: 'Javier Sánchez (San Francisco)',
      razonSocial: null,
      cuit: null,
      domicilio: 'San Francisco del Monte Oeste 76 · San Juan',
      fuente: 'Recibo 16 (17/07/2026) "JAVIER SANCHEZ / IMOTOR" · carpeta de Drive del cliente',
    }),
    documento: 'Sin contrato de obra firmado. Rige la cotización aceptada de cada obra.',
    fuente: 'Drive · administracion/PRESUPUESTOS - CLIENTES/JAVIER SANCHEZ/',
    fecha: 'según cotización de cada obra',
    moneda: 'ARS',
    usdTotal: null,
    precioDeclarado: null,
    alcance: 'Sólo mano de obra.',
    formaPago: 'Según la cotización de cada obra (detalle por obra).',
    plazo: 'Según la cotización de cada obra.',
    // SIN CONTRATO FIRMADO NO HAY MORA PACTADA. Decirlo es más honesto que callarlo: si algún día se
    // quiere una consecuencia por atraso, hay que firmarla antes, no imprimirla acá.
    anteAtraso: 'No hay contrato de obra firmado: no existe cláusula de mora ni interés punitorio '
      + 'pactado. Las condiciones vigentes son las de la cotización aceptada.',
    valuacion: 'Precios en pesos, sin ajuste ni redeterminación pactada.',
    /**
     * POR OBRA, porque este cliente no tiene un contrato sino cuatro cotizaciones distintas.
     *
     * La `clave` se busca DENTRO del rótulo que publica `OBRAS` cuadro 3 ("3.1 · San Francisco —
     * PISOS INDUSTRIALES · 05/08 → 30/09"): así el vínculo lo hace el rótulo de la propia pestaña y
     * no una lista paralela de nombres de obra que envejece sola.
     */
    porObra: Object.freeze([
      Object.freeze({
        clave: 'PISOS INDUSTRIALES',
        documento: 'PRESUPUESTO - PISOS TOTALES 9:6:26.pdf',
        fecha: '09/06/2026',
        formaPago: 'Anticipo 40 %, saldo con certificación semanal',
        plazo: '≈ 36 días hábiles',
      }),
      Object.freeze({
        clave: 'INSTALACIÓN ELÉCTRICA',
        documento: 'Presupuesto - Instalacion Electrica.pdf',
        fecha: '21/07/2026',
        formaPago: 'Anticipo 40 %, saldo a 15 días fecha factura',
        plazo: '3 meses',
      }),
      Object.freeze({
        clave: 'ENTREPISO Y ESCALERA',
        documento: 'Presupuesto - Entrepiso y escalera.pdf',
        fecha: '22/07/2026',
        formaPago: 'Anticipo 40 %, saldo a 15 días fecha factura',
        plazo: 'no declarado',
      }),
      Object.freeze({
        // NO HAY COTIZACIÓN AL CLIENTE EN LA CARPETA (24/08/2026): sólo la planilla interna. Se
        // declara el faltante en vez de citar un documento que el cliente nunca recibió.
        clave: 'MAMPOSTERÍA',
        documento: 'sin cotización al cliente en la carpeta de Drive',
        fecha: '—',
        formaPago: 'Cobro íntegro al cierre de obra',
        plazo: '—',
      }),
    ]),
  }),
})

/**
 * NÚCLEO PURO: el contrato declarado de un cliente canónico.
 *
 * @param {string} clienteCanonico nombre canónico (`libro-clientes.mjs`)
 * @returns {object} el contrato, o `SIN_CONTRATO_DECLARADO` — nunca el de otro cliente
 */
export const contratoDeclarado = (clienteCanonico) =>
  CONTRATOS[clienteCanonico] ?? SIN_CONTRATO_DECLARADO

/**
 * NÚCLEO PURO: la cotización que corresponde a una obra, buscando su clave dentro del rótulo.
 *
 * Devuelve null cuando el cliente no tiene desglose por obra (Quattropani: un solo contrato) o
 * cuando el rótulo no matchea ninguna clave — y ahí el documento imprime el contrato del cliente,
 * que es lo correcto, en vez de la cotización de la obra de al lado.
 *
 * @param {object} contrato el resultado de `contratoDeclarado`
 * @param {string} rotuloObra el rótulo tal cual lo publica `OBRAS` cuadro 3
 */
export function cotizacionDeObra(contrato, rotuloObra) {
  if (!contrato?.porObra) return null
  const texto = String(rotuloObra ?? '').toUpperCase()
  return contrato.porObra.find((c) => texto.includes(c.clave)) ?? null
}
