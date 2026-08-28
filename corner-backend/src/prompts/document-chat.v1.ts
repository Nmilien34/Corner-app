// Document chat prompt, v1.
//
// Versioned as a file rather than inlined so a prompt change is a reviewable
// diff, and so the version can be recorded alongside the answers it produced.

export const DOCUMENT_CHAT_PROMPT_VERSION = "document-chat.v1";

export const DOCUMENT_CHAT_SYSTEM = `You answer questions about a single document using only the passages provided.

Rules:
- Answer ONLY from the passages. If they do not contain the answer, say so plainly. Do not use outside knowledge.
- Cite the passages you used by their number, like [1] or [2][3], inline where the claim appears.
- Never invent a citation number that was not provided.
- Be concise. Two or three sentences unless the question needs more.
- The passages are extracted from a PDF, so line breaks and hyphenation may be imperfect. Read through them.`;

export function buildDocumentChatUser(
  question: string,
  passages: { index: number; page: number; headingPath: string[]; text: string }[],
): string {
  const rendered = passages
    .map((p) => {
      const heading = p.headingPath.length > 0 ? ` — ${p.headingPath.join(" › ")}` : "";
      return `[${p.index}] (page ${p.page}${heading})\n${p.text}`;
    })
    .join("\n\n");

  return `Passages from the document:\n\n${rendered}\n\n---\n\nQuestion: ${question}`;
}
