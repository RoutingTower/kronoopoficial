// Sanitizador estreito, feito sob medida pro toolbar rico compartilhado por
// Particularidade (frontend/js/events.js, particularidade) e Caixa de Envio
// (frontend/js/events.js, "Novo comunicado") — negrito/itálico/sublinhado/
// alinhamento/link, via document.execCommand + linkify em utils.js. NÃO é
// um sanitizador de HTML genérico: só existe pra fechar a brecha de stored
// XSS de quem burlar o toolbar e mandar HTML arbitrário direto pro POST
// (ex.: <script>, onerror=, href="javascript:..."). Continua sendo a única
// defesa real — o frontend nunca é a fonte da verdade de segurança.
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "div", "span", "br", "p", "a"]);

function sanitizeRichText(html) {
  if (!html) return "";
  let out = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove por completo (tag E conteúdo) — conteúdo de script/style é
    // código, nunca deveria sobreviver nem como texto visível.
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed)[^>]*\/?>/gi, "");

  // Reescreve tag por tag: só passa as permitidas, e nelas só reconstrói os
  // atributos que a gente reconhece (style com text-align, href em <a> com
  // esquema seguro) — sempre a partir do VALOR capturado, nunca copiando a
  // string de atributos original. Qualquer outro atributo (onerror, src,
  // href="javascript:..."...) é descartado porque nunca é copiado; qualquer
  // tag fora da lista vira texto puro (a tag some, o conteúdo textual
  // entre ela fica).
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagRaw, attrs) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (tag === "br") return "<br>";
    const isClosing = match.startsWith("</");
    if (isClosing) return `</${tag}>`;
    const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i) || attrs.match(/style\s*=\s*'([^']*)'/i);
    const alignMatch = styleMatch && styleMatch[1].match(/text-align\s*:\s*(left|center|right|justify)/i);
    const styleAttr = alignMatch ? ` style="text-align:${alignMatch[1].toLowerCase()}"` : "";
    let extraAttrs = "";
    if (tag === "a") {
      const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i);
      const href = hrefMatch ? hrefMatch[1].trim() : "";
      // Só http(s)/mailto — nunca javascript:, data: etc.
      if (/^(https?:|mailto:)/i.test(href)) {
        extraAttrs = ` href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer"`;
      }
    }
    return `<${tag}${styleAttr}${extraAttrs}>`;
  });

  return out;
}

module.exports = { sanitizeRichText };
