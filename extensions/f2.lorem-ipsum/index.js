// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Lorem ipsum: placeholder paragraphs, sentences and words, as many as are
// typed ("lorem 3", "lorem 20 words"), made up fresh each time from the
// classic text's Latin. Nothing's fetched.

const WORDS = `a ac accumsan ad adipiscing aenean aliqua aliquam aliquet aliquip amet anim ante arcu at auctor augue aute
bibendum blandit cillum commodo condimentum congue consectetur consequat convallis cras culpa cupidatat curabitur cursus
dapibus deserunt diam dictum dignissim dolor dolore donec dui duis egestas eget eiusmod eleifend elementum elit enim erat
eros esse est et etiam eu euismod ex excepteur exercitation facilisis fames faucibus felis fermentum feugiat fringilla
fugiat fusce gravida hendrerit iaculis id imperdiet in incididunt integer interdum ipsum irure justo labore laboris
laborum lacinia lacus laoreet lectus leo libero ligula lobortis lorem luctus maecenas magna malesuada massa mattis mauris
metus mi minim molestie mollis morbi nam nec neque nibh nisi nisl non nostrud nulla nullam nunc occaecat odio officia
orci ornare pariatur pellentesque pharetra phasellus placerat porta porttitor posuere praesent pretium proident proin
pulvinar purus quam quis quisque reprehenderit rhoncus risus rutrum sagittis sapien scelerisque sed sem semper sint sit
sodales sollicitudin sunt suscipit suspendisse tellus tempor tempus tincidunt tortor tristique turpis ullamco ullamcorper
ultrices ultricies urna ut varius vehicula vel velit veniam venenatis vestibulum vitae vivamus viverra voluptate volutpat
vulputate`.split(/\s+/)
const FIRST = "Lorem ipsum dolor sit amet, consectetur adipiscing elit."

/** A whole number from lo to hi. @param {number} lo @param {number} hi */
const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))
/** @param {string} s */
const capital = (s) => s[0].toUpperCase() + s.slice(1)

/** n of its words, none twice in a row. @param {number} n */
function words(n) {
  /** @type {string[]} */
  const out = []
  while (out.length < n) {
    const w = WORDS[Math.floor(Math.random() * WORDS.length)]
    if (w !== out[out.length - 1]) out.push(w)
  }
  return out
}

/** A sentence of 6 to 15 words, with a comma in about half. */
function sentence() {
  const w = words(between(6, 15))
  if (w.length > 8 && Math.random() < 0.5) w[between(2, w.length - 4)] += ","
  return `${capital(w.join(" "))}.`
}

/** n sentences, the classic one first. @param {number} n @param {boolean} classic */
const sentences = (n, classic) => Array.from({ length: n }, (_, i) => (classic && i === 0 ? FIRST : sentence())).join(" ")

// Each kind: what one's called, its symbol, the most made, how many with nothing typed, and how it's made.
/** @type {Record<string, { one: string, icon: string, most: number, usual: number, make: (n: number, classic: boolean) => string }>} */
const KINDS = {
  paragraphs: {
    one: "paragraph",
    icon: "text.alignleft",
    most: 100,
    usual: 3,
    make: (n, classic) => Array.from({ length: n }, (_, i) => sentences(between(4, 7), classic && i === 0)).join("\n\n"),
  },
  sentences: { one: "sentence", icon: "text.quote", most: 500, usual: 5, make: sentences },
  words: {
    one: "word",
    icon: "textformat.abc",
    most: 5000,
    usual: 50,
    make: (n, classic) => {
      const first = classic ? FIRST.replace(/[,.]/g, "").toLowerCase().split(" ").slice(0, n) : []
      return capital([...first, ...words(n - first.length)].join(" "))
    },
  },
}

/** A row of n of a kind, its text new. @param {string} kind @param {number} n */
function row(kind, n) {
  const k = KINDS[kind]
  n = Math.min(Math.max(n, 1), k.most)
  const text = k.make(n, f2.preferences.classic !== false)
  const count = text.split(/\s+/).length
  const html = text.split("\n\n").map((p) => `<p>${p}</p>`).join("\n")
  return {
    title: `${n.toLocaleString("en-US")} ${n === 1 ? k.one : kind}`,
    icon: k.icon,
    accessory: kind === "words" ? `${text.length.toLocaleString("en-US")} characters` : `${count.toLocaleString("en-US")} words`,
    detail: {
      markdown: text,
      metadata: [
        { label: "Words", text: count.toLocaleString("en-US") },
        { label: "Characters", text: text.length.toLocaleString("en-US") },
      ],
    },
    actions: [
      { title: "Copy", copy: text, icon: "doc.on.doc" },
      { title: "Copy as HTML", copy: html, icon: "chevron.left.forwardslash.chevron.right" },
    ],
  }
}

f2.command("generate", ({ query }) => {
  const q = query.trim().toLowerCase()
  // "3", "3 words", "20w", "words 3" or "words": a count, a kind, or both.
  const asked = /^(?:(\d+)\s*([a-z]*)|([a-z]+)\s*(\d*))$/.exec(q)
  const n = asked ? Number(asked[1] ?? asked[4]) || 0 : 0
  const unit = asked ? (asked[2] ?? asked[3] ?? "") : ""
  const first = unit ? Object.keys(KINDS).find((k) => k.startsWith(unit)) : undefined
  if (q && (!asked || (unit && !first))) {
    f2.show({
      items: [{ title: `“${query.trim()}” isn't a count`, subtitle: "Type how many: “lorem 3”, or “lorem 20 words”", icon: "questionmark.circle" }],
      loading: false,
    })
    return
  }
  const kinds = first ? [first, ...Object.keys(KINDS).filter((k) => k !== first)] : Object.keys(KINDS)
  f2.show({ items: kinds.map((k) => row(k, n || KINDS[k].usual)), placeholder: "How many? 3, or 20 words…", loading: false })
})
