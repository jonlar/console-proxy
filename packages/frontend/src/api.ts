import { initQueryClient } from "@ts-rest/react-query";
import { contract } from "../../backend/src/contract";

export const client = initQueryClient(contract, {
  baseUrl: "",
  baseHeaders: {},
});
