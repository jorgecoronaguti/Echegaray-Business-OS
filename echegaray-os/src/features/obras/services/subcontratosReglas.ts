// LAS REGLAS DEL PAQUETE SUBCONTRATADO — puras, sin base de datos y sin JSX.
//
// Viven separadas del servicio porque son las que deciden: si un paquete puede arrancar, qué dice
// su estado, cuánto avanzó y cómo se compara contra hacerlo con gente propia. Un `if` de esos
// escrito dentro de un componente no se puede probar sin levantar un navegador, y son justo los que
// tienen efecto: el bloqueo de inicio es de SEGURIDAD y la comparación es ECONÓMICA.
//
// ═══ LA COMPARACIÓN SE HACE CONTRA EL COSTO REAL, NUNCA CONTRA EL PRECIO CONTRATADO ═══
//
// Es la advertencia que la migración 2500 dejó escrita: «sin la segunda mitad, comparar propio
// contra subcontrato está sesgado a favor del subcontrato, porque lo que le damos lo paga la obra
// igual pero por otra ventanilla». Costo real = precio contratado + aportes de Echegaray. Si esta
// función volviera a mirar `precio_contratado`, toda decisión de subcontratar saldría barata por
// construcción — y nadie lo notaría, porque el número seguiría siendo un número.
//
// ═══ SU GENTE NO ENTRA EN LA NUESTRA (§23 del contrato, y la 2500) ═══
//
// Las personas externas se cuentan aparte y se rotulan aparte. Nada de lo que sale de acá suma al
// plantel, a las HH propias ni a la capacidad de obra: la comparación dice cuánta gente propia se
// LIBERA, que es lo contrario de sumar la ajena.

export type EstadoSubcontrato = 'previsto' | 'contratado' | 'en_curso' | 'terminado' | 'anulado'
export type TipoDocumento = 'contrato' | 'art' | 'seguro_rc' | 'alta_personal' | 'otro'

export interface DocumentoPaquete {
  id: string
  tipo: TipoDocumento
  descripcion: string | null
  fecha_emision: string | null
  vence_el: string | null
}

/** Cómo está cada papel HOY. `falta` y `vencido` son dos cosas distintas y se dicen distinto. */
export type EstadoDocumento = 'ok' | 'por_vencer' | 'vencido' | 'falta'

export interface FilaDocumental {
  tipo: TipoDocumento
  rotulo: string
  estado: EstadoDocumento
  /** Lo que se lee en la pantalla: la fecha, «sin cargar», «vence 30/09». */
  detalle: string | null
  /** Este papel impide arrancar el paquete. */
  bloquea: boolean
}

export interface RevisionDocumental {
  filas: FilaDocumental[]
  /** Los motivos por los que el paquete NO puede iniciar. Vacío = puede. */
  bloqueos: string[]
  avisos: string[]
}

const ROTULO: Record<TipoDocumento, string> = {
  contrato: 'Contrato firmado',
  art: 'ART',
  seguro_rc: 'Seguro de responsabilidad',
  alta_personal: 'Alta de personal',
  otro: 'Otro',
}

/** Los tres que la pantalla exige siempre. `alta_personal` y `otro` se muestran si existen. */
const EXIGIDOS: TipoDocumento[] = ['contrato', 'art', 'seguro_rc']

/** Días antes del vencimiento en que un papel deja de estar verde. Una semana no alcanza para
 *  renovar una póliza; treinta días sí, y es el plazo con el que trabaja Administración. */
const DIAS_DE_AVISO = 30

const dias = (desdeISO: string, hastaISO: string) =>
  Math.round((Date.parse(hastaISO) - Date.parse(desdeISO)) / 86_400_000)

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * QUÉ PAPEL FALTA Y CUÁL VENCIÓ — y cuál de los dos frena el paquete.
 *
 * Sólo la ART bloquea el inicio. No es una jerarquía arbitraria: es la única que cubre a una
 * persona parada en la obra, y arrancar sin ella traslada a Echegaray un riesgo laboral de un
 * tercero. El contrato sin firmar y el seguro vencido son avisos fuertes —se cobran caro después—
 * pero no ponen a nadie en riesgo el primer día.
 */
