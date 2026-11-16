/** Deterministic lexical + entity relevance. No embeddings and no model:
 *  tokens, a small stop-word list and capitalised entities extracted from the
 *  citizen's written text. The mode is declared in `resolvedFilter`. */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'was', 'were', 'are', 'but', 'not', 'you', 'your', 'they', 'their', 'there', 'here', 'what', 'when', 'where', 'who', 'how', 'why', 'all', 'any', 'can', 'could', 'would', 'should', 'will', 'just', 'into', 'over', 'under', 'again', 'very', 'more', 'most', 'some', 'such', 'than', 'then', 'them', 'these', 'those', 'been', 'being', 'because', 'while', 'about', 'after', 'before', 'between', 'through', 'during', 'without',
  'che', 'non', 'per', 'con', 'una', 'uno', 'gli', 'della', 'delle', 'dello', 'degli', 'dei', 'del', 'nel', 'nella', 'nelle', 'negli', 'sul', 'sulla', 'sulle', 'come', 'anche', 'più', 'meno', 'sono', 'era', 'erano', 'essere', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'suo', 'sua', 'loro', 'mio', 'mia', 'tuo', 'tua', 'qui', 'qua', 'là', 'dove', 'quando', 'perché', 'cosa', 'chi', 'tutto', 'tutta', 'tutti', 'tutte', 'sempre', 'mai', 'già', 'ancora', 'dopo', 'prima', 'senza', 'tra', 'fra', 'dal', 'dalla', 'dalle', 'dagli', 'allo', 'alla', 'alle', 'agli',
  'les', 'des', 'une', 'dans', 'pour', 'avec', 'sur', 'pas', 'plus', 'mais', 'est', 'sont', 'était', 'être', 'cette', 'ces', 'qui', 'que', 'quoi', 'dont', 'où', 'quand', 'comme', 'tout', 'tous', 'toute', 'toutes', 'encore', 'déjà', 'sans', 'entre', 'chez', 'leur', 'leurs', 'nous', 'vous', 'ils', 'elles', 'mon', 'ton', 'son',
])

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  return normalized
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

const ENTITY_RE = /\b[A-ZÀ-Ý][\wÀ-ÿ'’-]{2,}(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'’-]{2,})*/g

export function extractEntities(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(ENTITY_RE)) {
    const normalized = normalizeText(match[0])
    if (!normalized || STOPWORDS.has(normalized) || normalized.length < 3) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
    if (out.length >= 24) break
  }
  return out
}

export interface StoryTextIndex {
  normalized: string
  tokens: Set<string>
  entities: Set<string>
}

export function buildTextIndex(parts: Array<string | undefined | null>): StoryTextIndex {
  const text = parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' ')
  return {
    normalized: normalizeText(text),
    tokens: new Set(tokenize(text)),
    entities: new Set(extractEntities(text)),
  }
}

export interface TextMatch {
  score: number
  matched: string[]
}

/** Query relevance: IDF-weighted token overlap + phrase bonus + entity bonus. */
export function matchText(query: string, index: StoryTextIndex, documentFrequency: Map<string, number>, corpusSize: number): TextMatch {
  const queryTokens = tokenize(query)
  if (!queryTokens.length) {
    return { score: /[\p{L}\p{N}]/u.test(query) ? (index.normalized.includes(normalizeText(query)) ? 0.6 : 0) : 0, matched: [] }
  }
  const unique = [...new Set(queryTokens)]
  let total = 0
  let hit = 0
  const matched: string[] = []
  for (const token of unique) {
    const df = documentFrequency.get(token) ?? 0
    const weight = Math.log(2 + corpusSize / (1 + df))
    total += weight
    if (index.tokens.has(token)) {
      hit += weight
      matched.push(token)
    }
  }
  let score = total > 0 ? hit / total : 0
  const phrase = normalizeText(query)
  if (phrase.length >= 4 && index.normalized.includes(phrase)) score = Math.min(1, score + 0.35)
  const queryEntities = extractEntities(query)
  for (const entity of queryEntities) {
    if (index.entities.has(entity)) {
      score = Math.min(1, score + 0.2)
      matched.push(entity)
    }
  }
  return { score: Math.min(1, score), matched: [...new Set(matched)].slice(0, 8) }
}

export interface ThemeVocabularyMatch {
  score: number
  matched: string[]
}

/** Match a pack theme's declared vocabulary against the story's written text. */
export function matchTheme(
  vocabulary: Array<string | undefined | null>,
  index: StoryTextIndex,
): ThemeVocabularyMatch {
  const matched: string[] = []
  const terms = vocabulary.filter((term): term is string => typeof term === 'string' && term.trim().length > 1)
  for (const term of terms) {
    const normalized = normalizeText(term)
    if (!normalized) continue
    const singleWord = !normalized.includes(' ')
    if (singleWord ? index.tokens.has(normalized) : index.normalized.includes(normalized)) {
      matched.push(term)
    }
  }
  if (!matched.length) return { score: 0, matched: [] }
  return { score: Math.min(1, 0.6 + 0.2 * (matched.length - 1)), matched: matched.slice(0, 6) }
}

export function documentFrequencyFor(indexes: StoryTextIndex[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const index of indexes) {
    for (const token of index.tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return counts
}
