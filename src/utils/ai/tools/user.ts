import {fetch} from "bun";
import {UserInfoResponse} from "../../../types/user";

const userinfo = process.env.USERINFO || ""

export const userApi = {
    getUserInfo: async (accessToken: string) => {
        if (!accessToken) {
            throw new Error("UNAUTHORIZED");
        }

        const response = await fetch(
            userinfo, {
                method: "POST",
                signal: AbortSignal.timeout(15000),
                headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`
                }
            }
        )
        if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
        if (!response.ok) {
            if (response.status >= 500) throw new Error("Failed to get userdata");
            const res = await response.json()
            if ("Message" in res) {
                if (res.Message === "Chứng thực của bạn không còn hiệu lực") {
                    throw new Error("UNAUTHORIZED")
                }
            }
            throw new Error(`Failed to get userdata`)
        }
        const userRes: UserInfoResponse = await response.json()
        if (!userRes.data) {
            throw new Error("Failed to get userdata")
        }
        return userRes.data
    }
}