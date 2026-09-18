// EL MEDIO DE PAGO DE UNA QUINCENA CERRADA, CORREGIDO POR DECISIÓN DEL DUEÑO — la regla, pura y probada.
//
// Dueño, 18/09/2026 14:40: la quincena 01–15/06 se pagó en EFECTIVO, no por banco. La planilla JORNALES
// (columna BANCO) y la foto de `liquidacion_linea` (`por_banco`, `pagado_banco`) dicen $5.060.000 por banco
// para 17 obreros, y el certificado del Santander no tiene ninguna acreditación de esa quincena.
//
// ═══ QUÉ SE ESCRIBE Y QUÉ NO ═══
//
//   pagado_banco    → 0            LO PAGADO DE VERDAD por banco: nada.
//   pagado_efectivo → cobra        LO PAGADO DE VERDAD en mano: todo lo que cobró (adelantos incluidos).
//   por_banco, en_efectivo, cobra  NO SE TOCAN: son la foto del cálculo con que se cerró, y la quincena sigue cerrada.
//                                  Reabrir para corregir la foto la rehace con las horas de HOY (Agüero: 17 h en vez
//                                  de 87) y destruye lo sellado — no es un camino.
//   observacion (cabecera)         LA TRAZA: quién decidió, cuándo, qué había antes en cada línea.
//
// Regla de la casa: la web gana, JORNALES sólo completa. Las celdas BANCO de la planilla son del dueño y no se
// tocan: el script las lista para que él las vacíe.
//
// ═══ POR QUÉ TAMBIÉN LAS LÍNEAS SIN LO PAGADO REGISTRADO ═══
//
// Siete de las veinte líneas (bajas) tienen `pagado_*` en NULL porque `--completar-pagado` corrió sólo con
// `where p.en_la_empresa`, no porque no se les haya pagado: la cadena de JORNALES —que el propio cargador define
// como EL PAGO— las trae completas y coincide con la foto. La decisión del dueño es sobre la quincena entera, así
// que quedan igual que las demás, y la traza lo dice.
//
// ═══ LO QUE NO SE TOCA ═══
//
//   · Una línea con la marca «pagada» (`pagada_en`) o con `formulas` escritas: es de una persona. Se lista, no se pisa.
//   · Una línea sin `cobra`: no hay importe que dar por pagado.
//   · Una línea que ya está en efectivo por el total: nada que cambiar.

const centavos = (n) => Math.round(Number(n) * 100)
const r2 = (n) => Math.round(Number(n) * 100) / 100
const num = (v) => (v == null ? null : Number(v))

/**
 * El plan para una quincena: qué línea cambia, cuál no y por qué.
 *
 * @param {Array<{persona_id:string, nombre?:string, cobra:number|string|null, por_banco:number|string|null,
 *   pagado_banco:number|string|null, pagado_efectivo:number|string|null, pagada_en:string|null, formulas?:unknown}>} lineas
 * @returns {{ cambios: Array<{persona_id, nombre, antes:{pagado_banco:number|null,pagado_efectivo:number|null,por_banco:number},
 *   despues:{pagado_banco:0, pagado_efectivo:number}, sinRegistroPrevio:boolean}>, sinCambio: Array<{persona_id,nombre,motivo}>,
 *   noSeTocan: Array<{persona_id,nombre,motivo}> }}
 */
