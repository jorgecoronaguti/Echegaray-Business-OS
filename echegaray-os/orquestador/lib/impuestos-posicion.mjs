// LO QUE SE VE PRIMERO — posición, calendario de vencimientos, riesgo y financiamiento.
//
// LA ORDEN DEL DUEÑO (06/08): *"la pestaña mezcla posición, deuda, vencimientos, proyecciones y
// obligaciones. Separalas. La pantalla muestra PRIMERO: posición actual · próximos vencimientos ·
// riesgo · proyección 30 días · 60 · 90. Después el detalle técnico."*
//
// Todo lo de acá REFERENCIA celdas del detalle. Ni un número pegado, ni una suma repetida: si la
// posición recalculara por su cuenta lo que el detalle ya calcula, la pestaña tendría dos verdades
// sobre el mismo peso — que es el defecto que este archivo entero viene persiguiendo.
//
// LA CONFIANZA VIAJA EN EL RÓTULO, NO EN UNA NOTA. La columna de procedencia se vacía y las notas se
// borran (el dueño: "quitá las notas, son confusas"), así que una fecha supuesta que sólo se declarara
// ahí sería una fecha supuesta invisible. Las supuestas llevan "⚠ fecha supuesta" en la columna A.

import { total as rotuloTotal } from './patron-pestana.mjs'
import { cmes, M12 } from './impuestos-grilla.mjs'
import { calendario, diasEntre } from './vencimientos-fiscales.mjs'
import {
  formulaVentana, formulaDeudaPendiente, proximoVencimiento, formulaSaldoAFavor,
} from './impuestos-cuadro.mjs'

/**
 * Cuánto hacia atrás y hacia adelante mira el calendario.
 *
 * ═══ HACIA ATRÁS SÓLO IVA E IIBB, Y NO ES UN CAPRICHO (06/08) ═══
 *
 * La primera versión miraba 60 días para atrás con las cuatro obligaciones y el resultado era una
 * FALSA ALARMA de las caras: ocho filas "⚠ VENCIDO" por ~$9M que en realidad estaban PAGADAS. El
 * prendario y los planes se debitan solos —el banco el día 7, ARCA el 16— así que "vencido" no
 * quiere decir nada para ellos: si la fecha pasó, la plata salió.
 *
 * Con IVA e IIBB sí quiere decir algo: la DDJJ declara cuánto hay que pagar en efectivo, y si ese
 * importe sigue en el cuadro con el vencimiento cumplido, o se pagó y nadie lo registró, o no se
 * pagó. Las dos cosas hay que mirarlas. Hoy esas celdas valen 0 —el crédito de libre disponibilidad
 * lo absorbió todo— así que el riesgo muestra "—", que es la verdad.
 *
 * LO QUE ESTO NO PUEDE SABER, Y SE DECLARA: la pestaña no tiene un campo "pagado". Un vencimiento
 * pasado con importe es una PREGUNTA, no una deuda confirmada. Confirmarlo exige cruzar contra el
 * extracto o contra Compras, que es trabajo de la conciliación, no de este cuadro.
 */
export const VENTANA = { atras: 45, adelante: 95, conPasado: ['iva', 'iibb'] }

// ═══ LA FECHA VA COMO FECHA, NO COMO TEXTO (09/09/2026) ═══
//
// MEDIDO en la copia: escribir «07/09» dejaba la celda en **46281**. Con `USER_ENTERED` Sheets parsea
// esa cadena como fecha y guarda su serial; el formato TEXT que la celda tenía declarado dibuja ese
// serial crudo. Un número de cinco dígitos al lado de un importe no es una fecha: es basura.
//
// `DATE(a;m;d)` es explícito y no depende del locale de quien mire, y la celda se declara con formato
// de fecha —la misma solución, letra por letra, que usa «Próximo vencimiento» en «Cargas Sociales».
const fecha = (iso) => `=DATE(${Number(iso.slice(0, 4))};${Number(iso.slice(5, 7))};${Number(iso.slice(8, 10))})`

