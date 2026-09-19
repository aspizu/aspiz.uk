import {execFileSync} from "node:child_process"
import {resolve} from "node:path"

import rss from "@astrojs/rss"
import type {APIRoute} from "astro"
import {getCollection} from "astro:content"

import {getPageSlug} from "#utils/page-slug"

export const GET: APIRoute = async ({site}) => {
  const pages = new Map(
    (await getCollection("pages", (page) => !page.data.nopub)).flatMap(
      (page) =>
        page.filePath ? [[resolve(page.filePath), page] as const] : [],
    ),
  )
  const fields = execFileSync(
    "git",
    [
      "log",
      "-z",
      "--format=%x00%H%x00%cI%x00%s",
      "--numstat",
      "--ignore-all-space",
      "--ignore-blank-lines",
      "--diff-filter=AMR",
      "--find-renames",
      "--diff-merges=first-parent",
      "--root",
      "HEAD",
    ],
    {encoding: "utf8", maxBuffer: 64 * 1024 * 1024},
  ).split("\0")
  const items = []

  for (let index = 1; index + 2 < fields.length; index++) {
    const [hash, date, title] = fields.slice(index, index + 3)
    index += 3

    while (index < fields.length && fields[index] !== "") {
      const [added, deleted, ...pathParts] = fields[index++].split("\t")
      let file = pathParts.join("\t")
      let previousFile = file
      if (!file) {
        previousFile = fields[index++]
        file = fields[index++]
      }
      if (title.startsWith("nopub!")) continue

      const renamed = previousFile !== file
      const changedLines = Number(added) + Number(deleted)
      if (!renamed && (!Number.isFinite(changedLines) || changedLines < 10))
        continue

      const page = pages.get(resolve(file))
      if (!page) continue

      const patch = renamed
        ? ""
        : execFileSync(
            "git",
            [
              "--literal-pathspecs",
              "show",
              "--format=",
              "--unified=0",
              "--ignore-all-space",
              "--ignore-blank-lines",
              "--find-renames",
              "--diff-merges=first-parent",
              "--root",
              "--no-ext-diff",
              "--no-textconv",
              hash,
              "--",
              ...new Set([previousFile, file]),
            ],
            {encoding: "utf8", maxBuffer: 64 * 1024 * 1024},
          )
      let inHunk = false
      let nonBlankChanges = 0
      for (const line of patch.split("\n")) {
        if (line.startsWith("diff --git ")) inHunk = false
        else if (line.startsWith("@@ ")) inHunk = true
        else if (
          inHunk &&
          (line.startsWith("+") || line.startsWith("-")) &&
          line.slice(1).trim()
        ) {
          nonBlankChanges++
        }
      }
      if (!renamed && nonBlankChanges < 10) continue

      const slug = getPageSlug(page)
      const link = new URL(`/${slug}`, site).href
      const isNew = renamed || /^new file mode /m.test(patch)

      items.push({
        title: `${page.data.title}${isNew ? "" : " (Update)"}`,
        description: page.data.description || undefined,
        pubDate: new Date(date),
        link,
        customData: `<guid isPermaLink="false">${hash}:${encodeURIComponent(file)}</guid>`,
      })
    }
  }

  return rss({
    title: "aspiz.uk",
    description: "Updates from aspizu.",
    site: site!,
    trailingSlash: false,
    customData: "<language>en</language>",
    items,
  })
}
