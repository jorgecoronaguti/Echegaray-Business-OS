'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import type { CuadroDeLiquidacion } from '../../services/liquidacionCuadros'
import type { LineaLiquidada, TotalesDeCuadro } from '../../services/liquidacionQuincena'
import { cerrarQuincena, guardarEfectivoRedondeado } from '../../services/liquidacionActions'

// UN CUADRO DE LA LIQUIDACIÓN. Las mismas ocho columnas en los tres.
//
// ═══ LA ÚNICA CELDA EDITABLE ES «EFECTIVO redondeado» ═══
//
// Es la columna DEL DUEÑO: los billetes redondos que entrega en mano. No se calcula de nada y no se
// pisa nunca. Guarda al salir del campo, sin recargar la página — igual que la grilla de asistencia.
// El GRANT de UPDATE de la base está acotado a esa columna: aunque alguien llame a PostgREST a mano,
// no puede reescribir COBRA ni TOTAL.
//
// ═══ «SIN TARIFA» NO ES $ 0 ═══
//
// Una fila sin $/hora cargado muestra «sin tarifa» y deja COBRA en blanco. Un cero ahí liquidaría a
// alguien en nada con la misma cara con la que muestra un importe correcto, y la plata se entrega en
// mano: nadie la reclama después.

const COLUMNAS = [
  'Persona', 'Horas', '$/h', 'COBRA', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO', 'EN EFECTIVO',
  'TOTAL A PAGAR', 'EFECTIVO redondeado',
] as const

const pesos = (n: number | null): string =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

const numero = (n: number | null): string =>
  n == null ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })

