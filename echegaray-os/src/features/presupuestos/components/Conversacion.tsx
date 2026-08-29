'use client'

// 15 · LA CONVERSACIÓN — la interfaz principal del presupuesto (§19, §46).
//
// ═══ NO ESTÁ EN EL MOCKUP, Y ESO NO ES LICENCIA PARA REDISEÑAR ═══
//
// El handoff de la pantalla 15 no dibuja ningún panel de chat: se construye nuevo. Se usa el
// vocabulario YA MEDIDO del canon —la caja de tarjeta de `TARJETA`, los colores de `C`, el
// `BotonMarca` amarillo— en vez de inventar una paleta. Lo que no existía es la forma de la
// conversación; el aspecto sale de las mismas nueve pantallas que ya se portaron.
//
// ═══ ACÁ NO HAY NI UNA FRASE SOBRE EL PRESUPUESTO ═══
//
// Todo lo que este componente muestra —el título, el motivo, la pregunta, el cambio, el impacto—
// llega en `respuesta`, que arma `redactar()` en `orquestador/lib/cotizador/conversacion.mjs` con
// lo que devolvió `ejecutar()`. Una frase escrita acá («Listo, actualicé la mampostería») sería una
// afirmación sobre el presupuesto que ningún motor verificó, y se vería idéntica a una verdadera.
// El test `conversacion.test.mjs` cierra la puerta por el lado que importa: todo número que aparece
// en la respuesta tiene que existir en lo que produjo el motor.
//
// Lo único escrito acá son los EJEMPLOS de qué se puede pedir, y salen de `CANONICOS` —la misma
// lista que el test del intérprete recorre—, así que no se puede publicar un ejemplo que el sistema
// no entienda.

import { startTransition, useActionState, useRef } from 'react'
import { hablarConElPresupuesto } from '../services/actionsConversacion.ts'
import { TURNO_INICIAL, type RespuestaConversacion, type TurnoConversacion } from '../services/conversacionTipos.ts'
import { C, RADIO_TARJETA, TARJETA, millones } from '@/shared/components/canon'
import { CANONICOS } from '../../../../orquestador/lib/cotizador/interprete.mjs'

/** El color de cada tono. El tono lo decide `redactar()`; acá sólo se pinta. */
const TONO: Record<RespuestaConversacion['tono'], { color: string; fondo: string }> = {
  ok: { color: C.pos, fondo: '#ECFDF3' },
  aviso: { color: C.warn, fondo: '#FFFAEB' },
  no: { color: C.neg, fondo: '#FEF3F2' },
  pregunta: { color: C.info, fondo: '#EFF8FF' },
  dato: { color: C.tintaSuave, fondo: C.superficieTenue },
  'sin-permiso': { color: C.apagado, fondo: C.superficieTenue },
}

const EJEMPLOS: string[] = CANONICOS.map((c: { texto: string }) => c.texto)

