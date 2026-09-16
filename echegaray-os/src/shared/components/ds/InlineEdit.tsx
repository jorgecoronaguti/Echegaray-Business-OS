'use client'

// EDICIÓN EN LA CELDA — el valor se corrige donde se lee, sin abrir un formulario.
//
// ═══ POR QUÉ EXISTE, Y POR QUÉ ACÁ ═══
//
// El OS no tenía ninguno. Corregir la cantidad de una actividad, su unidad o su responsable obligaba
// a abrir un panel, tocar «Guardar» y volver — treinta y ocho veces si son treinta y ocho filas.
// Nace genérico y en el design system a propósito: Tareas es la primera pantalla que lo necesita,
// pero lo van a usar Base maestra, Presupuestos y Compras, y la segunda copia es la que un día va a
// guardar sin avisar que falló.
//
// ═══ EL CONTRATO ═══
//
// 1. **GUARDA AL SALIR DEL CAMPO** (texto y número) **o AL ELEGIR** (select). No hay botón: un
//    botón por celda son treinta y ocho botones y el que edita igual se va con Tab sin tocarlo.
// 2. **NO GUARDA SI NO CAMBIÓ.** Entrar y salir de una celda no escribe: una escritura por foco
//    ensucia el historial y pisa lo que otro acaba de corregir en otra pestaña.
// 3. **`Escape` cancela** y devuelve el valor original. `Enter` confirma sin esperar al blur.
// 4. **EL ERROR DEL SERVIDOR SE MUESTRA Y EL VALOR NO SE PIERDE.** Si la acción devuelve
//    `{ok:false}`, el campo se queda con lo que la persona escribió y el mensaje aparece debajo. Un
//    campo que se limpia solo hace creer que se guardó algo que no existe.
// 5. **EL VACÍO SE MANDA VACÍO.** Un campo que se borra manda `''`; convertirlo a `0` fabricaría un
//    dato — el error que ya costó un contrato de $0 en este repo.
// 6. **`null` no se dibuja como `0` ni como `—`**: se dibuja el texto de ausencia que pasa el que
//    llama (`falta`), en `faint`, y sigue siendo tocable.
// 7. **LO GUARDADO NO DESAPARECE MIENTRAS EL SERVIDOR VUELVE.** La prop sigue trayendo el valor
//    viejo hasta que `revalidatePath` termina de rehacer la pantalla —en Liquidación, entre diez y
//    veinte segundos—, y hasta el 10/09/2026 la celda volvía a dibujarlo: quien editaba veía su
//    número desaparecer y concluía, con razón, que no se podía editar. La regla de quién gana está
//    en `inlineEdit.ts`, pura y probada.
//
// El id de la fila NUNCA viaja en el formulario: la acción llega ya atada con `.bind(null, id)`.

import { useEffect, useRef, useState } from 'react'
import { CAMPO } from './Controles'
import { indiceDeLaSiguiente } from '../../lib/numeroEsAR'
import { leerCeldaNumerica } from '../../lib/formulaEsAR'
import { useCeldaViva, useGuardadoDeshacible } from '../deshacer/DeshacerProvider'
import {
  alConfirmarGuardado, alLlegarDelServidor, hayQueGuardar, textoAlAbrir, valorVigente, type EstadoInline,
} from './inlineEdit'

export type ResultadoInline = { ok: true } | { ok: false; error: string }

/** Lo que el deshacer necesita saber de esta celda cuando el que llama sabe más que el valor dibujado. */
export interface DeshacerDeCelda {
  /** Valor a restaurar (p. ej. `''` = «sin manual», aunque la celda dibuje el calculado). */
  anterior?: string
  /** La acción comprueba `esperado` en el servidor: no hace falta mirar el valor dibujado. */
  verificaServidor?: boolean
  /** Cómo se nombra en el aviso («Banco de Rosales»). Sin esto, la `etiqueta`. */
  rotulo?: string
}

