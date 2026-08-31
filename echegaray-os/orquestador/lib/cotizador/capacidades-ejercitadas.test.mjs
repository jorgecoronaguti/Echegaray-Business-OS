// LAS CAPACIDADES QUE EXISTÍAN Y NUNCA HABÍAN CORRIDO — #11 indirectos y #12 política versionada.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO ATRAPA ═══
//
// `orquestador.mjs` USABA `indirectoCalculado`, `indirectoAplicado` y `proyectarACascada` en la
// etapa COMMERCIAL y **nunca los importó**. En ESM eso no es un error de parseo: es un
// `ReferenceError` en tiempo de ejecución, y sólo se alcanza cuando la corrida trae
// `estructuraIndirecta` o `politicaEfectivaDeLaCotizacion` — los dos con default `null`.
//
// Ninguna corrida se los pasaba, así que el camino no se evaluó jamás y toda la suite seguía verde.
// La DoD lo leía desde la base y lo contaba como una decisión de diseño («el indirecto sigue
// entrando por el porcentaje de la política»): no era una decisión, era una mina. La primera
// cotización que intentara usar su estructura de indirectos se caía con
// «indirectoAplicado is not defined».
//
// Los números de la estructura NO son inventados: son los cuatro renglones de gastos generales de la
// hoja GG de la cotización REAL de FRANCO QUATTROPANI, medidos en
// `datos/conocimiento/hallazgos-cotizaciones.json` sobre el archivo «Cotizacion Final.xlsm», con su
// celda. El rótulo promete un porcentaje y la celda G aplica otro: eso es la empresa haciendo
// override sin registrarlo, y es exactamente el caso que separa CALCULADO de APLICADO.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correr, etapa } from './orquestador.mjs'
import { ESTADO, STATUS } from './contrato.mjs'
import {
  conceptoIndirecto, estructuraIndirecta, indirectoCalculado, indirectoAplicado, overrideDeIndirecto,
  BASE_INDIRECTO, BLOQUE_INDIRECTO,
} from './indirectos.mjs'
import {
  componenteDePolitica, versionDePolitica, politicaEfectiva, referenciaDePolitica,
  resolverReferencia, overrideDeCotizacion, ESTADO_VERSION,
} from './politica-version.mjs'
import { observacionDePrecio } from './precios.mjs'
import { politicaComercial } from './comercial.mjs'

const HOY = new Date('2026-08-31T12:00:00Z')

// ── El costo directo del que cuelga todo: 100 × (45 × 1200 × 1,05 + 2 × 4200) = 6.510.000.
const PARTIDA = {
  codigo: 'MAM-01', descripcion: 'Mampostería de ladrillón', unidad: 'M2', cantidad: 100,
  composicion: [
    { recursoCodigo: 'MAT-1', nombre: 'Ladrillón', tipo: 'material', unidad: 'un', cantidad: 45, desperdicio: 0.05 },
    { recursoCodigo: 'MO-1', nombre: 'Oficial', tipo: 'mano_obra', unidad: 'hs', cantidad: 2, desperdicio: 0 },
  ],
}
const OBS = [
  observacionDePrecio({ recursoCodigo: 'MAT-1', precio: 1200, fuente: 'lista 08/2026', observadoEn: '2026-08-20' }),
  observacionDePrecio({ recursoCodigo: 'MO-1', precio: 4200, fuente: 'convenio UOCRA', observadoEn: '2026-08-20' }),
]
const COSTO_DIRECTO = 6_510_000

/** Los cuatro renglones REALES de la hoja GG de «Cotizacion Final.xlsm» (FRANCO QUATTROPANI).
 *  `pct` es lo que PROMETE EL RÓTULO. Lo que la celda G aplica va aparte, como intento de override. */
const GG_QUATTROPANI = [
  { concepto: 'Gastos administrativos con amort. y mant. de bienes de uso administrativos', rotulo: 0.04, aplicado: 0.02, celda: 'B54' },
  { concepto: 'Gastos contables', rotulo: 0.006, aplicado: 0.02, celda: 'B57' },
  { concepto: 'Alquiler de oficina y servicios', rotulo: 0.012, aplicado: 0.015, celda: 'B60' },
  { concepto: 'Librería', rotulo: 0.0015, aplicado: 0.01, celda: 'B61' },
]
const PCT_ROTULO = 0.0595 // 0,04 + 0,006 + 0,012 + 0,0015

