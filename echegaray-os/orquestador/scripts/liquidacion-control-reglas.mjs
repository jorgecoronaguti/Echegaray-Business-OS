// LOS SIETE CONTROLES DE LA LIQUIDACIÓN DE HORAS — lo puro. Sin base, sin red: recibe lo leído y dice qué no cuadra.
//
// ═══ POR QUÉ EXISTE (dueño, 02/10/2026) ═══
//
// En una semana: `conArrastre` restaba del efectivo la resta del recibo anterior y 11 personas cobraron de menos; la
// cuenta «contra qué cierra una fila» estaba escrita en tres lugares y dos quedaron con la regla vieja (el pie decía «no
// cierra por $372.254,72» y el cierre fue rechazado); recibos por la diferencia emitidos dos veces y sin anotar el pago.
// Nada de eso se probó contra la quincena real antes de publicar. Este control es esa prueba, y se corre sin escribir.
//
// ═══ LO QUE COMPARA CONTRA QUÉ ═══
//
// Un control nunca se valida contra la misma información que produce. Por eso cada regla cruza la cifra que la pantalla
// muestra (los MISMOS servicios de `src/`) con otra fuente o con una cuenta independiente:
//   1 fila      banco + efectivo contra cobra + resta, y los veredictos de las TRES funciones que deciden «cierra»
//               (`cierreDeLaFila`, `fotoDeLaLinea`, `totalGeneral` sobre la fila sola): si no coinciden, ése es el hallazgo.
//   2 efectivo  el efectivo de la fila contra valor hora × horas en negro, recalculado acá. Sin nada de la quincena anterior.
//   3 cierre    `fotosDelGrupo` en seco: lo que el botón Cerrar haría, sin escribir.
//   4 general   total − pagado − saldo = 0 (`totalGeneral`), como el pie de la pantalla.
//   5 base      `liquidacion_linea.pagado_efectivo` contra la suma de sus movimientos en `liquidacion_pago_efectivo`, y
//               nadie cobrando más que cobra + resta sin la marca «cobró de más».
//   6 recibos   cada RP «Diferencia de pago…» vigente con su línea y su pago anotado; ninguno emitido dos veces.
//   7 estudio   el banco del cuadro contra el neto de `recibo_sueldo_linea` + resta, y ese neto contra `nomina_recibo_neto`.
//
// Lo escrito a mano (negro, banco 0) se informa como «a mano», no como falla: es una decisión de quien liquida.

import { cierreDeLaFila } from '../../src/features/administracion/services/cuadroDeJornales.ts'
import { fotoDeLaLinea, fotosDelGrupo } from '../../src/features/administracion/services/fotoDelCierre.ts'
import {
  pagoDelMensual, separarPorTipo, tipoDeLiquidacion, totalesDeJornaleros, totalesDeMensuales, totalGeneral,
} from '../../src/features/administracion/services/liquidacionPorTipo.ts'
import { todoEnEfectivo } from '../../src/features/administracion/services/sueldoBlancoNegro.ts'
import { periodosQueCorresponden } from '../../src/features/administracion/services/recibosDelEstudio.ts'
import { marcaDeLaQuincena } from '../../src/features/administracion/services/reciboPorLaDiferencia.ts'

/** La misma tolerancia que el cierre (`fotoDelCierre.ts`): debajo es redondeo, arriba es plata. */
export const TOLERANCIA = 0.5

const r2 = (n) => Math.round(n * 100) / 100
const FMT = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 189591.91 → «189.591,91». `null` → «—»: nunca un cero inventado. */
export const pesos = (n) => (n == null || !Number.isFinite(n) ? '—' : FMT.format(n))
const difiere = (a, b) => Math.abs(r2(a - b)) > TOLERANCIA
const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')

/** «2026-09-16» → «Q 16/09». */
export const rotuloDeQuincena = (q) => `Q ${q.desde.slice(8, 10)}/${q.desde.slice(5, 7)}`

/** El informe de una quincena: cuántos controles corrieron, qué falla y qué está escrito a mano. */
function nuevoInforme(q) {
  const informe = { quincena: q, rotulo: rotuloDeQuincena(q), controles: 0, porControl: {}, hallazgos: [], informados: [] }
  return {
    informe,
    // CUÁNTAS VECES MIRÓ CADA CONTROL: uno que miró 0 veces no dijo «está bien», no dijo nada.
    control: (nombre) => { informe.controles++; informe.porControl[nombre] = (informe.porControl[nombre] ?? 0) + 1 },
    hallazgo: (control, persona, texto) => informe.hallazgos.push({ control, persona, texto }),
    informar: (control, persona, texto, tipo = 'a mano') => informe.informados.push({ control, persona, texto, tipo }),
  }
}

