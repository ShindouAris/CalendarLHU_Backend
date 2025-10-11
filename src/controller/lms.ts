import { fetch } from "bun";
import { status } from "elysia";

const api = process.env.LMSDIEMDANHAPI || "";
const qr_checkin_api = process.env.LMSQRCODEDIEMDANHAPI || ""

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
    },
    checkin: async (qr_data: string, access_token: string) => {
        try {
            const sysID = qr_data.substring(0, 3)
            const tdata = qr_data.substring(3)

            if (sysID !== "STB") return status("Bad Request", "This qr type isn't supported")

            const payload = {
                QRID: tdata
            }

            const res = await fetch(qr_checkin_api, {
                method: "POST",
                headers:{
                    authorization: `Bearer ${access_token}`,
                    "Content-type": "application/json"
                },
                body: JSON.stringify(payload)
            })

            

            if (!res.ok) {
                const data = await res.json()
                if ("Message" in data) {
                    return status("Forbidden", JSON.stringify({error: data.Message}))
                }
                console.error(`Error ${res.status}: ${res.statusText}`)
                return status("Internal Server Error")
            }

            console.log(res.statusText)
            return status("OK")

        } catch (error) {
            if (error instanceof Error) {
                return status("Internal Server Error", `Server error: ${error.message}`)
            }
            return status("Internal Server Error")
        }
    }
}