// EL FORMULARIO DE "Corregir" — núcleo puro, sin red y sin base.
//
// Un `dialog_submission` de Mattermost llega como un puñado de strings sueltos escritos por una
// persona. La única defensa contra un dato inventado es no aceptar nada que no se pueda interpretar:
// una fecha que no parsea NO se guarda como texto, se rechaza con el campo marcado.
//
// EL FORMULARIO ES DINÁMICO Y ESTÁ ACOTADO A CINCO CAMPOS. No es una preferencia de diseño: los
// diálogos de Mattermost admiten hasta cinco elementos. Se muestran los que hacen falta, priorizando
// lo que el modelo NO pudo leer — corregir lo que ya está bien leído es trabajo que nadie pidió.

import { aNumero, redondear2 } from '../../lib/carga-comprobantes.mjs'
import { fechaDeLectura, numeroCanonico, claveComprobante, obraDeAnotacion } from '../../lib/comprobantes/lectura.mjs'
import { identidadDelComprobante } from '../../lib/comprobantes/aritmetica.mjs'
import { dudasDeLectura } from '../../lib/comprobantes/plausibilidad.mjs'

export const MAX_ELEMENTOS = 5
export const CALLBACK_ID = 'comprobantes.corregir'

const CAMPOS = Object.freeze({
  obra: { display_name: 'Obra', help_text: 'Tiene que ser una de las obras de Compras.' },
  proveedor: { display_name: 'Proveedor', help_text: 'Tal como figura en la lista de Compras.' },
  numero: { display_name: 'N° de comprobante', help_text: 'Punto de venta y número: 0113-00010489.' },
  fecha: { display_name: 'Fecha', help_text: 'DD/MM/AAAA.' },
  total: { display_name: 'Total del comprobante', help_text: 'El número más grande del papel, con IVA incluido.' },
  iva: { display_name: 'IVA discriminado', help_text: 'Sólo el IVA. Dejalo vacío si la factura no lo discrimina.' },
  // EL NETO ES CORREGIBLE DESDE EL 04/08, Y NO ES UN CAMPO MÁS. Sin él, un comprobante cuya identidad
  // aritmética no cierra porque el modelo leyó mal el SUBTOTAL era un callejón sin salida: el control
  // lo bloqueaba y el formulario no ofrecía el número que había que arreglar. Un control sin salida
  // deja de ser un control y pasa a ser un gasto perdido.
  neto: { display_name: 'Neto gravado (subtotal)', help_text: 'El subtotal SIN IVA. Neto + IVA + otros tributos tiene que dar el total.' },
})

/** Orden de prioridad. La obra va primera SIEMPRE: es el dato que el papel casi nunca trae. */
const PRIORIDAD = ['obra', 'proveedor', 'numero', 'fecha', 'total', 'neto', 'iva']

/** ¿Qué campos de este ítem están vacíos o dudosos? Son los que se muestran primero. */
export function camposFaltantes(item = {}) {
  const c = item.comprobante ?? {}
  const f = []
  if (!c.obra) f.push('obra')
  if (!c.proveedor || item.proveedorNuevo) f.push('proveedor')
  if (!c.numero) f.push('numero')
  if (!c.fecha) f.push('fecha')
  if (c.total == null) f.push('total')
  // Cuando la aritmética no cierra, los TRES números en juego se marcan como faltantes para que se
  // ganen un lugar entre los cinco del formulario: no se sabe cuál está mal leído. Sin esto, el
  // control bloqueaba el comprobante y el formulario ofrecía la obra y el proveedor — todo menos el
  // número que había que arreglar.
  const ar = identidadDelComprobante({ neto: c.neto, iva: c.iva, otros: c.otrosTributos, total: c.total })
  if (ar.verificable && !ar.cierra) f.unshift('total', 'neto', 'iva')
  // Un dato que se leyó pero no puede ser cierto tiene que ganarse un lugar entre los cinco campos
  // del formulario: es exactamente el que hay que arreglar. Sin esto, el control bloqueaba el
  // comprobante y "Corregir" ofrecía la obra y el proveedor — todo menos la fecha imposible.
  const dudas = dudasDeLectura(item)
  if (dudas.iva) f.unshift('iva')
  if (dudas.fecha) f.unshift('fecha')
  return [...new Set(f)]
}

/**
 * Los elementos del formulario para UN comprobante.
 *
 * La obra sale como DESPLEGABLE cuando se conoce la lista estricta: escribir "estrella" a mano en un
 * campo libre para que después el desplegable de la columna J lo rechace es hacerle perder el tiempo
 * a la persona dos veces.
 */