/**
 * NÚCLEO PURO: qué obligaciones entran al calendario, con la celda de la que sale cada importe.
 *
 * @param {object} f
 * @param {string} f.hoy
 * @param {number} f.anio
 * @param {{iva:number[], iibb:number[], plan:number[], prendario:number[]}} f.meses qué meses tiene cada bloque
 * @param {{iva:number, iibb:number, plan:number, prendario:number}} f.filas la fila del detalle de cada uno
 */
/**
 * NÚCLEO PURO: qué meses tiene cada obligación del calendario.
 *
 * Se calcula ANTES de escribir el detalle porque el generador reserva el espacio del hero antes de
 * saber en qué fila queda cada total: las FECHAS no dependen de la fila, así que el calendario se
 * arma dos veces y la primera es sólo para contar. Vive acá y no en el generador porque su único
 * consumidor es `obligacionesDelCalendario`, tres funciones más abajo.
 *
 * `mesesOf` sale además del objeto: es el último mes con DDJJ oficial, que el hero usa aparte para
 * elegir de qué mes publica el saldo a favor.
 *
 * @returns {{iva:number[], iibb:number[], plan:number[], prendario:number[], mesesOf:number[]}}
 */
export function mesesDeCadaObligacion({ ivaOficial, proy, iibb = [], planes = [] }) {
  const mesesOf = M12.filter((m) => (ivaOficial ?? []).some((d) => Number(String(d.periodo).slice(5, 7)) === m))
  const anclaIva = proy?.ultimoMesConDato ?? 0
  const iva = [...new Set([...mesesOf, ...M12.filter((m) => m <= anclaIva), ...(proy?.meses ?? [])])].sort((a, b) => a - b)
  const iibbReales = M12.filter((m) => iibb.some((d) => Number(String(d.periodo ?? '').slice(5, 7)) === m))
  const ultimoIibb = iibbReales[iibbReales.length - 1] ?? 0
  const hastaIibb = Math.max(proy?.meses?.length ? proy.meses[proy.meses.length - 1] : 0, ultimoIibb)
  return {
    mesesOf,
    iva,
    iibb: M12.filter((m) => iibbReales.includes(m) || (m > ultimoIibb && m <= hastaIibb)),
    plan: M12.filter((m) => planes.some((p) => p.porMes[m])),
    prendario: M12,
  }
}

export function obligacionesDelCalendario({ hoy, anio, meses, filas }) {
  const CONCEPTO = {
    iva: 'IVA · DDJJ F.2051 (ARCA)',
    iibb: 'Ingresos Brutos San Juan (DGR)',
    plan: 'Planes de pago F931 (ARCA)',
    prendario: 'Prendario Ford XLS (Santander)',
  }
  const obligaciones = []
  // DE DÓNDE SALE EL IMPORTE DE CADA OBLIGACIÓN. Casi siempre es una fila de esta pestaña, y entonces
  // basta el número de fila. La cuota de los planes de F931 NO tiene fila acá desde el 09/09/2026 —el
  // cuadro vive en «Cargas Sociales», una sola vez— así que su importe entra como EXPRESIÓN: una
  // función que devuelve `INDEX(CARGAS_MES_PLANES;m)`. Sin esto, sacarle la fila a una obligación
  // obliga a sacarla también del calendario, y «A pagar en 30 días» bajaría el importe de una cuota
  // que sí hay que pagar.
  const celdaDe = (tipo, m) => (typeof filas[tipo] === 'function'
    ? filas[tipo](m)
    : `$${cmes(m)}$${filas[tipo]}`)
  for (const tipo of ['iva', 'iibb', 'plan', 'prendario']) {
    for (const m of meses[tipo] ?? []) {
      // El período del IVA y del IIBB es el mes DECLARADO (vence al siguiente); el del plan y el del
      // prendario es el mes en que se debita la cuota. Los dos son "el mes de la columna".
      obligaciones.push({
        tipo,
        periodo: `${anio}-${String(m).padStart(2, '0')}`,
        concepto: CONCEPTO[tipo],
        mes: m,
        celda: celdaDe(tipo, m),
      })
    }
  }
  return calendario(obligaciones, { hoy }).filter((o) => {
    if (o.dias > VENTANA.adelante) return false
    if (o.dias >= 0) return true
    // Hacia atrás sólo entran los que se pagan a mano: el prendario y los planes son débito
    // automático, así que un vencimiento cumplido significa plata ya salida, no plata que se debe.
    return VENTANA.conPasado.includes(o.tipo) && o.dias >= -VENTANA.atras
  })
}

