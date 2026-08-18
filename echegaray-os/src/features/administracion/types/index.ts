// ADMINISTRACIÓN — los objetos que esta área gestiona a mano.
//
// FRONTERA: acá vive el ALTA y la CORRECCIÓN del dato maestro (quién es una persona, quién es un
// proveedor). Lo que se HACE con ese dato es de otros módulos: a qué obra está asignada una persona
// lo decide la obra, y qué se le compró a un proveedor lo decide Compras. Esta capa no duplica esas
// pantallas — muestra el vínculo y manda a donde se edita.

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

/** Las cuatro categorías del CCT de UOCRA, en orden de calificación descendente.
 *
 *  NO están cerradas por un CHECK en la base, contra lo que decía el encargo: se verificó el
 *  catálogo de Postgres el 19/08/2026 y no existe tal constraint. Hay además tres personas con
 *  '1591', '6E60' y '004212' en esa columna —códigos mal importados—. La pantalla ofrece estas
 *  cuatro y muestra cualquier otro valor tal como está, marcado, para que alguien lo corrija. */
export const CATEGORIAS_UOCRA = [
  'oficial_especializado',
  'oficial',
  'medio_oficial',
  'ayudante',
] as const

export type CategoriaUocra = (typeof CATEGORIAS_UOCRA)[number]

export const CATEGORIA_LABEL: Record<CategoriaUocra, string> = {
  oficial_especializado: 'Oficial especializado',
  oficial: 'Oficial',
  medio_oficial: 'Medio oficial',
  ayudante: 'Ayudante',
}

/** Cómo se muestra una categoría cualquiera, incluida la que no es del convenio. */
export function etiquetaCategoria(valor: string | null): string {
  if (!valor) return 'Sin categoría'
  return CATEGORIA_LABEL[valor as CategoriaUocra] ?? valor
}

export function esCategoriaDeConvenio(valor: string | null): boolean {
  return valor != null && (CATEGORIAS_UOCRA as readonly string[]).includes(valor)
}

/** El legajo, tal como lo administra esta área. `fecha_egreso` es lo que saca a alguien del plantel:
 *  no hay un `activo` aparte, porque dos banderas para el mismo hecho se contradicen sin avisar. */
export interface Persona {
  id: string
  nombre_completo: string
  dni: string | null
  cuil: string | null
  fecha_ingreso: string | null
  fecha_egreso: string | null
  categoria: string | null
  especialidad: string | null
  notas: string | null
}

/** Dónde está asignada una persona. Se LEE acá, se edita en la obra. */
export interface AsignacionDePersona {
  id: string
  obra_id: string
  rol: string | null
  cuadrilla: string | null
  desde: string | null
  hasta: string | null
}

export interface Proveedor {
  id: string
  nombre: string
  razon_social: string | null
  cuit: string | null
  notas: string | null
  activo: boolean
}

/** Un nombre de `Compras!E` que todavía no tiene proveedor canónico. */
export interface NombrePendiente {
  nombre_norm: string
  nombre_origen: string
  comprobantes: number
  total: number
  primera_fecha: string | null
  ultima_fecha: string | null
}

/** Un nombre del Sheet que ya tiene destino, y por qué vía llegó. */
export interface NombreResuelto {
  nombre_norm: string
  comprobantes: number
  total: number
  estado: 'vinculado' | 'no_es_proveedor'
  proveedor_id: string | null
  proveedor_nombre: string | null
  via: 'exacto' | 'resolucion_manual'
  alias_id: string | null
}
