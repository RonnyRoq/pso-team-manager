import { removeConfirmation, removeDeal } from "./commands/confirmations/actions.js";

export default {
  cancel_transfer: removeConfirmation,
  cancel_deal: removeDeal,
}