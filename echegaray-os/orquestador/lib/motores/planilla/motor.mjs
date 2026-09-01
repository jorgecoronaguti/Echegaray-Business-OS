// EL MOTOR DE PLANILLAS — la cara única. Acá vive el I/O; el criterio vive en los módulos puros.
//
// ═══ QUÉ INVIERTE ESTE ARCHIVO ═══
//
// Hoy la lógica de operar una planilla vive en `lib/tools/drive-write.mjs`: son TOOLS DE MODELO. Eso
// significa que leer una celda, ordenar una tabla o agregar una fila requieren que un modelo de
// lenguaje elija la tool, arme el JSON y lea el resultado — con su latencia, su costo y su
// posibilidad de equivocarse en el rango. Medido en este repo el 19/07 sobre UNA pestaña: 13 pasos,
// 100 segundos, $1,99, y dos escrituras que dieron #N/A.
//
// Ninguna de esas operaciones tiene nada que decidir. Acá bajan a código: la tool queda como cara
// fina que llama a esto, y cualquier script, worker o endpoint puede hacer lo mismo sin modelo.
//
// ═══ EL CONTRATO: TODA ESCRITURA SE RELEE ═══
//
// Cada operación de escritura devuelve `{ ok, rango, verificado, huella }` y `verificado` no es una
// promesa: es el resultado de haber vuelto a leer el destino y comparado celda por celda. Si no
// coincide, no devuelve un `ok:false` cortés — LANZA `ESCRITURA_NO_PERSISTIO` con el diff. Una
// escritura que se cree hecha y no lo está es peor que una que falla.
//
// ═══ TODAVÍA NO TIENE UN SOLO CONSUMIDOR (01/09/2026) ═══
//
// Nada fuera de `lib/motores/planilla/` invoca este motor: ni una tool, ni un endpoint, ni un script
// que el dueño pueda correr. `lib/tools/drive-write.mjs` sigue con su propia lógica, así que la
// inversión que este motor hace posible **todavía no está aplicada**. Está dicho acá y no en un
// informe porque un informe se archiva: mientras esta línea exista, el trabajo no terminó.
//
// No se migraron esas tools desde acá a propósito: llevan `yaGuardado: true` porque pasan por la
// cola de aprobación del dueño, y cambiarles la semántica de escritura es una decisión de
// integración, no de esta lane.
//
// ═══ LO QUE ESTE MOTOR NO HACE, A PROPÓSITO ═══
//
// · No levanta el freno de escritura de Sheets ni lo consulta por su cuenta: `google.mjs` ya lo
//   hace en las cinco funciones que mandan bytes, y duplicar el chequeo crearía una segunda
//   verdad sobre si se puede escribir.
// · No decide `respetar:false`. La Regla 0 (fusionar, no pisar lo que editó una persona) es de
//   `escribirPreservando`, y este motor la usa como está.

import { motivoValido } from '../../congelador-sheets.mjs'
import { CODIGOS, ErrorPlanilla, fallar } from './errores.mjs'
import {
  citarHoja, dimensiones, formatearCelda, formatearRango, letraCol,
  parsearRango, rangoDeGrilla, rectangular,
} from './direcciones.mjs'
import { formatoDe, permite } from './formatos.mjs'
import { TIPOS, tipoDe, validarTipos } from './tipos.mjs'
import { compararEscritura, huella, resumirDiferencias } from './verificacion.mjs'
import { buscar, filtrar, leerTabla, ordenar, planUpsert } from './tabla.mjs'
import {
  borrarHoja, copiarHoja, crearHoja, definirRangoConNombre,
  crearPlanilla as _crearPlanilla, duplicarTemplate as _duplicarTemplate,
} from './estructura.mjs'

