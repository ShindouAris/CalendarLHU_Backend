import { fetch } from "bun"
import { UserInfoResponse } from "../types/user";
import { status } from "elysia";
import { verfiyToken } from "../utils/cloudflare";

const apiLogin = process.env.AUTH  || ""
const apiLogOut = process.env.UNAUTH || ""
const userinfo = process.env.USERINFO || ""

export interface loginRes {
    accessToken: string
}

export const userApi = {
    login: async (idSinhVien: string, password: string, idLoginDevice: string, cf_verify_token: string, requestip?: string): Promise<loginRes | any> => {
        try {
            if (!idLoginDevice.startsWith('{')) {
                return status("Bad Request" , "Invalid idLoginDevice")
            }
            const valid = await verfiyToken(cf_verify_token, requestip)
            if (!valid) {
                return status("Bad Request", "Invalid cf_verify_token")
            }
            const response = await fetch(
                apiLogin, 
                {
                    method: "POST", 
                    headers: {
                        'Content-Type': 'application/json',
                      },
                    credentials: 'include',
                    body: JSON.stringify({
                        DeviceInfo: idLoginDevice,
                        UserID: idSinhVien,
                        Password: password
                      })       
                }
            )
            const json = await response.json()
            if (!response.ok) {
                return status("Bad Request", `Đăng nhập vào tài khoản ME thất bại: ${json.Message}`)
            }
            const token = json.Token
            if (!token) {
                return status("Bad Request", `Đăng nhập thất bại - không tìm thấy token`)
            }
            return {
                "accessToken": token
            }
        } catch (error) {
            if (error instanceof Error) {
                console.log(error.message)
                if (error.message.includes("Invalid idLoginDevice")) {
                    return status("Bad Request")
                } if (error.message.includes("Đăng nhập vào tài khoản ME thất bại")) {
                    return status("Bad Request", error.message)
                }
                return status("Internal Server Error", error.message ?? error.message)
            }
        }
    },
    userinfo: async (accessToken: string) => {
        try {
            if (!accessToken) {
                return status("Unauthorized")
            }
            const response = await fetch(
                userinfo, {
                    method: "POST", 
                    headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${accessToken}`
                    }
                }
            )
            if (!response.ok) {
                const res = await response.json() 
                if ("Message" in res) {
                    if (res.Message === "Chứng thực của bạn không còn hiệu lực") {
                        return status("Unauthorized", "Your token is invalid")
                    }
                }
                return status("Internal Server Error", `Failed to get userdata`)
            }
            const userRes: UserInfoResponse = await response.json()
            if (!userRes.data) {
                return status("Internal Server Error","Invalid response from server")
            }
            return userRes.data
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes("UNAUTHORIZED")) {
                    return status("Unauthorized")
                }
                return status("Internal Server Error", error.message ?? error.message)
            }
        }
    },
    logout: async (accessToken: string) => {

        try {
            const response = await fetch(
                apiLogOut, {
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        SignOutAll: false
                    })
                }
            )

            if (!response.ok) {
                return status("Internal Server Error", `Logout Failed`)
            }

            return status("OK")
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === "Logut Failed") {
                    return status("Service Unavailable")
                }
                return status("Internal Server Error")
            }
        }

    }
}