// RESOURCE EXPLOSION — QUOTE → ITEMS → COMPOSITIONS → TOTAL RESOURCE REQUIREMENTS (§13).
//
// ═══ QUÉ CONTESTA ═══
//
// El presupuesto dice «520 m² de mampostería y 47,2 m³ de columnas». Lo que hace falta para
// comprar, para dotar y para programar es otra pregunta: **cuántos ladrillones, cuántos m³ de
// hormigón, cuántas horas de oficial**. Ese número existe adentro de las composiciones y hoy nadie
// lo suma: cada partida lo usa para su costo y se lo queda.
//
// ═══ DERIVADO, NO EDITABLE ═══
//
// La explosión NO es un dato que alguien carga: es la consecuencia de las cantidades y las
// composiciones. Si el total de cemento no cuadra, lo que está mal es un cómputo o un análisis, y
// hay que arreglarlo ahí. Un total de recursos editable sería una cuarta versión de la obra
// —después del cómputo, la partida y el costo— y la primera en la que nadie sabría cuál manda.
// Por eso sale congelado y por eso no hay ninguna función que lo modifique.
//
// ═══ LA RECONCILIACIÓN ES EL CONTROL, Y TIENE QUE PODER FALLAR ═══
//
// Σ (cantidad de cada recurso × su precio) tiene que dar el costo directo. Si no da, hay un recurso
// que se contó dos veces o uno que se perdió, y las dos cosas son plata. El residuo de redondeo se
// DECLARA en vez de esconderse bajo una tolerancia generosa: una tolerancia grande convierte este
// control en una constante que siempre dice que sí — que es exactamente el defecto que este repo ya
// midió en otro control («un control que no puede decir que no»).
//
// ═══ LO QUE NO HACE ═══
//
// No genera órdenes de compra, no arma la nómina y no programa equipos. Devuelve una estructura
// para que Compras, Personal y Obra la consuman más adelante. Construir esos consumidores ahora
// sería fabricar procesos sin evidencia de cómo se usan.

import { ESTADO, esAusencia } from './contrato.mjs'
import { CAJON } from './costo.mjs'
import { TIPO_RECURSO } from './precios.mjs'

/** Cuánto se admite de diferencia entre la explosión y el costo directo, en pesos. Es UN peso, y no
 *  un porcentaje: la única diferencia legítima es el redondeo a centavos de los subtotales, y sobre
 *  una obra de $180 M eso no llega a un peso. Cualquier cosa más grande es un recurso mal contado. */
export const TOLERANCIA_RECONCILIACION = 1

const redondear = (n, d = 4) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10 ** d) / 10 ** d)

/**
 * LOS RECURSOS TOTALES DE LA COTIZACIÓN. PURA. Devuelve una estructura CONGELADA.
 *
 * Un recurso que aparece en tres partidas sale UNA vez, con la cantidad sumada y las tres partidas
 * que lo demandan. Un recurso sin precio sale igual, con `costoTotal: null` — porque para COMPRAR
 * hace falta saber cuánto se necesita aunque todavía no se sepa cuánto sale, y esconderlo hasta que
 * tenga precio es la forma de llegar a la obra sin haberlo pedido.
 */
