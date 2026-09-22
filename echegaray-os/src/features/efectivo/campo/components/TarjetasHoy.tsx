import Link from 'next/link'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { mono } from '@/shared/components/movil/Piezas'
import { conVuelta, destino, pesos, textoYaTenes, type TarjetaHoy } from '../logica'
import { NoCoincide } from './NoCoincide'
import { Caja, CifraGrande, Primario, Renglon, Rotulo } from './Piezas'

// LO QUE EL EFECTIVO PONE EN «HOY» — como mucho una tarjeta (la decide `tarjetaDeHoy`).
//
// No hay barra nueva: el teléfono ya tiene sus dos armazones y el efectivo entra por la pantalla que
// la persona abre igual todos los días.

/** El destino de las pantallas del módulo, con la vuelta pegada (el jefe vuelve a `/obra/efectivo`). */
function rutas(sufijo: string) {
  const base = '/mi-informacion/efectivo'
  return { firmar: (id: string) => conVuelta(`${base}/firmar/${id}`, sufijo), mi: base }
}

/**
 * M01 · RECIBIR EL EFECTIVO — la entrega sin conformidad, con borde amarillo.
 *
 * «Rendís antes de» NO está: el dueño decidió el 22/09 que no hay plazo de rendición.
 */
export function TarjetaRecibir({ t, sufijo = '' }: { t: Extract<TarjetaHoy, { tipo: 'recibir' }>; sufijo?: string }) {
  const e = t.entrega
  const quien = e.entregada_por_nombre ?? 'Administración'
  const ya = textoYaTenes(t)
  return (
    <div data-testid="efectivo-recibir" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Caja borde={C.marca}>
        <Rotulo>Te entregan efectivo</Rotulo>
        <CifraGrande testid="efectivo-recibir-monto">{pesos(e.entregado)}</CifraGrande>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Renglon rotulo="Para" valor={destino(e)} />
          <Renglon rotulo="De" valor={quien} />
        </div>
        {e.para_que && (
          <div style={{ fontSize: 13, color: C.inkSuave, lineHeight: 1.5, paddingTop: 12, borderTop: `1px solid ${C.divisorSuave}` }}>
            {e.para_que}
          </div>
        )}
      </Caja>
      {ya && (
        <Caja gap={8} relleno="16px 18px" testid="efectivo-ya-tenes">
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{ya.titulo}</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{ya.detalle}</div>
        </Caja>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Primario href={rutas(sufijo).firmar(e.id)} alto={52} testid="efectivo-firmar">Recibí conforme · firmar</Primario>
        <NoCoincide quien={quien} />
      </div>
    </div>
  )
}

/** El acceso a «Mi efectivo» cuando no hay nada para firmar: cuánto tengo y si me piden algo. */
export function TarjetaMiEfectivo({ t, href }: { t: Extract<TarjetaHoy, { tipo: 'mi-efectivo' }>; href: string }) {
  const negativo = t.tengoQueRendir < 0
  return (
    <Link
      href={href}
      prefetch={false}
      data-testid="efectivo-mi-efectivo"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, background: C.surface,
        border: `1px solid ${t.piden ? C.warnBorde : C.linea}`, borderRadius: R.tarjeta, color: C.ink,
      }}
    >
      <span style={{ display: 'flex', color: t.piden ? C.warn : C.muted, flexShrink: 0 }}><Icono nombre="recibo" tamano={20} /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>Mi efectivo</span>
        <span style={{ display: 'block', fontSize: 12.5, color: t.piden ? C.warn : C.muted, marginTop: 1 }}>
          {t.piden ? `Te piden ${t.piden === 1 ? 'un dato' : `${t.piden} datos`}` : negativo ? 'Rendiste de más' : 'Tengo que rendir'}
        </span>
      </span>
      <span style={{ ...mono, fontSize: 15, fontWeight: 600 }}>{pesos(Math.abs(t.tengoQueRendir))}</span>
      <span style={{ display: 'flex', color: C.tenue }}><Icono nombre="siguiente" tamano={18} /></span>
    </Link>
  )
}

/** El vacío de M12, con su texto. La versalita «Vacío» del mockup rotula el catálogo, no la pantalla. */
/**
 * `esperandoFirma`: hay una entrega abierta que la persona todavía no firmó. Decir «no tenés efectivo» ahí
 * es falso —la entrega está a la vista en «Mi efectivo»— y deja a la persona sin saber qué le falta hacer
 * (QA de las pantallas de teléfono, 22/09/2026).
 */
export function SinEfectivo({ esperandoFirma = false }: { esperandoFirma?: boolean } = {}) {
  return (
    <Caja gap={9} relleno="16px 18px" testid="efectivo-vacio">
      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>
        {esperandoFirma ? 'Falta que firmes la conformidad' : 'No tenés efectivo de la empresa'}
      </div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
        {esperandoFirma
          ? 'En «Mi efectivo» tenés la entrega esperando tu firma. Cuando firmes, podés rendir y devolver.'
          : 'Cuando te entreguen, aparece acá.'}
      </div>
    </Caja>
  )
}
