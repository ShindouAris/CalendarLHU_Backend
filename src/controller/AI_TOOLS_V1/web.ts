import {tavily} from "@tavily/core";
import {tool} from "ai";
import {z} from "zod";

const tavilyApiKey = process.env.TAVILY_API_KEY;

const web = tavily({apiKey: tavilyApiKey})

export const WebController = {
    searchWeb: async (query: string)=> {
        console.log(`Searching for ${query}`);
        try {
            return await web.search(query, {
                timeout: 36000,
                maxResults: 10,
            });
        } catch (error) {
            return "Error searching web: " + error;
        }
    },
    extractWeb: async (web_url: string[]) => {
        console.log(`Extracting ${web_url.length} website`);
        try {

            return await web.extract(web_url, {
                timeout: 36000
            })
        } catch (error) {
            return "Error extracting web data: " + error;
        }
    }

}

export const searchWebTool = tool({
    description: "Search the web for information",
    inputSchema: z.object({
        query: z.string().describe("The search query string")
    }),
    execute: async ({query}) => {
        return await WebController.searchWeb(query);
    }
})

export const extractWebTool = tool({
    description: "Extract information from a list of web URLs",
    inputSchema: z.object({
        web_url: z.array(z.url()).describe("List of web URLs to extract information from")
    }),
    execute: async ({web_url}) => {
        return await WebController.extractWeb(web_url);
    }
})
