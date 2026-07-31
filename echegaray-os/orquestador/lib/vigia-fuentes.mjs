// EL VIGÍA DE FUENTES — QUE EL FLUJO DE FONDOS SE DÉ CUENTA SOLO DE LO QUE LO AFECTA.
//
// ═══ POR QUÉ EXISTE (31/07) ═══
//
// El dueño: "necesito que todo el sheet flujo de caja sea un documento vivo, que si hay cuestiones
// nuevas a considerar se dé cuenta por sí solo… necesito más autonomía, sino es un sheet que yo sigo
// actualizando por mi cuenta y no me ayuda a mí a gestionar".
//
// El OS ya tenía los dos extremos y le faltaba el del medio:
//   · RECONSTRUIR el Sheet          → los generadores de pestañas (cash-flow-rehacer, caja-pestana…)
//   · saber si una fuente ESTÁ VIEJA → fuentes_datos + recalcular_frescura_fuentes()  (23/07)
//   · ✗ DARSE CUENTA DE QUÉ CAMBIÓ  → esto
//
// La diferencia no es cosmética. La frescura dice "ARCA está al día, se sincronizó el 24/07". El vigía
// dice: "el espejo de ARCA llega hasta la Factura A 001-00000216 del 13/07, pero en Drive hay cuatro
// PDF emitidos después (217 al 220, el último del 30/07): el IVA débito del período y las cobranzas por
// venir están cortos en cuatro comprobantes". Lo primero es un estado; lo segundo es TRABAJO.
//
// ═══ LAS TRES REGLAS QUE GOBIERNAN ESTE ARCHIVO ═══
//
// 1. NO REIMPLEMENTA NINGUNA CARGA. Cada novedad enruta a un cargador que YA existe
//    (`cargar-comprobantes-compras.mjs`, `cargar-boletas-gremiales.mjs`, `importar-banco.mjs`,
//    `importar-cheques.mjs`, el sync de ARCA). El vigía detecta y señala; cargar es de otro.
//
// 2. NO INVENTA UN PASADO. La primera corrida sobre una fuente declara la LÍNEA DE BASE y no grita.
//    Sin esto, la primera vez escupiría 2.400 archivos "nuevos" y nadie volvería a mirarlo. Y por eso
//    tampoco re-litiga el histórico: el cruce contra ARCA sólo juzga lo que está POR ENCIMA del techo
//    de cobertura del espejo (hay 178 PDF de 2023-2024 sin correlato: eso no es la novedad de hoy).
//
// 3. NO ESCONDE UNA FUENTE QUE NO PUEDE VER. Si falta la credencial de Google, si no hay API, si el
//    índice de Drive tiene 40 horas: la novedad correcta es 'ciega' con el motivo. Un vigía que se
//    calla lo que no pudo mirar entrena a ignorarlo — el mismo defecto de la alerta de frescura que no
//    se podía apagar.
//
// Todo lo de este archivo es NÚCLEO PURO: recibe datos ya leídos y devuelve novedades. No abre la
// base, no llama a Google, no toca el Sheet. El runner (scripts/vigia-fuentes.mjs) hace la E/S.

/** Clasificaciones posibles. 'ciega' no es una falla escondida: es información. */
export const CLASIFICACIONES = ['aplicable_solo', 'requiere_dueno', 'ciega']

/**
 * CUIT de Echegaray Construcciones SAS. Vive acá porque el cruce de comprobantes emitidos lo necesita
 * para saber QUÉ archivos cubre el libro E del espejo de ARCA: en `administracion/FACTURAS A` hay
 * también PDF de otro CUIT (20355074170, facturación anterior a la SAS) que ese libro no cubre y que
 * por lo tanto NO se pueden juzgar contra él.
 */
export const CUIT_PROPIO = '30716304643'

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EL REGISTRO DE FUENTES VIGILADAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `que_decide` no es documentación decorativa: es el filtro de entrada. Si nadie puede escribir qué
// pestaña o línea del Flujo depende de una fuente, esa fuente no se vigila (sería una alerta sin
// decisión asociada — la regla de oro nº 10 del CLAUDE.md).
//
// `nivel` es el TECHO de autonomía de las novedades de esa fuente, no la clasificación final: una
// novedad puede bajar de 'aplicable_solo' a 'requiere_dueno' por su contenido, nunca subir.