const restaDe = (l) => (l.arrastre?.estado === 'aplicado' ? l.arrastre.importe : 0)
const esMensual = (f) => tipoDeLiquidacion(f) === 'mensual'
/** El pago que la fila DIBUJA: el mensual sale de `pagoDelMensual`, el jornalero de `l.pago` (como `fotoDelCierre`). */
const pagoQueSeVe = (f) => (esMensual(f) ? pagoDelMensual(f.linea) : f.linea.pago)
const nombreDe = (f) => f.linea.nombre ?? f.nombre ?? f.personaId

const TOTALES_VACIOS_J = () => totalesDeJornaleros([])
const TOTALES_VACIOS_M = () => totalesDeMensuales([])

/**
 * LOS TRES VEREDICTOS SOBRE UNA FILA. `null` = esa función no afirma nada para esta fila (sin cobra, o un general cuyo
 * único descuadre es una fila sin saldo que afirmar, que la propia `totalGeneral` explica como tal).
 */
export function veredictosDeLaFila(f) {
  const fila = cierreDeLaFila(f.linea)
  const foto = fotoDeLaLinea(f.linea, f.grupo)
  const g = esMensual(f)
    ? totalGeneral(TOTALES_VACIOS_J(), totalesDeMensuales([f]), Boolean(f.cerrada))
    : totalGeneral(totalesDeJornaleros([f]), TOTALES_VACIOS_M(), Boolean(f.cerrada))
  const sinSaldo = !g.cierra && g.causas.length > 0 && g.causas.every((c) => !/escrito a mano|sin causa/.test(c.causa))
  return {
    cierreDeLaFila: fila == null ? null : fila.cierra,
    fotoDelCierre: foto.ok,
    totalGeneral: sinSaldo ? null : g.cierra,
    motivoFoto: foto.ok ? null : foto.motivo,
    descuadreGeneral: g.descuadre,
    diferenciaFila: fila?.diferencia ?? null,
  }
}

const siNo = (v) => (v == null ? '—' : v ? 'cierra' : 'no cierra')

/** 1 · banco + efectivo = cobra + resta, y las tres funciones dicen lo mismo. */
export function controlarFilas(filas, ctx) {
  for (const f of filas) {
    // LA 1ª DEL MENSUAL SE SELLA EN CERO (dueño, 02/10/2026): no liquida, no hay lados que comparar. El control 3 la cubre.
    if (f.linea.seLiquidaEnLa2da) continue
    ctx.control('fila')
    const l = f.linea
    const p = pagoQueSeVe(f)
    const cobra = esMensual(f) ? p.sueldo : l.cobra
    const resta = esMensual(f) ? 0 : restaDe(l)
    if (p.banco != null && p.negro != null && cobra != null && difiere(p.banco + p.negro, cobra + resta)) {
      ctx.hallazgo('fila', nombreDe(f), `banco ${pesos(p.banco)} + efectivo ${pesos(p.negro)} = ${pesos(r2(p.banco + p.negro))}`
        + ` ≠ cobra ${pesos(cobra)} + resta ${pesos(resta)} = ${pesos(r2(cobra + resta))}`)
    }
    const v = veredictosDeLaFila(f)
    const dichos = [v.cierreDeLaFila, v.fotoDelCierre, v.totalGeneral].filter((x) => x != null)
    if (dichos.some((x) => x !== dichos[0])) {
      ctx.hallazgo('fila', nombreDe(f), `las tres cuentas no coinciden: cierreDeLaFila ${siNo(v.cierreDeLaFila)}`
        + ` · fotoDelCierre ${siNo(v.fotoDelCierre)} · totalGeneral ${siNo(v.totalGeneral)}`)
    } else if (dichos[0] === false) {
      ctx.hallazgo('fila', nombreDe(f), `no cierra: ${v.motivoFoto ?? `diferencia ${pesos(v.diferenciaFila)}`}`)
    }
  }
}

/**
 * 2 · efectivo = valor hora × horas en negro (dueño, 02/10/2026: «es valor hora por total de hs»). Se recalcula acá
 * desde las horas y el $/h del modelo, no se lee el negro ya calculado: el defecto de `conArrastre` estaba entre los dos.
 */
