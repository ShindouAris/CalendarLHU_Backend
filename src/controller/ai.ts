import {getStudentScheduleTool, getNextClassTool, getExamScheduleTool} from "../utils/ai/tools/calen";
import { weatherCurrentTool, weatherForecastTool,weatherForecastDayTool} from "../utils/ai/tools/weather";
import {extractWebTool, searchWebTool} from "../utils/ai/tools/web";
import {stepCountIs, streamText, ToolSet, UIMessage, convertToModelMessages, gateway, generateId, UIMessagePart} from "ai";

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
import {UserResponse} from "../types/user";
import {userApi} from "../utils/ai/tools/user";
import {LRUCache} from "../utils/lruCache";
import { prisma } from "../databases";
import {
  getOrCreateChatForUser,
  getChatForUser,
  getChatForUserByUUID,
  createChatForUser,
} from "../databases/services/chatQueries";
import { addToBuffer } from "../databases/services/messageBufferService";
import { MessageRole } from "@prisma/client";
import {buildSystemPrompt} from "../utils/ai/system/prompt";


const MODEL_NAME_MAPPING: Record<string, string> = {
  // "ChisaAI": "openai/gpt-oss-120b",
  "ChisaAI": "deepseek/deepseek-v4-flash"
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
    isDefault: modelId === "deepseek/deepseek-v4-flash", // Mark default model
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

    if (!(await checkAvailability())) {
        return status('Payment Required', "Chisa AI hết tiền vận hành rồi T-T")
    }

    const access_token = req['access_token']
    const selectedModel = req['model'] as string | undefined;

    // Only accept safe names, no direct model IDs allowed
    let modelToUse = "deepseek/deepseek-v4-flash"; // Default
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
    const {id, messages }: {id: string, messages: UIMessage[] } = req;
    console.log("chisaAIV2_Chat called for user ", req['user_id'], " with chat id ", id)

    try {
        const precachedUser = await usercacheBuffer.getUserData(req['user_id'])
        if (precachedUser) {
            sysPrompt = buildSystemPrompt(precachedUser, access_token)
            console.log("Cache hit for user ", precachedUser.UserID)
        } else {
            const userData: UserResponse | null = await userApi.getUserInfo(access_token)
            console.log("Cache miss for user ", req['user_id'])
            sysPrompt = buildSystemPrompt(userData, access_token)
            await usercacheBuffer.setUserData(userData.UserID, userData);
        }
    } catch (error) {
        return status("Unauthorized", "Bạn không có quyền truy cập vào Chisa AI. Vui lòng đăng nhập lại.")
    }


    const stream = streamText({
        model: modelToUse,
        system: sysPrompt,
        messages: await convertToModelMessages(messages),
        tools: tool_v2_for_chisa,
        stopWhen: stepCountIs(15),
    });

    return stream.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: () => crypto.randomUUID(),
      onFinish: async (msg) => {
        const userId = req['user_id'] as string | undefined;
        if (!userId) {
          console.log('[onFinish] userId not found in req:', req);
          return;
        }

        try {
          const allMessages = msg.messages;
          console.log('[onFinish] allMessages:', allMessages);

          const messagesToSave: Array<{
            role: MessageRole;
            parts: UIMessagePart<Record<string, any>, Record<string, any>>[];
          }> = [];

          let lastAssistantParts: UIMessagePart<Record<string, any>, Record<string, any>>[] | null = null;
          let lastUserParts: UIMessagePart<Record<string, any>, Record<string, any>>[] | null = null;

          for (let i = allMessages.length - 1; i >= 0; i--) {
            const m = allMessages[i] as any;

            if (!lastAssistantParts && m?.role === 'assistant' && Array.isArray(m.parts)) {
              lastAssistantParts = m.parts;
              continue;
            }
            if (!lastUserParts && m?.role === 'user' && Array.isArray(m.parts)) {
              lastUserParts = m.parts;
              continue;
            }

            if (lastAssistantParts && lastUserParts) break;
          }

          if (lastUserParts) messagesToSave.push({ role: 'user', parts: lastUserParts });
          if (lastAssistantParts) messagesToSave.push({ role: 'assistant', parts: lastAssistantParts });

          console.log('[onFinish] messagesToSave:', messagesToSave);

          if (messagesToSave.length === 0) {
            console.log('[onFinish] No messages to save. Exit.');
            return;
          }

          let chat: { id: string; userId: string } | null = null;
          const chatId = req['id'] as string | undefined;
          if (chatId) {
            // Try UUID format first (chatID field)
            console.log('[onFinish] Try getChatForUserByUUID with chatUUID:', chatId, 'userId:', userId);
            chat = await getChatForUserByUUID(chatId, userId);
            
            if (!chat) {
              // Try as primary key id
              console.log('[onFinish] Try getChatForUser with chatId:', chatId, 'userId:', userId);
              chat = await getChatForUser(chatId, userId);
            }
          }
          if (!chat) {
            console.log('[onFinish] No chat found by chatId, try createChatForUser with userId:', userId, 'chatId:', chatId);
            chat = await createChatForUser(userId, chatId);
          }
          if (!chat) {
            console.log('[onFinish] No chat created, try getOrCreateChatForUser with userId:', userId);
            chat = await getOrCreateChatForUser(userId);
          }
          if (chat?.id && chat?.userId) {
            console.log('[onFinish] Adding to buffer chatId:', chat.id, 'userId:', chat.userId, 'messagesToSave:', messagesToSave);
            addToBuffer(chat.id, chat.userId, messagesToSave);
          } else {
            console.log('[onFinish] Unable to resolve chat for saving history. chat:', chat);
          }
        } catch (err) {
          console.error("Failed to save chat history in toUIMessageStreamResponse", err);
        }
      },
    });
}

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

