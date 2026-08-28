// Document chat: retrieve, answer, cite.
//
// Citations are the product here, not decoration — an answer the reader cannot
// verify against the page is worth less than no answer. So every citation
// carries a resolvable PageSpan, decomposed server-side, and the model is
// constrained to cite only passages it was actually given.

import type { PageSpan } from "@corner/shared";
import { Types } from "mongoose";

import { AppError } from "../lib/errors";
import { ChatMessageModel, ChatThreadModel, DocumentContentModel } from "../models";
import {
  buildDocumentChatUser,
  DOCUMENT_CHAT_PROMPT_VERSION,
  DOCUMENT_CHAT_SYSTEM,
} from "../prompts/document-chat.v1";
import { CHAT_MODEL, createLlmService, LLM_PROVIDER } from "./llm.service";
import { createRetrievalService } from "./retrieval.service";
import { createUsageService } from "./usage.service";

export interface ChatCitationOut {
  index: number;
  chunkId: string;
  span: PageSpan;
  headingPath: string[];
  snippet: string;
  score: number;
}

export interface ChatAnswer {
  threadId: string;
  messageId: string;
  answer: string;
  citations: ChatCitationOut[];
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
}

const RETRIEVAL_LIMIT = 6;
const SNIPPET_CHARS = 240;

export function createChatService() {
  const retrieval = createRetrievalService();
  const llm = createLlmService();
  const usage = createUsageService();

  return {
    async ask(input: {
      ownerId: string;
      documentId: string;
      contentId: string;
      parseVersion: number;
      question: string;
      threadId?: string;
    }): Promise<ChatAnswer> {
      const content = await DocumentContentModel.findById(input.contentId)
        .select({ pageOffsets: 1, normalizedTextLength: 1, parseStatus: 1 })
        .lean();

      if (!content || content.parseStatus !== "parsed") {
        throw new AppError("document_not_parsed", "Document is not parsed yet", 409);
      }

      const hits = await retrieval.search({
        contentId: input.contentId,
        parseVersion: input.parseVersion,
        query: input.question,
        limit: RETRIEVAL_LIMIT,
      });

      if (hits.length === 0) {
        throw new AppError(
          "no_passages",
          "No passages found — the document may not be embedded yet",
          409,
        );
      }

      const passages = hits.map((h, i) => ({
        index: i + 1,
        page: h.spans[0]?.page ?? 1,
        headingPath: h.headingPath,
        text: h.text,
      }));

      const completion = await llm.complete({
        messages: [
          { role: "system", content: DOCUMENT_CHAT_SYSTEM },
          { role: "user", content: buildDocumentChatUser(input.question, passages) },
        ],
      });

      // Only citations the model actually used, in the order it used them.
      // Returning all retrieved passages would present unused context as
      // evidence for the answer.
      const cited = new Set(
        [...completion.content.matchAll(/\[(\d+)\]/g)]
          .map((m) => Number(m[1]))
          .filter((n) => n >= 1 && n <= hits.length),
      );

      const citations: ChatCitationOut[] = [...cited]
        .sort((a, b) => a - b)
        .map((index) => {
          const hit = hits[index - 1]!;
          return {
            index,
            chunkId: hit.chunkId,
            // Already decomposed by the retrieval service; take the first page
            // so a tap has one unambiguous destination.
            span: hit.spans[0] as PageSpan,
            headingPath: hit.headingPath,
            snippet: hit.text.slice(0, SNIPPET_CHARS),
            score: hit.score,
          };
        })
        .filter((c) => c.span !== undefined);

      // Thread and messages
      const thread = input.threadId
        ? await ChatThreadModel.findOne({
            _id: input.threadId,
            ownerId: new Types.ObjectId(input.ownerId),
          })
        : null;

      const activeThread =
        thread ??
        (await ChatThreadModel.create({
          documentId: input.documentId,
          ownerId: input.ownerId,
          title: input.question.slice(0, 120),
        }));

      await ChatMessageModel.create({
        threadId: activeThread._id,
        documentId: input.documentId,
        ownerId: input.ownerId,
        role: "user",
        content: input.question,
        parseVersion: input.parseVersion,
      });

      const answer = await ChatMessageModel.create({
        threadId: activeThread._id,
        documentId: input.documentId,
        ownerId: input.ownerId,
        role: "assistant",
        content: completion.content,
        parseVersion: input.parseVersion,
        tokensIn: completion.tokensIn,
        tokensOut: completion.tokensOut,
        citations: citations.map((c) => ({
          chunkId: c.chunkId,
          page: c.span.page,
          charStart: c.span.charStart,
          charEnd: c.span.charEnd,
          snippet: c.snippet,
        })),
      });

      await ChatThreadModel.updateOne(
        { _id: activeThread._id },
        { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } },
      );

      // Accounting must never fail an answer the user already received and
      // that Corner already paid for. Same reasoning as embed-chunks.
      for (const [unit, units] of [
        ["tokens_in", completion.tokensIn],
        ["tokens_out", completion.tokensOut],
      ] as const) {
        try {
          await usage.record({
            ownerId: input.ownerId,
            feature: "chat",
            unit,
            units,
            provider: LLM_PROVIDER,
            providerModel: CHAT_MODEL,
            contentId: input.contentId,
            documentId: input.documentId,
          });
        } catch {
          // recorded as a warning by the caller's logger if it matters
        }
      }

      return {
        threadId: String(activeThread._id),
        messageId: String(answer._id),
        answer: completion.content,
        citations,
        promptVersion: DOCUMENT_CHAT_PROMPT_VERSION,
        tokensIn: completion.tokensIn,
        tokensOut: completion.tokensOut,
      };
    },
  };
}
