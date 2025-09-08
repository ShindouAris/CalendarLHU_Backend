import { fetch } from 'bun'
import {  WeatherCurrentAPIResponse, WeatherForeCastAPIResponse } from '../types/weather'

const apikey = process.env.WEATHER_API_KEY || ""

const api_url = (apikey: string, lat: number, long: number, fetch_current: boolean): string => {

    if (fetch_current) {
        return `http://api.weatherapi.com/v1/current.json?key=${apikey}&q=${lat},${long}&lang=vi&aqi=yes`
    }

    return `http://api.weatherapi.com/v1/forecast.json?key=${apikey}&q=${lat},${long}&lang=vi&aqi=yes&days=6`
}

const campus_long_lat = {lat: 10.954859, long: 106.796100}

export const weatherapi = {
    current: async (): Promise<WeatherCurrentAPIResponse | null> => {
        const url = api_url(apikey, campus_long_lat.lat, campus_long_lat.long, true)
        const response = await fetch(url);
        if (response.ok) {
            return response.json();
        }
        return null;
    },
    forecast: async (): Promise<WeatherForeCastAPIResponse | null> => {
        const url = api_url(apikey, campus_long_lat.lat, campus_long_lat.long, false)
        const response = await fetch(url);
        if  (response.ok) {
            return response.json();
        }
        return null;
    }
}