const estructuraDeLaHojaGG = (extra = []) => estructuraIndirecta({
  version: 1, fuente: 'Cotizacion Final.xlsm · hoja GG · rótulos B54/B57/B60/B61 (FRANCO QUATTROPANI)',
  conceptos: [
    ...GG_QUATTROPANI.map((c) => conceptoIndirecto({
      concepto: c.concepto, bloque: BLOQUE_INDIRECTO.EMPRESA, base: BASE_INDIRECTO.PCT_COSTO_DIRECTO,
      pct: c.rotulo, fuente: `Cotizacion Final.xlsm · hoja GG · ${c.celda}`,
    })),
    ...extra,
  ],
})

/** La política v1 REAL de `politica_comercial_version`, componente por componente y con su
 *  `margenObjetivoPct` en CONFLICTO. El conflicto 17 % vs 12 % NO se resuelve acá: se preserva. */
const CONFLICTO_MARGEN = 'El código productivo (ListaPresupuestos.tsx:58) usa 17 % y el handoff de diseño de la cartera (pantalla 14) dice 12 %. No hay evidencia de cuál decidió el dueño.'
const VERSION_1 = versionDePolitica({
  version: 1, estado: ESTADO_VERSION.PUBLICADA, publicadaPor: 'siembra 21/08/2026',
  fuente: 'Planilla para Cotizar (2).xlsm · hoja Presupuesto B62:H89 · reverse-engineering 21/08/2026',
  componentes: [
    componenteDePolitica({ clave: 'pctBeneficio', valor: 0.22, fuente: 'hoja Presupuesto B62:H89' }),
    componenteDePolitica({ clave: 'pctFinanciero', valor: 0.07, fuente: 'hoja Presupuesto B62:H89' }),
    componenteDePolitica({ clave: 'factorFinanciero', valor: 0.5, fuente: 'hoja Presupuesto B62:H89' }),
    componenteDePolitica({ clave: 'pctIibb', valor: 0.024, fuente: 'DGR San Juan' }),
    componenteDePolitica({ clave: 'pctGanancias', valor: 0.02, fuente: 'hoja Presupuesto B62:H89' }),
    componenteDePolitica({ clave: 'pctCheque', valor: 0.012, fuente: 'hoja Presupuesto B62:H89' }),
    componenteDePolitica({ clave: 'pctIva', valor: 0.21, fuente: 'RG AFIP' }),
    componenteDePolitica({ clave: 'pctRiesgo', valor: null, fuente: 'la empresa no lo declaró' }),
    componenteDePolitica({ clave: 'pctContingencia', valor: null, fuente: 'la empresa no lo declaró' }),
    componenteDePolitica({ clave: 'margenObjetivoPct', valor: null, fuente: 'dos fuentes internas', conflicto: CONFLICTO_MARGEN }),
  ],
})

