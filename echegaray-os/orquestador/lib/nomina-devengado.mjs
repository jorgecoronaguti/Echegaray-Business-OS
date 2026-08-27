// LO QUE COBRÓ CADA PERSONA, MES A MES, CON EL PRECIO QUE REGÍA ESE MES.
//
// ═══ LA TRAMPA QUE ESTE ARCHIVO EXISTE PARA EVITAR ═══
//
// `desvinculacion-plantel.mjs` guarda UN `jornalPactado` por persona: el del bloque más reciente,
// que es el correcto para liquidar hoy. Multiplicar las horas de enero por ese valor sería
// reescribir la historia con el precio de agosto — y en un año con paritarias eso infla el
// devengado del primer semestre sin que nada lo grite.
//
// Acá las horas se multiplican por el `$/hora` DEL BLOQUE en que se cargaron. El resultado es el
// devengado real; la diferencia contra el atajo es exactamente el aumento acumulado del año.
//
// PURO: recibe la grilla ya leída y los bloques ya detectados. Ni red, ni disco.

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * LAS COLUMNAS, QUE NO SON LAS MISMAS EN LAS DOS PLANILLAS.
 *
 * `_J_OBREROS` y `_J_OFICINA` se ven iguales y no lo son: en la de obra el `$/hora` está en la
 * columna 22 y hay una columna de categoría; en la de oficina el `$/hora` está en la 21 y la
 * columna 3 es «DÍAS TRABAJADO», no la categoría. Leer la de oficina con el mapa de la de obra da
 * un jornal de $1.365.000 y una categoría «69» — probado el 27/08. El mapa se pasa, no se supone.
 */
export const COL_OBRA = Object.freeze({ nombre: 1, ingreso: 2, categoria: 3, hora: 22 })
export const COL_OFICINA = Object.freeze({ nombre: 1, ingreso: 2, categoria: null, hora: 21 })
const DIA_DESDE = 5
const DIA_HASTA = 20

/**
 * EL DÍA DE UNA CELDA DE LA FILA DE FECHAS — venga como venga.
 *
 * La misma celda es «24/08» leída con FORMATTED_VALUE y `46258` leída con UNFORMATTED_VALUE, que es
 * como hay que leer la planilla cuando además se necesitan los importes sin el símbolo de pesos.
 * Un lector que sólo entiende el texto devuelve cero meses con el otro render, y el síntoma es una
 * pestaña con todas las columnas vacías y ningún error. PURA.
 *
 * @returns {{dia:number, mes:number}|null}
 */
export function diaDeCelda(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000) {
    // Serial de Sheets: días desde el 30/12/1899, en UTC para no arrastrar el huso.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.trunc(v) * 86400000)
    return { dia: d.getUTCDate(), mes: d.getUTCMonth() + 1 }
  }
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(v ?? '').replace(/\s+/g, ' ').trim())
  return m ? { dia: Number(m[1]), mes: Number(m[2]) } : null
}

/** Horas de una celda: acepta coma decimal y descarta lo que no sea número. PURA. */
export function horas(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** `$ 8.125` / `8125,5` → número. PURA. */
export function jornal(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * DEVENGADO POR PERSONA Y POR MES.
 *
 * Devuelve `Map<claveNombre, {nombre, meses:Map<'YYYY-MM',{horas,importe}>, jornalPorMes:Map}>`.
 * `jornalPorMes` guarda el ÚLTIMO $/hora visto en cada mes: es lo que permite mostrar en la pestaña
 * con qué precio se calculó cada columna, en vez de pedirle al que mira que confíe.
 *
 * PURA.
 */
export function devengadoPorMes(grid = [], bloques = [], { anio = 2026, clave, col = COL_OBRA } = {}) {
  const out = new Map()
  bloques.forEach((b) => {
    const fechas = grid[b.filaFecha - 1] ?? []
    for (let r = b.inicio; r <= b.fin; r++) {
      const fila = grid[r - 1] ?? []
      const nombre = texto(fila[col.nombre])
      if (!nombre) continue
      const k = clave(nombre)
      if (!k) continue
      // El $/hora de ESTA fila, o sea de este bloque. Una fila sin precio no se puede valorizar: sus
      // horas se cuentan igual y su importe queda declarado como no medible, nunca en cero silencioso.
      const precio = jornal(fila[col.hora])
      let p = out.get(k)
      if (!p) { p = { nombre, categoria: '', jornal: 0, meses: new Map(), jornalPorMes: new Map(), horasSinPrecio: 0 }; out.set(k, p) }
      p.nombre = nombre
      if (col.categoria != null && texto(fila[col.categoria])) p.categoria = texto(fila[col.categoria])
      if (precio > 0) p.jornal = precio
      for (let c = DIA_DESDE; c <= DIA_HASTA; c++) {
        const d = diaDeCelda(fechas[c])
        if (!d) continue
        const h = horas(fila[c])
        if (!h) continue
        const mes = `${anio}-${String(d.mes).padStart(2, '0')}`
        const acc = p.meses.get(mes) ?? { horas: 0, importe: 0 }
        acc.horas += h
        if (precio > 0) { acc.importe += h * precio; p.jornalPorMes.set(mes, precio) } else { p.horasSinPrecio += h }
        p.meses.set(mes, acc)
      }
    }
  })
  return out
}

/** Total del año de una persona. PURA. */
export function totalAnio(persona) {
  let horasT = 0
  let importeT = 0
  for (const v of persona?.meses?.values() ?? []) { horasT += v.horas; importeT += v.importe }
  return { horas: horasT, importe: importeT }
}

/** Los doce meses del año en orden, como claves 'YYYY-MM'. PURA. */
export function mesesDe(anio) {
  return Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`)
}
