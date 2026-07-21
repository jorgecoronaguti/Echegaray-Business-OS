// LAS REGLAS DE ORO DEL ARCHIVO, ESCRITAS COMO CONTROLES Y NO COMO BUENAS INTENCIONES.
//
// POR QUÉ EXISTE (21/07). El dueño: "revisá si todo el documento respeta TODAS LAS REGLAS DE ORO que
// se impusieron". Contestar eso leyendo el archivo y opinando dura hasta la próxima corrida del
// agente. Una regla que no se mide no se cumple: se cumple el día que alguien la mira.
//
// Las reglas son del dueño y están citadas tal como las dijo. Lo único que agrega este archivo es
// CÓMO SE VERIFICA CADA UNA sobre el archivo real, y qué evidencia se muestra cuando falla.
//
// LO QUE NO HACE: no arregla nada ni opina sobre lo que encuentra. Informa con evidencia. Varias de
// estas reglas se rompen por trabajo de carga pendiente, no por un defecto del sistema, y taparlas
// automáticamente sería peor que el problema.

/** Las pestañas que ESCRIBE el OS y que tienen que ser TODAS fórmula: cada número de acá sale de
 *  otro lado del archivo, así que pegarlo sería congelarlo. */
export const CALCULADAS = ['Cash Flow Mensual', 'Cash Flow Semanal', 'Materiales', 'Estructura', 'Recurrentes']

/**
 * Pestañas donde un número escrito NO es un defecto, con el motivo declarado.
 *
 * La regla dice "fórmulas o celdas con ORIGEN TRAZABLE". Un importe traído de ARCA o cargado del
 * extracto cumple la segunda mitad: no hay ninguna fórmula del archivo que lo pueda calcular, y
 * fingir que sí la hay sería peor. Lo que no puede pasar es que aparezca acá una pestaña que sí se
 * podía calcular — por eso la lista es explícita y corta.
 */
export const CON_ORIGEN = {
  'Impuestos y Financieros': 'réplica de los comprobantes de ARCA: el importe es de AFIP, no se calcula acá',
  'Cargas Sociales': 'réplica de los F931 y de los planes de pago presentados',
  CAJA: 'la única pestaña donde una persona carga el saldo: no existe en ningún otro lado del archivo',
  Caja: 'la única pestaña donde una persona carga el saldo: no existe en ningún otro lado del archivo',
}

/** Todas las que mantiene el OS: las calculadas más las de origen declarado. */
export const DERIVADAS = [...CALCULADAS, ...Object.keys(CON_ORIGEN)]

/** Las pestañas donde una PERSONA carga datos. Los números de acá son el hecho primario. */
export const DE_CARGA = [
  'Compras', 'Cobranzas', 'Cheques Emitidos', 'Tarjeta de Credito',
  'Jornales por Quincena', '01_Valores Iniciales', 'Parámetros',
]

export const REGLAS = [
  {
    id: 'formulas',
    regla: 'En el Sheet nunca números sueltos calculados por código: fórmulas o celdas con origen trazable.',
    porque: 'Un número pegado no se puede auditar ni se actualiza. El día que cambia el dato de origen, miente sin avisar.',
  },
  {
    id: 'sin_duplicar',
    regla: 'No duplicar: un concepto ya desglosado en otra pestaña no se vuelve a calcular en otra.',
    porque: 'Dos versiones del mismo número es peor que ninguna: cuando no coinciden, nadie sabe cuál tiene razón.',
  },
  {
    id: 'inflacion',
    regla: 'Las proyecciones siempre consideran inflación, con datos investigados en la web.',
    porque: 'Proyectar a peso constante en Argentina subestima el egreso de todos los meses que faltan.',
  },
  {
    id: 'automatico',
    regla: 'Todo debe actualizarse de manera automática: crear agentes para esto.',
    porque: 'Una pestaña que no rehace nadie queda con la forma del día que se escribió y el cuadro empieza a mentir cuando crecen los datos de origen.',
  },
  {
    id: 'sin_huecos',
    regla: 'No tiene que haber dato sin contemplar en todo el archivo.',
    porque: 'Cada columna cargada que el OS no mira es trabajo humano tirado, y a veces es plata que no aparece en ningún cuadro.',
  },
  {
    id: 'devengado_percibido',
    regla: 'P&L por devengado, Cash Flow por percibido. Nunca mezclar.',
    porque: 'Un cash flow que usa la fecha de la factura dice que la plata salió el día que llegó el papel. Es el error que hace que el saldo proyectado no exista.',
  },
  {
    id: 'sin_inventar',
    regla: 'Nunca fabricar datos ni inventar alícuotas ni índices.',
    porque: 'Un número inventado que parece razonable es más peligroso que un hueco declarado: nadie lo va a ir a buscar.',
  },
]