export function CuadroLiquidacion({ cuadro, totales, quincena, estado, cerradaEn, puedeCerrar }: {
  cuadro: CuadroDeLiquidacion
  totales: TotalesDeCuadro
  quincena: { desde: string; hasta: string }
  estado: 'abierta' | 'cerrada'
  cerradaEn: string | null
  puedeCerrar: boolean
}) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [cerrando, empezar] = useTransition()
  if (cuadro.lineas.length === 0) return null

  const congelables = cuadro.lineas.filter((l) => l.cobra != null && l.enEfectivo != null)

  const cerrar = () => empezar(async () => {
    const r = await cerrarQuincena({
      ...quincena,
      grupo: cuadro.grupo,
      lineas: congelables.map((l) => ({
        persona_id: l.personaId,
        horas: l.horas,
        valor_hora: l.valorHora,
        cobra: l.cobra as number,
        adelanto: l.adelanto,
        ya_transferido: l.yaTransferido,
        por_banco: l.porBanco,
        en_efectivo: l.enEfectivo as number,
        total: l.total as number,
      })),
    })
    setAviso(r.ok ? r.mensaje : r.error)
  })

  return (
    <section data-testid={`cuadro-${cuadro.grupo}`} style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, margin: 0 }}>{cuadro.titulo}</h3>
        <span style={{ fontSize: '11.5px', color: V.tenue }}>
          {cuadro.lineas.length} persona{cuadro.lineas.length === 1 ? '' : 's'}
          {totales.sinTarifa > 0 && ` · ${totales.sinTarifa} sin tarifa`}
          {totales.reciboSinGiro > 0 && ` · ${totales.reciboSinGiro} con recibo sin giro`}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {estado === 'cerrada' ? (
            <span data-testid={`cerrada-${cuadro.grupo}`} style={{ fontSize: '11.5px', color: V.apagado }}>
              Cerrada{cerradaEn ? ` el ${cerradaEn.slice(0, 10)}` : ''}
            </span>
          ) : puedeCerrar && congelables.length > 0 && (
            <button
              type="button"
              onClick={cerrar}
              disabled={cerrando}
              data-testid={`cerrar-${cuadro.grupo}`}
              style={{
                background: V.marca, color: V.grafito, border: 'none', borderRadius: 4,
                padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {cerrando ? 'Cerrando…' : 'Cerrar quincena'}
            </button>
          )}
        </span>
      </div>

      {aviso && (
        <p data-testid={`aviso-${cuadro.grupo}`} style={{ fontSize: '12px', color: V.apagado, margin: '0 0 8px' }}>
          {aviso}
        </p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            {COLUMNAS.map((c, i) => (
              <th key={c} style={{
                textAlign: i === 0 ? 'left' : 'right',
                fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', color: V.tenue,
                borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 6px', whiteSpace: 'nowrap',
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cuadro.lineas.map((l) => (
            <Fila key={l.personaId} linea={l} quincena={quincena} grupo={cuadro.grupo} bloqueada={estado === 'cerrada'} />
          ))}
          <tr data-testid={`total-${cuadro.grupo}`}>
            <Celda izquierda fuerte>⇒ {cuadro.lineas.length} persona(s)</Celda>
            <Celda fuerte>{numero(totales.horas)}</Celda>
            <Celda />
            <Celda fuerte>{pesos(totales.cobra)}</Celda>
            <Celda fuerte>{pesos(totales.adelanto)}</Celda>
            <Celda fuerte>{pesos(totales.yaTransferido)}</Celda>
            <Celda fuerte>{pesos(totales.porBanco)}</Celda>
            <Celda fuerte>{pesos(totales.enEfectivo)}</Celda>
            <Celda fuerte>{pesos(totales.total)}</Celda>
            <Celda />
          </tr>
        </tbody>
      </table>

      {cuadro.presentesSinHoras > 0 && (
        <p data-testid={`presentes-sin-horas-${cuadro.grupo}`}
          style={{ fontSize: '11px', color: V.warn, margin: '6px 0 0' }}>
          {cuadro.presentesSinHoras} día(s) declarados presentes sin horas cargadas: valen 0.
        </p>
      )}
    </section>
  )
}

function Fila({ linea, quincena, grupo, bloqueada }: {
  linea: LineaLiquidada
  quincena: { desde: string; hasta: string }
  grupo: string
  bloqueada: boolean
}) {
  return (
    <tr data-testid="fila-liquidacion" style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
      <Celda izquierda>
        {linea.nombre}
        {linea.sinTarifa && (
          <span data-testid="sin-tarifa" style={{ marginLeft: 8, fontSize: '11px', color: V.warn }}>
            sin tarifa
          </span>
        )}
        {linea.reciboSinGiro && (
          <span data-testid="recibo-sin-giro" style={{ marginLeft: 8, fontSize: '11px', color: V.warn }}>
            recibo sin giro
          </span>
        )}
      </Celda>
      <Celda>{numero(linea.horas)}</Celda>
      <Celda title={linea.origenTarifa ?? undefined}>{pesos(linea.valorHora)}</Celda>
      <Celda>{pesos(linea.cobra)}</Celda>
      <Celda>{pesos(linea.adelanto)}</Celda>
      <Celda>{pesos(linea.yaTransferido)}</Celda>
      <Celda>{pesos(linea.porBanco)}</Celda>
      <Celda>{pesos(linea.enEfectivo)}</Celda>
      <Celda>{pesos(linea.total)}</Celda>
      <Celda>
        <Redondeo
          personaId={linea.personaId}
          valor={linea.efectivoRedondeado}
          quincena={quincena}
          grupo={grupo}
          bloqueada={bloqueada}
        />
      </Celda>
    </tr>
  )
}

/**
 * LA CELDA DEL DUEÑO. Guarda al perder el foco y no recarga la pantalla.
 *
 * VACÍO BORRA EL REDONDEO, NO ESCRIBE CERO: cero significaría «no le doy nada en mano», que es una
 * afirmación distinta de «todavía no lo escribí».
 */
function Redondeo({ personaId, valor, quincena, grupo, bloqueada }: {
  personaId: string
  valor: number | null
  quincena: { desde: string; hasta: string }
  grupo: string
  bloqueada: boolean
}) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor))
  const [error, setError] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()

  if (bloqueada) return <>{pesos(valor)}</>

  const guardar = () => {
    const limpio = texto.trim().replace(/[$.\s]/g, '').replace(',', '.')
    if (limpio === (valor == null ? '' : String(valor))) return
    empezar(async () => {
      const r = await guardarEfectivoRedondeado({
        ...quincena, grupo, persona_id: personaId, importe: limpio,
      })
      setError(r.ok ? null : r.error)
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        disabled={guardando}
        inputMode="decimal"
        aria-label="Efectivo redondeado"
        data-testid={`redondeo-${personaId}`}
        style={{
          width: 96, textAlign: 'right', fontSize: '12.5px', padding: '3px 6px',
          border: `1px solid ${error ? V.neg : V.linea}`, borderRadius: 4,
          background: '#FFFFFF', color: V.tinta, fontVariantNumeric: 'tabular-nums',
        }}
      />
      {error && <span style={{ fontSize: '10.5px', color: V.neg }}>{error}</span>}
    </span>
  )
}

function Celda({ children, izquierda = false, fuerte = false, title }: {
  children?: React.ReactNode; izquierda?: boolean; fuerte?: boolean; title?: string
}) {
  return (
    <td title={title} style={{
      textAlign: izquierda ? 'left' : 'right',
      fontSize: '12.5px',
      fontWeight: fuerte ? 600 : 400,
      color: fuerte ? V.tinta : V.tintaSuave,
      padding: '9px 8px',
      whiteSpace: 'nowrap',
    }}>{children}</td>
  )
}
