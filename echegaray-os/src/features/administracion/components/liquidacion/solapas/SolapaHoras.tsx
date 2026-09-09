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
  const recorte = { convenio: parametros.convenio, pendiente: parametros.pendiente }
  const hrefCierre = hrefDe({ solapa: 'cierre' })
  const supabase = await createClient()
  const datos = await getDatosDeLaSolapaHoras(supabase, quincena)

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
  const visibles = todas.filter((f) => {
    if (recorte.convenio && (convenioDe.get(f.personaId) ?? 'sin convenio') !== recorte.convenio) return false
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
      opciones: [
        { texto: 'Todo el plantel', detalle: String(datos.personas.length), activa: !recorte.convenio && !recorte.pendiente, href: hrefDe({ convenio: undefined, pendiente: undefined }) },
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
    <div data-testid="solapa-horas">
      {datos.errores.map((e) => (
        <div key={e.que} style={{ padding: '0 0 10px' }}>
          <Aviso tono="neg" testid="horas-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}
      <HorasConPersona
        titulo={rotuloQuincena(quincena)}
        jornadaTexto="9 h de lunes a jueves · 8 h los viernes"
        filas={visibles}
        resumen={resumen}
        filtros={filtros}
        personas={datos.porPersona}
        correcciones={datos.correcciones}
        cerrada={datos.cerrada}
        hasta={quincena.hasta}
        accion={<BotonCierre puede={resumen.puedeCerrar} href={hrefCierre} />}
      />
    </div>
  )
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
