import { parseBattlePacketFrame } from './battle-packet-parser.js'

export function normalizeCapturedFrame (rawFrame, sender = {}) {
  const now = Date.now()
  const textPreview = typeof rawFrame?.preview === 'string' ? rawFrame.preview : ''
  const socketIo = parseBattlePacketFrame(textPreview)
  const eventName = socketIo?.eventName || ''
  const category = socketIo ? 'event' : 'text'
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
    capturedAt: typeof rawFrame?.capturedAt === 'number' ? rawFrame.capturedAt : now,
    direction: rawFrame?.direction === 'outbound' ? 'outbound' : 'inbound',
    url: typeof rawFrame?.url === 'string' ? rawFrame.url : '',
    size: Number.isFinite(rawFrame?.size) ? rawFrame.size : 0,
    preview: typeof rawFrame?.preview === 'string' ? rawFrame.preview : '',
    category,
    eventName,
    tabId: Number.isInteger(sender?.tab?.id) ? sender.tab.id : -1,
    frameId: Number.isInteger(sender?.frameId) ? sender.frameId : -1,
  }
}