export function Conversacion({ cotizacionId, puedeEscribir }: {
  cotizacionId: string
  /** Lo que el rol no puede, no se dibuja. El servidor lo re-valida igual: esto es comodidad. */
  puedeEscribir: boolean
}) {
  const [turno, enviar, pendiente] = useActionState<TurnoConversacion, FormData>(
    hablarConElPresupuesto, TURNO_INICIAL,
  )
  const campo = useRef<HTMLInputElement>(null)

  const mandar = (texto: string, confirmado = false) => {
    const d = new FormData()
    d.set('id', cotizacionId)
    d.set('texto', texto)
    d.set('confirmado', confirmado ? '1' : '0')
    startTransition(() => enviar(d))
  }

  return (
    <section style={{ ...TARJETA }} data-testid="conversacion">
      <header style={{
        background: C.superficieTenue, borderBottom: `1px solid ${C.lineaBloque}`,
        padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: C.tinta }}>Hablale al presupuesto</span>
        {turno.degradado && (
          // §34: DEGRADADO NO ES CAÍDO, y la diferencia se dice. Sin esto, una frase que el parser
          // no entiende y una caída del proveedor se ven exactamente iguales desde la pantalla.
          <span style={{ fontSize: 10.5, color: C.warn }} data-testid="conversacion-degradada">
            sin razonador: sólo las frases que el intérprete entiende
          </span>
        )}
      </header>

      <div style={{ padding: 14 }}>
        {turno.estado === 'inicial' && (
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
            {EJEMPLOS.map((e) => (
              <li key={e}>
                <button
                  type="button"
                  disabled={!puedeEscribir || pendiente}
                  onClick={() => mandar(e)}
                  data-testid="ejemplo-conversacion"
                  style={{
                    border: `1px solid ${C.linea}`, borderRadius: 999, background: C.superficie,
                    padding: '4px 10px', fontSize: 11.5, color: C.apagado, cursor: 'pointer',
                  }}
                >
                  {e}
                </button>
              </li>
            ))}
          </ul>
        )}

        {turno.estado !== 'inicial' && (
          <div data-testid="turno-conversacion">
            <p style={{ fontSize: 12.5, color: C.apagado, margin: '0 0 8px' }}>
              <span style={{ color: C.tenue }}>vos: </span>{turno.texto}
            </p>
            {turno.respuesta && <Respuesta r={turno.respuesta} onConfirmar={() => mandar(turno.texto, true)} pendiente={pendiente} />}
          </div>
        )}

        {puedeEscribir ? (
          <form
            // ═══ LA LIMPIEZA VA EN LA ACCIÓN, NUNCA EN `onSubmit` (QA visual, 29/08/2026) ═══
            //
            // Estaba `onSubmit={() => { campo.current.value = '' }}`. `onSubmit` corre ANTES de que
            // React arme el FormData, así que el servidor recibía `texto=''` SIEMPRE. Los chips de
            // ejemplo funcionaban porque llaman `mandar()` con el texto en la mano, y por eso ningún
            // test lo vio: probaban el único camino que no estaba roto.
            //
            // Acá adentro el FormData YA ESTÁ CAPTURADO —llega como argumento—, así que tocar el
            // input no puede afectarlo. Medido con la mutación inversa: mover la limpieza antes del
            // `enviar()` deja el E2E en verde; volver a `onSubmit` lo pone rojo. Lo que importa es
            // DÓNDE, no en qué orden dentro de acá.
            action={(datos: FormData) => {
              enviar(datos)
              // EL FOCO VUELVE AL CAMPO (QA visual: `document.activeElement === input` daba
              // false): una conversación se escribe seguido, y si después de cada frase hay que
              // volver a hacer clic en el input, deja de ser una conversación y pasa a ser un
              // formulario. Devolverlo acá es NECESARIO y no suficiente — ver el `disabled` del
              // input, que es lo que se lo llevaba puesto.
              if (campo.current) {
                campo.current.value = ''
                campo.current.focus()
              }
            }}
            style={{ display: 'flex', gap: 8, marginTop: 12 }}
          >
            <input type="hidden" name="id" value={cotizacionId} />
            <input type="hidden" name="confirmado" value="0" />
            <input
              // ═══ EL INPUT NO SE DESHABILITA MIENTRAS SE PROCESA (E2E, 29/08/2026) ═══
              //
              // Llevaba `disabled={pendiente}`, y ahí estaba la razón REAL de que el foco no
              // volviera: deshabilitar un elemento enfocado se lo quita el navegador, así que el
              // `focus()` de la acción se perdía en cuanto React repintaba con `pendiente` en true.
              // El arreglo anterior —llamar a `focus()` después de despachar— era necesario y no
              // suficiente, y sólo lo destapó el recorrido que TIPEA en un navegador de verdad.
              //
              // Deshabilitarlo tampoco protegía nada: el doble envío lo frena el botón, que sí
              // sigue deshabilitado. Lo único que hacía era romper el hilo de la conversación.
              ref={campo} name="texto" autoComplete="off"
              placeholder="la mampostería son 520 m2 · ¿qué me falta para enviar?"
              data-testid="entrada-conversacion"
              style={{
                flex: 1, minWidth: 0, border: `1px solid ${C.linea}`, borderRadius: RADIO_TARJETA,
                padding: '8px 11px', fontSize: 12.5, color: C.tinta, background: C.superficie,
              }}
            />
            <button
              type="submit" disabled={pendiente} data-testid="enviar-conversacion"
              style={{
                border: 'none', borderRadius: RADIO_TARJETA, background: C.marca, color: C.grafito,
                padding: '8px 14px', fontSize: 12.5, fontWeight: 500, cursor: pendiente ? 'wait' : 'pointer',
              }}
            >
              {pendiente ? '…' : 'Enviar'}
            </button>
          </form>
        ) : (
          // LO QUE EL ROL NO PUEDE, NO SE DIBUJA. Y se dice por qué: un campo desactivado sin motivo
          // manda a preguntar; esto contesta la pregunta antes de que se haga.
          <p style={{ fontSize: 11.5, color: C.tenue, marginTop: 12 }} data-testid="conversacion-solo-lectura">
            Este presupuesto ya está congelado o tu rol no puede modificarlo: podés leerlo, no cambiarlo.
          </p>
        )}
      </div>
    </section>
  )
}

