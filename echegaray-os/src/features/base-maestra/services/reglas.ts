// LAS REGLAS DE LA BASE MAESTRA — puras, sin Supabase y sin React.
//
// Todo lo que estas dos pantallas DECIDEN vive acá: qué estado tiene un análisis, si un precio
// todavía sirve para cotizar, cómo se empareja la escala del convenio con la categoría de obra y
// cuánto sale de verdad una hora de trabajo. Los servicios leen, los componentes pintan, y ninguno
// de los dos decide.
//
// El motivo no es de orden: es que estas reglas se prueban sin base y sin navegador
// (`reglas.test.ts`), y una regla que sólo se puede probar levantando la pantalla entera no se
// prueba nunca. `analisis_costo`, `analisis_incompleto`, `recurso_costo` y `rendimiento_recomendado`
// ya calculan en Postgres —acá NO se recalcula ninguno de esos números—; lo que falta y vive acá es
// la LECTURA de esos números: convertirlos en la palabra que la pantalla muestra.

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · EL ESTADO DEL ANÁLISIS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `analisis_incompleto` es la DEUDA DE CARGA: sólo trae las tareas a las que les falta algo. Una
// tarea que no aparece ahí puede estar en dos situaciones opuestas —análisis completo, o ningún
// análisis cargado— porque la vista nace de `analisis_costo`, que hace `join` con `analisis` y por
// lo tanto no puede ver una tarea que nunca tuvo uno.
//
// Confundir esas dos es el defecto que esta función existe para impedir: una tarea sin análisis
// pintada como «Completo» entra a un presupuesto aportando 0 HH y 0 costo, y nadie se entera hasta
// que la obra se ejecuta.

export type EstadoAnalisis = 'completo' | 'sin_revisar' | 'sin_analisis'

export const ETIQUETA_ANALISIS: Record<EstadoAnalisis, string> = {
  completo: 'Completo',
  sin_revisar: 'Sin revisar',
  sin_analisis: 'Sin análisis',
}

/**
 * @param tieneAnalisisVigente si existe una fila de `analisis` con `vigente`
 * @param falta el `falta` de `analisis_incompleto`, o null si la tarea no figura en esa vista
 */
export function estadoDelAnalisis(
  tieneAnalisisVigente: boolean,
  falta: string | null | undefined,
): EstadoAnalisis {
  if (!tieneAnalisisVigente) return 'sin_analisis'
  // «sin análisis» como valor de `falta` significa análisis vigente con CERO líneas: existe la
  // versión pero está vacía. Para quien cotiza es lo mismo que no tenerlo.
  if (falta === 'sin análisis') return 'sin_analisis'
  if (falta) return 'sin_revisar'
  return 'completo'
}

/** El texto que explica POR QUÉ está sin revisar. `falta` ya viene redactado por la vista. */
export function motivoDelEstado(estado: EstadoAnalisis, falta: string | null | undefined): string | null {
  if (estado === 'sin_analisis') return 'Nadie cargó la composición: no aporta HH ni costo.'
  if (estado === 'sin_revisar') return falta ?? null
  return null
}

// ─── 1b · LA MISMA PREGUNTA, PARA QUIEN NO VE PRECIOS ──────────────────────────────────────────
//
// ═══ POR QUÉ ESTA FUNCIÓN EXISTE, QUE ES UNA DEUDA DEL MODELO ═══
//
// `analisis_incompleto` NO ES ESTABLE ANTE PERMISOS. Uno de sus cuatro criterios es
// `n_lineas_sin_precio > 0`, y ese número sale de `recurso_precio`, que la RLS le esconde al jefe de
// obra devolviéndole CERO FILAS —sin error—. Para él, entonces, TODAS las líneas figuran sin precio
// y las 223 tareas de la base saldrían marcadas «Sin revisar»: una deuda de carga inventada por el
// permiso, no por el dato.
//
// Peor: el `case` de la vista está ordenado, así que ese criterio TAPA al de «sin rendimiento», que
// sí es operativo y sí le importa al jefe de obra.
//
// La solución de fondo es partir la vista en dos —deuda operativa y deuda de precio— y vive en la
// base, no acá; queda declarada en el informe. Mientras tanto, esto reproduce los tres criterios
// que NO dependen del precio, en el mismo orden que la vista. Es una segunda definición y se
// escribe así, a la vista y probada, en vez de esconderse en un `if` adentro de una pantalla.

export type SenalesDelAnalisis = {
  n_lineas: number
  tiene_mano_obra: boolean
  tiene_cargas_sociales: boolean
  hs_unitarias: number | null
}