/**
 * EL PISO: los IDs que este motor NUNCA escribe, ni con intención declarada.
 *
 * ═══ POR QUÉ ESTO NO ES LA DEFENSA PRINCIPAL (01/09/2026, auditoría) ═══
 *
 * Esta lista tenía UN solo id —el Cash Flow— y dejaba escribibles el P&L, el Avance de obras y el
 * espejo de JORNALES. Es la trampa de la red de seguridad que se alimenta de una lista, que este
 * repo ya pagó: **una lista que hay que acordarse de mantener no es una red**, porque su modo de
 * falla es el silencio (olvidarse de agregar un archivo = escribirlo).
 *
 * La defensa principal se invirtió: **se escribe sólo donde el llamador DECLARÓ que quiere
 * escribir** (ver `motivoDeEscritura`). Así el olvido falla CERRADO —no declaraste, no escribís— en
 * vez de fallar abierto.
 *
 * Esta lista queda como PISO, y `fuentes-declaradas.test.mjs` la mantiene honesta: deduce del código
 * los Sheets de producción (los `export const *_FILE_ID` / `*_SHEET_ID` del repo) y exige que cada
 * uno esté acá o esté declarado escribible a propósito. Si mañana aparece una fuente nueva y nadie
 * la clasifica, ese test se pone rojo el día que se agrega, no el día que se pisa.
 */
export const PROHIBIDOS_ESCRIBIR = Object.freeze(new Set([
  '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8', // Flujo de Caja - Cash Flow
  '1-NAqlEuKoB0IqCY4res5OiJhbbz_7-F2M-zmpnkpMYg', // Ingresos y Egresos - P&L  (lib/pyl.mjs)
  '1XHiqSC1wiMVrXAob8H_koN5vHr9BQLLvXn61yIW18Ug', // Avance de obras          (lib/obra-cronograma.mjs)
  '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk', // JORNALES (espejo)        (lib/espejo-jornales.mjs)
]))

/**
 * ¿EL LLAMADOR DECLARÓ QUE QUIERE ESCRIBIR, Y PARA QUÉ?
 *
 * Se pide un MOTIVO y no un `true` a propósito, con la misma vara que el freno de mano
 * (`congelador-sheets.mjs::motivoValido`, reusada para que exista UNA sola definición de "esto es
 * una decisión"): un booleano se pone por accidente al copiar una línea, un motivo de ocho
 * caracteres no. Y queda escrito en el error de cualquier guarda que se cruce después.
 */
export function motivoDeEscritura(escribir) {
  // EL TIPO SE EXIGE ACÁ, y no se delega. `motivoValido({})` devuelve `true`: `String({})` es
  // "[object Object]", quince caracteres que no matchean ninguna palabra trivial. O sea que un
  // objeto pasado por error —un `{ actor, motivo }` mal desestructurado, lo más fácil del mundo—
  // habilitaría la escritura con un motivo que no dice nada. Lo descubrió el test de esta guarda.
  if (typeof escribir !== 'string') return null
  return motivoValido(escribir) ? escribir.trim() : null
}

/** El render que se usa para leer un valor cuando importa el DATO y no cómo se ve. Es la cura de
 *  la trampa dd/mm/yy: un serial no se puede leer al revés. */
const SIN_FORMATO = 'UNFORMATTED_VALUE'

/**
 * Abre una planilla y devuelve su superficie de operaciones.
 *
 * Hace UNA llamada de metadatos al abrir —para saber el formato— y de ahí en más cada operación
 * paga sólo lo suyo. Sin ese paso, un `.xlsm` se descubriría recién al fallar la escritura, que es
 * el momento en el que ya es tarde.
 *
 * @param {object} google cliente de `lib/google.mjs`
 * @param {string} fileId
 * @param {{permitirEscrituraEn?: (id:string)=>boolean}} [opciones]
 */
export async function abrirPlanilla(google, fileId, opciones = {}) {
  if (!fileId) fallar(CODIGOS.RANGO_INVALIDO, 'abrirPlanilla: falta el fileId')
  const meta = await google.fileMeta(fileId)
  const formato = formatoDe(meta)
  const cap = permite(formato, 'leer')
  if (cap) {
    fallar(CODIGOS.FORMATO_NO_SOPORTADO, `no puedo leer "${meta.name}": ${cap.motivo}`,
      { fileId, formato, alternativa: cap.alternativa })
  }
  return new Planilla(google, fileId, meta, formato, opciones)
}

export class Planilla {
  constructor(google, fileId, meta, formato, opciones = {}) {
    this.google = google
    this.fileId = fileId
    this.meta = meta
    this.formato = formato
    this.opciones = opciones
    /** La intención declarada de escribir, con su motivo. `null` = planilla de sólo lectura. */
    this.escritura = motivoDeEscritura(opciones.escribir)
  }

  // ─────────────────────────────── guardas ───────────────────────────────

