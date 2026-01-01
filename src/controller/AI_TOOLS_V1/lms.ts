import {fetch} from "bun";
import {z} from "zod"
import {tool} from "ai";
import {decryptData} from "../../utils/encryptor";

const api = process.env.LMSDIEMDANHAPI || "";

const LMS_API = {
    getDsDiemdanh: async (access_token: string) => {
        const token = JSON.parse(decryptData(access_token))
        try {
            const res = await fetch(api, {
                method: "GET",
                headers: {
                    authorization: `Bearer ${token.access_token}`
                }
            })

            if (!res.ok) {
                return {
                    data: null
                }
            }

            return await res.json();

        } catch (error) {
            console.log(`There is an excetption: ${error}`)
            return {
                data: null
            }
        }
    },
}

export const LmsDiemDanhTool = tool({
    description: "[LHU - Auth reqired] Get the attendance data from LMS system, " +
        "[TrangThai: 2: Attendance has been taken in class. 1: Absence with permission. Others: Unauthorized absence]",
    inputSchema: z.object({
        access_token: z.string().describe("The access token of the student.")
    }),
    execute: async ({access_token}) => {
        return await LMS_API.getDsDiemdanh(access_token);
    }
});