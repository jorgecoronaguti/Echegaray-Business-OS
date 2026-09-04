// LAS DOS GUARDAS QUE PROTEGEN LA BASE DE LA PROYECCIÓN DE IVA.
//
// Viven en un lib y no en el generador por la misma razón por la que el generador se partió en agosto:
// una fórmula que decide plata escondida entre la orquestación no se lee, y tres estaban mal.

const CF = 'Cash Flow Mensual'

/** La fila de cada rótulo en la columna A del cash flow. Rompe si falta alguno. */
export function ubicarLineas(colA = [], rotulos = []) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const idx = new Map(colA.map((f, i) => [norm(f?.[0]), i + 1]))
  const filas = rotulos.map((r) => ({ rotulo: r, fila: idx.get(norm(r)) ?? null }))
  const faltan = filas.filter((f) => !f.fila).map((f) => f.rotulo)
  if (faltan.length) {
    throw new Error(`impuestos-pestana: no encuentro en "${CF}" la(s) línea(s): ${faltan.join(' · ')}. `
      + 'Sin ellas la proyección de IVA saldría $0 — no escribo una referencia muerta.')
  }
  return filas.map((f) => f.fila)
}

/**
 * NINGUNA BASE PUEDE LLEVAR UN TOTAL Y UNO DE SUS COMPONENTES A LA VEZ.
 *
 * El cuadro tiene totales sin sangría y componentes indentados debajo. Sumar un total Y uno de sus
 * hijos cuenta esa plata dos veces, y el resultado NO se delata: no hay #ERROR, no hay negativo
 * imposible, sólo un impuesto más grande. El parentesco se lee de la SANGRÍA, que es como el cuadro
 * lo expresa: un rótulo indentado pertenece al último rótulo sin indentar que tiene arriba.
 */
export function sinSolapamiento(colA = [], filas = []) {
  const texto = (f) => String(colA[f - 1]?.[0] ?? '')
  const esComponente = (f) => /^\s{2,}/.test(texto(f))
  const padreDe = (f) => {
    if (!esComponente(f)) return null
    for (let i = f - 1; i >= 1; i--) if (texto(i).trim() && !esComponente(i)) return i
    return null
  }
  const elegidas = new Set(filas)
  const choques = []
  for (const f of filas) {
    const p = padreDe(f)
    if (p && elegidas.has(p)) choques.push(`la fila ${f} ("${texto(f).trim()}") es COMPONENTE de la ${p} ("${texto(p).trim()}")`)
  }
  if (choques.length) {
    throw new Error('impuestos-pestana: doble conteo en la base de la proyección de IVA — '
      + `${choques.join(' · ')}. Sumar un total y uno de sus componentes cuenta esa plata dos veces `
      + 'y el resultado sigue pareciendo un importe razonable. Elegí el total O sus componentes, nunca los dos.')
  }
  return filas
}

