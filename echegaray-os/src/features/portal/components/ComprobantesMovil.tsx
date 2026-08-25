'use client'

import { useState } from 'react'
import { diaMes } from '@/shared/components/canon'
import type { CertificadoPortal, DocumentoPortal } from '../types'
import { estadoEnPantalla } from '../reglas/estado'
import { soloFecha } from '../reglas/aPagar'
import { P } from '../estilos'
import { millonesPortal } from '../formato'
import { VacioPortal } from './piezas'
import { IcoArchivo, IcoArchivoOk, IcoDescargar, IcoParaAprobar } from './iconos'

// «COMPROBANTES» EN EL TELÉFONO — `30`, líneas 246–344.
//
// Chips arriba, la lista agrupada por mes en versalitas, y cada fila con su icono, su detalle, su
// importe y la descarga. Es lo que el cliente busca desde el teléfono: la factura para pasarla a su
// contador.
//
// ═══ DOS DESVÍOS DECLARADOS RESPECTO DEL MOCKUP ═══
//
// 1. EL CHIP «RECIBOS» NO EXISTE ACÁ. El OS no emite recibos como entidad: lo que hay es el cobro
//    registrado sobre el certificado. Un chip que siempre filtra a cero es peor que no estar. En su
//    lugar va «Documentos», que sí tiene fuente (los papeles de la obra) y que en el `29` vive en su
//    propia solapa — solapa que en el teléfono no existe.
// 2. EL AGRUPAMIENTO ES POR FECHA DE EMISIÓN. El mockup agrupa una factura que vence el 17/09 bajo
//    «SEPTIEMBRE» y otra que venció el 04/08 bajo «JULIO»: son dos criterios distintos en la misma
//    lista. Acá manda uno solo —cuándo se emitió el papel—, que es como lo busca quien lo busca.
//
// «Descargar todo el período» tampoco se dibuja: no hay endpoint que arme ese zip. Sería un botón
// que no descarga nada.

type Chip = 'todo' | 'facturas' | 'certificados' | 'documentos'

const CHIPS: { clave: Chip; rotulo: string }[] = [
  { clave: 'todo', rotulo: 'Todo' },
  { clave: 'facturas', rotulo: 'Facturas' },
  { clave: 'certificados', rotulo: 'Certificados' },
  { clave: 'documentos', rotulo: 'Documentos' },
]

interface Item {
  id: string
  tipo: Chip
  titulo: string
  detalle: string | null
  tono: string
  monto: number | null
  url: string | null
  /** `YYYY-MM` con el que se agrupa. `null` = sin fecha: cae al grupo «Sin fecha». */
  mes: string | null
  icono: React.ReactNode
}

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
  'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

const rotuloMes = (mes: string | null) =>
  mes === null ? 'SIN FECHA' : `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`

function itemsDeCertificados(certificados: CertificadoPortal[], hoy: string, montos: boolean): Item[] {
  return certificados.map((c) => {
    const e = estadoEnPantalla(c, hoy)
    const emitido = soloFecha(c.emitido_at)
    const detalle = [
      c.factura ? c.numero : null,
      emitido ? diaMes(emitido) : null,
      e.clave === 'pagado' ? e.nota : e.clave === 'vencido' ? `venció ${diaMes(c.vence)}`
        : e.muestra_fecha && c.vence ? `vence ${diaMes(c.vence)}` : e.nota,
    ].filter(Boolean).join(' · ')
    return {
      id: c.id,
      tipo: c.factura ? 'facturas' : 'certificados',
      titulo: c.factura ?? c.numero,
      detalle: detalle || null,
      tono: e.clave === 'pagado' ? P.pos : e.clave === 'vencido' ? P.neg : P.tenue,
      monto: montos ? c.monto : null,
      url: c.pdf_url,
      mes: emitido ? emitido.slice(0, 7) : null,
      icono: e.clave === 'pagado' ? <IcoArchivoOk s={19} w={1.8} />
        : c.factura ? <IcoArchivo s={19} w={1.8} /> : <IcoParaAprobar s={19} w={1.8} />,
    }
  })
}

function itemsDeDocumentos(documentos: DocumentoPortal[]): Item[] {
  return documentos.map((d) => ({
    id: `doc-${d.id}`,
    tipo: 'documentos' as const,
    titulo: d.nombre,
    detalle: d.detalle,
    tono: P.tenue,
    monto: null,
    url: d.url,
    mes: null,
    icono: d.firmado === true ? <IcoArchivoOk s={19} w={1.8} /> : <IcoArchivo s={19} w={1.8} />,
  }))
}

export function ComprobantesMovil({ certificados, documentos, hoy, montos }: {
  certificados: CertificadoPortal[]
  documentos: DocumentoPortal[]
  hoy: string
  montos: boolean
}) {
  const [chip, setChip] = useState<Chip>('todo')

  const todos = [...itemsDeCertificados(certificados, hoy, montos), ...itemsDeDocumentos(documentos)]
  const items = chip === 'todo' ? todos : todos.filter((i) => i.tipo === chip)

  const grupos = new Map<string | null, Item[]>()
  for (const i of [...items].sort((a, b) => (b.mes ?? '').localeCompare(a.mes ?? ''))) {
    const g = grupos.get(i.mes) ?? []
    g.push(i)
    grupos.set(i.mes, g)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 7, paddingBottom: 12, overflowX: 'auto' }}>
        {CHIPS.map((c) => {
          const viva = c.clave === chip
          return (
            <button
              key={c.clave}
              type="button"
              onClick={() => setChip(c.clave)}
              style={{
                fontSize: '12.5px', fontWeight: viva ? 500 : 400,
                color: viva ? P.tinta : P.apagado,
                background: viva ? P.seleccion : P.superficie,
                border: `1px solid ${viva ? P.marcaBorde : P.linea}`,
                borderRadius: 15, padding: '6px 13px', whiteSpace: 'nowrap', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {c.rotulo}
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <VacioPortal texto="No hay comprobantes en esta vista." />
      ) : (
        [...grupos.entries()].map(([mes, delMes]) => (
          <div key={mes ?? 'sin'}>
            <div style={{
              fontSize: '10.5px', color: P.tenue, letterSpacing: '.05em', margin: '16px 0 4px',
            }}>
              {rotuloMes(mes)}
            </div>
            {delMes.map((i) => (
              <div key={i.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', minHeight: 64,
                borderBottom: `1px solid ${P.lineaBloque}`,
              }}>
                <span style={{ display: 'flex', color: i.tono === P.pos ? P.pos : P.apagado, flexShrink: 0 }}>
                  {i.icono}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', color: P.tinta }}>{i.titulo}</div>
                  {i.detalle && (
                    <div style={{ fontSize: '11.5px', color: i.tono, marginTop: 1 }}>{i.detalle}</div>
                  )}
                </div>
                {i.monto !== null && (
                  <span style={{
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: P.tinta, flexShrink: 0,
                  }}>
                    {millonesPortal(i.monto)}
                  </span>
                )}
                {i.url && (
                  <a href={i.url} title="Descargar" target="_blank" rel="noreferrer"
                    style={{ display: 'flex', color: P.tenue, flexShrink: 0 }}>
                    <IcoDescargar s={18} w={1.8} />
                  </a>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
