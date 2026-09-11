// QUÉ CARPETA DE DRIVE ES DE QUÉ OBRA — la regla, pura y sin base.
//
// El dueño (11/09/2026): «en el CRM admin no encuentro las cotizaciones, los documentos, archivos y
// demás cuestiones que han conformado todas las obras».
//
// Para mostrarlos hay que saber qué carpeta del Drive es de qué obra. Hoy eso NO está escrito en
// ningún lado: `obra_canonica.drive_carpeta_id` lo tienen 3 obras de 26, y `drive_index` conoce las
// rutas pero no las obras.
//
// ═══ LAS TRES REGLAS, DE MÁS FUERTE A MÁS DÉBIL — Y NINGUNA ES UN PARECIDO ═══
//
//   1 · `obra_canonica.drive_carpeta_id`   alguien ya lo declaró. Es una decisión tomada, gana.
//   2 · UN PAPEL ANCLA                     un archivo que YA está atado a la obra con evidencia
//                                          —la cotización que fija su precio (`obra_contrato`), la
//                                          OC que mandó el cliente (`cliente_orden`)— vive adentro
//                                          de una carpeta: esa carpeta es de esa obra. No es un
//                                          parecido de nombres: es un papel.
//   3 · EL NOMBRE DE LA CARPETA            resuelve a UNA obra del MISMO cliente por alias o por su
//                                          nombre canónico, con borde de palabra
//                                          (`obrasNombradas`, el mismo matcher que imputa Cobranzas).
//
// ═══ LO QUE NO SE HACE, Y ES LO MÁS IMPORTANTE ═══
//
// NO hay coincidencia difusa, ni puntaje, ni «se parece bastante». «PISOS INDUSTRIALES 120m2» no
// resuelve a «ME - PISOS 120 M² Y RAMPA» por nombre y está bien que no: un enlace equivocado pone
// los papeles de una obra abajo de otra, y el dueño los lee para decidir. Lo que no resuelve por
// evidencia sale en la lista de dudas, que es trabajo para una persona, no para una heurística.
//
// ═══ UNA CARPETA, UNA OBRA — Y EL EMPATE LO GANA LA OBRA MAYOR ═══
//
// «PLATEA DE HORMIGON - Playon de azufre» tiene adentro la cotización del Playón Y la OC del
// adicional del tercer muro: dos obras anclan en la misma carpeta. La carpeta es de la MADRE (el
// adicional cuelga de ella) y el adicional muestra igual SUS papeles, que viajan por su propio
// ancla. Entre dos obras sin parentesco no se elige: la carpeta queda sin vincular y se reporta.

import { normObra } from './obra-operacion.mjs'
import { obrasNombradas } from './cobranza-obra.mjs'

/** @typedef {{drive_file_id: string, name: string, path: string, depth: number}} Carpeta */
/** @typedef {{obra_id: string, drive_file_id: string, path: string, que: string}} Ancla */
/** @typedef {{id: string, nombre: string, cliente_id: string|null, obra_padre_id: string|null, drive_carpeta_id: string|null}} Obra */

export const FUENTES = Object.freeze({
  DECLARADA: 'obra_canonica.drive_carpeta_id',
  ANCLA: 'papel-ancla',
  NOMBRE: 'nombre-de-carpeta',
})

/**
 * LA CARPETA DE OBRA DE UNA RUTA: el ancestro a profundidad `nivelObra`.
 *
 * Un ancla puede estar tres carpetas adentro («…/BASES DE TANQUE /PRESUPUESTO - OC/ADICIONAL.pdf»).
 * Lo que identifica a la obra es la carpeta de PRIMER nivel debajo del cliente, no la subcarpeta
 * genérica donde alguien guardó el PDF: «Cotizaciones», «PRESUPUESTO - OC» y «ARCHIVOS VIEJOS» se
 * repiten en todas las obras y no identifican ninguna.
 *
 * Devuelve `null` cuando el archivo cuelga directo de la carpeta del CLIENTE: ahí no hay carpeta de
 * obra que deducir, y el papel se muestra igual porque viaja por su propio vínculo.
 *
 * @param {string} path ruta completa del archivo
 * @param {number} nivelObra cuántos segmentos tiene la ruta de una carpeta de obra
 * @returns {string|null} la ruta de la carpeta de obra
 */
