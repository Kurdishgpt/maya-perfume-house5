import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import productsRouter from "./products";
import fragranceRouter from "./fragrance";
import storageRouter from "./storage";
import rawMaterialsRouter from "./rawMaterials";
import contactRouter from "./contact";
import supabaseMigrationRouter from "./supabaseMigration";
import ordersRouter from "./orders";
import catalogCsvRouter from "./catalogCsv";
import cartRouter from "./cart";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(productsRouter);
router.use(fragranceRouter);
router.use(storageRouter);
router.use(rawMaterialsRouter);
router.use(contactRouter);
router.use(supabaseMigrationRouter);
router.use(ordersRouter);
router.use(catalogCsvRouter);
router.use(cartRouter);

export default router;
