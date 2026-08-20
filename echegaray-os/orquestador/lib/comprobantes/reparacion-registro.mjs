// EL PLAN PARA REPARAR EL REGISTRO DE LO CARGADO — NÚCLEO PURO. NO ESCRIBE NADA, NI SIQUIERA EN LA BASE.
//
// ═══ QUÉ ESTABA MAL (medido en vivo el 15/08 sobre las 28 entradas del registro) ═══
//
// `comunicacion.comprobantes_cargados` es el rastro de lo que el bot escribió en Compras. Ocho de sus
// 28 entradas —el 28,6%— no decían la verdad:
//
//   · SEIS `reserva_cargada`: el bot reservó la clave (bien: `repositorio.mjs::reservarClaves` la
//     reserva ANTES de escribir para que un proceso muerto deje una reserva visible en vez de un gasto
//     duplicado), escribió bien en Compras, y el `anotarFilas` posterior nunca corrió. La columna
//     `fila` quedó en null y el registro no sabe dónde está el gasto que él mismo cargó.
//   · UNA `fila_movida`: Alumetal `0036-00025942` anotado en la 811, y está en la 797. En la 811 hoy
//     hay RSV `0011-00087469` por $67.797,51 — otro comprobante.
//   · Y adentro de esa misma entrada, DOS campos más que mienten: el importe dice $201.494.007 y la
//     celda $2.014.940,07 —cien veces de más— y el número dice `0036-` donde la celda dice `0038-`.
//
// Barriendo las 28 con este mismo criterio aparecieron DOS más que la conciliación por fila daba por
// buenas porque la fila SÍ coincidía, y el importe no:
//
//   · fila 812 · VILLA DEL PINO `0001-00015177` → registro $10.500.067 · celda $105.000,67 (×100)
//   · fila 815 · Hormiserv NC `0005-00000386`   → registro −$686,07 · celda −$686.070 (÷1000)
//
// Las tres del mismo fajo del 04/08, que es el que leyó los importes con la coma corrida.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// **MANDA LA CELDA.** El registro dice lo que este sistema CREE que escribió; Compras dice lo que hay.
// Cuando difieren, la evidencia es el dato leído en su destino. Por eso no se propone un solo cambio
// sin haber confirmado, sobre la fila concreta, que el comprobante que hay ahí es el que dice el
// registro. Una coincidencia no verificada no se escribe: se saltea y se informa.
//
// ═══ LO QUE NO SE TOCA, Y POR QUÉ ═══
//
// · La CLAVE (`CUIT|tipo|número|signo`). Es la barrera de deduplicación y es lo único que impidió que
//   este desfase se convirtiera en un gasto cargado dos veces. Corregir la clave para que "combine"
//   con el número reparado abriría exactamente la puerta que ella cierra. Queda como está, aunque eso
//   deje la clave de Alumetal diciendo `0036` y la columna `numero` diciendo `0038`: son dos cosas
//   distintas —una es una barrera, la otra es información— y la que se corrige es la información.
// · El PROVEEDOR. Que la celda diga «AXION SERVICENTRO MEDIA AGUA» (el único AXION del desplegable) y
//   el registro «AXION SERVICENTRO DEL VALLE» (el emisor por CUIT) no es un error de nadie: son dos
//   nombres del mismo papel, y el del registro es el que se puede cruzar con ARCA. Se preserva.
// · COMPRAS. Ni una celda. La pestaña la carga el dueño a mano y ningún script la reescribe.

import { numeroCanonico } from './lectura.mjs'
import { normalizar } from '../carga-comprobantes.mjs'
import { indicePorHuella, candidatasEnCompras } from './auditoria.mjs'

export const ACCION = Object.freeze({
  REPARAR: 'reparar',
  SALTEADA: 'salteada',
  SIN_CAMBIO: 'sin_cambio',
})

/** Los tres campos informativos que este reparador sabe alinear con la celda. La clave NO está. */
export const CAMPOS = Object.freeze(['fila', 'numero', 'total'])

