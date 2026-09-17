'use client'

// LA CARGA DEL DÍA — el rediseño aprobado por el dueño el 17/09/2026: una barra con UNA acción primaria,
// la tabla compacta por obra en la compu, la lista con un botón grande en el teléfono, y todo lo
// excepcional (motivo, horas repartidas, mover de obra, pases) en el panel de la persona.
//
// ═══ CADA TOQUE SE GUARDA AL INSTANTE, CON LA MISMA REGLA QUE ANTES ═══
//
// `casillaTrasToque` decide la casilla y `marcaDeLaCasilla` qué se escribe; `guardarPresencia` y
// `quitarPresencia` escriben. Si la base rechaza, la casilla vuelve a como estaba y se dice por qué.
//
// ═══ TIEMPO REAL SIN PISAR LO QUE SE ESTÁ TOCANDO ═══
//
// El layout de Personal refresca la página cuando cambia `asistencia_dia`, `registros_hh` u
// `obra_asignacion`. Las casillas se fusionan por persona con `fusionarConElServidor`: lo que otro
// usuario guardó entra, lo que acá se tocó y todavía no volvió del servidor se respeta.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fusionarConElServidor, huellaDe } from '@/shared/tiempo-real/estadoDelServidor'
import { Aviso } from '@/shared/components/ds'
import {
  casillaTrasToque, marcaDeLaCasilla, type CasillaPresencia, type ToqueDePresencia,
} from '@/features/administracion/services/presenciaDelDia'
import { guardarPresencia, quitarPresencia } from '@/features/administracion/services/presenciaDelDiaActions'
import {
  agruparPorObra, filtrarCarga, queSePuedeElDia, resumenDeCarga, sinMarcarPorObra,
  type FilaDeCarga as Fila, type GrupoDeCarga, type PermisoDelDia,
} from '@/features/administracion/services/cargaDeAsistencia'
import type { EstadoDeGuardado, ObraElegible } from './ControlesDeFila'
import { BarraDelDia, type OpcionDeObra } from './BarraDelDia'
import { TablaDelDia } from './TablaDelDia'
import { ListaDelDia } from './ListaDelDia'
import { PanelDeLaPersona } from './PanelDeLaPersona'
import type { AccionesDeLaCarga, DiaDeLaCarga } from './tipos'

type Casillas = Record<string, CasillaPresencia>

const casillasDe = (filas: readonly Fila[]): Casillas =>
  Object.fromEntries(filas.map((f) => [f.persona.id, f.casilla]))

/** Las casillas locales, fusionadas con cada lectura nueva del servidor. */
function useCasillas(filas: readonly Fila[]) {
  const base = useMemo(() => casillasDe(filas), [filas])
  const [casillas, setCasillas] = useState<Casillas>(base)
  const [vista, setVista] = useState(() => ({ huella: huellaDe(base), base }))
  if (huellaDe(base) !== vista.huella) {
    const anterior = vista.base
    setVista({ huella: huellaDe(base), base })
    setCasillas((prev) => fusionarConElServidor(prev, anterior, base))
  }
  return [casillas, setCasillas] as const
}

