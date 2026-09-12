// SOLAPA «HORAS» — pantalla 1 del handoff v2, montada contra la base.
//
// Server component: arma filas, resumen y filtros con `grillaHorasQuincena.ts` (puro y probado) a
// partir de una sola tanda de lecturas, y le pasa todo a la parte de cliente, que sólo decide qué
// fila está abierta.
//
// ═══ EL ÚNICO RECORTE QUE QUEDA ES EL PENDIENTE, Y ES PORQUE ES EL ÚNICO ACCIONABLE ═══
//
// Había cuatro grupos de filtros en una columna de 230 px. Tres no se decidían: «Todo el plantel /
// Modalidad hora / Modalidad mensual» repetía el corte que la tabla ya hace con sus dos grupos, y
// «Convenio» era un conteo con el rótulo cortado sobre el que nadie actúa. El que sí se usa —«9
// ausencias sin motivo», «8 días sin cargar»— es lo que traba el cierre, y ahora vive arriba de la
// tabla, donde se lee antes de bajar la vista. El porqué completo, en `GrillaHorasQuincena.tsx`.
//
// ═══ EL RECORTE RECORTA, NO RECALCULA LO ESPERADO ═══
//
// «Cargadas» sí cambia con el recorte —son las horas de las filas que se ven—, pero «Esperadas» es
// de la QUINCENA y no del recorte. Y `puedeCerrar` mira el plantel entero: cerrar con una ausencia
// sin motivo escondida por un filtro sería exactamente lo que el botón gris existe para impedir.

import Link from 'next/link'
import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { filasDeGrilla, resumenDeGrilla, type FilaDeGrilla } from '../../../services/grillaHorasQuincena'
import { getDatosDeLaSolapaHoras } from '../../../services/grillaHorasQuincenaService'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { proyeccionDeQuincena } from '../../../services/proyeccionDeMasa'
import { alicuotasVigentes, multiplicadorDeCosto } from '../../../services/costoHora'
import { getAlicuotas } from '../../../services/costoLecturas'
import type { LineaDeLaPersona } from '../PanelDePersona'
import { correrQuincena, esFechaISO, quincenaDe, rotuloQuincena } from '../../../services/quincena'
import type { PropsDeSolapa } from './index'
import { HorasConPersona } from '../HorasConPersona'
import type { PendienteDeGrilla, PeriodoDeGrilla } from '../GrillaHorasQuincena'

/**
 * LO QUE TRABA EL CIERRE, EN EL ORDEN EN QUE SE RESUELVE.
 *
 * `texto` lleva el número ADENTRO —«9 ausencias sin motivo»— porque así se dice en voz alta y así se
 * lee de un vistazo. El rótulo con el conteo pegado a la derecha del panel obligaba a leer dos
 * cosas separadas por 150 px de nada.
 */
const PENDIENTES: Record<string, {
  texto: (n: number) => string
  toca: (f: FilaDeGrilla) => boolean
}> = {
  motivo: {
    texto: (n) => `${n} ausencia${n === 1 ? '' : 's'} sin motivo`,
    toca: (f) => f.diasSinMotivo > 0,
  },
  'sin-cargar': {
    texto: (n) => `${n} día${n === 1 ? '' : 's'} sin cargar`,
    toca: (f) => f.diasSinCargar > 0,
  },
  tarifa: {
    texto: (n) => `${n} sin retribución`,
    toca: (f) => f.estado === 'tarifa',
  },
}

