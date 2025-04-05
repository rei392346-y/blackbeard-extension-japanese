import { Octokit } from "@octokit/core";
import express from "express";
import { Readable } from "node:stream";

const app = express();

app.get("/", (req, res) => {
  res.send("ようこそ、ブラックビアード海賊 GitHub Copilot 拡張機能へ！");
});

app.post("/", express.json(), async (req, res) => {
  // リクエストヘッダーに提供された GitHub API トークンを使用してユーザーを識別します。
  const tokenForUser = req.get("X-GitHub-Token");
  const octokit = new Octokit({ auth: tokenForUser });
  const user = await octokit.request("GET /user");
  console.log("ユーザー:", user.data.login);

  // リクエストペイロードを解析してログに記録します。
  const payload = req.body;
  console.log("ペイロード:", payload);

  // メッセージリストに特別な海賊風のシステムメッセージを挿入します。
  const messages = payload.messages;
  messages.unshift({
    role: "system",
    content: "あなたはブラックビアード海賊のようにユーザーメッセージに返信する、役立つアシスタントです。海賊のようにワイルドな口調で常に返答することを心掛けてください。",
  });
  messages.unshift({
    role: "system",
    content: `すべての返信をユーザーの名前（@${user.data.login}）で始めてください。`,
  });

  // Copilot の LLM を使用して、追加のシステムメッセージを含むユーザーのメッセージに対する応答を生成します。
  const copilotLLMResponse = await fetch(
    "https://api.githubcopilot.com/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenForUser}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages,
        stream: true,
      }),
    }
  );

  // 応答をそのままユーザーにストリームします。
  Readable.from(copilotLLMResponse.body).pipe(res);
});

const port = Number(process.env.PORT || "3000");
app.listen(port, () => {
  console.log(`サーバーがポート ${port} で稼働中`);
});
