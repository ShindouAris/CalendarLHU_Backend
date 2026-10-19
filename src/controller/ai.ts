import {getStudentScheduleTool, getNextClassTool, getExamScheduleTool} from "../utils/ai/tools/calen";
import { weatherCurrentTool, weatherForecastTool,weatherForecastDayTool} from "../utils/ai/tools/weather";
import {extractWebTool, searchWebTool} from "../utils/ai/tools/web";
import {stepCountIs, streamText, ToolSet, UIMessage, convertToModelMessages, gateway, generateId, UIMessagePart, consumeStream} from "ai";
import { createDeepSeek, type DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek"
import {LmsDiemDanhTool} from "../utils/ai/tools/lms";
import {  
  getElibThongSoTool,
  getElibRoomConfigurationTool,
  getElibUserBookingListTool,
  getElibReservationByDayTool,
  getElibPhongHocForRegTool,
  getElibThietBiForRegTool
} from "../utils/ai/tools/elib";
import {status} from "elysia";
import { encryptLoginData } from "../utils/encryptor";
import { persistenceResponse } from "../utils/ai/persistenceStream";
import { validateChatInput, chatLimits } from "../utils/ai/guards";
import { verifySession } from "../utils/ai/session";
import {UserResponse} from "../types/user";
import {userApi} from "../utils/ai/tools/user";
import {LRUCache} from "../utils/lruCache";
import { prisma } from "../databases";
import {
  getOrCreateChatForUser,
  getChatForUser,
  getChatForUserByUUID,
  createChatForUser,
  upsertMessages,
} from "../databases/services/chatQueries";
import { addToBuffer } from "../databases/services/messageBufferService";
import { MessageRole } from "@prisma/client";
import {buildSystemPrompt} from "../utils/ai/system/prompt";


const MODEL_NAME_MAPPING: Record<string, string> = {
  // "ChisaAI": "openai/gpt-oss-120b",
  "ChisaAI": "deepseek-v4-flash"
}

const REVERSE_MODEL_MAPPING: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_NAME_MAPPING).map(([k, v]) => [v, k])
)
const tool_v2_for_chisa: ToolSet = {
    searchWebTool,
    extractWebTool,
    getNextClassTool,
    getExamScheduleTool,
    getStudentScheduleTool,
    weatherForecastTool,
    weatherForecastDayTool,
    weatherCurrentTool,
    LmsDiemDanhTool,
    getElibThongSoTool,
    getElibRoomConfigurationTool,
    getElibUserBookingListTool,
    getElibReservationByDayTool,
    getElibPhongHocForRegTool,
    getElibThietBiForRegTool,
}

/** Tool metadata for frontend rendering (tool-call UI, etc.). */
export function getToolsForFrontend(): { name: string; description: string }[] {
  return Object.entries(tool_v2_for_chisa).map(([name, t]) => ({
    name,
    description: (t as { description?: string }).description ?? "",
  }));
}

/** Get available models with safe display names */
export function getAvailableModels(): { safeName: string; modelId: string; isDefault: boolean }[] {
  return Object.entries(MODEL_NAME_MAPPING).map(([safeName, modelId]) => ({
    safeName,
    modelId,
    isDefault: modelId === "deepseek-v4-flash", // Mark default model
  }));
}

class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async lock() {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  unlock() {
    const next = this.queue.shift();
    if (next) next();
    else this.locked = false;
  }
}


class UserCache extends LRUCache<string, UserResponse> {
    constructor() {
        super(250, 3600); // Cache up to 250 users, expire after 60 minutes (reduced from 500/120min)
    }
  private mutex = new Mutex();

  async getUserData(userID: string) {
    await this.mutex.lock();
    try {
      const cachedUser = this.get(userID);
      if (cachedUser) {
        return cachedUser;
      }

      // Fallback to DB
      try {
        const dbUser = await prisma.user.findUnique({
          where: { userID },
        });
        if (dbUser) {
            // When loading from DB, we only have partial data (userID, fullName, class, departmentName).
            // Cast it to UserResponse carefully or ensure consumers handle missing fields.
            const user = {
              UserID: dbUser.userID,
              FullName: dbUser.fullName,
              Class: dbUser.class,
              DepartmentName: dbUser.departmentName,
            } as unknown as UserResponse;
            this.put(userID, user);
            return user;
        }
      } catch (e) {
          console.error("DB Fetch Error", e);
      }
      return null;
    } finally {
      this.mutex.unlock();
    }
  }

  async setUserData(userID: string, data: UserResponse) {
    await this.mutex.lock();
    try {
      this.put(userID, data);
      // Sync to DB (Only save selected fields)
      try {
        const dbData = {
            userID: data.UserID,
            fullName: data.FullName,
            class: data.Class,
            departmentName: data.DepartmentName
        };
        await prisma.user.upsert({
          where: { userID },
          update: dbData,
          create: dbData,
        });
      } catch(e) {
        console.error("DB Save Error", e);
      }
    } finally {
      this.mutex.unlock();
    }
  }
}


const usercacheBuffer = new UserCache();


