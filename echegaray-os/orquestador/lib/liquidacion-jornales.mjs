// LA QUINCENA DE «Obreros 26» LEÍDA COMO LÍNEAS DE LIQUIDACIÓN.
//
// El dueño (09/09/2026) pidió dejar cargadas en el módulo Liquidación de la web las quincenas ya
// cerradas de 2026 «según lo indica el Sheet JORNALES». Esto es el NÚCLEO PURO de esa carga: recibe
// la grilla y devuelve líneas; no habla con Google, no habla con Postgres y por eso se puede probar.
//
// ═══ POR QUÉ NO REUSA `plantelDelEspejo` ═══
//
// Ese lector responde otra pregunta —quién está en el plantel y cuál es su $/hora vigente— y para
// eso colapsa el año entero en una fila por persona. Acá hace falta lo contrario: UNA LÍNEA POR
// PERSONA Y POR QUINCENA, con la plata de esa quincena. Lo que sí se reusa es su `claveNombre`, que
// es la que resuelve el nombre dado vuelta de abril («Marcelo Pastran» / «Pastran Marcelo»).
//
// ═══ LAS COLUMNAS SE BUSCAN, NO SE TIPEAN ═══
//
// Los rótulos (Hs · $/h · BANCO · ADELANTO · EFECTIVO · TOTAL) están a veces en la fila de fechas y
// a veces en la de arriba, y la planilla tiene más de un layout a lo largo del año. Tipear los
// índices haría que el día que se corran las columnas la carga siga andando y liquide el ADELANTO
// como si fuera el TOTAL. Se leen del rótulo de cada bloque, y si un bloque no los trae, ese bloque
// no se carga: no se hereda el layout del vecino.

import { claveNombre } from './desvinculacion-plantel.mjs'

export { claveNombre }

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** Las celdas rotas de la planilla. Un #REF! leído como 0 liquidaría a alguien en cero sin avisar. */
export const esError = (v) => /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!)/i.test(texto(v))

/**
 * NÚCLEO PURO: un importe de la planilla ("$260.000,00") como número.
 * Devuelve `null` cuando la celda está vacía o rota — NUNCA cero. Una quincena sin dato no es una
 * quincena de $ 0, y esa distinción es la que decide si la línea se carga o se informa.
 *
 * ═══ UN NÚMERO YA ES UN NÚMERO, Y ES EL CAMINO QUE NO PIERDE CENTAVOS ═══
 *
 * Leyendo la pestaña FORMATEADA, Sheets entrega "$260.000" con el formato de la celda: los centavos
 * quedan del otro lado y la carga de las 274 líneas cerró $3,62 corta, con la fila 568 de la 1ª de
 * septiembre denunciando «no cierra por 1». Con `valueRenderOption=UNFORMATTED_VALUE` la misma celda
 * llega como `260000.05` — un `number` de JS, no un texto. Pasarlo por el parser de miles en
 * castellano lo destruiría (`"260000.05"` → sin puntos → `26000005`), así que se devuelve tal cual.
 */
