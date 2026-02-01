import { Elysia, ElysiaCustomStatusResponse, status, t } from "elysia";
import { calendarLHU } from "./controller/calendarlhu";
import { weatherapi } from "./controller/weather";
import { userApi } from "./controller/user";
import { cors } from "@elysiajs/cors";
import { logger } from "@tqman/nice-logger"
import { MarkStudent } from "./controller/mark";
import { LMSAPI } from "./controller/lms";
import { CHATAPI } from "./controller/chat";
import { automationTool } from "./controller/autoKhaoSat";
import { chisaAIV2_Chat, getToolsForFrontend, getAvailableModels } from "./controller/ai";
import { listChats, loadChatHistoryHandler } from "./controller/chatApi";
import { connectDB } from "./databases";
import { UserModel } from "./databases/models/user";
import { stopNonceCleanup } from "./controller/user";
import mongoose from "mongoose";
import { setupMemoryEndpoint } from "./utils/memoryMonitor";

const port = process.env.PORT || 3000

await connectDB();

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


// Schedule AREA ------------------------------------------------------------
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
app.post("/next-class", async ({ body }) => {
    const nextClass = await calendarLHU.get_next_class(body.studentID);
    if (!nextClass) {
        return []
    }
    return nextClass
}, {
  body: t.Object({
    studentID: t.String()
  })
});
// ----------------------------------------------------------------------------

// WEATHER AREA -----------------------------------------------------------------
app.get("/weather/current", async () => {
  const weather = await weatherapi.current();
  if (weather) {
    return weather;
  }
  return status('Internal Server Error', { error: "Failed to fetch current weather" });
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
    return status('Not Found', { error: "No forecast found for the given timestamp"});
  }
  return status('Internal Server Error', { error: "Failed to fetch weather forecast" });
});

app.get('/weather/forecast_all', async () => {
  const forecast = await weatherapi.forecast();
  if (forecast) {
    return forecast;
  }
  return status('Internal Server Error', { error: "Failed to fetch weather forecast" });
})
// ------------------------------------------------------------------


// User AREA ---------------------------------------------------------
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

app.post("/login_create", async ({body}) => {
    return await userApi.create_login_data(body.access_token)
}, {
    body: t.Object({
        access_token: t.String()
    })
})

app.post("/submit_credential", async ({body}) => {
    return await userApi.submit_login_data(body.encrypted_data, body.access_token)
}, {
    body: t.Object({
        encrypted_data: t.String(),
        access_token: t.String()
    })
})
// ----------------------------------------------------------------------

// this api is derp, but I keep it for uptime ------------
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

// LMS AREA ------------------------------------
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
// ------------------------------------------------------

// Automation Tools -------------------------------------

app.post("/qa/process_survey", async ({body}) => {
    return await automationTool.process_survey(body.access_token, body.device_info, body.itemKhaoSat)
}, {
    body: t.Object({
        access_token: t.String(),
        device_info: t.Nullable(t.String()),
        itemKhaoSat: t.Object({
          KhaoSatID: t.String(),
          TenKhaoSat: t.String(),
          MoTa: t.String(),
          templateID: t.String(),
        })
    })
}
)

app.post("/qa/fetch_pending", async ({body}) => {
    return await automationTool.fetch_pending(body.access_token)
}, {
    body: t.Object({
        access_token: t.String()
    })
}
)

// ---------------------------------------------------------

// ChisaAI Area -------------------------------------------

app.get("chisaAI/v2/tools", () => ({ tools: getToolsForFrontend() }));

app.get("chisaAI/v2/models", () => ({ models: getAvailableModels() }));

app.post("chisaAI/v2/chat", async ({ request }) => {
  const req = await request.json();
  return await chisaAIV2_Chat(req);
}, { parse: "none" });

app.post("/chisaAI/v3/user/check", async ({ body }) => {
  try {
    const userInfo = await userApi.userinfo(body.accessToken);
    if (!userInfo || typeof userInfo !== "object" || !("UserID" in userInfo)) {
      return status(401, { error: "Invalid or expired access token" });
    }

    const userId = (userInfo as { UserID: string }).UserID;
    const user = await UserModel.findOne({ UserID: userId }).lean();

    if (!user) {
      return {
        exists: false
      };
    }

    return {
      exists: true
    };
  } catch (error) {
    console.error("Error checking user:", error);
    return status(500, { error: "Internal server error" });
  }
}, {
  body: t.Object({
    accessToken: t.String()
  })
})

app.post("/chisaAI/v3/user/create", async ({ body }) => {
  try {

    const userInfo = await userApi.userinfo(body.accessToken);
    if (!userInfo || typeof userInfo !== "object" || !("UserID" in userInfo)) {
      return status(401, { error: "Invalid or expired access token" });
    }
    const userID = (userInfo as any).UserID;
    const exists = await UserModel.exists({ UserID: userID });
    if (exists) return { message: "User already exists" };
    
    await UserModel.create({
      UserID: (userInfo as { UserID: string }).UserID,
      FullName: (userInfo as { FullName: string }).FullName || "Unknown",
      Class: (userInfo as { Class: string }).Class || "",
      DepartmentName: (userInfo as { DepartmentName: string }).DepartmentName || ""
    })

    return { message: "User created successfully" };

  } catch (error) {
    console.error("Error creating user:", error);
    return status(500);
  }
}, {
  body: t.Object({
    accessToken: t.String()
  })
})

app.post("/chisaAI/v2/list", async ({ body }) => {
  return listChats(body as { accessToken: string; next_token?: string; limit?: number });
}, {
  body: t.Object({
    accessToken: t.String(),
    next_token: t.Nullable(t.String()),
    limit: t.Optional(t.Number()),
  }),
})

app.post("/chisaAI/v2/:chatId/history", async ({ params, body }) => {
  return loadChatHistoryHandler(params.chatId, body as { accessToken: string; next_token?: string; limit?: number });
}, {
  body: t.Object({
    accessToken: t.String(),
    next_token: t.Nullable(t.String()),
    limit: t.Optional(t.Number()),
  }),
})

// FEATURE AREA -----------------------------------------------------------
app.post("/chat/create", async ({body}) => {
    return await CHATAPI.createChatSession(body.accessToken)
}, {
  body: t.Object({
    accessToken: t.String()
  })  
})

// -----------------------------------------------------------------------


app.get("/", () => "Hello Elysia")
setupMemoryEndpoint(app);
app.listen(port);
console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

// Graceful shutdown handlers
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Stop nonce cleanup timer
    stopNonceCleanup();
    
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("✅ MongoDB connection closed");
    
    // Stop Elysia server
    await app.stop();
    console.log("✅ Server stopped");
    
    console.log("👋 Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});
