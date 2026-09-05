// CLASIFICAR UN DOCUMENTO QUE LAS REGLAS NO RECONOCIERON. La escalera completa, en un archivo.
//
// ═══ EL ORDEN, Y POR QUÉ CADA PELDAÑO EXISTE ═══
//
//   1. REGLA      832 documentos ya tienen tipo porque una frase obligatoria lo probó. Una regla que
//                 acierta no se somete a votación: es más rápida, gratis y dice qué leyó.
//   2. VECINOS    los 381 que ninguna regla reconoce. Se comparan por embedding contra los 832 que
//                 SÍ tienen tipo, y votan los k más parecidos ponderados por similitud.
//   3. CLAUDE     lo que ni la regla ni los vecinos deciden con confianza.
//
// ═══ LO QUE ESTA CAPACIDAD NO HACE ═══
//
// No escribe `tipo`. Escribe `tipo_propuesto`, que es otra columna. Un documento mal tipado entra
// al índice bajo un rótulo falso y nadie lo vuelve a mirar; peor, contamina el ground truth del que
// depende toda medición futura. La propuesta espera una confirmación humana, y esa confirmación es
// la primera etiqueta de este dataset que no salió de una regla.
//
// ═══ POR QUÉ EL VOTO SE PONDERA POR SIMILITUD ═══
//
// Contar votos a secas deja que cuatro vecinos flojos le ganen a uno que es casi el mismo
// documento. Un vecino a 0,97 sabe más que cuatro a 0,88.

import { query } from '../db.mjs'
import { embeber, coseno, CANDIDATOS } from './motor-embeddings.mjs'
import { clasificarPorTexto } from '../documentos/clasificar.mjs'

export const MODELO_INDICE = 'e5-small'
/** Cuántos vecinos votan. Con 1 el resultado es el vecino más cercano y basta un outlier; con 15 se
 *  diluye la señal de los pocos ejemplos que tienen las clases chicas. */
export const K = 5
/**
 * Cuánta ventaja necesita el ganador para que la propuesta valga.
 *
 * Es una RAZÓN contra el segundo, no una altura: los cosenos de e5 se comprimen entre 0,85 y 1,00
 * y un umbral absoluto ahí no distingue nada — la lección del coseno 0,90 de los proveedores.
 */
export const RAZON_MINIMA = 1.35

/** Los documentos que una regla YA tipó: son los ejemplos contra los que se compara. */
export async function ejemplos({ ejecutar = query } = {}) {
  const q = await ejecutar(`
    select l.drive_file_id, l.tipo,
           (select string_agg(f.texto, ' ' order by f.pagina, f.orden)
              from public.documento_fragmento f
             where f.drive_file_id = l.drive_file_id and f.orden < 3) texto
      from public.documento_leido l
     where l.tipo is not null and l.error is null
     order by l.drive_file_id`)
  return q.rows.filter((r) => r.texto && r.texto.length > 100)
}

/** Los que ninguna regla reconoció y tienen texto para mirar. */
export async function pendientes({ ejecutar = query, limite = 500 } = {}) {
  const q = await ejecutar(`
    select l.drive_file_id, l.nombre,
           (select string_agg(f.texto, ' ' order by f.pagina, f.orden)
              from public.documento_fragmento f
             where f.drive_file_id = l.drive_file_id and f.orden < 3) texto
      from public.documento_leido l
     where l.tipo is null and l.error is null and coalesce(l.caracteres, 0) > 200
     order by l.drive_file_id limit $1`, [limite])
  return q.rows.filter((r) => r.texto && r.texto.length > 100)
}

/** El texto que representa a un documento para compararlo. Los primeros fragmentos: la cabecera es
 *  lo que identifica un formulario, y el cuerpo es lo que lo hace único. */
const recorte = (t) => String(t ?? '').slice(0, 1200)

/**
 * Clasifica por vecinos. PURA en su decisión: recibe los vectores, no los calcula.
 *
 * @returns {{tipo:string|null, confianza:number, razon:number|null, metodo:string, porQue:string}}
 */
export function votarVecinos(vectorConsulta, ejemplosConVector, { k = K, razonMinima = RAZON_MINIMA } = {}) {
  if (!ejemplosConVector.length) return { tipo: null, confianza: 0, razon: null, metodo: 'vecinos', porQue: 'no hay ejemplos con los que comparar' }
  const cercanos = ejemplosConVector
    .map((e) => ({ tipo: e.tipo, s: coseno(vectorConsulta, e.vector) }))
    .sort((a, b) => b.s - a.s).slice(0, k)

  const voto = new Map()
  for (const v of cercanos) voto.set(v.tipo, (voto.get(v.tipo) ?? 0) + v.s)
  const orden = [...voto.entries()].sort((a, b) => b[1] - a[1])
  const [mejor, segundo] = orden
  const razon = segundo ? mejor[1] / segundo[1] : Infinity
  const confianza = mejor[1] / cercanos.reduce((s, v) => s + v.s, 0)

  if (razon < razonMinima) {
    return {
      tipo: null, confianza: Number(confianza.toFixed(3)), razon: Number(razon.toFixed(2)), metodo: 'vecinos',
      porQue: `«${mejor[0]}» y «${segundo[0]}» quedan demasiado cerca entre los ${k} más parecidos (${razon.toFixed(2)}×, hacen falta ${razonMinima}): lo decide una persona`,
    }
  }
  return {
    tipo: mejor[0], confianza: Number(confianza.toFixed(3)),
    razon: Number.isFinite(razon) ? Number(razon.toFixed(2)) : null, metodo: 'vecinos',
    porQue: `${cercanos.filter((v) => v.tipo === mejor[0]).length} de los ${k} documentos más parecidos son «${mejor[0]}», y le sacan ${Number.isFinite(razon) ? razon.toFixed(1) + '×' : 'todo'} al siguiente`,
  }
}

/**
 * LA ESCALERA COMPLETA sobre un texto. Devuelve qué peldaño lo resolvió.
 * Nunca llega a Claude por sí sola: devuelve `escalar: true` y el llamador decide.
 */
export async function clasificarDocumento(texto, ejemplosConVector, { k = K } = {}) {
  const porRegla = clasificarPorTexto(texto)
  if (porRegla.tipo) {
    return { ...porRegla, metodo: 'regla', escalar: false, confianza: porRegla.confianza }
  }
  const v = await embeber(MODELO_INDICE, recorte(texto), { rol: 'documento' })
  const r = votarVecinos(v, ejemplosConVector, { k })
  return { ...r, escalar: r.tipo === null, modelo: CANDIDATOS[MODELO_INDICE].id, revision: CANDIDATOS[MODELO_INDICE].revision }
}
