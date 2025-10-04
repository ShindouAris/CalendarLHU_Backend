import { fetch } from "bun";

const api = process.env.LMSDIEMDANHAPI || "";

export const LMSAPI = {
    getDsDiemdanh: async (access_token: string) => {
        try {
            const res = await fetch(api, {
                method: "GET", 
                headers: {
                    authorization: `Bearer ${access_token}`
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


    }
}