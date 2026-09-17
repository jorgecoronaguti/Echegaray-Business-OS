'use client'

// LOS CONTROLES DE UNA FILA DE LA CARGA ÚNICA — botón de marca, horas de una obra y mover de obra.
//
// Cada uno llama a una acción que YA existía y que ya usan Plantel, Horas y `/campo/asistencia`: esta
// pantalla no agrega ni una escritura. Lo que agrega es juntarlas en la misma fila, para que marcar,
// corregir las horas y cambiar de obra no sean tres pantallas con tres modelos mentales.
//
// Objetivos táctiles de 44 px en angosto y 36 px desde `md`: la misma persona usa esto parada en la
// obra con el teléfono y sentada en la oficina con el mouse.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { guardarJornada } from '@/features/administracion/services/jornadaPorObraActions'
import { cambiarObraActual } from '@/features/administracion/services/obraActualActions'
import { hs } from '@/features/administracion/services/jornadaPorObra'
import { entradaDeMover, envioDeHoras, puedeMoverDeObraEl } from '@/features/administracion/services/cargaDeAsistencia'
import { PlanDeObraPanel } from '../../PlanDeObraPanel'

// `pos` sólo para el estado positivo, `neg` sólo para el problema, ámbar para la tardanza (regla del
// dueño). Mismos tonos que `FormPresencia`: dos lenguajes para el mismo botón confundirían.
const TONOS = {
  pos: 'border-pos bg-pos-soft text-pos',
  neg: 'border-neg bg-neg-soft text-neg',
  neutro: 'border-line-strong bg-surface-sunken text-ink',
  warn: 'border-warn bg-warn-soft text-warn',
} as const

export const ALTO = 'min-h-[44px] md:min-h-[36px]'

