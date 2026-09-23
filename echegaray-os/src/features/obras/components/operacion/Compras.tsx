// 12 · M15 — COMPRAS: el costo imputado a la obra contra el detalle listado.
//
// Escritorio (12): cuatro cifras de 28px —Costo imputado · El detalle listado suma · Mano de obra
// adentro · Sin imputar en toda la empresa— con `gap 76`, la grilla Fecha · Proveedor · Concepto ·
// Comprobante · Total · Papel en filas de 54, y el pie con las tres frases del diseño. Teléfono (M15):
// dos cifras de 24 en grilla de 2, filas de 60 y el pie «5 de 214 · mano de obra va a estructura».
//
// EL TOTAL NO SE SUMA ACÁ: sale de `obra_costo_real`. Lo único que esta pantalla calcula es si el
// detalle llega a ese número. «Papel» no tiene fuente atada a `costos_obra` (los adjuntos cuelgan de
// `compra_sheet.clave`, que la fila del espejo no trae): se dibuja «—», nunca un papel inventado.
//
// Sin `'use client'`: no hay estado.

import { Ico, P } from '../canon/Ico'
import { C, MONO } from '../canon/tokens'
import type { ComprasObra } from '../../services/operacionService'
import {
  bajadaManoDeObra, cifraM, coberturaDelDetalle, diaMes, pieDeComprasTelefono,
} from '../../services/operacionCanon'
import { COLOR_TONO, Celda, DerechaM, EYEBROW, Falta, FilaM, GridCab, GridFila, PieM } from './piezas'

const COLS = '94px minmax(0,1fr) minmax(0,1.3fr) 128px 122px 56px'

