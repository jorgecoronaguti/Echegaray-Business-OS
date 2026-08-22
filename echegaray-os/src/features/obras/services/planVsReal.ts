// LAS LÍNEAS DE «PLAN CONTRA REAL» — la regla, separada de la pantalla que la dibuja.
//
// ═══ POR QUÉ VIVE ACÁ Y NO EN EL COMPONENTE (19/08/2026) ═══
//
// Vivía adentro del `.tsx`, así que la única prueba de que la ausencia se publica como ausencia era
// un test de navegador contra la base REAL. Y una prueba así no mide la regla: mide los datos del
// día. El 19/08 alguien selló la línea base de las ocho obras y dos tests se pusieron rojos sin que
// nadie tocara una línea de código — el código decía la verdad, el test afirmaba un estado del
// mundo. Acá la regla se prueba con datos armados, en las dos ramas, sin navegador y sin base.

import type { EconomiaObra, PlanVsReal } from '../types/index.ts'
import { desvio, fecha, plata } from '../components/formato.ts'

export type Tono = 'alerta' | 'atencion' | 'ok' | 'falta'


export interface Linea {
  clave: string
  tono: Tono
  titulo: string
  origen: string
  vista: string
}

const hoy = () => new Date().toISOString().slice(0, 10)

/** Las cinco comparaciones del módulo, cada una con su origen. Sin ninguna inferencia: o hay dos
 *  puntas y se compara, o falta una y se nombra. */
/**
 * @param veComercial Si es `false` —el nivel Obras— la línea de MARGEN no se arma. No es que se
 * oculte un número: la base ya devolvió NULL y el número no existe de este lado. Lo que se evita es
 * el cartel *"falta el monto contratado"*, que para un jefe de obra es MENTIRA — el contrato puede
 * estar cargado y él no puede verlo. Explicar mal una ausencia fabrica un hecho.
 * @param eco El panel económico (`obra_economia`). Sin él NO se arma línea de margen: hasta el
 * 22/08 la línea decía «Margen a hoy $X (contratado − costo)», que no es margen. Ver el bloque
 * MARGEN de abajo.
 */
