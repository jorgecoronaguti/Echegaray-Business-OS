// LA PARTE EN BLANCO DE UN RECIBO DE SUELDO, LEÍDA DEL PDF DEL ESTUDIO.
//
// Núcleo puro: recibe el texto del recibo (renglones ya agrupados por coordenada Y) y devuelve la fila
// de `public.recibo_sueldo_linea` o un error explícito. No descarga ni escribe nada.
//
// ═══ DOS FORMATOS DEL MISMO ESTUDIO ═══
//
// · Desde julio 2026: una sola copia, montos con «$», rótulos «SUELDO NETO $», «Descuentos: $».
// · Enero–junio 2026: original y duplicado lado a lado en la misma hoja, montos SIN rótulo (el neto es
//   un número suelto bajo «TOTAL NETO →»). Ahí no hay de dónde leer el neto por su etiqueta: se suman
//   los conceptos y el total sólo se acepta si ESE número está impreso en el recibo. Un neto calculado
//   que el papel no muestra no es un dato del recibo.
//
// ═══ NUNCA INVENTA ═══
//
// Sin CUIL válido (dígito verificador), sin período o sin neto: error. El valor hora se acepta sólo si
// horas × valor hora = monto del 0401 al centavo; la categoría queda null si no se reconoce. La
// contribución patronal (5xxx) no es sueldo del obrero: se ignora entera.

const MONTO = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/
const UNIDAD = /^\d+(?:,\d+)?$/
const CUIL_RE = /\b(2[0-7])-(\d{8})-(\d)\b/g
// Vocabulario del CCT 76/75 y de los recibos vistos. El más largo primero: «MEDIO OFICIAL» no es «OFICIAL».
const CATEGORIAS = ['OFICIAL ESPECIALIZADO', 'MEDIO OFICIAL', 'OFICIAL', 'AYUDANTE', 'SERENO', 'CAPATAZ']