export function revisarDocumentacion(docs: DocumentoPaquete[], hoyISO: string): RevisionDocumental {
  const filas: FilaDocumental[] = []
  const tipos = [...EXIGIDOS, ...docs.map((d) => d.tipo).filter((t) => !EXIGIDOS.includes(t))]
  for (const tipo of [...new Set(tipos)]) {
    // El MÁS NUEVO de ese tipo manda: una ART renovada no borra la anterior, y mirar la vieja
    // publicaría un vencimiento que ya se resolvió.
    const delTipo = docs.filter((d) => d.tipo === tipo)
      .sort((a, b) => (b.vence_el ?? b.fecha_emision ?? '').localeCompare(a.vence_el ?? a.fecha_emision ?? ''))
    const doc = delTipo[0]
    if (!doc) {
      filas.push({ tipo, rotulo: ROTULO[tipo], estado: 'falta', detalle: 'sin cargar', bloquea: tipo === 'art' })
      continue
    }
    const vence = doc.vence_el
    const restan = vence ? dias(hoyISO, vence) : null
    const estado: EstadoDocumento = restan == null ? 'ok'
      : restan < 0 ? 'vencido'
        : restan <= DIAS_DE_AVISO ? 'por_vencer' : 'ok'
    const detalle = estado === 'vencido' ? `vencida el ${ddmm(vence!)}`
      : estado === 'por_vencer' ? `vence ${ddmm(vence!)}`
        : doc.fecha_emision ? ddmm(doc.fecha_emision) : (doc.descripcion ?? 'cargado')
    filas.push({
      tipo, rotulo: ROTULO[tipo], estado, detalle,
      bloquea: tipo === 'art' && estado === 'vencido',
    })
  }

  const bloqueos = filas.filter((f) => f.bloquea).map((f) => (
    f.estado === 'falta'
      ? `${f.rotulo} sin cargar`
      : `${f.rotulo} ${f.detalle}`
  ))
  const avisos = filas
    .filter((f) => !f.bloquea && (f.estado === 'falta' || f.estado === 'vencido' || f.estado === 'por_vencer'))
    .map((f) => `${f.rotulo}: ${f.detalle}`)
  return { filas, bloqueos, avisos }
}

export const puedeIniciar = (revision: RevisionDocumental) => revision.bloqueos.length === 0

export interface EstadoLegible {
  label: string
  tono: 'pos' | 'neg' | 'warn' | 'curso' | 'pendiente' | 'nulo'
  clave: string
}

const ESTADO_LABEL: Record<EstadoSubcontrato, EstadoLegible> = {
  previsto: { label: 'Pendiente', tono: 'pendiente', clave: 'previsto' },
  contratado: { label: 'Contratado', tono: 'pendiente', clave: 'contratado' },
  en_curso: { label: 'En curso', tono: 'curso', clave: 'en_curso' },
  terminado: { label: 'Hecha', tono: 'pos', clave: 'terminado' },
  anulado: { label: 'Anulado', tono: 'nulo', clave: 'anulado' },
}

/**
 * EL PAPEL QUE FALTA LE GANA AL ESTADO GUARDADO. Un paquete «en curso» sin ART está en curso de
 * hecho —hay gente trabajando— y eso es exactamente lo que hay que ver en la columna, no un punto
 * gris que dice que todo va bien. El estado guardado sigue abajo, en el panel.
 */
export function estadoDelPaquete(
  estado: EstadoSubcontrato, revision: RevisionDocumental,
): EstadoLegible {
  if (estado !== 'terminado' && estado !== 'anulado' && revision.bloqueos.length > 0) {
    return { label: revision.bloqueos[0], tono: 'neg', clave: 'bloqueado' }
  }
  return ESTADO_LABEL[estado] ?? { label: estado, tono: 'nulo', clave: estado }
}

