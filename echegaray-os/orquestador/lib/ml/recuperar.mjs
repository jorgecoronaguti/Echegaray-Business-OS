// RECUPERACIÓN HÍBRIDA: filtros, palabras y significado, en ese orden y por ese motivo.
//
// ═══ EL ORDEN NO ES UNA PREFERENCIA, ES LO QUE SE MIDIÓ (04/09/2026) ═══
//
// Sobre los documentos reales del OS, con dos conjuntos de preguntas verificables:
//
//   preguntas por tipo+período      filtros solos aciertan; el modelo no aporta nada
//                                   (el período es una IGUALDAD, no un parecido)
//   preguntas por persona (n=9)     léxico Top-1 66,7% · MRR 75,9%
//                                   embeddings solos 44,4% · 55,0%   ← PEOR que el léxico
//                                   los dos juntos   66,7% · 77,8%   ← el mejor
//
// Las dos lecturas son incómodas para el entusiasmo y las dos son ciertas: los embeddings NO
// reemplazan al índice de palabras en este corpus, lo COMPLEMENTAN. Un buscador que hubiera puesto
// el modelo primero habría empeorado la búsqueda que ya existía.
//
// Donde sí ganan solos es en la pregunta parafraseada: cuando el filtro no aplica y las palabras no
// coinciden, el léxico dio Recall@5 6,7% y el modelo 26,7%. Ahí es donde el modelo se paga.
//
// ═══ LA FUSIÓN ES POR RANGO, NO POR PUNTAJE ═══
//
// `ts_rank` de Postgres y un coseno están en escalas distintas y no son comparables: sumarlos o
// promediarlos deja que la escala decida, no la relevancia. Se fusiona por el PUESTO en que cada
// motor puso a cada documento, que es lo único que significa lo mismo en los dos.

import { entenderConsulta, pasaFiltros } from './entender-consulta.mjs'
import { buscarEnContenido } from '../drive-busqueda/contenido.mjs'
import { CANDIDATOS, embeber } from './motor-embeddings.mjs'

/** Qué modelo indexó los vectores que hay en la base. Cambiarlo exige reindexar: mezclar vectores
 *  de dos modelos no falla, devuelve peor y nadie se entera. */
export const MODELO_INDICE = 'e5-small'

/** La constante de la fusión por rango recíproco. 60 es el valor de la literatura y no se toca sin
 *  volver a medir: mueve cuánto pesa estar segundo contra estar primero. */
const K_FUSION = 60

/**
 * Busca en los documentos del OS.
 *
 * @param {(sql:string, params:Array)=>Promise<{rows:Array}>} ejecutar
 * @param {string} texto la pregunta tal como la escribió la persona
 * @param {{limite?:number, sensibilidadMaxima?:string, usarVector?:boolean}} opts
 */
