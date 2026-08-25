'use client'

import { useActionState, useRef, useState } from 'react'
import { registrarMarca } from '../services/acciones'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { PieFijo, mono } from '@/shared/components/movil/Piezas'
import { encabezadoDelDia, hora, siguienteAccion, trabajadoHoy } from '../services/asistencia'
import type { DiaDeAsistencia } from '../types'

// ASISTENCIA EN «HOY» — una sola acción primaria, de 52px, y nada al lado.
//
// El handoff: «La acción es siempre una sola (Marcar entrada → Marcar salida)». Dos botones a
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
  dia, obraId, tarjeta = false,
}: {
  dia: DiaDeAsistencia | null
  obraId: string | null
  /** LA VARIANTE DE M02: la tarjeta amarilla ENTERA es el botón. «Fichar es una sola acción: un
   *  botón grande que cambia de estado, nunca un formulario». Sin esto se dibuja M05: el estado
   *  como tarjeta centrada y el botón fijo al pie. */
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
  const cabeza = encabezadoDelDia(dia)
  const entrada = hora(dia?.entrada ?? null)
  const trabajado = trabajadoHoy(dia)
  const enObra = dia?.estado === 'en_curso'

  // EL FORMULARIO ES UNO SOLO Y SE ARMA UNA VEZ. En la variante grande viaja al pie fijo y en la
  // tarjeta ES la tarjeta: lo que cambia es DÓNDE se dibuja, no qué hace. Duplicar el <form> por
  // variante duplicaría el `ref` y `requestSubmit()` dispararía sobre el que no está montado.
  const formulario = siguiente.tipo ? (
    <form ref={formRef} action={accion} onSubmit={enviarConUbicacion}>
      <input type="hidden" name="obra_id" value={obraId ?? ''} />
      {tarjeta ? (
        /* LA TARJETA DE M02, ENTERA COMO OBJETIVO TÁCTIL (`minHeight:76`). Amarilla mientras no
           fichó —es la acción del día— y verde clara cuando ya está en obra. El disco de 48 lleva
           el icono que el mockup le pone: el dedo cuando hay que tocar, el tilde cuando ya está. */
        <button
          type="submit"
          disabled={enviando || ubicando}
          data-testid="registrar-marca"
          data-tipo={siguiente.tipo}
          style={{
            width: '100%', background: enObra ? C.posFondo : C.marca,
            border: `1px solid ${enObra ? C.posBorde : C.marcaOscura}`, borderRadius: R.tarjeta,
            padding: 16, display: 'flex', alignItems: 'center', gap: 14, minHeight: 76,
            textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            opacity: enviando || ubicando ? 0.6 : 1,
          }}
        >
          <span style={{
            width: 48, height: 48, borderRadius: 24, flexShrink: 0,
            background: enObra ? C.surface : C.ink, color: enObra ? C.pos : C.marca,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icono nombre={enObra ? 'ok' : 'dedo'} tamano={24} />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: C.ink }} data-testid="estado-asistencia">
              {ubicando ? 'Tomando la ubicación…' : enviando ? 'Marcando…' : enObra ? 'Estás en obra' : siguiente.texto}
            </span>
            <span style={{
              display: 'block', fontSize: 13, color: C.muted, marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {cabeza.detalle ?? 'todavía no fichaste hoy'}
              {enObra ? ' · tocá para salir' : ''}
            </span>
          </span>
          <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}>
            <Icono nombre="siguiente" tamano={20} />
          </span>
        </button>
      ) : (
        /* EL BOTÓN DE M05: 56px, amarillo para entrar y BLANCO CON BORDE para salir. El mockup los
           distingue a propósito — entrar es la acción del día y salir es cerrarla, no repetirla. */
        <button
          type="submit"
          disabled={enviando || ubicando}
          data-testid="registrar-marca"
          data-tipo={siguiente.tipo}
          style={{
            width: '100%', minHeight: 56, borderRadius: R.control,
            background: siguiente.tipo === 'entrada' ? C.marca : C.surface,
            border: siguiente.tipo === 'entrada' ? 'none' : `1px solid ${C.lineaFuerte}`,
            color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 17, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            opacity: enviando || ubicando ? 0.6 : 1,
          }}
        >
          <Icono nombre={siguiente.tipo === 'entrada' ? 'entrar' : 'salir'} tamano={22} />
          {ubicando ? 'Tomando la ubicación…' : enviando ? 'Marcando…' : siguiente.texto}
        </button>
      )}
    </form>
  ) : null

  const mensajes = (
    <>
      {estado.error && (
        <p style={{ marginTop: 8, fontSize: 12, color: C.neg }} data-testid="asistencia-error">{estado.error}</p>
      )}
      {estado.mensaje && !estado.error && (
        <p style={{ marginTop: 8, fontSize: 12, color: C.muted }} data-testid="asistencia-ok">{estado.mensaje}</p>
      )}
    </>
  )

  // EL DÍA CERRADO NO DEJA A M02 SIN TARJETA. Sin acción pendiente `formulario` es null, y una
  // pantalla que no dice nada del fichaje se lee como que no fichó. Se dice que ya está cerrado.
  if (tarjeta) {
    return (
      <div data-testid="bloque-asistencia">
        {formulario ?? (
          <div
            data-testid="fichaje-cerrado"
            style={{
              background: C.posFondo, border: `1px solid ${C.posBorde}`, borderRadius: R.tarjeta,
              padding: 16, display: 'flex', alignItems: 'center', gap: 14, minHeight: 76,
            }}
          >
            <span style={{
              width: 48, height: 48, borderRadius: 24, flexShrink: 0, background: C.surface,
              color: C.pos, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icono nombre="ok" tamano={24} />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: C.ink }} data-testid="estado-asistencia">
                {cabeza.titulo}
              </span>
              <span style={{ display: 'block', fontSize: 13, color: C.muted, marginTop: 1 }}>
                {cabeza.detalle ?? 'sin marcas del día'}
              </span>
            </span>
          </div>
        )}
        {mensajes}
      </div>
    )
  }

  return (
    <div data-testid="bloque-asistencia">
      {/* ═══ LA TARJETA DE ESTADO DE M05 ═══
          Disco de 64 con su icono, el estado en 19/600 y el hecho que lo produjo debajo. Cuando la
          jornada está abierta, ENTRADA y TRABAJADO enfrentados sobre un hairline. */}
      <div
        data-testid="tarjeta-estado"
        data-estado={dia?.estado ?? 'sin_registrar'}
        style={{
          background: enObra ? C.posFondo : C.surface,
          border: `1px solid ${enObra ? C.posBorde : C.linea}`,
          borderRadius: R.tarjetaGrande, padding: 20, textAlign: 'center',
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: 32, margin: '0 auto',
          background: enObra ? C.pos : C.inerte, color: enObra ? C.surface : C.muted,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icono nombre={enObra ? 'ok' : 'dedo'} tamano={30} />
        </div>
        {/* EL TESTID HISTÓRICO VIAJA EN EL TÍTULO: en esta variante el estado ES el renglón grande
            del medio, y duplicarlo en un chip invisible dejaría un objeto que nadie puede ver. */}
        <div style={{ fontSize: 19, fontWeight: 600, color: C.ink, marginTop: 12 }} data-testid="estado-asistencia">
          {cabeza.titulo}
        </div>
        {/* SIN MARCA NO HAY RENGLÓN CON HORA: se dice qué hacer, y no una hora que nadie marcó. */}
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>
          {cabeza.detalle ?? 'la jornada empieza cuando marcás tu entrada'}
        </div>
        {(entrada || trabajado) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
            marginTop: 16, paddingTop: 14, borderTop: `1px solid ${enObra ? '#E2EFE8' : C.linea}`,
          }}>
            <div data-testid="dato-entrada">
              <div style={{ fontSize: 11, color: C.faint }}>ENTRADA</div>
              <div style={{ ...mono, fontSize: 17, fontWeight: 600, color: entrada ? C.ink : C.faint }}>
                {entrada ?? 'sin registrar'}
              </div>
            </div>
            <div data-testid="dato-trabajado">
              <div style={{ fontSize: 11, color: C.faint }}>TRABAJADO</div>
              {/* «TRABAJADO» EN CURSO NO ES UN NÚMERO. La regla del OS gana sobre el dibujo: un día
                  sin cerrar no publica total, y el elapsed desde la entrada se lee como jornada
                  trabajada sin serlo — nadie descontó el almuerzo. */}
              <div style={{ ...mono, fontSize: 17, fontWeight: 600, color: trabajado ? C.ink : C.faint }}>
                {trabajado ?? 'en curso'}
              </div>
            </div>
          </div>
        )}
      </div>

      {mensajes}

      {/* LA UBICACIÓN SE DICE ANTES DE APRETAR, y sólo en la entrada: es lo único que el botón hace
          además de registrar la marca. */}
      {!estado.error && !estado.mensaje && siguiente.tipo === 'entrada' && (
        <p style={{ marginTop: 8, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
          Al entrar se guarda desde dónde marcaste. Si el teléfono no puede ubicarte, se registra igual.
        </p>
      )}

      {/* EL BOTÓN GRANDE VA AL PIE Y SE QUEDA AHÍ. M05: «un estado grande, un botón grande». Con la
          semana debajo, una primaria al final del documento obliga a desplazar hasta el fondo para
          hacer lo único que la pantalla vino a hacer. */}
      {formulario && <PieFijo testid="pie-asistencia">{formulario}</PieFijo>}
    </div>
  )
}