export function CargaDeAsistencia(props: {
  filas: Fila[]; obraFiltro: string | null; fecha: string; hoy: string; rotuloDia: string
  obras: ObraElegible[]; nombres: Record<string, string>; cierre: string | null; permiso: PermisoDelDia
  puedeMover: boolean; certificados: Record<string, string>
  hrefAyer: string; hrefManana: string; hrefHoy: string | null; opcionesDeObra: OpcionDeObra[]
}) {
  const { filas, obraFiltro, fecha, nombres } = props
  const router = useRouter()
  const [q, setQ] = useState('')
  const [casillas, setCasillas] = useCasillas(filas)
  const [guardados, setGuardados] = useState<Record<string, EstadoDeGuardado>>({})
  const [obrasElegidas, setObrasElegidas] = useState<Record<string, string>>({})
  const [abierta, setAbierta] = useState<string | null>(null)
  const [acuse, setAcuse] = useState<{ ok: boolean; texto: string } | null>(null)
  const [, arrancar] = useTransition()

  const visibles = filtrarCarga(filas, { obra: obraFiltro, q })
  const grupos = agruparPorObra(visibles, nombres)
  const casillaDe = (f: Fila) => casillas[f.persona.id] ?? f.casilla
  const obraDe = (f: Fila) => f.obraId ?? obrasElegidas[f.persona.id] ?? null
  const resumen = resumenDeCarga(visibles.map(casillaDe))
  const sePuede = queSePuedeElDia({ permiso: props.permiso, cierre: props.cierre })
  const dia: DiaDeLaCarga = {
    fecha, hoy: props.hoy, rotuloDia: props.rotuloDia, obras: props.obras, nombres, sePuede,
    puedeMover: props.puedeMover, certificados: props.certificados,
  }
  const guardar = (id: string, e: EstadoDeGuardado) => setGuardados((prev) => ({ ...prev, [id]: e }))

  const tocar = (f: Fila, toque: ToqueDePresencia) => {
    const id = f.persona.id
    const obraId = obraDe(f)
    if (!obraId || !sePuede.marcar) return
    const antes = casillaDe(f)
    const despues = casillaTrasToque(antes, toque)
    const marca = marcaDeLaCasilla(id, despues)
    setAcuse(null)
    setCasillas((prev) => ({ ...prev, [id]: despues }))
    guardar(id, { tipo: 'guardando' })
    arrancar(async () => {
      const r = marca
        ? await guardarPresencia({ obra_id: obraId, fecha, marcas: [marca] })
        // DECISIÓN 3: quitar el presente retira la jornada por defecto que nadie tocó.
        : antes.estado ? await quitarPresencia({ persona_id: id, fecha, quitar_jornada_por_defecto: true }) : { ok: true as const, mensaje: '' }
      if (r.ok) { guardar(id, { tipo: 'ok' }); router.refresh() }
      else { setCasillas((prev) => ({ ...prev, [id]: antes })); guardar(id, { tipo: 'error', texto: r.error }) }
    })
  }

  // «MARCAR PRESENTES»: sólo a quien estaba sin marcar, una escritura por obra. No pisa un «Ausente».
  const marcarSinMarcar = (lista: readonly Fila[], rotulo: string) => {
    const { porObra, sinObra } = sinMarcarPorObra(lista, casillas, obraDe)
    if (porObra.size === 0) { setAcuse({ ok: true, texto: sinObra ? `${sinObra} sin obra: se asignan desde su detalle.` : `${rotulo}: ya estaban todos marcados.` }); return }
    const previas = casillas
    const ids = [...porObra.values()].flat()
    setCasillas((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, { estado: 'presente' as const, motivo: null }])) }))
    arrancar(async () => {
      const resultados = await Promise.all([...porObra.entries()].map(([obra_id, personas]) =>
        guardarPresencia({ obra_id, fecha, marcas: personas.map((persona_id) => ({ persona_id, estado: 'presente' as const, motivo: null })) })))
      const falla = resultados.find((r) => !r.ok)
      if (falla && !falla.ok) { setCasillas(previas); setAcuse({ ok: false, texto: `${rotulo}: ${falla.error}` }); return }
      setAcuse({ ok: true, texto: `${rotulo}: ${ids.length} marcados presentes.${sinObra ? ` ${sinObra} sin obra quedaron sin marcar.` : ''}` })
      router.refresh()
    })
  }

  const acciones: AccionesDeLaCarga = {
    casillaDe, obraDe, tocar, guardadoDe: (id) => guardados[id] ?? null,
    elegirObra: (id, obra) => setObrasElegidas((prev) => ({ ...prev, [id]: obra })),
    abrir: setAbierta,
    marcarGrupo: (g: GrupoDeCarga) => marcarSinMarcar(g.filas, g.nombre),
  }
  const filaAbierta = abierta ? filas.find((f) => f.persona.id === abierta) ?? null : null
  const sinMarcar = resumen.sinMarcar

  return (
    <div data-testid="carga-de-asistencia" className="pb-24 md:pb-8">
      <BarraDelDia
        rotuloDia={props.rotuloDia} esHoy={fecha === props.hoy} hrefAyer={props.hrefAyer} hrefManana={props.hrefManana} hrefHoy={props.hrefHoy}
        opciones={props.opcionesDeObra} q={q} onBuscar={setQ} resumen={resumen}
        sinMarcar={sinMarcar} puedeMarcar={sePuede.marcar} onMarcar={() => marcarSinMarcar(visibles, obraFiltro ? (nombres[obraFiltro] ?? 'La obra') : 'Todas las obras')}
      />
      {sePuede.motivo && <div className="px-4 pb-3 md:px-8"><Aviso tono="info" testid="dia-solo-lectura">{sePuede.motivo}</Aviso></div>}
      {acuse && <div className="px-4 pb-3 md:px-8"><Aviso tono={acuse.ok ? 'info' : 'neg'} testid="acuse-carga">{acuse.texto}</Aviso></div>}
      {grupos.length === 0 ? (
        <p className="mx-4 border-t border-line py-6 text-center text-[13px] text-muted md:mx-8" data-testid="carga-vacia">
          {q ? `Nadie coincide con «${q}».` : 'Nadie del plantel en esta obra ese día.'}
        </p>
      ) : (
        <>
          <div className="hidden md:block"><TablaDelDia grupos={grupos} dia={dia} acciones={acciones} /></div>
          <div className="md:hidden"><ListaDelDia grupos={grupos} dia={dia} acciones={acciones} /></div>
        </>
      )}
      {filaAbierta && (
        <PanelDeLaPersona key={filaAbierta.persona.id} fila={filaAbierta} dia={dia} acciones={acciones} onCerrar={() => setAbierta(null)} />
      )}
    </div>
  )
}
