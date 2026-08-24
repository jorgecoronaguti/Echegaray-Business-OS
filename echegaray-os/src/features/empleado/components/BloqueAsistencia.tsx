'use client'

import { useActionState, useRef, useState } from 'react'
import { Ayuda, Estado } from '@/shared/components/ds'
import { BloqueDato } from './Filas'
import { Azulejo } from './Bloques'
import { PieFijo } from './Piezas'
import { registrarMarca } from '../services/acciones'
import { encabezadoDelDia, hora, lecturaDelDia, siguienteAccion, trabajadoHoy } from '../services/asistencia'
import type { DiaDeAsistencia } from '../types'

// ASISTENCIA EN «HOY» — una sola acción primaria, de 52px, y nada al lado.
//
// El handoff: «La acción es siempre una sola (Registrar entrada → Registrar salida)». Dos botones a
// la vez obligan a elegir, y a las siete de la mañana con guantes puestos la respuesta correcta es
// una sola. Cuál es, la decide el estado del día — y lo vuelve a decidir el servidor, porque un
// `tipo` mandado a mano cerraría un día que nunca se abrió.
//
// EL BOTÓN SE DESHABILITA MIENTRAS ENVÍA. Sin eso, dos toques nerviosos mandan dos entradas; la
// segunda rebota contra el único de Postgres y el operario ve un error rojo por haber tocado bien.
//
// ═══ ENTRADA Y SALIDA, ENFRENTADAS Y EN GRANDE (Design System · Attendance control, 23/08/2026) ═══
//
// Las dos puntas del día van como dos bloques de dato grande, una al lado de la otra: es la única
// pregunta que esta pantalla contesta y se mira de reojo, con el teléfono en la mano y sin frenar.
// La que falta dice «sin registrar» y NUNCA `00:00` — un cero ahí afirma una hora que nadie marcó.

type EstadoForm = { error: string | null; mensaje?: string | null }

