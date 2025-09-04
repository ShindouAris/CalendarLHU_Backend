import { Elysia } from "elysia";
import { calendarLHU } from "./controller/calendarlhu";
import { weatherapi } from "./controller/weather";
import { cors } from "@elysiajs/cors";

const port = process.env.PORT || 3000


const app = new Elysia()
        .use(cors({
          origin: "https://calendarlhu.chisadin.site",
          methods: ["GET", "POST"]
        })).listen(port);

app.get("/schedule/:studentID", ({ params }) => {
  const { studentID } = params;
  return calendarLHU.getStudentSchedule(studentID);
});

app.get("/weather/current", async () => {
  const weather = await weatherapi.current();
  if (weather) {
    return weather;
  }
  return { error: "Failed to fetch current weather" };
});

app.get("/weather/forecast", async ({ query }) => {
  let { timestamp } = query;

  if (!timestamp) { // nếu không có timestamp, tính timestamp hiện tại
    timestamp = (Math.floor(new Date().getTime() / 1000)).toString();
  }

  function roundHourEpoch(ts: string) {
    const d = new Date(Number(ts) * 1000);
    if (d.getMinutes() >= 30) d.setHours(d.getHours() + 1);
    d.setMinutes(0, 0, 0);
    return (Math.floor(d.getTime() / 1000)).toString();
  }

  const forecast = await weatherapi.forecast();
  console.log(JSON.stringify(forecast?.forecast));
  console.log(timestamp);
  if (forecast) {
    for (const day of forecast.forecast.forecastday) {
      const hourMatch = day.hour.find(hour => hour.time_epoch === Number(roundHourEpoch(timestamp)));
      if (hourMatch) return hourMatch; // trả đúng giờ
    }
    return { error: "No forecast found for the given timestamp"};
  }
  return { error: "Failed to fetch weather forecast" };
});

app.get('/weather/forecast_all', async () => {
  const forecast = await weatherapi.forecast();
  if (forecast) {
    return forecast;
  }
  return { error: "Failed to fetch weather forecast" };
})


app.get("/", () => "Hello Elysia")

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
