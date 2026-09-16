// UNA CELDA QUE CALCULA, COMO LA DEL SHEET — dueño, 15/09/2026.
//
// Textual: *«la planilla de liq de hs tiene que poder calcular dentro de las celdas, como hace sheet»*. Él suma
// dos importes a mano antes de escribirlos («340.909,09 + 197.272,73») y hoy tiene que hacerlo en otra ventana:
// la cuenta se pierde y lo que queda en la celda es un número que nadie puede explicar después.
//
// ═══ SE GUARDAN LAS DOS COSAS: LA CUENTA Y EL RESULTADO ═══
//
// El resultado es lo que se paga y lo que suma el pie. La expresión es lo que permite volver a abrir la celda y
// ver de dónde salió — la misma razón por la que el repo marca lo manual en vez de pisar el cálculo y olvidarlo.
//
// ═══ POR QUÉ NO `eval` NI `new Function` ═══
//
// Porque el texto lo escribe una persona en una pantalla de sueldos y viaja al servidor: `eval` ahí es ejecución
// de código arbitrario con la clave de servicio a mano. Este evaluador sólo conoce números, cuatro operaciones y
// paréntesis; lo que no entra en esa gramática no se evalúa, se rechaza con su motivo.
//
// ═══ EL NÚMERO SE LEE CON LA MISMA GRAMÁTICA QUE UNA CELDA SIN `=` ═══
//
// `leerNumeroEsAR` es la única definición de cómo se escribe un número acá (coma decimal, punto de miles,
// «8.5» son 8,5 horas). Un segundo lector adentro de las fórmulas haría que «=266.000» y «266.000» dieran
// distinto en la misma celda.

import { leerNumeroEsAR } from './numeroEsAR.ts'

/** Una expresión más larga que esto no es una cuenta de una celda: es otra cosa que alguien pegó. */
export const LARGO_MAXIMO_DE_FORMULA = 200

export type LecturaDeFormula =
  | { ok: true; valor: number }
  | { ok: false; error: string }

/** ¿Lo tecleado es una cuenta? La marca es la misma del Sheet: empieza con `=`. */
export function esFormula(texto: string): boolean {
  return String(texto ?? '').trim().startsWith('=')
}

type Ficha =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'operador'; valor: '+' | '-' | '*' | '/' }
  | { tipo: 'parentesis'; valor: '(' | ')' }

const OPERADORES: Record<string, '+' | '-' | '*' | '/'> = {
  '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', 'x': '*', '/': '/', '÷': '/',
}

const ES_DE_NUMERO = (c: string): boolean => (c >= '0' && c <= '9') || c === '.' || c === ','

/** El texto a fichas. `null` = hay algo que esta gramática no conoce, y entonces no se evalúa nada. */
function fichas(cuerpo: string): Ficha[] | null {
  const salida: Ficha[] = []
  let i = 0
  while (i < cuerpo.length) {
    const c = cuerpo[i]
    if (c === ' ' || c === '\t' || c === '$') { i++; continue }
    if (c === '(' || c === ')') { salida.push({ tipo: 'parentesis', valor: c }); i++; continue }
    // `x` SÓLO ES POR CUANDO NO ARRANCA UN NÚMERO NI OTRA PALABRA: nadie escribe «=2x3» y «=x» no es una cuenta.
    const op = OPERADORES[c] ?? OPERADORES[c.toLowerCase()]
    if (op) { salida.push({ tipo: 'operador', valor: op }); i++; continue }
    if (!ES_DE_NUMERO(c)) return null
    let j = i
    while (j < cuerpo.length && ES_DE_NUMERO(cuerpo[j])) j++
    const leido = leerNumeroEsAR(cuerpo.slice(i, j))
    if (!leido.ok || leido.valor == null) return null
    salida.push({ tipo: 'numero', valor: leido.valor })
    i = j
  }
  return salida
}

/**
 * DESCENSO RECURSIVO, PRECEDENCIA DE LA ARITMÉTICA: × y ÷ antes que + y −, paréntesis primero.
 *
 * Devuelve el valor y cuántas fichas consumió; el motivo del rechazo viaja como texto. Sin excepciones y sin
 * clase: es una función pura que se prueba con `node --test` sin nada alrededor.
 */
