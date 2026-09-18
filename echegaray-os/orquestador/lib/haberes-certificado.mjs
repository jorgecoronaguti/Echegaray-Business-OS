// EL CERTIFICADO DE HABERES DEL SANTANDER: QUÉ PAGÓ EL BANCO, A QUIÉN Y POR QUÉ PERÍODO. NÚCLEO PURO.
//
// ═══ POR QUÉ EXISTE (dueño, 18/09/2026) ═══
//
// Textual: «este es el historial de pagos de haberes, o sea la parte de banco que corresponde al 50 % en
// blanco de todo el 2026. Quiero que dejes esto cargado en todos los legajos como corresponde, de los
// activos e inactivos». El certificado es una carta del banco («las acreditaciones que registran nuestros
// sistemas emitidas por vuestra empresa»): persona por persona, fecha e importe. Es MÁS FUERTE que la
// columna BANCO de JORNALES (que alguien escribe a mano, y en 8 bloques de 2026 está vacía) y que el
// extracto (que trae el total del lote, sin nombres, y arranca el 28/05).
//
// ═══ LA IDENTIDAD ES EL CUIL ═══
//
// El banco trunca los nombres a 30 caracteres («Maldonado Batista Emiliano Mig») y en un caso el nombre
// del banco y el del padrón ni se parecen («Videla Santiago» / «VIDELA ISAIAS», mismo CUIL). Se cruza por
// los dígitos del CUIL contra `personas.cuil`; si no está, la acreditación se guarda igual SIN persona y
// no se da de alta a nadie (regla del dueño: el padrón no lo escribe un espejo).
//
// ═══ LAS CLASES, Y EL ORDEN EN QUE SE PRUEBAN ═══
//
// El certificado mezcla cosas distintas. Cada acreditación cae en UNA clase, y la primera regla que la
// explica con evidencia gana; lo que ninguna explica queda «a_confirmar» — nunca forzada.
//
//   sueldo_mensual     la persona está en la pestaña «Oficina 26» (los jefes cobran por mes, siempre).
//                      El mes: el de un bloque de Oficina 26 cuyo BANCO coincide al peso; si ninguno
//                      coincide, REGLA DE FECHA DEL MENSUAL (abajo).
//   quincena           un jornalero, y el importe coincide al peso con la columna BANCO de su fila en el
//                      bloque de la quincena que indica la REGLA DE FECHA DE LA QUINCENA.
//   adelanto_quincena  ídem, pero coincide con «ADELANTO BANCO / EMBARGOS» de ese bloque (28/08: tres
//                      giros de $200.000 que la planilla anota como adelanto de la 16–31/08).
//   liquidacion_final  la persona tiene `fecha_egreso`, el pago es POSTERIOR a esa fecha y a no más de
//                      30 días, y ninguna de las reglas de arriba lo explica. Sin fecha de egreso NO es
//                      final (Navarro, Contreras: `en_la_empresa = false` pero nadie anotó cuándo se fue).
//                      Regla del dueño: las finales no se consideran — no suman a ninguna quincena.
//                      Y UNA CONDICIÓN MÁS (auditoría, 18/09/2026): el ÚLTIMO bloque de la planilla en que
//                      figura la persona antes del pago no puede tener un BANCO sin acreditación propia.
//                      Si lo tiene, el pago puede estar cubriendo esa quincena más la final (Aguirre 09/04:
//                      551.429,04 contra BANCO 383.347,94 de 16–31/03 que el banco nunca acreditó sola), y
//                      partir el importe no es decisión del cargador: va «a_confirmar» con la fila nombrada.
//   quincena (por lote) un jornalero que cobró en un lote de 5 o más acreditaciones de jornaleros del mismo
//                      día, y que FIGURA en el bloque de esa quincena de la planilla, aunque el BANCO de la
//                      planilla diga otro número o nada. Es la evidencia del 30/04 (Alaniz y Castro con los
//                      importes cruzados en la planilla) y del 15/09 (la planilla todavía no anotó el banco).
//   a_confirmar        lo demás, con la evidencia que se miró escrita.
//
// ═══ LA REGLA DE FECHA DE LA QUINCENA (medida en el certificado, no supuesta) ═══
//
// Los lotes de jornaleros salen entre el 13 y el 17 del mes (pagan la 1–15 de ese mes) y entre el 28 y el
// último día (pagan la 16–fin). Verificado al peso contra la columna BANCO de «Obreros 26»:
//   16/01 → 05–15/01 (9 de 9) · 15/05 → 04–16/05 · 17/07 → 01–15/07 (15 de 15) · 14/08 → 03–15/08 (14 de 14)
//   30/04 → 16–30/04 (10 de 12) · 31/07 → 16–31/07 (15 de 15) · 31/08 → 17–31/08 (14 de 16).
// Día ≤ 20 → primera quincena; día ≥ 25 → segunda. Entre el 21 y el 24 no hay ningún pago medido: la
// regla no contesta y la acreditación queda a confirmar.
//
// ═══ LA REGLA DE FECHA DEL MENSUAL ═══
//
// Día ≤ 15 → el mes ANTERIOR; día ≥ 16 → el mismo mes. Verificado al peso sólo en 05/02 (Galván, Maldonado
// y Nievas JI coinciden con el BANCO de Oficina 26 de enero). El resto (13/01 → dic-2025, 30/04 → abril,
// 03/06 → mayo, 01/07 → junio, 31/07 → julio, 31/08 → agosto) es la regla, y por eso cada fila guarda
// `confianza = 'regla_fecha'`: la pantalla lo dice.

