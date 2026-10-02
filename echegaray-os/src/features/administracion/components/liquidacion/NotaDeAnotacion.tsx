'use client'

// LA NOTA DE UN RENGLÓN DEL CUADRO DEL PUNTO AMARILLO, EDITABLE AHÍ MISMO (dueño, 02/10/2026: «en el lugar que dice
// "nota" … si le hago click dejame escribir una nota»).
//
// Edición sin abandonar el contexto: el texto se vuelve un campo de una línea en el mismo renglón. Enter o salir del
// campo guarda; Escape cancela (y no cierra el cuadro: el cuadro mira `defaultPrevented`). Una celda que cierra muda
// parece rota: guardar, no cambiar nada o fallar SIEMPRE dicen algo, y si falla lo escrito queda en el campo.
// De qué anotación es la nota y cuándo se muestra lo decide `notaDeAnotacion.ts`; acá sólo se edita.

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { guardarNotaDeAnotacion } from '../../services/notaDeAnotacionActions'
import { LARGO_MAXIMO_DE_NOTA, textoDeNota } from '../../services/notaDeAnotacion'
import { NOTA_ILEGIBLE, SIN_NOTA, type RenglonDePago } from '../../services/detalleDePagoEnEfectivo'

type Estado = { tipo: 'quieto' } | { tipo: 'guardando' } | { tipo: 'hecho'; texto: string } | { tipo: 'error'; texto: string }

const ESPERA_DEL_AVISO = 2500

/** El texto de nota que se puede editar: la frase «Sin nota» o el aviso de ilegible no son una nota. */
const notaDe = (r: RenglonDePago): string | null => (r.nota === SIN_NOTA || r.nota === NOTA_ILEGIBLE ? null : r.nota)

/** El aviso de cómo terminó el guardado: los de éxito se apagan solos; el error queda hasta el próximo intento. */
function useAviso() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'quieto' })
  const aviso = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (aviso.current) clearTimeout(aviso.current) }, [])
  const avisar = (e: Estado) => {
    setEstado(e)
    if (aviso.current) clearTimeout(aviso.current)
    if (e.tipo === 'hecho') aviso.current = setTimeout(() => setEstado({ tipo: 'quieto' }), ESPERA_DEL_AVISO)
  }
  return [estado, avisar] as const
}

/**
 * `boton` lo crea quien dibuja el renglón y se pasa aparte: devuelto dentro del objeto, el compilador de React trataría
 * todo el objeto como un ref y no dejaría leerlo al dibujar.
 *
 * Lo guardado acá vale hasta que la página traiga lo de la base (revalidación): `sobre` es lo que la base decía al
 * guardar, y cuando eso cambia manda la base. Derivado al dibujar, sin efecto que pise el estado.
 *
 * `enCurso` y `cerrada` van en ref y no en estado: el blur que dispara el campo al desmontarse corre con el closure
 * viejo. Sin eso, Escape guardaba lo que se acababa de cancelar, y un Enter seguido del blur guardaba dos veces.
 */
