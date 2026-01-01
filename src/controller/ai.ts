import {getStudentScheduleTool, getNextClassTool} from "./AI_TOOLS_V1/calen";
import dayjs from "dayjs";
import { weatherCurrentTool, weatherForecastTool,weatherForecastDayTool} from "./AI_TOOLS_V1/weather";
import {stepCountIs, streamText, ToolSet, UIMessage, convertToModelMessages, gateway} from "ai";

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


const systemPrompt = [{
      role: "system",
      content: ` 
        You are Chisa, a friendly and cute virtual assistant inside the LHU-dashboard (school LMS system).
        
        Your main role is to help students with learning, school-related questions, and general guidance.
        Always prioritize safety, accuracy, and respectful behavior.
        
        Current Context:
        - Today's Date: ${dayjs().format('YYYY-MM-DD HH:MM:SS')}
        - User's Language: Detect and reply in the same language as the student, if unsure, use Vietnammese.
        
        Important constraints:
        - If a request requires unavailable data or the feature / tool is not ready yet, clearly explain the limitation and suggest what the student can do instead.
        - If the tool fails or returns an error, inform the student politely!.
        
        Guidelines for using tools:
         -Ask for student ID when schedule data requires it and it is not provided..
        - When providing weather infomation, you can alert the student about weather conditions that may affect their commute or outdoor activities,
            such as rain, extreme temperatures, or air quality issues and suggest appropriate preparations.
        - When calling a tool, output ONLY a valid tool call.
        
        Tone & behavior:
        - Be friendly, supportive, and easy to understand.
        - Recommended kawaii-style expressions occasionally to make interactions more engaging.
        - You can include some Ascii Emotion such as (⁄ ⁄•⁄ω⁄•⁄ ⁄)⁄, (｡♥‿♥｡) or ( •̀ ω •́ )✧,...etcs.
        - Keep explanations simple but accurate.
      `
}] as const;

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
        
        Guidelines for using tools:
         -Ask for student ID when schedule data requires it and it is not provided..
        - When providing weather infomation, you can alert the student about weather conditions that may affect their commute or outdoor activities,
            such as rain, extreme temperatures, or air quality issues and suggest appropriate preparations.
        - When calling a tool, output ONLY a valid tool call.
        
        Tone & behavior:
        - Be friendly, supportive, and easy to understand.
        - Recommended kawaii-style expressions occasionally to make interactions more engaging.
        - You can include some Ascii Emotion such as (⁄ ⁄•⁄ω⁄•⁄ ⁄)⁄, (｡♥‿♥｡) or ( •̀ ω •́ )✧,...etcs.
        - Keep explanations simple but accurate.
      `
}

const tool_v2_for_chisa: ToolSet = {
    getNextClassTool,
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

// export const chisaAIV2 = async (prompt: string) => {
//     if (messageHistory.length == 0) {
//
//         messageHistory.push(...systemPrompt)
//     }
//     messageHistory.push({ role: 'user', content: prompt})
//     const stream = streamText({
//         model: 'openai/gpt-oss-120b',
//         prompt: messageHistory,
//         tools: tool_v2_for_chisa,
//         stopWhen: stepCountIs(15)
//     })
//     return stream.toUIMessageStreamResponse()
// }


export const chisaAIV2_Chat = async (req: any) => {

    if (!(await checkAvailability())) {
        return status('Payment Required', "Chisa AI hết tiền vận hành rồi T-T")
    }

    const access_token = req['access_token']

    let sysPrompt;

    try {
        const userData: UserResponse | null = await userApi.getUserInfo(access_token)
        sysPrompt = buildSystemPrompt(userData, access_token)
    } catch (error) {
        sysPrompt = systemPrompt[0].content
    }

    const { messages }: { messages: UIMessage[] } = req;

    const stream = streamText({
        model: 'openai/gpt-oss-120b',
        system: sysPrompt,
        messages: await convertToModelMessages(messages),
        tools: tool_v2_for_chisa,
        stopWhen: stepCountIs(15),
        onChunk: () => {

        }
    })
    return stream.toUIMessageStreamResponse()
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

