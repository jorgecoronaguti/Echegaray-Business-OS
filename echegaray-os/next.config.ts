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
    // muevo de sección en sección»*. Es literal, y no era una impresión: el Client Router Cache de
    // Next guarda el payload RSC de cada pantalla visitada, y desde Next 15 su tiempo de reuso por
    // defecto para rutas dinámicas es CERO segundos (`staleTimes.dynamic: 0`, comprobado en el
    // fuente del tag v16.2.10: `config-shared.ts` `defaultConfig.experimental`). En este OS TODAS las
    // rutas son dinámicas —86 archivos con `force-dynamic`—, así que volver a Clientes después de
    // pasar por Obras no reusaba nada: era otro render de servidor completo, con sus consultas a São
    // Paulo y su pasada por el middleware.
    //
    // Ir y volver entre dos secciones costaba, medido en pantallas, cuatro renders donde alcanzaban
    // dos.
    //
    // ═══ 60 SEGUNDOS, Y POR QUÉ ESE NÚMERO NO ES UN CACHÉ DE DATOS ═══
    //
    // Esto NO cachea datos económicos: cachea el payload de UNA pantalla que la persona acaba de
    // ver, en SU navegador, durante un minuto, y muere al recargar. La ventana sale del uso real: el
    // dueño rebota entre dos secciones en segundos, no en horas. Más corto no llega a cubrir el
    // rebote; mucho más largo empieza a mostrar como fresco un número que envejeció.
    //
    // Y NO SOBREVIVE A UNA ESCRITURA: las 73 Server Actions del OS que guardan algo llaman a
    // `revalidatePath`/`revalidateTag`, y eso invalida el Router Cache del cliente además del caché
    // del servidor. O sea: lo que se reusa es una pantalla que nadie modificó.
    //
    // `static: 300` es el default de Next y se escribe para que se vea que se decidió mirarlo — el
    // schema de Next además rechaza cualquier valor menor a 30.
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