export function Compras({ compras }: { compras: ComprasObra }) {
  const sumaDetalle = compras.filas.reduce((acc, f) => acc + (f.total ?? 0), 0)
  const cobertura = coberturaDelDetalle({ total: compras.total, sumaDetalle })
  const mo = bajadaManoDeObra(compras.manoDeObra)
  const vacio = compras.filas.length === 0 && (
    <div style={{ padding: '18px 0', fontSize: '13px', color: C.tenue }} data-testid="compras-vacio">
      {compras.total == null ? 'Todavía no hay ninguna compra imputada a esta obra.' : `Esta obra tiene ${cifraM(compras.total)} imputados y el detalle no lista ninguna fila.`}
    </div>
  )

  const cifra = (rotulo: string, valor: string, color: string, bajada?: { texto: string; color: string }, testid?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }} data-testid={testid}>
      <div style={EYEBROW}>{rotulo}</div>
      <div style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-.02em', color, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {bajada && <div style={{ fontSize: '12.5px', color: bajada.color }}>{bajada.texto}</div>}
    </div>
  )

  return (
    <>
      {/* ═══ ESCRITORIO (12) ═══ */}
      <div className="hidden md:flex" style={{ flexDirection: 'column', gap: '26px' }} data-testid="compras-escritorio">
        <div style={{ display: 'flex', gap: '76px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {cifra('Costo imputado a esta obra', cifraM(compras.total), C.tinta, undefined, 'cifra-imputado')}
          {cifra('El detalle listado suma', cifraM(sumaDetalle), C.tinta, { texto: cobertura.texto, color: COLOR_TONO[cobertura.tono] }, 'cifra-detalle')}
          {cifra('Mano de obra adentro', cifraM(compras.manoDeObra), compras.manoDeObra === 0 ? C.warn : C.tinta, { texto: mo.texto, color: C.tintaSuave }, 'cifra-mano-de-obra')}
          {cifra('Sin imputar en toda la empresa', cifraM(compras.sinImputarEmpresa), compras.sinImputarEmpresa ? C.neg : C.tinta,
            { texto: compras.imputadoEmpresa == null ? 'imputado a obras sin dato' : `contra ${cifraM(compras.imputadoEmpresa)} imputados a obras`, color: C.tintaSuave }, 'cifra-sin-imputar')}
        </div>

        <div style={{ overflowX: 'auto' }}><div style={{ display: 'flex', flexDirection: 'column', minWidth: '900px' }} data-testid="tabla-compras">
          <GridCab columnas={COLS} celdas={[{ t: 'Fecha' }, { t: 'Proveedor' }, { t: 'Concepto' }, { t: 'Comprobante' }, { t: 'Total', der: true }, { t: 'Papel', der: true }]} />
          {vacio}
          {compras.filas.map((c, i) => (
            <GridFila key={c.id} columnas={COLS} alto={54} ultima={i === compras.filas.length - 1} sangria={0} testid={`compra-${c.id}`}>
              <Celda tono="suave">{diaMes(c.fecha) ?? <Falta>sin fecha</Falta>}</Celda>
              <Celda tono={c.proveedor ? 'tinta' : 'warn'}>{c.proveedor ?? 'SIN NOMBRE RESUELTO'}</Celda>
              <Celda tono="media">{c.concepto ?? <Falta>sin concepto</Falta>}</Celda>
              <Celda tono={c.comprobante ? 'media' : 'tenue'} sub mono>{c.comprobante ?? 'sin comprobante'}</Celda>
              <Celda der>{c.total == null ? <Falta>sin total</Falta> : cifraM(c.total)}</Celda>
              <Celda tono="tenue" sub der>—</Celda>
            </GridFila>
          ))}
        </div></div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '32px', fontSize: '12.5px', color: C.tintaSuave, flexWrap: 'wrap' }} data-testid="pie-compras">
          <span>Se muestran {compras.filas.length} de {compras.nComprobantes ?? 'sin conteo'}.</span>
          <span>
            La fila viene del espejo de la pestaña Compras del Sheet y la obra es su columna «Obra»
            (<span style={{ fontFamily: MONO, fontSize: '12px' }}>costos_obra.obra_id</span>, desde el 15/09) — ya no se resuelve por alias, que decía el cliente.
          </span>
          <span><b style={{ fontWeight: 600, color: C.tinta }}>El total no se suma acá</b>: sale de la vista, y esta pantalla sólo controla que el detalle llegue a ese número.</span>
        </div>
      </div>

      {/* ═══ TELÉFONO (M15) ═══ */}
      <div className="flex md:hidden" style={{ flexDirection: 'column', gap: '14px' }} data-testid="compras-telefono">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={EYEBROW}>Imputado</div>
            <div style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '-.02em', color: C.tinta, fontVariantNumeric: 'tabular-nums' }}>{cifraM(compras.total)}</div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>{compras.nComprobantes == null ? 'sin comprobantes contados' : `${compras.nComprobantes} comprobantes`}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={EYEBROW}>Detalle cubre el total</div>
            <div style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '-.02em', color: COLOR_TONO[cobertura.tono] }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {cobertura.cubre ? <><Ico d={P.ok} s={20} />sí</> : compras.total == null ? 'sin total' : 'no'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>el total sale de la vista</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {vacio}
          {compras.filas.map((c, i) => (
            <FilaM key={c.id} icono={<Ico d={P.compra} s={15} />} titulo={c.proveedor ?? <span style={{ color: C.warn }}>SIN NOMBRE RESUELTO</span>}
              sub={<>{c.concepto ?? <Falta>sin concepto</Falta>}{!c.comprobante && <> · <Falta>sin comprobante</Falta></>}</>}
              derecha={<>
                <span style={{ fontFamily: MONO, fontSize: '13.5px', color: C.tinta }}>{c.total == null ? '—' : cifraM(c.total)}</span>
                <DerechaM fecha={diaMes(c.fecha) ?? 'sin fecha'} />
              </>}
              ultima={i === compras.filas.length - 1} testid={`compra-telefono-${c.id}`} />
          ))}
        </div>
        <PieM testid="pie-compras-telefono">{pieDeComprasTelefono(compras.filas.length, compras)}</PieM>
      </div>
    </>
  )
}