export function controlarEfectivo(filas, ctx) {
  for (const f of filas) {
    const l = f.linea
    const s = l.sueldo
    if (esMensual(f) || l.seLiquidaEnLa2da || !s || s.horasNegro == null || s.valorHoraNegro == null) continue
    ctx.control('efectivo')
    const horas = r2(s.horasNegro + (s.recargoExtras ?? 0))
    const esperado = r2(horas * s.valorHoraNegro)
    const efectivo = l.pago.negro
    if (efectivo != null && !difiere(efectivo, esperado)) continue
    const cuenta = `valor hora ${pesos(s.valorHoraNegro)} × ${horas} h = ${pesos(esperado)}`
    if (l.manual?.negro || todoEnEfectivo(l)) {
      ctx.informar('efectivo', nombreDe(f), `efectivo ${pesos(efectivo)} escrito a mano${todoEnEfectivo(l) ? ' (banco 0)' : ''}; ${cuenta}`)
      continue
    }
    const resta = restaDe(l)
    const comeLaResta = resta > 0 && efectivo != null && !difiere(efectivo, esperado - resta)
    ctx.hallazgo('efectivo', nombreDe(f), `efectivo ${pesos(efectivo)} ≠ ${cuenta}`
      + (comeLaResta ? ` (le restaron la resta del recibo anterior, ${pesos(resta)})` : ''))
  }
}

/** 3 · ensayo de cierre: `fotosDelGrupo` sobre las líneas de cada cuadro abierto. No escribe nada. */
export function ensayarCierre(cuadros, cerrados, ctx) {
  for (const c of cuadros) {
    if (c.lineas.length === 0 || cerrados.has(c.grupo)) continue
    ctx.control('cierre')
    const r = fotosDelGrupo(c.lineas, c.grupo)
    if (!r.ok) ctx.hallazgo('cierre', `cuadro ${c.grupo}`, r.error)
  }
}

/** 4 · el pie general: total − pagado − saldo = 0, sobre las mismas filas y con la misma función que la pantalla. */
export function controlarGeneral(filas, ctx) {
  if (filas.length === 0) return
  ctx.control('general')
  const { jornaleros, mensuales } = separarPorTipo(filas)
  const g = totalGeneral(totalesDeJornaleros(jornaleros), totalesDeMensuales(mensuales), filas.some((f) => f.cerrada))
  if (g.cierra) return
  const causas = g.causas.map((c) => `${c.causa} ${pesos(c.importe)}`).join('; ')
  ctx.hallazgo('general', 'total general', `total ${pesos(g.total)} − pagado ${pesos(g.pagado)} − saldo ${pesos(g.saldo)}`
    + ` = ${pesos(g.descuadre)}${causas ? ` (${causas})` : ''}`)
}

/**
 * LO QUE LA PANTALLA MUESTRA COMO «PAGADO EFECTIVO», con la definición del trigger
 * `liquidacion_linea_anotar_pago_efectivo` (20261002T1800): lo escrito; si no hay, el adelanto manual; si no, el
 * adelanto del espejo de JORNALES; si no, 0. El trigger anota cada cambio de ESO como un delta, de origen `caja` o
 * reclasificado `entrega`: los dos son movimientos de la misma línea y suman los dos.
 */
export const pagadoEfectivoMostrado = (linea, espejo) =>
  Number(linea.pagado_efectivo ?? linea.adelanto_manual ?? espejo ?? 0)

/** 5a · `pagado_efectivo` de cada línea = Σ de sus movimientos en `liquidacion_pago_efectivo`. */
export function controlarBase(base, nombres, ctx) {
  const porLinea = new Map()
  for (const m of base.pagos) {
    if (m.linea_id) porLinea.set(m.linea_id, r2((porLinea.get(m.linea_id) ?? 0) + Number(m.importe)))
  }
  for (const l of base.lineas) {
    ctx.control('base')
    const mostrado = r2(pagadoEfectivoMostrado(l, base.espejoAdelanto.get(l.persona_id)))
    const suma = porLinea.get(l.id) ?? 0
    if (difiere(mostrado, suma)) {
      ctx.hallazgo('base', nombres.get(l.persona_id) ?? l.persona_id,
        `pagado efectivo ${pesos(mostrado)} ≠ Σ liquidacion_pago_efectivo ${pesos(suma)}`)
    }
  }
}

