// ¿LLEGA AL LIBRO TODA LA PLATA DE LAS DOS FUENTES GRANDES? — fila por fila, con motivo.
//
// ═══ POR QUÉ ESTO NO LO CONTESTABA NINGÚN CONTROL (06/09/2026) ═══
//
// Los tres controles que había alrededor de la regla 8 contestan otra cosa:
//
//   · `auditar-cuadre-cash-flow` compara las DOS VISTAS entre sí. Su propia cabecera lo declara: no
//     valida el número del que parten. Dos vistas que leen el mismo Libro incompleto cuadran perfecto.
//   · `guardaDeCobertura` mide cobertura TEMPORAL (que no falten semanas en la geometría).
//   · `huecosDeCobertura` mide que cada RUBRO llegue hasta diciembre. Un rubro puede llegar a
//     diciembre y faltarle veintiuna facturas: el mes tiene dato, el control se pone verde.
//
// Ninguno se para del lado de la FUENTE y pregunta lo único que importa para la regla 8: de las filas
// que la pestaña tiene, ¿cuáles no están en el Libro, y por qué? Eso es esto.
//
// ═══ EL DEFECTO QUE ESTO ATRAPA, MEDIDO EN VIVO ═══
//
// `deCompras` descarta la fila sin fecha de caja con un `continue` mudo (`if (importe === null ||
// cargada === null) continue`). No hay aviso, no hay contador, no hay nada: la plata desaparece del
// Cash Flow y del Libro sin dejar rastro. El 06/09/2026 eran 21 facturas por $687.249, de las cuales
// $171.314 seguían PENDIENTES — plata que la empresa va a pagar y la proyección no ve.
//
// La única señal que existía era indirecta y apuntaba al síntoma equivocado: el control del pie de
// `Proveedores` decía "▲ $171.314 salen por un medio de pago que no tiene columna", porque esas mismas
// filas tienen también el "Tipo pago" vacío. Hacía FAILED al servicio `echegaray-flujo-caja` en 32
// corridas seguidas desde el 03/09 y nadie leyó ninguna: el rojo existía y no llegaba a una persona.
//
// ═══ CÓMO SE EVITA EL CONTROL QUE SE VALIDA CONTRA LO QUE ÉL MISMO PRODUCE ═══
//
// Los dos lados se leen de pestañas DISTINTAS del archivo —la fuente (Compras / Cobranzas) y el Libro
// (`_MOVIMIENTOS`)— y ninguno se recalcula acá. Esta librería no computa un solo peso: clasifica.
//
// Y todo motivo que no sea una regla ESCRITA es HUECO. Un residuo sin motivo no se absorbe en una
// categoría "otros": se nombra con su fila y su monto, que es lo único que hace accionable un control.
//
// NO LEE GOOGLE. Recibe las filas ya leídas.

import { columnasDeCompras, estaPagada, pendienteDeCompra } from './libro-extractores-compras.mjs'
import { RUBRO_JORNALES, RUBRO_ADMINISTRACION } from './libro-extractores-nomina.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/**
 * LOS MOTIVOS POR LOS QUE UNA FILA DE LA FUENTE PUEDE NO ESTAR EN EL LIBRO.
 *
 * `hueco: true` significa "esta plata no está en ningún Cash Flow y nadie decidió que no estuviera".
 * `hueco: false` es una exclusión de negocio ESCRITA, con su regla al lado — no un permiso genérico.
 */