import { createHash } from 'node:crypto'

export const FUENTE_CERTIFICADO_2026 = 'certificado Santander del 18/09/2026'
/** «IMPORTE TOTAL» impreso al pie del certificado, en centavos. El cargador no escribe si no da esto. */
export const TOTAL_CERTIFICADO_2026_CENTAVOS = 4_358_703_527
export const FILAS_CERTIFICADO_2026 = 127

export const PESTANA_OBREROS = 'Obreros 26'
export const PESTANA_OFICINA = 'Oficina 26'

/** Un lote de jornaleros: tantas acreditaciones del mismo día o más. El menor lote real medido tiene 12. */
export const MIN_LOTE = 5
/** Días máximos entre la baja y el pago para llamarlo liquidación final. El mayor medido: 14 (Bazán). */
export const MAX_DIAS_FINAL = 30

const CLASES = new Set(['quincena', 'adelanto_quincena', 'sueldo_mensual', 'liquidacion_final', 'a_confirmar'])
export const esClase = (c) => CLASES.has(c)

/** Sólo los dígitos; `null` si no queda ninguno. */
export const cuilDigitos = (s) => {
  const d = String(s ?? '').replace(/\D/g, '')
  return d === '' ? null : d
}

/** «1234.5» → 123450. Rechaza lo que no es un importe con hasta dos decimales: no se redondea un dato del banco. */
export function aCentavos(texto) {
  const t = String(texto ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error(`importe ilegible: «${texto}»`)
  const [e, d = ''] = t.split('.')
  return Number(e) * 100 + Number((d + '00').slice(0, 2))
}

export const pesosDeCentavos = (c) => (c / 100).toFixed(2)

/** El CSV transcripto: `nombre_banco;cuil;fecha;importe`. Falla ante cualquier fila rara, no la saltea. */
export function leerCertificadoCsv(texto) {
  const lineas = String(texto).replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  const cab = lineas.shift()
  if (cab !== 'nombre_banco;cuil;fecha;importe') throw new Error(`encabezado inesperado: «${cab}»`)
  return lineas.map((l, i) => {
    const c = l.split(';')
    if (c.length !== 4) throw new Error(`fila ${i + 2}: ${c.length} columnas`)
    const [nombre, cuil, fecha, importe] = c.map((x) => x.trim())
    if (!/^\d{11}$/.test(cuil)) throw new Error(`fila ${i + 2}: CUIL «${cuil}»`)
    if (!/^2026-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) throw new Error(`fila ${i + 2}: fecha «${fecha}»`)
    const centavos = aCentavos(importe)
    if (centavos <= 0) throw new Error(`fila ${i + 2}: importe no positivo`)
    return { nombre, cuil, fecha, centavos }
  })
}

export const sumaCentavos = (filas) => filas.reduce((s, f) => s + f.centavos, 0)

/** El control del pie: la transcripción tiene que sumar exactamente lo que el banco imprimió. */
export function verificarTotal(filas, { totalCentavos, filas: n }) {
  const suma = sumaCentavos(filas)
  const errores = []
  if (suma !== totalCentavos) errores.push(`la suma da ${pesosDeCentavos(suma)} y el certificado dice ${pesosDeCentavos(totalCentavos)}`)
  if (n != null && filas.length !== n) errores.push(`hay ${filas.length} acreditaciones y el certificado tiene ${n}`)
  return { ok: errores.length === 0, suma, errores }
}

/**
 * La llave de idempotencia de cada acreditación: fuente + CUIL + fecha + importe + ocurrencia. La
 * ocurrencia (1ª, 2ª…) existe para que dos giros idénticos el mismo día a la misma persona —posibles, no
 * presentes hoy— sigan siendo dos y no colapsen en uno.
 */
export function conClaves(filas, fuente) {
  const vistas = new Map()
  return filas.map((f) => {
    const base = `${f.cuil}|${f.fecha}|${f.centavos}`
    const ocurrencia = (vistas.get(base) ?? 0) + 1
    vistas.set(base, ocurrencia)
    const clave = createHash('sha256').update(`${fuente}|${base}|${ocurrencia}`).digest('hex').slice(0, 32)
    return { ...f, ocurrencia, clave }
  })
}

// ── fechas, sin zona horaria ─────────────────────────────────────────────────────────────────────────
const partes = (iso) => iso.split('-').map(Number)
const ultimoDia = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate()
const dos = (n) => String(n).padStart(2, '0')
const diasEntre = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)

