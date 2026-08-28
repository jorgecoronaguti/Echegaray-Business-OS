// CUANTA MANO DE OBRA SE LLEVO CADA OBRA - leido de JORNALES, no deducido.
//
// POR QUE EXISTE (28/08/2026). Le pidieron al OS el costo de mano de obra por obra y contesto "NO SE
// PUDO ATRIBUIR", mirando tablas de Postgres que estan vacias. La planilla JORNALES lo tiene cargado
// desde siempre: CLIENTE en la columna AB y OBRA en la AC, persona por persona y quincena por
// quincena. El dato estaba; lo que faltaba era abrir la planilla.
//
// TODO ACA ES PURO. Entra la grilla que ya devolvio readSheetGrid y un mapa de nombres; sale la
// estructura. Sin red, sin base, sin fecha del sistema - por eso se puede testear entero.
//
// LAS TRES REGLAS QUE GOBIERNAN ESTE ARCHIVO
//
// 1. NINGUNA COORDENADA SE ASUME. El ancho de los bloques cambia -se vieron 10, 11, 12, 13 y 16
//    columnas de fecha- y las columnas de plata se mueven con el. La columna de horas y la de valor
//    hora se DERIVAN de las formulas que la planilla ya tiene escritas; si no se pueden derivar, la
//    persona sale con hueco declarado y su plata no se inventa.
// 2. UNA CELDA VACIA NO ES UN CERO, Y TAMPOCO ES UN CONTROL HECHO. Si el mapa de nombres no se pudo
//    leer, el resultado NO es "todos desconocidos": es NO_VERIFICABLE, que es otra cosa y bloquea.
// 3. UN ROTULO NO SE RESUELVE POR PARECIDO. "MESSINA" y "MESSINAS" difieren en una letra y en
//    $ 1.333.000. Lo que no esta en el mapa sale DESCONOCIDO y se informa; nunca se adivina.

import {
  normalizarClave, parseHoras, detectarBloques, trabajadoresDeBloque, letraColumna,
} from './jornales-estructura.mjs'

/** Como quedo resuelto el rotulo de la columna CLIENTE de una fila. */
export const CLASE = Object.freeze({
  CLIENTE: 'CLIENTE',
  NO_ES_CLIENTE: 'NO_ES_CLIENTE',
  DESCONOCIDO: 'DESCONOCIDO',
  SIN_ROTULO: 'SIN_ROTULO',
  NO_VERIFICABLE: 'NO_VERIFICABLE',
})

/** Por que una fila no pudo valuarse. Cada hueco es explicito: no hay ceros de relleno. */
export const HUECO = Object.freeze({
  SIN_COLUMNA_HORAS: 'sin_columna_horas',
  SIN_VALOR_HORA: 'sin_valor_hora',
  CELDA_ILEGIBLE: 'celda_ilegible',
})

/**
 * NUCLEO PURO: a que cliente canonico corresponde este rotulo?
 *
 * `mapa` es { leido: boolean, alias: Map<clave, canonico>, noCliente: Map<clave, motivo> }.
 * Cuando `leido` no es exactamente true, TODO sale NO_VERIFICABLE: un mapa que no se pudo leer no
 * autoriza a decir "este rotulo no existe".
 */
export function resolverCliente(rotulo, mapa) {
  if (mapa?.leido !== true) return { cliente: null, clase: CLASE.NO_VERIFICABLE }
  const clave = normalizarClave(rotulo)
  if (!clave) return { cliente: null, clase: CLASE.SIN_ROTULO }
  const motivo = mapa.noCliente?.get(clave)
  if (motivo != null) return { cliente: null, clase: CLASE.NO_ES_CLIENTE, motivo }
  const canonico = mapa.alias?.get(clave)
  if (canonico != null) return { cliente: canonico, clase: CLASE.CLIENTE }
  return { cliente: null, clase: CLASE.DESCONOCIDO, rotulo: String(rotulo).trim() }
}

const RE_SUMA_HORAS = /^=SUM\(([A-Z]+)(\d+):([A-Z]+)\d+\)$/i
const RE_PRODUCTO = /^=([A-Z]+)(\d+)\s*\*\s*([A-Z]+)\2$/i

