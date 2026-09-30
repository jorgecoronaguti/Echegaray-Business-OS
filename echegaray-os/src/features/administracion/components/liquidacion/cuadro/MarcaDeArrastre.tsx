// LA RESTA DE UN RECIBO ANTERIOR, EN LA CELDA BANCO (dueño, 30/09/2026: «te lo pedí que sume dentro de la celda, pero
// sumando y que dé el resultado, no como número directamente»). Con la resta aplicada la celda es una suma expresada,
// como en la planilla: el neto del recibo, «+ resta» y «= resultado» como número principal. Lo que se escribe sigue
// siendo el neto —lo que el estudio liquidó—, para no sumar la resta dos veces al guardar. Cuando la resta no alcanzó,
// o en la quincena de origen, es una marca: no hay suma que mostrar.

import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { sumaDelBanco, textoDelArrastre } from '../../../services/liquidacionArrastre'
import type { LineaConOverrides } from '../../../services/liquidacionOverrides'

const CHICO = { fontSize: '10.5px', lineHeight: '14px', color: V.apagado, whiteSpace: 'nowrap', fontStyle: 'normal', fontVariantNumeric: 'tabular-nums' } as const
const RESULTADO = { color: V.tinta, fontWeight: 600, whiteSpace: 'nowrap', fontStyle: 'normal', fontVariantNumeric: 'tabular-nums' } as const

/**
 * DEBAJO DEL CAMPO QUE ESCRIBE EL NETO: «+ 54.580,48» y «= $289.543,80». `forma="linea"` en el panel, donde hay
 * ancho para los dos en un renglón; `forma="columna"` en la celda del cuadro (124 px: la fila mide 58 px y entran
 * campo + dos renglones). Sin resta aplicada no dibuja nada.
 */
export function SumaDelArrastre({ l, testid, forma = 'columna' }: { l: LineaConOverrides; testid: string; forma?: 'columna' | 'linea' }) {
  const s = sumaDelBanco(l, pesos)
  if (!s) return null
  const titulo = textoDelArrastre(l, pesos) ?? undefined
  const mas = `+ ${pesos(s.resta).replace(/^\$\s?/, '')}`
  if (forma === 'linea') {
    return (
      <span data-testid={testid} data-arrastre="aplicado" data-resultado={s.resultado} title={titulo} style={{ ...CHICO, marginLeft: 8 }}>
        {mas} <span style={{ ...RESULTADO, fontSize: '12px' }}>{s.resultado_texto}</span>
      </span>
    )
  }
  return (
    <span data-testid={testid} data-arrastre="aplicado" data-resultado={s.resultado} title={titulo} style={{ display: 'block', textAlign: 'right' }}>
      <span style={{ ...CHICO, display: 'block' }}>{mas}</span>
      <span style={{ ...RESULTADO, display: 'block', lineHeight: '16px' }}>{s.resultado_texto}</span>
    </span>
  )
}

/** La marca sin suma: resta que NO alcanzó (ámbar) o, en la quincena de origen, a cuál se fue. Con resta aplicada, la suma. */
export function MarcaDeArrastre({ l, testid, forma }: { l: LineaConOverrides; testid: string; forma?: 'columna' | 'linea' }) {
  if (l.arrastre?.estado === 'aplicado') return <SumaDelArrastre l={l} testid={testid} forma={forma} />
  const titulo = textoDelArrastre(l, pesos)
  if (!titulo) return null
  const a = l.arrastre
  const texto = a?.estado === 'no_alcanza' ? `${pesos(a.importe)} ⚠` : `→ ${pesos(l.arrastradoA?.importe ?? null)}`
  const color = a?.estado === 'no_alcanza' ? V.warn : V.apagado
  return (
    <span data-testid={testid} data-arrastre={a?.estado ?? 'saliente'} title={titulo}
      style={{ ...CHICO, display: forma === 'linea' ? 'inline' : 'block', marginLeft: forma === 'linea' ? 8 : 0, color }}>
      {texto}
    </span>
  )
}