export function elementosDe(item = {}, { obras = [] } = {}) {
  const c = item.comprobante ?? {}
  const faltan = new Set(camposFaltantes(item))
  const orden = [...PRIORIDAD].sort((a, b) => (faltan.has(b) ? 1 : 0) - (faltan.has(a) ? 1 : 0))
  const valor = {
    obra: c.obra ?? '', proveedor: c.proveedor ?? '', numero: c.numero ?? '',
    fecha: c.fecha ?? '', total: c.total ?? '', iva: c.iva ?? '', neto: c.neto ?? '',
  }
  return orden.slice(0, MAX_ELEMENTOS).map((name) => {
    const base = { name, ...CAMPOS[name], type: 'text', optional: true }
    if (name === 'obra' && obras.length) {
      return {
        name, ...CAMPOS.obra, type: 'select', optional: true,
        options: obras.slice(0, 100).map((o) => ({ text: o, value: o })),
        ...(obras.includes(c.obra) ? { default: c.obra } : {}),
      }
    }
    return { ...base, ...(valor[name] !== '' && valor[name] != null ? { default: String(valor[name]) } : {}) }
  })
}

/** El diálogo completo. `state` viaja de ida y vuelta: es cómo se sabe qué se está corrigiendo. */
export function dialogoCorreccion({ fajo, indice = 0, obras = [], url } = {}) {
  const items = fajo?.items ?? []
  const item = items[indice] ?? {}
  const c = item.comprobante ?? {}
  return {
    url,
    dialog: {
      callback_id: CALLBACK_ID,
      title: 'Corregir comprobante',
      introduction_text: items.length > 1
        ? `Comprobante ${indice + 1} de ${items.length}: **${c.proveedor ?? 'sin proveedor'}** ${c.numero ?? ''}`
        : `**${c.proveedor ?? 'sin proveedor'}** ${c.numero ?? ''}`,
      submit_label: 'Guardar',
      notify_on_cancel: false,
      state: JSON.stringify({ fajo_id: fajo?.id, indice }),
      elements: elementosDe(item, { obras }),
    },
  }
}

/** El `state` de vuelta. Un state que no parsea es un pedido que no se puede atribuir: se rechaza. */
export function leerEstado(crudo) {
  try {
    const j = JSON.parse(String(crudo ?? ''))
    const indice = Number(j?.indice)
    if (!j?.fajo_id || !Number.isInteger(indice) || indice < 0) return null
    return { fajoId: String(j.fajo_id), indice }
  } catch { return null }
}

/**
 * Aplica lo que la persona escribió sobre el comprobante.
 *
 * NO ACEPTA BASURA. Una fecha que no parsea o un total que no es número vuelven como `errors` del
 * diálogo, con el campo marcado; el ítem no se toca. Un campo vacío significa "dejalo como estaba",
 * no "borralo": vaciar un dato desde un formulario que se abre con todo precargado es casi siempre
 * un accidente.
 *
 * @returns {{ok:true, item:object}|{ok:false, errors:object}}
 */
