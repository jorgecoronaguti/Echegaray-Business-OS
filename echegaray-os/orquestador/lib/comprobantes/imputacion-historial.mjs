// LA IMPUTACIÓN QUE EL PAPEL NO DIJO, RESUELTA CON LO QUE LA EMPRESA YA HIZO — NÚCLEO PURO.
//
// ═══ EL DEFECTO: DOS CAMINOS, DOS COMPORTAMIENTOS, SOBRE LA COLUMNA QUE DECIDE QUÉ OBRA PAGA (14/08) ═══
//
// El mismo comprobante terminaba imputado distinto según por dónde entrara:
//
//   · por el chat, `completarConHistorial` (comunicacion/comprobantes/flujo.mjs) ESCRIBÍA la obra,
//     el detalle, la unidad y la categoría que el perfil declaraba firmes;
//   · por la terminal, `informarImputacion` (scripts/cargar-comprobantes-compras.mjs) las IMPRIMÍA
//     como sugerencia y su propio comentario lo decía: «NO cambia lo que se escribe».
//
// Las dos usaban la misma lib (`imputacion-aprendida.mjs`) para preguntar y decidían distinto con la
// respuesta. Eso no es una diferencia de interfaz: la columna J es la que manda el costo a una obra o
// a otra, y dos respuestas para el mismo papel es exactamente lo que la arquitectura de este repo
// prohíbe. Se unificó ACÁ, en una función que no sabe de Google ni de Mattermost ni de Postgres, y
// las dos caras la llaman.
//
// ═══ HACIA QUÉ LADO SE UNIFICÓ, Y POR QUÉ ═══
//
// Hacia ESCRIBIR. No es una preferencia: el auditor de comprobantes ya declara DEFECTO una celda
// vacía que el historial resolvía firme («si el historial alcanzaba y la celda quedó vacía, algo no
// corrió» — `deImputacion` en `auditoria.mjs`). Con el cargador imprimiendo en vez de escribir, el
// propio OS producía las filas que su propio auditor marcaba mal.
//
// Y se escribe SÓLO lo firme: `pide_confirmacion:false`, o sea n≥5 y ≥80% del historial de ese
// proveedor. Lo que no llega a firme no se escribe ni se adivina; viaja como sugerencia.
//
// ═══ LO ESCRITO A MANO MANDA ═══
//
// El historial sólo llena lo que quedó VACÍO. Si el comprobante dice «Camion BSA - Messina», eso es
// una decisión del dueño sobre ESE gasto; el historial es una estadística sobre otros gastos.
//
// ═══ Y QUEDA MARCADO ═══
//
// Cada dimensión que sale del historial deja su `*Via = 'historial'`, y de ahí `marca-origen.mjs`
// arma el sufijo que va a la celda. Una inferencia escrita sin marca es una estimación presentada
// como hecho, que es la Regla de Oro #2.

import { sugerirImputacion } from '../imputacion-aprendida.mjs'

/** Las cuatro dimensiones que el historial puede completar, en el orden en que se resuelven. */
export const DIMENSIONES = Object.freeze(['obra', 'detalle', 'unidad', 'categoria'])

/**
 * ═══ LA COLUMNA K SE LLAMA DISTINTO EN CADA VÍA, Y ESO NO SE PUEDE ADIVINAR ═══
 *
 * El comprobante del CHAT llama `detalleObra` a la columna K — y usa `detalle` para otra cosa
 * completamente distinta: el desglose del IVA (`{iva21, iva105}`). El comprobante del CARGADOR, que
 * es el `fajo.json`, llama `detalle` a la columna K, que es lo que lee `valoresInput`.
 *
 * El primer intento de unificar escribía los dos nombres a la vez. Con el chat eso leía el objeto del
 * IVA como «la columna K ya está resuelta» y no imputaba nunca el detalle — y además le habría puesto
 * un texto al campo del IVA. El test de paridad lo agarró en rojo. La lección: dos vías que nombran
 * distinto la misma cosa NO se unifican adivinando; el que llama declara cuál es su forma.
 */
const CAMPO = Object.freeze({ obra: 'obra', unidad: 'unidad', categoria: 'categoria' })

/** ¿Esta dimensión ya viene resuelta? Un string en blanco no cuenta como resuelta. */
const yaTiene = (c, campo) => Boolean(String(c?.[campo] ?? '').trim())