/** La quincena CALENDARIO (1–15 / 16–fin) que paga un lote de jornaleros. `null` = la regla no contesta. */
export function quincenaQuePaga(fecha) {
  const [a, m, d] = partes(fecha)
  if (d <= 20) return { desde: `${a}-${dos(m)}-01`, hasta: `${a}-${dos(m)}-15` }
  if (d >= 25) return { desde: `${a}-${dos(m)}-16`, hasta: `${a}-${dos(m)}-${dos(ultimoDia(a, m))}` }
  return null
}

/** La quincena calendario de un bloque de la planilla (los bloques arrancan el 2, el 4, el 17…). */
export function quincenaDelBloque(desde) {
  const [a, m, d] = partes(desde)
  return d <= 15
    ? { desde: `${a}-${dos(m)}-01`, hasta: `${a}-${dos(m)}-15` }
    : { desde: `${a}-${dos(m)}-16`, hasta: `${a}-${dos(m)}-${dos(ultimoDia(a, m))}` }
}

/** El mes que paga un sueldo mensual: día ≤ 15 → el anterior; si no, el mismo. */
export function mesQuePaga(fecha) {
  let [a, m, d] = partes(fecha)
  if (d <= 15) { m -= 1; if (m === 0) { m = 12; a -= 1 } }
  return { desde: `${a}-${dos(m)}-01`, hasta: `${a}-${dos(m)}-${dos(ultimoDia(a, m))}` }
}

const mesDelBloque = (desde) => {
  const [a, m] = partes(desde)
  return { desde: `${a}-${dos(m)}-01`, hasta: `${a}-${dos(m)}-${dos(ultimoDia(a, m))}` }
}

const aCent = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100))
/** «Coincide al peso»: la planilla redondea (Maldonado 05/02: banco 1.113.592,21, planilla 1.113.592). */
const alPeso = (a, b) => a != null && b != null && Math.abs(a - b) < 100
const fmt = (c) => (c == null ? 'vacío' : pesosDeCentavos(c))

/**
 * Clasifica cada acreditación.
 *
 * @param {object} p
 * @param {Array<{nombre,cuil,fecha,centavos}>} p.acreditaciones
 * @param {Array<{id,cuil,fecha_egreso,fecha_ingreso}>} p.personas  el padrón (fechas ISO o null)
 * @param {Array<{persona_id,pestana,quincena_desde,quincena_hasta,por_banco,ya_transferido}>} p.planilla
 *        el espejo de JORNALES (`jornales_bloque_persona`)
 */
