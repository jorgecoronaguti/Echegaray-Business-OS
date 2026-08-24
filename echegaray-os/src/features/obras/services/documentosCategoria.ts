// LAS CATEGORÍAS DE LOS DOCUMENTOS DE UNA OBRA.
//
// VIVE EN `services/` Y NO EN EL COMPONENTE, y no es por prolijidad: `node --test` sabe borrar los
// tipos de un `.ts` pero no de un `.tsx`, así que una función pura metida adentro del componente
// sólo se puede ejercitar levantando un navegador — y entonces no se ejercita.
//
// ═══ POR QUÉ CUATRO CATEGORÍAS FIJAS Y NO EL TEXTO LIBRE (24/08/2026) ═══
//
// Hasta hoy la agrupación era por `obra_documento.rol`, texto libre. Resultado medido en
// producción: los 32 papeles reales en un solo grupo «Sin clasificar». Un campo libre que nadie
// completa no es una taxonomía flexible, es una taxonomía vacía.
//
// El canon (pantalla 12) fija cuatro grupos por PARA QUÉ SIRVE el papel, y se dibujan SIEMPRE —
// también con cero adentro—. Un grupo vacío no es ruido: es el único lugar donde se ve que a esta
// obra le falta el contrato, y esa ausencia es información. Un grupo que aparece sólo cuando ya
// tiene algo adentro no puede decir nunca que falta.
//
// `rol` sigue siendo texto libre en la base a propósito: hay ocho obras con papeles cargados y
// cerrar el vocabulario con un CHECK convertiría cualquier rótulo viejo en una fila que no se puede
// actualizar. El vocabulario se cierra en la PANTALLA (el selector ofrece cuatro), y lo que alguien
// escribió antes y no entra en ninguna se sigue mostrando en su propio grupo: borrarle la categoría
// a quien la cargó sería peor que tener un grupo de más.

import type { DocumentoObra } from '../types'

/** El vocabulario canónico. Los rótulos son los del handoff, no abreviaturas: el título del grupo
 *  es lo que hace que alguien encuentre el papel sin abrir los cuatro. */
export const CATEGORIAS = {
  PLANOS: 'Planos y documentación técnica',
  CONTRATO: 'Contrato y cliente',
  SEGURIDAD: 'Seguridad e higiene',
  EVIDENCIA: 'Evidencia de obra',
} as const

export type Categoria = (typeof CATEGORIAS)[keyof typeof CATEGORIAS]

/** En el orden del ciclo de vida de la obra, no el alfabético. */
export const CATEGORIAS_CANONICAS: readonly Categoria[] = [
  CATEGORIAS.PLANOS, CATEGORIAS.CONTRATO, CATEGORIAS.SEGURIDAD, CATEGORIAS.EVIDENCIA,
]

// LO NO CLASIFICADO SE LLAMA «Sin clasificar» Y VA AL FINAL, no «Otros»: «Otros» suena a una
// decisión tomada —«miramos y no encaja en ninguna»— y esto es lo contrario, es lo que nadie miró
// todavía. La diferencia importa porque de ahí sale el trabajo pendiente.
export const SIN_CLASIFICAR = 'Sin clasificar'

// ═══ PARA QUÉ SIRVE CADA GRUPO (Design canónico 23/08, pantalla 12) ═══
//
// «Los documentos se agrupan por para qué sirven, no por tipo de archivo». La frase que acompaña al
// título del grupo no es decoración: es lo que hace que alguien que busca el papel para cobrar sepa
// dónde mirar sin abrir cuatro grupos.
const PARA_QUE: Record<string, string> = {
  [CATEGORIAS.PLANOS]: 'para construir',
  [CATEGORIAS.CONTRATO]: 'para cobrar',
  [CATEGORIAS.SEGURIDAD]: 'para poder trabajar',
  [CATEGORIAS.EVIDENCIA]: 'para respaldar el avance',
}

/**
 * La frase de la cabecera del grupo, o `null` cuando la categoría la escribió una persona.
 *
 * SÓLO PARA LAS CUATRO CANÓNICAS. Si alguien escribió «Acta de medición», nadie sabe para qué sirve
 * salvo quien la escribió, e inventarle una función sería afirmar algo que nadie declaró. Esas
 * categorías van sin frase — y eso es correcto, no un hueco.
 */
export function paraQueSirve(categoria: string): string | null {
  if (categoria === SIN_CLASIFICAR) return 'nadie dijo todavía para qué sirve'
  return PARA_QUE[categoria] ?? null
}

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

