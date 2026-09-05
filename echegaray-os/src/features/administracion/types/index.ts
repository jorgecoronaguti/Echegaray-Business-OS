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
 *  `en_la_empresa` es lo que saca a alguien del plantel, y `fecha_egreso` dice DESDE CUÁNDO. No son
 *  dos banderas del mismo hecho: son dos preguntas, y la segunda a veces no tiene respuesta. De los
 *  43 legajos del data room que están fuera de la nómina, 15 no tienen baja documentada — se fueron,
 *  consta, y la fecha no consta en ningún papel. Con un solo campo había que elegir entre dejarlos
 *  ofreciéndose para asignar a una obra o inventarles una fecha. Un CHECK en la base impide que se
 *  contradigan: con fecha de egreso, `en_la_empresa` es false.
 *
 *  NO HAY `nombre` Y `apellido` SEPARADOS, y es a propósito: las 30 filas reales están cargadas como
 *  un solo texto («PEREZ JUAN CARLOS») y partirlo requiere adivinar dónde termina el apellido. Un
 *  dato adivinado con cara de dato cargado es peor que un campo que falta. */
export interface Persona {
  id: string
  nombre_completo: string
  /** El número de la nómina (pestaña PERSONAL de NUEVA ASISTENCIA). Es la clave con la que liquida
   *  JORNALES. Falta en quien ya no está: la nómina vigente no lo tiene. */
  legajo: string | null
  en_la_empresa: boolean
  /** La carpeta del legajo en el data room. El archivo NUNCA se copia: acá está el vínculo. */
  drive_folder_id: string | null
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
  en_la_empresa: boolean
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
  /** La clave de `categoria_obra` (`oficial`, `ayudante`…). Es lo que le da su PESO al integrante:
   *  cuatro ayudantes no son cuatro oficiales. `null` cuando la persona no la tiene cargada, y ahí
   *  la pantalla dice «sin categoría» en vez de suponer 1,0 en silencio. */
  categoria: string | null
  desde: string
  hasta: string | null
}

/** Una persona del plantel activo SIN cuadrilla vigente. El pool que la pantalla 21 pone al lado de
 *  las cuadrillas: gente disponible que hoy no aparece en ninguna lista operativa. */
export interface SinCuadrilla {
  id: string
  nombre_completo: string
  categoria: string | null
  obra_actual: string | null
}

/** Las categorías de documento del legajo de una constructora.
 *
 *  SÍ ES UN CHECK EN LA BASE, y esta lista tiene que ser exactamente la misma. Durante un mes no lo
 *  fue: la base conservaba el vocabulario de julio ('alta_afip', 'dni_escaneado'…) y el selector
 *  ofrecía éste, así que NINGUNA de las opciones que se podían elegir pasaba la validación y
 *  vincular un documento devolvía 23514 siempre. Que las dos listas no se separen otra vez lo vigila
 *  `orquestador/lib/legajos-catalogo.test.mjs`, que compara ésta contra el CHECK vivo. */
export const CATEGORIAS_DOCUMENTO = [
  'dni', 'cuil', 'alta_temprana', 'ieric', 'contrato', 'art', 'libreta_fondo_cese',
  'examen_medico', 'epp', 'capacitacion', 'recibo_sueldo', 'licencia_conducir', 'baja', 'otro',
] as const

/** Lo que un legajo de quien TRABAJA HOY tiene que tener: alta, identidad, apto médico y entrega de
 *  elementos de protección. Es el criterio del dueño y el que mira IERIC. A quien ya no está no se
 *  le puede pedir un apto médico, así que no se le calcula. */
export const REQUERIDOS_LEGAJO = ['alta_temprana', 'dni', 'examen_medico', 'epp'] as const

/** Qué le falta a un legajo. Se DERIVA de los documentos vinculados: guardar la ausencia como una
 *  fila daría dos definiciones de "qué falta", y el día que alguien suba el papel sólo se
 *  actualizaría una. */
export function faltaEnElLegajo(documentos: { tipo_documento: string | null }[]): string[] {
  const tiene = new Set(documentos.map((d) => d.tipo_documento))
  return REQUERIDOS_LEGAJO.filter((r) => !tiene.has(r))
}

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
  /** El nombre de la obra, para no mostrar un uuid donde va un nombre. */
  obra_nombre: string | null
  horas: number
  /** normal | extra_50 | extra_100 | ausencia | licencia. Ver `features/obras/services/tipoHora.ts`. */
  tipo_hora: string
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
  /** La compra más reciente de ESE nombre, `date` de Postgres. NULL sólo si no hay ninguna fechada. */
  ultima_compra: string | null
}
