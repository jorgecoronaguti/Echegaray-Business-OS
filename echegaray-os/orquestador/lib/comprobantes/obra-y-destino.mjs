// LA OBRA Y LA PESTAÑA DE UN COMPROBANTE QUE ENTRA POR EL CARGADOR — NÚCLEO PURO.
//
// ═══ POR QUÉ (dueño, 14/09/2026) ═══
//
// «Te pedí un cambio grande en la forma de designar obras… carga de comprobantes vía chat». La
// columna «Obra» de Compras (desplegable `OB-#### · NOMBRE`, `ES-ADM`, `ES-TAL`, «Sin obra – X») es
// la DECISIÓN de a qué obra va la fila; la K sigue siendo texto libre. El cargador tiene que escribir
// esa decisión cuando la tiene, y no escribirla cuando sólo la adivina. Y lo que no es una compra
// —impuestos, cargas sociales, financieros— no entra a Compras: tiene su pestaña.
//
// ═══ QUÉ VA A LA COLUMNA OBRA, Y QUÉ NO ═══
//
//   · J/K del papel, del mensaje o de la persona, que resuelven a UNA obra con código → su rótulo.
//     La regla es la MISMA del sync (`asignadorDeCompras`): si el cargador y el sync resolvieran
//     distinto, la fila recién cargada cambiaría de obra en la hora siguiente.
//   · J «Administración» / «Taller»                     → ES-ADM / ES-TAL.
//   · J o K sacadas del HISTORIAL del proveedor         → nada. Un promedio de cargas anteriores es
//     una sugerencia; la columna registra una decisión, y escribir la sugerencia ahí la convierte en
//     decisión sin que nadie la haya tomado.
//   · cliente con varias obras y K que no nombra ninguna → nada. «Sin obra – X» dice que el dueño
//     DECIDIÓ que no va a ninguna; inferirlo de una K vacía es fabricar esa decisión.
//   · obra sin código interno                            → nada: no es una opción del desplegable.
//   · una obra que contradice la Unidad de Negocio       → nada, y se nombra: cuál de las dos está
//     mal lo decide quien completó las dos.
//
// Con la columna todavía no insertada, esto se calcula igual (para el ensayo) y no se escribe en
// ningún lado: `valoresInput` saltea una clave sin columna.
//
// ═══ LA PESTAÑA SALE DE `rubro-caja.mjs` ═══
//
// No se arma una lista nueva de palabras. «Qué es cada gasto» ya está definido UNA vez en `REGLAS`,
// con su `detalle` = la pestaña que tiene el detalle de ese rubro. Si el rubro vive en «Cargas
// Sociales» o en «Impuestos y Financieros», el comprobante no va a Compras. Una segunda lista acá
// se desincronizaría de la primera el día que el dueño agregue un gremio.

import { normAlias } from '../jornales-a-registros-hh.mjs'
import { asignadorDeCompras } from '../compras-obra-asignada.mjs'
import { DESTINO, FIJOS, catalogoDeDestinos, resolverCeldaObra, rotuloDeObra, unidadIncoherente } from '../obra-destino.mjs'
import { indiceDeAnotacion } from './anotacion-a-obra.mjs'
import { REGLAS, rubroDeCaja } from '../rubro-caja.mjs'

export const PESTANA_COMPRAS = 'Compras'

/** Las pestañas que NO son Compras, tal como las nombra `REGLAS.detalle`. */
export const PESTANAS_FUERA = Object.freeze(['Cargas Sociales', 'Impuestos y Financieros'])

/** La J que ya dice estructura. Sólo las dos que tienen opción fija en el desplegable. */
const FIJO_POR_CLIENTE = Object.freeze({ administracion: 'ES-ADM', taller: 'ES-TAL' })

/**
 * ¿A qué pestaña va este comprobante? `{pestana, rubro}`. Recibe el comprobante con la forma del
 * `fajo.json` (obra = J, detalle = K).
 */
export function pestanaDelComprobante(c = {}) {
  const rubro = rubroDeCaja({
    proveedor: c.proveedor, unidad: c.unidad, cliente: c.obra,
    concepto: [c.detalle, c.concepto].filter(Boolean).join(' '),
  })
  const regla = REGLAS.find((r) => r.rubro === rubro)
  const pestana = regla && PESTANAS_FUERA.includes(regla.detalle) ? regla.detalle : PESTANA_COMPRAS
  return { pestana, rubro }
}