// LOS RÓTULOS VIEJOS QUE YA ESTÁN EN LA BASE. `rol` se ofrecía como datalist con «Contrato»,
// «Planos», «Certificaciones», «Compras» y «Seguridad», y esos textos pueden estar cargados. Se
// traducen al canon en la LECTURA, sin tocar la base: una migración de datos sobre un campo libre
// que ocho obras pueden haber llenado a mano necesita mirar las filas reales primero, y eso no se
// hace desde acá. «Compras» NO está en el mapa a propósito: el canon no tiene un grupo para el
// respaldo del costo, y meterlo en «Contrato y cliente» mezclaría lo que se cobra con lo que se
// paga. Queda como grupo propio hasta que el dueño diga dónde va.
const EQUIVALENCIAS: Record<string, Categoria> = {
  planos: CATEGORIAS.PLANOS,
  plano: CATEGORIAS.PLANOS,
  contrato: CATEGORIAS.CONTRATO,
  certificaciones: CATEGORIAS.CONTRATO,
  seguridad: CATEGORIAS.SEGURIDAD,
  evidencia: CATEGORIAS.EVIDENCIA,
}

/**
 * EL GRUPO AL QUE CAE UN PAPEL SEGÚN LO QUE ALGUIEN DECLARÓ EN `rol`.
 *
 * `null`/vacío → `SIN_CLASIFICAR`. Nunca mira el nombre del archivo: eso es `sugerirCategoria`, y
 * su resultado es una sugerencia que se muestra, no un grupo al que se manda el papel.
 */
export function categoriaDeclarada(rol: string | null): string {
  const bruto = (rol ?? '').trim()
  if (bruto === '') return SIN_CLASIFICAR
  const n = normalizar(bruto)
  const canonica = CATEGORIAS_CANONICAS.find((c) => normalizar(c) === n)
  // Se muestra el rótulo canónico, no lo que se escribió: acá el vocabulario SÍ es cerrado, y
  // «seguridad» y «Seguridad e higiene» tienen que ser una sola fila de la pantalla.
  return canonica ?? EQUIVALENCIAS[n] ?? bruto
}

export interface GrupoDocumentos {
  categoria: string
  docs: DocumentoObra[]
  /** `true` para las cuatro del canon: se dibujan aunque estén vacías. */
  canonica: boolean
}

/**
 * LOS DOCUMENTOS POR CATEGORÍA: las cuatro canónicas siempre —vacías incluidas—, después las que
 * alguien escribió a mano y no entran en ninguna, y al final «Sin clasificar».
 *
 * Función pura y exportada para poder probar el agrupamiento sin navegador.
 */
export function porCategoria(documentos: DocumentoObra[]): GrupoDocumentos[] {
  const grupos = new Map<string, DocumentoObra[]>()
  for (const c of CATEGORIAS_CANONICAS) grupos.set(c, [])
  for (const d of documentos) {
    const destino = categoriaDeclarada(d.rol)
    grupos.set(destino, [...(grupos.get(destino) ?? []), d])
  }
  // «Sin clasificar» existe siempre y va último: su conteo en cero es la única forma de decir «no
  // queda nada por clasificar», que es una respuesta y no un vacío.
  if (!grupos.has(SIN_CLASIFICAR)) grupos.set(SIN_CLASIFICAR, [])

  const peso = (c: string) => {
    if (c === SIN_CLASIFICAR) return 9999
    const i = CATEGORIAS_CANONICAS.indexOf(c as Categoria)
    return i >= 0 ? i : 500
  }
  return [...grupos.entries()]
    .map(([categoria, docs]) => ({
      categoria, docs, canonica: CATEGORIAS_CANONICAS.includes(categoria as Categoria),
    }))
    .sort((a, b) => peso(a.categoria) - peso(b.categoria) || a.categoria.localeCompare(b.categoria, 'es'))
}

/**
 * LO MISMO, FILTRADO AL TECLEAR Y POR EL CHIP DE CATEGORÍA.
 *
 * Dos filtros con dos comportamientos distintos a propósito:
 *
 * - **El chip** deja UN grupo. Es una elección explícita: quien lo aprieta quiere ver ese grupo,
 *   también si está vacío — y ahí el vacío es la respuesta («no hay ningún papel de seguridad»).
 * - **El texto** recorta filas y **descarta los grupos que quedan vacíos**: una cabecera con cero
 *   filas debajo se leería como «este grupo está vacío», que es lo contrario de «nada de este grupo
 *   coincide con lo que escribiste». Los grupos vacíos del canon también se van mientras se busca.
 *
 * Busca por nombre, ruta y CATEGORÍA: escribir «seguridad» tiene que traer el grupo entero, que es
 * lo que alguien espera cuando busca por para qué sirve el papel.
 */
export function porCategoriaFiltrado(
  documentos: DocumentoObra[], consulta: string, categoria?: string | null,
): GrupoDocumentos[] {
  const q = normalizar(consulta)
  const base = porCategoria(documentos).filter((g) => !categoria || g.categoria === categoria)
  if (q === '') return base
  return base
    .map((g) => ({
      ...g,
      docs: normalizar(g.categoria).includes(q)
        ? g.docs
        : g.docs.filter((d) => normalizar(`${d.name ?? d.drive_file_id} ${d.path ?? ''}`).includes(q)),
    }))
    .filter((g) => g.docs.length > 0)
}
