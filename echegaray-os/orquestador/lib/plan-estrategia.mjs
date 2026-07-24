// CAPA ESTRATÉGICA DEL PLAN DE TESORERÍA — narra la coordinación, no recalcula plata.
//
// El plan dejó de ser una lista de tareas operativas (cobrar/pagar) para ser un PLAN DE COORDINACIÓN
// FINANCIERA. Este módulo produce, para CADA decisión que el núcleo de plan-tesoreria.mjs ya tomó, la
// capa `estrategia` con los 9 puntos que el spec exige: qué coordina · qué optimiza · qué alternativas
// evaluó · por qué eligió esa estrategia · el beneficio esperado · su impacto sobre la liquidez futura ·
// sobre el costo financiero · sobre proveedores/clientes/obras · y qué cambia vs el plan anterior. Y el
// `resumen_estrategico` del CONJUNTO por horizonte.
//
// REGLA: TODO se DERIVA de números que los motores ya calcularon (el costo lo trajo costoDelDinero, las
// alternativas las trajo compararFinanciamiento, el "qué cambió" lo trae compararPlanes de plan-vigente).
// Ni un peso se recalcula acá. Es una capa de SENTIDO sobre decisiones ya tomadas.

import { fmt } from './ingenieria-financiera.mjs'
import { ACUERDO } from './banco-santander.mjs'
// Se REUSA la identidad y la comparación de planes de plan-vigente (dueña del "qué cambió"), para no
// tener dos formas distintas de decir que una acción es nueva/reprogramada. No hay ciclo: plan-vigente
// no importa este módulo, y su acceso a la BD es perezoso (no se toca al importar).
import { idAccion, compararPlanes } from './plan-vigente.mjs'

const round = (n) => Math.round(Number(n) || 0)

/** Cobrar: coordina el ingreso; optimiza liquidez; su beneficio es capital de trabajo propio. */
export function estrategiaCobro(m, monto, est) {
  const conLinea = est.lineaUsada > 0
  return {
    coordina: `Comercial/Administración con el cliente ${m.cliente || 'cliente'} para asegurar el ingreso`,
    optimiza: 'liquidez — adelanta capital de trabajo propio, la fuente de fondos más barata (sin costo financiero)',
    alternativas: [
      { opcion: 'cobrar en fecha', elegida: true, nota: 'ingreso propio: no cuesta nada' },
      { opcion: m.vencida ? 'reclamar (ya corresponde)' : 'gestionar/reclamar si se atrasa', elegida: false, nota: 'plan B si el cliente no paga' },
    ],
    por_que: m.vencida ? 'es cobranza vencida: capital de trabajo que ya debería estar en la caja' : 'ingreso previsto que sostiene el resto del plan del período',
    beneficio_esperado: `${fmt(monto)} de caja fresca — ${conLinea ? 'permite cancelar línea y frenar el interés diario' : 'habilita los pagos del período sin tocar la línea'}`,
    impacto_liquidez_futura: `sube la caja proyectada en ${fmt(monto)}`,
    impacto_costo_financiero: conLinea ? 'lo BAJA: la caja repaga línea y corta el interés que corre día a día' : 'neutro: no hay línea que cancelar',
    impacto_relaciones: `cliente ${m.cliente || 'sin identificar'}${m.vencida ? ' — sostener el reclamo hasta cobrar' : ''}`,
  }
}

/** Cancelar línea: coordina Tesorería; optimiza costo financiero; el beneficio es dejar de pagar rojo. */
export function estrategiaCancelar(repago, est) {
  return {
    coordina: 'CFO/Tesorería repaga la línea con la caja fresca que dejó el cobro',
    optimiza: 'costo financiero — cada día de descubierto cuesta; se corta cuanto antes',
    alternativas: [
      { opcion: 'repagar la línea', elegida: true, nota: 'usa el excedente sobre el piso de liquidez' },
      { opcion: 'mantener la línea y conservar la caja', elegida: false, nota: `no hay colocación que gane el ${(ACUERDO.cft * 100).toFixed(1)}% CFT del descubierto` },
    ],
    por_que: 'entró caja por encima del piso: cancelar deuda cara es la mejor colocación disponible',
    beneficio_esperado: `frena el interés diario sobre ${fmt(repago)} de línea`,
    impacto_liquidez_futura: `baja la caja en ${fmt(repago)} pero elimina deuda de línea equivalente${est.lineaUsada > 0 ? ` (quedan ${fmt(est.lineaUsada)} de línea)` : ' (línea a cero)'}`,
    impacto_costo_financiero: 'reduce la base que devenga interés → ahorro cada día siguiente',
    impacto_relaciones: `interno (banco); libera ${fmt(repago)} de margen del acuerdo para una urgencia`,
  }
}