// ═══ QUÉ CUENTA COMO «PARA RESOLVER» (Design canónico 23/08, pantalla 10) ═══
//
// La pantalla abre con un botón rojo que dice cuántos paquetes hay que destrabar, y ese número
// decide a cuál entra primero el jefe de obra. Vive acá y no en el componente por la misma razón
// que el resto: es una REGLA —qué es un problema y qué no—, y una regla escrita dentro de un `.tsx`
// no se puede ejercitar sin levantar un navegador.
//
// Son dos cosas y sólo dos:
//   · un papel que BLOQUEA el inicio (hoy, la ART) — es seguridad, hay gente de un tercero en obra;
//   · el paquete SIN actividad vinculada — sin ella no se puede medir ni comparar, que es para lo
//     único que existe un paquete. No es una molestia estética: es un paquete que no descuenta del
//     alcance propio y que va a aparecer dos veces en el costo de la obra.
//
// Un paquete SIN PRECIO no entra: cotizar es un trabajo pendiente de Administración, no algo que
// frene la obra, y mezclarlo acá diluiría el número que sí frena.
export const necesitaResolverse = (
  p: { revision: RevisionDocumental; vinculos: unknown[] },
): boolean => p.revision.bloqueos.length > 0 || p.vinculos.length === 0

export interface ResumenContratado {
  /** La suma de los que TIENEN precio. Nunca incluye un `null` tratado como cero. */
  total: number
  /** Cuántos quedaron afuera de esa suma. Si es > 0, el total es un piso, no el contratado. */
  sinPrecio: number
}

/**
 * EL TOTAL CONTRATADO NO SUMA LOS NULOS COMO CERO.
 *
 * Un paquete sin precio cargado no vale cero: vale lo que nadie escribió todavía. Sumarlo como cero
 * publica un contratado más chico que el real, con la misma cara de número cerrado — y nada en la
 * pantalla avisaría. Por eso el resumen devuelve también cuántos faltan: el total es un piso.
 */
export function resumenContratado(
  paquetes: { precio_contratado: number | null }[],
): ResumenContratado {
  const conPrecio = paquetes.filter((p) => p.precio_contratado != null)
  return {
    total: conPrecio.reduce((t, p) => t + Number(p.precio_contratado), 0),
    sinPrecio: paquetes.length - conPrecio.length,
  }
}

export interface VinculoActividad {
  actividad_id: string
  actividad: string
  seccion: string | null
  cantidad: number | null
  unidad: string | null
  ayuda_de_gremio: boolean
  cantidad_objetivo: number | null
  hh_plan: number | null
  dias_plan: number | null
  /** El avance de LA ACTIVIDAD, que no es el del paquete salvo que el paquete la cubra entera. */
  pct: number | null
}

export interface Avance {
  pct: number | null
  /** De dónde sale ese número. Sin esto, un 12% no se puede defender. */
  base: string
}

/**
 * EL AVANCE DEL PAQUETE NO SE INVENTA.
 *
 * `subcontrato` no tiene columna de avance, y está bien: medir dos veces la misma ejecución es cómo
 * se llega a dos porcentajes distintos del mismo trabajo. Se deduce, y sólo cuando se puede:
 *
 *   · terminado                                  → 100 %, el paquete está cerrado
 *   · cubre UNA actividad ENTERA                 → el avance de esa actividad ES el del paquete
 *   · cubre parte de una actividad, o varias     → no hay número, y se dice por qué
 *
 * El tercer caso es el que se solía resolver mostrando el avance de la actividad igual: sería el
 * avance del trabajo propio y del ajeno mezclados, presentado como el del subcontratista.
 */
