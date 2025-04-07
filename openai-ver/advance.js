import express from "express";
import { Octokit } from "@octokit/core";
import OpenAI from "openai";
import { Readable } from "node:stream";
import dotenv from "dotenv";
dotenv.config(); // .env の内容を読み込む

const app = express();
app.use(express.json());

const port = Number(process.env.PORT || "3000");

const WEATHER_FUNCTION = {
  name: "getWeather",
  description: "指定した都市の現在の天気情報を取得します。",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "天気を知りたい都市の名前" },
    },
    required: ["city"],
  },
};

// 固定値の天気予報を返す関数
async function getWeather(city) {
  return {
    city,
    description: "晴れ",
    temperature: 22,
  };
}

app.get("/", (req, res) => {
  res.send("ようこそ、ブラックビアード海賊 GitHub Copilot 拡張機能へ！");
});

app.post("/", async (req, res) => {
  const tokenForUser = req.get("X-GitHub-Token");
  const octokit = new Octokit({ auth: tokenForUser });
  const user = await octokit.request("GET /user");
  const apiKey = req.headers["x-github-token"];

  const payload = req.body;
  const messages = payload.messages;

  messages.unshift({
    role: "system",
    content: `あなたはブラックビアード海賊のようにユーザー(@${user.data.login})に応答するアシスタントです。`,
  });

  const openai = new OpenAI({
    apiKey: process.env.API_KEY
  });

  // 最初は stream: false で関数呼び出しを取得
  const initialCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools: [{ type: "function", function: WEATHER_FUNCTION }],
    tool_choice: "auto",
    stream: false,
  });

  const message = initialCompletion.choices[0].message;

  if (message.tool_calls && message.tool_calls.length > 0) {
    const functionCall = message.tool_calls[0].function;

    if (functionCall.name === "getWeather") {
      const args = JSON.parse(functionCall.arguments);
      const weather = await getWeather(args.city);

      messages.push(message);
      messages.push({
        role: "tool",
        tool_call_id: message.tool_calls[0].id,
        content: JSON.stringify(weather),
      });

      // 2回目は stream: true で最終レスポンスを取得
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        stream: true,
      });

      res.setHeader("Content-Type", "text/event-stream");

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
  }

  // function callingがない場合もstreamで返す
  const fallbackStream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
  });

  for await (const chunk of fallbackStream) {
    res.write("data: " + JSON.stringify(chunk) + "\n\n");
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
