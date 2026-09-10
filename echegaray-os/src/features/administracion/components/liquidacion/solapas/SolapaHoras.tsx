// SOLAPA «HORAS» — pantalla 1 del handoff v2, montada contra la base.
//
// Server component: arma filas, resumen y filtros con `grillaHorasQuincena.ts` (puro y probado) a
// partir de una sola tanda de lecturas, y le pasa todo a la parte de cliente, que sólo decide qué
// fila está abierta.
//
// ═══ LOS FILTROS RECORTAN, NO RECALCULAN LO ESPERADO ═══
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
import { alicuotasVigentes, multiplicadorDeCosto } from '../../../services/costoHora'
import { getAlicuotas } from '../../../services/costoLecturas'
import type { LineaDeLaPersona } from '../PanelDePersona'
import { correrQuincena, esFechaISO, quincenaDe, rotuloQuincena } from '../../../services/quincena'
import type { PropsDeSolapa } from './index'
import { HorasConPersona } from '../HorasConPersona'
import type { FiltroDeGrilla } from '../GrillaHorasQuincena'

const PENDIENTES: Record<string, { texto: string; toca: (f: FilaDeGrilla) => boolean }> = {
  motivo: { texto: 'Ausencias sin motivo', toca: (f) => f.diasSinMotivo > 0 },
  tarifa: { texto: 'Sin retribución', toca: (f) => f.estado === 'tarifa' },
  'sin-cargar': { texto: 'Días sin cargar', toca: (f) => f.diasSinCargar > 0 },
}

export async function SolapaHoras({ quincenaPedida, hoy, parametros, hrefDe }: PropsDeSolapa) {
  // LA VENTANA LA RESUELVE LA SOLAPA, no la página: cualquier día de la quincena sirve como valor,
  // que es la convención que ya usan Asistencia y Liquidación.
  const quincena = quincenaDe(esFechaISO(quincenaPedida) ? (quincenaPedida as string) : hoy)
  // Los recortes de ESTA solapa. `pendiente` y `convenio` viajan en la URL porque son un recorte
  // del trabajo que falta, y eso se comparte por link con quien lo tiene que resolver.
  const recorte = {
    convenio: parametros.convenio,
    pendiente: parametros.pendiente,
    modalidad: parametros.modalidad,
  }
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

  const convenioDe = new Map(datos.personas.map((p) => [p.id, p.convenio]))
  const modalidadDe = new Map(datos.personas.map((p) => [p.id, p.modalidad ?? null]))
  const visibles = todas.filter((f) => {
    if (recorte.convenio && (convenioDe.get(f.personaId) ?? 'sin convenio') !== recorte.convenio) return false
    if (recorte.modalidad && modalidadDe.get(f.personaId) !== recorte.modalidad) return false
    if (recorte.pendiente && !(PENDIENTES[recorte.pendiente]?.toca(f) ?? true)) return false
    return true
  })

  const convenios = new Map<string, number>()
  for (const p of datos.personas) convenios.set(p.convenio ?? 'sin convenio', (convenios.get(p.convenio ?? 'sin convenio') ?? 0) + 1)

  const filtros: FiltroDeGrilla[] = [
    {
      rotulo: 'Período',
      // LA ACTUAL Y LAS DOS ANTERIORES. La siguiente no se ofrece: no hay horas cargadas de una
      // quincena que todavía no empezó, y un período vacío se lee como un error de la pantalla.
      opciones: [0, -1, -2].map((n) => {
        const q = correrQuincena(quincena, n)
        return {
          texto: rotuloQuincena(q),
          detalle: q.desde === quincena.desde ? (datos.cerrada ? 'cerrada' : 'abierta') : '',
          activa: q.desde === quincena.desde,
          href: hrefDe({ quincena: q.desde }),
        }
      }),
    },
    {
      rotulo: 'Quién',
      // EL CORTE OBRERO/OFICINA SALE DE LA MODALIDAD QUE LIQUIDA, no de `modalidad_liquidacion`.
      //
      // Ese campo del legajo está vacío en las diecisiete personas de la base real, y con él el
      // filtro publicaba «Modalidad hora 1 · Modalidad mensual sin cargar» sobre quince obreros por
      // hora y dos de Oficina por mes (captura del dueño, 10/09/2026). La modalidad la decide
      // ahora la tarifa vigente por `modalidadDe`, que es la MISMA función que arma los cuadros de
      // la liquidación. La modalidad que no tiene a nadie se OFRECE IGUAL con «sin cargar» al lado
      // —el mockup la dibuja así—: esconderla haría creer que el corte no existe.
      opciones: [
        {
          texto: 'Todo el plantel',
          detalle: String(datos.personas.length),
          activa: !recorte.convenio && !recorte.pendiente && !recorte.modalidad,
          href: hrefDe({ convenio: undefined, pendiente: undefined, modalidad: undefined }),
        },
        ...['hora', 'mensual'].map((m) => {
          const n = datos.personas.filter((p) => (p.modalidad ?? null) === m).length
          return {
            texto: `Modalidad ${m}`,
            detalle: n === 0 ? 'sin cargar' : String(n),
            activa: recorte.modalidad === m,
            href: n === 0 ? undefined : hrefDe({ modalidad: recorte.modalidad === m ? undefined : m }),
          }
        }),
      ],
    },
    {
      rotulo: 'Convenio',
      opciones: [...convenios].map(([c, n]) => ({
        texto: c,
        detalle: String(n),
        activa: recorte.convenio === c,
        href: hrefDe({ convenio: recorte.convenio === c ? undefined : c }),
      })),
    },
    {
      rotulo: 'Pendiente',
      opciones: [
        { clave: 'motivo', n: resumen.diasSinMotivo },
        { clave: 'tarifa', n: resumen.sinRetribucion },
        { clave: 'sin-cargar', n: resumen.diasSinCargar },
      ].map(({ clave, n }) => ({
        texto: PENDIENTES[clave].texto,
        detalle: String(n),
        alerta: n > 0,
        activa: recorte.pendiente === clave,
        href: hrefDe({ pendiente: recorte.pendiente === clave ? undefined : clave }),
      })),
    },
  ]

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
        jornadaTexto="9 h de lunes a jueves · 8 h los viernes"
        habilesTexto={habilesTranscurridos(resumen.dias, hoy)}
        hoy={hoy}
        filas={visibles}
        resumen={resumen}
        filtros={filtros}
        personas={datos.porPersona}
        correcciones={datos.correcciones}
        cerrada={datos.cerrada}
        quincena={{ desde: quincena.desde, hasta: quincena.hasta }}
        lineas={lineas}
        camposEditables={liquidacion.camposEditables}
        multiplicador={multiplicador}
        accion={<BotonCierre puede={resumen.puedeCerrar} href={hrefCierre} />}
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
 * se enlaza, y mientras haya pendientes ni siquiera es un enlace — es un botón apagado con el
 * porqué debajo (que lo escribe `resumenDeGrilla`).
 */
function BotonCierre({ puede, href }: { puede: boolean; href: string }) {
  const estilo = {
    height: 30, borderRadius: 6, border: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '12px', fontWeight: 600,
  } as const
  if (!puede) {
    return (
      <button type="button" disabled data-testid="cerrar-quincena"
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
