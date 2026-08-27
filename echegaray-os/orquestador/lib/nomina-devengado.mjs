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

/** Las columnas del espejo de jornales. Mismas que usa `desvinculacion-plantel.mjs`: si la planilla
 *  cambia de forma, cambian en los dos lados y el test lo dice. */
const COL = { nombre: 1, ingreso: 2, categoria: 3, hora: 22 }
const DIA_DESDE = 5
const DIA_HASTA = 20

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
export function devengadoPorMes(grid = [], bloques = [], { anio = 2026, clave } = {}) {
  const out = new Map()
  bloques.forEach((b) => {
    const fechas = grid[b.filaFecha - 1] ?? []
    for (let r = b.inicio; r <= b.fin; r++) {
      const fila = grid[r - 1] ?? []
      const nombre = texto(fila[COL.nombre])
      if (!nombre) continue
      const k = clave(nombre)
      if (!k) continue
      // El $/hora de ESTA fila, o sea de este bloque. Una fila sin precio no se puede valorizar: sus
      // horas se cuentan igual y su importe queda declarado como no medible, nunca en cero silencioso.
      const precio = jornal(fila[COL.hora])
      let p = out.get(k)
      if (!p) { p = { nombre, meses: new Map(), jornalPorMes: new Map(), horasSinPrecio: 0 }; out.set(k, p) }
      p.nombre = nombre
      for (let c = DIA_DESDE; c <= DIA_HASTA; c++) {
        const m = /^(\d{1,2})\/(\d{1,2})$/.exec(texto(fechas[c]))
        if (!m) continue
        const h = horas(fila[c])
        if (!h) continue
        const mes = `${anio}-${String(Number(m[2])).padStart(2, '0')}`
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
