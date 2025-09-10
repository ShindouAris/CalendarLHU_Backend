import { fetch } from "bun"
import { UserInfoResponse } from "../types/user";
import { ElysiaCustomStatusResponse, status } from "elysia";

const apiLogin = process.env.AUTH  || ""
const apiLogOut = process.env.UNAUTH || ""
const userinfo = process.env.USERINFO || ""

export interface loginRes {
    accessToken: string
}

export const userApi = {
    login: async (idSinhVien: string, password: string, idLoginDevice: string): Promise<loginRes | any> => {
        try {
            if (!idLoginDevice.startsWith('{')) {
                throw new Error("Invalid idLoginDevice")
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
            if (!response.ok) {
                throw new Error(`Login Failed ${await response.json()}`)
            }
            const json = await response.json()
            const token = json.Token
            if (!token) {
                throw new Error(`Đăng nhập thất bại - không tìm thấy token`)
            }
            return {
                "accessToken": token
            }
        } catch (error) {
            if (error instanceof Error) {
                console.log(error.message)
                if (error.message.includes("Invalid idLoginDevice")) {
                    return status("Bad Request")
                }
                return status("Internal Server Error", error.message ?? error.message)
            }
        }
    },
    userinfo: async (accessToken: string) => {
        try {
            if (!accessToken) {
                throw new Error("UNAUTHORIZED")
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
                throw new Error(`Failed to get userdata`)
            }
            const userRes: UserInfoResponse = await response.json()
            if (!userRes.data) {
                throw new Error("Invalid response from server")
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
                throw new Error(`Logout Failed`)
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