/** 5b · nadie cobró más que cobra + resta sin que la fila lo marque «cobró de más». */
export function controlarExcedentes(filas, ctx) {
  for (const f of filas) {
    if (f.linea.seLiquidaEnLa2da) continue
    const p = pagoQueSeVe(f)
    const cobra = esMensual(f) ? p.sueldo : f.linea.cobra
    if (cobra == null) continue
    ctx.control('excedente')
    const tope = r2(cobra + (esMensual(f) ? 0 : restaDe(f.linea)))
    if (!(p.pagado > tope + 1)) continue
    const texto = `pagó ${pesos(p.pagado)} (banco ${pesos(p.pagadoBanco)} + efectivo ${pesos(p.pagadoEfectivo)}) y cobra + resta es ${pesos(tope)}`
    if (p.excedente) ctx.informar('base', nombreDe(f), `cobró de más, marcado: ${texto}`, 'marcado')
    else ctx.hallazgo('base', nombreDe(f), `cobró de más SIN la marca: ${texto}`)
  }
}

const esDiferencia = (rp) => /^Diferencia de pago/.test(rp.concepto ?? '')

/** 6 · cada RP por la diferencia: con su línea, con su pago anotado («recibo RP-…») y emitido una sola vez. */
export function controlarRecibos(rps, base, q, nombres, ctx) {
  const marca = marcaDeLaQuincena(q)
  const deEsta = rps.filter((rp) => !rp.anulado_en && rp.persona_id && esDiferencia(rp)
    && (base.liquidaciones.has(rp.liquidacion_id) || rp.concepto.includes(marca)))
  for (const rp of deEsta) {
    ctx.control('recibos')
    const quien = nombres.get(rp.persona_id) ?? rp.persona_id
    if (!rp.linea_id) { ctx.hallazgo('recibos', quien, `recibo ${rp.codigo} (${pesos(Number(rp.importe))}) sin linea_id`); continue }
    const pago = base.pagos.find((m) => m.linea_id === rp.linea_id && (m.nota ?? '').includes(`recibo ${rp.codigo}`))
    if (!pago) ctx.hallazgo('recibos', quien, `recibo ${rp.codigo} (${pesos(Number(rp.importe))}) sin su pago en liquidacion_pago_efectivo`)
    else if (difiere(Number(pago.importe), Number(rp.importe))) {
      ctx.hallazgo('recibos', quien, `recibo ${rp.codigo} por ${pesos(Number(rp.importe))} anotado como pago de ${pesos(Number(pago.importe))}`)
    }
  }
  const grupos = new Map()
  for (const rp of deEsta) {
    const k = `${rp.persona_id}|${rp.concepto}`
    grupos.set(k, [...(grupos.get(k) ?? []), rp])
  }
  for (const [, mismos] of grupos) {
    ctx.control('recibos')
    if (mismos.length > 1) {
      ctx.hallazgo('recibos', nombres.get(mismos[0].persona_id) ?? mismos[0].persona_id,
        `recibos duplicados por la misma diferencia: ${mismos.map((x) => `${x.codigo} ${pesos(Number(x.importe))}`).join(', ')}`)
    }
  }
}

/** Los recibos del estudio que corresponden a la fila: jornalero, el de la quincena; mensual en la 2ª, los dos del mes. */
function recibosDeLaFila(f, q, estudio) {
  const mensualQueLiquida = esMensual(f) && !f.linea.seLiquidaEnLa2da
  const periodos = periodosQueCorresponden(mensualQueLiquida ? 'mensual' : 'quincenal', q.desde)
  const filas = periodos.map((p) => estudio.find((e) => e.persona_id === f.personaId && e.periodo === p) ?? null)
  return filas.every((x) => x != null) ? filas : null
}

