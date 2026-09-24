import express from "express";
import type { TokenAnalyzer } from "./analyzer.js";
import { getTokenHistory, listRecentTokens, saveAnalysis, upsertPair, upsertToken } from "./db.js";

export function createServer(analyzer: TokenAnalyzer) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "solana-meme-screener", time: new Date().toISOString() });
  });

  app.get("/api/tokens", async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 25);
      res.json({ tokens: await listRecentTokens(limit) });
    } catch (error) {
      console.error("[http] list tokens failed", error);
      res.status(500).json({ error: "Could not load tokens" });
    }
  });

  app.get("/api/tokens/:address/check", async (req, res) => {
    try {
      const result = await analyzer.analyze(req.params.address);
      await upsertToken(req.params.address, result.tokenName, result.tokenSymbol, {});
      if (result.pair) await upsertPair(result.pair);
      await saveAnalysis(result);
      res.json(result);
    } catch (error) {
      console.error("[http] analysis failed", error);
      res.status(502).json({ error: "Upstream analysis failed" });
    }
  });

  app.get("/api/tokens/:address/history", async (req, res) => {
    try {
      const history = await getTokenHistory(req.params.address);
      if (!history) {
        res.status(404).json({ error: "Token not found" });
        return;
      }
      res.json(history);
    } catch (error) {
      console.error("[http] token history failed", error);
      res.status(500).json({ error: "Could not load token history" });
    }
  });

  return app;
}