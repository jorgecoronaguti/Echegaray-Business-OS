// ESCRIBIR Y RELEER. NÚCLEO PURO, cero I/O — acá vive la comparación, no la lectura.
//
// ═══ LA REGLA ═══
//
// Una escritura no está hecha porque la API contestó 200. Está hecha cuando lo que se lee en el
// destino es lo que se quiso poner. `spreadsheets.values.update` devuelve 200 y `updatedCells: 3`
// aunque una guarda del propio repo haya descartado el lote — y devuelve 200 igual si el valor
// aterrizó en la pestaña equivocada porque el rango tenía un nombre parecido.
//
// ═══ LA TRAMPA QUE OBLIGA A SEPARAR DOS CANALES (la que casi cuesta $46.435.828) ═══
//
// Comparar con `render:'FORMULA'` MIENTE. La salida derramada de un QUERY, un ARRAYFORMULA o un
// IMPORTRANGE NO TIENE FÓRMULA PROPIA: sólo la tiene la celda ancla. Un diff hecho sobre fórmulas
// ve todas las celdas del derrame vacías y las reporta como borradas. En este repo eso estuvo a un
// paso de declarar eliminados $46.435.828 de cheques que nadie había tocado.
//
// De ahí los DOS canales de esta verificación, que no se mezclan:
//
//   · VALOR LITERAL → se compara el valor RENDERIZADO. Es lo que se ve, y es comparable siempre.
//   · FÓRMULA       → se compara el TEXTO DE LA FÓRMULA, y SÓLO en la celda ancla que se escribió.
//                     Nunca en el derrame. Y además se exige que su resultado no sea un error:
//                     una fórmula que aterrizó perfecta y devuelve #REF! no es una escritura buena.
//
// ═══ POR QUÉ LA COMPARACIÓN NORMALIZA ═══
//
// Se escribe el número 1234.5 y se relee "1.234,5" (es-AR) o 1234.5 (unformatted). Se escribe
// "ACME " y se relee "ACME". Comparar en crudo daría rojo permanente y el control se apagaría, que
// es la peor forma de fallar: un control apagado no avisa nada y todos creen que sí.

import { TIPOS, esErrorSheet, parsearNumeroEsAr, tipoDe } from './tipos.mjs'

/** Cuánto puede diferir un número releído del escrito antes de contar como distinto. Sheets guarda
 *  doubles y devuelve texto formateado: la diferencia real es de redondeo, no de dato. */
export const TOLERANCIA = 1e-9

/** El valor, listo para comparar: sin espacios de más, con el número reconocido escriba como se
 *  escriba. Devuelve `{ tipo, n?, s }` para que la comparación no tenga que readivinar. */
export function normalizar(v) {
  if (v === null || v === undefined) return { tipo: TIPOS.VACIO, s: '' }
  if (typeof v === 'boolean') return { tipo: TIPOS.BOOLEANO, s: v ? 'TRUE' : 'FALSE' }
  if (typeof v === 'number') return { tipo: TIPOS.NUMERO, n: v, s: String(v) }
  const s = String(v).trim()
  if (s === '') return { tipo: TIPOS.VACIO, s: '' }
  if (esErrorSheet(s)) return { tipo: TIPOS.ERROR, s: s.toUpperCase() }
  if (/^(TRUE|VERDADERO)$/i.test(s)) return { tipo: TIPOS.BOOLEANO, s: 'TRUE' }
  if (/^(FALSE|FALSO)$/i.test(s)) return { tipo: TIPOS.BOOLEANO, s: 'FALSE' }
  const nAr = parsearNumeroEsAr(s)
  if (nAr !== null) return { tipo: TIPOS.NUMERO, n: nAr, s }
  const nEn = Number(s.replace(/^\$\s*/, ''))
  if (s !== '' && Number.isFinite(nEn)) return { tipo: TIPOS.NUMERO, n: nEn, s }
  return { tipo: TIPOS.TEXTO, s }
}

/** ¿Estos dos valores son el mismo dato? Números por valor (con tolerancia), el resto por texto. */
export function mismoValor(a, b, tolerancia = TOLERANCIA) {
  const x = normalizar(a)
  const y = normalizar(b)
  if (x.tipo === TIPOS.NUMERO && y.tipo === TIPOS.NUMERO) return Math.abs(x.n - y.n) <= tolerancia
  if (x.tipo !== y.tipo) return false
  return x.s === y.s
}

/**
 * ¿Son la misma fórmula? Se compara ignorando espacios fuera de los literales de texto y sin
 * distinguir `,` de `;`.
 *
 * EL SEPARADOR NO SE COMPARA A PROPÓSITO. Se manda `=SUM(A1,A2)` y Google devuelve `=SUM(A1;A2)`
 * porque el archivo es es-AR y `localizeFormulas` hizo su trabajo. Exigir igualdad literal pondría
 * en rojo exactamente la conversión que tiene que ocurrir, y la reacción natural sería apagar la
 * verificación de fórmulas — perdiendo con ella la detección de la fórmula que NO aterrizó.
 */
