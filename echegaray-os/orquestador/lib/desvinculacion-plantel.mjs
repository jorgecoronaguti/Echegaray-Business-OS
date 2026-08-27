// QUIÉN ES QUIÉN EN `_J_OBREROS`, PARA PODER LIQUIDARLO.
//
// ═══ POR QUÉ NO ALCANZA CON `public.personas` (27/08/2026) ═══
//
// La base dice que hay 16 personas en la empresa; la quincena en curso de la planilla tiene 17, y una
// de ellas —Castillo Carlos— no existe en la base. Dos que la base da por egresadas el 25/08 siguen
// con horas cargadas en el bloque abierto. La planilla es la que se toca todos los días: **manda el
// Sheet**, y donde la base no coincide, la fila lo dice en vez de elegir en silencio.
//
// ═══ LAS TRES TRAMPAS DE ESTA PLANILLA, MEDIDAS ═══
//
// 1. **El nombre se da vuelta.** "Marcelo Pastran" en enero, "Pastran Marcelo" desde abril; "Raul
//    Sosa. 1" en abril, "Sosa Raul" en julio. Emparejar por texto crudo duplica a media planilla y
//    entonces todos parecen recién ingresados. La clave son los tokens ordenados, sin sufijos.
//
// 2. **La fecha de ingreso de la columna C se reescribe.** Pastran figura con 10/11/25, después
//    21/1/26 y desde marzo con "21/1/16" — un año tipeado mal que, tomado al pie de la letra, le da
//    diez años de antigüedad y le duplica los días de vacaciones. Por eso NO se toma la fecha del
//    último bloque ni la mínima: se toma **la del primer bloque del tramo vigente**, que es la que se
//    escribió cuando la persona entró y todavía nadie la había pisado.
//
// 3. **Volver no es seguir.** Ochoa Eduardo trabajó hasta mayo, faltó seis quincenas y reapareció el
//    19/8/26. Es una relación laboral NUEVA: su antigüedad arranca de cero y su aporte al Fondo de
//    Cese vuelve al 12%. Tomarle el ingreso de enero de 2025 le regalaría un año y medio de
//    antigüedad que no tiene. Un hueco de hasta dos quincenas es una enfermedad o una licencia y no
//    corta nada; más que eso, corta.

const COL = { nombre: 1, ingreso: 2, categoria: 3, hora: 22 }
/** F..U: las columnas de días del bloque. El mismo rango que usa el registro para contarlos. */
const DIA_DESDE = 5
const DIA_HASTA = 20
/** Un hueco de hasta dos quincenas es licencia; más, es una relación nueva. */
export const HUECO_TOLERADO = 2

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * NÚCLEO PURO: la clave con la que dos escrituras del mismo nombre se reconocen.
 * Tokens alfabéticos, en minúscula y ordenados: el orden apellido/nombre deja de importar, y los
 * sufijos de la planilla ("Raul Sosa. 1") se caen solos porque no son letras.
 */
export function claveNombre(s) {
  return texto(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-zñ]+/).filter((t) => t.length > 1).sort().join(' ')
}

/**
 * NÚCLEO PURO: "26/5/25" → Date. Año de dos dígitos = 2000+yy.
 * Devuelve `null` si no se puede leer: un cálculo laboral sin fecha de ingreso no se estima.
 */