/**
 * NÚCLEO PURO: cómo se identifica un vencimiento ante el registro de decisiones del dueño.
 *
 * La CLAVE es el impuesto y su período —`iva·2026-06`—, no la fila ni el orden del calendario: el
 * calendario se rearma en cada corrida y anclar en la posición ya se rompió en silencio otras veces.
 * La FORMA es la fecha de vencimiento: si ARCA o la DGR la mueven, el dueño decidió sobre otra cosa.
 */
export const hallazgoDeVencimiento = (o) => ({ clave: `${o.tipo}·${o.periodo}`, forma: { fecha: o.fecha } })

/**
 * NÚCLEO PURO: el calendario con la decisión del dueño pegada a cada vencimiento que la tenga.
 *
 * ═══ POR QUÉ (13/08) ═══
 *
 * El IIBB del 16/07 y el IVA del 21/07 salían "⚠ VENCIDO" en cada corrida —cada dos horas— después de
 * que el dueño los mirara y dijera "no afectan". `vencido` sigue siendo `true`: el hecho no cambia, y
 * la fila sigue en el calendario con su importe. Lo que cambia es la MARCA, que pasa a decir quién lo
 * revisó y cuándo, sin `⚠`. Liberar no es callar.
 *
 * LO QUE ESTO NO TOCA, Y ES DELIBERADO: la fila "⚠ vencido s/verificar" sigue sumando estos importes.
 * Sacarlos de ahí movería plata en la pantalla que el dueño usa para decidir, y una decisión sobre el
 * ruido de un aviso no autoriza a cambiar un número. Eso lo decide él mirándolo.
 *
 * @param {Array} cal el calendario de `obligacionesDelCalendario`
 * @param {Map<string,object>} liberados clave del hallazgo → la decisión del dueño
 */
export function conDecisionesDelDueno(cal = [], liberados = new Map()) {
  return cal.map((o) => {
    const d = o.vencido ? liberados.get(hallazgoDeVencimiento(o).clave) : undefined
    return d ? { ...o, decisionDelDueno: d } : o
  })
}

// ═══ `marcaDeVencimiento` SE RETIRÓ CON EL CALENDARIO (04/09/2026) ═══
//
// Escribía la columna A de cada renglón del calendario: "▲ VENCIDO", "▲ fecha supuesta", o el
// veredicto del dueño cuando lo había revisado. Sin cuadro no hay renglón que marcar, y una función
// que nadie llama es la capa fósil que la próxima lectura confunde con algo vigente.
//
// LO QUE NO SE PERDIÓ: la decisión del dueño sigue viajando en `conDecisionesDelDueno` y se SIGUE
// viendo, en el informe del `--dry` (`impuestos-informe.mjs`), que imprime el calendario entero con
// su "✓ revisado" y su "⚠ VENCIDO" al lado de la celda de la que sale cada importe.

// ═══ EL ALTO DEL HERO ═══
//
// Ahora es lo ÚNICO que va arriba del detalle, y mide siempre lo mismo: son filas de código, no de
// datos. Antes había que sumar cuatro alturas —hero, riesgo, calendario, financiamiento— y las
// mismas constantes estaban tipeadas tres veces (`base + 10 + 2`, `base + 10 + cal.length + 4 + 10 +
// 2`); mover un bloque exigía acordarse de las tres, y una referencia que se queda atrás no da error:
// apunta a otro importe. Con un solo bloque de alto fijo, ese modo de falla deja de existir.
//
// ═══ DE DIEZ A CUATRO (09/09/2026) ═══
//
// El dueño, sobre las cuatro pestañas rediseñadas: *«minimalismo extremo, sin aclaraciones ni
// explicaciones de nada»*. El hero tenía un titular («LA POSICIÓN AL dd/mm»), cuatro totales y
// cuatro sub-líneas que glosaban al total de arriba. Las hermanas ya rediseñadas —«Cargas Sociales»
// y «Nómina»— abren con dos o tres renglones «⇒ rótulo | cifra» y nada más. Son tres filas y el
// separador.
export const ALTO_HERO = 4

