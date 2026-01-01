import {
    DANGKY_LichDangKyTheoNgay_Response,
    DANGKY_PhongHocNhomForRegSelectResponse,
    DANGKY_PhongHocNhomSelect_Response,
    DANGKY_ThietBiForRegSelectResponse,
    DangKyPayload,
    LichCaNhanAPIResponse,
    ThongSo
} from "../../types/elib"
import {tool} from "ai"
import {z} from "zod"
import {decryptData} from "../../utils/encryptor";

const TAPI = process.env.TAPI

// Standardized error shape for ELIB service
export type ELIBError = { error: { code: string; message: string; status?: number } }

export const ELIB_SERVICE = {
    get_thong_so: async (access_token?: string): Promise<ThongSo | ELIBError> => {
        if (!access_token) return { error: { code: "NO_TOKEN", message: "No access token provided" } }
        const token = JSON.parse(decryptData(access_token))
        try {
            const res = await fetch(`${TAPI}/elib/DANGKY_ThongSoSelect`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.access_token}`,
                    "Content-Type": "application/json"
                }
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                if (body?.Message === "Chứng thực của bạn không hợp lệ") {
                    return { error: { code: "AUTH_INVALID", message: "Token hết hạn, vui lòng đăng nhập lại", status: res.status } }
                }
                return { error: { code: "API_ERROR", message: `Lỗi khi lấy Thông Số: ${res.status} ${res.statusText}`, status: res.status } }
            }
            return await res.json()

        } catch (e) {
            if (e instanceof Error) {
                return { error: { code: "NETWORK_ERROR", message: e.message } }
            }
            return { error: { code: "UNKNOWN_ERROR", message: "Unknown error" } }
        }

    },
    get_room_configuation: async (access_token?: string): Promise<DANGKY_PhongHocNhomSelect_Response | ELIBError> => {
        if (!access_token) return { error: { code: "NO_TOKEN", message: "No access token provided" } }
        const token = JSON.parse(decryptData(access_token))

        try {
            const res = await fetch(`${TAPI}/elib/DANGKY_PhongHocNhomSelect`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.access_token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({})
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                if (body?.Message === "Chứng thực của bạn không hợp lệ") {
                    return { error: { code: "AUTH_INVALID", message: "Token hết hạn, vui lòng đăng nhập lại", status: res.status } }
                }
                return { error: { code: "API_ERROR", message: `Lỗi khi lấy Cấu Hình Phòng Học Nhóm: ${res.status} ${res.statusText}`, status: res.status } }
            }

            return await res.json()

        } catch (e) {
            if (e instanceof Error) {
                return { error: { code: "NETWORK_ERROR", message: e.message } }
            }
            return { error: { code: "UNKNOWN_ERROR", message: "Unknown error" } }
        }
    },
    get_user_booking_list: async (access_token?: string): Promise<LichCaNhanAPIResponse | ELIBError> => {
        if (!access_token) return { error: { code: "NO_TOKEN", message: "No access token provided" } }
        const token = JSON.parse(decryptData(access_token))

        try {
            const res = await fetch(`${TAPI}/elib/DANGKY_LichDangKyCaNhan`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.access_token}`,
                    "Content-Type": "application/json"
                }
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                if (body?.Message === "Chứng thực của bạn không hợp lệ") {
                    return { error: { code: "AUTH_INVALID", message: "Token hết hạn, vui lòng đăng nhập lại", status: res.status } }
                }
                return { error: { code: "API_ERROR", message: `Lỗi khi lấy Lịch Cá Nhân: ${res.status} ${res.statusText}`, status: res.status } }
            }

            return await res.json()

        } catch (e) {
            if (e instanceof Error) {
                return { error: { code: "NETWORK_ERROR", message: e.message } }
            }
            return { error: { code: "UNKNOWN_ERROR", message: "Unknown error" } }
        }
    },
    get_reservation_by_day: async (date: string, access_token?: string): Promise<DANGKY_LichDangKyTheoNgay_Response | ELIBError> => {
        if (!access_token) return { error: { code: "NO_TOKEN", message: "No access token provided" } }
        const token = JSON.parse(decryptData(access_token))

        try {
            const res = await fetch(`${TAPI}/elib/DANGKY_LichDangKyTheoNgay`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.access_token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    TuNgay: date, // Same date, why they need two fields?
                    DenNgay: date
                })
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                if (body?.Message === "Chứng thực của bạn không hợp lệ") {
                    return { error: { code: "AUTH_INVALID", message: "Token hết hạn, vui lòng đăng nhập lại", status: res.status } }
                }
                return { error: { code: "API_ERROR", message: `Lỗi khi lấy Lịch Cá Nhân: ${res.status} ${res.statusText}`, status: res.status } }
            }

            return await res.json()

        } catch (e) {
            if (e instanceof Error) {
                return { error: { code: "NETWORK_ERROR", message: e.message } }
            }
            return { error: { code: "UNKNOWN_ERROR", message: "Unknown error" } }
        }
    },
    // REG area
    get_phong_hoc_for_reg: async (startTime: string, endTime: string, access_token?: string): Promise<DANGKY_PhongHocNhomForRegSelectResponse | ELIBError> => {
        if (!startTime || !endTime) return { error: { code: "INVALID_PARAMS", message: "startTime and endTime are required" } }
        if (!access_token) return { error: { code: "NO_TOKEN", message: "No access token provided" } }
        const token = JSON.parse(decryptData(access_token))

        try {
            const res = await fetch(`${TAPI}/elib/DANGKY_PhongHocNhomForRegSelect`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.access_token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ThoiGianBD: startTime,
                    ThoiGianKT: endTime
                })
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                if (body?.Message === "Chứng thực của bạn không hợp lệ") {
                    return { error: { code: "AUTH_INVALID", message: "Token hết hạn, vui lòng đăng nhập lại", status: res.status } }
                }
                return { error: { code: "API_ERROR", message: `Lỗi khi lấy Phòng Học Cho Đăng Ký: ${res.status} ${res.statusText}`, status: res.status } }
            }
            return await res.json()
        } catch (e) {
            if (e instanceof Error) {
                return { error: { code: "NETWORK_ERROR", message: e.message } }
            }
            return { error: { code: "UNKNOWN_ERROR", message: "Unknown error" } }
        }
    },
    get_thiet_bi_for_reg: async (ThoiGianBD: string, ThoiGianKT: string, access_token?: string): Promise<DANGKY_ThietBiForRegSelectResponse | ELIBError> => {
        if (!access_token) return { error: { code: "NO_TOKEN", message: "No access token provided" } }
        const token = JSON.parse(decryptData(access_token))

        if (!ThoiGianBD || !ThoiGianKT) return { error: { code: "INVALID_PARAMS", message: "ThoiGianBD and ThoiGianKT are required" } }
        try {
            const res = await fetch(`${TAPI}/elib/DANGKY_ThietBiForRegSelect`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.access_token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ThoiGianBD: ThoiGianBD,
                    ThoiGianKT: ThoiGianKT
                })
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                if (body?.Message === "Chứng thực của bạn không hợp lệ") {
                    return { error: { code: "AUTH_INVALID", message: "Token hết hạn, vui lòng đăng nhập lại", status: res.status } }
                }
                return { error: { code: "API_ERROR", message: `Lỗi khi lấy Thiết Bị Cho Đăng Ký: ${res.status} ${res.statusText}`, status: res.status } }
            }
            return await res.json()

        } catch (e) {
            if (e instanceof Error) {
                return { error: { code: "NETWORK_ERROR", message: e.message } }
            }
            return { error: { code: "UNKNOWN_ERROR", message: "Unknown error" } }
        }
    },
    dang_ky_phong_hoc_nhom: async (
        payload: DangKyPayload,
        access_token?: string
    ): Promise<{ success: true; message: string; madatcho: any } | ELIBError> => {

        if (!access_token) return { error: { code: "NO_TOKEN", message: "No access token provided" } }
        const token = JSON.parse(decryptData(access_token))

        try {
            const res = await fetch(`${TAPI}/elib/DANGKY_PhongHocNhom`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.access_token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                const body = await res.json().catch(() => null)
                if (body?.Message === "Chứng thực của bạn không hợp lệ") {
                    return { error: { code: "AUTH_INVALID", message: "Token hết hạn, vui lòng đăng nhập lại", status: res.status } }
                }
                return { error: { code: "API_ERROR", message: `Lỗi khi đăng ký Phòng Học Nhóm: ${res.status} ${res.statusText}`, status: res.status } }
            }

            const json = await res.json()
            return { success: true, message: "Đăng ký phòng học nhóm thành công", madatcho: json.data?.[0]?.DangKyID }
        } catch (e) {
            if (e instanceof Error) {
                return { error: { code: "NETWORK_ERROR", message: e.message } }
            }
            return { error: { code: "UNKNOWN_ERROR", message: "Unknown error" } }
        }
    }
}