export function mismaFormula(a, b) {
  const canon = (f) => {
    const s = String(f ?? '').trim()
    let out = ''
    let dentro = false
    let comilla = ''
    for (const c of s) {
      if (dentro) { out += c; if (c === comilla) dentro = false; continue }
      if (c === '"' || c === "'") { dentro = true; comilla = c; out += c; continue }
      if (/\s/.test(c)) continue
      out += c === ';' ? ',' : c
    }
    return out.toUpperCase()
  }
  return canon(a) === canon(b)
}

/**
 * LA COMPARACIÓN. Devuelve `{ ok, diferencias[] }` — nunca lanza: quien llama decide si una
 * diferencia es fatal.
 *
 * @param {any[][]} esperado lo que se quiso escribir (rectangular)
 * @param {any[][]} leidoValores lo que se releyó con render de VALOR
 * @param {any[][]} [leidoFormulas] lo releído con render de FÓRMULA — sólo se mira en las celdas
 *        donde el esperado ES una fórmula. En las demás no se toca: ahí miente (ver encabezado).
 * @param {{ancla:string, tolerancia?:number}} opciones `ancla` sólo entra en el detalle, para poder
 *        nombrar la celda con su dirección real.
 */
export function compararEscritura(esperado, leidoValores, leidoFormulas, { tolerancia = TOLERANCIA } = {}) {
  const diferencias = []
  for (let f = 0; f < esperado.length; f++) {
    for (let c = 0; c < (esperado[f]?.length ?? 0); c++) {
      const q = esperado[f][c]
      const esFormula = tipoDe(q) === TIPOS.FORMULA
      const valor = leidoValores?.[f]?.[c]

      if (esFormula) {
        const formula = leidoFormulas?.[f]?.[c]
        if (!mismaFormula(q, formula)) {
          diferencias.push({ fila: f, col: c, motivo: 'formula_distinta', esperado: q, leido: formula ?? null })
          continue
        }
        // La fórmula aterrizó; ahora, ¿calcula? Un #REF! es una escritura fallida aunque el texto
        // coincida carácter por carácter.
        if (esErrorSheet(valor)) {
          diferencias.push({ fila: f, col: c, motivo: 'formula_en_error', esperado: q, leido: valor })
        }
        continue
      }
      if (!mismoValor(q, valor, tolerancia)) {
        diferencias.push({ fila: f, col: c, motivo: 'valor_distinto', esperado: q, leido: valor ?? null })
      }
    }
  }
  return { ok: diferencias.length === 0, diferencias }
}

/**
 * LA HUELLA DE UN RANGO — el token de revisión del motor.
 *
 * POR QUÉ NO ES LA VERSIÓN DEL ARCHIVO DE DRIVE. La versión de Drive sube cuando alguien toca
 * CUALQUIER celda de CUALQUIER pestaña: con una planilla que abren cuatro personas y escribe un
 * worker, un candado sobre esa versión daría conflicto todo el tiempo por cambios que no tienen
 * nada que ver con el bloque que se va a escribir. Lo que hay que detectar es más chico y más
 * grave: **que cambió LO QUE ESTOY POR PISAR**. Por eso la huella se calcula sobre el contenido del
 * rango destino, y nada más.
 *
 * La huella se toma sobre valores NORMALIZADOS: si no, un recálculo que devuelve "1.234,50" en vez
 * de "1234,5" invalidaría el token sin que nadie haya editado nada.
 */
export function huella(grid) {
  const filas = (grid ?? []).map((f) => (f ?? []).map((c) => {
    const n = normalizar(c)
    return n.tipo === TIPOS.NUMERO ? `#${n.n}` : `${n.tipo[0]}:${n.s}`
  }).join('')).join('')
  // FNV-1a de 32 bits, en hexa. No hace falta criptografía: esto detecta un cambio, no defiende de
  // un atacante, y evita cargar `node:crypto` en un núcleo que se quiere puro y barato.
  let h = 0x811c9dc5
  for (let i = 0; i < filas.length; i++) {
    h ^= filas.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `h${h.toString(16).padStart(8, '0')}:${(grid ?? []).length}`
}

/** Un resumen legible de las diferencias, para el mensaje del error. Corto a propósito: veinte
 *  celdas distintas se explican con tres ejemplos, no con veinte líneas en un log. */
export function resumirDiferencias(diferencias, direccionar, tope = 3) {
  const muestra = diferencias.slice(0, tope).map((d) => {
    const donde = direccionar ? direccionar(d.fila, d.col) : `f${d.fila}c${d.col}`
    return `${donde}: esperaba ${JSON.stringify(d.esperado)} y hay ${JSON.stringify(d.leido)} (${d.motivo})`
  })
  const resto = diferencias.length - muestra.length
  return muestra.join(' · ') + (resto > 0 ? ` · y ${resto} más` : '')
}