export function planDePagoEnEfectivo(lineas = []) {
  const cambios = []
  const sinCambio = []
  const noSeTocan = []
  for (const l of lineas) {
    const nombre = l.nombre ?? l.persona_id
    const cobra = num(l.cobra)
    if (cobra == null || !Number.isFinite(cobra)) { noSeTocan.push({ persona_id: l.persona_id, nombre, motivo: 'sin cobra sellado' }); continue }
    if (l.pagada_en) { noSeTocan.push({ persona_id: l.persona_id, nombre, motivo: `marcada pagada el ${String(l.pagada_en).slice(0, 10)}: es de una persona` }); continue }
    if (l.formulas && typeof l.formulas === 'object' && Object.keys(l.formulas).length > 0) {
      noSeTocan.push({ persona_id: l.persona_id, nombre, motivo: 'tiene cuentas escritas a mano en la fila' }); continue
    }
    const pb = num(l.pagado_banco)
    const pe = num(l.pagado_efectivo)
    const despues = { pagado_banco: 0, pagado_efectivo: r2(cobra) }
    if (pb != null && pe != null && centavos(pb) === 0 && centavos(pe) === centavos(cobra)) {
      sinCambio.push({ persona_id: l.persona_id, nombre, motivo: 'ya está en efectivo por el total' }); continue
    }
    cambios.push({
      persona_id: l.persona_id, nombre,
      antes: { pagado_banco: pb, pagado_efectivo: pe, por_banco: num(l.por_banco) ?? 0 },
      despues,
      sinRegistroPrevio: pb == null && pe == null,
    })
  }
  return { cambios, sinCambio, noSeTocan }
}

/** Lo que había por banco (registrado, o la foto si no había registro) en las líneas que cambian: el número que se corrige. */
export function bancoQueSeCorrige(plan) {
  return r2(plan.cambios.reduce((s, c) => s + (c.antes.pagado_banco ?? c.antes.por_banco ?? 0), 0))
}

const ars = (n) => (n == null ? 'sin registro' : `$${Number(n).toLocaleString('es-AR')}`)

/**
 * La traza en `liquidacion_quincena.observacion`: se AGREGA a lo que había, nunca se pisa.
 *
 * @param {string|null} observacion lo que hay hoy
 * @param {ReturnType<typeof planDePagoEnEfectivo>} plan
 * @param {{ fecha: string, motivo: string }} p `fecha` ISO de hoy; `motivo` textual de la decisión
 */
export function observacionDeMedio(observacion, plan, { fecha, motivo }) {
  const d = fecha.slice(0, 10).split('-').reverse().map((x) => String(Number(x))).join('/')
  const lineas = plan.cambios.map((c) =>
    `${c.nombre}: banco ${ars(c.antes.pagado_banco ?? c.antes.por_banco)} → $0, efectivo ${ars(c.antes.pagado_efectivo)} → ${ars(c.despues.pagado_efectivo)}${c.sinRegistroPrevio ? ' (sin registro previo)' : ''}`)
  const nota = `Medio de pago corregido el ${d} por ${motivo}: la quincena se pagó en EFECTIVO, no por banco `
    + `(el certificado del Santander no tiene acreditaciones de esta quincena). pagado_banco → 0 y pagado_efectivo = cobra en `
    + `${plan.cambios.length} línea(s); banco corregido ${ars(bancoQueSeCorrige(plan))}. La foto sellada (por_banco, en_efectivo) no se toca. `
    + `Antes: ${lineas.join(' · ')}.`
  return observacion && observacion.trim() ? `${observacion.trim()} ${nota}` : nota
}

/**
 * ¿La base quedó como el plan? Relectura en destino: cada línea que cambió tiene que leerse con lo escrito.
 * Devuelve las que no.
 */
export function diferenciasTrasEscribir(plan, leidas = []) {
  const porPersona = new Map(leidas.map((l) => [l.persona_id, l]))
  const malas = []
  for (const c of plan.cambios) {
    const l = porPersona.get(c.persona_id)
    if (!l) { malas.push({ persona_id: c.persona_id, nombre: c.nombre, motivo: 'no se releyó' }); continue }
    if (centavos(l.pagado_banco ?? NaN) !== 0 || centavos(l.pagado_efectivo ?? NaN) !== centavos(c.despues.pagado_efectivo)) {
      malas.push({ persona_id: c.persona_id, nombre: c.nombre, motivo: `leído banco ${ars(num(l.pagado_banco))} · efectivo ${ars(num(l.pagado_efectivo))}` })
    }
  }
  return malas
}
