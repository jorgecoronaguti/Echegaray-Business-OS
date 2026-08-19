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

/** EL LEGAJO COMPLETO, tal como lo administra esta área. Sólo Administración lo lee: la RLS de
 *  `personas` es `es_administracion()` y la obra ve el subconjunto operativo de `persona_plantel`.
 *
 *  `fecha_egreso` es lo que saca a alguien del plantel: no hay un `activo` aparte, porque dos
 *  banderas para el mismo hecho se contradicen sin avisar.
 *
 *  NO HAY `nombre` Y `apellido` SEPARADOS, y es a propósito: las 30 filas reales están cargadas como
 *  un solo texto («PEREZ JUAN CARLOS») y partirlo requiere adivinar dónde termina el apellido. Un
 *  dato adivinado con cara de dato cargado es peor que un campo que falta. */
export interface Persona {
  id: string
  nombre_completo: string
  dni: string | null
  cuil: string | null
  fecha_nacimiento: string | null
  nacionalidad: string | null
  telefono: string | null
  email: string | null
  domicilio: string | null
  contacto_emergencia: string | null
  contacto_emergencia_telefono: string | null
  fecha_ingreso: string | null
  fecha_egreso: string | null
  convenio_colectivo: string | null
  categoria: string | null
  especialidad: string | null
  puesto: string | null
  modalidad_liquidacion: string | null
  notas: string | null
}

/** La fila del listado global. Sale de la vista `persona_directorio`, que DERIVA la cuadrilla
 *  vigente y la obra actual de las relaciones canónicas. Ninguna de las dos se guarda. */
export interface PersonaEnDirectorio {
  id: string
  nombre_completo: string
  categoria: string | null
  especialidad: string | null
  puesto: string | null
  fecha_ingreso: string | null
  fecha_egreso: string | null
  cuadrilla_id: string | null
  cuadrilla: string | null
  obra_actual_id: string | null
  /** El NOMBRE de la obra. El id es un slug de URL y no se le muestra a nadie. */
  obra_actual: string | null
  rol_en_obra: string | null
  asignada_desde: string | null
}

/** Una cuadrilla con lo que se deriva de ella. Su obra NO es una columna de la tabla. */
export interface Cuadrilla {
  id: string
  nombre: string
  activa: boolean
  notas: string | null
  responsable_id: string | null
  responsable: string | null
  integrantes: number
  obras_actuales: string | null
}

/** Quién integra una cuadrilla y DESDE CUÁNDO. Cerrar `hasta` no borra: deja el período cerrado. */
export interface Integrante {
  id: string
  persona_id: string
  nombre_completo: string | null
  desde: string
  hasta: string | null
}

/** Las categorías de documento del legajo: las que ya existen en `documentacion_legajo` más las
 *  que un legajo de constructora necesita sí o sí. NO es un CHECK en la base: cerrar el dominio
 *  obligaría a editar las 12 filas cargadas para que corra una migración. */
export const CATEGORIAS_DOCUMENTO = [
  'dni', 'cuil', 'alta_temprana', 'contrato', 'art', 'libreta_fondo_cese',
  'certificado_medico', 'capacitacion', 'licencia_conducir', 'otro',
] as const

/** Un documento del legajo. El archivo vive en Drive: acá va el vínculo, nunca una copia. */
export interface DocumentoLegajo {
  id: string
  tipo_documento: string | null
  nombre: string | null
  drive_file_id: string | null
  fecha_documento: string | null
  presente: boolean | null
  notas: string | null
}

/** Una imputación de horas, en el grano canónico: persona · día · obra · actividad · horas. */
export interface ImputacionHH {
  id: string
  fecha: string | null
  fecha_inicio_semana: string
  obra_canonica_id: string | null
  actividad_id: string | null
  actividad_nombre: string | null
  horas: number
  notas: string | null
  fuente_legacy: string
}

/** Dónde está asignada una persona. La MISMA fila que lee `Obra → Personal`: una sola relación
 *  canónica leída por dos pantallas, no dos tablas que hay que mantener de acuerdo. */
export interface AsignacionDePersona {
  id: string
  obra_id: string
  obra_nombre: string | null
  rol: string | null
  cuadrilla_id: string | null
  cuadrilla: string | null
  actividad_id: string | null
  actividad_nombre: string | null
  desde: string | null
  hasta: string | null
  notas: string | null
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