export function importe(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = texto(v)
  if (!s || esError(s)) return null
  const n = Number(s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const ROTULOS = {
  horas: /^hs\.?$/i,
  valorHora: /^\$\s*\/?\s*h/i,
  porBanco: /^banco$/i,
  adelanto: /^adelanto$/i,
  enEfectivo: /^efectivo$/i,
  cobra: /^total$/i,
}

/**
 * NÚCLEO PURO: dónde está cada columna de plata en ESTE bloque.
 * Mira la fila de fechas y la inmediata anterior, que son los dos lugares donde la planilla escribe
 * los rótulos. Devuelve `null` si falta alguno: media cuenta no es una cuenta.
 * @param {Array<Array>} grid
 * @param {{filaFecha:number}} bloque filas en base 1
 */
export function columnasDelBloque(grid = [], bloque = {}) {
  const cols = {}
  for (const fila of [grid[bloque.filaFecha - 1], grid[bloque.filaFecha - 2]]) {
    for (const [i, celda] of (fila ?? []).entries()) {
      for (const [campo, re] of Object.entries(ROTULOS)) {
        if (cols[campo] === undefined && re.test(texto(celda))) cols[campo] = i
      }
    }
  }
  const faltan = Object.keys(ROTULOS).filter((k) => cols[k] === undefined)
  if (faltan.length) return { faltan }
  cols.yaTransferido = columnasSinRotuloEntre(grid, bloque, cols.porBanco, cols.adelanto)
  return { cols, faltan: [] }
}

/**
 * NÚCLEO PURO: las columnas de plata SIN RÓTULO que la planilla metió entre BANCO y ADELANTO.
 *
 * ═══ QUÉ ES LA COLUMNA 24 (Y) ═══
 *
 * Desde el bloque del 17/8/2026 aparecen ~$200.000 por cabeza en la columna Y, que no tiene rótulo
 * y que la fila de totales del bloque NO suma (esa fila suma X=BANCO, Z=ADELANTO y AA=EFECTIVO, y
 * saltea Y). Leer sólo lo rotulado dejaba cinco filas sin cerrar por exactamente ese importe.
 *
 * Lo que decide la lectura no es el rótulo —no hay— sino LA PROPIA FÓRMULA DE LA PLANILLA. En ese
 * bloque el EFECTIVO se calcula `=V*W-Z-X-Y`, mientras que hasta julio era `=V*W-Z-X`. O sea: la
 * planilla DESCUENTA Y de lo que la persona cobra, exactamente igual que BANCO y que ADELANTO. Con
 * eso la cadena cierra al peso (fila 531: 586.476 − 192.887,48 − 200.000 − 60.000 = 133.589).
 *
 * Se carga como `ya_transferido`, que es la tercera columna de descuento que la tabla ya tiene y la
 * única libre: BANCO ya es `por_banco` y ADELANTO ya es `adelanto`, y la fila 531 trae los tres
 * juntos con importes distintos, así que no son el mismo concepto. AFIRMO SU ARITMÉTICA, NO SU
 * NOMBRE: qué rotularía el dueño esa columna es un dato que la planilla no da. La pista más fuerte
 * de qué es está en las fórmulas del propio importe — fila 538 `189591` y fila 568 (quincena
 * siguiente, misma persona) `=189591/2`: plata ya entregada que se descuenta en cuotas.
 *
 * Se busca por posición relativa y no por índice fijo: el día que la planilla corra las columnas,
 * esto las sigue. Si BANCO y ADELANTO quedan pegados, no hay columna intermedia y devuelve [].
 */
export function columnasSinRotuloEntre(grid = [], bloque = {}, a, b) {
  if (a === undefined || b === undefined) return []
  const [lo, hi] = a < b ? [a, b] : [b, a]
  const filas = [grid[bloque.filaFecha - 1], grid[bloque.filaFecha - 2]]
  const out = []
  for (let i = lo + 1; i < hi; i++) {
    if (!filas.some((f) => texto((f ?? [])[i]))) out.push(i)
  }
  return out
}

const dosDigitos = (n) => String(n).padStart(2, '0')
const finDeMes = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()

/**
 * NÚCLEO PURO: a qué quincena CANÓNICA pertenece un bloque, a partir de su PRIMERA fecha.
 *
 * Se toma la primera y no la última a propósito: el bloque del 4/5 al 16/5 se pasa un día del 15, y
 * rotularlo por la última fecha lo mandaría a la segunda quincena de mayo, donde ya vive el bloque
 * del 18/5 — dos bloques distintos peleando por la misma clave única.
 *
 * @param {string} ddmm "4/5"
 * @returns {{desde:string, hasta:string}|null} ISO
 */
export function quincenaDeFecha(ddmm, anio = 2026) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(texto(ddmm))
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return dia <= 15
    ? { desde: `${anio}-${dosDigitos(mes)}-01`, hasta: `${anio}-${dosDigitos(mes)}-15` }
    : { desde: `${anio}-${dosDigitos(mes)}-16`, hasta: `${anio}-${dosDigitos(mes)}-${finDeMes(anio, mes)}` }
}

/** NÚCLEO PURO: la quincena canónica en la que cae una fecha ISO. La de HOY es la que está EN CURSO. */
export function quincenaEnCurso(hoy = new Date()) {
  const anio = hoy.getUTCFullYear()
  const mes = hoy.getUTCMonth() + 1
  return quincenaDeFecha(`${hoy.getUTCDate()}/${mes}`, anio)
}

/** La primera fecha DD/MM del rótulo del bloque, en el orden en que está escrita. */
export function primeraFecha(grid = [], bloque = {}) {
  for (const celda of grid[bloque.filaFecha - 1] ?? []) {
    if (/^\d{1,2}\/\d{1,2}$/.test(texto(celda))) return texto(celda)
  }
  return null
}

/**
 * NÚCLEO PURO: las líneas de personas de un bloque.
 *
 * `cobra` es la columna TOTAL de la planilla (Hs × $/h) y es la que suma el total de la quincena.
 * `total` de la línea es lo que impone el CHECK de la base: por_banco + en_efectivo, o sea lo que se
 * paga en esta quincena una vez descontado el adelanto ya entregado.
 *
 * Una línea a la que le falte cualquiera de las cuatro cifras de plata sale con `incompleta`: se
 * informa y no se carga. Rellenarla con ceros la haría indistinguible de una liquidación real.
 */
export function lineasDelBloque(grid = [], bloque = {}, cols = {}, gridCrudo = null) {
  const out = []
  for (let r = bloque.inicio; r <= bloque.fin; r++) {
    const f = grid[r - 1] ?? []
    // LA PLATA SE LEE CRUDA, LOS RÓTULOS Y LAS FECHAS FORMATEADOS. Son dos lecturas del mismo rango
    // porque cada una miente donde la otra sirve: sin formato, la fecha «17/8» del encabezado llega
    // como el serial 45886 y `primeraFecha` no reconoce un solo bloque; con formato, el importe
    // llega redondeado al formato de la celda y se pierden los centavos.
    const $ = gridCrudo ? (gridCrudo[r - 1] ?? []) : f
    const nombre = texto(f[1])
    if (nombre.length < 3) continue
    const cobra = importe($[cols.cobra])
    const adelanto = importe($[cols.adelanto]) ?? 0
    const porBanco = importe($[cols.porBanco]) ?? 0
    const colsYa = cols.yaTransferido ?? []
    const yaTransferido = colsYa.reduce((a, i) => a + (importe($[i]) ?? 0), 0)
    const horas = importe($[cols.horas])
    const valorHora = importe($[cols.valorHora])
    // EL EFECTIVO BORRADO SE DERIVA DE LA CADENA DE PAGO, NO SE INVENTA.
    // En la 2ª de junio alguien borró la fórmula de EFECTIVO en tres filas (401, 407, 414) y la
    // celda quedó vacía: la planilla no dice $0, no dice nada. El resto de la cadena sí está, y la
    // definición de la columna en las filas vecinas es `=Hs*$/h - ADELANTO - BANCO (- Y)`, así que
    // el hueco tiene una sola solución. Lo que lo convierte en evidencia y no en conveniencia es
    // que la propia fila de totales del bloque (417) lo confirma desde afuera: suma BANCO $0 +
    // ADELANTO $2.378.644 + EFECTIVO $5.745.756 = $8.124.400 contra un SUM(TOTAL) de $9.384.100, y
    // la diferencia — $1.259.700 — es exactamente 408.000 + 408.000 + 443.700, los tres derivados.
    // Sólo se deriva si la celda está VACÍA: un #REF! no se deriva, se denuncia.
    let enEfectivo = importe($[cols.enEfectivo])
    let efectivoDerivado = false
    if (enEfectivo == null && cobra != null && !esError($[cols.enEfectivo])) {
      const d = cobra - adelanto - porBanco - yaTransferido
      // Un derivado negativo significa que la cadena ya no cierra por otro motivo: no se tapa.
      if (d >= -0.5) { enEfectivo = d; efectivoDerivado = true }
    }
    const faltan = []
    if (cobra == null) faltan.push('TOTAL')
    if (enEfectivo == null) faltan.push('EFECTIVO')
    for (const campo of ['cobra', 'adelanto', 'porBanco', 'enEfectivo']) {
      if (esError($[cols[campo]])) faltan.push(`${campo} roto`)
    }
    for (const i of colsYa) if (esError($[i])) faltan.push('yaTransferido roto')
    const linea = {
      fila: r,
      nombre,
      clave: claveNombre(nombre),
      horas,
      valorHora,
      cobra,
      adelanto,
      porBanco,
      yaTransferido,
      enEfectivo,
      efectivoDerivado,
      total: cobra == null || enEfectivo == null ? null : porBanco + enEfectivo,
      incompleta: faltan.length ? faltan.join(', ') : null,
    }
    // LA IDENTIDAD DE LA PLANILLA ES SU PROPIO CONTROL: TOTAL = BANCO + ADELANTO + EFECTIVO. Si no
    // cierra, alguna de las cuatro celdas dice otra cosa que lo que el bloque suma, y cargarla
    // metería en la base una fila que no reproduce el papel.
    // El residuo se nombra porque tiene culpable: en la quincena del 17/8 la planilla estrenó una
    // columna de plata SIN RÓTULO (la 24, $200.000 por cabeza) que su propia fila de totales tampoco
    // suma. Decir «no cierra» sin el número obliga a rehacer la resta a mano.
    const pagado = porBanco + yaTransferido + adelanto + enEfectivo
    const residuo = cobra == null || enEfectivo == null ? null : cobra - pagado
    linea.residuo = residuo
    if (!linea.incompleta && Math.abs(residuo) > 0.5) {
      linea.incompleta = `no cierra por ${residuo.toFixed(2)}: TOTAL ${cobra} vs BANCO+YA_TRANSFERIDO+ADELANTO+EFECTIVO ${pagado}`
    }
    out.push(linea)
  }
  return out
}

/**
 * LOS SEIS ALIAS QUE EL DUEÑO ACEPTÓ, ESCRITOS — NO ADIVINADOS.
 *
 * Los seis salieron de un emparejamiento por subconjunto único de tokens y el dueño los revisó uno
 * por uno el 09/09/2026. Quedan acá, en el código, porque una regla que resuelve en runtime resuelve
 * también los que nadie miró: fue esa misma regla la que una vez metió a «Castillo Carlos» dentro de
 * «GONZALEZ CARLOS SAMUEL». Un nombre nuevo que no esté en esta tabla no se carga: se informa.
 *
 * Izquierda: como lo escribe la planilla. Derecha: `personas.nombre_completo`.
 */
export const ALIAS_JORNALES = {
  'Emanuel Alaniz': 'ALANIZ EMANUEL ARIEL',
  'Bronia Rodrigo': 'BRONIA JOFRE RODRIGO EMANUEL',
  'Navarro Matias': 'NAVARRO MATIAS JESUS',
  'Sosa Raul': 'SOSA NESTOR RAUL',
  'Castillo Carlos': 'CASTILLO BENITEZ JUAN CARLOS',
  'Zogbe Leonardo': 'ZOGBE RAMOS WALTER LEONARDO',
}

const ALIAS_POR_CLAVE = new Map(
  Object.entries(ALIAS_JORNALES).map(([planilla, base]) => [claveNombre(planilla), claveNombre(base)]),
)

/**
 * NÚCLEO PURO: quién es esta persona, y por qué vía se lo afirma.
 *
 * Tres niveles, de más fuerte a más débil, y NINGUNO adivina por parecido:
 *   1. `puente`  — el CUIL declarado a mano en el repo para ese nombre de planilla.
 *   2. `exacta`  — el mismo conjunto de tokens que el nombre de la base ("Jofre Ismael" = "JOFRE
 *                  ISMAEL"). No es similitud: es igualdad después de normalizar.
 *   3. `subconjunto` — todos los tokens del nombre de planilla están en el de la base y el candidato
 *                  es ÚNICO ("Emanuel Alaniz" ⊂ "ALANIZ EMANUEL ARIEL"). Con dos candidatos no
 *                  resuelve: devuelve `ambiguo`, porque elegir uno sería inventar.
 *
 * El nivel 3 se marca en la salida para que quien lo mire pueda rechazarlo: es el que una vez metió
 * a «Castillo Carlos» dentro de «GONZALEZ CARLOS SAMUEL».
 */
export function resolverPersona(clave, { puente, porCuil, personas }) {
  const cuil = puente.get(clave)
  if (cuil) {
    const p = porCuil.get(cuil)
    if (p) return { persona: p, via: 'puente' }
  }
  const alias = ALIAS_POR_CLAVE.get(clave)
  const buscada = alias ?? clave
  const tokens = buscada.split(' ').filter(Boolean)
  const exactas = personas.filter((p) => p.clave === buscada)
  if (exactas.length === 1) return { persona: exactas[0], via: alias ? 'alias' : 'exacta' }
  if (exactas.length > 1) return { persona: null, via: 'ambiguo', candidatos: exactas.map((p) => p.nombre) }
  const sub = personas.filter((p) => tokens.every((t) => p.tokens.includes(t)))
  return sub.length
    ? { persona: null, via: 'sin-persona', candidatos: sub.map((p) => p.nombre) }
    : { persona: null, via: 'sin-persona' }
}

/**
 * NÚCLEO PURO: EL CONTROL DE CIERRE de una quincena.
 *
 * ═══ POR QUÉ LA REGLA DEJÓ DE SER «COMPLETA O NADA» ═══
 *
 * Era «una quincena entra COMPLETA o no entra», y con eso 11 de 16 quincenas cerradas quedaban
 * afuera enteras por unas pocas personas que no existen en `public.personas`. El dueño, 09/09/2026:
 * *«no des de alta a nadie, son inactivos los que no están en esta quincena»*. Esas personas no se
 * crean y esas líneas no tienen dónde ir: `liquidacion_linea.persona_id` es NOT NULL con FK a
 * `personas` y la tabla no tiene columna de nombre libre (verificado contra information_schema del
 * Postgres vivo, no contra el archivo del repo).
 *
 * Así que la quincena entra PARCIAL, y el riesgo que la regla vieja evitaba —un total corto que se
 * lee igual de bien que uno correcto— sigue vivo y hay que nombrarlo: `excluidas` y `montoExcluido`
 * existen para que ningún consumidor pueda sumar sin ver el faltante. LO QUE NO SE PUDO HACER es
 * dejarlo escrito EN LA BASE: `liquidacion_quincena` no tiene `observacion` ni `nota` y no se
 * autorizó migración. Hoy el faltante vive en el log de la corrida y en el informe, no en Postgres.
 *
 * Lo que sigue siendo bloqueante es OTRA cosa: la plata ilegible. Una línea cuya cadena de pago no
 * cierra no se sabe cuánto es, y esa sí voltea la quincena entera.
 */
export function controlDeCierre(lineas = []) {
  const totalSheet = lineas.reduce((a, l) => a + (l.cobra ?? 0), 0)
  const bloqueantes = lineas.filter((l) => l.incompleta)
  const excluidas = lineas.filter((l) => !l.incompleta && !l.persona_id)
  const cargables = lineas.filter((l) => !l.incompleta && l.persona_id)
  const totalCargable = cargables.reduce((a, l) => a + (l.cobra ?? 0), 0)
  const montoExcluido = excluidas.reduce((a, l) => a + (l.cobra ?? 0), 0)
  return {
    totalSheet,
    totalCargable,
    diferencia: totalSheet - totalCargable,
    cargables,
    excluidas,
    montoExcluido,
    bloqueantes,
    problemas: [...bloqueantes, ...excluidas],
    cierra: bloqueantes.length === 0,
    completa: bloqueantes.length === 0 && excluidas.length === 0,
  }
}