/** Escribe el valor y marca la vía. `dim` nombra la dimensión; `campo`, dónde vive en esta forma. */
function poner(c, dim, campo, valor) {
  c[campo] = valor
  c[`${dim}Via`] = 'historial'
}

/**
 * Completa la imputación de UN comprobante con el historial, MUTANDO el comprobante.
 *
 * Muta a propósito y no devuelve una copia: los dos llamadores tienen el comprobante adentro de una
 * estructura mayor (el ítem del fajo, el comprobante del plan) y devolver una copia obligaría a cada
 * uno a re-ensamblarla — dos re-ensamblados es dos oportunidades de que uno se olvide una dimensión.
 *
 * @param {object} comprobante  se muta: se le completan los campos vacíos y se le marcan las vías
 * @param {{por_proveedor?:object}|null} perfiles  salida de `perfilesDeImputacion`
 * @param {{campoDetalle?:string}} [o]  cómo se llama la columna K en ESTA forma de comprobante:
 *   `detalleObra` en el ítem del chat (default), `detalle` en el `fajo.json` del cargador. No se
 *   adivina ni se escriben los dos: en el chat, `detalle` es el desglose del IVA.
 * @returns {{aplicado:object, sugerencia:object|null}}
 *   `aplicado`: dimensión → {n, share} de lo que SE ESCRIBIÓ. Vacío = el papel alcanzaba, o el
 *   historial no llegó a firme.
 *   `sugerencia`: lo que la lib contestó, incluido lo que NO se aplicó — es con lo que el mensaje
 *   pregunta sin preguntar en blanco.
 */
export function completarUno(comprobante, perfiles = null, { campoDetalle = 'detalleObra' } = {}) {
  const c = comprobante ?? {}
  if (!perfiles?.por_proveedor || !c.proveedor) return { aplicado: {}, sugerencia: null }
  const base = { proveedor: c.proveedor, concepto: c.concepto, monto: c.total ?? c.neto }
  let s = sugerirImputacion({ ...base, obra: c.obra }, perfiles)
  const aplicado = {}

  if (!yaTiene(c, CAMPO.obra) && firme(s.obra)) {
    poner(c, 'obra', CAMPO.obra, s.obra.sugerido)
    aplicado.obra = { n: s.obra.n, share: s.obra.share }
    // EL DETALLE CUELGA DE LA OBRA. Con la obra recién resuelta hay que volver a preguntar, o se
    // estaría ofreciendo el detalle más frecuente de OTRA obra.
    s = sugerirImputacion({ ...base, obra: c.obra }, perfiles)
  }
  if (!yaTiene(c, campoDetalle) && firme(s.detalle)) {
    poner(c, 'detalle', campoDetalle, s.detalle.sugerido)
    aplicado.detalle = { n: s.detalle.n, share: s.detalle.share, obra: s.detalle.obra ?? c.obra ?? null }
  }
  if (!yaTiene(c, CAMPO.unidad) && firme(s.unidad)) {
    poner(c, 'unidad', CAMPO.unidad, s.unidad.sugerido)
    aplicado.unidad = { n: s.unidad.n, share: s.unidad.share }
  }
  // LA CATEGORÍA (columna B) QUEDABA VACÍA EN TODA FILA QUE CARGÓ EL BOT (04/08). Depende del
  // proveedor y de casi nada más —un corralón siempre es la misma categoría—, así que es la dimensión
  // que el historial resuelve mejor. Mismos umbrales que las otras tres.
  if (!yaTiene(c, CAMPO.categoria) && firme(s.categoria)) {
    poner(c, 'categoria', CAMPO.categoria, s.categoria.sugerido)
    aplicado.categoria = { n: s.categoria.n, share: s.categoria.share }
  }

  return {
    aplicado,
    sugerencia: {
      obra: s.obra ?? null, detalle: s.detalle ?? null, unidad: s.unidad ?? null,
      categoria: s.categoria ?? null, rubro: s.rubro ?? null,
      pide_confirmacion: s.pide_confirmacion, nota: s.nota ?? null,
    },
  }
}

/** Sólo se aplica lo que la lib declara FIRME. Proponer no es decidir. */
function firme(d) {
  return Boolean(d?.sugerido) && d.pide_confirmacion === false
}