export function parsearFechaIngreso(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(texto(v))
  if (!m) return null
  const y = Number(m[3])
  const anio = y >= 100 ? y : 2000 + y
  const d = new Date(anio, Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** NÚCLEO PURO: "1,5" → 1.5. La planilla escribe en es-AR y `Number("1,5")` da NaN, no error. */
export function horas(v) {
  const t = texto(v).replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

/** NÚCLEO PURO: "$5.400" → 5400. */
export function jornal(v) {
  const t = texto(v).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

/**
 * NÚCLEO PURO: el TRAMO VIGENTE de una serie de apariciones.
 * @param {number[]} indices los bloques (ordenados) en que la persona aparece
 * @returns {{desde:number, hasta:number, reingreso:boolean}}
 */
export function tramoVigente(indices = [], hueco = HUECO_TOLERADO) {
  if (!indices.length) return { desde: -1, hasta: -1, reingreso: false }
  let desde = indices[0]
  let reingreso = false
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] - indices[i - 1] - 1 > hueco) { desde = indices[i]; reingreso = true }
  }
  return { desde, hasta: indices[indices.length - 1], reingreso }
}

/**
 * NÚCLEO PURO: el plantel del año, persona por persona, leído del espejo.
 *
 * @param {any[][]} grid el espejo `_J_OBREROS` completo
 * @param {Array<{inicio:number, fin:number, filaFecha:number}>} bloques
 * @param {{anio:number}} opciones
 * @returns {Array<{clave:string, nombre:string, categoria:string, jornalPactado:number,
 *   ingreso:Date|null, ingresoTexto:string, reingreso:boolean, bloques:number[],
 *   horasPorMes:Map<string,number>, ultimoDia:Date|null}>}
 */
export function plantelDelEspejo(grid = [], bloques = [], { anio = 2026 } = {}) {
  const porClave = new Map()
  bloques.forEach((b, iB) => {
    const fechas = grid[b.filaFecha - 1] ?? []
    for (let r = b.inicio; r <= b.fin; r++) {
      const fila = grid[r - 1] ?? []
      const nombre = texto(fila[COL.nombre])
      if (!nombre) continue
      const clave = claveNombre(nombre)
      if (!clave) continue
      let p = porClave.get(clave)
      if (!p) {
        p = {
          clave, nombre, categoria: '', jornalPactado: 0, ingreso: null, ingresoTexto: '',
          reingreso: false, bloques: [], horasPorMes: new Map(), ultimoDia: null,
          ingresoPorBloque: new Map(),
        }
        porClave.set(clave, p)
      }
      // El nombre, la categoría y el jornal que valen son los del bloque MÁS RECIENTE: una promoción
      // o un aumento se escriben ahí, y las filas viejas se quedan con el valor de entonces.
      p.nombre = nombre
      if (texto(fila[COL.categoria])) p.categoria = texto(fila[COL.categoria])
      if (jornal(fila[COL.hora]) > 0) p.jornalPactado = jornal(fila[COL.hora])
      const ing = parsearFechaIngreso(fila[COL.ingreso])
      if (ing) p.ingresoPorBloque.set(iB, { fecha: ing, texto: texto(fila[COL.ingreso]) })
      if (!p.bloques.includes(iB)) p.bloques.push(iB)
      for (let c = DIA_DESDE; c <= DIA_HASTA; c++) {
        const m = /^(\d{1,2})\/(\d{1,2})$/.exec(texto(fechas[c]))
        if (!m) continue
        const h = horas(fila[c])
        if (!h) continue
        const dia = new Date(anio, Number(m[2]) - 1, Number(m[1]))
        const mes = `${anio}-${String(dia.getMonth() + 1).padStart(2, '0')}`
        p.horasPorMes.set(mes, (p.horasPorMes.get(mes) ?? 0) + h)
        if (!p.ultimoDia || dia > p.ultimoDia) p.ultimoDia = dia
      }
    }
  })
  for (const p of porClave.values()) {
    const t = tramoVigente(p.bloques)
    p.reingreso = t.reingreso
    p.tramoDesde = t.desde
    // La fecha del PRIMER bloque del tramo vigente; si ese bloque no la trae, el primero que la traiga
    // dentro del tramo. Nunca una anterior al tramo: eso es lo que arrastraba el reingreso.
    const dentro = [...p.ingresoPorBloque.entries()].filter(([i]) => i >= t.desde).sort((a, b) => a[0] - b[0])
    const elegido = dentro[0]?.[1] ?? null
    p.ingreso = elegido?.fecha ?? null
    p.ingresoTexto = elegido?.texto ?? ''
    delete p.ingresoPorBloque
  }
  return [...porClave.values()]
}

/**
 * NÚCLEO PURO: quién sigue y quién ya no.
 * Activo = aparece en el ÚLTIMO bloque de la planilla, que es la quincena que se está pagando.
 */
export function separarPlantel(plantel = [], bloques = []) {
  const ultimo = bloques.length - 1
  const activos = plantel.filter((p) => p.bloques.includes(ultimo))
  const desafectados = plantel.filter((p) => !p.bloques.includes(ultimo))
  return { activos, desafectados }
}

/** NÚCLEO PURO: 'YYYY-MM' de una fecha. */
export const periodoDe = (d) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null)

/**
 * NÚCLEO PURO: la remuneración de un mes valuada al CONVENIO.
 * Orden del dueño (26/08): los cálculos van sobre el jornal del convenio, no sobre el que se paga hoy
 * —15 de 17 están por debajo—. Un piso legal no se liquida al valor que uno decidió pagar.
 */
export const remuneracionDelMes = (horasDelMes, basicoHora) => Number(horasDelMes || 0) * Number(basicoHora || 0)

/**
 * NÚCLEO PURO: la MAYOR remuneración mensual del semestre que contiene al cese (art. 123 LCT).
 * @returns {{periodo:string|null, importe:number}}
 */
export function mejorMesDelSemestre(horasPorMes, basicoHora, cese) {
  if (!(cese instanceof Date)) return { periodo: null, importe: 0 }
  const anio = cese.getFullYear()
  const primer = cese.getMonth() < 6
  let mejor = { periodo: null, importe: 0 }
  for (const [mes, h] of horasPorMes) {
    const [y, m] = mes.split('-').map(Number)
    if (y !== anio) continue
    if (primer ? m > 6 : m <= 6) continue
    const importe = remuneracionDelMes(h, basicoHora)
    if (importe > mejor.importe) mejor = { periodo: mes, importe }
  }
  return mejor
}

/**
 * NÚCLEO PURO: el Fondo de Cese DEVENGADO en el año, mes a mes y al convenio.
 *
 * No es lo que está depositado —eso no lo sabe nadie desde acá— sino lo que la ley mandaba aportar
 * sobre el piso del convenio. Sirve para dos cosas: dimensionar lo que el trabajador se lleva, y
 * contrastar contra lo que la DDJJ de UOCRA declaró (que se calculó sobre lo efectivamente pagado, y
 * por eso da menos).
 */
export function fclDevengadoDelAnio({ horasPorMes, basicoHora, ingreso, alicuotaDe }) {
  if (!(ingreso instanceof Date)) return null
  let total = 0
  for (const [mes, h] of horasPorMes) {
    const [y, m] = mes.split('-').map(Number)
    // Se valúa al último día del mes: es cuando se devenga el aporte y cuando se define la alícuota.
    const cierre = new Date(y, m, 0)
    const ali = alicuotaDe(ingreso, cierre)
    if (ali == null) continue
    total += remuneracionDelMes(h, basicoHora) * ali
  }
  return total
}
