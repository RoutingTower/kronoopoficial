// Sanitizador estreito, feito sob medida pro editor de Particularidade
// (negrito/itálico/sublinhado/alinhamento — ver frontend/js/events.js,
// document.execCommand). NÃO é um sanitizador de HTML genérico: só existe
// pra fechar a brecha de stored XSS de quem burlar o toolbar e mandar HTML
// arbitrário direto pro POST /api/particularidades (ex.: <script>,
// onerror=, href="javascript:..."). Continua sendo a única defesa real —
// o toolbar do frontend nunca é a fonte da verdade de segurança.
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "div", "span", "br", "p"]);

function sanitizeParticularidadeHtml(html) {
  if (!html) return "";
  let out = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove por completo (tag E conteúdo) — conteúdo de script/style é
    // código, nunca deveria sobreviver nem como texto visível.
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed)[^>]*\/?>/gi, "");

  // Reescreve tag por tag: só passa as permitidas, e nelas só reconstrói o
  // atributo style com text-align (único que o toolbar de alinhamento
  // produz) — a partir do VALOR capturado, nunca copiando a string style
  // original. Qualquer outro atributo (onerror, href, src...) é descartado
  // porque nunca é copiado; qualquer tag fora da lista vira texto puro (a
  // tag some, o conteúdo textual entre ela fica).
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagRaw, attrs) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (tag === "br") return "<br>";
    const isClosing = match.startsWith("</");
    if (isClosing) return `</${tag}>`;
    const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i) || attrs.match(/style\s*=\s*'([^']*)'/i);
    const alignMatch = styleMatch && styleMatch[1].match(/text-align\s*:\s*(left|center|right|justify)/i);
    const styleAttr = alignMatch ? ` style="text-align:${alignMatch[1].toLowerCase()}"` : "";
    return `<${tag}${styleAttr}>`;
  });

  return out;
}

module.exports = { sanitizeParticularidadeHtml };
