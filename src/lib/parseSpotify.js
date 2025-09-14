import dayjs from 'dayjs'

// Returns an array of normalized plays: {ts, ms, track, artist}
export async function readFiles(files) {
  const list = Array.from(files)
  const all = []

  for (const f of list) {
    const text = await f.text()
    const json = JSON.parse(text)

    for (const row of json) {
      // New export (endsong_*.json)
      if ('ts' in row) {
        all.push({
          ts: row.ts ? dayjs(row.ts).valueOf() : 0,
          ms: row.ms_played ?? 0,
          track: row.master_metadata_track_name ?? 'Unknown',
          artist: row.master_metadata_album_artist_name ?? 'Unknown'
        })
      } else {
        // Old export (StreamingHistory*.json)
        all.push({
          ts: row.endTime ? dayjs(row.endTime).valueOf() : 0,
          ms: row.msPlayed ?? 0,
          track: row.trackName ?? 'Unknown',
          artist: row.artistName ?? 'Unknown'
        })
      }
    }
  }

  const ok = all.filter(p => Number.isFinite(p.ts))
  ok.sort((a, b) => a.ts - b.ts)
  return ok
}

// Map plays to scatter points (x = day index from t0, y = hour float)
export function playsToPoints(plays) {
  if (!plays.length) return { points: [], x0: 0, x1: 1, y0: 0, y1: 24, t0: 0 }

  const dayMs = 24 * 60 * 60 * 1000
  const t0 = Math.floor(plays[0].ts / dayMs) * dayMs

  const points = plays.map(p => {
    const dayIndex = Math.floor((p.ts - t0) / dayMs)
    const d = new Date(p.ts)
    const hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
    return { x: dayIndex, y: hour, ts: p.ts, ms: p.ms, artist: p.artist, track: p.track }
  })

  const xMax = Math.max(...points.map(p => p.x))
  return { points, x0: 0, x1: xMax, y0: 0, y1: 24, t0 }
}