const corrida = (extra = {}) => correr({
  documentos: [{ hash: 'cot-final', nombre: 'Cotizacion Final.xlsm', parseado: true }],
  elementos: [{ id: 'E1' }],
  partidas: [PARTIDA], observaciones: OBS, hoy: HOY,
  cliente: 'FRANCO QUATTROPANI', clientesConocidos: ['FRANCO QUATTROPANI'],
  alcancePorDefecto: { estado: 'INCLUIDO', fuente: 'cargada en el presupuesto COT-2026-001' },
  ...extra,
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CABLEADO — la etapa COMMERCIAL con estructura de indirectos siquiera CORRE
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('#11 · una corrida CON estructura de indirectos no se cae: los tres símbolos están importados', () => {
  // Ésta es la regresión del defecto. Antes del arreglo esto no fallaba en un assert: TIRABA
  // `ReferenceError: indirectoAplicado is not defined` y ni siquiera llegaba a la etapa.
  const r = corrida({ estructuraIndirecta: estructuraDeLaHojaGG() })
  const c = etapa(r, 'COMMERCIAL')
  assert.equal(r.costoDirecto.total, COSTO_DIRECTO)
  assert.equal(c.result.indirectoCalculado, PCT_ROTULO, 'el 5,95 % sale de los cuatro rótulos de la hoja GG, no de un 27 % heredado')
  assert.equal(c.result.indirectoAplicado, PCT_ROTULO)
  assert.equal(c.result.brechaDeAbsorcion, null, 'sin override no hay brecha: no es cero, es que no hubo diferencia que medir')
  assert.ok(c.provenance.some((p) => p.startsWith('indirecto CALCULADO')), `provenance: ${JSON.stringify(c.provenance)}`)
  // MUTACIÓN CORRIDA: comentar `import { indirectoCalculado, indirectoAplicado } from './indirectos.mjs'`
  //   en `orquestador.mjs` — que es EXACTAMENTE el estado en el que estaba el archivo.
  //   FALLA: «ReferenceError: indirectoAplicado is not defined» en los 6 tests de este archivo que
  //   pasan una estructura o una política efectiva.
})

test('#11 · CALCULADO y APLICADO son dos campos, y sin estructura no aparece ninguno', () => {
  // La corrida de siempre —sin estructura— sigue siendo la de siempre: el indirecto entra por la
  // política y el resultado de COMMERCIAL no inventa dos campos que nadie calculó.
  const r = corrida()
  const c = etapa(r, 'COMMERCIAL')
  assert.equal('indirectoCalculado' in c.result, false)
  assert.equal('indirectoAplicado' in c.result, false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UN CONCEPTO SIN VALOR BLOQUEA — y ése es el estado REAL de la base
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('#11 · un solo concepto sin valor deja el indirecto en null y BLOQUEA el precio — no lo baja', () => {
  // «Matrículas profesionales» es uno de los 14 conceptos reales de `indirecto_concepto`, y su base
  // es PRORRATEO_ANUAL. La estructura real NO declara `costoDirectoAnual`: sin denominador el
  // porcentaje no se puede calcular, y repartirlo sobre esta obra afirmaría que esta obra absorbe
  // TODA la estructura del año.
  const conHueco = estructuraDeLaHojaGG([conceptoIndirecto({
    concepto: 'Matrículas profesionales', bloque: BLOQUE_INDIRECTO.EMPRESA,
    base: BASE_INDIRECTO.PRORRATEO_ANUAL, montoAnual: 1_200_000,
    fuente: 'indirecto_concepto · siembra 29/08/2026',
  })])
  const r = corrida({ estructuraIndirecta: conHueco })
  const c = etapa(r, 'COMMERCIAL')
  assert.equal(c.result.indirectoCalculado, null, 'un total al que le falta un renglón engaña más que un total ausente')
  assert.equal(c.result.indirectoAplicado, null)
  assert.equal(c.status, STATUS.BLOQUEADA)
  assert.equal(c.result.estado, ESTADO.FALTA_DATO)
  assert.equal(c.result.ventaFinal ?? null, null, 'SIN INDIRECTO NO HAY PRECIO: no se publica un precio con el indirecto en cero')
  assert.ok(c.missing_data.some((m) => /Matrículas profesionales/.test(m) && /costo directo anual/.test(m)),
    `el motivo tiene que nombrar el concepto Y la causa: ${JSON.stringify(c.missing_data)}`)
  // MUTACIÓN CORRIDA: en `indirectos.mjs::indirectoCalculado`, cambiar la rama de huecos por
  //   `pct: porConcepto.filter(c => c.pct !== null).reduce((a, c) => a + c.pct, 0)` —o sea, sumar los
  //   que sí tienen—. FALLA: «un total al que le falta un renglón engaña más que un total ausente:
  //   0.0595 !== null».
})

test('#11 · la ESTRUCTURA REAL de la base —14 conceptos, ninguno con valor— produce 14 huecos y cero precio', () => {
  // Los 14 conceptos de `indirecto_concepto` están cargados con `monto_anual`, `pct` y `monto` en
  // NULL. Ejercitarlos NO da un porcentaje: da catorce motivos. Es el resultado correcto y es el
  // que la corrida real reproduce — el escenario `xsas-escenario-indirectos-politica.mjs` lo mide
  // contra la base viva.
  const catorce = estructuraIndirecta({
    fuente: 'public.indirecto_concepto · 14 filas · siembra 29/08/2026',
    conceptos: [
      ...['Alquiler de oficina y servicios', 'Amortización de máquinas y herramientas',
        'Costos financieros y mantenimiento de bancos', 'Gastos administrativos con amort. y mant. de bienes de uso administrativos',
        'Gastos contables', 'Librería', 'Mantenimiento y amortización de vehículos'].map((c) => conceptoIndirecto({
        concepto: c, bloque: BLOQUE_INDIRECTO.EMPRESA, base: BASE_INDIRECTO.PCT_COSTO_DIRECTO, fuente: 'indirecto_concepto',
      })),
      conceptoIndirecto({ concepto: 'Matrículas profesionales', bloque: BLOQUE_INDIRECTO.EMPRESA, base: BASE_INDIRECTO.PRORRATEO_ANUAL, fuente: 'indirecto_concepto' }),
      ...['Derechos, aranceles y aprobaciones (Municipalidad, OSSE, DPV, Energía SJ)',
        'Ensayos y revisión de cálculo estructural', 'Obrador y gastos comunes de obra',
        'Personal de conducción de obra (capataz, encargado de depósito)', 'Personal de oficina técnica',
        'Seguridad e higiene (programa y honorarios de prevencionista)'].map((c) => conceptoIndirecto({
        concepto: c, bloque: BLOQUE_INDIRECTO.OBRA, base: BASE_INDIRECTO.MONTO_POR_OBRA, fuente: 'indirecto_concepto',
      })),
    ],
  })
  const calc = indirectoCalculado({ estructura: catorce, costoDirectoObra: COSTO_DIRECTO })
  assert.equal(calc.nConceptos, 14)
  assert.equal(calc.nHuecos, 14, 'los 14 se ejercitan y los 14 son huecos: NINGUNO vale cero')
  assert.equal(calc.pct, null)
  assert.equal(calc.estado, ESTADO.FALTA_DATO)
  assert.equal(calc.issues.length, 14, 'un issue por concepto: el que carga los datos tiene que saber cuáles')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL OVERRIDE — el que la empresa YA hace y no registra
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('#11 · el coeficiente que la hoja GG aplica NO se aplica: no trae actor ni motivo', () => {
  // Es el hallazgo, no una hipótesis: el rótulo B54 promete 4 % y la celda G54 aplica 2 %. La celda
  // es evidencia y tiene fecha, pero nadie firmó ese cambio ni dijo por qué. Un override con dos de
  // cuatro campos NO se aplica — y tampoco se pierde.
  const intento = overrideDeIndirecto({
    valor: 0.065, fecha: '2026-08-28',
    evidencia: 'Cotizacion Final.xlsm · hoja GG · G54, G57, G60, G61',
  })
  assert.equal(intento.ok, false)
  assert.deepEqual(intento.faltan, ['actor', 'motivo'])

  const r = corrida({ estructuraIndirecta: estructuraDeLaHojaGG(), intentoDeIndirecto: intento })
  const c = etapa(r, 'COMMERCIAL')
  assert.equal(c.result.indirectoAplicado, PCT_ROTULO, 'se descartó el override: el aplicado sigue siendo el calculado')
  assert.ok(c.missing_data.some((m) => /actor, motivo/.test(m)), `el motivo del descarte viaja: ${JSON.stringify(c.missing_data)}`)
  // MUTACIÓN CORRIDA: en `indirectos.mjs::overrideDeIndirecto`, cambiar
  //   `const faltan = CAMPOS_OVERRIDE.filter((k) => !traido[k])` por `const faltan = []` — o sea,
  //   dejar de exigir los cuatro campos. FALLA: «Expected values to be strictly equal: true !== false»
  //   sobre `intento.ok`, y el 0,065 de la celda G entra al precio sin que nadie lo haya firmado.
})

test('#11 · un override COMPLETO se aplica, el calculado no se pierde, y la brecha sale en $', () => {
  const intento = overrideDeIndirecto({
    valor: 0.02, actor: 'jorge', motivo: 'el cliente compara contra una oferta sin estructura',
    fecha: '2026-08-31', evidencia: 'mail 31/08 · «bajamos GG para entrar»',
  })
  assert.equal(intento.ok, true)
  const ap = indirectoAplicado({ calculado: indirectoCalculado({ estructura: estructuraDeLaHojaGG(), costoDirectoObra: COSTO_DIRECTO }), intento })
  assert.equal(ap.calculado, PCT_ROTULO)
  assert.equal(ap.aplicado, 0.02)
  // (0,02 − 0,0595) × 6.510.000 = −257.145. Es la plata de estructura que esta obra NO absorbe.
  assert.equal(ap.brechaDeAbsorcion, -257_145)
  assert.equal(ap.estado, ESTADO.CONFIRMADO)
  assert.ok(ap.issues.some((i) => i.impact === 257_145), 'la plata que la obra deja de absorber sale como issue con su monto')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// #12 · LA POLÍTICA VERSIONADA — la cotización REFERENCIA una versión, no copia sus números
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('#12 · la corrida cita la versión de política que referenció, no «la vigente»', () => {
  const ref = referenciaDePolitica({ cotizacionId: 'COT-2026-001', version: 1 })
  const res = resolverReferencia(ref, [VERSION_1])
  assert.equal(res.ok, true)
  const efectiva = politicaEfectiva({ version: res.version, overrides: [] })
  const r = corrida({ estructuraIndirecta: estructuraDeLaHojaGG(), politicaEfectivaDeLaCotizacion: efectiva })
  const c = etapa(r, 'COMMERCIAL')
  assert.equal(c.status, STATUS.OK)
  assert.equal(c.result.estado, ESTADO.CALCULADO)
  assert.ok(c.provenance.some((p) => p === 'política versión 1 — referenciada, no copiada'), JSON.stringify(c.provenance))
  assert.ok(c.result.ventaFinal > COSTO_DIRECTO, 'el precio sale de la cascada del libro con el 5,95 % calculado adentro')
  // MUTACIÓN CORRIDA: comentar `import { proyectarACascada } from './politica-version.mjs'`.
  //   FALLA: «ReferenceError: proyectarACascada is not defined».
})

test('#12 · una referencia a una versión que NO está en el catálogo no cae a la vigente', () => {
  const res = resolverReferencia(referenciaDePolitica({ cotizacionId: 'COT-2026-001', version: 2 }), [VERSION_1])
  assert.equal(res.ok, false)
  assert.equal(res.version, null, 'caer a la v1 haría que una oferta de septiembre se defienda con la política de agosto sin decirlo')
  assert.match(res.porQue, /el precio NO se recalcula contra otra/)
})

test('#12 · el CONFLICTO_EMPRESARIAL del margen objetivo sobrevive a la corrida entera', () => {
  // 17 % vs 12 %: el sistema NO elige uno para ponerse verde. La cascada calcula el precio —el
  // margen objetivo no es un escalón— y el conflicto sigue ahí, sin resolver y sin desaparecer.
  const efectiva = politicaEfectiva({ version: VERSION_1, overrides: [] })
  assert.equal(efectiva.valores.margenObjetivoPct, null, 'un conflicto no vale 17, ni 12, ni cero')
  const comp = VERSION_1.porClave.margenObjetivoPct
  assert.equal(comp.estado, ESTADO.CONFLICTO)
  assert.equal(comp.conflicto, CONFLICTO_MARGEN)
  const r = corrida({ estructuraIndirecta: estructuraDeLaHojaGG(), politicaEfectivaDeLaCotizacion: efectiva })
  assert.equal(etapa(r, 'COMMERCIAL').status, STATUS.OK, 'el conflicto no bloquea el precio: bloquea el JUICIO sobre el precio')
  assert.equal(r.cascada.margenObjetivoPct ?? null, null, 'la cascada no puede haberse traído un margen objetivo de ningún lado')
})

test('#12 · un override de cotización sin autorización NO se aplica y queda a la vista', () => {
  const sinFirma = overrideDeCotizacion({ clave: 'pctBeneficio', valor: 0.15, motivo: 'para ganar la obra' })
  assert.equal(sinFirma.ok, false)
  assert.deepEqual(sinFirma.faltan, ['autorizadoPor', 'evidencia', 'fecha'])
  const conFirma = overrideDeCotizacion({
    clave: 'pctBeneficio', valor: 0.15, autorizadoPor: 'jorge', motivo: 'para ganar la obra',
    evidencia: 'mail 31/08', fecha: '2026-08-31',
  })
  const efectiva = politicaEfectiva({ version: VERSION_1, overrides: [sinFirma, conFirma] })
  assert.equal(efectiva.valores.pctBeneficio, 0.15)
  assert.equal(efectiva.aplicados.length, 1)
  assert.equal(efectiva.aplicados[0].valorAnterior, 0.22, 'el valor de la versión no se pierde: es contra qué se lee el override')
  assert.equal(efectiva.rechazados.length, 1, '«se intentó y no se pudo» y «nunca se intentó» dicen cosas distintas')
  assert.equal(efectiva.issues.length, 1)

  const r = corrida({ estructuraIndirecta: estructuraDeLaHojaGG(), politicaEfectivaDeLaCotizacion: efectiva })
  const c = etapa(r, 'COMMERCIAL')
  assert.ok(c.missing_data.some((m) => /autorizadoPor/.test(m)), `el override rechazado viaja a la etapa: ${JSON.stringify(c.missing_data)}`)
  // Y el precio bajó de verdad: el override firmado se aplicó.
  const base = corrida({ estructuraIndirecta: estructuraDeLaHojaGG(), politicaEfectivaDeLaCotizacion: politicaEfectiva({ version: VERSION_1, overrides: [] }) })
  assert.ok(etapa(r, 'COMMERCIAL').result.ventaFinal < etapa(base, 'COMMERCIAL').result.ventaFinal)
})

test('#12 · el IVA es NORMATIVO: no se puede overridear por cotización', () => {
  const o = overrideDeCotizacion({ clave: 'pctIva', valor: 0.105, autorizadoPor: 'jorge', motivo: 'x', evidencia: 'y', fecha: '2026-08-31' })
  assert.equal(o.ok, false)
  assert.match(o.porQue, /NORMATIVO/)
})

test('#12 · sin indirecto afirmable la política NO publica un precio, aunque esté toda definida', () => {
  // El cruce de las dos capacidades: la política v1 está completa y publicada, y el precio igual no
  // sale. Es el orden que el contrato pide —costo → indirecto → política— y no al revés.
  const efectiva = politicaEfectiva({ version: VERSION_1, overrides: [] })
  // ═══ Y LA POLÍTICA GLOBAL VIAJA AL LADO, QUE ES EL CASO PELIGROSO ═══
  // El caller REAL (`cotizador-casos-reales.mjs`) pasa siempre `politica` — la vigente de la base —.
  // Sin ella en el fixture, «no publica precio» se cumplía por no tener a qué caer, y la mutación de
  // abajo salía verde: el test no probaba nada. El 27 % de la política vigente es exactamente la
  // fuente a la que NO se puede caer cuando la política versionada se negó a proyectar.
  const GLOBAL = politicaComercial({
    version: 1, origen: 'GLOBAL', fuente: 'parametro_comercial (la vigente de la base)',
    pctGastosGenerales: 0.27, pctBeneficio: 0.22, pctFinanciero: 0.07, factorFinanciero: 0.5,
    pctIibb: 0.024, pctGanancias: 0.02, pctCheque: 0.012, pctIva: 0.21,
  })
  const r = corrida({ politicaEfectivaDeLaCotizacion: efectiva, politica: GLOBAL }) // sin estructuraIndirecta
  const c = etapa(r, 'COMMERCIAL')
  assert.equal(c.status, STATUS.BLOQUEADA)
  assert.equal(c.result.ventaFinal ?? null, null, 'caer al 27 % de la política global convertiría un bloqueo declarado en un precio publicado')
  assert.equal(c.blocking_issues[0].tipo, 'SIN_PRECIO_CALCULABLE')
  assert.match(c.blocking_issues[0].detalle, /el indirecto NO es cero/)
  // Y la contraprueba: con la política global SOLA —sin la versionada— el precio sí sale. La
  // diferencia entre los dos resultados es el bloqueo, no la ausencia de datos.
  assert.equal(etapa(corrida({ politica: GLOBAL }), 'COMMERCIAL').status, STATUS.OK)
  // MUTACIÓN CORRIDA: en `orquestador.mjs`, cambiar `const politicaDeLaCascada = proy ? proy.politica : politica`
  //   por `proy?.politica ?? politica`. FALLA: «Expected values to be strictly equal: 'OK' !== 'BLOQUEADA'».
  //   Con el fixture anterior —sin `politica` global— esta misma mutación salía VERDE: el test no
  //   tenía a qué caer y no probaba nada. Queda anotado porque es el error que hay que no repetir.
})
