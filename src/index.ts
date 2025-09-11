import { Elysia, ElysiaCustomStatusResponse, status, t } from "elysia";
import { calendarLHU } from "./controller/calendarlhu";
import { weatherapi } from "./controller/weather";
import { userApi } from "./controller/user";
import { cors } from "@elysiajs/cors";
import { rateLimit } from "elysia-rate-limit";
import { logger } from "@tqman/nice-logger"
import { MarkStudent } from "./controller/mark";

const port = process.env.PORT || 3000


const app = new Elysia()
        .use(cors({
          origin: ["https://calendarlhu.chisadin.site", "http://localhost:5173", "https://lhu-dashboard.chisadin.site"],
          methods: ["GET", "POST"]
        }))
        .use(rateLimit({duration: 60000, max: 100}))
        .use(logger({
          mode: "live",
          withBanner: true,
          withTimestamp: true
        }))
        .listen(port);

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

app.post("/login", async ({body, cookie: {awt}}) => {
    const credentials = await userApi.login(body.UserID, body.Password, body.DeviceInfo)
    if (!credentials) {
      return status("Not Found")
    }
    if (!(credentials instanceof ElysiaCustomStatusResponse)) {{
      awt.value = credentials.accessToken
    }}
    return credentials
  }, 
  {
  body: t.Object({
    UserID: t.String(),
    Password: t.String(),
    DeviceInfo: t.String()
  })
}
)

app.post("/userinfo", async ({body}) => {
  const userdata = await userApi.userinfo(body.accessToken) 
  if (!userdata) {
    return status("Not Found")
  }
  return userdata
},  
{
  body: t.Object({
    accessToken: t.String()
  })
}
)

app.post("/logout", async ({body}) => {
  await userApi.logout(body.accessToken)
  return status("OK")
},
{
  body: t.Object({  
    accessToken: t.String()
  })
}
)

app.post("/mark", async ({body}) => {
  const mark_data = MarkStudent.getMark(body.accessToken, body.sync_token)

  if (!mark_data) {
    return status("Not Found")
  }

  return mark_data

}, {
  body: t.Object({
    accessToken: t.String(),
    sync_token: t.Optional(t.String())
  })
})

app.get("/", () => "Hello Elysia")

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
