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
// 5b · LA BASE CONTRA LO QUE PASÓ EN OBRA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Las dos puntas son ESFUERZO en hs/unidad, así que el cociente se lee al derecho: 1,32 significa
// que la obra necesitó un 32 % MÁS de mano de obra que lo que dice la base. Por eso `peor` es el
// cociente ALTO — al revés de lo que sugiere la palabra «rendimiento», que es el error que
// `vocabulario.ts` documenta.
//
// LA BANDA ES SIMÉTRICA DE 10 %, Y NO SALE DEL MOCKUP. El diseño canónico pinta 1,10 para lo
// adverso y 0,95 para lo favorable; esa asimetría haría que una tarea se declare «mejor» con la
// mitad de evidencia que necesita para declararse «peor», que es exactamente al revés de lo
// prudente. Debajo de 10 % la diferencia está dentro de la dispersión típica de estas muestras y
// llamarla desvío pondría un color en casi todas las filas — con lo cual el color deja de decir algo.
//
// ESTO NO DECIDE NADA. Es la LECTURA de dos números que ya existen: si la base tiene que cambiar lo
// decide `rendimiento_recomendado.hs_recomendado`, que es el motor de aprendizaje y no se toca. Un
// umbral de pantalla que habilitara la acción sería un control validado contra su propia salida.

export type DireccionDesvio = 'peor' | 'mejor' | 'igual'

export type Desvio = {
  /** observado ÷ base. > 1 = la obra pidió más horas que la base. */
  ratio: number
  direccion: DireccionDesvio
}

export const BANDA_DESVIO = 0.1

/** `null` cuando falta cualquiera de las dos puntas, o cuando la base es 0 (dividir daría infinito). */
export function desvioObservado(
  baseHsUnidad: number | null | undefined,
  observadoHsUnidad: number | null | undefined,
): Desvio | null {
  if (baseHsUnidad == null || !Number.isFinite(baseHsUnidad) || baseHsUnidad <= 0) return null
  if (observadoHsUnidad == null || !Number.isFinite(observadoHsUnidad)) return null
  const ratio = observadoHsUnidad / baseHsUnidad
  if (ratio > 1 + BANDA_DESVIO) return { ratio, direccion: 'peor' }
  if (ratio < 1 - BANDA_DESVIO) return { ratio, direccion: 'mejor' }
  return { ratio, direccion: 'igual' }
}

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 8 · DE QUÉ ESTÁ HECHA UNA TAREA — la columna COMPOSICIÓN del canónico 17
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El canónico dibuja hasta tres iconos por fila: cuadrilla, material, equipo. El dato sale de
// `analisis_linea` → `recurso.tipo`, que NO depende de `recurso_precio` y por lo tanto vale igual
// para un jefe de obra que para Dirección. El atajo por `analisis_costo.costo_materiales` sería una
// trampa: esos importes salen del precio, que la RLS le vacía al jefe, y él vería tareas sin
// materiales.
//
// `carga_social` NO tiene icono propio y no es un olvido: acompaña siempre a la mano de obra —esa
// es la regla que `analisis_incompleto` controla— así que un cuarto icono repetiría el primero.
// `otro` tampoco: es el cajón de sastre de la importación, no una familia de recursos.

export const TIPOS_COMPOSICION = ['mano_obra', 'material', 'equipo'] as const
export type TipoComposicion = (typeof TIPOS_COMPOSICION)[number]

/** Los tipos presentes, únicos y SIEMPRE en el mismo orden: la fila no puede bailar entre tareas. */
export function tiposDeComposicion(tipos: readonly string[]): TipoComposicion[] {
  const presentes = new Set(tipos)
  return TIPOS_COMPOSICION.filter((t) => presentes.has(t))
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 9 · LA VARIACIÓN DE UN PRECIO SE MIDE CONTRA UNA VENTANA, NO CONTRA UN MES ELEGIDO A DEDO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El canónico 18 escribe «+38 % · vs febrero» sobre datos de ejemplo. Acá no hay ningún febrero
// garantizado: un recurso puede tener dos precios de agosto y ninguno antes. Por eso lo que se
// compara es el precio VIGENTE contra el último precio que ya estaba en vigor `meses` atrás, y
// cuando ese precio no existe la respuesta es «sin base» — nunca 0 %, que afirmaría que el precio
// no se movió en seis meses.

/** `AAAA-MM-DD` de `meses` antes, sin desbordar de mes: 31/08 − 6 meses es 28/02, no 03/03. */
export function restarMeses(hoyISO: string, meses: number): string {
  const base = new Date(hoyISO.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(base.getTime())) return hoyISO.slice(0, 10)
  const dia = base.getUTCDate()
  const destino = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - meses, 1))
  const ultimoDelMes = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate()
  destino.setUTCDate(Math.min(dia, ultimoDelMes))
  return destino.toISOString().slice(0, 10)
}