/** Pagar con caja: coordina Administración; optimiza la relación con el proveedor a costo cero. */
export function estrategiaPagarCaja(it, monto) {
  const aQuien = it.obra ? `la obra ${it.obra}` : `el proveedor ${it.proveedor}`
  return {
    coordina: `Administración prepara el pago a ${it.proveedor}${it.obra ? ` (obra ${it.obra})` : ''}`,
    optimiza: 'relación con el proveedor — cumple en fecha sin costo financiero',
    alternativas: [
      { opcion: 'pagar con caja propia', elegida: true, nota: 'hay excedente por encima del piso de liquidez' },
      { opcion: 'postergar', elegida: false, nota: 'innecesario: la caja alcanza' },
      { opcion: 'financiar con la línea', elegida: false, nota: 'sería pagar interés por algo que la caja cubre' },
    ],
    por_que: it.vencida ? 'está vencido y la caja alcanza: se salda ya' : 'entra en la caja disponible por encima del piso',
    beneficio_esperado: 'cancela la obligación a costo cero y sostiene la relación comercial',
    impacto_liquidez_futura: `baja la caja en ${fmt(monto)}, que queda por encima del piso de liquidez`,
    impacto_costo_financiero: 'cero: no toca la línea de crédito',
    impacto_relaciones: `${aQuien} — cumplimiento en fecha, preserva confianza y plazos`,
  }
}

/** Financiar un crítico: coordina Tesorería; optimiza el costo de los fondos; las alternativas salen del comparador. */
export function estrategiaFinanciar(it, faltante, via, cmp, costoFin, excede) {
  const alternativas = (cmp?.alternativas || []).map((a) => ({
    opcion: a.nombre, elegida: a.via === via.via,
    costo_economico: a.costoEconomico == null ? null : round(a.costoEconomico),
    factible: a.factible, nota: a.nota,
  }))
  return {
    coordina: `CFO/Tesorería activa ${via.nombre.toLowerCase()} para que Administración pueda pagar a ${it.proveedor}`,
    optimiza: 'costo financiero — cubre el faltante con la fuente más barata FACTIBLE, no la primera a mano',
    alternativas: alternativas.length ? alternativas : `${via.nombre}: única vía factible con costo conocido`,
    por_que: cmp?.justificacion || `${via.nombre}: la caja no alcanza y es la línea disponible más barata`,
    beneficio_esperado: `paga un ${it.vencida ? 'vencido' : it.obra ? 'compromiso de obra' : 'crítico'} sin perforar la liquidez mínima`,
    impacto_liquidez_futura: `suma ${fmt(faltante)} de deuda de línea; se cancela apenas entre caja`,
    impacto_costo_financiero: excede ? `${fmt(costoFin)} y además EXCEDE el límite: hace falta otra fuente de fondos` : `+${fmt(costoFin)} de costo, creciendo cada día hasta cancelar la línea`,
    impacto_relaciones: `sostiene ${it.obra ? `la obra ${it.obra}` : `al proveedor crítico ${it.proveedor}`}; mantiene la operación en marcha`,
  }
}

/** Pagar el crítico ya financiado: el par del financiamiento; su beneficio depende de esa acción previa. */
export function estrategiaPagarCritico(it, monto, disponible, faltante) {
  return {
    coordina: `Administración paga a ${it.proveedor} combinando ${fmt(disponible)} de caja + ${fmt(faltante)} de línea`,
    optimiza: 'continuidad — el crítico se salda; el costo se acota cancelando la línea después',
    alternativas: [
      { opcion: 'pagar ahora (caja + línea)', elegida: true, nota: 'es crítico: no puede esperar' },
      { opcion: 'esperar', elegida: false, nota: it.vencida ? 'ya está vencido: esperar suma mora/riesgo' : 'pondría en riesgo la obra o la relación' },
    ],
    por_que: 'crítico que la caja no cubre: se combina lo disponible con la línea recién girada',
    beneficio_esperado: 'evita mora, corte de provisión o parada de obra',
    impacto_liquidez_futura: `baja la caja en ${fmt(monto)}; el faltante quedó como deuda de línea a cancelar`,
    impacto_costo_financiero: 'el costo lo carga el financiamiento asociado; el pago en sí no agrega costo',
    impacto_relaciones: `${it.obra ? `obra ${it.obra}` : `proveedor ${it.proveedor}`} — se cumple pese al bache de caja`,
  }
}