export interface OpcionInline {
  valor: string
  etiqueta: string
}

export function InlineEdit({
  valor,
  guardar,
  tipo = 'texto',
  opciones,
  falta = 'sin cargar',
  mostrar,
  sufijo,
  etiqueta,
  testid,
  ancho = 'w-full',
  alineado = 'left',
  deshacer,
  expresion = null,
  abrirVacio = false,
}: {
  /** Lo guardado hoy. `null` es ausencia y se dibuja con `falta`, nunca como 0. */
  valor: string | number | null
  /** `contexto.esperado` llega al deshacer: lo que debería haber hoy, para no pisar un cambio ajeno. */
  guardar: (v: string, contexto?: { esperado?: string }) => Promise<ResultadoInline>
  tipo?: 'texto' | 'numero' | 'seleccion' | 'fecha'
  /** Obligatorias con `tipo='seleccion'`. La primera opción suele ser la ausencia. */
  opciones?: OpcionInline[]
  falta?: string
  /**
   * Cómo se LEE el valor guardado: moneda, porcentaje, miles. Sólo afecta al estado de lectura —al
   * editar se muestra el número crudo, porque un `<input type=number>` con «$100.000» adentro no
   * puede recibir un tecleo y el navegador lo descarta entero. Sin esto, una columna de plata pierde
   * el formato en el momento en que se vuelve editable, y una tabla de sueldos sin separador de
   * miles se lee mal justo donde más caro sale leerla mal.
   */
  mostrar?: (valor: string | number) => string
  sufijo?: string
  /** Rótulo accesible: es lo único que distingue esta celda de las otras trescientas. */
  etiqueta: string
  testid?: string
  ancho?: string
  /** `center` lo pide la grilla de Liquidación → Horas: su columna de día está centrada y un campo
   *  alineado a la izquierda dentro de 42 px corre el número respecto de las celdas de al lado. */
  alineado?: 'left' | 'right' | 'center'
  /** CMD/CTRL+Z (15/09/2026): cómo deshacer esta celda cuando el valor dibujado no alcanza. */
  deshacer?: DeshacerDeCelda
  /**
   * LA CUENTA GUARDADA DE ESTA CELDA (dueño, 15/09/2026: «tiene que poder calcular dentro de las celdas, como
   * hace sheet»). En reposo se dibuja el VALOR —es lo que se paga—; al abrir el campo aparece la CUENTA, que es
   * lo que hay que corregir. Sólo con `tipo='numero'`.
   */
  expresion?: string | null
  /**
   * ABRIR VACÍO SOBRE UN CERO DERIVADO (QA, 16/09/2026): la celda que en reposo dibuja «—» para un 0 que nadie
   * escribió abre sin el «0» adentro, y salir sin teclear no guarda nada. Un 0 escrito a mano abre como 0.
   * La regla es pura (`textoAlAbrir` / `hayQueGuardar` en `inlineEdit.ts`).
   */
  abrirVacio?: boolean
}) {
  const original = valor === null ? '' : String(valor)
  // UNA FECHA SE LEE EN es-AR Y SE EDITA EN ISO. El `<input type=date>` exige AAAA-MM-DD, pero
  // mostrar la celda así obliga a leer al revés una fecha en una pantalla donde todas las demás
  // dicen DD/MM/AAAA — y una columna con dos formatos de fecha es una columna que se lee mal.
  const enISO = (v: string) => (tipo === 'fecha' && v
    ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`
    : v)
  const [borrador, setBorrador] = useState(original)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  // «✓» BREVE DESPUÉS DE GUARDAR (dueño, 15/09/2026: «mejores la ux de cada celda»). Se dibuja en posición
  // absoluta, igual que «guardando…»: la fila no se mueve.
  const [recienGuardado, setRecienGuardado] = useState(false)
  const [falloReciente, setFalloReciente] = useState(false)
  const confirmando = useRef(false)
  const cancelado = useRef(false)
  const ref = useRef<HTMLInputElement>(null)

  // EL VALOR DE AFUERA MANDA cuando la fila se vuelve a leer del servidor —salvo mientras alguien
  // está escribiendo: pisarle el texto a mitad de una corrección es perder su trabajo—. Se ajusta
  // DURANTE el render y no en un efecto: con el efecto, la celda se dibuja un fotograma con el
  // valor viejo y se corrige después, que es el parpadeo que hace dudar de si guardó.
  const [estado, setEstado] = useState<EstadoInline>({ delServidor: original, pendiente: null })
  if (!editando && original !== estado.delServidor) {
    const siguiente = alLlegarDelServidor(estado, original)
    setEstado(siguiente)
    setBorrador(valorVigente(siguiente))
  }
  // LA CUENTA SIGUE AL VALOR: cuando el servidor trae otra, la celda la adopta salvo mientras alguien escribe.
  const [cuenta, setCuenta] = useState<string | null>(expresion)
  const [cuentaDelServidor, setCuentaDelServidor] = useState<string | null>(expresion)
  if (!editando && expresion !== cuentaDelServidor) {
    setCuentaDelServidor(expresion)
    setCuenta(expresion)
  }

  // LO QUE LA CELDA DIBUJA: lo confirmado por la acción hasta que el servidor lo repita (regla 7).
  const vigente = valorVigente(estado)
  const enVuelo = estado.pendiente != null

  // ═══ CMD/CTRL+Z (dueño, 15/09/2026) ═══ Todo guardado de esta celda pasa por el deshacer de la plataforma, así
  // lo heredan Obras, Documentos, Asistencia y Liquidación sin cablear cada pantalla.
  const clave = testid ?? etiqueta
  const estadoRef = useRef(estado)
  useEffect(() => { estadoRef.current = estado })
  const guardarDeshacible = useGuardadoDeshacible({
    clave, rotulo: deshacer?.rotulo ?? etiqueta, valorAnterior: deshacer?.anterior ?? vigente, guardar,
    formato: (x) => (x === '' ? falta : `${mostrar ? mostrar(x) : enISO(x)}${sufijo ? ` ${sufijo}` : ''}`),
  })
  useCeldaViva(clave, {
    actual: deshacer?.verificaServidor ? undefined : () => valorVigente(estadoRef.current),
    // DESHACER DEVUELVE UN VALOR, NO UNA CUENTA: la expresión que explicaba el número deshecho ya no lo
    // explica, así que se borra. El servidor hace lo mismo (`siguientesFormulas` con expresión nula).
    aplicar: (v) => { setEstado((e) => alConfirmarGuardado(e, v)); setBorrador(v); setCuenta(null) },
  })

  async function confirmar(crudo: string, luego?: () => void) {
    if (confirmando.current) return
    let v = crudo
    // LO QUE VIAJA A LA ACCIÓN: la CUENTA si la hay, el número si no. El servidor la vuelve a leer con el
    // mismo lector y guarda las dos cosas; acá el estado se queda con el VALOR, que es lo que la celda dibuja.
    let aGuardar = crudo
    let nuevaCuenta: string | null = null
    // UN NÚMERO SE LEE EN es-AR («266.000», «$ 266.000», «8,5») y una cuenta empieza con `=`. Lo que no es
    // ninguna de las dos no se guarda: el campo queda abierto con el motivo.
    if (tipo === 'numero') {
      const leido = leerCeldaNumerica(crudo)
      if (!leido.ok) { setError(leido.error); return }
      v = leido.valor == null ? '' : String(leido.valor)
      nuevaCuenta = leido.expresion
      aGuardar = leido.expresion ?? v
    }
    // UNA CUENTA DISTINTA SE GUARDA AUNQUE DÉ EL MISMO NÚMERO: «=9*105» y «945» valen lo mismo y no explican
    // lo mismo. Sin esto, corregir la cuenta y no el resultado no guardaría nada.
    if (!hayQueGuardar(estado, v, { ceroAbreVacio: abrirVacio }) && nuevaCuenta === cuenta) { setEditando(false); setError(null); luego?.(); return }
    confirmando.current = true
    setGuardando(true)
    const r = await guardarDeshacible(aGuardar)
    setGuardando(false)
    setEditando(false)
    confirmando.current = false
    if (r.ok) {
      setEstado(alConfirmarGuardado(estado, v))
      setCuenta(nuevaCuenta)
      setError(null)
      setRecienGuardado(true)
      setTimeout(() => setRecienGuardado(false), 1500)
    } else {
      setError(r.error)
      setFalloReciente(true)
      setTimeout(() => setFalloReciente(false), 4000)
    }
    luego?.()
  }

  /** TAB: guarda y abre la siguiente celda editable de la MISMA fila (`data-fila-edicion`). */
  function abrirLaSiguiente(fila: Element, indice: number | null) {
    if (indice == null) return
    const destino = fila.querySelectorAll('[data-inline-edit]')[indice]
    ;(destino?.querySelector('button') as HTMLButtonElement | null)?.click()
  }

  if (tipo === 'seleccion') {
    return (
      <span className="inline-flex flex-col">
        <select
          value={borrador}
          disabled={guardando}
          aria-label={etiqueta}
          data-testid={testid}
          onChange={(e) => { setBorrador(e.target.value); void confirmar(e.target.value) }}
          className={`${CAMPO} ${ancho} !h-7 !px-1.5 !text-[12.5px] border-transparent bg-transparent hover:border-line-strong`}
        >
          {(opciones ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>{o.etiqueta || falta}</option>
          ))}
        </select>
        {error && <span className="text-[11px] text-neg" data-testid={testid ? `${testid}-error` : undefined}>{error}</span>}
      </span>
    )
  }

  const indicador = guardando
    ? <span className="pointer-events-none absolute -top-2.5 right-0 text-[10px] text-faint">guardando…</span>
    : recienGuardado
      ? <span className="pointer-events-none absolute -top-2.5 right-0 text-[10px] text-pos" aria-live="polite">✓</span>
      : null

  if (!editando) {
    return (
      <span className="relative inline-flex flex-col items-start" data-inline-edit="">
        <button
          type="button"
          data-testid={testid}
          aria-label={etiqueta}
          // MIENTRAS EL SERVIDOR NO CONFIRME, LA CELDA LO DICE SIN MOVER NADA: `aria-busy` para
          // quien navega con lector y un subrayado punteado para quien mira. Un cartel «guardando…»
          // debajo empujaría la fila y la tabla entera bailaría en cada corrección.
          aria-busy={enVuelo || guardando}
          data-pendiente={enVuelo ? '1' : undefined}
          data-formula={cuenta ? '1' : undefined}
          title={enVuelo
            ? 'Guardado. La pantalla termina de actualizarse en unos segundos.'
            : (cuenta ? `${cuenta} → ${mostrar ? mostrar(vigente) : vigente}` : undefined)}
          // ABRIR LA CELDA MUESTRA LA CUENTA, NO EL RESULTADO: es lo que hay que corregir (como en el Sheet).
          onClick={() => { setEditando(true); setBorrador(textoAlAbrir(estado, cuenta, { ceroAbreVacio: abrirVacio })); setError(null); requestAnimationFrame(() => ref.current?.select()) }}
          // EDITABLE A LA VISTA, SIN RUIDO: subrayado punteado suave, cursor de texto y 32 px de alto (toque a 390).
          className={`${ancho} min-h-8 cursor-text rounded-control border border-transparent px-1.5 py-0.5 text-left hover:border-line-strong ${
            alineado === 'right' ? 'text-right font-mono tabular-nums'
              : alineado === 'center' ? 'text-center font-mono tabular-nums' : ''
          } ${vigente === '' ? 'text-faint' : 'text-ink'} ${
            enVuelo ? 'underline decoration-dotted decoration-warn underline-offset-4' : 'underline decoration-dotted decoration-line-strong underline-offset-4'
          } text-[12.5px]`}
        >
          {vigente === ''
            ? falta
            : `${mostrar ? mostrar(vigente) : enISO(vigente)}${sufijo ? ` ${sufijo}` : ''}`}
        </button>
        {indicador}
        {/* EL ERROR EN TEXTO SÓLO RECIÉN FALLADO (4 s); DESPUÉS, UN ⚠ ROJO CON TITLE. Un texto fijo debajo rompe el
            alto y el ritmo de la fila (dueño, 15/09/2026). Abrir el campo lo borra. */}
        {error && (falloReciente
          ? <span className="text-[11px] text-neg" data-testid={testid ? `${testid}-error` : undefined}>{error}</span>
          : <span role="img" aria-label={error} title={error} data-testid={testid ? `${testid}-error` : undefined}
            className="absolute -top-2.5 left-0 cursor-help text-[10px] leading-none text-neg">⚠</span>)}
      </span>
    )
  }

  return (
    <span className="relative inline-flex flex-col" data-inline-edit="">
      <input
        ref={ref}
        autoFocus
        // SIN FLECHAS (dueño, 15/09/2026: «unas flechas para arriba y abajo q no son utiles»): texto con teclado
        // decimal en el teléfono, y `leerNumeroEsAR` al guardar.
        type={tipo === 'fecha' ? 'date' : 'text'}
        inputMode={tipo === 'numero' ? 'decimal' : undefined}
        value={borrador}
        disabled={guardando}
        aria-label={etiqueta}
        data-testid={testid ? `${testid}-campo` : undefined}
        onChange={(e) => { setBorrador(e.target.value); if (error) setError(null) }}
        onFocus={(e) => e.currentTarget.select()}
        // ESCAPE NO GUARDA DE REBOTE: al cerrar el campo el navegador emite `blur` con el borrador de antes de
        // revertir, y sin esta marca ese blur guardaba lo que se acababa de cancelar.
        onBlur={() => { if (cancelado.current) { cancelado.current = false; return } void confirmar(borrador) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void confirmar(borrador) }
          // TAB GUARDA Y PASA A LA SIGUIENTE CELDA DE LA FILA. Fuera de una fila marcada, Tab hace lo de siempre.
          if (e.key === 'Tab') {
            const celda = e.currentTarget.closest('[data-inline-edit]')
            const fila = celda?.closest('[data-fila-edicion]')
            if (celda && fila) {
              e.preventDefault()
              const celdas = [...fila.querySelectorAll('[data-inline-edit]')]
              const siguiente = indiceDeLaSiguiente(celdas.length, celdas.indexOf(celda), e.shiftKey)
              void confirmar(borrador, () => abrirLaSiguiente(fila, siguiente))
            }
          }
          // ESCAPE DEVUELVE EL ORIGINAL. Sin esto, la única salida de una edición empezada por error
          // es guardarla.
          if (e.key === 'Escape') { e.preventDefault(); cancelado.current = true; setError(null); setBorrador(textoAlAbrir(estado, cuenta, { ceroAbreVacio: abrirVacio })); setEditando(false) }
        }}
        // EL MISMO ANCHO QUE LA CELDA EN REPOSO (`ancho`) Y 32 PX DE ALTO: la fila no salta al abrirla.
        className={`${CAMPO} ${ancho} !h-8 min-h-8 !px-1.5 !text-[12.5px] ${alineado === 'right' ? 'text-right font-mono tabular-nums' : alineado === 'center' ? 'text-center font-mono tabular-nums' : ''}`}
      />
      {indicador}
      {error && <span className="text-[11px] text-neg" data-testid={testid ? `${testid}-error` : undefined}>{error}</span>}
    </span>
  )
}