export const MOTIVOS = Object.freeze({
  EN_EL_LIBRO: { hueco: false, texto: 'está en el Libro' },
  IMPORTE_CERO: { hueco: false, texto: 'importe 0: no es plata' },
  SIN_FECHA_DE_CAJA: {
    hueco: true,
    texto: 'la columna "Fecha de caja" está VACÍA. deCompras la descarta sin avisar y la plata no '
      + 'llega a ningún Cash Flow. Se arregla cargando la fecha en Compras, no en el código.',
  },
  SIN_FECHA_DE_COBRO: {
    hueco: true,
    texto: 'la columna "Fecha cobro" está VACÍA. deCobranzas la descarta sin avisar: el ingreso no '
      + 'aparece en ninguna semana ni en ningún mes.',
  },
  SIN_ESTADO: {
    hueco: true,
    texto: 'la columna "Estado" está vacía. Sin estado no se sabe si es cobrado o esperado, y el '
      + 'extractor la saltea.',
  },
  NOMINA_POR_JORNALES: {
    hueco: false,
    texto: 'rubro de nómina: entra al Libro por "Jornales por Quincena", que es el dato real de la '
      + 'planilla. Emitirla también desde Compras la contaría dos veces.',
  },
  CARGAS_POR_LA_CADENA: {
    hueco: false,
    texto: 'cargas sociales de un mes que publica la cadena de "Cargas Sociales". La precedencia está '
      + 'declarada en libro-extractores-cargas.mjs: la cadena le gana a la fila plana de Compras.',
  },
  CANCELADA: { hueco: false, texto: 'la venta está cancelada: no se va a cobrar.' },
  ENDOSADA_O_EXCLUIDA: {
    hueco: false,
    texto: 'valor endosado a un tercero (marcado en "Valor banco" o declarado Endosado en '
      + '_CHEQUES_RAW): se entregó, nunca va a acreditar en la cuenta.',
  },
  DUPLICADO_EXACTO: {
    hueco: false,
    texto: 'otra fila del Libro tiene el MISMO comprobante, el mismo CUIT y el MISMO importe: es la '
      + 'misma factura cargada dos veces y `deduplicar` colapsa una. La plata está, una sola vez.',
  },
  COLAPSADA_POR_COMPROBANTE_REPETIDO: {
    hueco: true,
    texto: 'otra fila del Libro tiene el mismo comprobante y el mismo CUIT pero OTRO importe. La clave '
      + 'de dedup es `comp:CUIT:NÚMERO:SIGNO` y NO mira el importe (libro-movimientos.mjs · claveDe), '
      + 'así que las dos filas colapsan en una y la plata de la que pierde desaparece del Cash Flow. '
      + 'Compras ya lo detecta en su columna "¿Comprobante repetido? (OS)" — ese aviso no llega al Libro.',
  },
  SIN_MOTIVO_CONOCIDO: {
    hueco: true,
    texto: 'la fila tiene importe y fecha y NO está en el Libro, y ninguna regla escrita lo explica. '
      + 'Es el caso peor: plata que desaparece por un camino que nadie modeló.',
  },
})

/** Los rubros de cargas que la cadena de "Cargas Sociales" puede reemplazar. */
const RUBROS_CARGAS = Object.freeze(['Nómina · Cargas sociales', 'Nómina · Gremiales'])

/** Las filas de origen que el Libro trae de una pestaña. La fila del Libro puede venir decorada
 *  (`"834 · cheque 12"`, `"834:real"`): se compara el primer token, que es la fila de la fuente. */
export function filasEnElLibro(movimientos = [], pestana) {
  const s = new Set()
  for (const m of movimientos ?? []) {
    if (txt(m?.origen) !== pestana) continue
    const f = txt(m?.fila).split(/[\s:·]/)[0]
    if (f) s.add(f)
  }
  return s
}

/** Un número escrito de seis maneras es el mismo número. Igual criterio que `claveDe`. */
const soloDigitos = (v) => txt(v).replace(/\D/g, '').replace(/^0+/, '')

/**
 * LOS COMPROBANTES QUE EL LIBRO YA TIENE, con el importe con el que entraron.
 *
 * La clave es la MISMA que usa `claveDe` para un comprobante fiscal —CUIT + número— porque lo que se
 * quiere reproducir es exactamente su colapso. Escribir otra clave acá daría un control que mide un
 * colapso que no ocurre.
 */
export function comprobantesEnElLibro(movimientos = []) {
  const m = new Map()
  for (const x of movimientos ?? []) {
    const k = `${soloDigitos(x?.cuit)}:${soloDigitos(x?.comprobante)}`
    if (k === ':') continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push({ origen: txt(x?.origen), fila: txt(x?.fila), importe: Math.abs(Number(x?.importe) || 0) })
  }
  return m
}