export async function recuperar(ejecutar, texto, { limite = 6, sensibilidadMaxima = null, usarVector = true } = {}) {
  const t0 = Date.now()
  const q = String(texto ?? '').trim()
  if (!q) return { documentos: [], via: 'vacía', ms: 0 }

  const filtros = entenderConsulta(q)

  // ── 1. IDENTIFICADOR EXACTO: no se puntúa, se busca ──
  // Un CUIT o un número de comprobante tienen respuesta exacta o ninguna. Pasarlos por un modelo
  // es cambiar una certeza por una probabilidad.
  const lex = await buscarEnContenido(ejecutar, q, { limite: 20, sensibilidadMaxima })
  if (lex.via === 'identificador' && lex.documentos.length) {
    return { ...lex, filtros, via: 'identificador', ms: Date.now() - t0 }
  }

  // ── 2. EL LÉXICO, que es lo que hoy está en producción y hay que superar ──
  const rankLex = lex.documentos.map((d) => d.driveFileId)
  const info = new Map(lex.documentos.map((d) => [d.driveFileId, d]))

  // ── 3. EL VECTOR, sobre los MISMOS documentos que el filtro dejó pasar ──
  let rankVec = []
  let degradado = null
  if (usarVector) {
    try {
      const vq = await embeber(MODELO_INDICE, q, { rol: 'consulta' })
      const r = await ejecutar(
        `select e.entidad_id, e.pagina, e.texto, 1 - (e.vector <=> $1::vector) as similitud,
                l.nombre, l.path, l.tipo, l.sensibilidad, l.campos
           from public.ml_embedding e
           join public.documento_leido l on l.drive_file_id = e.entidad_id
          where e.entidad = 'documento' and e.modelo = $2
          order by e.vector <=> $1::vector
          limit 40`,
        [JSON.stringify(vq), CANDIDATOS[MODELO_INDICE].id])
      for (const f of r.rows) {
        if (sensibilidadMaxima && !permitido(f.sensibilidad, sensibilidadMaxima)) continue
        if (!rankVec.includes(f.entidad_id)) rankVec.push(f.entidad_id)
        if (!info.has(f.entidad_id)) {
          info.set(f.entidad_id, {
            driveFileId: f.entidad_id, nombre: f.nombre, path: f.path, tipo: f.tipo,
            sensibilidad: f.sensibilidad, campos: f.campos ?? {},
            pasajes: [{ pagina: f.pagina, extracto: String(f.texto).slice(0, 200), bbox: null }],
          })
        }
      }
    } catch (e) {
      // Sin índice semántico la búsqueda sigue siendo la que ya funcionaba. Degradar no es fallar.
      degradado = e.message.slice(0, 90)
    }
  }

  // ── 4. EL FILTRO ESTRUCTURADO, aplicado a los candidatos de los dos motores ──
  const cumple = (id) => !filtros.filtros || pasaFiltros(info.get(id) ?? {}, filtros)
  const lexF = rankLex.filter(cumple)
  const vecF = rankVec.filter(cumple)
  // Si el filtro se lleva TODO, es más probable que la pregunta esté mal entendida que que no haya
  // respuesta: se devuelve lo de antes y se dice que el filtro no se pudo aplicar.
  const usoFiltro = Boolean(filtros.filtros) && (lexF.length || vecF.length)
  // Que el filtro se descarte no puede ser invisible. Pasa de verdad: la pregunta nombra octubre de
  // 2023 y el documento correcto NO tiene el período extraído, así que el filtro lo tira junto con
  // todo lo demás. La respuesta sigue siendo la mejor posible, pero quien la lee tiene que saber
  // que se buscó con menos precisión de la que la pregunta permitía.
  const filtroDescartado = Boolean(filtros.filtros) && !usoFiltro
  const listas = usoFiltro ? [lexF, vecF] : [rankLex, rankVec]

  // ── EL VECTOR ES RESCATE, NO SOCIO. Medido sobre `ecsas-rag-eval` (100 preguntas) ──
  //
  // Fusionar SIEMPRE las dos listas hacía la búsqueda PEOR que el léxico solo: MRR 14,2% contra
  // 18,4%. La causa es la naturaleza de las preguntas reales de esta empresa — un importe exacto y
  // una frase textual del documento las contesta el índice de palabras de forma EXACTA, y meter
  // candidatos semánticos en la fusión sólo empuja hacia abajo la respuesta correcta.
  //
  // El primer benchmark decía lo contrario. Tenía nueve preguntas. Ésta es la diferencia entre
  // medir y creer haber medido.
  //
  // Ahora el vector entra cuando el léxico NO alcanza: no encontró nada, o encontró poco. Ahí es
  // donde se paga —Recall@5 6,7% contra 26,7% en preguntas parafraseadas— y no le quita nada a lo
  // que el léxico ya resuelve bien.
  const LEXICO_SUFICIENTE = 3
  const lexUsable = usoFiltro ? lexF : rankLex
  const vecUsable = usoFiltro ? vecF : rankVec
  const rescate = lexUsable.length < LEXICO_SUFICIENTE
  const fusionado = rescate
    ? fusionarPorRango([lexUsable, vecUsable].filter((l) => l.length))
    : lexUsable
  const documentos = fusionado.slice(0, limite).map((id) => info.get(id)).filter(Boolean)

  return {
    documentos, filtros, degradado, filtroDescartado,
    via: [
      usoFiltro ? `filtros(${filtros.filtros})` : (filtroDescartado ? 'filtros descartados' : null),
      lexUsable.length ? 'léxico' : null,
      rescate && vecUsable.length ? 'semántico (rescate)' : null,
    ].filter(Boolean).join('+') || 'sin resultados',
    ms: Date.now() - t0,
  }
}

/** Fusión por rango recíproco. Sólo importa el PUESTO: los puntajes de los dos motores están en
 *  escalas que no son comparables. */
export function fusionarPorRango(listas, k = K_FUSION) {
  const p = new Map()
  for (const l of listas) l.forEach((id, i) => p.set(id, (p.get(id) ?? 0) + 1 / (k + i + 1)))
  return [...p.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

const ORDEN = ['publico', 'interno', 'confidencial', 'credenciales']
function permitido(s, techo) {
  return ORDEN.indexOf(String(s ?? 'confidencial')) <= ORDEN.indexOf(String(techo))
}
