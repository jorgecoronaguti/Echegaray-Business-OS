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

import { sub as subItem, total as rotuloTotal } from './patron-pestana.mjs'
import { cmes } from './impuestos-grilla.mjs'
import { calendario, diasEntre } from './vencimientos-fiscales.mjs'
import {
  formulaVentana, formulaDeudaPendiente, proximoVencimiento,
  formulaSaldoAFavor, formulaSaldoDeclarado,
  formulaMesQueElIvaPideCaja, formulaIvaQuePideCaja, formulaColchonQueSeAgota,
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

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * NÚCLEO PURO: qué obligaciones entran al calendario, con la celda de la que sale cada importe.
 *
 * @param {object} f
 * @param {string} f.hoy
 * @param {number} f.anio
 * @param {{iva:number[], iibb:number[], plan:number[], prendario:number[]}} f.meses qué meses tiene cada bloque
 * @param {{iva:number, iibb:number, plan:number, prendario:number}} f.filas la fila del detalle de cada uno
 */
export function obligacionesDelCalendario({ hoy, anio, meses, filas }) {
  const CONCEPTO = {
    iva: 'IVA · DDJJ F.2051 (ARCA)',
    iibb: 'Ingresos Brutos San Juan (DGR)',
    plan: 'Planes de pago F931 (ARCA)',
    prendario: 'Prendario Ford XLS (Santander)',
  }
  const obligaciones = []
  for (const tipo of ['iva', 'iibb', 'plan', 'prendario']) {
    for (const m of meses[tipo] ?? []) {
      // El período del IVA y del IIBB es el mes DECLARADO (vence al siguiente); el del plan y el del
      // prendario es el mes en que se debita la cuota. Los dos son "el mes de la columna".
      obligaciones.push({
        tipo,
        periodo: `${anio}-${String(m).padStart(2, '0')}`,
        concepto: CONCEPTO[tipo],
        mes: m,
        celda: `$${cmes(m)}$${filas[tipo]}`,
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
export const ALTO_HERO = 10

/**
 * En qué fila del hero va el TITULAR — el único número grande de la pantalla.
 *
 * Es el 1 (la fila inmediatamente debajo del rótulo del bloque) y lo consume el generador para
 * pasárselo a la piel. Vive acá, al lado del orden del hero, porque son la misma decisión: si mañana
 * el hero se reordena y esto se queda en 1, la piel agranda el número equivocado sin dar un error.
 */
export const OFFSET_TITULAR = 1

/**
 * El rótulo de la línea que publica el MES al lado del importe. Vive acá, al lado de donde se
 * escribe, porque el generador tiene que ENCONTRAR esa fila para declararle a la piel que su columna
 * C es texto. Buscarla por su número —"la cuarta del hero"— es cómo una referencia se queda apuntando
 * a la fila de al lado el día que el hero cambia de orden, sin dar un solo error.
 */
export const ROTULO_IVA_EN_CAJA = 'EL IVA EMPIEZA A SALIR DE LA CAJA EN'

/**
 * Cuántas filas ocupa la posición entera. Se necesita ANTES de escribir el detalle, para reservarlas.
 * Ya no depende del calendario: es constante, y por eso el espacio reservado no puede quedar corto.
 */
export const altoDeLaPosicion = () => ALTO_HERO

/** El concepto, sin el emisor entre paréntesis. En el hero manda el "qué", no el "de quién". */
export const conceptoCorto = (s) => String(s ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim()

/**
 * NÚCLEO PURO: las filas de la posición, ya con sus referencias resueltas.
 *
 * @param {object} f
 * @param {Array} f.cal el calendario de `obligacionesDelCalendario`
 * @param {object} f.refs celdas del detalle. Todas salen de los bloques 1 a 6: el hero no calcula
 *   nada por su cuenta. {saldoIva, saldoIibb, prendPend, planesPend, ivaAPagar, ivaLibre, ivaCabecera}
 */
export function filasDeLaPosicion({ cal, hoy, refs }) {
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

  // ── HERO — CUATRO MENSAJES, OCHO NÚMEROS, Y NADA MÁS ────────────────────────────────────────────
  //
  // ═══ POR QUÉ SE REESCRIBIÓ (04/09/2026) ═══
  //
  // El estándar ejecutivo —IBCS 2.0, alineado con la ISO 24896 «Notation for business reporting»—
  // pide que un informe TRANSMITA UN MENSAJE (regla SAY) y que sus bloques no se solapen (STRUCTURE).
  // El hero anterior gastaba dos de sus nueve renglones en repetir importes que el detalle ya publica
  // —"prendario · cuotas por vencer" es literalmente el `$B$` de una fila de la sección 6— y en
  // cambio NO contestaba la pregunta por la que esta pestaña existe: cuándo el IVA empieza a salir de
  // la caja. Se van los dos desgloses de deuda y entra esa respuesta. Mismo alto, una pregunta menos.
  F.push([`LA POSICIÓN AL ${ddmm(hoy)}`])
  F.push([rotuloTotal('A PAGAR EN LOS PRÓXIMOS 30 DÍAS'), formulaVentana(conCelda, 30)])
  F.push([prox
    ? subItem(`primer vencimiento · ${ddmm(prox.fecha)} · ${conceptoCorto(prox.concepto)}`)
    : subItem('no hay ningún vencimiento en la ventana'),
  prox ? prox.formulaImporte : '=0'])
  // ═══ LA PREGUNTA QUE LA PESTAÑA EXISTÍA PARA CONTESTAR Y NO CONTESTABA ═══
  //
  // En 2026 el IVA no salió nunca en efectivo: marzo y julio quedaron a favor de ARCA por $10,75M y
  // $9,52M y los absorbió el saldo de libre disponibilidad. Pero ese colchón cae —$19,3M en junio,
  // $9,86M al cierre de julio, $4,0M en agosto— y el día que se agote, el IVA pide caja como
  // cualquier otro pago. Hasta hoy eso había que deducirlo leyendo la fila del saldo mes por mes,
  // doce columnas a la derecha, en el cuadro de la sección 1.
  //
  // EL MES VA EN LA COLUMNA C Y NO EN LA B. En toda esta pestaña la B es EL IMPORTE, en todos los
  // bloques: un texto ahí lo dibuja el formato de moneda como plata que no se ve, que es la clase de
  // defecto `texto_en_numero` que el auditor de pantalla ya cuenta. El mes es una etiqueta, va al
  // lado, y su celda se declara como texto (ver `textosCelda` en la piel).
  F.push([rotuloTotal(ROTULO_IVA_EN_CAJA),
    formulaIvaQuePideCaja(refs.ivaAPagar), formulaMesQueElIvaPideCaja(refs.ivaAPagar, refs.ivaCabecera)])
  F.push([subItem('saldo a favor que lo venía absorbiendo, y se agota'),
    formulaColchonQueSeAgota(refs.ivaAPagar, refs.ivaLibre)])
  F.push([rotuloTotal('DEUDA PENDIENTE · FISCAL Y FINANCIERA'),
    formulaDeudaPendiente(refs.prendPend, refs.planesPend)])
  // LAS TRES CELDAS DEL SALDO A FAVOR APUNTAN A CELDAS QUE ESCRIBE UNA PERSONA (el mes ajeno del
  // cuadro de IVA), así que no pueden asumir que ahí hay un número: el 17/08 había una leyenda y esta
  // fila publicó #VALUE! en la primera pantalla. Ver `formulaSaldoAFavor`.
  F.push([rotuloTotal('IMPUESTOS A FAVOR · inmovilizado en el fisco'),
    formulaSaldoAFavor(refs.saldoIva, refs.saldoIibb)])
  F.push([subItem('saldo a favor de IVA · F.2051'), formulaSaldoDeclarado(refs.saldoIva)])
  F.push([subItem('saldo a favor de IIBB · DGR'), formulaSaldoDeclarado(refs.saldoIibb)])
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
