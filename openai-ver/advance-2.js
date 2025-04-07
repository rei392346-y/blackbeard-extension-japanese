import express from "express";
import { Octokit } from "@octokit/core";
import OpenAI from "openai";
import { Readable } from "node:stream";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promises as fs } from "node:fs";
import dotenv from "dotenv";
dotenv.config(); // .env の内容を読み込む

// __dirname を取得するための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

const port = Number(process.env.PORT || "3000");

// 天気情報取得用のツール定義
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

// 自己紹介情報取得用のツール定義
const SELF_INTRODUCTION_FUNCTION = {
  name: "getSelfIntroduction",
  description: "自己紹介の内容を取得します。self-introduction.mdファイルの内容に基づいて回答します。",
  parameters: {
    type: "object",
    properties: {},
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

// self-introduction.md を読み込んで返す関数
async function getSelfIntroduction() {
  const filePath = join(__dirname, "self-introduction.md");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { content };
  } catch (error) {
    return { error: "self-introduction.mdファイルを読み込めませんでした" };
  }
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

  // ユーザー名を含むシステムメッセージを先頭に追加
  messages.unshift({
    role: "system",
    content: `あなたはブラックビアード海賊のようにユーザー(@${user.data.login})に応答するアシスタントです。`,
  });

  const openai = new OpenAI({
    apiKey: process.env.API_KEY
  });

  // 最初は stream: false で関数呼び出しの有無を確認
  const initialCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools: [
      { type: "function", function: WEATHER_FUNCTION },
      { type: "function", function: SELF_INTRODUCTION_FUNCTION },
    ],
    tool_choice: "auto",
    stream: false,
  });

  const message = initialCompletion.choices[0].message;
  console.log("message", message);

  if (message.tool_calls && message.tool_calls.length > 0) {
    const functionCall = message.tool_calls[0].function;

    // 天気情報の関数呼び出しの場合
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

    // 自己紹介情報の関数呼び出しの場合
    if (functionCall.name === "getSelfIntroduction") {
      const intro = await getSelfIntroduction();

      messages.push(message);
      messages.push({
        role: "tool",
        tool_call_id: message.tool_calls[0].id,
        content: JSON.stringify(intro),
      });

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