export const FUENTES = [
  {
    // LA PRIMERA FUENTE ES EL OS MISMO. Si el timer que mantiene una pestaña está muerto, esa pestaña
    // miente sin dar error — y es lo que pasó con Proveedores del 27/07 al 31/07. Vigilar los datos y
    // no vigilar lo que los trae deja el agujero exactamente donde nadie mira.
    clave: 'timers_del_flujo',
    tipo: 'capacidad_timer',
    nombre: 'Los timers que mantienen vivo el Flujo de Fondos',
    // Las unidades cuyo silencio se ve en el archivo. No se vigilan todas las del sistema: sólo las
    // que, si se detienen, dejan una pestaña del Flujo desactualizada sin avisar.
    unidades: [
      'echegaray-proveedores.timer',      // sección 1 de Proveedores: la deuda por proveedor
      'echegaray-compras-sync.timer',     // el espejo de Compras en la base
      'echegaray-cobranzas-sync.timer',   // el espejo de Cobranzas
      'echegaray-espejar-jornales.timer', // _JORNALES_RAW: el egreso más grande del Flujo
      'echegaray-drive-index.timer',      // el índice del data room, del que depende este mismo vigía
      'echegaray-espejos.timer',          // los espejos _RAW en general
      'echegaray-orq-health.timer',       // el chequeo de salud: si está muerto, nada avisa
      'echegaray-vigia-fuentes.timer',    // este vigía
    ],
    // LOS QUE ESTÁN PARADOS A PROPÓSITO NO SE VIGILAN. `echegaray-caja-sync.timer` está detenido porque
    // su sync daba una caja falsa (−$3,18M contra +$17,69M real), y los de autonomía
    // (`plan-ejecutar`, `os-schedules`) están congelados por decisión del dueño. Reportarlos cada 4
    // horas sería ruido permanente, y el ruido permanente es cómo una alerta deja de leerse.
    que_decide: 'Todo el Flujo: una pestaña cuyo refrescador está detenido muestra el pasado como si fuera hoy',
    cadencia_horas: 4,
    fuente_datos_nombre: 'systemd --user (estado de las unidades)',
    ruta_carga: 'Decisión del dueño: reactivar el timer que corresponda. Varios están parados a propósito.',
    nivel: 'requiere_dueno',
  },
  {
    clave: 'facturas_emitidas',
    tipo: 'drive_carpeta',
    nombre: 'Facturas emitidas (PDF en Drive)',
    // Los PDF se nombran con la identidad fiscal completa: CUIT_TIPO_PTOVENTA_NUMERO.pdf
    // (30716304643_001_00001_00000220.pdf = Factura A 0001-00000220 de ECSAS). Eso permite cruzarlos
    // contra el espejo de ARCA sin abrir el archivo.
    path_prefijo: 'administracion/FACTURAS A',
    que_decide: 'Cobranzas (lo facturado que hay que cobrar) e Impuestos (IVA débito fiscal del período)',
    cadencia_horas: 24 * 7,
    fuente_datos_nombre: 'FACTURAS A/B/C',
    cruce: 'arca_ventas',
    ruta_carga: 'sync de ARCA libro E (echegaray-arca-sync.timer) — el PDF es la evidencia, ARCA la fuente única',
    nivel: 'aplicable_solo',
  },
  {
    clave: 'fondo_de_cese',
    tipo: 'drive_carpeta',
    nombre: 'Formularios y pagos del Fondo de Cese Laboral (UOCRA)',
    path_prefijo: 'administracion/FONDO DE CESE/FORMULARIOS ENVIADOS',
    que_decide: 'Compras (fila proyectada de la obligación) y Cargas Sociales — el egreso mensual de Ley 22.250',
    cadencia_horas: 24 * 30,
    fuente_datos_nombre: 'FONDO DE CESE (UOCRA)',
    // Confirmar la proyección con el pago real es escribir en el Sheet del dueño y mueve caja: es de él.
    ruta_carga: 'orquestador/scripts/cargar-boletas-gremiales.mjs --json <boletas.json> (confirma la fila proyectada, no agrega una nueva)',
    nivel: 'requiere_dueno',
  },
  {
    clave: 'iva_ddjj',
    tipo: 'drive_carpeta',
    nombre: 'DDJJ de IVA presentadas (PDF del estudio)',
    // SIN EL AÑO en el prefijo: la carpeta real es "IVA 2026" y en enero va a nacer "IVA 2027". Un
    // prefijo con el año se fosiliza —el 1° de enero el vigía vigilaría una carpeta que ya no recibe
    // nada, sin decir una palabra— que es el mismo defecto de los rangos fijos del Sheet.
    path_prefijo: 'administracion/IVA ',
    que_decide: 'Impuestos — el IVA a pagar del período y su fecha de vencimiento',
    cadencia_horas: 24 * 30,
    fuente_datos_nombre: 'IVA 2026 (Libro IVA Ventas mensual)',
    ruta_carga: 'lectura del PDF + revisión de la posición de IVA (posicion-iva.mjs). El monto a pagar lo confirma el dueño.',
    nivel: 'requiere_dueno',
  },
  {
    clave: 'sheet_pyl',
    tipo: 'sheet_vinculado',
    nombre: 'Ingresos y Egresos - P&L',
    drive_file_id: '1-NAqlEuKoB0IqCY4res5OiJhbbz_7-F2M-zmpnkpMYg',
    que_decide: 'El puente devengado↔percibido: el resultado del P&L se contrasta contra la caja del Flujo',
    cadencia_horas: 24 * 30,
    fuente_datos_nombre: 'Ingresos y Egresos - P&L',
    ruta_carga: 'orquestador/lib/pyl.mjs (lectura). Reconciliar P&L vs. Flujo es criterio: es del dueño.',
    nivel: 'requiere_dueno',
  },
  {
    clave: 'sheet_jornales',
    tipo: 'sheet_vinculado',
    nombre: 'JORNALES (planilla de quincenas)',
    drive_file_id: '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk',
    que_decide: 'Jornales y CAJA — el egreso quincenal de mano de obra, la línea más grande del Flujo',
    cadencia_horas: 24 * 7,
    fuente_datos_nombre: 'JORNALES',
    ruta_carga: 'orquestador/scripts/espejar-jornales.mjs (refresca el espejo _JORNALES_RAW)',
    nivel: 'aplicable_solo',
  },
  {
    clave: 'sheet_avance_obra',
    tipo: 'sheet_vinculado',
    nombre: 'avance_obra.xlsx (Gantt real)',
    drive_file_id: '1XHiqSC1wiMVrXAob8H_koN5vHr9BQLLvXn61yIW18Ug',
    que_decide: 'Cobranzas — el avance físico es lo que se certifica y, después, lo que se cobra',
    cadencia_horas: 24 * 7,
    fuente_datos_nombre: 'avance_obra.xlsx (Gantt real)',
    ruta_carga: 'orquestador/scripts/sync-avance-obra.mjs',
    nivel: 'aplicable_solo',
  },
  {
    clave: 'sheet_control_gastos',
    tipo: 'sheet_vinculado',
    nombre: 'CONTROL DE GASTOS.xlsx',
    drive_file_id: '1v0Y8E0sN9WT_T9Uzvd9G5YsQzvcKjbiu',
    que_decide: 'Compras y CAJA — los gastos por obra que el Flujo tiene que reflejar',
    cadencia_horas: 24,
    fuente_datos_nombre: 'CONTROL DE GASTOS.xlsx',
    ruta_carga: 'cruce contra Compras (consistencia-compras.mjs). La imputación por obra es criterio.',
    nivel: 'requiere_dueno',
  },
  {
    clave: 'arca_compras',
    tipo: 'arca',
    nombre: 'ARCA — Libro IVA Compras (comprobantes recibidos)',
    tipo_libro: 'R',
    que_decide: 'Compras, Proveedores e Impuestos — el crédito fiscal y la deuda comercial con respaldo',
    cadencia_horas: 24 * 30,
    fuente_datos_nombre: 'Comprobantes ARCA — Compras (Libro IVA Compras)',
    ruta_carga: 'sync de ARCA (AfipSDK, tipo_libro=R). Bajar un período faltante es lectura: el OS puede.',
    nivel: 'aplicable_solo',
  },
  {
    clave: 'arca_ventas',
    tipo: 'arca',
    nombre: 'ARCA — Libro IVA Ventas (comprobantes emitidos)',
    tipo_libro: 'E',
    que_decide: 'Cobranzas e Impuestos — el débito fiscal del período y lo facturado por cobrar',
    cadencia_horas: 24 * 30,
    fuente_datos_nombre: 'IVA 2026 (Libro IVA Ventas mensual)',
    ruta_carga: 'sync de ARCA (AfipSDK, tipo_libro=E)',
    nivel: 'aplicable_solo',
  },
  {
    clave: 'uocra_cct',
    tipo: 'uocra_cct',
    nombre: 'Escala salarial CCT 76/75 UOCRA — Zona A (San Juan)',
    zona: 'A',
    que_decide: 'Jornales — el básico de convenio contra el que se compara lo que se paga. Pagar por debajo del convenio es deuda laboral, no ahorro.',
    // El acuerdo 19/5/2026 fija escalones MENSUALES: si el mes que viene no tiene escala cargada, el
    // cuadro de Jornales compara contra una escala vencida y nada lo avisa.
    cadencia_horas: 24 * 30,
    ruta_carga: 'orquestador/lib/uocra-escala.mjs + la réplica _UOCRA_RAW del Sheet. Cargar una escala nueva es laboral: la aprueba el dueño.',
    nivel: 'requiere_dueno',
  },
  {
    clave: 'banco',
    tipo: 'banco',
    nombre: 'Extracto bancario Santander',
    que_decide: 'CAJA (la disponibilidad real), Impuestos (impuesto al cheque y costos bancarios) y el cruce de Cheques',
    // Diaria: el dueño carga el extracto una o dos veces por día. Se tolera el fin de semana.
    cadencia_horas: 24,
    dias_tolerados: 4,
    fuente_datos_nombre: 'Extracto bancario Santander (movimientos)',
    ruta_carga: 'orquestador/scripts/importar-banco.mjs (CSV o pegado). No hay API de banca empresa: el dato entra a mano.',
    nivel: 'requiere_dueno',
  },
]

