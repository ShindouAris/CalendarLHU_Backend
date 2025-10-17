import { Elysia, ElysiaCustomStatusResponse, status, t } from "elysia";
import { calendarLHU } from "./controller/calendarlhu";
import { weatherapi } from "./controller/weather";
import { userApi } from "./controller/user";
import { cors } from "@elysiajs/cors";import { logger } from "@tqman/nice-logger"
import { MarkStudent } from "./controller/mark";
import { LMSAPI } from "./controller/lms";
import { CHATAPI } from "./controller/chat";

const port = process.env.PORT || 3000


const app = new Elysia()
        .use(cors({
          origin: ["https://calendarlhu.chisadin.site", 
            "http://localhost:5173",
            "https://lhu-dashboard.chisadin.site", 
            "https://lhu-dashboard.vercel.app"],
          methods: ["GET", "POST"]
        }))
        .use(logger({
          mode: "live",
          withBanner: true,
          withTimestamp: true
        }))
        .listen(port);

app.post("/schedule", async ({ body }) => {
  return await calendarLHU.getStudentSchedule(body.studentID);
}, {
  body: t.Object({
    studentID: t.Number()
  })
});

app.post("/private-exam", async ({body}) => {
  return await calendarLHU.get_private_schedule(body.ID)
}, {
  body: t.Object({
    ID: t.Number()
  })
})

app.get("/weather/current", async () => {
  const weather = await weatherapi.current();
  if (weather) {
    return weather;
  }
  return { error: "Failed to fetch current weather" };
});

app.get("/weather/forecast", async ({ query }) => {
  let { timestamp } = query;

  if (!timestamp) { // nếu không có timestamp,  tính timestamp hiện tại
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

app.post("/login", async ({body, server, request, cookie: {awt}}) => {
  // const ip = reques
    const credentials = await userApi.login(body.UserID, body.Password, body.DeviceInfo, body.cf_verify_token, server?.requestIP(request)?.address)
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
    DeviceInfo: t.String(),
    cf_verify_token: t.String()
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
  const mark_data = MarkStudent.getMark(body.accessToken)

  if (!mark_data) {
    return status("Not Found")
  }

  return mark_data

}, {
  body: t.Object({
    accessToken: t.String()
  })
})

app.post("/lms/diemdanh", async ({body}) => {
  return  await LMSAPI.getDsDiemdanh(body.accessToken)
}, {
  body: t.Object({
    accessToken: t.String()
  })
})

app.post("/lms/checkin", async ({body, request}) => {
    const ua =  request.headers.get("user-agent");
    return await LMSAPI.checkin(body.qr_data, body.accessToken, ua)
}, {
  body: t.Object({
    accessToken: t.String(),
    qr_data: t.String()
  })
})

app.post("/chat/create", async ({body}) => {
    return await CHATAPI.createChatSession(body.accessToken)
}, {
  body: t.Object({
    accessToken: t.String()
  })  
})
  
app.get("/", () => "Hello Elysia")

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