/** Letra de columna A1 a indice 0. 'A' da 0, 'AA' da 26. null si no es una letra de columna. */
export function indiceColumna(letra) {
  const s = String(letra ?? '').toUpperCase()
  if (!/^[A-Z]+$/.test(s)) return null
  let n = 0
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * NUCLEO PURO: donde estan las horas y el valor hora de ESTA fila, derivados de sus propias formulas.
 *
 * La planilla escribe =SUM(F497:T497) en la columna de horas y =V497*W497 en la del total. Con esas
 * dos se despeja todo: la del SUM es la de horas, y en el producto la que no es la de horas es la
 * del valor hora. Nada de esto esta pegado en el codigo a proposito - cuando el bloque cambia de
 * ancho, la formula cambia con el y esto sigue funcionando.
 */
export function columnasDeDinero(fila) {
  const vacio = { colHoras: null, colValorHora: null, colTotal: null }
  if (!Array.isArray(fila)) return vacio
  let colHoras = null
  for (let j = 0; j < fila.length; j++) {
    const f = fila[j]?.formula
    if (typeof f === 'string' && RE_SUMA_HORAS.test(f)) { colHoras = j; break }
  }
  if (colHoras == null) return vacio
  const letraHoras = letraColumna(colHoras)
  for (let j = 0; j < fila.length; j++) {
    const f = fila[j]?.formula
    if (typeof f !== 'string') continue
    const m = RE_PRODUCTO.exec(f)
    if (!m) continue
    const a = m[1].toUpperCase()
    const b = m[3].toUpperCase()
    if (a === letraHoras) return { colHoras, colValorHora: indiceColumna(b), colTotal: j }
    if (b === letraHoras) return { colHoras, colValorHora: indiceColumna(a), colTotal: j }
  }
  return { colHoras, colValorHora: null, colTotal: null }
}

/** Horas de UNA celda diaria. escrita:false cuando no hay nada escrito - que NO es cero. */
function horasDeCelda(c) {
  if (!c) return { valor: null, escrita: false }
  const escrita = c.formula != null || c.valor != null
  if (!escrita) return { valor: null, escrita: false }
  const n = typeof c.numero === 'number' ? c.numero : parseHoras(c.valor)
  if (n == null || !Number.isFinite(n)) return { valor: null, escrita: true, ilegible: true }
  return { valor: n, escrita: true }
}

/**
 * NUCLEO PURO: el costo de mano de obra de una ventana, abierto por obra.
 *
 * `factorCargas` se aplica SOLO si viene un numero finito mayor o igual a cero. No tiene valor por
 * omision a proposito: un recargo de cargas sociales que aparece por default es exactamente el
 * numero que despues nadie puede rastrear. Sin factor, `cargas` queda en null y el total es el
 * jornal solo.
 */
export function costoPorObra(grid, { desde, hasta, mapa, factorCargas = null, anio = 2026 } = {}) {
  const conCargas = typeof factorCargas === 'number' && Number.isFinite(factorCargas) && factorCargas >= 0
  const filas = []
  const huecos = []
  let diasEnVentana = 0

  for (const b of detectarBloques(grid, { anio })) {
    const dentro = (b.fechas || []).filter((f) => f.iso >= desde && f.iso <= hasta)
    if (!dentro.length) continue
    diasEnVentana += dentro.length
    for (const t of trabajadoresDeBloque(grid, b)) {
      const fila = grid.filas[t.fila] || []
      const { colHoras, colValorHora } = columnasDeDinero(fila)
      const vh = colValorHora == null ? null : fila[colValorHora]?.numero
      const valorHoraValido = typeof vh === 'number' && Number.isFinite(vh)
      let horas = 0
      let diasConHoras = 0
      for (const f of dentro) {
        const h = horasDeCelda(fila[f.col])
        if (!h.escrita) continue
        if (h.ilegible) {
          huecos.push({
            tipo: HUECO.CELDA_ILEGIBLE,
            fila: t.fila1,
            columna: letraColumna(f.col),
            fecha: f.iso,
            contenido: String(fila[f.col]?.valor ?? fila[f.col]?.formula ?? '').slice(0, 40),
          })
          continue
        }
        horas += h.valor
        if (h.valor > 0) diasConHoras++
      }
      if (colHoras == null) huecos.push({ tipo: HUECO.SIN_COLUMNA_HORAS, fila: t.fila1, persona: t.nombre_original })
      if (!valorHoraValido) huecos.push({ tipo: HUECO.SIN_VALOR_HORA, fila: t.fila1, persona: t.nombre_original })

      const jornal = valorHoraValido ? horas * vh : null
      const r = resolverCliente(t.cliente_original, mapa)
      filas.push({
        ref: t.ref,
        fila: t.fila1,
        bloque: b.fila1,
        persona: t.nombre_original,
        categoria: t.categoria ?? null,
        rotuloCliente: t.cliente_original,
        cliente: r.cliente,
        clase: r.clase,
        motivo: r.motivo ?? null,
        obra: t.obra_original || null,
        horas,
        diasTrabajados: diasConHoras,
        valorHora: valorHoraValido ? vh : null,
        jornal,
        cargas: jornal == null || !conCargas ? null : jornal * factorCargas,
        costo: jornal == null ? null : jornal * (conCargas ? 1 + factorCargas : 1),
      })
    }
  }

  const porObra = new Map()
  for (const f of filas) {
    if (f.clase !== CLASE.CLIENTE) continue
    const k = `${f.cliente} ${f.obra ?? ''}`
    const a = porObra.get(k) ?? {
      cliente: f.cliente,
      obra: f.obra,
      horas: 0,
      jornal: 0,
      cargas: conCargas ? 0 : null,
      costo: 0,
      personas: new Set(),
      sinValuar: 0,
    }
    a.horas += f.horas
    if (f.jornal == null) a.sinValuar++
    else {
      a.jornal += f.jornal
      if (conCargas) a.cargas += f.cargas
      a.costo += f.costo
    }
    a.personas.add(f.ref)
    porObra.set(k, a)
  }

  const jornalDe = (pred) => filas.filter(pred).reduce((a, f) => a + (f.jornal ?? 0), 0)
  return {
    ventana: { desde, hasta, diasEnVentana },
    filas,
    porObra: [...porObra.values()]
      .map((a) => ({ ...a, personas: a.personas.size }))
      .sort((x, y) => y.costo - x.costo),
    sinObra: filas.filter((f) => f.clase === CLASE.NO_ES_CLIENTE).map((f) => ({
      persona: f.persona, rotulo: f.rotuloCliente, motivo: f.motivo, horas: f.horas, jornal: f.jornal, costo: f.costo,
    })),
    desconocidos: filas.filter((f) => f.clase === CLASE.DESCONOCIDO).map((f) => ({
      persona: f.persona, rotulo: f.rotuloCliente, fila: f.fila, jornal: f.jornal,
    })),
    huecos,
    factorCargas: conCargas ? factorCargas : null,
    control: {
      verificable: mapa?.leido === true,
      personas: filas.length,
      celdasIlegibles: huecos.filter((h) => h.tipo === HUECO.CELDA_ILEGIBLE).length,
      personasSinValuar: filas.filter((f) => f.jornal == null).length,
      jornalTotal: jornalDe(() => true),
      jornalAtribuido: jornalDe((f) => f.clase === CLASE.CLIENTE),
      jornalSinObra: jornalDe((f) => f.clase === CLASE.NO_ES_CLIENTE),
      jornalDesconocido: jornalDe((f) => f.clase === CLASE.DESCONOCIDO),
    },
  }
}

const RE_SUMIFS = /^=SUMIFS?\(/i

/**
 * NUCLEO PURO Y CONTROL DE VERDAD: el resumen por cliente que la planilla calcula sola, llega a
 * todos los clientes que tiene cargados?
 *
 * ESTE CONTROL EXISTE PORQUE FALLO EN LA VIDA REAL. En la quincena del 17/08/2026 el resumen busca
 * "MESSINAS" y las filas de las personas dicen "MESSINA": la formula devolvio $ 0,00 con $ 1.333.000
 * cargados arriba. Y "QUATTROPANI" directamente no tenia fila en el resumen: otros $ 1.152.000
 * invisibles. El 37% de la quincena no llegaba al total, sin un solo error a la vista.
 *
 * Devuelve huerfanos -rotulos del resumen que ninguna fila usa, o sea que siempre van a dar cero- y
 * faltantes -clientes cargados en las filas que el resumen no busca, o sea plata que no aparece.
 */
/**
 * NUCLEO PURO: la celda que el SUMIFS usa como CRITERIO, leida de la propia formula.
 *
 * POR QUE NO SE MIRA "LA CELDA DE AL LADO". Es lo primero que uno escribe y es falso: en el archivo
 * real el rotulo esta en V552 y la formula en X552 -hay una columna vacia en el medio-, asi que
 * buscar en j-1 no encontraba nada y el control informaba "ningun huerfano" sobre una planilla que
 * tenia uno. La formula, en cambio, dice exactamente que celda es el criterio:
 * =SUMIFS(AA527:AA544;AB527:AB544;V552) -> V552. Eso es derivar de la planilla en vez de suponer.
 *
 * Devuelve { fila, col } en indices de grilla (0-based), o null si el ultimo argumento no es una
 * referencia simple -por ejemplo un literal entre comillas-, en cuyo caso el llamador cae al vecino.
 */
export function celdaDelCriterio(formula) {
  const f = String(formula ?? '')
  const abre = f.indexOf('(')
  if (abre < 0 || !f.trimEnd().endsWith(')')) return null
  const dentro = f.slice(abre + 1, f.lastIndexOf(')'))
  const args = dentro.split(/[;,]/)
  const ultimo = args[args.length - 1]?.trim()
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ultimo ?? '')
  if (!m) return null
  const col = indiceColumna(m[1].toUpperCase())
  const fila = Number(m[2]) - 1
  if (col == null || !Number.isInteger(fila) || fila < 0) return null
  return { fila, col }
}


export function auditarResumenPorCliente(grid, bloque, { hastaFila } = {}) {
  const filas = grid?.filas || []
  const cols = bloque?.columnas || {}
  const enFilas = new Map()
  for (const t of trabajadoresDeBloque(grid, bloque)) {
    const clave = normalizarClave(t.cliente_original)
    if (clave) enFilas.set(clave, t.cliente_original.trim())
  }
  const fin = Math.min(hastaFila ?? filas.length, filas.length)
  const letraCliente = cols.cliente == null ? null : letraColumna(cols.cliente)
  const rotulos = []
  for (let i = bloque.fila + 1; i < fin; i++) {
    const fila = filas[i] || []
    for (let j = 1; j < fila.length; j++) {
      const f = fila[j]?.formula
      if (typeof f !== 'string' || !RE_SUMIFS.test(f)) continue
      // La formula tiene que mirar la columna CLIENTE: si no, es cualquier otro SUMIFS del bloque.
      // OJO CON EL LIMITE DE PALABRA: /\bAB\b/ NO matchea "AB527:AB544", porque despues de la B
      // viene un digito, que tambien es caracter de palabra. Con esa version el control no
      // encontraba NUNCA el resumen y devolvia "todo limpio" sobre una planilla rota.
      if (letraCliente && !new RegExp(`(^|[^A-Za-z])\\$?${letraCliente}\\$?\\d`, 'i').test(f)) continue
      const ref = celdaDelCriterio(f)
      const celda = ref == null ? null : filas[ref.fila]?.[ref.col]
      const etiqueta = celda?.valor ?? fila[j - 1]?.valor
      if (!etiqueta || !String(etiqueta).trim()) continue
      rotulos.push({
        rotulo: String(etiqueta).trim(),
        clave: normalizarClave(etiqueta),
        fila: (ref?.fila ?? i) + 1,
        columna: letraColumna(ref?.col ?? (j - 1)),
        formulaEn: `${letraColumna(j)}${i + 1}`,
      })
      break
    }
  }
  const claves = new Set(rotulos.map((r) => r.clave))
  return {
    rotulos,
    huerfanos: rotulos.filter((r) => !enFilas.has(r.clave)),
    faltantes: [...enFilas.entries()]
      .filter(([k]) => !claves.has(k))
      .map(([clave, rotulo]) => ({ clave, rotulo })),
  }
}