export function lineasPlanVsReal(p: PlanVsReal, veComercial = true, eco: EconomiaObra | null = null): Linea[] {
  const l: Linea[] = []

  // ── PLAZO ──────────────────────────────────────────────────────────────────
  if (p.desvio_plazo_dias != null) {
    const d = p.desvio_plazo_dias
    l.push({
      clave: 'plazo',
      tono: d > 0 ? 'alerta' : 'ok',
      titulo: d > 0
        ? `El fin previsto se corrió ${d} día(s) respecto de la línea base`
        : d < 0 ? `El fin previsto se adelantó ${Math.abs(d)} día(s) respecto de la línea base`
          : 'El fin previsto coincide con la línea base',
      origen: `fin plan ${fecha(p.fin_plan)} contra fin base ${fecha(p.fin_base)} · obra_actividad`,
      vista: 'gantt',
    })
  } else {
    l.push({
      clave: 'plazo',
      tono: 'falta',
      titulo: 'No hay desvío de plazo que medir: la línea base no está sellada',
      origen: 'obra_actividad.inicio_base está vacío en todas las actividades. Se sella desde el Gantt, una sola vez.',
      vista: 'gantt',
    })
  }

  if (p.actividades_atrasadas) {
    l.push({
      clave: 'atrasos',
      tono: 'alerta',
      titulo: `${p.actividades_atrasadas} actividad(es) pasaron su fecha de fin sin llegar al 100%`,
      origen: 'obra_actividad: fin_plan anterior a hoy y avance menor a 100',
      vista: 'gantt',
    })
  }

  // ── AVANCE ─────────────────────────────────────────────────────────────────
  if (p.avance_pct == null) {
    l.push({
      clave: 'avance',
      tono: 'falta',
      titulo: p.n_actividades ? 'Hay cronograma pero ninguna actividad tiene fecha: el avance no se puede promediar' : 'Esta obra no tiene cronograma cargado',
      origen: 'vista obra_avance, la misma que publican el portafolio y el chat',
      vista: 'gantt',
    })
  } else {
    // La comparación es entre DOS datos reales: la fecha de fin prevista y el avance publicado.
    // No se proyecta una fecha de fin nueva: eso sería una estimación disfrazada de hecho.
    const vencida = p.fin_plan != null && p.fin_plan < hoy() && p.avance_pct < 100
    l.push({
      clave: 'avance',
      tono: vencida ? 'alerta' : 'ok',
      titulo: vencida
        ? `La obra pasó su fin previsto (${fecha(p.fin_plan)}) con ${p.avance_pct}% de avance`
        : `Avance ${p.avance_pct}% sobre ${p.n_actividades_medidas} de ${p.n_actividades} actividades`,
      origen: `vista obra_avance · promedio de las ${p.n_actividades_medidas} actividades con fecha`,
      vista: 'gantt',
    })
  }

  // ── HH ─────────────────────────────────────────────────────────────────────
  if (p.desvio_hh_pct != null) {
    l.push({
      clave: 'hh',
      tono: p.desvio_hh_pct > 10 ? 'alerta' : p.desvio_hh_pct > 0 ? 'atencion' : 'ok',
      titulo: `HH real ${desvio(p.desvio_hh_pct)} contra el plan (${p.hh_real} reales, ${p.hh_plan ?? p.hh_estimada} planificadas)`,
      origen: 'registros_hh por obra_canonica_id contra la suma de obra_actividad.hh_plan',
      vista: 'personal',
    })
  } else {
    l.push({
      clave: 'hh',
      tono: 'falta',
      titulo: p.hh_real == null && p.hh_plan == null && p.hh_estimada == null
        ? 'No hay desvío de HH: no hay ni horas planificadas ni horas imputadas'
        : p.hh_real == null ? 'No hay desvío de HH: nadie imputó horas a esta obra'
          : 'No hay desvío de HH: ninguna actividad tiene HH plan cargadas',
      origen: 'registros_hh y obra_actividad.hh_plan',
      vista: 'personal',
    })
  }

  // ── COSTO ──────────────────────────────────────────────────────────────────
  if (p.desvio_costo_pct != null) {
    l.push({
      clave: 'costo',
      tono: p.desvio_costo_pct > 10 ? 'alerta' : p.desvio_costo_pct > 0 ? 'atencion' : 'ok',
      titulo: `Costo real ${desvio(p.desvio_costo_pct)} contra el presupuesto (${plata(p.costo_real)} contra ${plata(p.costo_presupuestado)})`,
      origen: 'Compras (comprobantes imputados) contra presupuestos.costo_directo_presupuestado',
      vista: 'economia',
    })
  } else {
    l.push({
      clave: 'costo',
      tono: 'falta',
      titulo: p.costo_presupuestado == null
        ? 'No hay desvío de costo: esta obra no tiene presupuesto cargado'
        : 'No hay desvío de costo: ningún comprobante de Compras está imputado a esta obra',
      origen: 'presupuestos y Compras por obra',
      vista: 'economia',
    })
  }

  if (veComercial) {
    // ── MARGEN ─────────────────────────────────────────────────────────────────
    //
    // ═══ LO QUE ESTA LÍNEA DECÍA HASTA EL 22/08 ═══
    //
    //     «Margen a hoy $64.713.000 (contratado $97.650.000 − costo $32.937.000)»
    //
    // sobre una obra al 86% de avance con TRES facturas de materiales imputadas y una hora
    // registrada. La resta está bien hecha; lo que está mal es llamarla margen. Le falta lo que
    // queda por gastar, y el costo real de esta casa tampoco tiene la mano de obra adentro.
    //
    // Ahora hay DOS márgenes y ninguno se inventa: el COTIZADO (venta − costo objetivo) existe si
    // hay presupuesto, y el FINAL PROYECTADO (venta − costo final proyectado) existe si hay
    // forecast. Cuando falta el segundo se dice, con la razón que da la base. Un renglón que dice
    // «no disponible y por qué» manda a alguien a cargar el presupuesto; uno que dice $64.713.000
    // no manda a nadie a ningún lado.
    if (eco?.margen_final_proyectado != null) {
      l.push({
        clave: 'margen',
        tono: eco.margen_final_proyectado < 0 ? 'alerta' : 'ok',
        titulo: `Margen final proyectado ${plata(eco.margen_final_proyectado)} (venta ${plata(eco.venta_total)} − costo final proyectado ${plata(eco.costo_final_proyectado)})`,
        origen: eco.base_del_forecast ?? 'vista obra_economia',
        vista: 'economia',
      })
    } else if (eco?.margen_cotizado != null) {
      l.push({
        clave: 'margen',
        tono: eco.margen_cotizado < 0 ? 'alerta' : 'ok',
        titulo: `Margen cotizado ${plata(eco.margen_cotizado)} — el margen proyectado a fin de obra todavía no se puede calcular`,
        origen: `venta ${plata(eco.venta_total)} contra el costo objetivo. ${eco.base_del_forecast ?? 'Sin forecast de costo a terminación.'}`,
        vista: 'economia',
      })
    } else {
      l.push({
        clave: 'margen',
        tono: 'falta',
        titulo: 'Margen proyectado no disponible',
        origen: eco == null ? 'vista obra_economia'
          : eco.venta_total == null ? 'Falta el monto contratado de la obra.'
            : `Falta el costo objetivo: ${eco.costo_objetivo_origen}.`,
        vista: 'economia',
      })
    }
  }

  return l
}
