import type { NextConfig } from 'next'

// RAÍZ DE TURBOPACK — sólo para los worktrees, y por eso va por variable de entorno.
//
// Los worktrees de este repo no tienen su propio `node_modules`: lo resuelven por un symlink
// compartido que vive un nivel más arriba (scripts/ensure-worktree-node-modules.sh). Turbopack
// infiere como raíz el directorio del proyecto y entonces no encuentra `next/package.json`, o lo
// encuentra detrás de un symlink que apunta fuera de esa raíz y aborta. El build queda muerto en el
// worktree y sano en el árbol principal — un rojo que no es del código.
//
// En Vercel y en el árbol principal la variable no existe y esto no hace nada: `undefined` es el
// comportamiento por defecto. En un worktree se corre
// `NEXT_TURBOPACK_ROOT=/home/jorge/echegaray-os/app npm run build`.
const raizTurbopack = process.env.NEXT_TURBOPACK_ROOT

const nextConfig: NextConfig = {
  ...(raizTurbopack ? { turbopack: { root: raizTurbopack } } : {}),
  // ═══ POR QUÉ EL QA POR NAVEGADOR NO PODÍA PROBAR NINGÚN CLIC (medido el 10/09/2026) ═══
  //
  // `next dev` bloquea por defecto los recursos de desarrollo pedidos desde un host que no sea
  // `localhost`, y Playwright en esta VM navega a `http://127.0.0.1:<puerto>`. El servidor escribe
  // «Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1"», el
  // bundle del cliente nunca termina de cargar y LA PÁGINA NO HIDRATA: medido, cero nodos con
  // `__reactFiber$` en `/login`, `/administracion/personas` y `/clientes`.
  //
  // El modo de falla es el peor: la captura sale perfecta —el HTML del servidor está entero— y
  // cualquier prueba de interacción falla o, peor, pasa por el motivo equivocado. Un clic sobre un
  // `<button>` que corta el evento cae en el `<Link>` que lo contiene y el navegador navega a otro
  // lado; el test culpa al componente.
  //
  // SÓLO AFECTA A `next dev`. En Vercel y en `next build` esta clave no hace nada. Los dos nombres
  // porque los scripts de captura del repo usan los dos indistintamente.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Activa el MCP server en /_next/mcp (Next.js 16+)
  experimental: {
    mcpServer: true,
    // ═══ POR QUÉ MOVERSE DE SECCIÓN EN SECCIÓN VOLVÍA A RENDERIZAR TODO (11/09/2026) ═══
    //
    // El dueño, textual: *«app.ecsas.com.ar está muy lenta, parece que renderiza todo siempre que me
    // muevo de sección en sección»*. Es literal: el Client Router Cache de Next guarda el payload RSC
    // de cada pantalla visitada, y desde Next 15 su tiempo de reuso por defecto para rutas dinámicas
    // es CERO segundos (`staleTimes.dynamic: 0`, comprobado en el fuente del tag v16.2.10,
    // `config-shared.ts` → `defaultConfig.experimental`). En este OS TODAS las rutas son dinámicas —86
    // archivos con `force-dynamic`—, así que volver a Clientes después de pasar por Personal no
    // reusaba nada: otro render de servidor completo, con sus consultas a São Paulo y su pasada por el
    // middleware.
    //
    // MEDIDO A/B, EN EL MISMO ENTORNO Y CON UNA SOLA VARIABLE: dos builds de producción idénticos
    // salvo esta clave, servidos por `next start` en la misma máquina, la misma sesión y el mismo
    // recorrido (`/tmp/claude-1001/perf-1109/vuelta2.cjs`, seis saltos entre dos secciones). Se
    // cuentan sólo los pedidos RSC DEL DESTINO: al aterrizar, algunos componentes piden su propia ruta
    // y ese pedido no lo causó el clic.
    //
    //                                          dynamic: 0     dynamic: 60
    //   los 6 saltos, renders de servidor ······    9 ·············· 2
    //   las 4 VUELTAS a una pantalla ya vista ·     4 ·············· 0
    //   las 4 vueltas, tiempo total ···········  2.248 ms ······· 385 ms
    //
    // Las dos «primeras» visitas también bajaron (3→1 y 2→1). Observado en n=1 por celda y SIN
    // explicar: no se sabe qué dispara esos pedidos de más, así que no se cuenta como parte del
    // arreglo. Lo que sí está establecido es la fila de las vueltas.
    //
    // ═══ 60 SEGUNDOS: QUÉ SE GANA Y QUÉ SE ACEPTA ═══
    //
    // Esto NO es un caché de datos del servidor: es el payload de UNA pantalla que esta persona acaba
    // de ver, en SU navegador, y muere al recargar.
    //
    // LO QUE SE ACEPTA, SIN adornarlo: si OTRO actor —el bot, un timer, un worker, otra persona—
    // cambia el dato mientras tanto, volver a esa pantalla dentro de los 60 s muestra el estado
    // anterior. Una escritura hecha DESDE el navegador no tiene ese problema: las Server Actions del
    // OS llaman `revalidatePath`/`revalidateTag`, y eso —igual que entrar y salir de la sesión—
    // invalida el caché entero. `router.refresh()` (30 usos, entre ellos el auto-refresh de `/os`)
    // tampoco lo lee.
    //
    // Y EL RIESGO NO ES NUEVO: el botón atrás/adelante del navegador ya servía la pantalla anterior
    // ignorando este tiempo (`bfcache.js` de Next). Lo que cambia es que ahora también lo hace el clic
    // en la barra, durante un minuto.
    //
    // POR QUÉ UN MINUTO Y NO MÁS: la ventana sale del uso real —el dueño rebota entre dos secciones en
    // segundos—, y `router-cache.test.ts` fija los dos bordes, porque los dos son defectos: 0 es el de
    // hoy, y un número grande es el de mañana, peor, porque no se siente lento sino rápido y viejo.
    //
    // `static: 300` es el default de Next y se escribe para que se vea que se decidió mirarlo — su
    // schema además rechaza cualquier valor menor a 30.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
  // LO QUE NO PUEDE VIAJAR ADENTRO DE UNA FUNCIÓN SERVERLESS.
  //
  // Medido el 09/09 sobre las trazas del build (`.next/server/**/*.nft.json`): el conjunto de
  // archivos que Vercel sube pesaba 85,6 MB, y 73,3 MB de ese total los arrastraba UNA sola ruta,
  // `/portal/recibo/[id]`. No es que use tanto: importa `orquestador/lib/config.mjs`, que calcula
  // `APP_DIR = resolve(HERE, '..', '..')` y lee `.env.local` de ahí. El trazador no puede saber qué
  // archivo de ese directorio hace falta, así que se lleva el directorio entero — capturas de QA de
  // 1,7 MB cada una, 395 migraciones .sql, 1.266 archivos de test, la documentación.
  //
  // 41,9 MB de los 85,6 eran eso. Nada de esto se ejecuta en producción: los .sql los aplica el CLI
  // de Supabase, los .png los mira una persona y los tests corren en la VM.
  //
  // Los patrones van con `**/` adelante a propósito: se evalúan contra la raíz de trazado, que no es
  // la misma en Vercel (el Root Directory `echegaray-os`) que en un worktree local (donde
  // NEXT_TURBOPACK_ROOT la sube un nivel). Un patrón anclado funcionaría en un lado y en el otro no.
  //
  // `orquestador/` NO está: 23 archivos de `src/` importan `orquestador/lib` y
  // `orquestador/comunicacion`, y esos a su vez importan `../engines/`, `../handlers/` y
  // `../../scripts/`. Excluirlo rompería el runtime, no lo adelgazaría.
  outputFileTracingExcludes: {
    '**': [
      '**/qa-shots/**',
      '**/tests/**',
      '**/test-results/**',
      '**/QA_OUT/**',
      '**/capturas/**',
      '**/.qa-reports/**',
      '**/docs/**',
      '**/.claude/**',
      '**/supabase/migrations/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.test.mjs',
      '**/*.test.js',
      '**/*.spec.ts',
      '**/*.md',
    ],
  },
}

export default nextConfig