export function clasificar({ acreditaciones, personas, planilla }) {
  const porCuil = new Map()
  for (const p of personas) {
    const c = cuilDigitos(p.cuil)
    if (c) porCuil.set(c, [...(porCuil.get(c) ?? []), p])
  }
  const filasDe = new Map()
  for (const r of planilla) {
    if (!r.persona_id) continue
    filasDe.set(r.persona_id, [...(filasDe.get(r.persona_id) ?? []), r])
  }
  const esMensual = (pid) => (filasDe.get(pid) ?? []).some((r) => r.pestana === PESTANA_OFICINA)

  // Lotes de jornaleros por día: se cuentan antes, porque la regla del lote mira a los demás.
  const lote = new Map()
  for (const a of acreditaciones) {
    const ps = porCuil.get(a.cuil)
    if (ps?.length === 1 && esMensual(ps[0].id)) continue
    lote.set(a.fecha, (lote.get(a.fecha) ?? 0) + 1)
  }

  const primera = acreditaciones.map((a) => {
    const ps = porCuil.get(a.cuil) ?? []
    if (ps.length !== 1) {
      return {
        ...a, persona_id: null, clase: 'a_confirmar', periodo_desde: null, periodo_hasta: null, confianza: null,
        evidencia: ps.length === 0 ? 'el CUIL no está en el padrón: no se da de alta a nadie'
          : `el CUIL está ${ps.length} veces en el padrón: no se elige una`,
      }
    }
    const p = ps[0]
    const filas = filasDe.get(p.id) ?? []
    const base = { ...a, persona_id: p.id }
    const egreso = p.fecha_egreso ? String(p.fecha_egreso).slice(0, 10) : null
    const dias = egreso ? diasEntre(egreso, a.fecha) : null
    const esFinal = egreso != null && dias > 0 && dias <= MAX_DIAS_FINAL
    // Se marca final acá; la condición del bloque anterior se resuelve en la segunda pasada, cuando ya se
    // sabe qué quincenas tienen acreditación propia.
    const final = () => ({
      ...base, clase: 'liquidacion_final', periodo_desde: null, periodo_hasta: null, confianza: 'baja_confirmada',
      evidencia: `pago ${dias} día(s) después de la baja del ${egreso} (personas.fecha_egreso)`,
    })

    if (esMensual(p.id)) {
      const oficina = filas.filter((r) => r.pestana === PESTANA_OFICINA)
      const exacta = oficina.find((r) => alPeso(aCent(r.por_banco), a.centavos))
      if (exacta) {
        const mes = mesDelBloque(String(exacta.quincena_desde).slice(0, 10))
        return {
          ...base, clase: 'sueldo_mensual', periodo_desde: mes.desde, periodo_hasta: mes.hasta, confianza: 'coincide_planilla',
          evidencia: `coincide con BANCO de ${PESTANA_OFICINA}, bloque ${String(exacta.quincena_desde).slice(0, 10)}–${String(exacta.quincena_hasta).slice(0, 10)} (${fmt(aCent(exacta.por_banco))})`,
        }
      }
      if (esFinal) return final()
      const mes = mesQuePaga(a.fecha)
      const ingreso = p.fecha_ingreso ? String(p.fecha_ingreso).slice(0, 10) : null
      const activo = (!ingreso || ingreso <= mes.hasta) && (!egreso || egreso >= mes.desde)
      if (!activo) {
        return {
          ...base, clase: 'a_confirmar', periodo_desde: null, periodo_hasta: null, confianza: null,
          evidencia: `mensual, pero no estaba en la empresa en ${mes.desde.slice(0, 7)} (ingreso ${ingreso ?? '—'}, egreso ${egreso ?? '—'})`,
        }
      }
      const delMes = oficina.filter((r) => String(r.quincena_desde).slice(0, 7) === mes.desde.slice(0, 7) && aCent(r.por_banco) != null)
      return {
        ...base, clase: 'sueldo_mensual', periodo_desde: mes.desde, periodo_hasta: mes.hasta, confianza: 'regla_fecha',
        evidencia: `regla de fecha del mensual (día ≤ 15 → mes anterior; si no, el mismo mes); ${PESTANA_OFICINA} ${delMes.length
          ? `anota BANCO ${delMes.map((r) => fmt(aCent(r.por_banco))).join(' + ')} en ese mes` : 'no anota BANCO en ese mes'}`,
      }
    }

    const q = quincenaQuePaga(a.fecha)
    const delBloque = q ? filas.filter((r) => r.pestana === PESTANA_OBREROS
      && quincenaDelBloque(String(r.quincena_desde).slice(0, 10)).desde === q.desde) : []
    const bloque = (r) => `${String(r.quincena_desde).slice(0, 10)}–${String(r.quincena_hasta).slice(0, 10)}`
    const porBanco = delBloque.find((r) => alPeso(aCent(r.por_banco), a.centavos))
    if (porBanco) {
      return {
        ...base, clase: 'quincena', periodo_desde: q.desde, periodo_hasta: q.hasta, confianza: 'coincide_planilla',
        evidencia: `coincide con BANCO de ${PESTANA_OBREROS}, bloque ${bloque(porBanco)}`,
      }
    }
    const adelanto = delBloque.find((r) => alPeso(aCent(r.ya_transferido), a.centavos))
    if (adelanto) {
      return {
        ...base, clase: 'adelanto_quincena', periodo_desde: q.desde, periodo_hasta: q.hasta, confianza: 'coincide_planilla',
        evidencia: `coincide con ADELANTO BANCO de ${PESTANA_OBREROS}, bloque ${bloque(adelanto)}`,
      }
    }
    if (esFinal) return final()
    const n = lote.get(a.fecha) ?? 0
    if (q && n >= MIN_LOTE && delBloque.length > 0) {
      const anotado = delBloque.map((r) => fmt(aCent(r.por_banco))).join(' / ')
      return {
        ...base, clase: 'quincena', periodo_desde: q.desde, periodo_hasta: q.hasta, confianza: 'regla_fecha',
        evidencia: `lote del ${a.fecha} (${n} acreditaciones de jornaleros); figura en el bloque ${bloque(delBloque[0])} y la planilla anota BANCO ${anotado}`,
      }
    }
    const motivos = [
      q ? null : 'la fecha cae entre el 21 y el 24: la regla de la quincena no contesta',
      n < MIN_LOTE ? `pago suelto (${n} acreditación(es) de jornaleros ese día)` : null,
      q && delBloque.length === 0 ? `no figura en el bloque de ${q.desde}–${q.hasta} de la planilla` : null,
      egreso ? (dias <= 0 ? `anterior a su baja del ${egreso}` : `${dias} días después de su baja del ${egreso}: fuera de la ventana de ${MAX_DIAS_FINAL}`)
        : 'sin fecha de egreso en el padrón',
    ].filter(Boolean)
    return {
      ...base, clase: 'a_confirmar', periodo_desde: null, periodo_hasta: null, confianza: null,
      evidencia: motivos.join('; '),
    }
  })

  // ── SEGUNDA PASADA: la final contra el último bloque de la planilla ───────────────────────────────
  //
  // Una quincena tiene «acreditación propia» si otra fila de la MISMA persona quedó clasificada como
  // quincena o adelanto de esa quincena calendario. Si el último bloque anterior al pago anota BANCO y
  // nadie lo acreditó, el pago único puede incluirlo: no se afirma final ni se parte — se pregunta.
  const conPeriodo = new Set(primera
    .filter((r) => r.persona_id && (r.clase === 'quincena' || r.clase === 'adelanto_quincena'))
    .map((r) => `${r.persona_id}|${r.periodo_desde}`))
  return primera.map((r) => {
    if (r.clase !== 'liquidacion_final') return r
    // El último bloque anterior al pago (o del mismo día) en que la planilla ANOTA banco para la persona.
    // Los bloques sin BANCO no dicen nada de este pago: se mira el último que sí afirma un giro.
    const ultimo = (filasDe.get(r.persona_id) ?? [])
      .filter((f) => f.pestana === PESTANA_OBREROS && String(f.quincena_hasta).slice(0, 10) <= r.fecha
        && (aCent(f.por_banco) ?? 0) > 0)
      .sort((x, y) => String(y.quincena_hasta).localeCompare(String(x.quincena_hasta)))[0]
    if (!ultimo) return { ...r, evidencia: `${r.evidencia}; ningún bloque anterior de la planilla le anota BANCO` }
    const desde = String(ultimo.quincena_desde).slice(0, 10)
    const hasta = String(ultimo.quincena_hasta).slice(0, 10)
    const banco = aCent(ultimo.por_banco)
    if (conPeriodo.has(`${r.persona_id}|${quincenaDelBloque(desde).desde}`)) {
      return { ...r, evidencia: `${r.evidencia}; el BANCO ${fmt(banco)} del último bloque (${desde}–${hasta}) tiene su propia acreditación` }
    }
    return {
      ...r, clase: 'a_confirmar', periodo_desde: null, periodo_hasta: null, confianza: null,
      evidencia: `${r.evidencia}, pero el último bloque de la planilla (${desde}–${hasta}) anota BANCO ${fmt(banco)} sin acreditación propia: el pago puede incluir esa quincena y la final. Partirlo es decisión del dueño`,
    }
  })
}

/** Suma por clase, en centavos. La suma de las clases tiene que ser el total del certificado. */
export function resumenPorClase(clasificadas) {
  const r = {}
  for (const c of clasificadas) {
    r[c.clase] ??= { n: 0, centavos: 0 }
    r[c.clase].n += 1
    r[c.clase].centavos += c.centavos
  }
  return r
}
