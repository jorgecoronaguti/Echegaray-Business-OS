// `Planilla para Cotizar (2).xlsm` → la base maestra constructiva. NÚCLEO PURO: SIN FS, RED NI BASE.
//
// ═══ POR QUÉ EXISTE (21/08/2026) ═══
//
// El activo real del libro son tres cosas —223 tareas tipo, 1.365 líneas de análisis y 409 recursos—
// y hoy sólo existen adentro de un archivo de Excel para Mac que se abre en una máquina. La
// migración `20260821T2200_la_base_maestra_constructiva.sql` ya construyó el destino; esto es la
// puerta de entrada. Lo que se importa es el INSUMO (código, nombre, unidad, cantidad, costo, fecha)
// y nunca el RESULTADO: el costo unitario, el desglose MO/CS/MAT/EQ y las HH los calcula la vista
// `analisis_costo`, que es la única definición.
//
// ═══ LAS CUATRO TRAMPAS QUE ESTE MÓDULO TIENE QUE ESQUIVAR ═══
//
// 1. LA UNIDAD DICE EL TIPO, EL COLOR NO. En `Análisis` el verde acierta el 78,5 % (RODILLO, THINNER
//    y NAFTA están pintados de verde y no son mano de obra) y en `Recursos` la convención está
//    INVERTIDA. Acá el color no se lee: se lee la unidad, y donde la unidad no alcanza, la familia,
//    la división y el nombre. Donde ninguna alcanza, el tipo es `otro` y se informa — no se adivina.
//
// 2. `hr` A SECAS NO ES UNA CARGA SOCIAL. El libro suma las cargas sociales con
//    `SUMIF(D,"hr",G)`, y el SUMIF de Excel es CASE-INSENSITIVE: los alquileres por hora (`HR`:
//    GRÚA 40 TONELADAS, BOBCAT, VIBRO COMPACTADOR) y la MÁQUINA CARGADORA (`hr`) caían adentro de la
//    columna «cargas sociales» de cada análisis. Es un defecto de Excel, no una regla: acá una carga
//    social es `hr` + el nombre que lo declara, y son exactamente cuatro (255, 255.1, 256, 257).
//
// 3. LA MANO DE OBRA SE MIDE EN HORAS O NO SE MIDE. `hs_unitarias` de la vista es la suma de las
//    cantidades de tipo `mano_obra`: si entran ahí los 5 insumos que el libro pone en familia MANO
//    DE OBRA pero cotiza por m², m³ o por unidad (CÁLCULO ESTRUCTURAL, EXCAVACIÓN RESERVORIO,
//    GEOMEMBRANA c/COLOCACIÓN, ARENADO Y PINTADO, TÉCNICO HyS), el rendimiento pasa a ser una suma
//    de horas con metros cuadrados. Van a `otro` y se informan: son subcontratos, no jornal.
//
// 4. EL RÓTULO DE LA COLUMNA `COD T` NO SIEMPRE ABRE UNA TAREA. Contando filas con algo en `A` hay
//    223 «tareas»; 23 de ellas —`Correa`, `MALLA`, `1 OF`, `MAQUINA DE SOLDAR`, `hierro`…— son
//    RÓTULOS que alguien escribió al lado de una línea de insumo para marcar un sub-bloque, y la
//    prueba está en la propia hoja: en esas filas la columna `C` es el `VLOOKUP` que trae el nombre
//    del recurso, no una descripción tipeada. Tomarlas por tareas creaba 23 tareas fantasma
//    («Correa» con unidad `un`) y, peor, perdía sus 23 líneas de insumo. Las cabeceras de verdad son
//    200 y son exactamente las que usan la nomenclatura `T####`: dos señales independientes que dan
//    el mismo corte. Manda la fórmula, no la nomenclatura — un código nuevo que no empiece con T no
//    tiene por qué dejar de ser una tarea.
//
// 5. UN PRECIO 0 O SIN FECHA NO ES UN PRECIO DE HOY. 58 recursos no traen fecha y 82 tienen precio
//    de 2017. La fecha entra como viene —NULL es NULL, 2017 es 2017— y un costo 0 o vacío NO crea
//    fila en `recurso_precio`: el recurso queda sin precio y `analisis_incompleto` lo cuenta. Cero
//    no es gratis, es un dato que falta.
//
// LO QUE ESTE MÓDULO NO HACE: no lee archivos, no escribe, no decide. Convierte filas en registros y
// dice por qué rechaza lo que rechaza.

