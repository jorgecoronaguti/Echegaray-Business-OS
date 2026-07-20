// CONTROL ADMINISTRATIVO — el checklist de cierre de la skill `administracion-operativa-construccion`
// convertido en capacidad determinística (0 API) que corre SOLA.
//
// Por qué existe: la skill declaraba su propio gap dos veces — "no existe hoy un calendario
// consolidado de vencimientos administrativos, sin alerta automática si algo se atrasa" y "el Centro
// de Acción debería generar acciones de vencimiento administrativo recurrente — no construido hoy".
// Tener el criterio escrito y no ejecutarlo es exactamente la diferencia entre una skill que sabe y
// un OS que hace. Esto lo ejecuta.
//
// REGLA DURA: un checklist que da OK sobre algo que no puede verificar es una mentira. Cada punto
// del cierre cae en UNA de tres listas: `hallazgos` (verificado y hay excepción), `ok` (verificado y
// está bien) o `no_verificable` (el OS NO tiene la fuente para juzgarlo, y lo dice). Nunca se pasa
// por alto un punto por falta de datos.
//
// Fuente única (contrato de arquitectura): consume `obligacion_resumen` y las tablas ya existentes;
// NO recalcula saldos ni caja — para caja vencida ya existe `caja-alertas`/`caja_vencido`.

/** Suma segura de importes que vienen como texto de Postgres (numeric). */
function sum(rows, campo) {
  return rows.reduce((a, r) => a + (Number(r?.[campo]) || 0), 0)
}

const SEV = { alta: 3, media: 2, baja: 1 }

/** Fecha en formato argentino DD/MM/YYYY. `fecha` puede venir como Date (pg) o string (test):
 *  cortar un Date con slice(0,10) daba "Thu Jul 02" — bug real visto en la primera corrida. */