/** 7 · el banco del cuadro = neto del recibo del estudio + resta; lo girado no lo pasa; y las dos fuentes del neto coinciden. */
export function controlarEstudio(filas, q, fuentes, ctx) {
  for (const f of filas) {
    const recibos = recibosDeLaFila(f, q, fuentes.estudio)
    if (!recibos) continue
    const quien = nombreDe(f)
    controlarNominaContraEstudio(recibos, fuentes.nomina, quien, ctx)
    ctx.control('estudio')
    const l = f.linea
    const p = pagoQueSeVe(f)
    const neto = r2(recibos.reduce((s, r) => s + Number(r.neto), 0))
    const resta = esMensual(f) ? 0 : restaDe(l)
    const esperado = r2(neto + resta)
    const deRecibo = `neto recibo ${pesos(neto)}${resta ? ` + resta ${pesos(resta)}` : ''}`
    const aMano = todoEnEfectivo(l) || l.manual?.porBanco === true
    if (p.banco == null || difiere(p.banco, esperado)) {
      if (aMano) ctx.informar('estudio', quien, `banco ${pesos(p.banco)} escrito a mano; ${deRecibo}`)
      else ctx.hallazgo('estudio', quien, `banco del cuadro ${pesos(p.banco)} ≠ ${deRecibo}`)
    }
    // LO GIRADO DE MÁS: el banco que salió no puede pasar el recibo (+ resta). Menos es un saldo, no un defecto.
    if (!aMano && p.pagadoBanco > esperado + TOLERANCIA) {
      ctx.hallazgo('estudio', quien, `pagado banco ${pesos(p.pagadoBanco)} ≠ ${deRecibo}`)
    }
  }
}

/** El neto de `recibo_sueldo_linea` contra el de `nomina_recibo_neto` (de ésta sale el banco del mensual). */
function controlarNominaContraEstudio(recibos, nomina, quien, ctx) {
  for (const r of recibos) {
    const n = nomina.find((x) => x.periodo === r.periodo && soloDigitos(x.cuil) === soloDigitos(r.cuil))
    if (!n) continue
    ctx.control('nomina')
    if (difiere(Number(n.neto), Number(r.neto))) {
      ctx.hallazgo('estudio', quien, `${r.periodo}: recibo_sueldo_linea neto ${pesos(Number(r.neto))} ≠ nomina_recibo_neto ${pesos(Number(n.neto))}`)
    }
  }
}

/**
 * LA QUINCENA ENTERA. `d`: `quincena`, `filas` (las del cuadro, `leerCuadroDeLaQuincena`), `cuadros` (las líneas por
 * grupo, `getLiquidacionDeLaQuincena`), `cerrados` (Set de grupos), y `base` con lo leído aparte: `lineas`, `pagos`,
 * `espejoAdelanto` (Map persona → adelanto de JORNALES), `liquidaciones` (Set de ids), `rps`, `estudio`, `nomina`.
 */
export function controlarQuincena(d) {
  const ctx = nuevoInforme(d.quincena)
  const nombres = new Map(d.filas.map((f) => [f.personaId, nombreDe(f)]))
  controlarFilas(d.filas, ctx)
  controlarEfectivo(d.filas, ctx)
  ensayarCierre(d.cuadros, d.cerrados, ctx)
  controlarGeneral(d.filas, ctx)
  controlarBase(d.base, nombres, ctx)
  controlarExcedentes(d.filas, ctx)
  controlarRecibos(d.base.rps, d.base, d.quincena, nombres, ctx)
  controlarEstudio(d.filas, d.quincena, d.base, ctx)
  return ctx.informe
}

/** 0 = sin hallazgos · 1 = con hallazgos · 2 = no pude mirar algo. «No pude mirar» NUNCA es verde. */
export function codigoDeSalida(informes, noPude) {
  if (noPude.length > 0) return 2
  return informes.some((i) => i.hallazgos.length > 0) ? 1 : 0
}

/** Las líneas para una persona: un hallazgo por línea, después lo escrito a mano, después el resumen. */
export function textoDelInforme(informes, noPude) {
  const lineas = []
  for (const i of informes) for (const h of i.hallazgos) lineas.push(`${i.rotulo} · ${h.persona} · ${h.texto}`)
  for (const i of informes) for (const h of i.informados) lineas.push(`(${h.tipo}) ${i.rotulo} · ${h.persona} · ${h.texto}`)
  for (const n of noPude) lineas.push(`NO PUDE MIRAR · ${n}`)
  const controles = informes.reduce((s, i) => s + i.controles, 0)
  const hallazgos = informes.reduce((s, i) => s + i.hallazgos.length, 0)
  for (const i of informes) {
    lineas.push(`${i.rotulo}: ${Object.entries(i.porControl).map(([k, n]) => `${k} ${n}`).join(' · ') || 'nada que mirar'}`)
  }
  lineas.push(`${controles} controles · ${hallazgos} hallazgos${noPude.length ? ` · ${noPude.length} sin mirar` : ''}`)
  return lineas.join('\n')
}