export function avanceDelPaquete(estado: EstadoSubcontrato, vinculos: VinculoActividad[]): Avance {
  if (estado === 'terminado') return { pct: 100, base: 'paquete cerrado' }
  if (estado === 'anulado') return { pct: null, base: 'paquete anulado' }
  if (vinculos.length !== 1) {
    return {
      pct: null,
      base: vinculos.length === 0
        ? 'sin actividad vinculada'
        : 'cubre varias actividades: no hay una medición del paquete',
    }
  }
  const v = vinculos[0]
  const cubreEntera = v.cantidad == null || v.cantidad_objetivo == null
    ? false
    : Math.abs(Number(v.cantidad) - Number(v.cantidad_objetivo)) < 1e-9
  if (!cubreEntera) {
    return { pct: null, base: 'cubre parte de la actividad: su avance no es el del paquete' }
  }
  return { pct: v.pct == null ? null : Number(v.pct), base: `avance de ${v.actividad}` }
}

export interface Plazo { texto: string; dias: number | null }

/** El plazo del paquete: los días de plan mientras vive, «cerrado» cuando terminó de verdad. */
export function plazoDelPaquete(
  p: { fecha_inicio_plan: string | null; fecha_fin_plan: string | null; fecha_fin_real: string | null },
  hoyISO: string,
): Plazo {
  if (p.fecha_fin_real) return { texto: 'cerrado', dias: null }
  if (p.fecha_inicio_plan && p.fecha_fin_plan) {
    const d = dias(p.fecha_inicio_plan, p.fecha_fin_plan) + 1
    return { texto: `${d} d`, dias: d }
  }
  if (p.fecha_fin_plan) {
    const d = dias(hoyISO, p.fecha_fin_plan)
    return d < 0 ? { texto: `vencido hace ${-d} d`, dias: d } : { texto: `${d} d restantes`, dias: d }
  }
  return { texto: 'sin plazo', dias: null }
}

export type FormatoCelda = 'plata' | 'hh' | 'dias' | 'cantidad' | 'personas' | 'texto'
export interface Celda { valor: number | null; texto: string | null }
export interface FilaComparacion {
  clave: string
  formato: FormatoCelda
  unidad: string | null
  propio: Celda
  subcontrato: Celda
  diferencia: Celda
  /** Qué falta para que esta fila se pueda comparar. Una celda vacía sin esto se lee como un cero. */
  falta: string | null
  fuerte?: boolean
}

export interface InsumosComparacion {
  paquete: {
    cantidad: number | null
    unidad: string | null
    precio_contratado: number | null
    aportes: number | null
    costo_real: number | null
    hh_apoyo: number
    personas_externas: number
    fecha_inicio_plan: string | null
    fecha_fin_plan: string | null
  }
  /** La actividad que el paquete cubre. Sin ella no hay contra qué comparar y se dice. */
  actividad: VinculoActividad | null
}

const nada: Celda = { valor: null, texto: null }
const sinPermiso: Celda = { valor: null, texto: 'sin permiso' }

/**
 * PROPIO VS SUBCONTRATO — antes de firmar.
 *
 * Cada fila dice de dónde sale cada lado o declara qué le falta. Lo que NO hace es completar el
 * lado propio con un costo estimado: el análisis de costo de la actividad todavía no existe en el
 * modelo, y un costo propio inventado convertiría toda esta pantalla en una recomendación con
 * números falsos. La fila queda vacía CON su motivo, que es información; un número inventado no.
 */
