// Latest video always scanned; two older videos round-robin. Catalog only from own account.
export function selectGuardVideos(latest, catalog, ownerUid, cursor = 0, batch = 2) {
  const valid = v => typeof v === 'string' && /^BV[0-9A-Za-z]{10}$/.test(v)
  const first = [...new Set(latest.filter(valid))].slice(0, 1)
  if (!catalog || catalog.ownerUid !== ownerUid || catalog.complete !== true || !Array.isArray(catalog.videos)) {
    return { bvids: first, cursor: 0 }
  }
  const all = [...new Set(catalog.videos.map(v => v.bvid).filter(valid))]
  const old = all.filter(b => !first.includes(b))
  const start = Math.max(0, Number(cursor) || 0) % Math.max(1, old.length)
  const picked = Array.from({ length: Math.min(batch, old.length) }, (_, i) => old[(start + i) % old.length])
  return { bvids: [...first, ...picked], cursor: old.length ? (start + picked.length) % old.length : 0 }
}