/** Diferencia de importe por debajo de la cual no se propone nada: es el redondeo, no un error. */
const TOLERANCIA_PESOS = 0.005

/** El importe al centavo, como entero. Comparar floats directo produce cambios fantasma. */
const centavos = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** El correlativo (los últimos 8 dígitos), que es lo único del número que los dos lados leen igual. */
export function correlativoDe(reg = {}) {
  const n = numeroCanonico(reg.numero ?? reg.numeroCrudo)
  return n ? n.split('-')[1] : null
}

const signoDe = (v) => ((Number(v) || 0) < 0 ? '-' : '+')

/**
 * LA GUARDA: ¿la celda confirma que este es el comprobante que dice el registro?
 *
 * Se corre sobre la FILA CONCRETA, no sobre el índice que la encontró. Que una huella empareje dice
 * "puede ser esta"; esto dice "es esta", y son cosas distintas: el índice usa una sola de las tres
 * huellas y acá se vuelven a mirar los cuatro datos que hay.
 *
 * DOS CONDICIONES DURAS, que no se negocian:
 *   · el CORRELATIVO tiene que ser el mismo — el punto de venta no, que es justo lo que se lee
 *     distinto de un lado y del otro (`0001-00015177` en el registro, `00015-00015177` en la celda);
 *   · el SIGNO tiene que ser el mismo — una nota de crédito puede llevar el número de la factura que
 *     anula, y confundirlas es el error de $41,9M que este repo ya pagó.
 *
 * Y AL MENOS UNA CONFIRMACIÓN FUERTE, porque el correlativo solo no identifica a nadie: dos papeles
 * de dos proveedores distintos pueden terminar en los mismos ocho dígitos.
 *   · el CUIT resuelto coincide (la identidad real), o
 *   · el nombre normalizado coincide, o
 *   · el importe coincide al centavo.
 *
 * @returns {{confirma:boolean, por:string[], motivo:string|null}}
 */
export function confirmaLaCelda(entrada = {}, celda = {}, { cuitPorProveedor = null } = {}) {
  const cA = correlativoDe(entrada)
  const cB = correlativoDe(celda)
  if (!cA || !cB) return { confirma: false, por: [], motivo: 'una de las dos partes no tiene número de comprobante' }
  if (cA !== cB) return { confirma: false, por: [], motivo: `el correlativo no coincide (registro ${cA}, celda ${cB})` }
  if (signoDe(entrada.total) !== signoDe(celda.total)) {
    return { confirma: false, por: [], motivo: 'el signo no coincide: una factura y una nota de crédito no son el mismo papel' }
  }
  const por = []
  const cuitEntrada = String(entrada.cuit ?? '').replace(/\D/g, '')
  const cuitCelda = String(cuitPorProveedor?.get?.(normalizar(celda.proveedor ?? '')) ?? '').replace(/\D/g, '')
  if (cuitEntrada.length === 11 && cuitEntrada === cuitCelda) por.push('CUIT')
  if (entrada.proveedor && celda.proveedor && normalizar(entrada.proveedor) === normalizar(celda.proveedor)) por.push('proveedor')
  const tA = centavos(entrada.total)
  const tB = centavos(celda.total)
  if (tA != null && tA === tB) por.push('importe')
  if (!por.length) {
    return {
      confirma: false,
      por: [],
      motivo: `el correlativo coincide pero nada más: la celda dice «${celda.proveedor ?? '?'}» por ${celda.total ?? '?'} y el registro «${entrada.proveedor ?? '?'}» por ${entrada.total ?? '?'}`,
    }
  }
  return { confirma: true, por, motivo: null }
}

/**
 * QUÉ HAY QUE CAMBIARLE A ESTA ENTRADA PARA QUE DIGA LO QUE DICE LA CELDA.
 *
 * Devuelve sólo los campos que DIFIEREN, y ahí está la idempotencia: la segunda corrida no encuentra
 * ninguno y el plan sale vacío. No hay marca de "ya reparado" en ningún lado — el estado es el dato.
 */