export const aNumero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'))
const r2 = (n) => Math.round(n * 100) / 100
export const aTextoMonto = (n) => {
  const [e, d] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`
}

/** Items de pdfjs → renglones de texto, de arriba hacia abajo y de izquierda a derecha. */
export function lineasDeItems(items) {
  const porY = new Map()
  for (const it of items) {
    if (!it.str?.trim()) continue
    const y = Math.round(it.transform[5])
    if (!porY.has(y)) porY.set(y, [])
    porY.get(y).push(it)
  }
  return [...porY.keys()].sort((a, b) => b - a)
    .map((y) => porY.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str.trim()).join(' '))
}

export function cuilValido(c) {
  if (!/^\d{11}$/.test(c)) return false
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const s = w.reduce((acc, p, i) => acc + p * Number(c[i]), 0)
  const v = 11 - (s % 11)
  return (v === 11 ? 0 : v === 10 ? 9 : v) === Number(c[10])
}

/** Un segmento «0401 BASICO HS NORMALES 45 $ 6.348,00 $ 285.660,00» → concepto. */
export function concepto(seg) {
  const m = /^(\d{4})\s+(.+)$/.exec(seg.trim())
  if (!m) return null
  const toks = m[2].split(/\s+/)
  const tieneSigno = toks.includes('$')
  const limpios = toks.filter((t) => t !== '$')
  if (!MONTO.test(limpios.at(-1) ?? '')) return null
  const monto = aNumero(limpios.pop())
  let base = null
  if (tieneSigno && toks.filter((t) => t === '$').length === 2 && MONTO.test(limpios.at(-1) ?? '')) {
    base = aNumero(limpios.pop())
  }
  // La unidad es el número pegado a los montos. Sin «$» (formato viejo) sólo se toma si no tiene
  // separador de miles: «LEY 19032 7.018,50» no es 19032 unidades, y como no es un concepto horario
  // su unidad no se usa para nada.
  let unidad = null
  if (UNIDAD.test(limpios.at(-1) ?? '') && limpios.length > 1) unidad = aNumero(limpios.pop())
  return { codigo: m[1], descripcion: limpios.join(' '), unidad, base, monto }
}

/** Todos los conceptos del texto. El formato viejo repite cada concepto dos veces por renglón. */
export function conceptos(lineas, duplicado) {
  const vistos = new Set()
  const out = []
  for (const l of lineas) {
    if (!/^\d{4} [A-ZÁÉÍÓÚÑ]/.test(l)) continue
    for (const seg of l.split(/\s(?=\d{4} [A-ZÁÉÍÓÚÑ])/)) {
      const c = concepto(seg)
      if (!c) continue
      const clave = `${c.codigo}|${c.descripcion}|${c.unidad}|${c.monto}`
      if (duplicado && vistos.has(clave)) continue
      vistos.add(clave)
      out.push(c)
    }
  }
  return out
}

function periodoDe(texto) {
  const q = /(PRIMERA|SEGUNDA) QUINCENA (\d{2})\/(\d{4})/.exec(texto)
  if (q) return `${q[1] === 'PRIMERA' ? 'Q1' : 'Q2'}-${q[2]}/${q[3]}`
  if (/LIQUIDACI[OÓ]N FINAL/i.test(texto)) {
    // La final no trae el mes en el rótulo: sale del renglón «Q MES AÑO …», que empieza «8 2026 APELLIDO».
    const h = /^(?:\d{1,2} )?(\d{1,2}) (20\d{2}) [A-ZÁÉÍÓÚÑ]/m.exec(texto)
    return h ? `FINAL-${h[1].padStart(2, '0')}/${h[2]}` : null
  }
  return null
}

function cuilDe(texto) {
  const set = new Set([...texto.matchAll(CUIL_RE)].map((m) => m[1] + m[2] + m[3]).filter(cuilValido))
  return [...set]
}

function categoriaDe(lineas) {
  for (let i = 0; i < lineas.length; i++) {
    if (!/CATEGOR[IÍ]A/.test(lineas[i])) continue
    for (const l of [lineas[i + 1], lineas[i - 1]].filter(Boolean)) {
      const hit = CATEGORIAS.find((c) => new RegExp(`(^|\\s)${c}(\\s|$)`).test(l))
      if (hit) return hit
    }
  }
  return null
}

const esHoraria = (c) => /\bHS\b|HORA/.test(c.descripcion)
// Haberes: todo lo que no es descuento (4xxx) ni contribución patronal (5xxx). El 9999 REDONDEO es un
// haber —el estudio lo suma al exento para cerrar el neto en pesos enteros— y sin él el neto no cierra.
const esHaber = (c) => Number(c.codigo) < 4000 || c.codigo === '9999'

/**
 * Horas y valor hora. El valor hora sale del 0401; si la quincena no tiene 0401 (todo accidente o
 * enfermedad), de otro concepto horario, que se paga a la misma remuneración asignada. En los dos
 * casos sólo se acepta si horas × valor = monto al centavo.
 */
function horasDe(lista, texto) {
  const horarios = lista.filter((c) => esHaber(c) && c.unidad && (c.codigo === '0401' || esHoraria(c)))
  const suma = (pred) => r2(horarios.filter(pred).reduce((a, c) => a + c.unidad, 0))
  const normales = suma((c) => c.codigo === '0401')
  const feriado = suma((c) => c.codigo === '0431')
  const otras = suma((c) => c.codigo !== '0401' && c.codigo !== '0431')
  const b = horarios.find((c) => c.codigo === '0401') ?? horarios[0]
  let valorHora = null
  if (b) {
    const candidato = b.base ?? r2(b.monto / b.unidad)
    if (Math.abs(r2(candidato * b.unidad) - b.monto) > 0.01) return { error: `${b.codigo}: ${b.unidad} h × ${candidato} ≠ ${b.monto}` }
    if (b.base == null && !texto.includes(aTextoMonto(candidato))) return { error: `${b.codigo}: valor hora ${candidato} no impreso en el recibo` }
    valorHora = candidato
  }
  return { normales, feriado, otras, valorHora }
}

const rotulado = (texto, re) => { const m = re.exec(texto); return m ? aNumero(m[1]) : null }

function totalesNuevos(texto) {
  const neto = rotulado(texto, /SUELDO NETO\s*\$\s*(-?[\d.]+,\d{2})/)
  const descuentos = rotulado(texto, /Descuentos:\s*\$\s*(-?[\d.]+,\d{2})/)
  let bruto = rotulado(texto, /SUELDO BRUTO\s*\$\s*(-?[\d.]+,\d{2})/)
  const rem = rotulado(texto, /Remunerativo:\s*\$\s*(-?[\d.]+,\d{2})/)
  const nr = rotulado(texto, /No Remunerativo:\s*\$\s*(-?[\d.]+,\d{2})/)
  if (bruto == null && rem != null && nr != null) bruto = r2(rem + nr)
  if (neto == null) return { error: 'sin «SUELDO NETO»' }
  if (bruto != null && descuentos != null && Math.abs(r2(bruto - descuentos) - neto) > 0.01) {
    return { error: `bruto ${bruto} − descuentos ${descuentos} ≠ neto ${neto}` }
  }
  return { bruto, descuentos, neto }
}

function totalesViejos(lista, texto) {
  const bruto = r2(lista.filter(esHaber).reduce((a, c) => a + c.monto, 0))
  const descuentos = r2(lista.filter((c) => c.codigo[0] === '4').reduce((a, c) => a + c.monto, 0))
  const neto = r2(bruto - descuentos)
  if (!/TOTAL NETO/.test(texto)) return { error: 'sin «TOTAL NETO»' }
  // El bruto no se exige impreso: con importes exentos el recibo imprime «sujeto a retención» y
  // «exento» por separado, nunca su suma. Si el neto y los descuentos sumados están impresos, el
  // bruto (= neto + descuentos) quedó confirmado por los dos.
  for (const [nombre, v] of [['neto', neto], ['descuentos', descuentos]]) {
    if (!texto.includes(aTextoMonto(v))) return { error: `${nombre} sumado ${aTextoMonto(v)} no está impreso en el recibo` }
  }
  return { bruto, descuentos, neto }
}

/** Texto del recibo → `{ ok: true, fila }` o `{ ok: false, error }`. */
export function parsearRecibo(textoOLineas) {
  const lineas = Array.isArray(textoOLineas) ? textoOLineas : String(textoOLineas).split('\n')
  const texto = lineas.join('\n')
  const cuils = cuilDe(texto)
  if (cuils.length !== 1) return { ok: false, error: cuils.length ? `más de un CUIL: ${cuils.join(', ')}` : 'sin CUIL válido' }
  const periodo = periodoDe(texto)
  if (!periodo) return { ok: false, error: 'sin período (ni quincena ni liquidación final)' }
  const nuevo = /SUELDO NETO\s*\$/.test(texto) || /COMPOSICI[OÓ]N SALARIAL/.test(texto)
  const lista = conceptos(lineas, !nuevo)
  const h = horasDe(lista, texto)
  if (h.error) return { ok: false, error: h.error }
  const t = nuevo ? totalesNuevos(texto) : totalesViejos(lista, texto)
  if (t.error) return { ok: false, error: t.error }
  return {
    ok: true,
    formato: nuevo ? 'con_rotulos' : 'duplicado',
    fila: {
      cuil: cuils[0], periodo, categoria: categoriaDe(lineas), valor_hora: h.valorHora,
      horas_normales: h.normales, horas_feriado: h.feriado, horas_otras: h.otras,
      horas_blanco: r2(h.normales + h.feriado + h.otras),
      bruto: t.bruto, descuentos: t.descuentos, neto: t.neto,
    },
    // Conceptos con unidad que NO se cuentan como horas (SAC proporcional en días, etc.): el
    // importador los informa para que nadie descubra tarde que una unidad horaria quedó afuera.
    unidadesNoHorarias: lista.filter((c) => Number(c.codigo) < 4000 && c.unidad != null && c.codigo !== '0401' && c.codigo !== '0431' && !esHoraria(c))
      .map((c) => `${c.codigo} ${c.descripcion} ${c.unidad}`),
  }
}