export function carpetaDeObraDe(path, nivelObra) {
  const partes = String(path ?? '').split('/').filter(Boolean)
  // El archivo tiene que estar MÁS ADENTRO que la carpeta de obra: si está justo al nivel de ella,
  // es un archivo suelto de la carpeta del cliente.
  if (partes.length <= nivelObra) return null
  return partes.slice(0, nivelObra).join('/')
}

/** Los alias con los que se puede nombrar a UNA obra: los de `obra_alias` MÁS su nombre canónico. */
export function aliasesDeLasObras(obras, filasAlias) {
  const lista = []
  for (const o of obras ?? []) {
    const n = normObra(o.nombre)
    if (n) lista.push({ alias: n, obraId: o.id })
  }
  for (const a of filasAlias ?? []) {
    if (a?.alias && a?.obra_id) lista.push({ alias: a.alias, obraId: a.obra_id })
  }
  return lista
}

/**
 * ¿Cuál de estas obras se queda con la carpeta? La MADRE, si una es adicional de la otra.
 * `null` = no se puede decidir sin inventar.
 */
export function desempatar(ids, porId) {
  const unicos = [...new Set(ids)]
  if (unicos.length <= 1) return unicos[0] ?? null
  // Si todas menos una son adicionales de esa una, gana la madre.
  const madres = unicos.filter((id) => !unicos.includes(porId.get(id)?.obra_padre_id ?? ''))
  return madres.length === 1 ? madres[0] : null
}

/**
 * EL VÍNCULO CARPETA → OBRA, con su fuente, y TODO lo que no se pudo vincular.
 *
 * @param {{carpetas: Carpeta[], anclas: Ancla[], obras: Obra[], alias: {alias:string,obra_id:string}[], nivelObra?: number, clienteDe?: (path:string)=>string|null}} entrada
 */