  /** Un rango se acepta si parsea Y es cerrado. Ver la regla 1 de `direcciones.mjs`. */
  _rango(ref, { permitirAbierto = false } = {}) {
    const r = parsearRango(ref) // lanza RANGO_INVALIDO si no parsea
    if (r.abierto && !permitirAbierto) {
      fallar(CODIGOS.RANGO_ABIERTO,
        `"${ref}" es un rango abierto: no se puede escribir ni verificar contra él. Cerralo `
        + '(ej. A5:C1000): un rango abierto cambia de significado cada vez que alguien agrega una fila.',
        { rango: ref })
    }
    return r
  }

  /** Antes de cualquier escritura: intención declarada, formato apto y destino no prohibido. */
  _puedeEscribir(operacion = 'escribir') {
    // PRIMERO la intención: es la única guarda cuyo olvido falla CERRADO. Va antes que el formato
    // para que abrir un archivo "a ver qué tiene" no pueda escribirlo por un typo en el método.
    if (!this.escritura) {
      fallar(CODIGOS.ESCRITURA_NO_DECLARADA,
        `"${this.meta.name}" se abrió para LEER. Para escribir, abrila declarando para qué: `
        + "abrirPlanilla(google, fileId, { escribir: 'motivo de al menos 8 caracteres' }).",
        { fileId: this.fileId, operacion })
    }
    const cap = permite(this.formato, operacion)
    if (cap) {
      fallar(CODIGOS.FORMATO_NO_SOPORTADO,
        `"${this.meta.name}" es ${cap.formato} y este motor no lo escribe: ${cap.motivo}`,
        { fileId: this.fileId, formato: cap.formato, alternativa: cap.alternativa })
    }
    if (PROHIBIDOS_ESCRIBIR.has(this.fileId) && !this.opciones.permitirEscrituraEn?.(this.fileId)) {
      fallar(CODIGOS.DESTINO_PROHIBIDO,
        `"${this.meta.name}" es FUENTE: se lee y no se escribe, ni declarando un motivo. `
        + `El motivo declarado era: "${this.escritura}".`,
        { fileId: this.fileId, motivoDeclarado: this.escritura })
    }
  }

  /** La API responde `{protegido:true}` cuando una guarda descartó el lote — el freno de mano, un
   *  candado de pestaña o la firma. Un 200 con `protegido` NO es una escritura, y confundirlo es
   *  exactamente cómo un generador cree haber escrito y no escribió. */
  _siProtegido(res, rango) {
    if (!res || typeof res !== 'object' || !res.protegido) return
    const codigo = res.congelado ? CODIGOS.ESCRITURA_CONGELADA : CODIGOS.PESTANA_PROTEGIDA
    fallar(codigo, res.congelado
      ? `la escritura de Sheets está congelada: no toqué ${rango}.`
      : `una guarda descartó la escritura sobre ${rango} (candado, firma o no-borrar).`,
      { rango, respuesta: res })
  }

  // ─────────────────────────────── lectura ───────────────────────────────

  /** Las hojas del archivo: `[{ sheetId, title, hidden, rows, cols }]`. */
  async hojas() {
    return this.google.getSheetMeta(this.fileId)
  }

  /** La hoja por nombre. Lanza `HOJA_INEXISTENTE` con la lista de las que SÍ están — sin eso, el
   *  llamador tiene que hacer una segunda llamada sólo para enterarse de cómo se llamaba. */
  async hoja(nombre) {
    const todas = await this.hojas()
    const h = todas.find((s) => s.title === nombre)
    if (!h) {
      fallar(CODIGOS.HOJA_INEXISTENTE, `la hoja "${nombre}" no existe en "${this.meta.name}"`,
        { hoja: nombre, existentes: todas.map((s) => s.title) })
    }
    return h
  }

  /** UNA celda. Devuelve `{ valor, formula, tipo, direccion }` — el tipo viene resuelto porque el
   *  llamador que tiene que reinferirlo termina inventando su propia regla de fechas. */
  async leerCelda(ref) {
    const r = this._rango(ref)
    const d = dimensiones(r)
    if (d.filas !== 1 || d.columnas !== 1) {
      fallar(CODIGOS.RANGO_INVALIDO, `"${ref}" no es una celda sino ${d.filas}x${d.columnas}`, { rango: ref })
    }
    const [valores, formulas] = await Promise.all([
      this.google.readSheetValues(this.fileId, ref, { render: SIN_FORMATO }),
      this.google.readSheetValues(this.fileId, ref, { render: 'FORMULA' }),
    ])
    const valor = valores?.[0]?.[0] ?? null
    const crudo = formulas?.[0]?.[0]
    const formula = typeof crudo === 'string' && crudo.startsWith('=') ? crudo : null
    return { direccion: formatearRango(r), valor, formula, tipo: tipoDe(valor, { formula }) }
  }