/**
 * NÚCLEO PURO: los números pegados a mano en una pestaña que escribe el OS.
 *
 * Una celda cuenta como número suelto cuando tiene un valor numérico ESCRITO (no derramado de una
 * fórmula matricial vecina) y no tiene fórmula. Dos exclusiones, y las dos importan:
 *
 *   · las celdas DERIVADAS: una ARRAYFORMULA de 900 filas no son 900 números tipeados, es una
 *     fórmula;
 *   · las FECHAS: el encabezado de meses o semanas es el eje del cuadro, no un importe. Sin esta
 *     exclusión, las cinco pestañas del cash flow aparecían con 12 "números pegados" que eran
 *     enero, febrero, marzo… y el aviso real quedaba enterrado entre falsos positivos. Un control
 *     que avisa siempre es un control que nadie mira.
 *
 * @param {Array<Array<{formula:string|null, numero:number|null, derivada:boolean, formato:string|null}>>} filas
 * @returns {Array<{fila:number, col:number, valor:number}>}
 */
export function numerosPegados(filas = []) {
  const out = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    if (!c || c.formula || c.derivada) return
    if (c.numero === null || c.numero === undefined) return
    if (c.formato === 'DATE' || c.formato === 'DATE_TIME') return
    out.push({ fila: i + 1, col: j + 1, valor: c.numero })
  }))
  return out
}

/**
 * NÚCLEO PURO: qué pestañas derivadas no las rehace ningún script del agente.
 *
 * Así apareció Recurrentes: el Cash Flow Mensual leía de ella su proyección y no la mantenía nadie.
 * Un número del que depende el cuadro, hecho a mano y por nadie.
 *
 * @param {string[]} pestanas las del archivo
 * @param {string[]} cubiertas las que declara mantener el agente
 * @returns {string[]}
 */
export function derivadasHuerfanas(pestanas = [], cubiertas = []) {
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  const cub = new Set(cubiertas.map(norm))
  return pestanas.filter((p) => DERIVADAS.some((d) => norm(d) === norm(p)) && !cub.has(norm(p)))
}

/**
 * NÚCLEO PURO: ¿las fórmulas de una pestaña proyectan ajustando por inflación?
 *
 * No alcanza con que exista la tabla de índices: hay que USARLA.
 *
 * LA PRIMERA VERSIÓN DE ESTE CONTROL ESTABA MAL y conviene dejarlo escrito: contaba como
 * "proyección sin ajustar" toda fórmula con TODAY() y EOMONTH. Pero esas dos funciones son las que
 * usa el cuadro para decidir si un mes ya cerró —o sea, para mostrar el REAL—, y el real no se
 * ajusta por inflación: ya pasó. Daba 108 de 108 mal en una pestaña que ajusta bien. Un control que
 * marca como error lo que está bien es peor que no tenerlo: enseña a ignorar los avisos.
 *
 * @param {string[]} formulas todas las fórmulas de la pestaña
 * @returns {{proyecta:boolean, ajusta:number, mira:number}}
 */
export function usaInflacion(formulas = []) {
  const f = formulas.map((x) => String(x ?? ''))
  // Una fórmula PROYECTA cuando parte de un promedio o un ritmo, no cuando mira si el mes cerró.
  const proy = f.filter((x) => /(PROMEDIO|AVERAGE|\/ *3\b|\/ *\$?[A-Z]+\$?\d+ *\*)/.test(x) && /EOMONTH/.test(x))
  const ajusta = f.filter((x) => /Par[áa]metros'?!\$C\$/.test(x)).length
  // Referenciar la tabla de índices YA ES proyectar: Recurrentes multiplica una columna de promedio
  // en vez de dividir, no matcheaba el patrón de arriba y aparecía como "no proyecta" una pestaña
  // que proyecta y ajusta bien.
  return { proyecta: proy.length > 0 || ajusta > 0, ajusta, mira: Math.max(proy.length, ajusta) }
}

/**
 * NÚCLEO PURO: la tabla de índices, ¿está completa y con fuente?
 *
 * Un índice sin fuente es un número inventado con buena letra. Y una tabla que se corta antes de
 * diciembre deja los últimos meses proyectando a peso constante sin decirlo.
 *
 * @param {Array<Array<any>>} filas [mes, inflación, factor, fuente]
 * @param {Date} hasta el último mes que el cuadro necesita cubrir
 */
export function indicesCompletos(filas = [], hasta = new Date()) {
  const meses = []
  let sinFuente = 0
  for (const f of filas) {
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(String(f?.[0] ?? '').trim())
    if (!m) continue
    const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
    meses.push(new Date(a, Number(m[2]) - 1, 1))
    if (!String(f?.[3] ?? '').trim()) sinFuente++
  }
  if (!meses.length) return { meses: 0, sinFuente: 0, cubreHasta: null, alcanza: false }
  const ultimo = new Date(Math.max(...meses.map((d) => +d)))
  const meta = new Date(hasta.getFullYear(), hasta.getMonth(), 1)
  return { meses: meses.length, sinFuente, cubreHasta: ultimo, alcanza: +ultimo >= +meta }
}