export async function SolapaHoras({ quincenaPedida, hoy, parametros, hrefDe }: PropsDeSolapa) {
  // LA VENTANA LA RESUELVE LA SOLAPA, no la página: cualquier día de la quincena sirve como valor,
  // que es la convención que ya usan Asistencia y Liquidación.
  const quincena = quincenaDe(esFechaISO(quincenaPedida) ? (quincenaPedida as string) : hoy)
  // Los recortes de ESTA solapa. `pendiente` y `convenio` viajan en la URL porque son un recorte
  // del trabajo que falta, y eso se comparte por link con quien lo tiene que resolver.
  const recorte = { pendiente: parametros.pendiente }
  const hrefCierre = hrefDe({ solapa: 'cierre' })
  const supabase = await createClient()
  // LA CADENA DE PAGO DE LA PERSONA ES LA MISMA FILA DEL CUADRO DE PAGOS, no una copia: el dueño
  // pidió editarla desde acá con las mismas celdas, y dos cuentas de lo que cobra una persona serían
  // dos respuestas de las que se cree la última que alguien miró. Cuesta una segunda tanda de
  // lecturas y ese es el precio de tener UNA definición.
  // EL COSTO CARGADO DE LA BANDA SALE DEL MISMO MULTIPLICADOR QUE «Costo a la obra», no de una
  // cuenta propia: dos definiciones de «cuánto cuesta esta hora» darían dos costos de obra.
  const [datos, liquidacion, costo] = await Promise.all([
    getDatosDeLaSolapaHoras(supabase, quincena),
    getLiquidacionDeLaQuincena(supabase, quincena),
    getAlicuotas(supabase),
  ])
  const multiplicador = multiplicadorDeCosto(alicuotasVigentes(costo.alicuotas, quincena.hasta), 1).valor
  const lineas: Record<string, LineaDeLaPersona> = {}
  for (const cuadro of liquidacion.cuadros) {
    for (const linea of cuadro.lineas) lineas[linea.personaId] = { grupo: cuadro.grupo, linea }
  }

  const todas = filasDeGrilla({
    quincena,
    personas: datos.personas,
    registros: datos.registros,
    presencias: datos.presencias,
    personaDeRegistro: (r) => (r as unknown as { persona_id: string }).persona_id,
    personaDePresencia: (p) => (p as unknown as { persona_id: string }).persona_id,
    hoy,
  })
  // EL RESUMEN Y EL BOTÓN MIRAN EL PLANTEL ENTERO, no el recorte: ver §
  const resumen = resumenDeGrilla(quincena, todas)
  // LA MASA SALARIAL ESTIMADA SE CALCULA SOBRE EL PLANTEL ENTERO, por el mismo motivo que el
  // resumen: es la plata de la QUINCENA. La columna de cada fila sale de este mismo cálculo, así
  // que el número de la persona y el del total no pueden separarse.
  const proyeccion = proyeccionDeQuincena(todas, datos.personas, hoy)

  const visibles = recorte.pendiente
    ? todas.filter((f) => PENDIENTES[recorte.pendiente as string]?.toca(f) ?? true)
    : todas

  // EL CONVENIO NO SE DECIDE ACÁ, PERO SE CONSULTA: el reparto entero viaja al `title` del pie de
  // la tabla. Era una lista de tres renglones fija en la pantalla para contestar una pregunta que
  // se hace una vez por mes, y el rótulo ni siquiera entraba («UOCRA — Ley 22.250 (const…»).
  const convenios = new Map<string, number>()
  for (const p of datos.personas) convenios.set(p.convenio ?? 'sin convenio', (convenios.get(p.convenio ?? 'sin convenio') ?? 0) + 1)
  const conveniosTexto = [...convenios].map(([c, n]) => `${c}: ${n}`).join(' · ')

  const periodos: PeriodoDeGrilla[] = [0, -1, -2].map((n) => {
    const q = correrQuincena(quincena, n)
    return {
      texto: rotuloQuincena(q),
      activo: q.desde === quincena.desde,
      href: hrefDe({ quincena: q.desde }),
    }
  })

  const pendientes: PendienteDeGrilla[] = [
    { clave: 'motivo', n: resumen.diasSinMotivo },
    { clave: 'sin-cargar', n: resumen.diasSinCargar },
    { clave: 'tarifa', n: resumen.sinRetribucion },
  ].map(({ clave, n }) => ({
    texto: PENDIENTES[clave].texto(n),
    cuantos: n,
    activo: recorte.pendiente === clave,
    href: hrefDe({ pendiente: recorte.pendiente === clave ? undefined : clave }),
  }))

  return (
    // EL CONTENIDO NO COMPARTE `data-testid` CON SU PESTAÑA. `BarraSolapas` ya publica
    // `solapa-horas` para el clic; que el contenedor usara el mismo nombre hacía que un selector
    // resolviera a dos elementos y el test se cayera por «strict mode» sin que nada estuviera mal.
    <div data-testid="vista-horas">
      {[...datos.errores, ...liquidacion.errores].map((e) => (
        <div key={e.que} style={{ padding: '0 0 10px' }}>
          <Aviso tono="neg" testid="horas-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}
      <HorasConPersona
        titulo={rotuloQuincena(quincena)}
        estado={datos.cerrada ? 'cerrada' : 'abierta'}
        jornadaTexto="9 h de lunes a jueves · 8 h los viernes"
        habilesTexto={habilesTranscurridos(resumen.dias, hoy)}
        hoy={hoy}
        filas={visibles}
        resumen={resumen}
        proyeccion={proyeccion}
        periodos={periodos}
        pendientes={pendientes}
        hrefSinRecorte={hrefDe({ pendiente: undefined })}
        convenios={conveniosTexto}
        // LO QUE LAS OTRAS TRES SOLAPAS RESTAN DE ESTE NÚMERO. «Horas» publica el total (1.289) y es
        // la única que no tiene nada que explicar de sí misma — pero es la pantalla desde la que el
        // dueño salta a las otras, así que acá dice de una vez por qué allá va a ver menos.
        restaDeHoras={liquidacion.horas.excluidas.map((e) => `${e.horas} h ${e.motivo}`).join(' · ')}
        personas={datos.porPersona}
        correcciones={datos.correcciones}
        cerrada={datos.cerrada}
        quincena={{ desde: quincena.desde, hasta: quincena.hasta }}
        lineas={lineas}
        camposEditables={liquidacion.camposEditables}
        multiplicador={multiplicador}
        accion={<BotonCierre puede={resumen.puedeCerrar} porQueNo={resumen.porQueNo} href={hrefCierre} />}
      />
    </div>
  )
}

/**
 * «7 de 11 hábiles transcurridos» — cuánto de la quincena ya pasó, en DÍAS HÁBILES.
 *
 * Es el numerito que dice si «1.019 de 1.400» es un atraso o es que la quincena recién empieza. Se
 * cuenta de lunes a viernes porque ésa es la jornada del convenio (R2): el sábado de la grilla está
 * para poder cargar una extra, no porque se lo espere.
 */
function habilesTranscurridos(dias: readonly string[], hoy: string): string {
  const esHabil = (f: string) => {
    const [a, m, d] = f.split('-').map(Number)
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
    return dow >= 1 && dow <= 5
  }
  const habiles = dias.filter(esHabil)
  const pasados = habiles.filter((f) => f <= hoy)
  return `${pasados.length} de ${habiles.length} hábiles transcurridos`
}

/**
 * EL BOTÓN DE CIERRE ES UNA PUERTA, NO LA ACCIÓN. Cerrar lo implementa la solapa «Cierre»: acá sólo
 * se enlaza, y mientras haya pendientes ni siquiera es un enlace — es un botón apagado.
 *
 * ═══ EL PORQUÉ PASÓ AL `title`, Y LO QUE LO REEMPLAZA ES MEJOR ═══
 *
 * Debajo del botón había un párrafo: «Antes de cerrar: 9 ausencia(s) sin motivo · 1 sin retribución
 * cargada · 8 día(s) sin cargar». Decía lo mismo que la banda de pendientes de arriba —que además
 * es accionable, porque cada una lleva a las filas que la producen— y era uno de los párrafos
 * permanentes que el dueño prohíbe. El texto no se perdió: está en el `title` del botón gris, que es
 * exactamente donde se lo va a buscar.
 */
function BotonCierre({ puede, porQueNo, href }: { puede: boolean; porQueNo?: string; href: string }) {
  const estilo = {
    height: 30, borderRadius: 6, border: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '0 12px', fontSize: '12px', fontWeight: 600,
  } as const
  if (!puede) {
    return (
      <button type="button" disabled data-testid="cerrar-quincena" title={porQueNo}
        style={{ ...estilo, background: '#EDECE8', color: V.tenue, cursor: 'not-allowed' }}>
        Cerrar quincena
      </button>
    )
  }
  return (
    <Link href={href} prefetch={false} data-testid="cerrar-quincena"
      style={{ ...estilo, background: V.marca, color: V.grafito, textDecoration: 'none' }}>
      Cerrar quincena
    </Link>
  )
}