  /**
   * UN RANGO, como rectángulo completo.
   *
   * `render` por defecto es `UNFORMATTED_VALUE`: se quiere el dato, no su apariencia. Quien
   * necesite lo que se VE pide `FORMATTED_VALUE` a sabiendas.
   *
   * SIEMPRE devuelve el rectángulo entero. La API recorta las filas y columnas vacías del final, y
   * un llamador que confía en `values.length` cree que la tabla tiene 12 filas cuando pidió 50 —
   * después escribe en la 13 pensando que está vacía y pisa la 13 real.
   */
  async leerRango(ref, { render = SIN_FORMATO, relleno = '' } = {}) {
    const r = this._rango(ref)
    const bruto = await this.google.readSheetValues(this.fileId, ref, { render })
    const grid = rectangular(bruto, dimensiones(r), relleno)
    return { rango: formatearRango(r), grid, huella: huella(grid) }
  }

  /** El rango con su FORMATO y su TIPO por celda: `{ valor, formula, derivada, formatoNumero }`.
   *  `derivada` marca las celdas que tienen valor y NADIE escribió — el derrame de una fórmula
   *  matricial. Sin esa marca, un import cuenta 5.593 números tipeados donde hay una IMPORTRANGE. */
  async leerConFormato(ref) {
    const r = this._rango(ref)
    const g = await this.google.readSheetGrid(this.fileId, ref)
    const { filas, columnas } = dimensiones(r)
    const grid = Array.from({ length: filas }, (_, f) => Array.from({ length: columnas }, (_, c) => {
      const celda = g.filas?.[f]?.[c] ?? {}
      return {
        valor: celda.valor ?? null,
        numero: celda.numero ?? null,
        formula: celda.formula ?? null,
        derivada: !!celda.derivada,
        formatoNumero: celda.formato ?? null,
        tipo: tipoDe(celda.numero ?? celda.valor, { formula: celda.formula }),
      }
    }))
    return { rango: formatearRango(r), hoja: g.titulo, grid, merges: g.merges ?? [] }
  }

  /** Las reglas de validación (desplegables) de un rango, por celda. Se leen ANTES de escribir una
   *  columna con desplegable: escribir un valor fuera de la lista lo deja marcado en rojo y el
   *  filtro de la planilla deja de encontrarlo. */
  async leerValidaciones(ref) {
    this._rango(ref)
    const hojas = await this.google.readSheetValidations(this.fileId, ref)
    const s = hojas?.[0]
    const data = s?.data?.[0] ?? {}
    const out = []
    ;(data.rowData ?? []).forEach((fila, f) => {
      ;(fila.values ?? []).forEach((celda, c) => {
        const v = celda?.dataValidation
        if (!v) return
        out.push({
          fila: f + (data.startRow ?? 0),
          col: c + (data.startColumn ?? 0),
          condicion: v.condition?.type ?? null,
          opciones: (v.condition?.values ?? []).map((x) => x.userEnteredValue).filter((x) => x !== undefined),
          estricta: !!v.strict,
        })
      })
    })
    return { hoja: s?.properties?.title ?? null, validaciones: out }
  }

  /** Los rangos con NOMBRE del archivo: `[{ nombre, id, rango }]`, ya en A1. Un nombre es la única
   *  ancla que sobrevive a que alguien inserte una fila arriba. */
  async leerRangosConNombre() {
    const hojas = await this.hojas()
    const porId = new Map(hojas.map((h) => [h.sheetId, h.title]))
    const crudos = await this.google.getNamedRanges(this.fileId)
    return crudos.map((n) => {
      const g = n.range ?? {}
      const hoja = porId.get(g.sheetId) ?? null
      const desde = { fila: g.startRowIndex ?? 0, col: g.startColumnIndex ?? 0 }
      const hasta = { fila: (g.endRowIndex ?? 1) - 1, col: (g.endColumnIndex ?? 1) - 1 }
      return { nombre: n.name, id: n.namedRangeId, hoja, rango: formatearRango({ hoja, desde, hasta }) }
    })
  }