export type PrecioEnElTiempo = { costo: number | null; fecha_precio: string | null }

/**
 * @param historial del MÁS NUEVO al más viejo, como lo devuelve `getHistorial`
 * @returns la fracción de variación y desde qué fecha se mide, o `null` si no hay contra qué
 */
export function variacionEnMeses(
  historial: readonly PrecioEnElTiempo[],
  meses: number,
  hoyISO: string,
): { fraccion: number; desde: string } | null {
  const actual = historial.find((p) => p.costo != null && Number.isFinite(p.costo))
  if (!actual?.costo) return null
  const corte = restarMeses(hoyISO, meses)
  const anterior = historial.find(
    (p) => p !== actual && p.fecha_precio != null && p.fecha_precio.slice(0, 10) <= corte
      && p.costo != null && Number.isFinite(p.costo) && p.costo > 0,
  )
  if (!anterior?.costo || !anterior.fecha_precio) return null
  return { fraccion: actual.costo / anterior.costo - 1, desde: anterior.fecha_precio }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 10 · RENDIMIENTO POR OBRA — el gráfico de barras del canónico 17
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `rendimiento_historico` guarda un registro por actividad terminada, con su obra y su hs/unidad ya
// limpio de horas improductivas. Una obra puede tener varios: la barra muestra su MEDIANA, no el
// promedio, por la misma razón que `rendimiento_recomendado` — un registro con la cantidad mal
// cargada corre el promedio de toda la obra y no corre la mediana.
//
// EL ANCHO ES RELATIVO A LA PEOR, no a la base. Es lo que hace el canónico (1,32× ocupa el 100 % y
// 0,96× el 73 %) y es lo correcto: una barra proporcional a la base dejaría todas las obras casi
// iguales, porque la diferencia entre ellas son décimas.

export function mediana(valores: readonly number[]): number | null {
  const v = valores.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export type RegistroDeObra = { obra_id: string | null; obra_nombre: string; hs_unitarias: number | null }

export type RendimientoDeObra = {
  obra_id: string | null
  obra_nombre: string
  /** La mediana de los registros de esa obra. */
  hs_unitarias: number
  muestra: number
  /** Contra el esfuerzo base. `null` cuando la tarea no tiene análisis con el que comparar. */
  ratio: number | null
  direccion: DireccionDesvio | null
  /** 0–100. Relativo a la obra que más horas pidió, nunca a la base. */
  ancho: number
}

export function rendimientoPorObra(
  registros: readonly RegistroDeObra[],
  baseHsUnidad: number | null | undefined,
): RendimientoDeObra[] {
  type Grupo = { nombre: string; obra_id: string | null; valores: number[] }
  const porObra = new Map<string, Grupo>()
  for (const r of registros) {
    if (r.hs_unitarias == null || !Number.isFinite(r.hs_unitarias)) continue
    const clave = r.obra_id ?? r.obra_nombre
    const g: Grupo = porObra.get(clave) ?? { nombre: r.obra_nombre, obra_id: r.obra_id, valores: [] }
    g.valores.push(r.hs_unitarias)
    porObra.set(clave, g)
  }

  const filas: { g: Grupo; m: number }[] = []
  for (const g of porObra.values()) {
    const m = mediana(g.valores)
    if (m != null) filas.push({ g, m })
  }
  filas.sort((a, b) => b.m - a.m)
  const peor = filas.length ? filas[0].m : 0

  return filas.map(({ g, m }) => {
    const d = desvioObservado(baseHsUnidad, m)
    return {
      obra_id: g.obra_id,
      obra_nombre: g.nombre,
      hs_unitarias: m,
      muestra: g.valores.length,
      ratio: d?.ratio ?? null,
      direccion: d?.direccion ?? null,
      // Con una sola obra la barra va llena: es el 100 % de lo que hay para comparar, no un desvío.
      ancho: peor > 0 ? Math.round((m / peor) * 100) : 0,
    }
  })
}