function fechaAR(f) {
  // Un 'YYYY-MM-DD' pelado lo parsea JS como UTC medianoche → en Argentina (UTC-3) retrocede un
  // día y muestra el 01 en vez del 02. Se toman los dígitos tal cual: una fecha sin hora no tiene
  // zona horaria que interpretar.
  const s = String(f)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = f instanceof Date ? f : new Date(f)
  if (isNaN(d)) return String(f)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * NÚCLEO PURO: evalúa el cierre administrativo sobre datos ya leídos. Sin DB, sin API — testeable.
 *
 * @param {object} d
 *  - recibidos: comprobantes de compra del período [{obra_texto, imp_total, emisor_nombre}]
 *  - cobranzas: [{estado, fecha_cobro, total_bruto, obra_cliente}]
 *  - obligaciones: [{concepto, fecha_vencimiento, saldo_pendiente}]
 *  - fuentes: { conciliacion_bancaria, remitos, estudio_contable } → true si el OS tiene la fuente
 * @param {Date} hoy
 */
export function evaluarCierre(d = {}, hoy = new Date()) {
  // `undefined` = no se consultó la fuente (no verificable). `[]` = se consultó y no hay huérfanos
  // (OK verificado). Confundirlos daría un OK sobre algo que nunca se miró.
  const recibidos = d.recibidos
  const cobranzas = d.cobranzas || []
  const obligaciones = d.obligaciones || []
  const fuentes = d.fuentes || {}
  const hallazgos = []
  const ok = []
  const no_verificable = []

  // 1. Gasto de ARCA que nunca entró a la pestaña Compras → no está imputado a NINGUNA obra.
  //
  // ESTO CORRIGE UNA FALSA ALARMA PROPIA (2026-07-20). Antes miraba `comprobantes_arca.obra_texto`
  // y gritaba "47 de 47 facturas sin imputar". Era falso: la imputación real existe y funciona —
  // la empresa asigna cada compra a una obra en la pestaña Compras, y eso vive en `costos_obra`
  // (731 filas, $578M). Alertar sobre un problema ya resuelto en otra fuente destruye la confianza
  // más rápido que no alertar. El problema real es el gasto que ARCA registró y el Sheet no tiene.
  if (recibidos && recibidos.length) {
    hallazgos.push({
      codigo: 'gasto_fuera_de_obra',
      severidad: recibidos.length > 20 ? 'alta' : 'media',
      titulo: `${recibidos.length} comprobante(s) de ARCA que no están en la pestaña Compras`,
      monto: sum(recibidos, 'imp_total'),
      detalle: `Ese gasto existe y es real, pero no está imputado a ninguna obra: el margen por obra que muestra el OS lo ignora y queda sobreestimado en ese monto. Mayores: ${recibidos.slice(0, 3).map((r) => `${r.emisor_nombre} $${Math.round(Number(r.imp_total) || 0).toLocaleString('es-AR')}`).join(' · ')}.`,
      accion: 'Cargarlos en la pestaña Compras con su obra, o marcarlos como Estructura si no corresponden a una obra.',
    })
  } else if (recibidos) {
    ok.push('Todo el gasto registrado en ARCA está cargado en la pestaña Compras con su obra.')
  } else {
    no_verificable.push('Gasto de ARCA vs. pestaña Compras: no se consultó la conciliación.')
  }

  // 2. Cobranzas vencidas: emitido/pendiente con fecha de cobro pasada. Plata que ya se ganó y no entró.
  const venc = cobranzas.filter((c) => {
    const e = String(c.estado || '').toLowerCase()
    if (e === 'cobrado' || e === 'efectivo') return false
    const f = c.fecha_cobro ? new Date(c.fecha_cobro) : null
    return f && f < hoy
  })
  if (cobranzas.length) {
    if (venc.length) {
      hallazgos.push({
        codigo: 'cobranzas_vencidas',
        severidad: 'alta',
        // EL ORIGEN VA EN EL TÍTULO A PROPÓSITO. La ronda autónoma muestra este bloque junto al de
        // caja, que cuenta cobranzas vencidas desde `movimientos_caja` (instrumentos/echeqs) y da
        // otro número — no porque uno esté mal, sino porque son registros distintos del mismo hecho
        // y su cobertura difiere. Sin decir de dónde sale cada cifra, se leen como contradicción y
        // se quema un especialista reconciliando algo ya conocido. Nombrar la fuente es más barato
        // y más honesto que forzar un único número que la evidencia no sostiene.
        titulo: `${venc.length} cobranza(s) con fecha de cobro vencida (según el registro de cobranzas; caja las cuenta por instrumento y puede diferir)`,
        monto: sum(venc, 'total_bruto'),
        detalle: venc.map((c) => `${c.obra_cliente || 's/obra'}: $${Math.round(Number(c.total_bruto) || 0).toLocaleString('es-AR')} (esperado ${fechaAR(c.fecha_cobro)})`).join(' · '),
        accion: 'Asignar responsable de reclamo a cada una — el checklist de cierre exige responsable, no solo la lista.',
      })
    } else ok.push('No hay cobranzas con fecha de cobro vencida.')
  } else no_verificable.push('Cobranzas: no hay registros cargados.')

  // 3. Obligaciones sin fecha de vencimiento = "gasto general sin fecha" (punto 4 del cierre).
  //    Sin fecha no hay alerta posible: es la causa raíz de que un vencimiento sorprenda.
  const conSaldo = obligaciones.filter((o) => (Number(o.saldo_pendiente) || 0) > 0)
  const sinFecha = conSaldo.filter((o) => !o.fecha_vencimiento)
  if (conSaldo.length) {
    if (sinFecha.length) {
      hallazgos.push({
        codigo: 'obligaciones_sin_vencimiento',
        severidad: 'media',
        titulo: `${sinFecha.length} de ${conSaldo.length} obligaciones con saldo no tienen fecha de vencimiento`,
        monto: sum(sinFecha, 'saldo_pendiente'),
        detalle: 'Sin fecha de vencimiento el OS no puede avisar antes: el vencimiento va a sorprender aunque el dato esté cargado.',
        accion: 'Cargar la fecha de vencimiento real de cada una (o marcarla como deuda sin plazo pactado).',
      })
    }
    const vencidas = conSaldo.filter((o) => o.fecha_vencimiento && new Date(o.fecha_vencimiento) < hoy)
    if (vencidas.length) {
      hallazgos.push({
        codigo: 'obligaciones_vencidas',
        severidad: 'alta',
        titulo: `${vencidas.length} obligación(es) vencida(s) con saldo impago`,
        monto: sum(vencidas, 'saldo_pendiente'),
        detalle: vencidas.map((o) => `${o.concepto || 's/concepto'}: $${Math.round(Number(o.saldo_pendiente) || 0).toLocaleString('es-AR')}`).join(' · '),
        accion: 'Pagar o renegociar: una obligación vencida sin decisión es riesgo de corte de crédito del proveedor.',
      })
    }
    if (!sinFecha.length && !vencidas.length) ok.push('Obligaciones con saldo: todas con fecha y ninguna vencida.')
  } else no_verificable.push('Obligaciones: no hay saldos pendientes cargados.')

  // 4. Puntos del cierre que el OS todavía NO puede verificar. Se declaran, no se dan por buenos.
  if (!fuentes.conciliacion_bancaria) no_verificable.push('Conciliación bancaria contra extracto real: el OS no tiene los extractos bancarios cargados.')
  if (!fuentes.remitos) no_verificable.push('Control de tres puntas (pedido/remito/factura): no hay remitos de recepción registrados — no se puede validar que lo facturado se haya recibido.')
  if (!fuentes.estudio_contable) no_verificable.push('Envío mensual de documentación al Estudio Contable: no hay constancia registrada en el OS.')

  hallazgos.sort((a, b) => (SEV[b.severidad] - SEV[a.severidad]) || (b.monto - a.monto))
  return {
    periodo: d.periodo || null,
    hallazgos,
    ok,
    no_verificable,
    monto_en_riesgo: hallazgos.reduce((a, h) => a + (h.monto || 0), 0),
    cerrable: hallazgos.filter((h) => h.severidad === 'alta').length === 0,
  }
}

/** Texto corto para el chat / el digest autónomo. PURO. */
export function formatCierre(r) {
  if (!r) return 'sin datos'
  const L = []
  L.push(`CONTROL ADMINISTRATIVO${r.periodo ? ` — período ${r.periodo}` : ''}`)
  L.push(r.cerrable ? '✔ Sin excepciones de severidad alta.' : `✖ NO cerrable: ${r.hallazgos.filter((h) => h.severidad === 'alta').length} excepción(es) de severidad alta.`)
  for (const h of r.hallazgos) {
    L.push(`\n[${h.severidad.toUpperCase()}] ${h.titulo}${h.monto ? ` — $${Math.round(h.monto).toLocaleString('es-AR')}` : ''}`)
    L.push(`  ${h.detalle}`)
    L.push(`  → ${h.accion}`)
  }
  if (r.ok.length) L.push(`\nVerificado OK: ${r.ok.join(' · ')}`)
  if (r.no_verificable.length) L.push(`\nNO VERIFICABLE (el OS no tiene la fuente, no es un OK):\n  - ${r.no_verificable.join('\n  - ')}`)
  return L.join('\n')
}

/** Período YYYY-MM actual (hora local Argentina en el server). */
export function periodoActual(hoy = new Date()) {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Lee las fuentes reales y evalúa. `periodo` = 'YYYY-MM' (por defecto, el corriente).
 * No recalcula nada que ya tenga fuente única: obligaciones salen de `obligacion_resumen`.
 */
export async function controlAdministrativo({ periodo } = {}) {
  const { query } = await import('./db.mjs')
  const per = periodo || periodoActual()
  // Fuente única: la vista de conciliación (no se recalcula el cruce acá).
  const recibidos = (await query(
    `select emisor_nombre, imp_total, comprobante from public.comprobante_sin_registrar
      where periodo = $1 order by imp_total desc`, [per])).rows
  const cobranzas = (await query(
    `select estado, fecha_cobro, total_bruto, obra_cliente from public.cobranzas`)).rows
  const obligaciones = (await query(
    `select concepto, fecha_vencimiento, saldo_pendiente from public.obligacion_resumen`)).rows
  // Fuentes que hoy NO existen en el OS. Se detectan, no se asumen: si mañana se cargan remitos,
  // el punto pasa solo de `no_verificable` a verificado.
  const remitos = Number((await query(
    `select count(*) n from public.compras where fecha_recepcion is not null`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) > 0
  return evaluarCierre({ periodo: per, recibidos, cobranzas, obligaciones, fuentes: { remitos } }, new Date())
}