/**
 * El rótulo de la línea que publica una FECHA al lado del importe. Vive acá, al lado de donde se
 * escribe, porque el generador tiene que ENCONTRAR esa fila para declararle a la piel que su columna
 * C es texto. Buscarla por su número —"la primera del hero"— es cómo una referencia se queda
 * apuntando a la fila de al lado el día que el hero cambia de orden, sin dar un solo error.
 */
export const ROTULO_A_PAGAR_30 = 'A pagar en 30 días'

/**
 * Cuántas filas ocupa la posición entera. Se necesita ANTES de escribir el detalle, para reservarlas.
 * Ya no depende del calendario: es constante, y por eso el espacio reservado no puede quedar corto.
 */
export const altoDeLaPosicion = () => ALTO_HERO

/**
 * NÚCLEO PURO: las filas de la posición, ya con sus referencias resueltas.
 *
 * @param {object} f
 * @param {Array} f.cal el calendario de `obligacionesDelCalendario`
 * @param {object} f.refs celdas del detalle. Todas salen de los bloques 1 a 5: el hero no calcula
 *   nada por su cuenta. {saldoIva, saldoIibb, prendPend, planesPend}
 */
export function filasDeLaPosicion({ cal, refs }) {
  const F = []
  // ═══ EL CALENDARIO YA NO OCUPA FILAS: ES EL INSUMO DEL HERO (04/09/2026) ═══
  //
  // El dueño, mirando la pestaña renderizada: *"no me sirven del cuadro 1 al 3, veo del 4 en
  // adelante"*. Los tres cuadros que se van eran el riesgo 30/60/90, el calendario de vencimientos y
  // el financiamiento — treinta y dos renglones antes del primer número que él usa.
  //
  // EL NUDO ERA QUE EL TITULAR COLGABA DEL CALENDARIO. "A pagar en los próximos 30 días" sumaba las
  // celdas B de las filas del calendario, así que borrar el cuadro rompía lo único que el dueño NO
  // cuestionó. Se resuelve mirando qué había ADENTRO de esas celdas: cada renglón del calendario era
  // `=$J$90`, o sea una REFERENCIA a la celda del detalle donde ese importe ya vive. El calendario
  // nunca fue una fuente: era una escala intermedia.
  //
  // Así que el hero suma directamente las celdas del detalle —las mismas, sin el rebote— y el
  // calendario sigue existiendo entero en JavaScript: aporta las FECHAS (que es lo único que él sabía
  // y el detalle no), decide qué entra en cada ventana, y se sigue imprimiendo completo en el informe
  // del `--dry`. Se fue el cuadro, no el conocimiento.
  //
  // NO SE PUEDE HACER VIVO, Y SE DECLARA: qué obligación cae dentro de los 30 días se decide con la
  // fecha de la corrida, en JavaScript. Un TEXT(TODAY()) en el rótulo diría la fecha de hoy al lado de
  // una ventana elegida hace una semana: sería más nuevo el cartel que el dato. Si la pestaña se queda
  // vieja, el rótulo "LA POSICIÓN AL dd/mm" lo dice a la vista.
  const conCelda = cal.map((o) => ({ ...o, celdaImporte: o.celda }))
  const prox = proximoVencimiento(conCelda)

  // ── HERO — TRES RENGLONES, TRES NÚMEROS, Y NADA MÁS ─────────────────────────────────────────────
  //
  // ═══ POR QUÉ SE VOLVIÓ A REESCRIBIR (09/09/2026) ═══
  //
  // Tenía un titular («LA POSICIÓN AL dd/mm»), cuatro totales y cuatro sub-líneas. Tres de esas
  // sub-líneas GLOSABAN el total de arriba —«saldo a favor de IVA · F.2051» debajo de «impuestos a
  // favor»— y eso es exactamente lo que el dueño mandó sacar de las cuatro pestañas: *«minimalismo
  // extremo, sin aclaraciones ni explicaciones de nada»*. Las hermanas ya rediseñadas abren con dos
  // o tres «⇒ rótulo | cifra».
  //
  // LA ÚNICA SUB-LÍNEA QUE TRAÍA UN DATO PROPIO ERA LA FECHA DEL PRIMER VENCIMIENTO, y no se pierde:
  // sube a la columna C de su propia fila, que es donde vive un dato que no es plata. Su IMPORTE sí
  // se va —era un sumando de la cifra de al lado, no otra pregunta—.
  //
  // ═══ LO QUE SE PERDIÓ, DECLARADO: «EL IVA EMPIEZA A SALIR DE LA CAJA EN» ═══
  //
  // Ese renglón contestaba en qué mes el saldo de libre disponibilidad deja de absorber el IVA. Es
  // una buena pregunta y el hero de tres filas no la contesta más: sigue siendo derivable de la
  // sección 1 —la primera columna con importe en «IVA a pagar»— pero hay que leerla mes por mes.
  // Se retira por orden explícita sobre la FORMA del hero, no porque el dato sobre.
  F.push([rotuloTotal(ROTULO_A_PAGAR_30), formulaVentana(conCelda, 30), prox ? fecha(prox.fecha) : ''])
  F.push([rotuloTotal('Deuda fiscal y financiera'),
    formulaDeudaPendiente(refs.prendPend, refs.planesPend)])
  // LAS DOS CELDAS DEL SALDO A FAVOR APUNTAN A CELDAS QUE ESCRIBE UNA PERSONA (el mes ajeno del
  // cuadro de IVA), así que no pueden asumir que ahí hay un número: el 17/08 había una leyenda y esta
  // fila publicó #VALUE! en la primera pantalla. Ver `formulaSaldoAFavor`.
  F.push([rotuloTotal('A favor en el fisco'), formulaSaldoAFavor(refs.saldoIva, refs.saldoIibb)])
  F.push([])
  return F
}