/** Una fuente por clave. Falla claro si la clave no existe (un typo no debe devolver undefined). */
export function fuente(clave) {
  const f = FUENTES.find((x) => x.clave === clave)
  if (!f) throw new Error(`fuente vigilada inexistente: ${clave}`)
  return f
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// UTILIDADES PURAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Fecha/hora a milisegundos. Tolera Date, ISO y null. Devuelve NaN si no se entiende. */
export function ms(v) {
  if (v == null) return NaN
  if (v instanceof Date) return v.getTime()
  return new Date(String(v)).getTime()
}

/** El máximo de una lista de fechas, como ISO. null si no hay ninguna válida. */
export function corteMaximo(fechas = []) {
  const nums = fechas.map(ms).filter((n) => Number.isFinite(n))
  if (!nums.length) return null
  return new Date(Math.max(...nums)).toISOString()
}

/** Horas entre dos instantes, con un decimal. */
export function horas(desde, hasta) {
  const a = ms(desde), b = ms(hasta)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round(((b - a) / 3600000) * 10) / 10
}

/** Días enteros entre dos instantes (piso). */
export function dias(desde, hasta) {
  const h = horas(desde, hasta)
  return h == null ? null : Math.floor(h / 24)
}

/**
 * LA HUELLA: identidad del HECHO, no del momento en que se lo vio.
 *
 * Deliberadamente NO incluye la fecha de detección. Si la incluyera, cada ronda del vigía insertaría
 * un duplicado de la misma factura sin bajar y en una semana la lista sería ruido — exactamente lo que
 * hizo inservible a la alerta de frescura antes del 23/07.
 */
export function huella(n) {
  const partes = [n.fuente, n.tipo, n.id_hecho].map((p) => String(p ?? '').trim().toLowerCase())
  if (!partes[0] || !partes[1] || !partes[2]) {
    throw new Error(`novedad sin identidad suficiente para deduplicar: ${JSON.stringify({ fuente: n.fuente, tipo: n.tipo, id_hecho: n.id_hecho })}`)
  }
  return partes.join('|')
}

/**
 * La clasificación FINAL de una novedad.
 *
 * El techo lo pone la fuente (`nivel`). Una novedad puede BAJAR a 'requiere_dueno' por su contenido
 * —nunca subir— y 'ciega' manda siempre: si no vi la fuente, no hay nada que aplicar solo.
 *
 * Nivel E del OS (efecto económico/fiscal/laboral/contractual externo) requiere autorización humana:
 * esta función es donde se hace cumplir, no una nota en un comentario.
 */
export function clasificar(f, { tipo, requiere_dueno = false } = {}) {
  if (tipo === 'ciega') return 'ciega'
  const techo = f.nivel === 'aplicable_solo' ? 'aplicable_solo' : 'requiere_dueno'
  if (requiere_dueno) return 'requiere_dueno'
  // Un silencio nunca se resuelve solo: alguien tiene que ir a buscar el dato que no llegó.
  if (tipo === 'silencio') return 'requiere_dueno'
  return techo
}

/** Arma una novedad completa (con huella y clasificación) desde su fuente y sus partes. */
export function novedad(f, partes) {
  const clasificacion = clasificar(f, partes)
  const base = {
    fuente: f.clave,
    tipo: partes.tipo,
    id_hecho: partes.id_hecho,
    titulo: partes.titulo,
    evidencia: partes.evidencia ?? {},
    accion: partes.accion,
    ruta_carga: partes.ruta_carga ?? f.ruta_carga ?? null,
    que_decide: f.que_decide,
    clasificacion,
  }
  return { ...base, huella: huella(base) }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// DETECTOR — DRIVE (carpetas clave)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * La identidad fiscal escondida en el nombre del PDF: CUIT_TIPO_PTOVENTA_NUMERO.pdf
 *   "30716304643_001_00001_00000220.pdf" → {cuit:'30716304643', tipo:1, puntoVenta:1, numero:220}
 *
 * Es el dato que permite cruzar un PDF contra el espejo de ARCA sin abrir el archivo. Devuelve null si
 * el nombre no sigue el patrón — y eso no es un error: en la carpeta hay también remitos y notas.
 */
export function numeroFiscal(nombre) {
  const m = String(nombre || '').match(/^(\d{11})_(\d{3})_(\d{4,5})_(\d{8})/)
  if (!m) return null
  return { cuit: m[1], tipo: Number(m[2]), puntoVenta: Number(m[3]), numero: Number(m[4]) }
}

/**
 * NÚCLEO PURO: qué archivos de una carpeta son NUEVOS o MODIFICADOS respecto de la última señal.
 *
 * `senal.corte_modified_time` es el techo de lo ya visto. Si viene vacío, es la PRIMERA corrida: se
 * devuelve la línea de base y CERO novedades (regla 2: no se inventa un pasado). `vistos` permite
 * distinguir "nuevo" de "modificado" cuando la señal los trae; si no los trae, todo lo posterior al
 * corte se reporta como nuevo, que es lo honesto.
 *
 * @param {Array<{drive_file_id:string,name:string,path?:string,modified_time:any,tipo?:string}>} archivos
 * @param {{corte_modified_time?:string, archivos_vistos?:string[]}} senal
 * @param {{maximo?:number}} opts  tope de novedades individuales (el resto se agrega en `extra`)
 */
export function cambiosEnCarpeta(archivos = [], senal = {}, { maximo = 10 } = {}) {
  const corte = ms(senal.corte_modified_time)
  const nuevoCorte = corteMaximo(archivos.map((a) => a.modified_time))
  const senalNueva = { corte_modified_time: nuevoCorte, archivos_vistos: archivos.length }
  if (!Number.isFinite(corte)) {
    return { linea_base: true, nuevas: [], modificadas: [], extra: 0, senal: senalNueva, total: archivos.length }
  }
  const vistos = new Set(senal.archivos_vistos_ids || [])
  const posteriores = archivos
    .filter((a) => Number.isFinite(ms(a.modified_time)) && ms(a.modified_time) > corte)
    .sort((x, y) => ms(y.modified_time) - ms(x.modified_time))
  const nuevas = [], modificadas = []
  for (const a of posteriores) (vistos.has(a.drive_file_id) ? modificadas : nuevas).push(a)
  const cortar = (xs) => xs.slice(0, maximo)
  const extra = Math.max(0, nuevas.length - maximo) + Math.max(0, modificadas.length - maximo)
  return {
    linea_base: false,
    nuevas: cortar(nuevas),
    modificadas: cortar(modificadas),
    extra,
    senal: senalNueva,
    total: archivos.length,
  }
}

/**
 * NÚCLEO PURO: el cruce que contesta "¿hay un comprobante que el OS no tiene?".
 *
 * LA DISCIPLINA QUE LO HACE ÚTIL: sólo juzga lo que está POR ENCIMA del techo de cobertura del espejo.
 * En `FACTURAS A` hay 194 PDF desde 2023 y el espejo de ARCA arranca en 2026-01: comparar todo contra
 * todo devolvería 178 "novedades" históricas y el vigía sería ruido desde el primer día. Un PDF con
 * número MENOR al techo y ausente del espejo es un hueco histórico —se cuenta y se informa agregado,
 * sin fabricar urgencia— y uno con número MAYOR es la novedad de verdad: se emitió y todavía no bajó.
 *
 * Y lo que no puede juzgar lo DICE: un PDF de otro CUIT, o de una serie (tipo, punto de venta) que el
 * espejo no cubre, no se declara faltante — se informa aparte con el motivo.
 *
 * @param {Array<{drive_file_id:string,name:string,modified_time:any}>} archivos
 * @param {Array<{tipo_comprobante:any, punto_venta:any, numero:any}>} enEspejo
 * @param {{cuitPropio?:string}} opts
 */
export function sinCorrelatoFiscal(archivos = [], enEspejo = [], { cuitPropio = CUIT_PROPIO } = {}) {
  const clave = (t, pv) => `${Number(t)}-${Number(pv)}`
  const presentes = new Set()
  const techos = new Map()
  for (const c of enEspejo) {
    const k = clave(c.tipo_comprobante, c.punto_venta)
    const n = Number(c.numero)
    presentes.add(`${k}|${n}`)
    if (!techos.has(k) || n > techos.get(k)) techos.set(k, n)
  }
  const pendientes = [], huecos = []
  let sin_patron = 0
  const no_juzgables = new Map() // motivo → cuántos
  const sumar = (m) => no_juzgables.set(m, (no_juzgables.get(m) || 0) + 1)

  for (const a of archivos) {
    const f = numeroFiscal(a.name)
    if (!f) { sin_patron++; continue }
    if (f.cuit !== cuitPropio) { sumar(`emisor CUIT ${f.cuit} — el libro del espejo es de ${cuitPropio}`); continue }
    const k = clave(f.tipo, f.puntoVenta)
    if (!techos.has(k)) { sumar(`serie tipo ${f.tipo} punto de venta ${f.puntoVenta} — el espejo no tiene ningún comprobante de esa serie, no hay techo contra el que comparar`); continue }
    if (presentes.has(`${k}|${f.numero}`)) continue
    const item = { ...a, fiscal: f, techo_espejo: techos.get(k) }
    if (f.numero > techos.get(k)) pendientes.push(item)
    else huecos.push(item)
  }
  pendientes.sort((x, y) => x.fiscal.numero - y.fiscal.numero)
  return {
    pendientes,
    huecos_historicos: huecos.length,
    sin_patron,
    no_juzgables: [...no_juzgables].map(([motivo, cuantos]) => ({ motivo, cuantos })),
    techos: Object.fromEntries(techos),
  }
}

/**
 * Las novedades de una fuente de tipo `drive_carpeta`. Junta los dos detectores: qué entró/cambió, y
 * (si la fuente declara un cruce) qué de eso el OS todavía no tiene.
 */
export function novedadesDrive(f, { archivos = [], enEspejo = null, senal = {}, indice = {} } = {}) {
  const out = []
  const c = cambiosEnCarpeta(archivos, senal)
  const etiqueta = (a) => `${a.name}${a.modified_time ? ` (${String(new Date(ms(a.modified_time)).toISOString()).slice(0, 10)})` : ''}`

  for (const a of c.nuevas) {
    out.push(novedad(f, {
      tipo: 'archivo_nuevo',
      id_hecho: a.drive_file_id,
      titulo: `Archivo nuevo en ${f.nombre}: ${etiqueta(a)}`,
      evidencia: { drive_file_id: a.drive_file_id, nombre: a.name, path: a.path, modified_time: a.modified_time, indice_leido_en: indice.indexed_at ?? null },
      accion: `Traerlo por su camino normal. ${f.ruta_carga}`,
    }))
  }
  for (const a of c.modificadas) {
    out.push(novedad(f, {
      tipo: 'archivo_modificado',
      id_hecho: `${a.drive_file_id}@${a.modified_time}`,
      titulo: `Archivo modificado en ${f.nombre}: ${etiqueta(a)}`,
      evidencia: { drive_file_id: a.drive_file_id, nombre: a.name, modified_time: a.modified_time },
      accion: `Re-leerlo: lo que el OS cargó de este archivo puede haber cambiado. ${f.ruta_carga}`,
      // Un archivo que CAMBIA después de haber sido cargado puede haber cambiado un importe ya
      // registrado. Eso no se re-aplica solo.
      requiere_dueno: true,
    }))
  }

  if (enEspejo) {
    const x = sinCorrelatoFiscal(archivos, enEspejo)
    for (const p of x.pendientes) {
      out.push(novedad(f, {
        tipo: 'sin_correlato',
        id_hecho: `fiscal:${p.fiscal.tipo}-${p.fiscal.puntoVenta}-${p.fiscal.numero}`,
        titulo: `Comprobante emitido que el OS todavía no tiene: tipo ${p.fiscal.tipo} ` +
          `${String(p.fiscal.puntoVenta).padStart(4, '0')}-${String(p.fiscal.numero).padStart(8, '0')} ` +
          `(el espejo llega hasta ${p.techo_espejo})`,
        evidencia: {
          drive_file_id: p.drive_file_id, nombre: p.name, modified_time: p.modified_time,
          fiscal: p.fiscal, techo_espejo: p.techo_espejo, cruce: f.cruce,
        },
        accion: `Bajar el período de ARCA que lo contiene. ${f.ruta_carga}`,
      }))
    }
    // Los huecos históricos y lo no juzgable NO se convierten en novedades una por una: se informan
    // agregados, en el resumen del runner. Se devuelven acá para que el runner los pueda mostrar.
    out.contexto_cruce = x
  }
  out.senal = c.senal
  out.linea_base = c.linea_base
  out.extra = c.extra
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// DETECTOR — SHEETS VINCULADOS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: ¿cambió un Sheet del que el Flujo depende?
 *
 * Dos señales, en orden de fuerza:
 *   · `modified_time`  → alguien lo tocó. Barato (una llamada de metadatos) pero grueso: un cambio de
 *                        color también lo mueve.
 *   · `celdas`         → el VALOR del que el Flujo depende cambió. Es la señal que importa, y por eso
 *                        se reporta con el antes y el después.
 *
 * Primera corrida (sin señal previa) ⇒ línea de base, cero novedades.
 */
export function novedadesSheetVinculado(f, { meta = null, celdas = null, senal = {} } = {}) {
  const out = []
  const senalNueva = {}
  if (meta?.modifiedTime) senalNueva.modified_time = meta.modifiedTime
  if (celdas) senalNueva.celdas = celdas

  const primeraVez = !senal.modified_time && !senal.celdas
  if (primeraVez) { out.senal = senalNueva; out.linea_base = true; return out }

  const cambiadas = []
  for (const [rango, valor] of Object.entries(celdas || {})) {
    const antes = senal.celdas?.[rango]
    if (antes !== undefined && String(antes) !== String(valor)) cambiadas.push({ rango, antes, ahora: valor })
  }
  for (const c of cambiadas) {
    out.push(novedad(f, {
      tipo: 'valor_cambiado',
      id_hecho: `${c.rango}:${c.antes}→${c.ahora}`,
      titulo: `Cambió un valor del que depende el Flujo — ${f.nombre} ${c.rango}: ${c.antes} → ${c.ahora}`,
      evidencia: { rango: c.rango, antes: c.antes, ahora: c.ahora, drive_file_id: f.drive_file_id },
      accion: `Revisar la línea del Flujo que consume este valor. ${f.ruta_carga}`,
      requiere_dueno: true,
    }))
  }
  // Sólo se reporta el modifiedTime si NO hubo cambio de valor detectable: si el valor cambió, esa es
  // la novedad concreta y el "alguien lo tocó" es redundante.
  if (!cambiadas.length && meta?.modifiedTime && senal.modified_time &&
      ms(meta.modifiedTime) > ms(senal.modified_time)) {
    out.push(novedad(f, {
      tipo: 'sheet_modificado',
      id_hecho: `mtime:${meta.modifiedTime}`,
      titulo: `${f.nombre} fue modificado (${String(meta.modifiedTime).slice(0, 16).replace('T', ' ')}) — antes ${String(senal.modified_time).slice(0, 16).replace('T', ' ')}`,
      evidencia: { drive_file_id: f.drive_file_id, modified_time: meta.modifiedTime, anterior: senal.modified_time },
      accion: `Re-leer la fuente y verificar si movió alguna línea del Flujo. ${f.ruta_carga}`,
    }))
  }
  out.senal = senalNueva
  out.linea_base = false
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// DETECTOR — ARCA (cobertura)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: la cobertura de ARCA avanzó, o se quedó corta.
 *
 * Dos hechos distintos y los dos importan (la lección de la migración de frescura del 23/07: SINCRONIZAR
 * NO ES ESTAR AL DÍA):
 *   · avanzó   → hay un período nuevo en el espejo que el OS todavía no consumió aguas abajo.
 *   · atrasada → el último período del espejo es anterior al mes que ya debería estar cerrado.
 *
 * `mesesDeGracia` existe porque un libro de IVA no está disponible el día 1: el mes se cierra y el
 * libro aparece después. 1 mes de gracia = "a fin de julio espero tener junio".
 */
export function novedadesArca(f, { periodoMaximo = null, comprobantes = 0, senal = {}, ahora = new Date(), mesesDeGracia = 1 } = {}) {
  const out = []
  const senalNueva = { periodo_maximo: periodoMaximo, comprobantes }
  if (!periodoMaximo) {
    out.push(novedad(f, {
      tipo: 'ciega',
      id_hecho: 'sin_datos',
      titulo: `${f.nombre}: el espejo está vacío — no hay ningún comprobante cargado`,
      evidencia: { tipo_libro: f.tipo_libro },
      accion: 'Correr el sync de ARCA. Si falla, informar el motivo (credencial fiscal / API).',
    }))
    out.senal = senalNueva
    return out
  }
  const primeraVez = !senal.periodo_maximo
  if (!primeraVez && periodoMaximo > senal.periodo_maximo) {
    out.push(novedad(f, {
      tipo: 'cobertura_atrasada',
      id_hecho: `avance:${periodoMaximo}`,
      titulo: `${f.nombre}: el espejo avanzó a ${periodoMaximo} (antes ${senal.periodo_maximo}) — hay un período nuevo para consumir`,
      evidencia: { periodo_maximo: periodoMaximo, anterior: senal.periodo_maximo, comprobantes },
      accion: `Recalcular la posición de IVA y las líneas que dependen del período. ${f.ruta_carga}`,
    }))
  }
  // El período que ya debería estar en el espejo: mes actual − gracia.
  const d = ahora instanceof Date ? ahora : new Date(ahora)
  const esperado = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - mesesDeGracia, 1))
  const esperadoTxt = `${esperado.getUTCFullYear()}-${String(esperado.getUTCMonth() + 1).padStart(2, '0')}`
  if (periodoMaximo < esperadoTxt) {
    out.push(novedad(f, {
      tipo: 'cobertura_atrasada',
      id_hecho: `falta:${esperadoTxt}`,
      titulo: `${f.nombre}: el espejo llega hasta ${periodoMaximo} y a esta altura debería llegar hasta ${esperadoTxt}`,
      evidencia: { periodo_maximo: periodoMaximo, periodo_esperado: esperadoTxt, meses_de_gracia: mesesDeGracia, comprobantes },
      accion: `Bajar de ARCA los períodos faltantes (${periodoMaximo} → ${esperadoTxt}). ${f.ruta_carga}`,
    }))
  }
  out.senal = senalNueva
  out.linea_base = primeraVez
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// DETECTOR — UOCRA / CCT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: la escala del convenio que el OS tiene guardada, ¿sigue siendo la vigente?
 *
 * DOS COSAS DISTINTAS, Y LA SEGUNDA ES LA HONESTA:
 *
 *  1. Si se le pasa una `referencia` (la escala publicada, traída de una fuente externa), compara
 *     valor por valor y reporta las diferencias. Eso es un HECHO contra un HECHO.
 *
 *  2. Si NO hay referencia —que es el caso hoy: el OS no tiene una fuente automática de la escala
 *     oficial— NO se inventa una comparación. Lo que sí se puede afirmar es que la escala guardada
 *     VENCIÓ: el acuerdo 19/5/2026 fija escalones mensuales, así que si el mes en curso (o el que
 *     viene) no tiene escala cargada, el cuadro de Jornales está comparando contra una escala vieja y
 *     nada lo avisa. Un jornal por debajo del convenio es deuda laboral, no ahorro.
 *
 * @param {Array<{vigencia_desde:any, categoria:string, basico_hora:any, zona?:string}>} guardada
 * @param {{vigencia_desde?:any, basicos?:Record<string,number>, fuente?:string}|null} referencia
 */
// NO recibe la señal previa a propósito: el vencimiento de la escala se decide contra el CALENDARIO,
// no contra "qué vi la última vez". Una escala vencida sigue vencida en la ronda siguiente, y el dedupe
// por huella ya evita que se registre dos veces.
export function novedadesCct(f, { guardada = [], referencia = null, ahora = new Date() } = {}) {
  const out = []
  const dela = guardada.filter((r) => !r.zona || r.zona === (f.zona || 'A'))
  if (!dela.length) {
    out.push(novedad(f, {
      tipo: 'ciega',
      id_hecho: 'sin_escala',
      titulo: `${f.nombre}: el OS no tiene ninguna escala guardada para la zona ${f.zona || 'A'}`,
      evidencia: { zona: f.zona || 'A' },
      accion: 'Cargar la escala vigente del CCT 76/75 (uocra_escala) desde el acuerdo oficial.',
    }))
    out.senal = {}
    return out
  }
  const vigencias = dela.map((r) => ms(r.vigencia_desde)).filter(Number.isFinite)
  const ultima = new Date(Math.max(...vigencias))
  const basicos = Object.fromEntries(dela
    .filter((r) => ms(r.vigencia_desde) === ultima.getTime())
    .map((r) => [r.categoria, r.basico_hora == null ? null : Number(r.basico_hora)]))
  const senalNueva = { vigencia_desde: ultima.toISOString().slice(0, 10), basicos }

  // (1) Comparación contra una referencia externa, si la hay.
  if (referencia?.basicos) {
    for (const [cat, valorRef] of Object.entries(referencia.basicos)) {
      const mio = basicos[cat]
      if (mio == null || Number(valorRef) === Number(mio)) continue
      out.push(novedad(f, {
        tipo: 'valor_cambiado',
        id_hecho: `basico:${cat}:${mio}→${valorRef}`,
        titulo: `Básico de convenio distinto — ${cat} zona ${f.zona || 'A'}: el OS tiene ${mio} y la referencia dice ${valorRef}`,
        evidencia: { categoria: cat, guardado: mio, referencia: valorRef, fuente_referencia: referencia.fuente ?? null, vigencia_guardada: senalNueva.vigencia_desde },
        accion: `Verificar contra la escala oficial y actualizar uocra_escala. ${f.ruta_carga}`,
        requiere_dueno: true,
      }))
    }
    out.senal = senalNueva
    return out
  }

  // (2) Sin referencia: no se compara nada. Se afirma lo único que se puede afirmar — el vencimiento.
  const d = ahora instanceof Date ? ahora : new Date(ahora)
  const mesEnCurso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const mesEscala = senalNueva.vigencia_desde.slice(0, 7)
  const mesQueViene = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  const mesQueVieneTxt = `${mesQueViene.getUTCFullYear()}-${String(mesQueViene.getUTCMonth() + 1).padStart(2, '0')}`
  // Días que faltan para que empiece el mes que viene: cerca de fin de mes, la escala del mes
  // siguiente ya tiene que estar cargada (los jornales de la primera quincena se liquidan con ella).
  const diasAlCambio = Math.ceil((mesQueViene.getTime() - d.getTime()) / 86400000)
  // NO SE AVISA DE ALGO QUE YA ESTÁ RESUELTO (31/07). La condición era "faltan pocos días para el mes
  // que viene" sin mirar si la escala del mes que viene YA está cargada: con agosto cargado el vigía
  // seguía pidiendo cargar agosto. Un aviso que no se apaga cuando el problema se soluciona es un aviso
  // que se deja de leer — el mismo criterio que se aplicó al freno de los timers.
  const faltaLaDelMesQueViene = mesEscala < mesQueVieneTxt
  if (mesEscala < mesEnCurso || (diasAlCambio <= 7 && faltaLaDelMesQueViene)) {
    const vencida = mesEscala < mesEnCurso
    out.push(novedad(f, {
      tipo: 'valor_cambiado',
      id_hecho: `escala_vencida:${vencida ? mesEnCurso : mesQueVieneTxt}`,
      titulo: vencida
        ? `${f.nombre}: la escala guardada rige desde ${senalNueva.vigencia_desde} y el mes en curso es ${mesEnCurso} — el cuadro de Jornales compara contra una escala vencida`
        : `${f.nombre}: faltan ${diasAlCambio} día(s) para ${mesQueVieneTxt} y la escala cargada más nueva es la de ${mesEscala} — el acuerdo fija escalones mensuales`,
      evidencia: {
        vigencia_guardada: senalNueva.vigencia_desde, basicos, mes_en_curso: mesEnCurso,
        mes_que_viene: mesQueVieneTxt, dias_al_cambio: diasAlCambio,
        // Se declara explícitamente que NO se pudo verificar contra la fuente oficial.
        referencia_oficial: 'no disponible — el OS no tiene fuente automática de la escala publicada del CCT 76/75',
      },
      accion: `Verificar la escala vigente del CCT 76/75 zona ${f.zona || 'A'} y cargarla. ${f.ruta_carga}`,
      requiere_dueno: true,
    }))
  }
  out.senal = senalNueva
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// DETECTOR — SILENCIO (banco y cualquier feed con cadencia)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: días sin dato nuevo en un feed que debería moverse.
 *
 * Distinto de la frescura de `fuentes_datos`, que mide CUÁNDO LO LEÍ. Acá se mide hasta qué fecha
 * LLEGA EL DATO: un extracto releído hoy que termina el 25 deja cinco días de caja a ciegas.
 */
// Tampoco recibe la señal previa: el silencio se mide contra el reloj, no contra la ronda anterior.
export function novedadesSilencio(f, { ultimaFecha = null, filas = 0, ahora = new Date() } = {}) {
  const out = []
  const senalNueva = { ultima_fecha: ultimaFecha ? new Date(ms(ultimaFecha)).toISOString().slice(0, 10) : null, filas }
  if (!ultimaFecha) {
    out.push(novedad(f, {
      tipo: 'ciega',
      id_hecho: 'sin_datos',
      titulo: `${f.nombre}: no hay ningún dato cargado — no se puede saber si está al día`,
      evidencia: {},
      accion: `Cargar el dato. ${f.ruta_carga}`,
    }))
    out.senal = senalNueva
    return out
  }
  const tolerados = f.dias_tolerados ?? Math.ceil((f.cadencia_horas ?? 24) / 24) + 1
  const atraso = dias(ultimaFecha, ahora)
  if (atraso != null && atraso > tolerados) {
    out.push(novedad(f, {
      tipo: 'silencio',
      id_hecho: `silencio:${senalNueva.ultima_fecha}`,
      titulo: `${f.nombre}: ${atraso} días sin dato nuevo (el último llega al ${senalNueva.ultima_fecha}; se toleran ${tolerados})`,
      evidencia: { ultima_fecha: senalNueva.ultima_fecha, dias_de_atraso: atraso, dias_tolerados: tolerados, filas },
      accion: `Cargar lo que falta. ${f.ruta_carga}`,
    }))
  }
  out.senal = senalNueva
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// DETECTOR — LAS CAPACIDADES QUE DEPENDEN DE UN TIMER
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE (31/07). El dueño: "proveedores sigue sin ser una pestaña viva, se siguen cargando
// compras y la seccion 1 de proveedores y deuda no se actualiza". La causa NO era el diseño de la
// pestaña: `echegaray-proveedores.timer` estaba `enabled` y **detenido el 27/07 a las 16:48**. La
// pestaña se refrescaba sola cada 2h y dejó de hacerlo sin que nada avisara. Se rediseñó una pestaña
// que no estaba rota.
//
// Y al mirar el resto aparecieron CINCO timers más en el mismo estado, uno de ellos
// `echegaray-orq-health.timer`: el que avisaría que los timers se murieron estaba entre los muertos.
// Eso explica el silencio completo.
//
// `enabled` NO significa que corra: significa que arrancaría en el próximo arranque de la sesión. Un
// timer `enabled` + `inactive` es una capacidad muerta que se ve viva en la lista de unidades. El
// único estado que importa es ACTIVE con un NEXT agendado.
//
// ESTO NO ARRANCA NADA. Varios timers están parados a propósito (la autonomía se congeló, y
// `caja-sync` está detenido porque su sync daba una caja falsa). Reactivar es del dueño; el vigía sólo
// hace visible lo que está muerto, que es lo que faltaba.

/**
 * La fecha de un sello de systemd. `list-timers` los escribe con el día de la semana adelante
 * ("Mon 2026-07-27 15:45:32"), así que cortar los primeros 10 caracteres devuelve "Mon 2026-0" — un
 * dato ilegible en el aviso que justamente tiene que decir DESDE CUÁNDO no corre. Se extrae la fecha.
 */
export const fechaDeSystemd = (s) => String(s ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null

/**
 * Desde cuándo no corre, en palabras. `list-timers` a veces da la fecha absoluta ("Mon 2026-07-27
 * 15:45:32") y a veces el tiempo relativo ("3 days ago") según cómo se lo invoque. Si hay fecha, se
 * usa; si no, se usa el texto tal cual — que es información. "No se sabe cuándo" sólo cuando de
 * verdad no vino nada: un aviso vago vale la mitad que uno que dice desde cuándo.
 */
export function desdeCuando(ultima) {
  const iso = fechaDeSystemd(ultima)
  if (iso) return `el ${iso}`
  const t = String(ultima ?? '').trim()
  return t && t !== '-' ? t : 'no se sabe cuándo'
}

/**
 * NÚCLEO PURO: qué timers de los que sostienen el Flujo están muertos.
 *
 * @param {object} f la fuente del registro
 * @param {{timers?: Array<{unidad:string, enabled:boolean, active:boolean, proxima?:string|null, ultima?:string|null}>}} datos
 */
export function novedadesTimers(f, { timers = [] } = {}) {
  const out = []
  const vigilados = f.unidades?.length ? timers.filter((t) => f.unidades.includes(t.unidad)) : timers
  const muertos = vigilados.filter((t) => t.enabled && !t.active)
  const sinAgenda = vigilados.filter((t) => t.active && !t.proxima)
  for (const t of muertos) {
    out.push(novedad(f, {
      tipo: 'capacidad_muerta',
      id_hecho: `timer_detenido:${t.unidad}`,
      titulo: `${t.unidad} está habilitado pero DETENIDO: lo que mantiene no se actualiza desde ${desdeCuando(t.ultima)}`,
      evidencia: { unidad: t.unidad, enabled: true, active: false, ultima_corrida: t.ultima ?? null, ultima_fecha: fechaDeSystemd(t.ultima) },
      // Reactivar un timer es del dueño: varios están parados a propósito.
      requiere_dueno: true,
      accion: `Decidir si se reactiva: systemctl --user start ${t.unidad}. Varios timers están parados A PROPÓSITO (la autonomía congelada, caja-sync con una caja falsa), así que esto NO se arranca solo.`,
    }))
  }
  for (const t of sinAgenda) {
    out.push(novedad(f, {
      tipo: 'capacidad_muerta',
      id_hecho: `timer_sin_agenda:${t.unidad}`,
      titulo: `${t.unidad} está activo pero sin próxima corrida agendada`,
      evidencia: { unidad: t.unidad, active: true, proxima: null },
      requiere_dueno: true,
      accion: `Revisar el OnCalendar/OnUnitActiveSec de la unidad: activa sin NEXT es activa sin efecto.`,
    }))
  }
  out.senal = { vigilados: vigilados.length, muertos: muertos.length, sin_agenda: sinAgenda.length }
  return out
}

/** Una fuente que no se pudo ver, con su motivo. Es información, no una falla escondida. */
export function novedadCiega(f, motivo) {
  return novedad(f, {
    tipo: 'ciega',
    id_hecho: `ciega:${String(motivo).slice(0, 80)}`,
    titulo: `No puedo ver ${f.nombre}: ${motivo}`,
    evidencia: { motivo, tipo: f.tipo },
    accion: 'Resolver el acceso a la fuente. Hasta entonces, lo que dependa de ella no está vigilado.',
  })
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SALIDA
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Conteos por clasificación y por fuente. Para el encabezado del informe. */
export function resumen(novedades = []) {
  const r = { total: novedades.length, aplicable_solo: 0, requiere_dueno: 0, ciega: 0, por_fuente: {} }
  for (const n of novedades) {
    r[n.clasificacion] = (r[n.clasificacion] || 0) + 1
    r.por_fuente[n.fuente] = (r.por_fuente[n.fuente] || 0) + 1
  }
  return r
}

const ICONO = { aplicable_solo: '[el OS puede]', requiere_dueno: '[requiere al dueño]', ciega: '[no puedo ver]' }

/**
 * El informe en texto. Cada novedad sale con su EVIDENCIA (qué fuente, qué cambió, desde cuándo, qué
 * decide, qué acción propone): sin eso una novedad es una opinión y nadie la puede verificar.
 */
export function formatNovedades(novedades = [], { ahora = new Date(), contexto = [] } = {}) {
  const r = resumen(novedades)
  const cuando = (ahora instanceof Date ? ahora : new Date(ahora)).toISOString().slice(0, 16).replace('T', ' ')
  // SIN NOVEDADES NO ES SIN INFORMACIÓN. El contexto —qué fuentes se declararon en línea de base, la
  // edad del índice de Drive, qué no se pudo juzgar— se imprime igual: si se descartara, una ronda
  // "tranquila" no dejaría rastro de QUÉ se miró, y eso es indistinguible de un vigía que no corrió.
  if (!r.total) {
    return [
      `VIGÍA DE FUENTES — ${cuando}`,
      `Sin novedades: ninguna de las ${FUENTES.length} fuentes vigiladas se movió desde la última ronda.`,
      ...(contexto.length ? ['', ...contexto] : []),
    ].join('\n')
  }
  const lineas = [
    `VIGÍA DE FUENTES — ${cuando}`,
    `${r.total} novedad(es): ${r.aplicable_solo} que el OS puede aplicar, ${r.requiere_dueno} que requieren al dueño, ${r.ciega} fuente(s) que no puedo ver.`,
    '',
  ]
  const orden = ['requiere_dueno', 'aplicable_solo', 'ciega']
  for (const clase of orden) {
    const grupo = novedades.filter((n) => n.clasificacion === clase)
    if (!grupo.length) continue
    lineas.push(`── ${ICONO[clase]} ──`)
    for (const n of grupo) {
      lineas.push(`· ${n.titulo}`)
      lineas.push(`    decide: ${n.que_decide}`)
      lineas.push(`    acción: ${n.accion}`)
      const ev = Object.entries(n.evidencia || {})
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
        .map(([k, v]) => `${k}=${v}`)
      if (ev.length) lineas.push(`    evidencia: ${ev.join(' · ')}`)
    }
    lineas.push('')
  }
  for (const c of contexto) lineas.push(c)
  return lineas.join('\n').trimEnd()
}

/**
 * El texto del AVISO (canal externo). Corto a propósito: un aviso largo no se lee. El detalle vive en
 * el informe y en la tabla.
 *
 * NO ENVÍA NADA. El envío por un canal externo es Nivel E y lo engancha el proceso principal.
 */
export function avisoTexto(novedades = [], { ahora = new Date() } = {}) {
  const r = resumen(novedades)
  if (!r.total) return null
  const top = novedades
    .filter((n) => n.clasificacion === 'requiere_dueno')
    .slice(0, 3)
    .map((n) => `· ${n.titulo}`)
  const cuando = (ahora instanceof Date ? ahora : new Date(ahora)).toISOString().slice(0, 10)
  return [
    `**Vigía de fuentes — ${cuando}**: ${r.total} novedad(es) que afectan el Flujo de Fondos ` +
    `(${r.requiere_dueno} necesitan tu decisión, ${r.aplicable_solo} las puede hacer el OS, ${r.ciega} fuente(s) que no puedo ver).`,
    ...top,
  ].join('\n')
}
