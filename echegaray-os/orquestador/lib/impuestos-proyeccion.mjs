// LA SECCIÓN «PROYECCIÓN A FIN DE MES (ESTIMACIÓN)» DE «IMPUESTOS Y FINANCIEROS» (24/09/2026).
//
// Vive aparte de impuestos-bloques.mjs —lo registrado— a propósito: el dueño eligió que lo registrado
// y la proyección no compartan una celda, y tampoco comparten archivo.

import { total as rotuloTotal, seccion } from './patron-pestana.mjs'
import { CALENDARIO_IMPUESTOS } from './cash-flow-lineas.mjs'
import { ROTULO as ROTULO_IMPUESTO_CHEQUE } from './impuesto-cheque.mjs'
import { formulaDebitoDeclarado, formulaCreditoProyectado } from './iva-libre-disponibilidad.mjs'
import { formulaImpuestoCheque } from './impuestos-cuadro.mjs'
import { formulaDebitoArca, formulaCreditoArca, formulaNetoVentasArca, nuncaMenosQue } from './arca-formula.mjs'
import { ventasFacturadasDelMes } from './impuestos-base-libro.mjs'
import { BANCO_RAW } from './impuestos-fuentes.mjs'
import { cmes, M12 } from './impuestos-grilla.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 7 · PROYECCIÓN A FIN DE MES (ESTIMACIÓN) — aparte de lo registrado (dueño, 24/09/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Lo que se va a pagar por el mes entero, no lo registrado hasta hoy. Es la ÚNICA sección que lleva los
// tres rótulos que leen el Libro y los cash flow (IVA, IIBB, impuesto al cheque): el cash flow proyecta
// salidas de caja, y la salida del IVA de septiembre el 20/10 es la del mes entero. Los meses cerrados
// repiten lo registrado (referencia, no copia) para que el Libro siga leyendo la fila completa.
//
// EL MES EN CURSO = MAX(lo registrado en ARCA; la proyección del Libro) en débito, crédito y base, MENOS
// las retenciones y percepciones YA sufridas —un hecho, no se proyecta de nuevo—. Los meses futuros van
// con retención cero: proyectar cuánto retendrá cada cliente sería inventarlo.

export const TITULO_PROYECCION = 'Proyección a fin de mes (estimación)'

