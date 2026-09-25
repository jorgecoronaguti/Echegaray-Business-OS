// C10 · LISTO PARA PRODUCIR — las nueve líneas del checklist de preparación, calculadas. PURO.
//
// No reemplaza a `preparacionDeObra` (el alta 02b/M03 y el orquestador siguen leyendo esas siete):
// el diseño C10 pregunta otra cosa —si la ESTRUCTURA está lista para sellar la línea base— y sus
// líneas son otras: cliente y OC, responsable, fechas, estructura, ponderación, método de avance,
// fechas por ítem, HH plan y partida vinculada. Cada línea nombra el faltante con su número y
// enlaza a donde se arregla. Sin pendientes, sellar se enciende; con uno, se apaga y se dice cuántos.

import type { NodoObra } from './wbs.ts'
import { millones, problemaDePonderacion, resumenDeEstructura, type Ponderaciones } from './estructura.ts'
import { itemsMO } from './arbolEstructura.ts'
import { resumenMO } from './pesoMO.ts'

export interface InsumosProducir {
  obraId: string
  clienteNombre: string | null
  /** Órdenes de compra del cliente para esta obra. null = no se pudo leer. */
  nOrdenes: number | null
  jefeObra: string | null
  inicioPlan: string | null
  finPlan: string | null
  diasHabilesPlan: number | null
  nodos: readonly NodoObra[]
  ponds: Ponderaciones
  /** El avance ponderado de la obra; null = nada medido. */
  avancePct: number | null
  costoTeorico: number | null
  /** Cómo pesa la obra (B07). Por costo de MO el chequeo es «historias sin costo», no «suma 100 %». */
  metodo?: string
}

export interface LineaProducir {
  clave: string
  titulo: string
  tituloCorto: string
  detalle: string
  detalleCorto: string
  listo: boolean
  accion: { label: string; href: string } | null
}

