// LA MISMA BÚSQUEDA DEL CHAT, EJECUTADA CONTRA POSTGRES.
//
// ═══ QUÉ ESTABA ROTO ═══
//
// Hasta el 12/09/2026 `/documentos` buscaba con `name ilike '%<la frase entera>%'`. Eso encuentra un
// archivo sólo si lo que la persona escribió aparece pegado y en ese orden adentro del nombre: «dni
// de capelli» no es una subcadena de «DNI - Capelli.pdf», «certificado pyme» no es una subcadena de
// «Certificado_pyme_30716304643.pdf» (el guion bajo), y «reporte de actividades de agosto de la
// estrella» no es una subcadena de nada porque la obra está en la carpeta y el mes en el nombre.
// Medido con `orquestador/scripts/documentos-busqueda-baseline.mjs` sobre 30 consultas reales y el
// data room real: 2 aciertos de 30 en la web contra 21 de 30 en el chat, con los MISMOS archivos.
//
// ═══ LA DECISIÓN: UNA SOLA DEFINICIÓN, DOS SUSTRATOS ═══
//
// No se copió el algoritmo del chat acá, y no se escribió un `to_tsquery('spanish')` en una RPC. Lo
// segundo habría sido un SEGUNDO TOKENIZADOR: el stemmer español de Postgres corta distinto que
// `singular()` y no conoce el diccionario de sinónimos de la empresa (sueldo→jornal, cash→flujo), así
// que índice y consulta volverían a hablar idiomas distintos — el defecto original de este buscador.
//
// Lo que hay es una sola escalera, declarada en `orquestador/lib/drive-busqueda/escalera.mjs`, que
// trae cada peldaño en sus dos formas: la del chat (en memoria) y la de acá (datos que este archivo
// traduce a filtros de PostgREST). Los tokens del lado del archivo no los calcula esta pantalla: ya
// están en `drive_index.tokens`, escritos por el indexador con ESA MISMA función y con índice GIN
// desde el 21/08. Y el orden sale de `ordenarPorParecido`, que usa el `puntuar` del chat.
//
// ═══ POR QUÉ LOS VALORES NO SE ESCAPAN ═══
//
// Cada token y cada frase salen de `plano()`, que deja únicamente `[a-z0-9ñ ]`: no puede contener la
// coma, el paréntesis, el punto ni la comilla con los que se rompe un `or=(…)` de PostgREST. El
// tokenizador ES el saneador, y `busquedaLexica.test.ts` lo fija — si alguien relaja `plano()`, ese
// test se pone rojo antes de que la consulta se vuelva inyectable.

import {
  analizarConsulta, peldanosSql,
} from '../../../../orquestador/lib/drive-busqueda/escalera.mjs'
import { ordenarPorParecido } from '../../../../orquestador/lib/drive-busqueda/ranking.mjs'

/** Una alternativa de un peldaño, ya resuelta a datos por la lib. */
export interface Alternativa {
  campo: 'nombre_norm' | 'path_norm' | 'tokens'
  op: 'eq' | 'ilike' | 'contiene' | 'alguno'
  valor: string | string[]
}

export interface Peldano {
  nombre: string
  /** Grupos AND; adentro de cada grupo, alternativas OR. */
  grupos: Alternativa[][]
}

/** Lo que la persona escribió, ya tokenizado por el único tokenizador del OS. */
export interface ConsultaLexica {
  original: string
  frase: string
  fraseCruda: string
  tokens: string[]
  tipo: string | null
  norm: string
}

export const analizar = (texto: string): ConsultaLexica => analizarConsulta(texto) as ConsultaLexica

/** Los peldaños que esta consulta puede intentar, en orden de más estricto a más laxo. */
export const peldanos = (c: ConsultaLexica): Peldano[] => peldanosSql(c) as Peldano[]

/**
 * Un arreglo de Postgres escrito como lo espera PostgREST: `{a,b,c}`.
 *
 * Sin comillas alrededor de cada elemento a propósito: los tokens no tienen comas ni llaves (ver
 * cabecera), así que la forma simple es correcta y legible en el log de la consulta.
 */
const comoArreglo = (v: string[]) => `{${v.join(',')}}`

/** Una alternativa, en la sintaxis de un `or=(…)`. Las dobles comillas del `ilike` son las mismas
 *  que usa el filtro de categorías: sin ellas un valor con punto se parsea como otro operador. */
export function comoFiltro(a: Alternativa): string {
  if (a.campo === 'tokens') {
    const arr = comoArreglo(a.valor as string[])
    return a.op === 'contiene' ? `tokens.cs.${arr}` : `tokens.ov.${arr}`
  }
  const v = a.valor as string
  return a.op === 'eq' ? `${a.campo}.eq."${v}"` : `${a.campo}.ilike."%${v}%"`
}

/** Lo mínimo que este módulo necesita de un constructor de consulta de supabase-js. El tipo real de
 *  PostgREST encadenado con genéricos hace estallar a TypeScript con «type instantiation is
 *  excessively deep» — está documentado en `documentosService.ts`. */
export interface ConsultaFiltrable {
  or: (f: string) => ConsultaFiltrable
}

/** Aplica un peldaño: un `.or()` por grupo, y PostgREST los une con AND. */
export function conPeldano<T extends ConsultaFiltrable>(consulta: T, peldano: Peldano): T {
  let c = consulta
  for (const grupo of peldano.grupos) c = c.or(grupo.map(comoFiltro).join(',')) as T
  return c
}

/**
 * CUÁNTAS FILAS SE RANKEAN.
 *
 * El orden por parecido se calcula en Node, así que sólo puede ordenar lo que Postgres mandó. Los
 * peldaños que deciden una búsqueda real traen decenas de filas —«dni capelli» trae 16, «acta de
 * inicio osse» trae 1— y entran completos. El único que puede traer miles es el último («alguna
 * palabra»), y ahí la ventana corta por fecha de modificación: lo más nuevo primero, que es el orden
 * que la pantalla tenía antes de existir esta búsqueda. No es un techo escondido: `total` lo sigue
 * contando Postgres sobre TODAS las filas que coinciden, y el cartel de la lista lo dice.
 */
export const VENTANA_RANKEO = 600

/**
 * Ordena por parecido con el MISMO `puntuar` del chat.
 *
 * No poda ni colapsa: esta es una lista que se mira y cuyo total lo cuenta Postgres (ver
 * `ordenarPorParecido`).
 */
export function ordenar<T extends { name: string; path?: string | null; modified_time?: string | null }>(
  filas: T[],
  consulta: ConsultaLexica,
): T[] {
  // `ordenarPorParecido` devuelve la misma fila con `score`/`texto`/`senales` agregados. El doble
  // cast es el precio de cruzar a un módulo `.mjs` tipado por inferencia: las filas son las mismas.
  return ordenarPorParecido(filas, consulta) as unknown as T[]
}
