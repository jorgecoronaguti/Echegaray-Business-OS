'use client'

// LOS PAPELES DE UN PROVEEDOR, EN SU PANEL — pedido del dueño, 06/09/2026:
// «que el panel de proveedores tenga guardadas las facturas o la imagen del comprobante que
// corresponden a cada proveedor, así como lo hacemos con Compras».
//
// ═══ ESTO ERA «SIN FUENTE» Y DEJÓ DE SERLO ═══
//
// El canvas de la cartera y esta misma ficha declaraban que PAPELES no se podía dibujar porque
// «ninguna tabla vincula un archivo con un proveedor». Era cierto cuando se escribió: el vínculo no
// hay que inventarlo, se DERIVA — el archivo cuelga de la compra y la compra trae el proveedor. La
// vista `proveedor_papel` lo publica. Una limitación declarada que nadie vuelve a medir es una
// mentira con fecha de vencimiento.
//
// ═══ POR QUÉ ACÁ NO HAY MINIATURA Y EN EL PANEL DE UNA COMPRA SÍ ═══
//
// `PanelCompraSheet` dibuja la foto de la factura porque es UNA compra: uno o dos papeles, una
// firma cada uno, una sola vez. Un proveedor tiene quince (Combustibles Barcelo, medido 06/09/2026)
// y el bucket es privado: previsualizarlos serían quince URLs firmadas apenas se abre el panel,
// pedidas por adelantado para papeles que quizá nadie mire. Acá se firma UNA por clic. La regla no
// cambió —el bucket sigue siendo privado— cambió cuántos papeles hay en pantalla.
//
// El archivo se abre en pestaña nueva porque es un archivo, no una pantalla: mismo gesto que en
// Compras.
//
// ═══ CERO PROSA (decisión del dueño, 09/09/2026) ═══
//
// Este bloque tenía dos párrafos: de dónde salen los papeles y por qué un proveedor con compras
// puede no tener ninguno. Los sacó el dueño: en un panel de 344px la explicación empuja el dato
// fuera de la pantalla y se lee una vez en la vida. LO QUE NO SE FUE ES LA DISTINCIÓN: «no pude
// leerlos» y «sin papeles» siguen siendo dos estados, porque un vacío por error de lectura afirma
// sobre el respaldo de la empresa algo que nadie miró. Se dicen en una línea, no en un párrafo.

import { useState } from 'react'
import { urlDelAdjunto } from '../../services/comprasAdjuntoActions'
import { claseDeArchivo, comoSeVinculo, type EstadoPapeles } from '../../services/papelesProveedor'
import { IconoDocumento, IconoFoto } from '@/shared/components/iconos'
import { fechaCortaConAnio, pesos } from '@/shared/components/canon/formato'
import { RotuloPanel, V } from '@/shared/components/v2/patron'
import type { PapelProveedor } from '../../types'

/** Lo que dice el bloque cuando no hay ningún papel. Una línea cada una, y siguen siendo tres. */
const SIN_PAPELES: Record<string, string> = {
  'sin-compras': 'sin compras',
  'sin-archivo': 'sin papeles',
  'no-se-sabe': 'sin papeles',
}

export function PapelesDelProveedor({ estado }: { estado: EstadoPapeles }) {
  return (
    <div style={{ marginTop: 20 }} data-testid="papeles-proveedor">
      <RotuloPanel cuenta={estado.clase === 'papeles' ? estado.total : undefined}>Papeles</RotuloPanel>

      {estado.clase === 'sin-leer' && (
        // NI UN CERO NI UN GUIÓN donde la verdad es «no lo pude leer»: un vacío se lee como «no
        // tiene», y eso es una afirmación sobre el respaldo de la empresa que esta lectura no
        // habilita.
        <p style={{ fontSize: '12px', color: V.warn, padding: '7px 0' }} data-testid="papeles-sin-leer">
          no pude leerlos
        </p>
      )}

      {estado.clase === 'ninguno' && (
        <p style={{ fontSize: '12px', color: V.tenue, padding: '7px 0' }} data-testid="sin-papeles-proveedor">
          {SIN_PAPELES[estado.porque]}
        </p>
      )}

      {estado.clase === 'papeles' && (
        <>
          <div data-testid="lista-papeles">
            {estado.papeles.map((p) => <FilaPapel key={p.adjunto_id} p={p} />)}
          </div>
          {estado.mostrados < estado.total && (
            <p style={{ fontSize: '11px', color: V.tenue, marginTop: 8 }} data-testid="papeles-truncados">
              Se ven los {estado.mostrados} más recientes de {estado.total}.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * UN PAPEL Y LA COMPRA DE LA QUE VIENE.
 *
 * Las dos líneas dicen cosas distintas y las dos hacen falta: arriba de QUÉ COMPRA es —fecha,
 * comprobante e importe, que es como se lo busca—, abajo QUÉ ARCHIVO es y CÓMO SE SUPO que era de
 * esa compra. Sin lo segundo, un match por número equivocado se vería idéntico a un papel que el
 * bot cargó él mismo.
 */
function FilaPapel({ p }: { p: PapelProveedor }) {
  const [error, setError] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const tipo = claseDeArchivo(p.media_type)

  async function abrir() {
    setError(null)
    setAbriendo(true)
    const r = await urlDelAdjunto(p.adjunto_id)
    setAbriendo(false)
    if (!r.ok) { setError(r.error); return }
    // `window.open` devuelve `null` cuando el navegador bloquea la pestaña —el clic ya no cuenta
    // como gesto directo después del `await`—. Sin esta guarda el papel «no pasa nada» y quien mira
    // no sabe si el archivo se perdió o si fue el navegador.
    const w = window.open(r.dato, '_blank', 'noopener')
    if (!w) setError('El navegador bloqueó la pestaña. Permitilas para este sitio.')
  }

  return (
    <div
      data-testid={`papel-proveedor-${p.adjunto_id}`}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: `1px solid ${V.lineaPanel}` }}
    >
      <span style={{ display: 'flex', color: V.inerte, flexShrink: 0, paddingTop: 2 }} title={tipo}>
        {tipo === 'foto' ? <IconoFoto className="h-[14px] w-[14px]" /> : <IconoDocumento className="h-[14px] w-[14px]" />}
      </span>

      <button
        type="button"
        onClick={abrir}
        title={`Abrir ${p.nombre}`}
        className="cursor-pointer text-left"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, padding: 0 }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.apagado, flexShrink: 0 }}>
            {/* SIN FECHA NO ES HOY, y tampoco un guión mudo: la compra existe y le falta el dato. */}
            {fechaCortaConAnio(p.compra_fecha) ?? 'sin fecha'}
          </span>
          <span className="truncate" style={{ fontSize: '12px', color: V.tinta, minWidth: 0 }}>
            {p.comprobante ?? 'sin número'}
          </span>
          <span className="font-mono tabular-nums" style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.tinta, flexShrink: 0 }}>
            {/* NULL es «sin importe cargado», no $ 0. */}
            {pesos(p.total) ?? 'sin importe'}
          </span>
        </span>
        <span className="truncate" style={{ display: 'block', fontSize: '10.5px', color: V.tenue, marginTop: 2 }}>
          {p.nombre} · {comoSeVinculo(p.vinculado_por)}
        </span>
        {abriendo && <span style={{ display: 'block', fontSize: '10.5px', color: V.tenue, marginTop: 2 }}>abriendo…</span>}
        {error && (
          <span style={{ display: 'block', fontSize: '10.5px', color: V.warn, marginTop: 2 }} data-testid="papel-error">
            {error}
          </span>
        )}
      </button>
    </div>
  )
}
