import { fetch } from "bun"
import { status } from "elysia"

const api_url: string = process.env.API_URL || ""
const private_schedule_api = process.env.PRIVATE_SCHEDULE_API || ""

const build_request = (studentID: number) => {
    return {
        Ngay: new Date().toISOString(),
        PageIndex: 1,
        PageSize: 10,
        StudentID: studentID
    }
}

export const calendarLHU = {
    getStudentSchedule: async (studentID: number) => {
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
  },
  get_private_schedule: async (studentID: number) => {
    try {
      const res = await fetch(private_schedule_api, {
        method: "POST", 
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ID: studentID
        })
      })

      if (!res.ok) {
        throw new Error(`Error trying to get user schedule: ${res.status} - ${await res.text()}`)
      }

      const data = await res.json()

      if (!data) {
        return status("Internal Server Error")
      }
      return data

    } catch (error) {
      if (error instanceof Error) {
        console.log(error.message)
      }
    }
  }
}
