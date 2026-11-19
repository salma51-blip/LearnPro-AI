export function sanitizeAnimatedSvg(rawSvg: string | undefined | null): string | null {
  if (!rawSvg || typeof rawSvg !== 'string') return null;

  let svg = rawSvg.trim();
  // Strip markdown code fences if present
  svg = svg.replace(/^```(?:svg|xml|html)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const startIdx = svg.search(/<svg[\s>]/i);
  const endIdx = svg.toLowerCase().lastIndexOf('</svg>');
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }
  svg = svg.slice(startIdx, endIdx + 6);

  // Strip dangerous tags and event handlers
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');

  // Must contain actual vector shapes
  if (!/<(path|circle|rect|ellipse|polygon|polyline|line|g)\b/i.test(svg)) {
    return null;
  }

  // Normalize root <svg> sizing so it always scales crisply inside its container
  svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    let cleanedAttrs = attrs
      .replace(/\s(width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
      .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    if (!/viewBox\s*=/i.test(cleanedAttrs)) {
      cleanedAttrs += ' viewBox="0 0 680 380"';
    }
    return `<svg${cleanedAttrs} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  });

  return svg;
}
