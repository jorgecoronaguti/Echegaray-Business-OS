// LOS DOS INFORMES DEL GENERADOR DE IMPUESTOS — lo que se imprime antes de firmar.
//
// POR QUÉ VIVEN ACÁ (06/08). El script pasó de 1.253 líneas a poco más de cuatrocientas repartiendo
// lo que no es orquestación. Estos dos no escriben nada: exhiben el insumo al lado del resultado para
// que un tercero pueda rehacer la cuenta con la calculadora y el archivo abierto. Un importe fiscal
// que no reproduce su propia definición no se puede firmar.

import { RANGO_ALICUOTA_IVA, proyectarLibreDisponibilidad, mesEnQueSeAgota } from './iva-libre-disponibilidad.mjs'
import { MES } from './impuestos-grilla.mjs'
import { IIBB_SUPUESTO, cobertura, FUENTE_VERIFICADA, TERMINACION_CUIT } from './vencimientos-fiscales.mjs'
import { diasAlProximo } from './impuestos-posicion.mjs'

/** QUÉ VA A ESCRIBIR LA PROYECCIÓN, CON EL INSUMO AL LADO DEL RESULTADO. */
export function informarProyeccion(proy) {
  if (!proy?.meses?.length) {
    console.log(`  IVA: nada que proyectar (último mes con dato: ${proy?.ultimoMesConDato ?? 'ninguno'})`)
    return
  }
  const alic = proy.alicuotaVigente ?? 0.21
  const money = (n) => Math.round(n).toLocaleString('es-AR')
  console.log(`\n  ══ PROYECCIÓN DE IVA — lo que se va a escribir en "${PESTAÑA}" ══`)
  console.log(`  ancla: ${MES[proy.ultimoMesConDato - 1]} con $${money(proy.libreDisp ?? 0)} de libre disponibilidad`)
  console.log(`  alícuota: ${alic}${proy.alicuotaVigente === null ? ' (la celda todavía no existe: se siembra)' : ` (rango ${RANGO_ALICUOTA_IVA})`}`
    + ` · el IVA se extrae del bruto con a/(1+a) = ${(alic / (1 + alic)).toFixed(9)}`)
  const futuros = proy.meses.map((m) => ({
    periodo: `2026-${String(m).padStart(2, '0')}`,
    base_debito: proy.bases[m].debito.reduce((s, b) => s + b.valor, 0),
    base_credito: proy.bases[m].credito.reduce((s, b) => s + b.valor, 0),
    supuesto: proy.supuesto,
  }))
  const calc = proyectarLibreDisponibilidad(
    [{ periodo: `2026-${String(proy.ultimoMesConDato).padStart(2, '0')}`, libre_disp: proy.libreDisp ?? 0 }], futuros, alic)
  for (const m of proy.meses) {
    console.log(`\n  ── ${MES[m - 1]}-26 ────────────────────────────────────────────────────`)
    for (const lado of ['debito', 'credito']) {
      let suma = 0
      for (const b of proy.bases[m][lado]) {
        suma += b.valor
        console.log(`    ${lado === 'debito' ? 'DÉB' : 'CRÉ'}  ${b.celda.padEnd(14)} ${b.rotulo.slice(0, 46).padEnd(48)} ${money(b.valor).padStart(15)}`)
      }
      console.log(`         ${''.padEnd(14)} ${'BASE (suma de las de arriba)'.padEnd(48)} ${money(suma).padStart(15)}`)
      console.log(`         ${''.padEnd(14)} ${`× ${alic}/(1+${alic}) =`.padEnd(48)} ${money(suma * alic / (1 + alic)).padStart(15)}`)
    }
    const r = calc.find((x) => x.periodo === `2026-${String(m).padStart(2, '0')}`)
    console.log(`    ⇒ IVA A PAGAR EN EFECTIVO${''.padEnd(35)} ${money(r.a_pagar_efectivo).padStart(15)}`)
    console.log(`      libre disponibilidad que queda${''.padEnd(29)} ${money(r.libre_disp).padStart(15)}`)
  }
  const total = calc.reduce((s, x) => s + (x.a_pagar_efectivo || 0), 0)
  const agota = mesEnQueSeAgota(calc)
  console.log(`\n  TOTAL a pagar en efectivo: $${money(total)} · el saldo a favor se agota en ${agota ? MES[Number(agota.slice(5)) - 1] : 'ningún mes del horizonte'}`)
}

/** Qué vence, cuándo y con qué certeza — para el --dry, que es donde se firma. */
export function informarCalendario(g, hoy) {
  const cob = cobertura()
  console.log(`\n  ══ CALENDARIO DE VENCIMIENTOS — CUIT terminación ${TERMINACION_CUIT}, banda ARCA "${FUENTE_VERIFICADA.bandaCuit}" ══`)
  console.log(`  tabla verificada: ${FUENTE_VERIFICADA.organismo} · ${FUENTE_VERIFICADA.servicio}, consultada el ${FUENTE_VERIFICADA.consultadaEl}`)
  console.log(`  cobertura: IVA hasta el período ${cob.iva} · planes hasta ${cob.plan} · IIBB SIN tabla (supuesto día ${IIBB_SUPUESTO.dia})`)
  const d = diasAlProximo(g.cal, hoy)
  console.log(`  próximo vencimiento: ${d === null ? 'ninguno en la ventana' : `en ${d} día(s)`}`)
  for (const o of g.cal) {
    console.log(`   ${o.fecha}  ${o.vencido ? '⚠ VENCIDO' : `en ${String(o.dias).padStart(3)}d`}  ${o.concepto.padEnd(34)} ${o.celda.padEnd(8)} ${o.confianza}`)
  }
}