/** El libro del que sale todo esto. Va en `origen` para que un dato se rastree hasta su celda. */
export const LIBRO = 'Planilla para Cotizar (2).xlsm'

/** Los valores de error de Excel. Ninguno entra a la base: una celda rota no es un dato. */
export const ERRORES = Object.freeze(['#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NAME?', '#NUM!', '#NULL!'])

/** Una celda en error llega como `{error:'#REF!'}` (así la marca el lector) o como su texto crudo. */
export function esError(x) {
  if (x && typeof x === 'object' && typeof x.error === 'string') return true
  return typeof x === 'string' && ERRORES.includes(x.trim())
}

/** Texto limpio, o null. Una celda en error nunca es texto: devuelve null y el llamador la rechaza. */
export const texto = (x) => {
  if (x === null || x === undefined || esError(x)) return null
  const s = String(x).trim()
  return s === '' ? null : s
}

/** Número finito, o null. El `'  '` que el libro deja en celdas «vacías» NO es 0. */
export const numero = (x) => {
  if (esError(x) || x === null || x === undefined || x === '') return null
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

/**
 * El código, normalizado a texto UNA sola vez y del mismo modo en las dos hojas.
 *
 * `Recursos!A` guarda `0.1`, `1.1`, `160.1`, `160.2`, `255.1` y `278.1` como TEXTO y `Análisis!B`
 * los guarda como NÚMERO. Sin esta normalización esos seis recursos quedaban huérfanos en silencio:
 * el análisis apuntaría a un recurso que «no existe» y la línea se perdería sin un solo error.
 */
export const codigo = (x) => texto(x)

/**
 * Serial de Excel → ISO, o null. La banda 2000–2100 no es decorativa: un costo tipeado adentro de la
 * columna FECHA entra como número y saldría convertido en el año 3.500 sin que nada se queje.
 * Ver la memoria `fecha-dd-mm-yy-parser`.
 */
export function aISO(serial) {
  const n = numero(serial)
  if (n === null || n < 36526 || n > 73050) return null
  return new Date(Date.UTC(1899, 11, 30) + Math.trunc(n) * 86400000).toISOString().slice(0, 10)
}

/** Columnas de `Recursos` (fila 4 = encabezado, datos desde la 5). */
export const REC = Object.freeze({
  codigo: 'A', nombre: 'B', unidad: 'C', costo: 'D', fecha: 'E',
  fuente: 'F', familia: 'G', division: 'H', desperdicio: 'I',
})

/** Columnas de `Análisis` (fila 5 = encabezado, datos desde la 7). */
export const ANA = Object.freeze({
  tarea: 'A', recurso: 'B', descripcion: 'C', unidad: 'D', cantidad: 'E', consideracion: 'L',
})

/**
 * ¿El encabezado sigue siendo el que estos índices asumen?
 *
 * El libro lo edita una persona. Si inserta una columna, todo lo que sigue se corre y el ingestor
 * cargaría el costo de una columna y el desperdicio de otra SIN dar error — el modo de falla más
 * caro que tiene un importador. Se verifica por rótulo y se aborta; no se adivina.
 *
 * @returns {string[]} los problemas; vacío = el layout es el esperado
 */
export function verificarEncabezado(fila = {}, esperado = {}) {
  const problemas = []
  for (const [col, re] of Object.entries(esperado)) {
    const visto = texto(fila[col]) ?? ''
    if (!re.test(visto)) problemas.push(`columna ${col} dice "${visto || '∅'}" y se esperaba ${re}`)
  }
  return problemas
}

export const ENCABEZADO_RECURSOS = Object.freeze({
  A: /^codigo$/i, B: /^insumo$/i, C: /^unidad$/i, D: /^costo$/i,
  E: /^fecha$/i, F: /^fuente$/i, G: /^familia$/i, H: /^division$/i, I: /^desperdicio$/i,
})

export const ENCABEZADO_ANALISIS = Object.freeze({
  A: /^cod ?t$/i, B: /^cod ?r$/i, C: /^descripcion$/i, D: /^un$/i,
  E: /^cantidad$/i, L: /^consideraciones$/i,
})

/** Familias que el libro escribe de más de una manera y son la misma cosa. `MATEIAL` son 4 filas
 *  contra 330 de `MATERIAL`: es un typo, no una familia. */
const FAMILIA_CANONICA = Object.freeze({ MATEIAL: 'MATERIAL' })

/** Familias cuyo contenido son cosas que se compran e incorporan a la obra. `CARPINTERIA` y
 *  `HERRERIA` son artículos comprados (barral antipánico, caño estructural, codo), no un oficio. */
const FAMILIAS_MATERIAL = new Set(['MATERIAL', 'COMBUSTIBLE', 'CARPINTERIA', 'HERRERIA'])

/** Divisiones que sólo agrupan materiales. NO están `JORNALES`, `SUBCONTRATISTA`, `ALQUILER`,
 *  `MAQUINA`, `TRANSPORTE` ni `HYS`: ésas no son cosas que se compran por unidad de obra. */
const DIVISIONES_MATERIAL = new Set([
  'ACERO', 'INST. SANITARIA', 'CAÑERIA BASE', 'CARPINTERIA', 'PINTURA', 'INST. GAS',
  'INST. ELECTRICA', 'MADERA', 'REVESTIMIENTO', 'CIERRE PERIMETRAL', 'MAMPUESTOS',
  'ARIDOS', 'AISLACION', 'HORMIGON', 'AGLOMERANTES', 'COMBUSTIBLE',
])

export const familiaCanonica = (f) => (f === null ? null : (FAMILIA_CANONICA[f.toUpperCase()] ?? f))

/**
 * EL TIPO DEL RECURSO, con el motivo pegado al lado.
 *
 * El orden importa y es de evidencia más fuerte a más débil: la unidad manda, después la familia y
 * la división, y el nombre sólo donde declara literalmente lo que la cosa es (`CARGA SOCIAL …`,
 * `ALQUILER …`). Cuando ninguna evidencia alcanza el tipo es `otro` y el motivo lo dice: son las
 * filas que alguien tiene que clasificar a mano, y quedan contadas en vez de escondidas.
 *
 * @returns {{tipo:string, porque:string}}
 */
export function clasificarTipo({ unidad = null, familia = null, division = null, nombre = null } = {}) {
  const u = (unidad ?? '').trim().toLowerCase()
  const f = (familiaCanonica(familia) ?? '').trim().toUpperCase()
  const d = (division ?? '').trim().toUpperCase()
  const n = (nombre ?? '').trim().toUpperCase()

  if (u === 'hs') return { tipo: 'mano_obra', porque: 'unidad hs: es la hora de jornal' }
  // `hr` a secas NO alcanza — ver la trampa 2 del encabezado.
  if (u === 'hr' && /^CARGA(S)? SOCIAL(ES)?\b/.test(n)) {
    return { tipo: 'carga_social', porque: 'unidad hr y el nombre declara la carga social' }
  }
  if (f === 'MAQUINA' || d === 'MAQUINA' || d === 'ALQUILER' || /\bALQUILER\b/.test(n)) {
    return { tipo: 'equipo', porque: `familia/division/nombre de máquina o alquiler (${f || d || 'nombre'})` }
  }
  if (FAMILIAS_MATERIAL.has(f)) return { tipo: 'material', porque: `familia ${f}` }
  if (DIVISIONES_MATERIAL.has(d)) return { tipo: 'material', porque: `division ${d}` }
  if (f === 'MANO DE OBRA') {
    return { tipo: 'otro', porque: `familia MANO DE OBRA pero se cotiza por ${u || 'unidad sin declarar'}, no por hora: es un subcontrato` }
  }
  if (f === 'SUBCONTRATISTA' || f === 'CONTRATISTA') return { tipo: 'otro', porque: `familia ${f}: subcontrato` }
  return { tipo: 'otro', porque: `sin evidencia: familia "${familia ?? '∅'}" division "${division ?? '∅'}" unidad "${unidad ?? '∅'}"` }
}

/** De qué celda salió, y cuándo entró. Un dato tiene que poder rastrearse hasta su celda. */
export const trazar = (hoja, fila, ingesta) => `${LIBRO} · ${hoja}!${fila} · ingesta ${ingesta}`

/**
 * Una fila de `Recursos` → el recurso y —si tiene costo— su precio. O el motivo por el que no.
 *
 * @param {object} f  la fila cruda: `{fila, A, B, C, …}` con las celdas ya leídas sin formato
 * @param {{ingesta:string}} ctx
 * @returns {{ok:true, recurso:object, precio:object|null} | {ok:false, fila:number, motivo:string}}
 */
export function aRecurso(f = {}, { ingesta } = {}) {
  const fila = f.fila ?? 0
  const no = (motivo) => ({ ok: false, fila, motivo })
  for (const col of Object.values(REC)) {
    if (esError(f[col])) return no(`la celda ${col}${fila} está en error (${f[col]?.error ?? f[col]})`)
  }
  const cod = codigo(f[REC.codigo])
  if (!cod) return no('sin código de recurso')
  const nombre = texto(f[REC.nombre])
  if (!nombre) return no(`el recurso ${cod} no tiene nombre`)
  const unidad = texto(f[REC.unidad])
  if (!unidad) return no(`el recurso ${cod} «${nombre}» no tiene unidad`)

  const desperdicio = numero(f[REC.desperdicio]) ?? 0
  // El CHECK de la tabla exige fracción: un 5 tipeado donde va 0,05 multiplicaría el costo por seis.
  if (desperdicio < 0 || desperdicio >= 1) return no(`desperdicio ${desperdicio} no es una fracción (0 ≤ d < 1)`)

  const familia = familiaCanonica(texto(f[REC.familia]))
  const division = texto(f[REC.division])
  const { tipo, porque } = clasificarTipo({ unidad, familia, division, nombre })

  const costo = numero(f[REC.costo])
  return {
    ok: true,
    recurso: { codigo: cod, nombre, unidad, tipo, familia, division, desperdicio, activo: true, origen: trazar('Recursos', fila, ingesta), fila, porqueTipo: porque },
    // COSTO 0 O VACÍO NO CREA PRECIO. Un recurso sin precio se ve como lo que es en
    // `analisis_incompleto`; un precio de $0 se suma como si fuera gratis y nadie lo nota.
    precio: costo === null || costo === 0 ? null : {
      codigo: cod,
      costo,
      fecha_precio: aISO(f[REC.fecha]),   // NULL es NULL: no es hoy y no es cero
      proveedor: texto(f[REC.fuente]),
      fuente: trazar('Recursos', fila, ingesta),
      vigente: true,
      fila,
    },
  }
}

/**
 * `Recursos` entera. El código es la identidad: si aparece dos veces, es un CONFLICTO —el libro se
 * contradice— y ninguna de las dos entra hasta que alguien lo resuelva.
 *
 * @returns {{recursos:object[], precios:object[], invalidos:object[], conflictos:object[]}}
 */
export function leerRecursos(filas = [], { ingesta } = {}) {
  const invalidos = []
  const buenos = []
  const precios = new Map()
  for (const f of filas) {
    if (codigo(f[REC.codigo]) === null && texto(f[REC.nombre]) === null) continue // fila en blanco
    const r = aRecurso(f, { ingesta })
    if (!r.ok) { invalidos.push(r); continue }
    buenos.push(r.recurso)
    if (r.precio) precios.set(r.recurso.codigo, r.precio)
  }
  const porCodigo = new Map()
  for (const r of buenos) {
    if (!porCodigo.has(r.codigo)) porCodigo.set(r.codigo, [])
    porCodigo.get(r.codigo).push(r)
  }
  const conflictos = []
  const recursos = []
  for (const [cod, lista] of porCodigo) {
    if (lista.length > 1) {
      conflictos.push({ clave: cod, entidad: 'recurso', filas: lista.map((r) => ({ fila: r.fila, nombre: r.nombre })) })
      precios.delete(cod)
      continue
    }
    recursos.push(lista[0])
  }
  return { recursos, precios: [...precios.values()], invalidos, conflictos }
}

/**
 * `Análisis` entera: una fila con `COD T` abre una tarea, y las de abajo con `COD R` son sus líneas.
 *
 * Los 6 códigos de tarea duplicados (`T1125`, `Correa`, `Cordon Sup/Inf`, `Montante`, `1 OF`,
 * `MAQUINA DE SOLDAR`) NO se fusionan: el libro los resolvía con `VLOOKUP(…,FALSE)`, que devuelve
 * siempre la PRIMERA coincidencia, así que el segundo análisis era inalcanzable y nunca cotizó nada.
 * Se carga el primero y se denuncian los demás con su nombre y su fila.
 *
 * @returns {{tareas:object[], invalidos:object[], conflictos:object[]}}
 */
export function leerAnalisis(filas = [], { ingesta, recursosValidos = new Set() } = {}) {
  const invalidos = []
  const orden = []
  const conteo = { cabeceras: 0, lineas: 0, rotuladas: 0, lineasRechazadas: 0 }
  let actual = null
  for (const f of filas) {
    const fila = f.fila ?? 0
    if (esLinea(f)) {
      const codR = codigo(f[ANA.recurso])
      if (codR === null) continue // fila de fórmula sin insumo: la hoja tiene 3
      conteo.lineas++
      const linea = aLinea(f, { ingesta, fila, codR, recursosValidos, tarea: actual })
      if (!linea.ok) { invalidos.push(linea); conteo.lineasRechazadas++; continue }
      if (linea.linea.rotulo) conteo.rotuladas++
      actual.lineas.push({ ...linea.linea, orden: actual.lineas.length })
      continue
    }
    const cod = codigo(f[ANA.tarea])
    if (cod === null) continue // fila en blanco entre bloques
    conteo.cabeceras++
    const suelto = codigo(f[ANA.recurso])
    if (suelto !== null) {
      // El `MAL` de la fila 474: un código de recurso tipeado en la cabecera de T1045. No es una
      // línea —no tiene cantidad— y el código ni siquiera existe en `Recursos`. Se denuncia.
      invalidos.push({ ok: false, fila, motivo: `la cabecera de ${cod} trae el código de recurso "${suelto}" en COD R, sin cantidad: no es una línea y no se importa` })
    }
    actual = abrirTarea(f, { ingesta, fila, cod, invalidos })
    if (actual) orden.push(actual)
  }

  const porCodigo = new Map()
  for (const t of orden) {
    if (!porCodigo.has(t.codigo)) porCodigo.set(t.codigo, [])
    porCodigo.get(t.codigo).push(t)
  }
  const conflictos = []
  const tareas = []
  for (const [cod, lista] of porCodigo) {
    tareas.push(lista[0])
    if (lista.length > 1) {
      conflictos.push({
        clave: cod, entidad: 'tarea_tipo', resuelto: 'gana la primera (VLOOKUP FALSE nunca alcanzaba a la segunda)',
        filas: lista.map((t, i) => ({ fila: t.fila, nombre: t.nombre, unidad: t.unidad, n_lineas: t.lineas.length, entra: i === 0 })),
      })
    }
  }
  return { tareas, invalidos, conflictos, conteo }
}

/**
 * ¿Esta fila es una línea de insumo o la cabecera de una tarea?
 *
 * Lo decide la HOJA, no la nomenclatura del código: en una línea, la descripción (`C`) es el
 * `VLOOKUP` que trae el nombre del recurso desde `Recursos`; en una cabecera está tipeada. Ver la
 * trampa 4. El segundo camino —`COD R` con algo y `COD T` vacío— es la red por si alguien borra la
 * fórmula de una fila: sin ella, esa línea se perdería sin dar un solo error.
 */
export function esLinea(f = {}) {
  if (/VLOOKUP/i.test(f.f?.[ANA.descripcion] ?? '')) return true
  return codigo(f[ANA.recurso]) !== null && codigo(f[ANA.tarea]) === null
}

/** Abre el bloque de una tarea. Devuelve null y anota el inválido si la cabecera no sirve. */
function abrirTarea(f, { ingesta, fila, cod, invalidos }) {
  for (const col of [ANA.tarea, ANA.descripcion, ANA.unidad]) {
    if (esError(f[col])) { invalidos.push({ ok: false, fila, motivo: `la celda ${col}${fila} está en error` }); return null }
  }
  const nombre = texto(f[ANA.descripcion])
  const unidad = texto(f[ANA.unidad])
  if (!nombre) { invalidos.push({ ok: false, fila, motivo: `la tarea ${cod} no tiene descripción` }); return null }
  if (!unidad) { invalidos.push({ ok: false, fila, motivo: `la tarea ${cod} «${nombre}» no tiene unidad` }); return null }
  return {
    codigo: cod, nombre, unidad,
    // Ni `division` ni `metodo_medicion`: el libro no los tiene y no se inventan.
    division: null, metodo_medicion: null,
    descripcion: texto(f[ANA.consideracion]),
    activo: true, origen: trazar('Análisis', fila, ingesta), fila, lineas: [],
  }
}

/** Una fila de insumo dentro de un bloque de tarea. */
function aLinea(f, { ingesta, fila, codR, recursosValidos, tarea }) {
  const no = (motivo) => ({ ok: false, fila, motivo })
  if (!tarea) return no(`la línea con recurso ${codR} no cuelga de ninguna tarea`)
  for (const col of [ANA.recurso, ANA.cantidad]) {
    if (esError(f[col])) return no(`la celda ${col}${fila} está en error (${f[col]?.error ?? f[col]})`)
  }
  if (!recursosValidos.has(codR)) return no(`la tarea ${tarea.codigo} usa el recurso "${codR}", que no existe en Recursos`)
  const cantidad = numero(f[ANA.cantidad])
  if (cantidad === null) return no(`la línea ${tarea.codigo}/${codR} no tiene cantidad`)
  if (cantidad < 0) return no(`la línea ${tarea.codigo}/${codR} tiene cantidad ${cantidad}, negativa`)
  // El rótulo de `COD T` en una línea NO es un código de tarea: es el sub-bloque al que pertenece
  // («Correa», «MALLA», «1 OF»). Es información real del análisis y se conserva en la nota.
  const rotulo = codigo(f[ANA.tarea])
  const consideracion = texto(f[ANA.consideracion])
  // `analisis_linea` no tiene columna `origen`, así que la traza va en `nota` — es el único lugar
  // donde cabe, y sin ella una cantidad no se puede rastrear hasta la celda de la que salió.
  const nota = [`Análisis!${fila}`, rotulo, consideracion].filter(Boolean).join(' · ')
  return { ok: true, linea: { codigoRecurso: codR, cantidad, nota, rotulo, fila, ingesta } }
}