/**
 * NÚCLEO PURO: cada fila de Compras con importe, clasificada por si llegó al Libro y por qué no.
 *
 * @param {Array<Array>} filas Compras entera, tal como la lee el generador (encabezado en la fila 3)
 * @param {Array<{origen:string, fila:string}>} movimientos las filas de `_MOVIMIENTOS` ya normalizadas
 * @returns {Array<{fila:number, motivo:string, importe:number, pendiente:number, proveedor:string, rubro:string}>}
 */
export function residuoDeCompras(filas = [], movimientos = []) {
  const c = columnasDeCompras(filas)
  const enLibro = filasEnElLibro(movimientos, 'Compras')
  const comprobantes = comprobantesEnElLibro(movimientos)
  const out = []
  for (let i = 3; i < (filas?.length ?? 0); i++) {
    const f = filas[i] ?? []
    const importe = num(f[c.importe])
    if (importe === null) continue // ni siquiera es una fila de plata
    const fila = i + 1
    const pagado = estaPagada(f[c.estado])
    out.push({
      fila,
      importe,
      // ═══ "PENDIENTE" ES LO QUE TODAVÍA NO SALIÓ, Y UNA FILA PAGADA NO DEBE NADA ═══
      //
      // `pendienteDeCompra` devuelve el TOTAL para la fila cerrada, a propósito: su trabajo es decir
      // por cuánto entra el movimiento al libro, no cuánto se debe. Usarlo tal cual acá publicaba
      // "$427.499.815 todavía sin mover" sobre 833 facturas ya pagadas — un número más grande que la
      // realidad y con el rótulo al revés. La distinción importa: lo pendiente es lo que la
      // PROYECCIÓN se pierde; lo pagado que falta es lo que el HISTÓRICO subregistra.
      // SIN `Math.abs`, Y ESO ES EL PUNTO: `pendienteDeCompra` ya devuelve el importe NEGATIVO de una
      // nota de crédito, que es plata que VUELVE. Tomado en magnitud, las dos notas de Corralón
      // Progreso inflaban el hueco de $171.314 a $387.858 — su importe contado del lado equivocado,
      // dos veces. Con el neto, este número reconcilia exactamente con el que publica el control del
      // pie de "Proveedores", que es otra fuente y otro camino: $171.314.
      pendiente: pagado || importe === 0 ? 0 : pendienteDeCompra({
        importe, pagado, montoPagado: num(f[c.montoPagado]), parcial2: num(f[c.parcial2]),
      }),
      proveedor: txt(f[c.proveedor]),
      rubro: txt(f[c.rubro]),
      motivo: motivoDeCompra({ enLibro, comprobantes, fila, importe, f, c, pagado }),
    })
  }
  return out
}

/** El motivo de UNA fila de Compras. Se separa para que el bucle de arriba se lea de un vistazo. */
function motivoDeCompra({ enLibro, comprobantes, fila, importe, f, c, pagado }) {
  if (enLibro.has(String(fila))) return 'EN_EL_LIBRO'
  if (importe === 0) return 'IMPORTE_CERO'
  const rubro = txt(f[c.rubro])
  if (rubro === RUBRO_JORNALES || rubro === RUBRO_ADMINISTRACION) return 'NOMINA_POR_JORNALES'
  if (num(f[c.fechaCaja]) === null) return 'SIN_FECHA_DE_CAJA'
  // La precedencia de la cadena sólo puede tapar una fila PREVISTA, nunca una ya pagada: el hecho le
  // gana a la proyección (libro-extractores-cargas.mjs). Una carga pagada que falta es un hueco.
  if (RUBROS_CARGAS.includes(rubro) && !pagado) return 'CARGAS_POR_LA_CADENA'
  return motivoDeColapso(comprobantes, { cuit: f[c.cuit], comprobante: f[c.comprobante], importe })
}

/**
 * ¿LA FILA DESAPARECIÓ EN LA DEDUPLICACIÓN, Y ESO BORRÓ PLATA?
 *
 * Las dos respuestas son distintas y por eso son dos motivos. Si el gemelo que quedó en el Libro
 * tiene el MISMO importe, la fila era la misma factura cargada dos veces y colapsarla es correcto.
 * Si tiene otro importe, colapsaron dos hechos distintos y la plata de uno se perdió — la clave
 * `comp:CUIT:NÚMERO:SIGNO` no mira el importe.
 *
 * La comparación es al peso: un céntimo de diferencia entre dos cargas de la misma factura no es un
 * hecho distinto, y tratarlo como tal llenaría el informe de ruido.
 */
