import {fetch} from "bun";
import {UserInfoResponse} from "../../types/user";

const userinfo = process.env.USERINFO || ""

export const userApi = {
    getUserInfo: async (accessToken: string) => {
        if (!accessToken) {
            throw new Error("No access token provided");
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