/**
 * ¿EL HERO APUNTA A FILAS QUE EXISTEN Y DICEN LO QUE ÉL CREE?
 *
 * Reemplaza a `verificarAnclajes`, que comparaba dos cuentas hechas con las mismas constantes de
 * altura. Ahora el hero referencia celdas del DETALLE, así que el control puede ser mejor: se mira lo
 * que quedó ESCRITO en cada fila referenciada. Una referencia a una fila vacía no da error en Sheets
 * —devuelve 0— y el hero publicaría "no hay nada que pagar" con el mismo aspecto de siempre.
 *
 * @param {any[][]} heroFilas las filas del hero, tal como se van a escribir
 * @param {any[][]} todas la grilla completa de la pestaña (índice 0 → fila 1)
 */
export function verificarReferenciasDelHero(heroFilas = [], todas = []) {
  const filas = new Set()
  for (const f of heroFilas) {
    for (const c of f || []) {
      if (typeof c !== 'string' || !c.startsWith('=')) continue
      for (const m of c.matchAll(/\$[A-M]\$(\d+)/g)) filas.add(Number(m[1]))
    }
  }
  const huerfanas = [...filas].filter((n) => !String(todas[n - 1]?.[0] ?? '').trim())
  if (huerfanas.length) {
    throw new Error(`impuestos-posicion: el hero referencia ${huerfanas.length} fila(s) sin rótulo `
      + `(${huerfanas.slice(0, 6).join(', ')}). Una referencia a una fila vacía devuelve 0 sin dar error: `
      + 'el hero publicaría "no hay nada que pagar" con el mismo aspecto de siempre.')
  }
  return [...filas].sort((a, b) => a - b)
}


/** Los días que faltan para el próximo vencimiento — para el log del generador, no para la celda. */
export const diasAlProximo = (cal = [], hoy) => {
  const p = cal.find((o) => !o.vencido)
  return p ? diasEntre(hoy, p.fecha) : null
}
