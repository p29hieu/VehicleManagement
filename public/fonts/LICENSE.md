# Font licences

Both families here are redistributed under the **SIL Open Font License 1.1**, which
permits bundling them in this repository provided the licence travels with the files.

| Family | Copyright | Licence |
|---|---|---|
| Be Vietnam Pro | © Be Nguyen (Lệ Thành Nguyễn) | SIL OFL 1.1 — https://openfontlicense.org |
| IBM Plex Mono | © IBM Corp. | SIL OFL 1.1 — https://github.com/IBM/plex/blob/master/LICENSE.txt |

The `.woff2` files are the unmodified Google Fonts subsets for the `latin` and
`vietnamese` unicode-ranges. `latin-ext` is deliberately absent: every Vietnamese
character outside `latin` (ă ơ ư đ ₫ and the tone-marked vowels) lives in the
`vietnamese` subset, so the two together cover the language completely — shipping
`latin-ext` as well would add ~30 kB for nothing.

They are self-hosted rather than loaded from `fonts.gstatic.com` because the app has
to render correctly with no network at all.
