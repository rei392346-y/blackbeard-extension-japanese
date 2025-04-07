import express from "express";
import { Octokit } from "@octokit/core";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config(); // .env の内容を読み込む

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ようこそ、ブラックビアード海賊 GitHub Copilot 拡張機能へ！");
});

app.post("/", async (req, res) => {
  // ヘッダーから GitHub API トークンを取得し、ユーザー情報を取得
  const tokenForUser = req.get("X-GitHub-Token");
  const octokit = new Octokit({ auth: tokenForUser });
  const user = await octokit.request("GET /user");
  console.log("ユーザー:", user.data.login);

  // リクエストペイロードの解析
  const payload = req.body;
  console.log("ペイロード:", payload);
  const messages = payload.messages;

  // システムメッセージを挿入
  messages.unshift({
    role: "system",
    content: `すべての返信をユーザーの名前（@${user.data.login}）で始めてください。`,
  });
  messages.unshift({
    role: "system",
    content: "あなたはブラックビアード海賊のようにユーザーメッセージに返信する、役立つアシスタントです。海賊のようにワイルドな口調で常に返答することを心掛けてください。",
  });

  // .env に設定した環境変数から API_KEY と ENDPOINT を取得して OpenAI クライアントを初期化
  const openai = new OpenAI({
    apiKey: process.env.API_KEY,     // .env から API キーを取得
  });

  // chat.completions.create を stream モードで呼び出し、レスポンスを取得
  const stream = await openai.chat.completions.create({
    model: "gpt-4", // 利用するモデルを指定（例: gpt-4）
    messages,
    stream: true,
  });

  // クライアントへ Event Stream としてレスポンスを送信
  res.setHeader("Content-Type", "text/event-stream");

  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
});

const port = Number(process.env.PORT || "3000");
app.listen(port, () => {
  console.log(`サーバーがポート ${port} で稼働中`);
});