export function vincularCarpetas({ carpetas, anclas, obras, alias, nivelObra = 3, clienteDe }) {
  const porId = new Map((obras ?? []).map((o) => [o.id, o]))
  const porRuta = new Map((carpetas ?? []).map((c) => [c.path, c]))
  // `nivelObra` cuenta SEGMENTOS de la ruta («administracion/PRESUPUESTOS - CLIENTES/<CLIENTE>/<OBRA>»
  // son 4) y `drive_index.depth` cuenta desde 0 en la raíz: la carpeta de obra es `nivelObra - 1`.
  // Confundirlos hacía candidatas a las SUBcarpetas —«Cotizacion Interna», «ARCHIVOS VIEJOS»— y la
  // lista de dudas se llenaba de 73 carpetas genéricas que no identifican ninguna obra.
  const candidatas = (carpetas ?? []).filter((c) => c.depth === nivelObra - 1)

  /** obra → cómo llegó. Se llena de más fuerte a más débil y nunca se pisa. */
  const vinculo = new Map() // ruta → {obra_id, fuente, porque}
  const dudas = []
  /**
   * LAS CARPETAS QUE DOS OBRAS SE DISPUTAN CON LA MISMA FUERZA Y NADIE GANÓ.
   *
   * Quedan FUERA de las reglas más débiles. Si dos obras DECLARARON la misma carpeta, que el nombre
   * de la carpeta nombre a una tercera no desempata nada: la disputa es entre las dos que alguien
   * escribió, y resolverla con una regla más floja es exactamente cómo un papel termina abajo de la
   * obra equivocada. Se reporta y la decide una persona.
   */
  const bloqueadas = new Set()

  // 1 · LO DECLARADO GANA.
  for (const o of obras ?? []) {
    if (!o.drive_carpeta_id) continue
    const c = (carpetas ?? []).find((x) => x.drive_file_id === o.drive_carpeta_id)
    if (!c) { dudas.push({ tipo: 'carpeta-declarada-no-indexada', obra_id: o.id, drive_folder_id: o.drive_carpeta_id }); continue }
    if (bloqueadas.has(c.path)) continue
    const previo = vinculo.get(c.path)
    if (previo && previo.obra_id !== o.id) {
      const gana = desempatar([previo.obra_id, o.id], porId)
      if (!gana) {
        // SE BORRA EL VÍNCULO, no se deja el de la primera que pasó: quedarse con uno de los dos
        // porque llegó antes es decidir por orden de lectura, que no es evidencia de nada.
        vinculo.delete(c.path)
        bloqueadas.add(c.path)
        dudas.push({ tipo: 'carpeta-declarada-por-dos-obras', ruta: c.path, obras: [previo.obra_id, o.id] })
        continue
      }
      if (gana === previo.obra_id) continue
    }
    vinculo.set(c.path, { obra_id: o.id, fuente: FUENTES.DECLARADA, porque: `obra_canonica.drive_carpeta_id = ${o.drive_carpeta_id}` })
  }

  // 2 · EL PAPEL ANCLA. Se juntan TODAS las obras que anclan en cada carpeta antes de decidir: con
  //     una sola pasada, la primera que apareciera se quedaría con la carpeta de la otra.
  const porCarpeta = new Map()
  for (const a of anclas ?? []) {
    const ruta = carpetaDeObraDe(a.path, nivelObra)
    if (!ruta || !porRuta.has(ruta)) continue
    porCarpeta.set(ruta, [...(porCarpeta.get(ruta) ?? []), a])
  }
  for (const [ruta, lista] of porCarpeta) {
    if (vinculo.has(ruta) || bloqueadas.has(ruta)) continue
    const gana = desempatar(lista.map((a) => a.obra_id), porId)
    if (!gana) {
      dudas.push({ tipo: 'carpeta-con-anclas-de-varias-obras', ruta, obras: [...new Set(lista.map((a) => a.obra_id))] })
      continue
    }
    const suyas = lista.filter((a) => a.obra_id === gana)
    vinculo.set(ruta, { obra_id: gana, fuente: FUENTES.ANCLA, porque: `${suyas.length} papel(es) de la obra adentro: ${suyas[0].que}` })
  }

  // 3 · EL NOMBRE DE LA CARPETA, sólo entre las obras DEL MISMO CLIENTE.
  for (const c of candidatas) {
    if (vinculo.has(c.path) || bloqueadas.has(c.path)) continue
    const cliente = clienteDe ? clienteDe(c.path) : null
    // LA CARPETA DE UN CLIENTE QUE NO TIENE NINGUNA OBRA EN EL OS NO ES UNA DUDA DEL MISMO TIPO.
    // ARCOR, VUELO PLACO, ORICA y SAINT GOBAIN tienen carpetas de obra en Drive y ninguna obra
    // abierta acá: listarlas junto a «MESSINA/LOSA PARA TANQUE DE GAS» enterraría las que sí son
    // trabajo —de 89 líneas, seis— debajo de 83 que no lo son.
    if (clienteDe && !cliente) {
      dudas.push({ tipo: 'cliente-sin-obras-en-el-os', ruta: c.path })
      continue
    }
    const delCliente = (obras ?? []).filter((o) => !cliente || o.cliente_id === cliente)
    const halladas = obrasNombradas(c.name, aliasesDeLasObras(delCliente, alias?.filter(
      (a) => delCliente.some((o) => o.id === a.obra_id))))
    const gana = desempatar(halladas, porId)
    if (!gana) {
      dudas.push({
        tipo: halladas.length ? 'carpeta-nombra-a-varias-obras' : 'carpeta-sin-obra',
        ruta: c.path, obras: halladas,
      })
      continue
    }
    vinculo.set(c.path, { obra_id: gana, fuente: FUENTES.NOMBRE, porque: `el nombre «${c.name}» nombra la obra` })
  }

  const vinculos = [...vinculo.entries()].map(([ruta, v]) => ({
    obra_id: v.obra_id, drive_folder_id: porRuta.get(ruta)?.drive_file_id ?? null, ruta, ...v,
  })).filter((v) => v.drive_folder_id)

  // UNA DUDA QUE UNA REGLA POSTERIOR RESOLVIÓ NO ES UNA DUDA. «PLATEA DE HORMIGON - Playon de
  // azufre» tiene anclas de la madre Y del adicional (empate sin padre declarado) pero su NOMBRE
  // nombra a la madre: la regla 3 la resolvió, y reportarla igual mandaría al dueño a decidir algo
  // que ya está decidido.
  const resueltas = new Set(vinculo.keys())
  const dudasVivas = dudas.filter((d) => !d.ruta || !resueltas.has(d.ruta))

  const conCarpeta = new Set(vinculos.map((v) => v.obra_id))
  const sinCarpeta = (obras ?? []).filter((o) => !conCarpeta.has(o.id)).map((o) => o.id)
  return { vinculos, dudas: dudasVivas, sinCarpeta }
}