  // ──────────────────── tabla: buscar · filtrar · ordenar ────────────────────

  /**
   * Lee un rango COMO TABLA (encabezado + filas) y devuelve las cuatro operaciones ya atadas a
   * ella. Se lee UNA vez y se opera N: buscar, filtrar y ordenar sobre la misma lectura no cuestan
   * ninguna llamada más.
   *
   * `direccionDe(indice, col)` traduce un resultado de vuelta a su dirección real en la hoja: sin
   * eso, "la fila 7 del filtro" no se puede escribir.
   */
  async abrirTabla(ref, { filaEncabezado = 0, render = SIN_FORMATO } = {}) {
    const r = this._rango(ref)
    const { grid } = await this.leerRango(ref, { render })
    const tabla = leerTabla(grid, { filaEncabezado })
    const base = { fila: r.desde.fila + tabla.offsetDatos, col: r.desde.col }
    const hoja = r.hoja
    return {
      ...tabla,
      rango: formatearRango(r),
      huella: huella(grid),
      direccionDe: (indice, col = 0) => (hoja ? `${citarHoja(hoja)}!` : '')
        + formatearCelda({ fila: base.fila + indice, col: base.col + col }),
      buscar: (campo, valor, o) => buscar(tabla, campo, valor, o),
      filtrar: (condiciones) => filtrar(tabla, condiciones),
      ordenar: (criterios) => ordenar(tabla, criterios),
      planUpsert: (campoClave, registros) => planUpsert(tabla, campoClave, registros),
    }
  }

  // ─────────────────────────────── escritura ───────────────────────────────

  /**
   * ESCRIBIR UN RANGO, Y PROBARLO.
   *
   * @param {string} ref rango A1 CERRADO. El ancho y el alto que declara tienen que ser los de la
   *        grilla: escribir 5 filas declarando 3 deja las 2 de abajo con lo de la corrida anterior.
   * @param {any[][]} grid
   * @param {object} [o]
   * @param {string} [o.revision] huella tomada antes; si el destino cambió desde entonces, se
   *        rechaza con `REVISION_VIEJA` en vez de pisar lo que otro escribió.
   * @param {(string|null)[]} [o.esquema] tipo esperado por columna; se valida ANTES de mandar nada.
   * @param {number} [o.filasEncabezado] cuántas filas de arriba NO son datos (el esquema las saltea).
   * @param {boolean} [o.espejo] pestaña `_RAW`: sin Regla 0. Sólo para copias de una fuente externa.
   */
  async escribirRango(ref, grid, o = {}) {
    this._puedeEscribir()
    const r = this._rango(ref)
    const dims = dimensiones(r)
    const esperado = this._prepararGrilla(ref, grid, r, dims, o)

    if (o.revision !== undefined) await this._exigirRevision(ref, o.revision)

    const res = await this.google.updateSheetValues(this.fileId, formatearRango(r), esperado, { espejo: !!o.espejo })
    this._siProtegido(res, ref)
    return this._verificar(this._dondeAterrizo(res, r), esperado)
  }

  /**
   * DÓNDE ATERRIZÓ DE VERDAD LA ESCRITURA — no dónde se pidió que aterrizara.
   *
   * ═══ EL AGUJERO QUE CIERRA (01/09/2026, auditoría) ═══
   *
   * El encabezado de `verificacion.mjs` dice que la API «devuelve 200 igual si el valor aterrizó en
   * la pestaña equivocada porque el rango tenía un nombre parecido», y ése era exactamente el caso
   * que este motor NO podía detectar: releía con LA MISMA CADENA con la que había escrito. Si Google
   * resuelve mal el nombre, la escritura y la relectura van al mismo lugar equivocado, coinciden, y
   * el control dice que sí. Un control que se compara contra sí mismo no es un control.
   *
   * `updatedRange` lo escribe el SERVIDOR, después de resolver el nombre: es la única fuente que
   * puede contradecir al llamador. `agregarFilas` ya lo usaba —ahí es imprescindible porque el
   * append elige la fila— y acá faltaba.
   *
   * Si la respuesta no lo trae, NO se cae a la cadena pedida: eso reabriría el agujero en silencio.
   */
  _dondeAterrizo(res, pedido) {
    const crudo = res?.updatedRange
    if (!crudo) {
      fallar(CODIGOS.ESCRITURA_NO_PERSISTIO,
        `la API no dijo dónde aterrizó la escritura sobre ${formatearRango(pedido)}: no hay contra qué verificar.`,
        { rango: formatearRango(pedido), respuesta: res })
    }
    const real = parsearRango(crudo)
    // Se comparan las ESTRUCTURAS, no las cadenas: la API devuelve `Datos!E1` donde el motor pidió
    // `Datos!E1:E1`, y son el mismo lugar.
    const mismo = (real.hoja ?? null) === (pedido.hoja ?? null)
      && real.desde?.fila === pedido.desde.fila && real.desde?.col === pedido.desde.col
      && real.hasta?.fila === pedido.hasta.fila && real.hasta?.col === pedido.hasta.col
    if (!mismo) {
      fallar(CODIGOS.ESCRITURA_NO_PERSISTIO,
        `pedí escribir ${formatearRango(pedido)} y la escritura aterrizó en ${crudo}.`,
        { pedido: formatearRango(pedido), aterrizo: crudo })
    }
    return real
  }