export function armarComparacion(insumos: InsumosComparacion, economia: boolean): FilaComparacion[] {
  const { paquete: p, actividad: a } = insumos
  const propiaCantidad = a?.cantidad_objetivo != null && p.cantidad != null
    ? Number(a.cantidad_objetivo) - Number(p.cantidad)
    : null

  const diasPaquete = p.fecha_inicio_plan && p.fecha_fin_plan
    ? dias(p.fecha_inicio_plan, p.fecha_fin_plan) + 1
    : null
  const diasPropios = a?.dias_plan == null ? null : Number(a.dias_plan)

  const hhPropias = a?.hh_plan == null ? null : Number(a.hh_plan)

  return [
    {
      clave: 'Alcance',
      formato: 'cantidad',
      unidad: a?.unidad ?? p.unidad ?? null,
      propio: { valor: propiaCantidad, texto: null },
      subcontrato: { valor: p.cantidad == null ? null : Number(p.cantidad), texto: null },
      diferencia: nada,
      falta: a ? null : 'el paquete no está vinculado a ninguna actividad',
    },
    {
      clave: 'Costo directo',
      formato: 'plata',
      unidad: null,
      // El lado propio NO se estima. Ver el comentario de arriba.
      propio: economia ? { valor: null, texto: null } : sinPermiso,
      // COSTO REAL, no precio contratado: contratado + lo que Echegaray le pone.
      subcontrato: economia ? { valor: p.costo_real, texto: null } : sinPermiso,
      diferencia: economia ? nada : sinPermiso,
      falta: economia
        ? 'el costo de hacerlo con gente propia necesita el análisis de costo de la actividad, que todavía no existe'
        : null,
    },
    {
      clave: 'HH propias',
      formato: 'hh',
      unidad: null,
      propio: { valor: hhPropias, texto: null },
      // Las únicas horas nuestras que consume el paquete son la ayuda de gremio declarada.
      subcontrato: { valor: p.hh_apoyo, texto: null },
      diferencia: hhPropias == null ? nada : { valor: p.hh_apoyo - hhPropias, texto: null },
      falta: hhPropias == null ? 'la actividad no tiene HH de plan cargadas' : null,
    },
    {
      clave: 'Duración',
      formato: 'dias',
      unidad: null,
      propio: { valor: diasPropios, texto: null },
      subcontrato: { valor: diasPaquete, texto: null },
      diferencia: diasPropios == null || diasPaquete == null ? nada
        : { valor: diasPaquete - diasPropios, texto: null },
      falta: diasPropios == null ? 'la actividad no tiene días de plan'
        : diasPaquete == null ? 'el paquete no tiene fechas de plan' : null,
    },
    {
      clave: 'Personal en obra',
      formato: 'personas',
      unidad: null,
      // NO se cuenta gente propia acá: la dotación se asigna por cuadrilla, no por actividad, y
      // repartirla entre actividades para llenar esta celda sería un número inventado.
      propio: { valor: null, texto: null },
      subcontrato: { valor: p.personas_externas, texto: null },
      diferencia: nada,
      falta: 'el personal del subcontratista no entra en la nómina ni en la capacidad de obra',
      fuerte: true,
    },
  ]
}

// ═══ LA MIGRACIÓN EN EL REPOSITORIO NO ES LA MIGRACIÓN APLICADA ═══
//
// La pantalla lee objetos que llegan en `20260821T5000` y que el coordinador aplica aparte. Hasta
// que eso pase, PostgREST contesta «no existe» — y ese mensaje, dibujado crudo, se lee como si el
// paquete no tuviera papeles. Son dos hechos distintos y el segundo es el peligroso: un paquete sin
// ART se vería igual que uno cuyos papeles el sistema todavía no sabe leer.

const SENALES_DE_FALTANTE = [
  'does not exist',
  'schema cache',
  'could not find the table',
  'could not find the function',
]

export const faltaEnLaBase = (mensaje: string | null | undefined): boolean =>
  !!mensaje && SENALES_DE_FALTANTE.some((s) => mensaje.toLowerCase().includes(s))

export const mensajeDeObjetoFaltante = (que: string, mensaje: string): string =>
  `${que} todavía no existe en la base: la migración 20260821T5000 está en el repositorio pero no `
  + `aplicada, así que esto NO significa que falten los datos. (${mensaje})`
