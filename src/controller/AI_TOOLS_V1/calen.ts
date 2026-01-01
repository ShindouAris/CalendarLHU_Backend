import { fetch } from "bun";
import { isAfter, parseISO } from "date-fns";
import type { ApiResponse, ScheduleItem } from "../../types/schedule";
import {tool} from "ai";
import {z} from "zod";

const api_url = process.env.API_URL ?? "";

const buildRequest = (studentID: number) => ({
  Ngay: new Date().toISOString(),
  PageIndex: 1,
  PageSize: 20,
  StudentID: studentID,
});

const isValidSchedule = (s: ScheduleItem, fromDate: Date) => {
  try {
    const start = parseISO(s.ThoiGianBD);
    const isCancelled = [1, 2, 6].includes(s.TinhTrang);
    return !isCancelled && isAfter(start, fromDate);
  } catch {
    return false;
  }
};

export interface ScheduleResponse {
  id: number;
  startTime: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  onlineLink?: string;
  status: number;
}

export const mapScheduleToResponse = (
  item: ScheduleItem
): ScheduleResponse => {
  return {
    id: item.ID,
    startTime: item.ThoiGianBD,
    endTime: item.ThoiGianKT,
    subject: item.TenMonHoc,
    teacher: item.GiaoVien,
    room: item.TenPhong,
    onlineLink: item.OnlineLink || undefined,
    status: item.TinhTrang,
  };
};

export const calenAPI = {
  getStudentSchedule: async (
    studentID: number,
    dateLimit?: string
  ): Promise<ScheduleItem[]> => {
    const res = await fetch(api_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequest(studentID)),
    });

    if (!res.ok) {
      throw new Error(`Schedule API failed: ${res.status} - ${res.statusText}`);
    }

    const json: ApiResponse = await res.json();
    const schedules = json.data?.[2] ?? [];

    if (!dateLimit) return schedules;

    const limitDate = parseISO(dateLimit);
    return schedules.filter((s: ScheduleItem) => isValidSchedule(s, limitDate));
  },

  getNextClass: async (studentID: number) => {
    const now = new Date();
    const schedules = await calenAPI.getStudentSchedule(
      studentID,
      now.toISOString()
    );

    return schedules
      .sort(
        (a: ScheduleItem, b: ScheduleItem): number =>
          +new Date(a.ThoiGianBD) - +new Date(b.ThoiGianBD)
      )[0] ?? null;
  }
};

export const CalenToolsV1 = [
    {
      "type": "function",
      "function": {
        "name": "get_student_schedule",
        "description": "Get a student's class schedule, optionally limited to classes after a specific date",
        "parameters": {
          "type": "object",
          "properties": {
            "student_id": {
              "type": "number",
              "description": "Student ID"
            },
            "date_limit": {
              "type": "string",
              "description": "ISO date string. Only classes starting after this date will be returned (optional but recommended," +
                  " using without it may return a large amount of data and make your system admin go bankrupt)",
              "format": "date-time"
            }
          },
          "required": ["student_id"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "get_next_class",
        "description": "Get the nearest upcoming class for a student",
        "parameters": {
          "type": "object",
          "properties": {
            "student_id": {
              "type": "number",
              "description": "Student ID"
            }
          },
          "required": ["student_id"]
        }
      }
    }
] as const;

export const getStudentScheduleTool = tool({
  description: 'Get the student schedule up to a certain date',
  inputSchema: z.object({
    studentID: z.number().describe('The ID of the student'),
    dateLimit: z.string().optional().describe('Optional ISO date to limit schedules'),
  }),
  execute: async ({ studentID, dateLimit }) => {
    return await calenAPI.getStudentSchedule(studentID, dateLimit);
  },
});

export const getNextClassTool = tool({
  description: 'Get the next class for a student',
  inputSchema: z.object({
    studentID: z.number().describe('The ID of the student'),
  }),
  execute: async ({ studentID }) => {
    return await calenAPI.getNextClass(studentID);
  },
});
