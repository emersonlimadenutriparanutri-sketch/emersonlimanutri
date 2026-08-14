// Service worker do app do paciente.
// Faz duas coisas: cache leve do shell (para abrir offline) e Web Push.

const CACHE = 'acompanhamento-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icone.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Navegação: rede primeiro, cache como rede de segurança quando estiver offline.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')))
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request))
  )
})

self.addEventListener('push', (event) => {
  let dados = { titulo: 'Meu Acompanhamento', corpo: '', url: '/' }
  try {
    if (event.data) dados = { ...dados, ...event.data.json() }
  } catch {
    if (event.data) dados.corpo = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: '/icone.svg',
      badge: '/icone.svg',
      data: { url: dados.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      const aberta = abas.find((aba) => aba.url.includes(self.location.origin))
      if (aberta) return aberta.focus().then((c) => c.navigate(destino))
      return self.clients.openWindow(destino)
    })
  )
})