export const getElibThongSoTool = tool({
  description: "Get ELIB system parameters (ThongSo)",
  inputSchema: z.object({
    accessToken: z.string().describe("ELIB access token"),
  }),
  execute: async ({ accessToken }) => {
    return await ELIB_SERVICE.get_thong_so(accessToken)
  },
})


export const getElibRoomConfigurationTool = tool({
  description: "Get group study room configuration",
  inputSchema: z.object({
    accessToken: z.string().describe("ELIB access token"),
  }),
  execute: async ({ accessToken }) => {
    return await ELIB_SERVICE.get_room_configuation(accessToken)
  },
})

export const getElibUserBookingListTool = tool({
  description: "Get user's personal booking list",
  inputSchema: z.object({
    accessToken: z.string().describe("ELIB access token"),
  }),
  execute: async ({ accessToken }) => {
    return await ELIB_SERVICE.get_user_booking_list(accessToken)
  },
})

export const getElibReservationByDayTool = tool({
  description: "Get reservation list by a specific day",
  inputSchema: z.object({
    date: z.string().describe("Date in YYYY-MM-DD format"),
    accessToken: z.string().describe("ELIB access token"),
  }),
  execute: async ({ date, accessToken }) => {
    return await ELIB_SERVICE.get_reservation_by_day(date, accessToken)
  },
})

