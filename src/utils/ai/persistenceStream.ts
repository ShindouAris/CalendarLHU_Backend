import { createUIMessageStream, createUIMessageStreamResponse, consumeStream, type UIMessageStreamWriter, type UIMessage } from 'ai';

export function persistenceResponse(inner: (writer: UIMessageStreamWriter<UIMessage>) => ReadableStream) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({ execute: ({ writer }) => { writer.merge(inner(writer)); } }),
    consumeSseStream: consumeStream,
  });
}
