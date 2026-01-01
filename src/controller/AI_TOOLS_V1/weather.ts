import { fetch } from 'bun'
import { HourForecast, WeatherCurrentAPIResponse, WeatherForeCastAPIResponse} from '../../types/weather'
import {tool} from "ai";
import {z} from "zod";

const apikey = process.env.WEATHER_API_KEY || ""

const api_url = (apikey: string, lat: number, long: number, fetch_current: boolean): string => {

    if (fetch_current) {
        return `http://api.weatherapi.com/v1/current.json?key=${apikey}&q=${lat},${long}&lang=vi&aqi=yes`
    }

    return `http://api.weatherapi.com/v1/forecast.json?key=${apikey}&q=${lat},${long}&lang=vi&aqi=yes&days=14`
}

const campus_long_lat = {lat: 10.954859, long: 106.796100}
function roundHourEpoch(ts: string) {
        const d = new Date(Number(ts) * 1000);
        if (d.getMinutes() >= 30) d.setHours(d.getHours() + 1);
        d.setMinutes(0, 0, 0);
        return (Math.floor(d.getTime() / 1000)).toString();
}
export const weatherapi = {
    current: async (): Promise<WeatherCurrentAPIResponse | null> => {
        const url = api_url(apikey, campus_long_lat.lat, campus_long_lat.long, true)
        const response = await fetch(url);
        if (response.ok) {
            return response.json();
        }
        return null;
    },
    forecast: async (timestamp: string | null): Promise<HourForecast | string> => {
        const url = api_url(apikey, campus_long_lat.lat, campus_long_lat.long, false)
        const response = await fetch(url);
        let forecast: WeatherForeCastAPIResponse | null = null;
        if  (!response.ok) {
            return "Api error"
        }
        forecast = await response.json();
      if (!timestamp) { // nếu không có timestamp,  tính timestamp hiện tại
        timestamp = (Math.floor(new Date().getTime() / 1000)).toString();
      }

      if (forecast) {
        for (const day of forecast.forecast.forecastday) {
          const hourMatch = day.hour.find((hour: HourForecast) => hour.time_epoch === Number(roundHourEpoch(timestamp)));
          if (hourMatch) return hourMatch; // trả đúng giờ
        }
        return "No forecast found for the given timestamp";
      }
      return "Failed to fetch weather forecast" ;
    },
    forecastday: async (): Promise<HourForecast | string> => {
        const url = api_url(apikey, campus_long_lat.lat, campus_long_lat.long, false)
        const response = await fetch(url);
        if (!response.ok) {
            return "Api error"
        }
        return await response.json();
    }
}

export const WeatherTools = [
  {
    type: "function",
    function: {
      name: "get_current_weather",
      description: "Get current weather information at the campus (LHU) location at this moment.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather_forecast",
      description: "Get weather forecast for a specific hour based on unix timestamp (seconds). " +
          "If timestamp is not provided, current hour will be used, " +
          "location is the campus (LHU), max 3 days include today.",
      parameters: {
        type: "object",
        properties: {
          timestamp: {
            type: "string",
            description: "Unix timestamp in seconds (as string). Example: 1735534800. Optional"
          }
        },
        required: []
      }
    }
  },
    {
    type: "function",
    function: {
      name: "get_forecast_day",
      description: "Get the full forecast for upcoming days",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
] as const;

export const weatherCurrentTool = tool({
  description: 'Get current weather',
  inputSchema: z.object({}),
  execute: async () => {
    const current = await weatherapi.current();
    return { result: current ?? 'Failed to fetch current weather' };
  },
});

// Forecast Tool (timestamp required)
export const weatherForecastTool = tool({
  description: "Get weather forecast for a specific hour based on unix timestamp (seconds). " +
      "If timestamp is not provided, current hour will be used, " +
      "location is the campus (LHU), max 3 days include today.",
  inputSchema: z.object({
    timestamp: z.string().optional().describe('Timestamp for forecast (defaults to now if missing)'),
  }),
  execute: async ({ timestamp }) => {
    if (!timestamp) timestamp = Math.floor(Date.now() / 1000).toString();
    const forecast = await weatherapi.forecast(timestamp);
    return { result: forecast };
  },
});

// Full Forecast Day Tool
export const weatherForecastDayTool = tool({
  description: 'Get full forecast for the day',
  inputSchema: z.object({}),
  execute: async () => {
    const forecastDay = await weatherapi.forecastday();
    return { result: forecastDay };
  },
});