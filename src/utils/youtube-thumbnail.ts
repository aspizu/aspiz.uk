import {mkdir, readFile, rename, writeFile} from "node:fs/promises"
import {join} from "node:path"

import type {AstroIntegration} from "astro"

const thumbnailNames = [
  "maxresdefault",
  "sddefault",
  "hqdefault",
  "mqdefault",
  "default",
]

const cache = new Map<string, Promise<string>>()
const cacheDirectory = join(process.cwd(), ".cache")
const cacheFile = join(cacheDirectory, "youtube-thumbnails.json")
// Astro loads config and page modules separately; share the cache across both.
const stateKey = Symbol.for("aspiz.uk.youtube-thumbnails")
const shared = globalThis as typeof globalThis & {
  [stateKey]?: {entries: Promise<Map<string, string>>; dirty: boolean}
}
const state = (shared[stateKey] ??= {
  dirty: false,
  entries: readFile(cacheFile, "utf8")
    .catch((error) => {
      if (error.code === "ENOENT") return "{}"
      throw error
    })
    .then((text) => {
      try {
        const entries = JSON.parse(text)
        if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
          return new Map<string, string>()
        }
        return new Map<string, string>(
          Object.entries(entries).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string" && thumbnailNames.includes(entry[1]),
          ),
        )
      } catch {
        return new Map<string, string>()
      }
    }),
})

export const youtubeThumbnailCache: AstroIntegration = {
  name: "youtube-thumbnail-cache",
  hooks: {
    "astro:build:done": async () => {
      if (!state.dirty) return
      const entries = await state.entries
      await mkdir(cacheDirectory, {recursive: true})
      const temporaryFile = `${cacheFile}.${process.pid}.tmp`
      await writeFile(
        temporaryFile,
        `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`,
      )
      await rename(temporaryFile, cacheFile)
      state.dirty = false
    },
  },
}

export function getYouTubeThumbnailUrl(videoId: string) {
  if (!cache.has(videoId)) {
    cache.set(
      videoId,
      (async () => {
        const entries = await state.entries
        const cachedName = entries.get(videoId)

        if (cachedName && thumbnailNames.includes(cachedName)) {
          return `https://img.youtube.com/vi/${videoId}/${cachedName}.jpg`
        }

        // Probe in quality order and stop at the first available thumbnail.
        /* eslint-disable no-await-in-loop */
        for (const name of thumbnailNames) {
          const url = `https://img.youtube.com/vi/${videoId}/${name}.jpg`
          if (!(await fetch(url, {method: "HEAD"})).ok) continue

          entries.set(videoId, name)
          state.dirty = true
          return url
        }
        /* eslint-enable no-await-in-loop */

        throw new Error(`No thumbnail found for YouTube video: ${videoId}`)
      })(),
    )
  }
  return cache.get(videoId)!
}
