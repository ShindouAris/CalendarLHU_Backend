import { fetch } from "bun"

const api_url: string = process.env.API_URL || ""

const build_request = (studentID: string) => {
    return {
        Ngay: new Date().toISOString(),
        PageIndex: 1,
        PageSize: 10,
        StudentID: studentID
    }
}

export const calendarLHU = {
    getStudentSchedule: async (studentID: string) => {
        const response = await fetch(api_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(build_request(studentID)),
        });

    if (!response.ok) {
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errorBody = await response.json().catch(() => null);
          const apiMessage = errorBody?.Message || errorBody?.message;
          if (apiMessage) {
            throw new Error(apiMessage);
          }
        } else {
          const text = await response.text().catch(() => '');
          if (text) {
            throw new Error(text);
          }
        }
      } catch (inner) {
        if (inner instanceof Error) {
          throw inner;
        }
      }
      throw new Error(`API request failed: ${response.status}`);
    }

    return await response.json();
  }
}
