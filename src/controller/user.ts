import { fetch } from "bun"
import { UserInfoResponse } from "../types/user";
import { status } from "elysia";
import { verfiyToken } from "../utils/cloudflare";
import {decryptLoginData, encryptLoginData} from "../utils/encryptor";


const apiLogin = process.env.AUTH  || ""
const apiLogOut = process.env.UNAUTH || ""
const userinfo = process.env.USERINFO || ""

export interface loginRes {
    accessToken: string
}

const nonceStore = new Map<string, number>(); // nonce -> expiredAt

export const generateNonce = () => crypto.randomUUID();

export function createNonce(ttl = 60_000) {
    const nonce = generateNonce();
    nonceStore.set(nonce, Date.now() + ttl);
    return nonce;
}

export function validateNonce(nonce: string) {
    const exp = nonceStore.get(nonce);
    if (!exp) return false; // nonce không tồn tại -> fake 😭
    if (exp < Date.now()) {
        nonceStore.delete(nonce);
        return false; // hết hạn -> đuổi khỏi sân 🥶
    }
    nonceStore.delete(nonce); // one-time only 😎
    return true;
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

    },
    create_login_data: async (access_token: string)=> {
        try {
            const usrdata = await userApi.userinfo(access_token)

            if (!usrdata) {
                return status("Bad Request", "Token không hợp lệ hoặc không tồn tại")
            }
            if ("UserID" in usrdata) {
                console.log(`[Create Session] ${usrdata?.UserID} - ${usrdata?.FullName} is creating an login session`)
                const nonce = createNonce()
                return {
                    data: `LGN:${encryptLoginData(access_token, nonce)}`,
                    expired_at: Date.now() + 60_000,
                }
            }
            else {
                return status("Bad Request", "Invalid login session")
            }

        } catch (error) {
            if (error instanceof Error) {
                console.log(error.message)
                return status("Internal Server Error", `Failed to create login session`)
            }
        }
    },
    submit_login_data:  async (encrypted_content: string, access_token: string) => {
        try {
            if ((!encrypted_content || !access_token) || !encrypted_content.startsWith("LGN:")) {
                return status("Forbidden", "Invalid encrypted content")
            }
            const decrypted_content = decryptLoginData(encrypted_content.replace("LGN:", ""))
            if (!decrypted_content) {
                return status("Bad Request", "Invalid request")
            }
            if (!validateNonce(decrypted_content.nonce)) {
                return status("Bad Request", "Session timedout or Invalid")
            }

            const usrdata = await userApi.userinfo(decrypted_content.access_token)

            const clientB = await userApi.userinfo(access_token)

            if (!usrdata || !clientB) {
                return status("Bad Request", "Token không hợp lệ hoặc không tồn tại")
            }
            if ("UserID" in usrdata && "UserID" in clientB) {
                console.log(`[Login] ${usrdata?.UserID} - ${usrdata?.FullName} login success by ${clientB.FullName}`)
                return {
                    "access_token": `${access_token}`,
                    "user_data": usrdata
                }
            }
            else {
                return status("Bad Request", "Invalid login session")
            }
        } catch (error) {
            if (error instanceof Error) {
                console.log(error.message)
                return status("Internal Server Error", `Failed to vadilate login session`)
            }
        }
    }

}