export function camposADiferencia(entrada = {}, celda = {}, { soloFila = false } = {}) {
  const out = []
  const filaVieja = entrada.fila == null || !Number.isInteger(Number(entrada.fila)) ? null : Number(entrada.fila)
  if (filaVieja !== celda.fila) out.push({ campo: 'fila', viejo: filaVieja, nuevo: celda.fila })
  if (soloFila) return out
  // EL NÚMERO SE GUARDA CANÓNICO. La columna del registro ya guarda `PPPP-NNNNNNNN`, así que se
  // compara y se propone en esa forma: proponer el crudo de la celda («00113-00014305») cambiaría el
  // formato de la columna además del dato, y eso no es reparar, es reescribir.
  const numViejo = entrada.numero ?? null
  const numNuevo = numeroCanonico(celda.numero ?? celda.numeroCrudo)
  if (numNuevo && numeroCanonico(numViejo) !== numNuevo) out.push({ campo: 'numero', viejo: numViejo, nuevo: numNuevo })
  const tViejo = entrada.total == null ? null : Number(entrada.total)
  const tNuevo = celda.total == null ? null : Number(celda.total)
  if (tNuevo != null && (tViejo == null || Math.abs(tViejo - tNuevo) > TOLERANCIA_PESOS)) {
    out.push({ campo: 'total', viejo: tViejo, nuevo: tNuevo })
  }
  return out
}

/**
 * EL PLAN COMPLETO. Puro: entra el registro y las filas de Compras ya leídas, sale qué se cambiaría.
 *
 * @param {Array} entradas   filas de `comunicacion.comprobantes_cargados`
 * @param {Array} registros  filas de Compras ya parseadas (`registroDeFila`)
 * @param {{cuitPorProveedor?:Map<string,string>, soloFila?:boolean}} [o]
 * @returns {{cambios:Array, salteadas:Array, sinCambio:number}}
 */
export function planDeReparacion(entradas = [], registros = [], { cuitPorProveedor = null, soloFila = false } = {}) {
  const opciones = { cuitPorProveedor }
  const indice = indicePorHuella(registros, opciones)
  const cambios = []
  const salteadas = []
  let sinCambio = 0

  for (const e of entradas ?? []) {
    const { filas, por } = candidatasEnCompras(e, indice, opciones)
    if (!filas.length) {
      // NO ES UN ERROR DEL REPARADOR: es el hallazgo `no_esta`/`reserva_huerfana` del vigía, y su
      // arreglo NO es tocar el registro —el gasto podría no estar en Compras— sino mirar el papel.
      salteadas.push({
        clave: e.clave ?? null, proveedor: e.proveedor ?? null, numero: e.numero ?? null,
        filaRegistrada: e.fila ?? null,
        motivo: 'no aparece en ninguna fila de Compras: esto no se repara desde acá, hay que verificar el comprobante',
      })
      continue
    }
    // ═══ EL NÚMERO COMPLETO DESEMPATA, Y NO ES AFLOJAR: ES APRETAR ═══
    //
    // La huella empareja por CORRELATIVO porque el punto de venta se lee distinto de un lado y del
    // otro, y eso hace que dos series del mismo proveedor choquen: medido, Corralón Progreso tiene
    // `0004-00003370` en la fila 544 y `0006-00003370` en la 813 — dos comprobantes reales con los
    // mismos ocho dígitos finales. Entre candidatas se prefiere la que coincide en el número ENTERO,
    // que es un criterio más estricto que el que las trajo: sólo puede descartar, nunca sumar.
    // Si ni así queda una sola, se saltea: cuál es la buena la decide una persona.
    let candidatas = filas
    if (candidatas.length > 1) {
      const nEntrada = numeroCanonico(e.numero)
      const exactas = candidatas.filter((f) => numeroCanonico(f.numero ?? f.numeroCrudo) === nEntrada)
      candidatas = exactas.length === 1 ? exactas : candidatas
    }
    if (candidatas.length > 1) {
      salteadas.push({
        clave: e.clave ?? null, proveedor: e.proveedor ?? null, numero: e.numero ?? null,
        filaRegistrada: e.fila ?? null,
        motivo: `más de una fila de Compras reclama este comprobante (${candidatas.map((f) => f.fila).join(', ')}): cuál es la buena lo decide una persona`,
      })
      continue
    }
    const celda = candidatas[0]
    const g = confirmaLaCelda(e, celda, opciones)
    if (!g.confirma) {
      salteadas.push({
        clave: e.clave ?? null, proveedor: e.proveedor ?? null, numero: e.numero ?? null,
        filaRegistrada: e.fila ?? null, filaCandidata: celda.fila,
        motivo: `no se pudo confirmar contra la fila ${celda.fila}: ${g.motivo}`,
      })
      continue
    }
    const campos = camposADiferencia(e, celda, { soloFila })
    if (!campos.length) { sinCambio++; continue }
    cambios.push({
      clave: e.clave ?? null,
      proveedor: e.proveedor ?? null,
      numero: e.numero ?? null,
      accion: ACCION.REPARAR,
      filaRegistrada: e.fila == null ? null : Number(e.fila),
      filaReal: celda.fila,
      emparejadoPor: por,
      confirmadoPor: g.por,
      // LA EVIDENCIA VIAJA CON EL CAMBIO. Sin ella, el `--dry` es una lista de números que hay que
      // creer; con ella, quien la mira puede abrir esa fila y comprobarla sin correr nada.
      celda: {
        fila: celda.fila, proveedor: celda.proveedor ?? null,
        numero: celda.numeroCrudo ?? celda.numero ?? null, total: celda.total ?? null,
      },
      campos,
    })
  }
  return { cambios, salteadas, sinCambio }
}