  /** Valida forma y tipos antes de gastar una llamada. Separado de `escribirRango` para que esa
   *  función no pase de 50 líneas y para poder probar la validación sin API. */
  _prepararGrilla(ref, grid, r, dims, o) {
    if (!Array.isArray(grid) || !grid.length) {
      fallar(CODIGOS.RANGO_INVALIDO, 'escribirRango: la grilla está vacía', { rango: ref })
    }
    const real = rangoDeGrilla(r.hoja, formatearCelda(r.desde), grid)
    const dReal = dimensiones(real)
    if (dReal.filas !== dims.filas || dReal.columnas !== dims.columnas) {
      fallar(CODIGOS.RANGO_INVALIDO,
        `la grilla es ${dReal.filas}x${dReal.columnas} y el rango "${ref}" es ${dims.filas}x${dims.columnas}: `
        + 'el bloque tiene que declarar TODO su alto y TODO su ancho, o queda viva la capa anterior.',
        { rango: ref, grilla: dReal, declarado: dims })
    }
    if (o.esquema) {
      // `filasEncabezado` NO tiene un valor por defecto adivinado. Un esquema que se aplicara a la
      // fila 0 rechazaría todo bloque con encabezado —"Neto" no es un número— y la reacción sería
      // dejar de pasar esquema, que es perder la validación entera. Quien declara tipos declara
      // también dónde arrancan los datos.
      const salto = Number(o.filasEncabezado ?? 0)
      const malas = validarTipos(grid.slice(salto), o.esquema)
      if (malas.length) {
        const m = malas[0]
        const donde = formatearCelda({ fila: r.desde.fila + salto + m.fila, col: r.desde.col + m.col })
        fallar(CODIGOS.TIPO_INVALIDO,
          `${donde} espera ${m.esperado} y recibió ${m.recibido} (${JSON.stringify(m.valor)})`,
          { rango: ref, celdas: malas.slice(0, 20), total: malas.length, filasEncabezado: salto })
      }
    }
    return rectangular(grid, dims)
  }

  /** UNA celda. Es `escribirRango` de 1x1, y existe con nombre propio porque es la operación más
   *  pedida y porque un llamador que arma `[[v]]` a mano se equivoca de anidamiento. */
  async escribirCelda(ref, valor, o = {}) {
    return this.escribirRango(ref, [[valor]], o)
  }

  /**
   * ESCRIBIR UNA FÓRMULA. Se manda en formato CANÓNICO (coma separadora, punto decimal): la
   * conversión a es-AR (`;` separador, `,` decimal) la hace `google.mjs` mirando el locale REAL del
   * archivo, y por eso no se duplica acá — dos conversores del mismo dato terminan discrepando.
   *
   * Se escribe SÓLO EL ANCLA de una fórmula matricial. Escribir el derrame de una ARRAYFORMULA pisa
   * con texto lo que la fórmula tiene que calcular, y el resultado no da error: da números viejos.
   */
  async escribirFormula(ref, formula, o = {}) {
    const f = String(formula ?? '').trim()
    if (!f.startsWith('=')) {
      fallar(CODIGOS.FORMULA_ROTA, `una fórmula empieza con "=": recibí ${JSON.stringify(formula)}`, { rango: ref, formula })
    }
    return this.escribirRango(ref, [[f]], o)
  }