export function bloqueProyeccion(G, { n, anio, iva, ibb, proy, hoy, cob }) {
  G.push([seccion(n, TITULO_PROYECCION)])
  G.cabecera()
  const mesEnCurso = iva.mesEnCurso || ibb.mesEnCurso
  const periodo = (m) => `${anio}-${String(m).padStart(2, '0')}`
  const pIva = iva.mesesProy
  const pIibb = ibb.proyectados
  const regCerradoIva = iva.meses.filter((m) => !pIva.includes(m))
  const regCerradoIibb = ibb.meses.filter((m) => !pIibb.includes(m))

  const fDebP = G.n() + 1
  const fCredP = fDebP + 1
  const fIvaP = fDebP + 2
  const fLibreP = fDebP + 3
  const retIva = (m) => (m === mesEnCurso && iva.meses.includes(m) ? `N(${cmes(m)}${iva.fRet})` : '0')
  const prevLibre = (m) => (pIva.includes(m - 1) ? `${cmes(m - 1)}${fLibreP}` : `${cmes(m - 1)}${iva.fLibre}`)
  G.mensual('IVA · débito fiscal',
    (m) => (m === mesEnCurso
      ? nuncaMenosQue(formulaDebitoArca(periodo(m)), formulaDebitoDeclarado(proy.brutoDebito(m)))
      : formulaDebitoDeclarado(proy.brutoDebito(m))),
    'Mes en curso: MAX(lo emitido según ARCA; las facturas B de Cobranzas del mes, emitidas o por emitir). Futuro: las facturas B por «Fecha de Factura». ESTIMACIÓN.', { meses: pIva })
  G.mensual('IVA · crédito fiscal',
    (m) => (m === mesEnCurso
      ? nuncaMenosQue(formulaCreditoArca(periodo(m)), formulaCreditoProyectado(proy.brutoCredito(m)))
      : formulaCreditoProyectado(proy.brutoCredito(m))),
    'Mes en curso: MAX(libro de compras de ARCA; compras con factura del Libro). Futuro: compras con factura del Libro. ESTIMACIÓN.', { meses: pIva })
  G.mensual(CALENDARIO_IMPUESTOS.rotulos.iva,
    (m) => (pIva.includes(m)
      ? `=MAX(0;${cmes(m)}${fDebP}-${cmes(m)}${fCredP}-${retIva(m)}-N(${prevLibre(m)}))`
      : `=${cmes(m)}${iva.fAPagar}`),
    'Lo que se va a pagar por el período entero. Meses cerrados: lo registrado (sección 1). Mes en curso y futuros: ESTIMACIÓN. ESTA es la fila que leen el Libro y el cash flow.', { meses: [...regCerradoIva, ...pIva] })
  G.mensual('IVA · saldo a favor',
    (m) => `=MAX(0;N(${prevLibre(m)})+${cmes(m)}${fCredP}+${retIva(m)}-${cmes(m)}${fDebP})`,
    'Libre disponibilidad que quedaría al cierre del mes proyectado. Se arrastra; el total no aplica.', { meses: pIva, totaliza: false })
  // EL ESTADO DE CADA MES, EN PALABRAS: «proyección» es una estimación; «sin ventas» declara el hueco de
  // un mes futuro sin facturas cargadas —una columna vacía sin explicación se lee como «no debo nada»—.
  const sinVentas = M12.filter((m) => m > mesEnCurso && !pIva.includes(m) && iva.origen?.(m) === 'sin-ventas')
  const fEstadoP = G.mensual('Estado de la proyección',
    (m) => (pIva.includes(m) ? 'estimación' : (sinVentas.includes(m) ? 'sin ventas' : VACIO)),
    'ESTIMACIÓN del mes entero; «sin ventas»: mes futuro sin facturas cargadas, no se proyecta.', { meses: [...pIva, ...sinVentas].sort((a, b) => a - b), totaliza: false })

  const fBaseP = G.n() + 1
  const fImpP = fBaseP + 1
  const fIibbP = fBaseP + 2
  const fSaldoP = fBaseP + 3
  const retIibb = (m) => (m === mesEnCurso && ibb.meses.includes(m) ? `N(${cmes(m)}${ibb.fRet})` : '0')
  const prevSaldo = (m) => (pIibb.includes(m - 1) ? `${cmes(m - 1)}${fSaldoP}` : `${cmes(m - 1)}${ibb.fSaldo}`)
  const netoLibro = (m) => `=${ventasFacturadasDelMes(anio, m, 'neto', { hoy, cob })}`
  G.mensual('IIBB · base imponible',
    (m) => (m === mesEnCurso ? nuncaMenosQue(`=${formulaNetoVentasArca(periodo(m))}`, netoLibro(m)) : netoLibro(m)),
    'Mes en curso: MAX(neto emitido según ARCA; neto de las facturas B de Cobranzas del mes). Futuro: las facturas B. Misma definición que el débito del IVA. ESTIMACIÓN.', { meses: pIibb })
  G.mensual('IIBB · impuesto',
    (m) => `=IF(N(${cmes(m)}${fBaseP})=0;"";N(${cmes(m)}${fBaseP})*${ibb.alicuotaVigente.replace(/^=/, '')})`,
    'Base × la alícuota de la última DDJJ de Rentas, referenciada.', { meses: pIibb })
  G.mensual(CALENDARIO_IMPUESTOS.rotulos.iibb,
    (m) => (pIibb.includes(m)
      ? `=MAX(0;N(${cmes(m)}${fImpP})-${retIibb(m)}-N(${prevSaldo(m)}))`
      : `=${cmes(m)}${ibb.fAPagar}`),
    'Meses cerrados: lo registrado (sección 2). Mes en curso: impuesto proyectado menos las retenciones ya sufridas y el saldo a favor. Futuros: ESTIMACIÓN. ESTA es la fila que leen el Libro y el cash flow.', { meses: [...regCerradoIibb, ...pIibb] })
  G.mensual('IIBB · saldo a favor',
    (m) => `=MAX(0;N(${prevSaldo(m)})+${retIibb(m)}-N(${cmes(m)}${fImpP}))`,
    'Se arrastra al mes siguiente. El total no aplica.', { meses: pIibb, totaliza: false })

  // LA FILA QUE LEE EL LIBRO. Su rótulo y su fórmula son los de siempre: el mes en curso MAX(debitado;
  // 0,6 % proyectado), y el Libro le resta lo ya debitado (ver `deImpuestoAlCheque`).
  const fChequeP = G.mensual(ROTULO_IMPUESTO_CHEQUE, (m) => formulaImpuestoCheque(BANCO_RAW, anio, m),
    'MAX(lo que el banco YA debitó; el 0,6 % de cada lado del movimiento que el Libro proyecta para el mes). ESTIMACIÓN del mes entero; lo debitado es la fila de la sección 4.')
  const mesesTot = [...new Set([...pIva, ...pIibb])].sort((a, b) => a - b)
  const fTotalP = G.mensual(rotuloTotal('Total proyectado'),
    (m) => `=N(${cmes(m)}${fIvaP})+N(${cmes(m)}${fIibbP})+N(${cmes(m)}${fChequeP})`,
    'IVA + IIBB + impuesto al cheque del mes entero. ESTIMACIÓN.', { meses: mesesTot })
  G.blanco()
  const filas = [fDebP, fCredP, fIvaP, fLibreP, fEstadoP, fBaseP, fImpP, fIibbP, fSaldoP, fChequeP, fTotalP]
  return { fDebP, fCredP, fIvaP, fLibreP, fEstadoP, fBaseP, fImpP, fIibbP, fSaldoP, fChequeP, fTotalP, filas, mesesTot, mesEnCurso }
}