/**
 * Los catálogos de `catalogosDeAsignacion`, armados UNA vez para toda la corrida.
 * @param {{alias:Map, canonicas:object[], clienteAlias:Map}} catalogos
 */
export function destinosDeObra({ alias = new Map(), canonicas = [], clienteAlias = new Map() } = {}) {
  return {
    asignar: asignadorDeCompras({ alias, canonicas, clienteAlias }),
    cat: catalogoDeDestinos({ obras: canonicas, clienteAlias }),
    // El índice de lo escrito a mano se arma UNA vez con la corrida, igual que los otros dos: por
    // comprobante costaría recorrer el catálogo entero por cada palabra de cada anotación.
    indice: indiceDeAnotacion({ obras: canonicas, clienteAlias, alias }),
    porId: new Map(canonicas.map((o) => [o.id, o])),
  }
}

const nada = (porque, extra = {}) => ({ valor: null, obra_id: null, destino: null, porque, ...extra })

/** Lo que el comprobante trae en J/K, a una opción del desplegable (o null con su porqué). */
function desdeJK(c, { asignar, porId }) {
  const fijo = FIJO_POR_CLIENTE[normAlias(c.obra)]
  if (fijo) {
    const f = FIJOS.find((x) => x.codigo === fijo)
    return { valor: rotuloDeObra({ codigo: f.codigo, nombre: f.nombre }), obra_id: null, destino: f.destino, porque: `columna J «${c.obra}»` }
  }
  const a = asignar({ obra_texto: c.obra, detalle_obra: c.detalle })
  if (!a.obra_id) return nada(a.porque, { via: a.via })
  const o = porId.get(a.obra_id)
  const viva = porId.get(o?.fusionada_en) ?? o
  if (!viva?.codigo) return nada(`la obra ${viva?.nombre ?? a.obra_id} no tiene código interno`, { via: a.via })
  return { valor: rotuloDeObra(viva), obra_id: viva.id, destino: DESTINO.OBRA, via: a.via, porque: a.porque }
}

/**
 * EL VALOR DE LA COLUMNA «Obra» PARA ESTE COMPROBANTE, o `valor: null` con el porqué.
 *
 * `c.obraFila` explícito (la persona lo eligió en el chat) manda, pero se valida contra el catálogo:
 * un texto que no es una opción del desplegable no se escribe. Sin `destinos` (no se pudo leer el
 * catálogo) no hay nada que proponer: la celda queda vacía, como hoy.
 */
export function obraParaLaColumna(c = {}, destinos = null) {
  if (!destinos) return nada('sin catálogo de obras')
  const elegida = String(c.obraFila ?? '').trim()
  let r
  if (elegida) {
    const x = resolverCeldaObra(elegida, destinos.cat)
    if (x.error) return nada(x.error)
    // DE DÓNDE SALIÓ ESE VALOR. Hasta el 15/09 la única vía posible era una persona eligiendo en el
    // chat; desde que lo escrito a mano resuelve la obra (`anotacion-a-obra.mjs`) también llega por
    // ahí, y decir «elegida por una persona» de algo que leyó un modelo sería presentar una lectura
    // como una decisión — la Regla de Oro #2 con otra ropa.
    const via = c.obraFilaVia === 'anotacion' ? 'anotacion' : 'elegida'
    const porque = via === 'anotacion' ? (c.obraFilaPorque ?? 'lo escrito a mano') : 'elegida por una persona'
    r = { valor: elegida, obra_id: x.obra_id, destino: x.destino, via, porque }
  } else {
    const deHistorial = ['obra', 'detalle'].filter((d) => c[`${d}Via`] === 'historial')
    if (deHistorial.length) {
      return nada(`la ${deHistorial.join(' y el ')} salió del historial del proveedor: la columna Obra la decide una persona`)
    }
    if (!String(c.obra ?? '').trim()) return nada('el comprobante no dice obra')
    r = desdeJK(c, destinos)
    if (!r.valor) return r
  }
  const choca = unidadIncoherente(c.unidad, r.destino)
  return choca ? nada(choca) : r
}