/** La respuesta del motor, dibujada. Ni un texto propio sobre el presupuesto. */
function Respuesta({ r, onConfirmar, pendiente }: {
  r: RespuestaConversacion
  onConfirmar: () => void
  pendiente: boolean
}) {
  const t = TONO[r.tono] ?? TONO.dato
  return (
    <div
      data-testid="respuesta-conversacion" data-tono={r.tono}
      style={{ background: t.fondo, border: `1px solid ${C.lineaBloque}`, borderRadius: RADIO_TARJETA, padding: '10px 12px' }}
    >
      {r.titulo && <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: t.color }}>{r.titulo}</p>}

      {r.lineas.map((l) => (
        <p key={l} style={{ margin: '4px 0 0', fontSize: 12, color: C.tintaSuave, lineHeight: 1.45 }}>{l}</p>
      ))}

      {r.cambios.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }} data-testid="cambios-conversacion">
          {r.cambios.map((c) => (
            <li key={`${c.que}-${c.campo}`} style={{ fontSize: 12, color: C.tinta, fontVariantNumeric: 'tabular-nums' }}>
              {c.que} · {c.campo}: <span style={{ color: C.tenue }}>{String(c.antes ?? 'sin dato')}</span> → <strong>{String(c.despues)}</strong>
            </li>
          ))}
        </ul>
      )}

      {/* EL RECÁLCULO VISIBLE. `impacto === null` no se dibuja como cero: no se dibuja. */}
      {r.impacto && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: C.tintaSuave, fontVariantNumeric: 'tabular-nums' }} data-testid="impacto-conversacion">
          Precio de venta: {millones(r.impacto.antes) ?? '—'} → <strong>{millones(r.impacto.despues) ?? '—'}</strong>
          {' '}({r.impacto.delta >= 0 ? '+' : ''}{millones(r.impacto.delta) ?? '—'})
        </p>
      )}

      {r.datos !== undefined && r.datos !== null && (
        <Datos datos={r.datos} />
      )}

      {r.opciones && r.opciones.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12, color: C.tintaSuave }} data-testid="opciones-conversacion">
          {r.opciones.map((o) => <li key={o}>{o}</li>)}
        </ul>
      )}

      {r.pregunta && (
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: t.color }} data-testid="pregunta-conversacion">{r.pregunta}</p>
      )}

      {/* El «sí, aplicalo igual» del outlier engine (§20). Sólo aparece cuando el motor PREGUNTÓ:
          un botón de confirmar siempre visible convertiría la advertencia en un trámite. */}
      {r.tono === 'pregunta' && r.pregunta?.includes('¿Lo aplico igual?') && (
        <button
          type="button" onClick={onConfirmar} disabled={pendiente} data-testid="confirmar-outlier"
          style={{
            marginTop: 8, border: `1px solid ${C.linea}`, borderRadius: RADIO_TARJETA,
            background: C.superficie, padding: '5px 11px', fontSize: 12, cursor: 'pointer', color: C.tinta,
          }}
        >
          Aplicalo igual
        </button>
      )}
    </div>
  )
}

/** Lo que devolvió una consulta. Se muestra como vino: acá no se resume ni se interpreta. */
function Datos({ datos }: { datos: unknown }) {
  const d = datos as { faltan?: { que: string; porQue: string; cuantoPesa: number | null; accion: string | null }[] }
  if (Array.isArray(d?.faltan)) {
    if (d.faltan.length === 0) {
      return <p style={{ margin: '6px 0 0', fontSize: 12, color: C.pos }}>No queda nada bloqueando el envío.</p>
    }
    return (
      <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }} data-testid="bloqueos-conversacion">
        {d.faltan.map((f) => (
          <li key={f.que} style={{ fontSize: 12, color: C.tintaSuave, marginTop: 3 }}>
            <strong style={{ color: C.tinta }}>{f.que}</strong> — {f.porQue}
            {/* `cuantoPesa === null` es «no se midió», y se dice así. Un $0 diría que no cuesta nada. */}
            {' · '}<span style={{ color: C.tenue }}>{f.cuantoPesa === null ? 'sin medir' : millones(f.cuantoPesa)}</span>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <pre style={{ margin: '8px 0 0', fontSize: 11.5, color: C.apagado, whiteSpace: 'pre-wrap' }} data-testid="datos-conversacion">
      {JSON.stringify(datos, null, 2)}
    </pre>
  )
}
