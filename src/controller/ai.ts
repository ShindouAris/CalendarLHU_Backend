import {getStudentScheduleTool, getNextClassTool, getExamScheduleTool} from "./AI_TOOLS_V1/calen";
import dayjs from "dayjs";
import { weatherCurrentTool, weatherForecastTool,weatherForecastDayTool} from "./AI_TOOLS_V1/weather";
import {extractWebTool, searchWebTool} from "./AI_TOOLS_V1/web";
import {stepCountIs, streamText, ToolSet, UIMessage, convertToModelMessages, gateway, generateId} from "ai";

import {LmsDiemDanhTool} from "./AI_TOOLS_V1/lms";
import {  getElibThongSoTool,
  getElibRoomConfigurationTool,
  getElibUserBookingListTool,
  getElibReservationByDayTool,
  getElibPhongHocForRegTool,
  getElibThietBiForRegTool
} from "./AI_TOOLS_V1/elib";
import {status} from "elysia";
import {UserResponse} from "../types/user";
import {userApi} from "./AI_TOOLS_V1/user";
import {encryptLoginData} from "../utils/encryptor";
import {LRUCache} from "../utils/lruCache";
import { UserModel } from "../databases/models/user";
import {
  getOrCreateChatForUser,
  getChatForUser,
  createChatForUser,
} from "../databases/services/chatQueries";
import { addToBuffer } from "../databases/services/messageBufferService";
import type { MessageRole } from "../databases/models/message";
import { Types } from "mongoose";

const buildSystemPrompt = (userData: UserResponse, access_token: string) => {
    return ` 
        You are Chisa, a friendly and cute virtual assistant inside the LHU-dashboard (school LMS system).
        
        Your main role is to help students with learning, school-related questions, and general guidance.
        Always prioritize safety, accuracy, and respectful behavior.
        
        Current Context:
        - Today's Date: ${dayjs().format('YYYY-MM-DD HH:MM:SS')}
        - User's Language: Detect and reply in the same language as the student, if unsure, use Vietnammese.
        - User's data: 
            - StudentID ${userData.UserID}
            - Name: ${userData.FullName}
            - Class: ${userData.Class}
            - Department: ${userData.DepartmentName}
            - User Access Token [include this only if you need to call other tools that require authentication]: ${encryptLoginData(access_token)}
        
        Important constraints:
        - If a request requires unavailable data or the feature / tool is not ready yet, clearly explain the limitation and suggest what the student can do instead.
        - If the tool fails or returns an error, inform the student politely!.
        
        UI instructions:
        - When rendering latex / Katex math, you must include the delimiters ($..$) or ($$...$$) to your latex for client to render. Do not to use codeblocks unless specifically requested by the student.
        
        Guidelines for using tools:
         -Ask for student ID when schedule data requires it and it is not provided..
        - When providing weather infomation, you can alert the student about weather conditions that may affect their commute or outdoor activities,
            such as rain, extreme temperatures, or air quality issues and suggest appropriate preparations.
        - When calling a tool, output ONLY a valid tool call.
        
        Tone & behavior:
        - Be friendly, supportive, and easy to understand.
        - Once you have greeted the student, it isn't necessary to greet them again in the same conversation.
        - Recommended kawaii-style expressions occasionally to make interactions more engaging.
        - You can include some Ascii Emotion such as (⁄ ⁄•⁄ω⁄•⁄ ⁄)⁄, (｡♥‿♥｡) or ( •̀ ω •́ )✧,...etcs.
        - Keep explanations simple but accurate.
      `
}

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
        super(500, 7200); // Cache up to 500 users, expire after 120 minutes
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
        const dbUser = await UserModel.findOne({ UserID: userID }).lean();
        if (dbUser) {
            // When loading from DB, we only have partial data (UserID, FullName, Class, DepartmentName).
            // Cast it to UserResponse carefully or ensure consumers handle missing fields.
            const user = dbUser as unknown as UserResponse;
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
            UserID: data.UserID,
            FullName: data.FullName,
            Class: data.Class,
            DepartmentName: data.DepartmentName
        };
        await UserModel.findOneAndUpdate({ UserID: userID }, dbData, { upsert: true });
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

    let sysPrompt;
    const {id, messages }: {id: string, messages: UIMessage[] } = req;

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
        model: 'deepseek/deepseek-v3.2',
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
        if (!userId) return;

        try {
          const allMessages = msg.messages;
          const messagesToSave: Array<{ role: MessageRole; content: string }> = [];
          const getTextFromParts = (parts: any[]) =>
            parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');

          let assistantContent = "";
          for (let i = allMessages.length - 1; i >= 0; i--) {
            const m = allMessages[i];
            if (m.role === 'assistant') {
              if (!assistantContent) assistantContent = getTextFromParts(m.parts ?? []);
              continue;
            }
            if (m.role === 'user') {
              const content = getTextFromParts(m.parts ?? []);
              if (content) messagesToSave.push({ role: 'user', content });
              break;
            }
          }
          if (assistantContent) messagesToSave.push({ role: 'assistant', content: assistantContent });

          if (messagesToSave.length === 0) return;

          let chat: { _id: unknown; user: Types.ObjectId } | null = null;
          const chatId = req['id'] as string | undefined;
          if (chatId && Types.ObjectId.isValid(chatId)) {
            chat = await getChatForUser(new Types.ObjectId(chatId), userId);
          }
          if (!chat) {
            chat = (await createChatForUser(userId)) as { _id: unknown; user: Types.ObjectId } | null;
          }
          if (!chat) {
            chat = await getOrCreateChatForUser(userId) as { _id: unknown; user: Types.ObjectId } | null;
          }
          if (chat?._id && chat?.user) {
            addToBuffer(chat._id as Types.ObjectId, chat.user, messagesToSave);
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