export function useNotaDeRenglon(r: RenglonDePago, alEditar: (editando: boolean) => void, boton: RefObject<HTMLButtonElement | null>) {
  const [guardada, setGuardada] = useState<{ texto: string | null; por: string | null; sobre: string } | null>(null)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [estado, avisar] = useAviso()
  const devolverFoco = useRef(false)
  const enCurso = useRef(false)
  const cerrada = useRef(false)

  useEffect(() => {
    if (!editando && devolverFoco.current) { devolverFoco.current = false; boton.current?.focus() }
  }, [editando, boton])

  const deLaBase = `${r.nota}|${r.notaPor ?? ''}`
  const local = guardada && guardada.sobre === deLaBase ? guardada : null
  const texto = local ? local.texto : notaDe(r)
  const por = local ? local.por : r.notaPor
  const terminar = () => { setEditando(false); alEditar(false) }

  const abrir = () => {
    if (!r.ancla) return
    cerrada.current = false
    setBorrador(texto ?? ''); setEditando(true); alEditar(true); avisar({ tipo: 'quieto' })
  }

  const guardar = async () => {
    if (!r.ancla || enCurso.current || cerrada.current || !editando) return
    const nuevo = textoDeNota(borrador)
    if (nuevo === texto) { cerrada.current = true; terminar(); avisar({ tipo: 'hecho', texto: 'Sin cambios' }); return }
    enCurso.current = true
    const sobre = deLaBase
    avisar({ tipo: 'guardando' })
    const res = await guardarNotaDeAnotacion({ ...r.ancla, texto: borrador }).catch(
      () => ({ ok: false as const, error: 'No se pudo guardar la nota: sin respuesta del servidor.' }))
    enCurso.current = false
    if (!res.ok) { avisar({ tipo: 'error', texto: res.error }); return }
    cerrada.current = true
    setGuardada({ texto: res.texto, por: res.por, sobre })
    terminar()
    avisar({ tipo: 'hecho', texto: res.texto ? 'Nota guardada' : 'Nota borrada' })
  }

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); devolverFoco.current = true; void guardar() }
    if (e.key === 'Escape') {
      // El cuadro se cierra con Escape en `document`: acá se cancela sólo la edición.
      e.preventDefault(); cerrada.current = true; devolverFoco.current = true; terminar(); avisar({ tipo: 'quieto' })
    }
  }

  return { texto, por, editando, borrador, setBorrador, estado, abrir, guardar, alTeclear, editable: r.ancla !== null }
}

export type NotaDeRenglon = ReturnType<typeof useNotaDeRenglon>

// En el teléfono el área táctil llega a 44 px hacia arriba y abajo sin mover el renglón (como el punto de la celda).
const TACTIL = 'max-md:-my-3.5 max-md:py-3.5'
const FOCO = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink'

/** «Sin nota» a la derecha del importe, como estaba; clicable cuando hay una anotación a la que colgarla. */
export function SinNota({ n, rotulo, boton }: { n: NotaDeRenglon; rotulo: string; boton: RefObject<HTMLButtonElement | null> }) {
  if (!n.editable) return <span className="flex-none text-[11px] text-faint">{rotulo}</span>
  return (
    <button
      ref={boton} type="button" data-testid="nota-de-anotacion" onClick={n.abrir} aria-label="Escribir una nota"
      className={`-mx-1 flex-none cursor-text rounded bg-transparent px-1 text-[11px] leading-4 text-faint hover:text-ink ${TACTIL} ${FOCO}`}
    >
      {rotulo}
    </button>
  )
}

/** La nota escrita (o el campo mientras se escribe), con quién y cuándo, y el estado del guardado. */
export function LineaDeNota({ n, boton }: { n: NotaDeRenglon; boton: RefObject<HTMLButtonElement | null> }) {
  return (
    <>
      {n.editando ? (
        <input
          autoFocus type="text" data-testid="nota-de-anotacion-campo" aria-label="Nota" maxLength={LARGO_MAXIMO_DE_NOTA}
          value={n.borrador} onChange={(e) => n.setBorrador(e.target.value)} onKeyDown={n.alTeclear} onBlur={() => void n.guardar()}
          readOnly={n.estado.tipo === 'guardando'}
          className="mt-1 h-7 w-full rounded-control border border-line bg-canvas px-2 text-[12px] text-ink outline-none focus:border-ink max-md:h-11 max-md:text-[16px]"
        />
      ) : n.texto !== null && (
        <button
          ref={boton} type="button" data-testid="nota-de-anotacion" onClick={n.abrir} aria-label="Editar la nota"
          disabled={!n.editable}
          className={`-mx-1 cursor-text break-words rounded bg-transparent px-1 text-left text-[11px] leading-4 text-ink disabled:cursor-default max-md:min-h-11 ${FOCO}`}
        >
          {n.texto}
        </button>
      )}
      {!n.editando && n.texto !== null && n.por && <div className="text-[11px] leading-4 text-faint">{n.por}</div>}
      {n.estado.tipo !== 'quieto' && (
        <div role="status" data-testid="nota-de-anotacion-estado" className={`text-[11px] leading-4 ${n.estado.tipo === 'error' ? 'text-neg' : 'text-muted'}`}>
          {n.estado.tipo === 'guardando' ? 'Guardando…' : n.estado.texto}
        </div>
      )}
    </>
  )
}
