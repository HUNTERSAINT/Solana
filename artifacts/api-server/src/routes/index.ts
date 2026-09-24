import { Router, type IRouter } from "express";
import healthRouter from "./health";
import screenerRouter from "./screener";

const router: IRouter = Router();

router.use(healthRouter);
router.use(screenerRouter);

export default router;