export function BotonMarca({ rotulo, activo, tono, onClick, testid, aria, deshabilitado }: {
  rotulo: string
  activo: boolean
  tono: keyof typeof TONOS
  onClick: () => void
  testid: string
  aria: string
  deshabilitado?: boolean
}) {
  return (
    <button
      type="button" aria-label={aria} aria-pressed={activo} data-testid={testid}
      onClick={onClick} disabled={deshabilitado}
      className={`${ALTO} flex-1 rounded-control border px-2 text-[13px] font-medium transition-colors disabled:opacity-50 md:flex-none md:px-3 ${
        activo ? TONOS[tono] : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      {rotulo}
    </button>
  )
}

export type EstadoDeGuardado = { tipo: 'guardando' | 'ok' | 'error'; texto?: string } | null

export function LineaDeGuardado({ estado, testid }: { estado: EstadoDeGuardado; testid: string }) {
  if (!estado) return null
  return (
    <p
      className={`text-[12px] ${estado.tipo === 'error' ? 'text-neg' : 'text-muted'}`}
      data-testid={testid} data-tipo={estado.tipo} role={estado.tipo === 'error' ? 'alert' : undefined}
    >
      {estado.tipo === 'guardando' ? 'guardando…' : estado.tipo === 'ok' ? (estado.texto ? `✓ ${estado.texto}` : '✓ guardado') : `No se guardó: ${estado.texto}`}
    </p>
  )
}

/**
 * LAS HORAS DE UNA PERSONA EN UNA OBRA, ESE DÍA. Guarda al salir del campo o con Enter, por
 * `guardarJornada` —la misma puerta que la carga del teléfono—: vacío es «sin horas» (se vacía), cero
 * es un error, y el número corrige. La jornada por defecto va como placeholder, nunca como valor.
 */
export function HorasDeObra({ personaId, nombre, obraId, obraNombre, fecha, horas, sugerencia, deshabilitado }: {
  personaId: string
  nombre: string
  obraId: string
  obraNombre: string
  fecha: string
  horas: number | null
  sugerencia: number | null
  deshabilitado?: boolean
}) {
  const router = useRouter()
  const servidor = horas === null ? '' : hs(horas)
  const [borrador, setBorrador] = useState<{ base: string; texto: string }>({ base: servidor, texto: servidor })
  // LO QUE OTRO USUARIO GUARDÓ ENTRA SI NO SE ESTÁ EDITANDO ESTA CASILLA (tiempo real, 16/09/2026).
  if (borrador.base !== servidor && borrador.texto === borrador.base) setBorrador({ base: servidor, texto: servidor })
  const [estado, setEstado] = useState<EstadoDeGuardado>(null)
  const [, arrancar] = useTransition()

  const confirmar = () => {
    const envio = envioDeHoras({ personaId, obraId, fecha, antes: horas, texto: borrador.texto })
    if (envio.tipo === 'nada') return
    if (envio.tipo === 'error') { setEstado({ tipo: 'error', texto: envio.error }); return }
    const texto = borrador.texto.trim()
    setEstado({ tipo: 'guardando' })
    arrancar(async () => {
      const r = await guardarJornada(envio.entrada)
      if (r.ok) { setEstado({ tipo: 'ok', texto: r.aviso }); setBorrador({ base: texto, texto }); router.refresh() }
      else setEstado({ tipo: 'error', texto: r.error })
    })
  }

  return (
    <label className="flex flex-col gap-1" data-testid="horas-de-obra" data-obra={obraId}>
      <span className="text-[11px] text-faint">{obraNombre}</span>
      <input
        inputMode="decimal" value={borrador.texto} disabled={deshabilitado}
        placeholder={sugerencia === null ? 'h' : `${hs(sugerencia)} h`}
        aria-label={`Horas de ${nombre} en ${obraNombre}`}
        onChange={(e) => { setBorrador({ ...borrador, texto: e.target.value }); setEstado(null) }}
        onBlur={confirmar}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className={`${ALTO} w-20 rounded-control border border-line bg-surface px-2 text-right font-mono text-[14px] tabular-nums text-ink disabled:opacity-50`}
      />
      <LineaDeGuardado estado={estado} testid="estado-horas" />
    </label>
  )
}

export interface ObraElegible { id: string; nombre: string }

/**
 * MOVER A ALGUIEN DE OBRA (dueño, 17/09/2026: «falta contemplar mover gente de un lugar a otro por
 * mobile, asignar a días siguientes desde compu»).
 *
 * Desde el día que se está mirando —si es hoy o futuro— con `cambiarObraActual`, la misma acción del
 * desplegable de la grilla y de «Traer a alguien». Para planificar tramos (desde / hasta, cancelar un
 * pase) se abre `PlanDeObraPanel`, el panel que ya existe en la grilla. Hacia atrás no se ofrece: la
 * acción lo rechaza, y corregir un día pasado es la corrección de jornada de Horas.
 */
export function MoverDeObra({ persona, obraActual, fecha, hoy, obras, rotuloDia }: {
  persona: { id: string; nombre: string }
  obraActual: string | null
  fecha: string
  hoy: string
  obras: ObraElegible[]
  rotuloDia: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [plan, setPlan] = useState(false)
  const [destino, setDestino] = useState('')
  const [estado, setEstado] = useState<EstadoDeGuardado>(null)
  const [pendiente, arrancar] = useTransition()
  const sePuede = puedeMoverDeObraEl(fecha, hoy)

  const mover = () => {
    const entrada = entradaDeMover({ personaId: persona.id, destino, fecha, hoy })
    if (!entrada) return
    setEstado({ tipo: 'guardando' })
    arrancar(async () => {
      const r = await cambiarObraActual(entrada)
      if (r.ok) { setEstado({ tipo: 'ok', texto: r.mensaje }); setAbierto(false); router.refresh() }
      else setEstado({ tipo: 'error', texto: r.error })
    })
  }

  return (
    <div className="contents" data-testid="mover-de-obra">
      <button
        type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} data-testid="abrir-mover"
        className={`${ALTO} inline-flex items-center text-[12px] text-ink underline hover:text-ink-soft`}
      >
        {obraActual ? 'Mover de obra' : 'Asignar a obra'}
      </button>
      <button
        type="button" onClick={() => setPlan(true)} data-testid="abrir-plan-obra"
        className={`${ALTO} inline-flex items-center text-[12px] text-muted underline hover:text-ink`}
      >
        Planificar días siguientes
      </button>
      {abierto && (sePuede ? (
        <div className="flex w-full flex-wrap items-center gap-2 py-1">
          <select
            value={destino} onChange={(e) => setDestino(e.target.value)} data-testid="destino-mover"
            aria-label={`Obra a la que va ${persona.nombre}`}
            className={`${ALTO} min-w-0 flex-1 rounded-control border border-line bg-surface px-2 text-[13px] text-ink md:flex-none`}
          >
            <option value="">{obraActual ? 'Sin obra' : 'Elegí la obra'}</option>
            {obras.filter((o) => o.id !== obraActual).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <button
            type="button" onClick={mover} disabled={pendiente || (!obraActual && !destino)} data-testid="confirmar-mover"
            className={`${ALTO} rounded-control border border-ink bg-ink px-3 text-[13px] text-canvas disabled:opacity-50`}
          >
            {fecha === hoy ? 'Mover desde hoy' : `Mover desde el ${rotuloDia}`}
          </button>
        </div>
      ) : (
        <p className="w-full text-[12px] text-muted" data-testid="mover-dia-pasado">
          Un día pasado no se mueve de obra: se corrige la jornada desde Horas.
        </p>
      ))}
      <div className="w-full"><LineaDeGuardado estado={estado} testid="estado-mover" /></div>
      {plan && <PlanDeObraPanel persona={persona} obras={obras} hoy={hoy} onCerrar={() => setPlan(false)} />}
    </div>
  )
}