  /**
   * AGREGAR FILAS AL FINAL. Usa `append` con `INSERT_ROWS`: no pisa nada de lo que haya debajo.
   *
   * Verifica leyendo el rango que la API dice haber escrito — no el que uno supone. La API decide
   * dónde aterrizan las filas (busca el final real de la tabla), y verificar contra la suposición
   * del llamador es verificar contra uno mismo.
   */
  async agregarFilas(ref, filas, o = {}) {
    this._puedeEscribir()
    this._rango(ref, { permitirAbierto: true }) // el ancla de un append puede ser 'Hoja!A:D'
    if (!Array.isArray(filas) || !filas.length) {
      fallar(CODIGOS.RANGO_INVALIDO, 'agregarFilas: no hay filas que agregar', { rango: ref })
    }
    const ancho = Math.max(...filas.map((f) => (f ?? []).length), 1)
    const esperado = rectangular(filas, { filas: filas.length, columnas: ancho })
    if (o.esquema) this._prepararGrilla(ref, esperado, parsearRango(ref), { filas: filas.length, columnas: ancho }, o)

    const res = await this.google.appendSheetValues(this.fileId, ref, esperado, { espejo: !!o.espejo })
    this._siProtegido(res, ref)
    const aterrizo = res?.updates?.updatedRange
    if (!aterrizo) {
      fallar(CODIGOS.ESCRITURA_NO_PERSISTIO,
        'el append no devolvió el rango donde aterrizaron las filas: no hay contra qué verificar.',
        { rango: ref, respuesta: res })
    }
    return this._verificar(parsearRango(aterrizo), esperado)
  }

  /**
   * ESCRIBIR PRESERVANDO — la Regla 0. Donde la grilla trae contenido gana la grilla; donde la
   * grilla deja vacío, se conserva lo que la persona escribió.
   *
   * Es el camino por defecto para cualquier bloque que se REGENERA. `escribirRango` pisa, y pisar
   * un bloque que una persona anota es cómo se perdieron seis veces las ediciones del dueño.
   */
  async escribirPreservando(ref, grid, o = {}) {
    this._puedeEscribir()
    const r = this._rango(ref)
    const { escribirPreservando } = await import('../../preservar-anotaciones.mjs')
    const res = await escribirPreservando(this.google, this.fileId, citarHoja(r.hoja), grid, {
      fila0: r.desde.fila + 1,
      col0: r.desde.col,
      anchoHoja: dimensiones(r).columnas,
      respetar: o.espejo ? false : (o.respetar ?? true),
      espejo: !!o.espejo,
    })
    if (res?.bloqueada || res?.editadaPorHumano || res?.noVerificable) {
      fallar(CODIGOS.PESTANA_PROTEGIDA,
        `no escribí "${r.hoja}": ${res.bloqueada ? 'está candada' : res.editadaPorHumano ? 'la editó una persona' : 'no pude verificar su estado'}.`,
        { rango: ref, resultado: res })
    }
    return { ok: true, rango: formatearRango(r), conservadas: res?.conservadas ?? [], respetadas: res?.respetadas ?? [] }
  }

  // ─────────────────────────── estructura (ver estructura.mjs) ───────────────────────────
  //
  // Delegan a `estructura.mjs`: son operaciones sobre la FORMA del archivo (batchUpdate + Drive),
  // no sobre su contenido, y separarlas mantiene este archivo dentro del límite de 500 líneas del
  // repo. Se exponen como métodos igual porque `planilla.crearHoja(...)` es la forma en que se las
  // va a llamar, y una API partida en dos estilos se usa mal.

  /** Crea una HOJA nueva (idempotente: si ya existe, devuelve la que hay). */
  async crearHoja(titulo, o) { return crearHoja(this, titulo, o) }

  /** COPIA una hoja dentro del mismo archivo, con fórmulas y formato. */
  async copiarHoja(origen, destino, o) { return copiarHoja(this, origen, destino, o) }

  /** Borra una hoja y verifica releyendo que ya no esté. */
  async borrarHoja(titulo) { return borrarHoja(this, titulo) }

  /** Publica (o reapunta) un RANGO CON NOMBRE, y verifica a dónde quedó apuntando. */
  async definirRangoConNombre(nombre, ref) { return definirRangoConNombre(this, nombre, ref) }

  // ─────────────────────────── verificación interna ───────────────────────────

  /** La huella actual del rango. Se toma ANTES de una escritura para poder pasarla como `revision`. */
  async revisionDe(ref) {
    const { huella: h } = await this.leerRango(ref)
    return h
  }

