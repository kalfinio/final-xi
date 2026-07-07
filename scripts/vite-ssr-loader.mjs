import { createServer } from 'vite'

export async function loadViteModule(modulePath) {
  const server = await createServer({
    configFile: './vite.config.js',
    server: { middlewareMode: true },
    logLevel: 'silent',
  })
  try {
    return await server.ssrLoadModule(modulePath)
  } finally {
    await server.close()
  }
}
