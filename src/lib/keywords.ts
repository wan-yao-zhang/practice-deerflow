const STOPWORDS = new Set([
  // EN
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by","from","as","is","are","was","were","be","been","being","it","this","that","these","those","i","you","he","she","we","they","my","your","his","her","our","their","not","no","yes","do","does","did","will","would","can","could","should","may","might","must","shall","have","has","had","if","then","else","when","where","what","which","who","whom","how","why","all","each","every","both","few","more","most","other","some","such","than","too","very","just","also","about","into","over","after","before","between","under","again","further","once","here","there","out","up","down","off","above","below","only","own","same","so","than","too","very","s","t","can","will","just","don","should","now",
  // CN common
  "的","了","在","是","我","有","和","就","不","人","都","一","一个","上","也","很","到","说","要","去","你","会","着","没有","看","好","自己","这","那","他","她","它","们","与","及","或","而","被","把","让","给","对","从","以","用","为","因","因为","所以","如果","但","但是","还","又","更","最","已","已经","可以","可能","应该","需要","进行","通过","关于","以及","其中","其它","其他","等等","一些","这些","那些","什么","怎么","如何","为什么","多少","哪个","哪些","我们","你们","他们","她们","它们",
]);

function splitTokens(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ");
  const parts: string[] = [];
  for (const chunk of normalized.split(/\s+/)) {
    if (!chunk) continue;
    // Further split long CJK runs into bigrams for recall
    if (/^[\u4e00-\u9fff]+$/.test(chunk) && chunk.length >= 2) {
      if (chunk.length <= 6) parts.push(chunk);
      for (let i = 0; i < chunk.length - 1; i++) {
        parts.push(chunk.slice(i, i + 2));
      }
      if (chunk.length >= 3) {
        for (let i = 0; i < chunk.length - 2; i++) {
          parts.push(chunk.slice(i, i + 3));
        }
      }
    } else {
      parts.push(chunk);
    }
  }
  return parts;
}

export function extractKeywords(
  title: string | null,
  description: string | null,
  h1: string | null,
  limit = 12,
): Array<{ keyword: string; weight: number }> {
  const weights = new Map<string, number>();
  const add = (text: string | null, boost: number) => {
    if (!text) return;
    for (const tok of splitTokens(text)) {
      if (tok.length < 2) continue;
      if (STOPWORDS.has(tok)) continue;
      if (/^\d+$/.test(tok)) continue;
      weights.set(tok, (weights.get(tok) || 0) + boost);
    }
  };
  add(title, 3);
  add(h1, 2);
  add(description, 1);

  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword, weight]) => ({ keyword, weight }));
}
