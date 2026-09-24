import { Router, type IRouter } from "express";
import { analyzer } from "../screener/runtime";
import { pairsForToken, recentPairs, saveAnalysis, recentTokens, tokenHistory, upsertPair, upsertToken } from "../screener/store";

const router: IRouter = Router();

router.get("/tokens", async (req, res) => {
  try {
    res.json({ tokens: await recentTokens(Number(req.query.limit ?? 25)) });
  } catch (error) {
    req.log.error({ err: error }, "Failed to list screener tokens");
    res.status(500).json({ error: "Could not load tokens" });
  }
});

router.get("/pairs", async (req, res) => {
  try {
    res.json({ pairs: await recentPairs(Number(req.query.limit ?? 10)) });
  } catch (error) {
    req.log.error({ err: error }, "Failed to list screener pairs");
    res.status(500).json({ error: "Could not load pairs" });
  }
});

router.get("/pairs/:address", async (req, res) => {
  try {
    const pairs = await pairsForToken(req.params.address);
    res.json({ tokenAddress: req.params.address, pairs });
  } catch (error) {
    req.log.error({ err: error, address: req.params.address }, "Failed to list token pairs");
    res.status(500).json({ error: "Could not load token pairs" });
  }
});

router.get("/tokens/:address/check", async (req, res) => {
  try {
    const result = await analyzer.analyze(req.params.address);
    await upsertToken(req.params.address, result.tokenName, result.tokenSymbol);
    if (result.pair) await upsertPair(result.pair);
    await saveAnalysis(result);
    res.json(result);
  } catch (error) {
    req.log.error({ err: error, address: req.params.address }, "Failed to analyze token");
    res.status(502).json({ error: "Upstream analysis failed" });
  }
});

router.get("/tokens/:address/history", async (req, res) => {
  try {
    const result = await tokenHistory(req.params.address);
    if (!result) {
      res.status(404).json({ error: "Token not found" });
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error, address: req.params.address }, "Failed to load token history");
    res.status(500).json({ error: "Could not load token history" });
  }
});

export default router;