function motivoDeColapso(comprobantes, { cuit, comprobante, importe }) {
  const gemelos = comprobantes.get(`${soloDigitos(cuit)}:${soloDigitos(comprobante)}`)
  if (!gemelos?.length) return 'SIN_MOTIVO_CONOCIDO'
  const mismo = gemelos.some((g) => Math.abs(g.importe - Math.abs(importe)) <= 1)
  return mismo ? 'DUPLICADO_EXACTO' : 'COLAPSADA_POR_COMPROBANTE_REPETIDO'
}

/**
 * NÚCLEO PURO: cada fila de Cobranzas con importe, clasificada igual que la de Compras.
 *
 * Las columnas se resuelven por su rótulo de la fila 4, con los MISMOS textos que usa `deCobranzas`:
 * si alguien renombra una, las dos se rompen juntas en vez de divergir en silencio.
 */
export function residuoDeCobranzas(filas = [], movimientos = []) {
  const enc = filas?.[3] ?? []
  const col = (rotulo) => enc.findIndex((v) => txt(v) === rotulo)
  const iEstado = col('Estado')
  const iImporte = col('TOTAL a cobrar (neto de retenciones)')
  const iFecha = col('Fecha cobro')
  const iCliente = col('Obra / Cliente')
  if (iEstado < 0 || iImporte < 0 || iFecha < 0) {
    throw new Error('cobertura-plata(Cobranzas): no encuentro "Estado", "TOTAL a cobrar (neto de '
      + 'retenciones)" o "Fecha cobro" en la fila 4. Sin esas columnas el control diría "todo bien" '
      + 'sobre cero filas, que es el modo de falla que este archivo existe para impedir.')
  }
  const enLibro = filasEnElLibro(movimientos, 'Cobranzas')
  const out = []
  for (let i = 4; i < (filas?.length ?? 0); i++) {
    const f = filas[i] ?? []
    const importe = num(f[iImporte])
    if (importe === null) continue
    const fila = i + 1
    const estado = txt(f[iEstado]).toLowerCase()
    out.push({
      fila,
      importe,
      pendiente: /^cobrado$/.test(estado) ? 0 : Math.abs(importe),
      proveedor: txt(f[iCliente]),
      rubro: 'Cobranzas',
      motivo: motivoDeCobranza({ enLibro, fila, importe, estado, fecha: num(f[iFecha]) }),
    })
  }
  return out
}

/** El motivo de UNA fila de Cobranzas. */
function motivoDeCobranza({ enLibro, fila, importe, estado, fecha }) {
  if (enLibro.has(String(fila))) return 'EN_EL_LIBRO'
  if (importe === 0) return 'IMPORTE_CERO'
  if (!estado) return 'SIN_ESTADO'
  if (/cancelar/.test(estado)) return 'CANCELADA'
  if (fecha === null) return 'SIN_FECHA_DE_COBRO'
  // Endoso es la única exclusión que queda y no se puede leer de la fila: la decide el cruce contra
  // _CHEQUES_RAW. Se nombra como tal y NO como hueco, con el matiz adentro del texto del motivo.
  return 'ENDOSADA_O_EXCLUIDA'
}

/** Agrupa un residuo por motivo. `hueco` viaja resuelto para que el informe no vuelva a decidirlo. PURA. */
export function porMotivo(residuo = []) {
  const m = new Map()
  for (const r of residuo) {
    const a = m.get(r.motivo) ?? {
      motivo: r.motivo, hueco: MOTIVOS[r.motivo]?.hueco ?? true, filas: 0, importe: 0, pendiente: 0, ejemplos: [],
    }
    a.filas++
    a.importe += r.importe
    a.pendiente += r.pendiente
    if (a.ejemplos.length < 8) a.ejemplos.push(r)
    m.set(r.motivo, a)
  }
  return [...m.values()].sort((a, b) => Math.abs(b.pendiente) - Math.abs(a.pendiente))
}

/** Lo que hay que gritar: sólo los motivos que son hueco, con su plata. PURA. */
export const huecosDePlata = (residuo = []) => porMotivo(residuo).filter((g) => g.hueco)
