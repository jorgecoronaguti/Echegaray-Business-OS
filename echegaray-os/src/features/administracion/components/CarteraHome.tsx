'use client'

// CLIENTES Y OBRAS EN EJECUCIÓN — la cartera de la entrada (00 · Home Navegación v2).
//
// La obra en curso NO es una columna del cliente: es una FILA propia, indentada bajo él y con SUS
// MISMAS columnas. Contratado es plata en las dos y «últ. mov.» es una fecha en las dos; lo único
// que cambia de significado al bajar un nivel es el nombre, y por eso el avance, el jefe y el
// estado de certificación viajan pegados a él. Es el criterio 4 del patrón: jerarquía por
// INDENTACIÓN, no por contenedores.
//
// ═══ EL BUSCADOR FILTRA EN EL NAVEGADOR ═══
//
// Cinco clientes hoy, decenas en el peor caso de esta empresa. Un `?q=` por tecla convierte una
// búsqueda instantánea en una consulta de servidor por letra. Es lo ÚNICO interactivo de esta
// pantalla, y por eso este componente es el único `'use client'` de las tres piezas: la barra de
// destinos y el libro de trabajo se dibujan en el servidor.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { C, IcoBuscar, pesos, porcentajeCanon } from '@/shared/components/canon'
import { IconoCrear, IconoObra } from '@/shared/components/iconos'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { diaRelativo, type ClienteEnCartera } from '../services/homeCartera'

const COLS = 'minmax(0,1.9fr) 140px 150px 96px'

/** Los tonos del mockup que el canon todavía no tenía nombrados. */
const TONO = { contexto: '#B5B3AC', divisorObra: '#F3F2EE', pista: '#EDECE8', iconoObra: '#C4C2BB' } as const

export function CarteraHome({
  clientes, hoy, veEconomia, obrasNoLeidas,
}: {
  clientes: ClienteEnCartera[]
  /** El día de hoy en la hora de la empresa. Viene del servidor: el reloj del navegador es de quien mira. */
  hoy: string
  /** El jefe de obra NO ve el contratado. La cerradura es la RLS; acá se deja de ofrecer la columna. */
  veEconomia: boolean
  /** `true` = la lectura de obras falló. Ninguna fila puede decir «ninguna en ejecución». */
  obrasNoLeidas: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const visibles = useMemo(
    () => clientes.filter((c) => contieneEnAlguno([c.nombre], busqueda)),
    [clientes, busqueda],
  )
  const enCurso = visibles.reduce((a, c) => a + c.enCurso.length, 0)
  const conMonto = visibles.filter((c) => c.contratado !== null)
  const contratado = conMonto.length ? conMonto.reduce((a, c) => a + (c.contratado ?? 0), 0) : null

  return (
    <div style={{ padding: '30px 20px 24px' }} data-testid="cartera-home">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: C.tinta, letterSpacing: '-.01em' }}>
          Clientes y obras en ejecución
        </h2>
        {/* EL RESUMEN CUENTA LO QUE SE VE. Un total de la cartera entera junto a tres filas
            filtradas es un número que no cuadra con nada de lo que hay en pantalla. */}
        <span style={{ fontSize: '12px', color: C.tenue }} data-testid="resumen-cartera">
          {visibles.length} {visibles.length === 1 ? 'cliente' : 'clientes'}
          {obrasNoLeidas
            ? ' · no pude leer las obras'
            : ` · ${enCurso} ${enCurso === 1 ? 'obra' : 'obras'} en ejecución`}
          {veEconomia && ` · ${contratado === null ? 'sin contratos cargados' : `${pesos(contratado)} contratado`}`}
        </span>

        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: C.superficie,
            border: `1px solid ${C.linea}`, borderRadius: 6, padding: '3px 8px', width: 200, marginLeft: 8,
          }}
        >
          <span style={{ display: 'flex', color: TONO.contexto, flexShrink: 0 }}><IcoBuscar s={13} /></span>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente"
            aria-label="Buscar cliente"
            data-testid="buscar-cliente"
            style={{ border: 'none', background: 'transparent', fontSize: '12px', color: C.tinta, width: '100%', padding: 0, outline: 'none' }}
          />
        </label>

        {/* EL ALTA VIVE EN `/clientes`: un segundo formulario del mismo maestro sería una segunda
            puerta a la misma tabla. Acá se ofrece la puerta, no una copia. */}
        <Link
          href="/clientes?nuevo=1"
          prefetch={false}
          data-testid="ir-alta-cliente"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: C.marca,
            color: C.tinta, fontSize: '12.5px', fontWeight: 600, borderRadius: 6, padding: '6px 11px',
          }}
        >
          <IconoCrear className="h-[14px] w-[14px]" />
          Nuevo cliente
        </Link>
      </div>

      <div style={{ ...grilla, alignItems: 'end', height: 26, borderBottom: `1px solid ${C.lineaFuerte}` }}>
        <span style={rotulo}>Cliente</span>
        <span style={{ ...rotulo, textAlign: 'right' }}>Obras</span>
        <span style={{ ...rotulo, textAlign: 'right' }}>{veEconomia ? 'Contratado' : ''}</span>
        <span
          style={{ ...rotulo, textAlign: 'right' }}
          title="El hecho más reciente que el OS registró: un parte de obra o un certificado. No es la última edición de la ficha."
        >
          Últ. mov.
        </span>
      </div>

      {visibles.map((c) => (
        <div key={c.cliente_id}>
          <FilaCliente c={c} hoy={hoy} veEconomia={veEconomia} />
          {c.enCurso.map((o) => (
            <FilaObra key={o.obra_id} o={o} hoy={hoy} veEconomia={veEconomia} />
          ))}
          {c.enCurso.length === 0 && (
            <div style={{ ...grilla, alignItems: 'center', height: 26, borderBottom: `1px solid ${TONO.divisorObra}` }}>
              <span style={{ fontSize: '11.5px', color: TONO.contexto, paddingLeft: 36 }}>
                {/* «No pude leerlas» NO se dibuja como «no hay»: es el defecto de un control que no
                    pudo mirar y afirma que no hay nada. */}
                {obrasNoLeidas ? 'no pude leer sus obras' : 'ninguna obra en ejecución'}
              </span>
            </div>
          )}
        </div>
      ))}

      {visibles.length === 0 && (
        <div style={{ padding: '14px 0', fontSize: '12px', color: C.tenue }} data-testid="sin-resultados">
          Ningún cliente se llama así.
        </div>
      )}
    </div>
  )
}

