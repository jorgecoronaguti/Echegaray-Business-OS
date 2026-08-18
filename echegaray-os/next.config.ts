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
  // Activa el MCP server en /_next/mcp (Next.js 16+)
  experimental: {
    mcpServer: true,
  },
}

export default nextConfig
