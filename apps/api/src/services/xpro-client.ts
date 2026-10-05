import { config } from "../config";
import {
  XProClient,
  XProApiError,
  DigitalCoreClient,
  type XProProduct,
  type XProCategory,
  type XProBalanceResponse,
  type XProOrderParams,
  type XProOrderResult,
  type XProDelivery,
  type XProCreateOrderResponse,
} from "@arena/suppliers";

export {
  XProClient,
  XProApiError,
  DigitalCoreClient,
  type XProProduct,
  type XProCategory,
  type XProBalanceResponse,
  type XProOrderParams,
  type XProOrderResult,
  type XProDelivery,
  type XProCreateOrderResponse,
};

export const xproClient = new XProClient({
  baseUrl: config.UPSTREAM_BASE_URL,
  apiKey: config.UPSTREAM_API_KEY,
});

export const digitalcoreClient = new DigitalCoreClient({
  baseUrl: config.DIGITALCORE_BASE_URL,
  apiKey: config.DIGITALCORE_API_KEY,
});