export function faltaOperativa(s: SenalesDelAnalisis): string | null {
  if (s.n_lineas === 0) return 'sin análisis'
  if (s.tiene_mano_obra && !s.tiene_cargas_sociales) return 'mano de obra sin carga social'
  if (s.hs_unitarias == null || s.hs_unitarias === 0) return 'sin rendimiento: no aporta HH'
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LA FRESCURA DE UN PRECIO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La migración del modelo lo dice con números: 82 recursos traían precio de 2017 y 58 no traían
// fecha, y se usaban al lado de precios de 2026 sin que nada lo dijera. Esta función es lo que lo
// dice.
//
// LOS CORTES SON 60 Y 180 DÍAS, y son cortos a propósito. En una economía con la inflación de la
// construcción argentina, un precio de hace seis meses no es «un poco viejo»: es otro precio. El
// corte de 60 días sigue al ciclo real de actualización de lista de los proveedores y al de la
// paritaria; el de 180 marca el punto donde cotizar con ese número ya es cotizar a pérdida.
//
// SIN FECHA NO ES VIEJO NI NUEVO. Es DESCONOCIDO, y por eso tiene su propio valor: un precio del
// que no sabemos cuándo se cargó no se puede defender ni descartar, y meterlo en «viejo» le
// inventaría una antigüedad que nadie midió.

export type Frescura = 'nueva' | 'ok' | 'vieja' | 'sin_fecha'

export const DIAS_FRESCO = 60
export const DIAS_ACEPTABLE = 180

/** Días enteros entre dos fechas ISO, contados en UTC para que no se corra por huso horario. */
export function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(desdeISO.slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(hastaISO.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN
  return Math.round((b - a) / 86_400_000)
}

export function frescuraDePrecio(fechaPrecio: string | null | undefined, hoyISO: string): Frescura {
  if (!fechaPrecio) return 'sin_fecha'
  const dias = diasEntre(fechaPrecio, hoyISO)
  if (Number.isNaN(dias)) return 'sin_fecha'
  // Una fecha en el futuro es un dato cargado mal, no un precio fresquísimo. Se trata como
  // desconocida: afirmar «nueva» sobre una fecha imposible es publicar el error como si fuera dato.
  if (dias < 0) return 'sin_fecha'
  if (dias <= DIAS_FRESCO) return 'nueva'
  if (dias <= DIAS_ACEPTABLE) return 'ok'
  return 'vieja'
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · LA CATEGORÍA DEL CONVENIO Y LA CATEGORÍA DE OBRA SON LA MISMA, ESCRITAS DISTINTO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `uocra_escala.categoria` dice «Oficial Especializado» y `categoria_obra.clave` dice
// `oficial_especializado`. Es el mismo puesto: la escala se cargó con la grafía del acuerdo
// paritario y la tabla de capacidad con la clave que ya usaba `personas.categoria`.
//
// Emparejarlas por igualdad de texto da CERO coincidencias y la pantalla mostraría cuatro
// categorías sin capacidad y sin personas, que se lee como «no hay nadie». Se normaliza: minúsculas,
// sin acentos, espacios a guión bajo.
//
// «Sereno (mensual)» NO tiene equivalente en `categoria_obra` y eso está bien: el sereno no entra en
// una cuadrilla de producción, así que no tiene capacidad ponderada. Devuelve una clave que no
// empareja con nada, y la pantalla escribe «—» — que es la verdad, no un cero.

export function claveDeCategoria(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · EL COSTO EMPRESA SE CALCULA, NO SE TIPEA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Está escrito literal en el subtítulo de la pantalla 18 y es la regla que la hace confiable: el
// número que decide una cotización sale del básico del convenio y de las cargas vigentes, las dos
// con fecha y con fuente. Un campo de entrada acá significaría que alguien puede escribir 6.957 y
// que nadie pueda reconstruir de dónde salió — que es exactamente el estado del que venimos.
//
// `uocra_escala.basico_hora` YA es por hora. El jornal diario es el básico por la jornada, no al
// revés: la jornada es un dato de la obra (`obra_canonica.jornada_horas`, default 8).
//
// NULL SE PROPAGA. El sereno se paga por mes y no tiene `basico_hora`: su valor hora no es cero, es
// inexistente. Un cero acá haría que un sereno costara $0 la hora en cualquier análisis que lo use.

export const JORNADA_HORAS = 8

export type CostoCategoria = {
  valorHora: number | null
  jornal: number | null
  cargasHora: number | null
  costoEmpresaHora: number | null
}

export function costoDeCategoria(
  basicoHora: number | null | undefined,
  cargasFraccion: number | null | undefined,
  jornadaHoras: number = JORNADA_HORAS,
): CostoCategoria {
  if (basicoHora == null || !Number.isFinite(basicoHora)) {
    return { valorHora: null, jornal: null, cargasHora: null, costoEmpresaHora: null }
  }
  const valorHora = basicoHora
  const jornal = valorHora * jornadaHoras
  // Sin cargas cargadas NO se asume 0%: se asume que no sabemos. Publicar el básico pelado como
  // «costo empresa» subcostea la hora en más de la mitad, que es el defecto que este modelo vino a
  // corregir (33 tareas del Excel tenían mano de obra y ninguna carga social).
  if (cargasFraccion == null || !Number.isFinite(cargasFraccion)) {
    return { valorHora, jornal, cargasHora: null, costoEmpresaHora: null }
  }
  const cargasHora = valorHora * cargasFraccion
  return { valorHora, jornal, cargasHora, costoEmpresaHora: valorHora + cargasHora }
}

/**
 * EL PLANTEL POR CATEGORÍA.
 *
 * Vive acá y no en el servicio por una razón práctica que vale la pena escribir: `node --test`
 * ejecuta TypeScript directamente y no resuelve importaciones sin extensión, así que una regla
 * metida en un módulo que importa el cliente de Supabase NO SE PUEDE PROBAR. Las reglas puras van
 * donde se pueden probar.
 *
 * Una persona sin categoría NO se reparte entre las demás ni cae en un default: quedaría gente
 * inventada en una cuadrilla, y de esa cuenta sale si un frente se puede dotar.
 */
export function contarPorCategoria(filas: { categoria?: unknown }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of filas) {
    const c = p.categoria == null ? null : String(p.categoria).trim()
    if (c) m.set(c, (m.get(c) ?? 0) + 1)
  }
  return m
}

/** La suma de las cargas vigentes, como fracción. Sin conceptos NO es 0%: es null. */
export function sumaDeCargas(filas: { porcentaje: number | null }[]): number | null {
  const validas = filas.map((f) => f.porcentaje).filter((p): p is number => p != null && Number.isFinite(p))
  if (!validas.length) return null
  return validas.reduce((a, b) => a + b, 0)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5 · LOS PESOS DE UNA PLANTILLA TIENEN QUE CERRAR EN 100
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Si no cierran, el avance por pasos miente: marcar todos los pasos daría 96% o 104%. La base no lo
// impide (`peso > 0` es todo el CHECK), así que la pantalla lo mide y lo dice.

export function sumaDePesos(pasos: { peso: number | null }[]): number {
  return pasos.reduce((a, p) => a + (p.peso ?? 0), 0)
}

/** Tolerancia de un centésimo: los pesos son `numeric` y 33,33 × 3 nunca da 100 exacto. */
export const pesosCierran = (pasos: { peso: number | null }[]) => Math.abs(sumaDePesos(pasos) - 100) < 0.01

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6 · BUSCAR MIENTRAS SE ESCRIBE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Sin acentos y sin distinguir mayúsculas: quien busca «hormigon» tiene que encontrar «Hormigón».
// Todos los términos tienen que aparecer, en cualquier campo y en cualquier orden — así «ha 140» y
// «140 ha» encuentran lo mismo.

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function coincide(campos: (string | null | undefined)[], consulta: string): boolean {
  const terminos = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (!terminos.length) return true
  const heno = normalizar(campos.filter(Boolean).join(' '))
  return terminos.every((t) => heno.includes(t))
}

export function filtrar<T>(filas: T[], consulta: string, campos: (f: T) => (string | null | undefined)[]): T[] {
  if (!consulta.trim()) return filas
  return filas.filter((f) => coincide(campos(f), consulta))
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 7 · FORMATO es-AR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Coma decimal, punto de miles, `35 %` con espacio, `$ 165.526.633` con espacio. NINGUNA de estas
// funciones convierte null en 0: devuelven null y quien pinta escribe la ausencia por su nombre
// (`<Valor>` / `<Nulo>` del design system). Un `?? 0` acá se vería idéntico a un dato real.

export function numero(n: number | null | undefined, decimales = 2): string | null {
  if (n == null || !Number.isFinite(n)) return null
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

export function pesos(n: number | null | undefined, decimales = 0): string | null {
  const v = numero(n, decimales)
  return v == null ? null : `$ ${v}`
}

export function porcentaje(fraccion: number | null | undefined, decimales = 2): string | null {
  if (fraccion == null || !Number.isFinite(fraccion)) return null
  return `${numero(fraccion * 100, decimales)} %`
}

/** `DD/MM/AA`. En UTC: una fecha `date` de Postgres no tiene hora y no debe correrse un día. */
export function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(t)) return null
  return new Date(t).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
  })
}

/** `DD/MM/AAAA`, para los rótulos de vigencia donde el siglo importa. */
export function fechaLarga(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(t)) return null
  return new Date(t).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  })
}