export interface Preparacion {
  lineas: LineaProducir[]
  hechas: number
  total: number
  pendientes: number
  /** «Preparación · 5 de 9». */
  titulo: string
  nota: string
  notaCorta: string
  /** El aside «La obra». */
  obra: { manoDeObra: string | null; costoTeorico: string | null; hhPlan: string | null; avance: string | null }
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const n = (v: number) => v.toLocaleString('es-AR')
const plural = (v: number, uno: string, varios: string) => `${n(v)} ${v === 1 ? uno : varios}`

export function listoParaProducir(i: InsumosProducir): Preparacion {
  const arbol = `/obras/${i.obraId}?vista=tareas&sub=arbol`
  const r = resumenDeEstructura(i.nodos, i.ponds)
  const hojas = i.nodos.filter((x) => !x.es_contenedor)
  const problemas = problemaDePonderacion(i.nodos, i.ponds)
  const conHH = hojas.filter((x) => x.hh_plan != null)
  const delAnalisis = conHH.filter((x) => x.analisis_id != null).length
  const aMano = conHH.length - delAnalisis
  const conPartida = hojas.filter((x) => x.cotizacion_partida_id != null).length
  const sinPartida = hojas.length - conPartida
  const mo = resumenMO(itemsMO(i.nodos, i.ponds))
  const primerProblema = problemas[0] ? i.nodos.find((x) => x.nombre === problemas[0].nombre) ?? null : null

  const lineas: LineaProducir[] = [
    {
      clave: 'cliente', titulo: 'Cliente y OC', tituloCorto: 'Cliente',
      detalle: `${i.clienteNombre ?? 'sin cliente'} · ${i.nOrdenes == null ? 'OC sin leer' : i.nOrdenes > 0 ? `OC ${n(i.nOrdenes)}` : 'sin OC'}`,
      detalleCorto: `${i.clienteNombre ?? 'sin cliente'} · ${i.nOrdenes == null ? 'OC sin leer' : i.nOrdenes > 0 ? `OC ${n(i.nOrdenes)}` : 'sin OC'}`,
      listo: i.clienteNombre != null,
      accion: i.clienteNombre != null ? null : { label: 'Cargar', href: `/obras/${i.obraId}?vista=resumen` },
    },
    {
      clave: 'responsable', titulo: 'Responsable', tituloCorto: 'Responsable',
      detalle: i.jefeObra ?? 'sin jefe de obra', detalleCorto: i.jefeObra ?? 'sin jefe de obra',
      listo: i.jefeObra != null,
      accion: i.jefeObra != null ? null : { label: 'Asignar', href: `/obras/${i.obraId}?vista=resumen` },
    },
    {
      clave: 'fechas', titulo: 'Fechas', tituloCorto: 'Fechas',
      detalle: i.inicioPlan && i.finPlan
        ? `${dm(i.inicioPlan)} → ${dm(i.finPlan)}${i.diasHabilesPlan != null ? ` · ${plural(i.diasHabilesPlan, 'día hábil', 'días hábiles')}` : ''}`
        : i.inicioPlan ? `desde ${dm(i.inicioPlan)} · sin fin previsto` : i.finPlan ? `hasta ${dm(i.finPlan)} · sin inicio previsto` : 'sin plazo cargado',
      detalleCorto: i.inicioPlan && i.finPlan
        ? `${dm(i.inicioPlan)} → ${dm(i.finPlan)}${i.diasHabilesPlan != null ? ` · ${n(i.diasHabilesPlan)} hábiles` : ''}`
        : 'sin plazo cargado',
      listo: Boolean(i.inicioPlan && i.finPlan),
      accion: i.inicioPlan && i.finPlan ? null : { label: 'Cargar', href: `/obras/${i.obraId}?vista=resumen` },
    },
    {
      clave: 'estructura', titulo: 'Estructura', tituloCorto: 'Estructura',
      detalle: r.nItems > 0 ? `${plural(r.nItems, 'ítem', 'ítems')} en ${plural(r.niveles, 'nivel', 'niveles')} · ${plural(r.nRubros, 'rubro', 'rubros')}` : 'sin estructura',
      detalleCorto: r.nItems > 0 ? `${plural(r.nItems, 'ítem', 'ítems')} · ${plural(r.niveles, 'nivel', 'niveles')}` : 'sin estructura',
      listo: r.nItems > 0,
      accion: r.nItems > 0 ? null : { label: 'Crear', href: arbol },
    },
    (i.metodo ?? 'costo_mo') === 'costo_mo' ? {
      // Serie B: con ponderación por costo, lo que falta es COSTO, no un reparto que sume 100.
      clave: 'ponderacion', titulo: 'Costo de MO', tituloCorto: 'Costo de MO',
      detalle: mo.nHistorias === 0 ? 'sin historias: el peso sale del costo de cada historia'
        : mo.nSinCosto > 0 ? `${plural(mo.nSinCosto, 'historia sin costo de MO: no pesa', 'historias sin costo de MO: no pesan')} · ${n(mo.nHistorias - mo.nSinCosto)} de ${n(mo.nHistorias)} con costo`
          : `las ${n(mo.nHistorias)} historias con costo · ${millones(mo.costoTotal) ?? ''}`,
      detalleCorto: mo.nHistorias === 0 ? 'sin historias' : mo.nSinCosto > 0 ? `${n(mo.nSinCosto)} sin costo de MO` : 'todas con costo',
      listo: mo.nHistorias > 0 && mo.nSinCosto === 0,
      accion: mo.nHistorias > 0 && mo.nSinCosto > 0 ? { label: 'Cargar', href: `${arbol}&panel=ponderacion` }
        : mo.nHistorias === 0 ? { label: 'Crear', href: `${arbol}&crear=mano` } : null,
    } : {
      clave: 'ponderacion', titulo: 'Ponderación', tituloCorto: 'Ponderación',
      detalle: r.nItems === 0 ? 'sin estructura que ponderar'
        : problemas.length === 0 ? 'cada nivel suma 100 %'
          : problemas.slice(0, 2).map((p) => p.suma == null ? `${p.nombre} sin hijas` : `${p.nombre} suma ${n(p.suma)} %`).join(' · ') + (problemas.length > 2 ? ` · +${problemas.length - 2}` : ''),
      detalleCorto: r.nItems === 0 ? 'sin estructura'
        : problemas.length === 0 ? 'cierra en 100 %'
          : problemas[0].suma == null ? `${problemas[0].nombre} sin hijas` : `${problemas[0].nombre} ${n(problemas[0].suma)} %`,
      listo: r.nItems > 0 && problemas.length === 0,
      accion: r.nItems > 0 && problemas.length > 0
        ? { label: 'Repartir', href: primerProblema && primerProblema.tiene_hijas ? `${arbol}&act=${primerProblema.id}&panel=ponderacion` : `${arbol}&crear=mano` }
        : null,
    },
    {
      clave: 'metodo', titulo: 'Método de avance', tituloCorto: 'Método',
      detalle: r.nItems === 0 ? 'sin tareas que medir' : r.sinMetodo > 0 ? `${plural(r.sinMetodo, 'tarea', 'tareas')} sin método: no se pueden medir` : `${plural(r.nItems, 'tarea', 'tareas')} con método`,
      detalleCorto: r.nItems === 0 ? 'sin tareas' : r.sinMetodo > 0 ? `${plural(r.sinMetodo, 'tarea', 'tareas')} sin método` : 'todas con método',
      listo: r.nItems > 0 && r.sinMetodo === 0,
      accion: r.nItems > 0 && r.sinMetodo > 0 ? { label: 'Cargar', href: `${arbol}&sel=1` } : null,
    },
    {
      clave: 'fechas_item', titulo: 'Fechas por ítem', tituloCorto: 'Fechas por ítem',
      detalle: r.nItems === 0 ? 'sin ítems' : r.sinFechas > 0 ? `${plural(r.sinFechas, 'ítem', 'ítems')} sin fechas` : 'todos con fechas',
      detalleCorto: r.nItems === 0 ? 'sin ítems' : r.sinFechas > 0 ? `${n(r.sinFechas)} sin fechas` : 'todos con fechas',
      listo: r.nItems > 0 && r.sinFechas === 0,
      accion: r.nItems > 0 && r.sinFechas > 0 ? { label: 'Fijar', href: `/obras/${i.obraId}?vista=tareas&sub=gantt` } : null,
    },
    {
      clave: 'hh_plan', titulo: 'HH plan', tituloCorto: 'HH plan',
      detalle: r.nItems === 0 ? 'sin ítems' : conHH.length === hojas.length
        ? `${n(delAnalisis)} de ${n(hojas.length)} del análisis · ${n(aMano)} a mano`
        : `${n(hojas.length - conHH.length)} de ${n(hojas.length)} sin HH plan`,
      detalleCorto: r.nItems === 0 ? 'sin ítems' : conHH.length === hojas.length
        ? `${n(delAnalisis)} del análisis · ${n(aMano)} a mano`
        : `${n(hojas.length - conHH.length)} sin HH plan`,
      listo: r.nItems > 0 && conHH.length === hojas.length,
      accion: r.nItems > 0 && conHH.length < hojas.length ? { label: 'Cargar', href: `${arbol}&sel=1` } : null,
    },
    {
      clave: 'partida', titulo: 'Partida vinculada', tituloCorto: 'Partida',
      detalle: r.nItems === 0 ? 'sin ítems' : sinPartida > 0
        ? `${n(conPartida)} de ${n(hojas.length)} · ${n(sinPartida)} sin partida no entran al costo teórico`
        : `${n(conPartida)} de ${n(hojas.length)}`,
      detalleCorto: r.nItems === 0 ? 'sin ítems' : sinPartida > 0 ? `${n(sinPartida)} sin partida` : 'todas con partida',
      listo: r.nItems > 0 && sinPartida === 0,
      accion: r.nItems > 0 && sinPartida > 0 ? { label: 'Vincular', href: `${arbol}&crear=presupuesto` } : null,
    },
  ]
  const hechas = lineas.filter((l) => l.listo).length
  const pendientes = lineas.length - hechas
  const cola = 'Al sellar, la obra pasa de Previo a Desarrollo y el plan de hoy queda como lo prometido.'
  return {
    lineas, hechas, total: lineas.length, pendientes,
    titulo: `Preparación · ${n(hechas)} de ${n(lineas.length)}`,
    nota: pendientes > 0 ? `Sellar está apagado: ${plural(pendientes, 'pendiente', 'pendientes')}. ${cola}` : `Todo listo. ${cola}`,
    notaCorta: 'Al sellar, Previo → Desarrollo.',
    obra: {
      manoDeObra: millones(r.costoMo),
      costoTeorico: millones(i.costoTeorico),
      hhPlan: r.hhPlan == null ? null : n(Math.round(r.hhPlan)),
      avance: i.avancePct == null ? null : `${i.avancePct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`,
    },
  }
}
