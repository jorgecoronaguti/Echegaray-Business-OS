// LO QUE LA LUPA DECIDE, SEPARADO DE CÓMO SE DIBUJA.
//
// Son tres reglas y las tres se rompen en silencio: nadie ve una excepción, el desplegable se pinta
// entero, y lo que dice es falso. Por eso viven acá, en funciones puras con prueba, y no adentro del
// componente de cliente —que `node --test` no puede montar—.

import type { Hallazgo } from './entradaService'

/** Los tres maestros, en el orden en que se muestran. No es alfabético: es el orden del `buscarGlobal`
 *  y el de la barra de áreas —Clientes, Personas, Proveedores—, para que la lista no se reordene
 *  sola entre una búsqueda y la siguiente. */
export const MAESTROS = ['Cliente', 'Persona', 'Proveedor'] as const
export type Maestro = (typeof MAESTROS)[number]

export interface GrupoHallazgos {
  maestro: Maestro
  /** El rótulo en plural que ve el que busca. */
  titulo: string
  hallazgos: Hallazgo[]
}

const PLURAL: Record<Maestro, string> = {
  Cliente: 'Clientes',
  Persona: 'Personas',
  Proveedor: 'Proveedores',
}

/**
 * UN GRUPO VACÍO NO SE DIBUJA. Un encabezado «Proveedores» sobre cero filas se lee como «busqué en
 * proveedores y no hay», que es cierto, pero convierte tres renglones de nada en dos tercios del
 * desplegable y empuja fuera de la vista al único resultado que sí apareció.
 */
export function agrupar(hallazgos: Hallazgo[]): GrupoHallazgos[] {
  return MAESTROS
    .map((m) => ({ maestro: m, titulo: PLURAL[m], hallazgos: hallazgos.filter((h) => h.maestro === m) }))
    .filter((g) => g.hallazgos.length > 0)
}

/**
 * EL MÍNIMO PARA BUSCAR ES DOS CARACTERES, y es el de `buscarGlobal`: con uno solo, `%a%` trae media
 * base y el desplegable se convierte en una lista al azar. La pantalla tiene que DECIRLO — un
 * desplegable vacío después de teclear una letra se lee como «no hay nadie que se llame así».
 */
export const MINIMO = 2

export type EstadoLupa = 'inicio' | 'corto' | 'buscando' | 'sin_resultados' | 'con_resultados' | 'error'

export function estadoDeLupa(
  { q, cargando, error, hallazgos }: {
    q: string
    cargando: boolean
    error: string | null
    hallazgos: Hallazgo[] | null
  },
): EstadoLupa {
  const t = q.trim()
  if (t.length === 0) return 'inicio'
  if (t.length < MINIMO) return 'corto'
  if (error) return 'error'
  // CARGANDO GANA A «SIN RESULTADOS». Mientras la consulta viaja, `hallazgos` todavía es el de la
  // tecla anterior (o null): decir «nada coincide» ahí afirma un resultado que nadie leyó.
  if (cargando || hallazgos === null) return 'buscando'
  return hallazgos.length > 0 ? 'con_resultados' : 'sin_resultados'
}

/** La línea que ve quien busca en cada estado. Nunca «no hay» cuando no se pudo mirar. */
export function leyenda(estado: EstadoLupa, q: string, error: string | null): string | null {
  switch (estado) {
    case 'inicio': return 'Buscá un cliente, una persona o un proveedor.'
    case 'corto': return `Escribí al menos ${MINIMO} letras.`
    case 'buscando': return 'Buscando…'
    case 'sin_resultados': return `Nada se llama «${q.trim()}».`
    case 'error': return error ?? 'No pude buscar.'
    case 'con_resultados': return null
  }
}