export function explotarRecursos(costosDePartida = []) {
  const porRecurso = new Map()

  for (const c of costosDePartida) {
    for (const l of c.lineas ?? []) {
      const clave = l.recurso
      const acc = porRecurso.get(clave) ?? {
        recurso: clave, nombre: l.nombre ?? clave, cajon: l.cajon,
        unidad: l.unidadRecurso ?? null, tipo: null,
        cantidad: 0, costoTotal: 0, precioUnitario: l.precioUnitario ?? null,
        estado: ESTADO.CALCULADO, demandantes: [], sinPrecio: false, unidadesMezcladas: false,
      }
      // ═══ DOS UNIDADES DISTINTAS PARA EL MISMO RECURSO NO SE SUMAN ═══
      // Sumar 40 kg de hierro con 3 barras da 43 de nada. Si pasa, es un error de carga de la Base
      // Maestra y la línea sale DECLARADA en vez de sumada.
      if (acc.unidad && l.unidadRecurso && acc.unidad !== l.unidadRecurso) acc.unidadesMezcladas = true

      acc.cantidad += Number(l.cantidad) || 0
      if (l.costo === null || l.costo === undefined || esAusencia(l.estado)) {
        acc.sinPrecio = true
        acc.estado = ESTADO.FALTA_DATO
      } else {
        acc.costoTotal += Number(l.costo)
      }
      if (l.precioUnitario !== null && l.precioUnitario !== undefined) acc.precioUnitario = l.precioUnitario
      acc.demandantes.push({ partida: c.partida, cantidad: redondear(l.cantidad), costo: l.costo ?? null })
      porRecurso.set(clave, acc)
    }
  }

  const recursos = [...porRecurso.values()]
    .map((r) => Object.freeze({
      ...r,
      cantidad: redondear(r.cantidad),
      // Un recurso al que le falta el precio en UNA sola partida no publica su costo total: sería
      // el costo de las partidas que sí lo tenían, con cara de completo. Es la misma regla que
      // `costoDePartida` aplica una escala más abajo.
      costoTotal: r.sinPrecio ? null : redondear(r.costoTotal, 2),
      demandantes: Object.freeze(r.demandantes),
    }))
    .sort((a, b) => String(a.cajon).localeCompare(String(b.cajon)) || String(a.recurso).localeCompare(String(b.recurso)))

  const porCajon = {}
  for (const cajon of Object.values(CAJON)) porCajon[cajon] = recursos.filter((r) => r.cajon === cajon)

  return Object.freeze({
    recursos: Object.freeze(recursos),
    porCajon: Object.freeze(porCajon),
    /** Las HH totales por categoría de mano de obra. NO es la dotación y NO es la duración (§42
     *  HH≠CREW, HH≠DURACIÓN): es cuántas horas de oficial y de ayudante lleva la obra. */
    hhPorCategoria: Object.freeze(recursos
      .filter((r) => r.cajon === CAJON.LABOR)
      .map((r) => Object.freeze({ categoria: r.nombre, recurso: r.recurso, horas: r.cantidad, costo: r.costoTotal }))),
    /** Los materiales, ordenados por lo que más pesa. Es la lista con la que se negocia con un
     *  proveedor: los primeros cinco renglones suelen ser el 70 % de la compra. */
    materiales: Object.freeze(recursos.filter((r) => r.cajon === CAJON.MATERIALS)),
    equipos: Object.freeze(recursos.filter((r) => r.cajon === CAJON.EQUIPMENT)),
    subcontratos: Object.freeze(recursos.filter((r) => r.cajon === CAJON.SUBCONTRACTS)),
    nRecursos: recursos.length,
    nSinPrecio: recursos.filter((r) => r.sinPrecio).length,
    nUnidadesMezcladas: recursos.filter((r) => r.unidadesMezcladas).length,
  })
}

/**
 * ¿LA EXPLOSIÓN RECONCILIA CONTRA EL COSTO DIRECTO? PURA.
 *
 * Devuelve `{cuadra, explosion, costoDirecto, residuo, porQue}`. Cuando el costo directo NO se pudo
 * afirmar, `cuadra` es `null` y NO `false`: no hay contra qué reconciliar, y decir que no cuadra
 * sería afirmar un desvío que nadie midió.
 */
export function reconciliar(explosion, costoDirecto, { tolerancia = TOLERANCIA_RECONCILIACION } = {}) {
  const total = costoDirecto?.total ?? null
  if (total === null || total === undefined) {
    return Object.freeze({
      cuadra: null, explosion: null, costoDirecto: null, residuo: null,
      porQue: 'el costo directo no se pudo afirmar: no hay contra qué reconciliar, y decir que no cuadra sería afirmar un desvío que nadie midió',
    })
  }
  if (explosion.nSinPrecio > 0) {
    return Object.freeze({
      cuadra: null, explosion: null, costoDirecto: total, residuo: null,
      porQue: `${explosion.nSinPrecio} recurso(s) sin precio: la explosión no tiene total que comparar`,
    })
  }
  const suma = explosion.recursos.reduce((a, r) => a + (r.costoTotal ?? 0), 0)
  const residuo = Math.round((suma - total) * 100) / 100
  return Object.freeze({
    cuadra: Math.abs(residuo) <= tolerancia,
    explosion: Math.round(suma * 100) / 100,
    costoDirecto: total,
    residuo,
    porQue: Math.abs(residuo) <= tolerancia
      ? `la explosión suma $${Math.round(suma).toLocaleString('es-AR')} contra un costo directo de $${Math.round(total).toLocaleString('es-AR')}: diferencia $${residuo} por redondeo a centavos`
      : `la explosión suma $${Math.round(suma).toLocaleString('es-AR')} y el costo directo dice $${Math.round(total).toLocaleString('es-AR')}: sobran o faltan $${residuo}. Hay un recurso contado dos veces o uno perdido, y las dos cosas son plata`,
  })
}

/**
 * LO QUE COMPRAS VA A CONSUMIR. PURA.
 *
 * Se devuelve aparte y con un nombre que dice para qué es, en vez de que cada consumidor arme su
 * propia proyección sobre `recursos`. Cuando Compras exista, va a leer esto — y si necesita otra
 * forma, se cambia acá y no en Compras.
 */
export function requerimientosParaCompras(explosion) {
  return Object.freeze(explosion.materiales.map((r) => Object.freeze({
    recurso: r.recurso, descripcion: r.nombre, cantidad: r.cantidad, unidad: r.unidad,
    costoEstimado: r.costoTotal,
    // Sin esto, Compras recibe «600 kg de hierro» y no sabe para qué partida ni a quién preguntarle
    // si el número no cierra.
    paraQuePartidas: r.demandantes.map((d) => d.partida),
    estado: r.sinPrecio ? ESTADO.FALTA_DATO : ESTADO.CALCULADO,
  })))
}

export { TIPO_RECURSO }
