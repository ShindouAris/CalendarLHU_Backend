import { fetch } from "bun";
import { status } from "elysia";

const api = process.env.CREATE_CHAT_SESSION_API || "";

export const CHATAPI = {
    createChatSession: async (access_token: string) => {
        if (!access_token) {
            return status("Unauthorized", "AN credential is required");
        }

        try {
            const res = await fetch(api, {
                method: "POST",
                headers: {
                    Cookie: `awt=${access_token}`,
                }
            })

            if (!res.ok) {
                console.log(`Cannot create chat session - ${res.statusText}`);
                return status("Internal Server Error", `Cannot create chat session - ${res.statusText}`);
            }

            return await res.json();
        } catch (error) {
            console.log(`There is an excetption: ${error}`);
            return status("Internal Server Error", `There is an excetption: ${error}`);
        }
    }
}