function FilaCliente({ c, hoy, veEconomia }: { c: ClienteEnCartera; hoy: string; veEconomia: boolean }) {
  const cuerpo = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: C.tinta }}>{c.nombre}</span>
        {c.avisoCorto && (
          <span
            title={c.aviso ?? c.avisoCorto}
            data-testid="aviso-datos"
            style={{ fontSize: '11px', color: C.warn, flexShrink: 0 }}
          >
            {c.avisoCorto}
          </span>
        )}
      </span>
      <span className="font-mono tabular-nums" style={{ fontSize: '12px', color: C.apagado, textAlign: 'right' }}>
        {/* CERO OBRAS SE ESCRIBE CON PALABRAS: «0 obras» y «nadie le cargó ninguna» se leen igual. */}
        {c.obras ? `${c.obras} ${c.obras === 1 ? 'obra' : 'obras'}` : 'sin obras'}
      </span>
      <span
        className="font-mono tabular-nums"
        style={{ fontSize: '12px', textAlign: 'right', color: c.contratado === null ? C.warn : C.tinta }}
      >
        {veEconomia ? (c.contratado === null ? 'sin contrato' : pesos(c.contratado)) : ''}
      </span>
      <span className="font-mono" style={{ fontSize: '11.5px', color: C.tenue, textAlign: 'right' }}>
        {diaRelativo(c.ultimoMovimiento, hoy) ?? 'sin movimientos'}
      </span>
    </>
  )
  const estilo: React.CSSProperties = {
    ...grilla, alignItems: 'center', height: 34,
    borderBottom: `1px solid ${c.enCurso.length ? TONO.divisorObra : C.lineaFila}`,
  }
  // Sin identificador no hay ficha a la que entrar. La fila se dibuja igual: esconderla haría que
  // un cliente real desapareciera de la lista sin que nadie se entere.
  return c.slug
    ? <Link href={`/clientes/${c.slug}`} prefetch={false} data-testid="fila-cliente" style={estilo}>{cuerpo}</Link>
    : <div data-testid="fila-cliente" style={estilo}>{cuerpo}</div>
}

function FilaObra({
  o, hoy, veEconomia,
}: { o: ClienteEnCartera['enCurso'][number]; hoy: string; veEconomia: boolean }) {
  return (
    <Link
      href={`/obras/${o.obra_id}`}
      prefetch={false}
      data-testid="fila-obra"
      style={{ ...grilla, alignItems: 'center', height: 30, borderBottom: `1px solid ${TONO.divisorObra}` }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, paddingLeft: 14 }}>
        <span style={{ display: 'flex', color: TONO.iconoObra, flexShrink: 0 }}>
          <IconoObra className="h-[13px] w-[13px]" />
        </span>
        <span className="truncate" style={{ fontSize: '12px', color: C.tintaSuave }}>{o.nombre}</span>
        {/* BARRA SÓLO SI EL NÚMERO ES UNA FRACCIÓN 0–100. `null` no es cero: una obra sin avance
            sincronizado no avanzó cero por ciento, no se sabe — y una barra vacía dice que sí. */}
        {o.avance === null ? (
          <span style={{ fontSize: '11.5px', color: TONO.contexto, flexShrink: 0 }}>sin medir</span>
        ) : (
          <>
            <span style={{ display: 'flex', height: 4, width: 96, borderRadius: 2, background: TONO.pista, flexShrink: 0, marginLeft: 4 }}>
              <span style={{ width: `${Math.min(100, Math.max(0, o.avance))}%`, background: C.grafito, borderRadius: 2 }} />
            </span>
            <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: C.apagado, flexShrink: 0 }}>
              {porcentajeCanon(o.avance, 0)}
            </span>
          </>
        )}
        <span style={{ fontSize: '11.5px', color: TONO.contexto, flexShrink: 0, marginLeft: 4 }}>
          {o.jefe ?? 'sin jefe'}
        </span>
        <span
          className="truncate"
          style={{ fontSize: '11.5px', color: o.certificacion.reclama ? C.warn : C.tenue }}
        >
          · {o.certificacion.texto}
        </span>
      </span>
      <span />
      <span
        className="font-mono tabular-nums"
        style={{ fontSize: '11.5px', textAlign: 'right', color: o.contratado === null ? C.warn : C.apagado }}
      >
        {veEconomia ? (o.contratado === null ? 'sin contrato' : pesos(o.contratado)) : ''}
      </span>
      <span className="font-mono" style={{ fontSize: '11.5px', color: TONO.contexto, textAlign: 'right' }}>
        {diaRelativo(o.ultimoParte, hoy) ?? 'sin partes'}
      </span>
    </Link>
  )
}

const grilla: React.CSSProperties = { display: 'grid', gridTemplateColumns: COLS, gap: 14 }

const rotulo: React.CSSProperties = {
  fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase', color: C.tenue, paddingBottom: 6,
}
