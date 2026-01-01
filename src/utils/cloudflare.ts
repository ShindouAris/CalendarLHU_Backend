import { fetch } from "bun";

const apiCF = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

const secKey = process.env.CF_SECRET_KEY || ""

export const verfiyToken = async (token: string, remoteip?: string): Promise<boolean> => {
    try {
        if (!token) {
            return false
        }

        const payload = new FormData();
        payload.append('secret', secKey);
        payload.append('response', token);
        if (remoteip) {
            payload.append('remoteip', remoteip);
        }

        const response = await fetch(apiCF, {
              method: 'POST',
              body: payload
          });

          const result = await response.json();
          if (!result.success) {
            console.error('Turnstile validation failed:', result['error-codes']);
            return false;
          }

          return true;
    } catch (error) {
        console.error('Turnstile validation error:', error);
        return false;}
}