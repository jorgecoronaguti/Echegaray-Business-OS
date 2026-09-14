#!/usr/bin/env node
// CONGELA LAS REGLAS DEL RECIBO EN UN ARCHIVO VERSIONADO: src/features/administracion/services/reglasDelRecibo.generadas.ts
//
//   node orquestador/scripts/recibos-detalle-importar.mjs --volcar /tmp/recibos.json          # en seco, lee los PDF
//   node orquestador/scripts/recibo-reglas-generar.mjs --volcado /tmp/recibos.json --antes-de Q1-09/2026 [--escribir]
//
// Sin `--escribir` imprime el resumen y no toca nada. Las reglas salen de `reglasDelRecibo` (la misma función
// que usará la tabla `recibo_sueldo_concepto` cuando esté aplicada), con su evidencia y la fecha.
//
// ═══ POR QUÉ CONGELADAS (coordinador, 14/09/2026) ═══ Primera entrega sin migración: la web no puede depender de
// una tabla que no está en la base. Se regeneran con cada tanda de recibos nuevos (una paritaria cambia las tasas
// o el seguro de vida) y el diff del archivo generado es la revisión.
//
// ═══ QUÉ QUEDA AFUERA ═══ Contribuciones patronales (no mueven el neto) y cualquier regla por persona: llevaría
// CUIL y tasas individuales dentro del código. Tampoco una regla que no aplica a ninguna quincena (un embargo).
import { readFileSync, writeFileSync } from 'node:fs'
import { reglasDelRecibo } from '../../src/features/administracion/services/reglasDelRecibo.ts'

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null)
const VOLCADO = arg('--volcado')
const ANTES_DE = arg('--antes-de')
if (!VOLCADO || !ANTES_DE) { console.error('uso: --volcado <recibos.json> --antes-de Q1-09/2026 [--escribir]'); process.exit(2) }
const DESTINO = new URL('../../src/features/administracion/services/reglasDelRecibo.generadas.ts', import.meta.url)

const recibos = JSON.parse(readFileSync(VOLCADO, 'utf8')).filter((l) => /^Q/.test(l.fila.periodo) && l.conceptos?.ok).map((l) => ({
  persona: null, periodo: l.fila.periodo, valorHora: l.fila.valor_hora,
  horasNormales: l.fila.horas_normales, horasFeriado: l.fila.horas_feriado, horasOtras: l.fila.horas_otras,
  // Sin persona: las reglas por persona no pueden formarse y no se congelan.
  conceptos: l.conceptos.lineas,
}))
const reglas = reglasDelRecibo(recibos, ANTES_DE)
const congeladas = {
  ...reglas,
  conceptos: reglas.conceptos.filter((c) => c.seccion === 'descuento' && c.modelo.tipo !== 'porcentaje_por_persona' && (c.aplica || c.soloQuincena != null)),
}

for (const c of congeladas.conceptos) {
  console.log(`${c.codigo} ${c.descripcion.padEnd(40)} ${JSON.stringify(c.modelo)} · ${c.evidencia.aciertos}/${c.evidencia.recibos}${c.dudosa ? ' DUDOSA' : ''}${c.soloQuincena ? ` sólo Q${c.soloQuincena}` : ''}${c.motivo ? ` · ${c.motivo}` : ''}`)
}
console.log(`jornada ${congeladas.jornada} · horas parcial ${congeladas.horas.parcial} (${congeladas.horas.evidencia.aciertos}/${congeladas.horas.evidencia.recibos}) · feriado por día ${JSON.stringify(congeladas.horas.feriadoPorDia)} · asistencia ${congeladas.asistencia.tasa} · ajuste ${JSON.stringify(congeladas.asistencia.ajuste)}`)
console.log(`ventana ${congeladas.periodos.join(', ')} · ${congeladas.recibos} recibos`)

if (process.argv.includes('--escribir')) {
  const hoy = new Date().toISOString().slice(0, 10)
  writeFileSync(DESTINO, `// REGLAS DEL RECIBO DE SUELDO, CONGELADAS. NO SE EDITA A MANO: se regenera.
//
// Generadas el ${hoy} desde los recibos 2026 (PDF del legajo, leídos en seco) con:
//   node orquestador/scripts/recibos-detalle-importar.mjs --volcar /tmp/recibos.json
//   node orquestador/scripts/recibo-reglas-generar.mjs --volcado /tmp/recibos.json --antes-de ${ANTES_DE} --escribir
//
// Ventana: ${congeladas.periodos.join(', ')} (${congeladas.recibos} recibos). Cada regla lleva su evidencia: recibos,
// cuántos reproduce al centavo, mediana y rango. Por qué congeladas y qué queda afuera: el script.

import type { ReglasDelRecibo } from './reglasDelRecibo.ts'

export const REGLAS_GENERADAS_EL = '${hoy}'

export const REGLAS_GENERADAS: ReglasDelRecibo = ${JSON.stringify(congeladas, null, 2)}
`)
  console.log(`escrito ${DESTINO.pathname}`)
}