export function aplicarCorreccion(item = {}, submission = {}, { obras = [] } = {}) {
  const c = { ...(item.comprobante ?? {}) }
  const errors = {}
  const dado = (k) => {
    const v = submission[k]
    return v == null || String(v).trim() === '' ? null : String(v).trim()
  }

  const prov = dado('proveedor')
  if (prov) c.proveedor = prov

  const obra = dado('obra')
  if (obra) {
    // ═══ SIN LA LISTA ESTRICTA NO SE ESCRIBE LA OBRA: FALLA CERRADO (05/08) ═══
    //
    // Acá decía `obras.length ? obraDeAnotacion(obra, obras) : { valor: obra }`. Ese `: { valor: obra }`
    // es por donde entró **«Estrella»** a la columna J, que dice «LA ESTRELLA». No hizo falta ningún
    // error: alcanzó con que la lectura del desplegable volviera vacía —es una llamada a la metadata
    // de validación de Google, y vuelve vacía sin explotar— para que el formulario aceptara el texto
    // libre tal como se tipeó.
    //
    // Lo que deja atrás no es una celda fea: es una obra PARTIDA EN DOS. Los cruces suman
    // «LA ESTRELLA» por un lado y «Estrella» por el otro, el margen de la obra deja de cerrar y nada
    // falla en ningún lado. Es exactamente el error que este repo clasifica como el más caro: el que
    // no grita.
    //
    // La regla del subsistema es fail-closed: sin identidad real no se ejecuta. Sin la lista no se
    // puede afirmar que esa obra exista, así que no se escribe y se dice por qué.
    if (!obras.length) {
      errors.obra = 'No pude leer la lista de obras de Compras, así que no puedo guardar la obra sin arriesgarme a escribir un valor que el desplegable rechaza. Probá de nuevo en un minuto.'
    } else {
      const m = obraDeAnotacion(obra, obras)
      if (!m) errors.obra = 'No reconozco esa obra. Elegí una de la lista.'
      else c.obra = m.valor
    }
  }

  const num = dado('numero')
  if (num) {
    const n = numeroCanonico(num)
    if (!n) errors.numero = 'No pude leer ese número. Poné punto de venta y número: 0113-00010489.'
    else {
      c.numero = n
      // La persona MANDA sobre ARCA. Si el número lo había corregido el padrón y ahora lo escribe a
      // mano, el rastro de la corrección deja de tener sentido: mostrarlo diría "había leído X" de
      // una lectura que ya nadie está usando.
      delete c.numeroLeidoMal
    }
  }

  const fecha = dado('fecha')
  if (fecha) {
    const f = fechaDeLectura(fecha)
    if (!f) errors.fecha = 'Poné la fecha como DD/MM/AAAA.'
    else {
      c.fecha = f
      // MISMA REGLA QUE `totalTipeado`: el control de plausibilidad duda de lo que leyó un modelo,
      // no de lo que escribió alguien con el papel en la mano. Sin esta marca, un comprobante viejo
      // de verdad quedaría trabado para siempre — el control pide corregir y corregir lo redispara.
      c.fechaTipeada = true
    }
  }

  const total = dado('total')
  if (total) {
    const t = aNumero(total)
    if (t == null) errors.total = 'Eso no es un importe. Escribilo como 36.460,30.'
    // EL SIGNO DE LA NOTA DE CRÉDITO NO SE PIERDE AL CORREGIR. La persona escribe el total como lo
    // ve en el papel —positivo—; si el comprobante es una nota de crédito, entra en negativo igual.
    // Contarlas como compras ya costó $41,9M.
    else {
      c.total = redondear2(Math.abs(t) * (c.esNotaCredito ? -1 : 1))
      // UNA PERSONA MIRÓ EL PAPEL Y ESCRIBIÓ ESTE NÚMERO. El control de orden de magnitud deja de
      // opinar sobre él: su trabajo es dudar de lo que leyó un modelo, no de lo que tipeó alguien.
      // Sin esta marca, una compra grande de verdad quedaba trabada para siempre — el control pedía
      // confirmar y confirmar volvía a disparar el control.
      c.totalTipeado = true
    }
  }

  const iva = dado('iva')
  if (iva) {
    const v = aNumero(iva)
    if (v == null) errors.iva = 'Eso no es un importe. Escribilo como 5.981,00.'
    else {
      c.iva = redondear2(Math.abs(v) * (c.esNotaCredito ? -1 : 1))
      // Un 0 escrito a mano es una respuesta legítima y frecuente: "este tique no discrimina IVA".
      c.ivaTipeado = true
    }
  }

  // El neto no se escribe en ninguna celda —la columna M se DERIVA de Total − IVA— pero es uno de los
  // tres números con los que se verifica que el total esté bien leído. Corregirlo es lo que destraba
  // un comprobante cuya aritmética no cerraba porque el subtotal se leyó mal.
  const neto = dado('neto')
  if (neto) {
    const v = aNumero(neto)
    if (v == null) errors.neto = 'Eso no es un importe. Escribilo como 28.479,30.'
    else c.neto = redondear2(Math.abs(v) * (c.esNotaCredito ? -1 : 1))
  }

  if (Object.keys(errors).length) return { ok: false, errors }

  // La clave se recalcula: corregir el número o el proveedor CAMBIA la identidad del comprobante, y
  // dejar la clave vieja significaría deduplicar contra otra cosa.
  const k = claveComprobante(c)
  return {
    ok: true,
    item: {
      ...item,
      comprobante: c,
      clave: k?.clave ?? null,
      claveFuerte: k?.fuerte ?? false,
      // Lo corregido a mano manda: si la persona escribió el proveedor, deja de estar "en duda".
      proveedorNuevo: prov ? false : item.proveedorNuevo,
      corregido: true,
    },
  }
}