function evaluar(f: readonly Ficha[]): { ok: true; valor: number } | { ok: false; error: string } {
  let i = 0
  let error: string | null = null

  const falla = (mensaje: string): number => { error ??= mensaje; return 0 }

  const primario = (): number => {
    const t = f[i]
    if (error) return 0
    if (t == null) return falla('la cuenta queda a medias')
    if (t.tipo === 'numero') { i++; return t.valor }
    if (t.tipo === 'parentesis' && t.valor === '(') {
      i++
      const v = expresion()
      const cierre = f[i]
      if (cierre?.tipo !== 'parentesis' || cierre.valor !== ')') return falla('falta cerrar un paréntesis')
      i++
      return v
    }
    return falla('la cuenta no se entiende')
  }

  const factor = (): number => {
    const t = f[i]
    if (t?.tipo === 'operador' && (t.valor === '+' || t.valor === '-')) {
      i++
      const v = factor()
      return t.valor === '-' ? -v : v
    }
    return primario()
  }

  const termino = (): number => {
    let v = factor()
    for (;;) {
      const t = f[i]
      if (error) return v
      if (t?.tipo !== 'operador' || (t.valor !== '*' && t.valor !== '/')) return v
      i++
      const d = factor()
      if (error) return v
      // DIVIDIR POR CERO NO DA INFINITO EN UNA CELDA DE SUELDOS: da un error que hay que corregir.
      if (t.valor === '/' && d === 0) return falla('no se puede dividir por cero')
      v = t.valor === '/' ? v / d : v * d
    }
  }

  const expresion = (): number => {
    let v = termino()
    for (;;) {
      const t = f[i]
      if (error) return v
      if (t?.tipo !== 'operador' || (t.valor !== '+' && t.valor !== '-')) return v
      i++
      const d = termino()
      v = t.valor === '+' ? v + d : v - d
    }
  }

  const valor = expresion()
  if (error) return { ok: false, error }
  if (i !== f.length) return { ok: false, error: 'sobra algo al final de la cuenta' }
  return { ok: true, valor }
}

/** El resultado de una cuenta escrita con `=`. Sin `=` también se acepta: lo que importa es el cuerpo. */
export function evaluarFormulaEsAR(texto: string): LecturaDeFormula {
  const crudo = String(texto ?? '').trim()
  if (crudo.length > LARGO_MAXIMO_DE_FORMULA) return { ok: false, error: 'la cuenta es demasiado larga' }
  const cuerpo = (crudo.startsWith('=') ? crudo.slice(1) : crudo).trim()
  if (cuerpo === '') return { ok: false, error: 'la cuenta está vacía' }
  const f = fichas(cuerpo)
  if (f == null) return { ok: false, error: 'la cuenta no se entiende: sólo números, + − × ÷ y paréntesis' }
  const r = evaluar(f)
  if (!r.ok) return r
  if (!Number.isFinite(r.valor)) return { ok: false, error: 'la cuenta no da un número' }
  const valor = r.valor
  // DOS DECIMALES, COMO TODA LA PLATA DEL MÓDULO: `=1/3` no puede dejar catorce decimales en una celda de sueldos.
  return { ok: true, valor: Math.round(valor * 100) / 100 }
}

export type LecturaDeCelda =
  | { ok: true; valor: number | null; expresion: string | null }
  | { ok: false; error: string }

/**
 * LO QUE UNA CELDA NUMÉRICA HACE CON LO TECLEADO — el único lugar donde se decide.
 *
 *   vacío       `{ valor: null, expresion: null }`: se borra el override y vuelve el cálculo (R1).
 *   con `=`     se evalúa y se devuelven LAS DOS COSAS: el valor que se paga y la cuenta que lo explica.
 *   sin `=`     un número, como siempre. La expresión queda en `null` y la que hubiera se borra.
 */
export function leerCeldaNumerica(texto: string): LecturaDeCelda {
  const crudo = String(texto ?? '').trim()
  if (crudo === '') return { ok: true, valor: null, expresion: null }
  if (esFormula(crudo)) {
    const r = evaluarFormulaEsAR(crudo)
    return r.ok ? { ok: true, valor: r.valor, expresion: crudo } : r
  }
  const n = leerNumeroEsAR(crudo)
  if (!n.ok) return { ok: false, error: 'número inválido' }
  return { ok: true, valor: n.valor, expresion: null }
}