  async _exigirRevision(ref, revision) {
    const actual = await this.revisionDe(ref)
    if (actual === revision) return
    fallar(CODIGOS.REVISION_VIEJA,
      `${ref} cambió desde que lo leíste: no piso lo que escribió otro. Releelo y volvé a intentar.`,
      { rango: ref, revisionEsperada: revision, revisionActual: actual })
  }

  /** RELEE Y COMPARA. Es lo que convierte un 200 en evidencia. Ver `verificacion.mjs` para por qué
   *  hay dos lecturas y por qué la de fórmulas sólo se mira donde se escribió una fórmula. */
  async _verificar(r, esperado) {
    const ref = formatearRango(r)
    const hayFormula = esperado.some((f) => f.some((c) => tipoDe(c) === TIPOS.FORMULA))
    const [valores, formulas] = await Promise.all([
      this.google.readSheetValues(this.fileId, ref, { render: SIN_FORMATO }),
      hayFormula ? this.google.readSheetValues(this.fileId, ref, { render: 'FORMULA' }) : Promise.resolve(null),
    ])
    const dims = dimensiones(r)
    const leido = rectangular(valores, dims)
    const leidoF = formulas ? rectangular(formulas, dims) : null
    const { ok, diferencias } = compararEscritura(esperado, leido, leidoF)
    if (!ok) {
      const direccionar = (f, c) => formatearCelda({ fila: r.desde.fila + f, col: r.desde.col + c })
      // ═══ NO ES LO MISMO "NO ATERRIZÓ" QUE "UNA GUARDA CONSERVÓ CONTENIDO" (31/08/2026) ═══
      //
      // `no-borrar.mjs` convierte toda celda VACÍA que caería sobre contenido en "dejá lo que hay".
      // Es la Regla 0 y está bien que exista. Pero entonces la relectura devuelve el contenido viejo
      // donde el llamador mandó vacío, y reportar eso como ESCRITURA_NO_PERSISTIO manda a buscar un
      // problema de red donde hubo una decisión deliberada del sistema.
      //
      // El llamador tiene tres salidas y ninguna se adivina: usar `escribirPreservando` (lo normal
      // para un bloque que se regenera), marcar la celda como propia con el centinela `VACIO` de
      // `preservar-anotaciones.mjs`, o dejarla como está. Por eso es un código aparte.
      const soloConservadas = diferencias.every((d) => d.motivo === 'valor_distinto'
        && String(esperado[d.fila]?.[d.col] ?? '') === '' && ![null, undefined, ''].includes(d.leido))
      if (soloConservadas) {
        fallar(CODIGOS.CONTENIDO_CONSERVADO,
          `no escribí vacío sobre contenido en ${ref} — ${resumirDiferencias(diferencias, direccionar)}. `
          + 'Si el bloque se regenera usá escribirPreservando(); si esa celda es tuya y va vacía, '
          + 'mandá el centinela VACIO de preservar-anotaciones.mjs.',
          { rango: ref, diferencias, conservadas: diferencias.length })
      }
      fallar(CODIGOS.ESCRITURA_NO_PERSISTIO,
        `escribí ${ref} y al releer no coincide — ${resumirDiferencias(diferencias, direccionar)}`,
        { rango: ref, diferencias })
    }
    return { ok: true, rango: ref, verificado: true, celdas: dims.filas * dims.columnas, huella: huella(leido) }
  }
}

// ─────────────────────── crear y duplicar un WORKBOOK ───────────────────────
//
// Se re-exportan con `abrir` ya inyectado: `estructura.mjs` no puede importar `abrirPlanilla` de
// acá sin crear un ciclo, así que recibe la función. El llamador no se entera.

/** Crea una planilla nueva de Google Sheets (en es-AR) y la abre. */
export async function crearPlanilla(google, nombre, o = {}) {
  return _crearPlanilla(google, nombre, { ...o, abrir: abrirPlanilla })
}

/** Copia un template completo —fórmulas, formato, validaciones— y abre la copia. El original no se toca. */
export async function duplicarTemplate(google, templateId, nombre, o = {}) {
  return _duplicarTemplate(google, templateId, nombre, { ...o, abrir: abrirPlanilla })
}

export { CODIGOS, ErrorPlanilla }
export { letraCol, parsearRango, formatearRango, formatearCelda, citarHoja }
