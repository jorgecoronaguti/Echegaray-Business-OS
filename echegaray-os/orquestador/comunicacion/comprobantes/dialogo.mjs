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

export const MAX_ELEMENTOS = 5
export const CALLBACK_ID = 'comprobantes.corregir'

const CAMPOS = Object.freeze({
  obra: { display_name: 'Obra', help_text: 'Tiene que ser una de las obras de Compras.' },
  proveedor: { display_name: 'Proveedor', help_text: 'Tal como figura en la lista de Compras.' },
  numero: { display_name: 'N° de comprobante', help_text: 'Punto de venta y número: 0113-00010489.' },
  fecha: { display_name: 'Fecha', help_text: 'DD/MM/AAAA.' },
  total: { display_name: 'Total del comprobante', help_text: 'El número más grande del papel, con IVA incluido.' },
  iva: { display_name: 'IVA discriminado', help_text: 'Sólo el IVA. Dejalo vacío si la factura no lo discrimina.' },
})

/** Orden de prioridad. La obra va primera SIEMPRE: es el dato que el papel casi nunca trae. */
const PRIORIDAD = ['obra', 'proveedor', 'numero', 'fecha', 'total', 'iva']

/** ¿Qué campos de este ítem están vacíos o dudosos? Son los que se muestran primero. */
export function camposFaltantes(item = {}) {
  const c = item.comprobante ?? {}
  const f = []
  if (!c.obra) f.push('obra')
  if (!c.proveedor || item.proveedorNuevo) f.push('proveedor')
  if (!c.numero) f.push('numero')
  if (!c.fecha) f.push('fecha')
  if (c.total == null) f.push('total')
  return f
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
    fecha: c.fecha ?? '', total: c.total ?? '', iva: c.iva ?? '',
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
    // Si la lista estricta está disponible, la obra tiene que estar en ella: escribir una obra que
    // el desplegable de la columna J va a rechazar deja la celda en rojo y rompe los cruces.
    const m = obras.length ? obraDeAnotacion(obra, obras) : { valor: obra }
    if (!m) errors.obra = 'No reconozco esa obra. Elegí una de la lista.'
    else c.obra = m.valor
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
    else c.fecha = f
  }

  const total = dado('total')
  if (total) {
    const t = aNumero(total)
    if (t == null) errors.total = 'Eso no es un importe. Escribilo como 36.460,30.'
    // EL SIGNO DE LA NOTA DE CRÉDITO NO SE PIERDE AL CORREGIR. La persona escribe el total como lo
    // ve en el papel —positivo—; si el comprobante es una nota de crédito, entra en negativo igual.
    // Contarlas como compras ya costó $41,9M.
    else c.total = redondear2(Math.abs(t) * (c.esNotaCredito ? -1 : 1))
  }

  const iva = dado('iva')
  if (iva) {
    const v = aNumero(iva)
    if (v == null) errors.iva = 'Eso no es un importe. Escribilo como 5.981,00.'
    else c.iva = redondear2(Math.abs(v) * (c.esNotaCredito ? -1 : 1))
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