/** El plan en texto, que es lo que imprime el `--dry` y lo que el dueño lee antes de aplicar. */
export function informeDelPlan(p = {}, { aplicado = false } = {}) {
  const l = []
  const cambios = p.cambios ?? []
  const salteadas = p.salteadas ?? []
  l.push(`# Reparación del registro de comprobantes — ${aplicado ? 'APLICADO' : 'ENSAYO (no se escribió nada)'}`)
  l.push('')
  l.push(`${cambios.length} entrada(s) a reparar · ${salteadas.length} salteada(s) · ${p.sinCambio ?? 0} ya estaban bien.`)
  l.push('')
  if (cambios.length) {
    l.push('| Clave | Proveedor | Campo | Dice | Va a decir | Celda que lo confirma | Confirmado por |')
    l.push('|---|---|---|---|---|---|---|')
    for (const c of cambios) {
      for (const k of c.campos) {
        l.push(`| ${c.clave ?? '—'} | ${c.proveedor ?? '—'} | ${k.campo} | ${muestra(k.viejo)} | ${muestra(k.nuevo)} `
          + `| fila ${c.celda.fila}: ${c.celda.proveedor ?? '?'} ${c.celda.numero ?? ''} ${muestra(c.celda.total)} `
          + `| ${c.confirmadoPor.join(' + ')} |`)
      }
    }
    l.push('')
  }
  if (salteadas.length) {
    l.push('## Salteadas — NO se tocan')
    l.push('')
    l.push('| Clave | Proveedor | Número | Fila registrada | Por qué |')
    l.push('|---|---|---|---:|---|')
    for (const s of salteadas) {
      l.push(`| ${s.clave ?? '—'} | ${s.proveedor ?? '—'} | ${s.numero ?? '—'} | ${s.filaRegistrada ?? '(sin fila)'} | ${s.motivo} |`)
    }
    l.push('')
  }
  if (!cambios.length && !salteadas.length) l.push('_El registro coincide con Compras en todas sus entradas._')
  return l.join('\n')
}

const muestra = (v) => {
  if (v == null) return '(vacío)'
  if (typeof v === 'number') return v.toLocaleString('es-AR', { maximumFractionDigits: 2 })
  return String(v)
}