export function BloqueAsistencia({
  dia, obraId, compacto = false, grande = false, tarjeta = false,
}: {
  dia: DiaDeAsistencia | null
  obraId: string | null
  /** En escritorio el bloque comparte fila con «Ver historial» y el botón no ocupa el ancho. */
  compacto?: boolean
  /** LA VARIANTE DE M05: el estado como tarjeta grande y el botón fijo al pie. Cambia SÓLO la
   *  composición — el formulario, la server action y la geolocalización son los mismos objetos. */
  grande?: boolean
  /** LA VARIANTE DE M02: la tarjeta amarilla ENTERA es el botón. «Fichar es una sola acción: un
   *  botón grande que cambia de estado, nunca un formulario». */
  tarjeta?: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  // EL SEGUNDO SUBMIT TIENE QUE PASAR DE LARGO. `requestSubmit()` vuelve a disparar `onSubmit`: sin
  // esta marca, el formulario se intercepta a sí mismo para siempre y la entrada no se registra
  // nunca. Es un ref y no un estado a propósito — cambiarlo no tiene que redibujar nada.
  const yaUbicado = useRef(false)
  const [ubicando, setUbicando] = useState(false)

  const [estado, accion, enviando] = useActionState(
    async (_prev: EstadoForm, form: FormData): Promise<EstadoForm> => {
      const r = await registrarMarca(form)
      return r.ok ? { error: null, mensaje: r.mensaje ?? null } : { error: r.error }
    },
    { error: null },
  )

  /**
   * ═══ EL PUNTO SE PIDE ANTES DE MANDAR, Y NUNCA FRENA LA MARCA ═══
   *
   * El jefe de obra necesita saber desde dónde arrancó el día cada uno. Pero fichar es lo importante:
   * si el teléfono niega el permiso, no tiene señal de GPS o está adentro de un galpón de chapa, la
   * entrada se registra IGUAL y sin ubicación. Un operario que no puede marcar porque el navegador no
   * lo ubica es exactamente el modo de fallar que no se admite.
   *
   * Por eso hay tope de 8 segundos y `catch` que sigue: el permiso se pide, se espera un poco, y si
   * no llega se manda sin él. `maximumAge: 0` porque interesa DÓNDE ESTÁ AHORA, no dónde estuvo — una
   * coordenada cacheada de hace media hora es un dato viejo con cara de dato nuevo.
   */
  async function ubicar(): Promise<{ lat?: number; lon?: number; precision_m?: number }> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return {}
    return new Promise((resolve) => {
      let listo = false
      const cerrar = (v: { lat?: number; lon?: number; precision_m?: number }) => {
        if (!listo) { listo = true; resolve(v) }
      }
      const reloj = setTimeout(() => cerrar({}), 8000)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(reloj)
          cerrar({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            precision_m: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : undefined,
          })
        },
        () => { clearTimeout(reloj); cerrar({}) },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      )
    })
  }

  async function enviarConUbicacion(ev: React.FormEvent<HTMLFormElement>) {
    // Sólo la ENTRADA lleva punto: es «dónde dio el inicio del día». La salida no se pidió y no se
    // guarda — un dato personal que nadie mira no se junta.
    if (siguiente.tipo !== 'entrada') return
    if (yaUbicado.current) { yaUbicado.current = false; return }
    ev.preventDefault()
    setUbicando(true)
    const p = await ubicar().catch(() => ({}))
    setUbicando(false)
    const f = formRef.current
    if (!f) return
    yaUbicado.current = true
    for (const [k, v] of Object.entries(p)) {
      if (v == null) continue
      const input = document.createElement('input')
      input.type = 'hidden'; input.name = k; input.value = String(v)
      f.appendChild(input)
    }
    f.requestSubmit()
  }

  const siguiente = siguienteAccion(dia)
  const lectura = lecturaDelDia(dia)
  const entrada = hora(dia?.entrada ?? null)
  const salida = hora(dia?.salida ?? null)

  const cabeza = encabezadoDelDia(dia)
  const trabajado = trabajadoHoy(dia)

  // EL FORMULARIO ES UNO SOLO Y SE ARMA UNA VEZ. En la variante grande viaja al pie fijo y en la
  // compacta queda en el flujo: lo que cambia es DÓNDE se dibuja, no qué hace. Duplicar el <form>
  // por variante duplicaría el `ref` y `requestSubmit()` dispararía sobre el que no está montado.
  const formulario = siguiente.tipo ? (
    <form ref={formRef} action={accion} onSubmit={enviarConUbicacion} className={grande ? '' : compacto ? 'mt-3' : 'mt-3.5'}>
      <input type="hidden" name="obra_id" value={obraId ?? ''} />
      {tarjeta ? (
        /* LA TARJETA AMARILLA DE M02, ENTERA COMO OBJETIVO TÁCTIL. El disco negro a la izquierda,
           el verbo en 16px y debajo el estado real —«todavía no fichaste hoy»—. El objetivo mide la
           tarjeta y no el texto: en obra se toca con guante, apurado y sin mirar. */
        <button
          type="submit"
          disabled={enviando || ubicando}
          data-testid="registrar-marca"
          data-tipo={siguiente.tipo}
          className="flex w-full items-center gap-3.5 rounded-[14px] bg-marca px-4 py-4 text-left disabled:opacity-60"
        >
          <span aria-hidden className="h-[52px] w-[52px] shrink-0 rounded-full bg-ink" />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold text-[color:var(--os-on-marca)]">
              {ubicando ? 'Tomando la ubicación…' : enviando ? 'Registrando…' : siguiente.texto}
            </span>
            <span className="mt-0.5 block truncate text-[12.5px] text-[color:var(--os-on-marca)] opacity-70">
              {cabeza.detalle ?? 'todavía no fichaste hoy'}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-[17px] text-[color:var(--os-on-marca)] opacity-60">›</span>
        </button>
      ) : (
      <button
        type="submit"
        disabled={enviando || ubicando}
        data-testid="registrar-marca"
        data-tipo={siguiente.tipo}
        className={`flex h-[52px] items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)] disabled:opacity-60 ${
          grande ? 'w-full rounded-[12px]' : compacto ? 'w-full lg:h-[40px] lg:w-auto lg:px-5' : 'w-full'
        }`}
      >
        {ubicando ? 'Tomando la ubicación…' : enviando ? 'Registrando…' : siguiente.texto}
      </button>
      )}
    </form>
  ) : null

  // EL DÍA CERRADO NO DEJA A M02 SIN TARJETA. Sin acción pendiente `formulario` es null, y una
  // pantalla que no dice nada del fichaje se lee como que no fichó. Se dice que ya está cerrado.
  if (tarjeta) {
    return (
      <div data-testid="bloque-asistencia">
        {formulario ?? (
          <div data-testid="fichaje-cerrado" className="flex items-center gap-3.5 rounded-[14px] border border-pos-soft bg-pos-soft px-4 py-4">
            <span aria-hidden className="h-[52px] w-[52px] shrink-0 rounded-full bg-pos" />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-ink" data-testid="estado-asistencia">{cabeza.titulo}</span>
              <span className="mt-0.5 block truncate text-[12.5px] text-muted">{cabeza.detalle ?? 'sin marcas del día'}</span>
            </span>
          </div>
        )}
        {estado.error && <p className="mt-2 text-[12px] text-neg" data-testid="asistencia-error">{estado.error}</p>}
      </div>
    )
  }

  return (
    <div data-testid="bloque-asistencia">
      {grande ? (
        /* ═══ LA TARJETA DE ESTADO DE M05 ═══
           Un disco de color, el estado en 20px y el hecho que lo produjo debajo. El disco no lleva
           ícono a propósito: en obra, a contraluz, la mancha de color se ve de lejos y un glifo de
           18px no. Debajo, ENTRADA y TRABAJADO ENFRENTADOS — es la única pregunta que la pantalla
           contesta y se mira de reojo, con el teléfono en la mano y sin frenar. */
        <div
          data-testid="tarjeta-estado"
          data-estado={dia?.estado ?? 'sin_registrar'}
          className={`rounded-[14px] border px-4 py-5 text-center ${
            cabeza.tono === 'pos' ? 'border-pos-soft bg-pos-soft'
              : cabeza.tono === 'curso' ? 'border-pos-soft bg-pos-soft'
                : cabeza.tono === 'warn' ? 'border-neg-soft bg-neg-soft'
                  : 'border-line bg-surface'
          }`}
        >
          <span
            aria-hidden
            className={`mx-auto block h-[68px] w-[68px] rounded-full ${
              cabeza.tono === 'nulo' ? 'bg-surface-sunken' : cabeza.tono === 'warn' ? 'bg-neg' : 'bg-pos'
            }`}
          />
          {/* EL TESTID HISTÓRICO VIAJA EN EL TÍTULO. En esta variante el estado NO es una pastilla
              chica al costado: es el renglón de 20px del medio, y duplicarlo en un chip invisible
              dejaría un objeto que ningún ojo ni ningún test puede ver. */}
          <span className="mt-3 block text-[20px] font-semibold text-ink" data-testid="estado-asistencia">{cabeza.titulo}</span>
          {/* SIN MARCA NO HAY RENGLÓN CON HORA: se dice qué hacer, y no una hora que nadie marcó. */}
          <span className="mt-1 block text-[12.5px] text-muted">
            {cabeza.detalle ?? 'la jornada empieza cuando marcás tu entrada'}
          </span>
          <span className="mt-4 flex gap-3 border-t border-[#E3E7E3] pt-4">
            <Azulejo etiqueta="Entrada" valor={entrada} testid="dato-entrada" />
            {/* «TRABAJADO» EN CURSO NO ES UN NÚMERO. La regla del OS gana sobre el dibujo: un día
                sin cerrar no publica total, y el elapsed desde la entrada se lee como jornada
                trabajada sin serlo. Cerrado, sí: los minutos los cerró la base con las dos puntas. */}
            <Azulejo etiqueta="Trabajado" valor={trabajado} falta="en curso" testid="dato-trabajado" />
          </span>
        </div>
      ) : (
        <>
          <Estado tono={lectura.tono} clave={dia?.estado ?? 'sin_registrar'} testid="estado-asistencia">
            {lectura.texto}
          </Estado>

          <div className="mt-3 flex gap-10">
            <BloqueDato etiqueta="Entrada" valor={entrada} testid="dato-entrada" />
            <BloqueDato etiqueta="Salida" valor={salida} testid="dato-salida" />
          </div>
        </>
      )}

      {formulario && !grande && formulario}

      {estado.error && (
        <p className="mt-2 text-[12px] text-neg" data-testid="asistencia-error">{estado.error}</p>
      )}
      {estado.mensaje && !estado.error && (
        <p className="mt-2 text-[12px] text-muted" data-testid="asistencia-ok">{estado.mensaje}</p>
      )}
      {/* 22/08/2026 · EL TELÉFONO SE ABRE PARA APRETAR UN BOTÓN, DOS VECES POR DÍA. Dos líneas
          permanentes debajo del botón se leen la primera semana y después son ruido en la pantalla
          más chica del OS. La ubicación SÍ se queda a la vista y sólo en la entrada: es lo único
          que el botón hace además de registrar la marca, y eso hay que saberlo ANTES de apretarlo.
          El resto —qué pasa sin señal— se consulta cuando pasa, y cuando pasa el error lo dice. */}
      {!estado.error && !estado.mensaje && siguiente.tipo === 'entrada' && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Al entrar se guarda desde dónde marcaste. Si el teléfono no puede ubicarte, se registra igual.
        </p>
      )}
      {!estado.error && !estado.mensaje && siguiente.tipo && (
        <Ayuda titulo="Qué pasa si no tengo señal" testid="ayuda-marca">
          Se guarda al instante. Sin señal no se envía: te lo va a decir, no lo da por hecho.
        </Ayuda>
      )}

      {/* EL BOTÓN GRANDE VA AL PIE Y SE QUEDA AHÍ. M05: «un estado grande, un botón grande». Con la
          semana debajo, una primaria al final del documento obliga a desplazar hasta el fondo para
          hacer lo único que la pantalla vino a hacer. */}
      {grande && formulario && <PieFijo testid="pie-asistencia">{formulario}</PieFijo>}
    </div>
  )
}