export const getElibPhongHocForRegTool = tool({
  description: "Get available group study rooms for registration",
  inputSchema: z.object({
    startTime: z.string().describe("ISO start time"),
    endTime: z.string().describe("ISO end time"),
    accessToken: z.string().describe("ELIB access token"),
  }),
  execute: async ({ startTime, endTime, accessToken }) => {
    return await ELIB_SERVICE.get_phong_hoc_for_reg(
      startTime,
      endTime,
      accessToken
    )
  },
})

export const getElibThietBiForRegTool = tool({
  description: "Get available devices for registration",
  inputSchema: z.object({
    startTime: z.string().describe("ISO start time"),
    endTime: z.string().describe("ISO end time"),
    accessToken: z.string().describe("ELIB access token"),
  }),
  execute: async ({ startTime, endTime, accessToken }) => {
    return await ELIB_SERVICE.get_thiet_bi_for_reg(
      startTime,
      endTime,
      accessToken
    )
  },
})

// Unused, tự đăng kí qua web trường đi
// export const elibDangKyPhongHocNhomTool = tool({
//   description: "Register a group study room",
//   inputSchema: z.object({
//     payload: z.any().describe("DangKyPayload"),
//     accessToken: z.string().describe("ELIB access token"),
//   }),
//   execute: async ({ payload, accessToken }) => {
//     return await ELIB_SERVICE.dang_ky_phong_hoc_nhom(
//       payload,
//       accessToken
//     )
//   },
// })