/** Postergar: coordina la negociación de plazo; optimiza liquidez protegiendo el piso. */
export function estrategiaPostergar(it, monto, est) {
  return {
    coordina: `Compras/Administración negocia un nuevo plazo con ${it.proveedor}`,
    optimiza: 'liquidez — protege el piso de caja evitando un desembolso no crítico',
    alternativas: [
      { opcion: 'pagar hoy', elegida: false, nota: `perforaría la liquidez mínima (${fmt(est.liquidezMinima)})` },
      { opcion: 'financiar con la línea', elegida: false, nota: 'no se justifica: no es crítico, sumaría costo evitable' },
      { opcion: 'postergar y negociar plazo', elegida: true, nota: 'preserva caja sin costo financiero' },
    ],
    por_que: 'no es crítico y pagarlo hoy comprometería el piso de liquidez',
    beneficio_esperado: `preserva ${fmt(monto)} de caja sin costo financiero`,
    impacto_liquidez_futura: 'la caja de hoy no baja; la obligación queda pendiente para cuando haya holgura',
    impacto_costo_financiero: 'nulo: evita usar la línea para algo postergable',
    impacto_relaciones: `proveedor ${it.proveedor} — acordar el nuevo plazo, no faltar sin aviso`,
  }
}

/** Completa `estrategia.cambio_vs_plan_anterior` por acción, comparando contra el plan previo si lo hay. */
export function marcarCambios(acciones, anteriores) {
  const nota = (a, txt) => { if (a.estrategia) a.estrategia.cambio_vs_plan_anterior = txt }
  if (!Array.isArray(anteriores)) {
    for (const a of acciones) nota(a, 'sin plan anterior para comparar (primer plan o no provisto)')
    return
  }
  const mapV = new Map(anteriores.map((a) => [idAccion(a), a]))
  for (const a of acciones) {
    const v = mapV.get(idAccion(a))
    if (!v) nota(a, 'acción NUEVA respecto del plan anterior')
    else if (v.fecha !== a.fecha) nota(a, `reprogramada: estaba para ${v.fecha}, ahora ${a.fecha}`)
    else nota(a, 'sin cambios respecto del plan anterior')
  }
}

/** Qué cambió el conjunto vs el plan anterior. REUSA compararPlanes (no reimplementa la comparación). */
export function cambiosVsAnterior(acciones, anteriores) {
  if (!Array.isArray(anteriores)) return null
  return compararPlanes({ horizontes: { h: { acciones } } }, { horizontes: { h: { acciones: anteriores } } }, 'h')
}

/** La estrategia del CONJUNTO: qué coordina, qué optimiza, su impacto y qué cambió. Deriva del resumen. */
export function resumenEstrategico(resumen, cambios) {
  const n = resumen.por_tipo
  const equipos = []
  if (n.cobrar) equipos.push(`Comercial/Administración (cobrar ${n.cobrar})`)
  if (n.pagar) equipos.push(`Administración (pagar ${n.pagar})`)
  if (n.postergar) equipos.push(`Compras (negociar ${n.postergar})`)
  if (n.financiar || n.cancelar_financiacion) equipos.push(`CFO/Tesorería (línea: usar ${n.financiar}, cancelar ${n.cancelar_financiacion})`)
  return {
    que_coordina: equipos.length ? equipos.join(' · ') : 'sin acciones en el horizonte',
    que_optimiza: `liquidez (saldo proyectado ${fmt(resumen.saldo_proyectado_final)}) + costo financiero (${fmt(resumen.costo_financiero_total)}) + relación con proveedores/obras`,
    estrategia: estrategiaGlobal(resumen),
    impacto_liquidez_futura: `saldo proyectado ${fmt(resumen.saldo_proyectado_final)}; pico de línea usada ${fmt(resumen.linea_maxima_usada)} sobre un límite de ${fmt(resumen.limite_linea)}`,
    impacto_costo_financiero: resumen.costo_financiero_total > 0 ? `${fmt(resumen.costo_financiero_total)} en el horizonte — se minimiza cancelando la línea apenas entra caja` : 'sin costo: el plan no necesita usar la línea',
    impacto_relaciones: `${n.pagar} pago(s) en fecha, ${n.postergar} a renegociar, ${n.financiar} crítico(s) sostenidos con línea`,
    cambios_vs_plan_anterior: cambios || 'sin plan anterior para comparar (primer plan o no provisto)',
  }
}

/** La lectura estratégica de una pasada: la restricción que gobierna el horizonte manda el mensaje. */
export function estrategiaGlobal(r) {
  if (r.excede_limite_linea) return 'ALERTA: el plan necesita más línea de la disponible — hay un bache que las fuentes actuales no cubren; conseguir fondos, adelantar cobranzas o reprogramar críticos'
  if (r.por_tipo.financiar > 0) return 'cubrir los críticos con la línea más barata y cancelarla apenas entren las cobranzas, minimizando los días de rojo'
  if (r.por_tipo.postergar > 0) return 'proteger el piso de liquidez postergando lo no crítico y priorizando cobranzas, sin costo financiero'
  return 'operar dentro de la caja propia: pagar en fecha sin recurrir a la línea'
}