export const chisaAIV2_Chat = async (req: any) => {

    if (!validateChatInput(req)) return status(400, { error: 'Invalid or oversized chat input' });
    let session;
    try { session = verifySession(req.access_token || req.accessToken); }
    catch { return status(401, { error: "Invalid or expired AI session" }); }
    req.user_id = session.sub;
    const access_token = session.school;
    if (typeof req.id !== 'string' || !req.id || req.id.length > 128 || !Array.isArray(req.messages) || req.messages.length > 200) return status(400);
    const release = chatLimits.acquire(session.sub);
    if (!release) return status(429, { error: 'Too many AI requests' });
    let streaming = false;
    const abort = () => release();
    req.signal?.addEventListener('abort', abort, { once: true });
    try {
    if (req.signal?.aborted) return status(400);
    let ownedChat = await getChatForUserByUUID(req.id, session.sub) || await getChatForUser(req.id, session.sub);
    if (!ownedChat) {
      const collision = await prisma.chat.findFirst({ where: { OR: [{id:req.id},{chatID:req.id}] } });
      if (collision) return status(404);
      ownedChat = await createChatForUser(session.sub, req.id);
    }
    if (!ownedChat) return status(404);
    if (req.trigger === 'regenerate-message') {
      if (typeof req.messageId !== 'string') return status(400);
      const target = await prisma.message.findFirst({where: {id:req.messageId, chatId:ownedChat.id, role:'assistant'}});
      if (!target) return status(404);
    }

    const selectedModel = req['model'] as string | undefined;

    // Only accept safe names, no direct model IDs allowed
    let modelToUse = "deepseek-v4-flash"; // Default
    if (selectedModel) {
      const mappedModel = MODEL_NAME_MAPPING[selectedModel];
      if (mappedModel) {
        modelToUse = mappedModel;
      } else {
        // Invalid model name, use default but log warning
        console.warn(`Invalid model name provided: ${selectedModel}. Using default.`);
      }
    }

    let sysPrompt;
    const {id, messages, trigger, messageId }: {id: string; messages: UIMessage[]; trigger?: "submit-message" | "regenerate-message"; messageId?: string} = req;
    console.log("chisaAIV2_Chat called for user ", req['user_id'], " with chat id ", id)

    try {
        const precachedUser = await usercacheBuffer.getUserData(req['user_id'])
        if (precachedUser) {
            sysPrompt = buildSystemPrompt(precachedUser, "")
            console.log("Cache hit for user ", precachedUser.UserID)
        } else {
            return status(404, { error: "Create AI user first" });
        }
    } catch (error) {
        return status("Unauthorized", "Bạn không có quyền truy cập vào Chisa AI. Vui lòng đăng nhập lại.")
    }

    const provider = createDeepSeek({
      apiKey: process.env.DEESEEK_API_KEY || "",
    })


    const stream = streamText({
        model: provider(modelToUse),
        system: sysPrompt,
        messages: await convertToModelMessages(messages),
        tools: Object.fromEntries(Object.entries(tool_v2_for_chisa).map(([name, definition]) => {
          const original = definition as any;
          const shape = original.inputSchema?.shape;
          const field = shape?.accessToken ? 'accessToken' : shape?.access_token ? 'access_token' : null;
          if (!field) return [name, definition];
          return [name, { ...original, inputSchema: original.inputSchema.omit({ [field]: true }),
            execute: (args: any, options: any) => original.execute({ ...args, [field]: encryptLoginData(access_token) }, options) }];
        })),
        abortSignal: req.signal,
        onError: () => release(),
        onAbort: () => release(),
        providerOptions: {
        deepseek: {
          thinking: { type: 'disabled' },
          reasoningEffort: 'low',
        } satisfies DeepSeekLanguageModelOptions,
      },
        stopWhen: stepCountIs(15),
    });

    const response = persistenceResponse(writer => stream.toUIMessageStream({
      originalMessages: messages,
      generateMessageId: () => crypto.randomUUID(),

      onFinish: async (msg) => {

        const userId = req['user_id'] as string | undefined;
        if (!userId) {
          console.log('[onFinish] Missing identity');
          return;
        }

        try {
          const allMessages = msg.messages;
          console.log('[onFinish] allMessages count:', allMessages.length, 'isAborted:', (msg as any).isAborted);

          let lastAssistant: any = null;
          let lastUser: any = null;

          for (let i = allMessages.length - 1; i >= 0; i--) {
            const m = allMessages[i] as any;

            if (!lastAssistant && m?.role === 'assistant' && Array.isArray(m.parts)) {
              lastAssistant = m;
              continue;
            }
            if (!lastUser && m?.role === 'user' && Array.isArray(m.parts)) {
              lastUser = m;
              continue;
            }

            if (lastAssistant && lastUser) break;
          }

          const chat = ownedChat;

          const actualTrigger = trigger;
          const actualMessageId = messageId;

          const messagesToSave: Array<{
            id?: string;
            role: MessageRole;
            parts: UIMessagePart<Record<string, any>, Record<string, any>>[];
          }> = [];

          // Only insert user message if NOT a regenerate trigger
          if (actualTrigger !== 'regenerate-message' && lastUser) {
            messagesToSave.push({
              id: lastUser.id,
              role: 'user',
              parts: lastUser.parts,
            });
          }

          if (lastAssistant) {
            messagesToSave.push({
              id: lastAssistant.id,
              role: 'assistant',
              parts: lastAssistant.parts,
            });
          }

          // Message contents can contain private student data; do not log them.

          if (messagesToSave.length > 0) {
            await upsertMessages(chat.id, messagesToSave, actualTrigger === "regenerate-message" ? actualMessageId : undefined);
          }
        } catch (err) {
          console.error("Failed to save chat history in toUIMessageStreamResponse", err);
          writer.write({ type: "data-persistence-error", data: { message: "Không thể lưu lịch sử trò chuyện" }, transient: true });
        } finally {
          release();
          req.signal?.removeEventListener('abort', abort);
        }
      },
    }));
    streaming = true;
    return response;
    } finally {
      if (!streaming) { release(); req.signal?.removeEventListener('abort', abort); }
    }
  };

export const checkAvailability = async () => {
    const credit = await gateway.getCredits()
    if (Number(credit.balance) <= 0.01) {
        return {
            available: false,
        }
    }
    return {
        available: true
    }
}

